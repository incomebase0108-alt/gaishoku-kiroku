// Android の Chrome などが出す「インストールできます」の合図を取っておき、
// ホームの案内から1回押すだけでインストールできるようにする（iPhone の Safari には無い）。

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

export function listenInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    listeners.forEach((f) => f())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((f) => f())
  })
}

export function canInstall(): boolean {
  return deferred != null
}

export function onInstallChange(f: () => void): () => void {
  listeners.add(f)
  return () => listeners.delete(f)
}

export async function install(): Promise<boolean> {
  if (!deferred) return false
  const e = deferred
  deferred = null
  await e.prompt()
  const { outcome } = await e.userChoice
  listeners.forEach((f) => f())
  return outcome === 'accepted'
}
