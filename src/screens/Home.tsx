import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconBowl, IconClock, IconPlus, IconStore } from '../components/icons'
import { Stars, Thumb } from '../components/ui'
import { loadDraft } from '../repositories/draftRepo'
import { listRestaurantSummaries } from '../repositories/restaurantRepo'
import { fmtAgo, fmtDate } from '../lib/util'
import { canInstall, install, onInstallChange } from '../lib/install'
import { inAppBrowser, isIOS, isStandalone, prefs } from '../lib/prefs'

const BACKUP_EVERY = 14 * 86400000

export function Home() {
  const summaries = useLiveQuery(listRestaurantSummaries, [])
  const draft = useLiveQuery(loadDraft, [])
  const [installHint, setInstallHint] = useState(() => !isStandalone() && !prefs.installHintHidden())
  const [backupHint, setBackupHint] = useState(true)
  const [installable, setInstallable] = useState(canInstall)
  useEffect(() => onInstallChange(() => setInstallable(canInstall())), [])
  const inApp = inAppBrowser()

  const visited = (summaries ?? []).filter((s) => s.lastVisit)
  const now = Date.now()
  const lastBackup = prefs.lastBackupAt()
  const needBackup =
    backupHint &&
    visited.length > 0 &&
    (lastBackup == null || now - lastBackup > BACKUP_EVERY) &&
    now > prefs.backupHintSnoozedUntil()

  return (
    <div className="page">
      <div className="brand">食歴</div>

      {draft && (
        <div className="notice">
          <span className="grow">
            入力途中の記録があります
            {draft.restaurant.name && `（${draft.restaurant.name}）`}
          </span>
          <Link className="btn primary" to="/record/form">
            続ける
          </Link>
        </div>
      )}

      {inApp && (
        <div className="notice warn" data-testid="inapp-notice">
          <span className="grow small">
            {inApp === 'line' ? 'LINE' : inApp === 'instagram' ? 'Instagram' : 'Facebook'}
            の中で開いています。ここではホーム画面に追加できず、記録もこのアプリの中に残ってしまいます。
            {isIOS() ? '右上（または右下）の「…」→「Safari で開く」' : '右上の「︙」→「ブラウザで開く」'}
            を選んでから使ってください
          </span>
        </div>
      )}

      {!inApp && installable && (
        <div className="notice">
          <span className="grow small">アプリとしてホーム画面に追加できます。記録が消えにくくなります</span>
          <button type="button" className="btn primary" onClick={() => void install()} data-testid="install-btn">
            追加する
          </button>
        </div>
      )}

      {!inApp && !installable && installHint && (
        <div className="notice">
          <span className="grow small">
            {isIOS()
              ? 'Safari の共有ボタン →「ホーム画面に追加」で、アプリとして使えます。記録が消えにくくなります'
              : 'メニュー →「ホーム画面に追加」で、アプリとして使えます。記録が消えにくくなります'}
          </span>
          <button
            type="button"
            className="close-x"
            aria-label="この案内を閉じる"
            onClick={() => {
              prefs.hideInstallHint()
              setInstallHint(false)
            }}
          >
            ×
          </button>
        </div>
      )}

      {needBackup && (
        <div className="notice warn">
          <span className="grow small">
            {lastBackup ? `最後のバックアップは${fmtAgo(lastBackup)}です。` : 'まだバックアップしていません。'}
            機種変更や故障に備えて保存しておきましょう
          </span>
          <Link className="btn" to="/settings">
            保存する
          </Link>
          <button
            type="button"
            className="close-x"
            aria-label="あとで"
            onClick={() => {
              prefs.snoozeBackupHint(now + 3 * 86400000)
              setBackupHint(false)
            }}
          >
            ×
          </button>
        </div>
      )}

      <div className="quick">
        <Link to="/search?tab=store">
          <IconStore />
          店から探す
        </Link>
        <Link to="/search?tab=dish">
          <IconBowl />
          料理から探す
        </Link>
        <Link to="/history">
          <IconClock />
          過去の食事
        </Link>
      </div>

      <h2 className="sec">最近行った店</h2>
      {summaries && visited.length === 0 && (
        <div className="card empty">
          <p>まだ記録がありません。</p>
          <p className="small">お店で下の「今日の食事を記録」を押して、写真と評価を残しましょう。次に同じ店へ行ったとき、前回食べたものがすぐ分かります。</p>
        </div>
      )}
      <div className="list">
        {visited.slice(0, 30).map((s) => (
          <Link key={s.restaurant.id} to={`/restaurant/${s.restaurant.id}`} className="card item">
            <Thumb fileId={s.coverPhotoId} />
            <div className="body">
              <div className="title">{s.restaurant.name}</div>
              <div className="sub">
                {s.restaurant.genre && <span className="tag">{s.restaurant.genre}</span>} {s.restaurant.city && `${s.restaurant.city}・`}{fmtDate(s.lastVisit!.visited_at)}（{fmtAgo(s.lastVisit!.visited_at)}）・{s.visitCount}回
              </div>
              <div className="dishes">{s.lastDishNames.join('、') || '—'}</div>
              <Stars value={s.lastVisit!.overall_rating} small label="総合" />
            </div>
          </Link>
        ))}
      </div>

      <div className="sticky-action">
        <div>
          <Link to="/record" className="btn primary big">
            <IconPlus /> 今日の食事を記録
          </Link>
        </div>
      </div>
    </div>
  )
}
