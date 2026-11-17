/**
 * MACULA in Mini (diseno-grafo.md, Fase 2f): who a pronoun or an implied subject is ("who is 'he' in Ruth 2:4?" → Boaz), and
 * the structure of a verse's sentence as nested clauses with their roles. Offline, no model: the data is the `macula` table of
 * each book's `common/orig:<book>` segment, which every installed book already brings (trees and referents of MACULA Hebrew
 * and Greek, as published: tc-study `OrigModel.macula`). The gateway-language words come from the aligned text of the pack
 * (align.ts): each original word position → the words that translate it.
 *
 * The data, as observed (no format document was found; meanings inferred from the data, see the survey in the side notes):
 * - trees: `{ sentences: Node[] }`, `Node = [label, ...children] | wordId | [wordId, morphemeText]`. A word id is CCCVVVWWW
 *   (chapter, verse, word of the verse, from 1). Labels: `*` a clause or group with no role; `v` verb, `s` subject, `o`
 *   object, `o2` second object, `io` indirect object, `p` predicate (complement), `adv` adverbial, `pp` prepositional phrase,
 *   `vc` linking verb, `aux` auxiliary, `&` connector. A trailing `*` (`v*`, `adv*`…): that role is filled by a clause. The
 *   trees are clause-level: a role holds its words flat.
 * - referents: `{ words: [form, strong][], verses: { "c:v": [normForm, occurrence, [kind, suffix, x, y, entity][]][] } }`.
 *   A word of the verse is found by its form without points or accents and its occurrence among the verse's words of that
 *   form; `entity` indexes `words` (a form and a Strong, not a word). Kinds: `a` implied subject of a verb, `r` the word
 *   itself (a pronoun or a pronoun suffix, `suffix`), `p` implied object, `o` the one it is said to or done for, `s` and
 *   `c` subject (rare). `x`,`y`: the chapter and verse where the entity was last named (0,0: none given).
 *
 * Cost (survey, Nov 16): a small book's orig segment reads in 0.2–0.6 s on a phone, Genesis in 4–9 s (about 20 MB, kept by
 * the pack reader once read). So: read per book on demand, keep a small index per book (verse → sentences), keep per-verse
 * results small, and never make an answer wait for a big book (maculaSteps' budget).
 */
import type { Sheet } from './answer'
import { bookLabel, type Followup } from './converse'
import { hasLang, installedLangs, openLang } from './packs'
import { fold } from './sheet'

// ------------------------------------------------------------------------------------------------------------ the data

export type Node = number | [number, string] | [string, ...Node[]]
type Ref5 = [kind: string, suffix: string, x: number, y: number, entity: number]
type Item = [form: string, occurrence: number, refs: Ref5[]]
export type Referents = { words: [string, string][]; verses: Record<string, Item[]> }
type Word = { form: string; strong: string }

/** A book's MACULA, read: its words by position, its verses, its sentences and referents. */
export type MacBook = {
  book: string
  /** Greek (NT) or Hebrew/Aramaic (OT): how forms are compared, and the original's direction */
  greek: boolean
  release?: string
  /** a verse's words: [first position, end position) */
  verse(c: number, v: number): [number, number] | undefined
  word(pos: number): Word | undefined
  sentences: Node[]
  referents?: Referents
}

/** The words of one aligned text of the pack: original position → the ordinals of its words that translate it. */
export type Gloss = { res: string; lang: string; at(pos: number): number[] | undefined; word(ord: number): string | undefined }

/** A Strong's number as a key both tables share: "c:H1961" "H1961", "G39720" (orig, 5 digits) "G3972", "H0430" "H430". */
export function strongKey(s: string): string {
  const m = /^([GH])(\d+)/.exec(s.replace(/^(?:[a-z]+:)+/i, ''))
  if (!m) return s
  const raw = m[1] === 'G' && m[2]!.length === 5 ? m[2]!.slice(0, 4) : m[2]!
  return m[1]! + String(+raw)
}
/** A form as the referents key it: Hebrew without points, accents, maqaf, joiners; Greek without accents, lowercase, final σ. */
export function formKey(s: string, greek: boolean): string {
  const d = s.normalize('NFD')
  if (greek) return d.replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/[’'ʼ᾽.,;·]/g, '')
  return d.replace(/[֑-ׇ⁠‌‍͏\s]/g, '').normalize('NFC')
}
/** A word's form as shown: without the joiners the pack keeps between a prefix and its word. */
const shown = (s: string) => s.replace(/[⁠‍]/g, '')

/** The MACULA of a book's orig model (tc-study OrigModel). Null when the segment has none. */
export function macBookOf(book: string, orig: {
  words: Word[]; pieces: unknown[]; events: [number, string, string][]
  macula?: { release?: string; trees?: unknown; referents?: unknown }
} | undefined): MacBook | null {
  const trees = orig?.macula?.trees as { sentences?: Node[] } | undefined
  if (!orig || !trees?.sentences) return null
  // a verse's first word: the number of word pieces before its event
  const before: number[] = []
  let n = 0
  for (const p of orig.pieces as [string, boolean][]) {
    before.push(n)
    if (p[1]) n++
  }
  before.push(n)
  const starts = new Map<string, number>()
  const order: number[] = []
  let ch = 0
  for (const [pos, kind, arg] of orig.events) {
    if (kind === 'chapter') ch = +arg
    else if (kind === 'verse') {
      const at = before[pos] ?? n
      starts.set(`${ch}:${+String(arg).split('-')[0]!}`, at)
      order.push(at)
    }
  }
  order.sort((a, b) => a - b)
  const end = (s: number) => {
    let lo = 0, hi = order.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (order[mid]! <= s) lo = mid + 1; else hi = mid }
    return order[lo] ?? orig.words.length
  }
  const words = orig.words
  return {
    book, greek: /^(?:[a-z]+:)*G/i.test(words[0]?.strong ?? ''), release: orig.macula?.release,
    verse: (c, v) => { const s = starts.get(`${c}:${v}`); return s === undefined ? undefined : [s, end(s)] },
    word: (p) => words[p],
    sentences: trees.sentences,
    referents: orig.macula?.referents as Referents | undefined,
  }
}

/** One aligned text's index (align.ts alignIndex, for the one text used here). */
export function glossOf(lang: string, t: { res: string; pieces: [string, boolean, ...unknown[]][]; align?: number[][] }): Gloss | null {
  if (!t.align) return null
  const words: string[] = []
  const byPos = new Map<number, number[]>()
  for (const piece of t.pieces) {
    if (!piece[1]) continue
    const ord = words.length
    words.push(piece[0])
    for (const pos of t.align[ord] ?? []) {
      const l = byPos.get(pos)
      if (l) l.push(ord)
      else byPos.set(pos, [ord])
    }
  }
  return { res: t.res, lang, at: (p) => byPos.get(p), word: (o) => words[o] }
}
/** The aligned text the words come from: the literal one (ULT, GLT, Van Dyck), else the first aligned. */
export function pickText<T extends { res: string; align?: unknown }>(texts: T[]): T | undefined {
  const al = texts.filter((t) => t.align)
  return al.find((t) => /\/(?:ult|glt)$/i.test(t.res)) ?? al.find((t) => /\/avd$/i.test(t.res)) ?? al[0]
}
/** The words that translate some positions, in text order ("And he said"); a gap is " … ". */
function glText(g: Gloss | null, positions: number[]): string {
  if (!g) return ''
  const ords = [...new Set(positions.flatMap((p) => g.at(p) ?? []))].sort((a, b) => a - b)
  let s = ''
  ords.forEach((o, i) => { s += (i === 0 ? '' : o === ords[i - 1]! + 1 ? ' ' : ' … ') + (g.word(o) ?? '') })
  return s.trim()
}
const ordsOf = (g: Gloss | null, p: number) => (g?.at(p) ?? []).join(',')

