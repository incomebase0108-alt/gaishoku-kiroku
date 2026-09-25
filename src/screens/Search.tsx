import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MultiChoice, Stars, Thumb, TopBar, WantStamp } from '../components/ui'
import { DishMeta } from '../components/VisitViews'
import { AMOUNTS, GENRES, PRICE_FEELS, WANT_AGAINS } from '../domain/enums'
import { fmtAgo, fmtDate } from '../lib/util'
import { usedCities } from '../repositories/restaurantRepo'
import { EMPTY_FILTERS, searchDishes, searchRestaurants, usedGenres, type SearchFilters } from '../repositories/searchRepo'

type Tab = 'store' | 'dish'

export function Search() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'dish' ? 'dish' : 'store'
  const [f, setF] = useState<SearchFilters>(EMPTY_FILTERS)
  const [open, setOpen] = useState(false)
  const genres = useLiveQuery(usedGenres, []) ?? []
  const cities = useLiveQuery(usedCities, []) ?? []
  const stores = useLiveQuery(() => (tab === 'store' ? searchRestaurants(f) : null), [tab, f])
  const dishes = useLiveQuery(() => (tab === 'dish' ? searchDishes(f) : null), [tab, f])

  const set = (patch: Partial<SearchFilters>) => setF((x) => ({ ...x, ...patch }))
  const active = f.genre !== '' || f.city !== '' || f.minRating > 0 || f.amounts.length + f.prices.length + f.wants.length > 0
  const count = tab === 'store' ? stores?.length : dishes?.length
  const genreList = [...new Set([...genres, ...GENRES.filter((g) => genres.includes(g))])]

  return (
    <div className="page no-sticky">
      <TopBar title="探す" back={false} />
      <div className="seg" role="group" aria-label="探し方">
        <button type="button" aria-pressed={tab === 'store'} onClick={() => setParams({ tab: 'store' }, { replace: true })}>
          店から
        </button>
        <button type="button" aria-pressed={tab === 'dish'} onClick={() => setParams({ tab: 'dish' }, { replace: true })}>
          料理から
        </button>
      </div>

      <input
        className="input"
        type="search"
        value={f.q}
        onChange={(e) => set({ q: e.target.value })}
        placeholder={tab === 'store' ? '店名・料理名・市で探す' : '料理名・店名・市で探す'}
        aria-label="キーワード"
        enterKeyHint="search"
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" className="toggle-link" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '絞り込みを閉じる' : '絞り込む'}
          {active && !open && '（条件あり）'}
        </button>
        {active && (
          <button type="button" className="toggle-link" onClick={() => setF({ ...EMPTY_FILTERS, q: f.q })}>
            条件をクリア
          </button>
        )}
      </div>

      {/* 市はよく使うので、絞り込みを開かなくても押せるように外に出す */}
      {cities.length > 0 && (
        <div className="chips scroll" role="group" aria-label="市" style={{ marginTop: 8 }}>
          {cities.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={f.city === c} onClick={() => set({ city: f.city === c ? '' : c })}>
              {c}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="card card-pad">
          {genreList.length > 0 && (
            <div className="filter-group">
              <span className="label">ジャンル</span>
              <div className="chips">
                {genreList.map((g) => (
                  <button key={g} type="button" className="chip" aria-pressed={f.genre === g} onClick={() => set({ genre: f.genre === g ? '' : g })}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="filter-group">
            <span className="label">{tab === 'store' ? '前回の総合評価' : '味'}（この星以上）</span>
            <Stars value={f.minRating || null} onChange={(v) => set({ minRating: v ?? 0 })} label="評価の下限" />
          </div>
          <div className="filter-group">
            <span className="label">量</span>
            <MultiChoice options={AMOUNTS} value={f.amounts} onChange={(v) => set({ amounts: v })} label="量" />
          </div>
          <div className="filter-group">
            <span className="label">価格感</span>
            <MultiChoice options={PRICE_FEELS} value={f.prices} onChange={(v) => set({ prices: v })} label="価格感" />
          </div>
          <div className="filter-group">
            <span className="label">また食べたい</span>
            <MultiChoice options={WANT_AGAINS} value={f.wants} onChange={(v) => set({ wants: v })} label="また食べたい" />
          </div>
          {tab === 'store' && (f.amounts.length + f.prices.length + f.wants.length > 0) && (
            <p className="small muted" style={{ margin: '4px 0 0' }}>量・価格感・また食べたいは、条件に合う料理が1品でもある店を出します</p>
          )}
        </div>
      )}

      <div className="result-count">
        <span>{count != null && `${count}件`}</span>
      </div>

      {tab === 'store' && stores && (
        <div className="list">
          {stores.length === 0 && <div className="empty">条件に合う店はありません</div>}
          {stores.map((h) => (
            <Link key={h.restaurant.id} to={`/restaurant/${h.restaurant.id}`} className="card item">
              <Thumb fileId={h.photoId} />
              <div className="body">
                <div className="title">{h.restaurant.name}</div>
                <div className="sub">
                  {h.restaurant.genre && <span className="tag">{h.restaurant.genre}</span>}{' '}
                  {h.restaurant.city && `${h.restaurant.city}・`}
                  {h.lastVisit ? `${fmtAgo(h.lastVisit.visited_at)}・${h.visitCount}回` : '記録なし'}
                </div>
                {h.matchedDishes.length > 0 && <div className="dishes">{h.matchedDishes.join('、')}</div>}
                <Stars value={h.lastVisit?.overall_rating ?? null} small label="前回の総合" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === 'dish' && dishes && (
        <div className="list">
          {dishes.length === 0 && <div className="empty">条件に合う料理はありません</div>}
          {dishes.map((h) => (
            <Link key={h.dish.id} to={`/visit/${h.visit.id}`} className="card item">
              <Thumb fileId={h.photoId} />
              <div className="body">
                <div className="title">{h.dish.name || '（品名なし）'}</div>
                <div className="sub">
                  {h.restaurant.name}{h.restaurant.city && `（${h.restaurant.city}）`}・{fmtDate(h.visit.visited_at)}
                </div>
                <DishMeta dish={h.dish} />
              </div>
              <WantStamp value={h.dish.want_again} small />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
