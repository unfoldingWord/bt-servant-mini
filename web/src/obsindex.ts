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
import { BOOKS } from '@bt-synergy/language-pack-v3'
import versification from './data/versification.json'
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
  /** all the title's words, as obs.ts namedStory counts them */
  titleWords: string[]
  /** the words of each frame's text (folded), as namedStory counts them: which story the send names */
  frameWords: string[][]
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
/**
 * The map of each frame to its verses (obs-frames, from the common topics core: the same for every pack), as the client's `framesAt`
 * builds it: frame key "story:frame" → its ranges and verse count, and verse id → the frames that tell it.
 */
type FrameMap = { ranges: Map<string, [number, number][]>; size: Map<string, number>; byVerse: Map<number, string[]> }
let FRAMES: FrameMap | null = null

let INDEX: Map<string, PackIx> | null = null
let building: Promise<void> | null = null
let scheduled = false
/** Builds that failed since the packs last changed. */
let tries = 0
/** Bumped by resetObsIndex: a build still running when the packs change does not write its index over the new packs. */
let gen = 0
/** How long the last build took, in ms (the tests and the desktop measure it). */
export let lastBuildMs = 0

/** The frame table of the first pack that has one (its core is read once; the common catalog is the same in every pack). */
async function frameMap(r: Awaited<ReturnType<typeof openLang>>): Promise<FrameMap | null> {
  try {
    const m = await (r as any).mapsOf?.(['xtopics'], { coreOnly: true })
    const table = m?.xtopics?.core?.obsFrames as Record<string, [number, number][]> | undefined
    if (!table) return null
    const out: FrameMap = { ranges: new Map(), size: new Map(), byVerse: new Map() }
    for (const [key, list] of Object.entries(table)) {
      const seen = new Set<number>()
      // every consecutive id, exactly as the client's framesAt counts `verses` (query/obsFrames.ts): the table's rule is one chapter
      // per range, so these are verses; a range across chapters would count ids that are no verses there too, and the row's
      // order must be the answer's, so it is not "corrected" here (tests/obsindex-review.test.ts crosses chapters)
      for (const [a, b] of list) for (let v = a; v <= b; v++) seen.add(v)
      out.ranges.set(key, list)
      out.size.set(key, seen.size)
      for (const v of seen) {
        const at = out.byVerse.get(v)
        if (!at) out.byVerse.set(v, [key])
        else if (!at.includes(key)) at.push(key)
      }
    }
    return out
  } catch {
    return null
  }
}

/** null: the pack has no OBS (skipped, no work); throws when its stories do not read (the build is then tried again later). */
/** The words of a text as obs.ts namedStory splits them: folded, at what is no letter, mark or digit. */
const wordsOf = (t: string): string[] => fold(t).split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean)

async function packIndex(lang: string): Promise<PackIx | null> {
  const r = await openLang(lang)
  if (!r.installed('obs')) return null
  const list = await storyList(r)
  const model = await r.obs()
  if (!FRAMES) FRAMES = await frameMap(r)
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
      titleWords: wordsOf(e.title),
      frameWords: ((model as any)?.stories ?? []).find((x: any) => x.n === e.n)?.frames?.map((fr: any) => wordsOf(String(fr.text ?? ''))) ?? [],
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
    const failed: string[] = []
    for (const pack of packs) {
      try {
        const ix = await packIndex(pack)
        if (ix) out.set(pack, ix)
      } catch {
        failed.push(pack)
      }
      if (mine !== gen) return
    }
    // (a pack that did not read: no index is kept for now and the next answer's idle callback tries again. After the third failure
    // the index of the packs that did read is installed, and said in the console: the others offer no stories until the packs change)
    if (mine === gen && failed.length && ++tries < 3) return
    if (mine === gen && failed.length) console.warn(`obsindex: ${failed.join(', ')} did not read after ${tries} tries; stories only from ${[...out.keys()].join(', ') || 'none'}`)
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
  FRAMES = null
  building = null
  scheduled = false
  tries = 0
}
export const obsIndexReady = (): boolean => !!INDEX
/** The verse count the index holds for a frame ("story:frame"), and how many builds failed since the packs changed (tests). */
export const frameSizeOf = (key: string): number | undefined => FRAMES?.size.get(key)
export const failedBuilds = (): number => tries
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
  /** a name typed alone: only the stories whose frames link its tw:names article, and the stories an alias names; no title word, key term or book */
  namesOnly?: boolean
}
const KINDS_OK: TermKind[] = ['names', 'kt', 'other']

