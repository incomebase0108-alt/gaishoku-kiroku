/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// 相対パスで出力し、GitHub Pages の /gaishoku-kiroku/ でも手元でも同じ build が動くようにする
// 版＝作った日時（日本時間）。設定の画面に出して、スマホに新しい版が届いたかを見分ける
const d = new Date(Date.now() + 9 * 3600 * 1000)
const VERSION = `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 新しい版はすぐ使い始め（skipWaiting）、開いているページもすぐ管理下に入れる（clientsClaim）
      workbox: { skipWaiting: true, clientsClaim: true, cleanupOutdatedCaches: true },
      injectRegister: false, // 登録は src/main.tsx で行う（戻ってきたときに新しい版を確かめるため）
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: '食歴',
        short_name: '食歴',
        description: '外食の「前回なに食べた？」がすぐ分かる記録アプリ',
        lang: 'ja',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f3f5f8',
        theme_color: '#2b4c7e',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
    include: ['tests/**/*.test.ts'],
  },
})
