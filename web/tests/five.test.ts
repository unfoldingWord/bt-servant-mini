// 5M from the packs (five.ts): a pack's session (language-pack-client `obsSession`) as the tables the session reads; no source = no 5M.
import { afterAll, describe, expect, test } from 'bun:test'
import { covered5, fixtureNow5, fixtureOf5, fixtureOfSession, on5m, refresh5, setSource5 } from '../src/five'
import { steps } from '../src/obs5m'
import { fiveOn } from './five-on'

const session = {
  story: 3, title: 'The Fall', reference: 'Genesis 3', release: 'v4',
  frames: [{ n: 1, text: 'One.', image: 'https://x/1.jpg' }, { n: 2, text: 'Two.' }],
  parts: [
    { code: 'intro', title: 'Introduction', text: '### Key Idea\nIdea', lists: [] },
    { code: 'frames', lists: [] },
    { code: 'community', block: { key: 'dev#C', title: 'Community', text: 'Body' }, lists: [] },
    { code: 'm1', title: 'Movement 1', text: 'Open', lists: [
      { code: 'observation', title: 'Observe', text: 'Ask', questions: [{ id: '3/m1/1', q: 'Who?', a: 'Eve', frames: [301] }, { id: '3/m1/2', q: 'Why?', frames: [] }], terms: [] },
      { code: 'terms', title: 'Terms', terms: [{ frame: 302, terms: [{ id: '3:2/1', term: 'sin', text: '**sin** is' }, { id: '3:2/2', text: 'no term' }] }], questions: [] },
    ] },
  ],
}

afterAll(() => setSource5(null))

describe('a pack session as the tables', () => {
  const fx = fixtureOfSession(session, 'en')
  test('story, frames as OBS refs, release', () => {
    expect([fx.story, fx.title, fx.reference, fx.tfLang, fx.release]).toEqual([3, 'The Fall', 'Genesis 3', 'en', 'v4'])
    expect(fx.frames).toEqual([{ ref: '3:1', text: 'One.', image: 'https://x/1.jpg' }, { ref: '3:2', text: 'Two.', image: '' }])
  })
  test('parts in order, a list after its part, the shared block by key', () => {
    expect(fx.parts.map((p) => [p.part, p.list])).toEqual([['intro', null], ['frames', null], ['community', null], ['m1', null], ['m1', 'observation'], ['m1', 'terms']])
    expect(fx.parts[2]!.shared).toBe('dev#C')
    expect(fx.shared['dev#C']).toEqual({ title: 'Community', text: 'Body' })
  })
  test('questions with their frames, terms with their number', () => {
    expect(fx.questions).toEqual([
      { id: '3/m1/1', part: 'm1', list: 'observation', frames: ['3:1'], q: 'Who?', a: 'Eve' },
      { id: '3/m1/2', part: 'm1', list: 'observation', frames: [], q: 'Why?', a: null },
    ])
    expect(fx.terms).toEqual([{ frame: '3:2', k: 1, term: 'sin', text: '**sin** is' }, { frame: '3:2', k: 2, term: '', text: 'no term' }])
  })
  test('the session reads it', () => {
    expect(steps(fx, 'frames').length).toBe(2)
    expect(steps(fx, 'm1').length).toBeGreaterThan(2)
  })
})

describe('details of the conversion', () => {
  test('a part with lists and no heading of its own gets no heading row; a bare part (frames) keeps its row', () => {
    const fx = fixtureOfSession({ ...session, parts: [{ code: 'frames', lists: [] }, { code: 'm2', lists: [{ code: 'discourse', questions: [{ id: '3/m2/1', q: 'Q', frames: [302] }], terms: [] }] }] }, 'en')
    expect(fx.parts.map((p) => [p.part, p.list])).toEqual([['frames', null], ['m2', 'discourse']])
    expect(fx.questions[0]!.frames).toEqual(['3:2'])
  })
  test('a read that started before a refresh leaves nothing behind', async () => {
    let release = (_: unknown) => {}
    setSource5({ coverage: async () => new Map([[3, ['en']]]), session: () => new Promise((r) => { release = () => r(fixtureOfSession(session, 'en')) }) })
    await refresh5()
    const p = fixtureOf5(3)
    await refresh5(true)
    release(null)
    await p
    expect(fixtureNow5(3)).toBeNull()
  })
})

describe('the source', () => {
  test('no pack with the tables: no 5M', async () => {
    await fiveOn(false)
    expect([on5m(), covered5()]).toEqual([false, []])
    expect(await fixtureOf5(1)).toBeNull()
  })
  test('a source with stories: on, one story at a time, read once, language preferred', async () => {
    const asked: [number, string | null | undefined][] = []
    setSource5({
      coverage: async () => new Map([[3, ['en']], [1, ['en', 'es-419']]]),
      session: async (n, prefer) => { asked.push([n, prefer]); return n === 3 ? fixtureOfSession(session, prefer ?? 'en') : null },
    })
    expect(on5m()).toBe(false) // not before it is asked
    expect(await refresh5()).toBe(true)
    expect([on5m(), covered5()]).toEqual([true, [1, 3]])
    expect(fixtureNow5(3)).toBeNull()
    const a = await fixtureOf5(3, 'es-419')
    expect(a?.tfLang).toBe('es-419')
    expect(fixtureNow5(3)).toBe(a)
    expect(await fixtureOf5(3, 'es-419')).toBe(a)
    expect(asked.length).toBe(1)
    expect(await fixtureOf5(1)).toBeNull() // covered but the source has none: null, not a crash
  })
  test('a source that fails: nothing, and asked again next time', async () => {
    let n = 0
    setSource5({ coverage: async () => { throw new Error('x') }, session: async () => { if (n++ === 0) throw new Error('x'); return fixtureOfSession(session, 'en') } })
    expect(await refresh5()).toBe(false)
    expect(await fixtureOf5(3)).toBeNull()
    expect((await fixtureOf5(3))?.story).toBe(3)
  })
})
