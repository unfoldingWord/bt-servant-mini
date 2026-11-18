// Language packs (format 3) in two layers: the ones shipped in the app (assets/www/packs, read-only; none in the light
// build), and the ones the person adds — downloaded from the packs server or imported from a .tcpack file (SD card, phone
// memory, another phone) — kept in the page's IndexedDB. A language lives in one layer: an added one wins.
import {
  ClientError, createClient, emptyState, httpSource, indexedDbStore, planInstall, verifyCatalogFile,
  type BlobStore, type PackReader, type PackSource, type VerifiedCatalog,
} from '@bt-synergy/language-pack-client'
import { PACKS_SERVERS, SHARED_UNITS, trustedKeys } from './shared'
import { CANON } from './canon'
import { partsOfUnits, type PartLine } from './modules'
export { CANON } from './canon'

const BASE = './packs'
/** The pack lists change when the app is rebuilt: never take them from the browser cache. */
const NOCACHE: RequestInit = { cache: 'no-store' }
/** The first packs server (the others are tried after it: packsServers, serverSource). */
export const PACKS_SERVER = PACKS_SERVERS[0]!
/** Languages Door43 marks tc-ready (Nov 2026): the ones the server may have packs for. */
export const CANDIDATES = ['en', 'es-419', 'id', 'hi', 'ar', 'fr', 'bn', 'gu', 'kn', 'mr', 'ne', 'or', 'te', 'fa', 'ru', 'pt-br', 'sw']
/** The packs' names, as their speakers write them. */
export const PACK_NAMES: Record<string, string> = {
  en: 'English', 'es-419': 'Español (Latinoamérica)', id: 'Bahasa Indonesia', hi: 'हिन्दी', ar: 'العربية', fr: 'Français', bn: 'বাংলা',
  gu: 'ગુજરાતી', kn: 'ಕನ್ನಡ', mr: 'मराठी', ne: 'नेपाली', or: 'ଓଡ଼ିଆ', te: 'తెలుగు', fa: 'فارسی', ru: 'Русский', 'pt-br': 'Português', sw: 'Kiswahili',
}
/**
 * The catalogs with no language in them (`zxx` = no linguistic content): installed in the same store, never listed or updated as a
 * language. The Open Bible Stories pictures (obsimg.ts) are the only one.
 */
export const IMAGES_CATALOG = 'zxx-obsimg'
const notALanguage = (name: string) => name === 'common' || name.startsWith('zxx-')

// ------------------------------------------------------------------------------------------------------------ servers

let servers: readonly string[] = PACKS_SERVERS
/** The packs servers, in the order they are tried. */
export const packsServers = (): readonly string[] => servers
/** Tests and local runs (a `wrangler dev` of packs-server): download from these servers instead; no argument puts the app's back. */
export function setPacksServers(list?: readonly string[]) {
  servers = list?.length ? [...list] : PACKS_SERVERS
  commonCats.clear()
}

/**
 * A fetch that gives up on a server that stops answering, never on one that is only slow: no response headers within
 * `headerMs`, or no new bytes of the body for `stallMs`. A healthy transfer may take as long as it needs (a 1.3 MB segment on a
 * slow rural link takes minutes). Either way the request ends with a network error, so the next server is asked. The caller's
 * own signal still cancels at once.
 */
export function watchedFetch(base: typeof fetch, headerMs: number, stallMs: number): typeof fetch {
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const c = new AbortController()
    const outer = init.signal ?? undefined
    let stopBody: ((e: unknown) => void) | null = null
    const cancel = () => {
      c.abort(outer?.reason)
      stopBody?.(outer?.reason) // the body as well, whatever the runtime does with the signal once the headers are in
    }
    if (outer?.aborted) cancel()
    else outer?.addEventListener('abort', cancel, { once: true })
    const release = () => outer?.removeEventListener('abort', cancel)
    let timer: ReturnType<typeof setTimeout> | undefined
    const gaveUp = (why: string) => new ClientError('E_NETWORK', why)
    let res: Response
    try {
      res = await new Promise<Response>((resolve, reject) => {
        timer = setTimeout(() => {
          const e = gaveUp(`no answer in ${Math.round(headerMs / 1000)} s`)
          c.abort(e)
          reject(e)
        }, headerMs)
        base(input, { ...init, signal: c.signal }).then(resolve, reject)
      })
    } catch (e) {
      release()
      throw e
    } finally {
      clearTimeout(timer)
    }
    // no body to watch: none at all, or a status that cannot have one (a 304 to a refresh with its ETag: Chrome and Android's
    // WebView give it an empty body, and a new Response with that status and a body throws)
    if (!res.body || res.status === 204 || res.status === 205 || res.status === 304) {
      release()
      return res
    }
    const reader = res.body.getReader()
    let out!: ReadableStreamDefaultController<Uint8Array>
    let ended = false
    const end = () => {
      ended = true
      clearTimeout(timer)
      release()
    }
    const stop = (e: unknown) => {
      if (ended) return
      end()
      c.abort(e)
      reader.cancel(e).catch(() => {})
      try {
        out.error(e)
      } catch {}
    }
    stopBody = stop
    const watch = () => {
      clearTimeout(timer)
      timer = setTimeout(() => stop(gaveUp(`no data for ${Math.round(stallMs / 1000)} s`)), stallMs)
    }
    const body = new ReadableStream<Uint8Array>({
      start(ctrl) {
        out = ctrl
        watch()
      },
      async pull(ctrl) {
        try {
          const { done, value } = await reader.read()
          if (ended) return
          if (done) {
            end()
            ctrl.close()
          } else {
            watch()
            ctrl.enqueue(value)
          }
        } catch (e) {
          if (ended) return
          end()
          ctrl.error(e)
        }
      },
      cancel(reason) {
        end()
        return reader.cancel(reason)
      },
    })
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers })
  }) as typeof fetch
}
/** The server answered that it does not have it (a 404): the next one may, but this one is not down. */
const notThere = (e: unknown) => e instanceof ClientError && (e.code === 'E_NO_PACK' || e.status === 404)

