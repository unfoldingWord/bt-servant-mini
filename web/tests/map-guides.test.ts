// The Map's tree guides (graph.ts mapGuides): per row, one cell per level (pipe / tee / last / blank), from the depths alone.
import { describe, expect, test } from 'bun:test'
import { addNode, GUIDE_MAX, type Graph, mapGuides, mapRows, newGraph, type NodeSheet } from '../src/graph'

const sh = (ref: string | null, concept: string | null = null): NodeSheet => ({ intent: concept && !ref ? 'article' : 'passage', ref, concept, what: ['text'], term: null, lang: 'en' })
const add = (g: Graph, kind: string, s: NodeSheet, links?: string[]) => addNode(g, { kind, sheet: s, label: `${s.ref ?? s.concept}`, links })
const G = (depths: number[]) => mapGuides(depths.map((depth) => ({ depth })))
const show = (gs: string[][]) => gs.map((c) => c.map((x) => ({ pipe: '|', tee: '+', last: '`', blank: '.' })[x]).join(''))

describe('mapGuides', () => {
  test('the main line has no guides', () => {
    expect(G([0, 0, 0])).toEqual([[], [], []])
  })
  test('a main line with two branches: the first is a tee, the last closes', () => {
    // 0 John 3:16 / 1 branch / 1 branch / 0 John 3:17
    expect(show(G([0, 1, 1, 0]))).toEqual(['', '+', '`', ''])
  })
  test('a branch with a deeper chain: the outer rail goes on while its siblings follow', () => {
    // 0 / 1 branch A / 2 deeper / 3 deeper / 1 branch B / 0
    expect(show(G([0, 1, 2, 3, 1, 0]))).toEqual(['', '+', '|`', '|.`', '`', ''])
  })
  test('a last child leaves a blank where its parent ended', () => {
    // 0 / 1 A (last) / 2 deeper (tee) / 2 deeper (last) / 0 line
    expect(show(G([0, 1, 2, 2, 0]))).toEqual(['', '`', '.+', '.`', ''])
  })
  test('a chain at the end of the list: the parent cell is last, then blank', () => {
    expect(show(G([0, 1, 2]))).toEqual(['', '`', '.`'])
  })
  test('a long line at depth 0 folds, and it has no guides', () => {
    const g = newGraph()
    for (let v = 1; v <= 8; v++) add(g, 'passage', sh(`rut 1:${v}`))
    const rows = mapRows(g)
    expect(rows.map((r) => r.k)).toEqual(['node', 'node', 'node', 'more', 'node', 'node'])
    expect(G(rows.map((r) => r.depth)).every((c) => c.length === 0)).toBe(true)
  })
  test('a real graph with a folded branch at depth 1: the "more" row sits among its siblings', () => {
    const g = newGraph()
    add(g, 'passage', sh('rut 2:3'))
    const b = add(g, 'passage', sh('jon 1:3')) // another book: a branch
    expect(b.edge).toBe('branch')
    for (let v = 4; v <= 10; v++) add(g, 'passage', sh(`jon 1:${v}`)) // its line, folds
    const rows = mapRows(g)
    expect(rows.map((r) => `${r.k}${r.depth}`)).toEqual(['node0', 'node1', 'node1', 'node1', 'more1', 'node1', 'node1'])
    // the folded branch is the only one: every row of the line is a tee but the last
    expect(show(G(rows.map((r) => r.depth)))).toEqual(['', '+', '+', '+', '+', '+', '`'])
  })
  test('a group row and its steps one step in', () => {
    // 0 / 1 group / 2 step / 2 step / 1 branch after the session
    expect(show(G([0, 1, 2, 2, 1]))).toEqual(['', '+', '|+', '|`', '`'])
  })
  test('the depth cap: no more than GUIDE_MAX cells, and a row below the cap has no elbow of its own', () => {
    const D = GUIDE_MAX
    const gs = G([0, D, D + 1, D + 2, D])
    expect(gs.every((c) => c.length <= GUIDE_MAX)).toBe(true)
    // the row at the cap: tee (the row at D after the capped ones is its sibling)
    expect(gs[1]![D - 1]).toBe('tee')
    // capped rows end in pipe (level D goes on to the later sibling), never tee/last
    expect(gs[2]![D - 1]).toBe('pipe')
    expect(gs[3]![D - 1]).toBe('pipe')
    // the last sibling at the cap closes
    expect(gs[4]![D - 1]).toBe('last')
    // with nothing at the cap after them, the capped rows end in blank
    expect(G([0, D, D + 1])[2]![D - 1]).toBe('blank')
  })
  test('edge cases: empty list, a first row below 0, a jump of more than one level, consecutive depth-7 rows', () => {
    expect(G([])).toEqual([])
    expect(show(G([2]))).toEqual(['.`'])
    expect(show(G([0, 3]))).toEqual(['', '..`'])
    expect(show(G([0, 1, 7, 7, 1]))).toEqual(['', '+', '|.....', '|.....', '`'])
    expect(G([0, 7, 7])[1]).toHaveLength(GUIDE_MAX)
  })
})
