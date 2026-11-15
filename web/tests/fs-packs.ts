// Runs the app's own pack reading under bun, with no browser: `fetch('./packs/…')` is served from the packs on disk
// (../lp3-ta-packs, with all four Translation Academy manuals, else ../fase0-mini-servant/packs: the same ones build.py
// ships in the full build; PACKS_DIR=<dir> picks others), and only the languages given to
// `installPacks` count as installed. Any other fetch fails, as on a phone with no internet.
//   import { installPacks } from './fs-packs'
//   await installPacks(['es-419'])          // a phone with only Spanish
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { reloadPacks } from '../src/packs'
import { resetLangs } from '../src/answer'
import { resetSearch } from '../src/search'

const DEFAULT_DIR = process.env.PACKS_DIR ? resolve(process.env.PACKS_DIR)
  : ['lp3-ta-packs', 'fase0-mini-servant/packs'].map((d) => resolve(import.meta.dir, '../../..', d)).find((d) => existsSync(d))!
/** The older packs (Translation Academy: the translate manual only), as phones that have not updated them have. */
export const OLD_PACKS_DIR = resolve(import.meta.dir, '../../../fase0-mini-servant/packs')
const langsIn = (dir: string) => readdirSync(dir).filter((d) => existsSync(join(dir, d, 'state.json')))
export let PACKS_DIR = DEFAULT_DIR
/** The languages there are packs for on this machine. */
export let ALL_PACKS = langsIn(PACKS_DIR)
/**
 * Serves the packs of another folder (OLD_PACKS_DIR) until called again with no folder. A test file that uses it puts it back
 * in afterAll: the test files share this module. Call installPacks after it.
 */
export function usePacksDir(dir?: string) {
  PACKS_DIR = dir ?? DEFAULT_DIR
  ALL_PACKS = langsIn(PACKS_DIR)
  idCache.clear()
  langs = []
}

let langs: string[] = []
const idCache = new Map<string, string[]>()
function idsOf(lang: string): string[] {
  if (!idCache.has(lang)) {
    const out: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) walk(p)
        else out.push(f)
      }
    }
    walk(join(PACKS_DIR, lang, 'seg'))
    idCache.set(lang, out.sort())
  }
  return idCache.get(lang)!
}
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } })

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const m = /^\.\/packs\/(.+)$/.exec(url)
  if (!m) throw new TypeError(`offline (tests): ${url}`)
  if (m[1] === 'index.json') return json({ langs })
  const [lang, ...rest] = m[1]!.split('/')
  if (!langs.includes(lang!)) return new Response(null, { status: 404 })
  const path = rest.join('/')
  if (path === 'ids.json') return json(idsOf(lang!))
  const f = join(PACKS_DIR, lang!, path)
  return existsSync(f) ? new Response(readFileSync(f)) : new Response(null, { status: 404 })
}) as typeof fetch

/** Makes exactly these languages installed (as if shipped in the app) and drops every cache that holds pack readers. */
export async function installPacks(l: string[]) {
  const missing = l.filter((x) => !ALL_PACKS.includes(x))
  if (missing.length) throw new Error(`no pack on disk for ${missing.join(', ')} (have ${ALL_PACKS.join(', ')})`)
  langs = [...l]
  reloadPacks()
  resetLangs()
  resetSearch()
}
