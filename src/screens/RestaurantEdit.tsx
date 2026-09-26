import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TopBar } from '../components/ui'
import { GENRES } from '../domain/enums'
import { getCurrentPosition, hasLocation, LocationError, mapLink } from '../services/location'
import { deleteRestaurant, getRestaurant, updateRestaurant, usedCities } from '../repositories/restaurantRepo'

export function RestaurantEdit() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const r = useLiveQuery(() => getRestaurant(id), [id])
  const cities = useLiveQuery(usedCities, [])
  const [form, setForm] = useState({ name: '', genre: '', city: '', address: '', memo: '' })
  const [loaded, setLoaded] = useState(false)
  const [locBusy, setLocBusy] = useState(false)
  const [locMsg, setLocMsg] = useState<string | null>(null)

  useEffect(() => {
    if (r && !loaded) {
      setForm({ name: r.name, genre: r.genre, city: r.city ?? '', address: r.address, memo: r.memo })
      setLoaded(true)
    }
  }, [r, loaded])

  if (!r) return <div className="page" />

  const save = async () => {
    if (!form.name.trim()) return
    await updateRestaurant(id, { name: form.name.trim(), genre: form.genre, city: form.city.trim(), address: form.address.trim(), memo: form.memo.trim() })
    nav(-1)
  }

  // 位置はその場で保存する（店にいるときに押す想定）
  const setHere = async () => {
    setLocBusy(true)
    setLocMsg(null)
    try {
      const p = await getCurrentPosition()
      await updateRestaurant(id, p)
      setLocMsg('今いる場所を店の位置にしました')
    } catch (e) {
      setLocMsg(e instanceof LocationError ? e.message : '今いる場所が分かりませんでした')
    } finally {
      setLocBusy(false)
    }
  }

  const clearLoc = async () => {
    if (!window.confirm('店の位置を消しますか？')) return
    await updateRestaurant(id, { latitude: null, longitude: null })
    setLocMsg('店の位置を消しました')
  }

  const remove = async () => {
    if (!window.confirm(`「${r.name}」と、この店の記録・写真をすべて消します。元に戻せません。よろしいですか？`)) return
    await deleteRestaurant(id)
    nav('/', { replace: true })
  }

  return (
    <div className="page">
      <TopBar title="店の情報" />
      <div className="field">
        <label htmlFor="r-name">店名</label>
        <input id="r-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="field">
        <span className="label">ジャンル</span>
        <div className="chips">
          {[...new Set([...GENRES, ...(form.genre ? [form.genre] : [])])].map((g) => (
            <button key={g} type="button" className="chip" aria-pressed={form.genre === g} onClick={() => setForm({ ...form, genre: form.genre === g ? '' : g })}>
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="r-city">市（〇〇市・〇〇区など）</label>
        <input id="r-city" className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="例：名古屋市" list="r-city-list" autoComplete="off" />
        <datalist id="r-city-list">
          {(cities ?? []).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="field">
        <span className="label">店の位置（地図）</span>
        {hasLocation(r) ? (
          <div className="loc-row">
            <a className="toggle-link" href={mapLink(r, r.name)} target="_blank" rel="noreferrer">
              📍 地図で見る
            </a>
            <button type="button" className="toggle-link" onClick={setHere} disabled={locBusy}>
              今いる場所で取り直す
            </button>
            <button type="button" className="toggle-link" style={{ color: 'var(--danger)' }} onClick={clearLoc}>
              位置を消す
            </button>
          </div>
        ) : (
          <button type="button" className="btn block" onClick={setHere} disabled={locBusy}>
            {locBusy ? '今いる場所を調べています…' : '📍 今いる場所を店の位置にする'}
          </button>
        )}
        {locMsg && <div className="small" style={{ marginTop: 4 }}>{locMsg}</div>}
      </div>
      <div className="field">
        <label htmlFor="r-addr">場所（任意）</label>
        <input id="r-addr" className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="例：駅前、〇〇モール3階" />
      </div>
      <div className="field">
        <label htmlFor="r-memo">店のメモ（任意）</label>
        <textarea id="r-memo" className="input" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="例：水曜定休。カード使えない" />
      </div>
      <div className="spacer" />
      <button type="button" className="btn danger block" onClick={remove}>
        この店を記録ごと消す
      </button>
      <div className="sticky-action">
        <div>
          <button type="button" className="btn primary big" onClick={save} disabled={!form.name.trim()}>
            保存する
          </button>
        </div>
      </div>
    </div>
  )
}
