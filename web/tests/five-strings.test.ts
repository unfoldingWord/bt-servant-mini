// The 5M session's own words follow the app's language, not the language of the last typed question (Abel, Nov 18, interface es,
// content en: "Back to the session: Checking · check · frame 4/16", "Share", "More", "Volver a OBS 4" in OBS 3).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { withObs } from './obs-fixture'
import { answer, backNow, type ConvState, env, type Made } from '../src/pipeline'
import { fiveOn } from './five-on'
import { startRow, type Ctx } from '../src/suggest'
import { shareButton } from '../src/share'
import { W5 } from '../src/obs5mwords'
import { newGraph } from '../src/graph'

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
/** A button pressed with the language the last answer had (main.ts runSheet(…, m.ui ?? nav)). */
const press = (c: ConvState, f: { sheet?: any }, ui: string) =>
  answer(c, { sheet: { ...f.sheet, id: `t${Date.now()}${Math.random()}` }, ui, meta: '(button)' } as Made, performance.now())

describe('5M session words in the app language', () => {
  test('a button pressed after an English answer in a Spanish app: the step, its buttons and the way back are in Spanish', async () => {
    const c: ConvState = { last: null }
    let r: any = await turn(c, { q: '5M OBS 1' }, 'es')
    for (let i = 0; i < 4; i++) r = await press(c, r.reply.follow[0], 'es')
    expect(r.reply.ui).toBe('es')
    // the answer before had English as its language: a button under it carries 'en'
    const notes = r.reply.follow.find((f: any) => f.sheet?.what?.includes('notes'))
    const rn: any = await press(c, notes, 'en')
    expect(rn.reply.sessionBack.label).toMatch(/^← Volver a la sesión: Cuadros · cuadro · cuadro \d+\/16$/)
    expect(rn.reply.sessionBack.label).not.toContain('Back to')
    // a step pressed from an English answer: its card, its next step and its place in Spanish
    const rs: any = await press(c, r.reply.follow[0], 'en')
    expect(rs.reply.ui).toBe('es')
    expect(rs.reply.follow[0].label).toStartWith('Siguiente: ')
    expect(rs.reply.sessionMark).toContain('Cuadros')
  })

  test('the app in each language: the way back is in that language', async () => {
    for (const ui of ['en', 'es', 'fr', 'id', 'hi', 'ar']) {
      const c: ConvState = { last: null }
      let r: any = await turn(c, { q: '5M OBS 1' }, ui)
      for (let i = 0; i < 3; i++) r = await press(c, r.reply.follow[0], ui === 'en' ? 'es' : 'en')
      const rn: any = await press(c, r.reply.follow.find((f: any) => f.sheet?.what?.includes('notes')), ui === 'en' ? 'es' : 'en')
      const place = (await import('../src/obs5m')).stepPlace
      const fx = (await import('../src/five')).fixtureNow5(1)!
      expect(rn.reply.sessionBack.label).toBe(`${ui === 'ar' ? '→' : '←'} ${W5(ui).back.replace('{place}', place(fx, c.graph!.session!, ui))}`)
    }
    env.nav = 'es'
  })

  test('backNow: a way back kept from before reads in the app language, with the place and the story it points at', async () => {
    const c: ConvState = { last: null }
    env.nav = 'es'
    let r: any = await turn(c, { q: '5M OBS 1' }, 'es')
    for (let i = 0; i < 4; i++) r = await press(c, r.reply.follow[0], 'es')
    const rn: any = await press(c, r.reply.follow.find((f: any) => f.sheet?.what?.includes('notes')), 'es')
    // drawn long ago, in English, with another story's number: the target is the truth
    const stale = { ...rn.reply.sessionBack, label: '← Back to the session: Checking · check · frame 4/16' }
    expect(backNow(c.graph, stale, 'es')).toBe(rn.reply.sessionBack.label)
    const g = newGraph()
    const staleBack = { label: '← Volver a OBS 4', sheet: rn.reply.sessionBack.sheet, back: 'nope' }
    expect(backNow(g, staleBack, 'es')).toBeNull() // (its point is not here: the label it has stays)
    expect(backNow(c.graph, { label: 'Siguiente: x', sheet: stale.sheet, sessionNext: true }, 'es')).toBeNull()
    expect(backNow(c.graph, { label: 'x' }, 'es')).toBeNull()
  })

  test('the composer row does not repeat the way back the last answer shows', async () => {
    const c: ConvState = { last: null }
    env.nav = 'es'
    let r: any = await turn(c, { q: '5M OBS 1' }, 'es')
    for (let i = 0; i < 4; i++) r = await press(c, r.reply.follow[0], 'es')
    await press(c, r.reply.follow.find((f: any) => /^gen /.test(f.sheet?.ref ?? '')), 'es') // (a Bible passage: away from the session)
    const ctx: Ctx = { ui: 'es', conv: c, helpsLang: 'en', packs: ['en'], books: null }
    const backs = (row: { items: { label: string }[] }) => row.items.filter((x) => x.label.startsWith('← '))
    expect(backs(startRow(ctx))).toHaveLength(1)
    expect(backs(startRow({ ...ctx, backShown: true }))).toHaveLength(0)
  })

  test('the Share button is labelled in the app language while sharing the answer in its own', () => {
    const had = (globalThis as any).document
    ;(globalThis as any).document = { createElement: () => ({ set innerHTML(_: string) {}, lastElementChild: { textContent: '' } }) }
    try {
      const m = { who: 'bot', info: 'In the beginning God created the heavens and the earth.', ui: 'en' }
      expect((shareButton(m, 'en', undefined, 'es') as any).lastElementChild.textContent).toBe('Compartir')
      expect((shareButton(m, 'en') as any).lastElementChild.textContent).toBe('Share')
    } finally {
      ;(globalThis as any).document = had
    }
  })
})
