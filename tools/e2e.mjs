// 実際のブラウザ（Edge）をスマホの大きさにして、記録→前回履歴→検索→編集→バックアップ→別の端末で戻す を通す。
// 使い方: npm run build のあと npx vite preview --port 4173 を別に起動してから node tools/e2e.mjs
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:4173/'
const OUT = process.env.OUT ?? '.shots'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PHOTO = 'public/pwa-512x512.png'
mkdirSync(OUT, { recursive: true })

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'OK ' : 'NG '} ${name}${extra ? '  ' + extra : ''}`)
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  acceptDownloads: true,
  locale: 'ja-JP',
}

async function newPage(ctx) {
  const page = await ctx.newPage()
  page.errors = []
  page.on('pageerror', (e) => page.errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()))
  page.on('dialog', (d) => d.accept())
  return page
}
const shot = (page, name, full = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full })
async function addPhoto(page, button) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button.click()])
  const el = chooser.element()
  const how = { capture: await el.getAttribute('capture'), multiple: chooser.isMultiple() }
  await chooser.setFiles(PHOTO)
  return how
}
const card = (page, n) => page.locator('.dish-card').nth(n)

// 外に出ない準備：住所検索は決まった答え、地図は空、共有メニューは送った中身を記録するだけ
const NAGOYA = { latitude: 35.170915, longitude: 136.881537 }
async function prepare(ctx) {
  await ctx.route(/nominatim\.openstreetmap\.org/, (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ address: { city: '名古屋市', province: '愛知県' } }) }),
  )
  await ctx.route(/openstreetmap\.org\/export/, (r) => r.fulfill({ contentType: 'text/html', body: '<html><body>map</body></html>' }))
  await ctx.addInitScript(() => {
    navigator.share = async (d) => {
      window.__shared = { title: d.title, text: d.text, url: d.url }
    }
    navigator.canShare = () => false // ファイルはダウンロードで受け取る
  })
}

// ---- 1台目 ----
const ctx = await browser.newContext({ ...phone, permissions: ['geolocation'], geolocation: NAGOYA })
await prepare(ctx)
const page = await newPage(ctx)
await page.goto(BASE)
await page.getByText('まだ記録がありません').waitFor()
check('アプリ名が「食歴」', (await page.title()) === '食歴' && (await page.locator('.brand').innerText()) === '食歴')
await shot(page, '01-home-empty')

await page.getByRole('link', { name: '今日の食事を記録' }).first().click()
await page.locator('#store-q').fill('麺屋 一')
await page.getByRole('button', { name: '「麺屋 一」を新しい店として記録' }).click()
await page.waitForURL(/record\/form/)
await page.getByRole('button', { name: 'ラーメン', exact: true }).click()
await page.getByText('📍 位置あり').waitFor()
await page.locator('.store-head + div .tag', { hasText: '名古屋市' }).waitFor()
check('位置を許可済みなら、押さなくても位置と市が入る', true)

const cam = await addPhoto(page, card(page, 0).getByRole('button', { name: 'カメラで撮る' }))
check('「カメラで撮る」はすぐカメラが起動する指定（capture=environment）', cam.capture === 'environment' && !cam.multiple, JSON.stringify(cam))
await card(page, 0).locator('.photo-strip img').first().waitFor()
const lib = await addPhoto(page, card(page, 0).getByRole('button', { name: '写真から追加する' }))
check('「選ぶ」は写真・コレクションから（capture なし・複数可）', lib.capture === null && lib.multiple, JSON.stringify(lib))
await card(page, 0).locator('.photo-strip img').nth(1).waitFor()
await card(page, 0).getByRole('button', { name: 'この写真を外す' }).nth(1).click()
await card(page, 0).getByLabel('品名').fill('醤油ラーメン')
await card(page, 0).getByRole('radio', { name: '★4' }).click()
await card(page, 0).getByRole('button', { name: 'ちょうどいい' }).click()
await card(page, 0).getByRole('button', { name: '妥当' }).click()
await card(page, 0).getByRole('button', { name: '絶対食べる' }).click()
await card(page, 0).getByLabel('この料理の金額').fill('900')

await page.getByRole('button', { name: '＋ 料理を追加' }).click()
await card(page, 1).getByLabel('品名').fill('餃子')
await card(page, 1).getByRole('radio', { name: '★3' }).click()
await card(page, 1).getByRole('button', { name: '少ない' }).click()
await card(page, 1).getByRole('button', { name: '高い' }).click()
await card(page, 1).getByRole('button', { name: 'なし' }).click()
await card(page, 1).getByLabel('この料理の金額').fill('４５０')

await page.getByRole('radiogroup', { name: '総合評価' }).getByRole('radio', { name: '★4' }).click()
await page.getByRole('button', { name: /料理の合計/ }).click()
check('会計に料理の合計（全角数字も）が入る', (await page.locator('#total').inputValue()) === '1350')
await addPhoto(page, page.getByRole('button', { name: 'レシート' }))
await page.locator('.photo-strip .kind', { hasText: 'レシート' }).waitFor()

// 入力途中で再読み込みしても消えない
await page.waitForTimeout(500)
await page.reload()
await card(page, 1).getByLabel('品名').waitFor()
check(
  '再読み込みしても入力途中が残る（写真も）',
  (await card(page, 1).getByLabel('品名').inputValue()) === '餃子' && (await card(page, 0).locator('.photo-strip img').count()) === 1,
)
await shot(page, '02-form', true)

await page.getByRole('button', { name: '保存する' }).click()
await page.waitForURL(/#\/restaurant\//)
await page.locator('.last').waitFor()
await page.waitForTimeout(300)
await shot(page, '03-store-after-first')
await shot(page, '03-store-after-first-full', true)
const lastText = await page.locator('.last').innerText()
check('店の詳細に前回カード（料理2品・金額）', lastText.includes('醤油ラーメン') && lastText.includes('餃子') && lastText.includes('¥1,350'))
check('行った回数 1回', (await page.locator('.stat').first().innerText()).includes('1回'))

// ---- 同じ店で2回目：記録画面に前回が出る ----
await page.getByRole('button', { name: 'この店で記録する' }).click()
await page.waitForURL(/record\/form/)
await page.locator('.last').waitFor()
await page.waitForTimeout(300)
await shot(page, '04-form-with-last')
check('記録画面の上に前回カードが出る', (await page.locator('.last-head').innerText()).includes('前回'))
await page.locator('.last-dish', { hasText: '醤油ラーメン' }).getByRole('button', { name: '今回も' }).click()
check(
  '「今回も」で品名と金額が写る',
  (await card(page, 0).getByLabel('品名').inputValue()) === '醤油ラーメン' &&
    (await card(page, 0).getByLabel('この料理の金額').inputValue()) === '900',
)
await card(page, 0).getByRole('radio', { name: '★5' }).click()
await card(page, 0).getByRole('button', { name: '多い' }).click()
await page.getByRole('button', { name: '保存する' }).click()
await page.waitForURL(/#\/restaurant\//)
await page.locator('.last').waitFor()
await page.waitForTimeout(300)
const last2 = await page.locator('.last').innerText()
check('2回目の後は前回が2回目に変わる', last2.includes('多い') && !last2.includes('餃子'))
check('行った回数 2回', (await page.locator('.stat').first().innerText()).includes('2回'))
const sumText = await page.locator('.dish-sum', { hasText: '醤油ラーメン' }).innerText()
check('食べた料理に「醤油ラーメン 2回」', sumText.includes('2回'))

// ---- 店の位置・PDF・共有 ----
check('店の画面に地図が出る', await page.locator('iframe.map-embed').isVisible())
const maplink = await page.getByRole('link', { name: '地図アプリで開く' }).getAttribute('href')
check('地図アプリのリンクに店の位置が入る', maplink.includes('35.170915') && maplink.includes('136.881537'), maplink)

const [pdfDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '評価をPDFで送る' }).click()])
const pdfPath = `${OUT}/report.pdf`
await pdfDl.saveAs(pdfPath)
const { readFileSync, writeFileSync } = await import('node:fs')
const pdf = readFileSync(pdfPath)
check('評価のPDFができる', pdf.subarray(0, 8).toString('latin1') === '%PDF-1.4' && pdfDl.suggestedFilename().endsWith('.pdf'), `${pdfDl.suggestedFilename()} ${(pdf.length / 1024).toFixed(0)}KB`)
const pagesPng = await page.evaluate(() => window.__lastReport.map((c) => c.toDataURL('image/png')))
pagesPng.forEach((u, i) => writeFileSync(`${OUT}/report-p${i + 1}.png`, Buffer.from(u.split(',')[1], 'base64')))
check('PDFのページを描けた', pagesPng.length >= 1, `${pagesPng.length}ページ`)

await page.getByRole('button', { name: '店を送る' }).click()
await page.waitForFunction(() => window.__shared)
const shared = await page.evaluate(() => window.__shared)
check('店を送る：文面に店名・市・評価', shared.text.includes('麺屋 一（名古屋市・ラーメン）') && shared.text.includes('醤油ラーメン'), shared.text.split('\n')[0])
check('店を送る：食歴で開けるリンクが付く', shared.url.includes('#/shared?d='), `${shared.url.length}文字`)

// 受け取った人のスマホ
const ctx3 = await browser.newContext(phone)
await prepare(ctx3)
const p3 = await newPage(ctx3)
await p3.goto(shared.url)
await p3.getByRole('heading', { name: '麺屋 一' }).waitFor()
await p3.waitForTimeout(300)
await shot(p3, '12-shared-received')
check('受け取った人に店と評価が見える', (await p3.locator('.dish-sum').allInnerTexts()).join().includes('醤油ラーメン'))
await p3.getByRole('button', { name: '自分の食歴に追加' }).click()
await p3.waitForURL(/#\/restaurant\//)
await p3.getByText(/教えてもらったおすすめ/).waitFor()
check('受け取った店を自分の食歴に追加できる', (await p3.locator('.store-title').innerText()) === '麺屋 一')
const errs3 = p3.errors
await ctx3.close()

// 別の店も1つ
await ctx.clearPermissions() // 2軒目は位置なし・市は手で入れる
await page.goto(BASE + '#/record')
await page.locator('#store-q').fill('喫茶ツバメ')
await page.getByRole('button', { name: /新しい店として記録/ }).click()
await page.getByRole('button', { name: 'カフェ', exact: true }).click()
check('入れたことのある市がボタンで出る', await page.getByRole('button', { name: '名古屋市', exact: true }).isVisible())
await page.getByLabel('市を入れる').fill('豊橋市')
await page.getByRole('button', { name: '決定' }).click()
check('記録画面で市を手で入れられる', (await page.locator('.store-head + div').innerText()).includes('豊橋市'))
await card(page, 0).getByLabel('品名').fill('ナポリタン')
await card(page, 0).getByRole('button', { name: '多い' }).click()
await card(page, 0).getByRole('button', { name: 'あり' }).click()
await page.getByRole('button', { name: '保存する' }).click()
await page.waitForURL(/#\/restaurant\//)

await page.goto(BASE)
await page.locator('.item').first().waitFor()
await page.waitForTimeout(300)
await shot(page, '05-home')
check('ホームの一覧に市が出る', (await page.locator('.item', { hasText: '喫茶ツバメ' }).innerText()).includes('豊橋市'))
const homeNames = await page.locator('.item .title').allInnerTexts()
check('ホームの最近の店が新しい順', homeNames.join(',') === '喫茶ツバメ,麺屋 一', homeNames.join(','))

// 1タップで前回へ
await page.locator('.item', { hasText: '麺屋 一' }).click()
await page.locator('.last').waitFor()
check('ホームから1タップで前回が見える', await page.locator('.last').isVisible())

// ---- 検索 ----
await page.goto(BASE + '#/search?tab=dish')
await page.getByLabel('キーワード').fill('らーめん')
await page.waitForTimeout(300)
check('料理検索（ひらがなでカタカナに当たる）', (await page.locator('.item').count()) === 2)
await page.getByLabel('キーワード').fill('')
await page.getByRole('button', { name: '絞り込む' }).click()
await page.getByRole('group', { name: '量' }).getByRole('button', { name: '多い' }).click()
await page.waitForTimeout(300)
const dishHits = await page.locator('.item .title').allInnerTexts()
check('料理を量「多い」で絞る', dishHits.join(',') === 'ナポリタン,醤油ラーメン', dishHits.join(','))
await shot(page, '06-search-dish', true)
await page.getByRole('button', { name: '店から' }).click()
await page.waitForTimeout(300)
const storeHits = await page.locator('.item .title').allInnerTexts()
check('店タブでも同じ条件が効く', storeHits.join(',') === '喫茶ツバメ,麺屋 一', storeHits.join(','))
await page.getByRole('group', { name: 'また食べたい' }).getByRole('button', { name: 'なし' }).click()
await page.getByRole('group', { name: '量' }).getByRole('button', { name: '多い' }).click()
await page.waitForTimeout(300)
check('店を「また食べたい：なし」で絞る', (await page.locator('.item .title').allInnerTexts()).join(',') === '麺屋 一')
await page.getByRole('button', { name: '条件をクリア' }).click()
await page.getByRole('group', { name: '市' }).getByRole('button', { name: '豊橋市' }).click()
await page.waitForTimeout(300)
check('市のボタンで絞り込める', (await page.locator('.item .title').allInnerTexts()).join(',') === '喫茶ツバメ')
await page.getByRole('group', { name: '市' }).getByRole('button', { name: '豊橋市' }).click()
await page.getByLabel('キーワード').fill('名古屋')
await page.waitForTimeout(300)
check('キーワード「名古屋」で名古屋市の店が出る', (await page.locator('.item .title').allInnerTexts()).join(',') === '麺屋 一')
await shot(page, '06b-search-city')
await page.goto(BASE + '#/record')
await page.locator('#store-q').fill('麺屋 一')
check('同じ名前の店があっても「別の店舗」として記録できる', await page.getByRole('button', { name: /別の店舗/ }).isVisible())

// ---- 過去の記録を直す ----
await page.goto(BASE + '#/history')
await page.locator('.item', { hasText: '麺屋 一' }).last().click()
await page.getByRole('button', { name: '直す' }).click()
await page.waitForURL(/record\/form/)
await card(page, 1).getByLabel('品名').fill('焼き餃子')
await page.getByRole('button', { name: '直した内容を保存' }).click()
await page.waitForURL(/#\/visit\//)
await page.locator('.dish-full').first().waitFor()
check('過去の記録を直せる', (await page.locator('.dish-full').allInnerTexts()).join().includes('焼き餃子'))
await shot(page, '07-visit-detail')

// ---- バックアップ ----
await page.goto(BASE + '#/settings')
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'バックアップを作って保存する' }).click(),
])
const zipPath = `${OUT}/backup.zip`
await download.saveAs(zipPath)
await page.getByText(/バックアップを作りました/).waitFor()
check('バックアップを書き出せる', true, await page.getByText(/バックアップを作りました/).innerText())
await shot(page, '08-settings')
check('設定に制作会社が出る', await page.getByText('制作：合同会社インカムベース').isVisible())
const errs1 = page.errors
await ctx.close()

// ---- 新しいスマホで戻す ----
const ctx2 = await browser.newContext(phone)
await prepare(ctx2)
const p2 = await newPage(ctx2)
await p2.goto(BASE + '#/settings')
const [chooser] = await Promise.all([
  p2.waitForEvent('filechooser'),
  p2.getByRole('button', { name: 'バックアップから戻す' }).click(),
])
await chooser.setFiles(zipPath)
await p2.getByRole('button', { name: '読み込む' }).click()
await p2.getByText(/読み込みました/).waitFor()
check('新しい端末でバックアップを読み込める', true, await p2.getByText(/読み込みました/).innerText())
await p2.goto(BASE)
await p2.locator('.item', { hasText: '麺屋 一' }).click()
await p2.locator('.grid-photos img').first().waitFor()
const imgOk = (await p2.locator('.grid-photos img').evaluateAll((l) => l.map((i) => i.complete && i.naturalWidth > 0))).every(Boolean) && (await p2.locator('.grid-photos img').count()) === 2
check('戻した後も写真が表示される', imgOk)
await p2.locator('.dish-sum').first().waitFor()
check('戻した後も直した内容が残る', (await p2.locator('.dish-sum').allInnerTexts()).join().includes('焼き餃子'))
await p2.waitForTimeout(300)
await shot(p2, '09-restored-store')

check('ブラウザのエラーなし', errs1.length + p2.errors.length + errs3.length === 0, [...errs1, ...p2.errors, ...errs3].join(' | '))
await browser.close()
const ng = results.filter((r) => !r.ok).length
console.log(`\n${results.length - ng}/${results.length} OK`)
process.exit(ng ? 1 : 0)
