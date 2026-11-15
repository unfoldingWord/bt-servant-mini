// The language of a question when no reader says it (no model yet, offline): a translator's own words count too.
import { expect, test } from 'bun:test'
import { guessLang } from '../src/pipeline'

const CASES: [string, string][] = [
  ['Voy a empezar a traducir Jonás', 'es'],
  ['Quiero traducir el libro de Rut', 'es'],
  ['¿Cómo debo traducir el nombre de Jonás?', 'es'],
  ['I want to start translating Jonah', 'en'],
  ['How do I translate the book of Ruth?', 'en'],
  ['Je veux traduire le livre de Jonas', 'fr'],
  ['Comment traduire le nom de Jonas ?', 'fr'],
  ['Saya mau menerjemahkan kitab Yunus', 'id'],
  ['योना का अनुवाद कैसे करें?', 'hi'],
  ['كيف أترجم سفر يونان؟', 'ar'],
]
for (const [q, want] of CASES) test(`${want}: ${q}`, () => expect(guessLang(q)).toBe(want))
