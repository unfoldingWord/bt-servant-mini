// The Map's lanes (graph.ts mapRows): git-graph style. The main line is lane 0; a chain of single children goes straight on in its
// lane; only a fork opens a lane, the lowest free one over its span (origin row to its last row); the way to the current point is
// `hot`; a chain of 4 or more off that path folds to first / "… N more" / last (forks stay visible). No DOM: the drawing is lanesview.ts.
import { describe, expect, test } from 'bun:test'
import { type Edge, FOLD_MIN, type GNode, type Graph, laneCount, type MapRow, mapRows, type NodeSheet, stepKind } from '../src/graph'

type Spec = [parent: number | null, edge: Edge, kind?: string]
const sheet = (concept: string | null = null, intent = 'passage', what: string[] = []): NodeSheet => ({ intent, ref: null, concept, what, term: null, lang: 'en' })
/** A graph from [parent index, edge, kind] per point (point i is `n<i>`), in creation order; `cur`: the current point. */
const graph = (specs: Spec[], cur: number, sheets: Record<number, NodeSheet> = {}): Graph => ({
  nodes: specs.map(([p, edge, kind], i): GNode => ({ id: `n${i}`, parent: p === null ? null : `n${p}`, edge, label: `n${i}`, sheet: sheets[i] ?? sheet(), msg: i, at: i, kind: kind ?? 'passage' })),
  cur: `n${cur}`,
})
const idx = (r: MapRow) => (r.k === 'node' ? +r.node.id.slice(1) : r.k === 'more' ? `more${r.n}` : 'group')
/** "point:lane:origin row" per row (the prototype's notation, "fN" for a fold of N) */
const show = (rows: MapRow[]) => rows.map((r) => (r.k === 'more' ? `f${r.n}:${r.lane}:${r.p}` : `${r.k === 'node' ? idx(r) : 'g'}:${r.lane}:${r.p}`))

