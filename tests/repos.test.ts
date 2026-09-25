import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db/db'
import type { DraftPhoto, VisitDraft } from '../src/domain/types'
import { newId } from '../src/lib/util'
import { emptyDish, newDraft } from '../src/repositories/draftRepo'
import { listDishSummaries, listRestaurantSummaries, deleteRestaurant } from '../src/repositories/restaurantRepo'
import { EMPTY_FILTERS, searchDishes, searchRestaurants } from '../src/repositories/searchRepo'
import {
  deleteVisit,
  getLastVisitDetail,
  getVisitDetail,
  listAllVisits,
  saveDraft,
  visitToDraft,
} from '../src/repositories/visitRepo'
import { buildBackupZip, parseBackup, importBackup, BackupError } from '../src/services/backup'

const DAY = 86400000
const T0 = new Date(2026, 8, 1, 12, 0).getTime()

function photo(type: DraftPhoto['type'] = 'dish', seed = 1): DraftPhoto {
  return {
    id: newId(),
    type,
    mime: 'image/jpeg',
    full: new Uint8Array([seed, 2, 3, 4]).buffer,
    thumb: new Uint8Array([seed, 9]).buffer,
    taken_at: T0,
  }
}

// 店名と料理を指定して1回分の訪問を作る
function draft(
  name: string,
  at: number,
  dishes: Partial<VisitDraft['dishes'][number]>[],
  extra: Partial<VisitDraft> = {},
): VisitDraft {
  const d = newDraft({ id: null, name, genre: 'ラーメン' }, at)
  d.dishes = dishes.map((x) => ({ ...emptyDish(), ...x }))
  return { ...d, ...extra }
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('保存', () => {
  it('新しい店・訪問・複数の料理・写真を1回で保存する', async () => {
    const { visitId, restaurantId } = await saveDraft(
      draft('麺屋 一', T0, [{ name: '醤油ラーメン', price: 900, photos: [photo()] }, { name: '餃子', price: 400 }], {
        visitPhotos: [photo('receipt')],
        total_price: 1300,
        overall_rating: 4,
      }),
    )
    const d = (await getVisitDetail(visitId))!
    expect(d.restaurant.id).toBe(restaurantId)
    expect(d.restaurant.name).toBe('麺屋 一')
    expect(d.dishes.map((x) => x.name)).toEqual(['醤油ラーメン', '餃子'])
    expect(d.photos).toHaveLength(2)
    expect(d.photos[0].dish_id).toBe(d.dishes[0].id) // 料理の写真が先
    expect(d.photos[1]).toMatchObject({ dish_id: null, type: 'receipt' })
    expect(await db.photoFiles.count()).toBe(2)
  })

  it('表記ゆれの同じ店名は同じ店として扱う', async () => {
    const a = await saveDraft(draft('ﾗｰﾒﾝ　太郎', T0, [{ name: 'a' }]))
    const b = await saveDraft(draft('ラーメン太郎', T0 + DAY, [{ name: 'b' }]))
    expect(b.restaurantId).toBe(a.restaurantId)
    expect(await db.restaurants.count()).toBe(1)
  })

  it('何も入っていない料理カードは保存しない', async () => {
    const { visitId } = await saveDraft(draft('店', T0, [{ name: '唐揚げ' }, {}]))
    expect((await getVisitDetail(visitId))!.dishes).toHaveLength(1)
  })

  it('店名が空なら保存しない', async () => {
    await expect(saveDraft(draft('  ', T0, [{ name: 'x' }]))).rejects.toThrow('店名')
  })
})

describe('前回履歴', () => {
  it('登録した順ではなく訪問日時で「前回」を選ぶ', async () => {
    const newer = await saveDraft(draft('店', T0 + 2 * DAY, [{ name: '新しい方' }]))
    await saveDraft(draft('店', T0, [{ name: '古い方（後から登録）' }]))
    const last = (await getLastVisitDetail(newer.restaurantId))!
    expect(last.dishes[0].name).toBe('新しい方')
  })

  it('同じ日時なら後から登録した方を前回とする', async () => {
    const a = await saveDraft(draft('店', T0, [{ name: '1回目' }]))
    await new Promise((r) => setTimeout(r, 5))
    await saveDraft(draft('店', T0, [{ name: '2回目' }]))
    expect((await getLastVisitDetail(a.restaurantId))!.dishes[0].name).toBe('2回目')
  })

  it('編集中の訪問は「前回」から外す', async () => {
    const a = await saveDraft(draft('店', T0, [{ name: '前回' }]))
    const b = await saveDraft(draft('店', T0 + DAY, [{ name: '今回' }]))
    expect((await getLastVisitDetail(a.restaurantId, b.visitId))!.dishes[0].name).toBe('前回')
  })

  it('別の店の訪問は混ざらない', async () => {
    const a = await saveDraft(draft('A店', T0, [{ name: 'Aの料理' }]))
    await saveDraft(draft('B店', T0 + DAY, [{ name: 'Bの料理' }]))
    expect((await getLastVisitDetail(a.restaurantId))!.dishes[0].name).toBe('Aの料理')
  })
})

describe('編集・削除', () => {
  it('編集で消した料理と写真は、画像の中身まで消える', async () => {
    const { visitId } = await saveDraft(
      draft('店', T0, [
        { name: '残す', photos: [photo()] },
        { name: '消す', photos: [photo()] },
      ]),
    )
    const created = (await db.visits.get(visitId))!.created_at
    const d = (await visitToDraft(visitId))!
    expect(d.dishes[0].photos).toHaveLength(1)
    d.dishes = [d.dishes[0]]
    d.overall_rating = 5
    await saveDraft(d)
    const after = (await getVisitDetail(visitId))!
    expect(after.dishes.map((x) => x.name)).toEqual(['残す'])
    expect(after.visit.overall_rating).toBe(5)
    expect(after.visit.created_at).toBe(created)
    expect(await db.photos.count()).toBe(1)
    expect(await db.photoFiles.count()).toBe(1)
    expect(await db.visits.count()).toBe(1)
  })

  it('訪問を消すと料理・写真・画像も消える', async () => {
    const { visitId } = await saveDraft(draft('店', T0, [{ name: 'x', photos: [photo()] }], { visitPhotos: [photo('exterior')] }))
    await deleteVisit(visitId)
    expect([await db.visits.count(), await db.dishes.count(), await db.photos.count(), await db.photoFiles.count()]).toEqual([0, 0, 0, 0])
  })

  it('店を消すとその店の記録だけ消える', async () => {
    const a = await saveDraft(draft('A', T0, [{ name: 'x', photos: [photo()] }]))
    await saveDraft(draft('B', T0, [{ name: 'y', photos: [photo()] }]))
    await deleteRestaurant(a.restaurantId)
    expect((await listAllVisits()).map((v) => v.restaurant.name)).toEqual(['B'])
    expect(await db.photoFiles.count()).toBe(1)
  })
})

describe('店の一覧と料理のまとめ', () => {
  it('最後に行った順に並び、回数・前回の料理・写真が付く', async () => {
    await saveDraft(draft('A', T0, [{ name: 'a1' }]))
    await saveDraft(draft('B', T0 + DAY, [{ name: 'b1', photos: [photo()] }, { name: 'b2' }]))
    await saveDraft(draft('A', T0 - DAY, [{ name: 'a0' }]))
    const list = await listRestaurantSummaries()
    expect(list.map((s) => s.restaurant.name)).toEqual(['B', 'A'])
    expect(list[1]).toMatchObject({ visitCount: 2, lastDishNames: ['a1'] })
    expect(list[0].lastDishNames).toEqual(['b1', 'b2'])
    expect(list[0].coverPhotoId).not.toBeNull()
  })

  it('同じ料理は品名でまとめ、最新の評価と回数を出す', async () => {
    const a = await saveDraft(draft('店', T0, [{ name: '味噌ラーメン', taste_rating: 3 }]))
    await saveDraft(draft('店', T0 + DAY, [{ name: '味噌 ラーメン', taste_rating: 5, want_again: 'must' }, { name: '餃子' }]))
    const s = await listDishSummaries(a.restaurantId)
    expect(s[0]).toMatchObject({ name: '味噌 ラーメン', count: 2, avgTaste: 4 })
    expect(s[0].last.want_again).toBe('must')
    expect(s[0].history.map((h) => h.dish.taste_rating)).toEqual([5, 3])
  })
})

describe('検索', () => {
  beforeEach(async () => {
    await saveDraft(
      draft('麺屋 一', T0, [
        { name: '醤油ラーメン', taste_rating: 5, amount_rating: 'just', price_rating: 'fair', want_again: 'must' },
        { name: '餃子', taste_rating: 2, amount_rating: 'small', price_rating: 'expensive', want_again: 'no' },
      ], { overall_rating: 4 }),
    )
    const cafe = draft('喫茶 ツバメ', T0 + DAY, [{ name: 'ナポリタン', taste_rating: 4, amount_rating: 'large', want_again: 'yes' }], {
      overall_rating: 3,
    })
    cafe.restaurant.genre = 'カフェ'
    await saveDraft(cafe)
  })

  it('料理名・店名のどちらでも、かな・カナの違いを無視して当たる', async () => {
    expect((await searchDishes({ ...EMPTY_FILTERS, q: 'らーめん' })).map((h) => h.dish.name)).toEqual(['醤油ラーメン'])
    expect((await searchDishes({ ...EMPTY_FILTERS, q: 'つばめ' })).map((h) => h.dish.name)).toEqual(['ナポリタン'])
  })

  it('料理：量・価格感・また食べたい・味の下限・ジャンルで絞れる', async () => {
    const names = async (f: Partial<typeof EMPTY_FILTERS>) =>
      (await searchDishes({ ...EMPTY_FILTERS, ...f })).map((h) => h.dish.name)
    expect(await names({ amounts: ['small', 'large'] })).toEqual(['ナポリタン', '餃子'])
    expect(await names({ prices: ['expensive'] })).toEqual(['餃子'])
    expect(await names({ wants: ['must', 'yes'] })).toEqual(['ナポリタン', '醤油ラーメン'])
    expect(await names({ minRating: 4 })).toEqual(['ナポリタン', '醤油ラーメン'])
    expect(await names({ genre: 'カフェ' })).toEqual(['ナポリタン'])
    expect(await names({ minRating: 5, wants: ['no'] })).toEqual([])
  })

  it('店：料理の条件は「当てはまる料理が1品でもある店」、評価は前回の総合評価', async () => {
    const names = async (f: Partial<typeof EMPTY_FILTERS>) =>
      (await searchRestaurants({ ...EMPTY_FILTERS, ...f })).map((h) => h.restaurant.name)
    expect(await names({})).toEqual(['喫茶 ツバメ', '麺屋 一'])
    expect(await names({ wants: ['no'] })).toEqual(['麺屋 一'])
    expect(await names({ minRating: 4 })).toEqual(['麺屋 一'])
    expect(await names({ q: 'ぎょうざ' })).toEqual([])
    expect(await names({ q: '餃子' })).toEqual(['麺屋 一'])
    const hit = (await searchRestaurants({ ...EMPTY_FILTERS, q: '餃子' }))[0]
    expect(hit.matchedDishes).toEqual(['餃子'])
  })
})

describe('バックアップ', () => {
  it('書き出して全部消し、読み込むと元どおりになる（写真の中身も）', async () => {
    const p = photo('dish', 42)
    await saveDraft(draft('店', T0, [{ name: 'x', photos: [p] }], { visitPhotos: [photo('menu')] }))
    const before = await listAllVisits()
    const { bytes, counts } = await buildBackupZip()
    expect(counts).toEqual({ restaurants: 1, visits: 1, dishes: 1, photos: 2 })
    await Promise.all(db.tables.map((t) => t.clear()))

    const parsed = parseBackup(bytes)
    expect(parsed.counts).toEqual(counts)
    await importBackup(parsed)
    expect(await listAllVisits()).toEqual(before)
    const f = (await db.photoFiles.get(p.id))!
    expect([...new Uint8Array(f.full)]).toEqual([42, 2, 3, 4])
    expect([...new Uint8Array(f.thumb)]).toEqual([42, 9])
  })

  it('読み込みは足し込みで、今ある記録を消さない', async () => {
    await saveDraft(draft('旧端末の店', T0, [{ name: 'a' }]))
    const { bytes } = await buildBackupZip()
    await Promise.all(db.tables.map((t) => t.clear()))
    await saveDraft(draft('新端末の店', T0 + DAY, [{ name: 'b' }]))
    await importBackup(parseBackup(bytes))
    expect((await listAllVisits()).map((v) => v.restaurant.name)).toEqual(['新端末の店', '旧端末の店'])
  })

  it('関係ないファイルは読み込まない', () => {
    expect(() => parseBackup(new Uint8Array([1, 2, 3]))).toThrow(BackupError)
  })
})
