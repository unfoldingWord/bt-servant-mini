// The 5M session in the composer, saved and ended (Task 6). The empty box in a session offers its next step, then its frame
// ("Next: … ▸", "OBS 1:5 ▸"), away from it the way back; "notes" reads as the frame's ("✓ OBS 1:5 · notes"), a frame's number
// as that frame's step ("✓ frame 7"). Its place is kept in `btsm.5m.v1` (never with conversations off, never an answer), most
// recent first, resumed in a new conversation when its own is gone, erased with "Erase everything". [End session] gives the
// light path and the learning path their buttons back. Dev switch off: none of it.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fullPhone, turn } from './harness'
import { withObs } from './obs-fixture'
import { answer, type ConvState, type Made, MAX_CONVS, placeLabel } from '../src/pipeline'
import { newGraph, nodeOf } from '../src/graph'
import { loadFixture } from '../src/dev'
import { sheetOf, type Session } from '../src/obs5m'
import { W5 } from '../src/obs5mwords'
import { startRow, suggest, type Ctx } from '../src/suggest'
import { Composer } from '../src/composer'
import { endSession, forgetSessions, KEY5, resumeIn, resumeTarget, savedSessions, saveSession } from '../src/obs5mstore'
import type { Sheet } from '../src/answer'

const store = new Map<string, string>()
const fake = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  key: () => null, length: 0,
}
const before = (globalThis as any).localStorage
const devOnNow = () => store.set('btsm.dev.obs5m', '1')
beforeAll(async () => {
  ;(globalThis as any).localStorage = fake
  devOnNow()
  await fullPhone()
})
afterAll(async () => {
  ;(globalThis as any).localStorage = before
  await withObs('en', 'installed')
})
beforeEach(() => {
  store.delete(KEY5)
  store.delete('btsm.history')
  devOnNow()
})

const fx = await loadFixture()
const press = (c: ConvState, f: { sheet?: Sheet }, ui = 'en') =>
  answer(c, { sheet: { ...f.sheet!, id: `t${Date.now()}` }, ui, meta: '(button)' } as Made, performance.now())
const ctx = (c: ConvState, ui = 'en'): Ctx => ({ ui, conv: c, helpsLang: null, packs: ['en'], books: null })
const at = (c: ConvState) => `${c.graph!.session!.part}/${c.graph!.session!.at}`
const answers = fx.questions.map((q) => q.a).filter((a): a is string => !!a && a.length > 12)
/** A conversation in a session at M1 frame 5 */
async function atFrame5(): Promise<ConvState> {
  const c: ConvState = { last: null }
  await turn(c, { q: '5M OBS 1' }, 'en')
  await press(c, { sheet: sheetOf(fx, { ...c.graph!.session!, part: 'm1', at: 5 }, 'en') })
  expect(at(c)).toBe('m1/5')
  return c
}

