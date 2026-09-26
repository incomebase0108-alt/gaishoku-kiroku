import type { Amount, PhotoType, PriceFeel, Rating, WantAgain } from './enums'

// 時刻はすべて epoch ミリ秒。ID は UUID（将来のクラウド同期で衝突しないように連番にしない）。

export interface Restaurant {
  id: string
  name: string
  genre: string
  city: string // 〇〇市・〇〇区など。空なら未入力
  address: string
  latitude: number | null
  longitude: number | null
  memo: string
  created_at: number
  updated_at: number
}

export interface Visit {
  id: string
  restaurant_id: string
  visited_at: number
  people_count: number
  total_price: number | null
  overall_rating: Rating | null
  memo: string
  created_at: number
  updated_at: number
}

export interface Dish {
  id: string
  visit_id: string
  name: string
  price: number | null
  taste_rating: Rating | null
  amount_rating: Amount | null
  price_rating: PriceFeel | null
  want_again: WantAgain | null
  memo: string
  sort_order: number
  created_at: number
  updated_at: number
}

export interface Photo {
  id: string
  visit_id: string
  dish_id: string | null // null なら訪問全体の写真（外観・レシートなど）
  type: PhotoType
  image_path: string // photoFiles のキー
  taken_at: number | null
  created_at: number
}

// 画像の中身。Blob ではなく ArrayBuffer で持つ（古い iOS Safari の Blob 保存の不具合を避けるため）
export interface PhotoFile {
  id: string
  mime: string
  full: ArrayBuffer
  thumb: ArrayBuffer
}

export interface VisitDetail {
  visit: Visit
  restaurant: Restaurant
  dishes: Dish[]
  photos: Photo[]
}

// ---- 入力中の下書き（アプリが落ちても写真ごと残るよう DB に置く） ----

export interface DraftPhoto {
  id: string
  type: PhotoType
  mime: string
  full: ArrayBuffer
  thumb: ArrayBuffer
  taken_at: number | null
}

export interface DraftDish {
  id: string
  name: string
  price: number | null
  taste_rating: Rating | null
  amount_rating: Amount | null
  price_rating: PriceFeel | null
  want_again: WantAgain | null
  memo: string
  photos: DraftPhoto[]
}

export interface VisitDraft {
  editingVisitId: string | null
  restaurant: {
    id: string | null
    name: string
    genre: string
    city: string
    latitude: number | null // 記録の画面で「今いる場所」を取ったとき
    longitude: number | null
  }
  visited_at: number
  people_count: number
  total_price: number | null
  overall_rating: Rating | null
  memo: string
  dishes: DraftDish[]
  visitPhotos: DraftPhoto[]
  updated_at: number
}
