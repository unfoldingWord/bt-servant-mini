// A word index of a pack's books (word -> rows), built once per open pack, in place of the client's search in memory: that
// one keeps every word of every row as an object and reads all of them on every search (35-80 s for an Arabic question on a
// laptop), and keeps every book of the pack decoded (about 450 MB for English). Same scores, order and snippets as
// `memoryIndex` (language-pack-client/src/search/memory.ts): a row matches when it holds every word of the query, a word
// being the run of tokens it splits into; the score is the number of matches over the square root of the row's length.
// Words differ on purpose (see TOKEN): marks stay inside a word and Arabic vowel signs are left out, so Arabic and Hindi
// words match whole; in languages written without combining marks (en, es, id) the hits are the client's.
import type { PackReader } from '@bt-synergy/language-pack-client'
import { bookView, verseId, type BookModel, type HelpRow } from '@bt-synergy/language-pack-v3'
import { queryWords, rowsOf, type Hit, type PieceRow, type SearchKind } from '@lpc/search/types'
import booknames from './data/booknames.json'

// Words: a letter or digit, then letters, digits and combining marks (the client's search cut a word at each mark, so an
// Arabic word with its vowels was a row of single letters and Hindi words were fragments). Folded: Arabic vowel signs
// (tashkeel, U+064B-U+065F, U+0670) and tatweel removed, so a word typed without them finds the vocalised text, alef wasla
// read as alef and alef maqsura as yeh; then
// decomposed, marks removed (accents: Jesús = Jesus; Hindi vowel signs too: keeping them found fewer verses in the answer
// tests), lower case.
const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu
const TASHKEEL = /[ً-ٰٟـ]/g
// alef wasla and alef maqsura as people type them (AVD writes ٱ about 8,900 times: الله, الخبز; موسى typed موسي)
const ALEF = /[ٱى]/g
const foldTok = (s: string): string =>
  s.replace(TASHKEEL, '').replace(ALEF, (c) => (c === 'ٱ' ? 'ا' : 'ي')).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const tokensOf = (s: string): string[] => [...s.matchAll(TOKEN)].map((m) => foldTok(m[0])).filter((t) => t !== '')
/** What a UTF-16 unit is, asked of the regexes once per character: 1 a letter or digit, 3 a combining mark, 2 neither. */
const CLASS = new Uint8Array(65536)
const WORD = /^[\p{L}\p{N}]$/u
const MARK = /^\p{M}$/u
const classify = (c: number): number => {
  const ch = String.fromCharCode(c)
  return (CLASS[c] = WORD.test(ch) ? 1 : MARK.test(ch) ? 3 : 2)
}
/** Whether a character is left as it is by the fold (NFD and lower case): 1 yes, 2 no. A word of such characters is its own fold. */
const SAME = new Uint8Array(65536)
const foldsToItself = (w: string): boolean => {
  for (let i = 0; i < w.length; i++) {
    const c = w.charCodeAt(i)
    // a mark never counts: NFD may reorder a run of them even when each alone is left as it is
    if (!SAME[c]) { const ch = String.fromCharCode(c); SAME[c] = (c < 0xd800 || c > 0xdfff) && !MARK.test(ch) && foldTok(ch) === ch ? 1 : 2 }
    if (SAME[c] !== 1) return false
  }
  return true
}
const astral = new Map<number, number>()
const classAstral = (cp: number): number => {
  let k = astral.get(cp)
  if (k === undefined) { const ch = String.fromCodePoint(cp); astral.set(cp, (k = WORD.test(ch) ? 1 : MARK.test(ch) ? 3 : 2)) }
  return k
}

/**
 * Every book a pack can hold, in the order the client reads them: its catalog's, which lists units sorted by code point
 * (language-pack-v3 build/catalog.ts). Hits with the same score keep this order, so it must be the same.
 */
export const ALL_BOOKS: string[] = Object.keys((booknames as any).BOOK_EN).sort()
const KINDS: SearchKind[] = ['text', 'note', 'question']

