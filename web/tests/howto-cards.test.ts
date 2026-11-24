// How to ask, the new cards (Abel, Nov 17; Nov 24: families and places): six to ten cards by what the phone has (the Bible Stories, a book), the "who is who"
// example found from the MACULA data of each pack (es-419, hi, ar), the Bible Stories example answered, online AI or not on the
// menu card, and no "Try it" that answers with nothing. The lines "What can you do?" adds, only for what the phone has.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { ALL_PACKS, installPacks } from './fs-packs'
import { withObs } from './obs-fixture'
import { turn } from './harness'
import { cardsFor, examplesOf, HT, phoneHas, whoExampleOf, type CardId, type PhoneHas, type WhoExample } from '../src/howto'
import { KT, kinShape } from '../src/kin'
import { placeShape } from '../src/places'
import { PLT } from '../src/placetext'
import { followTitle, FOLLOW_TYPES } from '../src/followtype'
import { GT } from '../src/graph'
import { XT } from '../src/explore'
import { MW } from '../src/macula'
import { helpLines } from '../src/helplines'
import { maculaAnswer, resetMacula } from '../src/macula'
import { type ConvState } from '../src/pipeline'
import type { Sheet } from '../src/sheet'

const UIS = ['en', 'es', 'fr', 'id', 'hi', 'ar']
// (what the phone has: the people and places flags are off unless a test says so)
const H0: PhoneHas = { obs: false, books: false, people: false, places: false }
const has = (o: Partial<PhoneHas>): PhoneHas => ({ ...H0, ...o })
const ids = (ui: string, h: Partial<PhoneHas>, online: boolean) => cardsFor(ui, null, online, true, has(h)).map((c) => c.id)

const saved = (globalThis as any).localStorage
beforeAll(() => {
  ;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})
afterAll(async () => {
  ;(globalThis as any).localStorage = saved
  delete (globalThis as any).window
  await installPacks(ALL_PACKS) // (the stories patched in above go with the readers)
})

