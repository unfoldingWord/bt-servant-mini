// placeShape / placeQuestion / placesAt / referenceFor (places.ts; encargo-ms-mapas.md task 1; diseno-mapas.md §5.1, §5.2, §5.5).
// Two sources of data: the signed geo sample of tc-study (maps-fixture.ts: Jerusalén, two Beléns, Egipto, Ur; Abraham born in Ur; no
// verses, only the book Tit), and a hand-made reader over it for what the sample lacks: verses, homonyms by the ten-times rule, a region
// and a city of one name, «Israel» as a person and a place, a place with no point, a water, no `geo`, no `xtopics`.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Topic, TopicsCore, XtopicsCore, XtopicsPart } from '@bt-synergy/language-pack-v3'
import { peopleQuery } from '@lpc/query/family'
import { fullPhone } from './harness'
import { mapsFixture } from './maps-fixture'
import { personVerses, placeData, placeQuestion, placeShape, placesAt, placeVerses, referenceFor, REFERENCE_PLACES, setPlaceReader, type PlaceReader } from '../src/places'

// ------------------------------------------------------------------------------------------------------------------- the shapes
type Row = [q: string, kind: string, names: string[], lang: string]
const ROWS: Row[] = [
  // es
  ['¿Dónde queda Betel?', 'where', ['Betel'], 'es'],
  ['¿Dónde estaba Jerusalén?', 'where', ['Jerusalén'], 'es'],
  ['¿dónde está la Betel?', 'where', ['la Betel'], 'es'],
  ['¿Qué pasó en Jerusalén?', 'happened', ['Jerusalén'], 'es'],
  ['¿Qué sucedió en Betel?', 'happened', ['Betel'], 'es'],
  ['¿Dónde nació Pablo?', 'born', ['Pablo'], 'es'],
  ['¿Dónde murió Pablo?', 'died', ['Pablo'], 'es'],
  ['¿Qué distancia hay entre Belén y Jerusalén?', 'distance', ['Belén', 'Jerusalén'], 'es'],
  ['¿A cuánto está Belén de Jerusalén?', 'distance', ['Belén', 'Jerusalén'], 'es'],
  ['¿Cuántos días de viaje hay de Jerusalén a Damasco?', 'days', ['Jerusalén', 'Damasco'], 'es'],
  ['¿Cuánto se tardaba de Jerusalén a Damasco?', 'days', ['Jerusalén', 'Damasco'], 'es'],
  ['mapa de Jerusalén', 'map', ['Jerusalén'], 'es'],
  ['muéstrame Betel en el mapa', 'map', ['Betel'], 'es'],
  // en
  ['Where is Bethel?', 'where', ['Bethel'], 'en'],
  ["Where's Bethel", 'where', ['Bethel'], 'en'],
  ['Where was Bethel located?', 'where', ['Bethel'], 'en'],
  ['What happened in Jerusalem?', 'happened', ['Jerusalem'], 'en'],
  ['What happened at Bethel?', 'happened', ['Bethel'], 'en'],
  ['Where was Paul born?', 'born', ['Paul'], 'en'],
  ['Where did Paul die?', 'died', ['Paul'], 'en'],
  ['How far is Bethlehem from Jerusalem?', 'distance', ['Bethlehem', 'Jerusalem'], 'en'],
  ['What is the distance between Bethlehem and Jerusalem?', 'distance', ['Bethlehem', 'Jerusalem'], 'en'],
  ['How many days from Jerusalem to Damascus?', 'days', ['Jerusalem', 'Damascus'], 'en'],
  ['How long did it take to travel from Jerusalem to Damascus?', 'days', ['Jerusalem', 'Damascus'], 'en'],
  ['map of Jerusalem', 'map', ['Jerusalem'], 'en'],
  ['show Bethel on the map', 'map', ['Bethel'], 'en'],
  // fr
  ['Où se trouve Béthel ?', 'where', ['Béthel'], 'fr'],
  ['Où était Jérusalem ?', 'where', ['Jérusalem'], 'fr'],
  ["Que s'est-il passé à Jérusalem ?", 'happened', ['Jérusalem'], 'fr'],
  ['Où est né Paul ?', 'born', ['Paul'], 'fr'],
  ['Où est née Sara ?', 'born', ['Sara'], 'fr'],
  ['Où est mort Paul ?', 'died', ['Paul'], 'fr'],
  ['Où est morte Sara ?', 'died', ['Sara'], 'fr'],
  ['Quelle distance entre Bethléem et Jérusalem ?', 'distance', ['Bethléem', 'Jérusalem'], 'fr'],
  ['Combien de jours de Jérusalem à Damas ?', 'days', ['Jérusalem', 'Damas'], 'fr'],
  ['carte de Jérusalem', 'map', ['Jérusalem'], 'fr'],
  // id
  ['Di mana Betel?', 'where', ['Betel'], 'id'],
  ['Apa yang terjadi di Yerusalem?', 'happened', ['Yerusalem'], 'id'],
  ['Di mana Paulus lahir?', 'born', ['Paulus'], 'id'],
  ['Di mana Paulus meninggal?', 'died', ['Paulus'], 'id'],
  ['Berapa jauh Betlehem dari Yerusalem?', 'distance', ['Betlehem', 'Yerusalem'], 'id'],
  ['Berapa hari perjalanan dari Yerusalem ke Damaskus?', 'days', ['Yerusalem', 'Damaskus'], 'id'],
  ['peta Yerusalem', 'map', ['Yerusalem'], 'id'],
  // hi (the name first)
  ['यरूशलेम कहाँ है?', 'where', ['यरूशलेम'], 'hi'],
  ['यरूशलेम कहां था।', 'where', ['यरूशलेम'], 'hi'],
  ['यरूशलेम में क्या हुआ?', 'happened', ['यरूशलेम'], 'hi'],
  ['पौलुस का जन्म कहाँ हुआ?', 'born', ['पौलुस'], 'hi'],
  ['पौलुस की मृत्यु कहाँ हुई?', 'died', ['पौलुस'], 'hi'],
  ['बैतलहम से यरूशलेम कितनी दूर है?', 'distance', ['बैतलहम', 'यरूशलेम'], 'hi'],
  ['यरूशलेम से दमिश्क तक कितने दिन लगते थे?', 'days', ['यरूशलेम', 'दमिश्क'], 'hi'],
  ['यरूशलेम का नक्शा', 'map', ['यरूशलेम'], 'hi'],
  // ar (names as the text reads after normalising: «إ» → «ا»)
  ['أين تقع بيت إيل؟', 'where', ['بيت ايل'], 'ar'],
  ['أين كانت القدس؟', 'where', ['القدس'], 'ar'],
  ['ماذا حدث في القدس؟', 'happened', ['القدس'], 'ar'],
  ['أين وُلد بولس؟', 'born', ['بولس'], 'ar'],
  ['أين وُلدت سارة؟', 'born', ['سارة'], 'ar'],
  ['أين مات بولس؟', 'died', ['بولس'], 'ar'],
  ['كم تبعد بيت لحم عن القدس؟', 'distance', ['بيت لحم', 'القدس'], 'ar'],
  ['كم يومًا من القدس إلى دمشق؟', 'days', ['القدس', 'دمشق'], 'ar'],
  ['خريطة القدس', 'map', ['القدس'], 'ar'],
]
describe('placeShape: every form of §5.1 in the six languages', () => {
  for (const [q, kind, names, lang] of ROWS) {
    test(q, () => expect(placeShape(q)).toEqual({ kind: kind as any, names, lang: lang as any }))
  }
  test('the marks and the case do not matter, nor accents left out', () => {
    expect(placeShape('donde queda betel')).toMatchObject({ kind: 'where', names: ['betel'] })
    expect(placeShape('¡¿DÓNDE QUEDA BETEL?!')).toMatchObject({ kind: 'where' })
    expect(placeShape('Où se trouve Béthel ?')?.names).toEqual(['Béthel'])
  })
})