type Ints = Uint8Array | Uint16Array | Uint32Array
type Index = {
  books: string[]
  /** Per row: its kind (index in KINDS), book (index in `books`), place among the rows of its book (`rowsOf`), ref and resource. */
  kind: Uint8Array
  book: Uint8Array
  local: Ints
  ref: Ints
  res: Ints
  strs: string[]
  /** The token ids of row i are toks[start[i]..start[i+1]). */
  start: Uint32Array
  toks: Ints
  /** The rows that hold token t are post[pstart[t]..pstart[t+1]), ascending. */
  pstart: Uint32Array
  post: Ints
  vocab: Map<string, number>
  /** The verses whose words link to a Translation Words article (the books' word links), by article id: the verse ranking's names. */
  links: Map<string, Uint32Array>
  /** The rows that are book or chapter introductions (notes marked isIntro), ascending. */
  intro: Uint32Array
}

/**
 * Growable array of numbers, 16 bits while they fit (a pack has fewer than 65,536 words in en and ar: half the memory of its
 * millions of tokens), 32 from the first one that does not. Plain arrays of numbers would take four times as much.
 */
class Grow {
  a: Uint16Array | Uint32Array = new Uint16Array(1 << 12)
  n = 0
  push(x: number) {
    if (x > 0xffff && this.a instanceof Uint16Array) this.a = Uint32Array.from(this.a)
    if (this.n === this.a.length) {
      const b = this.a instanceof Uint16Array ? new Uint16Array(this.a.length * 2) : new Uint32Array(this.a.length * 2)
      b.set(this.a)
      this.a = b
    }
    this.a[this.n++] = x
  }
  done(): Uint16Array | Uint32Array {
    return this.a.slice(0, this.n)
  }
}

/**
 * A task boundary, where the screen and timers get their turn: `scheduler.yield()` where the WebView has it, `setImmediate`
 * under bun (a timeout waits 15 ms there on Windows), else a timeout.
 */
const nextTask = (): Promise<void> => {
  const sch = (globalThis as any).scheduler
  if (typeof sch?.yield === 'function') return sch.yield()
  return new Promise((res) => (typeof setImmediate === 'function' ? setImmediate(res) : setTimeout(res, 0)))
}
/** Gives the screen a turn after about `ms` of work, so building an index (seconds) does not freeze it. */
function breather(ms = 25): () => Promise<void> | undefined {
  let since = performance.now()
  return () => (performance.now() - since < ms ? undefined : nextTask().then(() => { since = performance.now() }))
}

/**
 * The words of `s` as TOKEN finds them, by a loop over its characters (a regex match per word was most of the build): for each,
 * where it starts and ends and a hash of its characters.
 */
