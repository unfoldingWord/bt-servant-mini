// Words of a question that are not content (Hindi verb forms) and word endings that must not cross languages (Indonesian).
import { describe, expect, test } from 'bun:test'
import { keywords, stemOf } from '../src/search'

describe('Hindi question words', () => {
  test('the feminine and past forms of "say" and "tell" are not content words', () => {
    for (const w of ['कहती', 'कहतीं', 'कही', 'कहा', 'बताती', 'बताया']) expect(keywords(`यूहन्ना ${w} मरियम`)).not.toContain(w)
    expect(keywords('यूहन्ना कहती मरियम')).toEqual(['यूहन्ना', 'मरियम'])
  })
})
describe('word stems', () => {
  test('Indonesian words match whole: pintar is not pintu', () => {
    expect(stemOf('pintar', 'id')).toBeNull()
    expect(stemOf('pintu', 'id')).toBeNull()
    expect(stemOf('pintar', 'es')).toBe('pint')
    expect(stemOf('swallowing')).toBe('swallow')
  })
})
