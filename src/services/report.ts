import { db } from '../db/db'
import { AMOUNTS, PRICE_FEELS, WANT_AGAINS, labelOf, type WantAgain } from '../domain/enums'
import { fmtDate, fmtYen } from '../lib/util'
import { listDishSummaries } from '../repositories/restaurantRepo'
import { listVisitsOfRestaurant } from '../repositories/visitRepo'
import { buildPdf, type PdfPage } from './pdf'

// 店の評価を A4 の PDF にする。字も写真もキャンバスに描いてから綴じる。

const W = 1240 // A4 を 150dpi で
const H = 1754
const M = 90 // 余白
const FOOT = 70
const FONT = `-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic UI', Meiryo, sans-serif`
const C = { ai: '#2b4c7e', aiSoft: '#e7edf6', shu: '#c8372d', kin: '#e2a00c', ink: '#1f2733', muted: '#677183', line: '#dde2ea', off: '#d3d9e2' }

type Ctx = CanvasRenderingContext2D

class Doc {
  pages: HTMLCanvasElement[] = []
  ctx!: Ctx
  y = 0
  footer: string
  constructor(footer: string) {
    this.footer = footer
    this.newPage()
  }
  newPage() {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W, H)
    ctx.textBaseline = 'top'
    this.pages.push(c)
    this.ctx = ctx
    this.y = M
  }
  // 残りに h が入らなければ次のページへ
  ensure(h: number) {
    if (this.y + h > H - M - FOOT) this.newPage()
  }
  finish() {
    this.pages.forEach((c, i) => {
      const ctx = c.getContext('2d')!
      ctx.textBaseline = 'top'
      font(ctx, 20)
      ctx.fillStyle = C.muted
      ctx.fillText(this.footer, M, H - M + 10)
      const pn = `${i + 1} / ${this.pages.length}`
      ctx.fillText(pn, W - M - ctx.measureText(pn).width, H - M + 10)
    })
  }
}

