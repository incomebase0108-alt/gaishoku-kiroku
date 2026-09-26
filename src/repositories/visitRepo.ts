import { db } from '../db/db'
import type { Dish, DraftDish, DraftPhoto, Photo, Restaurant, Visit, VisitDetail, VisitDraft } from '../domain/types'
import { newId, norm } from '../lib/util'

// 新しい順。同じ時刻なら後から登録した方を新しいとみなす
export function byRecent(a: Visit, b: Visit): number {
  return b.visited_at - a.visited_at || b.created_at - a.created_at
}

function byOrder(a: Dish, b: Dish): number {
  return a.sort_order - b.sort_order
}

// 訪問の一覧に料理・写真・店を付けて返す（まとめて読む）
export async function buildDetails(visits: Visit[]): Promise<VisitDetail[]> {
  if (visits.length === 0) return []
  const ids = visits.map((v) => v.id)
  const [dishes, photos, restaurants] = await Promise.all([
    db.dishes.where('visit_id').anyOf(ids).toArray(),
    db.photos.where('visit_id').anyOf(ids).toArray(),
    db.restaurants.bulkGet([...new Set(visits.map((v) => v.restaurant_id))]),
  ])
  const rmap = new Map(restaurants.filter((r) => r != null).map((r) => [r.id, r]))
  return visits
    .filter((v) => rmap.has(v.restaurant_id))
    .map((v) => ({
      visit: v,
      restaurant: rmap.get(v.restaurant_id)!,
      dishes: dishes.filter((d) => d.visit_id === v.id).sort(byOrder),
      photos: sortPhotos(photos.filter((p) => p.visit_id === v.id), dishes),
    }))
}

// 料理の並び順 → 訪問全体の写真 の順に並べる
function sortPhotos(photos: Photo[], dishes: Dish[]): Photo[] {
  const order = new Map(dishes.map((d) => [d.id, d.sort_order]))
  const key = (p: Photo) => (p.dish_id != null ? (order.get(p.dish_id) ?? 9999) : 10000)
  return [...photos].sort((a, b) => key(a) - key(b) || a.created_at - b.created_at)
}

export async function getVisitDetail(id: string): Promise<VisitDetail | null> {
  const v = await db.visits.get(id)
  if (!v) return null
  const [d] = await buildDetails([v])
  return d ?? null
}

export async function listVisitsOfRestaurant(restaurantId: string): Promise<VisitDetail[]> {
  const visits = await db.visits.where('restaurant_id').equals(restaurantId).toArray()
  return buildDetails(visits.sort(byRecent))
}

// 「前回」＝その店の最も新しい訪問。編集中の訪問そのものは除く
export async function getLastVisitDetail(
  restaurantId: string,
  excludeVisitId: string | null = null,
): Promise<VisitDetail | null> {
  const visits = await db.visits.where('restaurant_id').equals(restaurantId).toArray()
  const last = visits.filter((v) => v.id !== excludeVisitId).sort(byRecent)[0]
  if (!last) return null
  const [d] = await buildDetails([last])
  return d ?? null
}

export async function listAllVisits(): Promise<VisitDetail[]> {
  const visits = await db.visits.toArray()
  return buildDetails(visits.sort(byRecent))
}

// その店で過去に食べた料理名（新しい順・重複なし）。入力候補に使う
export async function pastDishNames(restaurantId: string): Promise<string[]> {
  const details = await listVisitsOfRestaurant(restaurantId)
  const seen = new Set<string>()
  const out: string[] = []
  for (const d of details) {
    for (const dish of d.dishes) {
      const k = norm(dish.name)
      if (k && !seen.has(k)) {
        seen.add(k)
        out.push(dish.name)
      }
    }
  }
  return out
}

// ---- 保存 ----

export function isDishEmpty(d: DraftDish): boolean {
  return (
    d.name.trim() === '' &&
    d.photos.length === 0 &&
    d.price == null &&
    d.taste_rating == null &&
    d.amount_rating == null &&
    d.price_rating == null &&
    d.want_again == null &&
    d.memo.trim() === ''
  )
}

export class DraftError extends Error {}

