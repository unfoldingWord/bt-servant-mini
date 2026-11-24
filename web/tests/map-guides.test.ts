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
  test('an outer rail also goes on at the end of the list only when a later row needs it', () => {
    expect(show(G([0, 1, 2]))).toEqual(['', '`', '.`'])
  })
  test('folded "more" and group rows are rows like any other (a real graph)', () => {
    const g = newGraph()
    add(g, 'passage', sh('rut 1:1'))
    for (let v = 2; v <= 8; v++) add(g, 'passage', sh(`rut 1:${v}`)) // a long line: folds
    const rows = mapRows(g)
    expect(rows.map((r) => r.k)).toEqual(['node', 'node', 'node', 'more', 'node', 'node'])
    expect(G(rows.map((r) => r.depth)).every((c) => c.length === 0)).toBe(true)
    // a folded line at depth 1 under a branch, with a later sibling at depth 1 after it
    const more = [0, 1, 1, 1, 1, 1, 1, 0].map((depth) => ({ depth })) // branch, 2 line, "more", 2 line... all depth 1
    expect(show(mapGuides(more))).toEqual(['', '+', '+', '+', '+', '+', '`', ''])
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
})
