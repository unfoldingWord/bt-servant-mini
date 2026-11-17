// The words of an OBS frame tied to its notes and key terms (obswords.ts): the quote rule (tc-study's), and the helps an OBS
// answer carries so main.ts can draw its words tappable. The drawing itself (view.ts linkObsWords) is checked in the browser.
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { ALL_PACKS, installPacks } from './fs-packs'
import { fullPhone, turn } from './harness'
import { withObs } from './obs-fixture'
import { type ObsQuote, obsStudyOf, wordSpans } from '../src/obswords'
import { shareText } from '../src/share'

afterAll(async () => { await installPacks(ALL_PACKS) })

const marked = (text: string, q: ObsQuote[]) => wordSpans(text, q).map(([a, b, k]) => `${text.slice(a, b)}=${k}`)

describe('wordSpans', () => {
  const t = 'This is how God made everything in the beginning. He created the universe. God saw it.'
  test('a word, words, and the Nth one', () => {
    expect(marked(t, [['God', 1, 't0']])).toEqual(['God=t0'])
    expect(marked(t, [['God', 2, 't0']])).toEqual(['God=t0'])
    expect(wordSpans(t, [['God', 2, 't0']])[0]![0]).toBe(t.lastIndexOf('God'))
    expect(marked(t, [['God', -1, 't0']])).toEqual(['God=t0', 'God=t0'])
    expect(marked(t, [['the beginning', 1, 'n0']])).toEqual(['the beginning=n0'])
    expect(marked(t, [['God', 3, 't0']])).toEqual([])
  })
  test('no case or Latin accents; a quote not there marks nothing (no search inside words)', () => {
    expect(marked(t, [['THE UNIVERSE', 1, 'n1']])).toEqual(['the universe=n1'])
    expect(marked('Él creó el mundo', [['el creo', 1, 'n0']])).toEqual(['Él creó=n0'])
    expect(marked(t, [['begin', 1, 'n0'], ['the world', 1, 'n1'], ['', 1, 'n2']])).toEqual([])
  })
  test('parts at & and …: the next match after the one before', () => {
    expect(marked(t, [['God & saw', 1, 'n0']])).toEqual(['God=n0', 'saw=n0'])
    expect(marked(t, [['made … beginning', 1, 'n0']])).toEqual(['made=n0', 'beginning=n0'])
    expect(marked(t, [['God... nothing', 1, 'n0']])).toEqual([])
  })
  test('helps on the same words share a piece; overlapping ones are cut where each starts', () => {
    expect(marked(t, [['God', 1, 't0'], ['God', 1, 'n0']])).toEqual(['God=t0 n0'])
    expect(marked(t, [['He created', 1, 'n0'], ['created the universe', 1, 'n1']])).toEqual(['He=n0', 'created=n0 n1', 'the universe=n1'])
  })
  test('Hindi keeps its vowel signs; Arabic compares without its vowel marks', () => {
    const hi = 'वे बहुत दुष्ट और उपद्रवी हो गए थे। यह इतना बुरा था'
    expect(marked(hi, [['बहुत दुष्ट और उपद्रवी', 1, 'n0']])).toEqual(['बहुत दुष्ट और उपद्रवी=n0'])
    expect(marked(hi, [['बुरी', 1, 'n1']])).toEqual([])
    expect(marked('خَلَقَ اللهُ السماء', [['الله', 1, 't0']])).toEqual(['اللهُ=t0'])
  })
})

describe('an OBS answer carries its helps', () => {
  beforeEach(async () => { await fullPhone(); await withObs('en') })

  test('a whole story: every frame its quotes, the notes and terms the panel opens', async () => {
    const o = (await obsStudyOf({ ref: 'obs 1', lang: 'en' }))!
    expect(o.lang).toBe('en')
    expect(o.n).toBe(1)
    expect(Object.keys(o.frames).length).toBeGreaterThan(10)
    const keys = (f: string, w: string) => o.frames[f]!.filter((q) => q[0] === w).map((q) => q[2])
    const n = keys('1', 'the beginning')[0]!
    expect(o.notes[+n.slice(1)]!.note).toContain('beginning of all things')
    const g = keys('1', 'God')[0]!
    expect(o.terms[+g.slice(1)]!.id).toBe('tw:kt/god')
    expect(o.terms[+g.slice(1)]!.title.length).toBeGreaterThan(0)
    // a term met in many frames is one term
    expect(o.terms.filter((x) => x.id === 'tw:kt/god').length).toBe(1)
  })
  test('one frame: its own quotes only; a frame or story that is not there: none', async () => {
    const o = (await obsStudyOf({ ref: 'obs 1:1', lang: 'en' }))!
    expect(Object.keys(o.frames)).toEqual(['1'])
    expect(await obsStudyOf({ ref: 'obs 1:99', lang: 'en' })).toBeNull()
    expect(await obsStudyOf({ ref: 'obs 51', lang: 'en' })).toBeNull()
    expect(await obsStudyOf({ ref: 'rut 1:1', lang: 'en' })).toBeNull()
  })
  test('the answer: obs on the reply, its words found in the frame lines it writes; the text and what is shared unchanged', async () => {
    const r: any = await turn({ last: null }, { q: 'OBS 1:1' }, 'en')
    const o = r.reply.obs
    expect(o?.n).toBe(1)
    const line = /^\*\*1:1\*\* (.+)$/m.exec(r.reply.info)![1]!
    const words = marked(line, o.frames['1'])
    expect(words).toContain('God=t0')
    expect(words.some((w: string) => w.startsWith('the beginning='))).toBe(true)
    expect(r.reply.info).not.toContain('<span')
    expect(shareText({ ...r.reply, who: 'bot' }, 'en')).toContain(line)
  })
  test('a Bible answer has none', async () => {
    const r: any = await turn({ last: null }, { q: 'Ruth 1:1' }, 'en')
    expect(r.reply.obs).toBeUndefined()
  })
})
