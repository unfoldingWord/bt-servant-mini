// Every book's name, as the app writes it in each language (bookShown) and as the book tables read it (data/books.json), is a
// reference when "1:1" follows it: directSheet reads it by code, in the language guessLang (or the script) gives the question.
// Before Nov 16 a name of several words lost to its last word: "प्रेरितों के काम 1:8" (the app's own name for Acts) went to
// the word search, "رؤيا يوحنا 1:1" (Revelation) was not read, "Kisah Para Rasul 1:1" neither.
import { expect, test } from 'bun:test'
import { directSheet, env, guessLang } from '../src/pipeline'
import { bookCode } from '../src/sheet'
import { bookShown } from '../src/firstuse'
import { CANON } from '../src/packs'
import books from '../src/data/books.json'

const UIS = ['en', 'es', 'fr', 'id', 'hi', 'ar']
const tables = books as Record<string, Record<string, string>>

for (const ui of UIS) {
  test(`every book name in ${ui} followed by 1:1 is a reference`, () => {
    env.nav = ui
    const names = new Map<string, string>()
    for (const c of CANON) names.set(bookShown(ui, c), c)
    // the table's other names; codes ("rut") and one-letter abbreviations ("1 s": the pattern wants two letters) aside
    for (const [n, c] of Object.entries(tables[ui] ?? {})) if (c !== 'obs' && !/^[1-3]?[a-z]{2,3}$/.test(n) && !/(^|\s)\p{L}(\s|$)/u.test(n)) names.set(n, c)
    const bad: string[] = []
    for (const [n, c] of names) {
      const q = `${n} 1:1`
      const s = directSheet(q)
      const lang = s?.lang ?? guessLang(q)
      const got = s ? bookCode(lang, s.book) : null
      if (got !== c || s?.chapter !== 1 || s?.verse_start !== 1) bad.push(`${q} → ${got ?? 'not a reference'} (${lang})`)
    }
    expect(bad).toEqual([])
    expect(names.size).toBeGreaterThanOrEqual(CANON.length)
  })
}

test('a several-word name wins over its last word', () => {
  env.nav = 'ar'
  expect(bookCode('ar', directSheet('رؤيا يوحنا 1:1')?.book)).toBe('rev') // not John
  expect(bookCode('ar', directSheet('مراثي إرميا 3:22')?.book)).toBe('lam') // not Jeremiah
  env.nav = 'hi'
  const s = directSheet('प्रेरितों के काम 1:8 नोट्स')
  expect(bookCode('hi', s?.book)).toBe('act')
  expect(s?.what).toEqual(['notes'])
  env.nav = 'id'
  expect(bookCode('id', directSheet('Kisah Para Rasul 2:4')?.book)).toBe('act')
  // a word before a one-word name is still not part of it
  env.nav = 'en'
  expect(bookCode('en', directSheet('Jonah 1:3 notes')?.book)).toBe('jon')
  expect(directSheet('Where is Jonah 1:3')).toBeNull()
})
