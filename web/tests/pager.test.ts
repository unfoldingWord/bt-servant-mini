// A long answer in parts (pager.ts): how units are cut in parts and the bar's words in the six languages. Drawing it (hiding
// the other parts, the buttons, Arabic's mirrored bar) is checked in the browser at 375 px (capturas-obsui/); this suite has
// no DOM. The message's data is never touched: obswords.test.ts checks that what is shared is the whole answer.
import { describe, expect, test } from 'bun:test'
import { PART, PW, partsOf, type Unit } from '../src/pager'

const u = (len: number, label = ''): Unit => ({ els: [], len, label })
const sizes = (p: Unit[][]) => p.map((x) => x.map((y) => y.label).join(','))

describe('parts', () => {
  test('about a screen each, a unit never cut, a long unit alone', () => {
    expect(sizes(partsOf('parts', [u(400, 'a'), u(400, 'b'), u(400, 'c'), u(2000, 'd'), u(100, 'e')]))).toEqual(['a,b', 'c', 'd', 'e'])
    expect(partsOf('parts', [u(PART * 3, 'x')]).length).toBe(1)
  })
  test('verses: about three to a part (two versions are drawn one after the other)', () => {
    const v = Array.from({ length: 22 }, (_, i) => u(200, String(i + 1)))
    const p = partsOf('verses', v)
    expect(p[0]!.length).toBe(3)
    expect(p.flat().length).toBe(22)
  })
  test('frames: four at most (each has its picture)', () => {
    const f = Array.from({ length: 16 }, (_, i) => u(100, String(i + 1)))
    expect(sizes(partsOf('frames', f))[0]).toBe('1,2,3,4')
    expect(partsOf('frames', f).length).toBe(4)
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
