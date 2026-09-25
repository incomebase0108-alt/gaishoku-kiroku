import { useEffect, useState } from 'react'
import { db } from '../db/db'

// 保存済みの写真（photoFiles のキー）を <img> で出せる URL にする
export function usePhotoUrl(fileId: string | null | undefined, size: 'thumb' | 'full' = 'thumb'): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!fileId) {
      setUrl(null)
      return
    }
    let alive = true
    let made: string | null = null
    db.photoFiles.get(fileId).then((f) => {
      if (!alive || !f) return
      made = URL.createObjectURL(new Blob([size === 'full' ? f.full : f.thumb], { type: f.mime }))
      setUrl(made)
    })
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [fileId, size])
  return url
}

// 入力中（まだ保存していない）写真の URL
export function useBufferUrl(buf: ArrayBuffer | null, mime = 'image/jpeg'): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!buf) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(new Blob([buf], { type: mime }))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [buf, mime])
  return url
}