/** Whether a catalog a server sent may be used: false sends the request to the next server (see `newerOnly`). */
export type Accept = (name: string, bytes: Uint8Array) => Promise<boolean>
/**
 * The packs servers as one source: each request goes to the first server, and to the next one when that fails (no answer, a
 * server error, a 404, no answer in time) or, for a catalog, when `accept` turns it down. A server that fails without answering
 * (down, or not reachable from this network) goes last for the rest of this source's requests, so a download does not wait
 * for it again on every segment. The servers hold the same files: a catalog from one and its segments from another install
 * the same pack (every segment is checked against its id, every catalog against the trusted keys). Only the caller's own
 * signal (a cancel) stops at once. A server that stops answering is left (watchedFetch: no headers in `catalogMs` for a
 * catalog or `headerMs` for a segment, or no bytes for `stallMs`); a slow one is waited for. When every server's catalog is
 * turned down, the first one is given, and the client reports why (an older revision: E_DOWNGRADE).
 */
export function serverSource(
  list: readonly string[] = servers,
  o: { fetch?: typeof fetch; catalogMs?: number; headerMs?: number; stallMs?: number; accept?: Accept } = {},
): PackSource {
  const f: typeof fetch = o.fetch ?? ((i, init) => fetch(i, init))
  const stall = o.stallMs ?? STALL_MS
  const catalogs = list.map((base) => httpSource({ base, fetch: watchedFetch(f, o.catalogMs ?? CATALOG_MS, stall) }))
  const segments = list.map((base) => httpSource({ base, fetch: watchedFetch(f, o.headerMs ?? HEADER_MS, stall) }))
  let order = list.map((_, i) => i)
  async function attempt<T>(
    sources: PackSource[], run: (s: PackSource, signal?: AbortSignal) => Promise<T>, outer: AbortSignal | undefined, missingWins: boolean,
    ok: (v: T) => Promise<boolean> = async () => true,
  ): Promise<T> {
    let failure: unknown
    let missing: unknown
    let refused: { v: T } | undefined
    for (const i of [...order]) {
      try {
        const v = await run(sources[i]!, outer)
        if (await ok(v)) return v
        refused ??= { v } // this server is behind: the next one may have it
      } catch (e) {
        if (outer?.aborted) throw e
        if (notThere(e)) missing ??= e
        else {
          failure ??= e
          order = [...order.filter((x) => x !== i), i] // down: asked last from now on
        }
      }
    }
    if (refused) return refused.v
    // every server failed: for a catalog, a server that answered "no pack" is the answer; for a segment, the failure
    throw (missingWins ? missing ?? failure : failure ?? missing) ?? new ClientError('E_NETWORK', 'no packs server')
  }
  const accept = o.accept
  return {
    catalog: (name, opts = {}) =>
      attempt(
        catalogs, (s, signal) => s.catalog(name, { ...(opts.etag !== undefined ? { etag: opts.etag } : {}), ...(signal ? { signal } : {}) }),
        opts.signal, true,
        async (v) => !accept || v === 'not-modified' || (await accept(name, v.bytes)),
      ),
    segment: (id, signal) => attempt(segments, (s, sig) => s.segment(id, sig), signal, false),
  }
}

/**
 * Turns down a catalog older than the one this phone already has (a server whose copy fell behind): the client would refuse
 * it (E_DOWNGRADE) and never ask the next server. A catalog that does not verify is left to the client to reject.
 */
export function newerOnly(store: () => Promise<BlobStore>): Accept {
  return async (_name, bytes) => {
    try {
      const v = await verifyCatalogFile(bytes, trust, { from: 'network' })
      const st: any = await (await store()).getState()
      const have = st?.published?.[v.name]
      return !have || have.publisher !== v.publisher || v.revision >= have.revision
    } catch {
      return true
    }
  }
}

// ------------------------------------------------------------------------------------------------- shipped (assets)

