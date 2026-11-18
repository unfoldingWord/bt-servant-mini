// A hand-made reader of family data for the tests (encargo-ms-kin.md, decision 8): Isaac's family as the common xtopics and an
// es-419 language would have it with ACAI (gender, names in Spanish), copied from tc-study's family.test.ts and grown:
//   - per:israel named in many verses, per:jacob (Matthew 1:16) in one: «Jacob» is the patriarch by the ten-times rule;
//   - two Judases named alike as often, in Matthew 10 and Luke 6: «Judas» asks which, unless the passage read is one of those;
//   - Open Bible Stories: frame 5:9 tells Genesis 25:26, and story 5 tells an event Isaac takes part in.
// The client's own queries answer from it (familyQuery, peopleQuery), so the rules are the client's. setKinReader(kinFixture).
import type { PackReader } from '@bt-synergy/language-pack-client'
import type { Topic, TopicsCore, XtopicsCore, XtopicsPart } from '@bt-synergy/language-pack-v3'
import { familyQuery, peopleQuery } from '@lpc/query/family'
import type { KinReader } from '../../../src/kin'

const v = (book: number, ch: number, vs: number) => book * 1_000_000 + ch * 1000 + vs
const gen = (ch: number, vs: number) => v(1, ch, vs)
const TIPNR = 'STEPBible/STEPBible-Data/TIPNR'
const ACAI = 'BibleAquifer/ACAI'
const person = (title: string): Topic => ({ kind: 'person', source: TIPNR, ref: `${title}@x`, title, ustrong: '' })
export const VERSES: Record<string, number[]> = {
  'per:abraham': [gen(21, 3), gen(25, 9)],
  'per:sarah': [gen(21, 3)],
  'per:hagar': [gen(16, 15)],
  'per:keturah': [gen(25, 1)],
  'per:isaac': [gen(21, 3), gen(25, 9), gen(25, 20), gen(25, 26), gen(25, 28), gen(27, 1)],
  'per:ishmael': [gen(16, 15), gen(25, 9)],
  'per:zimran': [gen(25, 2)],
  'per:rebekah': [gen(24, 15), gen(25, 20), gen(25, 28)],
  'per:esau': [gen(25, 25), gen(25, 26), gen(25, 28), gen(27, 1)],
  'per:israel': [gen(25, 26), gen(25, 28), ...Array.from({ length: 10 }, (_, i) => gen(28, i + 1))],
  'per:jacob': [v(40, 1, 16)],
  'per:judas-iscariot': [v(40, 10, 4), v(40, 26, 14)],
  'per:judas-son-of-james': [v(42, 6, 16), v(44, 1, 13)],
  'per:shuah': [],
}
const TITLES: Record<string, string> = { 'per:judas-iscariot': 'Judas', 'per:judas-son-of-james': 'Judas', 'per:shuah': 'Shuah' }
const bookOf = (x: number) => (['gen', 'mat', 'luk', 'act'] as const)[[1, 40, 42, 44].indexOf(Math.floor(x / 1_000_000))]!
const pair = (from: string, to: string, type: string) => ({ from, to, type, source: TIPNR, confidence: 100 })
export const CORE: XtopicsCore = {
  part: 'core',
  res: [[ACAI, '5375d0d3'], [TIPNR, 'be4191f0']],
  coverage: new Map(),
  topics: new Map(Object.keys(VERSES).sort().map((id) => [id, person(TITLES[id] ?? id.slice(4, 5).toUpperCase() + id.slice(5))])),
  occurrences: new Map(Object.entries(VERSES).map(([id, list]) => {
    const m = new Map<string, [number, number]>()
    for (const x of list) { const b = bookOf(x); const c = m.get(b)?.[0] ?? 0; m.set(b, [c + 1, c + 1]) }
    return [id, m]
  })),
  relations: [
    ...[
      ['per:abraham', 'per:isaac'], ['per:sarah', 'per:isaac'], ['per:abraham', 'per:ishmael'], ['per:hagar', 'per:ishmael'],
      ['per:abraham', 'per:zimran'], ['per:keturah', 'per:zimran'], ['per:isaac', 'per:esau'], ['per:isaac', 'per:israel'],
      ['per:rebekah', 'per:esau'], ['per:rebekah', 'per:israel'],
    ].map(([a, b]) => pair(a!, b!, 'parent-of')),
    pair('per:isaac', 'per:ishmael', 'sibling-of'),
    pair('per:isaac', 'per:zimran', 'sibling-of'),
    pair('per:esau', 'per:israel', 'sibling-of'),
    pair('per:isaac', 'per:rebekah', 'partner-of'),
    { from: 'tw:names/isaac', to: 'per:isaac', type: 'same-as', source: TIPNR, confidence: 70 },
    { from: 'tw:names/jacob', to: 'per:israel', type: 'same-as', source: TIPNR, confidence: 70 },
    { from: 'tw:names/judasiscariot', to: 'per:judas-iscariot', type: 'same-as', source: TIPNR, confidence: 70 },
    { from: 'ev:birth-of-esau-and-jacob', to: 'per:isaac', type: 'participant', source: 'robertrouse/theographic-bible-metadata', confidence: 80 },
    { from: 'obs:5', to: 'ev:birth-of-esau-and-jacob', type: 'occurs-in', source: 'unfoldingWord/en/obs', confidence: 60 },
  ],
  gender: {
    'per:abraham': 1, 'per:sarah': 2, 'per:hagar': 2, 'per:keturah': 2, 'per:isaac': 1, 'per:ishmael': 1, 'per:rebekah': 2, 'per:esau': 1,
    'per:israel': 1, 'per:jacob': 1, 'per:judas-iscariot': 1, 'per:judas-son-of-james': 1,
  },
  obsFrames: { '5:9': [[gen(25, 26), gen(25, 26)]] },
}
const PARTS = new Map<string, XtopicsPart>(['gen', 'mat', 'luk', 'act'].map((b) => [b, {
  part: b, occurrences: new Map(Object.entries(VERSES).map(([id, l]) => [id, l.filter((x) => bookOf(x) === b)] as [string, number[]]).filter(([, l]) => l.length)),
} as XtopicsPart]))
const TOPICS: TopicsCore = {
  lang: 'es-419', part: 'core', res: [], coverage: new Map(),
  names: { 'per:isaac': [['Isaac', 'alignment', 3, ['gen']]], 'per:esau': [['él', 'alignment', 9, ['gen']]] },
  people: {
    names: { 'per:esau': 'Esaú', 'per:sarah': 'Sara', 'per:rebekah': 'Rebeca', 'per:hagar': 'Agar', 'per:keturah': 'Cetura', 'per:ishmael': 'Ismael', 'per:zimran': 'Zimrán' },
    notes: { 'per:jacob': 'padre de José', 'per:judas-iscariot': 'Iscariote', 'per:judas-son-of-james': 'hijo de Jacobo' },
    aliases: { Saray: ['per:sarah'] },
  },
} as TopicsCore
const MAP_NAMES = { 'tw:names/isaac': ['Isaac'], 'tw:names/jacob': ['Jacob'], 'tw:names/judasiscariot': ['Judas Iscariote'] }

/** The reader: `parts: false` leaves the parts out (as a pack whose parts cannot be read). */
export function kinFixture(o: { parts?: boolean } = {}): KinReader {
  const withParts = o.parts !== false
  const r = {
    lang: 'es-419',
    revisions: () => ({ lang: 3, common: 5 }),
    unitRevision: () => 5,
    listed: () => true,
    installed: () => true,
    size: () => 1234,
    mapsOf: async (units: readonly string[], how?: { coreOnly?: boolean }) => {
      const m: Record<string, unknown> = { revision: 3 }
      if (units.includes('xtopics')) m.xtopics = { core: CORE, parts: how?.coreOnly || !withParts ? new Map() : PARTS }
      if (units.includes('topics')) m.topics = { core: TOPICS, parts: new Map() }
      if (units.includes('map')) m.map = { core: { names: MAP_NAMES }, parts: new Map() }
      return m
    },
    xtopicsParts: async (books: readonly string[]) => new Map(withParts ? books.filter((b) => PARTS.has(b)).map((b) => [b, PARTS.get(b)!]) : []),
  } as unknown as PackReader
  r.family = (id: string) => familyQuery(r, id)
  r.people = () => peopleQuery(r)
  return r
}
