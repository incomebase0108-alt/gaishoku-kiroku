import { db } from '../db/db'
import type { DraftDish, VisitDraft } from '../domain/types'
import { newId } from '../lib/util'
import { isDishEmpty } from './visitRepo'

// 入力中の下書きは1件だけ。写真を撮るためにカメラを開いた間に
// iPhone がページを閉じても、戻ったとき写真ごと残っているよう DB に置く。
const KEY = 'current'

export function emptyDish(): DraftDish {
  return {
    id: newId(),
    name: '',
    price: null,
    taste_rating: null,
    amount_rating: null,
    price_rating: null,
    want_again: null,
    memo: '',
    photos: [],
  }
}

export function newDraft(restaurant: VisitDraft['restaurant'], now = Date.now()): VisitDraft {
  return {
    editingVisitId: null,
    restaurant,
    visited_at: now,
    people_count: 1,
    total_price: null,
    overall_rating: null,
    memo: '',
    dishes: [emptyDish()],
    visitPhotos: [],
    updated_at: now,
  }
}

// 何か入力したか（店を選んだだけなら捨ててよい）
export function draftHasContent(d: VisitDraft): boolean {
  return (
    d.editingVisitId != null ||
    d.overall_rating != null ||
    d.total_price != null ||
    d.memo.trim() !== '' ||
    d.visitPhotos.length > 0 ||
    d.dishes.some((x) => !isDishEmpty(x))
  )
}

export async function loadDraft(): Promise<VisitDraft | null> {
  const row = await db.drafts.get(KEY)
  if (!row) return null
  const { key: _key, ...draft } = row
  return draft
}

export async function saveDraftState(draft: VisitDraft): Promise<void> {
  await db.drafts.put({ ...draft, key: KEY, updated_at: Date.now() })
}

export async function clearDraft(): Promise<void> {
  await db.drafts.delete(KEY)
}