// the promise is kept, not its result: a reset (reloadPacks) while a read is on its way is not undone when the old read ends
let index: Promise<string[]> | null = null
function shipped(): Promise<string[]> {
  if (!index) {
    const p: Promise<string[]> = fetch(`${BASE}/index.json`, NOCACHE)
      .then((r) => r.json())
      .then((j) => (Array.isArray(j?.langs) ? (j.langs as string[]) : []))
      .catch(() => {
        if (index === p) index = null // not kept: the next call tries again
        return []
      })
    index = p
  }
  return index
}
const ID_RE = /^[0-9a-f]{64}$/
function assetStore(lang: string): BlobStore {
  const dir = `${BASE}/${lang}`
  let ids: Promise<string[]> | null = null
  const ro = async () => {
    throw new Error('read-only pack store')
  }
  return {
    async has(id) {
      return ID_RE.test(id) && (await this.ids()).includes(id)
    },
    async get(id) {
      if (!ID_RE.test(id)) return undefined
      const r = await fetch(`${dir}/seg/${id.slice(0, 2)}/${id}`)
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : undefined
    },
    put: ro,
    delete: ro,
    setState: ro,
    ids() {
      if (!ids) {
        const p: Promise<string[]> = fetch(`${dir}/ids.json`, NOCACHE).then((r) => r.json())
        p.catch(() => { if (ids === p) ids = null })
        ids = p
      }
      return ids
    },
    async getState() {
      const r = await fetch(`${dir}/state.json`, NOCACHE)
      return r.ok ? r.json() : undefined
    },
  }
}

// --------------------------------------------------------------------------------------------------- added (IndexedDB)

let idb: Promise<BlobStore> | null = null
const added = () => (idb ??= indexedDbStore({ name: 'btsm-packs' }))
// one object, shared by every client and check here (offerOf, newerOnly, addedClient): setTrustedKeys changes it in place
const trust = { trustedKeys: trustedKeys() }
/** Tests: trust these keys instead of the app's (no argument puts the app's back). */
export function setTrustedKeys(list?: Record<string, Uint8Array>) {
  trust.trustedKeys = list ?? trustedKeys()
  commonCats.clear()
}
const addedSource = () => serverSource(servers, { accept: newerOnly(added) })
/** The client of the phone's own store (what was downloaded or loaded from a file). */
export const addedClient = async () => createClient({ store: await added(), source: addedSource(), trust })
/** The phone's own store. */
export const addedStore = (): Promise<BlobStore> => added()
/** A catalog of the phone's own store opened by name, not as a language (zxx-obsimg; openLang is only for languages). */
export async function openAdded(name: string): Promise<PackReader> {
  return (await addedClient()).open(name)
}
/** Tests: forget the store opened (the next use opens the page's IndexedDB again) and every reader. */
export function resetAddedStore() {
  idb = null
  changed()
}

/** The languages with units in the phone's store, complete or not (not common, not a zxx-* catalog such as the pictures). */
async function storedLangs(): Promise<string[]> {
  try {
    const st: any = await (await added()).getState()
    return Object.keys(st?.active ?? {}).filter((l) => !notALanguage(l))
  } catch {
    return []
  }
}
/** The added languages that are whole: a download that did not end (cancelled, failed, the app closed) does not count. */
async function addedLangs(): Promise<string[]> {
  const part = partialLangs()
  return (await storedLangs()).filter((l) => !part.includes(l))
}

// A download that has not ended is marked (per language, before the first byte, cleared when it ends well), so a language half
// on the phone is offered again ("Continue") instead of counting as installed. On a phone with little memory Android may close
// the app in the middle of a download: the mark survives that.
const PARTIAL = 'btsm.partial.'
function kv(): Storage | null {
  try {
    return (globalThis as any).localStorage ?? null
  } catch {
    return null
  }
}
/** The languages whose download started and did not end. */
export function partialLangs(): string[] {
  const s = kv()
  if (!s) return []
  const out: string[] = []
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)
      if (k?.startsWith(PARTIAL)) out.push(k.slice(PARTIAL.length))
    }
  } catch {}
  return out
}
/** What a cut download leaves in its mark: the bytes of the whole download (`b`), to show "a / b MB" with no internet. A language always downloads whole. */
export type PartialMark = { b: number }
/** The mark of a language whose download did not end; null when there is none, or it is the old '1' (no data in it). */
export function partialMark(lang: string): PartialMark | null {
  try {
    const raw = kv()?.getItem(PARTIAL + lang)
    if (!raw || raw === '1') return null // the first versions wrote '1': the language is still partial (partialLangs), nothing more is known
    const b = Number(JSON.parse(raw)?.b)
    return b > 0 ? { b } : null
  } catch {
    return null
  }
}
/** Marks the start of a download (with its total bytes) or its end; whether the write worked (no storage, or it is full: false). */
export function markPartial(lang: string, on: true, b: number): boolean
export function markPartial(lang: string, on: false): boolean
export function markPartial(lang: string, on: boolean, b?: number): boolean {
  try {
    const s = kv()
    if (!s) return false
    if (on) s.setItem(PARTIAL + lang, JSON.stringify({ b }))
    else s.removeItem(PARTIAL + lang)
    return true
  } catch {
    return false
  }
}

// ------------------------------------------------------------------------------------------------------------ reading

/** The packs on the phone in the app's language ("es" -> "es-419"), for the titles a button shows (OBS, Academy). */
export const uiLangs = (ui: string, have: readonly string[]): string[] => have.filter((l) => l.split('-')[0] === ui.split('-')[0])
export async function installedLangs(): Promise<string[]> {
  const [a, b] = await Promise.all([shipped(), addedLangs()])
  return [...new Set([...a, ...b])]
}
export async function hasLang(lang: string): Promise<boolean> {
  return (await installedLangs()).includes(lang)
}
/** Where a language comes from, for the list in the menu. */
export async function origin(lang: string): Promise<'added' | 'shipped' | null> {
  if ((await addedLangs()).includes(lang)) return 'added'
  return (await shipped()).includes(lang) ? 'shipped' : null
}

