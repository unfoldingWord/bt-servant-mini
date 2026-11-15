// The word indexes of free search (src/textindex.ts) do not stay in memory longer than they should: they go when the packs
// change, at most two big ones are kept, English is indexed only when the question's own pack found nothing, and no book a
// pack holds is left out of them.
import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { heapStats } from 'bun:jsc'
import { installPacks, ALL_PACKS, PACKS_DIR } from './fs-packs'
import { openLang } from '../src/packs'
import { searchHelps, searchVerses } from '../src/search'
import { ALL_BOOKS, indexBytes, indexLimits, indexedLangs, prepareIndex } from '../src/textindex'

/** The JS heap with typed arrays (their buffers are not in heapUsed), after a few turns of collection. */
async function heap() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 10))
    Bun.gc(true)
  }
  return heapStats().heapSize
}
const has = (...l: string[]) => l.every((x) => ALL_PACKS.includes(x))

test('an index and the rows of its hits are let go when the packs change', async () => {
  if (!has('en', 'es-419')) return
  await installPacks(['en'])
  let bytes = 0
  // in a function of its own: no reader left on this one's stack
  await (async () => {
    const q = 'Where is the barley harvest mentioned?'
    expect((await searchVerses(q, null, 'en')).how).toBe('text')
    expect((await searchHelps(q, 'en')).length).toBeGreaterThan(0)
    bytes = await indexBytes(await openLang('en'))
  })()
  expect(indexedLangs()).toEqual(['en'])
  expect(bytes).toBeGreaterThan(20 * 2 ** 20)
  const full = await heap()
  await installPacks(['es-419'])
  const after = await heap()
  expect(indexedLangs()).toEqual([])
  // the index goes (36 MB). The reader and its segments go too when nothing holds them, but JSC's conservative stack scan
  // keeps one alive now and then, so only what this module holds is measured.
  expect(full - after).toBeGreaterThan(0.9 * bytes)
}, 120000)

test('at most two big indexes: the one used longest ago goes', async () => {
  if (!has('hi', 'id', 'es-419')) return
  await installPacks(['hi', 'id', 'es-419'])
  // every index counts as big, and only two are kept
  const old = indexLimits(2, 0)
  try {
    for (const l of ['hi', 'id', 'es-419']) await prepareIndex(await openLang(l))
    expect(indexedLangs()).toEqual(['id', 'es-419'])
    await prepareIndex(await openLang('id'))
    expect(indexedLangs()).toEqual(['es-419', 'id'])
  } finally {
    indexLimits(...old)
  }
}, 120000)

test('English is indexed only when the question\'s own pack finds nothing', async () => {
  if (!has('hi', 'en')) return
  await installPacks(['hi', 'en'])
  const q = 'जौ की कटनी का वर्णन कहाँ है?'
  expect((await searchVerses(q, null, 'hi')).hits.length).toBeGreaterThan(0)
  const helps = await searchHelps(q, 'hi')
  expect(helps.length).toBeGreaterThan(0)
  expect(helps.every((h) => h.lang === 'hi')).toBe(true)
  expect(indexedLangs()).toEqual(['hi'])
}, 120000)

test('every book a pack on disk holds is one the index reads, in the catalog\'s order', () => {
  // the client's catalog lists units sorted by code point; ties in score keep that order
  expect(ALL_BOOKS).toEqual([...ALL_BOOKS].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
  for (const l of ALL_PACKS) {
    const state = JSON.parse(readFileSync(join(PACKS_DIR, l, 'state.json'), 'utf8'))
    const books = Object.keys(state.units).filter((k) => k.includes('/book:')).map((k) => k.split('/book:')[1]!)
    expect(books.length).toBeGreaterThan(0)
    expect(books.filter((b) => !ALL_BOOKS.includes(b)), `books of ${l} the index would skip`).toEqual([])
  }
})
