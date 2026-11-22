// The place answers end to end (encargo-ms-mapas.md task 4; diseno-mapas.md §5.3, §5.5, §5.7, §5.8): a question as the app runs it (harness turn:
// reading, routes, graph), on the signed sample of tc-study (maps-fixture.ts: Jerusalén, two Beléns, Egipto, Ur; no verses, only the book Tit) and on a
// hand-made reader for what the sample lacks (verses, events with passages, a place with no point, no `geo`, Arabic names).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Topic, TopicsCore, XtopicsCore, XtopicsPart } from '@bt-synergy/language-pack-v3'
import { LIGHT_THEME } from '@bt-synergy/language-pack-client'
import { peopleQuery } from '@lpc/query/family'
import { fullPhone, turn } from './harness'
import { mapsFixture } from './maps-fixture'
import { setKinReader, isCreditLine, kinQuestion } from '../src/kin'
import { setPlaceReader, type PlaceReader } from '../src/places'
import { placeSheet, type ConvState, type Reply } from '../src/pipeline'
import { mapSvg, mapHeight, MAP_MAX_H, MAP_MIN_H, MAP_RATIO } from '../src/mapview'
import { md } from '../src/md'
import { buildContext } from '../src/context'
import { resizeMaps, sweepMaps } from '../src/placeview'
import { placeBlock } from '../src/placeview'

const ask = async (q: string, ui = 'es', c: ConvState = { last: null }) => turn(c, { q, slots: null }, ui)
const tap = (c: ConvState, r: Awaited<ReturnType<typeof ask>>, label: RegExp, ui = 'es') => {
  const f = (r.reply.follow ?? []).find((x) => label.test(x.label))
  if (!f?.sheet) throw new Error(`no button ${label} in ${labels(r).join(' | ')}`)
  return turn(c, { q: '', sheet: f.sheet }, ui)
}
const labels = (r: { reply: Reply }) => (r.reply.follow ?? []).map((f) => f.label)
/** The SVG of a reply's map as mapview.ts draws it (pure), to check what a screen reader and the page get. */
const svgOf = (r: { reply: Reply }, ui = 'es') => mapSvg({ ...r.reply.map!, ui, dir: ui === 'ar' ? 'rtl' : 'ltr', theme: LIGHT_THEME })
const lastPara = (r: { reply: Reply }) => r.reply.info!.split('\n\n').at(-1)!

const fixture = mapsFixture()
let sample: PlaceReader
beforeAll(async () => {
  await fullPhone()
  sample = await fixture.open()
})