const noNetwork = { fetch: async () => { throw new Error('offline') } } as any
const open = new Map<string, Promise<PackReader>>()
export function openLang(lang: string): Promise<PackReader> {
  if (!open.has(lang)) {
    const p = (async () => {
      if ((await addedLangs()).includes(lang)) return (await addedClient()).open(lang)
      return createClient({ store: assetStore(lang), source: noNetwork, trust }).open(lang)
    })()
    open.set(lang, p)
    // a failed open is not kept: one failure (at the app's start, say) must not break every later read of the language
    p.catch(() => { if (open.get(lang) === p) open.delete(lang) })
  }
  return open.get(lang)!
}
const listeners: (() => void)[] = []
/** Called after a language is added or removed, so every cache that holds readers can drop them. */
export function onPacksChanged(f: () => void) {
  listeners.push(f)
}
function changed() {
  open.clear()
  for (const f of listeners) f()
}
/** Tests: read the shipped list again and drop the open readers (web/tests/fs-packs.ts). */
export function reloadPacks() {
  index = null
  changed()
}

// ------------------------------------------------------------------------------------------------------------ adding

/** What the server offers for a language: its books, the size of the whole download, and the segments in install order. */
export type Offer = {
  lang: string; books: string[]; bytes: number; segments: string[]; sizes: Record<string, number>
  /** a download of it started and did not end: what arrived stays, the next one goes on from there */
  partial?: boolean
  /** whether Open Bible Stories come with it (the catalog lists them, of any size) */
  obs?: boolean
  /** every unit the plan installs (books, maps, articles, obs), without the language prefix: what `downloadLang` installs */
  units: string[]
  /** the parts it brings, for the screen (modules.ts) */
  parts: PartLine[]
}
/** A signal that aborts after `ms` (AbortSignal.timeout where the WebView has it). */
function timeout(ms: number): AbortSignal {
  if (typeof (AbortSignal as any).timeout === 'function') return (AbortSignal as any).timeout(ms)
  const c = new AbortController()
  setTimeout(() => c.abort(new Error('timeout')), ms)
  return c.signal
}
/** How long a catalog request may take before it counts as no answer. */
export const CATALOG_MS = 15000
/** How long a server may take to start answering a segment request before the next server is asked. */
export const HEADER_MS = 30000
/** How long a download may go without a single new byte before the next server is asked (slow is fine; stopped is not). */
export const STALL_MS = 60000
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
/**
 * The map units a language installs with its books: the client's default units as they were up to bt-synergy c68e3622. Since
 * #86 the client's defaults also bring `obs` (Open Bible Stories); Mini names its units itself (`defaults: false`).
 */
export const MAP_UNITS = ['xmap', 'map', 'xtopics', 'topics']
/**
 * Open Bible Stories (Abel, Nov 15–16, changed Nov 18): a download of a language brings them whatever they weigh. OBS_MAX (the
 * obs units are 60–288 KB, Nov 2026) now only limits the daily update (`updateLang`), which never takes them over mobile data.
 * A language that does not list it installs as before (the client skips a unit its catalog does not have). A phone that installed a language before gets it from the daily update
 * (`updateLang`, not on a metered connection), or on a tap under an OBS answer (`addUnits`).
 */
export const OBS_UNIT = 'obs'
/** The largest obs unit the daily update adds to a language on its own (Abel: 3 MB). */
export const OBS_MAX = 3 * 1024 * 1024
/**
 * What `offerOf` plans and `downloadLang` installs: the map units, the books, the shared articles, in the order the client's
 * defaults gave them (defaults, then books, then units); Open Bible Stories with the defaults, where the client puts them,
 * unless `obs` is false.
 */
export function installWant(books: readonly string[], obs = true): { defaults: false; units: string[] } {
  return { defaults: false, units: [...MAP_UNITS, ...(obs ? [OBS_UNIT] : []), ...books.map((b) => `book:${b}`), ...SHARED_UNITS] }
}
const commonCats = new Map<string, Promise<VerifiedCatalog | null>>()
/** The language's catalog on the packs server and the common catalogs it names, verified; null when the server has none. */
async function serverCatalogs(lang: string, source: PackSource): Promise<VerifiedCatalog[] | null> {
  // each server gets CATALOG_MS (serverSource); this is the time for all of them
  const wait = () => timeout(CATALOG_MS * Math.max(1, servers.length))
  const got = await source.catalog(lang, { signal: wait() })
  if (got === 'not-modified') return null
  const cat = await verifyCatalogFile(got.bytes, trust, { from: 'network' })
  const catalogs = [cat]
  for (const [rname, , rid] of cat.catalog.requires ?? []) {
    const id = hex(rid)
    if (!commonCats.has(id)) {
      commonCats.set(id, (async () => {
        const c = await source.catalog(rname, { signal: wait() })
        if (c === 'not-modified') return null
        const v = await verifyCatalogFile(c.bytes, trust, { from: 'network' })
        return v.id === id ? v : null
      })().catch(() => null))
    }
    const common = await commonCats.get(id)!
    if (!common) commonCats.delete(id) // try again next time (the server may be ahead or behind for a moment)
    else catalogs.push(common)
  }
  return catalogs
}
/**
 * The download size of one unit of a language as the packs server lists it now (`obs` for a phone whose packs were installed
 * before the server had Open Bible Stories), or null: not listed, no server, no internet.
 */
