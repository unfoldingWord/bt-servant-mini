// buildTree and treeText (tree.ts; diseno-arboles.md §4.2, §4.3, §6, piece B). The hand-made family of fixtures/kin, grown with a
// grandfather, a few generations, unnamed ancestors, a loop and two fathers; and, when the real packs of the APK are on this
// machine, the numbers of §3. No DOM.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import type { Topic, XtopicsCore } from '@bt-synergy/language-pack-v3'
import { familyQuery, peopleQuery } from '@lpc/query/family'
import { installPacks, usePacksDir } from './fs-packs'
import { fullPhone } from './harness'
import { CORE, kinFixture } from './fixtures/kin/family'
import { KIN_T, kinKnown, kinQuestion, resetKin, setKinReader, twOfPerson, type KinReader } from '../src/kin'
import { buildTree, treeText, type TreeView } from '../src/tree'

const TIPNR = 'STEPBible/STEPBible-Data/TIPNR'
const pair = (from: string, to: string, type = 'parent-of') => ({ from, to, type, source: TIPNR, confidence: 100 })
const topic = (title: string): Topic => ({ kind: 'person', source: TIPNR, ref: `${title}@x`, title, ustrong: '' })

/** The fixture family and more people: Terah above Abraham; Esau's line down (Eliphaz, Teman, Omar, Zepho, Gatam); unnamed fathers
 *  above «per:u0»; a loop; and a man with two fathers. [id, title, gender, verses] */
const MORE: [string, string, 1 | 2, number][] = [
  ['per:terah', 'Terah', 1, 2], ['per:eliphaz', 'Eliphaz', 1, 1], ['per:teman', 'Teman', 1, 1], ['per:omar', 'Omar', 1, 1],
  ['per:zepho', 'Zepho', 1, 1], ['per:gatam', 'Gatam', 1, 1],
  ['per:u0', 'Ahab', 1, 1], ['per:unnamed1', 'Unnamed#1', 1, 1], ['per:unnamed2', 'Unnamed#2', 1, 1], ['per:unnamed3', 'Unnamed#3', 1, 1],
  ['per:unnamed4', 'Unnamed#4', 1, 1], ['per:top', 'Top', 1, 1],
  ['per:cyc1', 'Cyc1', 1, 1], ['per:cyc2', 'Cyc2', 1, 1],
  ['per:son', 'Son', 1, 1], ['per:cy1', 'Cy1', 1, 1], ['per:cyA', 'CyA', 1, 3], ['per:cyB', 'CyB', 1, 1],
  ['per:v0', 'Vic', 1, 1], ['per:unnamed5', 'Unnamed#5', 1, 1], ['per:unnamed6', 'Unnamed#6', 1, 1], ['per:top2', 'Top2', 1, 1],
  ['per:dad', 'Dad', 1, 3], ['per:kidA', 'KidA', 1, 1], ['per:kidB', 'KidB', 1, 1], ['per:gk', 'Gk', 1, 1], ['per:mum', 'Mum', 2, 1],
  ['per:ng1', 'Ng1', 1, 1], ['per:ng2', 'Ng2', 1, 1], ['per:fa', 'Fa', 1, 3], ['per:fb', 'Fb', 1, 1], ['per:a_wife_of_Lot', 'a_wife_of_Lot', 2, 1],
]
function grown(): KinReader {
  const core: XtopicsCore = {
    ...CORE,
    topics: new Map([...CORE.topics, ...MORE.map(([id, n]) => [id, topic(n)] as [string, Topic])]),
    occurrences: new Map([...CORE.occurrences, ...MORE.map(([id, , , n]) => [id, new Map([['gen', [n, n] as [number, number]]])] as [string, Map<string, [number, number]>])]),
    relations: [
      ...CORE.relations,
      pair('per:terah', 'per:abraham'),
      pair('per:esau', 'per:eliphaz'), pair('per:eliphaz', 'per:teman'), pair('per:teman', 'per:omar'), pair('per:omar', 'per:zepho'), pair('per:zepho', 'per:gatam'),
      pair('per:unnamed1', 'per:u0'), pair('per:unnamed2', 'per:unnamed1'), pair('per:unnamed3', 'per:unnamed2'), pair('per:unnamed4', 'per:unnamed3'), pair('per:top', 'per:unnamed4'),
      pair('per:cyc1', 'per:cyc2'), pair('per:cyc2', 'per:cyc1'),
      pair('per:fa', 'per:son'), pair('per:fb', 'per:son'), pair('per:fa', 'per:ghost'),
      // the best candidate of a row is already in the line: the next one is taken
      pair('per:cyA', 'per:cy1'), pair('per:cy1', 'per:cyA'), pair('per:cyB', 'per:cyA'),
      // two unnamed in a row are not joined
      pair('per:unnamed5', 'per:v0'), pair('per:unnamed6', 'per:unnamed5'), pair('per:top2', 'per:unnamed6'),
      // a child with both parents in the tree
      pair('per:dad', 'per:kidA'), pair('per:dad', 'per:kidB'), pair('per:kidA', 'per:gk'), pair('per:kidB', 'per:gk'), pair('per:mum', 'per:gk'),
      // a focus with no gender: two groups of children
      pair('per:ng', 'per:ng1'), pair('per:ngw', 'per:ng1'), pair('per:ng', 'per:ng2'),
      pair('per:isaac', 'per:a_wife_of_Lot'),
      pair('per:isaac', 'lug:tekoa'),
    ],
    gender: { ...CORE.gender, ...Object.fromEntries(MORE.map(([id, , g]) => [id, g])) },
  }
  const base = kinFixture()
  const r = {
    ...base,
    mapsOf: async (units: readonly string[], how?: { coreOnly?: boolean }) => {
      const m = (await base.mapsOf(units, how)) as { xtopics?: { core: XtopicsCore } }
      if (m.xtopics) m.xtopics = { ...m.xtopics, core }
      return m
    },
  } as unknown as Record<string, unknown>
  r.family = (id: string) => familyQuery(r as never, id)
  r.people = () => peopleQuery(r as never)
  return r as unknown as KinReader
}