// 下書きを1回の書き込みで保存する（店・訪問・料理・写真）。編集のときは差分を消してから書く
export async function saveDraft(draft: VisitDraft): Promise<{ visitId: string; restaurantId: string }> {
  const name = draft.restaurant.name.trim()
  if (!name) throw new DraftError('店名を入れてください')
  const now = Date.now()

  return db.transaction('rw', [db.restaurants, db.visits, db.dishes, db.photos, db.photoFiles], async () => {
    // 店：ID があればそれ、無ければ同じ名前・同じ市の店を探し、無ければ作る（重複登録を防ぐ）。
    // 市が違えば別の店（チェーン店の支店を分けるため）
    const genre = draft.restaurant.genre.trim()
    const city = (draft.restaurant.city ?? '').trim()
    const lat = draft.restaurant.latitude ?? null
    const lng = draft.restaurant.longitude ?? null
    let restaurant = draft.restaurant.id ? await db.restaurants.get(draft.restaurant.id) : undefined
    if (!restaurant) {
      const key = norm(name)
      const ckey = norm(city)
      restaurant = (await db.restaurants.toArray()).find((r) => norm(r.name) === key && norm(r.city ?? '') === ckey)
    }
    if (!restaurant) {
      restaurant = {
        id: newId(),
        name,
        genre,
        city,
        address: '',
        latitude: lat,
        longitude: lng,
        memo: '',
        created_at: now,
        updated_at: now,
      }
      await db.restaurants.add(restaurant)
    } else {
      // 記録の画面で入れ直したジャンル・市は店にも反映する（空にしたときは消さない）
      const patch: Partial<Restaurant> = {}
      if (genre && genre !== restaurant.genre) patch.genre = genre
      if (city && city !== restaurant.city) patch.city = city
      if (lat != null && lng != null && (lat !== restaurant.latitude || lng !== restaurant.longitude)) {
        patch.latitude = lat
        patch.longitude = lng
      }
      if (Object.keys(patch).length) await db.restaurants.update(restaurant.id, { ...patch, updated_at: now })
    }

    const prev = draft.editingVisitId ? await db.visits.get(draft.editingVisitId) : undefined
    const visitId = prev?.id ?? newId()
    const visit: Visit = {
      id: visitId,
      restaurant_id: restaurant.id,
      visited_at: draft.visited_at,
      people_count: Math.max(1, draft.people_count),
      total_price: draft.total_price,
      overall_rating: draft.overall_rating,
      memo: draft.memo.trim(),
      created_at: prev?.created_at ?? now,
      updated_at: now,
    }

    const keptDishes = draft.dishes.filter((d) => !isDishEmpty(d))
    const prevDishes = prev ? await db.dishes.where('visit_id').equals(visitId).toArray() : []
    const prevPhotos = prev ? await db.photos.where('visit_id').equals(visitId).toArray() : []

    const dishRows: Dish[] = keptDishes.map((d, i) => ({
      id: d.id,
      visit_id: visitId,
      name: d.name.trim(),
      price: d.price,
      taste_rating: d.taste_rating,
      amount_rating: d.amount_rating,
      price_rating: d.price_rating,
      want_again: d.want_again,
      memo: d.memo.trim(),
      sort_order: i,
      created_at: prevDishes.find((p) => p.id === d.id)?.created_at ?? now,
      updated_at: now,
    }))

    const photoPairs: { photo: DraftPhoto; dishId: string | null }[] = [
      ...keptDishes.flatMap((d) => d.photos.map((p) => ({ photo: p, dishId: d.id as string | null }))),
      ...draft.visitPhotos.map((p) => ({ photo: p, dishId: null })),
    ]
    const photoRows: Photo[] = photoPairs.map(({ photo, dishId }) => ({
      id: photo.id,
      visit_id: visitId,
      dish_id: dishId,
      type: dishId ? 'dish' : photo.type === 'dish' ? 'other' : photo.type,
      image_path: photo.id,
      taken_at: photo.taken_at,
      created_at: prevPhotos.find((p) => p.id === photo.id)?.created_at ?? now,
    }))

    // 下書きから消えた料理・写真を消す
    const dishIds = new Set(dishRows.map((d) => d.id))
    const photoIds = new Set(photoRows.map((p) => p.id))
    const goneDishes = prevDishes.filter((d) => !dishIds.has(d.id)).map((d) => d.id)
    const gonePhotos = prevPhotos.filter((p) => !photoIds.has(p.id))
    await db.dishes.bulkDelete(goneDishes)
    await db.photos.bulkDelete(gonePhotos.map((p) => p.id))
    await db.photoFiles.bulkDelete(gonePhotos.map((p) => p.image_path))

    await db.visits.put(visit)
    await db.dishes.bulkPut(dishRows)
    await db.photos.bulkPut(photoRows)
    await db.photoFiles.bulkPut(
      photoPairs.map(({ photo }) => ({ id: photo.id, mime: photo.mime, full: photo.full, thumb: photo.thumb })),
    )
    return { visitId, restaurantId: restaurant.id }
  })
}

export async function deleteVisit(id: string): Promise<void> {
  await db.transaction('rw', [db.visits, db.dishes, db.photos, db.photoFiles], async () => {
    const photos = await db.photos.where('visit_id').equals(id).toArray()
    await db.photoFiles.bulkDelete(photos.map((p) => p.image_path))
    await db.photos.bulkDelete(photos.map((p) => p.id))
    await db.dishes.where('visit_id').equals(id).delete()
    await db.visits.delete(id)
  })
}

// 保存済みの訪問を編集用の下書きに戻す
export async function visitToDraft(id: string): Promise<VisitDraft | null> {
  const detail = await getVisitDetail(id)
  if (!detail) return null
  const files = await db.photoFiles.bulkGet(detail.photos.map((p) => p.image_path))
  const toDraftPhoto = (p: Photo): DraftPhoto | null => {
    const f = files.find((x) => x?.id === p.image_path)
    return f ? { id: p.id, type: p.type, mime: f.mime, full: f.full, thumb: f.thumb, taken_at: p.taken_at } : null
  }
  const { visit, restaurant, dishes, photos } = detail
  return {
    editingVisitId: visit.id,
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      genre: restaurant.genre,
      city: restaurant.city ?? '',
      latitude: restaurant.latitude,
      longitude: restaurant.longitude,
    },
    visited_at: visit.visited_at,
    people_count: visit.people_count,
    total_price: visit.total_price,
    overall_rating: visit.overall_rating,
    memo: visit.memo,
    dishes: dishes.map((d) => ({
      id: d.id,
      name: d.name,
      price: d.price,
      taste_rating: d.taste_rating,
      amount_rating: d.amount_rating,
      price_rating: d.price_rating,
      want_again: d.want_again,
      memo: d.memo,
      photos: photos
        .filter((p) => p.dish_id === d.id)
        .map(toDraftPhoto)
        .filter((p) => p != null),
    })),
    visitPhotos: photos
      .filter((p) => p.dish_id == null)
      .map(toDraftPhoto)
      .filter((p) => p != null),
    updated_at: Date.now(),
  }
}