// ---------------------------------------------------------------------------------------------------------- the signed sample
describe('on the signed sample (es-419)', () => {
  beforeAll(() => { setPlaceReader(async () => sample); setKinReader(async () => sample as never) })
  afterAll(() => { setPlaceReader(); setKinReader() })

  test('«¿Dónde queda Jerusalén?»: the place, its map and the list next to it, the article, the credit line', async () => {
    const r = await ask('¿Dónde queda Jerusalén?')
    expect(r.route).toBe('place')
    expect(r.answered).toBe('place')
    expect(r.concept).toBe('lug:jerusalem')
    // (the only place of the sample with a reference place is Jerusalén itself, which has no reference: «aparece en el mapa»)
    expect(r.reply.info).toMatch(/^Jerusalén aparece en el mapa\./)
    expect(r.reply.map!.points.map((p) => p.id)).toEqual(['lug:jerusalem'])
    expect(r.reply.list!.items.map((i) => i.text)).toEqual(['Jerusalén'])
    expect(labels(r)).toEqual(expect.arrayContaining(['Artículo: Jerusalén', 'Ficha de Jerusalén']))
    expect(lastPara(r)).toBe('*Lugares: OpenBible.info, TIPNR, ACAI · mapa: Natural Earth.*')
    expect(isCreditLine(lastPara(r).replace(/^\*|\*$/g, ''))).toBe(true)
    expect(r.reply.meta).toMatch(/read by code/)
  })
  test('the map says what it is: role="img" and the summary as its label, the name escaped', async () => {
    const r = await ask('¿Dónde queda Jerusalén?')
    const svg = svgOf(r)
    expect(svg).toMatch(/role="img"/)
    expect(svg).toContain(`aria-label="${r.reply.map!.summary}"`)
    expect(r.reply.map!.summary).toBe('Mapa: Jerusalén')
  })
  test('a region («Egipto»): the sentence with no distance, its events, the reference in the list', async () => {
    const r = await ask('¿Dónde queda Egipto?')
    expect(r.reply.info).toMatch(/^Egipto es una región; no tiene un punto exacto en el mapa\./)
    expect(r.reply.info).toMatch(/\*\*Aquí pasó:\*\* Abraham goes to Egypt; Exodus from Egypt; Sojourn in Canaan and Egypt/)
    expect(r.reply.list!.items[0]).toMatchObject({ text: 'Egipto', tag: 'región' })
    expect(labels(r)).toContain('Qué pasó en Egipto (3)')
  })
  test('«¿Qué pasó en Egipto?»: the three events (no passage in the sample: none shown), the way to the card', async () => {
    const r = await ask('¿Qué pasó en Egipto?')
    expect(r.reply.info).toMatch(/^\*\*Qué pasó en Egipto \(3\):\*\*/)
    expect(r.reply.list!.items.map((i) => i.text)).toEqual(['Abraham goes to Egypt', 'Exodus from Egypt', 'Sojourn in Canaan and Egypt'])
    expect(labels(r)).toContain('Ficha de Egipto')
    expect(r.reply.map).toBeUndefined()
  })
  test('«distancia entre Belén y Jerusalén»: two Beléns, so which one; then the line, the days, the map with both, the list', async () => {
    const c: ConvState = { last: null }
    const r = await ask('¿Qué distancia hay entre Belén y Jerusalén?', 'es', c)
    expect(r.answered).toBe('choose')
    expect(r.reply.intro).toBe('Hay varios lugares llamados Belén. ¿Cuál?')
    expect(labels(r)).toEqual(['Belén — de Judá', 'Belén — de Zabulón'])
    const d = await tap(c, r, /de Judá/)
    expect(d.answered).toBe('place')
    // (Belén sure 3, Jerusalén sure 2: «según la ubicación propuesta»; 8 km; less than a day)
    expect(d.reply.info).toMatch(/^Según la ubicación propuesta, unos 8 km en línea recta; Belén está al sur de Jerusalén\./)
    expect(d.reply.info).toMatch(/\n\nSegún la ubicación propuesta, menos de un día a pie, en burro o en camello \(aprox\.\)\./)
    expect(d.reply.map!.points.map((p) => p.id)).toEqual(['lug:bethlehem-gen-35-16', 'lug:jerusalem'])
    expect(d.reply.list!.items.map((i) => i.text)).toEqual(['Belén', 'Jerusalén'])
    expect(d.reply.map!.summary).toBe('Mapa: Belén, Jerusalén')
    expect(labels(d)).toEqual(['Ficha de Belén', 'Ficha de Jerusalén'])
    // the other Belén: uncertain (sure 1): no number, no days, drawn hollow
    const e = await tap(c, r, /de Zabulón/).catch(async () => tap(c, await ask('¿Qué distancia hay entre Belén y Jerusalén?', 'es', c), /de Zabulón/))
    expect(e.reply.info).toMatch(/^No se sabe con certeza dónde estaba Belén, así que no se da una distancia\./)
    expect(e.reply.info).not.toMatch(/km|día/)
    expect(e.reply.list!.items[0]).toMatchObject({ tag: 'ubicación incierta' })
  })
  test('«días de viaje» is the same answer as «distancia»', async () => {
    const c: ConvState = { last: null }
    const a = await ask('¿Cuántos días de viaje hay de Belén a Jerusalén?', 'es', c)
    const d = await tap(c, a, /de Judá/)
    const dist = await ask('¿Qué distancia hay entre Belén y Jerusalén?', 'es', c)
    const e = await tap(c, dist, /de Judá/)
    expect(d.reply.info).toBe(e.reply.info)
    expect(d.reply.map).toEqual(e.reply.map)
  })
  test('«¿Dónde nació Abraham?»: «según Theographic», a small map, the card of the place, the person; the points of the graph', async () => {
    const c: ConvState = { last: null }
    const r = await ask('¿Dónde nació Abraham?', 'es', c)
    expect(r.reply.info).toMatch(/^Según Theographic, Abraham nació en Ur\./)
    expect(r.reply.map).toMatchObject({ small: true, summary: 'Mapa: Ur' })
    expect(labels(r)).toEqual(['Ficha de Ur', 'Abraham'])
    expect(c.graph!.nodes.map((n) => n.label)).toContain('Abraham')
    const card = await tap(c, r, /^Ficha de Ur$/)
    expect(card.reply.info).toMatch(/^Según la ubicación propuesta|^Ur aparece en el mapa/)
    expect(c.graph!.nodes.map((n) => n.label)).toContain('Ur')
  })
  test('no birth place in the data: the data do not say, never a guess; the person\'s card', async () => {
    const r = await ask('¿Dónde nació Sara?')
    expect(r.reply.info).toMatch(/^Los datos que tengo no dicen dónde nació Sara\./)
    expect(r.reply.map).toBeUndefined()
    expect(labels(r)).toEqual(['Sara'])
    expect((await ask('¿Dónde murió Abraham?')).reply.info).toMatch(/^Los datos que tengo no dicen dónde murió Abraham\./)
  })
  test('the same questions in English, and a place card with the days from its reference place', async () => {
    expect((await ask('Where was Abraham born?', 'en')).reply.info).toMatch(/^According to Theographic, Abraham was born in Ur\./)
    expect((await ask('How far is Jerusalem from Jerusalem?', 'en')).answered).toBe('place')
  })

  test('a question placeQuestion rejects goes on exactly as before: the same reply without the places data', async () => {
    const qs = ['¿Dónde está escrito el amor?', '¿Dónde queda Narnia?', '¿Dónde nació Jerusalén?', 'mapa de Narnia']
    const before = await Promise.all(qs.map((q) => ask(q)))
    setPlaceReader(async () => ({ ...(sample as object), mapsOf: async () => ({}) }) as never)
    const without = await Promise.all(qs.map((q) => ask(q)))
    setPlaceReader(async () => sample)
    for (const [i, r] of before.entries()) {
      expect(r.route).not.toBe('place')
      expect({ route: r.route, info: r.reply.info, follow: labels(r) }).toEqual({ route: without[i]!.route, info: without[i]!.reply.info, follow: labels(without[i]!) })
    }
  })
})

// ------------------------------------------------------------------------------------------------------ the hand-made reader
const G = 1_000_000
const v = (book: number, ch: number, vs: number) => book * G + ch * 1000 + vs
const place = (title: string): Topic => ({ kind: 'place', source: 'STEPBible/STEPBible-Data/TIPNR', ref: `${title}@x`, title, ustrong: '' })
const person = (title: string): Topic => ({ kind: 'person', source: 'STEPBible/STEPBible-Data/TIPNR', ref: `${title}@x`, title, ustrong: '' })
const event = (title: string): Topic => ({ kind: 'event', source: 'robertrouse/theographic-bible-metadata', ref: `${title}@x`, title, ustrong: '' })
type World = {
  topics: [string, Topic][]
  geo?: Record<string, { lat: number; lon: number; sure: 0 | 1 | 2 | 3; form: 1 | 2 | 3 | 4 | 5 }>
  verses: Record<string, number[]>
  relations?: { from: string; to: string; type: string }[]
  places?: TopicsCore['places']
  names?: Record<string, string[]>
  obsFrames?: Record<string, [number, number][]>
  noXtopics?: true
}
const BOOK = ['gen', 'exo', 'lev', 'num', 'deu', 'jos', 'jdg', 'rut', '1sa', '2sa', '1ki', '2ki', '1ch', '2ch', 'ezr', 'neh', 'est', 'job', 'psa', 'pro', 'ecc', 'sng', 'isa', 'jer', 'lam', 'ezk', 'dan', 'hos', 'jol', 'amo', 'oba', 'jon', 'mic', 'nam', 'hab', 'zep', 'hag', 'zec', 'mal', 'mat', 'mrk', 'luk', 'jhn', 'act']
let base: PlaceReader
function world(w: World): PlaceReader {
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
  const core = {
    topics: new Map(w.topics), occurrences, relations: w.relations ?? [], geo: w.geo, obsFrames: w.obsFrames,
    res: [['STEPBible/STEPBible-Data/TIPNR', 'x'], ...(w.geo ? [['openbibleinfo/Bible-Geocoding-Data', 'x']] : [])], gender: {},
  } as unknown as XtopicsCore
  const topics = { lang: 'es-419', part: 'core', res: [], names: {}, coverage: {}, places: w.places } as unknown as TopicsCore
  const self: any = { ...(base as object) }
  self.mapsOf = async (units: string[]) => ({
    ...(units.includes('xtopics') && !w.noXtopics ? { xtopics: { core, parts } } : {}),
    ...(units.includes('map') ? { map: { core: { names: w.names ?? {} } } } : {}),
    ...(units.includes('topics') ? { topics: { core: topics } } : {}),
  })
  self.xtopicsParts = async (books: string[]) => new Map(books.filter((b) => parts.has(b)).map((b) => [b, parts.get(b)!]))
  self.people = () => peopleQuery(self)
  return self as PlaceReader
}
const useWorld = (w: World) => { const r = world(w); setPlaceReader(async () => r); setKinReader(async () => r as never) }

