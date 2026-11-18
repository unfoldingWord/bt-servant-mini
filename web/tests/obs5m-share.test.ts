// Task 7: the 5M session in share and in the online context. The manual's answers are never in either, unless the team
// revealed that answer on that card (memory only); a card kept in the history (`m.card`, which carries every answer) is never read.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { withObs } from './obs-fixture'
import { answer, type ConvState, type Made } from '../src/pipeline'
import { buildContext, SESSION_RULES } from '../src/context'
import { newGraph } from '../src/graph'
import { loadFixture } from '../src/dev'
import { fiveOn } from './five-on'
import { cardOf, type Session } from '../src/obs5m'
import { shareSession, shareText } from '../src/share'
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
const s: Session = { story: 1, part: 'm1', at: 5, lang: 'en', tfLang: 'en', started: 1, done: ['intro', 'frames', 'community'] }
const card = cardOf(fx, s, null, 'en')!
const [q1, q2] = card.questions
const ctx = (revealed: string[], extra: Record<string, unknown> = {}) => {
  const g = newGraph()
  g.session = s
  const hist = { who: 'bot' as const, info: 'x', card: { questions: fx.questions.map((q) => ({ id: q.id, q: q.q, a: q.a })) } }
  return buildContext({ question: 'What does this frame say?', m: { who: 'bot', info: '' }, msgs: [{ who: 'me', text: 'hi' }, hist], graph: g, node: null, lang: 'en',
    fx, ui: 'en', revealed: new Set(revealed), ...extra })
}

describe('share a session', () => {
  test('the title, the source line, the parts done and their questions; no answer, with no reveal', () => {
    expect(answers.length).toBeGreaterThan(10)
    const t = shareSession(fx, s, new Set(), 'en')
    expect(t).toContain(fx.title)
    expect(t).toContain('obs-tf')
    expect(t).toContain(q1!.q)
    for (const a of answers) expect(t).not.toContain(a)
  })
  test('an answer revealed on a card goes in, that one only', () => {
    const t = shareSession(fx, s, new Set([q2!.id]), 'en')
    expect(t).toContain(q2!.a!)
    expect(t).not.toContain(q1!.a!)
  })
  test('a history entry carrying a card (every answer on it) never leaks', () => {
    const m: any = { who: 'bot', text: 'x', info: 'step', card: { questions: fx.questions.map((q) => ({ q: q.q, a: q.a })) } }
    const t = `${shareText(m, 'en') ?? ''} ${shareSession(fx, s, new Set(), 'en')}`
    for (const a of answers) expect(t).not.toContain(a)
  })
})

describe('the online context in a session', () => {
  test('M1 frame 5: the frame text and the rules, no answer', async () => {
    const { helps } = await ctx([])
    expect(helps).toContain(fx.frames[4]!.text)
    expect(helps).toContain(SESSION_RULES)
    expect(SESSION_RULES).toBe("Facilitate; never quiz; quote manual text only from this context; never write the team's draft.")
    expect(helps).toContain(q1!.q)
    for (const a of answers) expect(helps).not.toContain(a)
  })
  test('after revealing question 2: that answer only', async () => {
    const { helps } = await ctx([q2!.id])
    expect(helps).toContain(q2!.a!)
    expect([...new Set(answers.filter((a) => helps.includes(a)))]).toEqual([q2!.a!]) // (the tables repeat some answers)
  })
  test('with no session (or the dev fixture not given) the context is as before', async () => {
    const { helps } = await ctx([], { fx: undefined })
    expect(helps).not.toContain(SESSION_RULES)
  })
})

describe('usage counts of a session (no text)', () => {
  test('5m.start, 5m.step, 5m.help.tn and 5m.back once each in the Task 4 conversation', async () => {
    store.set('btsm.usage', '1')
    store.delete('btsm.usage.days')
    const c: ConvState = { last: null }
    const press = (f: { sheet?: Sheet }) => answer(c, { sheet: { ...f.sheet!, id: `t${Date.now()}` }, ui: 'en', meta: '(button)' } as Made, performance.now())
    let r: any = await turn(c, { q: '5M OBS 1' }, 'en')
    let steps = 1
    for (let i = 0; i < 60 && `${c.graph!.session!.part}/${c.graph!.session!.at}` !== 'm1/5'; i++, steps++) r = await press(r.reply.follow[0])
    const rn: any = await turn(c, { q: 'and the notes?' }, 'en')
    const back = rn.reply.sessionBack
    const { returnTo } = await import('../src/pipeline')
    await answer(c, returnTo(c, back.back, 'en')!, performance.now())
    const n = todayCounts()
    expect(n['5m.start']).toBe(1)
    expect(n['5m.step']).toBe(steps)
    expect(n['5m.help.tn']).toBe(1)
    expect(n['5m.back']).toBe(1)
    for (const k of Object.keys(n)) expect(k).not.toMatch(/OBS|Genesis|God/i)
    store.delete('btsm.usage')
  }, 60_000)
})
