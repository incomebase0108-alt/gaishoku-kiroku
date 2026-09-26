// スマホの共有メニュー（LINE・メール・ファイルに保存など）でファイルを送る。
// 共有メニューが使えない環境（パソコンのブラウザなど）ではダウンロードにする。

export type ShareResult = 'shared' | 'downloaded' | 'cancelled'

export async function shareOrDownloadFile(file: File, title = file.name): Promise<ShareResult> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled'
      // それ以外の失敗はダウンロードに切り替える
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return 'downloaded'
}

// 文面とリンクを送る。共有メニューが無ければクリップボードに写す
export async function shareOrCopyText(title: string, text: string, url: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled'
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`)
    return 'copied'
  } catch {
    return 'failed'
  }
}
