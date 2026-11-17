// The 5M study session in the conversation (Task 4: pipeline.ts route `obs5m`, `sessionStep`; graph.ts `session`): "5M OBS 1"
// starts it at its intro card, every step is a turn whose first button is the next step, the frame's helps (2c's OBS answers)
// go `deeper` from the step and offer the way back to it, a typed reference is a `branch` with the way back, the Map groups
// the session, a light path is paused (kept, not offered). Dev switch off: "5M OBS 1" is 2c's story answer, as before.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { withObs } from './obs-fixture'
import { answer, type ConvState, type Made, returnTo } from '../src/pipeline'
import { type GNode, mapRows, newGraph, nodeOf } from '../src/graph'
import { loadFixture } from '../src/dev'
import { sheetOf, type Session } from '../src/obs5m'
import { W5 } from '../src/obs5mwords'
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

const fx = await loadFixture()
/** A button pressed (no question): the sheet as main.ts runSheet sends it. */
const press = (c: ConvState, f: { sheet?: Sheet }, ui = 'en') =>
  answer(c, { sheet: { ...f.sheet!, id: `t${Date.now()}` }, ui, meta: '(button)' } as Made, performance.now())
/** The ways back under an answer, the session's first (main.ts draws them on one row). */
const backs = (r: any): any[] => [r.reply.sessionBack, r.reply.back, r.reply.pathBack].filter(Boolean)
const node = (c: ConvState, r: { node: string | null }): GNode => nodeOf(c.graph, r.node)!
const answers = fx.questions.map((q) => q.a).filter((a): a is string => !!a)
const backTo = (place: string) => `← ${W5('en').back.replace('{place}', place)}`
const at = (c: ConvState) => `${c.graph!.session!.part}/${c.graph!.session!.at}`

