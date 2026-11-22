import { buildTree } from '../src/tree'
// The family tree as an answer (pipeline.ts kinAnswer, treeBar, pointLabel; diseno-arboles.md §4.1, §4.5, §4.6, §6, piece C): a phrase
// gives `reply.tree` and `treeOf`; «Árbol familiar» is in sight under the person's answers; the bar of a tapped name; the save drops `tree`.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { kinFixture } from './fixtures/kin/family'
import { setKinReader } from '../src/kin'
import { splitFollow } from '../src/converse'
import { treeBar, treeWords, type ConvState } from '../src/pipeline'
import { saveReplacer, type TreeView } from '../src/tree'

const ask = async (q: string, ui = 'es', c: ConvState = { last: null }) => turn(c, { q, slots: null }, ui)
const labels = (r: { reply: { follow?: { label: string }[] } }) => (r.reply.follow ?? []).map((f) => f.label)
const shown = (r: { reply: { follow?: import('../src/converse').Followup[] } }) => splitFollow(r.reply.follow ?? [], 0).shown.map((f) => f.label)

describe('the tree phrases answer with the view', () => {
  beforeAll(fullPhone)
  test('«árbol de Isaac», «family tree of Isaac», «شجرة عائلة إسحاق»: reply.tree and treeOf', async () => {
    for (const [q, ui] of [['árbol de Isaac', 'es'], ['family tree of Isaac', 'en'], ['شجرة عائلة إسحاق', 'ar']] as const) {
      const r = await ask(q, ui)
      expect(r.route).toBe('kin')
      expect(r.answered).toBe('family')
      expect(r.concept).toBe('per:isaac')
      const v = r.reply.tree as TreeView
      expect(v.mode).toBe('tree')
      expect(v.focus.id).toBe('per:isaac')
      expect(r.reply.treeOf).toEqual({ pack: r.reply.lang!, id: 'per:isaac', mode: 'tree', open: v.open })
      expect(r.reply.info).toMatch(/Datos de familia|Family data|بيانات/)
    }
  })
  test('«genealogía de David» is the line of ancestors; «descendientes de Abraham» opens three generations', async () => {
    const up = await ask('genealogía de David')
    expect(up.reply.tree!.mode).toBe('up')
    expect(up.reply.treeOf!.mode).toBe('up')
    expect(up.reply.info).toMatch(/^Antepasados de .*David: Isaí/)
    const down = await ask('descendientes de Abraham')
    expect(down.reply.tree!.mode).toBe('tree')
    expect(down.reply.tree!.open).toBeGreaterThanOrEqual(1)
    expect(down.reply.treeOf!.open).toBe(down.reply.tree!.open)
    // (reopened from what a saved conversation keeps: still «descendants», whatever generations were open)
    expect(down.reply.treeOf!.down).toBe(true)
    const of = down.reply.treeOf!
    const again = await buildTree(of.pack, of.id, of.mode, 'es', of.open, of.down)
    expect(again.down).toBe(true)
    expect(again.open).toBe(down.reply.tree!.open)
  })
  test('the steps under the view: the other view, more family; the point is named', async () => {
    const c: ConvState = { last: null }
    const r = await ask('árbol de Isaac', 'es', c)
    expect(labels(r)).toEqual(expect.arrayContaining(['Antepasados de Isaac', 'Más familia']))
    const u = await ask('antepasados de Isaac', 'es', c)
    expect(labels(u)).toContain('Árbol de Isaac')
    const d = await ask('descendientes de Abraham', 'es', c)
    expect(c.graph!.nodes.map((n) => n.label)).toEqual(expect.arrayContaining(['Árbol de Isaac', 'Antepasados de Isaac', 'Descendientes de Abraham']))
    expect(labels(d)).toContain('Antepasados de Abraham')
  })
})

