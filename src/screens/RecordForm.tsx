import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { CityField } from '../components/CityField'
import { IconCamera, IconImage } from '../components/icons'
import { Choice, Stars, TopBar, useToast } from '../components/ui'
import { LastVisitCard } from '../components/VisitViews'
import { AMOUNTS, GENRES, PHOTO_TYPES, PRICE_FEELS, WANT_AGAINS, labelOf, type PhotoType } from '../domain/enums'
import type { Dish, DraftDish, DraftPhoto, VisitDraft } from '../domain/types'
import { useBufferUrl } from '../hooks/usePhotoUrl'
import { fmtYen, fromLocalInput, parseYen, toLocalInput } from '../lib/util'
import { clearDraft, emptyDish, loadDraft, saveDraftState } from '../repositories/draftRepo'
import { usedCities } from '../repositories/restaurantRepo'
import { DraftError, getLastVisitDetail, isDishEmpty, pastDishNames, saveDraft } from '../repositories/visitRepo'
import { processPhoto, requestPersist } from '../services/photoStorage'

type PhotoTarget = { dishId: string } | { visitType: PhotoType }
type PhotoSource = 'camera' | 'library' // camera＝すぐカメラが起動／library＝写真・コレクションから選ぶ

function DraftThumb({ photo, onDelete }: { photo: DraftPhoto; onDelete: () => void }) {
  const url = useBufferUrl(photo.thumb, photo.mime)
  return (
    <div className="p">
      {url && <img src={url} alt="" />}
      {photo.type !== 'dish' && <span className="kind">{labelOf(PHOTO_TYPES, photo.type)}</span>}
      <button type="button" className="del" aria-label="この写真を外す" onClick={onDelete}>
        ×
      </button>
    </div>
  )
}

