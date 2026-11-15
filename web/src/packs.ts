// Language packs (format 3) in two layers: the ones shipped in the app (assets/www/packs, read-only; none in the light
// build), and the ones the person adds — downloaded from the packs server or imported from a .tcpack file (SD card, phone
// memory, another phone) — kept in the page's IndexedDB. A language lives in one layer: an added one wins.
import {
  createClient, emptyState, httpSource, indexedDbStore, planInstall, verifyCatalogFile,
  type BlobStore, type PackReader, type PackSource, type VerifiedCatalog,
} from '@bt-synergy/language-pack-client'
import { SHARED_UNITS, STAGING_SERVER, trustedKeys } from './shared'

const BASE = './packs'
/** The pack lists change when the app is rebuilt: never take them from the browser cache. */
const NOCACHE: RequestInit = { cache: 'no-store' }
export const PACKS_SERVER = STAGING_SERVER
/** Languages Door43 marks tc-ready (Nov 2026): the ones the server may have packs for. */
export const CANDIDATES = ['en', 'es-419', 'id', 'hi', 'ar', 'fr', 'bn', 'gu', 'kn', 'mr', 'ne', 'or', 'te', 'fa', 'ru', 'pt-br', 'sw']
/** The packs' names, as their speakers write them. */
export const PACK_NAMES: Record<string, string> = {
  en: 'English', 'es-419': 'Español (Latinoamérica)', id: 'Bahasa Indonesia', hi: 'हिन्दी', ar: 'العربية', fr: 'Français', bn: 'বাংলা',
  gu: 'ગુજરાતી', kn: 'ಕನ್ನಡ', mr: 'मराठी', ne: 'नेपाली', or: 'ଓଡ଼ିଆ', te: 'తెలుగు', fa: 'فارسی', ru: 'Русский', 'pt-br': 'Português', sw: 'Kiswahili',
}
export const CANON = 'gen exo lev num deu jos jdg rut 1sa 2sa 1ki 2ki 1ch 2ch ezr neh est job psa pro ecc sng isa jer lam ezk dan hos jol amo oba jon mic nam hab zep hag zec mal mat mrk luk jhn act rom 1co 2co gal eph php col 1th 2th 1ti 2ti tit phm heb jas 1pe 2pe 1jn 2jn 3jn jud rev'.split(' ')

// ------------------------------------------------------------------------------------------------- shipped (assets)

