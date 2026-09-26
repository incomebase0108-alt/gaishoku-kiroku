import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Stars, TopBar, WantStamp } from '../components/ui'
import { AMOUNTS, PRICE_FEELS, labelOf } from '../domain/enums'
import { fmtDate } from '../lib/util'
import { hasLocation, mapEmbed, mapLink } from '../services/location'
import { addSharedStore, decodeShared } from '../services/share'

// 友だちから送られてきた店を見る画面。「自分の食歴に追加」で店を足せる
export function SharedStore() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [s] = useState(() => decodeShared(params.get('d') ?? ''))
  const [adding, setAdding] = useState(false)

  if (!s) {
    return (
      <div className="page no-sticky">
        <TopBar title="送られてきた店" />
        <div className="card empty">
          <p>このリンクは開けませんでした。送ってくれた人に、もう一度送ってもらってください。</p>
          <Link className="btn" to="/">
            ホームへ
          </Link>
        </div>
      </div>
    )
  }

  const add = async () => {
    setAdding(true)
    const id = await addSharedStore(s)
    nav(`/restaurant/${id}`, { replace: true, state: { toast: '自分の食歴に追加しました' } })
  }

  return (
    <div className="page">
      <TopBar title="送られてきた店" />
      <h1 className="store-title">{s.name}</h1>
      <div className="meta">
        {s.genre && <span className="tag">{s.genre}</span>}
        {s.city && <span>{s.city}</span>}
        {s.visits > 0 && <span>送った人は{s.visits}回行っています</span>}
        {s.lastAt && <span>最後は{fmtDate(s.lastAt)}</span>}
      </div>
      {s.overall != null && (
        <div style={{ marginTop: 8 }}>
          <span className="label">送った人の総合評価（前回）</span>
          <Stars value={s.overall} label="総合" />
        </div>
      )}

      {hasLocation(s) && (
        <div style={{ marginTop: 12 }}>
          <iframe className="map-embed" title={`${s.name}の地図`} src={mapEmbed(s)} loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups" />
          <a className="btn block" style={{ marginTop: 8 }} href={mapLink(s, s.name)} target="_blank" rel="noreferrer">
            地図アプリで開く
          </a>
        </div>
      )}

      {s.dishes.length > 0 && (
        <>
          <h2 className="sec">送った人の評価</h2>
          <div className="card">
            {s.dishes.map((d, i) => (
              <div key={i} className="dish-sum">
                <div className="b">
                  <div className="n">
                    {d.name}
                    {d.count > 1 && <span className="count">{d.count}回</span>}
                  </div>
                  <div className="d-meta">
                    {d.taste != null && (
                      <span>
                        味 <Stars value={d.taste} small label="味" />
                      </span>
                    )}
                    {d.amount && <span>量：{labelOf(AMOUNTS, d.amount)}</span>}
                    {d.price && <span>{labelOf(PRICE_FEELS, d.price)}</span>}
                  </div>
                </div>
                <WantStamp value={d.want} small />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="sticky-action">
        <div>
          <button type="button" className="btn primary big" onClick={add} disabled={adding}>
            自分の食歴に追加
          </button>
        </div>
      </div>
    </div>
  )
}