describe('a 5M session (dev on)', () => {
  test('5M OBS 1 → … → M1 frame 5 → notes (deeper) → Academy (deeper) → back to the session → next (line) → Genesis 1:20 (branch)', async () => {
    const c: ConvState = { last: null }
    const r0: any = await turn(c, { q: '5M OBS 1' }, 'en')
    expect(r0.answered).toBe('obs5m')
    expect(r0.route).toBe('obs5m')
    expect(r0.reply.card.step.part).toBe('intro')
    expect(r0.reply.card.blocks.join('\n')).toContain('Key Idea')
    expect(r0.reply.follow[0].sessionNext).toBe(true)
    expect(r0.reply.sessionMark).toBe('Introduction · text')
    expect(c.graph!.session).toMatchObject({ story: 1, part: 'intro', at: 0 })
    const n0 = node(c, r0)
    expect([n0.kind, n0.edge]).toEqual(['obs5m', 'start'])
    // next, step by step, to M1's observation of frame 5: each a `line` from the step before
    let r: any = r0
    let prev = n0
    for (let i = 0; i < 60 && at(c) !== 'm1/5'; i++) {
      const nx = r.reply.follow[0]
      expect(nx.sessionNext).toBe(true)
      r = await press(c, nx)
      expect(r.answered).toBe('obs5m')
      const n = node(c, r)
      expect([n.edge, n.parent]).toEqual(['line', prev.id])
      prev = n
    }
    expect(at(c)).toBe('m1/5')
    const f5 = prev
    const card = r.reply.card
    expect(card.step.kind).toBe('observation')
    expect(card.frame).toEqual({ ref: 'obs 1:5', text: fx.frames[4]!.text, image: fx.frames[4]!.image })
    expect(card.questions.map((q: any) => q.q)).toEqual(['What else did God create on the third day?', "What was God's response to the trees and plants he created on the third day?"])
    expect(card.questions[0].a).toBe('On the third day, God also created trees and plants.')
    // the answers ride on the card, hidden by the view: never in the answer's text
    for (const a of answers) expect(`${r.reply.text ?? ''} ${r.reply.info ?? ''} ${r.reply.intro ?? ''}`).not.toContain(a)
    expect(r.reply.sessionMark).toBe('Movement 1 · observation · frame 5/16')
    // under the step: the next step, the frame's helps (2c's OBS 1:5 answers), its Bible passage, the Academy articles its notes cite
    const f = r.reply.follow as any[]
    expect(f[0]).toMatchObject({ sessionNext: true, label: 'Next: Movement 1 · observation · frame 6/16' })
    const obs = f.filter((x) => x.sheet?.intent === 'passage' && x.sheet.ref === 'obs 1:5').map((x) => x.sheet.what.join(','))
    expect(obs).toEqual(['notes', 'terms', 'questions'])
    expect(f.some((x) => x.sheet?.intent === 'passage' && /^gen /.test(x.sheet.ref))).toBe(true)
    const academy = f.filter((x) => x.sheet?.intent === 'article' && x.sheet.concept.startsWith('ta:')).map((x) => x.sheet.concept)
    expect(academy).toEqual(['ta:translate/figs-quotations', 'ta:translate/figs-imperative'])
    expect(f.length).toBeLessThanOrEqual(9)
    expect(f.findIndex((x) => x.sheet?.ref === 'obs 1:5')).toBe(1)
    expect(f5.links).toEqual(expect.arrayContaining(['tw:kt/god', 'tw:kt/good', 'ta:translate/figs-quotations', 'obs 1:5']))
    // the light path's buttons never under a session card
    expect(f.some((x) => x.pathNext)).toBe(false)

    // "and the notes?": OBS 1:5's notes, deeper from the step; the first way back is to the session
    const rn: any = await turn(c, { q: 'and the notes?' }, 'en')
    expect([rn.answered, rn.ref]).toEqual(['passage', 'obs 1:5'])
    expect(rn.reply.info).toContain('Then God said')
    const nn = node(c, rn)
    expect([nn.edge, nn.parent]).toEqual(['deeper', f5.id])
    expect(backs(rn)[0]).toMatchObject({ toSession: true, label: backTo('Movement 1 · observation · frame 5/16'), back: f5.id })
    expect(backs(rn)).toHaveLength(1) // (the graph's way back to the same step is that one)
    expect(c.graph!.session).toMatchObject({ part: 'm1', at: 5 })

    // its Academy button: deeper again, still offering the way back to the session
    const ab = (rn.reply.follow as any[]).find((x) => x.sheet?.intent === 'article' && x.sheet.concept === 'ta:translate/figs-quotations')
    expect(ab).toBeDefined()
    const ra: any = await press(c, ab)
    expect(ra.concept).toBe('ta:translate/figs-quotations')
    const na = node(c, ra)
    expect([na.edge, na.parent]).toEqual(['deeper', nn.id])
    expect(backs(ra)[0]).toMatchObject({ toSession: true, label: backTo('Movement 1 · observation · frame 5/16'), back: f5.id })
    expect(ra.reply.drift).toBeFalsy()

    // the way back: the same step, the same point
    const made = returnTo(c, backs(ra)[0].back, 'en')!
    expect(made).not.toBeNull()
    expect(made.at).toBe(f5.id)
    const count = c.graph!.nodes.length
    const rb: any = await answer(c, made, performance.now())
    expect([rb.answered, rb.node, c.graph!.cur]).toEqual(['obs5m', f5.id, f5.id])
    expect(c.graph!.nodes.length).toBe(count)
    expect(rb.reply.sessionBack).toBeUndefined()
    // next: frame 6, a line from frame 5
    const r6: any = await press(c, rb.reply.follow[0])
    expect(at(c)).toBe('m1/6')
    const f6 = node(c, r6)
    expect([f6.edge, f6.parent]).toEqual(['line', f5.id])

    // a typed reference: answered as usual, a new topic, with the way back to the session and no new conversation offered
    const rg: any = await turn(c, { q: 'Genesis 1:20' }, 'en')
    expect([rg.answered, rg.ref]).toEqual(['passage', 'gen 1:20'])
    const ng = node(c, rg)
    expect([ng.edge, ng.parent]).toEqual(['branch', f6.id])
    expect(backs(rg)[0]).toMatchObject({ toSession: true, label: backTo('Movement 1 · observation · frame 6/16'), back: f6.id })
    expect(rg.reply.drift).toBeFalsy()
    expect(c.graph!.session).toMatchObject({ part: 'm1', at: 6 })

    // the Map: one group row for the session, its steps under it, the consultations under the step they came from
    const rows = mapRows(c.graph!, new Set(c.graph!.nodes.map((x) => x.id)))
    const groups = rows.filter((x) => x.k === 'group')
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ label: 'OBS 1 · 5M', depth: 0 })
    const depth = (id: string) => rows.findIndex((x) => x.k === 'node' && x.node.id === id)
    const row = (id: string) => rows[depth(id)] as { depth: number }
    expect(rows.filter((x) => x.k === 'node' && x.node.kind === 'obs5m').every((x) => x.depth === 1)).toBe(true)
    expect(rows.indexOf(groups[0]!)).toBe(0)
    expect(depth(f5.id)).toBeLessThan(depth(nn.id))
    expect(depth(nn.id)).toBeLessThan(depth(na.id))
    expect(depth(na.id)).toBeLessThan(depth(f6.id))
    expect([row(nn.id).depth, row(na.id).depth, row(ng.id).depth]).toEqual([2, 3, 2])
  }, 180_000)

  test('from any depth the way back: step → notes → Academy → typed verse (its own follow-ups) → back to the same step → next', async () => {
    const c: ConvState = { last: null }
    await turn(c, { q: '5M OBS 1' }, 'en')
    const r5: any = await press(c, { sheet: sheetOf(fx, { ...c.graph!.session!, part: 'm1', at: 5 }, 'en') })
    const step = node(c, r5)
    // at the step: "and the notes?" is its frame's
    const rn: any = await turn(c, { q: 'and the notes?' }, 'en')
    expect([rn.ref, node(c, rn).edge, node(c, rn).parent]).toEqual(['obs 1:5', 'deeper', step.id])
    const ra: any = await press(c, (rn.reply.follow as any[]).find((x) => x.sheet?.concept === 'ta:translate/figs-quotations'))
    expect(node(c, ra).edge).toBe('deeper')
    const rg: any = await turn(c, { q: 'Genesis 1:20' }, 'en')
    expect([rg.ref, node(c, rg).edge]).toEqual(['gen 1:20', 'branch'])
    // on the typed verse, follow-ups are about it (R9), not about the session's frame or step
    const gn: any = await turn(c, { q: 'and the notes?' }, 'en')
    expect([gn.answered, gn.ref]).toEqual(['passage', 'gen 1:20'])
    expect(gn.reply.card).toBeUndefined()
    const gv: any = await turn(c, { q: 'the next verse' }, 'en')
    expect([gv.answered, gv.ref]).toEqual(['passage', 'gen 1:21'])
    expect(c.graph!.session).toMatchObject({ part: 'm1', at: 5 })
    // its way back: the same step, no new point, the session where it was
    const sb = backs(gv)[0]
    expect(sb).toMatchObject({ toSession: true, back: step.id })
    const count = c.graph!.nodes.length
    const made = returnTo(c, sb.back, 'en')!
    const rb: any = await answer(c, made, performance.now())
    expect([rb.answered, rb.node, c.graph!.cur, c.graph!.nodes.length]).toEqual(['obs5m', step.id, step.id, count])
    expect(c.graph!.session).toMatchObject({ part: 'm1', at: 5 })
    // and on from there: the following step, on the line
    const r6: any = await press(c, rb.reply.follow[0])
    expect([at(c), node(c, r6).edge, node(c, r6).parent]).toEqual(['m1/6', 'line', step.id])
  }, 120_000)

  test('typed in a session: "the key terms?", "the questions?" are the frame\'s; "next", "siguiente" the next step', async () => {
    const c: ConvState = { last: null }
    await turn(c, { q: '5M OBS 1' }, 'en')
    const s5: Session = { ...c.graph!.session!, part: 'm1', at: 5 }
    await press(c, { sheet: sheetOf(fx, s5, 'en') })
    expect(at(c)).toBe('m1/5')
    const t = await turn(c, { q: 'the key terms?' }, 'en')
    expect([t.ref, t.answered]).toEqual(['obs 1:5', 'passage'])
    const q = await turn(c, { q: 'the questions?' }, 'en')
    expect(q.ref).toBe('obs 1:5')
    expect(q.reply.info).toContain('Comprehension questions for OBS 1:5')
    const n = await turn(c, { q: 'next' }, 'en')
    expect([n.answered, at(c)]).toEqual(['obs5m', 'm1/6'])
    const s = await turn(c, { q: '¿y el siguiente?' }, 'es')
    expect([s.answered, at(c)]).toEqual(['obs5m', 'm1/7'])
    const y = await turn(c, { q: 'y las notas?' }, 'es')
    expect(y.ref).toBe('obs 1:7')
  }, 120_000)

  test('a translation step: its terms are buttons to the frame\'s key-term article when the TWL has it', async () => {
    const c: ConvState = { last: null }
    await turn(c, { q: '5M OBS 1' }, 'en')
    const r: any = await press(c, { sheet: sheetOf(fx, { ...c.graph!.session!, part: 'm1', at: 18 }, 'en') })
    const card = r.reply.card
    expect([card.step.kind, card.frame.ref]).toEqual(['translation', 'obs 1:1'])
    const by = Object.fromEntries(card.terms.map((t: any) => [t.term, t.concept]))
    expect(by.God).toBe('tw:kt/god')
    expect(by["God's"]).toBe('tw:kt/god')
    expect(by['In the beginning']).toBeNull()
    expect(card.terms[0].text).toBe(fx.terms.find((t) => t.frame === '1:1' && t.term === 'God')!.text)
    expect(card.tfLang).toBe('en')
    // its Bible passage (the story's range) is a help of the step: deeper from it, with the way back
    const step = node(c, r)
    const bible = (r.reply.follow as any[]).find((f) => f.sheet?.intent === 'passage' && /^gen /.test(f.sheet.ref))
    const rb: any = await press(c, bible)
    expect([node(c, rb).edge, node(c, rb).parent]).toEqual(['deeper', step.id])
    expect(backs(rb)[0]).toMatchObject({ toSession: true, back: step.id })
    // on that passage, follow-ups are about it (R11), not the session's frame or next step
    const bn: any = await turn(c, { q: 'and the notes?' }, 'en')
    expect([bn.answered, /^gen /.test(bn.ref)]).toEqual(['passage', true])
    const bv: any = await turn(c, { q: 'the next verse' }, 'en')
    expect([bv.answered, /^gen /.test(bv.ref)]).toEqual(['passage', true])
    expect(c.graph!.session).toMatchObject({ part: 'm1', at: 18 })
  }, 60_000)

  test('a story with no session says so; the obs unit missing keeps the card and the next step, no helps', async () => {
    const c: ConvState = { last: null }
    const r: any = await turn(c, { q: '5M OBS 3' }, 'en')
    expect(r.answered).not.toBe('obs5m')
    expect(r.reply.info ?? r.reply.intro).toContain(W5('en').noSession.replace('{lang}', 'English'))
    expect(r.reply.card).toBeUndefined()
    await withObs('en', 'none')
    try {
      const c2: ConvState = { last: null }
      await turn(c2, { q: '5M OBS 1' }, 'en')
      const r5: any = await press(c2, { sheet: sheetOf(fx, { ...c2.graph!.session!, part: 'm1', at: 5 }, 'en') })
      expect(r5.answered).toBe('obs5m')
      expect(r5.reply.card.questions).toHaveLength(2)
      expect(r5.reply.follow.map((x: any) => !!x.sessionNext)).toEqual([true])
      expect(node(c2, r5).links ?? []).toEqual([])
    } finally {
      await withObs('en', 'installed')
    }
  }, 60_000)

  test('a light path is paused by the session: kept, not offered', async () => {
    const c: ConvState = { last: null }
    await turn(c, { q: 'Voy a traducir Rut' }, 'es')
    const path = c.graph!.path
    expect(path?.book).toBe('rut')
    const r: any = await turn(c, { q: '5M OBS 1' }, 'es')
    expect(r.answered).toBe('obs5m')
    expect(c.graph!.pathPaused).toBe(true)
    expect(c.graph!.path).toEqual(path)
    expect(c.graph!.pathNext).toBeUndefined()
    for (const x of [r, await press(c, r.reply.follow[0], 'es')]) {
      expect(x.reply.follow.some((f: any) => f.pathNext)).toBe(false)
      expect([x.reply.pathMark, x.reply.pathBack]).toEqual([undefined, undefined])
    }
    expect(c.graph!.path).toEqual(path)
  }, 60_000)

  test('a learning path offers nothing under session cards either (R10)', async () => {
    const c: ConvState = { last: null, graph: newGraph() }
    c.graph!.learn = { kind: 'intro', at: 'ta:intro/ta-intro', title: 'Introduction to Translation Academy', lang: 'en' }
    const r: any = await turn(c, { q: '5M OBS 1' }, 'en')
    expect(r.answered).toBe('obs5m')
    for (const x of [r, await press(c, r.reply.follow[0])]) {
      expect(x.reply.follow.some((f: any) => f.pathNext || f.toPath)).toBe(false)
      expect([x.reply.pathMark, x.reply.pathBack]).toEqual([undefined, undefined])
      expect(x.reply.follow[0].sessionNext).toBe(true)
    }
  }, 60_000)
})

describe('dev switch off', () => {
  test('"5M OBS 1" is 2c\'s story answer, as before', async () => {
    store.delete('btsm.dev.obs5m')
    try {
      const c: ConvState = { last: null }
      const r: any = await turn(c, { q: '5M OBS 1' }, 'en')
      expect(r.answered).not.toBe('obs5m')
      expect([r.answered, r.ref]).toEqual(['passage', 'obs 1'])
      expect(r.reply.card).toBeUndefined()
      expect(c.graph!.session).toBeUndefined()
    } finally {
      devOnNow()
    }
  }, 60_000)
})
