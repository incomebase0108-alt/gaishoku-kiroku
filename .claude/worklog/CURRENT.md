# Claude ワークログ — 直近の作業の流れ

> このファイルは「常時読む記憶」です。**小さく保ってください**。
> 古い記録は `/worklog` スキルが `archive/` に圧縮移動します。
> 新しいエントリは**この見出しの直下**（新しい順）に追記します。

---

## 2026-09-26 07:40 — INCOMEBASE04 — main
- やったこと: 外食記録PWAのMVPを完成・公開（https://incomebase0108-alt.github.io/gaishoku-kiroku/）。Vite+React+TS+Dexie(IndexedDB)。店/訪問/複数料理/写真/評価/前回カード/店の詳細/履歴/検索/編集削除/zipバックアップ。
- 確認: `npm test` 20件（わざと壊して落ちるのを確認済み）、`npm run e2e` 21件（Edgeをスマホ幅で通し操作・公開URLでも21/21）。
- 決めたこと: 配布はPWA（App Storeなし）。リポジトリ公開・main push で Actions が Pages へ配信。
- 未確認: 実機（iPhone Safari / Android Chrome）での撮影・ホーム画面追加・圏外起動。
- 次の一手: 実機で試してもらい、使いにくい所を直す。Phase 2（GPS店候補・OCR等）は services/ に足す。

## 2026-09-26 07:12 — INCOMEBASE04 — main
- やったこと: プロジェクト「gaishoku-kiroku」を新規作成し、ワークログ一式を展開。
- 次の一手: 最初の作業を始め、区切りで `/worklog` を実行して記録する。