export async function serverUnitSize(lang: string, unit: string, source: PackSource = serverSource()): Promise<number | null> {
  try {
    const catalogs = await serverCatalogs(lang, source)
    if (!catalogs?.[0]?.catalog.units.some((u) => u.id === unit)) return null
    const plan = planInstall(catalogs, emptyState(), { defaults: false, units: [unit] }, new Set())
    const bytes = plan.steps.filter((st) => st.key.endsWith(`/${unit}`)).reduce((n, st) => n + st.segments.reduce((k, x) => k + x.size, 0), 0)
    return bytes > 0 ? bytes : null
  } catch {
    return null
  }
}
/**
 * Reads the language's catalog (a few KB) and the common catalog it names, and plans the same install `downloadLang` runs, so the
 * size shown before the download is the size downloaded. Null when the server has no pack for it (or no internet).
 */
export async function offerOf(lang: string, source: PackSource = serverSource()): Promise<Offer | null> {
  try {
    const catalogs = await serverCatalogs(lang, source)
    if (!catalogs) return null
    const cat = catalogs[0]!
    const listed = new Set(cat.catalog.units.map((u) => u.id))
    const books = CANON.filter((b) => listed.has(`book:${b}`))
    // one plan with everything, the Stories too whatever they weigh (OBS_MAX only limits the daily update now)
    const plan = planInstall(catalogs, emptyState(), installWant(books), new Set())
    const obsStep = plan.steps.find((st) => st.key.endsWith(`/${OBS_UNIT}`))
    const obs = !!obsStep
    const units = [...new Set(plan.steps.map((st) => st.key.slice(st.key.indexOf('/') + 1)))]
    const sizes: Record<string, number> = {}
    for (const st of plan.steps) for (const x of st.segments) sizes[x.id] = x.size
    return {
      lang, books, bytes: plan.bytes, segments: Object.keys(sizes), sizes, obs, units, parts: partsOfUnits(units),
      ...(partialLangs().includes(lang) ? { partial: true } : {}),
    }
  } catch {
    return null
  }
}

/** The languages `offers` asks the server about: the candidates the phone does not have ("n of total" on the server screen). */
export async function offerCandidates(): Promise<string[]> {
  const have = await installedLangs()
  return CANDIDATES.filter((l) => !have.includes(l))
}
/**
 * Languages the packs server has and this phone does not, with their download size: one small catalog request each (needs
 * internet). `onEach` hears of each language as it answers (the offer, or null: none or no answer), so a screen can fill in
 * while the rest are still asked; the list of all of them comes at the end.
 */
export async function offers(onEach?: (o: Offer | null, lang: string) => void): Promise<Offer[]> {
  const got = await Promise.all((await offerCandidates()).map(async (l) => {
    const o = await offerOf(l)
    try { onEach?.(o, l) } catch { /* a screen that fails to draw must not lose the others */ }
    return o
  }))
  return got.filter((o): o is Offer => !!o)
}
/** Languages the packs server has and this phone does not (needs internet). */
export async function availableLangs(): Promise<string[]> {
  return (await offers()).map((o) => o.lang)
}

/**
 * A source that fetches the segments of a known install order `ahead` at a time: the client asks for them one after the other,
 * and each request now finds the next ones already on their way (the pack is many small files; one at a time, the round trips
 * add up). A failure reaches the client when it asks for that segment, as before.
 */
export function prefetching(source: PackSource, order: string[], ahead = 6): PackSource {
  const pos = new Map(order.map((id, i) => [id, i]))
  const flying = new Map<string, Promise<Uint8Array>>()
  let next = 0 // the first index of `order` not started yet
  const start = (id: string, signal?: AbortSignal) => {
    const p = source.segment(id, signal)
    p.catch(() => {}) // a failure is seen when the client asks for it
    flying.set(id, p)
  }
  return {
    catalog: (name, o) => source.catalog(name, o),
    segment(id, signal) {
      const i = pos.get(id)
      if (i === undefined) return source.segment(id, signal)
      if (!flying.has(id)) start(id, signal)
      const p = flying.get(id)!
      flying.delete(id)
      next = Math.max(next, i + 1)
      for (; next < order.length && next < i + ahead; next++) if (!flying.has(order[next]!)) start(order[next]!, signal)
      return p
    },
  }
}

export type Progress = { done: number; total: number; bytes: number; totalBytes: number }
/**
 * Downloads every book the server lists for `lang`, with the shared articles, into the phone. `offer` (from `offers`) saves
 * reading the catalog again; `signal` cancels (what is complete stays, and a retry goes on from there). A language always
 * downloads whole: everything the offer brings, the Stories too (`offer.units`).
 */