/** A verse's words: the ids of the trees (CCCVVVWWW) → positions. */
const idCV = (id: number) => ({ c: Math.floor(id / 1e6), v: Math.floor(id / 1e3) % 1e3, w: id % 1e3 })
function posOf(mb: MacBook, id: number): number | undefined {
  const { c, v, w } = idCV(id)
  const r = mb.verse(c, v)
  return r && r[0] + w - 1 < r[1] ? r[0] + w - 1 : undefined
}

// ------------------------------------------------------------------------------------------------- who is who (referents)

export type Role = 'subj' | 'obj' | 'to' | 'ref'
const ROLE_OF: Record<string, Role> = { a: 'subj', s: 'subj', c: 'subj', p: 'obj', o: 'to', r: 'ref' }
/** What a pronoun or a verb refers to: the entity in the original, and in the gateway language when it could be found. */
export type Entity = { orig: string; strong: string; gl: string | null; id?: string; at?: string }
export type WhoItem = { pos: number; orig: string; gl: string; suffix?: string; role: Role; to: Entity }
export type WhoVerse = { c: number; v: number; items: WhoItem[]
  /** words the referents list for the verse that are not in this text (another edition's reading) */
  missed: number }
/** A Strong's articles (Translation Words) and their titles, for an entity's name: only a Strong with one article is used. */
export type Names = { ids(strong: string): string[] | undefined; title(id: string): string | undefined }

/** The words of a verse that MACULA lists with a referent, in order, each with what it refers to. Null: no referents data. */
export function whoIn(mb: MacBook, g: Gloss | null, names: Names | null, c: number, v: number): WhoVerse | null {
  const rf = mb.referents
  if (!rf) return null
  const out: WhoVerse = { c, v, items: [], missed: 0 }
  const items = rf.verses[`${c}:${v}`]
  const range = mb.verse(c, v)
  if (!items?.length || !range) return out
  const vw: { p: number; k: string }[] = []
  for (let p = range[0]; p < range[1]; p++) vw.push({ p, k: formKey(mb.word(p)?.form ?? '', mb.greek) })
  for (const [form, occ, refs] of items) {
    let hit = vw.filter((x) => x.k === form)[occ]
    // another edition's spelling (ketiv/qere, a Greek variant): the nearest form, if close
    if (!hit && form.length >= 3) {
      const near = vw.filter((x) => edits(x.k, form) <= (form.length >= 6 ? 2 : 1))
      hit = near[occ] ?? (near.length === 1 ? near[0] : undefined)
    }
    if (!hit) { out.missed++; continue }
    const w = mb.word(hit.p)!
    for (const [kind, suffix, x, y, idx] of refs) {
      const ent = rf.words[idx]
      if (!ent) continue
      out.items.push({ pos: hit.p, orig: shown(w.form), gl: glText(g, [hit.p]), ...(suffix ? { suffix } : {}), role: ROLE_OF[kind] ?? 'ref',
        to: entity(mb, g, names, ent, hit.p, x, y) })
    }
  }
  out.items.sort((a, b) => a.pos - b.pos)
  return out
}
/** Whether a verse has referents (without reading its words). */
export const hasWho = (mb: MacBook, c: number, v: number): boolean => !!mb.referents?.verses[`${c}:${v}`]?.length

/**
 * The entity in the gateway language: the word with its Strong in the verse where it was last named (x:y), else the nearest
 * one before (then after) the pronoun, read in the aligned text; a name (a Strong with a single Translation Words article)
 * by that article's title when the aligned words hold it ("To Titus" → "Titus") or there are none.
 */
function entity(mb: MacBook, g: Gloss | null, names: Names | null, [form, strong]: [string, string], pos: number, x: number, y: number): Entity {
  const key = strongKey(strong)
  const is = (p: number) => { const w = mb.word(p); return !!w && strongKey(w.strong) === key }
  // where it was last named (x:y), and its few mentions before the pronoun (else the first after): the one the text says in
  // the fewest words ("Boaz", not "by Boaz"), the nearest first
  const seen: number[] = []
  const named = x > 0 && y > 0 ? mb.verse(x, y) : undefined
  if (named) for (let p = named[0]; p < named[1] && !seen.length; p++) if (is(p)) seen.push(p)
  for (let p = pos; seen.length < 6 && p >= 0 && pos - p < 40000; p--) if (is(p) && !seen.includes(p)) seen.push(p)
  for (let p = pos + 1; !seen.length && p < pos + 4000; p++) if (mb.word(p) === undefined) break; else if (is(p)) seen.push(p)
  // (fewest words, then fewest letters: "بُوعَزُ" before "بِبُوعَزَ", "by Boaz")
  const size = (p: number) => { const t = glText(g, [p]); return t ? t.split(/\s+/).length * 1000 + t.length : 1e9 }
  const at = seen.length ? seen.reduce((a, b) => (size(b) < size(a) ? b : a)) : undefined
  const gl = at !== undefined ? glText(g, [at]) || null : null
  const ids = names?.ids(key)
  const id = ids?.length === 1 ? ids[0] : undefined
  const title = id ? names!.title(id) : undefined
  const name = title && (!gl || fold(gl).split(/[^\p{L}\p{M}\p{N}]+/u).join(' ').includes(fold(title))) ? title : gl
  const where = at !== undefined ? whereOf(mb, at) : undefined
  return { orig: at !== undefined ? shown(mb.word(at)!.form) : form, strong: key, gl: name, ...(id ? { id } : {}), ...(where ? { at: where } : {}) }
}
/** "2:1": the verse of a position (searched near it). */
function whereOf(mb: MacBook, p: number): string | undefined {
  for (let c = 1; c <= 150; c++) {
    const first = mb.verse(c, 1)
    if (!first) return undefined
    const next = mb.verse(c + 1, 1)
    if (next && p >= next[0]) continue
    for (let v = 1; v <= 180; v++) { const r = mb.verse(c, v); if (!r) break; if (p >= r[0] && p < r[1]) return `${c}:${v}` }
    return undefined
  }
  return undefined
}
function edits(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9
  const d = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]!
    d[0] = i
    for (let j = 1; j <= b.length; j++) {
      const t = d[j]!
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = t
    }
  }
  return d[b.length]!
}

