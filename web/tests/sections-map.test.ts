// The section map of the packs (bt-synergy #87): `reader.sections(book)` gives the `\ts\*` chunks of the English ULT from the
// common catalog's `xtopics` core, and every place Mini shows sections reads it first (sectionsOf). The test packs on disk
// (../lp3-ta-packs) predate the map (their common catalog is revision 2, without the `chunks` table), so the map here is the
// one Mini's packs server had on Nov 16 for Ruth, Esther and Titus (fixtures/packs-2026-11-16/sections.json), served through
// the English reader; without it, Mini falls back to the headings, the outline and 5-verse blocks as before.
// Also here: the client of bt-synergy 569b88a6 adds `obs` to its default units (#86), and Mini's download must not change.
import { afterAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyState, planInstall, verifyCatalogFile, type PackReader, type PackSource } from '@bt-synergy/language-pack-client'
import { ALL_PACKS, installPacks } from './fs-packs'
import { nextSteps, stepTarget, turn } from './harness'
import { CANON, installWant, offerOf, openLang } from '../src/packs'
import { SHARED_UNITS, trustedKeys } from '../src/shared'
import { type ConvState, mapChapter, resetBooks, sectionsOf } from '../src/pipeline'
import { newGraph } from '../src/graph'

const FX = resolve(import.meta.dir, 'fixtures/packs-2026-11-16')
const trust = { trustedKeys: trustedKeys() }
const MAP: Record<string, [number, number][]> = JSON.parse(readFileSync(`${FX}/sections.json`, 'utf8')).books
const SOURCE = 'unfoldingWord/en/ult'

afterAll(async () => { await installPacks(ALL_PACKS) })

/** The answer `reader.sections` gives: the map's sections for a book it has, `none` for one it lacks, nothing without xtopics. */
function sectionsAnswer(book: string, map: Record<string, [number, number][]> | null): any {
  const base = { query: 'sections', cites: [], notInstalled: [] as any[], revision: {} }
  if (!map) return { ...base, data: null, coverage: {}, notInstalled: [{ unit: 'xtopics', bytes: 0 }] }
  const list = map[book]
  const ref = (id: number) => `${Math.floor(id / 1000) % 1000}:${id % 1000}`
  if (!list) return { ...base, data: { book, sections: [], source: SOURCE }, coverage: { [SOURCE]: 'none' } }
  return { ...base, data: { book, sections: list.map(([first, last]) => ({ from: ref(first), to: ref(last), first, last })), source: SOURCE }, coverage: { [SOURCE]: 'count' } }
}
/** These packs installed, the English reader answering `sections` from `map` (null: as a pack without xtopics). */
async function phone(langs: string[], map: Record<string, [number, number][]> | null = MAP) {
  await installPacks(langs)
  const r = (await openLang('en')) as PackReader
  r.sections = async (book: string) => sectionsAnswer(book, map)
  resetBooks()
}

describe('the client bump keeps the download as it was', () => {
  const catalogs = async () => [
    await verifyCatalogFile(readFileSync(`${FX}/en.catalog`), trust, { from: 'network' }),
    await verifyCatalogFile(readFileSync(`${FX}/common.catalog`), trust, { from: 'network' }),
  ]
  const before = JSON.parse(readFileSync(`${FX}/plan-before.json`, 'utf8'))
  const books = async () => {
    const listed = new Set((await catalogs())[0]!.catalog.units.map((u) => u.id))
    return CANON.filter((b) => listed.has(`book:${b}`))
  }

  test('the English catalog lists obs, and the client now plans it by default', async () => {
    const plan = planInstall(await catalogs(), emptyState(), { books: await books(), defaults: true, units: SHARED_UNITS }, new Set())
    expect(plan.steps.map((s) => s.key)).toContain('en/obs')
  })

  test('Mini plans the same units, segments and bytes as with the client of c68e3622, without obs', async () => {
    const plan = planInstall(await catalogs(), emptyState(), installWant(await books()), new Set())
    const segs = plan.steps.flatMap((s) => s.segments.map((x) => x.id))
    expect(plan.steps.map((s) => s.key)).toEqual(before.steps)
    expect(plan.steps.map((s) => s.key)).not.toContain('en/obs')
    expect(segs.length).toBe(before.segments)
    expect(createHash('sha256').update(segs.join('\n')).digest('hex')).toBe(before.sha256)
    expect(plan.bytes).toBe(before.bytes)
  })

  test('the offer (the size shown, the segments fetched) is that plan', async () => {
    const source: PackSource = {
      catalog: async (name) => ({ bytes: readFileSync(`${FX}/${name}.catalog`) }) as any,
      segment: async () => { throw new Error('no segments here') },
    }
    const offer = (await offerOf('en', source))!
    expect(offer.bytes).toBe(before.bytes)
    expect(createHash('sha256').update(offer.segments.join('\n')).digest('hex')).toBe(before.sha256)
  })
})

