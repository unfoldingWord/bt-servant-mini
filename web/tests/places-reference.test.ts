// Reference places on a passage map («Ver en el mapa»): up to three well-known places (REFERENCE_PLACES) inside the frame of the places the
// verses name, drawn as scenery (`ref: true`), listed after them with the «for reference» tag, never counted, never widening the view.
import { writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { LIGHT_THEME } from '@bt-synergy/language-pack-client'
import { fullPhone, turn } from './harness'
import { mapsFixture } from './maps-fixture'
import { setKinReader } from '../src/kin'
import { setPlaceReader, type PlaceReader } from '../src/places'
import { PLACE_T } from '../src/placetext'
import { placeSheet } from '../src/pipeline'
import { homeFrame, MAP_DARK, MAP_LIGHT, mapSvg } from '../src/mapview'
import { place, v, world, type World } from './places-world'

const P = (lat: number, lon: number, sure: 0 | 1 | 2 | 3 = 3) => ({ lat: Math.round(lat * 100), lon: Math.round(lon * 100), sure, form: 1 as const })
const names = { 'lug:joppa': 'Joppa', 'lug:nineveh': 'Nineveh', 'lug:jerusalem': 'Jerusalem', 'lug:samaria': 'Samaria', 'lug:nazareth': 'Nazareth', 'lug:tyre': 'Tyre', 'lug:damascus': 'Damascus', 'lug:gaza': 'Gaza', 'lug:athens': 'Athens', 'lug:babylon': 'Babylon' }
const JONAH: World = {
  topics: Object.entries(names).map(([id, n]) => [id, place(n)] as [string, ReturnType<typeof place>]),
  geo: {
    'lug:joppa': P(32.05, 34.75), 'lug:nineveh': P(36.36, 43.15), 'lug:jerusalem': P(31.78, 35.22), 'lug:samaria': P(32.28, 35.2), 'lug:nazareth': P(32.7, 35.3),
    'lug:tyre': P(33.27, 35.2), 'lug:damascus': P(33.51, 36.29), 'lug:gaza': P(31.5, 34.47), 'lug:athens': P(37.97, 23.72), 'lug:babylon': P(32.54, 44.42),
  },
  // Jonah 1:3 names Joppa; 1:2 Nineveh. (Athens is far outside, Gaza just below the frame.) Jerusalem and the others are named nowhere.
  verses: { 'lug:joppa': [v(32, 1, 3)], 'lug:nineveh': [v(32, 1, 2)], 'lug:jerusalem': [v(40, 1, 1)] },
  places: { names: {}, notes: {}, aliases: {} },
}
const ONLY_ATHENS: World = { ...JONAH, verses: { 'lug:athens': [v(32, 2, 1)] } }
const NO_POINT: World = { ...JONAH, geo: { ...JONAH.geo, 'lug:joppa': P(0, 0, 0), 'lug:nineveh': P(0, 0, 0) } }

let base: PlaceReader
const fixture = mapsFixture()
const view = (ui: string, ref = 'jon 1:1-17') => {
  const b0 = { id: '', intent: 'place', ref: null, what: [], version: null, concept: null, term: null, phrase: null, candidates: null, lang: 'es-419' } as never
  return turn({ last: null }, { q: '', sheet: placeSheet(b0, ['view'], { ref }) }, ui)
}
const use = (w: World) => { const r = world(base, w); setPlaceReader(async () => r); setKinReader(async () => r as never) }
beforeAll(async () => { await fullPhone(); base = await fixture.open() })
afterAll(() => { setPlaceReader(); setKinReader() })

describe('reference places on a passage map', () => {
  test('Jonah 1: Joppa and Nineveh stay the protagonists; at most three references, Jerusalem among them, none a protagonist, none outside the frame', async () => {
    use(JONAH)
    const r = await view('en')
    const pts = r.reply.map!.points
    const prot = pts.filter((p) => !p.ref), refs = pts.filter((p) => p.ref)
    expect(prot.map((p) => p.id)).toEqual(['lug:nineveh', 'lug:joppa'])
    expect(pts.slice(0, prot.length).every((p) => !p.ref)).toBe(true) // (the references come after)
    expect(refs.length).toBeLessThanOrEqual(3)
    expect(refs.map((p) => p.id)).toContain('lug:jerusalem')
    expect(refs.map((p) => p.id)).toEqual(['lug:samaria', 'lug:jerusalem', 'lug:nazareth']) // nearest to a protagonist first
    expect(new Set(pts.map((p) => p.id)).size).toBe(pts.length)
    expect(pts.map((p) => p.id)).not.toContain('lug:athens') // far outside
    expect(pts.map((p) => p.id)).not.toContain('lug:gaza') // just below the frame
    expect(pts.map((p) => p.id)).not.toContain('lug:babylon') // the frame is no wider than the box of Joppa and Nineveh
    for (const p of refs) expect(p).not.toHaveProperty('verses')
    expect(r.reply.map!.summary).toMatch(/^Map: 2 places in Jonah 1:1-17: Nineveh, Joppa$/) // (the references are not counted nor named)
    expect(r.reply.follow!.map((f) => f.label)).toEqual(['Nineveh', 'Joppa'])
  })
  test('the list: protagonists with their verse, then the references with the tag and no verse, in each of the six languages', async () => {
    use(JONAH)
    for (const ui of ['en', 'es', 'fr', 'id', 'hi', 'ar'] as const) {
      const items = (await view(ui)).reply.list!.items
      expect(items.length).toBe(5)
      expect(items.slice(0, 2).every((i) => i.ref && !i.tag)).toBe(true)
      for (const i of items.slice(2)) { expect(i.tag).toBe(PLACE_T[ui].tagRef); expect(i.ref).toBeUndefined() }
    }
  })
  test('the frame is the one without the references (they never widen it)', async () => {
    use(JONAH)
    const pts = (await view('en')).reply.map!.points
    const plain = pts.filter((p) => !p.ref)
    expect(homeFrame(pts, 360, 270)).toEqual(homeFrame(plain, 360, 270))
    expect(homeFrame([...plain, { ...plain[0]!, lat: 10, lon: 10, label: 'far', ref: true }], 360, 270)).toEqual(homeFrame(plain, 360, 270))
  })
  test('no protagonist with a point: no references, no map', async () => {
    use(NO_POINT)
    const r = await view('en')
    expect(r.reply.map).toBeUndefined()
    use(ONLY_ATHENS)
    const a = await view('en', 'jon 2:1')
    expect(a.reply.map!.points.map((p) => [p.id, !!p.ref])).toEqual([['lug:athens', false]]) // nothing else of the list lies inside a one-point frame
  })
  test('a reference that is a protagonist is never repeated as a reference', async () => {
    use({ ...JONAH, verses: { ...JONAH.verses, 'lug:jerusalem': [v(32, 1, 4)] } })
    const pts = (await view('en')).reply.map!.points
    expect(pts.filter((p) => p.id === 'lug:jerusalem').map((p) => !!p.ref)).toEqual([false])
  })
  test('the dark and the light themes both carry the grey of a reference and a dark halo', () => {
    expect(MAP_LIGHT.reference).toBeTruthy(); expect(MAP_LIGHT.referenceLabel).toBeTruthy()
    expect(MAP_DARK.reference).toBeTruthy(); expect(MAP_DARK.referenceLabel).toBeTruthy()
    expect(MAP_DARK.halo).toBe('#1b1b19')
  })
  test('the SVG draws a reference as a small hollow dot and keeps the label of Nineveh at the edge', async () => {
    use(JONAH)
    const m = (await view('en')).reply.map!
    for (const theme of [LIGHT_THEME, MAP_DARK]) {
      const svg = mapSvg({ ...m, ui: 'en', dir: 'ltr', theme, width: 360, height: 270, frame: homeFrame(m.points, 360, 270) })
      for (const n of ['Joppa', 'Nineveh', 'Jerusalem']) expect(svg).toContain(`>${n}<`)
    }
    // the first view the page makes (homeFrame) keeps both protagonist labels at the widths of a phone and a tablet
    for (const [w, h] of [[320, 240], [360, 270], [412, 309], [480, 360], [600, 360]] as const) {
      const svg = mapSvg({ ...m, ui: 'en', dir: 'ltr', theme: LIGHT_THEME, width: w, height: h, frame: homeFrame(m.points, w, h) })
      for (const n of ['Joppa', 'Nineveh']) expect(svg).toContain(`>${n}<`)
    }
  })
  test('demo page (only when DEMO_OUT is set)', async () => {
    if (!process.env.DEMO_OUT) return
    use(JONAH)
    const m = (await view('en')).reply.map!
    const draw = (theme: typeof LIGHT_THEME) => mapSvg({ ...m, ui: 'en', dir: 'ltr', theme, width: 360, height: 270, frame: homeFrame(m.points, 360, 270) })
    writeFileSync(process.env.DEMO_OUT, `<!doctype html><meta charset="utf-8"><title>Jonah 1 map</title><body style="font:14px sans-serif;display:flex;gap:16px;flex-wrap:wrap;background:#888;padding:16px"><div style="background:#fff;padding:8px"><p>Light</p>${draw(LIGHT_THEME)}</div><div style="background:#111;color:#eee;padding:8px"><p>Dark</p>${draw(MAP_DARK)}</div><p style="color:#fff">The SVG as mapSvg draws it with the first view homeFrame (basemap not loaded in this static copy: sea only).</p></body>`)
  })
})
