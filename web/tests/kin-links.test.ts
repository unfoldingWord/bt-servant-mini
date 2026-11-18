// Everything linked (Abel, Nov 18; encargo-ms-kin.md T4): a person leads to its verses, its Translation Words article and the
// stories of Open Bible Stories it is in; a verse or a frame leads to the people named there. Built in memory from xtopics.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { kinFixture } from './fixtures/kin/family'
import { setKinReader } from '../src/kin'
import type { ConvState } from '../src/pipeline'
import type { Sheet } from '../src/answer'

const sheetOf = (o: Partial<Sheet>): Sheet => ({ id: 's', intent: 'passage', ref: null, what: ['text', 'notes'], version: null, concept: null, term: null, phrase: null, candidates: null, lang: 'en', ...o })
const open = (s: Partial<Sheet>, ui = 'en', c: ConvState = { last: null }) => turn(c, { q: '', sheet: sheetOf(s) }, ui)
const labels = (r: { reply: { follow?: { label: string }[] } }) => (r.reply.follow ?? []).map((f) => f.label)

describe('with the packs on disk', () => {
  beforeAll(fullPhone)
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
  test('article → family: «Who was Isaac?» opens the article as today, with his family at the end and the way to his card', async () => {
    const r = await turn({ last: null }, { q: 'Who was Isaac?', slots: null }, 'en')
    expect(r.answered).toBe('article')
    expect(r.concept).toBe('tw:names/isaac')
    expect(r.reply.info).toMatch(/\*\*Family of Isaac\*\* — Parents: Sarah and Abraham · Spouses: Rebekah · Children: Esau/)
    expect(r.reply.info).toMatch(/\*Family data: TIPNR \(STEPBible\)\.\*$/)
    expect((r.reply.follow ?? []).some((f) => f.sheet?.intent === 'kin' && f.sheet.concept === 'per:isaac')).toBe(true)
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
