// Final review fixes: reveals never outlive the card (I1), the composer's session buttons on a cold start (I2), no tQ help on a
// checking step (R18), what a session shares (R19), the usage counts of helps (m1), Android back closes the outline (m6).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fullPhone, turn } from './harness'
import { withObs } from './obs-fixture'
import { answer, type ConvState, loadFixture5, type Made, sessionAsks } from '../src/pipeline'
import { buildContext } from '../src/context'
import { newGraph } from '../src/graph'
import { loadFixture } from '../src/dev'
import { fiveOn } from './five-on'
import { sheetOf, type Session } from '../src/obs5m'
import { forgetAllReveals, forgetCard, forgetReveals, KEY5, revealedIn, revealedOn, revealOn, saveSession } from '../src/obs5mstore'
import { shareSession } from '../src/share'
import { startRow, type Ctx } from '../src/suggest'
import { todayCounts } from '../src/usage'
import type { Sheet } from '../src/answer'

const store = new Map<string, string>()
const fake = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  key: () => null, length: 0,
}
const before = (globalThis as any).localStorage
beforeAll(async () => {
  ;(globalThis as any).localStorage = fake
  await fiveOn(true)
  await fullPhone()
})
afterAll(async () => {
  ;(globalThis as any).localStorage = before
  await withObs('en', 'installed')
})

const fx = await loadFixture()
const answers = fx.questions.map((q) => q.a).filter((a): a is string => !!a)
const press = (c: ConvState, f: { sheet?: Sheet }, ui = 'en') =>
  answer(c, { sheet: { ...f.sheet!, id: `t${Date.now()}` }, ui, meta: '(button)' } as Made, performance.now())
const ctx = (c: ConvState): Ctx => ({ ui: 'en', conv: c, helpsLang: null, packs: ['en'], books: null })
const src = (f: string) => readFileSync(join(import.meta.dir, '..', 'src', f), 'utf8')

describe('I1: reveals outlive neither the card nor the session', () => {
  const s: Session = { story: 1, part: 'm1', at: 5, lang: 'en', tfLang: 'en', started: 1, done: ['intro', 'frames', 'community'] }
  const q = fx.questions.find((x) => x.part === 'm1' && x.a)!
  const carried = async (ids: Set<string>) => {
    const g = newGraph()
    g.session = s
    const share = shareSession(fx, s, ids, 'en')
    const { helps } = await buildContext({ question: 'What?', m: { who: 'bot', info: '' }, msgs: [], graph: g, node: null, lang: 'en', fx, ui: 'en', revealed: ids })
    return { share, helps }
  }
  test('reveal, redraw (forgetCard), then share and context carry no answer', async () => {
    revealOn('c1', 'n1', q.id, true)
    expect(revealedIn('c1').has(q.id)).toBe(true)
    forgetCard('c1', 'n1') // renderMsg does this before drawCard
    expect(revealedOn('c1', 'n1').size).toBe(0)
    const off = await carried(revealedIn('c1'))
    for (const a of answers) expect(off.share + off.helps).not.toContain(a)
  })
  test('end of a session forgets that conversation only; erase everything forgets all', () => {
    revealOn('c1', 'n1', 'a', true)
    revealOn('c2', 'n1', 'b', true)
    forgetReveals('c1')
    expect([revealedIn('c1').size, revealedIn('c2').size]).toEqual([0, 1])
    forgetAllReveals()
    expect(revealedIn('c2').size).toBe(0)
  })
  test('main.ts wires them: renderMsg before drawCard, end5, eraseAll', () => {
    const m = src('main.ts')
    expect(m.indexOf('forgetCard(cv.id, m.node)')).toBeGreaterThan(0)
    expect(m.indexOf('forgetCard(cv.id, m.node)')).toBeLessThan(m.indexOf('drawCard(m.card'))
    expect(m).toContain('forgetReveals(conv().id)')
    expect(m).toContain('forgetAllReveals()')
  })
})

