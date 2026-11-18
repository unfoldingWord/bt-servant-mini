// The typing row's index of Open Bible Stories (design Part 4, "Sugerencias de historias OBS al escribir"): what suggest.ts needs to
// offer stories while a question is typed, with no pack opened there. Built at idle after the first answer, with the word index
// (termindex.ts), and dropped when the packs change (suggest.ts resetSuggest).
//   - Per installed pack that has the obs unit, for each of its 50 stories: its title's words, how many frames link each
//     Translation Words article (tw ids as in obs.ts: `r.obs()` link rows, a frame counted once), the Bible passages it is told
//     from (storyList refs, as ranges) and their books. Small: about 50 stories x 30 ids.
//   - The rules are the ones the send uses (storyfind.ts findStories, obs.ts namedStory), done synchronously: a title matches
//     a word when storyfind's `alike` says so, for the word and its forms (the English story word, the last part of the article
//     the word names: findStories gets those from `englishForms`, which reads the packs' name maps and is async, so here the
//     word index's exact names give the ids); the common names of STORY_NAMES (`storiesNamed`) as namedStory's `byName`; and
//     the frames count of the articles (the count of obs.ts namedStory is of the words in the frames' text: not copied here,
//     the typing row never promises an answer, it only offers the story).
import { rangeOfStoryRef, storiesNamed, storyList, versesIn } from './obs'
import { openLang } from './packs'
import { fold } from './sheet'
import { toEnglish } from './search'
import { alike, SMALL, tokens } from './storyfind'
import { kindOf, lookup, type TermKind } from './termindex'

type StoryIx = {
  n: number
  title: string
  /** the title's words (storyfind's tokens, without its small words) */
  toks: string[]
  /** each Translation Words article its frames link, and in how many frames */
  ids: Map<string, number>
  refs: string[]
  ranges: [number, number][]
  /** the verses its ranges hold times the ranges (obs.ts storyAt's cost: a smaller one is more about a passage) */
  cost: number
  /** the books its passages are in (3 letters) */
  books: Set<string>
}
type PackIx = { lang: string; stories: StoryIx[] }

let INDEX: Map<string, PackIx> | null = null
let building: Promise<void> | null = null
let scheduled = false
/** Bumped by resetObsIndex: a build still running when the packs change does not write its index over the new packs. */
let gen = 0
/** How long the last build took, in ms (the tests and the desktop measure it). */
export let lastBuildMs = 0

async function packIndex(lang: string): Promise<PackIx | null> {
  const r = await openLang(lang)
  if (!r.installed('obs')) return null
  const list = await storyList(r)
  const model = await r.obs().catch(() => undefined)
  const frames = new Map<number, Map<string, Set<number>>>()
  for (const row of (model as any)?.links?.rows ?? []) {
    if (!row.concept) continue
    const n = Math.floor(row.frame / 100)
    let m = frames.get(n)
    if (!m) frames.set(n, (m = new Map()))
    let s = m.get(row.concept)
    if (!s) m.set(row.concept, (s = new Set()))
    s.add(row.frame % 100)
  }
  const stories: StoryIx[] = list.map((e) => {
    const ranges = e.refs.map(rangeOfStoryRef).filter((x): x is [number, number] => !!x)
    return {
      n: e.n,
      title: e.title,
      toks: tokens(e.title).filter((t) => !SMALL.has(t)),
      ids: new Map([...(frames.get(e.n) ?? new Map<string, Set<number>>()).entries()].map(([id, s]) => [id, s.size])),
      refs: e.refs,
      ranges,
      cost: ranges.reduce((s, [a, z]) => s + versesIn(a, z), 0) * Math.max(1, ranges.length),
      books: new Set(e.refs.map((x) => x.trim().split(/\s+/)[0]!.toLowerCase())),
    }
  })
  return { lang, stories }
}

