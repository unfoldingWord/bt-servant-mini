import { describe, expect, test } from 'bun:test'
import { loadFixture } from '../src/dev'
import { ORDER, frameLinks, jump, next, prev, sessionOfSheet, sheetOf, stepAt, stepId, steps, type Code, type Session } from '../src/obs5m'
import type { ObsFacts } from '../src/obs'

const fx = await loadFixture()
const S = (part: Code, at = 0): Session => ({ story: 1, part, at, lang: 'en', tfLang: 'en', started: 1, done: [] })
const kinds = (c: Code) => steps(fx, c).map((s) => s.kind)
const count = (c: Code) => {
  const o: Record<string, number> = {}
  for (const k of kinds(c)) o[k] = (o[k] ?? 0) + 1
  return o
}

describe('steps', () => {
  test('intro is one block per ### heading', () => {
    const st = steps(fx, 'intro')
    expect(st.map((s) => s.kind)).toEqual(['block', 'block', 'block'])
    expect(st.map((s) => s.block)).toEqual(['Key Idea', 'Creedal Verse', 'Metanarrative Summary'])
    expect(st[0]!.text).toContain('creation')
  })
  test('shared rows come from fx.shared; no ### is one block', () => {
    const st = steps(fx, 'conclusion')
    expect(st).toHaveLength(1)
    expect(st[0]!.block).toBe(fx.shared.conclusion!.title)
    expect(st[0]!.text).toBe(fx.shared.conclusion!.text)
    expect(steps(fx, 'm4').length).toBeGreaterThan(1)
    expect(steps(fx, 'community').length).toBeGreaterThan(1)
  })
  test('frames: 16 frame steps in fx.frames order', () => {
    const st = steps(fx, 'frames')
    expect(st).toHaveLength(16)
    expect(st.every((s) => s.kind === 'frame')).toBe(true)
    expect(st.map((s) => s.frame)).toEqual(fx.frames.map((f) => f.ref))
  })
  test('m1: open, 16 observation, review, 16 translation', () => {
    expect(kinds('m1')).toEqual(['m1-open', ...Array(16).fill('observation'), 'review', ...Array(16).fill('translation')])
    const st = steps(fx, 'm1')
    expect(st[0]!.block).toBe(fx.parts.find((p) => p.part === 'm1' && !p.list)!.title!)
    expect(st[0]!.intro?.title).toBe('Observation Questions')
    expect(st.filter((s) => s.kind === 'observation').flatMap((s) => s.questions)).toHaveLength(39)
    expect(st.find((s) => s.kind === 'translation')!.intro?.title).toBe('Translation Questions')
    expect(st.filter((s) => s.kind === 'translation').flatMap((s) => s.terms)).toHaveLength(fx.terms.length)
    expect(st.find((s) => s.kind === 'review')!.frame).toBeNull()
  })
  test('m2: opening block, one question step per discourse then theology question', () => {
    const st = steps(fx, 'm2')
    expect(st.map((s) => s.kind)).toEqual(['block', 'question', 'question', 'question', 'question', 'question', 'question', 'question'])
    const q = fx.questions
    expect(st.slice(1).map((s) => s.questions[0])).toEqual([...q.filter((x) => x.list === 'discourse'), ...q.filter((x) => x.list === 'theology')].map((x) => x.id))
    expect(st[5]!.frame).toBeNull()
    expect(st[1]!.intro?.title).toBe('Discourse Questions')
    expect(st[5]!.intro?.title).toBe('Theological Questions')
  })
  test('m3: block then one story-level step with the journal questions', () => {
    const st = steps(fx, 'm3')
    expect(st.map((s) => s.kind)).toEqual(['block', 'story-level'])
    expect(st[1]!.questions).toHaveLength(5)
  })
  test('drafting and checking: 16 steps each carrying the shared key', () => {
    expect(count('drafting')).toEqual({ draft: 16 })
    expect(count('checking')).toEqual({ check: 16 })
    expect(steps(fx, 'drafting')[0]!.shared).toBe('movement_2_drafting')
  })
  test('a question naming several frames sits on its first frame step', () => {
    const multi = fx.questions.find((x) => x.list === 'discourse' && x.frames.length > 1)!
    expect(steps(fx, 'm2').find((s) => s.questions[0] === multi.id)!.frame).toBe(multi.frames[0]!)
    const fx2 = { ...fx, questions: [...fx.questions, { id: 'x2', part: 'm1' as const, list: 'observation' as const, frames: ['1:3', '1:4'], q: 'q', a: null }] }
    const on = steps(fx2, 'm1').filter((s) => s.questions.includes('x2'))
    expect(on).toHaveLength(1)
    expect(on[0]!.frame).toBe('1:3')
  })
  test('frameless m1 questions go to a story-level step at the end', () => {
    const fx2 = { ...fx, questions: [...fx.questions, { id: 'x1', part: 'm1' as const, list: 'observation' as const, frames: [], q: 'q', a: null }] }
    const st = steps(fx2, 'm1')
    expect(st[st.length - 1]!.kind).toBe('story-level')
    expect(st[st.length - 1]!.questions).toEqual(['x1'])
    expect(st[st.length - 1]!.at).toBe(st.length - 1)
  })
  test('at is the index', () => {
    for (const c of ORDER) steps(fx, c).forEach((s, i) => { expect(s.at).toBe(i); expect(s.part).toBe(c) })
  })
})