describe('sections from the packs\' section map', () => {
  test('Ruth 1 is 1:1–2, 1:3–5, 1:6–7, … and the map is used by every language', async () => {
    await phone(['en', 'es-419'])
    expect((await sectionsOf('rut', 1, 'en')).slice(0, 3)).toEqual([[1, 2], [3, 5], [6, 7]])
    expect(await sectionsOf('rut', 1, 'en')).toEqual([[1, 2], [3, 5], [6, 7], [8, 10], [11, 13], [14, 15], [16, 18], [19, 21], [22, 22]])
    expect((await sectionsOf('rut', 1, 'es-419')).slice(0, 3)).toEqual([[1, 2], [3, 5], [6, 7]])
    expect((await sectionsOf('est', 2, 'en')).find(([a, b]) => a <= 14 && 14 <= b)).toEqual([12, 14])
  })

  const buttons = (r: any) => nextSteps(r).map((f) => `${f.label} => ${stepTarget(f)}`)

  test('under Ruth 1\'s introduction, the first section is the map\'s', async () => {
    await phone(['en'])
    const r = await turn({ last: null }, { q: 'Introduction to Ruth 1' }, 'en')
    expect(buttons(r)).toContain('First section: Ruth 1:1–2 => rut 1:1-2 text,notes')
  })

  test('the next section after Ruth 1:3–5 is 1:6–7, and after a chapter\'s last one the next chapter\'s first', async () => {
    await phone(['en'])
    const r = await turn({ last: null }, { q: 'Ruth 1:3-5' }, 'en')
    expect(buttons(r)[0]).toBe('Next section: Ruth 1:6–7 => rut 1:6-7 text,notes')
    const r2 = await turn({ last: null }, { q: 'Ruth 1:19-21' }, 'en')
    expect(buttons(r2)[0]).toBe('Next section: Ruth 1:22 => rut 1:22 text,notes')
    const r3 = await turn({ last: null }, { q: 'Ruth 2:21-22' }, 'en')
    expect(buttons(r3)[0]).toBe('Next section: Ruth 2:23 => rut 2:23 text,notes')
  })

  test('a search that finds Esther 2:14 offers the map\'s section that holds it (2:12–14)', async () => {
    await phone(['en', 'es-419'])
    const r = await turn({ last: null }, { q: 'Ester concubinas' }, 'es')
    expect(stepTarget(nextSteps(r as any)[0]!)).toBe('est 2:14 text,notes')
    expect(buttons(r)[1]).toBe('Su sección: Ester 2:12–14 => est 2:12-14 text,notes')
  })

  test('the light path through Ruth: its sections step is the map\'s first section', async () => {
    await phone(['en'])
    const r = await turn({ last: null, graph: newGraph() }, { q: 'I am translating Ruth' }, 'en')
    const next = r.reply.follow?.find((f: any) => f.pathNext)
    expect(next?.label).toBe('Next: Ruth 1:1–2 · sections')
    expect(stepTarget(next as any)).toBe('rut 1:1-2 text')
  })
})

describe('without the map, the sections are guessed as before', () => {
  const GUESSED = [[1, 5], [6, 18], [19, 22]]
  test('an older common catalog (no chunks table): coverage none', async () => {
    await phone(['en'], {})
    expect(await sectionsOf('rut', 1, 'en')).toEqual(GUESSED)
  })
  test('no xtopics on the phone', async () => {
    await phone(['en'], null)
    expect(await sectionsOf('rut', 1, 'en')).toEqual(GUESSED)
  })
  test('a book the map has no entry for', async () => {
    await phone(['en'], {})
    const guessed = await sectionsOf('jon', 1, 'en')
    await phone(['en'], { tit: MAP.tit! })
    expect(await sectionsOf('jon', 1, 'en')).toEqual(guessed)
    expect((await sectionsOf('tit', 1, 'en'))[0]).toEqual([1, 3])
  })
})

test('a chapter\'s part of the map: sections that cross a chapter are cut at it, and the chapter is covered whole', () => {
  // Ruth (book 8) with 1:20–2:3 crossing: chapter 1 ends with 20–22, chapter 2 starts with 1–3
  const map: [number, number][] = [[8001001, 8001019], [8001020, 8002003], [8002004, 8002010], [8002011, 8002023]]
  expect(mapChapter(map, 1, 22)).toEqual([[1, 19], [20, 22]])
  expect(mapChapter(map, 2, 23)).toEqual([[1, 3], [4, 10], [11, 23]])
  // a chapter one verse longer than the map has it (another versification): its last section takes it
  expect(mapChapter(map, 2, 24)).toEqual([[1, 3], [4, 10], [11, 24]])
})