describe('lanes', () => {
  test('a chain of single children stays in one lane: no indent step by step', () => {
    // 0 main; 1 branches off it; 2, 3, 4 go deeper one after the other
    const rows = mapRows(graph([[null, 'start'], [0, 'branch'], [1, 'deeper'], [2, 'deeper'], [3, 'deeper']], 4))
    expect(rows.map((r) => r.lane)).toEqual([0, 1, 1, 1, 1])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 3, 4]) // (the tree depth is still known; it is not drawn)
    expect(laneCount(rows)).toBe(2)
  })

  test('the main line (edge line) stays in lane 0 however many points it has', () => {
    const rows = mapRows(graph([[null, 'start'], [0, 'line'], [1, 'line'], [2, 'line'], [3, 'line'], [4, 'line'], [5, 'line']], 6))
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0, 0, 0, 0, 0])
    expect(rows.every((r) => r.k === 'node')).toBe(true) // (a line is never folded)
  })

  test('a fork opens lane 1, and the next fork reuses the lane when it is free again', () => {
    // 0; 1 branches off 0 (lane 1: rows 0–1); 2 goes on along the line (lane 0); 3 branches off 2, below where lane 1 ended
    const rows = mapRows(graph([[null, 'start'], [0, 'branch'], [0, 'line'], [2, 'branch']], 2))
    expect(show(rows)).toEqual(['0:0:null', '1:1:0', '2:0:0', '3:1:2'])
  })

  test('two forks over the same rows take two lanes', () => {
    // 0 with two branches and then the line: the branches are both alive while the second is open
    const rows = mapRows(graph([[null, 'start'], [0, 'branch'], [0, 'branch'], [0, 'line']], 3))
    expect(rows.map((r) => r.lane)).toEqual([0, 1, 2, 0])
  })

  test('below the main line, the first child goes on straight and the others fork off it', () => {
    // 0; 1 off the line; 2 and 3 are its children: 2 straight (lane 1), 3 a fork (lane 2)
    const rows = mapRows(graph([[null, 'start'], [0, 'branch'], [1, 'deeper'], [1, 'branch']], 0))
    expect(show(rows)).toEqual(['0:0:null', '1:1:0', '2:1:1', '3:2:1'])
  })

  test('a far branch: its lane is held from its origin row down to it, and it says where it comes from', () => {
    // n1 (lane 1) goes deeper to n5 in one chain, then forks again to n6: that branch starts far below its origin
    const g = graph([[null, 'start'], [0, 'branch'], [1, 'deeper'], [2, 'deeper'], [3, 'deeper'], [4, 'deeper'], [1, 'branch']], 5)
    const rows = mapRows(g)
    expect(show(rows)).toEqual(['0:0:null', '1:1:0', '2:1:1', '3:1:2', '4:1:3', '5:1:4', '6:2:1'])
    const far = rows[6]! as Extract<MapRow, { k: 'node' }>
    expect([far.p, far.from]).toEqual([1, 1])
    // lane 2 belongs to this branch alone over rows 1–6: nothing else takes it there
    expect(rows.slice(1, 6).some((r) => r.lane === 2)).toBe(false)
    // near rows (the origin 2 rows or fewer above, or in the same lane) have no "comes from"
    expect(rows.filter((r) => r.k === 'node' && r.from !== null).map(idx)).toEqual([6])
  })

  test('a lane held by a far branch is not given to a fork that starts inside its span', () => {
    // n1 (lane 1) has a late second child n7 whose lane is held over rows 1–7; n5 forks off n2 inside that span, so it takes lane 3
    const g = graph([[null, 'start'], [0, 'branch'], [1, 'deeper'], [2, 'deeper'], [3, 'deeper'], [2, 'branch'], [5, 'deeper'], [1, 'branch']], 0)
    expect(show(mapRows(g))).toEqual(['0:0:null', '1:1:0', '2:1:1', '3:1:2', '4:1:3', '5:3:2', '6:3:5', '7:2:1'])
  })

  test('the current path is flagged: first point to the current one, nothing else', () => {
    const g = graph([[null, 'start'], [0, 'branch'], [1, 'deeper'], [2, 'deeper'], [0, 'line'], [4, 'branch']], 3)
    const rows = mapRows(g)
    expect(rows.filter((r) => r.hot).map(idx)).toEqual([0, 1, 2, 3])
    expect(rows.filter((r) => r.k === 'node' && r.cur).map(idx)).toEqual([3])
  })

  test('no current point: no path, the whole map is muted', () => {
    const g = graph([[null, 'start'], [0, 'branch']], 1)
    g.cur = null
    expect(mapRows(g).some((r) => r.hot)).toBe(false)
  })

  test('forks: the number of points that start from a point', () => {
    const g = graph([[null, 'start'], [0, 'branch'], [0, 'branch'], [0, 'line'], [1, 'deeper']], 3)
    const rows = mapRows(g)
    expect(rows.map((r) => (r.k === 'node' ? r.forks : -1))).toEqual([3, 1, 0, 0, 0])
  })
})