describe('placeShape: never a place question', () => {
  test.each([
    '¿Dónde está escrito amor?', '¿Dónde dice la Biblia que Dios es amor?', 'where is it written', 'where is it written that God is love?',
    "où est-il écrit que Dieu est amour ?", 'où est écrit le mot grâce ?', 'di mana tertulis kasih?', 'di mana tertulis',
    '¿Dónde está Dios?', '¿Dónde estás?', 'where are you', 'where is God?', 'où es-tu ?', 'di mana Anda?', 'أين الله؟', 'वह कहाँ है?',
    // not this shape, or E3 (journeys, ordinals, a map of a person)
    'viajes de Pablo', '¿a dónde fue Pablo?', 'primer viaje de Pablo', 'journeys of Paul', '¿quién era Israel?', 'who was Israel?', 'hijos de Isaac', '¿Qué es la gracia?', '',
  ])('%s', (q) => expect(placeShape(q)).toBeNull())
})

// -------------------------------------------------------------------------------------------------------- the signed sample
const fixture = mapsFixture()
let sample: PlaceReader
beforeAll(async () => {
  await fullPhone()
  sample = await fixture.open()
  setPlaceReader(async () => sample)
})
afterAll(() => setPlaceReader())

describe('placeQuestion on the signed sample (es-419)', () => {
  test('«¿Dónde queda Jerusalén?»: the place, with its point, certainty and form', async () => {
    const a = await placeQuestion('¿Dónde queda Jerusalén?', 'es', null)
    expect(a).toMatchObject({ kind: 'where', ui: 'es', pack: 'es-419' })
    expect(a!.places).toEqual([{ id: 'lug:jerusalem', name: 'Jerusalén', lat: 31.78, lon: 35.23, sure: 2, form: 1 }])
    expect(a!.choose).toBeUndefined()
    expect(a!.other).toBeUndefined()
  })
  test('an alias («Sión»), with an article, a noun before it, or an English title', async () => {
    for (const q of ['¿Dónde queda Sión?', '¿Dónde queda la Sión?', '¿dónde queda la ciudad de Jerusalén?', '¿Dónde queda Jerusalem?']) {
      expect((await placeQuestion(q, 'es', null))!.places.map((p) => p.id)).toEqual(['lug:jerusalem'])
    }
    expect((await placeQuestion('where is Jerusalem?', 'en', null))).toMatchObject({ ui: 'en', places: [{ id: 'lug:jerusalem' }] })
  })
  test('«Belén»: two places of one name with no verses: ask, with the note of each', async () => {
    const a = await placeQuestion('¿Dónde queda Belén?', 'es', null)
    expect(a!.places).toEqual([])
    expect(a!.choose).toMatchObject({ name: 'Belén' })
    expect(a!.choose!.options.map((o) => [o.id, o.note, o.sure])).toEqual([['lug:bethlehem-gen-35-16', 'de Judá', 3], ['lug:bethlehem-jos-19-15', 'de Zabulón', 1]])
  })
  test('a region (form 2) and a port (form 5) are places like the rest', async () => {
    expect((await placeQuestion('¿Dónde queda Egipto?', 'es', null))!.places[0]).toMatchObject({ id: 'lug:egypt', form: 2, sure: 1 })
    expect((await placeQuestion('mapa de Ur', 'es', null))).toMatchObject({ kind: 'map', places: [{ id: 'lug:ur', form: 5, sure: 2 }] })
  })
  test('a distance and the days between two places keep the order of the question', async () => {
    expect((await placeQuestion('¿Qué distancia hay entre Ur y Jerusalén?', 'es', null))!.places.map((p) => p.id)).toEqual(['lug:ur', 'lug:jerusalem'])
    expect(await placeQuestion('¿Cuántos días de viaje hay de Jerusalén a Ur?', 'es', null)).toMatchObject({ kind: 'days', places: [{ id: 'lug:jerusalem' }, { id: 'lug:ur' }] })
    // (one name is a place, the other is not: the route is not taken)
    expect(await placeQuestion('¿Qué distancia hay entre Ur y Abraham?', 'es', null)).toBeNull()
  })
  test('«¿Qué pasó en Egipto?»', async () => {
    expect(await placeQuestion('¿Qué pasó en Egipto?', 'es', null)).toMatchObject({ kind: 'happened', places: [{ id: 'lug:egypt' }] })
  })
  test('born / died: the person and the place of `born-in`; a person with no place for the kind is no place question (null)', async () => {
    expect(await placeQuestion('¿Dónde nació Abraham?', 'es', null)).toMatchObject({ kind: 'born', person: { id: 'per:abraham', name: 'Abraham' }, places: [{ id: 'lug:ur', sure: 2, form: 5 }] })
    // (no `died-in` / `born-in` for the person: null, the question goes on to the verse search)
    expect(await placeQuestion('¿Dónde murió Abraham?', 'es', null)).toBeNull()
    expect(await placeQuestion('¿Dónde nació Sara?', 'es', null)).toBeNull()
    expect(await placeQuestion('where was Abraham born?', 'en', null)).toMatchObject({ person: { id: 'per:abraham' }, places: [{ id: 'lug:ur' }] })
  })
  test('two people of one name, none with a birth place in the sample: null (the choice among homonyms is tested with the relation, below)', async () => {
    expect(await placeQuestion('¿Dónde nació Zechariah?', 'es', null)).toBeNull()
  })
  test('a name that is not what the question asks: the question goes on as today', async () => {
    expect(await placeQuestion('¿Dónde queda Abraham?', 'es', null)).toBeNull()     // a person, not a place
    expect(await placeQuestion('¿Dónde nació Jerusalén?', 'es', null)).toBeNull()   // a place, not a person
    expect(await placeQuestion('¿Dónde queda Atlántida?', 'es', null)).toBeNull()
    expect(await placeQuestion('¿Dónde está Dios?', 'es', null)).toBeNull()
    expect(await placeQuestion('¿Dónde está escrito Egipto?', 'es', null)).toBeNull()
    expect(await placeQuestion('mapa de Abraham', 'es', null)).toBeNull()           // a person's map is E3
    expect(await placeQuestion('hijos de Isaac', 'es', null)).toBeNull()
  })
  test('placeData: the client query; null for what is no place', async () => {
    const d = await placeData('es-419', 'lug:egypt')
    expect(d).toMatchObject({ id: 'lug:egypt', name: 'Egipto', tw: ['tw:names/egypt'], verses: 0 })
    expect(d!.events.map((e) => e.id).sort()).toEqual(['ev:abraham-goes-to-egypt', 'ev:exodus-from-egypt', 'ev:sojourn-in-canaan-and-egypt'])
    expect((await placeData('es-419', 'lug:ur'))!.born).toEqual([{ id: 'per:abraham', name: 'Abraham' }])
    expect(await placeData('es-419', 'per:abraham')).toBeNull()
    expect(await placeData('es-419', 'nada')).toBeNull()
  })
  test('placesAt and the verses of a topic with no part installed are empty, not an error', async () => {
    expect(await placesAt('es-419', 'gen 12:8')).toEqual([])
    expect(await placesAt('es-419', 'basura')).toEqual([])
    expect(await placeVerses('es-419', 'lug:egypt')).toEqual([])
    expect(await personVerses('es-419', 'per:abraham')).toEqual([])
  })
  test('referenceFor: the nearest reference place with a point', async () => {
    expect((await referenceFor('es-419', (await placeQuestion('mapa de Egipto', 'es', null))!.places[0]!))?.id).toBe('lug:jerusalem')
    // Jerusalem is its own reference: skipped, and no other one is in the sample
    expect(await referenceFor('es-419', (await placeQuestion('mapa de Jerusalén', 'es', null))!.places[0]!)).toBeNull()
  })
})

