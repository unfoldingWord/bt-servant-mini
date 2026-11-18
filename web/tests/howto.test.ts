// How to ask (howto.ts): every card's example, in every app language, is read by the router to what its card says (a passage
// read by code alone, a verse's notes, a chapter's questions, a word's article, a translation topic, a follow-up of the
// passage) and gets a non-empty answer with the packs there are; the menu card has the online AI settings only where it is.
import { test, expect, beforeAll, afterAll } from 'bun:test'
import { ALL_PACKS, installPacks } from './fs-packs'
import { turn } from './harness'
import { cardsFor, examplesOf, type Examples, HT } from '../src/howto'
import { type ConvState, directSheet } from '../src/pipeline'
import { bookCode } from '../src/sheet'

const UIS = ['en', 'es', 'fr', 'id', 'hi', 'ar']
/** The pack of each app language, as the app picks it. */
const PACK: Record<string, string> = { en: 'en', es: 'es-419', fr: 'fr', id: 'id', hi: 'hi', ar: 'ar' }

// a phone's storage, for the invitation (bun has none)
const store = new Map<string, string>()
const saved = (globalThis as any).localStorage
beforeAll(() => {
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k),
  }
})
afterAll(() => {
  ;(globalThis as any).localStorage = saved
  delete (globalThis as any).window
})

/** Asks the questions one after the other in one conversation, as typed; the last answer. */
async function ask(qs: string[], ui: string) {
  const c: ConvState = { last: null }
  let r: Awaited<ReturnType<typeof turn>> | null = null
  for (const q of qs) r = await turn(c, { q }, ui)
  return r!
}
const codeOf = (ex: Examples) => ex.ref.split(' ')[0]!

// each app language with its own pack, and (French has no pack here) with English: the pack a French phone would answer from
const PHONES = UIS.map((ui) => [ui, ALL_PACKS.includes(PACK[ui]!) ? PACK[ui]! : 'en'] as const).filter(([, p]) => ALL_PACKS.includes(p))

for (const [ui, pack] of PHONES) {
  test(`${ui} with ${pack}: every example reads as its card says and is answered`, async () => {
    await installPacks([pack])
    const ex = (await examplesOf(ui, [pack], null))!
    expect(ex).not.toBeNull()
    const code = codeOf(ex)
    const [ch, v] = ex.ref.split(' ')[1]!.split(':').map(Number)
    // a passage: read by code alone (no model), the same reading the composer's ✓ shows
    const p = directSheet(ex.passage)!
    expect(p, ex.passage).not.toBeNull()
    expect(bookCode(p.lang ?? ui, p.book!)).toBe(code)
    expect([p.chapter, p.verse_start]).toEqual([ch, v])
    const n = directSheet(ex.notes)!
    expect(n?.what, ex.notes).toEqual(['notes'])
    // (a pack with no questions, like the Hindi one here, gets no questions example)
    if (ex.questions) {
      const q = directSheet(ex.questions)!
      expect(q?.what, ex.questions).toEqual(['questions'])
      expect(bookCode(q.lang ?? ui, q.book!)).toBe(ex.chapter!.split(' ')[0])
    } else expect(ex.chapter).toBeNull()
    // answered, as typed and sent
    const a1 = await ask([ex.passage], ui)
    expect([a1.answered, a1.ref], ex.passage).toEqual(['passage', ex.ref])
    expect(a1.found).toBeGreaterThan(0)
    const a2 = await ask([ex.notes], ui)
    expect([a2.answered, a2.ref], ex.notes).toEqual(['passage', ex.ref])
    expect(a2.found, `${ex.notes}: notes`).toBeGreaterThan(0)
    if (ex.questions) {
      const a3 = await ask([ex.questions], ui)
      expect([a3.answered, a3.ref], ex.questions).toEqual(['passage', ex.chapter])
      expect(a3.found, `${ex.questions}: questions`).toBeGreaterThan(0)
    }
    // a word and a topic: their articles
    expect(ex.term).not.toBeNull()
    const t = await ask([ex.term!], ui)
    expect([t.answered, t.concept?.slice(0, 3)], ex.term!).toEqual(['article', 'tw:']) // one article, never "which one?"
    expect(HT(ui).terms.find(([x]) => x === ex.term)![1]).toBe(t.concept!)
    expect(ex.topic).not.toBeNull()
    const k = await ask([ex.topic!], ui)
    expect([k.answered, k.concept], ex.topic!).toEqual(['article', HT(ui).topics.find(([x]) => x === ex.topic)![1]])
    // the follow-ups, after the passage: the next verse, and the passage's notes
    const f1 = await ask([ex.passage, ex.follow[0]], ui)
    expect([f1.answered, f1.ref], ex.follow[0]).toEqual(['passage', `${code} ${ch}:${v! + 1}`])
    expect(f1.found).toBeGreaterThan(0)
    const f2 = await ask([ex.passage, ex.follow[1]], ui)
    expect([f2.answered, f2.ref], ex.follow[1]).toEqual(['passage', ex.ref])
    expect(f2.found).toBeGreaterThan(0)
    // the free question of the online AI card: answered by the phone too (about its passage)
    const fr = await ask([ex.free], ui)
    expect(fr.found, ex.free).toBeGreaterThan(0)
    // and every "Try it" of every card, as the guide sends it
    for (const c of cardsFor(ui, ex, true, true, { obs: !!ex.obs, books: true })) {
      if (!c.ask.length) continue
      const r = await ask(c.ask, ui)
      expect(r.found, `${ui} ${c.id}: ${c.ask.join(' → ')}`).toBeGreaterThan(0)
    }
  }, 120000)
}