describe('how many cards, and which', () => {
  test('six to ten by the Bible Stories, the books, the people and the places', () => {
    for (const ui of UIS) {
      expect(ids(ui, H0, true)).toEqual(['passage', 'word', 'follow', 'save', 'browse', 'menu'])
      expect(ids(ui, { obs: true, books: false }, true)).toEqual(['passage', 'word', 'obs', 'follow', 'save', 'browse', 'menu'])
      expect(ids(ui, has({ books: true }), true)).toEqual(['passage', 'word', 'who', 'follow', 'save', 'browse', 'menu'])
      const all: CardId[] = ['passage', 'word', 'obs', 'who', 'people', 'places', 'follow', 'save', 'browse', 'menu']
      expect(ids(ui, { obs: true, books: true, people: true, places: true }, true)).toEqual(all)
      expect(ids(ui, { obs: true, books: true, people: true, places: true }, false)).toEqual(all) // the menu card is there with or without online AI
    }
  })

  test('the families card only with the people data, the places card only with the place data', () => {
    for (const ui of UIS) {
      expect(ids(ui, { people: true }, true), ui).toEqual(['passage', 'word', 'people', 'follow', 'save', 'browse', 'menu'])
      expect(ids(ui, { places: true }, true), ui).toEqual(['passage', 'word', 'places', 'follow', 'save', 'browse', 'menu'])
      expect(ids(ui, { people: true, places: true }, true), ui).toEqual(['passage', 'word', 'people', 'places', 'follow', 'save', 'browse', 'menu'])
      expect(ids(ui, {}, true), ui).not.toContain('people')
      expect(ids(ui, {}, true), ui).not.toContain('places')
    }
  })

  test('the "Try it" of the new cards sends a real question (the first phrase), and the phrases are shown as examples', () => {
    for (const ui of UIS) {
      const cs = cardsFor(ui, null, true, true, has({ people: true, places: true }))
      const people = cs.find((c) => c.id === 'people')!, places = cs.find((c) => c.id === 'places')!
      expect(people.ask, ui).toEqual([HT(ui).kinQ[0]])
      expect(people.examples, ui).toEqual([...HT(ui).kinQ])
      expect(places.ask, ui).toEqual([HT(ui).placeQ[0]])
      expect(places.examples, ui).toEqual([...HT(ui).placeQ])
      // the body names the very phrases (and the app's own button names), with no placeholder left
      for (const q of HT(ui).kinQ) expect(people.body, `${ui} ${q}`).toContain(q)
      for (const q of HT(ui).placeQ) expect(places.body, `${ui} ${q}`).toContain(q)
      expect(people.body, ui).toContain(KT(ui).treeBtn)
      expect(places.body, ui).toContain(PLT(ui).seeMap)
    }
  })

  test('the places card says "See on the map" is under the Bible Stories frames only when the phone has the stories', () => {
    for (const ui of UIS) {
      const body = (obs: boolean) => cardsFor(ui, null, true, true, has({ places: true, obs })).find((c) => c.id === 'places')!.body
      expect(body(true), ui).toBe(body(false) + HT(ui).mapObs)
    }
  })

  test('each phrase of the people card reads as the right family question in its language (sons, tree, up, down)', () => {
    const kinds = ['sons', 'tree', 'up', 'down']
    for (const ui of UIS) {
      HT(ui).kinQ.forEach((q, i) => {
        const k = kinShape(q)
        // (Spanish and some others say "children" for the plural: the same family question, asked for sons)
        expect(i === 0 ? ['sons', 'children'] : [kinds[i]], `${ui}: ${q}`).toContain(k!.kind)
        expect(k?.lang, `${ui}: ${q}`).toBe(ui as any)
      })
    }
  })

  test('each phrase of the places card reads as the right place question in its language (where, map, happened)', () => {
    const kinds = ['where', 'map', 'happened']
    for (const ui of UIS) {
      HT(ui).placeQ.forEach((q, i) => {
        const k = placeShape(q)
        expect(k?.kind, `${ui}: ${q}`).toBe(kinds[i])
        expect(k?.lang, `${ui}: ${q}`).toBe(ui as any)
        expect(k!.names.length, `${ui}: ${q}`).toBe(1)
      })
    }
  })

  test('the who card names the sentence structure button; the follow card the icons, the types and the conversation map; the browse card the tab', () => {
    for (const ui of UIS) {
      const cs = cardsFor(ui, null, true, true, has({ books: true, people: true, places: true }))
      const body = (id: CardId) => cs.find((c) => c.id === id)!.body
      expect(body('who'), ui).toContain(MW(ui).tree)
      const f = body('follow')
      for (const t of FOLLOW_TYPES) expect(f, `${ui} ${t}`).toContain(followTitle(ui, t))
      expect(f, ui).toContain(GT(ui).map)
      expect(f, ui).toContain('◀ ▶')
      expect(body('browse'), ui).toContain(XT(ui).peoplePlaces)
      // one of the two alone: that tab's name, as Browse draws it; none: nothing to say about it
      const only = (h: Partial<PhoneHas>) => cardsFor(ui, null, true, true, has(h)).find((c) => c.id === 'browse')!.body
      expect(only({ people: true }), ui).toContain(XT(ui).people)
      expect(only({ people: true }), ui).not.toContain(XT(ui).peoplePlaces)
      expect(only({ places: true }), ui).toContain(XT(ui).places)
      expect(only({ places: true }), ui).not.toContain(XT(ui).peoplePlaces)
      expect(only({}), ui).not.toContain(XT(ui).peoplePlaces)
    }
    // the conversation map is called that, not just "Map": the geographic maps are another thing
    expect(cardsFor('en', null, true, true).find((c) => c.id === 'follow')!.body).toContain('conversation map')
    expect(cardsFor('es', null, true, true).find((c) => c.id === 'follow')!.body).toContain('mapa de la conversación')
  })

  test('what the phone has: Open Bible Stories and books, from the packs', async () => {
    if (!ALL_PACKS.includes('en')) return
    await installPacks(['en'])
    await withObs('en', 'none')
    // (people: the packs on this machine have the family data; places: they have no `geo` table, so no place with a point)
    expect(await phoneHas(['en'])).toEqual({ obs: false, books: true, people: true, places: false })
    await withObs('en')
    expect(await phoneHas(['en'])).toEqual({ obs: true, books: true, people: true, places: false })
    expect(await phoneHas([])).toEqual({ obs: false, books: false, people: false, places: false })
  })

  test('every card has a title and a body with no placeholder left, in every language', () => {
    for (const ui of UIS) {
      for (const c of cardsFor(ui, null, true, true, has({ obs: true, books: true, people: true, places: true }))) {
        expect(c.title.length, `${ui} ${c.id}`).toBeGreaterThan(0)
        expect(c.body, `${ui} ${c.id}`).not.toMatch(/\{\w+\}/)
      }
    }
  })

  test('the card for Saved names the app\'s own word and opens Saved; the Bible Stories and the Safety cards say what they are', () => {
    const save = (ui: string) => cardsFor(ui, null, true, true, has({ obs: true, books: true, people: true, places: true })).find((c) => c.id === 'save')!
    expect(save('es').body).toContain('☆ Guardados')
    expect(save('en').body).toContain('☆ Saved')
    expect(save('ar').body).toContain('☆ المحفوظات')
    for (const ui of UIS) expect(save(ui).extra).toBe('saved')
    expect(cardsFor('es', null, true, true, has({ obs: true, books: true, people: true, places: true })).find((c) => c.id === 'obs')!.body).toContain('OBS')
    // the long answer in parts, on the "follow" card
    for (const ui of UIS) expect(cardsFor(ui, null, true, true, H0).find((c) => c.id === 'follow')!.body, ui).toContain('◀ ▶')
  })

  test('the "without typing" card names the Bible Stories only when the phone has them', () => {
    const body = (ui: string, obs: boolean) => cardsFor(ui, null, true, true, has({ obs, books: true })).find((c) => c.id === 'browse')!.body
    for (const ui of UIS) expect(body(ui, true), ui).not.toBe(body(ui, false))
    expect(body('es', true)).toContain('Historias de la Biblia')
    expect(body('es', false)).not.toContain('Historias de la Biblia')
    expect(body('es', false)).toContain('modos guiados')
  })
})

