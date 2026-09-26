import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { TopBar } from '../components/ui'
import { db } from '../db/db'
import { fmtAgo, fmtDateTime } from '../lib/util'
import { ABOUT } from '../lib/about'
import { isIOS, prefs } from '../lib/prefs'
import { BackupError, backupFileName, buildBackupZip, importBackup, parseBackup, type ParsedBackup } from '../services/backup'
import { requestPersist } from '../services/photoStorage'
import { shareOrDownloadFile } from '../services/shareFile'

function mb(n: number): string {
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

export function Settings() {
  const counts = useLiveQuery(async () => ({
    restaurants: await db.restaurants.count(),
    visits: await db.visits.count(),
    photos: await db.photoFiles.count(),
  }), [])
  const [lastBackup, setLastBackup] = useState(prefs.lastBackupAt())
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, setPending] = useState<ParsedBackup | null>(null)
  const [storage, setStorage] = useState<{ persisted: boolean | null; usage: number | null }>({ persisted: null, usage: null })
  const fileInput = useRef<HTMLInputElement>(null)

  const refreshStorage = async () => {
    try {
      const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null
      const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null
      setStorage({ persisted, usage: est?.usage ?? null })
    } catch {
      setStorage({ persisted: null, usage: null })
    }
  }
  useEffect(() => {
    void refreshStorage()
  }, [])

  const exportNow = async () => {
    setMsg(null)
    setBusy('export')
    try {
      const { bytes, counts: c } = await buildBackupZip()
      const name = backupFileName()
      const file = new File([bytes as BlobPart], name, { type: 'application/zip' })
      if ((await shareOrDownloadFile(file)) === 'cancelled') {
        setMsg({ ok: false, text: 'バックアップの保存をやめました' })
        return
      }
      const now = Date.now()
      prefs.setLastBackupAt(now)
      setLastBackup(now)
      setMsg({ ok: true, text: `バックアップを作りました（店${c.restaurants}件・食事${c.visits}回・写真${c.photos}枚／${mb(bytes.byteLength)}）` })
    } catch {
      setMsg({ ok: false, text: 'バックアップを作れませんでした。空き容量を確かめて、もう一度試してください' })
    } finally {
      setBusy(null)
    }
  }

  const onPick = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = ''
    if (!file) return
    setMsg(null)
    setBusy('read')
    try {
      const parsed = parseBackup(new Uint8Array(await file.arrayBuffer()))
      setPending(parsed)
    } catch (e) {
      setMsg({ ok: false, text: e instanceof BackupError ? e.message : 'ファイルを読めませんでした' })
    } finally {
      setBusy(null)
    }
  }

  const importNow = async () => {
    if (!pending) return
    setBusy('import')
    try {
      await importBackup(pending)
      void requestPersist()
      setMsg({ ok: true, text: `読み込みました（店${pending.counts.restaurants}件・食事${pending.counts.visits}回・写真${pending.counts.photos}枚）` })
      setPending(null)
      void refreshStorage()
    } catch {
      setMsg({ ok: false, text: '読み込めませんでした。空き容量を確かめて、もう一度試してください' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="page no-sticky">
      <TopBar title="設定" back={false} />

      <h2 className="sec">バックアップ（機種変更のとき）</h2>
      <div className="card card-pad">
        <p className="small" style={{ marginTop: 0 }}>
          記録と写真はこのスマホの中だけに保存されています。機種変更や故障に備えて、ときどきバックアップを作り、Google ドライブ・iCloud Drive・LINE の自分宛てなどに保存してください。
        </p>
        <p className="small muted">
          今の記録：店 {counts?.restaurants ?? '…'}件・食事 {counts?.visits ?? '…'}回・写真 {counts?.photos ?? '…'}枚
          <br />
          最後のバックアップ：{lastBackup ? `${fmtDateTime(lastBackup)}（${fmtAgo(lastBackup)}）` : 'まだありません'}
        </p>
        <button type="button" className="btn primary block" onClick={exportNow} disabled={busy != null}>
          {busy === 'export' ? '作成中…' : 'バックアップを作って保存する'}
        </button>
        <div className="spacer" />
        <button type="button" className="btn block" onClick={() => fileInput.current?.click()} disabled={busy != null}>
          {busy === 'read' ? '読み込み中…' : 'バックアップから戻す'}
        </button>
        <input ref={fileInput} type="file" accept=".zip,application/zip" hidden onChange={(e) => onPick(e.target.files?.[0])} />

        {pending && (
          <div className="notice" style={{ marginTop: 12, flexDirection: 'column', alignItems: 'stretch' }}>
            <div>
              {fmtDateTime(pending.data.exported_at)} のバックアップです。
              <br />
              店{pending.counts.restaurants}件・食事{pending.counts.visits}回・写真{pending.counts.photos}枚を、今の記録に足します。今の記録は消えません。
            </div>
            <div className="row">
              <button type="button" className="btn" onClick={() => setPending(null)}>
                やめる
              </button>
              <button type="button" className="btn primary" onClick={importNow} disabled={busy != null}>
                {busy === 'import' ? '読み込み中…' : '読み込む'}
              </button>
            </div>
          </div>
        )}
        {msg && (
          <p role="status" style={{ color: msg.ok ? 'var(--ok)' : 'var(--danger)', fontWeight: 700, marginBottom: 0 }}>
            {msg.text}
          </p>
        )}
      </div>

      <h2 className="sec">機種変更の手順</h2>
      <div className="card card-pad help small">
        <ol>
          <li>今のスマホで「バックアップを作って保存する」を押し、ドライブや LINE の自分宛てなどに保存する</li>
          <li>新しいスマホでこのアプリを開き、ホーム画面に追加する</li>
          <li>「バックアップから戻す」で、保存した zip ファイルを選ぶ</li>
        </ol>
        iPhone と Android の間でも移せます。
      </div>

      <h2 className="sec">ホーム画面に追加</h2>
      <div className="card card-pad help small">
        {isIOS() ? (
          <ol>
            <li>Safari でこのページを開く</li>
            <li>画面下の共有ボタン（□に↑）を押す</li>
            <li>「ホーム画面に追加」を選ぶ</li>
          </ol>
        ) : (
          <ol>
            <li>Chrome でこのページを開く</li>
            <li>右上の「︙」を押す</li>
            <li>「ホーム画面に追加」または「アプリをインストール」を選ぶ</li>
          </ol>
        )}
        ホーム画面から開くと、圏外でも使え、記録が消されにくくなります。
      </div>

      <h2 className="sec">保存場所</h2>
      <div className="card card-pad small">
        <div>使っている容量：{storage.usage != null ? mb(storage.usage) : '不明'}</div>
        <div>
          消されにくい設定：
          {storage.persisted == null ? '不明' : storage.persisted ? 'オン' : 'オフ'}
          {storage.persisted === false && (
            <button type="button" className="toggle-link" style={{ marginLeft: 8 }} onClick={async () => { await requestPersist(); void refreshStorage() }}>
              オンにする
            </button>
          )}
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          ブラウザのデータを消すと、記録も消えます。
        </p>
      </div>

      <h2 className="sec">このアプリについて</h2>
      <div className="card card-pad small">
        <div style={{ fontWeight: 800, fontSize: 16 }}>{ABOUT.appName}</div>
        <div className="muted" data-testid="app-version">版 {ABOUT.version}</div>
        <div>
          制作：
          {ABOUT.companyUrl ? (
            <a href={ABOUT.companyUrl} target="_blank" rel="noreferrer">
              {ABOUT.company}
            </a>
          ) : (
            ABOUT.company
          )}
        </div>
      </div>
    </div>
  )
}