describe('the composer in a session', () => {
  test('the empty box: [Next: … ▸] first, then the frame [OBS 1:5 ▸]; away from the step, the way back first', async () => {
    const c = await atFrame5()
    const row = startRow(ctx(c))
    expect(row.items[0]).toMatchObject({ kind: 'next', label: 'Next: Movement 1 · observation · frame 6/16 ▸' })
    expect(row.items[0]!.sheet).toMatchObject({ intent: 'obs5m', concept: 'obs5m:1/m1/6' })
    expect(row.items[1]).toMatchObject({ kind: 'place', label: 'OBS 1:5 ▸' })
    expect(row.items[1]!.sheet).toMatchObject({ intent: 'passage', ref: 'obs 1:5', what: ['text'] })
    // the ways of asking follow, as always
    expect(row.items.slice(2).every((x) => x.kind === 'shape')).toBe(true)
    // pressing [Next] is the next step, a line from frame 5
    const r6: any = await press(c, row.items[0]!)
    expect([r6.answered, at(c), nodeOf(c.graph, r6.node)!.edge]).toEqual(['obs5m', 'm1/6', 'line'])
    // the frame chip opens the frame, deeper under the step
    const rf: any = await press(c, startRow(ctx(c)).items[1]!)
    expect([rf.ref, nodeOf(c.graph, rf.node)!.edge]).toEqual(['obs 1:6', 'deeper'])
    // on a typed verse: the way back to the session first, then the verse it is on; no light path
    await turn(c, { q: 'Genesis 1:20' }, 'en')
    const away = startRow(ctx(c)).items
    expect(away[0]).toMatchObject({ kind: 'next', label: `← ${W5('en').back.replace('{place}', 'Movement 1 · observation · frame 6/16')}` })
    expect(away[0]!.sheet).toMatchObject({ intent: 'obs5m', concept: 'obs5m:1/m1/6' })
    // ar: the arrows mirror
    const ar = startRow(ctx(c, 'ar')).items[0]!
    expect(ar.label.startsWith('→ ')).toBe(true)
  }, 120_000)

  test('typed: "notes" → ✓ OBS 1:5 · notes (the frame\'s notes); "next" → ✓ Next; "7" → ✓ frame 7 and that frame\'s step', async () => {
    const c = await atFrame5()
    const n = suggest('notes', ctx(c))
    expect(n.items).toHaveLength(1)
    expect(n.items[0]).toMatchObject({ kind: 'ok', label: '✓ OBS 1:5 · notes', send: true })
    expect(n.items[0]!.sheet).toMatchObject({ intent: 'passage', ref: 'obs 1:5', what: ['notes'] })
    expect(suggest('notas', ctx(c, 'es')).items[0]).toMatchObject({ label: '✓ OBS 1:5 · notas', send: true })
    expect(suggest('next', ctx(c)).items[0]).toMatchObject({ label: '✓ Next: Movement 1 · observation · frame 6/16', send: true })
    const seven = suggest('7', ctx(c))
    expect(seven.items[0]).toMatchObject({ kind: 'ok', label: '✓ frame 7', send: true })
    expect(seven.items[0]!.sheet).toMatchObject({ intent: 'obs5m', concept: 'obs5m:1/m1/7' })
    expect(suggest('٧', ctx(c, 'ar')).items[0]).toMatchObject({ label: '✓ الإطار 7' })
    expect(suggest('17', ctx(c)).items).toEqual([]) // story 1 has 16 frames
    // the "✓" sends the box's text, which is read as it showed
    let sent = 0
    const box = { value: 'notes', focus() {} }
    const k = new Composer(box, { ui: () => 'en', conv: () => c, packs: () => ['en'], busy: () => false, send: () => { sent++ }, ask: () => {}, browse: () => {} }, () => {}, 0)
    k.refresh()
    await k.tap(k.row.items[0]!)
    expect(sent).toBe(1)
    const rn: any = await turn(c, { q: 'notes' }, 'en')
    expect([rn.answered, rn.ref]).toEqual(['passage', 'obs 1:5'])
    // back at the step, "7" goes to M1's observation of frame 7
    await press(c, { sheet: sheetOf(fx, c.graph!.session!, 'en') })
    const r7: any = await turn(c, { q: '7' }, 'en')
    expect([r7.answered, at(c), r7.reply.card.step.kind, r7.reply.card.frame.ref]).toEqual(['obs5m', 'm1/7', 'observation', 'obs 1:7'])
    // in a translation step: that frame's translation step
    await press(c, { sheet: sheetOf(fx, { ...c.graph!.session!, part: 'm1', at: 20 }, 'en') })
    const t: any = await turn(c, { q: '9' }, 'en')
    expect([t.reply.card.step.kind, t.reply.card.frame.ref]).toEqual(['translation', 'obs 1:9'])
    // in a part with no frames, a number is no frame
    await press(c, { sheet: sheetOf(fx, { ...c.graph!.session!, part: 'intro', at: 0 }, 'en') })
    expect(suggest('7', ctx(c)).items.some((x) => x.label.startsWith('✓ frame'))).toBe(false)
  }, 120_000)

  test('the Map and the way back say where a step is, and what a frame\'s help shows', async () => {
    const c = await atFrame5()
    const step = nodeOf(c.graph, c.graph!.cur)!
    expect(placeLabel(step, 'en')).toBe('Movement 1 · observation · frame 5/16')
    const rn: any = await turn(c, { q: 'and the notes?' }, 'en')
    expect(placeLabel(nodeOf(c.graph, rn.node)!, 'en')).toBe('OBS 1:5 · notes')
    expect(placeLabel(nodeOf(c.graph, rn.node)!, 'es')).toBe('OBS 1:5 · notas')
  }, 60_000)
})

