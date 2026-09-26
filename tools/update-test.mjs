// スマホに新しい版が届くかの確認：古い版で開く → 新しい版を配る → 画面に戻る → 自動で新しい版になるか。
// 使い方: node tools/update-test.mjs（ビルドを2回して、手元に配信して確かめる）
import { chromium } from 'playwright-core'
import { execSync, spawn } from 'node:child_process'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 4174
const URL_ = `http://localhost:${PORT}/`

const build = () => execSync('npx vite build', { stdio: 'ignore' })
function serve() {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' })
  return p
}
function stop(p) {
  try {
    execSync(`taskkill /PID ${p.pid} /T /F`, { stdio: 'ignore' })
  } catch {
    // すでに止まっている
  }
}
async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(URL_)).ok) return
    } catch {
      // まだ起動中
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('配信が起動しない')
}
const version = (page) => page.getByTestId('app-version').innerText()

build()
let server = serve()
await waitUp()
const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
await page.goto(URL_ + '#/settings')
await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20000 })
const v1 = await version(page)
console.log('古い版:', v1)

// 新しい版を配る（版の時刻が変わるよう1秒以上あける）
stop(server)
await new Promise((r) => setTimeout(r, 1500))
build()
server = serve()
await waitUp()

// 圏外にしてから開き直しても、古い版はちゃんと動く（のちに確認）→ まずは「画面に戻った」合図だけ送る
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
let v2 = v1
for (let i = 0; i < 80 && v2 === v1; i++) {
  await new Promise((r) => setTimeout(r, 250))
  try {
    v2 = await version(page)
  } catch {
    // 読み込み直しの途中
  }
}
console.log('戻った後:', v2)
const ok = v2 !== v1
console.log(ok ? 'OK  画面に戻ると自動で新しい版に切り替わる' : 'NG  新しい版に切り替わらない')

// 圏外でも開けるか（アプリの中身がスマホに保存されているか）
await ctx.setOffline(true)
await page.reload()
const offline = await page.getByTestId('app-version').isVisible().catch(() => false)
console.log(offline ? 'OK  圏外でも開ける' : 'NG  圏外で開けない')

await browser.close()
stop(server)
process.exit(ok && offline ? 0 : 1)