export async function downloadLang(
  lang: string,
  onProgress?: (p: Progress) => void,
  o: { offer?: Offer | null; signal?: AbortSignal; ahead?: number } = {},
): Promise<{ books: number; bytes: number }> {
  const http = addedSource()
  const offer = o.offer ?? (await offerOf(lang, http))
  if (!offer) throw new Error(`no pack for ${lang} on the server`)
  const store = await added()
  // after a cancel or a failure, what already arrived counts as done (the install does not fetch it again)
  const have = new Set(await store.ids().catch(() => [] as string[]))
  const before = offer.segments.filter((id) => have.has(id))
  const already = before.reduce((n, id) => n + (offer.sizes[id] ?? 0), 0)
  const order = offer.segments.filter((id) => !have.has(id))
  const client = createClient({ store, source: prefetching(http, order, o.ahead ?? 6), trust })
  // a language already whole that gets an update stays usable meanwhile; a new one is marked until its download ends well
  const fresh = !(await addedLangs()).includes(lang)
  // the size stays in the mark, so "n / b MB" shows with no internet; a mark that cannot be written does not stop the download
  if (fresh && !markPartial(lang, true, offer.bytes)) console.warn(`the download mark of ${lang} could not be written`)
  try {
    // one request at a time from the client (it asks 4 at once by default): the prefetch above already keeps `ahead` in flight,
    // and more at once can trip the fallback's timeouts on a slow link
    const report = await serial(() => client.install(lang, { defaults: false, units: offer.units }, {
      concurrency: 1,
      ...(o.signal ? { signal: o.signal } : {}),
      onProgress: (p) => onProgress?.({ done: before.length + p.done, total: before.length + p.total, bytes: already + p.bytes, totalBytes: offer.bytes }),
    }))
    markPartial(lang, false)
    return { books: offer.books.length, bytes: report.bytes ?? 0 }
  } finally {
    // what is complete was activated even after a cancel or a failure: every cache that holds readers drops them
    changed()
  }
}

/** What the server offers for a catalog that is not a language (the pictures): the size of `want`, its segments in install order. */
export type CatalogOffer = { bytes: number; segments: string[]; sizes: Record<string, number> }
/**
 * Reads a catalog with no language around it (no `requires`: zxx-obsimg) and plans the install of `want` in it, as offerOf does
 * for a language, so the size shown is the size downloaded. Null without internet or when no server has it.
 */
export async function catalogOffer(name: string, want: { units: string[]; defaults: false }, source: PackSource = serverSource()): Promise<CatalogOffer | null> {
  try {
    const got = await source.catalog(name, { signal: timeout(CATALOG_MS * Math.max(1, servers.length)) })
    if (got === 'not-modified') return null
    const cat = await verifyCatalogFile(got.bytes, trust, { from: 'network' })
    if (cat.name !== name) return null
    const plan = planInstall([cat], emptyState(), want, new Set())
    const sizes: Record<string, number> = {}
    for (const st of plan.steps) for (const x of st.segments) sizes[x.id] = x.size
    return { bytes: plan.bytes, segments: Object.keys(sizes), sizes }
  } catch {
    return null
  }
}
/**
 * Downloads `want` of a catalog that is not a language into the phone, as downloadLang does (one request at a time from the
 * client, `ahead` prefetched; what is in the store already counts as done from the start and is not fetched again; `signal`
 * cancels, what arrived stays). No partial mark (a zxx-* catalog is never a language): the caller keeps its own. A catalog
 * stored already (a cut download) is read again first, so the install follows the same revision as `offer` (else a revision
 * published meanwhile would be planned from one catalog and installed from the other).
 */
export async function downloadCatalog(
  name: string, want: { units: string[]; defaults: false }, offer: CatalogOffer, onProgress?: (p: Progress) => void,
  o: { signal?: AbortSignal; ahead?: number } = {},
): Promise<{ bytes: number }> {
  const http = addedSource()
  const store = await added()
  const have = new Set(await store.ids().catch(() => [] as string[]))
  const before = offer.segments.filter((id) => have.has(id))
  const already = before.reduce((n, id) => n + (offer.sizes[id] ?? 0), 0)
  const order = offer.segments.filter((id) => !have.has(id))
  const client = createClient({ store, source: prefetching(http, order, o.ahead ?? 6), trust })
  try {
    const report = await serial(async () => {
      const st: any = await store.getState().catch(() => undefined)
      if (st?.published?.[name]) await client.refresh(name, o.signal ? { signal: o.signal } : {})
      return client.install(name, want, {
        concurrency: 1,
        ...(o.signal ? { signal: o.signal } : {}),
        onProgress: (p) => onProgress?.({ done: before.length + p.done, total: before.length + p.total, bytes: already + p.bytes, totalBytes: offer.bytes }),
      })
    })
    return { bytes: report.bytes ?? 0 }
  } finally {
    changed()
  }
}

// ------------------------------------------------------------------------------------------------------------ updating

/** The shared units (articles) the server lists for a language and the phone does not have yet. */
export function missingUnits(r: { listed(u: string): boolean; installed(u: string): boolean }, units: readonly string[] = SHARED_UNITS): string[] {
  return units.filter((u) => r.listed(u) && !r.installed(u))
}
/**
 * Whether the connection costs the person (mobile data, a metered hotspot) or they asked to save data: true or false, null when
 * the app cannot tell (a browser without the Network Information API). From the Android and iOS apps (Android.metered(); the
 * iOS app's says metered until its first look at the connection).
 */
