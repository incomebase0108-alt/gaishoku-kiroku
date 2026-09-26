import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import { db } from '../db/db'
import { AMOUNTS, PRICE_FEELS, WANT_AGAINS, isOneOf, labelOf, type Amount, type PriceFeel, type WantAgain } from '../domain/enums'
import type { Restaurant } from '../domain/types'
import { newId, norm } from '../lib/util'
import { listDishSummaries } from '../repositories/restaurantRepo'
import { byRecent } from '../repositories/visitRepo'
import { hasLocation, mapLink } from './location'

// 店を友だちに送る。中身は URL の中に入れる（サーバーが無いので）。
// 自分のメモは個人的なことを書いていることがあるので入れない。

export interface SharedDish {
  name: string
  count: number
  taste: number | null
  amount: Amount | null
  price: PriceFeel | null
  want: WantAgain | null
}

export interface SharedStore {
  v: 1
  name: string
  genre: string
  city: string
  latitude: number | null
  longitude: number | null
  visits: number
  lastAt: number | null
  overall: number | null
  dishes: SharedDish[]
}

export async function buildSharedStore(restaurantId: string): Promise<SharedStore | null> {
  const r = await db.restaurants.get(restaurantId)
  if (!r) return null
  const visits = (await db.visits.where('restaurant_id').equals(restaurantId).toArray()).sort(byRecent)
  const dishes = await listDishSummaries(restaurantId)
  return {
    v: 1,
    name: r.name,
    genre: r.genre,
    city: r.city ?? '',
    latitude: r.latitude,
    longitude: r.longitude,
    visits: visits.length,
    lastAt: visits[0]?.visited_at ?? null,
    overall: visits[0]?.overall_rating ?? null,
    dishes: dishes
      .filter((d) => d.name)
      .slice(0, 20)
      .map((d) => ({
        name: d.name,
        count: d.count,
        taste: d.last.taste_rating,
        amount: d.last.amount_rating,
        price: d.last.price_rating,
        want: d.last.want_again,
      })),
  }
}

// ---- URL に入れる形（縮めて base64url） ----

function toB64Url(u8: Uint8Array): string {
  let s = ''
  for (const b of u8) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

export function encodeShared(s: SharedStore): string {
  return toB64Url(deflateSync(strToU8(JSON.stringify(s)), { level: 9 }))
}

// 受け取った文字列を読む。壊れていたり形が違えば null（受け取った側の画面で「開けません」と出す）
export function decodeShared(code: string): SharedStore | null {
  try {
    const o = JSON.parse(strFromU8(inflateSync(fromB64Url(code))))
    if (o?.v !== 1 || typeof o.name !== 'string' || !o.name.trim()) return null
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
    const str = (x: unknown) => (typeof x === 'string' ? x.slice(0, 200) : '')
    return {
      v: 1,
      name: str(o.name),
      genre: str(o.genre),
      city: str(o.city),
      latitude: num(o.latitude),
      longitude: num(o.longitude),
      visits: num(o.visits) ?? 0,
      lastAt: num(o.lastAt),
      overall: num(o.overall),
      dishes: (Array.isArray(o.dishes) ? o.dishes : []).slice(0, 50).map((d: Record<string, unknown>) => ({
        name: str(d.name),
        count: num(d.count) ?? 1,
        taste: num(d.taste),
        amount: isOneOf(AMOUNTS, d.amount) ? d.amount : null,
        price: isOneOf(PRICE_FEELS, d.price) ? d.price : null,
        want: isOneOf(WANT_AGAINS, d.want) ? d.want : null,
      })),
    }
  } catch {
    return null
  }
}

export function shareUrl(s: SharedStore, appUrl: string): string {
  return `${appUrl.split('#')[0]}#/shared?d=${encodeShared(s)}`
}

function stars(n: number | null): string {
  return n ? '★'.repeat(n) + '☆'.repeat(5 - n) : ''
}

// LINE などに貼られる文面
export function shareText(s: SharedStore): string {
  const head = [s.city, s.genre].filter((x) => x).join('・')
  const lines = [`【食歴】${s.name}${head ? `（${head}）` : ''}`]
  const sum = [s.visits ? `行った回数 ${s.visits}回` : '', s.overall ? `総合${stars(s.overall)}` : ''].filter((x) => x)
  if (sum.length) lines.push(sum.join('／'))
  for (const d of s.dishes.slice(0, 8)) {
    const parts = [
      d.taste ? stars(d.taste) : '',
      d.want ? labelOf(WANT_AGAINS, d.want) : '',
      d.amount ? `量${labelOf(AMOUNTS, d.amount)}` : '',
      d.price ? labelOf(PRICE_FEELS, d.price) : '',
    ].filter((x) => x)
    lines.push(`・${d.name}${parts.length ? ' ' + parts.join(' ') : ''}`)
  }
  if (hasLocation(s)) lines.push(`地図：${mapLink(s, s.name)}`)
  return lines.join('\n')
}

// 受け取った店を自分の食歴に足す。同じ名前・同じ市の店があればそれを使い、空いている欄だけ埋める
export async function addSharedStore(s: SharedStore): Promise<string> {
  const now = Date.now()
  const recommend = s.dishes
    .filter((d) => d.want === 'must' || d.want === 'yes' || (d.taste ?? 0) >= 4)
    .slice(0, 6)
    .map((d) => `${d.name}${d.taste ? `★${d.taste}` : ''}${d.want ? `（${labelOf(WANT_AGAINS, d.want)}）` : ''}`)
  const memo = recommend.length ? `教えてもらったおすすめ：${recommend.join('、')}` : ''
  return db.transaction('rw', db.restaurants, async () => {
    const key = norm(s.name)
    const ckey = norm(s.city)
    const found = (await db.restaurants.toArray()).find((r) => norm(r.name) === key && norm(r.city ?? '') === ckey)
    if (found) {
      const patch: Partial<Restaurant> = {}
      if (!found.genre && s.genre) patch.genre = s.genre
      if (!hasLocation(found) && hasLocation(s)) {
        patch.latitude = s.latitude
        patch.longitude = s.longitude
      }
      if (memo && !found.memo.includes(memo)) patch.memo = found.memo ? `${found.memo}\n${memo}` : memo
      if (Object.keys(patch).length) await db.restaurants.update(found.id, { ...patch, updated_at: now })
      return found.id
    }
    const r: Restaurant = {
      id: newId(),
      name: s.name.trim(),
      genre: s.genre,
      city: s.city,
      address: '',
      latitude: s.latitude,
      longitude: s.longitude,
      memo,
      created_at: now,
      updated_at: now,
    }
    await db.restaurants.add(r)
    return r.id
  })
}