// ------------------------------------------------------------------------------------------------------ the hand-made reader
const G = 1_000_000
const v = (book: number, ch: number, vs: number) => book * G + ch * 1000 + vs
const place = (title: string): Topic => ({ kind: 'place', source: 'STEPBible/STEPBible-Data/TIPNR', ref: `${title}@x`, title, ustrong: '' })
const person = (title: string): Topic => ({ kind: 'person', source: 'STEPBible/STEPBible-Data/TIPNR', ref: `${title}@x`, title, ustrong: '' })
type World = {
  topics: [string, Topic][]
  geo?: Record<string, { lat: number; lon: number; sure: 0 | 1 | 2 | 3; form: 1 | 2 | 3 | 4 | 5 }>
  /** verses per topic by book (the core's counts come from them, one verse each unless `count` says) */
  verses: Record<string, number[]>
  count?: Record<string, number>
  relations?: { from: string; to: string; type: string }[]
  places?: TopicsCore['places']
  names?: Record<string, string[]>
  obsFrames?: Record<string, [number, number][]>
  noXtopics?: true
}
const BOOK = ['gen', 'exo', 'lev', 'num', 'deu', 'jos', 'jdg', 'rut', '1sa', '2sa', '1ki', '2ki', '1ch', '2ch', 'ezr', 'neh', 'est', 'job', 'psa', 'pro', 'ecc', 'sng', 'isa', 'jer', 'lam', 'ezk', 'dan', 'hos', 'jol', 'amo', 'oba', 'jon', 'mic', 'nam', 'hab', 'zep', 'hag', 'zec', 'mal', 'mat', 'mrk', 'luk', 'jhn', 'act']
function world(w: World): PlaceReader {
  // (the core keeps, per book, [spans, verses])
  const occurrences = new Map<string, Map<string, [number, number]>>()
  const parts = new Map<string, XtopicsPart>()
  for (const [id, list] of Object.entries(w.verses)) {
    for (const vs of list) {
      const b = BOOK[Math.floor(vs / G) - 1]!
      const m = occurrences.get(id) ?? new Map<string, [number, number]>()
      m.set(b, [1, (m.get(b)?.[1] ?? 0) + 1])
      occurrences.set(id, m)
      const part = parts.get(b) ?? ({ occurrences: new Map<string, number[]>() } as unknown as XtopicsPart)
      ;(part.occurrences as Map<string, number[]>).set(id, [...((part.occurrences as Map<string, number[]>).get(id) ?? []), vs])
      parts.set(b, part)
    }
  }
  for (const [id, n] of Object.entries(w.count ?? {})) occurrences.set(id, new Map([['gen', [1, n] as [number, number]]]))
  const core = {
    topics: new Map(w.topics), occurrences, relations: w.relations ?? [], geo: w.geo, obsFrames: w.obsFrames,
    res: [['STEPBible/STEPBible-Data/TIPNR', 'x']], gender: {},
  } as unknown as XtopicsCore
  const names: Record<string, string[]> = w.names ?? {}
  const topics = { lang: 'es-419', part: 'core', res: [], names: {}, coverage: {}, places: w.places } as unknown as TopicsCore
  const self: any = { ...(base as object) }
  self.mapsOf = async (units: string[]) => ({
    ...(units.includes('xtopics') && !w.noXtopics ? { xtopics: { core, parts } } : {}),
    ...(units.includes('map') ? { map: { core: { names } } } : {}),
    ...(units.includes('topics') ? { topics: { core: topics } } : {}),
  })
  self.xtopicsParts = async (books: string[]) => new Map(books.filter((b) => parts.has(b)).map((b) => [b, parts.get(b)!]))
  self.people = () => peopleQuery(self)
  return self as PlaceReader
}
let base: PlaceReader
beforeAll(async () => { base = await fixture.open() })
const asWorld = (w: World) => setPlaceReader(async () => world(w))

