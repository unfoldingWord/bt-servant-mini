// Typing suggestions ("Sugerencias al escribir", propuesta-composer-sugerencias.md): what the row above the chat box offers for
// the text being typed. No DOM here (composer.ts draws it), no pack or book opened while typing: only tables in memory (the
// books' names, data/versification.json, which books each installed pack has, read once by `booksOf`).
//
// The states of the row:
//   A  the box empty, with the focus: where the conversation is first (the light path's next step, "Siguiente: Rut 1:6–18 ·
//      notas", or the passage, "Rut 2:3 ▸"), then the ways of asking (passage, notes, meaning, how to translate) offered in
//      the app's language; "Passage" (and a shape's start, "Notas de ") lists the books there are
//   B  a book being typed: the books it may be ("ro" → Romanos), then the chapter strip, then the verse strip
//   D  understood: "✓ Rut 2:3 · notas", read by code with the very reading the answer uses (pipeline.ts directSheet); its tap
//      sends the box's text, which main.ts answers with that same reading (no model, no online reader)
//   C  a word or topic: the Translation Words and Translation Academy articles whose names start so (termindex.ts), alone
//      ("gra") or after the words of a meaning question ("¿Qué significa gra"), each a ready question for that article. Only
//      once the index is built (at idle after the first answer)
//   D+ a follow-up of the conversation ("notas", "siguiente", "5" after Rut 2:3): its "✓ Rut 2:3 · notas", read with
//      pipeline.ts followUpPreview, the reading the send uses (codeReads)
//   E  free text: nothing (the row takes no room; the question goes the usual way)
//   F  the book is not on this phone: said on the button, which never sends ("no está en este teléfono"); or it is answered from
//      another installed pack ("· en inglés"), exactly as buildSheet does
import { bookCandidates, bookCode, fold, type Slots } from './sheet'
import { rtlLang, strip as unmarked } from './bidi'
import { type ConvState, directSheet, env, followUpPreview, type FollowUp, pathLabel, pathSheet } from './pipeline'
import { has, replyLang } from './commands'
import { bookShown } from './firstuse'
import { academyLabel, introLabel, whatWord } from './converse'
import { CANON, onPacksChanged, openLang } from './packs'
import { nodeOf, passageAt, place, stepTarget } from './graph'
import type { Sheet } from './answer'
import { glossaryLookup, lookup, resetTermIndex, type TermHit, type TermKind } from './termindex'
import books from './data/books.json'
import shapes from './data/shapes.json'
import versification from './data/versification.json'

export type Kind = 'ok' | 'book' | 'help' | 'intro' | 'missing' | 'shape' | 'place' | 'next' | 'term'
/**
 * One button of the row. `send`: it sends the box's text as it is (the "✓"). `fill`: it writes this text in the box. `slots`: it
 * asks this ready question (a book's introduction). `sheet`: it asks this ready sheet (an article, the path's next step), as a
 * button under an answer does, with `ask` as the question shown. `choose`: it lists the books (Passage). `missing`: nothing is
 * sent; the composer offers Browse.
 */
export type Suggestion = { kind: Kind; label: string; fill?: string; send?: true; slots?: Slots; book?: string; sheet?: Sheet; ask?: string; choose?: true }
/** The chapter or verse strip: numbers 1…max; a tap writes `base + sep + n` in the box. */
export type Strip = { unit: 'chapter' | 'verse'; max: number; base: string; sep: string; at?: number }
/** `needs`: books to read before the row can say what they have (loadHelps); the composer reads them and makes the row again. */
export type Row = { items: Suggestion[]; strip?: Strip; understood?: Understood; needs?: [string, string][]
  /** the books to pick from (state A's Passage, a shape's start): each writes its name in the box */
  pick?: Suggestion[] }
/**
 * What a "✓" stands for: the slots the answer is built from, the pack it is read from, and the words it shows. `fu`: a
 * follow-up of the conversation ("notas" after Rut 2:3), read by followUpPreview.
 */
export type Understood = { label: string; ui: string; slots: Slots; code: string; pack: string; has: boolean; other: boolean; needs?: [string, string][]; fu?: true }
export type Ctx = {
  /** the app's language */
  ui: string
  conv: ConvState
  /** the helps language chosen in the app (env.helpsLang) */
  helpsLang: string | null
  /** the installed packs, in installedLangs() order */
  packs: string[]
  /** the books each installed pack has (booksOf); null while not read: then no "✓" and no book is offered as there */
  books: Record<string, Set<string>> | null
  /** state A's Passage was tapped: the empty box lists the books */
  choosing?: boolean
}