function DishCard({
  dish,
  index,
  canDelete,
  names,
  busy,
  onChange,
  onDelete,
  onAddPhoto,
}: {
  dish: DraftDish
  index: number
  canDelete: boolean
  names: string[]
  busy: boolean
  onChange: (patch: Partial<DraftDish>) => void
  onDelete: () => void
  onAddPhoto: (source: PhotoSource) => void
}) {
  const [memoOpen, setMemoOpen] = useState(dish.memo !== '')
  const listId = `names-${dish.id}`
  return (
    <div className="card dish-card" id={`dish-${dish.id}`}>
      <div className="head">
        <b>{index + 1}品目</b>
        {canDelete && (
          <button type="button" className="toggle-link" style={{ color: 'var(--danger)' }} onClick={onDelete}>
            この料理を外す
          </button>
        )}
      </div>

      {dish.photos.length === 0 ? (
        <>
          <button type="button" className="add-photo wide" onClick={() => onAddPhoto('camera')} disabled={busy}>
            <IconCamera />
            {busy ? '写真を読み込み中…' : 'カメラで撮る'}
          </button>
          <button type="button" className="btn block pick-lib" onClick={() => onAddPhoto('library')} disabled={busy}>
            <IconImage /> 写真から選ぶ
          </button>
        </>
      ) : (
        <div className="photo-strip">
          {dish.photos.map((p) => (
            <DraftThumb key={p.id} photo={p} onDelete={() => onChange({ photos: dish.photos.filter((x) => x.id !== p.id) })} />
          ))}
          <div className="add-pair">
            <button type="button" className="add-photo" onClick={() => onAddPhoto('camera')} disabled={busy} aria-label="カメラでもう1枚撮る">
              <IconCamera />
              {busy ? '読み込み中' : '撮る'}
            </button>
            <button type="button" className="add-photo lib" onClick={() => onAddPhoto('library')} disabled={busy} aria-label="写真から追加する">
              <IconImage />
              選ぶ
            </button>
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor={`name-${dish.id}`}>品名</label>
        <input
          id={`name-${dish.id}`}
          className="input"
          value={dish.name}
          list={names.length ? listId : undefined}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="例：醤油ラーメン"
          enterKeyHint="done"
          autoComplete="off"
        />
        {names.length > 0 && (
          <datalist id={listId}>
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        )}
      </div>

      <div className="field">
        <span className="label">味</span>
        <Stars value={dish.taste_rating} onChange={(v) => onChange({ taste_rating: v })} label="味" />
      </div>
      <div className="field">
        <span className="label">量</span>
        <Choice options={AMOUNTS} value={dish.amount_rating} onChange={(v) => onChange({ amount_rating: v })} fill label="量" />
      </div>
      <div className="field">
        <span className="label">価格感</span>
        <Choice options={PRICE_FEELS} value={dish.price_rating} onChange={(v) => onChange({ price_rating: v })} fill label="価格感" />
      </div>
      <div className="field">
        <span className="label">また食べたい</span>
        <Choice options={WANT_AGAINS} value={dish.want_again} onChange={(v) => onChange({ want_again: v })} fill label="また食べたい" />
      </div>
      <div className="field yen">
        <input
          className="input num"
          inputMode="numeric"
          aria-label="この料理の金額"
          placeholder="金額（なくてもOK）"
          value={dish.price == null ? '' : String(dish.price)}
          onChange={(e) => onChange({ price: parseYen(e.target.value) })}
        />
      </div>
      {memoOpen ? (
        <div className="field">
          <label htmlFor={`memo-${dish.id}`}>この料理のメモ</label>
          <textarea id={`memo-${dish.id}`} className="input" value={dish.memo} onChange={(e) => onChange({ memo: e.target.value })} placeholder="例：麺かため、次は大盛りで" />
        </div>
      ) : (
        <button type="button" className="toggle-link" onClick={() => setMemoOpen(true)}>
          ＋ この料理のメモ
        </button>
      )}
    </div>
  )
}

export function RecordForm() {
  const nav = useNavigate()
  const [draft, setDraft] = useState<VisitDraft | null | undefined>(undefined)
  const [busy, setBusy] = useState<string | null>(null) // 写真を読み込み中の対象
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [genreOpen, setGenreOpen] = useState(false)
  const [toast, showToast] = useToast()
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)
  const target = useRef<PhotoTarget | null>(null)
  const finished = useRef(false)

  useEffect(() => {
    loadDraft().then((d) => {
      setDraft(d)
      if (d && !d.restaurant.genre) setGenreOpen(true)
    })
  }, [])

  // 入力のたびに下書きを保存（アプリが閉じられても続きから書ける）
  useEffect(() => {
    if (!draft || finished.current) return
    const t = setTimeout(() => {
      if (!finished.current) void saveDraftState(draft)
    }, 250)
    return () => clearTimeout(t)
  }, [draft])

  const rid = draft?.restaurant.id ?? null
  const editing = draft?.editingVisitId ?? null
  const last = useLiveQuery(() => (rid ? getLastVisitDetail(rid, editing) : null), [rid, editing])
  const names = useLiveQuery(() => (rid ? pastDishNames(rid) : []), [rid]) ?? []
  const cities = useLiveQuery(usedCities, []) ?? []

  if (draft === undefined) return <div className="page" />
  if (draft === null) return <Navigate to="/record" replace />

  const up = (patch: Partial<VisitDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const upDish = (id: string, patch: Partial<DraftDish>) =>
    setDraft((d) => (d ? { ...d, dishes: d.dishes.map((x) => (x.id === id ? { ...x, ...patch } : x)) } : d))

  const addDish = (init: Partial<DraftDish> = {}) => {
    const dish = { ...emptyDish(), ...init }
    setDraft((d) => (d ? { ...d, dishes: [...d.dishes, dish] } : d))
    setTimeout(() => document.getElementById(`dish-${dish.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  // 前回の料理を「今回も」：空の料理カードがあればそこへ、無ければ新しいカードに品名を写す
  const again = (d: Dish) => {
    const blank = draft.dishes.find((x) => isDishEmpty(x))
    if (blank) upDish(blank.id, { name: d.name, price: d.price })
    else addDish({ name: d.name, price: d.price })
    showToast(`「${d.name}」を入れました`)
  }

  const pickPhoto = (t: PhotoTarget, source: PhotoSource) => {
    target.current = t
    ;(source === 'camera' ? cameraInput : libraryInput).current?.click()
  }

  const onFiles = async (files: FileList | null) => {
    const t = target.current
    if (!files || files.length === 0 || !t) return
    const key = 'dishId' in t ? t.dishId : 'visit'
    setBusy(key)
    setError(null)
    try {
      const type: PhotoType = 'dishId' in t ? 'dish' : t.visitType
      const made: DraftPhoto[] = []
      for (const f of Array.from(files)) made.push(await processPhoto(f, type))
      setDraft((d) => {
        if (!d) return d
        if ('dishId' in t) {
          return { ...d, dishes: d.dishes.map((x) => (x.id === t.dishId ? { ...x, photos: [...x.photos, ...made] } : x)) }
        }
        return { ...d, visitPhotos: [...d.visitPhotos, ...made] }
      })
    } catch {
      setError('写真を読み込めませんでした。別の写真で試してください')
    } finally {
      setBusy(null)
      for (const r of [cameraInput, libraryInput]) if (r.current) r.current.value = ''
    }
  }

  const save = async () => {
    setError(null)
    setSaving(true)
    try {
      await saveDraftState(draft)
      const { visitId, restaurantId } = await saveDraft(draft)
      finished.current = true
      await clearDraft()
      void requestPersist()
      nav(editing ? `/visit/${visitId}` : `/restaurant/${restaurantId}`, { replace: true, state: { toast: '保存しました' } })
    } catch (e) {
      setError(e instanceof DraftError ? e.message : '保存できませんでした。もう一度押してください')
      setSaving(false)
    }
  }

  const cancel = async () => {
    const msg = editing ? '編集をやめますか？（変更は保存されません）' : 'この記録をやめますか？（入力した内容は消えます）'
    if (!window.confirm(msg)) return
    finished.current = true
    await clearDraft()
    nav(editing ? `/visit/${editing}` : '/', { replace: true })
  }

  const total = draft.dishes.reduce((s, d) => s + (d.price ?? 0), 0)

  return (
    <div className="page">
      <TopBar
        back={false}
        title={editing ? '記録を直す' : '今日の食事'}
        right={
          <button type="button" className="link-btn" onClick={cancel}>
            やめる
          </button>
        }
      />

      {/* capture を付けると、選ぶ画面を出さずにすぐカメラが起動する（iPhone・Android とも） */}
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFiles(e.target.files)} />
      <input ref={libraryInput} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="store-head">
          <div className="nm">{draft.restaurant.name}</div>
          <button type="button" className="btn" onClick={() => nav('/record?change=1')}>
            店を変える
          </button>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          {genreOpen ? (
            <>
              <span className="label">ジャンル</span>
              <div className="chips scroll">
                {GENRES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className="chip"
                    aria-pressed={draft.restaurant.genre === g}
                    onClick={() => {
                      up({ restaurant: { ...draft.restaurant, genre: draft.restaurant.genre === g ? '' : g } })
                      if (draft.restaurant.genre !== g) setGenreOpen(false)
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button type="button" className="toggle-link" onClick={() => setGenreOpen(true)}>
              {draft.restaurant.genre ? <span className="tag">{draft.restaurant.genre}</span> : null} ジャンルを{draft.restaurant.genre ? '変える' : '選ぶ'}
            </button>
          )}
          <CityField value={draft.restaurant.city} cities={cities} onChange={(city) => up({ restaurant: { ...draft.restaurant, city } })} />
        </div>
      </div>

      {last && (
        <div style={{ marginBottom: 16 }}>
          <LastVisitCard detail={last} onAgain={again} compact />
        </div>
      )}

      <h2 className="sec">食べたもの</h2>
      {draft.dishes.map((d, i) => (
        <DishCard
          key={d.id}
          dish={d}
          index={i}
          canDelete={draft.dishes.length > 1}
          names={names}
          busy={busy === d.id}
          onChange={(p) => upDish(d.id, p)}
          onDelete={() => {
            if (isDishEmpty(d) || window.confirm(`${i + 1}品目を外しますか？`)) up({ dishes: draft.dishes.filter((x) => x.id !== d.id) })
          }}
          onAddPhoto={(source) => pickPhoto({ dishId: d.id }, source)}
        />
      ))}
      <button type="button" className="btn block" style={{ borderStyle: 'dashed', borderColor: 'var(--ai)', color: 'var(--ai)' }} onClick={() => addDish()}>
        ＋ 料理を追加
      </button>

      <h2 className="sec">今回の食事</h2>
      <div className="card card-pad">
        <div className="field" style={{ marginTop: 0 }}>
          <span className="label">総合評価</span>
          <Stars value={draft.overall_rating} onChange={(v) => up({ overall_rating: v })} label="総合評価" />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="total">会計</label>
            <div className="yen">
              <input
                id="total"
                className="input num"
                inputMode="numeric"
                placeholder={total ? String(total) : ''}
                value={draft.total_price == null ? '' : String(draft.total_price)}
                onChange={(e) => up({ total_price: parseYen(e.target.value) })}
              />
            </div>
            {draft.total_price == null && total > 0 && (
              <button type="button" className="toggle-link small" onClick={() => up({ total_price: total })}>
                料理の合計 {fmtYen(total)} を入れる
              </button>
            )}
          </div>
          <div className="field">
            <span className="label">人数</span>
            <div className="stepper">
              <button type="button" aria-label="1人減らす" onClick={() => up({ people_count: Math.max(1, draft.people_count - 1) })}>
                −
              </button>
              <span className="num">{draft.people_count}人</span>
              <button type="button" aria-label="1人増やす" onClick={() => up({ people_count: draft.people_count + 1 })}>
                ＋
              </button>
            </div>
          </div>
        </div>
        <div className="field">
          <label htmlFor="when">日時</label>
          <input
            id="when"
            className="input"
            type="datetime-local"
            value={toLocalInput(draft.visited_at)}
            onChange={(e) => {
              const t = fromLocalInput(e.target.value)
              if (t != null) up({ visited_at: t })
            }}
          />
        </div>
        <div className="field">
          <span className="label">店の写真（外観・メニュー・レシート）</span>
          {draft.visitPhotos.length > 0 && (
            <div className="photo-strip" style={{ marginBottom: 8 }}>
              {draft.visitPhotos.map((p) => (
                <DraftThumb key={p.id} photo={p} onDelete={() => up({ visitPhotos: draft.visitPhotos.filter((x) => x.id !== p.id) })} />
              ))}
            </div>
          )}
          <div className="row">
            {(['exterior', 'menu', 'receipt'] as const).map((t) => (
              <button key={t} type="button" className="btn" style={{ padding: 0 }} disabled={busy === 'visit'} onClick={() => pickPhoto({ visitType: t }, 'camera')}>
                <IconCamera /> {labelOf(PHOTO_TYPES, t)}
              </button>
            ))}
          </div>
          <button type="button" className="toggle-link" disabled={busy === 'visit'} onClick={() => pickPhoto({ visitType: 'other' }, 'library')}>
            ＋ 写真から選ぶ
          </button>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="memo">メモ</label>
          <textarea id="memo" className="input" value={draft.memo} onChange={(e) => up({ memo: e.target.value })} placeholder="例：平日昼は並ぶ。駐車場あり" />
        </div>
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--danger)', fontWeight: 700 }}>
          {error}
        </p>
      )}

      <div className="sticky-action no-tabbar">
        <div>
          <button type="button" className="btn primary big" onClick={save} disabled={saving || busy != null}>
            {saving ? '保存中…' : busy ? '写真を読み込み中…' : editing ? '直した内容を保存' : '保存する'}
          </button>
        </div>
      </div>
      {toast}
    </div>
  )
}
