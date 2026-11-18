// The packs side of the resources menu (packs.ts, handoff/mini-servant/encargo-ms-menu.md task 2): offers that plan everything
// (the Stories too, over OBS_MAX or not), the partial mark (only the total bytes), the old '1' mark, `offers(onEach)`,
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
  BUILDER, buildCommon, buildLanguage, keyId, parseTipnr, publicKeyOf, signCatalog, xtopicsView,
} from '@bt-synergy/language-pack-v3'
import {
  addedClient, addedStore, addUnits, setTrustedKeys, CANDIDATES, downloadLang, installedUnits, installWant, markPartial, OBS_MAX, offerCandidates, offerOf, offers,
  partialLangs, partialMark, resetAddedStore, setPacksServers,
} from '../src/packs'
import { trustedKeys } from '../src/shared'
import { CANON } from '../src/canon'
import { buildSheet } from '../src/sheet'

const FX = resolve(import.meta.dir, 'fixtures/packs-2026-11-16')
const V3 = join(BTS_DIR, 'packages', 'language-pack-v3')
const DATA = join(V3, 'spec', 'tests', 'data')
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

  test('Stories under OBS_MAX: units and parts', async () => {
    obsOver = false
    const o = (await offerOf('en', source))!
    expect(o.obs).toBe(true)
    expect(o.units).toContain('obs')
    expect(o.units).toContain('xmap')
    expect(o.units.filter((u) => u.startsWith('book:')).length).toBe(o.books.length)
    expect(o.parts.map((p) => p.id)).toContain('obs')
    expect(o.parts.find((p) => p.id === 'bible')).toMatchObject({ state: 'have', n: o.books.length })
    expect(o.bytes).toBe((await plan()).bytes)
  })

  test('Stories over OBS_MAX: they come too, and count in the size', async () => {
    obsOver = false
    const small = (await offerOf('en', source))!
    obsOver = true
    try {
      const big = (await offerOf('en', source))!
      expect(big.obs).toBe(true)
      expect(big.units).toEqual(small.units)
      expect(big.parts.map((p) => p.id)).toContain('obs')
      expect(big.bytes).toBe(small.bytes + OBS_MAX)
    } finally {
      obsOver = false
    }
  })
})

