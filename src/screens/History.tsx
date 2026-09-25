import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/ui'
import { VisitRow } from '../components/VisitViews'
import type { VisitDetail } from '../domain/types'
import { fmtYen } from '../lib/util'
import { listAllVisits } from '../repositories/visitRepo'

function groupByMonth(list: VisitDetail[]): { key: string; label: string; items: VisitDetail[] }[] {
  const out: { key: string; label: string; items: VisitDetail[] }[] = []
  for (const v of list) {
    const d = new Date(v.visit.visited_at)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    let g = out[out.length - 1]
    if (!g || g.key !== key) {
      g = { key, label: `${d.getFullYear()}年${d.getMonth() + 1}月`, items: [] }
      out.push(g)
    }
    g.items.push(v)
  }
  return out
}

export function History() {
  const visits = useLiveQuery(listAllVisits, [])
  return (
    <div className="page no-sticky">
      <TopBar title="過去の食事" back={false} />
      {visits && visits.length === 0 && (
        <div className="card empty">
          <p>まだ記録がありません</p>
          <Link className="btn primary" to="/record">
            今日の食事を記録
          </Link>
        </div>
      )}
      {visits &&
        groupByMonth(visits).map((g) => {
          const sum = g.items.reduce((s, v) => s + (v.visit.total_price ?? 0), 0)
          return (
            <section key={g.key}>
              <h2 className="sec" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{g.label}</span>
                <span className="num">
                  {g.items.length}回{sum > 0 && `・${fmtYen(sum)}`}
                </span>
              </h2>
              <div className="list">
                {g.items.map((v) => (
                  <VisitRow key={v.visit.id} detail={v} />
                ))}
              </div>
            </section>
          )
        })}
    </div>
  )
}
