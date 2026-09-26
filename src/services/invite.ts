import { encode } from 'uqr'
import { ABOUT } from '../lib/about'

// 友だちに食歴そのものを教える（LINE・Instagram・QR）。
// LINE のアプリ内ブラウザではホーム画面に追加できないので、openExternalBrowser=1 を付けて
// Safari / Chrome で開かせる（LINE 以外では何も起きない）。

export function withExternal(url: string): string {
  const [base, hash] = url.split('#')
  const [path, query] = base.split('?')
  const q = new URLSearchParams(query ?? '')
  q.set('openExternalBrowser', '1')
  return `${path}?${q.toString()}${hash != null ? `#${hash}` : ''}`
}

export function inviteUrl(): string {
  return withExternal(ABOUT.appUrl)
}

export function inviteText(): string {
  return [
    '外食の記録アプリ「食歴」を使ってるよ。',
    'お店で食べた料理を写真と★で残せて、次に行ったとき「前回なに食べた？」がすぐ分かる。',
    '無料・登録なし。開いて「ホーム画面に追加」するとアプリになるよ。',
  ].join('\n')
}

// LINE の「送る相手を選ぶ」画面を直接開く（スマホは LINE アプリ、パソコンは LINE の Web）
export function lineShareUrl(text: string, url: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(`${text}\n${url}`)}`
}

// QR の点を SVG の path にする（画面に出す用）
export function qrPath(text: string): { size: number; d: string } {
  const { size, data } = encode(text, { ecc: 'M', border: 2 })
  let d = ''
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (data[y][x]) d += `M${x} ${y}h1v1h-1z`
  return { size, d }
}

function drawQr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number) {
  const { size, data } = encode(text, { ecc: 'M', border: 2 })
  const m = w / size
  ctx.fillStyle = '#fff'
  ctx.fillRect(x, y, w, w)
  ctx.fillStyle = '#000'
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) if (data[r][c]) ctx.fillRect(Math.floor(x + c * m), Math.floor(y + r * m), Math.ceil(m), Math.ceil(m))
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Instagram のストーリーなどに載せる縦長の画像（1080×1920）。QR と URL 入り
export async function makeInviteCard(): Promise<File> {
  const W = 1080
  const H = 1920
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#2b4c7e'
  ctx.fillRect(0, 0, W, H)
  const font = '"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif'
  ctx.textAlign = 'center'
  try {
    const icon = await loadImage('./pwa-512x512.png')
    ctx.drawImage(icon, W / 2 - 130, 190, 260, 260)
  } catch {
    // アイコンが読めなくても画像は作る
  }
  ctx.fillStyle = '#fff'
  ctx.font = `800 150px ${font}`
  ctx.fillText(ABOUT.appName, W / 2, 640)
  ctx.font = `700 56px ${font}`
  ctx.fillText('「前回なに食べた？」が', W / 2, 770)
  ctx.fillText('すぐ分かる外食記録', W / 2, 850)
  const qw = 640
  const qx = (W - qw) / 2
  const qy = 960
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.roundRect(qx - 40, qy - 40, qw + 80, qw + 80, 40)
  ctx.fill()
  drawQr(ctx, inviteUrl(), qx, qy, qw)
  ctx.fillStyle = '#fff'
  ctx.font = `700 46px ${font}`
  ctx.fillText('カメラで読み取って開く', W / 2, 1760)
  ctx.font = `500 34px ${font}`
  ctx.fillText('無料・登録なし', W / 2, 1830)
  const blob = await new Promise<Blob>((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を作れません'))), 'image/png'))
  return new File([blob], 'shokureki-invite.png', { type: 'image/png' })
}
