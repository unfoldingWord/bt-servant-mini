// Follow-ups grouped by type (followtype.ts): the type comes from the fields a button already has, so saved ones still sort.
import { describe, expect, test } from 'bun:test'
import type { Followup } from '../src/converse'
import { FOLLOW_ICONS, FOLLOW_TYPES, followIcon, followTitle, followType, groupByType, layoutFollow, sortByType } from '../src/followtype'
import { splitFollow } from '../src/converse'

const sh = (intent: string, what: string[] = [], extra: object = {}) =>
  ({ id: '', intent, ref: null, what, version: null, concept: null, term: null, phrase: null, candidates: null, lang: 'en', ...extra }) as NonNullable<Followup['sheet']>
const b = (label: string, f: Partial<Followup> = {}): Followup => ({ label, ...f })

describe('followType', () => {
  test('each field maps to its type', () => {
    expect(followType(b('next', { pathNext: true }))).toBe('continue')
    expect(followType(b('next', { sessionNext: true }))).toBe('continue')
    expect(followType(b('back', { back: 'n1' }))).toBe('continue')
    expect(followType(b('path', { toPath: true }))).toBe('continue')
    expect(followType(b('session', { toSession: true }))).toBe('continue')
    expect(followType(b('again', { again: { q: 'x' } }))).toBe('continue')
    expect(followType(b('add', { add: { lang: 'id', unit: 'obs' }, sheet: sh('passage', ['text']) }))).toBe('continue')
    expect(followType(b('Ruth 1', { sheet: sh('passage', ['text', 'notes']) }))).toBe('read')
    expect(followType(b('Ruth 1', { sheet: sh('passage') }))).toBe('read')
    expect(followType(b('Notes', { sheet: sh('passage', ['notes']) }))).toBe('understand')
    expect(followType(b('story', { sheet: sh('obs5m') }))).toBe('read')
    expect(followType(b('Gen', { browse: { book: 'gen' } }))).toBe('read')
    expect(followType(b('Stories', { browse: { obs: true } }))).toBe('read')
    expect(followType(b('Manual', { browse: { manual: 'translate' } }))).toBe('understand')
    expect(followType(b('Zion', { sheet: sh('article', [], { concept: 'tw:names/zion' }) }))).toBe('understand')
    expect(followType(b('Elimelech', { sheet: sh('kin', ['card']) }))).toBe('people')
    expect(followType(b('Map', { sheet: sh('place', ['map']) }))).toBe('places')
    expect(followType(b('How to ask', { howto: true }))).toBe('actions')
    expect(followType(b('5M OBS 1', { typed: '5M OBS 1' }))).toBe('actions')
  })
  test('an unknown or odd button is an action and never throws', () => {
    expect(followType(b('x'))).toBe('actions')
    expect(followType(b('x', { sheet: sh('mystery') }))).toBe('actions')
    expect(followType({ label: 'x', sheet: { intent: 'passage', what: null } } as unknown as Followup)).toBe('read')
    expect(followType(null as unknown as Followup)).toBe('actions')
    expect(followType({ label: 'x', browse: null, sheet: 5 } as unknown as Followup)).toBe('actions')
  })
})

