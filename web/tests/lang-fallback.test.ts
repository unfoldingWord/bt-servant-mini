// A phone with one language pack (or two) answers in the app's language from the pack it has: never "not installed".
import { test, expect } from 'bun:test'
import { installPacks, ALL_PACKS } from './fs-packs'
import { buildSheet } from '../src/sheet'
import { answerSheet, setUiLang } from '../src/answer'
import { articleForQuestion, keywords, packsFor, searchVerses, versesOf } from '../src/search'
import booknames from '../src/data/booknames.json'

const UIS = ['en', 'es', 'fr', 'id', 'hi', 'ar']
// "Titus" (in every pack, unlike Ruth) as each UI language writes it (data/booknames.json, data/books.json)
const RUTH: Record<string, string> = { en: 'Titus', es: 'Tito', fr: 'Tite', id: 'Titus', hi: 'तीतुस', ar: (booknames as any).BOOK_AR.tit }
const TERM: Record<string, string> = { en: 'grace', es: 'gracia', fr: 'grâce', id: 'kasih karunia', hi: 'अनुग्रह', ar: 'نعمة' }
const bad = /not installed|no está instalado|n'est pas installé|tidak terpasang|इंस्टॉल नहीं|غير مثبت/i

async function ask(ui: string, slots: Record<string, unknown>, prefer: string | null = null) {
  setUiLang(ui)
  const { sheet } = await buildSheet('t', { lang: ui, ...slots } as any, prefer)
  return { sheet, r: await answerSheet(sheet) }
}

for (const pack of ALL_PACKS) {
  for (const ui of UIS) {
    test(`only ${pack}, app in ${ui}`, async () => {
      await installPacks([pack])
      const p = await ask(ui, { intent: 'passage', book: RUTH[ui], chapter: 2, verse_start: 3, verse_end: null, what: ['text'] })
      expect(p.sheet.lang).toBe(pack)
      expect(p.r.answer).not.toMatch(bad)
      expect(p.r.answer).toContain('2:3')
      expect(p.r.answer.length).toBeGreaterThan(60)
      const n = await ask(ui, { intent: 'passage', book: RUTH[ui], chapter: 2, verse_start: 3, verse_end: null, what: ['notes'] })
      expect(n.sheet.lang).toBe(pack)
      expect(n.r.answer).not.toMatch(bad)
      const a = await ask(ui, { intent: 'article', term: TERM[ui] })
      expect(a.sheet.lang).toBe(pack)
      expect(a.r.answer).not.toMatch(bad)
    })
  }
}

test('two packs (es-419 + hi): the question\'s language wins', async () => {
  if (!ALL_PACKS.includes('es-419') || !ALL_PACKS.includes('hi')) return
  await installPacks(['es-419', 'hi'])
  expect((await ask('es', { intent: 'passage', book: 'Tito', chapter: 2, verse_start: 3, what: ['text'] })).sheet.lang).toBe('es-419')
  expect((await ask('hi', { intent: 'passage', book: RUTH.hi, chapter: 2, verse_start: 3, what: ['text'] })).sheet.lang).toBe('hi')
  // English is not installed: the first installed pack of the two, and the chosen helps language still wins
  expect((await ask('en', { intent: 'passage', book: 'Titus', chapter: 2, verse_start: 3, what: ['text'] })).sheet.lang).toBe('es-419')
  expect((await ask('en', { intent: 'passage', book: 'Titus', chapter: 2, verse_start: 3, what: ['text'] }, 'hi')).sheet.lang).toBe('hi')
})

test('Ruth 2:3, Spanish only, app in English (the reported bug)', async () => {
  await installPacks(['es-419'])
  const r = await ask('en', { intent: 'passage', book: 'Ruth', chapter: 2, verse_start: 3, what: ['text'] })
  expect(r.sheet.lang).toBe('es-419')
  expect(r.r.answer).not.toMatch(bad)
  expect(r.r.answer).toContain('2:3')
})

// search.ts read the English catalog directly: a phone without English threw E_NOT_INSTALLED
for (const pack of ALL_PACKS) {
  test(`only ${pack}: a name alone and an open search do not throw`, async () => {
    await installPacks([pack])
    for (const [ui, name, word] of [['en', 'John the Baptist', 'grace'], ['es', 'Juan el Bautista', 'gracia']] as const) {
      setUiLang(ui)
      const ids = await articleForQuestion(name)
      expect(Array.isArray(await versesOf(ids ?? ['tw:names/johnthebaptist'], pack))).toBe(true)
      expect(Array.isArray((await searchVerses(word, null, pack)).hits)).toBe(true)
      expect(Array.isArray((await searchVerses(name, null, pack)).hits)).toBe(true)
    }
  }, 120000)
}

test('all packs installed: a free search looks only in the pack asked, the packs of its words and English', async () => {
  await installPacks(ALL_PACKS)
  const ar = keywords('ماذا يقول الكتاب عن المحبة')
  expect(await packsFor(ar, 'ar')).toEqual(['ar', 'en'])
  expect((await packsFor(keywords('pez en el mar'), 'es-419')).length).toBeLessThanOrEqual(3)
  // none of those installed: one pack, not all
  await installPacks(['hi', 'id'])
  expect(await packsFor(ar, 'ar')).toHaveLength(1)
}, 30000)