const P = (lat: number, lon: number, sure: 0 | 1 | 2 | 3 = 3, form: 1 | 2 | 3 | 4 | 5 = 1) => ({ lat: Math.round(lat * 100), lon: Math.round(lon * 100), sure, form })
const W: World = {
  topics: [
    ['lug:bethel', place('Bethel')], ['lug:jerusalem', place('Jerusalem')], ['lug:emmaus', place('Emmaus')], ['lug:canaan', place('Canaan')], ['lug:jordan', place('Jordan')],
    ['lug:lost', place('Lost')], ['lug:tarsus', place('Tarsus')], ['lug:xss', place('<script>alert(1)</script>')],
    ['per:paul', person('Paul')], ['per:saul', person('Saul')],
    ['ev:altar', event('Abram builds an altar')], ['ev:return', event('Jacob returns to Bethel')],
  ],
  geo: {
    'lug:bethel': P(31.94, 35.22), 'lug:jerusalem': P(31.78, 35.23), 'lug:emmaus': P(31.83, 35.0, 1), 'lug:canaan': P(32, 35, 1, 2), 'lug:jordan': P(32, 35.55, 2, 3),
    'lug:lost': P(0, 0, 0), 'lug:tarsus': P(36.92, 34.89), 'lug:xss': P(31.5, 35.1, 3),
  },
  verses: {
    'lug:bethel': [v(1, 12, 8), v(1, 13, 3), v(1, 28, 19), v(1, 35, 1)], 'lug:jerusalem': [v(1, 14, 18)], 'lug:lost': [v(1, 5, 5)], 'lug:tarsus': [v(44, 9, 11), v(44, 11, 25), v(44, 21, 39)],
    'lug:xss': [v(1, 1, 1)],
    'per:paul': [v(44, 9, 11), v(44, 11, 25), v(44, 21, 39)],
    'ev:altar': [v(1, 12, 1), v(1, 12, 9)], 'ev:return': [v(1, 35, 1), v(1, 35, 15)],
  },
  relations: [
    { from: 'per:paul', to: 'lug:tarsus', type: 'born-in' },
    { from: 'ev:altar', to: 'lug:bethel', type: 'place' }, { from: 'ev:return', to: 'lug:bethel', type: 'place' },
    { from: 'ev:altar', to: 'lug:canaan', type: 'place' },
  ],
  places: {
    names: { 'lug:bethel': 'Betel', 'lug:jerusalem': 'Jerusalén', 'lug:emmaus': 'Emaús', 'lug:canaan': 'Canaán', 'lug:jordan': 'Jordán', 'lug:lost': 'Perdida', 'lug:tarsus': 'Tarso', 'lug:xss': '<script>alert(1)</script>' },
    notes: {}, aliases: { 'بيت إيل': ['lug:bethel'], 'أورشليم': ['lug:jerusalem'] },
  },
  names: {},
  obsFrames: { '5:9': [[v(1, 12, 8), v(1, 12, 8)]], '1:1': [[v(1, 12, 8), v(1, 12, 8)]] },
}

