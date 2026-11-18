// Typing suggestions of Bible stories (design Part 4, "Sugerencias de historias OBS al escribir"): the index (obsindex.ts), the
// cases A (a story word and a topic), B (a name alone) and C (a passage) of suggest.ts, the chips' tap and the filtered list.
// The packs on disk have no obs unit: obs-fixture.ts gives en and hi the stories of Mini's server (every title; the word links of
// stories 1, 3 and 34 only), so "Jesus" is found by the titles and "altar" (only in story 3's links) by the word index.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { booksOf, cutGraphemes, type Ctx, ready, resetSuggest, type Suggestion } from '../src/suggest'
import { buildObsIndex, findStoriesIx, lastBuildMs, obsIndexSizes, resetObsIndex, storyTelling } from '../src/obsindex'
import { namedStory, rangeOfRef, storyAt } from '../src/obs'
import { findStories } from '../src/storyfind'
import { keywords } from '../src/search'
import { openLang } from '../src/packs'
import { Composer, setComposerOn } from '../src/composer'
import { buildTermIndex, resetTermIndex } from '../src/termindex'
import { has } from '../src/commands'
import { rtlLang } from '../src/bidi'
import { ALL_PACKS } from './fs-packs'
import { fullPhone } from './harness'
import { withObs } from './obs-fixture'

const store = new Map<string, string>()
;(globalThis as any).localStorage ??= { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k), key: () => null, length: 0 }

let all: Ctx['books'] = null
beforeAll(async () => {
  await fullPhone()
  await withObs('hi')
  all = await booksOf(ALL_PACKS)
  await buildTermIndex(ALL_PACKS)
  await buildObsIndex(ALL_PACKS)
})
afterAll(() => {
  resetObsIndex()
  resetTermIndex()
  setComposerOn(true)
})
const ctx = (ui: string, over: Partial<Ctx> = {}): Ctx => ({ ui, conv: { last: null }, helpsLang: null, packs: ALL_PACKS, books: all, ...over })
const row = async (q: string, ui: string, over: Partial<Ctx> = {}) => (await ready(q, ctx(ui, over))).items
const nums = (items: Suggestion[]) => items.filter((x) => x.kind === 'story').map((x) => /(\d+)/.exec(x.sheet!.ref!)![1]!).map(Number)

describe('the index', () => {
  test('one entry per OBS pack, 50 stories (the build time is logged, not asserted)', () => {
    expect(obsIndexSizes()).toEqual({ en: 50, hi: 50 })
    console.log(`obsindex build: ${lastBuildMs} ms (en + hi, desktop)`)
  })
  test('the story word list reads in each language', () => {
    for (const w of ['story', 'stories', 'historia', 'histoire', 'récit', 'cerita', 'kisah', 'कहानी', 'कथा', 'قصة', 'القصة', 'قصص', 'OBS']) expect(has('story', `x ${w} y`), w).toBe(true)
    for (const w of ['storyline', 'historiador', 'ceritanya']) expect(has('story', w), w).toBe(false)
  })
})