/** obs.ts namedStory's choice, from the index (`ws`: the folded content words): its title, its frames' words, its names. */
function sentStory(ws: string[], ix: PackIx, named: Set<number>): number | null {
  const want = ws.filter((w) => w.length >= 3)
  if (!want.length) return named.size === 1 ? [...named][0]! : null
  const count = (toks: string[]) => want.filter((w) => toks.some((x) => x === w || (w.length >= 5 && x.startsWith(w.slice(0, w.length - 1))))).length
  const byTitle = ix.stories.filter((s) => s.title && count(s.titleWords) === want.length)
  if (byTitle.length === 1) return byTitle[0]!.n
  const counts = ix.stories.map((s) => ({ n: s.n, c: s.frameWords.filter((f) => count(f) === want.length).length })).sort((a, b) => b.c - a.c)
  const [a, b] = counts
  if (a && a.c >= 3 && a.c >= 2 * (b?.c ?? 0)) return a.n
  return named.size === 1 ? [...named][0]! : null
}
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
      // (a name alone: only a name's article or an alias brings a story; a word of a title, "light" or "king", does not)
      const t = !o.namesOnly && [...forms[i]!].some((f) => s.toks.some((x) => alike(f, x) || (!!o.partial && i === ws.length - 1 && w.length >= 3 && x.startsWith(w))))
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
  // The order: the titles that name the topic, then a common name, then the frame counts, the story's number within each group, so
  // «historia de Jesús» starts with OBS 23, the birth (decided by the coordinator on Nov 18 and confirmed by Abel that day). The send uses
  // the same order when several stories may be meant (storychoice.ts). When the words are complete (not a name alone, not being typed),
  // the story obs.ts namedStory would pick (the old single pick) is added below if the rules above missed it.
  const sent = o.namesOnly || o.partial ? null : sentStory(ws, ix, named)
  if (sent && !out.some((x) => x.s.n === sent)) out.push({ s: ix.stories.find((x) => x.n === sent)!, title: 0, named: false, frames: 0 })
  out.sort((a, b) => group(a) - group(b) || b.title - a.title || (group(a) === 2 ? b.frames - a.frames : 0) || a.s.n - b.s.n)
  return { hits: out.map(({ s }) => ({ n: s.n, title: s.title, lang: ix.lang })), lang: ix.lang }
}

/** The verse ids of a passage of one book, by the versification (obs.ts idsOf, which is not exported). */
function idsOf(from: number, to: number): number[] {
  const book = BOOKS[Math.floor(from / 1_000_000) - 1]
  const counts = book ? (versification as Record<string, number[]>)[book] : undefined
  const out: number[] = []
  const ch = (id: number) => Math.floor(id / 1000) % 1000
  for (let c = ch(from); c <= ch(to) && counts; c++) {
    const last = counts[c - 1] ?? 0
    const a = c === ch(from) ? Math.max(1, from % 1000) : 1
    const z = c === ch(to) ? Math.min(last, to % 1000) : last
    for (let v = a; v <= z; v++) out.push(Math.floor(from / 1_000_000) * 1_000_000 + c * 1000 + v)
  }
  return out
}
/**
 * The story the frame map says tells a passage (obs.ts exactFrames, from the table read at the build): for one verse, the most
 * specific frame that tells it; for several verses, the most specific frame whose verses cover all of them. Null for a chapter or an
 * introduction (a range from verse 0), a passage across books, no table, or no frame.
 */
function exactStory(range: [number, number]): number | null {
  const f = FRAMES
  if (!f || range[0] % 1000 === 0) return null
  const a = Math.max(range[0], Math.floor(range[0] / 1000) * 1000 + 1), z = range[1]
  if (Math.floor(a / 1_000_000) !== Math.floor(z / 1_000_000) || a > z) return null
  const keys = new Set<string>()
  if (z - a < 200_000) for (let v = a; v <= z; v++) for (const k of f.byVerse.get(v) ?? []) keys.add(k)
  else for (const [v, at] of f.byVerse) if (v >= a && v <= z) for (const k of at) keys.add(k)
  const num = (k: string) => k.split(':').map(Number) as [number, number]
  const found = [...keys].map((k) => ({ k, n: num(k)[0], f: num(k)[1], verses: f.size.get(k)! })).sort((x, y) => x.verses - y.verses || x.n - y.n || x.f - y.f)
  if (range[0] === range[1] || !found.length) return found[0]?.n ?? null
  const want = idsOf(range[0], range[1])
  for (const x of found.filter((y) => y.verses >= want.length)) {
    const have = (v: number) => (f.ranges.get(x.k) ?? []).some(([p, q]) => v >= p && v <= q)
    if (want.length && want.every(have)) return x.n
  }
  return null
}
/**
 * The story that tells a passage (verse ids, as obs.ts rangeOfRef), from the index with no pack open, as obs.ts storyAt chooses it
 * when it is given no passage text: the frame map's story first (the most specific frame that tells the passage), else of the
 * stories whose ranges meet it, the most about it (the fewest verses over the fewest ranges; the first in story order on a tie).
 * Where it can still differ from the answer: storyAt, given the passage's text and the story's pack in the passage's language,
 * breaks a near tie (cost within 1.5 times the best) by the words the frames share with the text; the row has no text.
 */
export function storyTelling(range: [number, number], order: string[]): StoryHit | null {
  const ix = indexFor(order)
  if (!ix) return null
  const exact = exactStory(range)
  const hit = exact ? ix.stories.find((s) => s.n === exact) : undefined
  if (hit) return { n: hit.n, title: hit.title, lang: ix.lang }
  let best: StoryIx | null = null
  for (const s of ix.stories) {
    if (!s.ranges.some(([a, z]) => a <= range[1] && z >= range[0])) continue
    if (!best || s.cost < best.cost) best = s
  }
  return best ? { n: best.n, title: best.title, lang: ix.lang } : null
}
