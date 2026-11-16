// User reports of Nov 15-16 (cases in cases/reports.jsonl, "r4-…"): the pieces of code that read them.
import { beforeAll, describe, expect, test } from 'bun:test'
import { answer, codeReads, type ConvState, env, questionOf, readQuestion, storyWords, strayTerm } from '../src/pipeline'
import type { Sheet } from '../src/answer'
import { fullPhone, turn } from './harness'

beforeAll(async () => {
  await fullPhone()
  env.helpsLang = null
}, 120_000)

describe('a story in a book: the words beyond the book (storyWords)', () => {
  test('a story has words of its own', () => {
    expect(storyWords('Daniel en el foso de los leones', 'dan')).toEqual(['foso', 'leones'])
    expect(storyWords('Jonah and the big fish', 'jon')).toEqual(['big', 'fish'])
    expect(storyWords('Juan amor', 'jhn')).toEqual(['amor'])
  })
  test('the book alone, or asked for, has none', () => {
    for (const [q, code] of [['Daniel', 'dan'], ['el libro de Daniel', 'dan'], ['Lee Daniel', 'dan'], ['Leer el libro de Daniel', 'dan'],
      ['Read the whole book of Ruth', 'rut'], ['Muéstrame Daniel', 'dan'], ['Introducción a Daniel', 'dan'], ['la historia de Rut', 'rut'],
      ['Lis Daniel', 'dan'], ['Baca kitab Daniel', 'dan'], ['1 Juan', '1jn'], ['Cantar de los Cantares', 'sng'],
      // review of d9d33b3: ways of asking for the book, and names of several words
      ['Quiero leer Rut', 'rut'], ['I want to read Ruth', 'rut'], ['¿Puedes mostrarme Rut?', 'rut'], ['How many chapters in Ruth', 'rut'],
      ['¿Cuántos capítulos tiene Rut?', 'rut'], ['Primera carta a los Corintios', '1co'], ['Hechos de los apóstoles', 'act'],
      ['Evangelio de Juan', 'jhn'], ['Gospel of John', 'jhn'], ['Carta a los Romanos', 'rom'], ['Primera de Juan', '1jn'],
      ['Cantar de los Cantares de Salomón', 'sng'], ['Kisah Para Rasul', 'act']] as const)
      expect(storyWords(q, code), q).toEqual([])
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
      ['Bisa katakan itu dalam bahasa Inggris?', 'en'], ['क्या आप इसे अंग्रेज़ी में बता सकते हैं?', 'en'], ['هل يمكنك أن تقولها بالإنجليزية؟', 'en'],
      ['¿Me lo repites en inglés?', 'en'], ['Repíteme en inglés', 'en'], ['¿Me lo dices en inglés?', 'en'], ['¿Me lo das en inglés?', 'en'],
      ['¿Me lo explicas en inglés?', 'en'], ['Explícalo en inglés', 'en'], ['Explain it in English', 'en'],
      ['Can you explain that in English?', 'en'], ['Explique-le en anglais', 'en'], ['Redis-le en anglais', 'en']] as const)
      expect(after('¿Qué se entiende por paz?', q), q).toEqual({ q: '¿Qué se entiende por paz?', target })
  })
  test('a question of its own is read as asked, its helps in that language', () => {
    expect(after('Rut 2:3', 'y las notas en inglés?')).toEqual({ q: 'y las notas?', target: 'en' })
    expect(after('Rut 2:3', '¿Qué significa paz en inglés?')).toEqual({ q: '¿Qué significa paz?', target: 'en' })
    expect(after('Rut 2:3', "How do I translate 'Spirit' into English?").q).toBe("How do I translate 'Spirit'?")
    expect(after('Rut 2:3', '¿Cómo se dice gracia en inglés?').q).toBe('¿Cómo se dice gracia?')
  })
  test('the repeat keeps the question it repeats', () => {
    const c: ConvState = { last: null }
    questionOf('¿Qué se entiende por paz?', c)
    questionOf('¿Me lo puedes decir en inglés?', c)
    expect(questionOf('¿Puedes decirlo en español?', c).q).toBe('¿Qué se entiende por paz?')
  })
})