describe('the saved place (btsm.5m.v1)', () => {
  const s1: Session = { story: 1, part: 'drafting', at: 6, lang: 'en', tfLang: 'en', started: 1000, done: ['intro', 'frames', 'community', 'm1', 'm2'],
    checked: { '1:3': { tq1: 'understood' } } }

  test('kept after a step: its place and marks only, never an answer; nothing at all when conversations are not kept', async () => {
    const c = await atFrame5()
    saveSession('c1', c.graph!.session!)
    const raw = store.get(KEY5)!
    expect(raw).toBeDefined()
    for (const a of answers) expect(raw).not.toContain(a)
    expect(savedSessions()).toEqual([expect.objectContaining({ story: 1, conv: 'c1', s: expect.objectContaining({ part: 'm1', at: 5 }) })])
    for (const k of Object.keys(savedSessions()[0]!.s)) expect(['at', 'checked', 'done', 'lang', 'part', 'started', 'story', 'tfLang']).toContain(k)
    // conversations not kept (menu > Safety): no write, nothing read, no [Resume]
    store.delete(KEY5)
    store.set('btsm.history', 'none')
    saveSession('c1', s1)
    expect(store.has(KEY5)).toBe(false)
    expect(savedSessions()).toEqual([])
    const fresh: ConvState = { last: null }
    expect(startRow(ctx(fresh)).items.some((x) => x.resume !== undefined)).toBe(false)
  }, 60_000)

  test('the most recently used first; [Resume] in an empty box names the last one', async () => {
    const now = Date.now
    try {
      let t = 5000
      Date.now = () => t
      saveSession('c1', s1)
      t = 9000
      saveSession('c2', { ...s1, story: 2, part: 'm1', at: 3 })
      t = 7000
      saveSession('c3', { ...s1, story: 3 })
    } finally {
      Date.now = now
    }
    expect(savedSessions().map((x) => [x.story, x.updated])).toEqual([[2, 9000], [3, 7000], [1, 5000]])
    // the chip: the mock has story 1 only, so its saved place is the one offered
    const row = startRow(ctx({ last: null }))
    expect(row.items[0]).toMatchObject({ kind: 'next', resume: 1, label: 'Resume OBS 1 · Drafting · draft · frame 7/16' })
    expect(startRow(ctx({ last: null }, 'es')).items[0]!.label).toBe('Retomar OBS 1 · Borrador · borrador · cuadro 7/16')
    // a tap hands the story to main.ts
    let resumed = -1
    const k = new Composer({ value: '', focus() {} }, { ui: () => 'en', conv: () => ({ last: null }), packs: () => [], busy: () => false, send: () => {}, ask: () => {}, browse: () => {}, resume: (n) => { resumed = n } }, () => {}, 0)
    k.focused = true
    k.refresh()
    await k.tap(k.row.items[0]!)
    expect(resumed).toBe(1)
  })

  test('its conversation gone (the app keeps 3): a new or empty conversation, at the saved step, with its parts and marks', async () => {
    saveSession('gone', s1)
    const e = savedSessions()[0]!
    const full = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, empty: false }))
    expect(resumeTarget('k1', full(3), 'k0', MAX_CONVS)).toEqual({ k: 'open', id: 'k1' })
    expect(resumeTarget(e.conv, full(2), 'k0', MAX_CONVS)).toEqual({ k: 'new' })
    expect(resumeTarget(e.conv, [...full(2), { id: 'k9', empty: true }], 'k0', MAX_CONVS)).toEqual({ k: 'empty', id: 'k9' })
    expect(resumeTarget(e.conv, full(MAX_CONVS), 'k0', MAX_CONVS)).toEqual({ k: 'here' })
    // the new conversation: the saved place put back, its step asked
    const c: ConvState = { last: null }
    resumeIn(c, e.s)
    const r: any = await press(c, { sheet: sheetOf(fx, e.s, e.s.lang) })
    expect([r.answered, at(c)]).toEqual(['obs5m', 'drafting/6'])
    expect(r.reply.card.frame.ref).toBe('obs 1:7')
    expect(c.graph!.session).toMatchObject({ started: 1000, done: s1.done, checked: s1.checked })
    // and it goes on from there
    const r8: any = await press(c, r.reply.follow[0])
    expect([r8.answered, at(c)]).toEqual(['obs5m', 'drafting/7'])
  }, 60_000)

  test('"Erase everything" and conversations turned off remove it', () => {
    saveSession('c1', s1)
    expect(store.has(KEY5)).toBe(true)
    forgetSessions()
    expect(store.has(KEY5)).toBe(false)
    // main.ts eraseAll calls it; protect.ts setKeepHistory(false) removes the key
    const src = (f: string) => readFileSync(join(import.meta.dir, '../src', f), 'utf8')
    expect(/function eraseAll\(\) \{[\s\S]{0,400}forgetSessions\(\)[\s\S]{0,60}newConv\(\)/.test(src('main.ts'))).toBe(true)
    expect(/setKeepHistory[\s\S]{0,600}put\('btsm\.5m\.v1', null\)/.test(src('protect.ts'))).toBe(true)
    expect(KEY5).toBe('btsm.5m.v1')
  })
})

