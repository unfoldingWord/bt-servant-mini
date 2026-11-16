import { describe, expect, test } from 'bun:test'
import { has } from '../src/commands'
import { ORDER, type StepKind } from '../src/obs5m'
import { W5 } from '../src/obs5mwords'

const LANGS = ['en', 'es', 'fr', 'hi', 'id', 'ar']
const KINDS: StepKind[] = ['block', 'frame', 'm1-open', 'observation', 'review', 'translation', 'question', 'draft', 'check', 'story-level']
// the parts the manual gives no duration for: '' is allowed there (and only there)
const NO_DURATION = ['intro', 'frames', 'community', 'drafting', 'checking', 'm5', 'conclusion']

/** Every string of the words with its path ("kinds.frame"), and the placeholders it holds */
function flat(o: unknown, path = ''): [string, string][] {
  if (typeof o === 'string') return [[path, o]]
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, path ? `${path}.${k}` : k))
}
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

describe('W5 words', () => {
  const en = flat(W5('en'))
  test('english has every key the plan names', () => {
    const keys = new Set(en.map(([p]) => p.split('.')[0]))
    for (const k of ['parts', 'kinds', 'place', 'bar', 'next', 'back', 'resume', 'show', 'hide', 'reviewOffer', 'reviewSkip', 'knew', 'revisit',
      'understood', 'confusing', 'outline', 'how', 'end', 'inLang', 'noSession', 'durations', 'helps', 'start']) expect(keys.has(k)).toBe(true)
    expect(Object.keys(W5('en').parts)).toEqual([...ORDER])
    expect(Object.keys(W5('en').kinds).sort()).toEqual([...KINDS].sort())
    expect(Object.keys(W5('en').helps).sort()).toEqual(['academy', 'passage', 'sn', 'sq', 'tn', 'tq', 'twl'])
    expect(W5('en').place).toBe('{part} · {kind} · frame {n}/{of}')
  })
  for (const l of LANGS) {
    test(`${l}: same keys, non-empty, same placeholders as english`, () => {
      const w = flat(W5(l))
      expect(w.map(([p]) => p)).toEqual(en.map(([p]) => p))
      for (const [i, [p, s]] of w.entries()) {
        if (p.startsWith('durations.') && NO_DURATION.includes(p.slice(10))) { expect(s).toBe(''); continue }
        expect(s.trim().length, `${l} ${p}`).toBeGreaterThan(0)
        expect(holes(s), `${l} ${p}`).toBe(holes(en[i]![1]))
      }
    })
  }
  test('the four timed parts have a duration; the others have none', () => {
    expect(W5('en').durations).toMatchObject({ m1: 'about 150 min', m2: '3–4 h', m3: 'about 60 min', m4: '60–90 min' })
    for (const c of NO_DURATION) expect((W5('en').durations as Record<string, string>)[c]).toBe('')
  })
  test('an unknown language reads as english', () => expect(W5('xx')).toBe(W5('en')))
})

describe("has('obs5m')", () => {
  const yes = ['5M OBS 1', 'five movements story 1', 'cinco movimientos OBS 1', 'cinq mouvements histoire 1', 'lima gerakan OBS 1',
    'पाँच आंदोलन OBS 1', 'الحركات الخمس OBS 1', 'start a 5M session on OBS 1']
  for (const q of yes) test(`true: ${q}`, () => expect(has('obs5m', q)).toBe(true))
  for (const q of ['OBS 1', 'story 1', 'I need 15M of rope', 'a 5mm bolt', 'frame 1:5', 'five stories 1'])
    test(`false: ${q}`, () => expect(has('obs5m', q)).toBe(false))
})