const JER = { lat: 3178, lon: 3523, sure: 3 as const, form: 1 as const }
const hundred = (n: number, start: number) => Array.from({ length: n }, (_, i) => v(1, 12, start + (i % 30)) + Math.floor(i / 30) * 1000)

describe('homonyms (§5.2)', () => {
  test('the ten-times rule: Bethel of Ephraim wins, the other is offered', async () => {
    asWorld({
      topics: [['lug:bethel-a', place('Bethel')], ['lug:bethel-b', place('Bethel')]],
      geo: { 'lug:bethel-a': { lat: 3194, lon: 3522, sure: 3, form: 1 }, 'lug:bethel-b': { lat: 3150, lon: 3480, sure: 2, form: 1 } },
      verses: { 'lug:bethel-a': hundred(70, 1), 'lug:bethel-b': [v(1, 19, 1), v(1, 19, 2), v(1, 19, 3), v(1, 19, 4), v(1, 19, 5), v(1, 19, 6), v(1, 19, 7)] },
      places: { names: { 'lug:bethel-a': 'Betel', 'lug:bethel-b': 'Betel' }, notes: { 'lug:bethel-a': 'de Efraín', 'lug:bethel-b': 'de Simeón' }, aliases: {} },
    })
    const a = await placeQuestion('¿Dónde queda Betel?', 'es', null)
    expect(a!.places.map((p) => p.id)).toEqual(['lug:bethel-a'])
    expect(a!.other!.map((p) => [p.id, p.note])).toEqual([['lug:bethel-b', 'de Simeón']])
    expect(a!.choose).toBeUndefined()
  })
  test('exactly ten times is enough, nine is not', async () => {
    const mk = (n: number) => world({ topics: [['lug:a', place('Bethel')], ['lug:b', place('Bethel')]], verses: {}, count: { 'lug:a': n, 'lug:b': 1 } })
    setPlaceReader(async () => mk(10))
    expect((await placeQuestion('where is Bethel?', 'en', null))!.places[0]!.id).toBe('lug:a')
    setPlaceReader(async () => mk(9))
    expect((await placeQuestion('where is Bethel?', 'en', null))!.choose!.options.map((o) => o.id)).toEqual(['lug:a', 'lug:b'])
  })
  test('the passage in the conversation: exactly one of them in that chapter', async () => {
    asWorld({
      topics: [['lug:bethel-a', place('Bethel')], ['lug:bethel-b', place('Bethel')]],
      verses: { 'lug:bethel-a': [v(1, 12, 8), v(1, 13, 3)], 'lug:bethel-b': [v(1, 19, 1), v(1, 19, 2)] },
    })
    expect((await placeQuestion('where is Bethel?', 'en', 'gen 12:8'))!.places[0]!.id).toBe('lug:bethel-a')
    expect((await placeQuestion('where is Bethel?', 'en', 'gen 19'))!.places[0]!.id).toBe('lug:bethel-b')
    expect((await placeQuestion('where is Bethel?', 'en', 'gen 1:1'))!.choose!.options).toHaveLength(2)
    expect((await placeQuestion('where is Bethel?', 'en', 'obs 3:4'))!.choose!.options).toHaveLength(2)
  })
  test('a region and a city of one name: the city wins in where, distance and days; ask in the rest', async () => {
    asWorld({
      topics: [['lug:judah-region', place('Judah')], ['lug:judah-town', place('Judah')], ['lug:jerusalem', place('Jerusalem')]],
      geo: { 'lug:judah-region': { lat: 3150, lon: 3500, sure: 1, form: 2 }, 'lug:judah-town': { lat: 3180, lon: 3490, sure: 2, form: 1 }, 'lug:jerusalem': JER },
      verses: {}, count: { 'lug:judah-region': 20, 'lug:judah-town': 5, 'lug:jerusalem': 600 },
    })
    expect((await placeQuestion('where is Judah?', 'en', null))).toMatchObject({ places: [{ id: 'lug:judah-town' }], other: [{ id: 'lug:judah-region' }] })
    expect((await placeQuestion('how far is Judah from Jerusalem?', 'en', null))!.places.map((p) => p.id)).toEqual(['lug:judah-town', 'lug:jerusalem'])
    expect((await placeQuestion('how many days from Judah to Jerusalem?', 'en', null))!.places[0]!.id).toBe('lug:judah-town')
    for (const q of ['what happened in Judah?', 'map of Judah']) expect((await placeQuestion(q, 'en', null))!.choose!.options.map((o) => o.id)).toEqual(['lug:judah-region', 'lug:judah-town'])
  })
  test('two cities of one name and a region: the region does not decide', async () => {
    asWorld({
      topics: [['lug:r', place('Ephraim')], ['lug:c1', place('Ephraim')], ['lug:c2', place('Ephraim')]],
      geo: { 'lug:r': { lat: 3200, lon: 3500, sure: 1, form: 2 }, 'lug:c1': { lat: 3190, lon: 3510, sure: 2, form: 1 }, 'lug:c2': { lat: 3170, lon: 3500, sure: 2, form: 1 } },
      verses: {}, count: { 'lug:r': 3, 'lug:c1': 3, 'lug:c2': 3 },
    })
    expect((await placeQuestion('where is Ephraim?', 'en', null))!.choose!.options).toHaveLength(3)
  })
  test('died: a `died-in` relation gives the place; a person with only `born-in` falls back (null)', async () => {
    asWorld({
      topics: [['lug:hebron', place('Hebrón')], ['per:sara', person('Sara')], ['per:ana', person('Ana')]],
      geo: { 'lug:hebron': { lat: 3150, lon: 3510, sure: 2, form: 1 } },
      verses: {}, count: { 'lug:hebron': 40, 'per:sara': 10, 'per:ana': 5 },
      relations: [{ from: 'per:sara', to: 'lug:hebron', type: 'died-in' }, { from: 'per:ana', to: 'lug:hebron', type: 'born-in' }],
    })
    expect(await placeQuestion('¿Dónde murió Sara?', 'es', null)).toMatchObject({ kind: 'died', person: { id: 'per:sara' }, places: [{ id: 'lug:hebron' }] })
    expect(await placeQuestion('¿Dónde murió Ana?', 'es', null)).toBeNull()
    expect(await placeQuestion('¿Dónde nació Ana?', 'es', null)).toMatchObject({ kind: 'born', places: [{ id: 'lug:hebron' }] })
  })
  test('born homonyms (their refs are `per:` with no point): only the people with a `born-in` place count (none: null; one: that person; several: the ten-times rule among them)', async () => {
    const mk = (rel: string[], count: Record<string, number>): World => ({
      topics: [['lug:hebron', place('Hebrón')], ['per:z1', person('Zed')], ['per:z2', person('Zed')], ['per:z3', person('Zed')]],
      geo: { 'lug:hebron': { lat: 3150, lon: 3510, sure: 2, form: 1 } }, verses: {}, count: { 'lug:hebron': 9, ...count },
      relations: rel.map((from) => ({ from, to: 'lug:hebron', type: 'born-in' })),
    })
    // none has the relation: not a place question, even with three people of the name
    asWorld(mk([], { 'per:z1': 5, 'per:z2': 5, 'per:z3': 5 }))
    expect(await placeQuestion('¿Dónde nació Zed?', 'es', null)).toBeNull()
    // one has it (the one with fewer verses): no choice, that person
    asWorld(mk(['per:z2'], { 'per:z1': 50, 'per:z2': 5, 'per:z3': 5 }))
    expect(await placeQuestion('¿Dónde nació Zed?', 'es', null)).toMatchObject({ person: { id: 'per:z2' }, places: [{ id: 'lug:hebron' }] })
    expect((await placeQuestion('¿Dónde nació Zed?', 'es', null))!.choose).toBeUndefined()
    // several have it, equally named: the choice lists those two alone
    asWorld(mk(['per:z1', 'per:z2'], { 'per:z1': 5, 'per:z2': 5, 'per:z3': 50 }))
    const two = await placeQuestion('¿Dónde nació Zed?', 'es', null)
    expect(two!.choose!.options.map((o) => o.id)).toEqual(['per:z1', 'per:z2'])
    // several, one far more named (ten times): it wins
    asWorld(mk(['per:z1', 'per:z2'], { 'per:z1': 100, 'per:z2': 5, 'per:z3': 500 }))
    expect(await placeQuestion('¿Dónde nació Zed?', 'es', null)).toMatchObject({ person: { id: 'per:z1' } })
  })
  test('two packs: a person with no place in the first pack is not answered for by another person of the name in the second (null)', async () => {
    const first = world({ topics: [['per:a', person('Zed')]], verses: {}, count: { 'per:a': 5 } })
    const second = world({
      topics: [['lug:hebron', place('Hebrón')], ['per:b', person('Zed')]],
      geo: { 'lug:hebron': { lat: 3150, lon: 3510, sure: 2, form: 1 } }, verses: {}, count: { 'lug:hebron': 9, 'per:b': 5 },
      relations: [{ from: 'per:b', to: 'lug:hebron', type: 'born-in' }],
    })
    const asked: string[] = []
    setPlaceReader(async (lang) => { asked.push(lang); return lang === 'en' ? second : first })
    expect(await placeQuestion('¿Dónde nació Zed?', 'es', null)).toBeNull()
    // (the second pack was never needed: the first knew the name)
    expect(asked).not.toContain('en')
    // control: the same second pack alone does answer
    setPlaceReader(async () => second)
    expect(await placeQuestion('¿Dónde nació Zed?', 'es', null)).toMatchObject({ person: { id: 'per:b' } })
  })
  test('a person and a place of one name: the question decides', async () => {
    // «Israel»: the patriarch (a person), the land (a place), and one Translation Words article joined to both (a rule of E1)
    asWorld({
      topics: [['lug:israel', place('Israel')], ['per:israel', person('Israel')]],
      geo: { 'lug:israel': { lat: 3250, lon: 3520, sure: 2, form: 2 } },
      verses: {}, count: { 'lug:israel': 2500, 'per:israel': 40 },
      relations: [{ from: 'tw:names/israel', to: 'lug:israel', type: 'same-as' }, { from: 'tw:names/israel', to: 'per:israel', type: 'same-as' }],
      names: { 'tw:names/israel': ['Israel'] },
    })
    expect(await placeQuestion('¿Dónde queda Israel?', 'es', null)).toMatchObject({ kind: 'where', places: [{ id: 'lug:israel', name: 'Israel', form: 2 }] })
    expect(await placeQuestion('mapa de Israel', 'es', null)).toMatchObject({ kind: 'map', places: [{ id: 'lug:israel' }] })
    expect(await placeQuestion('¿Dónde nació Israel?', 'es', null)).toBeNull()
    // «who was Israel?» is no place question: the people's family and article answer it, as today
    expect(placeShape('¿Quién era Israel?')).toBeNull()
    expect(await placeQuestion('¿Quién era Israel?', 'es', null)).toBeNull()
    expect(await placeQuestion('¿Quiénes fueron los hijos de Israel?', 'es', null)).toBeNull()
  })
})