const UI_LANGS = ['en', 'es', 'fr', 'id', 'hi', 'ar']
/** The pack of each app language (as sheet.ts buildSheet picks it). */
const UI_PACK: Record<string, string> = { es: 'es-419', id: 'id', hi: 'hi', ar: 'ar', fr: 'fr' }
const VERSES = versification as Record<string, number[]>
const TABLES = books as Record<string, Record<string, string>>
const MAX = 6

type W = { none: string; inLang: string; notHere: string; browse: string; row: string; chapter: string; verse: string; toggle: string; books: string
  kinds: Record<TermKind, string>; langs: Record<string, string> }
const STR: Record<string, W> = {
  en: { none: 'no {what} on this phone', inLang: 'in {lang}', notHere: 'not on this phone', browse: 'See the books there are', row: 'Suggestions', chapter: 'Chapter', verse: 'Verse', toggle: 'Typing suggestions', books: 'Books',
    kinds: { kt: 'key term', names: 'name', other: 'word', ta: 'Academy' },
    langs: { en: 'English', 'es-419': 'Spanish', fr: 'French', id: 'Indonesian', hi: 'Hindi', ar: 'Arabic' } },
  es: { none: 'sin {what} en este teléfono', inLang: 'en {lang}', notHere: 'no está en este teléfono', browse: 'Ver los libros que sí hay', row: 'Sugerencias', chapter: 'Capítulo', verse: 'Versículo', toggle: 'Sugerencias al escribir', books: 'Libros',
    kinds: { kt: 'palabra clave', names: 'nombre', other: 'palabra', ta: 'Academia' },
    langs: { en: 'inglés', 'es-419': 'español', fr: 'francés', id: 'indonesio', hi: 'hindi', ar: 'árabe' } },
  fr: { none: 'pas de {what} sur ce téléphone', inLang: 'en {lang}', notHere: "n'est pas sur ce téléphone", browse: 'Voir les livres disponibles', row: 'Suggestions', chapter: 'Chapitre', verse: 'Verset', toggle: 'Suggestions pendant la saisie', books: 'Livres',
    kinds: { kt: 'mot clé', names: 'nom', other: 'mot', ta: 'Académie' },
    langs: { en: 'anglais', 'es-419': 'espagnol', fr: 'français', id: 'indonésien', hi: 'hindi', ar: 'arabe' } },
  id: { none: 'tidak ada {what} di ponsel ini', inLang: 'dalam {lang}', notHere: 'tidak ada di ponsel ini', browse: 'Lihat kitab yang ada', row: 'Saran', chapter: 'Pasal', verse: 'Ayat', toggle: 'Saran saat mengetik', books: 'Kitab',
    kinds: { kt: 'istilah kunci', names: 'nama', other: 'kata', ta: 'Akademi' },
    langs: { en: 'bahasa Inggris', 'es-419': 'bahasa Spanyol', fr: 'bahasa Prancis', id: 'bahasa Indonesia', hi: 'bahasa Hindi', ar: 'bahasa Arab' } },
  hi: { none: 'इस फ़ोन पर {what} नहीं', inLang: '{lang} में', notHere: 'इस फ़ोन पर नहीं है', browse: 'जो पुस्तकें हैं वे देखें', row: 'सुझाव', chapter: 'अध्याय', verse: 'पद', toggle: 'लिखते समय सुझाव', books: 'पुस्तकें',
    kinds: { kt: 'मुख्य शब्द', names: 'नाम', other: 'शब्द', ta: 'अकादमी' },
    langs: { en: 'अंग्रेज़ी', 'es-419': 'स्पेनिश', fr: 'फ़्रेंच', id: 'इंडोनेशियाई', hi: 'हिंदी', ar: 'अरबी' } },
  ar: { none: 'لا {what} على هذا الهاتف', inLang: 'بـ{lang}', notHere: 'ليس على هذا الهاتف', browse: 'عرض الأسفار الموجودة', row: 'اقتراحات', chapter: 'الأصحاح', verse: 'الآية', toggle: 'اقتراحات أثناء الكتابة', books: 'الأسفار',
    kinds: { kt: 'كلمة رئيسية', names: 'اسم', other: 'كلمة', ta: 'الأكاديمية' },
    langs: { en: 'الإنجليزية', 'es-419': 'الإسبانية', fr: 'الفرنسية', id: 'الإندونيسية', hi: 'الهندية', ar: 'العربية' } },
}
export const ST = (ui: string): W => STR[ui] ?? STR.en!
const fillT = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')

/** The books each installed pack has, as buildSheet tests them first (`installed`): read once, from the packs' catalogs. */
export async function booksOf(packs: string[]): Promise<Record<string, Set<string>>> {
  const out: Record<string, Set<string>> = {}
  for (const l of packs) {
    try {
      const r = await openLang(l)
      out[l] = new Set(CANON.filter((b) => r.installed(`book:${b}`)))
    } catch {
      out[l] = new Set()
    }
  }
  return out
}

