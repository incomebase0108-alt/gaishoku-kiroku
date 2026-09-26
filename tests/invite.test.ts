import { describe, expect, it } from 'vitest'
import { inviteUrl, lineShareUrl, withExternal } from '../src/services/invite'
import { decodeShared, shareUrl, type SharedStore } from '../src/services/share'

describe('友だちに教えるリンク', () => {
  it('LINE で外のブラウザに開かせる印を、ハッシュより前に付ける', () => {
    expect(withExternal('https://a.jp/g/')).toBe('https://a.jp/g/?openExternalBrowser=1')
    expect(withExternal('https://a.jp/g/?x=1#/shared?d=AB-_')).toBe('https://a.jp/g/?x=1&openExternalBrowser=1#/shared?d=AB-_')
    expect(withExternal(withExternal('https://a.jp/g/'))).toBe('https://a.jp/g/?openExternalBrowser=1')
  })

  it('公開先の URL を指す', () => {
    expect(inviteUrl()).toBe('https://incomebase0108-alt.github.io/gaishoku-kiroku/?openExternalBrowser=1')
  })

  it('LINE の送る画面に文面と URL がそのまま入る', () => {
    const u = new URL(lineShareUrl('こんにちは&?#', 'https://a.jp/?openExternalBrowser=1'))
    expect(u.origin + u.pathname).toBe('https://line.me/R/share')
    expect(u.searchParams.get('text')).toBe('こんにちは&?#\nhttps://a.jp/?openExternalBrowser=1')
  })

  it('店を送るリンクは印を付けても受け取り側で読める', () => {
    const s: SharedStore = { v: 1, name: '松屋', genre: '定食', city: '名古屋市', latitude: 35.1, longitude: 136.8, visits: 2, lastAt: 1, overall: 4, dishes: [] }
    const url = shareUrl(s, 'https://a.jp/g/#/restaurant/x')
    expect(url.startsWith('https://a.jp/g/?openExternalBrowser=1#/shared?d=')).toBe(true)
    const d = new URLSearchParams(url.split('#')[1].split('?')[1]).get('d')!
    expect(decodeShared(d)?.name).toBe('松屋')
  })
})
