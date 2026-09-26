// LINE や Instagram にリンクを貼ったときに出る絵（OGP 1200×630）を作る。node tools/make-og.mjs
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const icon = readFileSync('public/favicon.svg', 'utf8').replace('<svg ', '<svg x="110" y="135" width="360" height="360" ')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#2b4c7e"/>
  ${icon}
  <g font-family="Yu Gothic, Meiryo, sans-serif" fill="#fff">
    <text x="540" y="290" font-size="130" font-weight="800">食歴</text>
    <text x="540" y="380" font-size="44" font-weight="700">「前回なに食べた？」が</text>
    <text x="540" y="440" font-size="44" font-weight="700">すぐ分かる外食記録</text>
    <text x="540" y="510" font-size="30" opacity="0.85">無料・登録なし・ホーム画面に追加して使う</text>
  </g>
</svg>`
await sharp(Buffer.from(svg)).png().toFile('public/og.png')
console.log('public/og.png')
