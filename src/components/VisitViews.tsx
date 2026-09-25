import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AMOUNTS, PRICE_FEELS, labelOf } from '../domain/enums'
import type { Dish, VisitDetail } from '../domain/types'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { fmtAgo, fmtDate, fmtDateTime, fmtYen } from '../lib/util'
import { PhotoViewer } from './PhotoViewer'
import { Stars, Thumb, WantStamp } from './ui'

function PhotoButton({ fileId, size, onOpen }: { fileId: string; size: 'thumb' | 'full'; onOpen: () => void }) {
  const url = usePhotoUrl(fileId, size)
  return (
    <button type="button" className="ph" onClick={onOpen} aria-label="写真を大きく見る">
      {url && <img src={url} alt="" />}
    </button>
  )
}

// 料理1品の評価（味・量・価格感・金額）を1行に
export function DishMeta({ dish }: { dish: Dish }) {
  return (
    <div className="d-meta">
      {dish.taste_rating != null && (
        <span>
          味 <Stars value={dish.taste_rating} small label="味" />
        </span>
      )}
      {dish.amount_rating && <span>量：{labelOf(AMOUNTS, dish.amount_rating)}</span>}
      {dish.price_rating && <span>{labelOf(PRICE_FEELS, dish.price_rating)}</span>}
      {dish.price != null && <span className="num">{fmtYen(dish.price)}</span>}
    </div>
  )
}

// 「前回この店で何を食べ、どう評価したか」。このアプリでいちばん大事な表示
export function LastVisitCard({
  detail,
  onAgain,
  heading = '前回',
  compact,
}: {
  detail: VisitDetail
  onAgain?: (dish: Dish) => void // 記録中なら「今回も」で品名を写せる
  heading?: string
  compact?: boolean // 記録中は写真を小さくして、入力欄を近くに
}) {
  const [viewer, setViewer] = useState<number | null>(null)
  const { visit, dishes, photos } = detail
  const fileIds = photos.map((p) => p.image_path)
  return (
    <section className={`last${compact ? ' compact' : ''}`} aria-label={`${heading}の訪問`}>
      <div className="last-head">
        <b>{heading} {fmtDate(visit.visited_at)}</b>
        <span>{fmtAgo(visit.visited_at)}</span>
        <Link className="more" to={`/visit/${visit.id}`}>
          詳しく
        </Link>
      </div>
      {fileIds.length > 0 && (
        <div className="last-photos">
          {fileIds.map((id, i) => (
            <PhotoButton key={id} fileId={id} size={compact ? 'thumb' : 'full'} onOpen={() => setViewer(i)} />
          ))}
        </div>
      )}
      <div className="last-sum">
        {visit.overall_rating != null && (
          <span>
            総合 <Stars value={visit.overall_rating} small label="総合" />
          </span>
        )}
        {visit.total_price != null && <span className="big num">{fmtYen(visit.total_price)}</span>}
        {visit.people_count > 1 && <span className="muted">{visit.people_count}人</span>}
      </div>
      {dishes.length > 0 ? (
        <ul className="last-dishes">
          {dishes.map((d) => (
            <li key={d.id} className="last-dish">
              <div className="d-body">
                <div className="d-name">{d.name || '（品名なし）'}</div>
                <DishMeta dish={d} />
                {d.memo && <div className="d-memo pre">{d.memo}</div>}
              </div>
              <WantStamp value={d.want_again} />
              {onAgain && d.name && (
                <button type="button" className="again-btn" onClick={() => onAgain(d)}>
                  今回も
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="card-pad muted small">料理の記録はありません</div>
      )}
      {visit.memo && <div className="last-memo">{visit.memo}</div>}
      {viewer != null && <PhotoViewer fileIds={fileIds} start={viewer} onClose={() => setViewer(null)} />}
    </section>
  )
}

// 一覧用の1行（履歴・店の訪問履歴）
export function VisitRow({ detail, showStore = true }: { detail: VisitDetail; showStore?: boolean }) {
  const { visit, restaurant, dishes, photos } = detail
  const cover = (photos.find((p) => p.dish_id != null) ?? photos[0])?.image_path ?? null
  return (
    <Link to={`/visit/${visit.id}`} className="card item">
      <Thumb fileId={cover} />
      <div className="body">
        {showStore && <div className="title">{restaurant.name}</div>}
        <div className="sub">
          {showStore ? fmtDate(visit.visited_at) : fmtDateTime(visit.visited_at)}
          {visit.total_price != null && <span className="num">　{fmtYen(visit.total_price)}</span>}
        </div>
        <div className="dishes">{dishes.map((d) => d.name).filter((n) => n).join('、') || '—'}</div>
        <Stars value={visit.overall_rating} small label="総合" />
      </div>
    </Link>
  )
}
