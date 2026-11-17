// The Open Bible Stories pictures as their own format-3 catalog, `zxx-obsimg` (obsimg.ts, packs.ts;
// handoff/mini-servant/plan-obs-imagenes-v3.md): offered with its size, downloaded (a cut download goes on from where it stopped
// and shows nothing until it is whole), read frame by frame, shared as a .tcpack and loaded on another phone, removed without
// touching a language, never listed as a language; and the old stop-gap zip's database deleted once.
//
// The catalogs are built here as bt-synergy's own tests build them (packages/language-pack-client/test/sample.ts and obsimg.ts
// at bt-synergy.ref, copied in shape, not imported: they are not part of the package): a small es-419 (Titus) with its common
// catalog, and a `zxx-obsimg` of shape [2, 1] (3 tiny images), all signed with a key made now and trusted with setTrustedKeys.
// They are served by a Bun.serve with the paths of spec/serving.md; the phone's store is fake-indexeddb (the client's own dev
// dependency), and localStorage a map. Every global is put back at the end: bun runs the test files in one process.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BUILDER, buildCatalog, buildCommon, buildLanguage, builtObsimgSegments, keyId, OBSIMG_CATALOG, parseTipnr, publicKeyOf, signCatalog,
  xtopicsView,
} from '@bt-synergy/language-pack-v3'
import { BTS_DIR } from './bts-dir'
import {
  addedStore, downloadLang, importPack, installedLangs, openAdded, openLang, reloadPacks, resetAddedStore, setPacksServers, setTrustedKeys,
} from '../src/packs'
import {
  downloadImages, exportImages, IMAGES, IMAGES_COUNT, imagesCredit, imagesInstalled, imagesLine, imagesOffer, importedLine, IW, localUrl,
  removeImages, UNIT,
} from '../src/obsimg'

const V3 = join(BTS_DIR, 'packages', 'language-pack-v3')
const DATA = join(V3, 'spec', 'tests', 'data')
const FAKE_IDB = join(BTS_DIR, 'packages', 'language-pack-client', 'node_modules', 'fake-indexeddb', 'build', 'esm', 'index.js')
const ES = 'es-419'
const about = { format: '3.0', publisher: 'unfoldingWord', origin: 'published', revision: 1, built: '2026-11-01T10:00:00Z', builder: BUILDER } as const
/** Bytes as a response body. */
const body = (b: Uint8Array) => b as Uint8Array<ArrayBuffer>

// ------------------------------------------------------------------------------------------------ the catalogs (as sample.ts)

type Built = { catalogs: Record<string, Uint8Array>; segments: Map<string, Uint8Array>; trusted: Record<string, Uint8Array>; images: string[]; imageBytes: number }

async function build(): Promise<Built> {
  const { partsSource } = await import(join(V3, 'src', 'node', 'partsSource.ts'))
  const parts = join(DATA, 'parts')
  const originals = join(DATA, 'originals', 'list.json')
  const source = (lang: string) => partsSource({ list: join(DATA, lang, 'list.json'), partsDir: parts, originals })
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
    source: await source('en'), about, mapLang: 'en',
    topics: { tipnr, theographic: { events: theo('events'), verses: theo('verses'), people: theo('people'), places: theo('places') }, obs },
  })
  const core = xtopicsView(common.segments.find((s: any) => s.seg.h.class === 'xtopics' && s.seg.h.part === 'core')!.seg) as any
  const lang = await buildLanguage({
    source: await source(ES), lang: ES, registry: {}, about, requires: [['common', about.revision, common.catalog.id]],
    topics: { xtopics: core, records: parseTipnr(tipnr, []) }, aligned: true,
  })
  // the images: two stories, frames [2, 1], as test/obsimg.ts makes them
  const image = (story: number, frame: number, bytes: number[]) => ({ story, frame, bytes: Uint8Array.from(bytes), media: 'image/webp', w: 640, h: 360 })
  const meta = { license: 'CC BY-SA 3.0', credit: 'Illustrations (c) Sweet Publishing, https://sweetpublishing.com', changes: 'converted to WebP quality 75', source: 'https://cdn.door43.org/obs/jpg/obs-images-360px.zip' }
  const imgs = await builtObsimgSegments([image(1, 1, [1, 2, 3]), image(1, 2, [4, 5]), image(2, 1, [6, 7, 8, 9])], meta, [2, 1])
  const imgCat = await buildCatalog({ about: { ...about, catalog: OBSIMG_CATALOG }, resources: [], segments: imgs })

  const { privateKey } = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey))
  const publicKey = await publicKeyOf(pkcs8)
  const segments = new Map<string, Uint8Array>()
  for (const s of [...common.segments, ...lang.segments, ...imgs] as { id: string; bytes: Uint8Array }[]) segments.set(s.id, s.bytes)
  return {
    catalogs: {
      [ES]: await signCatalog(lang.catalog.bytes, pkcs8),
      common: await signCatalog(common.catalog.bytes, pkcs8),
      [OBSIMG_CATALOG]: await signCatalog(imgCat.bytes, pkcs8),
    },
    segments,
    trusted: { [keyId(publicKey)]: publicKey },
    images: imgs.map((s: any) => s.id as string),
    imageBytes: imgs.reduce((t: number, s: any) => t + s.bytes.length, 0),
  }
}