/** What one book of one pack has (read from the book once: the answer reads it anyway); null: the book does not read. */
export type Helps = { text: boolean; notes: boolean; questions: boolean; terms: boolean; front: boolean; chapters: Set<number> }
const HELPS = new Map<string, Helps | null>()
const reading = new Map<string, Promise<Helps | null>>()
/** What a book of a pack has, when it was read (undefined: not read yet). */
export const helpsKnown = (pack: string, code: string): Helps | null | undefined => HELPS.get(`${pack}:${code}`)
const isIntroRow = (x: any) => x?.cols?.isIntro === true || x?.cols?.isIntro === 'true'
/**
 * Reads a book once to know what it has, as the answer finds it: its texts, its notes, questions and key-term links (not the
 * introductions), and its introductions (the first intro row is the book's, one starting at a chapter's verse 1 is that
 * chapter's). A book that does not read (listed, not downloaded) is null: as buildSheet, the answer goes to another pack.
 */
export function loadHelps(pack: string, code: string): Promise<Helps | null> {
  const key = `${pack}:${code}`
  if (HELPS.has(key)) return Promise.resolve(HELPS.get(key)!)
  let p = reading.get(key)
  if (!p) {
    p = (async () => {
      let h: Helps | null = null
      try {
        const r = await openLang(pack)
        const m: any = r.installed(`book:${code}`) ? await r.book(code) : undefined
        if (m) {
          const rows = (t: any) => (t?.rows ?? []) as any[]
          const intros = rows(m.notes).filter(isIntroRow)
          const chapters = new Set<number>()
          for (const x of intros.slice(1)) if (x.from % 1000 === 1) chapters.add(Math.floor(x.from / 1000) % 1000)
          h = {
            text: (m.texts ?? []).length > 0, notes: rows(m.notes).some((x) => !isIntroRow(x)), questions: rows(m.questions).length > 0,
            terms: rows(m.links).some((x) => x.concept), front: intros.length > 0, chapters,
          }
        }
      } catch {}
      HELPS.set(key, h)
      reading.delete(key)
      return h
    })()
    reading.set(key, p)
  }
  return p
}
/** After the packs change: books are read again when needed. */
export function resetHelps() {
  HELPS.clear()
  reading.clear()
}
/** The packs changed (onPacksChanged): what the row knows of them is dropped, the word index too (built again after an answer). */
export function resetSuggest() {
  resetHelps()
  resetTermIndex()
}
onPacksChanged(resetSuggest)

/** The pack buildSheet starts from: the helps language, else the pack of the question's language, else English, else the first. */
function firstPack(slots: Slots, ctx: Ctx): string {
  const ui = UI_LANGS.includes(slots.lang ?? '') ? slots.lang! : 'en'
  let lang = 'en'
  for (const c of [ctx.helpsLang, UI_PACK[ui], 'en']) if (c && ctx.packs.includes(c)) { lang = c; break }
  return ctx.packs.includes(lang) ? lang : ctx.packs[0] ?? 'en'
}
/**
 * The pack a passage of `code` is answered from, as sheet.ts buildSheet chooses it: its first pack if that has the book, else
 * English, then the others; "has" as buildSheet tests it (installed, and the book reads), so a book listed but not downloaded
 * counts as missing. `needs`: a book to read first. Book buttons (state B) look at `installed` only (`quick`): nothing is read.
 */
export function packOf(slots: Slots, code: string, ctx: Ctx, quick = false): { pack: string; has: boolean; other: boolean; needs?: [string, string][] } {
  const lang = firstPack(slots, ctx)
  for (const pl of [lang, ...[...new Set(['en', ...ctx.packs])].filter((x) => x !== lang)]) {
    if (!ctx.books?.[pl]?.has(code)) continue
    if (quick) return { pack: pl, has: true, other: pl !== lang }
    const h = helpsKnown(pl, code)
    if (h === undefined) return { pack: pl, has: false, other: pl !== lang, needs: [[pl, code]] }
    if (h) return { pack: pl, has: true, other: pl !== lang }
  }
  return { pack: lang, has: false, other: false }
}
/**
 * Whether the answer will have the introduction (a book's, or a chapter's), as pipeline.ts introsOf looks for it: in the
 * sheet's pack, then English, then the others (an introduction from another pack is said so in the answer).
 */
function introIn(pack: string, code: string, ch: number | null, ctx: Ctx): { has: boolean; from?: string; needs?: [string, string][] } {
  for (const pl of new Set([pack, 'en', ...ctx.packs])) {
    if (!ctx.books?.[pl]?.has(code)) continue
    const h = helpsKnown(pl, code)
    if (h === undefined) return { has: false, needs: [[pl, code]] }
    if (h && h.front && (!ch || h.chapters.has(ch))) return { has: true, from: pl }
  }
  return { has: false }
}