describe('the menu card, with and without online AI', () => {
  test('where there is online AI: its settings button and its "Try it"; where not: the button to open the menu', () => {
    const ex = { free: 'Explícame Rut 2:3 con palabras sencillas', passage: 'Rut 2:3', follow: ['a', 'b'], book: 'Rut', notes: 'n', questions: null, term: null, topic: null, obs: null } as any
    for (const ui of UIS) {
      const on = cardsFor(ui, ex, true, true, H0).find((c) => c.id === 'menu')!
      const off = cardsFor(ui, ex, false, true, H0).find((c) => c.id === 'menu')!
      expect(on.extra, ui).toBe('online')
      expect(on.ask, ui).toEqual([ex.free])
      expect(off.extra, ui).toBe('menu')
      expect(off.ask, ui).toEqual([]) // nothing to try: no "Try it" that answers with nothing
      expect(off.fill).toBeUndefined()
      expect(on.body, ui).not.toBe(off.body)
      expect(off.title, ui).toBe(on.title)
      expect(off.body, ui).toContain('PIN') // Safety is there with or without online AI
    }
    // the online AI sentence is not in the card where the phone cannot have it
    expect(cardsFor('es', null, false, true, H0).find((c) => c.id === 'menu')!.body).not.toContain('IA en línea')
    expect(cardsFor('es', null, true, true, H0).find((c) => c.id === 'menu')!.body).toContain('IA en línea')
  })
})

// (the examples are read once per app language, packs and helps language: these tests give the helps language, so the files that
// share the process do not share an example found with the Bible Stories on or off)
// the packs on this machine with their MACULA data: Spanish, Hindi and Arabic as the phones of those languages have them
const WHO_PACKS: [string, string][] = [['es', 'es-419'], ['hi', 'hi'], ['ar', 'ar']]
describe('the "who is who" example', () => {
  for (const [ui, pack] of WHO_PACKS) {
    test(`${ui} with ${pack}: a verse with referents, asked as a sheet and answered with them`, async () => {
      if (!ALL_PACKS.includes(pack)) return
      await installPacks([pack])
      resetMacula()
      const w = (await whoExampleOf(ui, [pack]))!
      expect(w, `${ui}: an example`).not.toBeNull()
      expect(w.lang).toBe(pack)
      expect(['rut 2:4', 'jon 1:6', 'mrk 1:7', 'gen 3:6', 'jhn 1:7', 'tit 1:3']).toContain(w.ref)
      expect(w.what).toEqual(['who'])
      // its label is the app's own "who is who in {ref}" with the verse
      expect(w.label, ui).toContain(w.ref.split(' ')[1]!)
      // the card carries it as a sheet and not as a sentence
      const c = cardsFor(ui, null, true, true, has({ books: true }), w).find((x) => x.id === 'who')!
      expect(c.sheet).toEqual(w)
      expect(c.ask).toEqual([])
      expect(c.examples).toEqual([w.label])
      // and it is answered with the referents: who is who for that verse (not "no data")
      const sheet = { id: 't', intent: 'passage', ref: w.ref, what: w.what, lang: w.lang, version: null, concept: null, term: null, phrase: null, candidates: null } as unknown as Sheet
      const d = await maculaAnswer(sheet, ui)
      expect(d.reply.macula?.kind, `${ui} ${w.ref}`).toBe('who')
      expect(d.found, `${ui} ${w.ref}`).toBeGreaterThan(0)
    }, 120000)
  }

  test('no book on the phone, no example, and the card has no "Try it"', async () => {
    resetMacula()
    expect(await whoExampleOf('es', [])).toBeNull()
    const c = cardsFor('es', null, true, true, has({ books: true }), null).find((x) => x.id === 'who')!
    expect(c.sheet).toBeUndefined()
    expect(c.ask).toEqual([])
    expect(c.examples).toEqual([])
  })

  test('the first verse of the list whose book is on the phone: a pack with only Jonah and later books skips Ruth', async () => {
    // (the example goes through the same data as the answer: a verse with none is skipped)
    if (!ALL_PACKS.includes('es-419')) return
    await installPacks(['es-419'])
    resetMacula()
    const w = (await whoExampleOf('en', ['es-419'])) as WhoExample
    expect(w.label).toMatch(/^Who is who in /)
  })
})

