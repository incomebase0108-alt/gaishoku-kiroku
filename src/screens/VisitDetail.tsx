import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { PhotoViewer } from '../components/PhotoViewer'
import { Stars, Thumb, TopBar, WantStamp, useToast } from '../components/ui'
import { DishMeta } from '../components/VisitViews'
import { PHOTO_TYPES, labelOf } from '../domain/enums'
import { fmtDateTime, fmtYen } from '../lib/util'
import { loadDraft, saveDraftState } from '../repositories/draftRepo'
import { deleteVisit, getVisitDetail, visitToDraft } from '../repositories/visitRepo'
import { draftHasContent } from '../repositories/draftRepo'

export function VisitDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const [toast, showToast] = useToast()
  const [viewer, setViewer] = useState<number | null>(null)
  const d = useLiveQuery(() => getVisitDetail(id), [id])

  useEffect(() => {
    const t = (loc.state as { toast?: string } | null)?.toast
    if (t) {
      showToast(t)
      nav(loc.pathname, { replace: true, state: null })
    }
  }, [loc, nav, showToast])

  if (d === undefined) return <div className="page" />
  if (d === null) {
    return (
      <div className="page">
        <TopBar title="記録が見つかりません" />
      </div>
    )
  }
  const { visit, restaurant, dishes, photos } = d
  const fileIds = photos.map((p) => p.image_path)
  const open = (fileId: string) => setViewer(fileIds.indexOf(fileId))

  const edit = async () => {
    const cur = await loadDraft()
    if (cur && draftHasContent(cur) && cur.editingVisitId !== id) {
      if (!window.confirm(`入力途中の記録（${cur.restaurant.name || '店名なし'}）を消して、この記録を直しますか？`)) return
    }
    if (!cur || cur.editingVisitId !== id) {
      const draft = await visitToDraft(id)
      if (!draft) return
      await saveDraftState(draft)
    }
    nav('/record/form')
  }

  const remove = async () => {
    if (!window.confirm('この日の記録（写真も）を消します。元に戻せません。よろしいですか？')) return
    await deleteVisit(id)
    nav(`/restaurant/${restaurant.id}`, { replace: true })
  }

  const visitPhotos = photos.filter((p) => p.dish_id == null)

  return (
    <div className="page">
      <TopBar
        right={
          <button type="button" className="link-btn" onClick={edit}>
            直す
          </button>
        }
      />
      <Link to={`/restaurant/${restaurant.id}`} className="store-title" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
        {restaurant.name} <span style={{ color: 'var(--ai)', fontSize: 16 }}>›</span>
      </Link>
      <div className="meta" style={{ marginBottom: 12 }}>
        <span className="num">{fmtDateTime(visit.visited_at)}</span>
        {visit.people_count > 1 && <span>{visit.people_count}人</span>}
        {visit.total_price != null && (
          <span className="num">
            {fmtYen(visit.total_price)}
            {visit.people_count > 1 && `（1人 ${fmtYen(Math.round(visit.total_price / visit.people_count))}）`}
          </span>
        )}
      </div>
      {visit.overall_rating != null && (
        <div style={{ marginBottom: 12 }}>
          <span className="label">総合評価</span>
          <Stars value={visit.overall_rating} label="総合" />
        </div>
      )}

      <div className="card">
        {dishes.length === 0 && <div className="card-pad muted">料理の記録はありません</div>}
        {dishes.map((dish) => {
          const ps = photos.filter((p) => p.dish_id === dish.id)
          return (
            <div key={dish.id} className="dish-full">
              {ps.length > 0 && (
                <div className="photo-strip" style={{ marginBottom: 10 }}>
                  {ps.map((p) => (
                    <button key={p.id} type="button" className="p" style={{ width: ps.length === 1 ? '100%' : 200, aspectRatio: '4 / 3', border: 0, padding: 0 }} onClick={() => open(p.image_path)} aria-label="写真を大きく見る">
                      <Thumb fileId={p.image_path} className="" />
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="d-name">{dish.name || '（品名なし）'}</div>
                  <DishMeta dish={dish} />
                </div>
                <WantStamp value={dish.want_again} />
              </div>
              {dish.memo && <p className="small pre" style={{ margin: '6px 0 0' }}>{dish.memo}</p>}
            </div>
          )
        })}
      </div>

      {visitPhotos.length > 0 && (
        <>
          <h2 className="sec">店の写真</h2>
          <div className="grid-photos">
            {visitPhotos.map((p) => (
              <button key={p.id} type="button" onClick={() => open(p.image_path)} aria-label={`${labelOf(PHOTO_TYPES, p.type)}の写真を大きく見る`}>
                <Thumb fileId={p.image_path} className="" />
              </button>
            ))}
          </div>
        </>
      )}

      {visit.memo && (
        <>
          <h2 className="sec">メモ</h2>
          <div className="card card-pad pre">{visit.memo}</div>
        </>
      )}

      <div className="spacer" />
      <button type="button" className="btn danger block" onClick={remove}>
        この日の記録を消す
      </button>

      {viewer != null && viewer >= 0 && <PhotoViewer fileIds={fileIds} start={viewer} onClose={() => setViewer(null)} />}
      {toast}
    </div>
  )
}
