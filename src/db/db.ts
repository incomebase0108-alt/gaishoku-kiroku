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
  }
}

export const db = new AppDB()

export const DATA_TABLES = ['restaurants', 'visits', 'dishes', 'photos', 'photoFiles'] as const