/** Builds the index of these packs now (the composer calls it at idle, through scheduleObsIndex). */
export function buildObsIndex(packs: string[]): Promise<void> {
  if (INDEX) return Promise.resolve()
  if (building) return building
  const mine = gen
  const t0 = Date.now()
  const p = (building = (async () => {
    const out = new Map<string, PackIx>()
    for (const pack of packs) {
      try {
        const ix = await packIndex(pack)
        if (ix) out.set(pack, ix)
      } catch {}
      if (mine !== gen) return
    }
    if (mine === gen) {
      INDEX = out
      lastBuildMs = Date.now() - t0
    }
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
export function scheduleObsIndex(packs: () => string[], done: () => void = () => {}) {
  if (INDEX || building || scheduled) return
  scheduled = true
  const mine = gen
  idle(() => {
    if (mine !== gen) return
    scheduled = false
    if (packs().length) void buildObsIndex(packs()).then(() => { if (INDEX) done() })
  })
}
/** The packs changed: the index is dropped (built again after the next answer). */
export function resetObsIndex() {
  gen++
  INDEX = null
  building = null
  scheduled = false
}
export const obsIndexReady = (): boolean => !!INDEX
/** The stories the index holds per pack (tests). */
export const obsIndexSizes = (): Record<string, number> => Object.fromEntries([...(INDEX ?? new Map<string, PackIx>()).entries()].map(([k, v]) => [k, v.stories.length]))

/** The index to read from: the first of `order` that has one (the packs the send would look in, in its order). */
function indexFor(order: string[]): PackIx | null {
  if (!INDEX?.size) return null
  for (const l of order) if (INDEX.has(l)) return INDEX.get(l)!
  return null
}
/** Whether the typing row can offer stories at all (an index with a pack's stories). */
export const hasStories = (order: string[]): boolean => !!indexFor(order)

export type StoryHit = { n: number; title: string; lang: string }
export type FindOpts = {
  /** the app's language (the story words of a word in it) */
  ui: string
  /** the packs to look in, in the order the send would (the sheet's pack, English, the others) */
  order: string[]
  /** the packs whose word index names the ids (suggest.ts: the packs of the phone, the app's first) */
  termPacks: string[]
  /** the last word may be the start of a name (being typed) */
  partial?: boolean
  /** a book the words name (3 letters): its stories count too, after the others */
  book?: string | null
  /** only an article of a name (tw:names), not a key term or a word: a name typed alone offers few stories */
  namesOnly?: boolean
}
const KINDS_OK: TermKind[] = ['names', 'kt', 'other']

/**
 * The stories that tell what these words name, best first: a title that names them (storyfind.ts alike, for the word and its
 * English forms), a common name (STORY_NAMES), then the stories with the most frames that link the article the word names, then
 * the story's number. Every word must match, all but one of three or more (as findStories). `words`: the question's content words,
 * folded or not, the last one possibly started only.
 */
export function findStoriesIx(words: string[], o: FindOpts): { hits: StoryHit[]; lang: string } | null {
  const whole = find(words, { ...o, partial: false })
  // (the last word as it is typed; only when it is no word of its own: "Noé" is not the start of "noel", Navidad's name)
  return o.partial && whole && !whole.hits.length ? find(words, o) : whole
}
function find(words: string[], o: FindOpts): { hits: StoryHit[]; lang: string } | null {
  const ix = indexFor(o.order)
  if (!ix) return null
  const ws = [...new Set(words.map(fold).filter((w) => w.length >= 2))]
  if (!ws.length && !o.book) return { hits: [], lang: ix.lang }
  // each word: its forms, the articles it names, and (the last, when being typed) what it may be the start of
  const forms: Set<string>[] = []
  const ids: Set<string>[] = []
  ws.forEach((w, i) => {
    const f = new Set([w, ...toEnglish([w], o.ui).map(fold)])
    const d = new Set<string>()
    const maybe = o.partial && i === ws.length - 1 && w.length >= 3
    for (const p of o.termPacks) {
      for (const h of lookup(p, w, maybe ? 3 : 2)) {
        if (!KINDS_OK.includes(h.kind) || (o.namesOnly && h.kind !== 'names')) continue
        if (!h.exact && !maybe) continue
        d.add(h.id)
        f.add(h.id.slice(h.id.lastIndexOf('/') + 1).replace(/\d+$/, ''))
        if (maybe) f.add(fold(h.name))
      }
    }
    if (maybe) for (const s of ix.stories) for (const t of s.toks) if (t.startsWith(w)) f.add(t)
    forms.push(f)
    ids.push(d)
  })
  const named = new Set(ws.length ? storiesNamed(ws, !!o.partial) : [])
  const need = ws.length >= 3 ? ws.length - 1 : ws.length
  const out: { s: StoryIx; title: number; named: boolean; frames: number }[] = []
  for (const s of ix.stories) {
    let title = 0, frames = 0, matched = 0
    ws.forEach((w, i) => {
      const t = [...forms[i]!].some((f) => s.toks.some((x) => alike(f, x) || (!!o.partial && i === ws.length - 1 && w.length >= 3 && x.startsWith(w))))
      const c = [...ids[i]!].reduce((m, id) => Math.max(m, s.ids.get(id) ?? 0), 0)
      if (t) title++
      if (c) frames += c
      if (t || c) matched++
    })
    const byName = named.has(s.n)
    const byBook = !!o.book && s.books.has(o.book) && !o.namesOnly
    if (!byName && !byBook && !(ws.length && matched >= need)) continue
    out.push({ s, title, named: byName, frames })
  }
  // a title that names them (the most words first), then a common name, then the frames that link the article; each group in the
  // stories' order (the design's order: OBS 23, 24, 25 for Jesus, not the story whose frames name him most)
  const group = (x: { title: number; named: boolean }) => (x.title ? 0 : x.named ? 1 : 2)
  out.sort((a, b) => group(a) - group(b) || b.title - a.title || (group(a) === 2 ? b.frames - a.frames : 0) || a.s.n - b.s.n)
  return { hits: out.map(({ s }) => ({ n: s.n, title: s.title, lang: ix.lang })), lang: ix.lang }
}

/**
 * The story that tells a passage (verse ids, as obs.ts rangeOfRef): of the stories whose ranges meet it, the most about it (the
 * fewest verses over the fewest ranges, obs.ts storyAt's choice), from the index: no frame, no pack.
 */
export function storyTelling(range: [number, number], order: string[]): StoryHit | null {
  const ix = indexFor(order)
  if (!ix) return null
  let best: StoryIx | null = null
  for (const s of ix.stories) {
    if (!s.ranges.some(([a, z]) => a <= range[1] && z >= range[0])) continue
    if (!best || s.cost < best.cost) best = s
  }
  return best ? { n: best.n, title: best.title, lang: ix.lang } : null
}
