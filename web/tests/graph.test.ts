// The conversation's graph (graph.ts, pipeline.ts graphStep / returnTo): code decides how each answer joins the one before
// (line, deeper, branch), a point off the passage offers "← Back to …" first, going back re-opens that point and the next
// question goes on from it; the Map lists the tree in reading order; the graph survives being saved.
import { beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, nextSteps, stepTarget, turn } from './harness'
import { addNode, branchOf, classify, type GNode, type Graph, mapRows, newGraph, type NodeSheet, nodeOf } from '../src/graph'
import { answer, type ConvState, returnTo } from '../src/pipeline'

const sh = (ref: string | null, concept: string | null = null, intent = concept && !ref ? 'article' : 'passage'): NodeSheet =>
  ({ intent, ref, concept, what: ['text'], term: null, lang: 'en' })
const add = (g: Graph, kind: string, s: NodeSheet, links?: string[]) => addNode(g, { kind, sheet: s, label: `${s.ref ?? s.concept}`, links })

describe('classification by code', () => {
  test('the same passage goes on along its line; a verse of the next chapter too', () => {
    const g = newGraph()
    const a = add(g, 'passage', sh('rut 2:3'))
    expect(a.edge).toBe('start')
    expect(classify(g, { kind: 'passage', sheet: sh('rut 2:4') })).toEqual({ edge: 'line', parent: a.id })
    expect(classify(g, { kind: 'passage', sheet: sh('rut 2') })).toEqual({ edge: 'line', parent: a.id })
    expect(classify(g, { kind: 'passage', sheet: sh('rut 3') }).edge).toBe('line')
    // another chapter further on, another book: a new branch
    expect(classify(g, { kind: 'passage', sheet: sh('rut 4:1') }).edge).toBe('branch')
    expect(classify(g, { kind: 'passage', sheet: sh('jon 1:3') }).edge).toBe('branch')
  })
  test('deeper: a key term of the passage, a question about it, the introduction of its book or chapter', () => {
    const g = newGraph()
    const a = add(g, 'passage', sh('rut 2:3'), ['tw:other/glean', 'ta:translate/figs-idiom'])
    expect(classify(g, { kind: 'article', sheet: sh(null, 'tw:other/glean') })).toEqual({ edge: 'deeper', parent: a.id })
    expect(classify(g, { kind: 'article', sheet: sh(null, 'ta:translate/figs-idiom') }).edge).toBe('deeper')
    expect(classify(g, { kind: 'meaning', sheet: sh('rut 2:3', 'tw:kt/grace') }).edge).toBe('deeper')
    expect(classify(g, { kind: 'intro', sheet: sh('rut 2:intro') }).edge).toBe('deeper')
    expect(classify(g, { kind: 'intro', sheet: sh('rut front:intro') }).edge).toBe('deeper')
    // an article the passage does not hold, another book's introduction: a branch
    expect(classify(g, { kind: 'article', sheet: sh(null, 'tw:kt/love') }).edge).toBe('branch')
    expect(classify(g, { kind: 'intro', sheet: sh('num 6:intro') }).edge).toBe('branch')
  })
  test('after an article from the passage, the next verse goes back on the passage\'s line', () => {
    const g = newGraph()
    const a = add(g, 'passage', sh('rut 2:3'), ['tw:other/glean'])
    add(g, 'article', sh(null, 'tw:other/glean'))
    expect(classify(g, { kind: 'passage', sheet: sh('rut 2:4') })).toEqual({ edge: 'line', parent: a.id })
  })
  test('a verse a search found goes deeper from the search', () => {
    const g = newGraph()
    const s = add(g, 'search', { ...sh('jon 1:17'), intent: 'search' }, ['jon 1:17', 'jon 2:10'])
    expect(classify(g, { kind: 'passage', sheet: sh('jon 2:10') })).toEqual({ edge: 'deeper', parent: s.id })
  })
})

describe('the Map', () => {
  test('reading order: a point, what goes deeper or branches from it (indented), then its line', () => {
    const g = newGraph()
    const a = add(g, 'passage', sh('rut 2:3'), ['tw:other/glean'])
    const notes = add(g, 'passage', sh('rut 2:3'), ['tw:other/glean'])
    const glean = add(g, 'article', sh(null, 'tw:other/glean'))
    const num = add(g, 'intro', sh('num 6:intro'))
    g.cur = notes.id
    const next = add(g, 'passage', sh('rut 2:4'))
    expect([notes.edge, glean.edge, num.edge, next.edge]).toEqual(['line', 'deeper', 'branch', 'line'])
    const rows = mapRows(g).map((r) => (r.k === 'node' ? `${r.depth} ${r.node.id === a.id ? 'a' : r.node.id === notes.id ? 'notes' : r.node.id === glean.id ? 'glean' : r.node.id === num.id ? 'num' : 'next'}${r.cur ? '*' : ''}` : 'more'))
    expect(rows).toEqual(['0 a', '0 notes', '1 glean', '2 num', '0 next*'])
  })
  test('a line of more than 5 points folds its middle, unless the current point is there; opened, it shows all', () => {
    const g = newGraph()
    const ids: string[] = []
    for (let v = 1; v <= 9; v++) ids.push(add(g, 'passage', sh(`rut 1:${v}`)).id)
    const rows = mapRows(g)
    expect(rows.map((r) => r.k)).toEqual(['node', 'node', 'node', 'more', 'node', 'node'])
    expect(rows.find((r) => r.k === 'more')).toMatchObject({ n: 4 })
    expect(mapRows(g, new Set([ids[1]!])).length).toBe(9)
    g.cur = ids[4]!
    expect(mapRows(g).length).toBe(9)
  })
  test('the branch: a point and up to 3 above it, oldest first', () => {
    const g = newGraph()
    const xs: GNode[] = []
    for (const r of ['rut 1:1', 'jon 1:1', 'num 6:1', 'gen 1:1', 'exo 1:1']) xs.push(add(g, 'passage', sh(r)))
    expect(branchOf(g, xs[4]!.id).map((n) => n.sheet.ref)).toEqual(['jon 1:1', 'num 6:1', 'gen 1:1', 'exo 1:1'])
  })
})

