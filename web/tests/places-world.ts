// A hand-made place reader for the tests of Browse's places tab (not a test file): the places, their points, the verses that name them and
// their events as a small `xtopics` core over the signed geo sample (maps-fixture.ts), as places.test.ts makes it.
//   const r = world(base, { topics: [['lug:a', place('Alpha')]], geo: { 'lug:a': JER }, verses: { 'lug:a': [v(1, 1, 1)] } })
import type { Topic, TopicsCore, XtopicsCore, XtopicsPart } from '@bt-synergy/language-pack-v3'
import { peopleQuery } from '@lpc/query/family'
import type { PlaceReader } from '../src/places'

export const G = 1_000_000
/** A verse number: book (1 = Genesis), chapter, verse. */
export const v = (book: number, ch: number, vs: number) => book * G + ch * 1000 + vs
export const place = (title: string): Topic => ({ kind: 'place', source: 'STEPBible/STEPBible-Data/TIPNR', ref: `${title}@x`, title, ustrong: '' })
export const person = (title: string): Topic => ({ kind: 'person', source: 'STEPBible/STEPBible-Data/TIPNR', ref: `${title}@x`, title, ustrong: '' })
export const event = (title: string): Topic => ({ kind: 'event', source: 'robertrouse/theographic-bible-metadata', ref: `${title}@x`, title, ustrong: '' })
export const JER = { lat: 3178, lon: 3523, sure: 3 as const, form: 1 as const }
export type World = {
  topics: [string, Topic][]
  geo?: Record<string, { lat: number; lon: number; sure: 0 | 1 | 2 | 3; form: 1 | 2 | 3 | 4 | 5 }>
  /** verses per topic (the core's counts come from them) */
  verses: Record<string, number[]>
  relations?: { from: string; to: string; type: string }[]
  places?: TopicsCore['places']
  noXtopics?: true
}
const BOOK = ['gen', 'exo', 'lev', 'num', 'deu', 'jos', 'jdg', 'rut', '1sa', '2sa', '1ki', '2ki', '1ch', '2ch', 'ezr', 'neh', 'est', 'job', 'psa', 'pro', 'ecc', 'sng', 'isa', 'jer', 'lam', 'ezk', 'dan', 'hos', 'jol', 'amo', 'oba', 'jon', 'mic', 'nam', 'hab', 'zep', 'hag', 'zec', 'mal', 'mat', 'mrk', 'luk', 'jhn', 'act']

export function world(base: PlaceReader, w: World): PlaceReader {
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
    topics: new Map(w.topics), occurrences, relations: w.relations ?? [], geo: w.geo,
    res: [['STEPBible/STEPBible-Data/TIPNR', 'x'], ['robertrouse/theographic-bible-metadata', 'x']], gender: {},
  } as unknown as XtopicsCore
  const topics = { lang: 'en', part: 'core', res: [], names: {}, coverage: {}, places: w.places } as unknown as TopicsCore
  const self: any = { ...(base as object) }
  self.mapsOf = async (units: string[]) => ({
    ...(units.includes('xtopics') && !w.noXtopics ? { xtopics: { core, parts } } : {}),
    ...(units.includes('map') ? { map: { core: { names: {} } } } : {}),
    ...(units.includes('topics') ? { topics: { core: topics } } : {}),
  })
  self.xtopicsParts = async (books: string[]) => new Map(books.filter((b) => parts.has(b)).map((b) => [b, parts.get(b)!]))
  self.people = () => peopleQuery(self)
  return self as PlaceReader
}
