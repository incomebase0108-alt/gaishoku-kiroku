import Dexie, { type EntityTable } from 'dexie'
import type { Dish, Photo, PhotoFile, Restaurant, Visit, VisitDraft } from '../domain/types'

export type DraftRow = VisitDraft & { key: string }

export class AppDB extends Dexie {
  restaurants!: EntityTable<Restaurant, 'id'>
  visits!: EntityTable<Visit, 'id'>
  dishes!: EntityTable<Dish, 'id'>
  photos!: EntityTable<Photo, 'id'>
  photoFiles!: EntityTable<PhotoFile, 'id'>
  drafts!: EntityTable<DraftRow, 'key'>

  // DB の名前は変えない（変えると、使っている人の記録が見えなくなる）
  constructor(name = 'gaishoku-kiroku') {
    super(name)
    // 列を足すときは version(2) を追加し、ここは書き換えない
    this.version(1).stores({
      restaurants: 'id, name, genre, updated_at',
      visits: 'id, restaurant_id, visited_at, [restaurant_id+visited_at]',
      dishes: 'id, visit_id, name',
      photos: 'id, visit_id, dish_id',
      photoFiles: 'id',
      drafts: 'key',
    })
    // v2：店に市（city）を足した。今までの店は空欄で入る
    this.version(2)
      .stores({ restaurants: 'id, name, genre, city, updated_at' })
      .upgrade((tx) =>
        tx
          .table('restaurants')
          .toCollection()
          .modify((r) => {
            if (typeof r.city !== 'string') r.city = ''
          }),
      )
  }
}

export const db = new AppDB()

export const DATA_TABLES = ['restaurants', 'visits', 'dishes', 'photos', 'photoFiles'] as const