function font(ctx: Ctx, size: number, weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT}`
}

// 日本語は1字ずつ測って折り返す
function wrap(ctx: Ctx, text: string, maxW: number, maxLines = 99): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let cur = ''
    for (const ch of para) {
      if (ctx.measureText(cur + ch).width > maxW && cur) {
        lines.push(cur)
        cur = ch
      } else cur += ch
    }
    lines.push(cur)
  }
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines)
    cut[maxLines - 1] = cut[maxLines - 1].slice(0, -1) + '…'
    return cut
  }
  return lines
}

function drawStars(ctx: Ctx, x: number, y: number, n: number, size: number) {
  for (let i = 0; i < 5; i++) {
    const cx = x + i * size * 1.05 + size / 2
    const cy = y + size / 2
    ctx.beginPath()
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? size / 2 : size / 4.6
      const a = -Math.PI / 2 + (k * Math.PI) / 5
      ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
    }
    ctx.closePath()
    ctx.fillStyle = i < n ? C.kin : C.off
    ctx.fill()
  }
  return size * 5.25
}

function drawStamp(ctx: Ctx, cx: number, cy: number, r: number, want: WantAgain) {
  const color = want === 'must' ? C.shu : want === 'yes' ? '#c2692d' : C.muted
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((-12 * Math.PI) / 180)
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.09
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.stroke()
  if (want === 'must') {
    ctx.lineWidth = r * 0.04
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.84, 0, Math.PI * 2)
    ctx.stroke()
  }
  const lines = want === 'must' ? ['絶対', '食べる'] : want === 'either' ? ['どちら', 'でも'] : [labelOf(WANT_AGAINS, want)]
  font(ctx, r * (lines.length > 1 ? 0.42 : 0.5), 800)
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  lines.forEach((t, i) => {
    const w = ctx.measureText(t).width
    ctx.fillText(t, -w / 2, (i - (lines.length - 1) / 2) * r * 0.5)
  })
  ctx.restore()
  ctx.textBaseline = 'top'
}

async function loadImage(fileId: string, size: 'thumb' | 'full'): Promise<ImageBitmap | null> {
  try {
    const f = await db.photoFiles.get(fileId)
    if (!f) return null
    return await createImageBitmap(new Blob([size === 'full' ? f.full : f.thumb], { type: f.mime }))
  } catch {
    return null
  }
}

// 枠いっぱいに切り抜いて角を丸めて描く
function drawCover(ctx: Ctx, img: ImageBitmap, x: number, y: number, w: number, h: number, radius = 16) {
  const s = Math.max(w / img.width, h / img.height)
  const sw = w / s
  const sh = h / s
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
  ctx.clip()
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
  ctx.restore()
}

function sectionTitle(doc: Doc, text: string) {
  doc.ensure(90)
  doc.y += 20
  const ctx = doc.ctx
  ctx.fillStyle = C.ai
  ctx.fillRect(M, doc.y + 6, 8, 34)
  font(ctx, 32, 800)
  ctx.fillStyle = C.ink
  ctx.fillText(text, M + 24, doc.y + 4)
  doc.y += 60
}

export interface StoreReport {
  pages: HTMLCanvasElement[]
  file: File
}

export async function makeStoreReport(restaurantId: string, now = Date.now()): Promise<StoreReport | null> {
  const r = await db.restaurants.get(restaurantId)
  if (!r) return null
  const visits = await listVisitsOfRestaurant(restaurantId)
  const dishes = await listDishSummaries(restaurantId)
  const doc = new Doc(`食歴　${fmtDate(now)} 作成`)
  let ctx = doc.ctx
  const inner = W - M * 2

  // ---- 見出し ----
  ctx.fillStyle = C.ai
  ctx.fillRect(0, 0, W, 16)
  font(ctx, 24, 700)
  ctx.fillStyle = C.ai
  ctx.fillText('食歴　お店の記録', M, doc.y)
  doc.y += 44
  font(ctx, 60, 800)
  ctx.fillStyle = C.ink
  for (const line of wrap(ctx, r.name, inner, 2)) {
    ctx.fillText(line, M, doc.y)
    doc.y += 74
  }
  const last = visits[0] ?? null
  const meta = [r.genre, r.city, `行った回数 ${visits.length}回`, last ? `最後に行った日 ${fmtDate(last.visit.visited_at)}` : ''].filter((x) => x)
  font(ctx, 28)
  ctx.fillStyle = C.muted
  for (const line of wrap(ctx, meta.join('　'), inner, 2)) {
    ctx.fillText(line, M, doc.y)
    doc.y += 40
  }
  if (r.address) {
    ctx.fillText(r.address, M, doc.y)
    doc.y += 40
  }
  doc.y += 10

  // ---- 前回 ----
  if (last) {
    sectionTitle(doc, `前回　${fmtDate(last.visit.visited_at)}`)
    ctx = doc.ctx
    const photoIds = last.photos.map((p) => p.image_path).slice(0, 3)
    if (photoIds.length) {
      const gap = 16
      const pw = (inner - gap * (photoIds.length - 1)) / photoIds.length
      const ph = Math.min(pw * 0.75, 420)
      doc.ensure(ph + 20)
      ctx = doc.ctx
      for (let i = 0; i < photoIds.length; i++) {
        const img = await loadImage(photoIds[i], photoIds.length === 1 ? 'full' : 'thumb')
        if (img) drawCover(ctx, img, M + i * (pw + gap), doc.y, pw, ph)
      }
      doc.y += ph + 24
    }
    let x = M
    if (last.visit.overall_rating) {
      font(ctx, 28, 700)
      ctx.fillStyle = C.ink
      ctx.fillText('総合', x, doc.y + 4)
      x += 70
      x += drawStars(ctx, x, doc.y, last.visit.overall_rating, 38) + 30
    }
    if (last.visit.total_price != null) {
      font(ctx, 40, 800)
      ctx.fillStyle = C.ink
      const t = fmtYen(last.visit.total_price)
      ctx.fillText(t, x, doc.y - 2)
      x += ctx.measureText(t).width + 20
    }
    if (last.visit.people_count > 1) {
      font(ctx, 26)
      ctx.fillStyle = C.muted
      ctx.fillText(`${last.visit.people_count}人`, x, doc.y + 10)
    }
    if (last.visit.overall_rating || last.visit.total_price != null) doc.y += 64
    for (const d of last.dishes) {
      doc.ensure(110)
      ctx = doc.ctx
      font(ctx, 32, 800)
      ctx.fillStyle = C.ink
      ctx.fillText(d.name || '（品名なし）', M, doc.y)
      const sub = [
        d.amount_rating ? `量：${labelOf(AMOUNTS, d.amount_rating)}` : '',
        d.price_rating ? labelOf(PRICE_FEELS, d.price_rating) : '',
        d.price != null ? fmtYen(d.price) : '',
      ].filter((s) => s)
      let sx = M
      if (d.taste_rating) sx += drawStars(ctx, sx, doc.y + 48, d.taste_rating, 26) + 16
      font(ctx, 24)
      ctx.fillStyle = C.muted
      ctx.fillText(sub.join('　'), sx, doc.y + 48)
      if (d.want_again) drawStamp(ctx, W - M - 50, doc.y + 38, 44, d.want_again)
      doc.y += 88
      if (d.memo) {
        font(ctx, 24)
        ctx.fillStyle = C.ink
        for (const line of wrap(ctx, d.memo, inner - 130, 3)) {
          doc.ensure(34)
          doc.ctx.fillText(line, M, doc.y)
          doc.y += 34
        }
        doc.y += 6
      }
      doc.ctx.fillStyle = C.line
      doc.ctx.fillRect(M, doc.y, inner, 2)
      doc.y += 16
    }
    if (last.visit.memo) {
      ctx = doc.ctx
      font(ctx, 24)
      ctx.fillStyle = C.ink
      for (const line of wrap(ctx, last.visit.memo, inner, 6)) {
        doc.ensure(34)
        doc.ctx.fillText(line, M, doc.y)
        doc.y += 34
      }
    }
  }

  // ---- 食べた料理 ----
  if (dishes.length) {
    sectionTitle(doc, 'この店で食べた料理')
    for (const s of dishes) {
      const rowH = 150
      doc.ensure(rowH)
      ctx = doc.ctx
      const y = doc.y
      const img = s.photoId ? await loadImage(s.photoId, 'thumb') : null
      if (img) drawCover(ctx, img, M, y, 130, 130, 12)
      else {
        ctx.fillStyle = C.aiSoft
        ctx.beginPath()
        ctx.roundRect(M, y, 130, 130, 12)
        ctx.fill()
      }
      const tx = M + 156
      font(ctx, 32, 800)
      ctx.fillStyle = C.ink
      const name = wrap(ctx, s.name || '（品名なし）', inner - 156 - 140, 1)[0]
      ctx.fillText(name, tx, y + 4)
      if (s.count > 1) {
        const nw = ctx.measureText(name).width
        font(ctx, 24)
        ctx.fillStyle = C.muted
        ctx.fillText(`${s.count}回`, tx + nw + 12, y + 12)
      }
      let sx = tx
      if (s.last.taste_rating) sx += drawStars(ctx, sx, y + 52, s.last.taste_rating, 26) + 16
      const sub = [
        s.last.amount_rating ? `量：${labelOf(AMOUNTS, s.last.amount_rating)}` : '',
        s.last.price_rating ? labelOf(PRICE_FEELS, s.last.price_rating) : '',
        s.last.price != null ? fmtYen(s.last.price) : '',
      ].filter((x) => x)
      font(ctx, 24)
      ctx.fillStyle = C.muted
      ctx.fillText(sub.join('　'), sx, y + 52)
      ctx.fillText(`最後に食べた日 ${fmtDate(s.lastVisitedAt)}`, tx, y + 94)
      if (s.last.want_again) drawStamp(ctx, W - M - 50, y + 62, 44, s.last.want_again)
      doc.y += rowH
    }
  }

  // ---- 訪問履歴 ----
  if (visits.length) {
    sectionTitle(doc, '訪問履歴')
    for (const v of visits) {
      ctx = doc.ctx
      font(ctx, 24)
      const names = v.dishes.map((d) => d.name).filter((n) => n).join('、') || '—'
      const lines = wrap(ctx, names, inner - 230, 3)
      doc.ensure(20 + lines.length * 34 + 20)
      ctx = doc.ctx
      font(ctx, 26, 700)
      ctx.fillStyle = C.ink
      ctx.fillText(fmtDate(v.visit.visited_at), M, doc.y)
      font(ctx, 24)
      ctx.fillStyle = C.muted
      if (v.visit.total_price != null) ctx.fillText(fmtYen(v.visit.total_price), M, doc.y + 36)
      ctx.fillStyle = C.ink
      lines.forEach((l, i) => doc.ctx.fillText(l, M + 230, doc.y + i * 34))
      if (v.visit.overall_rating) drawStars(ctx, W - M - 22 * 5.25, doc.y, v.visit.overall_rating, 22)
      doc.y += Math.max(72, lines.length * 34) + 10
      doc.ctx.fillStyle = C.line
      doc.ctx.fillRect(M, doc.y, inner, 2)
      doc.y += 16
    }
  }

  doc.finish()
  const pages: PdfPage[] = []
  for (const c of doc.pages) {
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PDFを作れませんでした'))), 'image/jpeg', 0.88))
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: W, height: H })
  }
  const bytes = buildPdf(pages, `${r.name}（食歴）`)
  const safe = r.name.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40)
  const file = new File([bytes as BlobPart], `食歴_${safe}.pdf`, { type: 'application/pdf' })
  return { pages: doc.pages, file }
}
