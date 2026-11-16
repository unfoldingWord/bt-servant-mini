// The composer's index of words and topics (propuesta-composer-sugerencias.md §2.2 C, §2.7): the names of the Translation Words
// and Translation Academy articles each installed pack can show, by prefix, so "gra" offers "gracia · palabra clave" and
// "metáf" offers "Metáfora · Academia" with no pack opened while typing.
//   - Built only at idle after the first answer of the session (Composer.answered), never at the app's start: reading the names
//     takes a while on a phone (about 2.6 s the first time). Until it is ready, the row only completes passages.
//   - Only articles the pack carries: an article's unit (art:tw:kt, art:ta:process…) must be installed. Older packs name all
//     four Translation Academy manuals in their maps but carry only the translate one (tests/termindex.test.ts).
//   - Cleared when the packs change (suggest.ts resetSuggest, called on onPacksChanged).
//   - Small: per pack, the folded names sorted (for a binary search), the name as written, and which article (an index into the
//     pack's ids). Under 300 KB per pack (measured in the tests).
import { openLang } from './packs'
import { fold } from './sheet'
import { namesOf } from './search'
import glossary from './data/kt-glossary.json'

export type TermKind = 'kt' | 'names' | 'other' | 'ta'
/** One name found: the article, the pack that shows it, the name as the pack (or the glossary) writes it. */
export type TermHit = { id: string; pack: string; name: string; kind: TermKind; exact: boolean }

type PackIndex = { keys: string[]; shown: string[]; at: Uint16Array; ids: string[] }
let INDEX: Map<string, PackIndex> | null = null
let building: Promise<void> | null = null
let scheduled = false
/** Bumped by resetTermIndex: a build still running when the packs change does not write its index over the new packs. */
let gen = 0

export const kindOf = (id: string): TermKind | null =>
  id.startsWith('tw:kt/') ? 'kt' : id.startsWith('tw:names/') ? 'names' : id.startsWith('tw:other/') ? 'other' : id.startsWith('ta:') ? 'ta' : null
/** The unit that carries an article: "tw:kt/grace" → "art:tw:kt", "ta:translate/figs-metaphor" → "art:ta:translate". */
export const unitOf = (id: string): string => `art:${id.slice(0, id.indexOf('/'))}`
/** The key a name is found by: folded (case, accents, Arabic forms), without "(…)", "#" and punctuation. */
export const termKey = (s: string): string =>
  fold(s.replace(/\(.*?\)/g, ' ')).replace(/[#¿?¡!؟.,;:«»"“”()]/g, ' ').replace(/\s+/g, ' ').trim()
/** A pack whose language has its own script writes its names in it: an English name there ("Ruth" in the Arabic pack) is left out. */
const SCRIPT: Record<string, RegExp> = { ar: /[؀-ۿ]/, hi: /[ऀ-ॿ]/ }

type Gloss = Record<string, Record<string, string[]>>
const GLOSS = glossary as Gloss

/** The index of one pack: its articles' names (and the glossary's, in its language) for the articles it carries. */
async function packIndex(pack: string): Promise<PackIndex | null> {
  const r = await openLang(pack)
  const names = await namesOf(r as any)
  const lang = pack.split('-')[0]!
  const script = SCRIPT[lang]
  const ids: string[] = []
  const rows: [string, string, number][] = []
  const carried = new Map<string, boolean>()
  const carries = (id: string) => {
    const u = unitOf(id)
    if (!carried.has(u)) carried.set(u, r.installed(u))
    return carried.get(u)!
  }
  const seen = new Set<string>()
  const idAt = new Map<string, number>()
  const add = (id: string, name: string) => {
    if (!kindOf(id) || !carries(id)) return
    for (const part of String(name).split(/\s*[,،]\s*/)) {
      const shown = part.replace(/#/g, '').replace(/\s+/g, ' ').trim()
      if (!shown || (script && !script.test(shown))) continue
      let i = idAt.get(id)
      if (i === undefined) idAt.set(id, (i = ids.push(id) - 1))
      // "John (the Baptist)": found by "john" and by "john the baptist"
      for (const key of new Set([termKey(shown), termKey(shown.replace(/[()]/g, ' '))])) {
        if (!key || seen.has(`${key}\u0000${id}`)) continue
        seen.add(`${key}\u0000${id}`)
        rows.push([key, shown, i])
      }
    }
  }
  for (const [id, ns] of Object.entries(names)) for (const n of ns ?? []) add(id, n)
  for (const [id, byLang] of Object.entries(GLOSS)) if (names[id]) for (const n of byLang[lang] ?? []) add(id, n)
  if (!rows.length || ids.length > 65535) return null
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1].length - b[1].length))
  return { keys: rows.map((x) => x[0]), shown: rows.map((x) => (x[1] === x[0] ? x[0] : x[1])), at: Uint16Array.from(rows.map((x) => x[2])), ids }
}