describe('a conversation (the spec\'s)', () => {
  beforeAll(fullPhone)
  test('Ruth 2:3 → notes (line) → glean (deeper) → Numbers 6 (branch) → back → next verse, a child of Ruth 2:3', async () => {
    const c: ConvState = { last: null }
    const r1 = await turn(c, { q: 'Ruth 2:3' }, 'en')
    const p1 = nodeOf(c.graph, r1.node)!
    expect(p1.edge).toBe('start')
    expect(p1.label).toBe('Ruth 2:3')
    const r2 = await turn(c, { q: 'and the notes?' }, 'en')
    const p2 = nodeOf(c.graph, r2.node)!
    expect([p2.edge, p2.parent, p2.sheet.ref]).toEqual(['line', p1.id, 'rut 2:3'])
    expect(p2.label).toBe('Ruth 2:3 · Notes')
    const r3 = await turn(c, { q: 'what does glean mean here?' }, 'en')
    const p3 = nodeOf(c.graph, r3.node)!
    expect([p3.edge, p3.parent]).toEqual(['deeper', p2.id])
    expect(p3.label.toLowerCase()).toContain('glean')
    // the first button goes back to the passage
    const b3 = nextSteps({ reply: r3.reply } as any)
    expect(b3[0]!.label).toBe('← Back to Ruth 2:3')
    expect((r3.reply.follow ?? [])[0]!.back).toBe(p2.id)
    const r4 = await turn(c, { q: 'Introduction to Numbers 6' }, 'en')
    const p4 = nodeOf(c.graph, r4.node)!
    expect([p4.edge, p4.parent]).toEqual(['branch', p3.id])
    // the user report: buttons to go on with Numbers, and back to the text it came from (once)
    const f4 = r4.reply.follow ?? []
    expect(f4.filter((f) => f.back).map((f) => [f.label, f.back])).toEqual([['← Back to Ruth 2:3', p2.id]])
    expect(f4.map((f) => stepTarget(f as any)).some((t) => /^num 6/.test(t))).toBe(true)
    // the back button: the state from that point, its sheet re-opened as an answer attached to it (no new point)
    const back = f4.find((f) => f.back)!
    const made = returnTo(c, back.back!, 'en')!
    expect(made.at).toBe(p2.id)
    const n0 = c.graph!.nodes.length
    const r5 = await answer(c, made, performance.now())
    expect(r5.node).toBe(p2.id)
    expect(c.graph!.nodes.length).toBe(n0)
    expect(c.graph!.cur).toBe(p2.id)
    expect(r5.ref).toBe('rut 2:3')
    // the next question goes on from there
    const r6 = await turn(c, { q: 'and the next verse?' }, 'en')
    expect(r6.ref).toBe('rut 2:4')
    const p6 = nodeOf(c.graph, r6.node)!
    expect([p6.edge, p6.parent]).toEqual(['line', p2.id])
    // a line point has no back button
    expect((r6.reply.follow ?? []).some((f) => f.back)).toBe(false)
  }, 60_000)

  test('saved and loaded (JSON), the graph goes on where it was', async () => {
    const c0: ConvState = { last: null }
    await turn(c0, { q: 'Ruth 2:3' }, 'en')
    const r = await turn(c0, { q: 'Introduction to Jonah' }, 'en')
    const c: ConvState = JSON.parse(JSON.stringify(c0))
    expect(c.graph!.cur).toBe(r.node)
    const first = c.graph!.nodes[0]!
    const made = returnTo(c, first.id, 'en')!
    const back = await answer(c, made, performance.now())
    expect(back.node).toBe(first.id)
    const next = await turn(c, { q: 'and the notes?' }, 'en')
    expect(nodeOf(c.graph, next.node)!.parent).toBe(first.id)
  }, 60_000)

  test('an answer with nothing in it makes no point; past a book\'s end neither', async () => {
    const c: ConvState = { last: null }
    const r = await turn(c, { q: 'asdf qwer' }, 'en') // nothing fits: no point (help never reaches answer(): main.ts)
    expect(r.node).toBeNull()
    await turn(c, { q: 'Ruth 4:22' }, 'en')
    const n = c.graph!.nodes.length
    const edge = await turn(c, { q: 'and the next verse?' }, 'en')
    expect(edge.answered).toBe('edge')
    expect(edge.node).toBeNull()
    expect(c.graph!.nodes.length).toBe(n)
  }, 60_000)
})
