// Slots written by the fine-tuned model -> the call sheet the recipes read (port of build_sheet in fase0 py/fill_model.py).
import books from './data/books.json'
import figs from './data/figs.json'
import glossary from './data/kt-glossary.json'
import type { Sheet } from './answer'
import { hasLang, installedLangs, openLang } from './packs'

export type Slots = {
  intent?: string; book?: string | null; chapter?: number | null; verse_start?: number | null; verse_end?: number | null
  what?: string[]; version?: string | null; term?: string | null; phrase?: string | null; lang?: string; other_language?: string | null
}
const UI_LANGS = ['en', 'es', 'fr', 'id', 'hi', 'ar']
const DEV = '०१२३४५६७८९'
const isDeva = (s: string) => /[ऀ-ॿ]/.test(s)

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const AR_FOLD: Record<string, string> = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ئ': 'ي', 'ؤ': 'و', 'ة': 'ه' }
/** Lower case, Latin digits (Devanagari and Arabic-Indic too), no accents (not in Devanagari), Arabic letters folded as py/langs.py does. */
export function fold(s: string): string {
  s = s.normalize('NFC').toLowerCase().replace(/’/g, "'").replace(/[०-९]/g, (d) => String(DEV.indexOf(d)))
  s = s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  if (!isDeva(s)) s = s.normalize('NFD').replace(/\p{Mn}/gu, '').normalize('NFC')
  if (/[ء-ي]/.test(s)) s = s.replace(/ـ/g, '').replace(/[أإآٱىئؤة]/g, (c) => AR_FOLD[c]!)
  return s
}
function normBook(s: string): string {
  s = fold(s).replace(/[.\-–،]/g, ' ').trim()
  s = s.replace(/^(iii|ii|i) /, (_, r: string) => `${r.length} `).replace(/^([123])(?=\D)/, '$1 ')
  s = s.replace(/\s+/g, ' ').trim().replace(/^(kitab |injil |le livre de |livre de |l'evangile selon |l'evangile de |evangile selon |evangile de |سفر |انجيل |رساله )/, '')
  return s.replace(/\s+/g, ' ').trim()
}
const exactMemo = new Map<string, string | null>()
/** A book named exactly (any language's table), without guessing from a prefix or a misspelling: for scanning a sentence word by word. */
export function bookExact(name: string): string | null {
  if (exactMemo.has(name)) return exactMemo.get(name)!
  if (exactMemo.size > 4000) exactMemo.clear()
  const k = normBook(name)
  let c: string | null = null
  for (const t of Object.values(books as Record<string, Record<string, string>>)) if (t[k]) { c = t[k]!; break }
  exactMemo.set(name, c)
  return c
}
const NAME_WORDS = new Map<string, Set<string>>()
/** Every word of every name a book has in any language's table, folded ("cantar", "de", "los", "cantares", "song", "kidung"…). */
export function bookNameWords(code: string): Set<string> {
  let s = NAME_WORDS.get(code)
  if (!s) {
    s = new Set([code])
    for (const t of Object.values(books as Record<string, Record<string, string>>))
      for (const [n, c] of Object.entries(t)) if (c === code) for (const w of n.split(/\s+/)) if (w) s.add(fold(w))
    NAME_WORDS.set(code, s)
  }
  return s
}
let LAST_WORDS: Set<string> | undefined
/**
 * Whether a word is the last of a book name of several words ("काम" of "प्रेरितों के काम", "الأولى", "rasul", "cantiques"), so
 * the words before it may belong to the name. A number and one word ("1 juan") is left out: the reading takes that digit anyway.
 */