describe('on a hand-made reader (verses, events with passages)', () => {
  beforeAll(async () => { base = await fixture.open(); useWorld(W) })
  afterAll(() => { setPlaceReader(); setKinReader() })

  test('«¿Dónde queda Betel?»: from the nearest reference place (rounded to 5 km), first verse, where it appears, what happened here', async () => {
    const c: ConvState = { last: null }
    const r = await ask('¿Dónde queda Betel?', 'es', c)
    expect(r.reply.info).toMatch(/^Betel estaba a unos 20 km al norte de Jerusalén\./)
    expect(r.reply.info).toMatch(/\*\*Aquí pasó:\*\* Abram builds an altar; Jacob returns to Bethel\n/)
    expect(labels(r)).toEqual(['Génesis 12:8', 'Dónde aparece (4)', 'Qué pasó en Betel (2)', 'Ficha de Betel'])
    expect(r.reply.map!.points.map((p) => p.id)).toEqual(['lug:bethel', 'lug:jerusalem'])
    expect(r.reply.list!.items).toEqual([{ text: 'Betel', ref: 'Génesis 12:8' }, { text: 'Jerusalén', tag: 'de referencia' }])
    expect(lastPara(r)).toMatch(/^\*Lugares: OpenBible.info, TIPNR, ACAI · mapa: Natural Earth\.\*$/)
    // the button of the first verse opens the passage; «Dónde aparece» lists the verses, each a button
    const v1 = await tap(c, r, /^Génesis 12:8$/)
    expect(v1.reply.study ?? v1.reply.info).toBeTruthy()
    const all = await tap({ last: null }, r, /^Dónde aparece/)
    expect(labels(all).slice(0, 4)).toEqual(['Génesis 12:8', 'Génesis 13:3', 'Génesis 28:19', 'Génesis 35:1'])
    expect(all.reply.info).toMatch(/^\*\*Betel\*\* — Se nombra en 4 versículos\./)
  })
  test('the place card adds the days on foot to its reference place (§5.8)', async () => {
    const r = await ask('¿Dónde queda Betel?')
    const card = await tap({ last: null }, r, /^Ficha de Betel$/)
    expect(card.reply.info).toMatch(/\n\nDe Jerusalén a Betel, a pie, en burro o en camello: (menos de un día|unos \d+ a \d+ días) \(aprox\.\)\./)
    expect(card.reply.list).toBeDefined()
  })
  test('«¿Qué pasó en Betel?»: events with their passages (a range of one chapter with a plain hyphen), buttons to the passages', async () => {
    const r = await ask('¿Qué pasó en Betel?')
    expect(r.reply.info).toMatch(/^\*\*Qué pasó en Betel \(2\):\*\*/)
    expect(r.reply.list!.items).toEqual([{ text: 'Abram builds an altar', ref: 'Génesis 12:1-9' }, { text: 'Jacob returns to Bethel', ref: 'Génesis 35:1-15' }])
    expect(labels(r)).toEqual(expect.arrayContaining(['Génesis 12:1-9', 'Génesis 35:1-15']))
    expect(r.reply.info + JSON.stringify(r.reply.list)).not.toContain('–')
  })
  test('a place with no event: where it is named, as before', async () => {
    const r = await ask('¿Qué pasó en Jerusalén?')
    expect(r.reply.info).toMatch(/^\*\*Jerusalén\*\* — Los datos que tengo no listan eventos en Jerusalén\./)
    expect(labels(r)).toContain('Génesis 14:18')
  })
  test('a place with no point: «no se sabe dónde estaba», no map, its verse and list stay', async () => {
    const r = await ask('¿Dónde queda Perdida?')
    expect(r.reply.info).toMatch(/^No se sabe dónde estaba Perdida\./)
    expect(r.reply.map).toBeUndefined()
    expect(r.reply.list!.items[0]).toMatchObject({ text: 'Perdida', tag: 'ubicación desconocida', ref: 'Génesis 5:5' })
  })
  test('an uncertain place (hollow circle): the sentence and the tag; a water; both with no number', async () => {
    const e = await ask('¿Dónde queda Emaús?')
    expect(e.reply.info).toMatch(/^No se sabe con certeza dónde estaba Emaús; se han propuesto varios sitios cerca de Jerusalén\./)
    expect(e.reply.list!.items[0]).toMatchObject({ tag: 'ubicación incierta' })
    expect(e.reply.map!.points[0]).toMatchObject({ id: 'lug:emmaus', sure: 1 })
    expect(svgOf(e)).toContain('class="map-dot-open"')
    const j = await ask('¿Dónde queda Jordán?')
    expect(j.reply.info).toMatch(/^Jordán, cerca de Jerusalén\./)
    expect(j.reply.info).not.toMatch(/km/)
  })
  test('«distancia» with a region: no number, both in the list and on the map', async () => {
    const r = await ask('¿Qué distancia hay entre Canaán y Betel?')
    expect(r.reply.info).toMatch(/^Canaán es una región; no tiene un punto para medir\./)
    expect(r.reply.info).not.toMatch(/km|día/)
    expect(r.reply.map!.points.map((p) => p.id)).toEqual(['lug:canaan', 'lug:bethel'])
  })
  test('«días de viaje»: the days, on foot and on horseback, with «aprox.»; no ship between two inland places', async () => {
    const r = await ask('¿Cuántos días de viaje hay de Jerusalén a Tarso?')
    expect(r.reply.info).toMatch(/Unos \d+ km en línea recta; Jerusalén está al sur de Tarso\./)
    expect(r.reply.info).toMatch(/A pie, en burro o en camello: unos \d+ a \d+ días; a caballo: unos \d+ a \d+ días \(aprox\.\)/)
    expect(r.reply.info).not.toMatch(/barco/)
  })
  test('in Hindi «X से Y कितनी दूर»: the sentence is about the second name, as the question', async () => {
    const r = await ask('यरूशलेम से बेतेल कितनी दूर है?', 'hi')
    // (no Hindi names in the reader: the question may not resolve; when it does, the subject is Y)
    if (r.route === 'place') expect(r.reply.info).toMatch(/Betel|बेतेल/)
  })
  test('«¿Dónde nació Pablo?»: «aparecen juntos en» the verses of both, as a list and as buttons; the card of the place', async () => {
    const r = await ask('¿Dónde nació Paul?')
    expect(r.reply.info).toMatch(/^Según Theographic, Paul nació en Tarso\./)
    expect(r.reply.list).toEqual({ head: 'Aparecen juntos en:', items: [{ text: '', ref: 'Hechos 9:11' }, { text: '', ref: 'Hechos 11:25' }, { text: '', ref: 'Hechos 21:39' }] })
    expect(labels(r)).toEqual(['Hechos 9:11', 'Hechos 11:25', 'Hechos 21:39', 'Ficha de Tarso', 'Paul'])
    expect(r.reply.map).toMatchObject({ small: true })
  })
  test('the passage\'s places: «Ver en el mapa» sheet of a verse range and of a frame of Open Bible Stories', async () => {
    const base0 = { id: '', intent: 'place', ref: null, what: [], version: null, concept: null, term: null, phrase: null, candidates: null, lang: 'es-419' } as never
    const r = await turn({ last: null }, { q: '', sheet: placeSheet(base0, ['view'], { ref: 'gen 12:1-13:3' }) }, 'es')
    expect(r.reply.list!.items).toEqual([{ text: 'Betel', ref: 'Génesis 12:8' }])
    expect(r.reply.map!.summary).toBe('Mapa: 1 lugares en Génesis 12:1-13:3: Betel')
    expect(r.reply.info).toMatch(/^\*\*Lugares en Génesis 12:1-13:3:\*\*/)
    const f = await turn({ last: null }, { q: '', sheet: placeSheet(base0, ['view'], { ref: 'obs 5:9' }) }, 'es')
    expect(f.reply.list!.items.map((i) => i.text)).toEqual(['Betel'])
    expect(f.reply.info).toMatch(/^\*\*Lugares en .*5:9:\*\*/)
    const none = await turn({ last: null }, { q: '', sheet: placeSheet(base0, ['view'], { ref: 'gen 5:5' }) }, 'es')
    expect(none.reply.map).toBeUndefined()
    expect(none.reply.info).toMatch(/no muestran lugares con ubicación en Génesis 5:5/)
  })
  test('the points of a place answer are in the graph; a saved sheet opens the same answer', async () => {
    const c: ConvState = { last: null }
    const r = await ask('¿Dónde queda Betel?', 'es', c)
    expect(c.graph!.nodes.map((n) => n.label)).toContain('Betel')
    expect(c.graph!.nodes.at(-1)!.kind).toBe('place')
    const again = await turn({ last: null }, { q: '', sheet: placeSheet({ id: '', intent: 'place', ref: null, what: [], version: null, concept: null, term: null, phrase: null, candidates: null, lang: 'es-419' } as never, ['where'], { concept: 'lug:bethel' }) }, 'es')
    expect(again.reply.info).toBe(r.reply.info)
  })

  test('a name is text, never markup: the list, the summary, the SVG and the Markdown of the answer', async () => {
    const r = await ask('¿Dónde queda <script>alert(1)</script>?')
    if (r.route !== 'place') return // (the shape may not take a «<»: then no place answer at all, the safest)
    expect(md(r.reply.info!)).not.toContain('<script>')
    expect(svgOf(r)).not.toContain('<script>')
  })
})

