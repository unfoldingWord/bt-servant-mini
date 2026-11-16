// The language of a question when no reader says it (no model yet, offline): a translator's own words count too.
import { expect, test } from 'bun:test'
import { env, guessLang } from '../src/pipeline'

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

// in another app language: a few words that tell Spanish, French and English apart (del, dios, y; du, des, et, dieu; on,
// of), and a real tie stays in the app's language ("Que signifie grâce ?" has "que" in French and in Spanish)
const IN_APP: [string, string, string][] = [
  ['fr', 'la gracia de Dios', 'es'],
  ['fr', 'notes on Ruth 2:3', 'en'],
  ['fr', 'Que signifie grâce ?', 'fr'],
  ['es', 'la grâce de Dieu', 'fr'],
  ['en', 'el amor de Dios y la fe', 'es'],
  ['es', 'Que signifie grâce ?', 'fr'],
  // French "il y a" is no Spanish "y" (review of b90dad4), and "on" in French is no English "on"
  ['fr', 'Combien de versets y a-t-il dans Ruth ?', 'fr'],
  ['fr', 'Il y a combien de chapitres dans Jonas ?', 'fr'],
  ['es', 'Combien de versets y a-t-il dans Ruth ?', 'fr'],
  ['es', 'Comment on traduit grâce ?', 'fr'],
  ['fr', 'Dios y su pueblo', 'es'],
]
for (const [app, q, want] of IN_APP)
  test(`${want} in the ${app} app: ${q}`, () => {
    const was = env.nav
    env.nav = app
    try { expect(guessLang(q)).toBe(want) } finally { env.nav = was }
  })