const fillCache = new Map<string, string>()
const readMemo = new Map<string, boolean>()
/** Whether code reads "<name> 1:1" as this book (remembered: typing goes over the same names and words again and again). */
const readsAs = (name: string, code: string, ui: string): boolean => {
  const key = `${ui}\u0000${code}\u0000${name}`
  let r = readMemo.get(key)
  if (r === undefined) {
    if (readMemo.size > 2000) readMemo.clear()
    const s = directSheet(`${name} 1:1`)
    r = !!s?.book && bookCode(s.lang ?? ui, s.book) === code
    readMemo.set(key, r)
  }
  return r
}
/** Whether the words before a book being typed can stand before a reference ("notas de", "Introducción a"; not "por qué"). */
const leadReads = (lead: string, ui: string) => !lead || readsAs(`${lead}${fillName(ui, 'rut')}`, 'rut', ui)
const AR_ORD: Record<string, string> = { 'الأول': '1', 'الأولى': '1', 'الثاني': '2', 'الثانية': '2', 'الثالث': '3', 'الثالثة': '3' }
/**
 * The name the composer writes for a book: the one shown in the app's language when code reads it back ("Romanos 3"), else a
 * shorter way of writing it that code reads ("صموئيل الأول" → "1 صموئيل", "भजन संहिता" → "भजन"), else English.
 */
export function fillName(ui: string, code: string): string {
  const key = `${ui}:${code}`
  const hit = fillCache.get(key)
  if (hit) return hit
  const shown = bookShown(ui, code)
  const words = shown.split(/\s+/)
  const tries = [shown]
  const ord = AR_ORD[words[words.length - 1] ?? '']
  if (ord && words.length > 1) {
    const base = words.slice(0, -1).join(' ')
    tries.push(`${ord} ${base}`, `${ord} ${base.replace(/^ال/, '')}`)
  }
  for (let k = words.length - 1; k >= 1; k--) tries.push(words.slice(0, k).join(' '), words.slice(-k).join(' '))
  const own = Object.entries(TABLES[ui] ?? {}).filter(([, c]) => c === code).map(([n]) => (/[a-z]/.test(n) ? n.replace(/(^|\s)(\p{L})/gu, (_, sp, ch) => sp + ch.toUpperCase()) : n))
  tries.push(...own, bookShown('en', code))
  const name = tries.find((n) => readsAs(n, code, ui)) ?? shown
  fillCache.set(key, name)
  return name
}

/**
 * Where a way of asking is not offered: typed with no model, it does not give its button's sheet (tests/shapes.test.ts, Nov 15
 * 2026). The words ones go to the search in these languages ("What does grace mean?" finds verses, not the article); phase 2
 * offers words by their article, not by these phrases, until they read.
 */
export const SHAPES_OFF: Record<string, string[]> = { meaning: ['en', 'es', 'hi', 'ar'], howTranslate: ['es', 'hi', 'ar'] }
type ShapeData = Record<string, { label: Record<string, string>; text: Record<string, string> }>
const SHAPES = shapes as unknown as ShapeData
const SHAPES_ORDER = (shapes as unknown as { order: string[] }).order
/** Whether a shape is offered in this language (with a numbered book too since refInText reads "Notas de 1 Juan 3:2"). */
export function shapeOffered(shape: string, ui: string, _code?: string): boolean {
  return !SHAPES_OFF[shape]?.includes(ui) && !!SHAPES[shape]?.text[ui]
}
/** "Introducción a Rut 2", in the app's language (English where it has none). */
export function introText(ui: string, code: string, ch: number | null): string {
  const what = ch ? `${fillName(ui, code)} ${ch}` : fillName(ui, code)
  const l = SHAPES.intro!.text[ui] ? ui : 'en'
  return fillT(SHAPES.intro!.text[l]!, { what })
}

/** The help words a verse may get ("Rut 2:3 notas"), each one read back by code in every language (tests/shapes.test.ts). */
const HELP_KINDS = ['notes', 'questions', 'terms', 'text'] as const

/** The "✓" label of an introduction without its pack's note: "योना 1 का परिचय". */
const ref0 = (u: Understood) => introLabel(u.ui, refShown(u.ui, u.code, u.slots))

/** A reference as the row shows it: the book in the app's language, Latin digits. */
function refShown(ui: string, code: string, s: Slots): string {
  const name = bookShown(ui, code)
  if (!s.chapter) return name
  if (!s.verse_start) return `${name} ${s.chapter}`
  return `${name} ${s.chapter}:${s.verse_start}${s.verse_end && s.verse_end > s.verse_start ? `-${s.verse_end}` : ''}`
}

