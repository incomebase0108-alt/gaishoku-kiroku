import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { WANT_AGAINS, labelOf, type Rating, type WantAgain } from '../domain/enums'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { IconBowl } from './icons'

const STAR = 'M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z'

// 星5つ。onChange があればタップで選べる（同じ星をもう一度押すと取り消し）
export function Stars({
  value,
  onChange,
  small,
  label,
}: {
  value: number | null
  onChange?: (v: Rating | null) => void
  small?: boolean
  label?: string
}) {
  const v = value ?? 0
  if (!onChange) {
    if (!value) return null
    return (
      <span className={`stars${small ? ' small' : ''}`} role="img" aria-label={`${label ?? '評価'}★${value}`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <svg key={i} viewBox="0 0 24 24" className={i <= v ? 'star-on' : 'star-off'}>
            <path d={STAR} />
          </svg>
        ))}
      </span>
    )
  }
  return (
    <span className="stars" role="radiogroup" aria-label={label}>
      {([1, 2, 3, 4, 5] as Rating[]).map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={v === i}
          aria-label={`★${i}`}
          onClick={() => onChange(v === i ? null : i)}
        >
          <svg viewBox="0 0 24 24" className={i <= v ? 'star-on' : 'star-off'}>
            <path d={STAR} />
          </svg>
        </button>
      ))}
    </span>
  )
}

type Opt<T extends string> = { readonly value: T; readonly label: string }

// 1つだけ選ぶチップ（同じものをもう一度押すと取り消し）
export function Choice<T extends string>({
  options,
  value,
  onChange,
  fill,
  label,
}: {
  options: readonly Opt<T>[]
  value: T | null
  onChange: (v: T | null) => void
  fill?: boolean
  label?: string
}) {
  return (
    <div className={`chips${fill ? ' fill' : ''}`} style={fill ? ({ '--n': options.length } as React.CSSProperties) : undefined} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={value === o.value} onClick={() => onChange(value === o.value ? null : o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// いくつでも選べるチップ（検索の絞り込み用）
export function MultiChoice<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly Opt<T>[]
  value: T[]
  onChange: (v: T[]) => void
  label?: string
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            className="chip"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// また食べたい を判子で出す
export function WantStamp({ value, small, pop }: { value: WantAgain | null; small?: boolean; pop?: boolean }) {
  if (!value) return null
  const text = value === 'must' ? '絶対\n食べる' : value === 'either' ? 'どちら\nでも' : labelOf(WANT_AGAINS, value)
  return (
    <span className={`stamp ${value}${small ? ' sm' : ''}${pop ? ' pop' : ''}`} role="img" aria-label={`また食べたい：${labelOf(WANT_AGAINS, value)}`}>
      <span className="pre">{text}</span>
    </span>
  )
}

export function Thumb({ fileId, className = 'thumb' }: { fileId: string | null; className?: string }) {
  const url = usePhotoUrl(fileId)
  return <div className={className}>{url ? <img src={url} alt="" /> : <IconBowl />}</div>
}

export function TopBar({ title, back = true, right }: { title?: ReactNode; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate()
  return (
    <div className="topbar">
      {back && (
        <button type="button" className="back" aria-label="戻る" onClick={() => (history.length > 1 ? nav(-1) : nav('/'))}>
          ‹
        </button>
      )}
      <h1>{title}</h1>
      {right}
    </div>
  )
}

// 画面下の短いお知らせ
export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2200)
    return () => clearTimeout(t)
  }, [msg])
  return [msg ? <div className="toast" role="status">{msg}</div> : null, setMsg]
}