// ------------------------------------------------------------------------------------------------- the sentence's structure

export type TWord = { k: 'w'; pos: number; orig: string; gl: string
  /** a part of a word (a Hebrew prefix or suffix): the word's gateway words are shown at its main part */
  part?: boolean }
export type TNode = { k: 'n'; role: string; clause: boolean; kids: (TNode | TWord)[] }
/** A verse's sentences, each cut to the words of this verse: `before`/`after`, the sentence goes on in other verses. */
export type TreeVerse = { c: number; v: number; sentences: { root: TNode; before: boolean; after: boolean; words: number }[] }

const bySentence = new WeakMap<MacBook, Map<string, number[]>>()
/** The sentences with a word in a verse (an index per book, made on first use: Genesis ~10 ms). */
function sentencesOf(mb: MacBook, c: number, v: number): number[] {
  let idx = bySentence.get(mb)
  if (!idx) {
    idx = new Map()
    const add = (k: string, i: number) => { const l = idx!.get(k); if (!l) idx!.set(k, [i]); else if (l[l.length - 1] !== i) l.push(i) }
    mb.sentences.forEach((s, i) => walkIds(s, (id) => { const x = idCV(id); add(`${x.c}:${x.v}`, i) }))
    bySentence.set(mb, idx)
  }
  return idx.get(`${c}:${v}`) ?? []
}
function walkIds(n: Node, f: (id: number) => void) {
  if (typeof n === 'number') f(n)
  else if (typeof n[0] === 'number') f(n[0])
  else for (const k of n.slice(1) as Node[]) walkIds(k, f)
}

/** A verse's clause tree, in the gateway language from the alignment. Null: the book has no trees. */
export function treeOf(mb: MacBook, g: Gloss | null, c: number, v: number): TreeVerse | null {
  const range = mb.verse(c, v)
  if (!range) return null
  const out: TreeVerse = { c, v, sentences: [] }
  for (const i of sentencesOf(mb, c, v)) {
    const s = mb.sentences[i]!
    // a word cut in parts (Hebrew): its gateway words go to its first part that is not a connector
    const owner = new Map<number, { n: Node; amp: boolean }>()
    const seen = new Map<number, number>()
    const scan = (n: Node, parent: string) => {
      if (typeof n === 'number') return
      if (typeof n[0] === 'number') {
        const id = n[0]
        seen.set(id, (seen.get(id) ?? 0) + 1)
        const o = owner.get(id)
        if (!o || (o.amp && parent !== '&')) owner.set(id, { n, amp: parent === '&' })
        return
      }
      for (const k of n.slice(1) as Node[]) scan(k, n[0] as string)
    }
    scan(s, '')
    const parts = new Set([...seen].filter(([, k]) => k > 1).map(([id]) => id))
    let before = false, after = false, words = 0
    const cut = (n: Node): TNode | TWord | null => {
      if (typeof n === 'number' || typeof n[0] === 'number') {
        const id = typeof n === 'number' ? n : (n[0] as number)
        const p = posOf(mb, id)
        if (p === undefined) return null
        if (p < range[0]) { before = true; return null }
        if (p >= range[1]) { after = true; return null }
        words++
        const w = mb.word(p)!
        if (typeof n === 'number') return { k: 'w', pos: p, orig: shown(w.form), gl: glText(g, [p]) }
        const main = !parts.has(id) || owner.get(id)?.n === n
        return { k: 'w', pos: p, orig: shown(String(n[1])), gl: main ? glText(g, [p]) : '', ...(parts.has(id) ? { part: true } : {}) }
      }
      const label = n[0] as string
      const kids: (TNode | TWord)[] = []
      for (const k of n.slice(1) as Node[]) {
        const x = cut(k)
        if (!x) continue
        // two words the text translates together ("from Bethlehem"): one box
        const prev = kids[kids.length - 1]
        if (x.k === 'w' && prev?.k === 'w' && !x.part && !prev.part && x.gl && ordsOf(g, x.pos) === ordsOf(g, prev.pos)) {
          prev.orig += ' ' + x.orig
          continue
        }
        kids.push(x)
      }
      if (!kids.length) return null
      const role = label.replace(/\*$/, '')
      return { k: 'n', role, clause: label.endsWith('*'), kids }
    }
    const root = cut(s)
    if (root && root.k === 'n') out.sentences.push({ root, before, after, words })
  }
  return out
}

// ------------------------------------------------------------------------------------------------------------ the words

type L = 'en' | 'es' | 'fr' | 'id' | 'hi' | 'ar'
const lang = (ui: string): L => (['en', 'es', 'fr', 'id', 'hi', 'ar'].includes(ui) ? ui : 'en') as L
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')

/** The role names: [short, name] (the diagram's chips and its legend). */
export const ROLES: Record<L, Record<string, [string, string]>> = {
  en: { s: ['S', 'Subject'], v: ['V', 'Verb'], o: ['O', 'Object'], o2: ['O2', 'Second object'], io: ['IO', 'Indirect object'], p: ['P', 'Predicate'],
    adv: ['Adv', 'Adverbial (when, where, how)'], pp: ['PP', 'Prepositional phrase'], vc: ['VC', 'Linking verb'], aux: ['Aux', 'Auxiliary verb'], '&': ['&', 'Connector'], '': ['', 'Clause'] },
  es: { s: ['S', 'Sujeto'], v: ['V', 'Verbo'], o: ['OD', 'Objeto'], o2: ['O2', 'Segundo objeto'], io: ['OI', 'Objeto indirecto'], p: ['P', 'Predicado'],
    adv: ['CC', 'Complemento circunstancial (cuándo, dónde, cómo)'], pp: ['FP', 'Frase preposicional'], vc: ['VC', 'Verbo copulativo'], aux: ['Aux', 'Verbo auxiliar'], '&': ['&', 'Conector'], '': ['', 'Cláusula'] },
  fr: { s: ['S', 'Sujet'], v: ['V', 'Verbe'], o: ['O', 'Objet'], o2: ['O2', 'Second objet'], io: ['OI', 'Objet indirect'], p: ['P', 'Prédicat (attribut)'],
    adv: ['CC', 'Complément circonstanciel (quand, où, comment)'], pp: ['GP', 'Groupe prépositionnel'], vc: ['VC', 'Verbe copule'], aux: ['Aux', 'Auxiliaire'], '&': ['&', 'Connecteur'], '': ['', 'Proposition'] },
  id: { s: ['S', 'Subjek'], v: ['V', 'Verba'], o: ['O', 'Objek'], o2: ['O2', 'Objek kedua'], io: ['OTL', 'Objek tidak langsung'], p: ['Pel', 'Pelengkap (predikat)'],
    adv: ['K', 'Keterangan (kapan, di mana, bagaimana)'], pp: ['FP', 'Frasa preposisi'], vc: ['Kop', 'Kopula'], aux: ['Aux', 'Kata kerja bantu'], '&': ['&', 'Penghubung'], '': ['', 'Klausa'] },
  hi: { s: ['कर्ता', 'कर्ता'], v: ['क्रिया', 'क्रिया'], o: ['कर्म', 'कर्म'], o2: ['कर्म 2', 'दूसरा कर्म'], io: ['गौण कर्म', 'गौण कर्म'], p: ['पूरक', 'पूरक (विधेय)'],
    adv: ['क्रि.वि.', 'क्रियाविशेषण (कब, कहाँ, कैसे)'], pp: ['सं.वा.', 'संबंधबोधक वाक्यांश'], vc: ['योजक क्रिया', 'योजक क्रिया'], aux: ['सहायक', 'सहायक क्रिया'], '&': ['&', 'योजक'], '': ['', 'उपवाक्य'] },
  ar: { s: ['فاعل', 'الفاعل (المسند إليه)'], v: ['فعل', 'الفعل'], o: ['مفعول', 'المفعول به'], o2: ['مفعول ٢', 'المفعول الثاني'], io: ['غير مباشر', 'المفعول غير المباشر'], p: ['خبر', 'الخبر (المسند)'],
    adv: ['ظرف', 'ظرف وحال (متى، أين، كيف)'], pp: ['جار ومجرور', 'جار ومجرور'], vc: ['رابط', 'فعل رابط'], aux: ['مساعد', 'فعل مساعد'], '&': ['&', 'أداة ربط'], '': ['', 'جملة'] },
}
export const roleName = (ui: string, role: string): [string, string] => ROLES[lang(ui)][role] ?? [role.toUpperCase(), role]

