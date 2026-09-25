import { useEffect, useRef } from 'react'
import { usePhotoUrl } from '../hooks/usePhotoUrl'

function Slide({ fileId }: { fileId: string }) {
  const url = usePhotoUrl(fileId, 'full')
  return <div>{url && <img src={url} alt="" />}</div>
}

// 写真を画面いっぱいに出す。左右にめくれる
export function PhotoViewer({ fileIds, start, onClose }: { fileIds: string[]; start: number; onClose: () => void }) {
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = strip.current
    if (el) el.scrollLeft = start * el.clientWidth
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [start, onClose])
  return (
    <div className="viewer" role="dialog" aria-label="写真">
      <div className="viewer-strip" ref={strip} onClick={onClose}>
        {fileIds.map((id) => (
          <Slide key={id} fileId={id} />
        ))}
      </div>
      <button type="button" className="viewer-close" aria-label="閉じる" onClick={onClose}>
        ×
      </button>
      {fileIds.length > 1 && <div className="viewer-count">{fileIds.length}枚（左右にめくれます）</div>}
    </div>
  )
}
