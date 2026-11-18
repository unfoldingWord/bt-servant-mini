// The packs side of the resources menu (packs.ts, handoff/mini-servant/encargo-ms-menu.md task 2): offers that plan everything
// (the Stories too, over OBS_MAX or not), `all` in a download and in its partial mark, the old '1' mark, `offers(onEach)`,
// `installedUnits`, and `addUnits` refusing a language that came with the app.
// Catalogs: the English ones Mini's server had on Nov 16 (fixtures/packs-2026-11-16), served by a fetch stub with no segments;
// the phone's store is fake-indexeddb and localStorage a map. Every global is put back at the end: bun runs the test files in
// one process.
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as client from '@bt-synergy/language-pack-client'
import { emptyState, planInstall, verifyCatalogFile, type PackSource } from '@bt-synergy/language-pack-client'
import { BTS_DIR } from './bts-dir'
import { ALL_PACKS, installPacks } from './fs-packs'
import {
  addedStore, addUnits, CANDIDATES, downloadLang, installedUnits, installWant, markPartial, OBS_MAX, offerCandidates, offerOf, offers,
  partialLangs, partialMark, resetAddedStore, setPacksServers,
} from '../src/packs'
import { trustedKeys } from '../src/shared'
import { CANON } from '../src/canon'
import { buildSheet } from '../src/sheet'

const FX = resolve(import.meta.dir, 'fixtures/packs-2026-11-16')
const FAKE_IDB = join(BTS_DIR, 'packages', 'language-pack-client', 'node_modules', 'fake-indexeddb', 'build', 'esm', 'index.js')
const saved = { indexedDB: (globalThis as any).indexedDB, localStorage: (globalThis as any).localStorage, fetch: globalThis.fetch }
const mem = new Map<string, string>()
const memStorage = {
  get length() { return mem.size },
  key: (i: number) => [...mem.keys()][i] ?? null,
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
}
/** The client's planner as it is now: the mock below replaces the module's export, this one stays. */
const realPlan = planInstall
let obsOver = false // the stub planner makes the Stories weigh more than OBS_MAX
/** English and `common` have a catalog on this server; every other name is "not found"; there are no segments. */
const stubFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const m = /\/v3\/packs\/([^/]+)\/catalog$/.exec(String(input))
  if (m && (m[1] === 'en' || m[1] === 'common')) return new Response(readFileSync(`${FX}/${m[1]}.catalog`), { status: 200 })
  if (m) return new Response('catalog not found', { status: 404 })
  return saved.fetch(input, init) // the packs shipped in the app (tests/fs-packs.ts, loaded above); anything else is offline
}) as typeof fetch
/** The same catalogs as a source, for `offerOf(lang, source)`. */
const source: PackSource = {
  catalog: async (name) => ({ bytes: readFileSync(`${FX}/${name}.catalog`) }) as any,
  segment: async () => { throw new Error('no segments here') },
}

beforeAll(async () => {
  const fake = await import(FAKE_IDB)
  ;(globalThis as any).indexedDB = new fake.IDBFactory()
  ;(globalThis as any).localStorage = memStorage
  globalThis.fetch = stubFetch
  setPacksServers(['http://packs.test'])
  resetAddedStore()
  // the server's catalogs are signed and cannot be edited, so a Stories unit over OBS_MAX is made in the planner: it adds to the
  // size of the `obs` step (as a bigger unit would); the real planner does the rest
  mock.module('@bt-synergy/language-pack-client', () => ({
    ...client,
    planInstall: (...a: Parameters<typeof planInstall>) => {
      const plan = realPlan(...a)
      if (!obsOver) return plan
      const steps = plan.steps.map((st) => (st.key.endsWith('/obs') ? { ...st, segments: st.segments.map((x, i) => (i ? x : { ...x, size: x.size + OBS_MAX })) } : st))
      return { ...plan, steps, bytes: plan.bytes + OBS_MAX }
    },
  }))
})
afterAll(async () => {
  mock.module('@bt-synergy/language-pack-client', () => client)
  ;(globalThis as any).indexedDB = saved.indexedDB
  ;(globalThis as any).localStorage = saved.localStorage
  globalThis.fetch = saved.fetch
  setPacksServers()
  resetAddedStore()
  await installPacks(ALL_PACKS)
})

describe('offers plan everything, the Stories too', () => {
  const plan = async () => {
    const trust = { trustedKeys: trustedKeys() }
    const cats = [
      await verifyCatalogFile(readFileSync(`${FX}/en.catalog`), trust, { from: 'network' }),
      await verifyCatalogFile(readFileSync(`${FX}/common.catalog`), trust, { from: 'network' }),
    ]
    const listed = new Set(cats[0]!.catalog.units.map((u) => u.id))
    return planInstall(cats, emptyState(), installWant(CANON.filter((b) => listed.has(`book:${b}`))), new Set())
  }

  test('Stories under OBS_MAX: units, parts and all', async () => {
    obsOver = false
    const o = (await offerOf('en', source))!
    expect(o.all).toBe(true)
    expect(o.obs).toBe(true)
    expect(o.units).toContain('obs')
    expect(o.units).toContain('xmap')
    expect(o.units.filter((u) => u.startsWith('book:')).length).toBe(o.books.length)
    expect(o.parts.map((p) => p.id)).toContain('obs')
    expect(o.parts.find((p) => p.id === 'bible')).toMatchObject({ state: 'have', n: o.books.length })
    expect(o.bytes).toBe((await plan()).bytes)
    expect(o.obsBytes!).toBeLessThanOrEqual(OBS_MAX)
  })

  test('Stories over OBS_MAX: they come too, and count in the size', async () => {
    obsOver = false
    const small = (await offerOf('en', source))!
    obsOver = true
    try {
      const big = (await offerOf('en', source))!
      expect(big.obsBytes!).toBeGreaterThan(OBS_MAX)
      expect(big.obs).toBe(true)
      expect(big.units).toEqual(small.units)
      expect(big.parts.map((p) => p.id)).toContain('obs')
      expect(big.bytes).toBe(small.bytes + OBS_MAX)
    } finally {
      obsOver = false
    }
  })
})

