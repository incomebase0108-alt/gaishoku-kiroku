import { useState } from 'react'

// 店の市（〇〇市・〇〇区）。今までに入れた市はボタンで1タップ、無ければ文字で入れる
export function CityField({
  value,
  cities,
  onChange,
}: {
  value: string
  cities: string[]
  onChange: (city: string) => void
}) {
  const [open, setOpen] = useState(value === '')
  const [text, setText] = useState('')

  if (!open) {
    return (
      <button type="button" className="toggle-link" onClick={() => setOpen(true)}>
        {value ? <span className="tag">{value}</span> : null} 市を{value ? '変える' : '入れる'}
      </button>
    )
  }

  const commit = () => {
    const c = text.trim()
    if (c) onChange(c)
    setText('')
    if (c || value) setOpen(false)
  }

  return (
    <div className="city-field">
      <span className="label">市（〇〇市・〇〇区など）</span>
      {cities.length > 0 && (
        <div className="chips scroll">
          {cities.map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              aria-pressed={value === c}
              onClick={() => {
                onChange(value === c ? '' : c)
                if (value !== c) setOpen(false)
              }}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="row" style={{ marginTop: 6 }}>
        <input
          className="input"
          style={{ flex: 3 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          placeholder={cities.length ? 'ほかの市を入れる' : '例：名古屋市'}
          aria-label="市を入れる"
          enterKeyHint="done"
          autoComplete="off"
        />
        <button type="button" className="btn" style={{ flex: 1 }} onClick={commit}>
          {text.trim() ? '決定' : '閉じる'}
        </button>
      </div>
    </div>
  )
}