// ------------------------------------------------------------------------------------------------ the server, the phone

let B: Built
/** bun's server (Bun.serve; typed loosely: the typecheck has no bun types) */
let server: { port: number; stop(force?: boolean): void }
/** Segment requests the server got, in order. */
const asked: string[] = []
/** A segment the server holds back until the test lets it go. */
let holdId: string | null = null
const held: (() => void)[] = []

const saved = { indexedDB: (globalThis as any).indexedDB, localStorage: (globalThis as any).localStorage }
let fake: any
const mem = new Map<string, string>()
const memStorage = {
  get length() { return mem.size },
  key: (i: number) => [...mem.keys()][i] ?? null,
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
}
/** A new, empty phone: its own IndexedDB (no old zip database to delete) and an empty localStorage. */
function newPhone() {
  ;(globalThis as any).indexedDB = new fake.IDBFactory()
  mem.clear()
  mem.set('btsm.obsimg.zipGone', '1')
  resetAddedStore()
}

beforeAll(async () => {
  fake = await import(FAKE_IDB)
  ;(globalThis as any).localStorage = memStorage
  B = await build()
  server = (globalThis as any).Bun.serve({
    port: 0,
    fetch(req: Request) {
      const path = new URL(req.url).pathname
      const seg = /^\/v3\/packs\/seg\/([0-9a-f]{64})$/.exec(path)
      if (seg) {
        const id = seg[1]!
        asked.push(id)
        const bytes = B.segments.get(id)
        if (!bytes) return new Response('no such segment', { status: 404 })
        if (id === holdId) return new Promise<Response>((resolve) => held.push(() => resolve(new Response(body(bytes)))))
        return new Response(body(bytes))
      }
      const cat = /^\/v3\/packs\/([^/]+)\/catalog$/.exec(path)
      const bytes = cat ? B.catalogs[decodeURIComponent(cat[1]!)] : undefined
      return bytes ? new Response(body(bytes)) : new Response('no pack', { status: 404 })
    },
  })
  setPacksServers([`http://127.0.0.1:${server.port}`])
  setTrustedKeys(B.trusted)
  newPhone()
}, 120000)

afterAll(() => {
  for (const f of held.splice(0)) f()
  server?.stop(true)
  setPacksServers()
  setTrustedKeys()
  resetAddedStore()
  // as they were: a global bun did not have is deleted, not left as undefined
  for (const k of ['indexedDB', 'localStorage'] as const) {
    if (saved[k] === undefined) delete (globalThis as any)[k]
    else (globalThis as any)[k] = saved[k]
  }
})