describe('corrección 1', () => {
  test('two names: every name must be a place before a choice is asked', async () => {
    setPlaceReader(async () => sample)
    expect(await placeQuestion('¿Qué distancia hay entre Belén y Génesis?', 'es', null)).toBeNull()
    expect(await placeQuestion('¿Qué distancia hay entre Génesis y Belén?', 'es', null)).toBeNull()
    expect((await placeQuestion('¿Qué distancia hay entre Belén y Jerusalén?', 'es', null))!.choose).toMatchObject({ name: 'Belén' })
    asWorld({ topics: [['lug:a', place('Bethel')], ['lug:b', place('Bethel')], ['lug:c', place('Ephraim')], ['lug:d', place('Ephraim')]], verses: {}, count: { 'lug:a': 3, 'lug:b': 3, 'lug:c': 3, 'lug:d': 3 } })
    expect((await placeQuestion('how far is Bethel from Ephraim?', 'en', null))!.choose).toMatchObject({ name: 'Bethel' })
  })
  test('French: «Mer» of «Merom» is not a noun to strip; «mer de Galilée» still is', async () => {
    asWorld({ topics: [['lug:om', place('Om')], ['lug:gal', place('Galilee')]], verses: {} })
    expect(await placeQuestion('Où se trouve Merom ?', 'fr', null)).toBeNull()
    expect((await placeQuestion('Où se trouve la mer de Galilée ?', 'fr', null))!.places[0]!.id).toBe('lug:gal')
  })
  test('«कहा» (said) and Arabic «قال» only as whole words', () => {
    expect(placeShape('यरूशलेम कहाँ है?')).not.toBeNull()
    expect(placeShape('उसने कहा यरूशलेम कहाँ है')).toBeNull()
    expect(placeShape('यरूशलेम कहाँ लिखा है')).toBeNull()
    expect(placeShape('أين تقع قالب؟')).not.toBeNull()
    expect(placeShape('أين تقع القدس؟')).not.toBeNull()
    expect(placeShape('أين قال أين تقع القدس')).toBeNull()
    expect(placeShape('أين مكتوب هذا؟')).toBeNull()
    for (const w of ['وقال', 'فقال', 'ويقول', 'المكتوب']) expect(placeShape(`أين ${w} هذا؟`)).toBeNull()
    expect(placeShape('أين تقع قالب؟')).not.toBeNull()
  })
})