describe('the Bible Stories card and the examples', () => {
  test('its example is a frame with notes, and the "Try it" is answered', async () => {
    if (!ALL_PACKS.includes('en')) return
    await installPacks(['en'])
    await withObs('en')
    const ex = (await examplesOf('en', ['en'], 'en'))!
    expect(ex.obs).toMatch(/^OBS \d+:\d+$/)
    const c = cardsFor('en', ex, true, true, has({ obs: true, books: true, people: true, places: true })).find((x) => x.id === 'obs')!
    expect(c.ask).toEqual([ex.obs!])
    expect(c.examples).toEqual([ex.obs!])
    const conv: ConvState = { last: null }
    const r = await turn(conv, { q: ex.obs! }, 'en')
    expect(r.found, ex.obs!).toBeGreaterThan(0)
  }, 120000)

  test('without the stories there is no example and the card has no "Try it"', async () => {
    if (!ALL_PACKS.includes('es-419')) return
    await installPacks(['es-419', 'en'])
    await withObs('en', 'none')
    const ex = (await examplesOf('es', ['es-419'], 'es-419'))!
    expect(ex.obs).toBeNull()
    const c = cardsFor('es', ex, true, true, has({ obs: true, books: true, people: true, places: true })).find((x) => x.id === 'obs')!
    expect(c.ask).toEqual([])
    expect(c.examples).toEqual([])
    await withObs('en')
  }, 120000)

  test('no card ever offers a "Try it" with nothing behind it, with and without the stories', async () => {
    if (!ALL_PACKS.includes('en')) return
    await installPacks(['en'])
    await withObs('en')
    const ex = (await examplesOf('en', ['en'], 'en'))!
    for (const obs of [true, false]) {
      for (const c of cardsFor('en', obs ? ex : { ...ex, obs: null }, true, true, has({ obs, books: true }))) {
        const tries = c.ask.length || c.fill || c.tryBrowse || c.sheet
        // (a card with no example, no fill, no sheet and no browse has no "Try it": the saved and menu ones have their own button)
        if (!tries) expect(['obs', 'who', 'save', 'menu', 'browse']).toContain(c.id)
        if (c.ask.length) for (const q of c.ask) {
          const r = await turn({ last: null }, { q }, 'en')
          expect(r.found, `${c.id}: ${q}`).toBeGreaterThan(0)
        }
      }
    }
  }, 120000)
})

describe('"What can you do?" adds lines only for what the phone has', () => {
  test('with the stories, a book and a mode: the three lines', async () => {
    if (!ALL_PACKS.includes('es-419')) return
    await installPacks(['es-419', 'en'])
    await withObs('en')
    const t = await helpLines('es', ['es-419'])
    expect(t).toContain('OBS 3 o OBS 3:5')
    expect(t).toContain('Quién es «él» en Rut 2:4')
    expect(t).toContain('Modos guiados (en Explorar): traducir un libro')
    expect(t.startsWith('\n\n- ')).toBe(true)
    // in every language, the same three lines
    for (const ui of UIS) expect((await helpLines(ui, ['es-419'])).split('\n- ').length, ui).toBe(4)
  }, 120000)

  test('without the stories: no OBS line; without any pack: nothing at all', async () => {
    if (!ALL_PACKS.includes('es-419')) return
    await installPacks(['es-419', 'en'])
    await withObs('en', 'none')
    const t = await helpLines('es', ['es-419'])
    expect(t).not.toContain('OBS')
    expect(t).toContain('Quién es')
    expect(await helpLines('es', [])).toBe('')
    await withObs('en')
  }, 120000)

  test('the modes line names only the modes the phone can run', async () => {
    if (!ALL_PACKS.includes('es-419')) return
    await installPacks(['es-419', 'en'])
    await withObs('en')
    const t = await helpLines('es', ['es-419'])
    // (the 5M session only with the dev switch: off here)
    expect(t).not.toContain('5M')
  }, 120000)
})
