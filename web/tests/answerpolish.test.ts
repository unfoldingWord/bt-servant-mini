// The answer polish of Nov 17 (Abel): the next steps under an answer, a few in sight and the others behind "More ▸" (about ten under Genesis 3 with
// online AI were a wall: converse.ts splitFollow, main.ts followRow); the source line in "details"; titles in the app's language.
import { describe, expect, test } from 'bun:test'
import { type Followup, splitFollow, SHOWN } from '../src/converse'

const f = (label: string, x: Partial<Followup> = {}): Followup => ({ label, ...x })
const labels = (xs: Followup[]) => xs.map((x) => x.label)

describe('the buttons in sight and behind "More ▸"', () => {
  // Genesis 3 (chapter) as Abel saw it, the way back to OBS 2 drawn above
  const gen3 = [
    f('Preguntas'), f('Palabras clave'), f('Capítulo anterior (Génesis 2)', { key: true }), f('Capítulo siguiente (Génesis 4)', { key: true }),
    f('Esta parte se cuenta en OBS 2:11', { key: true }), f('Academia: …'), f('Introducción a Génesis 3'), f('Introducción a Génesis'),
  ]
  test('the way back counted: five in sight in all, the key steps first, the rest in their order', () => {
    const { shown, more } = splitFollow(gen3, 1)
    expect(shown.length + 1).toBe(SHOWN)
    // (in their order: "Preguntas" came first, and there was room for it after the three key steps)
    expect(labels(shown)).toEqual(['Preguntas', 'Capítulo anterior (Génesis 2)', 'Capítulo siguiente (Génesis 4)', 'Esta parte se cuenta en OBS 2:11'])
    expect(labels(more)).toEqual(['Palabras clave', 'Academia: …', 'Introducción a Génesis 3', 'Introducción a Génesis'])
  })
  test('the order of the buttons in sight is the order they came in', () => {
    const { shown } = splitFollow([f('a'), f('b'), f('c', { key: true }), f('d'), f('e'), f('g'), f('h')], 0)
    expect(labels(shown)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
  test("a path's next step, a unit to add and try again are always in sight", () => {
    const xs = [f('a'), f('b'), f('c'), f('d'), f('e'), f('next', { pathNext: true }), f('add', { add: { lang: 'es-419', unit: 'obs' } })]
    const { shown, more } = splitFollow(xs, 2)
    expect(labels(shown)).toEqual(['a', 'next', 'add'])
    expect(labels(more)).toEqual(['b', 'c', 'd', 'e'])
  })
  test('few buttons: all in sight; one alone behind "More ▸" is shown instead', () => {
    expect(splitFollow([f('a'), f('b'), f('c')], 1).more).toEqual([])
    expect(splitFollow([f('a'), f('b'), f('c'), f('d'), f('e')], 1).more).toEqual([])
    expect(splitFollow([f('a'), f('b'), f('c'), f('d'), f('e'), f('g')], 1).more.length).toBe(2)
  })
  test('many ways back: at least three next steps in sight', () => {
    expect(splitFollow([f('a'), f('b'), f('c'), f('d'), f('e')], 3).shown.length).toBe(3)
  })
})

describe('the source line goes into "details" (Abel, Nov 17)', () => {
  test('recognized in the six languages, not an ordinary line', async () => {
    const { isSourceLine } = await import('../src/answer')
    for (const t of ['Source: unfoldingWord/en/tn v91.', 'Fuente: es-419_gl/es-419/obs v2, es-419_gl/es-419/obs-tn v2.', 'Source : x v1.', 'Sumber: x v1.', 'स्रोत: x v1।', 'المصدر: x v1.'])
      expect(isSourceLine(t), t).toBe(true)
    for (const t of ['Translation Notes v91 — Nehemías', 'Fuentes de agua en el desierto', 'The source of the river']) expect(isSourceLine(t), t).toBe(false)
  })
})

describe("a story's title without its number (Abel, Nov 17: \"OBS 2:11: ٢. …\" in Arabic)", () => {
  test('in any digits', async () => {
    const { cleanTitle } = await import('../src/obs')
    expect(cleanTitle('3. The Flood')).toBe('The Flood')
    expect(cleanTitle('٢. دخول الخطية إلى العالم')).toBe('دخول الخطية إلى العالم')
    expect(cleanTitle('२. पाप का संसार में प्रवेश')).toBe('पाप का संसार में प्रवेश')
    expect(cleanTitle('2 Kings')).toBe('2 Kings')
  })
})
describe("the packs in the app's language", () => {
  test('"es" finds "es-419"; another language none', async () => {
    const { uiLangs } = await import('../src/packs')
    expect(uiLangs('es', ['en', 'es-419', 'ar'])).toEqual(['es-419'])
    expect(uiLangs('ar', ['en', 'es-419', 'ar'])).toEqual(['ar'])
    expect(uiLangs('fr', ['en', 'es-419'])).toEqual([])
  })
})