describe('what the data lacks (§5.5)', () => {
  const lost = (extra: Partial<World> = {}): World => ({
    topics: [['lug:lost', place('Lost')], ['lug:jordan', place('Jordan')], ['lug:jerusalem', place('Jerusalem')], ['lug:emmaus', place('Emmaus')]],
    geo: { 'lug:jordan': { lat: 3200, lon: 3550, sure: 2, form: 3 }, 'lug:jerusalem': JER, 'lug:emmaus': { lat: 3180, lon: 3520, sure: 1, form: 1 } },
    verses: {}, ...extra,
  })
  test('sure 0 (no point): the route is taken; the place has no lat or lon', async () => {
    asWorld(lost())
    const a = await placeQuestion('where is Lost?', 'en', null)
    expect(a!.places[0]).toEqual({ id: 'lug:lost', name: 'Lost', sure: 0, form: 1 })
  })
  test('a water (form 3), a doubtful place (sure 1)', async () => {
    asWorld(lost())
    expect((await placeQuestion('where is the Jordan?', 'en', null))!.places[0]).toMatchObject({ id: 'lug:jordan', form: 3, sure: 2, lat: 32, lon: 35.5 })
    expect((await placeQuestion('where is Emmaus?', 'en', null))!.places[0]).toMatchObject({ sure: 1, form: 1 })
  })
  test('no `geo` in the common: the route is taken just the same, the places have no point', async () => {
    asWorld({ ...lost(), geo: undefined })
    const a = await placeQuestion('how far is Jerusalem from Emmaus?', 'en', null)
    expect(a!.places).toEqual([{ id: 'lug:jerusalem', name: 'Jerusalem', sure: 0, form: 1 }, { id: 'lug:emmaus', name: 'Emmaus', sure: 0, form: 1 }])
    expect(await referenceFor('en', a!.places[0]!)).toBeNull()
  })
  test('no `xtopics`: the route is not taken', async () => {
    asWorld({ ...lost(), noXtopics: true })
    expect(await placeQuestion('where is Jerusalem?', 'en', null)).toBeNull()
    expect(await placeQuestion('where was Abraham born?', 'en', null)).toBeNull()
  })
  test('no `places` table in the language: the title of a tW article, then the English title', async () => {
    asWorld({
      ...lost(), relations: [{ from: 'tw:names/jerusalem', to: 'lug:jerusalem', type: 'same-as' }], names: { 'tw:names/jerusalem': ['Jerusalén', 'Sión'] },
    })
    expect((await placeQuestion('¿dónde queda Jerusalén?', 'es', null))!.places[0]).toMatchObject({ id: 'lug:jerusalem', name: 'Jerusalén' })
    expect((await placeQuestion('¿dónde queda Jerusalem?', 'es', null))!.places[0]!.id).toBe('lug:jerusalem')
  })
  test('a name of the alignment and an ACAI alias find the place', async () => {
    asWorld({ ...lost(), places: { names: {}, notes: {}, aliases: { Yeru: ['lug:jerusalem'] } } })
    expect((await placeQuestion('where is Yeru?', 'en', null))!.places[0]!.id).toBe('lug:jerusalem')
  })
})

