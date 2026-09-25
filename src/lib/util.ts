export function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // http（LAN での確認など）では randomUUID が無いので自前で作る
  const b = new Uint8Array(16)
  c.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// 検索用の正規化：全角半角・大文字小文字・カタカナひらがな・空白の違いを無視する
export function norm(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '')
}

const WD = ['日', '月', '火', '水', '木', '金', '土']

export function fmtDate(t: number): string {
  const d = new Date(t)
  const y = d.getFullYear() === new Date().getFullYear() ? '' : `${d.getFullYear()}/`
  return `${y}${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`
}

export function fmtDateTime(t: number): string {
  const d = new Date(t)
  return `${fmtDate(t)} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function fmtAgo(t: number, now = Date.now()): string {
  const days = Math.floor((startOfDay(now) - startOfDay(t)) / 86400000)
  if (days <= 0) return '今日'
  if (days === 1) return '昨日'
  if (days < 31) return `${days}日前`
  if (days < 365) return `${Math.floor(days / 30)}か月前`
  return `${Math.floor(days / 365)}年前`
}

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function fmtYen(n: number | null | undefined): string {
  return n == null ? '' : `¥${n.toLocaleString('ja-JP')}`
}

// <input type="datetime-local"> 用の文字列 ⇔ epoch ms
export function toLocalInput(t: number): string {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fromLocalInput(s: string): number | null {
  const t = new Date(s).getTime()
  return Number.isNaN(t) ? null : t
}

// 数字だけを取り出す（全角数字やカンマも可）。空なら null
export function parseYen(s: string): number | null {
  const d = s.normalize('NFKC').replace(/[^\d]/g, '')
  return d === '' ? null : Number(d)
}