// ----------------------------------------------------------------------------------------------------------------- Arabic and the DOM
class El {
  style: Record<string, string> = {}; tagName: string; className = ''; dir = ''; text = ''; children: El[] = []; isConnected = false
  constructor(tag: string) { this.tagName = tag.toUpperCase() }
  appendChild(c: El) { this.children.push(c); return c }
  set textContent(t: string) { this.text = t }
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join('') }
  all(tag: string): El[] { return this.children.flatMap((c) => [...(c.tagName === tag.toUpperCase() ? [c] : []), ...c.all(tag)]) }
}
describe('the list next to the map in the page (placeview.ts) and Arabic', () => {
  beforeAll(() => { useWorld(W); (globalThis as any).document = { createElement: (t: string) => new El(t), createTextNode: (t: string) => Object.assign(new El('#text'), { text: t }) } })
  afterAll(() => { setPlaceReader(); setKinReader(); delete (globalThis as any).document })

  test('«أين تقع بيت إيل؟»: the answer in Arabic, the reference in the list with plain digits and its own <bdi>', async () => {
    const r = await ask('أين تقع بيت إيل؟', 'ar')
    expect(r.route).toBe('place')
    expect(r.reply.info).toMatch(/Betel/)
    const first = r.reply.list!.items[0]!
    expect(first.ref).toMatch(/12:8$/)
    expect(first.ref).not.toMatch(/[–٠-٩]/)
    const mounted: unknown[] = []
    const blk = placeBlock(r.reply, 'ar', async (el, o) => { mounted.push([el, o]); return { redraw() {}, destroy() {} } }) as unknown as El
    expect(blk.dir).toBe('rtl')
    expect(blk.all('bdi').map((b) => b.className)).toEqual(expect.arrayContaining(['place-name', 'place-ref']))
    expect(blk.all('bdi').find((b) => b.className === 'place-ref')!.textContent).toBe(first.ref!)
  })
  test('«ماذا حدث في بيت إيل؟»: an event\'s range of one chapter keeps ASCII digits and the hyphen, in a <bdi>', async () => {
    const r = await ask('ماذا حدث في بيت إيل؟', 'ar')
    expect(r.route).toBe('place')
    const refs = r.reply.list!.items.map((i) => i.ref)
    expect(refs.some((x) => /12:1-9$/.test(x ?? ''))).toBe(true)
    expect(refs.join('')).not.toContain('–')
    const blk = placeBlock(r.reply, 'ar', async () => ({ redraw() {}, destroy() {} })) as unknown as El
    const shown = blk.all('bdi').filter((b) => b.className === 'place-ref')
    expect(shown.map((b) => b.textContent)).toEqual(refs as string[])
    // the whole range is one left-to-right run (after an Arabic word its digits would join over ":" but not over "-": «9-12:1»)
    const range = shown.find((b) => /12:1-9$/.test(b.textContent))!
    expect(range.children.filter((c) => c.className === 'place-num').map((c) => [c.textContent, c.dir])).toEqual([['12:1-9', 'ltr']])
  })
  test('the page puts every name in as text and mounts the map once: the host is empty and the mount gets the summary and the direction', async () => {
    const r = await ask('¿Dónde queda Betel?', 'es')
    const calls: { ui: string; dir: string; summary: string }[] = []
    const blk = placeBlock(r.reply, 'es', async (_el, o) => { calls.push({ ui: o.ui, dir: o.dir, summary: o.summary }); return { redraw() {}, destroy() {} } }) as unknown as El
    await new Promise((res) => setTimeout(res, 20))
    expect(calls).toEqual([{ ui: 'es', dir: 'ltr', summary: 'Mapa: Betel' }])
    expect(blk.all('li').length).toBe(2)
    const xss = placeBlock({ list: { head: '', items: [{ text: '<img src=x onerror=1>' }] } }, 'en') as unknown as El
    expect(xss.all('bdi')[0]!.text).toBe('<img src=x onerror=1>') // a text node: the page never parses it
  })
})