/** Whether the unit is installed, as the client reads it (a catalog not active yet cannot be opened at all). */
async function unitInstalled(): Promise<boolean> {
  try {
    return (await openAdded(IMAGES)).installed(UNIT)
  } catch {
    return false
  }
}
const storeIds = async () => new Set(await (await addedStore()).ids())
/** Starts a download, lets the first segment in, holds the second, and cancels: what a person who taps Cancel leaves. */
async function cutDownload() {
  const offer = (await imagesOffer())!
  holdId = offer.segments[1]!
  asked.length = 0
  const c = new AbortController()
  let firstIn!: () => void
  const gotFirst = new Promise<void>((r) => (firstIn = r))
  const run = downloadImages((p) => { if (p.done >= 1) firstIn() }, c.signal, offer)
  await gotFirst
  // the prefetch asked for the second already: the server holds it, and the person cancels
  expect(asked).toContain(offer.segments[1]!)
  c.abort(new Error('canceled'))
  await expect(run).rejects.toThrow()
  holdId = null
  return offer
}
const bytesAt = async (u: string | null) => (u ? [...new Uint8Array(await (await fetch(u)).arrayBuffer())] : null)

describe('zxx-obsimg, the pictures as a catalog', () => {
  test('offered with its size, read from the server', async () => {
    const offer = await imagesOffer()
    expect(offer).not.toBeNull()
    expect(offer!.bytes).toBe(B.imageBytes)
    expect([...offer!.segments].sort()).toEqual([...B.images].sort())
  })

  test('a cut download can be removed: what arrived leaves the store, and the menu offers a new download', async () => {
    const offer = await cutDownload()
    expect(await imagesInstalled()).toEqual({ partial: true })
    expect((await storeIds()).has(offer.segments[0]!)).toBe(true)
    await removeImages()
    expect(await imagesInstalled()).toBeNull()
    const ids = await storeIds()
    expect(offer.segments.some((id) => ids.has(id))).toBe(false)
    expect(mem.has('btsm.obsimg.segments')).toBe(false)
  }, 60000)

  test('a download cut after the first segment shows nothing; "Continue" fetches only what is missing', async () => {
    const offer = await cutDownload()
    const [first, second] = offer.segments
    expect(await unitInstalled()).toBe(false)
    expect(await imagesInstalled()).toEqual({ partial: true })
    expect(imagesLine('es', { partial: true })).toBe(IW('es').partial)
    expect(await localUrl(1, 1)).toBeNull()
    // again: only the missing segment is asked for, and the pictures are whole
    asked.length = 0
    let last = { done: 0, total: 0 }
    const got = await downloadImages((p) => (last = p))
    expect(asked).toEqual([second!])
    expect(asked).not.toContain(first!)
    expect(last.done).toBe(last.total) // the segment there already counted from the start
    expect(got.bytes).toBeGreaterThan(0)
    expect(await unitInstalled()).toBe(true)
    expect(await imagesInstalled()).toEqual({ bytes: B.imageBytes })
    expect(mem.has('btsm.obsimg.segments')).toBe(false)
  }, 60000)

  test("a frame's picture comes from the catalog; a frame it does not have gives none", async () => {
    const u = await localUrl(1, 2)
    expect(u).toStartWith('blob:')
    expect(await localUrl(1, 2)).toBe(u) // made once
    expect(await bytesAt(u)).toEqual([4, 5])
    expect(await bytesAt(await localUrl(2, 1))).toEqual([6, 7, 8, 9])
    expect(await localUrl(2, 2)).toBeNull()
    expect(await localUrl(3, 1)).toBeNull()
    // another pack changes (a language downloaded, removed, updated): the URL drawn before still holds (a lazy picture loads)
    reloadPacks()
    expect(await localUrl(1, 2)).toBe(u)
    // a failed read of the store is tried again, not kept as "no pictures"
    const idb = (globalThis as any).indexedDB
    ;(globalThis as any).indexedDB = undefined
    resetAddedStore()
    expect(await localUrl(1, 2)).toBeNull()
    ;(globalThis as any).indexedDB = idb
    resetAddedStore()
    expect(await localUrl(1, 2)).toBe(u)
    expect(await imagesCredit()).toBe('Illustrations (c) Sweet Publishing, https://sweetpublishing.com · CC BY-SA 3.0')
  })

  test('the pictures are never a language', async () => {
    expect(await installedLangs()).not.toContain(IMAGES)
    expect((await installedLangs()).some((l) => l.startsWith('zxx-'))).toBe(false)
  })

  test('removing them leaves a language in the same store as it was', async () => {
    await downloadLang(ES)
    expect(await installedLangs()).toContain(ES)
    expect((await openLang(ES)).installed('book:tit')).toBe(true)
    const images = new Set(B.images)
    const before = await storeIds()
    // the language's and common's segments (the store also keeps each catalog's own file: the pictures' goes with them)
    const others = [...before].filter((id) => B.segments.has(id) && !images.has(id))
    expect(B.images.every((id) => before.has(id))).toBe(true)
    expect(others.length).toBeGreaterThan(0)
    await removeImages()
    const after = await storeIds()
    expect(B.images.some((id) => after.has(id))).toBe(false)
    expect(others.filter((id) => !after.has(id))).toEqual([]) // every segment of the language and common is still there
    expect(await imagesInstalled()).toBeNull()
    expect(await unitInstalled()).toBe(false)
    expect(await localUrl(1, 2)).toBeNull()
    expect(await installedLangs()).toContain(ES)
    expect((await openLang(ES)).installed('book:tit')).toBe(true)
  }, 120000)

  test('shared as a .tcpack and loaded on an empty phone: the pictures, no language; the menu says so', async () => {
    await downloadImages()
    const file = await exportImages()
    expect(file.length).toBeGreaterThan(B.imageBytes)
    newPhone()
    expect(await imagesInstalled()).toBeNull()
    const r = await importPack(file)
    expect(r).toEqual({ langs: [], rejected: 0, images: true })
    const have = await imagesInstalled()
    expect(have).toEqual({ bytes: B.imageBytes })
    expect(await bytesAt(await localUrl(1, 1))).toEqual([1, 2, 3])
    const failed = 'Did not work:'
    expect(importedLine('es', r, have, failed)).toBe(imagesLine('es', have))
    expect(importedLine('es', r, have, failed)).toStartWith(`${IMAGES_COUNT} imágenes · `)
    expect(importedLine('es', { langs: [ES], rejected: 0, images: true }, have, failed)).toBe(`Español (Latinoamérica) ✓ · ${imagesLine('es', have)}`)
    expect(importedLine('es', { langs: [], rejected: 2 }, null, failed)).toBe(`${failed} 2`)
    // a file that named the pictures but did not leave them on the phone is not reported as a success
    expect(importedLine('es', { langs: [], rejected: 1, images: true }, null, failed)).toBe(`${failed} 1`)
    expect(await installedLangs()).toEqual([])
  }, 60000)
})

