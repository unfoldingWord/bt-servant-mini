// «Ver en el mapa» from a name (not only under a passage): the article of a place in Translation Words, or a question that translates it,
// ends with the map of the place and, when it has events, «¿Qué pasó aquí?». On the signed sample (es-419) and on a hand-made reader.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { mapsFixture } from './maps-fixture'
import { setKinReader } from '../src/kin'
import { PLT } from '../src/placetext'
import { setPlaceReader, type PlaceReader } from '../src/places'
import type { ConvState, Reply } from '../src/pipeline'

const ask = async (q: string, ui = 'es', c: ConvState = { last: null }) => turn(c, { q, slots: null }, ui)
const labels = (r: { reply: Reply }) => (r.reply.follow ?? []).map((f) => f.label)
const tap = (c: ConvState, r: Awaited<ReturnType<typeof ask>>, label: RegExp, ui = 'es') => {
  const f = (r.reply.follow ?? []).find((x) => label.test(x.label))
  if (!f?.sheet) throw new Error(`no button ${label} in ${labels(r).join(' | ')}`)
  return turn(c, { q: '', sheet: f.sheet }, ui)
}

const fixture = mapsFixture()
let sample: PlaceReader
beforeAll(async () => {
  await fullPhone()
  sample = await fixture.open()
})
afterAll(() => { setPlaceReader(); setKinReader() })
const use = (r: PlaceReader) => { setPlaceReader(async () => r); setKinReader(async () => r as never) }

describe('the signed sample', () => {
  beforeAll(() => use(sample))

  test('«Jerusalén»: the article, then «Ver en el mapa» that opens the map of the place', async () => {
    const c: ConvState = { last: null }
    const r = await ask('Jerusalén', 'es', c)
    expect(r.reply.ctx).toBe('tw:names/jerusalem')
    expect(labels(r)).toContain('Ver en el mapa')
    const m = await tap(c, r, /^Ver en el mapa$/)
    expect(m.concept).toBe('lug:jerusalem')
    expect(m.reply.map!.points.map((p) => p.id)).toEqual(['lug:jerusalem'])
  })
  test('the article opened by its button gives the same', async () => {
    const c: ConvState = { last: null }
    const w = await ask('¿Dónde queda Jerusalén?', 'es', c)
    const a = await tap(c, w, /^Artículo: Jerusalén$/)
    expect(a.reply.ctx).toBe('tw:names/jerusalem')
    expect(labels(a)).toContain('Ver en el mapa')
  })
  test('«¿Cómo traduzco el nombre de Jerusalén?»: the button too', async () => {
    // (Jerusalén's article fills the nine buttons with related names: the map goes before them)
    const r = await ask('¿Cómo traduzco el nombre de Jerusalén?')
    expect(r.answered).toBe('translate-unknown')
    expect(r.concept).toBe('tw:names/jerusalem')
    expect(labels(r)).toContain('Ver en el mapa')
  })
  test('Egipto (a region with coordinates): the map and what happened there', async () => {
    const c: ConvState = { last: null }
    const r = await ask('Egipto', 'es', c)
    expect(labels(r)).toEqual(expect.arrayContaining(['Ver en el mapa', '¿Qué pasó aquí?']))
    const h = await tap(c, r, /^¿Qué pasó aquí\?$/)
    expect(h.reply.info).toMatch(/^\*\*Qué pasó en Egipto \(3\):\*\*/)
  })
  test('the new text is in the six languages', () => {
    for (const l of ['en', 'es', 'fr', 'id', 'hi', 'ar'] as const) expect(PLT(l).happenedQ.length).toBeGreaterThan(3)
    expect(PLT('en').seeMap).toBe('See on the map')
  })
})

describe('without `geo` or for a person', () => {
  test('no `geo`: no button, the buttons as they were without the map', async () => {
    use(sample)
    const withGeo = await ask('Jerusalén')
    const noGeo = { ...(sample as object), mapsOf: async (u: string[], o: never) => {
      const m = await (sample as PlaceReader).mapsOf(u as never, o) as { xtopics?: { core: { geo?: unknown } } }
      if (m.xtopics) m.xtopics = { ...m.xtopics, core: { ...m.xtopics.core, geo: undefined } } as never
      return m
    } } as never as PlaceReader
    use(noGeo)
    const r = await ask('Jerusalén')
    expect(r.reply.ctx).toBe('tw:names/jerusalem')
    expect(labels(r)).not.toContain('Ver en el mapa')
    expect(labels(r)).toEqual(labels(withGeo).filter((l) => l !== 'Ver en el mapa' && l !== '¿Qué pasó aquí?'))
    use(sample)
  })
  test('the article of a person: no map button', async () => {
    use(sample)
    const r = await ask('Abraham')
    expect(labels(r)).not.toContain('Ver en el mapa')
  })
})

describe('a name joined to two places with a point (hand-made: the sample joins Belén to one of its two)', () => {
  // the article «Belén» also joined to the second Belén (sure 1): the button asks which
  const two = () => {
    const r: any = { ...(sample as object) }
    let made: Promise<any> | null = null
    r.mapsOf = async (u: string[], o: never) => {
      const m: any = await (sample as PlaceReader).mapsOf(u as never, o)
      if (!m.xtopics) return m
      made ??= Promise.resolve({ ...m.xtopics, core: { ...m.xtopics.core, relations: [...m.xtopics.core.relations, { from: 'tw:names/bethlehem', to: 'lug:bethlehem-jos-19-15', type: 'same-as', source: 'x', confidence: 75 }] } })
      return { ...m, xtopics: await made }
    }
    return r as PlaceReader
  }
  test('«Belén»: one button, and it asks which place before the map', async () => {
    use(two())
    const c: ConvState = { last: null }
    const r = await ask('Belén', 'es', c)
    expect(r.reply.ctx).toBe('tw:names/bethlehem')
    expect(labels(r).filter((l) => l === 'Ver en el mapa').length).toBe(1)
    const f = (r.reply.follow ?? []).find((x) => x.label === 'Ver en el mapa')!.sheet!
    expect(f.concept).toBeNull()
    expect(f.candidates!.length).toBe(2)
    const ch = await tap(c, r, /^Ver en el mapa$/)
    expect(ch.answered).toBe('choose')
    expect(labels(ch)).toHaveLength(2)
    const m = await turn(c, { q: '', sheet: ch.reply.follow![0]!.sheet! }, 'es')
    expect(m.reply.map!.points.length).toBeGreaterThan(0)
  })
  test('with one place of the two with a point: the button goes straight to it', async () => {
    use(sample)
    const r = await ask('Belén')
    const f = (r.reply.follow ?? []).find((x) => x.label === 'Ver en el mapa')!.sheet!
    expect(f.concept).toBe('lug:bethlehem-gen-35-16')
  })
})
