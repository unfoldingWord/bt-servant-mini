// A long answer in parts (pager.ts): how units are cut in parts by their measured height and the bar's words in the six languages. Drawing it (hiding
// the other parts, the buttons, Arabic's mirrored bar) is checked in the browser at 375 px (capturas-obsui/); this suite has
// no DOM. The message's data is never touched: obswords.test.ts checks that what is shared is the whole answer.
import { describe, expect, test } from 'bun:test'
import { atOnPage, groupBlocks, PW, pagesOf } from '../src/pager'

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

describe('the blocks of an answer in units', () => {
  const b = (s: string) => s.split(' ').map((x) => ({ tag: x.split(':')[0]!, len: +x.split(':')[1]! }))
  test('a heading goes with what follows it, several headings in a row too', () => {
    expect(groupBlocks(b('P:300 H5:20 P:400 P:300'))).toEqual([[0], [1, 2], [3]])
    expect(groupBlocks(b('H5:20 H5:25 H5:20 OL:900 P:300'))).toEqual([[0, 1, 2, 3], [4]])
  })
  test("the answer's title and its source line never make a part alone (Abel, Nov 17: Nehemiah's introduction, part 1 empty)", () => {
    // "#### Nehemías" + "Translation Notes v91 — Nehemías", then "Introduction to Nehemiah" / "Part 1" / "Outline" + the outline
    const units = groupBlocks(b('H4:8 P:36 H5:28 H5:28 H5:19 OL:2400 H5:30 P:500 P:30'))
    expect(units[0]).toEqual([0, 1, 2, 3, 4, 5])
    // measured: the title is in the first part with the outline (a part is at least one unit, never cut)
    expect(pagesOf([16 + 22 + 1800, 400], 650)).toEqual([[0], [1]])
  })
  test('a heading with a paragraph of its own is a unit; what follows starts another', () => {
    expect(groupBlocks(b('H5:20 P:400 H5:20 P:400'))).toEqual([[0, 1], [2, 3]])
  })
})

describe("the helps below the bar: only the part's (Abel, Nov 17)", () => {
  test("a verse's notes with the part that holds the verse, a bridge \"4-5\" too; a frame's with its frame", () => {
    expect(atOnPage('verses', ['2', '3'], '3:2')).toBe(true)
    expect(atOnPage('verses', ['2', '3'], '3:4')).toBe(false)
    expect(atOnPage('verses', ['4-5'], '3:5')).toBe(true)
    expect(atOnPage('frames', ['2', '3'], '1:3')).toBe(true)
    expect(atOnPage('frames', ['2', '3'], '1:13')).toBe(false)
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