export function endsLongName(word: string): boolean {
  LAST_WORDS ??= new Set(
    Object.values(books as Record<string, Record<string, string>>).flatMap((t) => Object.keys(t)).map(normBook)
      .filter((n) => n.includes(' ') && !/^[1-3] \S+$/.test(n)).map((n) => n.slice(n.lastIndexOf(' ') + 1)),
  )
  let v = lastMemo.get(word)
  if (v === undefined) {
    if (lastMemo.size > 4000) lastMemo.clear()
    v = LAST_WORDS.has(normBook(word))
    lastMemo.set(word, v)
  }
  return v
}
const lastMemo = new Map<string, boolean>()
let CODES: Set<string> | undefined
const codeMemo = new Map<string, string | null>()
/** A book's code from its name in any language: exact, else a prefix, else one or two letters off ("Mathew"). Remembered (pure). */
export function bookCode(lang: string, name: string | null | undefined): string | null {
  if (!name) return null
  const key = `${lang}\u0000${name}`
  if (codeMemo.has(key)) return codeMemo.get(key)!
  if (codeMemo.size > 4000) codeMemo.clear()
  const c = readCode(lang, name)
  codeMemo.set(key, c)
  return c
}
function readCode(lang: string, name: string): string | null {
  const k = normBook(name)
  const tables = books as Record<string, Record<string, string>>
  // a code itself ("rut"): a follow-up's book comes from the conversation's state, where books are kept as codes
  // (before normBook's spacing: it turns "1jn" into "1 jn", which is in no table)
  const raw = fold(name).trim()
  if (/^[1-3]?[a-z]{2,3}$/.test(raw) && (CODES ??= new Set(Object.values(tables).flatMap((t) => Object.values(t)))).has(raw)) return raw
  for (const l of [lang, ...Object.keys(tables).filter((x) => x !== lang)]) {
    const c = tables[l]?.[k]
    if (c) return c
  }
  // a known prefix ("matt", "jona")
  for (const l of [lang, 'en', 'es']) {
    const t = tables[l] ?? {}
    const hit = Object.keys(t).find((n) => n.length >= 3 && k.length >= 3 && n.startsWith(k))
    if (hit) return t[hit]!
  }
  // a misspelled name ("Mathew", "Genesys", "Jonas"): the closest name, one edit away (two for long names)
  if (k.length >= 4 && !/\d/.test(k)) {
    let bestD = k.length >= 7 ? 2 : 1
    let codes = new Set<string>()
    for (const l of [lang, 'en', 'es']) {
      for (const [n, c] of Object.entries(tables[l] ?? {})) {
        if (Math.abs(n.length - k.length) > bestD) continue
        const d = edits(k, n)
        if (d < bestD) {
          bestD = d
          codes = new Set([c])
        } else if (d === bestD) codes.add(c)
      }
    }
    if (codes.size === 1) return [...codes][0]!
  }
  return null
}
/** A book the composer may offer for what was typed: its code, the name of the table it matched, and how it matched. */
export type BookCandidate = { code: string; name: string; how: 'exact' | 'prefix' | 'typo' }
const BOOK_LANGS = ['en', 'es', 'fr', 'id', 'hi', 'ar']
/** Devanagari syllables, roughly: letters that are not vowel signs and do not follow a virama ("योना" 2, "रूत" 2, "1 शमूएल" 3). */
const syllables = (s: string) => (s.replace(/\S्\S/gu, 'x').match(/[\p{L}\d]/gu) ?? []).length
/**
 * Every book a typed name may be, best first (bookCode's search, keeping all the candidates instead of one or none): a code
 * or a name of any language's table ("rut", "Ruth", "1 jn", "रूत"), then the names that start with it ("ro" → Romans; at
 * least two letters, two syllables in Devanagari), then the names one edit away (two for long names: "Mathew", "Jonas").
 * Names of the app's language first, then English and Spanish, then the others. "1 Juan" is 1 John; "Juan" is John.
 */
export function bookCandidates(ui: string, text: string): BookCandidate[] {
  const k = normBook(text)
  if (!k) return []
  const tables = books as Record<string, Record<string, string>>
  const order = [...new Set([ui, 'en', 'es', ...BOOK_LANGS])].filter((l) => tables[l])
  const out: BookCandidate[] = []
  const seen = new Set<string>()
  const add = (code: string, name: string, how: BookCandidate['how']) => {
    if (!seen.has(code)) {
      seen.add(code)
      out.push({ code, name, how })
    }
  }
  const raw = fold(text).replace(/\s+/g, '')
  if (/^[1-3]?[a-z]{2,3}$/.test(raw) && (CODES ??= new Set(Object.values(tables).flatMap((t) => Object.values(t)))).has(raw)) add(raw, raw, 'exact')
  for (const l of order) if (tables[l]![k]) add(tables[l]![k]!, k, 'exact')
  const long = isDeva(k) ? syllables(k) >= 2 : k.replace(/[\s\d]/g, '').length >= 2
  if (long) for (const l of order) for (const [n, c] of entriesOf(l)) if (n.length > k.length && n.startsWith(k)) add(c, n, 'prefix')
  // (a name written in full, or enough names that start so, needs no guess at a misspelling)
  if (k.length >= 4 && !/\d/.test(k) && out[0]?.how !== 'exact' && out.length < 6) {
    const max = k.length >= 7 ? 2 : 1
    const near: [number, string, string][] = []
    for (const l of order)
      for (const [n, c] of entriesOf(l)) {
        if (Math.abs(n.length - k.length) > max || seen.has(c)) continue
        const d = within(k, n, max)
        if (d && d <= max) near.push([d, c, n])
      }
    for (const [, c, n] of near.sort((a, b) => a[0] - b[0])) add(c, n, 'typo')
  }
  return out
}
const ENTRIES = new Map<string, [string, string][]>()
const entriesOf = (l: string) => {
  let e = ENTRIES.get(l)
  if (!e) ENTRIES.set(l, (e = Object.entries((books as Record<string, Record<string, string>>)[l] ?? {})))
  return e
}
/** The edit distance when it is at most `max`, else max + 1 (stops as soon as a row passes it). */
function within(a: string, b: string, max: number): number {
  let row = new Array<number>(b.length + 1)
  let next = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) row[j] = j
  for (let i = 1; i <= a.length; i++) {
    next[0] = i
    let low = i
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1))
      next[j] = v
      if (v < low) low = v
    }
    if (low > max) return max + 1
    ;[row, next] = [next, row]
  }
  return row[b.length]!
}
function edits(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = cur
    }
  }
  return row[b.length]!
}