/**
 * The question as code alone reads it, with the pack it will be read from: the "✓" (null when it is not only a reference, it
 * asks for another language or for help, or the books of the packs are not read yet).
 */
export function understood(text: string, ctx: Ctx): Understood | null {
  const q = text.trim()
  if (!q || q.length > 120 || !ctx.books || replyLang(q) || has('help', q)) return null
  let slots = directSheet(q, ctx.conv)
  let code = slots?.book ? bookCode(slots.lang ?? ctx.ui, slots.book) : null
  // a follow-up of the conversation ("notas", "siguiente", "5"), as the send reads it (codeReads)
  const fu = slots ? null : followUpPreview(q, ctx.conv)
  if (fu && previewable(fu)) {
    slots = fu.slots
    code = fu.slots.book!
  }
  if (!slots || !code) return null
  const more = fu && slots === fu.slots ? { fu: true as const } : {}
  const where = packOf(slots, code, ctx)
  if (where.needs) return { label: '', ui: ctx.ui, slots, code, ...where, ...more }
  const what = slots.what ?? []
  const ref = refShown(ctx.ui, code, slots)
  let label = what.length === 1 && what[0] === 'intro' ? introLabel(ctx.ui, ref) : ref
  const w = what.length === 1 ? whatWord(ctx.ui, what[0]!) : null
  if (w) label += ` · ${w.toLocaleLowerCase(ctx.ui)}`
  if (where.other) label += ` · ${fillT(ST(ctx.ui).inLang, { lang: ST(ctx.ui).langs[where.pack] ?? where.pack })}`
  return { label, ui: ctx.ui, slots, code, ...where, ...more }
}

/**
 * A follow-up the "✓" may show: a passage (another verse, chapter or help of it), not a count, a term "here" or advice (their
 * answers read more than the slots), and within the book's chapters and verses as data/versification.json has them (readQuestion
 * moves "the next verse" past a chapter's end, or says there is none: no "✓" for those).
 */
function previewable(f: FollowUp): boolean {
  const s = f.slots
  if (f.counted || f.termWords || s.intent !== 'passage' || s.term || !s.book || f.how.startsWith('meaning')) return false
  const vs = VERSES[s.book]
  const ch = s.chapter ?? null
  if (!vs || ch === null || ch < 1 || ch > vs.length) return false
  const max = vs[ch - 1]!
  const v = s.verse_start ?? null, end = s.verse_end ?? null
  if (v === null) return end === null
  return v >= 1 && v <= max && (end === null || (end > v && end <= max))
}

const endsWithNumber = (t: string) => /[\d०-९٠-٩]\s*:?\s*$/.test(t)
const lastNumber = (t: string) => {
  const m = /(\d+)\s*:?\s*$/.exec(t.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))))
  return m ? +m[1]! : null
}

/** The row for the text in the box (states B, D, E, F). Pure and quick: no pack is opened here. */
export function suggest(text: string, ctx: Ctx): Row {
  const t = unmarked(text).replace(/^\s+/, '') // no bidi marks (text copied from the app or pasted from WhatsApp)
  // (the empty box: the composer shows startRow while the box has the focus)
  if (!t.trim()) return { items: [] }
  if (t.length > 120 || !ctx.books || replyLang(t) || has('help', t)) return { items: [] }
  const ok = understood(t, ctx)
  if (ok?.needs) return { items: [], needs: ok.needs }
  // "Notas de ": the start of a shape, then which book (after the "✓" of the passage the conversation is on, if any)
  const start = /\s$/.test(t) && shapeStart(t, ctx.ui)
  if (ok) {
    const row = rowOf(t, ok, ctx)
    return row.needs ? { items: [], needs: row.needs } : { ...row, understood: ok, ...(start ? { pick: bookList(t, ctx) } : {}) }
  }
  if (start) return { items: [], pick: bookList(t, ctx) }
  const b = bookRow(t, ctx)
  if (b.strip || b.items.some((x) => x.kind === 'missing')) return b
  const terms = termRow(t, ctx, MAX - b.items.length)
  return terms.length ? { items: [...b.items, ...terms] } : b
}

// ------------------------------------------------------------------------------------------------- A: the box is empty

