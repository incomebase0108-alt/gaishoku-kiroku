import { db } from '../db/db'
import type { Rating } from '../domain/enums'
import type { Dish, Photo, Restaurant, Visit } from '../domain/types'
import { norm } from '../lib/util'
import { byRecent } from './visitRepo'

export interface RestaurantSummary {
  restaurant: Restaurant
  visitCount: number
  lastVisit: Visit | null
  lastDishNames: string[]
  coverPhotoId: string | null
}

// 写真を1枚選ぶ：料理の写真を優先し、無ければ訪問全体の写真
function pickCover(photos: Photo[]): string | null {
  return (photos.find((p) => p.dish_id != null) ?? photos[0])?.image_path ?? null
}

// すべての店を「最後に行った順」で返す（行ったことの無い店は登録順で後ろ）
export async function listRestaurantSummaries(): Promise<RestaurantSummary[]> {
  const [restaurants, visits] = await Promise.all([db.restaurants.toArray(), db.visits.toArray()])
  const byRest = new Map<string, Visit[]>()
  for (const v of visits) {
    const list = byRest.get(v.restaurant_id) ?? []
    list.push(v)
    byRest.set(v.restaurant_id, list)
  }
  for (const vs of byRest.values()) vs.sort(byRecent)
  const lastIds = [...byRest.values()].map((vs) => vs[0].id)
  const [dishes, photos] = await Promise.all([db.dishes.where('visit_id').anyOf(lastIds).toArray(), db.photos.toArray()])
  const photosByVisit = new Map<string, Photo[]>()
  for (const p of photos) photosByVisit.set(p.visit_id, [...(photosByVisit.get(p.visit_id) ?? []), p])
  const out = restaurants.map((r): RestaurantSummary => {
    const vs = byRest.get(r.id) ?? []
    const last = vs[0] ?? null
    return {
      restaurant: r,
      visitCount: vs.length,
      lastVisit: last,
      lastDishNames: last
        ? dishes
            .filter((d) => d.visit_id === last.id)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((d) => d.name)
            .filter((n) => n)
        : [],
      // 前回に写真が無ければ、写真のあるいちばん新しい訪問から
      coverPhotoId: pickCover(vs.map((v) => photosByVisit.get(v.id) ?? []).find((ps) => ps.length > 0) ?? []),
    }
  })
  return out.sort(
    (a, b) =>
      (b.lastVisit?.visited_at ?? -1) - (a.lastVisit?.visited_at ?? -1) ||
      b.restaurant.created_at - a.restaurant.created_at,
  )
}

export async function getRestaurant(id: string): Promise<Restaurant | undefined> {
  return db.restaurants.get(id)
}

export async function updateRestaurant(
  id: string,
  patch: Partial<Pick<Restaurant, 'name' | 'genre' | 'city' | 'address' | 'memo' | 'latitude' | 'longitude'>>,
): Promise<void> {
  await db.restaurants.update(id, { ...patch, updated_at: Date.now() })
}

// 店と、その店の訪問・料理・写真をすべて消す
export async function deleteRestaurant(id: string): Promise<void> {
  await db.transaction('rw', [db.restaurants, db.visits, db.dishes, db.photos, db.photoFiles], async () => {
    const visitIds = await db.visits.where('restaurant_id').equals(id).primaryKeys()
    const photos = await db.photos.where('visit_id').anyOf(visitIds).toArray()
    await db.photoFiles.bulkDelete(photos.map((p) => p.image_path))
    await db.photos.bulkDelete(photos.map((p) => p.id))
    await db.dishes.where('visit_id').anyOf(visitIds).delete()
    await db.visits.bulkDelete(visitIds)
    await db.restaurants.delete(id)
  })
}

// 店名で候補を出す（前方一致を先に、部分一致を後に）
export async function suggestRestaurants(q: string): Promise<Restaurant[]> {
  const k = norm(q)
  const all = await db.restaurants.toArray()
  if (!k) return []
  const starts = all.filter((r) => norm(r.name).startsWith(k))
  const contains = all.filter((r) => !norm(r.name).startsWith(k) && norm(r.name).includes(k))
  return [...starts, ...contains]
}

// ---- 店で食べた料理を品名ごとにまとめる ----

export interface DishSummary {
  name: string
  count: number
  last: Dish // いちばん新しく食べたときの記録
  lastVisitedAt: number
  lastVisitId: string
  photoId: string | null // 写真のある最新の記録から
  avgTaste: number | null
  history: { dish: Dish; visitedAt: number }[] // 新しい順
}

export async function listDishSummaries(restaurantId: string): Promise<DishSummary[]> {
  const visits = (await db.visits.where('restaurant_id').equals(restaurantId).toArray()).sort(byRecent)
  const ids = visits.map((v) => v.id)
  const [dishes, photos] = await Promise.all([
    db.dishes.where('visit_id').anyOf(ids).toArray(),
    db.photos.where('visit_id').anyOf(ids).toArray(),
  ])
  const vmap = new Map(visits.map((v, i) => [v.id, { v, rank: i }]))
  const groups = new Map<string, Dish[]>()
  for (const d of dishes) {
    const k = norm(d.name) || '（品名なし）'
    groups.set(k, [...(groups.get(k) ?? []), d])
  }
  const out: DishSummary[] = []
  for (const list of groups.values()) {
    list.sort((a, b) => vmap.get(a.visit_id)!.rank - vmap.get(b.visit_id)!.rank || a.sort_order - b.sort_order)
    const last = list[0]
    const tastes = list.map((d) => d.taste_rating).filter((t): t is Rating => t != null)
    const withPhoto = list.map((d) => photos.find((p) => p.dish_id === d.id)).find((p) => p != null)
    out.push({
      name: last.name,
      count: list.length,
      last,
      lastVisitedAt: vmap.get(last.visit_id)!.v.visited_at,
      lastVisitId: last.visit_id,
      photoId: withPhoto?.image_path ?? null,
      avgTaste: tastes.length ? tastes.reduce((a, b) => a + b, 0) / tastes.length : null,
      history: list.map((d) => ({ dish: d, visitedAt: vmap.get(d.visit_id)!.v.visited_at })),
    })
  }
  return out.sort((a, b) => b.lastVisitedAt - a.lastVisitedAt || b.count - a.count)
}

// これまでに入れた市（最近行った店の市から順に）。入力の候補と検索の絞り込みに使う
export async function usedCities(): Promise<string[]> {
  const list = await listRestaurantSummaries()
  return [...new Set(list.map((s) => (s.restaurant.city ?? '').trim()).filter((c) => c))]
}