const W: Record<L, {
  who: string; whoIn: string; tree: string; treeOf: string
  whoAll: string; whoWord: string; whoNot: string; whoNone: string; noData: string; missed: string; unmapped: string
  roles: Record<Role, string>; treeIntro: string; fromBefore: string; goesOn: string; legend: string; showOrig: string; hideOrig: string
  clause: string; source: string; pointWho: string; pointTree: string
}> = {
  en: { pointWho: 'Who is who', pointTree: 'Sentence structure', who: 'Who is who in this verse?', whoIn: 'Who is who in {ref}', tree: 'See the sentence structure', treeOf: 'Sentence structure of {ref}',
    whoAll: 'Who the pronouns and implied subjects in {ref} refer to:', whoWord: 'In {ref}, «{w}» refers to:',
    whoNot: '«{w}» is not a word of its own in {ref}. Here is who each pronoun and implied subject refers to:',
    whoNone: '{ref} has no pronouns or implied subjects to explain.', noData: 'There is no sentence data (MACULA) for {ref} on this phone.',
    missed: '{n} word(s) listed for this verse are not in this edition of the original, so they are left out.', unmapped: 'not found in the Bible text: original only',
    roles: { subj: 'who does it', obj: 'to whom it is done', to: 'to or for whom', ref: 'pronoun' },
    treeIntro: 'The sentence structure of {ref}, in the order of the original words. Tap a word to see the original.',
    fromBefore: 'The sentence starts in {ref}.', goesOn: 'The sentence continues in {ref}.', legend: 'Roles', showOrig: 'Show the original words', hideOrig: 'Hide the original words',
    clause: 'Clause · {n} words', source: 'Syntax and referents: MACULA {heb}. Words: {res}.' },
  es: { pointWho: 'Quién es quién', pointTree: 'Estructura de la oración', who: '¿Quién es quién en este versículo?', whoIn: 'Quién es quién en {ref}', tree: 'Ver la estructura de la oración', treeOf: 'Estructura de la oración en {ref}',
    whoAll: 'A quién se refieren los pronombres y sujetos implícitos de {ref}:', whoWord: 'En {ref}, «{w}» se refiere a:',
    whoNot: '«{w}» no es una palabra aparte en {ref}. Así se refiere cada pronombre y sujeto implícito:',
    whoNone: '{ref} no tiene pronombres ni sujetos implícitos que explicar.', noData: 'No hay datos de la oración (MACULA) para {ref} en este teléfono.',
    missed: '{n} palabra(s) de este versículo no están en esta edición del original; se omiten.', unmapped: 'no se encontró en el texto bíblico: solo el original',
    roles: { subj: 'quién lo hace', obj: 'a quién se le hace', to: 'a quién o para quién', ref: 'pronombre' },
    treeIntro: 'La estructura de la oración de {ref}, en el orden de las palabras originales. Toca una palabra para ver el original.',
    fromBefore: 'La oración empieza en {ref}.', goesOn: 'La oración sigue en {ref}.', legend: 'Funciones', showOrig: 'Mostrar las palabras originales', hideOrig: 'Ocultar las palabras originales',
    clause: 'Cláusula · {n} palabras', source: 'Sintaxis y referentes: MACULA {heb}. Palabras: {res}.' },
  fr: { pointWho: 'Qui est qui', pointTree: 'Structure de la phrase', who: 'Qui est qui dans ce verset ?', whoIn: 'Qui est qui dans {ref}', tree: 'Voir la structure de la phrase', treeOf: 'Structure de la phrase de {ref}',
    whoAll: 'À qui renvoient les pronoms et les sujets sous-entendus de {ref} :', whoWord: 'Dans {ref}, « {w} » renvoie à :',
    whoNot: '« {w} » n’est pas un mot à part dans {ref}. Voici à qui renvoie chaque pronom et sujet sous-entendu :',
    whoNone: '{ref} n’a pas de pronom ni de sujet sous-entendu à expliquer.', noData: 'Il n’y a pas de données sur la phrase (MACULA) pour {ref} sur ce téléphone.',
    missed: '{n} mot(s) de ce verset ne sont pas dans cette édition de l’original ; ils sont laissés de côté.', unmapped: 'introuvable dans le texte biblique : original seulement',
    roles: { subj: 'qui fait l’action', obj: 'à qui elle est faite', to: 'à qui ou pour qui', ref: 'pronom' },
    treeIntro: 'La structure de la phrase de {ref}, dans l’ordre des mots originaux. Touchez un mot pour voir l’original.',
    fromBefore: 'La phrase commence en {ref}.', goesOn: 'La phrase continue en {ref}.', legend: 'Fonctions', showOrig: 'Afficher les mots originaux', hideOrig: 'Masquer les mots originaux',
    clause: 'Proposition · {n} mots', source: 'Syntaxe et référents : MACULA {heb}. Mots : {res}.' },
  id: { pointWho: 'Siapa adalah siapa', pointTree: 'Struktur kalimat', who: 'Siapa adalah siapa dalam ayat ini?', whoIn: 'Siapa adalah siapa dalam {ref}', tree: 'Lihat struktur kalimat', treeOf: 'Struktur kalimat {ref}',
    whoAll: 'Kata ganti dan subjek tersirat dalam {ref} merujuk kepada:', whoWord: 'Dalam {ref}, «{w}» merujuk kepada:',
    whoNot: '«{w}» bukan kata tersendiri dalam {ref}. Inilah rujukan setiap kata ganti dan subjek tersirat:',
    whoNone: '{ref} tidak memiliki kata ganti atau subjek tersirat untuk dijelaskan.', noData: 'Tidak ada data kalimat (MACULA) untuk {ref} di ponsel ini.',
    missed: '{n} kata untuk ayat ini tidak ada dalam edisi teks asli ini, jadi dilewati.', unmapped: 'tidak ditemukan dalam teks Alkitab: hanya teks asli',
    roles: { subj: 'siapa yang melakukan', obj: 'kepada siapa dilakukan', to: 'kepada atau untuk siapa', ref: 'kata ganti' },
    treeIntro: 'Struktur kalimat {ref}, menurut urutan kata dalam bahasa asli. Ketuk sebuah kata untuk melihat kata aslinya.',
    fromBefore: 'Kalimat ini dimulai di {ref}.', goesOn: 'Kalimat ini berlanjut di {ref}.', legend: 'Fungsi', showOrig: 'Tampilkan kata-kata asli', hideOrig: 'Sembunyikan kata-kata asli',
    clause: 'Klausa · {n} kata', source: 'Sintaksis dan rujukan: MACULA {heb}. Kata: {res}.' },
  hi: { pointWho: 'कौन किसको दर्शाता है', pointTree: 'वाक्य संरचना', who: 'इस पद में कौन किसको दर्शाता है?', whoIn: '{ref} में कौन किसको दर्शाता है', tree: 'वाक्य की संरचना देखें', treeOf: '{ref} की वाक्य संरचना',
    whoAll: '{ref} के सर्वनाम और छिपे हुए कर्ता किसको दर्शाते हैं:', whoWord: '{ref} में «{w}» इसको दर्शाता है:',
    whoNot: '{ref} में «{w}» अलग शब्द नहीं है। हर सर्वनाम और छिपा हुआ कर्ता इनको दर्शाता है:',
    whoNone: '{ref} में समझाने के लिए कोई सर्वनाम या छिपा हुआ कर्ता नहीं है।', noData: 'इस फ़ोन पर {ref} के लिए वाक्य का डेटा (MACULA) नहीं है।',
    missed: 'इस पद के {n} शब्द मूल पाठ के इस संस्करण में नहीं हैं, इसलिए छोड़ दिए गए।', unmapped: 'बाइबल पाठ में नहीं मिला: केवल मूल शब्द',
    roles: { subj: 'कौन करता है', obj: 'किस पर किया जाता है', to: 'किसके लिए या किससे', ref: 'सर्वनाम' },
    treeIntro: '{ref} की वाक्य संरचना, मूल शब्दों के क्रम में। मूल शब्द देखने के लिए किसी शब्द को छुएँ।',
    fromBefore: 'वाक्य {ref} में शुरू होता है।', goesOn: 'वाक्य {ref} में आगे चलता है।', legend: 'भूमिकाएँ', showOrig: 'मूल शब्द दिखाएँ', hideOrig: 'मूल शब्द छिपाएँ',
    clause: 'उपवाक्य · {n} शब्द', source: 'वाक्य-रचना और संदर्भ: MACULA {heb}। शब्द: {res}।' },
  ar: { pointWho: 'مَن هو مَن', pointTree: 'بنية الجملة', who: 'مَن هو مَن في هذه الآية؟', whoIn: 'مَن هو مَن في {ref}', tree: 'اعرض بنية الجملة', treeOf: 'بنية الجملة في {ref}',
    whoAll: 'إلى مَن تعود الضمائر والفاعلون المستترون في {ref}:', whoWord: 'في {ref}، «{w}» يعود إلى:',
    whoNot: '«{w}» ليست كلمة مستقلة في {ref}. هذا ما يعود إليه كل ضمير وفاعل مستتر:',
    whoNone: 'لا توجد في {ref} ضمائر أو فاعلون مستترون تحتاج إلى شرح.', noData: 'لا توجد بيانات الجملة (MACULA) لـ {ref} على هذا الهاتف.',
    missed: '{n} كلمة لهذه الآية ليست في هذه النسخة من النص الأصلي، فتُركت.', unmapped: 'لم يوجد في نص الكتاب المقدس: الأصل فقط',
    roles: { subj: 'مَن يقوم بالفعل', obj: 'مَن يقع عليه الفعل', to: 'لمن أو إلى مَن', ref: 'ضمير' },
    treeIntro: 'بنية الجملة في {ref}، بترتيب الكلمات الأصلية. المس كلمة لترى الأصل.',
    fromBefore: 'تبدأ الجملة في {ref}.', goesOn: 'تستمر الجملة في {ref}.', legend: 'الوظائف', showOrig: 'أظهر الكلمات الأصلية', hideOrig: 'أخفِ الكلمات الأصلية',
    clause: 'جملة · {n} كلمات', source: 'النحو والمراجع: MACULA {heb}. الكلمات: {res}.' },
}
export const MW = (ui: string) => W[lang(ui)]
/** A graph point's word for what it shows ("Ruth 2:4 · Who is who"), or null. */
export function maculaWord(ui: string, what: string): string | null {
  const w = W[lang(ui)]
  return what === 'who' ? w.pointWho : what === 'structure' ? w.pointTree : null
}