describe('the six languages resolve a name through its own pack', () => {
  test('Arabic: without vowel marks, without «ال», with a «و» before it', async () => {
    asWorld({
      topics: [['lug:jerusalem', place('Jerusalem')]], geo: { 'lug:jerusalem': JER }, verses: {},
      places: { names: { 'lug:jerusalem': 'الْقُدْس' }, notes: {}, aliases: {} },
    })
    for (const q of ['أين تقع القدس؟', 'أين تقع قدس؟', 'أين تقع مدينة القدس؟', 'أين تقع والقدس؟']) expect((await placeQuestion(q, 'ar', null))!.places[0]!.id).toBe('lug:jerusalem')
  })
  test('Hindi and French: the name before the question, an elided article', async () => {
    asWorld({ topics: [['lug:jerusalem', place('Jerusalem')], ['lug:ai', place('Ai')]], geo: { 'lug:jerusalem': JER }, verses: {}, places: { names: { 'lug:jerusalem': 'यरूशलेम', 'lug:ai': 'Aï' }, notes: {}, aliases: {} } })
    expect((await placeQuestion('यरूशलेम कहाँ है?', 'hi', null))).toMatchObject({ ui: 'hi', places: [{ id: 'lug:jerusalem' }] })
    expect((await placeQuestion("Où se trouve l'Aï ?", 'fr', null))).toMatchObject({ ui: 'fr', places: [{ id: 'lug:ai' }] })
  })
})