let index: { langs: string[] } | null = null
async function shipped(): Promise<string[]> {
  try {
    return (index ??= await (await fetch(`${BASE}/index.json`, NOCACHE)).json()).langs
  } catch {
    return []
  }
}
const ID_RE = /^[0-9a-f]{64}$/
function assetStore(lang: string): BlobStore {
  const dir = `${BASE}/${lang}`
  let ids: string[] | null = null
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
    async ids() {
      return (ids ??= await (await fetch(`${dir}/ids.json`, NOCACHE)).json())
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
const trust = { trustedKeys: trustedKeys() }
const addedClient = async () => createClient({ store: await added(), source: httpSource({ base: PACKS_SERVER }), trust })

async function addedLangs(): Promise<string[]> {
  try {
    const st: any = await (await added()).getState()
    return Object.keys(st?.active ?? {}).filter((l) => l !== 'common')
  } catch {
    return []
  }
}

// ------------------------------------------------------------------------------------------------------------ reading

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
    open.set(lang, (async () => {
      if ((await addedLangs()).includes(lang)) return (await addedClient()).open(lang)
      return createClient({ store: assetStore(lang), source: noNetwork, trust }).open(lang)
    })())
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
export type Offer = { lang: string; books: string[]; bytes: number; segments: string[]; sizes: Record<string, number> }
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
const commonCats = new Map<string, Promise<VerifiedCatalog | null>>()
/**
 * Reads the language's catalog (a few KB) and the common catalog it names, and plans the same install `downloadLang` runs, so the
 * size shown before the download is the size downloaded. Null when the server has no pack for it (or no internet).
 */
export async function offerOf(lang: string, source: PackSource = httpSource({ base: PACKS_SERVER })): Promise<Offer | null> {
  try {
    const got = await source.catalog(lang)
    if (got === 'not-modified') return null
    const cat = await verifyCatalogFile(got.bytes, trust, { from: 'network' })
    const catalogs = [cat]
    for (const [rname, , rid] of cat.catalog.requires ?? []) {
      const id = hex(rid)
      if (!commonCats.has(id)) {
        commonCats.set(id, (async () => {
          const c = await source.catalog(rname)
          if (c === 'not-modified') return null
          const v = await verifyCatalogFile(c.bytes, trust, { from: 'network' })
          return v.id === id ? v : null
        })().catch(() => null))
      }
      const common = await commonCats.get(id)!
      if (!common) commonCats.delete(id) // try again next time (the server may be ahead or behind for a moment)
      else catalogs.push(common)
    }
    const listed = new Set(cat.catalog.units.map((u) => u.id))
    const books = CANON.filter((b) => listed.has(`book:${b}`))
    const plan = planInstall(catalogs, emptyState(), { books, defaults: true, units: SHARED_UNITS }, new Set())
    const sizes: Record<string, number> = {}
    for (const st of plan.steps) for (const x of st.segments) sizes[x.id] = x.size
    return { lang, books, bytes: plan.bytes, segments: Object.keys(sizes), sizes }
  } catch {
    return null
  }
}

/** Languages the packs server has and this phone does not, with their download size: one small catalog request each (needs internet). */
export async function offers(): Promise<Offer[]> {
  const have = await installedLangs()
  const got = await Promise.all(CANDIDATES.filter((l) => !have.includes(l)).map((l) => offerOf(l)))
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
 * reading the catalog again; `signal` cancels (what is complete stays, and a retry goes on from there).
 */
export async function downloadLang(
  lang: string,
  onProgress?: (p: Progress) => void,
  o: { offer?: Offer | null; signal?: AbortSignal; ahead?: number } = {},
): Promise<{ books: number; bytes: number }> {
  const http = httpSource({ base: PACKS_SERVER })
  const offer = o.offer ?? (await offerOf(lang, http))
  if (!offer) throw new Error(`no pack for ${lang} on the server`)
  const store = await added()
  // after a cancel or a failure, what already arrived counts as done (the install does not fetch it again)
  const have = new Set(await store.ids().catch(() => [] as string[]))
  const before = offer.segments.filter((id) => have.has(id))
  const already = before.reduce((n, id) => n + (offer.sizes[id] ?? 0), 0)
  const order = offer.segments.filter((id) => !have.has(id))
  const client = createClient({ store, source: prefetching(http, order, o.ahead ?? 6), trust })
  const report = await client.install(lang, { books: offer.books, defaults: true, units: SHARED_UNITS }, {
    ...(o.signal ? { signal: o.signal } : {}),
    onProgress: (p) => onProgress?.({ done: before.length + p.done, total: before.length + p.total, bytes: already + p.bytes, totalBytes: offer.bytes }),
  })
  changed()
  return { books: offer.books.length, bytes: report.bytes ?? 0 }
}

/** A .tcpack file (made by another phone, or by the team): its languages go into the phone. */
export async function importPack(bytes: Uint8Array): Promise<{ langs: string[]; rejected: number }> {
  const report = await (await addedClient()).importTransfer(bytes)
  changed()
  const langs = [...new Set(report.catalogs.map((c: any) => String(c.name ?? c.lang ?? '')).filter((l) => l && l !== 'common'))]
  return { langs, rejected: report.rejected.length }
}

/** A .tcpack with one language, whole (books, articles, maps), to pass to another phone. */
export async function exportPack(lang: string): Promise<Uint8Array> {
  const client =
    (await origin(lang)) === 'added' ? await addedClient() : createClient({ store: assetStore(lang), source: noNetwork, trust })
  const r = await client.open(lang)
  const books = CANON.filter((b) => r.installed(`book:${b}`))
  return client.exportTransfer({ lang, mode: 'full', books, units: SHARED_UNITS })
}

/** Removes an added language (the shipped ones stay). */
export async function removeLang(lang: string): Promise<void> {
  const store = await added()
  const st: any = await store.getState()
  if (!st) return
  for (const k of ['active', 'published']) if (st[k]) delete st[k][lang]
  for (const key of Object.keys(st.units ?? {})) if (key.startsWith(`${lang}/`)) delete st.units[key]
  await store.setState(st)
  await (await addedClient()).prune()
  changed()
}
