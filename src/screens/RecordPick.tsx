import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Thumb, TopBar } from '../components/ui'
import type { VisitDraft } from '../domain/types'
import { clearDraft, draftHasContent, loadDraft, newDraft, newStore, saveDraftState, storeOf } from '../repositories/draftRepo'
import { listRestaurantSummaries } from '../repositories/restaurantRepo'
import { fmtAgo, norm } from '../lib/util'

// 下書きを始める。入力途中の別の記録があれば確かめてから捨てる
export async function startDraft(restaurant: VisitDraft['restaurant']): Promise<boolean> {
  const cur = await loadDraft()
  if (cur && draftHasContent(cur)) {
    const sameStore = !cur.editingVisitId && cur.restaurant.name === restaurant.name
    if (sameStore) return true // 同じ店の入力途中があれば、それを続ける
    const what = cur.editingVisitId ? '編集中の記録' : '入力途中の記録'
    if (!window.confirm(`${what}（${cur.restaurant.name || '店名なし'}）を消して、新しく記録を始めますか？`)) return false
  }
  await saveDraftState(newDraft(restaurant))
  return true
}

export function RecordPick() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const change = params.get('change') === '1' // 記録の途中で店だけ変える
  const [q, setQ] = useState('')
  const summaries = useLiveQuery(listRestaurantSummaries, [])
  const draft = useLiveQuery(loadDraft, [])

  const k = norm(q)
  // 店名でも市でも当てる（「豊橋」で豊橋市の店が出る）
  const list = (summaries ?? []).filter((s) => !k || norm(`${s.restaurant.name} ${s.restaurant.city ?? ''}`).includes(k))
  const exactHits = (summaries ?? []).filter((s) => norm(s.restaurant.name) === k)
  const exact = exactHits.length > 0

  const pick = async (r: VisitDraft['restaurant']) => {
    const cur = change ? await loadDraft() : null
    if (cur) {
      await saveDraftState({ ...cur, restaurant: r })
      nav('/record/form', { replace: true })
      return
    }
    if (await startDraft(r)) nav('/record/form', { replace: true })
  }

  return (
    <div className="page no-sticky">
      <TopBar title="どの店で食べましたか？" />

      {draft && !change && (
        <div className="notice">
          <span className="grow">入力途中：{draft.restaurant.name || '店名なし'}</span>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              if (window.confirm('入力途中の記録を消しますか？')) await clearDraft()
            }}
          >
            消す
          </button>
          <Link className="btn primary" to="/record/form" replace>
            続ける
          </Link>
        </div>
      )}

      <div className="field">
        <label htmlFor="store-q">店名</label>
        <input
          id="store-q"
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="店名を入れる／下から選ぶ（市でも探せます）"
          enterKeyHint="go"
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q.trim()) {
              // 同じ名前の店が別の市にもあるときは、下の一覧から選んでもらう
              if (exactHits.length === 1) void pick(storeOf(exactHits[0].restaurant))
              else if (exactHits.length === 0) void pick(newStore(q))
            }
          }}
        />
      </div>

      {q.trim() && !exact && (
        <button type="button" className="btn primary big" onClick={() => pick(newStore(q))}>
          「{q.trim()}」を新しい店として記録
        </button>
      )}
      {q.trim() && exact && (
        <button type="button" className="btn block" onClick={() => pick(newStore(q))}>
          「{q.trim()}」の別の店舗（別の市など）として記録
        </button>
      )}

      <h2 className="sec">{q.trim() ? '登録済みの店' : '最近行った店'}</h2>
      {summaries && list.length === 0 && <p className="muted small">{q.trim() ? '当てはまる店はまだありません' : 'まだ店がありません。上に店名を入れてください'}</p>}
      <div className="list">
        {list.slice(0, 40).map((s) => (
          <button
            key={s.restaurant.id}
            type="button"
            className="card item"
            style={{ textAlign: 'left', width: '100%' }}
            onClick={() => pick(storeOf(s.restaurant))}
          >
            <Thumb fileId={s.coverPhotoId} />
            <div className="body">
              <div className="title">{s.restaurant.name}</div>
              <div className="sub">
                {s.restaurant.genre && <span className="tag">{s.restaurant.genre}</span>}{' '}
                {s.restaurant.city && `${s.restaurant.city}・`}
                {s.lastVisit ? `${fmtAgo(s.lastVisit.visited_at)}・${s.visitCount}回` : '記録なし'}
              </div>
              {s.lastDishNames.length > 0 && <div className="dishes">前回：{s.lastDishNames.join('、')}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