export function meteredNow(): boolean | null {
  const g = globalThis as any
  try {
    if (g.navigator?.connection?.saveData) return true
    if (typeof g.Android?.metered === 'function') return !!g.Android.metered()
  } catch {}
  const type = g.navigator?.connection?.type
  if (type === 'cellular') return true
  return typeof type === 'string' && type !== 'unknown' ? false : null
}
/** The common units the daily update brings to their newer revision (the section map is in xtopics), and the most it fetches for them. */
const COMMON_UPDATES = ['xtopics', 'xmap']
export const COMMON_UPDATE_MAX = 1024 * 1024
type Updater = {
  refresh(lang: string, o?: { signal?: AbortSignal }): Promise<{ updates?: { key: string; from: number; to: number; bytes: number }[] } | void>
  open(lang: string): Promise<{ listed(u: string): boolean; installed(u: string): boolean; size(u: string): number }>
  install(lang: string, want: { units: string[]; defaults: false }, o?: { signal?: AbortSignal; concurrency?: number }): Promise<unknown>
}
/**
 * Brings one language up to date: reads its catalog again and installs the shared units (SHARED_UNITS) it lacks; Open Bible
 * Stories when the catalog lists them and the phone lacks them (OBS_MAX or less, not on a metered connection); then, when the
 * refresh lists a newer common `xtopics` or `xmap` (a few hundred KB: the section map came that way), those too, up to
 * COMMON_UPDATE_MAX together, and never on a metered connection (`metered`: true; null, unknown, updates as if not). The units
 * installed.
 */
export async function updateLang(client: Updater, lang: string, units: readonly string[] = SHARED_UNITS, signal?: AbortSignal,
  metered: boolean | null = meteredNow()): Promise<string[]> {
  const report = await client.refresh(lang, signal ? { signal } : {})
  const r = await client.open(lang)
  const missing = missingUnits(r, units)
  const opts = { concurrency: 1, ...(signal ? { signal } : {}) }
  if (missing.length) await client.install(lang, { units: missing, defaults: false }, opts)
  // Open Bible Stories for a language installed before they came with it: OBS_MAX or less, never on a metered connection
  const obs = metered !== true && r.listed(OBS_UNIT) && !r.installed(OBS_UNIT) && typeof r.size === 'function' && r.size(OBS_UNIT) <= OBS_MAX ? [OBS_UNIT] : []
  if (obs.length) await client.install(lang, { units: obs, defaults: false }, opts)
  const common: string[] = []
  let bytes = 0
  for (const id of metered === true ? [] : COMMON_UPDATES) {
    // (a real upgrade only: a language built against an older common lists the installed newer one as `from: 3, to: 2`)
    const u = report?.updates?.find((x) => x.key.slice(x.key.indexOf('/') + 1) === id && x.to > x.from)
    if (u && bytes + u.bytes <= COMMON_UPDATE_MAX) {
      common.push(u.key)
      bytes += u.bytes
    }
  }
  if (common.length) await client.install(lang, { units: common, defaults: false }, opts)
  return [...missing, ...obs, ...common]
}
const CHECKED = 'btsm.packs.checked'
/**
 * Once a day with internet, each added language gets the shared units it lacks (a few articles collections, ~50–60 KB each),
 * silently and with the same verification as a download. It never makes the person wait: a download, an import or a removal
 * stops it (what is complete stays), and it tries again on the next opening. "Checked today" is kept only once every language
 * was tried; a language that failed waits for tomorrow. Not on a connection where the person asked to save data. The number of
 * languages updated.
 */
export async function updateLangs(): Promise<number> {
  if ((globalThis as any).navigator?.connection?.saveData) return 0
  const today = new Date().toISOString().slice(0, 10)
  try {
    if (kv()?.getItem(CHECKED) === today) return 0
  } catch {}
  let n = 0
  let stopped = false
  for (const lang of await addedLangs()) {
    if (userWaiting) {
      stopped = true
      break
    }
    try {
      const got = await serial(async () => {
        const c = new AbortController()
        const t = setTimeout(() => c.abort(new Error('timeout')), 120000)
        background = c
        try {
          return await updateLang(await addedClient(), lang, SHARED_UNITS, c.signal)
        } finally {
          clearTimeout(t)
          background = null
        }
      }, true)
      if (got.length) n++
    } catch {
      if (userWaiting) {
        stopped = true
        break
      }
      /* this language fails: tried again tomorrow */
    }
  }
  if (!stopped) {
    try {
      kv()?.setItem(CHECKED, today)
    } catch {}
  }
  if (n) changed()
  return n
}

let queue: Promise<unknown> = Promise.resolve()
/** User installs queued and not started yet (a background update gives way to them). */
let userWaiting = 0
/** The running background update, to stop it when the person starts something. */
let background: AbortController | null = null
/** Runs installs one after the other: a download, an import, a removal, an update. The person's own go before the update. */
function serial<T>(f: () => Promise<T>, inBackground = false): Promise<T> {
  if (!inBackground) {
    userWaiting++
    background?.abort(new Error('the person started something'))
  }
  const go = () => {
    if (!inBackground) userWaiting--
    return f()
  }
  const run = queue.then(go, go)
  queue = run.catch(() => {})
  return run
}