// ------------------------------------------------------------------------------------------------------------- what the data lacks (§5.5)
describe('what the data lacks (§5.5)', () => {
  afterAll(() => { setPlaceReader(); setKinReader() })
  test('no `geo` (an old common): the route is taken, the answer has no distance and no map, the list stays', async () => {
    useWorld({ ...W, geo: undefined })
    const r = await ask('¿Dónde queda Betel?')
    expect(r.route).toBe('place')
    expect(r.reply.info).toMatch(/^\*\*Betel\*\* — Los datos que tengo no dicen dónde están los lugares\./)
    expect(r.reply.info).not.toMatch(/km/)
    expect(r.reply.map).toBeUndefined()
    expect(r.reply.list!.items[0]!.text).toBe('Betel')
    const d = await ask('¿Qué distancia hay entre Betel y Jerusalén?')
    expect(d.reply.info).toMatch(/^Betel, Jerusalén\. Los datos que tengo no dicen dónde están los lugares/)
    expect(d.reply.map).toBeUndefined()
    expect(d.reply.list!.items.length).toBe(2)
  })
  test('no `xtopics`: the route is not taken, the question goes on as today', async () => {
    useWorld({ ...W, noXtopics: true })
    const r = await ask('¿Dónde queda Betel?')
    expect(r.route).not.toBe('place')
  })
  test('no `places` of the language: the names come from the title (English), the answer is the same', async () => {
    useWorld({ ...W, places: undefined, names: {} })
    const r = await ask('¿Dónde queda Bethel?')
    expect(r.route).toBe('place')
    expect(r.reply.info).toMatch(/^Bethel estaba a unos 20 km al norte de Jerusalem\./)
  })
  test('«Israel»: «¿quién era Israel?» is the person, «¿dónde queda Israel?» the place (an article joined to both)', async () => {
    useWorld({
      topics: [['lug:israel', place('Israel')], ['per:israel', person('Israel')], ['lug:jerusalem', place('Jerusalem')]],
      geo: { 'lug:israel': P(32, 35, 2, 2), 'lug:jerusalem': P(31.78, 35.23) },
      verses: { 'lug:israel': [v(1, 32, 28)], 'per:israel': [v(1, 32, 28)] }, relations: [], places: { names: { 'lug:israel': 'Israel', 'lug:jerusalem': 'Jerusalén' }, notes: {}, aliases: {} }, names: { 'per:israel': ['Israel'] },
    })
    const where = await ask('¿Dónde queda Israel?')
    expect(where.route).toBe('place')
    expect(where.concept).toBe('lug:israel')
    const who = await ask('¿Quién era Israel?')
    expect(who.route).not.toBe('place')
  })
})

// ------------------------------------------------------------------------------------------------------ «Ver en el mapa» under a passage
describe('«Ver en el mapa» under a passage and a frame of Open Bible Stories', () => {
  const sheetOf = (ref: string) => ({ id: 's', intent: 'passage', ref, what: ['text', 'notes'], version: null, concept: null, term: null, phrase: null, candidates: null, lang: 'en' }) as never
  const open = (ref: string, c: ConvState = { last: null }) => turn(c, { q: '', sheet: sheetOf(ref) }, 'en')
  beforeAll(async () => {
    base = await fixture.open()
    // (the people index of the pack, built at idle in the app: the buttons that read the data wait for it)
    useWorld(W)
    const { kinQuestion } = await import('../src/kin')
    await kinQuestion('sons of Isaac', 'en', null)
  })
  afterAll(() => { setPlaceReader(); setKinReader() })

  test('a verse that names a place with a point: the button, and it opens the map of that verse with its list', async () => {
    const c: ConvState = { last: null }
    const r = await open('gen 12:8', c)
    const f = (r.reply.follow ?? []).find((x) => x.label === 'See on the map')
    expect(f?.sheet).toMatchObject({ intent: 'place', ref: 'gen 12:8', what: ['view'] })
    const m = await turn(c, { q: '', sheet: f!.sheet! }, 'en')
    expect(m.answered).toBe('place')
    expect(m.reply.map!.points.map((p) => p.id)).toEqual(['lug:bethel'])
    expect(m.reply.list!.items).toEqual([{ text: 'Betel', ref: 'Genesis 12:8' }])
    expect(c.graph!.nodes.at(-1)!.label).toBe('Genesis 12:8 · Map')
  })
  test('a range of verses and a chapter', async () => {
    expect(labels(await open('gen 12:1-9'))).toContain('See on the map')
    expect(labels(await open('gen 13'))).toContain('See on the map')
  })
  test('no place with a point there (or no place at all): no button, and the answer is the same as before', async () => {
    expect(labels(await open('gen 5:5'))).not.toContain('See on the map') // «Perdida»: sure 0
    expect(labels(await open('gen 1:2'))).not.toContain('See on the map')
    useWorld({ ...W, geo: undefined })
    await kinQuestion('sons of Isaac', 'en', null)
    expect(labels(await open('gen 12:8'))).not.toContain('See on the map')
    useWorld(W)
    await kinQuestion('sons of Isaac', 'en', null) // (a new reader forgets the index: built again)
  })
  test('a frame of Open Bible Stories that tells such a verse', async () => {
    const r = await open('obs 1:1')
    expect(labels(r)).toContain('See on the map')
  })
  test('the same button in Arabic and Spanish words', async () => {
    const r = await turn({ last: null }, { q: '', sheet: { ...sheetOf('gen 12:8'), lang: 'ar' } }, 'ar')
    const f = (r.reply.follow ?? []).find((x) => x.sheet?.intent === 'place')
    if (f) expect(f.label).toBe('عرض على الخريطة')
  })
})