describe('with the hand-made reader', () => {
  beforeAll(async () => {
    await fullPhone()
    setKinReader(async () => kinFixture())
  })
  afterAll(() => setKinReader())
  test('«Árbol familiar» is in sight (splitFollow) under «hijos de Isaac», the card of Cetura and «familia de Isaac»', async () => {
    for (const q of ['hijos de Isaac', '¿Quién fue Cetura?', 'familia de Isaac']) {
      const r = await ask(q)
      expect(r.route).toBe('kin')
      expect(labels(r)).toContain('Árbol familiar')
      expect(shown(r)).toContain('Árbol familiar')
    }
  })
  test('the button gives the tree of that person, and its steps are in sight', async () => {
    const c: ConvState = { last: null }
    const r = await ask('hijos de Isaac', 'es', c)
    const f = r.reply.follow!.find((x) => x.label === 'Árbol familiar')!
    expect(f.key).toBe(true)
    const t = await turn(c, { q: '', sheet: f.sheet! }, 'es')
    expect(t.reply.tree!.focus.id).toBe('per:isaac')
  })
  test('treeBar for a child: the person, «Árbol de X», the verse of the tie, in order', async () => {
    const c: ConvState = { last: null }
    const r = await ask('árbol de Isaac', 'es', c)
    const base = { ...r.reply.follow![0]!.sheet! }
    const bar = await treeBar(base, 'es', 'per:esau', 'per:isaac', 'tree', 'per:isaac')
    expect(bar.map((b) => b.label).slice(0, 2)).toEqual(['Esaú', 'Árbol de Esaú'])
    expect(bar.length).toBeGreaterThanOrEqual(3)
    expect(bar[2]!.label).toMatch(/\d+:\d+/)
    // the centre offers its ancestors; the centre has no verse
    const centre = await treeBar(base, 'es', 'per:isaac', null, 'tree', 'per:isaac')
    expect(centre.map((b) => b.label)).toContain('Antepasados de Isaac')
    expect(centre.some((b) => /^Génesis \d+:\d+/.test(b.label))).toBe(false)
    // in the line of ancestors even the centre offers the tree
    expect((await treeBar(base, 'es', 'per:isaac', null, 'up', 'per:isaac')).map((b) => b.label)).toContain('Árbol de Isaac')
  })
  test('the words of a tree come from the same strings in every language', () => {
    for (const ui of ['es', 'en', 'fr', 'id', 'hi', 'ar']) {
      const w = treeWords(ui)
      for (const [k, v] of Object.entries(w)) expect(typeof v === 'string' && v.length > 0).toBe(true)
      expect(w.childOf).toContain('{x}')
      expect(w.and).toContain('{x}')
    }
    expect(treeWords('es').wives).toBe('Esposas:')
  })
})

describe('under a person’s Translation Words article', () => {
  beforeAll(fullPhone)
  test('«Árbol familiar» next to «Familia de X», in sight', async () => {
    const c: ConvState = { last: null }
    const r = await ask('¿Quién fue Abraham?', 'es', c)
    const a = r.reply.follow!.find((x) => /^Artículo:/.test(x.label))
    if (!a?.sheet) return // no article for him in the test packs
    const art = await turn(c, { q: '', sheet: a.sheet }, 'es')
    expect(labels(art)).toEqual(expect.arrayContaining(['Familia de Abraham', 'Árbol familiar']))
    expect(shown(art)).toContain('Árbol familiar')
  })
})

describe('saving', () => {
  test('the replacer drops a message’s `tree` and keeps `treeOf`; other `tree` keys stay', () => {
    const msg = { who: 'bot', info: 'x', tree: { mode: 'tree' }, treeOf: { pack: 'es', id: 'per:isaac', mode: 'tree', open: 1 } }
    const live = { convs: [{ msgs: [msg, { who: 'bot', macula: { tree: { a: 1 } } }] }], current: 'c' }
    const saved = JSON.parse(JSON.stringify(live, saveReplacer))
    expect(saved.convs[0].msgs[0].tree).toBeUndefined()
    expect(saved.convs[0].msgs[0].treeOf.id).toBe('per:isaac')
    expect(saved.convs[0].msgs[1].macula.tree).toEqual({ a: 1 })
    expect(msg.tree).toEqual({ mode: 'tree' }) // the live message still draws
  })
})
