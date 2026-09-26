import { useMemo, useState } from 'react'
import { TopBar, useToast } from '../components/ui'
import { ABOUT } from '../lib/about'
import { inviteText, inviteUrl, lineShareUrl, makeInviteCard, qrPath } from '../services/invite'
import { shareOrCopyText, shareOrDownloadFile } from '../services/shareFile'

// 友だちに食歴を教える画面。LINE・Instagram（共有メニュー）・画像・QR・リンクのコピー
export function Invite() {
  const url = inviteUrl()
  const text = inviteText()
  const qr = useMemo(() => qrPath(url), [url])
  const [toast, showToast] = useToast()
  const [busy, setBusy] = useState(false)

  const shareMenu = async () => {
    const res = await shareOrCopyText(ABOUT.appName, text, url)
    if (res === 'copied') showToast('紹介文とリンクをコピーしました')
    if (res === 'failed') showToast('送れませんでした')
  }

  const shareImage = async () => {
    setBusy(true)
    try {
      const file = await makeInviteCard()
      const res = await shareOrDownloadFile(file, ABOUT.appName)
      if (res === 'downloaded') showToast('画像を保存しました。Instagram のストーリーなどに載せてください')
    } catch {
      showToast('画像を作れませんでした')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      showToast('リンクをコピーしました')
    } catch {
      showToast('コピーできませんでした')
    }
  }

  return (
    <div className="page no-sticky">
      <TopBar title="友だちに教える" />

      <div className="card card-pad" style={{ textAlign: 'center' }}>
        <svg className="invite-qr" data-testid="invite-qr" viewBox={`0 0 ${qr.size} ${qr.size}`} width={220} height={220} shapeRendering="crispEdges" role="img" aria-label="食歴を開く QR コード">
          <rect width={qr.size} height={qr.size} fill="#fff" />
          <path d={qr.d} fill="#000" />
        </svg>
        <p className="small muted" style={{ marginBottom: 0 }}>
          目の前の友だちには、スマホのカメラでこの QR を読み取ってもらう
        </p>
      </div>

      <h2 className="sec">送る</h2>
      <div className="card card-pad">
        <a className="btn primary block line-btn" href={lineShareUrl(text, url)} target="_blank" rel="noopener noreferrer" data-testid="invite-line">
          LINE で送る
        </a>
        <div className="spacer" />
        <button type="button" className="btn block" onClick={shareMenu} data-testid="invite-menu">
          Instagram・メールなどで送る
        </button>
        <div className="spacer" />
        <button type="button" className="btn block" onClick={shareImage} disabled={busy} data-testid="invite-image">
          {busy ? '作成中…' : 'QR 入りの画像で送る（ストーリー向け）'}
        </button>
        <div className="spacer" />
        <button type="button" className="btn block" onClick={copy} data-testid="invite-copy">
          リンクをコピー
        </button>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Instagram は共有メニューの「Instagram」→ DM、または画像をストーリーに載せてリンクスタンプにコピーしたリンクを貼る。
        </p>
      </div>

      <h2 className="sec">受け取った友だちは</h2>
      <div className="card card-pad help small">
        <ol>
          <li>リンクか QR を開く（LINE から開くと自動で Safari / Chrome に切り替わります）</li>
          <li>iPhone は Safari の共有ボタン（□に↑）→「ホーム画面に追加」</li>
          <li>Android は Chrome の「︙」→「ホーム画面に追加」または「アプリをインストール」</li>
        </ol>
        アプリストアは使いません。無料・登録なしで、記録はその人のスマホの中だけに残ります。
      </div>
      <p className="small muted" style={{ wordBreak: 'break-all' }}>{url}</p>
      {toast}
    </div>
  )
}