describe('the partial mark', () => {
  test('a failed download leaves the total bytes in its mark', async () => {
    mem.clear()
    await installPacks([])
    const o = (await offerOf('en', source))!
    // the stub has no segments: the download fails, and the mark stays
    await expect(downloadLang('en', undefined, { offer: o })).rejects.toBeDefined()
    expect(partialLangs()).toEqual(['en'])
    expect(partialMark('en')).toEqual({ b: o.bytes })
    markPartial('en', false)
    expect(partialLangs()).toEqual([])
  })

  test('a mark that cannot be written does not stop the download', async () => {
    mem.clear()
    const full = { ...memStorage, setItem: () => { throw new Error('quota') } }
    ;(globalThis as any).localStorage = full
    const warn = console.warn
    const said: string[] = []
    console.warn = (m: string) => void said.push(m)
    try {
      expect(markPartial('en', true, 5)).toBe(false)
      const o = (await offerOf('en', source))!
      // it goes on to the install (which fails on the missing segments, not on the mark)
      const err = await downloadLang('en', undefined, { offer: o }).catch((e) => e)
      expect(String(err?.message)).not.toMatch(/quota/)
      expect(said.some((m) => /could not be written/.test(m))).toBe(true)
    } finally {
      console.warn = warn
      ;(globalThis as any).localStorage = memStorage
    }
  })

  test("the old '1' mark is read: partial, with no data", () => {
    mem.clear()
    mem.set('btsm.partial.hi', '1')
    expect(partialLangs()).toEqual(['hi'])
    expect(partialMark('hi')).toBeNull()
    mem.set('btsm.partial.hi', '{not json')
    expect(partialMark('hi')).toBeNull()
    mem.set('btsm.partial.hi', JSON.stringify({ b: 'x' }))
    expect(partialMark('hi')).toBeNull()
    expect(markPartial('hi', true, 42)).toBe(true)
    expect(partialMark('hi')).toEqual({ b: 42 })
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

// A real signed catalog with segments (built as obsimg-catalog.test.ts builds its es-419: a small Titus and its common catalog),
// served by Bun.serve with the paths of spec/serving.md: what is downloaded can be counted, cut and resumed.
describe('with a server that has segments', () => {
  const ES = 'es-419'
  const about = { format: '3.0', publisher: 'unfoldingWord', origin: 'published', revision: 1, built: '2026-11-01T10:00:00Z', builder: BUILDER } as const
  let catalogs: Record<string, Uint8Array>
  const segments = new Map<string, Uint8Array>()
  let trusted: Record<string, Uint8Array>
  let server: { port: number; stop(force?: boolean): void }
  const asked: string[] = []
  let holdId: string | null = null
  const held: (() => void)[] = []
  const body = (b: Uint8Array) => b as Uint8Array<ArrayBuffer>
  let fake: any
  const newPhone = () => {
    ;(globalThis as any).indexedDB = new fake.IDBFactory()
    mem.clear()
    resetAddedStore()
  }
  const storeIds = async () => new Set(await (await addedStore()).ids())

  beforeAll(async () => {
    fake = await import(FAKE_IDB)
    const { partsSource } = await import(join(V3, 'src', 'node', 'partsSource.ts'))
    const parts = join(DATA, 'parts')
    const originals = join(DATA, 'originals', 'list.json')
    const src = (lang: string) => partsSource({ list: join(DATA, lang, 'list.json'), partsDir: parts, originals })
    const read = (path: string) => readFileSync(join(DATA, 'topics', path), 'utf8')
    const obs = new Map<number, string>()
    let n = 0
    for (const line of read('obs-refs.txt').split(/\r?\n/)) {
      const h = /^=== (\d+)$/.exec(line)
      if (h) obs.set((n = Number(h[1])), '')
      else if (n > 0) obs.set(n, `${obs.get(n)}${line}\n`)
    }
    const theo = (name: string) => read(`theographic-subset/${name}.json`)
    const tipnr = read('tipnr-subset.txt')
    const common = await buildCommon({
      source: await src('en'), about, mapLang: 'en',
      topics: { tipnr, theographic: { events: theo('events'), verses: theo('verses'), people: theo('people'), places: theo('places') }, obs },
    })
    const core = xtopicsView(common.segments.find((x: any) => x.seg.h.class === 'xtopics' && x.seg.h.part === 'core')!.seg) as any
    const lang = await buildLanguage({
      source: await src(ES), lang: ES, registry: {}, about, requires: [['common', about.revision, common.catalog.id]],
      topics: { xtopics: core, records: parseTipnr(tipnr, []) }, aligned: true,
    })
    const { privateKey } = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey))
    const publicKey = await publicKeyOf(pkcs8)
    for (const x of [...common.segments, ...lang.segments] as { id: string; bytes: Uint8Array }[]) segments.set(x.id, x.bytes)
    catalogs = { [ES]: await signCatalog(lang.catalog.bytes, pkcs8), common: await signCatalog(common.catalog.bytes, pkcs8) }
    trusted = { [keyId(publicKey)]: publicKey }
    ;(globalThis as any).localStorage = memStorage
    globalThis.fetch = (globalThis as any).Bun.fetch // this block's server (the stub is put back after it)
    server = (globalThis as any).Bun.serve({
      port: 0,
      fetch(req: Request) {
        const path = new URL(req.url).pathname
        const seg = /^\/v3\/packs\/seg\/([0-9a-f]{64})$/.exec(path)
        if (seg) {
          const id = seg[1]!
          asked.push(id)
          const bytes = segments.get(id)
          if (!bytes) return new Response('no such segment', { status: 404 })
          if (id === holdId) return new Promise<Response>((resolve) => held.push(() => resolve(new Response(body(bytes)))))
          return new Response(body(bytes))
        }
        const cat = /^\/v3\/packs\/([^/]+)\/catalog$/.exec(path)
        const bytes = cat ? catalogs[decodeURIComponent(cat[1]!)] : undefined
        return bytes ? new Response(body(bytes)) : new Response('catalog not found', { status: 404 })
      },
    })
    setPacksServers([`http://127.0.0.1:${server.port}`])
    setTrustedKeys(trusted)
    newPhone()
  }, 120000)

  afterAll(() => {
    for (const f of held.splice(0)) f()
    server?.stop(true)
    setPacksServers()
    setTrustedKeys()
    globalThis.fetch = stubFetch
    resetAddedStore()
  })

  test('the size shown is the size downloaded, and every unit of the offer is installed', async () => {
    const offer = (await offerOf(ES))!
    expect(offer).not.toBeNull()
    expect(offer.units.some((u) => u.startsWith('book:'))).toBe(true)
    const seen: { bytes: number; totalBytes: number }[] = []
    const got = await downloadLang(ES, (p) => seen.push(p), { offer })
    expect(got.bytes).toBe(offer.bytes)
    expect(seen.at(-1)!.bytes).toBe(offer.bytes)
    expect(seen.every((p) => p.bytes <= p.totalBytes && p.totalBytes === offer.bytes)).toBe(true)
    expect(partialLangs()).toEqual([])
    const r = await (await addedClient()).open(ES)
    for (const u of offer.units.filter((x) => x.startsWith('book:') || x.startsWith('art:'))) expect(r.installed(u), u).toBe(true)
    // only the language's own units, not the shared common/* ones
    const have = await installedUnits(ES)
    expect(have).toContain(offer.units.find((u) => u.startsWith('book:'))!)
    expect(have.some((u) => u.startsWith('common/'))).toBe(false)
  }, 120000)

  test('a cut download goes on from the store: no segment twice, and progress never goes over the total', async () => {
    newPhone()
    const offer = (await offerOf(ES))!
    expect(offer.segments.length).toBeGreaterThan(2)
    holdId = offer.segments[1]!
    asked.length = 0
    const c = new AbortController()
    let firstIn!: () => void
    const gotFirst = new Promise<void>((r) => (firstIn = r))
    const run = downloadLang(ES, (p) => { if (p.done >= 1) firstIn() }, { offer, signal: c.signal })
    await gotFirst
    c.abort(new Error('canceled'))
    await expect(run).rejects.toThrow()
    holdId = null
    for (const f of held.splice(0)) f()
    expect(partialMark(ES)).toEqual({ b: offer.bytes })
    expect(partialLangs()).toEqual([ES])
    const arrived = await storeIds()
    expect(offer.segments.some((id) => arrived.has(id))).toBe(true)
    // [Continue]: the segments that arrived are not fetched again; the bytes count from where they were
    asked.length = 0
    const seen: { bytes: number; totalBytes: number; done: number; total: number }[] = []
    const got = await downloadLang(ES, (p) => seen.push(p), { offer })
    expect(asked.filter((id) => arrived.has(id))).toEqual([])
    expect(new Set(asked).size).toBe(asked.length)
    expect(seen.every((p) => p.bytes <= p.totalBytes && p.done <= p.total)).toBe(true)
    expect(seen.at(-1)!.bytes).toBe(offer.bytes)
    expect(got.bytes).toBeLessThan(offer.bytes) // what the second run fetched: only the rest
    expect(partialLangs()).toEqual([])
  }, 120000)

  test('addUnits installs a missing part into a downloaded language, with a total, and a cancel stops it', async () => {
    newPhone()
    const offer = (await offerOf(ES))!
    const part = offer.units.find((u) => /^art:t[aw]:/.test(u)) // the Key Words of this small build
    expect(part).toBeDefined()
    // a language downloaded without that part (the book needs it, so it is left out too): the maps and the original text
    const rest = offer.units.filter((u) => u !== part && !u.startsWith('book:'))
    await (await addedClient()).install(ES, { defaults: false, units: rest }, { concurrency: 1 })
    resetAddedStore()
    expect((await installedUnits(ES)).includes(part!)).toBe(false)
    expect((await (await addedClient()).open(ES)).listed(part!)).toBe(true)
    // a cancel before it starts stops it, and nothing of the part arrives
    const c = new AbortController()
    c.abort(new Error('canceled'))
    await expect(addUnits(ES, [part!], { signal: c.signal })).rejects.toThrow()
    expect((await installedUnits(ES)).includes(part!)).toBe(false)
    // and a real one: installed, with progress that has a total
    const seen: { bytes: number; totalBytes: number }[] = []
    await addUnits(ES, [part!], { onProgress: (p) => seen.push(p) })
    expect((await installedUnits(ES)).includes(part!)).toBe(true)
    expect((await (await addedClient()).open(ES)).installed(part!)).toBe(true)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.at(-1)!.totalBytes).toBeGreaterThan(0)
    expect(seen.every((p) => p.bytes <= p.totalBytes)).toBe(true)
  }, 120000)
})
