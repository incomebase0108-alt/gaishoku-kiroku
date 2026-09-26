import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { IconPlus } from '../components/icons'
import { PhotoViewer } from '../components/PhotoViewer'
import { Stars, Thumb, TopBar, WantStamp, useToast } from '../components/ui'
import { DishMeta, LastVisitCard, VisitRow } from '../components/VisitViews'
import { fmtAgo, fmtDate } from '../lib/util'
import { hasLocation, mapEmbed, mapLink } from '../services/location'
import { makeStoreReport } from '../services/report'
import { buildSharedStore, shareText, shareUrl } from '../services/share'
import { shareOrCopyText, shareOrDownloadFile } from '../services/shareFile'
import { getRestaurant, listDishSummaries } from '../repositories/restaurantRepo'
import { storeOf } from '../repositories/draftRepo'
import { listVisitsOfRestaurant } from '../repositories/visitRepo'
import { startDraft } from './RecordPick'

export function RestaurantDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const [toast, showToast] = useToast()
  const [viewer, setViewer] = useState<number | null>(null)
  const [openDish, setOpenDish] = useState<string | null>(null)
  const [sharing, setSharing] = useState<'store' | 'pdf' | null>(null)
  const restaurant = useLiveQuery(async () => (await getRestaurant(id)) ?? null, [id])
  const visits = useLiveQuery(() => listVisitsOfRestaurant(id), [id])
  const dishes = useLiveQuery(() => listDishSummaries(id), [id])

  useEffect(() => {
    const t = (loc.state as { toast?: string } | null)?.toast
    if (t) {
      showToast(t)
      nav(loc.pathname, { replace: true, state: null })
    }
  }, [loc, nav, showToast])

  if (restaurant === null) {
    return (
      <div className="page">
        <TopBar title="店が見つかりません" />
      </div>
    )
  }
  if (restaurant === undefined || visits === undefined) return <div className="page" />

  const last = visits[0] ?? null
  const photoIds = visits.flatMap((v) => v.photos.map((p) => p.image_path))

  const sendStore = async () => {
    setSharing('store')
    try {
      const s = await buildSharedStore(id)
      if (!s) return
      const res = await shareOrCopyText(`${s.name}（食歴）`, shareText(s), shareUrl(s, location.href))
      if (res === 'copied') showToast('送る文面とリンクをコピーしました')
      if (res === 'failed') showToast('送れませんでした')
    } finally {
      setSharing(null)
    }
  }

  const sendPdf = async () => {
    setSharing('pdf')
    try {
      const rep = await makeStoreReport(id)
      if (!rep) return
      ;(window as unknown as { __lastReport?: HTMLCanvasElement[] }).__lastReport = rep.pages // 確認用
      const res = await shareOrDownloadFile(rep.file, `${restaurant.name}の評価`)
      if (res === 'downloaded') showToast('PDFを保存しました')
    } catch {
      showToast('PDFを作れませんでした')
    } finally {
      setSharing(null)
    }
  }

  const record = async () => {
    if (await startDraft(storeOf(restaurant))) nav('/record/form')
  }

  return (
    <div className="page">
      <TopBar
        right={
          <Link className="link-btn" to={`/restaurant/${id}/edit`} style={{ textDecoration: 'none' }}>
            店の情報
          </Link>
        }
      />
      <h1 className="store-title">{restaurant.name}</h1>
      <div className="meta">
        {restaurant.genre && <span className="tag">{restaurant.genre}</span>}
        {restaurant.city && <span>{restaurant.city}</span>}
        {restaurant.address && <span>{restaurant.address}</span>}
      </div>
      {restaurant.memo && <p className="small pre">{restaurant.memo}</p>}
      {hasLocation(restaurant) && (
        <div style={{ marginTop: 10 }}>
          <iframe className="map-embed" title={`${restaurant.name}の地図`} src={mapEmbed(restaurant)} loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups" />
          <a className="btn block" style={{ marginTop: 8 }} href={mapLink(restaurant, restaurant.name)} target="_blank" rel="noreferrer">
            地図アプリで開く
          </a>
        </div>
      )}

      <div className="stats">
        <div className="stat">
          <small>行った回数</small>
          <b className="num">{visits.length}回</b>
        </div>
        <div className="stat">
          <small>最後に行った日</small>
          <b className="num">{last ? fmtDate(last.visit.visited_at) : '—'}</b>
          {last && <small>{fmtAgo(last.visit.visited_at)}</small>}
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <button type="button" className="btn" onClick={sendStore} disabled={sharing != null}>
          {sharing === 'store' ? '準備中…' : '店を送る'}
        </button>
        <button type="button" className="btn" onClick={sendPdf} disabled={sharing != null}>
          {sharing === 'pdf' ? 'PDFを作成中…' : '評価をPDFで送る'}
        </button>
      </div>

      {last ? <LastVisitCard detail={last} /> : <div className="card empty">まだこの店の記録はありません</div>}

      {dishes && dishes.length > 0 && (
        <>
          <h2 className="sec">この店で食べた料理</h2>
          <div className="card">
            {dishes.map((s) => (
              <div key={s.last.id}>
                <button
                  type="button"
                  className="dish-sum"
                  style={{ width: '100%', background: 'none', border: 0, textAlign: 'left' }}
                  aria-expanded={openDish === s.last.id}
                  onClick={() => setOpenDish(openDish === s.last.id ? null : s.last.id)}
                >
                  <Thumb fileId={s.photoId} />
                  <div className="b">
                    <div className="n">
                      {s.name || '（品名なし）'}
                      {s.count > 1 && <span className="count">{s.count}回</span>}
                    </div>
                    <DishMeta dish={s.last} />
                    <div className="small muted">最後：{fmtDate(s.lastVisitedAt)}</div>
                  </div>
                  <WantStamp value={s.last.want_again} small />
                </button>
                {openDish === s.last.id && (
                  <div className="card-pad small" style={{ background: 'var(--paper)' }}>
                    {s.history.map((h) => (
                      <div key={h.dish.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 0' }}>
                        <Link to={`/visit/${h.dish.visit_id}`} className="num" style={{ minWidth: 72 }}>
                          {fmtDate(h.visitedAt)}
                        </Link>
                        <Stars value={h.dish.taste_rating} small label="味" />
                        <span className="muted" style={{ flex: 1, minWidth: 0 }}>
                          {h.dish.memo}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {visits.length > 0 && (
        <>
          <h2 className="sec">訪問履歴</h2>
          <div className="list">
            {visits.map((v) => (
              <VisitRow key={v.visit.id} detail={v} showStore={false} />
            ))}
          </div>
        </>
      )}

      {photoIds.length > 0 && (
        <>
          <h2 className="sec">写真（{photoIds.length}枚）</h2>
          <div className="grid-photos">
            {photoIds.map((pid, i) => (
              <button key={pid} type="button" onClick={() => setViewer(i)} aria-label="写真を大きく見る">
                <Thumb fileId={pid} className="" />
              </button>
            ))}
          </div>
        </>
      )}

      {viewer != null && <PhotoViewer fileIds={photoIds} start={viewer} onClose={() => setViewer(null)} />}

      <div className="sticky-action">
        <div>
          <button type="button" className="btn primary big" onClick={record}>
            <IconPlus /> この店で記録する
          </button>
        </div>
      </div>
      {toast}
    </div>
  )
}
