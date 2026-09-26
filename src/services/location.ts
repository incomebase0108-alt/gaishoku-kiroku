// 店の位置。スマホの位置情報で「今いる場所」を取り、市も住所から調べる。

export interface LatLng {
  latitude: number
  longitude: number
}

export class LocationError extends Error {}

export function getCurrentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new LocationError('このブラウザでは位置情報が使えません'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: round(p.coords.latitude), longitude: round(p.coords.longitude) }),
      (e) =>
        reject(
          new LocationError(
            e.code === e.PERMISSION_DENIED
              ? '位置情報が許可されていません。スマホの設定で、ブラウザ（またはこのアプリ）の位置情報を許可してください'
              : '今いる場所が分かりませんでした。屋外や窓の近くでもう一度試してください',
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  })
}

// 小数6桁（約10cm）で十分
function round(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

// 位置情報をすでに許可しているか（許可済みなら、ボタンを押さなくても取ってよい）
export async function locationGranted(): Promise<boolean> {
  try {
    const s = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
    return s?.state === 'granted'
  } catch {
    return false
  }
}

// 位置から市を調べる（OpenStreetMap の住所検索。失敗しても記録は続けられるので null を返す）
export async function lookupCity(p: LatLng): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=ja&lat=${p.latitude}&lon=${p.longitude}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const a = (await res.json())?.address ?? {}
    const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null
    return typeof city === 'string' && city ? city : null
  } catch {
    return null
  }
}

// 地図アプリで開く（iPhone でも Android でも Google マップの Web かアプリが開く）
export function mapLink(p: LatLng, name = ''): string {
  const q = name ? `${name} ${p.latitude},${p.longitude}` : `${p.latitude},${p.longitude}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

// 画面に埋め込む小さな地図（OpenStreetMap）
export function mapEmbed(p: LatLng): string {
  const d = 0.004
  const bbox = [p.longitude - d, p.latitude - d, p.longitude + d, p.latitude + d].join(',')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.latitude},${p.longitude}`
}

export function hasLocation(r: { latitude: number | null; longitude: number | null }): r is LatLng {
  return r.latitude != null && r.longitude != null
}
