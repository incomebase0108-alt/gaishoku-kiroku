import { beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { AppDB, db } from '../src/db/db'
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
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { usedCities } from '../src/repositories/restaurantRepo'
import { addSharedStore, buildSharedStore, decodeShared, encodeShared, shareText, shareUrl } from '../src/services/share'
import { buildPdf } from '../src/services/pdf'

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
  const d = newDraft({ id: null, name, genre: 'ラーメン', city: '', latitude: null, longitude: null }, at)
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

  it('前回に写真が無ければ、写真のあるいちばん新しい訪問の写真を表紙にする', async () => {
    const old = photo('dish', 7)
    const mid = photo('dish', 8)
    await saveDraft(draft('A', T0 - DAY, [{ name: 'x', photos: [old] }]))
    await saveDraft(draft('A', T0, [{ name: 'y', photos: [mid] }]))
    await saveDraft(draft('A', T0 + DAY, [{ name: 'z' }]))
    expect((await listRestaurantSummaries())[0].coverPhotoId).toBe(mid.id)
  })

  it('同じ訪問の料理は登録した順に並ぶ（保存の順番に左右されない）', async () => {
    const names = ['一', '二', '三', '四', '五']
    const a = await saveDraft(draft('店', T0, names.map((name) => ({ name }))))
    expect((await listDishSummaries(a.restaurantId)).map((s) => s.name)).toEqual(names)
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

function inCity(name: string, city: string, at: number, dishes: Partial<VisitDraft['dishes'][number]>[]): VisitDraft {
  const d = draft(name, at, dishes)
  d.restaurant.city = city
  return d
}

describe('市', () => {
  it('同じ名前でも市が違えば別の店、同じ市なら同じ店', async () => {
    const a = await saveDraft(inCity('スシロー', '名古屋市', T0, [{ name: 'まぐろ' }]))
    const b = await saveDraft(inCity('スシロー', '豊橋市', T0 + DAY, [{ name: 'えび' }]))
    const c = await saveDraft(inCity('スシロー', '名古屋市', T0 + 2 * DAY, [{ name: 'いか' }]))
    expect(b.restaurantId).not.toBe(a.restaurantId)
    expect(c.restaurantId).toBe(a.restaurantId)
    expect(await db.restaurants.count()).toBe(2)
  })

  it('市が空の店に、次の記録で入れた市が入る（空で上書きはしない）', async () => {
    const a = await saveDraft(draft('店', T0, [{ name: 'x' }]))
    const d2 = draft('店', T0 + DAY, [{ name: 'y' }])
    d2.restaurant = { id: a.restaurantId, name: '店', genre: '', city: '岡崎市', latitude: null, longitude: null }
    await saveDraft(d2)
    expect((await db.restaurants.get(a.restaurantId))!.city).toBe('岡崎市')
    const d3 = draft('店', T0 + 2 * DAY, [{ name: 'z' }])
    d3.restaurant = { id: a.restaurantId, name: '店', genre: '', city: '', latitude: null, longitude: null }
    await saveDraft(d3)
    expect((await db.restaurants.get(a.restaurantId))!.city).toBe('岡崎市')
  })

  it('市で絞り込める・キーワードは市にも当たる', async () => {
    await saveDraft(inCity('喫茶A', '名古屋市', T0, [{ name: 'モーニング' }]))
    await saveDraft(inCity('喫茶B', '豊橋市', T0 + DAY, [{ name: 'モーニング' }]))
    const stores = async (f: Partial<typeof EMPTY_FILTERS>) =>
      (await searchRestaurants({ ...EMPTY_FILTERS, ...f })).map((h) => h.restaurant.name)
    expect(await stores({ city: '名古屋市' })).toEqual(['喫茶A'])
    expect(await stores({ q: '豊橋' })).toEqual(['喫茶B'])
    const dishes = async (f: Partial<typeof EMPTY_FILTERS>) =>
      (await searchDishes({ ...EMPTY_FILTERS, ...f })).map((h) => h.restaurant.name)
    expect(await dishes({ city: '豊橋市' })).toEqual(['喫茶B'])
    expect(await dishes({ q: 'なごや' })).toEqual([])
    expect(await dishes({ q: '名古屋' })).toEqual(['喫茶A'])
    expect(await usedCities()).toEqual(['豊橋市', '名古屋市'])
  })
})

describe('今までの記録を引き継ぐ', () => {
  it('市を足す前（v1）の DB を新しい版で開いても記録が残り、市は空欄になる', async () => {
    const name = 'migrate-test'
    const old = new Dexie(name)
    old.version(1).stores({
      restaurants: 'id, name, genre, updated_at',
      visits: 'id, restaurant_id, visited_at, [restaurant_id+visited_at]',
      dishes: 'id, visit_id, name',
      photos: 'id, visit_id, dish_id',
      photoFiles: 'id',
      drafts: 'key',
    })
    await old.table('restaurants').add({ id: 'r1', name: '旧い店', genre: '和食', address: '', latitude: null, longitude: null, memo: '', created_at: 1, updated_at: 1 })
    await old.table('visits').add({ id: 'v1', restaurant_id: 'r1', visited_at: T0, people_count: 1, total_price: 800, overall_rating: 4, memo: '', created_at: 1, updated_at: 1 })
    old.close()

    const fresh = new AppDB(name)
    const r = await fresh.restaurants.get('r1')
    expect(r).toMatchObject({ name: '旧い店', genre: '和食', city: '' })
    expect(await fresh.visits.get('v1')).toMatchObject({ total_price: 800 })
    expect(await fresh.restaurants.where('city').equals('').count()).toBe(1)
    fresh.close()
    await Dexie.delete(name)
  })

  it('市を足す前のバックアップも読み込め、市は空欄になる', async () => {
    await saveDraft(draft('店', T0, [{ name: 'x' }]))
    const { bytes } = await buildBackupZip()
    // 市の列が無い古いバックアップを作る
    const entries = unzipSync(bytes)
    const data = JSON.parse(strFromU8(entries['data.json']))
    for (const r of data.restaurants) delete r.city
    entries['data.json'] = strToU8(JSON.stringify(data))
    const oldZip = zipSync(entries)
    await Promise.all(db.tables.map((t) => t.clear()))
    await importBackup(parseBackup(oldZip))
    const r = (await db.restaurants.toArray())[0]
    expect(r.city).toBe('')
    expect(r.name).toBe('店')
  })
})

describe('店の位置', () => {
  it('記録で取った位置が新しい店に入り、既存の店は取り直した位置に更新される', async () => {
    const d = draft('店', T0, [{ name: 'x' }])
    d.restaurant.latitude = 35.170915
    d.restaurant.longitude = 136.881537
    const a = await saveDraft(d)
    expect(await db.restaurants.get(a.restaurantId)).toMatchObject({ latitude: 35.170915, longitude: 136.881537 })
    const d2 = draft('店', T0 + DAY, [{ name: 'y' }])
    d2.restaurant = { id: a.restaurantId, name: '店', genre: '', city: '', latitude: 35.2, longitude: 136.9 }
    await saveDraft(d2)
    expect(await db.restaurants.get(a.restaurantId)).toMatchObject({ latitude: 35.2, longitude: 136.9 })
    // 位置を取らずに記録しても、位置は消えない
    const d3 = draft('店', T0 + 2 * DAY, [{ name: 'z' }])
    d3.restaurant = { id: a.restaurantId, name: '店', genre: '', city: '', latitude: null, longitude: null }
    await saveDraft(d3)
    expect(await db.restaurants.get(a.restaurantId)).toMatchObject({ latitude: 35.2, longitude: 136.9 })
  })
})

describe('店の共有', () => {
  async function sharedFromSaved() {
    const d = inCity('麺屋 一', '名古屋市', T0, [
      { name: '醤油ラーメン', taste_rating: 5, want_again: 'must', amount_rating: 'just', memo: '店員さんが感じ悪い' },
      { name: '餃子', taste_rating: 2, want_again: 'no' },
    ])
    d.memo = '元カレと来た'
    d.overall_rating = 4
    d.restaurant.latitude = 35.17
    d.restaurant.longitude = 136.88
    const { restaurantId } = await saveDraft(d)
    return (await buildSharedStore(restaurantId))!
  }

  it('送って開くと元どおり（評価・位置・市）', async () => {
    const s = await sharedFromSaved()
    const back = decodeShared(encodeShared(s))
    expect(back).toEqual(s)
    expect(back).toMatchObject({ name: '麺屋 一', city: '名古屋市', latitude: 35.17, overall: 4, visits: 1 })
    expect(back!.dishes[0]).toMatchObject({ name: '醤油ラーメン', taste: 5, want: 'must', amount: 'just' })
  })

  it('自分のメモは送る中身に入らない', async () => {
    const s = await sharedFromSaved()
    const all = JSON.stringify(s) + shareText(s) + decodeURIComponent(shareUrl(s, 'https://x/app/'))
    expect(all).not.toContain('感じ悪い')
    expect(all).not.toContain('元カレ')
  })

  it('文面に店名・市・料理・地図が入る', async () => {
    const t = shareText(await sharedFromSaved())
    expect(t).toContain('麺屋 一（名古屋市・ラーメン）')
    expect(t).toContain('醤油ラーメン ★★★★★ 絶対食べる')
    expect(t).toContain('google.com/maps')
  })

  it('壊れたリンク・形の違う中身は開かない', () => {
    expect(decodeShared('')).toBeNull()
    expect(decodeShared('abc!!')).toBeNull()
    expect(decodeShared(encodeShared({ v: 2 } as never))).toBeNull()
    const bad = decodeShared(
      encodeShared({ v: 1, name: '店', dishes: [{ name: 'x', want: 'hack', amount: 'large' }] } as never),
    )
    expect(bad!.dishes[0]).toMatchObject({ want: null, amount: 'large' })
  })

  it('受け取った店を追加でき、2回追加しても増えない', async () => {
    const s = await sharedFromSaved()
    await Promise.all(db.tables.map((t) => t.clear()))
    const id1 = await addSharedStore(s)
    const id2 = await addSharedStore(s)
    expect(id2).toBe(id1)
    expect(await db.restaurants.count()).toBe(1)
    const r = (await db.restaurants.get(id1))!
    expect(r).toMatchObject({ name: '麺屋 一', city: '名古屋市', genre: 'ラーメン', latitude: 35.17 })
    expect(r.memo).toBe('教えてもらったおすすめ：醤油ラーメン★5（絶対食べる）')
    expect(await db.visits.count()).toBe(0) // 行ったことにはしない
  })
})

describe('PDF', () => {
  it('ページ数どおりに綴じられ、目次の位置が各オブジェクトを指す', () => {
    const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, n, n, 0xff, 0xd9])
    const bytes = buildPdf(
      [
        { jpeg: jpeg(1), width: 10, height: 14 },
        { jpeg: jpeg(2), width: 10, height: 14 },
      ],
      '麺屋 一（食歴）',
    )
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(text).toContain('/Count 2')
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1])
    expect(text.slice(startxref, startxref + 4)).toBe('xref')
    const rows = text.slice(startxref).split('\n').filter((l) => / n $/.test(l))
    expect(rows).toHaveLength(9) // カタログ・ページ一覧・情報 ＋ 2ページ×3
    rows.forEach((row, i) => {
      const off = Number(row.slice(0, 10))
      expect(text.slice(off, off + 12)).toContain(`${i + 1} 0 obj`)
    })
  })
})
