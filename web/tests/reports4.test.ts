// User reports of Nov 15-16 (cases in cases/reports.jsonl, "r4-…"): the pieces of code that read them.
import { describe, expect, test } from 'bun:test'
import { type ConvState, questionOf, storyWords, strayTerm } from '../src/pipeline'

describe('a story in a book: the words beyond the book (storyWords)', () => {
  test('a story has words of its own', () => {
    expect(storyWords('Daniel en el foso de los leones')).toEqual(['foso', 'leones'])
    expect(storyWords('Jonah and the big fish')).toEqual(['big', 'fish'])
  })
  test('the book alone, or asked for, has none', () => {
    for (const q of ['Daniel', 'el libro de Daniel', 'Lee Daniel', 'Leer el libro de Daniel', 'Read the whole book of Ruth', 'Muéstrame Daniel',
      'Introducción a Daniel', 'la historia de Rut', 'Lis Daniel', 'Baca kitab Daniel', '1 Juan', 'Cantar de los Cantares'])
      expect(storyWords(q)).toEqual([])
  })
})

describe('"say it in English": the last question again (questionOf)', () => {
  const after = (prev: string, q: string) => {
    const c: ConvState = { last: null }
    questionOf(prev, c)
    return questionOf(q, c)
  }
  test('only the request, in the six languages', () => {
    for (const [q, target] of [['¿Me lo puedes decir en inglés?', 'en'], ['¿Puedes decirlo en inglés?', 'en'], ['Dímelo en inglés', 'en'],
      ['en inglés', 'en'], ['Can you say that in Spanish?', 'es'], ['In English please', 'en'], ['Tu peux me le dire en anglais ?', 'en'],
      ['Bisa katakan itu dalam bahasa Inggris?', 'en'], ['क्या आप इसे अंग्रेज़ी में बता सकते हैं?', 'en'], ['هل يمكنك أن تقولها بالإنجليزية؟', 'en']] as const)
      expect(after('¿Qué se entiende por paz?', q)).toEqual({ q: '¿Qué se entiende por paz?', target })
  })
  test('a question of its own is read as asked, its helps in that language', () => {
    expect(after('Rut 2:3', 'y las notas en inglés?')).toEqual({ q: 'y las notas?', target: 'en' })
    expect(after('Rut 2:3', '¿Qué significa paz en inglés?')).toEqual({ q: '¿Qué significa paz?', target: 'en' })
  })
  test('the repeat keeps the question it repeats', () => {
    const c: ConvState = { last: null }
    questionOf('¿Qué se entiende por paz?', c)
    questionOf('¿Me lo puedes decir en inglés?', c)
    expect(questionOf('¿Puedes decirlo en español?', c).q).toBe('¿Qué se entiende por paz?')
  })
})

describe('an article the question does not name (strayTerm)', () => {
  const c: ConvState = { last: null }
  const art = (term: string, more = {}) => ({ intent: 'article', term, lang: 'es', ...more })
  test('not named: stray', () => {
    expect(strayTerm(art('metáfora'), 'Puedes decirlo', c)).toBe(true)
    expect(strayTerm(art('metáfora'), '¿Me ayudas con esto?', c)).toBe(true)
  })
  test('named, or a form of it: kept', () => {
    expect(strayTerm(art('metáfora'), '¿Qué son las metáforas?', c)).toBe(false)
    expect(strayTerm(art('concubina'), 'Ester concubinas', c)).toBe(false)
    expect(strayTerm(art('gracia'), '¿Qué significa gracia?', c)).toBe(false)
    expect(strayTerm(art('paz'), '¿Qué se entiende por paz?', c)).toBe(false)
    expect(strayTerm(art('अनुग्रह'), 'अनुग्रह का क्या अर्थ है?', c)).toBe(false)
  })
  test('only a bare article reading: a passage, a book or another language keep their term', () => {
    expect(strayTerm({ intent: 'advice', term: 'metafora', lang: 'id' }, 'Apa maksud ungkapan ini?', c)).toBe(false)
    expect(strayTerm(art('gracia', { book: 'Rut' }), 'Rut 2', c)).toBe(false)
    expect(strayTerm(art('grace', { other_language: 'en' }), '¿Cómo se dice en inglés?', c)).toBe(false)
  })
  test("the conversation's term: kept", () => {
    const st: ConvState = { last: null, state: { s: { intent: 'article', term: 'paz' }, at: Date.now() } }
    expect(strayTerm(art('paz'), '¿Y qué más dicen?', st)).toBe(false)
  })
})