function scanWords(s: string, word: (s: string, at: number, end: number, h: number) => void) {
  const n = s.length
  let at = -1
  let h = 0
  for (let j = 0; j < n; j++) {
    const c = s.charCodeAt(j)
    let w: boolean
    let wide = false
    if (c < 0xd800 || c > 0xdbff) {
      const k = CLASS[c] || classify(c)
      // a mark goes on the word it follows, and starts none
      w = k === 1 || (k === 3 && at >= 0)
    } else {
      const d = j + 1 < n ? s.charCodeAt(j + 1) : 0
      wide = d >= 0xdc00 && d <= 0xdfff
      const k = wide ? classAstral(((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000) : 2
      w = k === 1 || (k === 3 && at >= 0)
    }
    if (w) {
      if (at < 0) { at = j; h = 0x811c9dc5 }
      h = Math.imul(h ^ c, 0x01000193)
      if (wide) h = Math.imul(h ^ s.charCodeAt(j + 1), 0x01000193)
    } else if (at >= 0) {
      word(s, at, j, h >>> 0)
      at = -1
    }
    if (wide) j++
  }
  if (at >= 0) word(s, at, n, h >>> 0)
}
/** Tests: the words the index reads in `s`, as written. */
export function scannedWords(s: string): string[] {
  const out: string[] = []
  scanWords(s, (b, at, end) => out.push(b.slice(at, end)))
  return out
}

/**
 * Spelling -> word id, looked up by the characters of the row (and their hash) without cutting a string out of it: a pack
 * has millions of tokens and only tens of thousands of spellings.
 */
class Spellings {
  keys = new Int32Array(1 << 16).fill(-1)
  hashes = new Uint32Array(1 << 16)
  strs: string[] = []
  ids: number[] = []
  constructor(private wordOf: (spelling: string) => number) {}
  id(s: string, at: number, end: number, h: number): number {
    const mask = this.keys.length - 1
    const n = end - at
    for (let i = h & mask; ; i = (i + 1) & mask) {
      const k = this.keys[i]!
      if (k < 0) {
        const w = s.slice(at, end)
        this.keys[i] = this.strs.push(w) - 1
        this.hashes[i] = h
        this.ids.push(this.wordOf(w))
        if (this.strs.length * 2 > this.keys.length) this.grow()
        return this.ids[this.ids.length - 1]!
      }
      if (this.hashes[i] !== h) continue
      const o = this.strs[k]!
      if (o.length !== n) continue
      let j = 0
      while (j < n && o.charCodeAt(j) === s.charCodeAt(at + j)) j++
      if (j === n) return this.ids[k]!
    }
  }
  grow() {
    const keys = new Int32Array(this.keys.length * 2).fill(-1)
    const hashes = new Uint32Array(keys.length)
    const mask = keys.length - 1
    for (let i = 0; i < this.keys.length; i++) {
      const k = this.keys[i]!
      if (k < 0) continue
      let j = this.hashes[i]! & mask
      while (keys[j]! >= 0) j = (j + 1) & mask
      keys[j] = k
      hashes[j] = this.hashes[i]!
    }
    this.keys = keys
    this.hashes = hashes
  }
}

/**
 * A book decoded for this once, not kept by the reader as a book (it keeps every book it decodes). The reader still keeps the
 * book's segment (its `segments` cache, in the pack client): about 75 MB for all of ar.
 */
async function decode(r: PackReader, b: string, breathe?: () => Promise<void> | undefined): Promise<BookModel | undefined> {
  try {
    const seg = (await r.segments(`book:${b}`))?.[0]
    // reading the segment and viewing it are each up to 100 ms for a long book: a turn for the screen between them
    await breathe?.()
    if (seg) return bookView(seg)
  } catch {}
  // a segment the reader finds bad: let it record the problem, as its search did
  return r.book(b)
}

async function build(r: PackReader): Promise<Index> {
  const books: string[] = []
  const kind: number[] = []
  const book: number[] = []
  const local = new Grow()
  const ref = new Grow()
  const res = new Grow()
  const start: number[] = []
  const toks = new Grow()
  const breathe = breather()
  const vocab = new Map<string, number>()
  const strs: string[] = []
  const strIds = new Map<string, number>()
  const str = (s: string): number => {
    let id = strIds.get(s)
    if (id === undefined) strIds.set(s, (id = strs.push(s) - 1))
    return id
  }
  // a spelling folds the same way every time: fold each one once, not each occurrence
  const links = new Map<string, number[]>()
  const intro: number[] = []
  const spellings = new Spellings((w) => {
    const f = foldsToItself(w) ? w : foldTok(w)
    let id = vocab.get(f)
    if (id === undefined) vocab.set(f, (id = vocab.size))
    return id
  })
  for (const b of ALL_BOOKS) {
    if (!r.installed(`book:${b}`)) continue
    await breathe()
    const model = await decode(r, b, breathe)
    if (!model) continue
    await breathe()
    const rows = rowsOf(model)
    const bi = books.push(b) - 1
    for (const l of (model.links?.rows ?? []) as HelpRow[]) {
      if (!l.concept) continue
      const vs = links.get(l.concept)
      if (!vs) links.set(l.concept, [l.from])
      else if (vs[vs.length - 1] !== l.from) vs.push(l.from)
    }
    const intros = new Set(((model.notes?.rows ?? []) as HelpRow[]).filter((n) => n.cols.isIntro === true || n.cols.isIntro === 'true').map((n) => n.id))
    for (let i = 0; i < rows.length; i++) {
      if ((i & 255) === 0) await breathe()
      const row = rows[i]!
      const k = KINDS.indexOf(row.kind)
      if (k < 0) continue
      if (k === 1 && intros.has(row.rid)) intro.push(kind.length)
      kind.push(k)
      book.push(bi)
      local.push(i)
      ref.push(str(row.ref))
      res.push(str(row.res))
      start.push(toks.n)
      scanWords(row.body, (body, at, end, h) => toks.push(spellings.id(body, at, end, h)))
    }
  }
  start.push(toks.n)
  const st = Uint32Array.from(start)
  start.length = 0
  const tk = toks.done()
  const nRows = st.length - 1
  // postings: count the rows of each token, then fill (one entry per row, however many times the token is in it)
  const pstart = new Uint32Array(vocab.size + 1)
  const last = new Int32Array(vocab.size).fill(-1)
  for (let i = 0; i < nRows; i++) {
    if ((i & 4095) === 0) await breathe()
    for (let k = st[i]!; k < st[i + 1]!; k++) {
      const t = tk[k]!
      if (last[t] !== i) { last[t] = i; pstart[t + 1]!++ }
    }
  }
  for (let t = 0; t < vocab.size; t++) pstart[t + 1]! += pstart[t]!
  const post = nRows <= 0x10000 ? new Uint16Array(pstart[vocab.size]!) : new Uint32Array(pstart[vocab.size]!)
  const fill = pstart.slice(0, vocab.size)
  last.fill(-1)
  for (let i = 0; i < nRows; i++) {
    if ((i & 4095) === 0) await breathe()
    for (let k = st[i]!; k < st[i + 1]!; k++) {
      const t = tk[k]!
      if (last[t] !== i) { last[t] = i; post[fill[t]!++] = i }
    }
  }
  return {
    books, kind: Uint8Array.from(kind), book: Uint8Array.from(book), local: local.done(), ref: ref.done(), res: res.done(),
    strs, start: st, toks: tk, pstart, post, vocab,
    links: new Map([...links].map(([id, vs]) => [id, Uint32Array.from(new Set(vs)).sort()])), intro: Uint32Array.from(intro),
  }
}

/**
 * The indexes kept, the last used last: at most two bigger than 4 MB (en and ar take 30-45 MB each), so a phone asked in
 * several languages does not keep them all; small ones (a pack of a few books) do not count. A dropped index takes its
 * books' rows with it.
 */
let MAX_BIG = 2
let SMALL = 4 * 2 ** 20
/** Tests: other limits (how many big indexes, from how many bytes an index is big); gives back the old ones. */
export function indexLimits(maxBig: number, small: number): [number, number] {
  const old: [number, number] = [MAX_BIG, SMALL]
  MAX_BIG = maxBig
  SMALL = small
  return old
}
const built = new Map<PackReader, Promise<Index>>()
const sizes = new Map<PackReader, number>()
function indexOf(r: PackReader): Promise<Index> {
  let p = built.get(r)
  if (p) {
    built.delete(r)
    built.set(r, p)
    return p
  }
  p = build(r)
  built.set(r, p)
  const mine = p
  p.then(
    (x) => {
      if (built.get(r) !== mine) return
      sizes.set(r, bytesOf(x))
      evict()
    },
    // a read that failed is tried again next time
    () => { if (built.get(r) === mine) drop(r) },
  )
  return p
}
function evict() {
  const big = [...built.keys()].filter((r) => (sizes.get(r) ?? 0) > SMALL)
  for (const r of big.slice(0, Math.max(0, big.length - MAX_BIG))) drop(r)
}
function drop(r: PackReader) {
  built.delete(r)
  sizes.delete(r)
  recent.delete(r)
}
/** After a language is added or removed (search.ts `resetSearch`): every index, and the rows of the books of hits, let go. */
export function resetIndexes() {
  for (const r of [...built.keys()]) drop(r)
}
/** The languages that have an index (or are building one), the last used last. */
export const indexedLangs = (): string[] => [...built.keys()].map((r) => r.lang)
/** Builds the index of a pack ahead of its first search (it reads every book of the pack, giving the screen turns). */
export async function prepareIndex(r: PackReader): Promise<void> {
  await indexOf(r)
}

/** Bytes an index takes: its arrays, and about 60 bytes a word of the vocabulary and a ref or resource name. */
function bytesOf(x: Index): number {
  let n = 0
  for (const a of [x.kind, x.book, x.local, x.ref, x.res, x.start, x.toks, x.pstart, x.post, x.intro]) n += a.byteLength
  for (const [id, vs] of x.links) n += 60 + id.length * 2 + vs.byteLength
  for (const w of x.vocab.keys()) n += 60 + w.length * 2
  for (const w of x.strs) n += 60 + w.length * 2
  return n
}
export async function indexBytes(r: PackReader): Promise<number> {
  return bytesOf(await indexOf(r))
}

/** The rows holding every token of `ts`: the shortest list first, each next one walked from where the last match was. */
function rowsWithAll(x: Index, ts: number[]): Ints | number[] {
  const lists = [...new Set(ts)].map((t) => x.post.subarray(x.pstart[t]!, x.pstart[t + 1]!)).sort((a, b) => a.length - b.length)
  let cur: Ints | number[] = lists[0]!
  for (const l of lists.slice(1)) {
    const next: number[] = []
    let j = 0
    for (const row of cur) {
      while (j < l.length && l[j]! < row) j++
      if (j === l.length) break
      if (l[j] === row) next.push(row)
    }
    cur = next
    if (!cur.length) break
  }
  return cur
}

/** A hit before its snippet: `more()` reads the snippet and the row id (it decodes the hit's book), for the hits kept. */
export type IndexHit = Omit<Hit, 'snippet' | 'id'> & { more: () => Promise<{ snippet: string; id?: string }> }

/** The hits of the client's `search` for these kinds, best first; `more()` gives each one's snippet and id as the client does. */
export async function searchIndex(r: PackReader, text: string, f: { kinds: SearchKind[]; limit: number }): Promise<IndexHit[]> {
  const phrases = queryWords(text).map((w) => tokensOf(w)).filter((p) => p.length > 0)
  if (!phrases.length) return []
  const x = await indexOf(r)
  const ids = phrases.map((p) => p.map((t) => x.vocab.get(t)))
  if (ids.some((p) => p.some((t) => t === undefined))) return []
  const ps = ids as number[][]
  const kinds = new Set(f.kinds.map((k) => KINDS.indexOf(k)))
  const scored: { row: number; score: number; order: number }[] = []
  for (const row of rowsWithAll(x, ps.flat())) {
    if (!kinds.has(x.kind[row]!)) continue
    const s = x.start[row]!
    const e = x.start[row + 1]!
    let count = 0
    let all = true
    for (const p of ps) {
      let n = 0
      for (let i = s; i + p.length <= e; i++) {
        let k = 0
        while (k < p.length && x.toks[i + k] === p[k]) k++
        if (k === p.length) n++
      }
      if (!n) { all = false; break }
      count += n
    }
    // rows are numbered in the client's order (books, then rows as `rowsOf` gives them)
    if (all) scored.push({ row, score: count / Math.sqrt(e - s), order: row })
  }
  // the client sorts by score and keeps its row order on ties
  scored.sort((a, b) => b.score - a.score || a.order - b.order)
  return scored.slice(0, f.limit).map(({ row, score }) => {
    const b = x.books[x.book[row]!]!
    return {
      kind: KINDS[x.kind[row]!]!, book: b, ref: x.strs[x.ref[row]!]!, res: x.strs[x.res[row]!]!, score,
      more: async () => {
        const pr = (await rowsOfBook(r, b))[x.local[row]!]!
        return { snippet: snippetOf(pr.body, phrases), ...(pr.rid !== '' ? { id: pr.rid } : {}) }
      },
    }
  })
}

/** The rows of the last few books hits came from, per reader (a search keeps 4 to 6 hits, often in the same books). */
const recent = new WeakMap<PackReader, Map<string, Promise<PieceRow[]>>>()
function rowsOfBook(r: PackReader, b: string): Promise<PieceRow[]> {
  let books = recent.get(r)
  if (!books) recent.set(r, (books = new Map()))
  let rows = books.get(b)
  if (rows) books.delete(b)
  else {
    rows = decode(r, b).then((m) => (m ? rowsOf(m) : []))
    const mine = rows
    const of = books
    rows.catch(() => { if (of.get(b) === mine) of.delete(b) })
  }
  books.set(b, rows)
  if (books.size > 4) books.delete(books.keys().next().value!)
  return rows
}

/** The client's snippet: six tokens around the first match, the matched words between « and ». */
function snippetOf(body: string, phrases: string[][]): string {
  const toks = [...body.matchAll(TOKEN)].map((m) => ({ t: foldTok(m[0]), start: m.index!, end: m.index! + m[0].length }))
  const marked = new Set<number>()
  for (const p of phrases)
    for (let i = 0; i + p.length <= toks.length; i++) if (p.every((w, k) => toks[i + k]!.t === w)) for (let k = 0; k < p.length; k++) marked.add(i + k)
  const first = Math.min(...marked)
  const lo = Math.max(0, first - 6)
  const hi = Math.min(toks.length - 1, first + 6)
  let snippet = ''
  let at = toks[lo]!.start
  for (let i = lo; i <= hi; i++) {
    const tk = toks[i]!
    const word = body.slice(tk.start, tk.end)
    snippet += body.slice(at, tk.start) + (marked.has(i) ? `«${word}»` : word)
    at = tk.end
  }
  return `${lo > 0 ? '…' : ''}${snippet}${hi < toks.length - 1 ? '…' : ''}`
}

// ------------------------------------------------------------------------------------------------- verses ranked by rarity
// "Abraham sacrifice Isaac", "Jonah swallowed fish": the verses that hold the most of the question's words, a rare word
// counting more than a common one (IDF: the log of how many verses there are over how many hold the word). Read from the
// same index (its postings give how many rows hold a word), plus the word links of the books (a name or key term, whatever
// word the verse uses: "burnt offering" is "sacrifice").

/**
 * One thing a question looks for, matched by any of its forms: words as written (folded like the index), word beginnings
 * ("swallow" finds swallowed, swallowing: at most four letters more), phrases (words in a row: «great fish») and Translation
 * Words articles (the verses whose word links name them).
 */
export type Term = { words?: string[]; forms?: string[]; prefixes?: string[]; phrases?: string[][]; concepts?: string[] }
export type RankedVerse = {
  book: string; ch: number; v: number
  /** the rarity of the terms in the verse, plus half that of the terms only in the two verses either side (a story's names) */
  score: number
  /** which terms the verse holds (bit i: term i), which of them as words of its text (not only by its word links), and which
   * only its neighbours hold */
  own: number; text: number; near: number
  /** the main text shown holds one of the words (false: they are only in another text of the verse, or only in its links) */
  shown: boolean
  /** the verse's main text (ULT, GLT, BSB, AVD, NAV: the first one the pack has for it), and a snippet around its first match */
  more: () => Promise<{ text: string; snippet: string }>
}
export type Ranking = { hits: RankedVerse[]; df: number[]; idf: number[]; verses: number }

/** "1:17" -> 1017 (chapter * 1000 + verse), -1 for a ref that is not a verse */
const refNums = new WeakMap<Index, Int32Array>()
function refNum(x: Index, s: number): number {
  let a = refNums.get(x)
  if (!a) refNums.set(x, (a = new Int32Array(x.strs.length).fill(-2)))
  if (a[s] === -2) { const m = /^(\d+):(\d+)/.exec(x.strs[s]!); a[s] = m ? Number(m[1]) * 1000 + Number(m[2]) : -1 }
  return a[s]!
}
const bookBases = new WeakMap<Index, number[]>()
const basesOf = (x: Index): number[] => {
  let bases = bookBases.get(x)
  if (!bases) bookBases.set(x, (bases = x.books.map((b) => verseId(b, 0, 0))))
  return bases
}
/** A row's verse id (verseId), -1 when its ref is not a verse */
function verseOfRow(x: Index, row: number): number {
  const n = refNum(x, x.ref[row]!)
  return n < 0 ? -1 : basesOf(x)[x.book[row]!]! + n
}
/** How many verses have text, in the texts the ranking reads (the N of the IDF). */
const verseCounts = new WeakMap<Index, Map<string, number>>()
function versesIn(x: Index, ok: (row: number) => boolean, key: string): number {
  let m = verseCounts.get(x)
  if (!m) verseCounts.set(x, (m = new Map()))
  let n = m.get(key)
  if (n === undefined) {
    const seen = new Set<number>()
    for (let row = 0; row < x.kind.length; row++) if (x.kind[row] === 0 && ok(row)) seen.add(verseOfRow(x, row))
    seen.delete(-1)
    m.set(key, (n = seen.size))
  }
  return n
}
const vocabWords = new WeakMap<Index, string[]>()
function vocabWord(x: Index, id: number): string {
  let a = vocabWords.get(x)
  if (!a) { a = []; for (const [w, i] of x.vocab) a[i] = w; vocabWords.set(x, a) }
  return a[id]!
}
const refIs = (ref: string, v: number) => { const m = /^(\d+):(\d+)/.exec(ref); return !!m && Number(m[1]) * 1000 + Number(m[2]) === v % 1_000_000 }
/** Whether a text holds one of the words (a snippet needs one to center on). */
const holds = (body: string, phrases: string[][]) => { const ws = new Set(tokensOf(body)); return phrases.some((p) => ws.has(p[0]!)) }

/**
 * The verses of a pack ranked by the rarity of the terms they hold, best first (at most `limit`). Ties keep the order of the
 * client's search (matches over the square root of the row's length, then the rows' order), so a question whose words are
 * all in its verses gets the verses it got before. `skipRes`: texts that do not count (Arabic ARST is the English UST);
 * `mainRes`: the texts a verse is shown from.
 */
export async function rankVerses(r: PackReader, terms: Term[], f: { limit: number; skipRes?: RegExp; mainRes: RegExp; book?: string }): Promise<Ranking> {
  const x = await indexOf(r)
  // only one book's verses (a story asked in a book): the rarity of the words stays the pack's
  const only = f.book ? verseId(f.book, 0, 0) : null
  const resKind = new Map<number, number>() // res string -> 0 skip, 1 counts, 2 counts and is a main text
  const kindOfRes = (s: number) => {
    let k = resKind.get(s)
    if (k === undefined) { const res = x.strs[s]!; resKind.set(s, (k = f.skipRes?.test(res) ? 0 : f.mainRes.test(res) ? 2 : 1)) }
    return k
  }
  const textRow = (row: number) => x.kind[row] === 0 && kindOfRes(x.res[row]!) > 0
  const N = versesIn(x, textRow, String(f.skipRes))
  const own = new Map<number, number>() // verse -> bit mask of its terms
  const byText = new Map<number, number>() // verse -> bit mask of the terms in its words
  const mainRows = new Map<number, number[]>() // verse -> its rows in a main text that hold a term
  const tokenIds: Set<number>[] = []
  const exact = new Set<number>()
  const df: number[] = []
  terms.forEach((t, i) => {
    const bit = 1 << i
    const ids = new Set<number>()
    const id1 = (w: string) => x.vocab.get(tokensOf(w)[0] ?? '')
    // the words as written are what ties are counted on (the client's score); their other forms only find verses
    for (const w of t.words ?? []) { const id = id1(w); if (id !== undefined) { ids.add(id); exact.add(id) } }
    for (const w of t.forms ?? []) { const id = id1(w); if (id !== undefined) ids.add(id) }
    const pre = (t.prefixes ?? []).map((p) => tokensOf(p)[0]).filter((p): p is string => !!p && p.length >= 3)
    if (pre.length) for (const [w, id] of x.vocab) if (pre.some((p) => w.length <= p.length + 4 && w.startsWith(p))) ids.add(id)
    const mine = new Set<number>()
    const hit = (row: number) => {
      if (!textRow(row)) return
      const v = verseOfRow(x, row)
      if (v < 0) return
      mine.add(v)
      byText.set(v, (byText.get(v) ?? 0) | bit)
      if (kindOfRes(x.res[row]!) === 2) {
        const l = mainRows.get(v)
        if (!l) mainRows.set(v, [row])
        else if (!l.includes(row)) l.push(row)
      }
    }
    for (const id of ids) for (let k = x.pstart[id]!; k < x.pstart[id + 1]!; k++) hit(x.post[k]!)
    for (const ph of t.phrases ?? []) {
      const p = ph.flatMap((w) => tokensOf(w)).map((tk) => x.vocab.get(tk))
      if (!p.length || p.some((id) => id === undefined)) continue
      const ps = p as number[]
      for (const row of rowsWithAll(x, ps)) {
        const s = x.start[row]!
        const e = x.start[row + 1]!
        for (let j = s; j + ps.length <= e; j++) {
          let k = 0
          while (k < ps.length && x.toks[j + k] === ps[k]) k++
          if (k === ps.length) { hit(row); break }
        }
      }
      for (const id of ps) { ids.add(id); exact.add(id) }
    }
    for (const c of t.concepts ?? []) for (const v of x.links.get(c) ?? []) mine.add(v)
    tokenIds.push(ids)
    df.push(mine.size)
    for (const v of mine) own.set(v, (own.get(v) ?? 0) | bit)
  })
  const idf = df.map((n) => (n ? Math.log(1 + N / n) : 0))
  const weight = (mask: number) => { let s = 0; for (let i = 0; i < idf.length; i++) if (mask & (1 << i)) s += idf[i]!; return s }
  const scored: { v: number; score: number; own: number; text: number; near: number; tie: number; order: number }[] = []
  for (const [v, mask] of own) {
    if (only !== null && Math.floor(v / 1_000_000) * 1_000_000 !== only) continue
    let near = 0
    for (const d of [-2, -1, 1, 2]) near |= own.get(v + d) ?? 0
    near &= ~mask
    scored.push({ v, score: weight(mask) + weight(near) / 2, own: mask, text: byText.get(v) ?? 0, near, tie: 0, order: Infinity })
  }
  scored.sort((a, b) => b.score - a.score)
  // the client's score of the verse's best main-text row, for the verses that can still make the list (ties at the cut too)
  const cut = scored[Math.min(scored.length, f.limit * 4) - 1]?.score ?? 0
  const allIds = new Set(tokenIds.flatMap((s) => [...s]))
  for (const h of scored) {
    if (h.score < cut) break
    for (const row of mainRows.get(h.v) ?? []) {
      const s = x.start[row]!
      const e = x.start[row + 1]!
      let n = 0
      for (let k = s; k < e; k++) if (exact.has(x.toks[k]!)) n++
      const tie = n / Math.sqrt(e - s)
      if (tie > h.tie || (tie === h.tie && row < h.order)) { h.tie = tie; h.order = row }
    }
  }
  scored.sort((a, b) => b.score - a.score || b.tie - a.tie || a.order - b.order || a.v - b.v)
  const phrases = [...allIds].map((id) => [vocabWord(x, id)])
  const bases = basesOf(x)
  const hits = scored.slice(0, f.limit).map((h): RankedVerse => {
    const base = Math.floor(h.v / 1_000_000) * 1_000_000
    const b = x.books[bases.indexOf(base)] ?? ALL_BOOKS.find((c) => verseId(c, 0, 0) === base) ?? ''
    const row = Number.isFinite(h.order) ? h.order : -1
    return {
      book: b, ch: Math.floor((h.v % 1_000_000) / 1000), v: h.v % 1000, score: h.score, own: h.own, text: h.text, near: h.near, shown: row >= 0,
      more: async () => {
        const rows = await rowsOfBook(r, b)
        // a verse found through its word links alone: the first main text of the book that has the verse
        const at = row >= 0 ? x.local[row]! : rows.findIndex((pr) => pr.kind === 'text' && f.mainRes.test(pr.res) && !f.skipRes?.test(pr.res) && refIs(pr.ref, h.v))
        const body = at >= 0 ? rows[at]!.body : ''
        const text = body.replace(/\s+/g, ' ').trim()
        return { text, snippet: phrases.length && holds(body, phrases) ? snippetOf(body, phrases) : text }
      },
    }
  })
  return { hits, df, idf, verses: N }
}

/**
 * The book and chapter introductions that hold every term (a word, or one of its forms or beginnings), best first: most
 * matches over the square root of the length, those of the books in `prefer` first; ref "front:intro" or "3:intro".
 */
export async function searchIntros(r: PackReader, terms: Term[], limit = 3, prefer: string[] = []): Promise<{ book: string; ref: string }[]> {
  const x = await indexOf(r)
  if (!terms.length || !x.intro.length) return []
  const sets = terms.map((t) => {
    const ids = new Set<number>()
    for (const w of [...(t.words ?? []), ...(t.forms ?? [])]) { const id = x.vocab.get(tokensOf(w)[0] ?? ''); if (id !== undefined) ids.add(id) }
    const pre = (t.prefixes ?? []).map((p) => tokensOf(p)[0]).filter((p): p is string => !!p && p.length >= 3)
    if (pre.length) for (const [w, id] of x.vocab) if (pre.some((p) => w.length <= p.length + 4 && w.startsWith(p))) ids.add(id)
    return ids
  })
  if (sets.some((ids) => !ids.size)) return []
  const out: { row: number; score: number }[] = []
  for (const row of x.intro) {
    const s = x.start[row]!
    const e = x.start[row + 1]!
    let mask = 0
    let n = 0
    for (let k = s; k < e; k++) {
      const t = x.toks[k]!
      sets.forEach((ids, i) => { if (ids.has(t)) { mask |= 1 << i; n++ } })
    }
    if (mask === (1 << sets.length) - 1) out.push({ row, score: n / Math.sqrt(e - s) })
  }
  // the introductions of a book the question names first ("metaphors in Jonah")
  const named = (row: number) => (prefer.includes(x.books[x.book[row]!]!) ? 0 : 1)
  out.sort((a, b) => named(a.row) - named(b.row) || b.score - a.score || a.row - b.row)
  return out.slice(0, limit).map(({ row }) => {
    // the first introduction of a book is the book's, the others its chapters' (answer.ts reads them the same way)
    const first = x.intro.find((i) => x.book[i] === x.book[row])
    const ch = Math.floor(Math.max(0, refNum(x, x.ref[row]!)) / 1000)
    return { book: x.books[x.book[row]!]!, ref: first === row ? 'front:intro' : `${ch}:intro` }
  })
}
