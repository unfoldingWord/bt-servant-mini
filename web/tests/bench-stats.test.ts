// stats() of the map bench (web/bench/scenes.ts): min, median, p90 (nearest rank), max and n; a value that is not a number is left out.
import { describe, expect, test } from 'bun:test'
import { stats } from '../bench/scenes'

describe('bench stats', () => {
  test('ten samples: min, median of the middle two, p90 is the 9th, max, n', () => {
    expect(stats([10, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual({ n: 10, min: 1, median: 5.5, p90: 9, max: 10 })
  })
  test('an odd count takes the middle one; one sample is all four', () => {
    expect(stats([3, 1, 2])).toEqual({ n: 3, min: 1, median: 2, p90: 3, max: 3 })
    expect(stats([4.5])).toEqual({ n: 1, min: 4.5, median: 4.5, p90: 4.5, max: 4.5 })
  })
  test('nulls and NaN are left out of n (a metric with fewer samples is visible); nothing at all is null', () => {
    expect(stats([1, null as any, NaN, 3])?.n).toBe(2)
    expect(stats([])).toBeNull()
    expect(stats([null as any])).toBeNull()
  })
  test('values are rounded to 0.01 ms', () => {
    expect(stats([1.23456])?.min).toBe(1.23)
  })
})
