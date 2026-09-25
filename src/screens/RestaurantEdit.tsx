import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TopBar } from '../components/ui'
import { GENRES } from '../domain/enums'
import { deleteRestaurant, getRestaurant, updateRestaurant } from '../repositories/restaurantRepo'

export function RestaurantEdit() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const r = useLiveQuery(() => getRestaurant(id), [id])
  const [form, setForm] = useState({ name: '', genre: '', address: '', memo: '' })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (r && !loaded) {
      setForm({ name: r.name, genre: r.genre, address: r.address, memo: r.memo })
      setLoaded(true)
    }
  }, [r, loaded])

  if (!r) return <div className="page" />

  const save = async () => {
    if (!form.name.trim()) return
    await updateRestaurant(id, { name: form.name.trim(), genre: form.genre, address: form.address.trim(), memo: form.memo.trim() })
    nav(-1)
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