describe('I2: a cold start has the session chips', () => {
  test('before the tables are primed: no crash and no chip; after: [Resume] and the step buttons', async () => {
    await fiveOn(true, false)
    const s: Session = { story: 1, part: 'drafting', at: 6, lang: 'en', tfLang: 'en', started: 1, done: ['intro', 'frames'] }
    store.delete(KEY5)
    saveSession('c9', s)
    const c: ConvState = { last: null }
    expect(startRow(ctx(c)).items.some((x) => x.resume !== undefined)).toBe(false)
    await loadFixture5(1)
    expect(startRow(ctx(c)).items.some((x) => x.resume === 1)).toBe(true)
    const g = newGraph()
    g.session = s
    expect(startRow(ctx({ last: null, graph: g } as ConvState)).items.length).toBeGreaterThan(0)
  })
  test('main.ts uses the pipeline loader', () => {
    const m = src('main.ts')
    expect(m).toContain('loadFixture5(story, lang)')
    expect(m).not.toContain('loadFixture()')
  })
})

describe('R18: no tQ on a checking step', () => {
  test('the checking card offers no Questions help; a typed "the questions?" reads as none', async () => {
    const c: ConvState = { last: null }
    await turn(c, { q: '5M OBS 1' }, 'en')
    const f: any = await press(c, { sheet: sheetOf(fx, { ...c.graph!.session!, part: 'm1', at: 5 }, 'en') })
    expect(f.reply.follow.some((x: any) => /^Translation questions · /.test(x.label))).toBe(true)
    expect(sessionAsks('the questions?', c)).toEqual(['questions'])
    const ck: any = await press(c, { sheet: sheetOf(fx, { ...c.graph!.session!, part: 'checking', at: 4 }, 'en') })
    expect(ck.reply.follow.some((x: any) => /^Translation questions · /.test(x.label))).toBe(false)
    expect(ck.reply.follow.length).toBeGreaterThan(1) // the other helps stay
    expect(sessionAsks('the questions?', c)).toBeNull()
  }, 60_000)
})

describe('R19: shareSession', () => {
  test('the current part lists questions up to the current step only', () => {
    const s: Session = { story: 1, part: 'm1', at: 3, lang: 'en', tfLang: 'en', started: 1, done: ['intro', 'frames'] }
    const t = shareSession(fx, s, new Set(), 'en')
    const m1 = fx.questions.filter((q) => q.part === 'm1')
    expect(m1.length).toBeGreaterThan(4)
    expect(t).toContain(m1[0]!.q)
    expect(t).not.toContain(m1[m1.length - 1]!.q)
  })
  test('capped at the room of a shared answer, cut with an ellipsis, the link kept', () => {
    const s: Session = { story: 1, part: 'checking', at: 15, lang: 'en', tfLang: 'en', started: 1, done: ['intro', 'frames', 'community', 'm1', 'm2', 'm3', 'drafting'] }
    const big = { ...fx, questions: fx.questions.flatMap((q) => [q, { ...q, id: `${q.id}x`, q: `${q.q} ${'more words '.repeat(20)}` }]) }
    const t = shareSession(big, s, new Set(), 'en')
    expect(t.length).toBeLessThan(1000 + 120)
    expect(t).toContain('…')
    expect(t).toContain('https://bt-servant-mini')
  })
})

describe('m1: help counts only under a session step', () => {
  test('a term opened from a typed branch is not counted as a 5M help', async () => {
    store.set('btsm.usage', '1')
    store.delete('btsm.usage.days')
    const c: ConvState = { last: null }
    await turn(c, { q: '5M OBS 1' }, 'en')
    await turn(c, { q: 'Genesis 1:1' }, 'en')
    await turn(c, { q: 'what does create mean?' }, 'en')
    const n = todayCounts()
    for (const k of Object.keys(n)) expect(k).not.toMatch(/^5m\.help\.(twl|academy|passage)$/)
    store.delete('btsm.usage')
  }, 60_000)
})

describe('m6: Android back closes the outline', () => {
  test('__back closes the open outline (after the Map)', () => {
    const m = src('main.ts')
    const i = m.indexOf('if (mapIsOpen()) { closeMap(); return true }')
    expect(m.slice(i, i + 200)).toContain('if (outIsOpen()) { closeOutline(); return true }')
  })
})
