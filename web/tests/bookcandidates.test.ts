// sheet.ts bookCandidates: every book a typed name may be, best first (the composer's book buttons). Abbreviations, typos, the
// six app languages, numbered books ("1 Juan" is 1 John, "Juan" is John), and the same first answer as bookCode.
import { expect, test } from 'bun:test'
import { bookCandidates, bookCode } from '../src/sheet'

const first = (ui: string, t: string) => bookCandidates(ui, t)[0]?.code ?? null
const codes = (ui: string, t: string) => bookCandidates(ui, t).map((c) => c.code)

const table: [string, string, string][] = [
  // exact names and codes, any language's table
  ['es', 'Rut', 'rut'], ['es', 'Ruth', 'rut'], ['en', 'rut', 'rut'], ['en', '1jn', '1jn'], ['es', '1 Juan', '1jn'], ['es', 'Juan', 'jhn'],
  ['fr', '1 Jean', '1jn'], ['fr', 'Jean', 'jhn'], ['id', 'Yunus', 'jon'], ['id', '1 Yohanes', '1jn'], ['hi', 'रूत', 'rut'], ['hi', 'योना', 'jon'],
  ['ar', 'يونان', 'jon'], ['ar', 'راعوث', 'rut'], ['en', 'I John', '1jn'], ['en', '1 jn', '1jn'], ['en', 'Mt', 'mat'], ['en', 'Rom', 'rom'],
  ['es', 'Jonás', 'jon'], ['es', 'jonas', 'jon'],
  // prefixes
  ['es', 'Roma', 'rom'], ['en', 'Matt', 'mat'], ['es', 'Apoc', 'rev'], ['fr', 'Apoc', 'rev'], ['id', 'Wahy', 'rev'], ['hi', 'उत्प', 'gen'],
  // typos
  ['en', 'Mathew', 'mat'], ['en', 'Genesys', 'gen'], ['en', 'Jonas', 'jon'], ['es', 'Genésis', 'gen'], ['en', 'Phillipians', 'php'],
]
for (const [ui, t, code] of table) test(`${ui} "${t}" → ${code}`, () => expect(first(ui, t)).toBe(code))

test('how each one matched', () => {
  expect(bookCandidates('es', 'Rut')[0]!.how).toBe('exact')
  expect(bookCandidates('es', 'Romano')[0]!.how).toBe('prefix')
  expect(bookCandidates('en', 'Mathew')[0]!.how).toBe('typo')
})
test('several candidates, the app language first, no repeats', () => {
  const jo = codes('es', 'jo')
  for (const c of ['jos', 'job', 'jol', 'jon']) expect(jo).toContain(c)
  expect(new Set(jo).size).toBe(jo.length)
  // "1 Juan" vs "Juan": a prefix never crosses the number
  expect(codes('es', 'Jua')).not.toContain('1jn')
  expect(codes('es', '1 Ju')).toEqual(['1jn'])
})
test('too little to guess', () => {
  expect(codes('en', 'r')).toEqual([])
  expect(codes('hi', 'रू')).toEqual([]) // one syllable
  expect(codes('en', '')).toEqual([])
  expect(codes('es', 'por qué')).toEqual([])
})
test('the first candidate is what bookCode reads, when it reads one', () => {
  const names = ['Rut', 'Ruth', 'Jonás', 'Mathew', 'Matt', 'jona', '1 Juan', 'Juan', '1 jn', 'Genesys', 'Yunus', 'योना', 'يونان', 'Apocalipsis', 'Hechos', 'Phillipians']
  for (const ui of ['en', 'es', 'fr', 'id', 'hi', 'ar'])
    for (const n of names) {
      const c = bookCode(ui, n)
      if (c) expect(`${ui} ${n} ${first(ui, n)}`).toBe(`${ui} ${n} ${c}`)
    }
})