describe('folding', () => {
  // 0; a chain n1…n(last) off the line, ending in a fork of two (n(last+1), n(last+2)); the current point is n0, off the chain
  const chain = (n: number): Graph => {
    const specs: Spec[] = [[null, 'start'], [0, 'branch']]
    for (let i = 2; i <= n; i++) specs.push([i - 1, 'deeper'])
    specs.push([n, 'deeper'], [n, 'branch'])
    return graph(specs, 0)
  }

  test(`a run of ${FOLD_MIN} or more single-child points off the path folds: first, "… N more", last`, () => {
    // n1…n5 single, n6 forks: run of 5 -> n1, more 3, n5
    const rows = mapRows(chain(6))
    expect(rows.map((r) => (r.k === 'more' ? `more${r.n}` : idx(r)))).toEqual([0, 1, 'more3', 5, 6, 7, 8])
    const more = rows.find((r) => r.k === 'more')!
    expect(more).toMatchObject({ key: 'n1', lane: 1, p: 1 })
    // the last point is drawn from the fold, the fold from the first point
    expect(rows[3]!.p).toBe(2)
    // opened: every point, and the key is the run's first point
    expect(mapRows(chain(6), new Set(['n1'])).map(idx)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  test('nodes with forks stay visible, and the badge counts their branches', () => {
    const rows = mapRows(chain(6))
    const fork = rows.find((r) => r.k === 'node' && r.node.id === 'n6')!
    expect(fork).toMatchObject({ forks: 2 })
  })

  test('the limit: 3 single points do not fold, 4 do', () => {
    // chain(4): n1…n3 single and n4 forks -> run of 3
    expect(mapRows(chain(4)).some((r) => r.k === 'more')).toBe(false)
    // chain(5): n1…n4 single -> run of 4: first, more 2, last
    expect(mapRows(chain(5)).find((r) => r.k === 'more')).toMatchObject({ n: 2 })
  })

  test('a chain on the current path never folds', () => {
    const g = chain(6)
    g.cur = 'n4'
    expect(mapRows(g).some((r) => r.k === 'more')).toBe(false)
  })

  test('a fork in the middle splits the run: each half is judged alone', () => {
    // n1…n8 single; n3 also has a second child n9 -> n3 is not single: n1, n2 (run of 2) | n4… (run of 5 from n4 to n8: folds)
    const specs: Spec[] = [[null, 'start'], [0, 'branch'], [1, 'deeper'], [2, 'deeper'], [3, 'deeper'], [4, 'deeper'], [5, 'deeper'], [6, 'deeper'], [7, 'deeper'], [3, 'branch']]
    const rows = mapRows(graph(specs, 0))
    expect(rows.some((r) => r.k === 'node' && r.node.id === 'n3')).toBe(true)
    // n3 keeps its forks visible; n4…n8 are the folded one
    expect(rows.filter((r) => r.k === 'more').map((r) => (r as { key: string }).key)).toEqual(['n4'])
  })
})

describe('5M sessions', () => {
  // 0 passage; a 5M session of 6 steps off it (n1 … n6, the steps follow each other on a line); n7 is a help of step 2 (deeper)
  const step = (i: number): NodeSheet => sheet(`obs5m:1/m1/${i}`, 'obs5m')
  const specs: Spec[] = [[null, 'start'], [0, 'deeper', 'obs5m'], [1, 'line', 'obs5m'], [2, 'line', 'obs5m'], [3, 'line', 'obs5m'], [4, 'line', 'obs5m'], [5, 'line', 'obs5m'], [2, 'deeper', 'article']]
  const g = graph(specs, 6, Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [i, step(i)])))

  test('one group row for the session, with no dot of its own, in the lane of its first step', () => {
    const rows = mapRows(g)
    const groups = rows.filter((r) => r.k === 'group')
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ label: 'OBS 1 · 5M', p: null, depth: 1 })
    expect(groups[0]!.lane).toBe(rows[rows.indexOf(groups[0]!) + 1]!.lane)
    expect(rows.indexOf(groups[0]!)).toBe(1)
  })

  test('its steps are never folded, however long (they are the way through the session)', () => {
    const rows = mapRows({ ...g, cur: 'n0' })
    expect(rows.some((r) => r.k === 'more')).toBe(false)
    expect(rows.filter((r) => r.k === 'node' && r.node.kind === 'obs5m')).toHaveLength(6)
  })

  test('the steps go on in one lane; a help of a step forks off it; steps are one level in under the group row', () => {
    const rows = mapRows(g)
    const lane = (id: string) => rows.find((r) => r.k === 'node' && r.node.id === id)!.lane
    expect([1, 2, 3, 4, 5, 6].map((i) => lane(`n${i}`))).toEqual([1, 1, 1, 1, 1, 1])
    expect(lane('n7')).toBe(2)
    expect(rows.filter((r) => r.k === 'node' && r.node.kind === 'obs5m').every((r) => r.depth === 2)).toBe(true)
    // the edge into the first step comes from the passage above the group row, not from the group row
    const first = rows.find((r) => r.k === 'node' && r.node.id === 'n1')!
    expect(rows[first.p!]).toMatchObject({ k: 'node' })
  })
})