describe('A: a story word and a topic', () => {
  const jesus: [string, string][] = [['historia de Jesús', 'es'], ['story of Jesus', 'en'], ['قصة يسوع', 'ar'], ['यीशु की कहानी', 'hi'], ['historia de Jes', 'es'], ['histoire de Jésus', 'fr'], ['cerita Yesus', 'id']]
  for (const [q, ui] of jesus)
    test(`${q} (${ui}): stories with Jesus in order, at most 4 + All, then the key term`, async () => {
      const r = await row(q, ui)
      // the story a sent question opens goes first (obs.ts namedStory, which counts the frames' words: the fixture has only some frames),
      // then the titles in the stories' order
      const sent = await namedStory(q.replace(/^(historia de|story of|histoire de|cerita) /, ''), ui === 'hi' ? 'hi' : 'en')
      const top = nums(r)
      const named = /\d+/.exec((await namedStory(q, ui === 'hi' ? 'hi' : 'en'))?.ref ?? '')
      if (named) expect(top[0]).toBe(Number(named[0]))
      void sent
      for (const n of [23, 24, 25]) expect(top, `${q}: ${n}`).toContain(n)
      const all = r.find((x) => x.kind === 'stories')!
      expect(all.list!.ids.length).toBeGreaterThan(4)
      expect(all.list!.ids.slice(0, 4)).toEqual(nums(r))
      expect(r.map((x) => x.kind)).toEqual(['story', 'story', 'story', 'story', 'stories', 'term'])
      expect(r.length).toBeLessThanOrEqual(6)
    })
  test('the label is "OBS n · title ▸" (◂ in Arabic), in the title\'s pack language; Hindi titles with the Hindi pack', async () => {
    expect((await row('historia de Jesús', 'es'))[0]!.label).toBe('OBS 26 · Jesus Starts His Ministry ▸')
    expect((await row('قصة يسوع', 'ar'))[0]!.label).toBe('OBS 23 · The Birth of Jesus ◂')
    expect(rtlLang('ar')).toBe(true)
    const hi = (await row('यीशु की कहानी', 'hi'))[0]!
    expect(hi.label).toBe('OBS 34 · यीशु दूसरी कहानियों की शिक्षा देता है ▸') // (the story namedStory sends, from the Hindi frames of the fixture)
    expect(hi.sheet).toMatchObject({ intent: 'passage', ref: 'obs 34', what: ['text', 'notes'], lang: 'hi' })
    expect(hi.aria).toContain('OBS 34')
  })
  test('a long title is cut with "…" so two buttons fit a line', async () => {
    const [s] = await row('la historia del hijo pródigo', 'es')
    expect(s!.label.length).toBeLessThanOrEqual('OBS 35 · '.length + 34 + 2)
    expect(s!.label).toContain('…')
  })
  test('All (n) carries the stories and the list title', async () => {
    const a = (await row('historia de Jesús', 'es')).find((x) => x.kind === 'stories')!
    expect(a.label).toMatch(/^Todas \(\d+\) ▸$/)
    expect(a.list!.title).toBe('Historias con Jesús')
    expect(a.list!.lang).toBe('en')
  })
  test('Noah and the prodigal son by their aliases: the first button is OBS 3 and OBS 35', async () => {
    expect(nums(await row('historia de Noé', 'es'))[0]).toBe(3)
    expect(nums(await row('story of Noah', 'en'))[0]).toBe(3)
    expect(nums(await row('la historia del hijo pródigo', 'es'))[0]).toBe(35)
    expect(nums(await row('the story of the prodigal son', 'en'))[0]).toBe(35)
    // (Noé is complete: not also the start of "noel", Navidad's name)
    expect(nums(await row('historia de Noé', 'es'))).toEqual([3])
  })
  test('a tap sends that story as Browse does (the sheet), and the key term follows', async () => {
    const r = await row('historia de Noé', 'es')
    expect(r[0]!.sheet).toMatchObject({ intent: 'passage', ref: 'obs 3', what: ['text', 'notes'] })
    expect(r.at(-1)!.kind).toBe('term')
  })
  test('Jonah: no story (OBS has none of Jonah), only the name', async () => {
    const r = await row('historia de Jonás', 'es')
    expect(r.filter((x) => x.kind === 'story' || x.kind === 'stories')).toEqual([])
  })
  test('a word in the word index only: the stories whose frames link its article (altar → OBS 3)', async () => {
    expect(nums(await row('historia del altar', 'es'))).toEqual([3])
  })
  test('a book: the stories told in it', async () => {
    expect(nums(await row('historia de Éxodo', 'es'))).toEqual([12, 9, 10, 11])
  })
  test('the Bible stories of English OBS and Spanish word articles: «historia de Moisés» finds them by tw:names/moses', async () => {
    expect(nums(await row('historia de Moisés', 'es'))[0]).toBe(9)
  })
  test('a story word alone, or one letter of a topic: no story button', async () => {
    for (const q of ['historia', 'historia de ', 'historia de J', 'historia de Je']) expect((await row(q, 'es')).filter((x) => x.kind === 'story' || x.kind === 'stories'), q).toEqual([])
  })
  test('a word that is no topic of any story gives none', async () => {
    expect((await row('historia de zzzxx', 'es')).length).toBe(0)
  })
})