describe('placesAt, placeVerses, personVerses', () => {
  const W: World = {
    topics: [['lug:bethel', place('Bethel')], ['lug:shechem', place('Shechem')], ['lug:canaan', place('Canaan')], ['lug:jordan', place('Jordan')], ['per:abram', person('Abram')]],
    geo: { 'lug:bethel': JER, 'lug:shechem': { ...JER, lat: 3220 }, 'lug:canaan': { lat: 3200, lon: 3500, sure: 1, form: 2 }, 'lug:jordan': { lat: 3200, lon: 3550, sure: 2, form: 3 } },
    verses: {
      'lug:bethel': [v(1, 12, 8), v(1, 13, 3), v(2, 3, 1)],
      'lug:shechem': [v(1, 12, 6)],
      'lug:canaan': [v(1, 12, 5), v(1, 12, 6)],
      'lug:jordan': [v(1, 13, 10)],
      'per:abram': [v(1, 12, 1), v(1, 12, 6), v(1, 12, 8)],
    },
    obsFrames: { '5:9': [[v(1, 12, 8), v(1, 12, 8)]] },
  }
  beforeAll(() => asWorld(W))
  test('one verse', async () => expect((await placesAt('es-419', 'gen 12:8')).map((p) => [p.id, p.verse])).toEqual([['lug:bethel', v(1, 12, 8)]]))
  test('a range of one chapter: in the order of the text, regions left out', async () =>
    expect((await placesAt('es-419', 'gen 12:1-9')).map((p) => p.id)).toEqual(['lug:shechem', 'lug:bethel']))
  test('a range across chapters, and a whole chapter', async () => {
    expect((await placesAt('es-419', 'gen 12:1-13:12')).map((p) => p.id)).toEqual(['lug:shechem', 'lug:bethel', 'lug:jordan'])
    expect((await placesAt('es-419', 'gen 13')).map((p) => p.id)).toEqual(['lug:bethel', 'lug:jordan'])
  })
  test('a frame of Open Bible Stories', async () => expect((await placesAt('es-419', 'obs 5:9')).map((p) => p.id)).toEqual(['lug:bethel']))
  test('a ref that is not one, a book with no part: []', async () => {
    expect(await placesAt('es-419', 'xyz 1:1')).toEqual([])
    expect(await placesAt('es-419', 'rev 1:1')).toEqual([])
    expect(await placesAt('es-419', 'obs 99:9')).toEqual([])
  })
  test('the verses of a place and of a person, distinct and in order, across books', async () => {
    expect(await placeVerses('es-419', 'lug:bethel')).toEqual([v(1, 12, 8), v(1, 13, 3), v(2, 3, 1)])
    expect(await personVerses('es-419', 'per:abram')).toEqual([v(1, 12, 1), v(1, 12, 6), v(1, 12, 8)])
    expect(await placeVerses('es-419', 'lug:nowhere')).toEqual([])
  })
})

describe('referenceFor and REFERENCE_PLACES', () => {
  test('the list is the 18 ids of §5.3, no duplicates', () => {
    expect(REFERENCE_PLACES).toHaveLength(18)
    expect(new Set(REFERENCE_PLACES).size).toBe(18)
    expect(REFERENCE_PLACES.every((id) => id.startsWith('lug:'))).toBe(true)
  })
  const W: World = {
    topics: [['lug:jerusalem', place('Jerusalem')], ['lug:hebron', place('Hebron')], ['lug:damascus', place('Damascus')], ['lug:samaria', place('Samaria')], ['lug:bethel', place('Bethel')], ['lug:lost', place('Lost')]],
    geo: {
      'lug:jerusalem': JER, 'lug:hebron': { lat: 3153, lon: 3510, sure: 3, form: 1 }, 'lug:damascus': { lat: 3351, lon: 3629, sure: 3, form: 1 },
      // (the closest to Bethel, but a doubtful point: never a reference)
      'lug:samaria': { lat: 3200, lon: 3520, sure: 1, form: 1 }, 'lug:bethel': { lat: 3194, lon: 3522, sure: 3, form: 1 },
    },
    verses: {},
  }
  beforeAll(() => asWorld(W))
  test('the nearest, with a point of certainty 2 or 3', async () => {
    const bethel = (await placeQuestion('where is Bethel?', 'en', null))!.places[0]!
    expect((await referenceFor('en', bethel))!.id).toBe('lug:jerusalem')
  })
  test('a reference is not its own reference: the next one', async () => {
    const jer = (await placeQuestion('where is Jerusalem?', 'en', null))!.places[0]!
    expect((await referenceFor('en', jer))!.id).toBe('lug:hebron')
  })
  test('no point, no reference', async () => {
    const lost = (await placeQuestion('where is Lost?', 'en', null))!.places[0]!
    expect(await referenceFor('en', lost)).toBeNull()
  })
})