test('Hindi has no notes for Ruth or Jonah: its examples name a book it covers', async () => {
  if (!ALL_PACKS.includes('hi')) return
  await installPacks(['hi'])
  const ex = (await examplesOf('hi', ['hi'], null))!
  expect(['rut', 'jon']).not.toContain(codeOf(ex))
})

test('another app language than the pack: the examples are still answered', async () => {
  // an English app with only the Hindi pack, a Hindi app with only Spanish: the reference is read, its pack has the notes
  for (const [ui, pack] of [['en', 'hi'], ['hi', 'es-419'], ['ar', 'id'], ['fr', 'ar']] as const) {
    if (!ALL_PACKS.includes(pack)) continue
    await installPacks([pack])
    const ex = (await examplesOf(ui, [pack], null))!
    for (const q of [ex.passage, ex.notes, ex.questions].filter((x): x is string => !!x)) expect((await ask([q], ui)).found, `${ui}/${pack}: ${q}`).toBeGreaterThan(0)
    for (const c of cardsFor(ui, ex, true, true, { obs: !!ex.obs, books: true })) if (c.ask.length) expect((await ask(c.ask, ui)).found, `${ui}/${pack} ${c.id}`).toBeGreaterThan(0)
  }
}, 120000)

test('the examples parse in every app language, with or without a pack for it', () => {
  // the forms of each language around a reference read by code (French included, which has no pack here)
  for (const ui of UIS) {
    const s = HT(ui)
    const name = ui === 'hi' ? 'योना' : ui === 'ar' ? 'يونان' : ui === 'id' ? 'Yunus' : ui === 'es' ? 'Jonás' : ui === 'fr' ? 'Jonas' : 'Jonah'
    expect(directSheet(s.notes.replace('{ref}', `${name} 1:3`))?.what, `${ui} notes`).toEqual(['notes'])
    expect(directSheet(s.questions.replace('{ref}', `${name} 1`))?.what, `${ui} questions`).toEqual(['questions'])
    expect(s.terms.length).toBeGreaterThan(0)
    expect(s.topics.length).toBeGreaterThan(0)
  }
})

test('the examples are read once per app language, packs and helps language', async () => {
  if (!ALL_PACKS.includes('en')) return
  await installPacks(['en'])
  expect(examplesOf('en', ['en'], null)).toBe(examplesOf('en', ['en'], null))
  expect(examplesOf('es', ['en'], null)).not.toBe(examplesOf('en', ['en'], null))
  // nothing found (no pack yet, a pack still installing) is not kept: it is looked for again
  const none = examplesOf('en', [], null)
  expect(await none).toBeNull()
  await Promise.resolve()
  expect(examplesOf('en', [], null)).not.toBe(none)
})

test('typing suggestions off: the card says how to turn them on, and Try it opens Browse', () => {
  for (const ui of UIS) {
    const on = cardsFor(ui, null, false, true).find((c) => c.id === 'browse')!
    const off = cardsFor(ui, null, false, false).find((c) => c.id === 'browse')!
    expect(off.body).not.toBe(on.body)
    expect(off.body).not.toContain('✓')
    expect(off.tryBrowse).toBe(true)
    expect(off.fill).toBeUndefined()
    expect(on.body).toContain('✓')
  }
})

test('the menu card has the online AI settings only where online AI is available', () => {
  // (the card itself is always there: Safety and the pictures are in the menu; howto-cards.test.ts has the rest)
  for (const ui of UIS) {
    expect(cardsFor(ui, null, false).find((c) => c.id === 'menu')!.extra).toBe('menu')
    expect(cardsFor(ui, null, true).find((c) => c.id === 'menu')!.extra).toBe('online')
  }
  // the iOS app: not there; the Android app and the web: there (online.ts onlineAvailable)
  ;(globalThis as any).window = { Android: { platform: () => 'ios' } }
  expect(cardsFor('en', null).find((c) => c.id === 'menu')!.extra).toBe('menu')
  ;(globalThis as any).window = { Android: { platform: () => 'android' } }
  expect(cardsFor('en', null).find((c) => c.id === 'menu')!.extra).toBe('online')
  ;(globalThis as any).window = {}
  expect(cardsFor('en', null).find((c) => c.id === 'menu')!.extra).toBe('online')
  delete (globalThis as any).window
  expect(cardsFor('en', null).find((c) => c.id === 'menu')!.extra).toBe('menu') // cannot tell: not offered
})

test('every card says that writing in your own words works too, in every language', () => {
  for (const ui of UIS) {
    const s = HT(ui)
    expect(s.free.length).toBeGreaterThan(20)
    for (const c of cardsFor(ui, null, true)) {
      expect(c.title.length).toBeGreaterThan(0)
      expect(c.body).not.toMatch(/\{\w+\}/)
    }
  }
})