/** Builds the index of these packs now (the composer calls it at idle, through scheduleTermIndex). */
export function buildTermIndex(packs: string[]): Promise<void> {
  if (INDEX) return Promise.resolve()
  if (building) return building
  const mine = gen
  const p = (building = (async () => {
    const out = new Map<string, PackIndex>()
    for (const pack of packs) {
      try {
        const ix = await packIndex(pack)
        if (ix) out.set(pack, ix)
      } catch {}
      if (mine !== gen) return
    }
    if (mine === gen) INDEX = out
  })().finally(() => {
    if (building === p) building = null
  }))
  return p
}

const idle = (f: () => void) => {
  const ric = (globalThis as any).requestIdleCallback as ((f: () => void, o?: { timeout: number }) => void) | undefined
  if (ric) ric(f, { timeout: 5000 })
  else setTimeout(f, 1500)
}
/** After an answer: the index is built when the phone is idle (once; again after the packs change), then `done` is called. */
export function scheduleTermIndex(packs: () => string[], done: () => void = () => {}) {
  if (INDEX || building || scheduled) return
  scheduled = true
  const mine = gen
  idle(() => {
    // (a callback from before the packs changed: a newer schedule's flag is not its to clear)
    if (mine !== gen) return
    scheduled = false
    if (packs().length) void buildTermIndex(packs()).then(() => { if (INDEX) done() })
  })
}
/** The packs changed: the index is dropped (built again after the next answer). */
export function resetTermIndex() {
  gen++
  INDEX = null
  building = null
  scheduled = false
}
export const termIndexState = (): 'none' | 'building' | 'ready' => (INDEX ? 'ready' : building || scheduled ? 'building' : 'none')
/** The articles a pack's index names (for the tests: each one must be an article the pack shows). */
export const indexedIds = (pack: string): string[] => [...(INDEX?.get(pack)?.ids ?? [])]
/** How many names the index holds, per pack. */
export const indexSizes = (): Record<string, number> => Object.fromEntries([...(INDEX ?? new Map()).entries()].map(([k, v]) => [k, v.keys.length]))

const ORDER: Record<TermKind, number> = { kt: 0, other: 1, ta: 2, names: 3 }
/**
 * The articles whose names start with `prefix` (folded), in one pack: an exact name first, then key terms, other words, Academy
 * and names, the shorter names first. Each article once, and one button per name and kind (two key terms both called
 * "अनुग्रह" would read as the same button twice).
 */
export function lookup(pack: string, prefix: string, max = 6): TermHit[] {
  const ix = INDEX?.get(pack)
  const k = termKey(prefix)
  if (!ix || !k) return []
  let lo = 0, hi = ix.keys.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (ix.keys[mid]! < k) lo = mid + 1
    else hi = mid
  }
  // every name with the prefix, ranked as it is read: only the best few are kept (a short Arabic prefix, "ال…", starts
  // hundreds of names; cutting them in the index's order before ranking would push the key terms out)
  const rank = (a: TermHit, b: TermHit) => +b.exact - +a.exact || ORDER[a.kind] - ORDER[b.kind] || a.name.length - b.name.length
  const keep = max * 8
  const found: TermHit[] = []
  for (let i = lo; i < ix.keys.length && ix.keys[i]!.startsWith(k); i++) {
    const id = ix.ids[ix.at[i]!]!
    const h: TermHit = { id, pack, name: ix.shown[i]!, kind: kindOf(id)!, exact: ix.keys[i] === k }
    if (found.length >= keep && rank(h, found[found.length - 1]!) >= 0) continue
    let j = found.length
    while (j > 0 && rank(h, found[j - 1]!) < 0) j--
    found.splice(j, 0, h)
    if (found.length > keep) found.pop()
  }
  const out: TermHit[] = []
  const ids = new Set<string>()
  for (const h of found) {
    const named = `${termKey(h.name)}\u0000${h.kind}`
    if (ids.has(h.id) || ids.has(named)) continue
    ids.add(h.id)
    ids.add(named)
    out.push(h)
    if (out.length >= max) break
  }
  return out
}
/** The glossary's names in a language the packs lack (fr with only English): the key terms they name, shown from `pack`. */
export function glossaryLookup(lang: string, pack: string, prefix: string, max = 6): TermHit[] {
  const ix = INDEX?.get(pack)
  const k = termKey(prefix)
  if (!ix || !k) return []
  const has = new Set(ix.ids)
  const out: TermHit[] = []
  for (const [id, byLang] of Object.entries(GLOSS)) {
    if (!has.has(id)) continue
    const n = (byLang[lang] ?? []).find((x) => termKey(x).startsWith(k))
    if (n) out.push({ id, pack, name: n, kind: kindOf(id) ?? 'kt', exact: termKey(n) === k })
  }
  return out.sort((a, b) => +b.exact - +a.exact || ORDER[a.kind] - ORDER[b.kind] || a.name.length - b.name.length).slice(0, max)
}
