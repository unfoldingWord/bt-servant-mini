// The two new buttons that lead to the 5M (pipeline.ts): [5M session for this story] under an Open Bible Story that has a session
// (dev switch `obs5m`), and [See the stories with a session] under "this story has no 5M session". With the switch off, neither.
import { fiveOn } from './five-on'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { withObs } from './obs-fixture'
import { type ConvState, tidy } from '../src/pipeline'
import { fiveAsk } from '../src/obs'
import { fiveText } from '../src/modes'
import { W5 } from '../src/obs5mwords'

const store = new Map<string, string>()
const fake = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k), key: () => null, length: 0,
}
const before = (globalThis as any).localStorage
beforeAll(async () => {
  ;(globalThis as any).localStorage = fake
  await fullPhone()
})
afterAll(async () => {
  ;(globalThis as any).localStorage = before
  await withObs('en', 'installed')
})
const on = () => fiveOn()
const off = () => fiveOn(false)

describe('under an Open Bible Story', () => {
  test('story 1 with the switch on: a button to its session, which starts it', async () => {
    await on()
    const c: ConvState = { last: null }
    const r: any = await turn(c, { q: 'OBS 1' }, 'en')
    const b = r.reply.follow.find((f: any) => f.label === W5('en').startStory)
    expect(b).toBeTruthy()
    // it sends the question typed: the session starts the way "5M OBS 1" starts it (chat label, 5m.start, Try again)
    expect(b.typed).toBe('5M OBS 1')
    expect(b.sheet).toBeUndefined()
    const s: any = await turn(c, { q: b.typed }, 'en')
    expect(s.answered).toBe('obs5m')
    expect(c.graph!.session).toMatchObject({ story: 1 })
    await off()
  })
  test('in every app language, in a frame’s answer too', async () => {
    await on()
    for (const ui of ['en', 'es', 'fr', 'id', 'hi', 'ar']) {
      const r: any = await turn({ last: null }, { q: 'OBS 1:3' }, ui)
      expect(r.reply.follow.some((f: any) => f.label === W5(ui).startStory)).toBe(true)
    }
    await off()
  })
  test('a story with no session, and the switch off: no such button', async () => {
    await on()
    const r3: any = await turn({ last: null }, { q: 'OBS 3' }, 'en')
    expect(r3.reply.follow.some((f: any) => f.label === W5('en').startStory)).toBe(false)
    await off()
    const r1: any = await turn({ last: null }, { q: 'OBS 1' }, 'en')
    for (const ui of ['en', 'es', 'fr', 'id', 'hi', 'ar'])
      expect(r1.reply.follow.some((f: any) => f.label === W5(ui).startStory)).toBe(false)
  })
  test('not while a session is on already (it would start over)', async () => {
    await on()
    const c: ConvState = { last: null }
    await turn(c, { q: '5M OBS 1' }, 'en')
    const r: any = await turn(c, { q: 'OBS 1' }, 'en')
    expect(r.reply.follow.some((f: any) => f.label === W5('en').startStory)).toBe(false)
    await off()
  })
})

describe('the next steps keep every typed button', () => {
  test('typed follows are told apart by their text; the same text twice is one; others are not taken for them', async () => {
    const out = await tidy([
      { label: 'a', typed: '5M OBS 1' }, { label: 'b', typed: '5M OBS 2' }, { label: 'c', typed: '5M OBS 1' },
      { label: 'd', again: { q: 'x' } }, { label: 'e', browse: { mode: 'obs5m' } }, { label: 'f', browse: {} },
    ], 'en')
    expect(out.map((f) => f.label)).toEqual(['a', 'b', 'd', 'e', 'f'])
  })
  test('the button’s text and the tap’s text are spelled in one place', () => {
    expect(fiveAsk(1)).toBe('5M OBS 1')
    expect(fiveText(7)).toBe(fiveAsk(7))
  })
})

describe('a story with no session', () => {
  test('says so and offers the stories that have one (Browse’s 5M view), in every app language', async () => {
    await on()
    for (const ui of ['en', 'es', 'fr', 'id', 'hi', 'ar']) {
      const r: any = await turn({ last: null }, { q: '5M OBS 3' }, ui)
      const b = r.reply.follow.find((f: any) => f.label === W5(ui).seeStories)
      expect(b).toBeTruthy()
      expect(b.browse).toEqual({ mode: 'obs5m' })
      expect(b.sheet).toBeUndefined()
    }
    expect(W5('ar').seeStories).toBe('عرض القصص التي لها جلسة')
    await off()
  })
})
