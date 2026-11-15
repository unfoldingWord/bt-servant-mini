// pickFound: an ordinal picks an earlier search result only when the question is just that pick (report of Nov 14:
// "What book of the Bible should I translate first?" showed Galatians 3:3, the first hit of an earlier search).
import { test, expect } from 'bun:test'
import { pickFound, type ConvState } from '../src/pipeline'

const found = [{ book: 'gal', ch: 3, v: 3 }, { book: 'jon', ch: 1, v: 17 }, { book: 'rut', ch: 2, v: 3 }, { book: 'tit', ch: 1, v: 5 }]
const conv = (): ConvState => ({ last: { id: 'x', intent: 'passage', ref: 'gal 3:3', what: ['text'], version: null, concept: null, term: null, phrase: null, candidates: null, lang: 'en' }, found })
const slots = { intent: 'unknown', lang: 'en' }

const picks: [string, number, string[]][] = [
  ['the first one', 0, ['text', 'notes']], ['The first one please', 0, ['text', 'notes']], ['el segundo', 1, ['text', 'notes']],
  ['show me the third', 2, ['text', 'notes']], ['notes on the second', 1, ['notes']], ['muéstrame el primero', 0, ['text', 'notes']],
  ['y las notas del segundo resultado', 1, ['notes']], ['le deuxième', 1, ['text', 'notes']], ['yang kedua', 1, ['text', 'notes']],
  ['दूसरा', 1, ['text', 'notes']], ['الثاني', 1, ['text', 'notes']], ['questions for the fourth', 3, ['questions']],
  ['what is the first one?', 0, ['text', 'notes']], ['Can I see the second?', 1, ['text', 'notes']], ['¿Cuál es el tercero?', 2, ['text', 'notes']],
]
for (const [q, i, what] of picks)
  test(`pick: ${q}`, () => {
    const r = pickFound(q, slots, conv())
    expect(r?.hit).toEqual(found[i]!)
    expect(r?.what).toEqual(what)
  })

for (const q of ['What book of the Bible should I translate first?', 'Who was the first king of Israel?', '¿Qué libro debo traducir primero?',
  'Which book should a new translation team start with first?', 'पहले कौन सी पुस्तक का अनुवाद करें?', 'the first verse', 'el segundo versículo',
  'What is the first book?'])
  test(`not a pick: ${q}`, () => {
    expect(pickFound(q, slots, conv())).toBeNull()
  })

test('"and the questions?" stays on the last verse', () => {
  expect(pickFound('and the questions?', slots, conv())).toEqual({ hit: { book: 'gal', ch: 3, v: 3 }, what: ['questions'] })
})
