// The parts of a language (modules.ts): the table against the es-419, hi and ar packs on disk, a fake reader for "listed but not
// installed", a language that comes with the app (units only: never missing), and an offer with and without Open Bible Stories.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ALL_PACKS, PACKS_DIR, installPacks } from './fs-packs'
import { openLang } from '../src/packs'
import { PARTS, fiveLine, partsOfReader, partsOfUnits, type PartId } from '../src/modules'

const unitsOnDisk = (lang: string) =>
  Object.keys(JSON.parse(readFileSync(join(PACKS_DIR, lang, 'state.json'), 'utf8')).units as object)
    .filter((k) => k.startsWith(`${lang}/`) || k.startsWith('common/')).map((k) => k.slice(k.indexOf('/') + 1))
const fake = (listed: string[], installed: string[], sizes: Record<string, number> = {}) => ({
  listed: (u: string) => listed.includes(u), installed: (u: string) => installed.includes(u), size: (u: string) => sizes[u] ?? 0,
})
const by = (l: ReturnType<typeof partsOfReader>) => Object.fromEntries(l.map((x) => [x.id, x])) as Record<PartId, (typeof l)[number]>

describe('the table', () => {
  test('order and what each part owns', () => {
    expect(PARTS.map((p) => p.id)).toEqual(['bible', 'tw', 'ta', 'orig', 'obs'])
    expect(PARTS.filter((p) => !p.addable).map((p) => p.id)).toEqual(['orig'])
    const own = (u: string) => PARTS.filter((p) => p.units(u)).map((p) => p.id)
    expect(own('book:rut')).toEqual(['bible'])
    expect(own('art:tw:kt')).toEqual(['tw'])
    expect(own('art:ta:checking')).toEqual(['ta'])
    expect(own('orig:rut')).toEqual(['orig'])
    expect(own('obs')).toEqual(['obs'])
    for (const u of ['xmap', 'map', 'xtopics', 'topics', 'art:other:x']) expect(own(u)).toEqual([])
  })
})

for (const lang of ['es-419', 'hi', 'ar']) {
  describe(`${lang} from the packs on disk`, () => {
    test.skipIf(!ALL_PACKS.includes(lang))('downloaded language read through the reader: have with counts, no obs, no plus', async () => {
      await installPacks([lang])
      const units = unitsOnDisk(lang)
      const l = by(partsOfReader(await openLang(lang)))
      expect(l.bible.state).toBe('have')
      expect(l.bible.n).toBe(units.filter((u) => u.startsWith('book:')).length)
      expect(l.tw.state).toBe('have')
      expect(l.ta.state).toBe('have')
      expect(l.ta.n).toBe(units.filter((u) => u.startsWith('art:ta:')).length)
      expect(l.orig.state).toBe('have')
      expect(l.obs.state).toBe('absent')
      expect(Object.values(l).every((x) => x.state !== 'missing')).toBe(true)
    })
    test.skipIf(!ALL_PACKS.includes(lang))('the same language as a list of units (it comes with the app): only have', () => {
      const units = unitsOnDisk(lang)
      const l = partsOfUnits(units)
      expect(l.map((x) => x.id)).toEqual(['bible', 'tw', 'ta', 'orig']) // no obs in these packs; map and topics belong to no part
      expect(l.every((x) => x.state === 'have' && !x.missing.length && x.bytes === 0)).toBe(true)
      expect(l[0]!.n).toBe(units.filter((u) => u.startsWith('book:')).length)
    })
  })
}

describe('a downloaded language with a fake reader', () => {
  test('listed but not installed is plus, with the missing units and their size', () => {
    const l = by(partsOfReader(fake(
      ['book:rut', 'book:tit', 'art:tw:kt', 'art:ta:intro', 'art:ta:process', 'art:ta:translate', 'art:ta:checking', 'orig:rut', 'obs'],
      ['book:rut', 'book:tit', 'art:tw:kt', 'art:ta:intro', 'art:ta:translate', 'orig:rut'],
      { 'art:ta:process': 600, 'art:ta:checking': 500, obs: 2_900_000 },
    )))
    expect(l.bible).toMatchObject({ state: 'have', n: 2 })
    expect(l.tw).toMatchObject({ state: 'have', n: 1 })
    expect(l.ta).toMatchObject({ state: 'missing', n: 2, missing: ['art:ta:process', 'art:ta:checking'], bytes: 1100 })
    expect(l.orig).toMatchObject({ state: 'have', n: 1 })
    expect(l.obs).toMatchObject({ state: 'missing', n: 0, missing: ['obs'], bytes: 2_900_000 })
  })
  test('a part the catalog lists nothing of is absent', () => {
    const l = by(partsOfReader(fake(['book:rut'], ['book:rut'])))
    expect(l.bible.state).toBe('have')
    for (const id of ['tw', 'ta', 'orig', 'obs'] as const) expect(l[id]).toMatchObject({ state: 'absent', missing: [], bytes: 0 })
  })
  test('an installed unit the catalog no longer lists still counts, and is not missing', () => {
    const l = by(partsOfReader(fake([], ['book:rut', 'obs'])))
    expect(l.bible).toMatchObject({ state: 'have', n: 1 })
    expect(l.obs).toMatchObject({ state: 'have', n: 1 })
  })
  test('original text is never plus, even when listed and not installed', () => {
    expect(by(partsOfReader(fake(['orig:rut'], [])))['orig']).toMatchObject({ state: 'absent', missing: [] })
    expect(by(partsOfReader(fake(['orig:rut', 'orig:tit'], ['orig:rut'])))['orig']).toMatchObject({ state: 'have', n: 1, missing: [] })
  })
  test('units of no part (map, topics, common maps) are never asked for', () => {
    const l = partsOfReader({ listed: (u) => !/^(book|art|orig):|^obs$/.test(u), installed: () => false, size: () => 9 })
    expect(l.every((x) => x.state === 'absent')).toBe(true)
  })
  test('a size the reader does not know counts as zero', () => {
    const r = { listed: (u: string) => u === 'obs', installed: () => false, size: () => NaN }
    expect(by(partsOfReader(r)).obs.bytes).toBe(0)
  })
})

describe('an offer', () => {
  test('with Open Bible Stories', () => {
    const l = partsOfUnits(['book:rut', 'book:tit', 'art:tw:kt', 'art:ta:intro', 'art:ta:translate', 'orig:rut', 'obs', 'map', 'xmap'])
    expect(l.map((x) => [x.id, x.n])).toEqual([['bible', 2], ['tw', 1], ['ta', 2], ['orig', 1], ['obs', 1]])
  })
  test('unknown books and manuals are in no part', () => {
    const l = partsOfUnits(['book:rut', 'book:xyz', 'orig:xyz', 'art:ta:foo'])
    expect(l.map((x) => [x.id, x.n])).toEqual([['bible', 1]])
  })
  test('without them', () => {
    expect(partsOfUnits(['book:rut', 'art:tw:kt']).map((x) => x.id)).toEqual(['bible', 'tw'])
  })
  test('only stories (a language that has just them)', () => {
    expect(partsOfUnits(['obs', 'tf-x']).map((x) => x.id)).toEqual(['obs'])
    expect(partsOfUnits([])).toEqual([])
  })
})

describe('the 5M line', () => {
  test('shows only when the switch is on and some story is covered', () => {
    expect(fiveLine(true, 3)).toEqual({ n: 3 })
    expect(fiveLine(true, 0)).toBeNull()
    expect(fiveLine(false, 3)).toBeNull()
  })
})