describe('B: a name alone', () => {
  test('Moisés: its word first, then at most 2 stories', async () => {
    const r = await row('Moisés', 'es')
    expect(r[0]!.kind).toBe('term')
    expect(r[0]!.label).toBe('Moisés · nombre')
    expect(nums(r)).toEqual([9])
    expect(r.filter((x) => x.kind === 'story').length).toBeLessThanOrEqual(2)
  })
  test('Jesús alone (a key term, in no alias): its article only', async () => {
    const r = await row('Jesús', 'es')
    expect(r[0]!.kind).toBe('term')
    expect(nums(r)).toEqual([])
  })
  test('plain words of a title ("light", "water", "king", "God") add no story chip', async () => {
    for (const [q, ui] of [['luz', 'es'], ['agua', 'es'], ['rey', 'es'], ['Dios', 'es'], ['pan', 'es'], ['light', 'en'], ['water', 'en'], ['king', 'en'], ['God', 'en'], ['bread', 'en']] as const)
      expect(nums(await row(q, ui)), q).toEqual([])
  })
  test('an alias that names a person or an event still does: Noé, Adán, Pascua', async () => {
    expect(nums(await row('Noé', 'es'))).toEqual([3])
    expect(nums(await row('Adán', 'es'))[0]).toBe(2)
    expect(nums(await row('Pascua', 'es'))).toEqual([11])
  })
  test('a key term alone offers no story by its frames (only a title, an alias or a name): gracia', async () => {
    expect(nums(await row('gracia', 'es'))).toEqual([])
  })
})

describe('C: a passage', () => {
  test('Génesis 6: the "✓" and, at the end, "Se cuenta en OBS 3"', async () => {
    const r = await row('Génesis 6', 'es')
    expect(r[0]!.kind).toBe('ok')
    expect(r.at(-1)).toMatchObject({ kind: 'story', label: 'Se cuenta en OBS 3 ▸' })
    expect(r.at(-1)!.sheet).toMatchObject({ ref: 'obs 3', what: ['text', 'notes'] })
    expect(r.at(-1)!.aria).toBe('Se cuenta en OBS 3: The Flood')
  })
  test('Lucas 2:7: the helps and the story, never more than 6', async () => {
    const r = await row('Lucas 2:7', 'es')
    expect(r.map((x) => x.kind)).toEqual(['ok', 'help', 'help', 'help', 'help', 'story'])
    expect(r.at(-1)!.label).toBe('Se cuenta en OBS 23 ▸')
  })
  test('English and Arabic labels', async () => {
    expect((await row('Genesis 6', 'en')).at(-1)!.label).toBe('Told in OBS 3 ▸')
    expect((await row('تكوين 6', 'ar')).at(-1)!.label).toBe('تُروى في OBS 3 ◂')
  })
  test('a passage no story tells (Job 3): no button', async () => {
    const r = await row('Job 3', 'es')
    expect(r.filter((x) => x.kind === 'story')).toEqual([])
  })
})