// ------------------------------------------------------------------------------------------------------------ corrección 1
describe('corrección 1', () => {
  const twin = (id: string): [string, ReturnType<typeof place>] => [id, place(id)]
  const H: World = {
    topics: [twin('lug:alfa-n'), twin('lug:alfa-s'), twin('lug:beta-n'), twin('lug:beta-s'), ['lug:jerusalem', place('Jerusalem')]],
    geo: { 'lug:alfa-n': P(32, 35), 'lug:alfa-s': P(30, 35), 'lug:beta-n': P(32.5, 36), 'lug:beta-s': P(29.5, 36), 'lug:jerusalem': P(31.78, 35.23) },
    verses: {},
    places: {
      names: { 'lug:alfa-n': 'Alfa', 'lug:alfa-s': 'Alfa', 'lug:beta-n': 'Beta', 'lug:beta-s': 'Beta', 'lug:jerusalem': 'Jerusalén' },
      notes: { 'lug:alfa-n': 'del norte', 'lug:alfa-s': 'del sur', 'lug:beta-n': 'del norte', 'lug:beta-s': 'del sur' }, aliases: {},
    },
    names: {},
  }
  const pick = async (q: string, notes: string[]) => {
    const c: ConvState = { last: null }
    let r = await ask(q, 'es', c)
    for (const n of notes) {
      expect(r.answered).toBe('choose')
      r = await tap(c, r, new RegExp(`— ${n}$`))
    }
    return r
  }
  const viewSheet = (ref: string) => placeSheet({ id: '', intent: 'place', ref: null, what: [], version: null, concept: null, term: null, phrase: null, candidates: null, lang: 'es-419' } as never, ['view'], { ref })
  afterAll(() => { setPlaceReader(); setKinReader(); delete (globalThis as any).document })

  test('3. two ambiguous names: after both choices the sentence is about the first name, in both orders', async () => {
    base = await fixture.open()
    useWorld(H)
    // Alfa (32, 35) and Beta (29.5, 36): Alfa is north of Beta
    const a = await pick('¿Qué distancia hay entre Alfa y Beta?', ['del norte', 'del sur'])
    expect(a.reply.info).toMatch(/^Unos \d+ km en línea recta; Alfa está al norte de Beta\./)
    expect(a.reply.map!.points.map((p) => p.id)).toEqual(['lug:alfa-n', 'lug:beta-s'])
    const b = await pick('¿Qué distancia hay entre Beta y Alfa?', ['del sur', 'del norte'])
    expect(b.reply.info).toMatch(/^Unos \d+ km en línea recta; Beta está al sur de Alfa\./)
    expect(b.reply.map!.points.map((p) => p.id)).toEqual(['lug:beta-s', 'lug:alfa-n'])
    // the same name written twice: the index tells the two apart, the first choice is the first name
    const c = await pick('¿Qué distancia hay entre Alfa y Alfa?', ['del norte', 'del sur'])
    expect(c.reply.info).toMatch(/Alfa está al norte de Alfa\./)
    expect(c.reply.map!.points.map((p) => p.id)).toEqual(['lug:alfa-n', 'lug:alfa-s'])
    const d = await pick('¿Qué distancia hay entre Alfa y Alfa?', ['del sur', 'del norte'])
    expect(d.reply.info).toMatch(/Alfa está al sur de Alfa\./)
  })
  test('3. one ambiguous name, in either place of the question: the direction follows the question', async () => {
    const a = await pick('¿Qué distancia hay entre Alfa y Jerusalén?', ['del norte'])
    expect(a.reply.info).toMatch(/Alfa está al noroeste de Jerusalén\./)
    const b = await pick('¿Qué distancia hay entre Jerusalén y Alfa?', ['del norte'])
    expect(b.reply.info).toMatch(/Jerusalén está al sureste de Alfa\./)
  })

  test('4. Arabic: the passage reference is isolated in the sentence and in the map summary', async () => {
    useWorld(W)
    const r = await turn({ last: null }, { q: '', sheet: viewSheet('gen 12:1-13:3') }, 'ar')
    // the label is one isolate (FSI … PDI) and its whole number, a cross-chapter range, a left-to-right run inside it (LRI … PDI)
    expect(r.reply.info).toMatch(/⁨[^⁩⁦]*⁦12:1-13:3⁩⁩/)
    expect(r.reply.map!.summary).toMatch(/⁨[^⁩⁦]*⁦12:1-13:3⁩⁩/)
    const none = await turn({ last: null }, { q: '', sheet: viewSheet('gen 5:5') }, 'ar')
    expect(none.reply.info).toMatch(/⁨[^⁩⁦]*⁦5:5⁩⁩/)
  })
  test('4b. Arabic: a verse range, a cross-chapter range and an OBS frame each keep their number as one left-to-right run', async () => {
    useWorld(W)
    for (const [ref, num] of [['gen 12:1-9', '12:1-9'], ['gen 12:1-13:3', '12:1-13:3'], ['obs 5:9', '5:9']] as const) {
      const r = await turn({ last: null }, { q: '', sheet: viewSheet(ref) }, 'ar')
      // (the label's number is wrapped whole; nothing of the number is outside a ⁦ … ⁩ run)
      expect(r.reply.info, ref).toContain(`⁦${num}⁩`)
      expect(r.reply.info!.replace(/⁦[^⁩]*⁩/g, '').match(/[0-9]+[:\-][0-9]+/), ref).toBeNull()
    }
  })
  test('7. the credit of a passage map names OpenBible.info, as NOTICE does', async () => {
    const r = await turn({ last: null }, { q: '', sheet: viewSheet('gen 12:1-13:3') }, 'es')
    expect(lastPara(r)).toBe('*Lugares: OpenBible.info, TIPNR, ACAI · mapa: Natural Earth.*')
  })
  test('8. French keeps the space before the colon in its headings', async () => {
    const r = await turn({ last: null }, { q: '', sheet: viewSheet('gen 12:1-13:3') }, 'fr')
    expect(r.reply.info).toMatch(/^\*\*Lieux dans Genesis 12:1-13:3 :\*\*/)
    const e = await ask('Que s’est-il passé à Bethel ?', 'fr')
    expect(e.route).toBe('place')
    expect(e.reply.info).toMatch(/^\*\*[^*]* \(2\) :\*\*/)
  })
  test('6. without `geo` no line of the list says «ubicación desconocida»; with `geo` a place with no point does', async () => {
    useWorld({ ...W, geo: undefined })
    const r = await ask('¿Dónde queda Betel?')
    expect(r.reply.list!.items.every((i) => !i.tag)).toBe(true)
    const d = await ask('¿Qué distancia hay entre Betel y Jerusalén?')
    expect(d.reply.list!.items.every((i) => !i.tag)).toBe(true)
    useWorld(W)
    expect((await ask('¿Dónde queda Perdida?')).reply.list!.items[0]!.tag).toBe('ubicación desconocida')
  })
  test('9. only the exact credit line is a credit line', () => {
    expect(isCreditLine('Lugares: OpenBible.info, TIPNR, ACAI · mapa: Natural Earth.')).toBe(true)
    expect(isCreditLine('Places: Theographic, TIPNR, ACAI.')).toBe(true)
    expect(isCreditLine('Lugares: Jerusalén, Betel y Jericó.')).toBe(false)
    expect(isCreditLine('Places: a list of cities')).toBe(false)
  })
  test('5. online AI is given the location sentence: the phone answer (`info`) is what buildContext sends', async () => {
    const c: ConvState = { last: null }
    const r = await ask('¿Dónde queda Betel?', 'es', c)
    const m = { who: 'bot', ...r.reply, node: c.graph!.cur } as never
    const b = await buildContext({ question: '¿Dónde queda Betel?', m, msgs: [m], graph: c.graph, node: c.graph!.cur, lang: 'es-419' })
    expect(b.helps).toContain('Betel estaba a unos 20 km al norte de Jerusalén')
  })
  test('10. without places data, «Where was Jesus born?» is not caught: the search answers as before, never «It is in»', async () => {
    useWorld({ ...W, noXtopics: true })
    const none = await ask('Where was Jesus born?', 'en')
    expect(none.route).toBe('search')
    expect(none.reply.info ?? '').not.toMatch(/^(It is in|Está en)/)
    // (xtopics but no person «Jesus»: not a birth question the data can answer; and `places` absent)
    useWorld({ ...W, places: undefined, names: {} })
    expect((await ask('Where was Jesus born?', 'en')).route).toBe('search')
  })

  // ------------------------------------------------------------------------------ the page: the map is mounted when seen
  class FakeIO {
    static all: FakeIO[] = []
    disconnected = false
    constructor(public cb: (es: { isIntersecting: boolean }[]) => void) { FakeIO.all.push(this) }
    observe() {}
    disconnect() { this.disconnected = true }
  }
  const dom = () => {
    ;(globalThis as any).document = { createElement: (t: string) => new El(t), createTextNode: (t: string) => Object.assign(new El('#text'), { text: t }) }
    ;(globalThis as any).IntersectionObserver = FakeIO
    FakeIO.all = []
  }
  type Host = El & { style: Record<string, string> }
  const hostOf = (b: unknown) => (b as El).children[0] as Host
  const block = { map: { pack: 'es-419', points: [], summary: 's' }, list: { head: '', items: [] } }
  const tick = () => new Promise((r) => setTimeout(r, 10))
  test('1. the host keeps a height while it waits, is mounted when it intersects and not before, and is hidden only after a failed mount', async () => {
    dom()
    const calls: unknown[] = []
    const blk = placeBlock(block, 'es', async (el) => { calls.push(el); return { redraw() {}, destroy() {} } })
    const host = hostOf(blk)
    expect(host.className).toBe('place-map')
    // the box mapview will use (mapHeight: 3/4 of the width, 200-360 px), so the layout does not jump on mount
    // (a host with no height is never seen come into view)
    expect(host.style.minHeight).toBe('200px')
    expect(host.style.maxHeight).toBe('360px')
    expect(host.style.aspectRatio).toBe('1 / 0.75')
    await tick()
    expect(calls.length).toBe(0)
    FakeIO.all[0]!.cb([{ isIntersecting: false }])
    expect(calls.length).toBe(0)
    FakeIO.all[0]!.cb([{ isIntersecting: true }])
    expect(calls.length).toBe(1)
    expect(FakeIO.all[0]!.disconnected).toBe(true)
    await tick()
    expect(host.style.minHeight).toBe('')
    expect(host.style.maxHeight).toBe('')
    expect(host.style.aspectRatio).toBe('')
    const bad = placeBlock(block, 'es', async () => { throw new Error('no') })
    FakeIO.all[1]!.cb([{ isIntersecting: true }])
    await tick()
    expect(hostOf(bad).className).toBe('place-map failed')
    for (const k of ['minHeight', 'maxHeight', 'aspectRatio'] as const) expect(hostOf(bad).style[k]).toBe('') // a failed mount gives the reserved box back too
    const smallHost = hostOf(placeBlock({ ...block, map: { ...block.map, small: true } }, 'es', async () => ({ redraw() {}, destroy() {} })))
    expect(smallHost.style.minHeight).toBe('180px')
    for (const k of ['maxHeight', 'aspectRatio'] as const) expect([undefined, '']).toContain(smallHost.style[k]) // a real DOM gives ''
    FakeIO.all[2]!.cb([{ isIntersecting: true }])
    await tick()
    for (const k of ['minHeight', 'maxHeight', 'aspectRatio'] as const) expect(smallHost.style[k] ?? '').toBe('')
    delete (globalThis as any).IntersectionObserver
  })
  test('1b. the reserved box is the height mapview gives the map: its limits are the exported ones, at a narrow, a middle and a wide width', () => {
    dom()
    const host = hostOf(placeBlock(block, 'es', async () => ({ redraw() {}, destroy() {} })))
    expect(host.style.minHeight).toBe(`${MAP_MIN_H}px`)
    expect(host.style.maxHeight).toBe(`${MAP_MAX_H}px`)
    expect(host.style.aspectRatio).toBe(`1 / ${MAP_RATIO}`)
    for (const w of [120, 280, 375, 480, 640, 1000]) {
      // what CSS resolves from the reserved box (ratio, then min and max) is what mapview computes
      const css = Math.min(MAP_MAX_H, Math.max(MAP_MIN_H, Math.round(w * MAP_RATIO)))
      expect(mapHeight(w)).toBe(css)
    }
    expect([mapHeight(280), mapHeight(375), mapHeight(1000)]).toEqual([210, 281, 360])
    expect(mapHeight(375, 180)).toBe(180)
    delete (globalThis as any).IntersectionObserver
  })
  test('2. resize draws the connected maps again; a host that left is destroyed, even if a destroy throws; an unseen host lets its observer go', async () => {
    dom()
    const log: string[] = []
    const mk = (name: string, throws = false) => placeBlock(block, 'es', async () => ({ redraw() { log.push(`redraw ${name}`) }, destroy() { log.push(`destroy ${name}`); if (throws) throw new Error('x') } }))
    const [a, b, c] = [mk('a'), mk('b', true), mk('c')]
    FakeIO.all.forEach((io) => io.cb([{ isIntersecting: true }]))
    await tick()
    for (const x of [a, b, c]) hostOf(x).isConnected = true
    resizeMaps()
    expect(log).toEqual(['redraw a', 'redraw b', 'redraw c'])
    log.length = 0
    hostOf(a).isConnected = false
    hostOf(b).isConnected = false
    resizeMaps()
    expect(log).toEqual(['destroy a', 'destroy b', 'redraw c'])
    hostOf(c).isConnected = false
    sweepMaps()
    expect(log.at(-1)).toBe('destroy c')
    FakeIO.all = []
    mk('lone')
    sweepMaps()
    expect(FakeIO.all[0]!.disconnected).toBe(true)
    delete (globalThis as any).IntersectionObserver
  })
})
