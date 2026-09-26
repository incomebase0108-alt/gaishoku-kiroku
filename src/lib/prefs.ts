// 端末ごとのちょっとした覚え書き（消えても困らないものだけ）。記録そのものは DB に置く。
function get(k: string): string | null {
  try {
    return localStorage.getItem(`gk:${k}`)
  } catch {
    return null
  }
}
function set(k: string, v: string): void {
  try {
    localStorage.setItem(`gk:${k}`, v)
  } catch {
    // 使えない環境（プライベートモードなど）では覚えないだけ
  }
}

export const prefs = {
  lastBackupAt: (): number | null => Number(get('lastBackupAt')) || null,
  setLastBackupAt: (t: number) => set('lastBackupAt', String(t)),
  installHintHidden: () => get('installHintHidden') === '1',
  hideInstallHint: () => set('installHintHidden', '1'),
  backupHintSnoozedUntil: (): number => Number(get('backupSnooze')) || 0,
  snoozeBackupHint: (until: number) => set('backupSnooze', String(until)),
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// LINE・Instagram・Facebook などのアプリの中のブラウザ（ここではホーム画面に追加できず、記録もそのアプリの中に残る）
export function inAppBrowser(): 'line' | 'instagram' | 'facebook' | null {
  const ua = navigator.userAgent
  if (/ Line\//i.test(ua)) return 'line'
  if (/Instagram/i.test(ua)) return 'instagram'
  if (/FBAN|FBAV/i.test(ua)) return 'facebook'
  return null
}
