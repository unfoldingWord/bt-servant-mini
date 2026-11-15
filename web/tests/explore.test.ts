// Browse (explore.ts): only what the installed packs hold is offered, in canonical order, and every verse and article it
// offers can be read from the pack it names (no dead ends).
import { expect, test } from 'bun:test'
import { ALL_PACKS, installPacks } from './fs-packs'
import { openLang } from '../src/packs'
import { academyManuals, bibleBooks, bookPlan, manualArticles, MANUALS, resetExplore, XT } from '../src/explore'

const need = (l: string[]) => l.every((x) => ALL_PACKS.includes(x))

test('the books of the packs, canonical order, each from the first pack that has it', async () => {
  if (!need(['es-419', 'en'])) return
  await installPacks(['es-419', 'en'])
  resetExplore()
  const es = await bibleBooks(['es-419'])
  const r = await openLang('es-419')
  expect(es.length).toBeGreaterThan(0)
  expect(es.every((b) => r.installed(`book:${b.code}`) && b.lang === 'es-419')).toBe(true)
  const both = await bibleBooks(['es-419', 'en'])
  expect(both.length).toBe(66)
  expect(both[0]!.code).toBe('gen')
  expect(both[65]!.code).toBe('rev')
  // a book the Spanish pack has comes from it; the others from English
  for (const b of es) expect(both.find((x) => x.code === b.code)!.lang).toBe('es-419')
  expect(both.find((x) => !es.some((e) => e.code === x.code))!.lang).toBe('en')
})

test('a book that is not installed is not offered', async () => {
  if (!need(['id'])) return
  await installPacks(['id'])
  resetExplore()
  const books = await bibleBooks(['id'])
  const r = await openLang('id')
  expect(books.length).toBeLessThan(66)
  for (const b of books) expect(r.installed(`book:${b.code}`)).toBe(true)
  expect(await bookPlan('id', 'gen')).toBeNull()
})

test('chapters and verses of Ruth, and its introductions', async () => {
  await installPacks(['en'])
  resetExplore()
  const p = (await bookPlan('en', 'rut'))!
  expect(p.chapters.map((c) => c.ch)).toEqual([1, 2, 3, 4])
  expect(p.chapters.map((c) => c.verses.length)).toEqual([22, 23, 18, 22])
  expect(p.chapters[0]!.verses[0]).toBe(1)
  expect(p.intro).toBe(true)
  expect(p.chapters.every((c) => c.intro)).toBe(true)
  const ps = (await bookPlan('en', 'psa'))!
  expect(ps.chapters.length).toBe(150)
  expect(ps.chapters[118]!.verses.length).toBe(176)
})

test('every verse offered for Jonah reads in the pack', async () => {
  await installPacks(['en'])
  resetExplore()
  const r = await openLang('en')
  const p = (await bookPlan('en', 'jon'))!
  for (const c of p.chapters)
    for (const v of [c.verses[0]!, c.verses[c.verses.length - 1]!]) {
      const a = await r.passage(`jon ${c.ch}:${v}`)
      expect(JSON.stringify(a.data ?? '').length).toBeGreaterThan(20)
    }
})

test('the four Translation Academy manuals and their articles', async () => {
  await installPacks(ALL_PACKS)
  resetExplore()
  const ms = await academyManuals(ALL_PACKS)
  expect(ms.map((x) => x.m)).toEqual([...MANUALS])
  const list = await manualArticles('en', 'translate')
  expect(list.length).toBeGreaterThan(100)
  expect(list.every((a) => a.id.startsWith('ta:translate/') && a.title)).toBe(true)
  // sorted by title
  const titles = list.map((a) => a.title)
  expect([...titles].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }))).toEqual(titles)
  // every listed article reads (a few of them, across the manuals)
  const r = await openLang('en')
  for (const m of MANUALS) {
    const arts = await manualArticles('en', m)
    expect(arts.length).toBeGreaterThan(0)
    for (const a of [arts[0]!, arts[arts.length - 1]!]) expect((await r.article(a.id, 'all')).data?.sections.length).toBeGreaterThan(0)
  }
}, 30_000)

test('Arabic titles in the Arabic pack', async () => {
  if (!need(['ar'])) return
  await installPacks(['ar'])
  resetExplore()
  const list = await manualArticles('ar', 'checking')
  expect(list.length).toBeGreaterThan(0)
  expect(/[؀-ۿ]/.test(list[0]!.title)).toBe(true)
})

test('the strings are in the six languages', () => {
  const en = XT('en')
  for (const l of ['es', 'fr', 'id', 'hi', 'ar']) {
    const s = XT(l)
    expect(s).not.toBe(en)
    expect(Object.keys(s).sort()).toEqual(Object.keys(en).sort())
    for (const m of MANUALS) expect(s.manuals[m][0]).toBeTruthy()
  }
})
