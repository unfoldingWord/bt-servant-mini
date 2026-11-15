// A word index of a pack's books (word -> rows), built once per open pack, in place of the client's search in memory: that
// one keeps every word of every row as an object and reads all of them on every search (35-80 s for an Arabic question on a
// laptop), and keeps every book of the pack decoded (about 450 MB for English). Same matches, scores, order and snippets as
// `memoryIndex` (language-pack-client/src/search/memory.ts): a row matches when it holds every word of the query, a word
// being the run of tokens it splits into; the score is the number of matches over the square root of the row's length.
import type { PackReader } from '@bt-synergy/language-pack-client'
import { bookView, type BookModel } from '@bt-synergy/language-pack-v3'
import { queryWords, rowsOf, type Hit, type PieceRow, type SearchKind } from '@lpc/search/types'
import booknames from './data/booknames.json'

// the client's tokens: runs of letters and digits (a mark splits a word, as there), folded
const TOKEN = /[\p{L}\p{N}]+/gu
const foldTok = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const tokensOf = (s: string): string[] => [...s.matchAll(TOKEN)].map((m) => foldTok(m[0]))
/** Whether a UTF-16 unit is a letter or digit, asked of the regex once per character: 1 yes, 2 no. */
const CLASS = new Uint8Array(65536)
const WORD = /^[\p{L}\p{N}]$/u
const classify = (c: number): number => (CLASS[c] = WORD.test(String.fromCharCode(c)) ? 1 : 2)
/** Whether a character is left as it is by the fold (NFD and lower case): 1 yes, 2 no. A word of such characters is its own fold. */
const SAME = new Uint8Array(65536)
const foldsToItself = (w: string): boolean => {
  for (let i = 0; i < w.length; i++) {
    const c = w.charCodeAt(i)
    if (!SAME[c]) { const ch = String.fromCharCode(c); SAME[c] = c < 0xd800 || c > 0xdfff ? (foldTok(ch) === ch ? 1 : 2) : 2 }
    if (SAME[c] !== 1) return false
  }
  return true
}
const astral = new Map<number, boolean>()
const isWordAstral = (cp: number): boolean => {
  let w = astral.get(cp)
  if (w === undefined) astral.set(cp, (w = WORD.test(String.fromCodePoint(cp))))
  return w
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
    for (let i = 0; i < rows.length; i++) {
      if ((i & 255) === 0) await breathe()
      const row = rows[i]!
      const k = KINDS.indexOf(row.kind)
      if (k < 0) continue
      kind.push(k)
      book.push(bi)
      local.push(i)
      ref.push(str(row.ref))
      res.push(str(row.res))
      start.push(toks.n)
      // the runs of letters and digits, as the client's regex finds them
      const s = row.body
      const n = s.length
      let at = -1
      let h = 0
      for (let j = 0; j < n; j++) {
        const c = s.charCodeAt(j)
        let w: boolean
        let wide = false
        if (c < 0xd800 || c > 0xdbff) w = (CLASS[c] || classify(c)) === 1
        else {
          const d = j + 1 < n ? s.charCodeAt(j + 1) : 0
          wide = d >= 0xdc00 && d <= 0xdfff
          w = wide && isWordAstral(((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000)
        }
        if (w) {
          if (at < 0) { at = j; h = 0x811c9dc5 }
          h = Math.imul(h ^ c, 0x01000193)
          if (wide) h = Math.imul(h ^ s.charCodeAt(j + 1), 0x01000193)
        } else if (at >= 0) {
          toks.push(spellings.id(s, at, j, h >>> 0))
          at = -1
        }
        if (wide) j++
      }
      if (at >= 0) toks.push(spellings.id(s, at, n, h >>> 0))
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
  for (const a of [x.kind, x.book, x.local, x.ref, x.res, x.start, x.toks, x.pstart, x.post]) n += a.byteLength
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