const names = (v: TreeView, idx: number[]) => idx.map((i) => v.nodes[i]!.name)

describe('the fixture family', () => {
  beforeAll(async () => {
    await fullPhone()
    setKinReader(async () => grown())
  })
  afterAll(() => setKinReader())

  test('Isaac: parents with their own parents, wife, half brothers, children, grandchildren', async () => {
    const v = await buildTree('es-419', 'per:isaac', 'tree', 'es')
    expect(v.focus).toMatchObject({ id: 'per:isaac', name: 'Isaac', g: 1 })
    expect(v.parents.map((p) => p.name).sort()).toEqual(['Abraham', 'Sara'])
    expect(v.parents.find((p) => p.id === 'per:abraham')!.up.map((u) => u.name)).toEqual(['Terah'])
    expect(v.partners.map((p) => [p.name, p.g])).toEqual([['Rebeca', 2]])
    expect(v.siblings.filter((s) => s.half).map((s) => s.name).sort()).toEqual(['Ismael', 'Zimrán'])
    // Esau and Jacob (the fixture names per:israel Jacob already; the real data says Jacob (Israel))
    // (two groups: with Rebeca, and the one child with no other parent in the data, last)
    expect(v.groups.map((g) => g.with?.name)).toEqual(['Rebeca', undefined])
    expect(names(v, v.groups[0]!.kids).sort()).toEqual(['Esaú', 'Jacob'])
    expect(names(v, v.groups[1]!.kids)).toEqual(['(sin nombre)'])
    const esau = v.nodes.find((n) => n.id === 'per:esau')!
    expect(esau.kids!.map((i) => v.nodes[i]!.name)).toEqual(['Eliphaz'])
    expect(v.open).toBe(2)
  })
  test('only per: ids: the places a parent-of reaches are left out', async () => {
    const v = await buildTree('es-419', 'per:isaac', 'tree', 'es')
    expect([...v.nodes.map((n) => n.id), ...v.parents.map((p) => p.id), ...v.siblings.map((s) => s.id)].every((x) => x.startsWith('per:'))).toBe(true)
    expect(v.nodes.some((n) => n.id === 'lug:tekoa')).toBe(false)
  })
  test('four generations below at most: the fifth is cut and its parent keeps its count', async () => {
    const v = await buildTree('es-419', 'per:esau', 'tree', 'es')
    expect(v.nodes.map((n) => n.name)).toEqual(['Eliphaz', 'Teman', 'Omar', 'Zepho'])
    expect(v.cut).toBe(true)
    expect(v.nodes.at(-1)).toMatchObject({ name: 'Zepho', n: 1 })
    expect(v.nodes.at(-1)!.kids).toBeUndefined()
  })
  test('«open»: given as it is, or chosen from the rows', async () => {
    expect((await buildTree('es-419', 'per:esau', 'tree', 'es', 1)).open).toBe(1)
    expect((await buildTree('es-419', 'per:esau', 'tree', 'es', 2)).open).toBe(2)
    expect((await buildTree('es-419', 'per:esau', 'tree', 'es', 3)).open).toBe(3)
    expect((await buildTree('es-419', 'per:esau', 'tree', 'es')).open).toBe(2)
  })
  test('«up»: one row per generation, the mother small; unnamed ones are joined', async () => {
    const v = await buildTree('es-419', 'per:isaac', 'up', 'es')
    expect(v.line!.map((r) => r.p.name)).toEqual(['Abraham', 'Terah'])
    expect(v.line![0]!.mother?.name).toBe('Sara')
    const u = await buildTree('es-419', 'per:u0', 'up', 'es')
    expect(u.line!.map((r) => [r.p.name, r.gap])).toEqual([['(sin nombre)', 4], ['Top', undefined]])
    expect(u.line![0]!.p.unnamed).toBe(true)
  })
  test('«up»: a loop ends; two fathers: the one named more, the other shown', async () => {
    const c = await buildTree('es-419', 'per:cyc1', 'up', 'es')
    expect(c.line!.map((r) => r.p.id)).toEqual(['per:cyc2'])
    const s = await buildTree('es-419', 'per:son', 'up', 'es')
    expect(s.line![0]!.p.id).toBe('per:fa')
    expect(s.line![0]!.others!.map((p) => p.id)).toEqual(['per:fb'])
  })
  test('«up»: two unnamed in a row stay two rows; three are joined', async () => {
    const two = await buildTree('es-419', 'per:v0', 'up', 'es')
    expect(two.line!.map((r) => [r.p.name, r.gap])).toEqual([['(sin nombre)', undefined], ['(sin nombre)', undefined], ['Top2', undefined]])
    const three = await buildTree('es-419', 'per:u0', 'up', 'es')
    expect(three.line!.some((r) => r.gap === 4)).toBe(true)
  })
  test('«up»: when the best candidate is already in the line, the next one is taken', async () => {
    const v = await buildTree('es-419', 'per:cy1', 'up', 'es')
    expect(v.line!.map((r) => r.p.id)).toEqual(['per:cyA', 'per:cyB'])
  })
  test('a person missing from the people index shows as unnamed, not as its id', async () => {
    const v = await buildTree('es-419', 'per:fa', 'tree', 'es')
    const ghost = v.nodes.find((n) => n.id === 'per:ghost')!
    expect(ghost).toMatchObject({ name: KIN_T.es.unnamed, unnamed: true })
    expect(JSON.stringify(v)).not.toContain('"name":"per:')
  })
  test('«n» of a leaf counts only the children not placed in the tree (two parents in it, a cycle)', async () => {
    const v = await buildTree('es-419', 'per:dad', 'tree', 'es')
    const byId = (id: string) => v.nodes.find((n) => n.id === id)!
    expect(byId('per:kidA').kids).toBeDefined()
    expect(byId('per:kidB').kids).toBeUndefined()
    expect(byId('per:kidB').n).toBe(0)
    expect(byId('per:gk').n).toBe(0)
    const c = await buildTree('es-419', 'per:cyc1', 'tree', 'es')
    expect(c.nodes.map((n) => [n.id, n.n])).toEqual([['per:cyc2', 0]])
    // at the cap the children are not placed: they count
    expect((await buildTree('es-419', 'per:esau', 'tree', 'es')).nodes.at(-1)!.n).toBe(1)
  })
  test('«down» is set only when asked with open 3, and titles the text', async () => {
    expect((await buildTree('es-419', 'per:isaac', 'tree', 'es')).down).toBeUndefined()
    const d = await buildTree('es-419', 'per:isaac', 'tree', 'es', 3)
    expect(d.down).toBe(true)
    expect(treeText(d).split('\n')[0]).toBe('Descendientes de Isaac')
  })
  test('children with no other parent: neutral title when the focus has no gender, by gender otherwise', async () => {
    const v = await buildTree('es-419', 'per:ng', 'tree', 'es')
    expect(v.focus.g).toBeUndefined()
    expect(treeText(v)).toContain(`${KIN_T.es.noParent} (1)`)
    expect(treeText(await buildTree('es-419', 'per:isaac', 'tree', 'es'))).toContain(`${KIN_T.es.noMother} (1)`)
  })
  test('a name with an underscore is unnamed', async () => {
    const v = await buildTree('es-419', 'per:isaac', 'tree', 'es')
    expect(v.nodes.find((x) => x.id === 'per:a_wife_of_Lot')).toMatchObject({ unnamed: true, name: KIN_T.es.unnamed })
  })
  test('not a person: an empty view', async () => {
    const v = await buildTree('es-419', 'tw:names/isaac', 'tree', 'es')
    expect(v.nodes).toEqual([])
    expect(v.groups).toEqual([])
  })
  test('twOfPerson: per: to its first article by sort, one map per core', () => {
    const m = twOfPerson(CORE)
    expect(m.get('per:isaac')).toBe('tw:names/isaac')
    expect(m.get('per:israel')).toBe('tw:names/jacob')
    expect(twOfPerson(CORE)).toBe(m)
  })
  test('the text: parents, spouse, siblings, children (grandchildren when open)', async () => {
    const v = await buildTree('es-419', 'per:isaac', 'tree', 'es')
    const t = treeText(v).split('\n')
    expect(t[0]).toBe('Árbol de Isaac')
    expect(t).toContain('Esposa: Rebeca')
    expect(t.some((l) => l.startsWith('Padres: '))).toBe(true)
    expect(t.some((l) => l.startsWith('Hermanos: ') && l.includes('Ismael (medio hermano)'))).toBe(true)
    expect(t).toContain('Hijos:')
    expect(t).toContain('– Esaú')
    expect(t).toContain('– – Eliphaz')
    expect(treeText(await buildTree('es-419', 'per:isaac', 'tree', 'es', 1)).split('\n')).not.toContain('– – Eliphaz')
    expect(treeText(await buildTree('es-419', 'per:isaac', 'up', 'es'))).toBe('Antepasados de Isaac: Abraham y Sara ← Terah. Los datos se cortan aquí.')
    expect(treeText(await buildTree('es-419', 'per:son', 'up', 'es'))).toContain('Fa (los datos también dicen: Fb)')
    expect(treeText(await buildTree('es-419', 'per:u0', 'up', 'es'))).toContain('4 generaciones sin nombre en los datos ← Top')
    const ar = treeText(await buildTree('es-419', 'per:isaac', 'up', 'ar'))
    expect(ar.startsWith('أسلاف')).toBe(true)
    expect(ar).toContain(' → ')
    expect(ar).toContain(' وSara')
    expect(ar.endsWith(KIN_T.ar.upEnd)).toBe(true)
    expect(treeText(await buildTree('es-419', 'per:isaac', 'tree', 'fr')).split('\n')[0]).toBe('Arbre d’Isaac')
  })
  test('the new phrases ask like relations: the code answers them and no article takes them', async () => {
    expect(await kinQuestion('árbol de Isaac', 'es', null)).toMatchObject({ kind: 'tree', ids: ['per:isaac'], pack: 'es-419' })
    expect(await kinQuestion('ancestors of Isaac', 'en', null)).toMatchObject({ kind: 'up', ids: ['per:isaac'] })
    expect(await kinQuestion('descendientes de Isaac', 'es', null)).toMatchObject({ kind: 'down' })
    expect(await kinQuestion('árbol de la vida', 'es', null)).toBeNull()
    expect(kinKnown('árbol de Isaac', 'es')).toBe(true)
    expect(kinKnown('árbol de la vida', 'es')).toBe(false)
  })
})

