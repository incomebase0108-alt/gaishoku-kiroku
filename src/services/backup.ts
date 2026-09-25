import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { db } from '../db/db'
import type { Dish, Photo, PhotoFile, Restaurant, Visit } from '../domain/types'

// バックアップは1つの zip：
//   data.json               … 店・訪問・料理・写真の情報
//   photos/<id>.jpg         … 写真（大）
//   thumbs/<id>.jpg         … 写真（一覧用の小）
// iPhone と Android の間でも同じ形式で移せる。

// 形式の名前は変えない（アプリ名を変える前のバックアップも読めるように）
export const BACKUP_FORMAT = 'gaishoku-kiroku-backup'
export const BACKUP_VERSION = 1

interface BackupData {
  format: typeof BACKUP_FORMAT
  version: number
  exported_at: number
  restaurants: Restaurant[]
  visits: Visit[]
  dishes: Dish[]
  photos: Photo[]
  photoMimes: Record<string, string>
}

export interface BackupCounts {
  restaurants: number
  visits: number
  dishes: number
  photos: number
}

export interface ParsedBackup {
  data: BackupData
  files: PhotoFile[]
  counts: BackupCounts
}

export class BackupError extends Error {}

function ext(mime: string): string {
  return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
}

function toU8(b: ArrayBuffer): Uint8Array {
  return new Uint8Array(b)
}

function toBuf(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
}

export async function buildBackupZip(now = Date.now()): Promise<{ bytes: Uint8Array; counts: BackupCounts }> {
  const [restaurants, visits, dishes, photos, files] = await Promise.all([
    db.restaurants.toArray(),
    db.visits.toArray(),
    db.dishes.toArray(),
    db.photos.toArray(),
    db.photoFiles.toArray(),
  ])
  const data: BackupData = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: now,
    restaurants,
    visits,
    dishes,
    photos,
    photoMimes: Object.fromEntries(files.map((f) => [f.id, f.mime])),
  }
  const zip: Zippable = { 'data.json': strToU8(JSON.stringify(data)) }
  for (const f of files) {
    // 写真はもともと圧縮済みなので zip では圧縮しない（速い）
    zip[`photos/${f.id}.${ext(f.mime)}`] = [toU8(f.full), { level: 0 }]
    zip[`thumbs/${f.id}.${ext(f.mime)}`] = [toU8(f.thumb), { level: 0 }]
  }
  const bytes = zipSync(zip)
  return {
    bytes,
    counts: { restaurants: restaurants.length, visits: visits.length, dishes: dishes.length, photos: files.length },
  }
}

export function backupFileName(now = Date.now()): string {
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  return `shokureki-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.zip`
}

export function parseBackup(bytes: Uint8Array): ParsedBackup {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    throw new BackupError('zip ファイルとして読めませんでした')
  }
  const json = entries['data.json']
  if (!json) throw new BackupError('このアプリのバックアップではありません（data.json がありません）')
  let data: BackupData
  try {
    data = JSON.parse(strFromU8(json))
  } catch {
    throw new BackupError('バックアップの中身が壊れています')
  }
  if (data.format !== BACKUP_FORMAT) throw new BackupError('このアプリのバックアップではありません')
  if (data.version > BACKUP_VERSION) {
    throw new BackupError('新しい版のアプリで作られたバックアップです。アプリを更新してから読み込んでください')
  }
  for (const k of ['restaurants', 'visits', 'dishes', 'photos'] as const) {
    if (!Array.isArray(data[k])) throw new BackupError('バックアップの中身が壊れています')
  }
  const files: PhotoFile[] = []
  for (const [id, mime] of Object.entries(data.photoMimes ?? {})) {
    const full = entries[`photos/${id}.${ext(mime)}`]
    const thumb = entries[`thumbs/${id}.${ext(mime)}`]
    if (full && thumb) files.push({ id, mime, full: toBuf(full), thumb: toBuf(thumb) })
  }
  return {
    data,
    files,
    counts: {
      restaurants: data.restaurants.length,
      visits: data.visits.length,
      dishes: data.dishes.length,
      photos: files.length,
    },
  }
}

// 足し込み：今ある記録は消さない。同じ ID の記録はバックアップの内容で上書きする
export async function importBackup(parsed: ParsedBackup): Promise<void> {
  const { data, files } = parsed
  const fileIds = new Set(files.map((f) => f.id))
  // 画像の中身が無い写真の行は入れない（一覧で空の枠になるため）
  const photos = data.photos.filter((p) => fileIds.has(p.image_path))
  await db.transaction('rw', [db.restaurants, db.visits, db.dishes, db.photos, db.photoFiles], async () => {
    // 市を足す前のバックアップには city が無いので空欄で入れる
    await db.restaurants.bulkPut(data.restaurants.map((r) => ({ ...r, city: r.city ?? '' })))
    await db.visits.bulkPut(data.visits)
    await db.dishes.bulkPut(data.dishes)
    await db.photoFiles.bulkPut(files)
    await db.photos.bulkPut(photos)
  })
}

export async function hasAnyData(): Promise<boolean> {
  return (await db.visits.count()) > 0
}
