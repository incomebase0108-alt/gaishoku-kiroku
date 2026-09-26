import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { listenInstallPrompt } from './lib/install'
import './styles.css'

// 新しい版を配ったら、次にアプリを開いたとき（裏から戻ったときも）に確かめ、
// 届いたらその場で読み込み直す。入力途中の記録は DB に保存してあるので消えない。
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => {
      if (navigator.onLine) void reg.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
    setInterval(check, 60 * 60 * 1000)
  },
})

listenInstallPrompt()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