const REF_RE = /^([0-9a-z]{3}) (front|\d+)(?::(intro|\d+)(?:-(\d+))?)?$/
/** The passage the conversation is on, as the box would write it ("Rut 2:3", "Introducción a Rut 2") and as the row shows it. */
function placeOf(ctx: Ctx): Suggestion | null {
  const c = ctx.conv
  const g = c.graph
  const ref = (g ? passageAt(g, g.cur)?.sheet.ref : null) ?? (c.last?.intent === 'passage' ? c.last.ref : null)
  const m = REF_RE.exec(ref ?? '')
  if (!m) return null
  const code = m[1]!
  const ch = m[2] === 'front' ? null : +m[2]!
  const ui = ctx.ui
  let label: string, fill: string
  if (m[3] === 'intro') {
    label = introLabel(ui, ch ? `${bookShown(ui, code)} ${ch}` : bookShown(ui, code))
    fill = introText(ui, code, ch)
  } else {
    if (!ch) return null
    const v = m[3] ? +m[3] : null, end = m[4] ? +m[4] : null
    label = refShown(ui, code, { chapter: ch, verse_start: v, verse_end: end })
    fill = `${fillName(ui, code)} ${ch}${v ? `:${v}${end ? `-${end}` : ''}` : ''}`
  }
  // only what code reads back as that very place (the "✓" comes once it is in the box)
  const s = directSheet(fill)
  if (!s?.book || bookCode(s.lang ?? ui, s.book) !== code || (s.chapter ?? null) !== ch) return null
  return { kind: 'place', label: `${label} ${rtlLang(ui) ? '◂' : '▸'}`, fill, book: code }
}
/**
 * The light path's step (graph.ts Path), one button: its next step when the conversation stands on the path (the same
 * "Next: …" as under the answer); the way back to it when it left the path for another book or an article.
 */
function pathOf(ctx: Ctx): Suggestion | null {
  const g = ctx.conv.graph
  const p = g?.path
  if (!g || !p) return null
  const cur = nodeOf(g, g.cur)
  const t = stepTarget(p)
  const onStep = !!cur && !!t && cur.sheet.ref === t.ref && t.what.every((w) => cur.sheet.what.includes(w))
  if (onStep) {
    const sheet = g.pathNext ? pathSheet(g.pathNext) : null
    return sheet ? { kind: 'next', label: pathLabel(ctx.ui, g.pathNext!, 'next'), sheet } : null
  }
  // (near it, in the path's book: the place instead, as no way back is offered under such an answer)
  if (!cur || place(cur.sheet.ref)?.book === p.book) return null
  const sheet = pathSheet(p)
  return sheet ? { kind: 'next', label: pathLabel(ctx.ui, p, 'toPath'), sheet } : null
}
/** The start of a shape in this language ("Notas de ", "Que signifie "), empty when the shape puts its words after ("{ref} की टिप्पणियाँ"). */
const headOf = (shape: string, ui: string) => (SHAPES[shape]?.text[ui] ?? '').split(/\{(?:ref|term|what)\}/)[0] ?? ''
/** Whether the text is only the start of the notes shape ("Notas de ", typed or written by its button): then which book. */
function shapeStart(t: string, ui: string): boolean {
  const h = headOf('notes', ui).trim()
  return !!h && fold(t).trim() === fold(h)
}
/** A: where the conversation is (one button), then the ways of asking this language offers. */
export function startRow(ctx: Ctx): Row {
  if (ctx.choosing) return ctx.books ? { items: [], pick: bookList('', ctx) } : { items: [] }
  const ui = ctx.ui
  const items: Suggestion[] = []
  const first = pathOf(ctx) ?? placeOf(ctx)
  if (first) items.push(first)
  for (const shape of SHAPES_ORDER) {
    if (!shapeOffered(shape, ui)) continue
    const head = headOf(shape, ui)
    const label = SHAPES[shape]!.label[ui] ?? SHAPES[shape]!.label.en!
    // a passage, or a shape whose words come after the passage: which book first
    items.push(shape === 'passage' || (shape === 'notes' && !head.trim()) ? { kind: 'shape', label, choose: true } : { kind: 'shape', label, fill: head })
  }
  return { items }
}
/** The books there are, in the Bible's order, each writing its name after `lead` (only the books code reads there). */
function bookList(lead: string, ctx: Ctx): Suggestion[] {
  const ui = ctx.ui
  const out: Suggestion[] = []
  for (const code of CANON) {
    if (!packOf({ lang: ui }, code, ctx, true).has) continue
    const name = fillName(ui, code)
    if (!readsAs(`${lead}${name}`, code, ui)) continue
    out.push({ kind: 'book', label: bookShown(ui, code), fill: `${lead}${name} `, book: code })
  }
  return out
}

// ------------------------------------------------------------------------------------------------- C: words and topics

