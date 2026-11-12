// Language packs (format 3) in two layers: the ones shipped in the app (assets/www/packs, read-only; none in the light
// build), and the ones the person adds — downloaded from the packs server or imported from a .tcpack file (SD card, phone
// memory, another phone) — kept in the page's IndexedDB. A language lives in one layer: an added one wins.
import { createClient, httpSource, indexedDbStore, type BlobStore, type PackReader } from '@bt-synergy/language-pack-client'
import { SHARED_UNITS, STAGING_SERVER, trustedKeys } from './shared'

const BASE = './packs'
/** The pack lists change when the app is rebuilt: never take them from the browser cache. */
const NOCACHE: RequestInit = { cache: 'no-store' }
export const PACKS_SERVER = STAGING_SERVER
/** Languages Door43 marks tc-ready (Nov 2026): the ones the server may have packs for. */
export const CANDIDATES = ['en', 'es-419', 'id', 'hi', 'ar', 'fr', 'bn', 'gu', 'kn', 'mr', 'ne', 'or', 'te', 'fa', 'ru', 'pt-br', 'sw']
const CANON = 'gen exo lev num deu jos jdg rut 1sa 2sa 1ki 2ki 1ch 2ch ezr neh est job psa pro ecc sng isa jer lam ezk dan hos jol amo oba jon mic nam hab zep hag zec mal mat mrk luk jhn act rom 1co 2co gal eph php col 1th 2th 1ti 2ti tit phm heb jas 1pe 2pe 1jn 2jn 3jn jud rev'.split(' ')

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

// ------------------------------------------------------------------------------------------------------------ adding

/** Languages the packs server has and this phone does not: one catalog request each (needs internet). */
export async function availableLangs(): Promise<string[]> {
  const have = await installedLangs()
  const out: string[] = []
  await Promise.all(
    CANDIDATES.filter((l) => !have.includes(l)).map(async (l) => {
      try {
        const r = await fetch(`${PACKS_SERVER}/v3/packs/${encodeURIComponent(l)}/catalog`, { method: 'HEAD', cache: 'no-store' })
        if (r.ok) out.push(l)
      } catch {}
    }),
  )
  return CANDIDATES.filter((l) => out.includes(l))
}

export type Progress = { done: number; total: number; bytes: number }
/** Downloads every book the server lists for `lang`, with the shared articles, into the phone. */
export async function downloadLang(lang: string, onProgress?: (p: Progress) => void): Promise<{ books: number; bytes: number }> {
  const client = await addedClient()
  await client.refresh(lang)
  const r = await client.open(lang)
  const books = CANON.filter((b) => r.listed(`book:${b}`))
  const report = await client.install(lang, { books, defaults: true, units: SHARED_UNITS }, { onProgress: (p) => onProgress?.(p as Progress) })
  changed()
  return { books: books.length, bytes: (report as any).bytes ?? 0 }
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