// --------------------------------------------------------------------------------------------- the question, read by code

const QUOTE = `["'“”‘’«»„]`
const P_EN = 'he|she|they|him|her|them|it|i|me|we|us|you|his|hers|their|its'
const P_ES = 'el|ella|ellos|ellas|le|lo|la|les|los|las|tu|te|yo|me|nosotros|usted|ustedes|su|sus'
const P_FR = 'il|elle|ils|elles|lui|le|la|les|leur|tu|te|toi|je|moi|nous|vous|on'
const P_ID = 'dia|ia|mereka|engkau|kamu|aku|saya|kami|kita|beliau|kau|nya'
const P_HI = 'वह|वो|वे|उसने|उसे|उसको|उन्होंने|उन्हें|उनको|तुम|तू|मैं|हम|आप|उसका|उसकी|उसके|उनका|उनकी|उनके|यह|ये|इसने|इसे'
const P_AR = 'هو|هي|هم|هن|هما|انت|انتم|انا|نحن|ه|ها'
/** The pronouns safe to take unquoted: no articles (el, la, le, les, lo...), no second person (you, kamu), no possessives that start a noun phrase (their). */
const U_EN = 'he|she|they|him|her|them|it|we|us'
const U_ES = 'ella|ellos|ellas|yo|nosotros'
const U_FR = 'il|elle|ils|elles|lui|leur|nous'
const U_ID = 'dia|ia|mereka|aku|saya|kami|kita|beliau'
const U_HI = 'वह|वो|वे|उसने|उसे|उसको|उन्होंने|उन्हें|उनको|मैं|हम|उसका|उसकी|उसके|उनका|उनकी|उनके|इसने|इसे'
const U_AR = 'هو|هي|هم|هن|هما|انا|نحن'
/** After a pronoun with no quotes: a place ("he in Ruth 2:4"), the question's end; not a noun ("¿quién es el redentor?"). */
const END = `(?=\\s+(?:in|en|dans|di|dalam|here|aqui|ici|disini|di sini|this|este|ce)\\b|\\s*[?؟.!]|\\s*$)`
const RE_ALL = [
  /\bwho(?:'s| is| are| was| were)\s+who\b/, /\bquien(?:es)? es quien\b/, /\bqui est qui\b/, /\bsiapa (?:adalah |itu )?siapa\b/,
  /कौन\s+(?:किसको|किसे|किसका|किसकी|कौन)/, /من (?:هو|هي|هم) من(?=\s|$|[؟?])/,
]
const RE_REFER = [
  /\b(?:who|whom|what)\b.*\b(?:refers?|referring|referred)\b/, /\b(?:quien|que)\b.*\bse refiere\b/, /\bse refiere(?:n)? a quien\b/,
  /\b(?:qui|quoi)\b.*\b(?:se (?:refere|rapporte)|renvoie|designe|fait reference)\b/, /\b(?:se (?:refere|rapporte)|renvoie|designe)\s+a\s+qui\b/,
  /\b(?:merujuk|mengacu|menunjuk)\b.*\b(?:siapa|apa)\b/, /\bsiapa\b.*\b(?:dirujuk|dimaksud)\b/,
  /(?:संकेत|संदर्भित|इशारा|दर्शाता|दर्शाती|दर्शाते)/, /(?:يشير|تشير|يعود|تعود|المقصود|الضمير)/,
]
const RE_PRON = [
  new RegExp(`\\bwho\\s+(?:is|are|was|were|does)\\s+(?:the\\s+)?(?:${QUOTE}(${P_EN})${QUOTE}|(${U_EN})\\b${END})`),
  new RegExp(`\\bquien(?:es)?\\s+(?:es|son|era|eran)\\s+(?:${QUOTE}(${P_ES})${QUOTE}|(${U_ES})${END})`),
  new RegExp(`\\bqui\\s+(?:est|sont|etait)\\s+(?:${QUOTE}(${P_FR})${QUOTE}|(${U_FR})${END})`),
  new RegExp(`\\bsiapa(?:kah)?\\s+(?:yang dimaksud(?:kan)?\\s+(?:dengan\\s+)?)?(?:${QUOTE}-?(${P_ID})${QUOTE}|(${U_ID})${END})`),
  new RegExp(`${QUOTE}-?(${P_ID})${QUOTE}\\s+(?:itu\\s+)?siapa`),
  new RegExp(`(?:^|[\\s(])${QUOTE}?(${P_HI})${QUOTE}?\\s+(?:कौन|किसको|किसे)`),
  new RegExp(`कौन\\s+(?:है|हैं|था|थे)\\s+${QUOTE}(${P_HI})${QUOTE}`),
  new RegExp(`من\\s+(?:هو|هي|هم)\\s+${QUOTE}(${P_AR})${QUOTE}`),
]
const LATIN_U = new Set([U_EN, U_ES, U_FR, U_ID].join('|').split('|'))
const OTHER_U = new Set([U_HI, U_AR].join('|').split('|'))
const LATIN_P = new Set([P_EN, P_ES, P_FR, P_ID].join('|').split('|'))
const OTHER_P = new Set([P_HI, P_AR].join('|').split('|'))
/** A pronoun of one of the six languages (folded), or a word of the original (Hebrew, Greek): what may be asked about. */
const isPronoun = (w: string): boolean => {
  const k = fold(w).replace(/^-/, '')
  return LATIN_P.has(k) || OTHER_P.has(k) || /^[\u0590-\u05FF\u0370-\u03FF\u1F00-\u1FFF]+$/.test(w)
}
/** The first pronoun standing as a word in a folded question (one letter is not enough: "i", "a"). */
function pronounIn(f: string): string | null {
  for (const w of f.split(/[^\p{L}\p{M}]+/u)) if (w.length > 1 && (LATIN_U.has(w) || OTHER_U.has(w))) return w
  return null
}
/** The word in quotes ("who does 'him' refer to?"). */
const RE_QUOTED = new RegExp(`${QUOTE}\\s*([^"'“”‘’«»„]{1,30}?)\\s*${QUOTE}`)

/**
 * Whether a question asks who a pronoun or an implied subject is ("who is 'he' in Ruth 2:4?", "¿a quién se refiere «ella»?",
 * "who is who in this verse?", "रूत 2:4 में 'वह' कौन है?", "إلى من يعود الضمير في راعوث 2:4؟"), and the word it names, if
 * any. Not "who is Boaz?" (that is the article): a pronoun, a word in quotes with "refer", or "who is who" must be there.
 * The passage is the pipeline's to find (in the question, else the conversation's).
 */
export function asksWho(q: string): { word: string | null } | null {
  const f = fold(q).replace(/[’‘]/g, "'")
  const quoted = RE_QUOTED.exec(q)?.[1]?.trim() ?? null
  if (RE_ALL.some((r) => r.test(f))) return { word: null }
  for (const r of RE_PRON) {
    const m = r.exec(f)
    if (m) return { word: quoted ?? m.slice(1).find(Boolean) ?? null }
  }
  // "who does he refer to?", "à qui se réfère « il » ?": a pronoun must be named (quoted or not), or the word "pronoun"
  if (RE_REFER.some((r) => r.test(f))) {
    if (quoted && isPronoun(quoted)) return { word: quoted }
    const said = pronounIn(f)
    if (!quoted && said) return { word: said }
    if (/\b(?:pronoun|pronombre|pronom|kata ganti)\b|सर्वनाम|الضمير/.test(f)) return { word: null }
  }
  return null
}

// ----------------------------------------------------------------------------------------------- reading from the packs

/** How long a passage answer waits for a book's MACULA to decide its buttons (ms); then it offers them and reads on. */
export const MAC = { budgetMs: 250 }

const books = new Map<string, Promise<MacBook | null>>()
const glosses = new Map<string, Promise<Gloss | null>>()
const keep = <V>(m: Map<string, V>, k: string, v: V, max: number) => {
  m.set(k, v)
  while (m.size > max) m.delete(m.keys().next().value!)
}
/** Forget what was read (a pack added or removed; tests). */
export function resetMacula() {
  books.clear()
  glosses.clear()
  namesOf.clear()
}
/** The pack that has a book: the one asked, English, the others. */
async function packFor(book: string, l: string): Promise<string | null> {
  for (const x of new Set([l, 'en', ...(await installedLangs().catch(() => []))])) {
    try { if ((await hasLang(x)) && (await openLang(x)).installed(`book:${book}`)) return x } catch {}
  }
  return null
}
/** A book's MACULA (the pack reader keeps the segment; this keeps the two last books' wrappers and their verse index). */
export function macBook(book: string, l: string): Promise<MacBook | null> {
  let p = books.get(book)
  if (!p) {
    p = (async () => {
      const r = await openLang(l)
      if (!r.installed(`orig:${book}`) && !r.installed(`book:${book}`)) return null
      return macBookOf(book, (await r.orig(book)) as any)
    })()
    keep(books, book, p, 2)
    p.catch(() => { if (books.get(book) === p) books.delete(book) })
  }
  return p
}
async function glossFor(book: string, l: string): Promise<Gloss | null> {
  const k = `${l}|${book}`
  let p = glosses.get(k)
  if (!p) {
    p = (async () => {
      const m = (await (await openLang(l)).book(book)) as any
      const t = pickText<any>(m?.texts ?? [])
      return t ? glossOf(l, t) : null
    })()
    keep(glosses, k, p, 3)
    p.catch(() => { if (glosses.get(k) === p) glosses.delete(k) })
  }
  return p
}
const namesOf = new Map<string, Promise<Names | null>>()
/** Strong → Translation Words articles (common xmap `strongs`), with the titles of the pack's language. */
function namesFor(l: string): Promise<Names | null> {
  let p = namesOf.get(l)
  if (!p) {
    p = (async () => {
      const maps = (await (await openLang(l)).maps()) as any
      const strongs = maps?.xmap?.core?.strongs as Record<string, string[]> | undefined
      const titles = (maps?.map?.core?.names ?? {}) as Record<string, string[]>
      if (!strongs) return null
      const inv = new Map<string, string[]>()
      for (const [id, list] of Object.entries(strongs)) for (const s of list) {
        const k = strongKey(s)
        const a = inv.get(k)
        if (!a) inv.set(k, [id])
        else if (!a.includes(id)) a.push(id)
      }
      return { ids: (s) => inv.get(s), title: (id) => titles[id]?.[0] }
    })()
    namesOf.set(l, p)
    p.catch(() => { if (namesOf.get(l) === p) namesOf.delete(l) })
  }
  return p
}

/** "rut 2:4" → its parts; a range "rut 2:4-6"; null for a chapter, an introduction, a story. */
export function verseRef(ref: string | null | undefined): { book: string; c: number; v: number; to: number } | null {
  const m = /^([0-9a-z]{3}) (\d+):(\d+)(?:-(\d+))?$/.exec(ref ?? '')
  return m ? { book: m[1]!, c: +m[2]!, v: +m[3]!, to: m[4] ? +m[4] : +m[3]! } : null
}

/** What the answer draws (syntaxview.ts): who is who, or the diagram. Kept with the message (small: one verse). */
export type MacView =
  | { kind: 'who'; ui: string; verses: (WhoVerse & { label: string })[]; word: string | null; greek: boolean; res: string; source: string }
  | { kind: 'tree'; ui: string; tree: TreeVerse; label: string; greek: boolean; res: string; source: string; from?: string; next?: string }

const release = (mb: MacBook) => mb.release?.match(/#(\d{4}-\d{2}-\d{2})/)?.[1] ?? ''
const resName = (res: string) => res.split('/').pop()!.toUpperCase()

/** What a MACULA answer returns to the pipeline (its `Done`, less the meta line). */
export type MacDone = { answered: string; ref: string | null; concept: string | null; found: number; reply: {
  intro?: string | null; info?: string; follow?: Followup[]; ui?: string; lang?: string; macula?: MacView } }

const passage = (base: Sheet, ref: string, what: string[], l = base.lang): Sheet =>
  ({ ...base, id: `m${Date.now()}`, intent: 'passage', ref, what, lang: l, concept: null, phrase: null, candidates: null, term: null, version: null })
const article = (base: Sheet, id: string, l: string): Sheet =>
  ({ ...base, id: `m${Date.now()}`, intent: 'article', concept: id, lang: l, ref: null, what: [], phrase: null, candidates: null, term: null, version: null })

/**
 * The buttons under a passage answer of one verse: "Who is who in this verse?" (only when the verse has referents) and "See the
 * sentence structure". A book read already answers at once; a book not read yet gets `MAC.budgetMs` (a small book is read in
 * that time; Genesis is not: then both are offered, the book goes on being read for the next answer, and a verse with none
 * says so when tapped).
 */
export async function maculaSteps(sheet: Sheet, ui: string): Promise<Followup[]> {
  const r = verseRef(sheet.ref)
  if (sheet.intent !== 'passage' || !r || r.to !== r.v) return []
  const l = await packFor(r.book, sheet.lang)
  if (!l) return []
  const reader = await openLang(l)
  if (!reader.installed(`orig:${r.book}`)) return []
  const w = W[lang(ui)]
  const both = (who: boolean): Followup[] => [
    ...(who ? [{ label: w.who, sheet: passage(sheet, sheet.ref!, ['who'], l) }] : []),
    { label: w.tree, sheet: passage(sheet, sheet.ref!, ['structure'], l) },
  ]
  const read = macBook(r.book, l).then((mb) => (mb ? both(hasWho(mb, r.c, r.v)) : []))
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((ok) => { timer = setTimeout(() => ok(null), MAC.budgetMs) })
  const got = await Promise.race([read.catch(() => [] as Followup[]), late])
  clearTimeout(timer)
  return got ?? both(true)
}

/**
 * The answer to a sheet that asks who is who (`what: ['who']`) or the structure (`['structure']`) of a verse, with its next
 * steps. `q`: the typed question, whose quoted pronoun ("he") narrows the list. Always an answer: no data says so.
 */
export async function maculaAnswer(sheet: Sheet, ui: string, q?: string): Promise<MacDone> {
  const w = W[lang(ui)]
  const r = verseRef(sheet.ref)
  // (only verses have them: a chapter's sheet never gets here from a button, and a typed question names a verse)
  if (!r) return { answered: 'passage', ref: sheet.ref ?? null, concept: null, found: 0, reply: { intro: fill(w.noData, { ref: sheet.ref ?? '' }), follow: [], ui } }
  const ref =`${r.book} ${r.c}:${r.v}${r.to !== r.v ? `-${r.to}` : ''}`
  const label = (c: number, v: number, to = v) => `${bookLabel(ui, r.book)} ${c}:${v}${to !== v ? `–${to}` : ''}`
  const l = (await packFor(r.book, sheet.lang)) ?? sheet.lang
  const mb = await macBook(r.book, l).catch(() => null)
  const g = mb ? await glossFor(r.book, l).catch(() => null) : null
  const back: Followup = { label: label(r.c, r.v, r.to), sheet: passage(sheet, ref, ['text', 'notes'], l) }
  const none = (text: string, found = 0): MacDone => ({ answered: 'passage', ref, concept: null, found, reply: { intro: text, follow: [back], ui, lang: l } })
  if (!mb) return none(fill(w.noData, { ref: label(r.c, r.v, r.to) }))
  const source = fill(w.source, { heb: release(mb), res: g ? resName(g.res) : '—' })
  const near = (c: number, v: number, what: string, test: (c: number, v: number) => boolean, text: string): Followup | null =>
    mb.verse(c, v) && test(c, v) ? { label: fill(text, { ref: label(c, v) }), sheet: passage(sheet, `${r.book} ${c}:${v}`, [what], l) } : null
  const prevOf = (c: number, v: number): [number, number] => (v > 1 ? [c, v - 1] : [c - 1, lastVerse(mb, c - 1)])
  const nextOf = (c: number, v: number): [number, number] => (mb.verse(c, v + 1) ? [c, v + 1] : [c + 1, 1])

  if (sheet.what.includes('structure')) {
    const tree = treeOf(mb, g, r.c, r.v)
    if (!tree?.sentences.length) return none(fill(w.noData, { ref: label(r.c, r.v) }))
    const first = tree.sentences[0]!, last = tree.sentences[tree.sentences.length - 1]!
    const [pc, pv] = prevOf(r.c, r.v)
    const [nc, nv] = nextOf(r.c, r.v)
    const from = first.before ? label(pc, pv) : undefined
    const next = last.after ? label(nc, nv) : undefined
    const intro = [fill(w.treeIntro, { ref: label(r.c, r.v) }), from ? fill(w.fromBefore, { ref: from }) : '', next ? fill(w.goesOn, { ref: next }) : ''].filter(Boolean).join(' ')
    const follow: Followup[] = []
    const nx = near(nc, nv, 'structure', () => true, w.treeOf)
    const pr = near(pc, pv, 'structure', () => true, w.treeOf)
    // the sentence goes on: its next verse first (and where it started, when it started before)
    if (next && nx) follow.push(nx)
    if (from && pr) follow.push(pr)
    if (hasWho(mb, r.c, r.v)) follow.push({ label: w.who, sheet: passage(sheet, sheet.ref!, ['who'], l) })
    if (!next && nx) follow.push(nx)
    if (!from && pr) follow.push(pr)
    follow.push(back)
    const view: MacView = { kind: 'tree', ui, tree, label: label(r.c, r.v), greek: mb.greek, res: g?.res ?? '', source, ...(from ? { from } : {}), ...(next ? { next } : {}) }
    return { answered: 'passage', ref, concept: null, found: tree.sentences.reduce((n, s) => n + s.words, 0),
      reply: { intro, info: treeText(tree, ui), follow, ui, lang: l, macula: view } }
  }

  // who is who: each verse of the passage that has referents (a range: six verses at most)
  const names = await namesFor(l).catch(() => null)
  const verses: (WhoVerse & { label: string })[] = []
  for (let v = r.v; v <= Math.min(r.to, r.v + 5); v++) {
    const x = whoIn(mb, g, names, r.c, v)
    if (x?.items.length) verses.push({ ...x, label: label(r.c, v) })
  }
  const asked = q ? asksWho(q)?.word ?? null : null
  // a word asked about ("he"): its lines only, when the Bible text has it as a word of its own
  let shownVerses = verses
  let intro = fill(w.whoAll, { ref: label(r.c, r.v, r.to) })
  if (asked) {
    const k = fold(asked).replace(/^-/, '')
    const has = (it: WhoItem) => fold(it.gl).split(/[^\p{L}\p{M}\p{N}]+/u).includes(k) || formKey(it.orig, mb.greek) === formKey(asked, mb.greek) ||
      (k.length > 1 && fold(it.gl).endsWith(k) && /^(?:nya|ه|ها)$/.test(k))
    const only = verses.map((x) => ({ ...x, items: x.items.filter(has) })).filter((x) => x.items.length)
    if (only.length) {
      shownVerses = only
      intro = fill(w.whoWord, { ref: label(r.c, r.v, r.to), w: asked })
    } else if (verses.length) intro = fill(w.whoNot, { ref: label(r.c, r.v, r.to), w: asked })
  }
  const missed = verses.reduce((n, x) => n + x.missed, 0)
  if (missed) intro += ' ' + fill(w.missed, { n: String(missed) })
  const follow: Followup[] = []
  if (r.to === r.v) follow.push({ label: w.tree, sheet: passage(sheet, sheet.ref!, ['structure'], l) })
  // the people it names, each its Translation Words article (two at most)
  const ids = [...new Set(shownVerses.flatMap((x) => x.items.map((i) => i.to.id)).filter((id): id is string => !!id && id.startsWith('tw:')))]
  for (const id of ids.slice(0, 2)) {
    const t = names?.title(id)
    if (t) follow.push({ label: t, sheet: article(sheet, id, l) })
  }
  const [nc, nv] = nextOf(r.c, r.to)
  const [pc, pv] = prevOf(r.c, r.v)
  const nx = near(nc, nv, 'who', (c, v) => hasWho(mb, c, v), w.whoIn)
  const pr = near(pc, pv, 'who', (c, v) => hasWho(mb, c, v), w.whoIn)
  if (nx) follow.push(nx)
  if (pr) follow.push(pr)
  follow.push(back)
  if (!verses.length) return { ...none(fill(w.whoNone, { ref: label(r.c, r.v, r.to) })), reply: { intro: fill(w.whoNone, { ref: label(r.c, r.v, r.to) }), follow, ui, lang: l } }
  const view: MacView = { kind: 'who', ui, verses: shownVerses, word: asked, greek: mb.greek, res: g?.res ?? '', source }
  return { answered: 'passage', ref, concept: null, found: shownVerses.reduce((n, x) => n + x.items.length, 0),
    reply: { intro, info: whoText(view, ui), follow, ui, lang: l, macula: view } }
}
function lastVerse(mb: MacBook, c: number): number {
  let v = 0
  while (c >= 1 && mb.verse(c, v + 1)) v++
  return v
}

/** Who is who as text (what is shared, saved and reported): "**And he said** (וַיֹּאמֶר, who does it) → **Boaz** (בֹּעַז)". */
export function whoText(view: Extract<MacView, { kind: 'who' }>, ui: string): string {
  const w = W[lang(ui)]
  const arrow = lang(ui) === 'ar' ? '←' : '→'
  const out: string[] = []
  for (const x of view.verses) {
    if (view.verses.length > 1) out.push(`### ${x.label}`)
    for (const it of x.items) {
      const said = it.gl || it.orig
      const to = it.to.gl ?? `${it.to.orig} (${w.unmapped})`
      out.push(`- **${said}** (${it.orig}${it.suffix ? ` -${it.suffix}` : ''}, ${w.roles[it.role]}) ${arrow} **${to}**${it.to.gl ? ` (${it.to.orig})` : ''}`)
    }
  }
  out.push('', `_${view.source}_`)
  return out.join('\n')
}
/** The diagram as indented text (shared, saved, reported): "S: Boaz · V: coming · PP: from Bethlehem". */
export function treeText(t: TreeVerse, ui: string): string {
  const out: string[] = []
  const word = (x: TWord) => (x.gl ? `${x.gl} (${x.orig})` : x.orig)
  const walk = (n: TNode, depth: number) => {
    const ws = n.kids.filter((k): k is TWord => k.k === 'w').map(word)
    const name = n.role ? roleName(ui, n.role)[0] : '[ ]'
    out.push(`${'  '.repeat(depth)}- ${name}${n.clause && n.role ? ' [ ]' : ''}${ws.length ? `: ${ws.join(' · ')}` : ''}`)
    for (const k of n.kids) if (k.k === 'n') walk(k, depth + 1)
  }
  for (const s of t.sentences) walk(s.root, 0)
  return out.join('\n')
}
