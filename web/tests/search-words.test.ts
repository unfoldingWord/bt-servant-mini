// Words of a question that are not content (Hindi verb forms) and word endings that must not cross languages (Indonesian).
import { describe, expect, test } from 'bun:test'
import { keywords, stemOf, termsFor } from '../src/search'

describe('Hindi question words', () => {
  test('the feminine and past forms of "say" and "tell" are not content words', () => {
    for (const w of ['कहती', 'कहतीं', 'कही', 'कहा', 'बताती', 'बताया']) expect(keywords(`यूहन्ना ${w} मरियम`)).not.toContain(w)
    expect(keywords('यूहन्ना कहती मरियम')).toEqual(['यूहन्ना', 'मरियम'])
  })
})
describe('word stems', () => {
  test('Indonesian words are not cut by Spanish or English endings: pintar is not pintu', () => {
    expect(stemOf('pintar', 'id')).toBe('pintar')
    expect(stemOf('pintu', 'id')).toBe('pintu')
    expect(stemOf('Goliat', 'id')).toBe('goliat') // still a prefix of Goliath
    expect(stemOf('pintar', 'es')).toBe('pint')
    expect(stemOf('swallowing')).toBe('swallow')
  })
})

describe('terms of a question', () => {
  test('an Indonesian word searched in the English pack keeps the English endings of its translation; raw Indonesian words stay whole', () => {
    const t = termsFor(['pintar', 'tuhan'], [], 'en', 'id', new Map())
    const raw = t.find((x) => x.label === 'pintar')!.term
    expect(raw.prefixes).toEqual(['pintar'])
    const sea = termsFor(['menelan'], [], 'en', 'id', new Map()).find((x) => x.label === 'menelan')!.term
    // when the word has an English translation, its stem is the translation's (swallow), as for any other language
    if (sea.words?.some((w) => w !== 'menelan')) expect((sea.prefixes ?? []).length).toBeGreaterThan(0)
    const es = termsFor(['tragar'], [], 'en', 'es', new Map()).find((x) => x.label === 'tragar')!.term
    expect((es.prefixes ?? []).length).toBeGreaterThan(0)
  })
})