const clean = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return ['', 'null', 'none', 'n/a'].includes(t.toLowerCase()) ? null : t
}
const int = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null

/** Key terms written in French, Indonesian or Hindi -> their article id (no packs exist in those languages yet). */
const GLOSS = new Map<string, string[]>()
for (const [id, byLang] of Object.entries(glossary as Record<string, Record<string, string[]>>))
  for (const names of Object.values(byLang)) for (const n of names) {
    const k = fold(n).trim()
    if (!GLOSS.get(k)?.includes(id)) GLOSS.set(k, [...(GLOSS.get(k) ?? []), id])
  }

/** Article ids whose name is the term, in the pack of `lang` and then English (tW first, then tA: all four manuals). */
export async function idsOf(term: string | null, packLangs: string[]): Promise<string[] | null> {
  if (!term) return null
  const f = fold(term).replace(/[«»"“”'?¿!¡.]/g, '').replace(/\s+/g, ' ').trim()
  const fig = (figs as Record<string, string>)[f]
  if (fig) return [`ta:translate/figs-${fig}`]
  const g = GLOSS.get(f)
  if (g) return g
  for (const pl of packLangs) {
    const exact = (await nameIndex(pl).catch(() => null))?.get(f)
    if (exact?.length) return [...exact]
  }
  return null
}
/**
 * A pack's Translation Words and Academy articles by each of their names, folded ("paz" → tw:kt/peace), Words first: built once
 * per pack reader (a pack added, updated or removed opens a new reader, so a new index), then a name is one map lookup.
 */
const NAME_INDEX = new WeakMap<object, Promise<Map<string, string[]>>>()
async function nameIndex(pl: string): Promise<Map<string, string[]>> {
  const r = await openLang(pl)
  let p = NAME_INDEX.get(r)
  if (!p) {
    p = (async () => {
      const m: any = await r.maps()
      const out = new Map<string, string[]>()
      for (const [id, ns] of Object.entries<string[]>(m.map?.core?.names ?? {})) {
        if (!(id.startsWith('tw:') || id.startsWith('ta:'))) continue
        for (const n of ns) {
          const k = fold(String(n).replace(/\(.*?\)/g, ' ')).replace(/\s+/g, ' ').trim()
          const l = out.get(k)
          if (!l) out.set(k, [id])
          else if (!l.includes(id)) l.push(id)
        }
      }
      for (const l of out.values()) l.sort((a, b) => (a.startsWith('tw:') ? 0 : 1) - (b.startsWith('tw:') ? 0 : 1))
      return out
    })()
    NAME_INDEX.set(r, p)
    p.catch(() => { if (NAME_INDEX.get(r) === p) NAME_INDEX.delete(r) })
  }
  return p
}

const LANG_NAMES: Record<string, string> = {
  indonesian: 'id', indonesio: 'id', bahasa: 'id', indonesia: 'id', spanish: 'es-419', espanol: 'es-419', english: 'en', ingles: 'en',
  anglais: 'en', espagnol: 'es-419', inggris: 'en', spanyol: 'es-419', french: 'fr', frances: 'fr', francais: 'fr', hindi: 'hi',
  portuguese: 'pt-br', portugues: 'pt-br', swahili: 'sw', arabic: 'ar', russian: 'ru', chinese: 'zh', german: 'de',
}

/** The pack of each language the person can write in, when the app has it. */
const UI_PACK: Record<string, string> = { es: 'es-419', id: 'id', hi: 'hi', ar: 'ar', fr: 'fr' }

/** `prefer`: the helps language chosen in the app (null: the pack of the language the person wrote in, else English). */
export async function buildSheet(qid: string, d: Slots, prefer: string | null = null): Promise<{ sheet: Sheet; ui: string }> {
  const ui = UI_LANGS.includes(d.lang ?? '') ? d.lang! : 'en'
  // the helps language chosen, else the pack of the question's language, else English, else any pack there is:
  // never a language that is not installed (nothing installed: 'en', and the app shows its "no packs" screen)
  let lang = 'en'
  for (const c of [prefer, UI_PACK[ui], 'en']) if (c && (await hasLang(c))) { lang = c; break }
  if (!(await hasLang(lang))) lang = (await installedLangs())[0] ?? 'en'
  // a term is named in the question's language even when the helps come from another pack ("¿Qué es la paz?" with the
  // helps in English: «paz» is tw:kt/peace)
  const own = UI_PACK[ui] && UI_PACK[ui] !== lang && (await hasLang(UI_PACK[ui]!)) ? [UI_PACK[ui]!] : []
  const packLangs = [...new Set([lang, ...own, 'en'])]
  const sheet: Sheet = {
    id: qid, intent: d.intent ?? 'unknown', ref: null, what: [], version: null, concept: null, term: null, phrase: null, candidates: null, lang,
  }
  const book = clean(d.book), ch = int(d.chapter), v1 = int(d.verse_start), v2 = int(d.verse_end)
  const term = clean(d.term), phrase = clean(d.phrase)
  const refOf = (): string | null => {
    const code = bookCode(ui, book)
    if (!code) return null
    if (!ch) return code
    if (!v1) return `${code} ${ch}`
    return `${code} ${ch}:${v1}` + (v2 && v2 > v1 ? `-${v2}` : '')
  }
  const what = (d.what ?? []).filter((w) => ['text', 'notes', 'questions', 'terms', 'intro'].includes(w))
  const version = d.version === 'ult' || d.version === 'ust' ? d.version : null
  const first = what.length ? what.slice(0, 1) : ['notes']
  switch (sheet.intent) {
    case 'passage': {
      let ref = refOf()
      if (what.length === 1 && what[0] === 'intro' && ref) {
        const [code, chv] = ref.split(' ')
        ref = chv ? `${code} ${chv.split(':')[0]}:intro` : `${code} front:intro`
      }
      Object.assign(sheet, { ref, what: what.length ? what : ['text', 'notes', 'questions', 'terms'], version })
      if (!ref) sheet.intent = 'unknown'
      break
    }
    case 'article': {
      const ids = await idsOf(term, packLangs)
      if (ids?.length === 1) sheet.concept = ids[0]!
      else if (ids?.length) Object.assign(sheet, { intent: 'choose', candidates: ids, term })
      else sheet.term = term
      break
    }
    case 'count': {
      const ids = await idsOf(term, packLangs)
      const strong = /^[GH]\d{1,5}$/.test((term ?? '').toUpperCase().replace(/ /g, ''))
      Object.assign(sheet, {
        ref: refOf(), what: first, concept: ids?.length === 1 ? ids[0] : null,
        candidates: ids && ids.length > 1 ? ids : null, term: strong ? term!.toUpperCase() : null,
      })
      break
    }
    case 'rank':
      Object.assign(sheet, { ref: refOf(), what: first })
      break
    case 'resources': {
      const named = clean(d.other_language)
      sheet.lang = (named && LANG_NAMES[fold(named).replace(/[^a-z]/g, '')]) || lang
      const ids = await idsOf(term, packLangs)
      if (ids?.length === 1) sheet.concept = ids[0]!
      break
    }
    case 'advice': {
      const ids = await idsOf(term, packLangs)
      const ref = refOf()
      // "Help me translate Jonah 1" names no phrase: that is a passage with its helps, not advice on one figure
      const phraseIsBook = !!phrase && !!book && fold(phrase).trim() === fold(book).trim()
      if (ref && (!phrase || phraseIsBook || !/:\d/.test(ref))) {
        Object.assign(sheet, { intent: 'passage', ref, what: /:\d/.test(ref) ? ['text', 'notes', 'questions', 'terms'] : ['text', 'notes'] })
        break
      }
      Object.assign(sheet, { ref, phrase, concept: ids?.length === 1 && ids[0]!.startsWith('ta:translate/figs-') ? ids[0] : null })
      if (!ref) sheet.term = term
      break
    }
    default:
      sheet.term = term
  }
  // The Spanish pack holds few books: for a book it lacks, answer from the English pack (the answer's words stay in Spanish).
  if (sheet.ref && /^[0-9a-z]{3}( |$)/.test(sheet.ref) && !sheet.ref.startsWith('obs')) {
    const code = sheet.ref.slice(0, 3)
    // installed() is optimistic (a listed unit counts): read the book to know.
    const has = async (l: string) => {
      try {
        const r = await openLang(l)
        return r.installed(`book:${code}`) && !!(await r.book(code))
      } catch {
        return false
      }
    }
    if (!(await has(sheet.lang))) {
      for (const pl of [...new Set(['en', ...(await installedLangs())])]) if (pl !== sheet.lang && (await has(pl))) { sheet.lang = pl; break }
    }
  }
  return { sheet, ui }
}