describe('downloadLang with all, and the partial mark', () => {
  test('the mark keeps what was asked for, so Continue asks for the same', async () => {
    mem.clear()
    await installPacks([])
    const o = (await offerOf('en', source))!
    // the stub has no segments: the download fails, and the mark stays with what was asked
    await expect(downloadLang('en', undefined, { offer: o })).rejects.toBeDefined()
    expect(partialLangs()).toEqual(['en'])
    expect(partialMark('en')).toEqual({ all: true, books: o.books, b: o.bytes })
    // [Continue]: the mark says all, so the same is asked again
    await expect(downloadLang('en', undefined, { offer: o, all: partialMark('en')!.all })).rejects.toBeDefined()
    expect(partialMark('en')).toEqual({ all: true, books: o.books, b: o.bytes })
    // all: false leaves the Stories out of what is asked and of its size
    markPartial('en', false)
    await expect(downloadLang('en', undefined, { offer: o, all: false })).rejects.toBeDefined()
    expect(partialMark('en')).toEqual({ all: false, books: o.books, b: o.bytes - (o.obsBytes ?? 0) })
    markPartial('en', false)
  })

  test("the old '1' mark is read: partial, with no data", () => {
    mem.clear()
    mem.set('btsm.partial.hi', '1')
    expect(partialLangs()).toEqual(['hi'])
    expect(partialMark('hi')).toBeNull()
    mem.set('btsm.partial.hi', '{not json')
    expect(partialMark('hi')).toBeNull()
    mem.set('btsm.partial.hi', JSON.stringify({ all: true, books: ['tit', 5], b: 'x' }))
    expect(partialMark('hi')).toEqual({ all: true, books: ['tit'], b: 0 })
    markPartial('hi', true) // no data given: the old form
    expect(mem.get('btsm.partial.hi')).toBe('1')
    expect(partialMark('xx')).toBeNull()
    mem.clear()
  })
})

describe('offers(onEach)', () => {
  test('tells of each language as it answers; the total is what is asked', async () => {
    mem.clear()
    await installPacks([]) // nothing shipped: every candidate is asked
    const cands = await offerCandidates()
    expect(cands).toEqual(CANDIDATES)
    const seen: [string, boolean][] = []
    const all = await offers((o, l) => seen.push([l, !!o]))
    expect(seen.length).toBe(cands.length) // answered with or without an offer
    expect(seen.find(([l]) => l === 'en')).toEqual(['en', true])
    expect(seen.filter(([, ok]) => ok).length).toBe(1)
    expect(all.map((o) => o.lang)).toEqual(['en'])
    expect(all[0]!.all).toBe(true)
  })

  test('a language the phone has is not asked', async () => {
    await installPacks(['es-419'])
    const cands = await offerCandidates()
    expect(cands).not.toContain('es-419')
    expect(cands.length).toBe(CANDIDATES.length - 1)
  })
})

describe('installedUnits and addUnits', () => {
  test('a language that comes with the app: its state.json units, and addUnits refuses it', async () => {
    await installPacks(['es-419'])
    const u = await installedUnits('es-419')
    expect(u).toContain('book:tit')
    expect(u.some((x) => x.includes('/'))).toBe(false) // no language prefix
    await expect(addUnits('es-419', ['obs'])).rejects.toThrow(/came with the app/)
    expect(await installedUnits('xx')).toEqual([])
  })

  test("a downloaded language: its units come from the phone's store; addUnits goes on to the server", async () => {
    await installPacks([]) // nothing shipped
    const store = await addedStore()
    await store.setState({
      v: 1, published: {}, active: { hi: { name: 'hi' } },
      units: { 'hi/book:tit': {}, 'hi/obs': {}, 'common/xmap': {}, 'hi2/book:rut': {} },
    } as any)
    expect((await installedUnits('hi')).sort()).toEqual(['book:tit', 'obs'])
    // past the refusal: the server has no `hi`, so what fails is the server, not "came with the app"
    const err = await addUnits('hi', ['art:ta:intro']).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(String(err.message)).not.toMatch(/came with the app/)
  })
})

describe('the language chosen for the answers', () => {
  test('when it is no longer on the phone, the answer is in the language of the question, as with no choice', async () => {
    const slots = { lang: 'es', intent: 'passage', book: 'Tito', chapter: 2, verse_start: 3, verse_end: null, what: ['text'] } as any
    const other = ALL_PACKS.find((l) => l !== 'es-419')!
    await installPacks(['es-419', other])
    expect((await buildSheet('t', slots, other)).sheet.lang).toBe(other) // chosen and there
    await installPacks(['es-419']) // removed from the phone
    const gone = (await buildSheet('t', slots, other)).sheet.lang
    expect(gone).toBe('es-419')
    expect(gone).toBe((await buildSheet('t', slots, null)).sheet.lang) // "El de mi pregunta"
  })
})