describe('moving', () => {
  test('next from the last frames step goes to community 0 and marks frames done', () => {
    const n = next(fx, S('frames', 15))!
    expect([n.part, n.at]).toEqual(['community', 0])
    expect(n.done).toEqual(['frames'])
    expect(next(fx, n)!.done).toEqual(['frames'])
  })
  test('within a part no done', () => {
    const n = next(fx, S('m1', 3))!
    expect([n.part, n.at, n.done]).toEqual(['m1', 4, []])
  })
  test('prev crosses back to the last step of the previous part; null at the start', () => {
    const p = prev(fx, S('m1', 0))!
    expect(p.part).toBe('community')
    expect(p.at).toBe(steps(fx, 'community').length - 1)
    expect(prev(fx, S('intro', 0))).toBeNull()
    expect(prev(fx, S('m1', 5))!.at).toBe(4)
  })
  test('next is null at the very end', () => {
    expect(next(fx, S('conclusion', steps(fx, 'conclusion').length - 1))).toBeNull()
  })
  test('a part with no rows is skipped', () => {
    const fx2 = { ...fx, parts: fx.parts.filter((p) => p.part !== 'community') }
    expect(steps(fx2, 'community')).toEqual([])
    const n = next(fx2, S('frames', 15))!
    expect(n.part).toBe('m1')
    expect(n.done).toEqual(['frames'])
    expect(prev(fx2, S('m1', 0))!.part).toBe('frames')
  })
  test('jump clamps', () => {
    expect(jump(fx, S('intro'), 'm1').at).toBe(0)
    expect(jump(fx, S('intro'), 'm1', 999).at).toBe(steps(fx, 'm1').length - 1)
    expect(jump(fx, S('intro'), 'm1', -3).at).toBe(0)
  })
  test('stepAt is null out of range', () => {
    expect(stepAt(fx, S('m1', 999))).toBeNull()
    expect(stepAt(fx, S('m1', 0))!.kind).toBe('m1-open')
  })
})

describe('sheets', () => {
  test('stepId', () => expect(stepId(S('m1', 4))).toBe('obs5m:1/m1/4'))
  test('sheetOf refs', () => {
    const sh = sheetOf(fx, S('m1', 5), 'es')
    expect(sh.intent).toBe('obs5m')
    expect(sh.concept).toBe('obs5m:1/m1/5')
    expect(sh.ref).toBe('obs 1:5')
    expect(sh.lang).toBe('es')
    expect(sheetOf(fx, S('m1', 0), 'en').ref).toBe('obs 1')
    expect(sheetOf(fx, S('intro', 0), 'en').ref).toBe('obs 1')
  })
  test('sessionOfSheet round-trips every step', () => {
    for (const c of ORDER) for (const st of steps(fx, c)) {
      const s = S(c, st.at)
      expect(sessionOfSheet(sheetOf(fx, s, 'en'), fx, s)).toEqual(s)
    }
  })
  test('sessionOfSheet without base, and non-obs5m / bad ids', () => {
    const sh = sheetOf(fx, S('m2', 2), 'fr')
    const s = sessionOfSheet(sh, fx, null)!
    expect([s.story, s.part, s.at, s.lang, s.tfLang, s.done]).toEqual([1, 'm2', 2, 'fr', 'en', []])
    expect(sessionOfSheet({ ...sh, intent: 'passage' }, fx, null)).toBeNull()
    expect(sessionOfSheet({ ...sh, concept: 'obs5m:1/m2/99' }, fx, null)).toBeNull()
    expect(sessionOfSheet({ ...sh, concept: 'junk' }, fx, null)).toBeNull()
  })
})

describe('frameLinks', () => {
  const facts: ObsFacts = { kind: 'obs', n: 1, f: 5, title: 'T', refs: [], state: 'ok', pack: 'en', frames: 16, terms: ['bible/kt/god', 'bible/kt/heaven'] }
  test('terms, academy, then the frame ref', () => {
    expect(frameLinks({ facts, academy: ['ta:translate/figs-metaphor'] }, '1:5')).toEqual(['bible/kt/god', 'bible/kt/heaven', 'ta:translate/figs-metaphor', 'obs 1:5'])
  })
  test('null helps', () => expect(frameLinks(null, '1:5')).toEqual([]))
})
