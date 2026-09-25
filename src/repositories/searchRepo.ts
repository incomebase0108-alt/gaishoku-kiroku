import { db } from '../db/db'
import type { Amount, PriceFeel, WantAgain } from '../domain/enums'
import type { Dish, Restaurant, Visit } from '../domain/types'
import { norm } from '../lib/util'
import { byRecent } from './visitRepo'

export interface SearchFilters {
  q: string // 店名・料理名のどちらにも当てる
  genre: string // '' なら問わない
  city: string // '' なら問わない
  minRating: number // 0 なら問わない。料理は味、店は前回の総合評価に当てる
  amounts: Amount[] // 空なら問わない
  prices: PriceFeel[]
  wants: WantAgain[]
}

export const EMPTY_FILTERS: SearchFilters = { q: '', genre: '', city: '', minRating: 0, amounts: [], prices: [], wants: [] }

export function hasDishFilters(f: SearchFilters): boolean {
  return f.amounts.length > 0 || f.prices.length > 0 || f.wants.length > 0
}

export interface DishHit {
  dish: Dish
  visit: Visit
  restaurant: Restaurant
  photoId: string | null
}

export interface RestaurantHit {
  restaurant: Restaurant
  lastVisit: Visit | null
  visitCount: number
  matchedDishes: string[] // 条件に合った料理名（料理の条件や料理名で当たったとき）
  photoId: string | null
}

// キーワードは店名と市のどちらにも当てる（「名古屋」で名古屋市の店が出る）
function storeText(r: Restaurant): string {
  return norm(`${r.name} ${r.city ?? ''}`)
}

async function loadAll() {
  const [restaurants, visits, dishes, photos] = await Promise.all([
    db.restaurants.toArray(),
    db.visits.toArray(),
    db.dishes.toArray(),
    db.photos.toArray(),
  ])
  return { restaurants, visits, dishes, photos }
}

function dishMatchesChoices(d: Dish, f: SearchFilters): boolean {
  if (f.amounts.length && (d.amount_rating == null || !f.amounts.includes(d.amount_rating))) return false
  if (f.prices.length && (d.price_rating == null || !f.prices.includes(d.price_rating))) return false
  if (f.wants.length && (d.want_again == null || !f.wants.includes(d.want_again))) return false
  return true
}

// 料理で探す：条件に合う料理を新しい順に
export async function searchDishes(f: SearchFilters): Promise<DishHit[]> {
  const { restaurants, visits, dishes, photos } = await loadAll()
  const rmap = new Map(restaurants.map((r) => [r.id, r]))
  const vmap = new Map(visits.map((v) => [v.id, v]))
  const q = norm(f.q)
  const hits: DishHit[] = []
  for (const d of dishes) {
    const v = vmap.get(d.visit_id)
    const r = v && rmap.get(v.restaurant_id)
    if (!v || !r) continue
    if (q && !norm(d.name).includes(q) && !storeText(r).includes(q)) continue
    if (f.genre && r.genre !== f.genre) continue
    if (f.city && r.city !== f.city) continue
    if (f.minRating && (d.taste_rating ?? 0) < f.minRating) continue
    if (!dishMatchesChoices(d, f)) continue
    const photo = photos.find((p) => p.dish_id === d.id)
    hits.push({ dish: d, visit: v, restaurant: r, photoId: photo?.image_path ?? null })
  }
  return hits.sort((a, b) => byRecent(a.visit, b.visit) || a.dish.sort_order - b.dish.sort_order)
}

// 店で探す：店名・ジャンル・前回の総合評価に加え、料理の条件は「その店に当てはまる料理が1品でもある」で当てる
export async function searchRestaurants(f: SearchFilters): Promise<RestaurantHit[]> {
  const { restaurants, visits, dishes, photos } = await loadAll()
  const q = norm(f.q)
  const dishFilter = hasDishFilters(f)
  const hits: RestaurantHit[] = []
  for (const r of restaurants) {
    if (f.genre && r.genre !== f.genre) continue
    if (f.city && r.city !== f.city) continue
    const vs = visits.filter((v) => v.restaurant_id === r.id).sort(byRecent)
    const last = vs[0] ?? null
    if (f.minRating && (last?.overall_rating ?? 0) < f.minRating) continue
    const vIds = new Set(vs.map((v) => v.id))
    const ds = dishes.filter((d) => vIds.has(d.visit_id))
    const nameHit = !q || storeText(r).includes(q)
    const matched = ds.filter((d) => (nameHit || norm(d.name).includes(q)) && dishMatchesChoices(d, f))
    if (!nameHit && matched.length === 0) continue
    if (dishFilter && matched.length === 0) continue
    const showDishes = q && !nameHit ? matched : dishFilter ? matched : []
    const lastPhotos = photos.filter((p) => last && p.visit_id === last.id)
    const photo = lastPhotos.find((p) => p.dish_id != null) ?? lastPhotos[0]
    hits.push({
      restaurant: r,
      lastVisit: last,
      visitCount: vs.length,
      matchedDishes: [...new Set(showDishes.map((d) => d.name).filter((n) => n))],
      photoId: photo?.image_path ?? null,
    })
  }
  return hits.sort(
    (a, b) =>
      (b.lastVisit?.visited_at ?? -1) - (a.lastVisit?.visited_at ?? -1) ||
      b.restaurant.created_at - a.restaurant.created_at,
  )
}

// 登録済みのジャンル（絞り込みの選択肢に使う）
export async function usedGenres(): Promise<string[]> {
  const rs = await db.restaurants.toArray()
  return [...new Set(rs.map((r) => r.genre).filter((g) => g))].sort()
}
