# 外食きろく

外食の「いつ・どの店で・何を食べて・どうだったか」を写真付きで記録し、同じ店に行ったとき「前回なに食べた？」がすぐ分かるスマホ用アプリ（PWA）。

- 使う人は URL を開いて「ホーム画面に追加」するだけ（iPhone / Android）
- 記録と写真は各自のスマホの中（IndexedDB）にだけ保存される。サーバーは無い
- 機種変更は 設定 → バックアップ（zip）で移す

## 開発

```
npm install
npm run dev        # 手元で動かす
npm test           # データ層のテスト（Vitest + fake-indexeddb）
npm run build
npx vite preview --port 4173 & npm run e2e   # Edge をスマホの大きさにして通しで操作
```

main に push すると GitHub Actions がテスト→ビルド→GitHub Pages へ配信する。

## 構成

| 場所 | 役割 |
|---|---|
| `src/domain/` | 型と選択肢（量・価格感・また食べたい・ジャンル）。表示名はここだけ |
| `src/db/db.ts` | IndexedDB（Dexie）のテーブル定義。列を足すときは version を上げる |
| `src/repositories/` | 読み書きはここだけ（保存・前回履歴・店の集計・検索・下書き） |
| `src/services/` | 写真の縮小、バックアップの zip |
| `src/screens/` `src/components/` | 画面 |

Phase 2（AI料理認識・レシートOCR・GPS店舗候補・自動ジャンル・クラウド同期・SNS）は `services/` に足す。
データは UUID と updated_at を持っているので、同期を後から足せる。