describe('when it does not appear', () => {
  test('no OBS pack on the phone: the row is today\'s', async () => {
    resetObsIndex()
    await buildObsIndex(['es-419', 'ar'])
    expect(obsIndexSizes()).toEqual({})
    expect((await row('historia de Jesús', 'es')).filter((x) => x.kind === 'story' || x.kind === 'stories')).toEqual([])
    expect((await row('Génesis 6', 'es')).map((x) => x.kind)).not.toContain('story')
    resetObsIndex()
    await buildObsIndex(ALL_PACKS)
    expect(obsIndexSizes()).toEqual({ en: 50, hi: 50 })
  })
  test('the index not built yet: the row is today\'s', async () => {
    resetObsIndex()
    expect((await row('historia de Jesús', 'es')).map((x) => x.kind)).toEqual(['term'])
    await buildObsIndex(ALL_PACKS)
  })
  test('a 5M session: its own rule goes first, no story button', async () => {
    const conv: any = { last: null, graph: { session: { story: 1, part: 'intro', at: 0, lang: 'en', tfLang: 'en', started: 0, done: [] }, nodes: [], cur: 0 } }
    const r = await row('historia de Jesús', 'es', { conv })
    expect(r.filter((x) => x.kind === 'story' || x.kind === 'stories')).toEqual([])
  })
  test('Typing suggestions off: no row at all', () => {
    setComposerOn(false)
    const k = new Composer({ value: 'historia de Jesús', focus() {} }, { ui: () => 'es', conv: () => ({ last: null }), packs: () => ALL_PACKS, busy: () => false, send() {}, ask() {}, browse() {} })
    k.refresh()
    expect(k.row.items).toEqual([])
    setComposerOn(true)
  })
  test('no row has more than 6 buttons', async () => {
    for (const [q, ui] of [['historia de Jesús', 'es'], ['story of Jesus', 'en'], ['Lucas 2:7', 'es'], ['Génesis 6', 'es'], ['Moisés', 'es'], ['historia de Éxodo', 'es'], ['यीशु की कहानी', 'hi']] as const)
      expect((await row(q, ui)).length, q).toBeLessThanOrEqual(6)
  })
})

describe('the buttons of the row', () => {
  const log: string[] = []
  const make = (value: string) => {
    log.length = 0
    const box = { value, focus() {} }
    const k = new Composer(box, {
      ui: () => 'es', conv: () => ({ last: null }), packs: () => ALL_PACKS, busy: () => false, send: () => { log.push('send') },
      ask: (l: string, s) => { log.push(`ask ${l} ${s.ref}`) }, browse() {}, stories: (lang, ids, title) => { log.push(`stories ${lang} ${ids.length} ${title}`) },
    })
    k.books = all
    k.refresh()
    return { box, k }
  }
  test('a tap asks the story (sent.chip, no model) and empties the box', async () => {
    const { box, k } = make('historia de Noé')
    await k.tap(k.row.items.find((x) => x.kind === 'story')!)
    expect(log).toEqual(['ask OBS 3: The Flood obs 3'])
    expect(box.value).toBe('')
  })
  test('All (n) opens the filtered list', async () => {
    const { k } = make('historia de Jesús')
    await k.tap(k.row.items.find((x) => x.kind === 'stories')!)
    expect(log[0]).toMatch(/^stories en \d+ Historias con Jesús$/)
  })
  test('while the keyboard composes the tap waits for the end, and asks if nothing changed', async () => {
    const { box, k } = make('historia de Noé')
    const s = k.row.items.find((x) => x.kind === 'story')!
    k.compositionStart()
    await k.tap(s)
    expect(log).toEqual([])
    k.compositionEnd()
    await Promise.resolve()
    expect(log).toEqual(['ask OBS 3: The Flood obs 3'])
    expect(box.value).toBe('')
  })
  test('if the box changed while it waited, nothing is asked', async () => {
    const { box, k } = make('historia de Noé')
    const s = k.row.items.find((x) => x.kind === 'story')!
    k.compositionStart()
    await k.tap(s)
    box.value = 'historia de Noé y el arca'
    k.compositionEnd()
    await Promise.resolve()
    expect(log).toEqual([])
  })
  test('busy: nothing', async () => {
    const { k } = make('historia de Noé')
    ;(k.hooks as any).busy = () => true
    await k.tap(k.row.items.find((x) => x.kind === 'story')!)
    expect(log).toEqual([])
  })
})