describe('order', () => {
  const list = [
    b('Add', { add: { lang: 'id', unit: 'obs' } }), b('Place', { sheet: sh('place') }), b('Art1', { sheet: sh('article') }),
    b('Psa', { sheet: sh('passage', ['text']) }), b('Next', { pathNext: true }), b('Kin', { sheet: sh('kin') }),
    b('Art2', { sheet: sh('article') }), b('Luk', { sheet: sh('passage', ['text']) }), b('Guide', { howto: true }),
  ]
  test('by type, and in the order they came inside a type', () => {
    expect(sortByType(list).map((x) => x.label)).toEqual(['Add', 'Next', 'Psa', 'Luk', 'Art1', 'Art2', 'Kin', 'Place', 'Guide'])
  })
  test('the input is not changed', () => {
    const before = list.map((x) => x.label)
    sortByType(list)
    expect(list.map((x) => x.label)).toEqual(before)
  })
  test('groups, in the order of the types', () => {
    expect(groupByType(list).map((g) => [g.type, g.items.length])).toEqual([['continue', 2], ['read', 2], ['understand', 2], ['people', 1], ['places', 1], ['actions', 1]])
    expect(groupByType([])).toEqual([])
  })
  test('what is in sight keeps the next step, the way back and "again" (they never go behind More)', () => {
    const many = [...list, b('Again', { again: { q: 'x' } }), b('Back', { back: 'n' })]
    const { shown, groups } = layoutFollow(many, 1)
    const names = shown.map((x) => x.label)
    for (const k of ['Next', 'Again', 'Back']) expect(names).toContain(k)
    expect(shown.length + groups.reduce((n, g) => n + g.items.length, 0)).toBe(many.length)
    // the types stay in order in what is shown
    const ty = shown.map((x) => FOLLOW_TYPES.indexOf(followType(x)))
    expect(ty).toEqual([...ty].sort((a, c) => a - c))
  })
})

describe('titles and icons', () => {
  test('every type has a title in every language, and an icon; no emoji', () => {
    for (const ui of ['en', 'es', 'fr', 'id', 'hi', 'ar', 'es-419', 'zz']) {
      for (const t of FOLLOW_TYPES) expect(followTitle(ui, t).length).toBeGreaterThan(0)
    }
    expect(followTitle('es', 'continue')).toBe('Continuar')
    expect(followTitle('zz', 'places')).toBe('Places')
    for (const t of FOLLOW_TYPES) {
      expect(FOLLOW_ICONS[t]).toBeTruthy()
      const s = followIcon(t)
      expect(s).toContain('aria-hidden="true"')
      expect(s).not.toMatch(/\p{Extended_Pictographic}/u)
    }
  })
})

describe('layoutFollow (what followRow draws)', () => {
  const many = [
    b('Add', { add: { lang: 'id', unit: 'obs' } }), b('Place', { sheet: sh('place') }), b('Art1', { sheet: sh('article') }),
    b('Psa', { sheet: sh('passage', ['text']) }), b('Next', { pathNext: true }), b('Kin', { sheet: sh('kin') }),
    b('Art2', { sheet: sh('article'), key: true }), b('Luk', { sheet: sh('passage', ['text']) }), b('Guide', { howto: true }),
    b('Again', { again: { q: 'x' } }),
  ]
  test('the buttons in sight are the same set splitFollow always chose; only their order changes', () => {
    for (const backs of [0, 1, 2, 3]) {
      const old = splitFollow(many, backs)
      const lay = layoutFollow(many, backs)
      expect(new Set(lay.shown)).toEqual(new Set(old.shown))
      expect(lay.shown.length).toBe(old.shown.length)
      expect(new Set(lay.groups.flatMap((g) => g.items))).toEqual(new Set(old.more))
    }
  })
  test('a short list has nothing behind More', () => {
    expect(layoutFollow(many.slice(0, 3), 0).groups).toEqual([])
  })
  test('the first group has no title when it is the type of the last button in sight', () => {
    const l = [b('R1', { sheet: sh('passage', ['text']) }), b('R2', { sheet: sh('passage', ['text']) }), b('R3', { sheet: sh('passage', ['text']) }),
      b('R4', { sheet: sh('passage', ['text']) }), b('R5', { sheet: sh('passage', ['text']) }), b('R6', { sheet: sh('passage', ['text']) }), b('K', { sheet: sh('kin') })]
    const lay = layoutFollow(l, 0)
    expect(followType(lay.shown[lay.shown.length - 1]!)).toBe('read')
    expect(lay.groups.map((g) => [g.type, g.title])).toEqual([['read', false], ['people', true]])
  })
  test('back "" is not a way back (like splitFollow and the click)', () => {
    expect(followType(b('x', { back: '', sheet: sh('passage', ['text']) }))).toBe('read')
  })
})