describe('the words under a name', () => {
  const node = (kind: string, intent: string, what: string[] = []): GNode => ({ ...graph([[null, 'start', kind]], 0, { 0: sheet(null, intent, what) }).nodes[0]! })
  test('the kind of step comes from what the point stores', () => {
    expect(stepKind(node('passage', 'passage'))).toBe('passage')
    expect(stepKind(node('intro', 'passage'))).toBe('intro')
    expect(stepKind(node('place', 'place', ['map']))).toBe('map')
    expect(stepKind(node('place', 'place', ['card']))).toBe('place')
    expect(stepKind(node('family', 'kin', ['tree']))).toBe('tree')
    expect(stepKind(node('family', 'kin', ['here']))).toBe('people')
    expect(stepKind(node('article', 'article'))).toBe('article')
    expect(stepKind(node('meaning', 'article'))).toBe('term')
    expect(stepKind(node('obs5m', 'obs5m'))).toBe('study')
    expect(stepKind(node('search', 'search'))).toBe('search')
    expect(stepKind(node('count', 'passage'))).toBe('answer')
  })
})

// The conversation of the approved prototype (handoff/mini-servant/prototipo-carriles.html): [parent, continues the main line]
describe('the prototype conversation (30 points)', () => {
  const N: [number | null, 0 | 1][] = [
    [null, 0], [0, 0], [0, 0], [0, 1], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [12, 0], [14, 0],
    [3, 1], [16, 0], [17, 0], [18, 0], [19, 0], [20, 0], [21, 0], [22, 0], [23, 0], [24, 0], [25, 0], [26, 0], [5, 0], [28, 0],
  ]
  const g = graph(N.map(([p, main]): Spec => (p === null ? [null, 'start'] : [p, main ? 'line' : 'deeper'])), 27)
  // the rows and lanes the prototype's build() gives ("point:lane:origin row"; "fN" for a fold)
  const OPEN = ['0:0:null', '1:1:0', '2:2:0', '3:0:0', '4:1:3', '5:1:4', '6:1:5', '7:1:6', '8:1:7', '9:1:8', '10:1:9', '11:1:10', '12:1:11', '13:1:12', '14:3:12', '15:3:14',
    '28:2:5', '29:2:16', '16:0:3', '17:1:18', '18:1:19', '19:1:20', '20:1:21', '21:1:22', '22:1:23', '23:1:24', '24:1:25', '25:1:26', '26:1:27', '27:1:28']
  const FOLDED = ['0:0:null', '1:1:0', '2:2:0', '3:0:0', '4:1:3', '5:1:4', '6:1:5', 'f4:1:6', '11:1:7', '12:1:8', '13:1:9', '14:3:9', '15:3:11',
    '28:2:5', '29:2:13', '16:0:3', '17:1:15', '18:1:16', '19:1:17', '20:1:18', '21:1:19', '22:1:20', '23:1:21', '24:1:22', '25:1:23', '26:1:24', '27:1:25']

  test('all open: the same rows, lanes and origins as the prototype', () => {
    expect(show(mapRows(g, new Set(g.nodes.map((n) => n.id))))).toEqual(OPEN)
  })
  test('folded: the same rows, lanes and origins as the prototype', () => {
    expect(show(mapRows(g))).toEqual(FOLDED)
  })
  test('the way to "You are here" is the whole of lane 0 down to Jonás 1 and then lane 1, in colour', () => {
    const rows = mapRows(g)
    expect(rows.filter((r) => r.hot).map(idx)).toEqual([0, 3, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27])
  })
  test('"comes from": only a branch in another lane and more than 2 rows below its origin', () => {
    const rows = mapRows(g, new Set(g.nodes.map((n) => n.id)))
    expect(rows.filter((r) => r.k === 'node' && r.from !== null).map((r) => `${idx(r)}<${(r as { from: number }).from}`)).toEqual(['28<5', '29<16'].slice(0, 1).concat(['2<0'].slice(0, 0)).concat(['3<0'].slice(0, 0)))
  })
})
