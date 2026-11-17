// A long answer in parts (pager.ts): how units are cut in parts by their measured height and the bar's words in the six languages. Drawing it (hiding
// the other parts, the buttons, Arabic's mirrored bar) is checked in the browser at 375 px (capturas-obsui/); this suite has
// no DOM. The message's data is never touched: obswords.test.ts checks that what is shared is the whole answer.
import { describe, expect, test } from 'bun:test'
import { PW, pagesOf } from '../src/pager'

describe('parts by measured height', () => {
  test('as many units as fit in the room, at least one, a unit never cut', () => {
    expect(pagesOf([300, 300, 300, 1200, 100], 650)).toEqual([[0, 1], [2], [3], [4]])
    // one unit taller than the screen (a picture in landscape) is a part alone
    expect(pagesOf([2000], 650)).toEqual([[0]])
    expect(pagesOf([], 650)).toEqual([])
  })
  test('measured again from the unit being read: a part starts there', () => {
    // 6 frames of 300 px in 650: two by two; the reader at frame 4 (index 3), the phone turned
    expect(pagesOf(Array(6).fill(300), 650, 3)).toEqual([[0, 1], [2], [3, 4], [5]])
  })
  test('a fold opened in the part being read: it keeps its units, the others follow', () => {
    // unit 1 grew to 600 px: without `keep` it would go to the next part
    expect(pagesOf([300, 600, 300, 300], 650, 0)).toEqual([[0], [1], [2, 3]])
    expect(pagesOf([300, 600, 300, 300], 650, 0, 1)).toEqual([[0, 1], [2, 3]])
  })
})

describe("the bar's words", () => {
  test('in the six languages, every template with its numbers; another language reads English', () => {
    const en = PW('en')
    for (const l of ['en', 'es', 'fr', 'id', 'hi', 'ar']) {
      const w = PW(l)
      for (const k of Object.keys(en) as (keyof typeof en)[]) {
        expect(w[k].length, `${l} ${k}`).toBeGreaterThan(0)
        for (const slot of en[k].match(/\{\w+\}/g) ?? []) expect(w[k], `${l} ${k}`).toContain(slot)
      }
      if (l !== 'en') expect(w.verses).not.toBe(en.verses)
    }
    expect(PW('es-419').verses).toBe(PW('es').verses)
    expect(PW('pt').verses).toBe(en.verses)
  })
})