describe('the strings of the views', () => {
  test('every language has every string', () => {
    const keys = Object.keys(KIN_T.es).sort()
    for (const l of Object.keys(KIN_T) as (keyof typeof KIN_T)[]) {
      expect(Object.keys(KIN_T[l]).sort()).toEqual(keys)
      for (const k of ['tree', 'up', 'down'] as const) expect(KIN_T[l][k]).toContain('{x}')
      expect(KIN_T[l].gap).toContain('{n}')
    }
  })
})

const REAL = 'C:/Users/LENOVO/Git/Github/wt/msmm/apk-packs-r7'
describe.skipIf(!existsSync(`${REAL}/es-419/state.json`))('the real packs (APK rev 7)', () => {
  beforeAll(async () => {
    usePacksDir(REAL)
    await installPacks(['es-419'])
    setKinReader()
    resetKin()
  }, 120_000)
  afterAll(async () => {
    usePacksDir()
    await installPacks([])
    resetKin()
  })
  const all = (v: TreeView) => [v.focus, ...v.parents, ...v.parents.flatMap((p) => p.up), ...v.partners, ...v.siblings, ...v.nodes,
    ...(v.line ?? []).flatMap((r) => [r.p, ...(r.mother ? [r.mother] : []), ...(r.others ?? [])]), ...v.groups.flatMap((g) => (g.with ? [g.with] : []))]

  test('Isaac: Abraham and Sara, grandfather Taré, wife Rebeca, Esaú and Jacob (Israel)', async () => {
    const v = await buildTree('es-419', 'per:isaac', 'tree', 'es')
    expect(v.parents.map((p) => p.name).sort()).toEqual(['Abraham', 'Sara'])
    expect(v.parents.find((p) => p.id === 'per:abraham')!.up.map((u) => u.name)).toContain('Taré')
    expect(v.partners.map((p) => p.name)).toEqual(['Rebeca'])
    expect(names(v, v.groups[0]!.kids).sort()).toEqual(['Esaú', 'Jacob (Israel)'])
  })
  test('Jacob (per:israel): four groups, Lea 7, Raquel 2, Bilhá 2, Zilpa 2', async () => {
    const v = await buildTree('es-419', 'per:israel', 'tree', 'es')
    expect(Object.fromEntries(v.groups.map((g) => [g.with?.name, g.kids.length]))).toEqual({ Lea: 7, Raquel: 2, Bilhá: 2, Zilpa: 2 })
    expect(treeText(v)).toContain('Con Lea (7)')
  })
  test('David up reaches Adán (per:adam)', async () => {
    const v = await buildTree('es-419', 'per:david', 'up', 'es')
    expect(v.line!.length).toBeGreaterThanOrEqual(30)
    expect(v.line!.at(-1)!.p.id).toBe('per:adam')
    console.log('David up rows:', v.line!.length)
  })
  test('Jesús up: nine unnamed generations in one row, then the data ends', async () => {
    const v = await buildTree('es-419', 'per:jesus', 'up', 'es')
    expect(v.line!.find((r) => r.gap)!.gap).toBe(9)
    expect(v.line!.some((r) => r.p.unnamed && !r.gap)).toBe(false)
    expect(v.line!.at(-1)!.p.name).toBe('Pedaías')
    expect(v.cut).toBe(false)
  })
  test('Abraham: at most 150 people, 4 generations, no places, no repeats', async () => {
    const v = await buildTree('es-419', 'per:abraham', 'tree', 'es', 3)
    expect(v.nodes.length).toBeLessThanOrEqual(150)
    expect(v.cut).toBe(true)
    expect(all(v).some((p) => p.id.startsWith('lug:'))).toBe(false)
    expect(new Set(v.nodes.map((n) => n.id)).size).toBe(v.nodes.length)
    expect(v.open).toBe(3)
    const g1 = v.groups.flatMap((g) => g.kids)
    const g2 = g1.flatMap((i) => v.nodes[i]!.kids ?? [])
    const g3 = g2.flatMap((i) => v.nodes[i]!.kids ?? [])
    expect(g1.length + g2.length + g3.length).toBeLessThanOrEqual(60)
  })
  test('no lug: ids in the trees of the biggest families', async () => {
    for (const id of ['per:david', 'per:caleb', 'per:israel', 'per:asshur']) {
      for (const mode of ['tree', 'up'] as const) expect(all(await buildTree('es-419', id, mode, 'es')).some((p) => p.id.startsWith('lug:'))).toBe(false)
    }
  })
  test('time: Abraham «tree» open 3, warm', async () => {
    await buildTree('es-419', 'per:abraham', 'tree', 'es', 3)
    const t0 = performance.now()
    const v = await buildTree('es-419', 'per:abraham', 'tree', 'es', 3)
    const ms = performance.now() - t0
    console.log(`buildTree Abraham tree open 3, warm (reader.family included): ${ms.toFixed(1)} ms, ${v.nodes.length} nodes`)
    expect(ms).toBeLessThan(250)
  })
})
