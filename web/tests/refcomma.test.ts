// "Rut 2,3", "ruth 2 3", "catatan rut 2 3": chapter and verse written with a comma (the citation of Spanish and French) or a
// space, read by code (pipeline.ts refInText). A report of Nov 17: the verse was dropped and the whole chapter came.
import { describe, expect, test } from 'bun:test'
import { refInText } from '../src/pipeline'
import { bookCode } from '../src/sheet'

/** [question language, question, the reading: "book ch:v-w", "book ch", or null (no reference)] */
const CASES: [string, string, string | null][] = [
  // Spanish
  ['es', 'Rut 2,3', 'rut 2:3'],
  ['es', 'Rut 2,3-5', 'rut 2:3-5'],
  ['es', 'notas de Rut 2 3', 'rut 2:3'],
  ['es', '1 Juan 2,3', '1jn 2:3'],
  ['es', 'Notas de 1 Juan 3,2', '1jn 3:2'],
  ['es', 'Salmos 23, versículo 4', 'psa 23:4'],
  ['es', 'Rut 1, 2 y 3', 'rut 1'], // a list of chapters, not a verse
  ['es', 'Rut 2,30', 'rut 2'], // Ruth 2 has 23 verses: no verse 30
  ['es', 'Rut 2,20-40', 'rut 2:20-23'],
  ['es', 'capítulos 2, 3', null],
  ['es', 'Rut 2.3', 'rut 2:3'],
  // English
  ['en', 'ruth 2 3', 'rut 2:3'],
  ['en', 'notes on ruth 2 3', 'rut 2:3'],
  ['en', 'Psalm 23 verse 4', 'psa 23:4'],
  ['en', 'Ruth 2:30', 'rut 2:30'], // with a colon it is a verse: readQuestion says it is past the end
  ['en', 'Ruth 2', 'rut 2'],
  // French
  ['fr', 'Ruth 2,3', 'rut 2:3'],
  ['fr', 'Jean 3,16-18', 'jhn 3:16-18'],
  ['fr', 'Il y a 2,5 millions de personnes', null], // a decimal in prose
  // Indonesian
  ['id', 'catatan rut 2 3', 'rut 2:3'],
  ['id', 'Yohanes 3,16', 'jhn 3:16'],
  // Hindi
  ['hi', 'रूत 2,3', 'rut 2:3'],
  ['hi', 'यूहन्ना 3 16', 'jhn 3:16'],
  // Arabic
  ['ar', 'راعوث 2،3', 'rut 2:3'],
  ['ar', 'يوحنا 3 16', 'jhn 3:16'],
]

const reading = (lang: string, q: string): string | null => {
  const s = refInText({ intent: 'unknown', lang }, q)
  const code = s.book ? bookCode(lang, s.book) : null
  if (!code || !s.chapter) return null
  return `${code} ${s.chapter}${s.verse_start ? `:${s.verse_start}${s.verse_end ? `-${s.verse_end}` : ''}` : ''}`
}

describe('chapter and verse with a comma or a space (refInText)', () => {
  for (const [lang, q, want] of CASES) test(`${lang}: ${q}`, () => expect(reading(lang, q)).toBe(want))
  test("the reader's own reading wins: a book and a chapter it read are kept", () => {
    const read = { intent: 'passage', book: 'Rut', chapter: 2, verse_start: null, lang: 'es' }
    expect(refInText(read, 'Rut 2,3')).toBe(read)
  })
})