/** The words before a word a meaning or translating question asks about, in the six languages (folded): its start only. */
const LEADS: string[] = (() => {
  const own = ['meaning', 'howTranslate'].flatMap((k) => UI_LANGS.map((l) => headOf(k, l)))
  const more = [
    'what does', 'what do', 'what is', 'what are', 'meaning of', 'how do i translate', 'how do we translate', 'how to translate', 'how to say', 'how do i say',
    'que significa', 'que significan', 'que quiere decir', 'que es', 'que son', 'significado de', 'como traducir', 'como traduzco', 'como traducimos', 'como se dice', 'como se traduce', 'como digo',
    'que signifie', 'que veut dire', "qu'est-ce que", 'sens de', 'comment traduire', 'comment dire',
    'apa arti', 'apa maksud', 'apa itu', 'arti kata', 'arti dari', 'bagaimana menerjemahkan', 'bagaimana cara menerjemahkan', 'bagaimana mengatakan',
    'ما معنى', 'ماذا يعني', 'ماذا تعني', 'ما هو', 'ما هي', 'كيف أترجم', 'كيف نترجم', 'كيف أقول',
  ]
  return [...new Set([...own, ...more].map((h) => fold(h).replace(/[¿¡]/g, '').trim()).filter(Boolean))].sort((a, b) => b.length - a.length)
})()
/** How many syllables a Devanagari text has: its letters, a consonant joined by a virama to the one before not counted. */
const syllables = (s: string) => [...s.matchAll(/(?<!\u094D)\p{L}/gu)].length
/** C: the articles a word being typed names (alone, or after the words of a meaning question), from the pack in its language. */
function termRow(t: string, ctx: Ctx, room: number): Suggestion[] {
  if (room <= 0) return []
  const ui = ctx.ui
  const f = fold(t).replace(/^[\s¿¡]+/, '')
  const lead = LEADS.find((h) => f.startsWith(h + ' '))
  const rest = (lead ? f.slice(lead.length) : f).replace(/[¿?¡!؟.,;:«»"“”]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!rest || /\d/.test(rest) || rest.split(' ').length > 4) return []
  const enough = /[ऀ-ॿ]/.test(rest) ? syllables(rest) >= 2 : /[؀-ۿ]/.test(rest) ? rest.replace(/\s/g, '').length >= 2 : rest.replace(/\s/g, '').length >= (lead ? 2 : 3)
  if (!enough) return []
  const own = UI_PACK[ui] ?? 'en'
  let hits: TermHit[] = []
  if (ctx.packs.includes(own)) hits = lookup(own, rest, room)
  // a language with no pack here (French with English): its glossary names, and English names, shown from the English pack
  if (!hits.length && own !== 'en' && !ctx.packs.includes(own) && ctx.packs.includes('en')) {
    const seen = new Set<string>()
    hits = [...glossaryLookup(ui, 'en', rest, room), ...lookup('en', rest, room)].filter((h) => !seen.has(h.id) && !!seen.add(h.id)).slice(0, room)
  }
  const s = ST(ui)
  return hits.map((h): Suggestion => {
    const other = h.pack !== own ? ` · ${fillT(s.inLang, { lang: s.langs[h.pack] ?? h.pack })}` : ''
    const sheet: Sheet = { id: `c${Date.now()}`, intent: 'article', ref: null, what: [], version: null, concept: h.id, term: null, phrase: null, candidates: null, lang: h.pack }
    return { kind: 'term', label: `${h.name} · ${s.kinds[h.kind]}${other}`, sheet, ask: h.kind === 'ta' ? academyLabel(ui, h.name) : h.name }
  })
}

/** D and F: the "✓" (or the book that is not here), then the verse strip or the helps. */
function rowOf(t: string, u: Understood, ctx: Ctx): Row {
  const ui = ctx.ui
  const s = ST(ui)
  if (!u.has) return { items: [{ kind: 'missing', label: `${refShown(ui, u.code, u.slots)} · ${s.notHere}`, book: u.code }] }
  const h = helpsKnown(u.pack, u.code)!
  const what = u.slots.what ?? []
  const plain = !what.length
  // the "✓" only for what the answer will have: a help this book lacks here ("योना 1:3 · टिप्पणियाँ": the Hindi pack has no
  // notes for Jonah), or an introduction no installed pack has, says so and sends nothing
  let okLabel = u.label
  const lacks = (k: string): Row => {
    const w = (k === 'intro' ? SHAPES.intro!.label[ui] : whatWord(ui, k)) ?? k
    return { items: [{ kind: 'missing', label: `${refShown(ui, u.code, u.slots)} · ${fillT(s.none, { what: w.toLocaleLowerCase(ui) })}`, book: u.code }] }
  }
  if (what.length === 1 && what[0] === 'intro') {
    const i = introIn(u.pack, u.code, u.slots.chapter ?? null, ctx)
    if (i.needs) return { items: [], needs: i.needs }
    if (!i.has) return lacks('intro')
    // an introduction from another pack says so, as the answer does ("· अंग्रेज़ी में")
    if (i.from && i.from !== u.pack) okLabel = `${ref0(u)} · ${fillT(s.inLang, { lang: s.langs[i.from] ?? i.from })}`
  } else if (what.length === 1 && (HELP_KINDS as readonly string[]).includes(what[0]!)) {
    if (!h[what[0] as (typeof HELP_KINDS)[number]]) return lacks(what[0]!)
  } else if (!(h.text || h.notes || h.questions || h.terms)) return lacks('text')
  const items: Suggestion[] = [{ kind: 'ok', label: `✓ ${okLabel}`, send: true }]
  let strip: Strip | undefined
  if (u.fu) {
    // (a follow-up: the "✓" alone; "5 Notas" is no way to write it)
  } else if (u.slots.chapter && !u.slots.verse_start && plain && endsWithNumber(t) && lastNumber(t) === u.slots.chapter) {
    const max = VERSES[u.code]?.[u.slots.chapter - 1] ?? 0
    if (max) strip = { unit: 'verse', max, base: t.replace(/\s*:?\s*$/, ''), sep: ':' }
    const i = introIn(u.pack, u.code, u.slots.chapter, ctx)
    if (i.needs) return { items: [], needs: i.needs }
    if (i.has) items.push({ kind: 'help', label: SHAPES.intro!.label[ui] ?? SHAPES.intro!.label.en!, fill: introText(ui, u.code, u.slots.chapter) })
  } else if (u.slots.verse_start && plain && endsWithNumber(t)) {
    const base = t.replace(/\s+$/, '')
    for (const k of HELP_KINDS) {
      const w = whatWord(ui, k)
      if (w && h[k]) items.push({ kind: 'help', label: w, fill: `${base} ${w} ` })
    }
  }
  return { items: items.slice(0, MAX), strip }
}

/** B: a book being typed at the end of the box, then its chapters once it is written in full. */
function bookRow(t: string, ctx: Ctx): Row {
  const ui = ctx.ui
  const s = ST(ui)
  const words = t.trimEnd().split(/\s+/)
  const spaced = /\s$/.test(t)
  for (let k = Math.min(3, words.length); k >= 1; k--) {
    const tail = words.slice(-k).join(' ')
    if (!/\p{L}/u.test(tail) || /\d\s*$/.test(tail)) continue
    const before = words.slice(0, -k).join(' ')
    const lead = before ? `${before} ` : ''
    if (!leadReads(lead, ui)) continue
    // only books that, once written, make a question code reads ("notas de Ro" → "notas de Romanos 3:23"; not "por qué Noemí…")
    const cands = bookCandidates(ui, tail).filter((c) => readsAs(`${lead}${fillName(ui, c.code)}`, c.code, ui)).slice(0, MAX)
    if (!cands.length) continue
    const exact = cands[0]!.how === 'exact' ? cands[0]! : null
    const env1 = { ...ctx }
    if (exact && spaced) {
      const where = packOf({ lang: ui }, exact.code, env1, true)
      if (!where.has) return { items: [{ kind: 'missing', label: `${bookShown(ui, exact.code)} · ${s.notHere}`, book: exact.code }] }
      const items: Suggestion[] = []
      const intro: Slots = { intent: 'passage', book: exact.code, chapter: null, verse_start: null, verse_end: null, what: ['intro'], lang: ui }
      const other = where.other ? ` · ${fillT(s.inLang, { lang: s.langs[where.pack] ?? where.pack })}` : ''
      // (the book's introduction only when a pack has it; its books are read once, as for the "✓")
      const i = introIn(where.pack, exact.code, null, env1)
      if (i.needs) return { items: [], needs: i.needs }
      if (i.has) items.push({ kind: 'intro', label: introLabel(ui, bookShown(ui, exact.code)) + other, slots: intro })
      const max = VERSES[exact.code]?.length ?? 0
      return { items, strip: max ? { unit: 'chapter', max, base: `${lead}${fillName(ui, exact.code)}`, sep: ' ' } : undefined }
    }
    const items = cands.map((c): Suggestion => {
      const where = packOf({ lang: ui }, c.code, env1, true)
      const name = bookShown(ui, c.code)
      const label = !where.has ? `${name} · ${s.notHere}` : where.other ? `${name} · ${fillT(s.inLang, { lang: s.langs[where.pack] ?? where.pack })}` : name
      return where.has ? { kind: 'book', label, fill: `${lead}${fillName(ui, c.code)} `, book: c.code } : { kind: 'missing', label, book: c.code }
    })
    return { items }
  }
  return { items: [] }
}

/** The row once the books it needs are read (the composer does the same in steps; the tests wait for it). */
export async function ready(text: string, ctx: Ctx): Promise<Row> {
  for (let i = 0; i < 8; i++) {
    const r = suggest(text, ctx)
    if (!r.needs?.length) return r
    await Promise.all(r.needs.map(([p, c]) => loadHelps(p, c)))
  }
  return suggest(text, ctx)
}
