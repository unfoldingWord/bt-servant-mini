// Runs the app's own pack reading under bun, with no browser: `fetch('./packs/…')` is served from the packs on disk
// (../fase0-mini-servant/packs, the same ones build.py ships in the full build), and only the languages given to
// `installPacks` count as installed. Any other fetch fails, as on a phone with no internet.
//   import { installPacks } from './fs-packs'
//   await installPacks(['es-419'])          // a phone with only Spanish
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { reloadPacks } from '../src/packs'
import { resetLangs } from '../src/answer'
import { resetSearch } from '../src/search'

export const PACKS_DIR = resolve(import.meta.dir, '../../../fase0-mini-servant/packs')
/** The languages there are packs for on this machine. */
export const ALL_PACKS = readdirSync(PACKS_DIR).filter((d) => existsSync(join(PACKS_DIR, d, 'state.json')))

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
