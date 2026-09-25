import type { DraftPhoto } from '../domain/types'
import type { PhotoType } from '../domain/enums'
import { newId } from '../lib/util'

// 撮った写真・選んだ写真を小さくしてから持つ（大：長辺1600px／一覧用：長辺480px）。
// 元の写真（数MB）をそのまま入れると、数十回の外食でスマホの容量とバックアップが重くなるため。
const FULL = 1600
const THUMB = 480

async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; done: () => void }> {
  if ('createImageBitmap' in globalThis) {
    try {
      // 写真の向き（縦持ち・横持ち）は createImageBitmap が直してくれる
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() }
    } catch {
      // 対応していない形式は <img> で読む
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function render(src: CanvasImageSource, w: number, h: number, max: number, quality: number): Promise<ArrayBuffer> {
  const s = Math.min(1, max / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * s))
  const ch = Math.max(1, Math.round(h * s))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#fff' // 透明な画像（スクリーンショットなど）が JPEG で黒くならないように
  ctx.fillRect(0, 0, cw, ch)
  ctx.drawImage(src, 0, 0, cw, ch)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? b.arrayBuffer().then(resolve, reject) : reject(new Error('画像を作れませんでした'))),
      'image/jpeg',
      quality,
    )
  })
}

export async function processPhoto(file: File, type: PhotoType): Promise<DraftPhoto> {
  const img = await decode(file)
  try {
    const [full, thumb] = [await render(img.src, img.w, img.h, FULL, 0.85), await render(img.src, img.w, img.h, THUMB, 0.8)]
    return { id: newId(), type, mime: 'image/jpeg', full, thumb, taken_at: file.lastModified || Date.now() }
  } finally {
    img.done()
  }
}

// 端末に「このアプリのデータを勝手に消さないで」と頼む（対応していれば）
export async function requestPersist(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