/**
 * A .tcpack file (made by another phone, or by the team): its languages go into the phone, and the pictures when it has them
 * (`images`: the file brought zxx-obsimg; it is not one of `langs`).
 */
export async function importPack(bytes: Uint8Array): Promise<{ langs: string[]; rejected: number; images?: true }> {
  const report = await serial(async () => (await addedClient()).importTransfer(bytes))
  const names = report.catalogs.map((c: any) => String(c.name ?? c.lang ?? ''))
  const langs = [...new Set(names.filter((l) => l && !notALanguage(l)))]
  const images = names.includes(IMAGES_CATALOG)
  try {
    // a file with every book the language lists ends a download that had not (a file with part of them leaves it to continue)
    for (const l of partialLangs().filter((x) => langs.includes(x))) {
      try {
        const r = await (await addedClient()).open(l)
        if (CANON.every((b) => !r.listed(`book:${b}`) || r.installed(`book:${b}`))) markPartial(l, false)
      } catch { /* left marked: the picker offers to continue */ }
    }
  } finally {
    changed()
  }
  return { langs, rejected: report.rejected.length, ...(images ? { images: true as const } : {}) }
}

/** A .tcpack with one language, whole (books, articles, maps), to pass to another phone. */
export async function exportPack(lang: string): Promise<Uint8Array> {
  const client =
    (await origin(lang)) === 'added' ? await addedClient() : createClient({ store: assetStore(lang), source: noNetwork, trust })
  const r = await client.open(lang)
  const books = CANON.filter((b) => r.installed(`book:${b}`))
  // only what this language has: a language installed before a unit was added to SHARED_UNITS lacks it, and asking for it fails
  return client.exportTransfer({ lang, mode: 'full', books, units: SHARED_UNITS.filter((u) => r.installed(u)) })
}

/**
 * The units a language has on the phone, from its state.json (`{lang}/{unit}` keys of `units`), for one that came with the app
 * (the assets' state) or one downloaded. Only the language's own units, not the shared `common/*` ones. Empty when it has none or
 * cannot be read.
 */
export async function installedUnits(lang: string): Promise<string[]> {
  try {
    const store = (await origin(lang)) === 'added' ? await added() : assetStore(lang)
    const st: any = await store.getState()
    const pre = `${lang}/`
    return Object.keys(st?.units ?? {}).filter((k) => k.startsWith(pre)).map((k) => k.slice(pre.length))
  } catch {
    return []
  }
}

/**
 * Units the person asked for (a part from its card; Open Bible Stories under an answer that says they are missing), into a
 * language this phone downloaded: the catalog read again, the units and what they need installed in one go, verified as a
 * download is. `signal` cancels (what is complete stays). A shipped language cannot take them (its store is the app's): they
 * come with the next app.
 */
export async function addUnits(
  lang: string, units: readonly string[], o: { signal?: AbortSignal; onProgress?: (p: Progress) => void } = {},
): Promise<void> {
  if ((await origin(lang)) !== 'added') throw new Error(`${lang} came with the app: ${units.join(', ')} come with its next version`)
  try {
    await serial(async () => {
      const client = await addedClient()
      o.signal?.throwIfAborted()
      await client.refresh(lang, o.signal ? { signal: o.signal } : {})
      o.signal?.throwIfAborted()
      // what is left to fetch, for the progress (the client's own progress has no byte total); 0 when it cannot be planned
      let totalBytes = 0
      if (o.onProgress) {
        try {
          const have = new Set(await (await added()).ids().catch(() => [] as string[]))
          const cats = await serverCatalogs(lang, addedSource())
          if (cats) {
            const plan = planInstall(cats, emptyState(), { defaults: false, units: [...units] }, new Set())
            totalBytes = plan.steps.flatMap((st) => st.segments).filter((x) => !have.has(x.id)).reduce((n, x) => n + x.size, 0)
          }
        } catch { /* no total: the screen shows what arrived */ }
        o.signal?.throwIfAborted() // a cancel during the planning stops before the install
      }
      await client.install(lang, { units: [...units], defaults: false }, {
        concurrency: 1,
        ...(o.signal ? { signal: o.signal } : {}),
        onProgress: (p) => o.onProgress?.({ done: p.done, total: p.total, bytes: p.bytes, totalBytes: Math.max(totalBytes, p.bytes) }),
      })
    })
  } finally {
    changed()
  }
}

/** Removes an added language (the shipped ones stay). */
export async function removeLang(lang: string): Promise<void> {
  try {
    await serial(async () => {
      const store = await added()
      const st: any = await store.getState()
      if (!st) return
      for (const k of ['active', 'published']) if (st[k]) delete st[k][lang]
      for (const key of Object.keys(st.units ?? {})) if (key.startsWith(`${lang}/`)) delete st.units[key]
      await store.setState(st)
      await (await addedClient()).prune()
    })
  } finally {
    // even when the prune fails, the language is gone from the state: no mark left, and every cache drops its readers
    markPartial(lang, false)
    changed()
  }
}
