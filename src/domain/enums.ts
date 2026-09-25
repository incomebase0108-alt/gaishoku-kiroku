// 選択肢の定義。DB には value（英語のコード）を入れ、画面には label を出す。
// 表示名を変えたいときはここだけ直す。

export const AMOUNTS = [
  { value: 'small', label: '少ない' },
  { value: 'just', label: 'ちょうどいい' },
  { value: 'large', label: '多い' },
] as const
export type Amount = (typeof AMOUNTS)[number]['value']

export const PRICE_FEELS = [
  { value: 'cheap', label: '安い' },
  { value: 'fair', label: '妥当' },
  { value: 'expensive', label: '高い' },
] as const
export type PriceFeel = (typeof PRICE_FEELS)[number]['value']

export const WANT_AGAINS = [
  { value: 'must', label: '絶対食べる' },
  { value: 'yes', label: 'あり' },
  { value: 'either', label: 'どちらでも' },
  { value: 'no', label: 'なし' },
] as const
export type WantAgain = (typeof WANT_AGAINS)[number]['value']

export const PHOTO_TYPES = [
  { value: 'dish', label: '料理' },
  { value: 'exterior', label: '外観' },
  { value: 'menu', label: 'メニュー' },
  { value: 'receipt', label: 'レシート' },
  { value: 'other', label: 'その他' },
] as const
export type PhotoType = (typeof PHOTO_TYPES)[number]['value']

// ジャンルは表示名そのものを保存する（一覧に無いものも自由に入れられる）
export const GENRES = [
  '和食', '寿司', 'ラーメン', 'うどん・そば', '定食', '丼',
  '焼肉', '焼き鳥', '居酒屋', '中華', '韓国', 'エスニック',
  'カレー', 'イタリアン', 'フレンチ', '洋食', 'ハンバーガー',
  'カフェ', 'スイーツ', 'パン', 'その他',
] as const

export type Rating = 1 | 2 | 3 | 4 | 5

type Opt = { readonly value: string; readonly label: string }
export function labelOf(list: readonly Opt[], value: string | null | undefined): string {
  if (!value) return ''
  return list.find((o) => o.value === value)?.label ?? value
}

export function isOneOf<T extends string>(list: readonly { value: T }[], v: unknown): v is T {
  return typeof v === 'string' && list.some((o) => o.value === v)
}