describe('[End session]', () => {
  test('the light path comes back; the saved place stays, marked ended, and can be resumed', async () => {
    const c: ConvState = { last: null }
    await turn(c, { q: 'Voy a traducir Rut' }, 'es')
    const path = c.graph!.path
    const r: any = await turn(c, { q: '5M OBS 1' }, 'es')
    expect(r.answered).toBe('obs5m')
    saveSession('c1', c.graph!.session!)
    expect(c.graph!.pathPaused).toBe(true)
    const g0: any = await turn(c, { q: 'Génesis 1:20' }, 'es')
    expect([g0.reply.pathBack, !!g0.reply.sessionBack]).toEqual([undefined, true])
    endSession(c)
    expect(c.graph!.session).toBeUndefined()
    expect(c.graph!.pathPaused).toBeUndefined()
    expect(c.graph!.path).toEqual(path)
    expect(savedSessions()[0]).toMatchObject({ story: 1, conv: 'c1', ended: true })
    // an answer now: the way back to the light path, no way back to a session
    const g1: any = await turn(c, { q: 'Génesis 1:21' }, 'es')
    expect(g1.reply.sessionBack).toBeUndefined()
    expect(g1.reply.pathBack).toMatchObject({ toPath: true })
    // the empty box offers [Resume], then the light path's way back
    const items = startRow(ctx(c, 'es')).items
    expect(items[0]).toMatchObject({ resume: 1 })
    expect(items[1]).toMatchObject({ kind: 'next' })
    expect(items[1]!.resume).toBeUndefined()
  }, 120_000)

  test('a learning path\'s buttons come back after it', async () => {
    const c: ConvState = { last: null, graph: newGraph() }
    c.graph!.learn = { kind: 'intro', at: 'ta:intro/ta-intro', title: 'Introduction to Translation Academy', lang: 'en' }
    await turn(c, { q: '5M OBS 1' }, 'en')
    const g0: any = await turn(c, { q: 'Genesis 1:20' }, 'en')
    expect(g0.reply.pathBack).toBeUndefined()
    endSession(c)
    const g1: any = await turn(c, { q: 'Genesis 1:21' }, 'en')
    expect(g1.reply.pathBack).toMatchObject({ toPath: true })
    expect(g1.reply.sessionBack).toBeUndefined()
  }, 60_000)
})

describe('dev switch off', () => {
  test('no session chips, no [Resume], no session reading of "notes" or "7", labels as before', async () => {
    const c = await atFrame5()
    saveSession('c1', c.graph!.session!)
    const step = nodeOf(c.graph, c.graph!.cur)!
    store.delete('btsm.dev.obs5m')
    try {
      expect(startRow(ctx(c)).items.every((x) => x.kind === 'shape')).toBe(true)
      expect(startRow(ctx({ last: null })).items.some((x) => x.resume !== undefined)).toBe(false)
      expect(suggest('notes', ctx(c)).items.some((x) => x.label.includes('OBS'))).toBe(false)
      expect(suggest('7', ctx(c)).items.some((x) => x.label.includes('frame'))).toBe(false)
      expect(placeLabel(step, 'en')).toBe(step.label)
    } finally {
      devOnNow()
    }
  }, 60_000)
})
