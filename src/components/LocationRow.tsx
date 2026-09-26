import { useEffect, useRef, useState } from 'react'
import { getCurrentPosition, hasLocation, locationGranted, LocationError, lookupCity, mapLink, type LatLng } from '../services/location'

// 記録の画面の「店の位置」。取れたら市が空のときだけ市も入れる
export function LocationRow({
  value,
  city,
  auto,
  onChange,
  onCity,
}: {
  value: { latitude: number | null; longitude: number | null }
  city: string
  auto: boolean // 位置情報を許可済みなら、押さなくても取る
  onChange: (p: LatLng) => void
  onCity: (city: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tried = useRef(false)
  const cityRef = useRef(city)
  cityRef.current = city

  const locate = async () => {
    setBusy(true)
    setError(null)
    try {
      const p = await getCurrentPosition()
      onChange(p)
      if (!cityRef.current) {
        const c = await lookupCity(p)
        if (c && !cityRef.current) onCity(c)
      }
    } catch (e) {
      setError(e instanceof LocationError ? e.message : '今いる場所が分かりませんでした')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!auto || tried.current || hasLocation(value)) return
    tried.current = true
    locationGranted().then((ok) => {
      if (ok) void locate()
    })
    // locate は毎回作り直されるが、ここでは最初の1回だけ動かす
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto])

  return (
    <div className="loc-row">
      {hasLocation(value) ? (
        <>
          <span className="tag">📍 位置あり</span>
          <a className="toggle-link" href={mapLink(value)} target="_blank" rel="noreferrer">
            地図で見る
          </a>
          <button type="button" className="toggle-link" onClick={locate} disabled={busy}>
            {busy ? '調べています…' : '今いる場所で取り直す'}
          </button>
        </>
      ) : (
        <button type="button" className="toggle-link" onClick={locate} disabled={busy}>
          {busy ? '📍 今いる場所を調べています…' : '📍 今いる場所を店の位置にする'}
        </button>
      )}
      {error && <div className="small" style={{ color: 'var(--danger)' }}>{error}</div>}
    </div>
  )
}
