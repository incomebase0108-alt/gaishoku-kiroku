// JPEG の絵をページにして PDF を作る（1ページ＝1枚の絵、A4縦）。
// 日本語の字を PDF に埋め込むと重くなるので、字も絵として描いてから綴じる。

export interface PdfPage {
  jpeg: Uint8Array
  width: number // 絵の画素数
  height: number
}

const A4_W = 595.28
const A4_H = 841.89

function utf16Hex(s: string): string {
  let h = 'FEFF'
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (c > 0xffff) {
      const v = c - 0x10000
      h += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0')
    } else {
      h += c.toString(16).padStart(4, '0')
    }
  }
  return `<${h.toUpperCase()}>`
}

export function buildPdf(pages: PdfPage[], title = ''): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = [] // オブジェクト番号 → 位置
  let pos = 0
  const push = (x: string | Uint8Array) => {
    const u = typeof x === 'string' ? enc.encode(x) : x
    chunks.push(u)
    pos += u.byteLength
  }
  const obj = (n: number, body: string) => {
    offsets[n] = pos
    push(`${n} 0 obj\n${body}\nendobj\n`)
  }

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  // 1:カタログ 2:ページ一覧 3:情報 以降は1ページにつき3つ（ページ・中身・絵）
  const pageNo = (i: number) => 4 + i * 3
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageNo(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  obj(3, `<< /Title ${utf16Hex(title)} /Producer (shokureki) >>`)
  pages.forEach((p, i) => {
    const n = pageNo(i)
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`)
    const content = `q ${A4_W} 0 0 ${A4_H} 0 0 cm /Im0 Do Q`
    obj(n + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    offsets[n + 2] = pos
    push(
      `${n + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.byteLength} >>\nstream\n`,
    )
    push(p.jpeg)
    push('\nendstream\nendobj\n')
  })
  const count = 4 + pages.length * 3
  const xref = pos
  let x = `xref\n0 ${count}\n0000000000 65535 f \n`
  for (let n = 1; n < count; n++) x += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  push(x)
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(pos)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.byteLength
  }
  return out
}