describe('the repeat is what was answered (review of d9d33b3)', () => {
  test('a follow-up is not moved again: "¿y el siguiente versículo?" then "en inglés" stays on Ruth 2:4', async () => {
    const c: ConvState = { last: null }
    await turn(c, { q: 'Rut 2:3', slots: null }, 'es')
    await turn(c, { q: '¿y el siguiente versículo?', slots: null }, 'es')
    const { q, target } = questionOf('en inglés', c)
    expect(codeReads(q, c)).toBe(true) // no reader runs
    const made = await readQuestion(q, { slots: null, raw: '', ms: 0 }, c, target)
    expect(made.sheet.ref).toBe('rut 2:4')
    expect(made.sheet.lang).toBe('en')
    expect(made.ui).toBe('es')
  }, 60_000)
  test('after a button: its sheet again, from the pack asked for', async () => {
    env.nav = 'es'
    const c: ConvState = { last: null }
    await turn(c, { q: 'Rut 2:3', slots: null }, 'es')
    const button: Sheet = { id: 'b', intent: 'article', ref: null, what: [], version: null, concept: 'tw:kt/faith', term: null, phrase: null, candidates: null, lang: 'es-419' }
    await answer(c, { sheet: button, ui: 'es', meta: '' }, performance.now())
    const { q, target } = questionOf('¿Me lo puedes decir en inglés?', c)
    const made = await readQuestion(q, { slots: null, raw: '', ms: 0 }, c, target)
    expect(made.sheet.concept).toBe('tw:kt/faith')
    expect(made.sheet.lang).toBe('en')
    expect(made.q).toBeUndefined()
    expect(made.ui).toBe('es')
  }, 60_000)
})

describe('an article the question does not name (strayTerm)', () => {
  const c: ConvState = { last: null }
  const art = (term: string, more = {}) => ({ intent: 'article', term, lang: 'es', ...more })
  test('not named: stray', async () => {
    expect(await strayTerm(art('metáfora'), 'Puedes decirlo', c)).toBe(true)
    expect(await strayTerm(art('metáfora'), '¿Me ayudas con esto?', c)).toBe(true)
  }, 60_000)
  test('named, or a form of it: kept', async () => {
    expect(await strayTerm(art('metáfora'), '¿Qué son las metáforas?', c)).toBe(false)
    expect(await strayTerm(art('concubina'), 'Ester concubinas', c)).toBe(false)
    expect(await strayTerm(art('gracia'), '¿Qué significa gracia?', c)).toBe(false)
    expect(await strayTerm(art('paz'), '¿Qué se entiende por paz?', c)).toBe(false)
    expect(await strayTerm(art('अनुग्रह'), 'अनुग्रह का क्या अर्थ है?', c)).toBe(false)
  }, 60_000)
  test('named in another language: kept (review of d9d33b3)', async () => {
    expect(await strayTerm(art('ark of the covenant'), 'Háblame del arca del pacto', c)).toBe(false)
    expect(await strayTerm(art('grace', { lang: 'ar' }), 'ما هي النعمة؟', c)).toBe(false)
    expect(await strayTerm(art('synecdoche'), '¿Qué es una sinécdoque?', c)).toBe(false)
    expect(await strayTerm(art('hyperbole'), '¿Qué es una hipérbole?', c)).toBe(false)
  }, 60_000)
  test('only a bare article reading: a passage, a book or another language keep their term', async () => {
    expect(await strayTerm({ intent: 'advice', term: 'metafora', lang: 'id' }, 'Apa maksud ungkapan ini?', c)).toBe(false)
    expect(await strayTerm(art('gracia', { book: 'Rut' }), 'Rut 2', c)).toBe(false)
    expect(await strayTerm(art('grace', { other_language: 'en' }), '¿Cómo se dice en inglés?', c)).toBe(false)
  })
  test("the conversation's term: kept", async () => {
    const st: ConvState = { last: null, state: { s: { intent: 'article', term: 'paz' }, at: Date.now() } }
    expect(await strayTerm(art('paz'), '¿Y qué más dicen?', st)).toBe(false)
  })
})
