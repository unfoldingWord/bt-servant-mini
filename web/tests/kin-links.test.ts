// Everything linked (Abel, Nov 18; encargo-ms-kin.md T4): a person leads to its verses, its Translation Words article and the
// stories of Open Bible Stories it is in; a verse or a frame leads to the people named there. Built in memory from xtopics.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { kinFixture } from './fixtures/kin/family'
import { kinQuestion, setKinReader } from '../src/kin'
import type { ConvState } from '../src/pipeline'
import type { Sheet } from '../src/answer'

const sheetOf = (o: Partial<Sheet>): Sheet => ({ id: 's', intent: 'passage', ref: null, what: ['text', 'notes'], version: null, concept: null, term: null, phrase: null, candidates: null, lang: 'en', ...o })
const open = (s: Partial<Sheet>, ui = 'en', c: ConvState = { last: null }) => turn(c, { q: '', sheet: sheetOf(s) }, ui)
const labels = (r: { reply: { follow?: { label: string }[] } }) => (r.reply.follow ?? []).map((f) => f.label)

describe('with the packs on disk', () => {
  // (the people index is built at idle in the app, warmKin: the links under a verse or an article wait for it)
  beforeAll(async () => {
    await fullPhone()
    await kinQuestion('sons of Isaac', 'en', null)
  })
  test('verse → people: Genesis 25:26 offers who is named there, and that button lists them, each a card', async () => {
    const c: ConvState = { last: null }
    const r = await open({ ref: 'gen 25:26' }, 'en', c)
    const here = (r.reply.follow ?? []).find((f) => f.sheet?.intent === 'kin')
    expect(here?.label).toMatch(/^People here: .*Isaac/)
    const list = await turn(c, { q: '', sheet: here!.sheet! }, 'en')
    expect(list.answered).toBe('family')
    expect(list.reply.intro).toMatch(/^People named in Genesis 25:26/)
    expect(labels(list)).toEqual(expect.arrayContaining(['Isaac', 'Esau']))
    const card = await turn(c, { q: '', sheet: list.reply.follow!.find((f) => f.label === 'Isaac')!.sheet! }, 'en')
    expect(card.reply.info).toMatch(/^\*\*Isaac\*\*/)
  })
  test('no "people here" before the index is built (never built during an answer)', async () => {
    const { resetKin } = await import('../src/kin')
    resetKin()
    const r = await open({ ref: 'gen 25:26' })
    expect((r.reply.follow ?? []).some((f) => f.sheet?.intent === 'kin')).toBe(false)
    await kinQuestion('sons of Isaac', 'en', null)
  })
  test('a whole chapter offers no "people here" (only a verse, or verses of a chapter)', async () => {
    const r = await open({ ref: 'gen 25' })
    expect((r.reply.follow ?? []).some((f) => f.sheet?.intent === 'kin')).toBe(false)
  })
  test('person → article and verses: Isaac’s card has his Translation Words article and his first verses', async () => {
    const r = await turn({ last: null }, { q: '', sheet: sheetOf({ intent: 'kin', what: ['who'], concept: 'per:isaac', lang: 'en' }) }, 'en')
    const f = r.reply.follow ?? []
    expect(f.some((x) => x.sheet?.concept === 'tw:names/isaac')).toBe(true)
    expect(f.some((x) => x.sheet?.intent === 'passage' && /^gen /.test(x.sheet.ref ?? ''))).toBe(true)
  })
  test('article → family: «Who was Isaac?» opens the article as today; one plain family line inside its fold, the whole family behind a button', async () => {
    const r = await turn({ last: null }, { q: 'Who was Isaac?', slots: null }, 'en')
    expect(r.answered).toBe('article')
    expect(r.concept).toBe('tw:names/isaac')
    const info = r.reply.info!
    // the line is plain (not bold), and inside the fold: before its end mark «◂», after the article's own text
    // (its sources in a short parenthesis: no source line of its own inside the fold)
    expect(info).toMatch(/\nFamily of Isaac: son of (Sarah and Abraham|Abraham and Sarah)[^\n]* \(TIPNR\)\.\n\n◂/)
    expect(info).not.toMatch(/\*\*Family of Isaac\*\*/)
    expect(info.indexOf('Family of Isaac')).toBeGreaterThan(info.indexOf('▸'))
    expect((r.reply.follow ?? []).some((f) => f.sheet?.intent === 'kin' && f.sheet.concept === 'per:isaac' && f.sheet.what[0] === 'family')).toBe(true)
  })
})

describe('with the hand-made reader (obs-frames, participant, occurs-in)', () => {
  beforeAll(async () => {
    await fullPhone()
    setKinReader(async () => kinFixture())
  })
  afterAll(() => setKinReader())
  test('person → stories: Isaac’s card offers OBS 5 (an event he takes part in, told in that story)', async () => {
    const r = await turn({ last: null }, { q: '', sheet: sheetOf({ intent: 'kin', what: ['who'], concept: 'per:isaac', lang: 'en' }) }, 'en')
    expect((r.reply.follow ?? []).some((f) => f.sheet?.ref === 'obs 5')).toBe(true)
  })
  test('frame → people: OBS 5:9 tells Genesis 25:26, so Isaac, Esau and Jacob are named in it', async () => {
    const r = await turn({ last: null }, { q: '', sheet: sheetOf({ intent: 'kin', what: ['here'], ref: 'obs 5:9', lang: 'en' }) }, 'es')
    expect(r.reply.intro).toMatch(/^Personas nombradas en OBS 5:9/)
    expect(r.reply.follow!.length).toBe(3)
  })
})

describe('the graph (review at 375 px, Nov 18)', () => {
  beforeAll(fullPhone)
  test('a verse a family answer shows goes deeper from it (no new topic, no drift)', async () => {
    const c: ConvState = { last: null }
    const r = await turn(c, { q: 'hijos de Isaac', slots: null }, 'es')
    const v = r.reply.follow!.find((f) => f.sheet?.ref === 'gen 25:26')!
    const p = await turn(c, { q: '', sheet: v.sheet! }, 'es')
    expect(c.graph!.nodes.find((n) => n.id === p.node)!.edge).toBe('deeper')
    expect(p.reply.drift).toBeFalsy()
  })
})
test('shownAs: the tW name first only when it is another name in the same script', async () => {
  const { shownAs, setKinReader: set } = await import('../src/kin')
  set(async () => kinFixture())
  try {
    expect(await shownAs('es-419', 'per:israel', 'Israel')).toBe('Jacob (Israel)')
    expect(await shownAs('es-419', 'per:israel', 'إسرائيل')).toBe('إسرائيل')
    expect(await shownAs('es-419', 'per:israel', 'Jacob')).toBe('Jacob')
  } finally {
    set()
  }
})