describe('the old zip', () => {
  /** A phone's IndexedDB whose deleteDatabase is watched: the calls counted, and `blocked` answers as a database still open would. */
  function watched(blocked: boolean) {
    const real = new fake.IDBFactory()
    const calls: string[] = []
    real.deleteDatabase = (name: string) => {
      calls.push(name)
      const r: any = {}
      setTimeout(() => (blocked ? r.onblocked?.({}) : r.onsuccess?.({})), 0)
      return r
    }
    ;(globalThis as any).indexedDB = real
    resetAddedStore()
    mem.clear()
    return calls
  }

  test('its database is deleted the first time the state is read, and only then', async () => {
    const calls = watched(false)
    await imagesInstalled()
    await imagesInstalled()
    expect(calls).toEqual(['btsm-obsimg'])
    expect(mem.get('btsm.obsimg.zipGone')).toBe('1')
  })

  test('a delete that is blocked leaves no mark, and is tried again', async () => {
    const calls = watched(true)
    expect(await imagesInstalled()).toBeNull()
    expect(mem.has('btsm.obsimg.zipGone')).toBe(false)
    await imagesInstalled()
    expect(calls).toEqual(['btsm-obsimg', 'btsm-obsimg'])
  })
})

describe('words', () => {
  test('the menu line: the pictures and their size, or how to get them', () => {
    expect(imagesLine('es', { bytes: 21076377 })).toBe('598 imágenes · 20.1 MB ✓')
    expect(imagesLine('en', null)).toBe(IW('en').none)
    expect(imagesLine('en', { partial: true })).toBe(IW('en').partial)
  })
})
