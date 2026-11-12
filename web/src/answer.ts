// Stage 2, `answer`: call sheets -> answers. One recipe per intent over `language-pack-client`; one plain-text template file per
// language (templates/<lang>.json). Every answer names the resource and release it comes from.
//
//   bun run src/answer.ts <sheets.jsonl> <filler>      writes out/answers-<filler>.jsonl
import type { PackReader } from '@bt-synergy/language-pack-client'
import { type BookModel, type HelpRow, verseId } from '@bt-synergy/language-pack-v3'
import { textOfRange } from '@lpc/query/passage'
import { type AlignedText, alignIndex, quoteIn } from './align'
import { openLang, hasLang, installedLangs } from './packs'
import tEn from './data/tpl-en.json'
import tEs from './data/tpl-es.json'
import tFr from './data/tpl-fr.json'
import tId from './data/tpl-id.json'
import tHi from './data/tpl-hi.json'

export type Sheet = {
  id: string; intent: string; ref: string | null; what: string[]; version: string | null; concept: string | null
  term: string | null; phrase: string | null; candidates: string[] | null; lang: string
}
/** What the last answer found, for the conversational sentence around it (set by the recipes, read by converse.ts). */
export let facts: Record<string, any> = {}
export type Result = { answer: string; cites: string[] }

const BOOK_EN: Record<string, string> = {
  gen: 'Genesis', exo: 'Exodus', lev: 'Leviticus', num: 'Numbers', deu: 'Deuteronomy', jos: 'Joshua', jdg: 'Judges', rut: 'Ruth',
  '1sa': '1 Samuel', '2sa': '2 Samuel', '1ki': '1 Kings', '2ki': '2 Kings', '1ch': '1 Chronicles', '2ch': '2 Chronicles', ezr: 'Ezra',
  neh: 'Nehemiah', est: 'Esther', job: 'Job', psa: 'Psalms', pro: 'Proverbs', ecc: 'Ecclesiastes', sng: 'Song of Songs', isa: 'Isaiah',
  jer: 'Jeremiah', lam: 'Lamentations', ezk: 'Ezekiel', dan: 'Daniel', hos: 'Hosea', jol: 'Joel', amo: 'Amos', oba: 'Obadiah', jon: 'Jonah',
  mic: 'Micah', nam: 'Nahum', hab: 'Habakkuk', zep: 'Zephaniah', hag: 'Haggai', zec: 'Zechariah', mal: 'Malachi', mat: 'Matthew',
  mrk: 'Mark', luk: 'Luke', jhn: 'John', act: 'Acts', rom: 'Romans', '1co': '1 Corinthians', '2co': '2 Corinthians', gal: 'Galatians',
  eph: 'Ephesians', php: 'Philippians', col: 'Colossians', '1th': '1 Thessalonians', '2th': '2 Thessalonians', '1ti': '1 Timothy',
  '2ti': '2 Timothy', tit: 'Titus', phm: 'Philemon', heb: 'Hebrews', jas: 'James', '1pe': '1 Peter', '2pe': '2 Peter', '1jn': '1 John',
  '2jn': '2 John', '3jn': '3 John', jud: 'Jude', rev: 'Revelation', obs: 'Open Bible Stories',
}
const BOOK_ES: Record<string, string> = {
  gen: 'Génesis', exo: 'Éxodo', lev: 'Levítico', num: 'Números', deu: 'Deuteronomio', jos: 'Josué', jdg: 'Jueces', rut: 'Rut',
  '1sa': '1 Samuel', '2sa': '2 Samuel', '1ki': '1 Reyes', '2ki': '2 Reyes', '1ch': '1 Crónicas', '2ch': '2 Crónicas', ezr: 'Esdras',
  neh: 'Nehemías', est: 'Ester', job: 'Job', psa: 'Salmos', pro: 'Proverbios', ecc: 'Eclesiastés', sng: 'Cantares', isa: 'Isaías',
  jer: 'Jeremías', lam: 'Lamentaciones', ezk: 'Ezequiel', dan: 'Daniel', hos: 'Oseas', jol: 'Joel', amo: 'Amós', oba: 'Abdías', jon: 'Jonás',
  mic: 'Miqueas', nam: 'Nahúm', hab: 'Habacuc', zep: 'Sofonías', hag: 'Hageo', zec: 'Zacarías', mal: 'Malaquías', mat: 'Mateo',
  mrk: 'Marcos', luk: 'Lucas', jhn: 'Juan', act: 'Hechos', rom: 'Romanos', '1co': '1 Corintios', '2co': '2 Corintios', gal: 'Gálatas',
  eph: 'Efesios', php: 'Filipenses', col: 'Colosenses', '1th': '1 Tesalonicenses', '2th': '2 Tesalonicenses', '1ti': '1 Timoteo',
  '2ti': '2 Timoteo', tit: 'Tito', phm: 'Filemón', heb: 'Hebreos', jas: 'Santiago', '1pe': '1 Pedro', '2pe': '2 Pedro', '1jn': '1 Juan',
  '2jn': '2 Juan', '3jn': '3 Juan', jud: 'Judas', rev: 'Apocalipsis', obs: 'Historias de la Biblia',
}

// ---------------------------------------------------------------------------------------------------------------- helpers

const templates: Record<string, Record<string, string>> = { en: tEn, es: tEs, fr: tFr, id: tId, hi: tHi }
/** The language the person wrote in: the answer's fixed words follow it, whatever pack the content comes from. */
let UI: string | null = null
export function setUiLang(l: string | null) { UI = l && templates[l] ? l : null }
function tpl(lang: string): Record<string, string> {
  return templates[UI ?? (lang.startsWith('es') ? 'es' : 'en')]!
}
function say(lang: string, key: string, vars: Record<string, string | number> = {}): string {
  const t = tpl(lang)[key]
  if (t === undefined) throw new Error(`no template ${key} for ${lang}`)
  return t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}
const bookName = (lang: string, code: string): string => (lang.startsWith('es') ? BOOK_ES : BOOK_EN)[code] ?? code

/** A note or an article in plain text: no headings, no links the reader cannot follow (as `clean` of language-pack-mcp). */
export function clean(md: unknown): string {
  return String(md ?? '')
    .replace(/^#+\s*/gm, '')
    .replace(/\((?:ver|see):\s*(?:\[\[[^\]]+\]\]|rc:\/\/[^)\s]+)\)/gi, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/[ \t]+\./g, '.')
    .replace(/(?<!\.)\.\.(?!\.)/g, '.')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + ' …' : s)
const resShort = (res: string): string => res.split('/').pop()!
const upper = (res: string): string => resShort(res).toUpperCase()

type Ref = { book: string; kind: 'book' | 'chapter' | 'verses' | 'bookintro' | 'chapintro'; ch?: number; v1?: number; v2?: number }
function parseRef(ref: string): Ref | null {
  const m = /^([a-z0-9]{3})(?:\s+(.+))?$/.exec(ref.trim().toLowerCase())
  if (!m) return null
  const book = m[1]!
  const rest = m[2]
  if (rest === undefined) return { book, kind: 'book' }
  if (rest === 'front:intro') return { book, kind: 'bookintro' }
  let x: RegExpExecArray | null
  if ((x = /^(\d+):intro$/.exec(rest))) return { book, kind: 'chapintro', ch: +x[1]! }
  if ((x = /^(\d+)$/.exec(rest))) return { book, kind: 'chapter', ch: +x[1]! }
  if ((x = /^(\d+):(\d+)(?:-(\d+))?$/.exec(rest))) return { book, kind: 'verses', ch: +x[1]!, v1: +x[2]!, v2: x[3] ? +x[3] : +x[2]! }
  return null
}
function rangeOf(r: Ref): [number, number] {
  const b = r.book
  if (r.kind === 'book' || r.kind === 'bookintro') return [verseId(b, 0, 0), verseId(b, 999, 999)]
  if (r.kind === 'chapter' || r.kind === 'chapintro') return [verseId(b, r.ch!, 0), verseId(b, r.ch!, 999)]
  return [verseId(b, r.ch!, r.v1!), verseId(b, r.ch!, r.v2!)]
}
const refLabel = (r: Ref): string =>
  r.kind === 'book' ? '' : r.kind === 'bookintro' ? '' : r.kind === 'chapter' || r.kind === 'chapintro' ? String(r.ch) : `${r.ch}:${r.v1}${r.v2 !== r.v1 ? '-' + r.v2 : ''}`

const isIntroRow = (row: HelpRow): boolean => row.cols.isIntro === true || row.cols.isIntro === 'true'
const inRange = (row: HelpRow, [from, to]: [number, number]): boolean => row.from <= to && row.to >= from

/** What is installed and cached per language, opened once. */
type Lang = { lang: string; r: PackReader; maps: any; aligned: Map<string, AlignedText[]> }
const langs = new Map<string, Lang | null>()
async function getLang(lang: string): Promise<Lang | null> {
  if (langs.has(lang)) return langs.get(lang)!
  let out: Lang | null = null
  if (await hasLang(lang)) {
    const r = await openLang(lang)
    out = { lang, r, maps: await r.maps(), aligned: new Map() }
  }
  langs.set(lang, out)
  return out
}
async function bookOf(l: Lang, code: string): Promise<BookModel | undefined> {
  return l.r.installed(`book:${code}`) ? await l.r.book(code) : undefined
}
async function alignedOf(l: Lang, code: string, model: BookModel): Promise<AlignedText[]> {
  let a = l.aligned.get(code)
  if (a === undefined) l.aligned.set(code, (a = alignIndex(model as any)))
  return a
}
const releaseOf = (model: BookModel, key: string): string => model.res.find((x) => x[0] === key)?.[1] ?? ''
const cite = (res: string, release: string, extra = ''): string => `${res} ${release}${extra ? ' (' + extra + ')' : ''}`.trim()
const sourceLine = (lang: string, cites: string[]): string => {
  // one entry per resource and release
  const seen = new Map<string, string>()
  for (const c of cites) {
    const m = /^(\S+) (\S+)/.exec(c)
    if (m) seen.set(`${m[1]} ${m[2]}`, `${m[1]} ${m[2]}`)
  }
  return seen.size ? say(lang, 'source', { list: [...seen.values()].join(', ') }) : ''
}
/** The text resource of a version in this language: ult -> ult or glt, ust -> ust or gst. */
const textKey = (model: BookModel, version: 'ult' | 'ust'): string | undefined =>
  model.texts.map((t) => t.res).find((k) => (version === 'ult' ? /\/(ult|glt)$/ : /\/(ust|gst)$/).test(k))
const names = (l: Lang, id: string): string => (l.maps.map?.core.names?.[id] as string[] | undefined)?.[0] ?? id.split('/').pop()!
async function titleOf(l: Lang, id: string): Promise<string> {
  try {
    const t = (await l.r.article(id)).data?.title
    if (t) return t
  } catch { /* fall through */ }
  return names(l, id)
}

// ---------------------------------------------------------------------------------------------------------------- recipes

async function passage(s: Sheet, l: Lang): Promise<Result> {
  const cites: string[] = []
  const lang = l.lang
  if (/^obs\b/.test(s.ref ?? '')) return { answer: say(lang, 'obs_none', { ref: s.ref ?? 'obs' }), cites }
  const ref = parseRef(s.ref ?? '')
  if (!ref) return { answer: say(lang, 'bad_ref', { ref: s.ref ?? '' }), cites }
  const book = bookName(lang, ref.book)
  const model = await bookOf(l, ref.book)
  const what = s.what.length ? s.what : ['text']
  const wantText = what.includes('text')
  const verKey = (v: 'ult' | 'ust') => (lang.startsWith('es') ? (v === 'ult' ? 'glt' : 'gst') : v)
  // coverage of the texts (the maps know it even for books that are not installed)
  const cover = (res: string): boolean => {
    const c = l.maps.map?.core.coverage.get(res)
    return !!c && (c.whole.includes(ref.book) || c.partial.includes(ref.book))
  }
  const textKeys: string[] = [...(l.maps.map?.core.coverage.keys() ?? [])].filter((k: string) => /\/(ult|ust|glt|gst|bsb|t4t)$/.test(k))
  if (wantText && s.version) {
    const key = textKeys.find((k) => k.endsWith('/' + verKey(s.version as 'ult' | 'ust')))
    if (key && !cover(key)) {
      const others = textKeys.filter((k) => cover(k)).map((k) => upper(k))
      const label = upper(key)
      const msg = others.length ? say(lang, 'not_covered', { label, book, others: others.join(', ') }) : say(lang, 'not_covered_none', { label, book })
      cites.push(cite(key, l.maps.map.core.res.find((x: string[]) => x[0] === key)?.[1] ?? ''))
      return { answer: msg, cites }
    }
  }
  if (!model) {
    const covered = textKeys.filter((k) => cover(k)).map((k) => upper(k))
    const installed = [...Array(0)].join('') || (await installedBooks(l)).map((b) => bookName(lang, b)).join(', ')
    const msg = say(lang, 'not_installed', { book, installed, covered: covered.length ? say(lang, 'covered_by', { list: covered.join(', ') }) : '' })
    for (const k of textKeys.filter((k) => cover(k))) cites.push(cite(k, l.maps.map.core.res.find((x: string[]) => x[0] === k)?.[1] ?? ''))
    return { answer: msg.trim(), cites }
  }
  const al = await alignedOf(l, ref.book, model)
  const range = rangeOf(ref)
  const out: string[] = []
  const head = say(lang, 'passage_head', { book, ref: refLabel(ref), lang }).replace(/\s+\(/, ' (').replace(/\s{2,}/g, ' ')
  out.push(head)
  facts = { kind: 'passage', book, ref: refLabel(ref), texts: 0, notes: 0, questions: 0, terms: 0, code: ref.book, ch: ref.ch ?? null }
  // the verse after this one, if the book has it: the next verse of the chapter, else the first of the next chapter
  if (ref.kind === 'verses' && ref.ch && ref.v1) {
    const t0 = model.texts[0]
    const has = (c: number, v: number) => !!t0 && !!textOfRange(ref.book, t0.pieces as any, t0.events as any, verseId(ref.book, c, v), verseId(ref.book, c, v))
    const last = ref.v2 ?? ref.v1
    facts.next = has(ref.ch, last + 1) ? `${ref.ch}:${last + 1}` : has(ref.ch + 1, 1) ? `${ref.ch + 1}:1` : null
  }
  if (what.includes('intro') || ref.kind === 'bookintro' || ref.kind === 'chapintro') {
    const rows = model.notes?.rows.filter(isIntroRow) ?? []
    const bookIntro = rows[0]
    const row = ref.kind === 'chapintro' ? rows.find((x) => x !== bookIntro && x.from === verseId(ref.book, ref.ch!, 1))
      : ref.kind === 'chapter' ? rows.find((x) => x !== bookIntro && x.from === verseId(ref.book, ref.ch!, 1)) : bookIntro
    const what_ = ref.kind === 'bookintro' || ref.kind === 'book' ? book : `${book} ${ref.ch}`
    if (row) {
      out.push(say(lang, 'intro_head', { what: what_ }))
      out.push(clean(row.cols.note))
      cites.push(cite(model.notes!.res, releaseOf(model, model.notes!.res), `${ref.book} intro, note ${row.id}`))
    } else out.push(say(lang, 'intro_none', { what: what_ }))
  }
  if (wantText && ref.kind !== 'bookintro' && ref.kind !== 'chapintro') {
    let any = false
    for (const t of model.texts) {
      const key = resShort(t.res)
      // ULT/UST (GLT/GST in Spanish); a language whose texts have other names shows them all
      const wanted = s.version ? '/' + verKey(s.version as 'ult' | 'ust') : ''
      if (wanted && model.texts.some((x) => x.res.endsWith(wanted)) && !t.res.endsWith(wanted)) continue
      const text = textOfRange(ref.book, t.pieces as any, t.events as any, range[0], range[1])
      if (!text) continue
      any = true
      facts.texts++
      out.push(say(lang, 'text_line', { label: key.toUpperCase(), res: t.res, release: releaseOf(model, t.res), text }))
      cites.push(cite(t.res, releaseOf(model, t.res), `${ref.book} ${refLabel(ref)}`))
    }
    if (!any) out.push(say(lang, 'text_none', { label: (s.version ?? '').toUpperCase(), ref: `${book} ${refLabel(ref)}`.trim() }))
  }
  const rowsIn = (t: { rows: HelpRow[] } | undefined, noIntro = true): HelpRow[] => (t?.rows ?? []).filter((x) => inRange(x, range) && !(noIntro && isIntroRow(x)))
  if (what.includes('terms')) {
    const links = rowsIn(model.links).filter((x) => x.concept)
    const seen = new Map<string, HelpRow>()
    for (const x of links) if (!seen.has(x.concept!)) seen.set(x.concept!, x)
    out.push(say(lang, 'terms_head', { book, ref: refLabel(ref) }))
    for (const [id, x] of seen) {
      const said = quoteIn(al, x.quote)[0]?.text ?? String(x.cols.origWords ?? '')
      out.push(say(lang, 'term_line', { said, title: await titleOf(l, id) }))
      cites.push(cite(model.links!.res, releaseOf(model, model.links!.res), `${ref.book} ${x.ref}, ${id}`))
    }
    facts.terms = seen.size
    if (seen.size === 0) out.push('-')
  }
  if (what.includes('notes')) {
    const notes = rowsIn(model.notes).filter((x) => clean(x.cols.note))
    facts.notes = notes.length
    if (notes.length === 0) out.push(say(lang, 'notes_none', { book, ref: refLabel(ref) }))
    else out.push(say(lang, 'notes_head', { book, ref: refLabel(ref) }))
    for (const [i, n] of notes.entries()) {
      const said = quoteIn(al, n.quote).map((q) => `«${q.text}»`).join(' / ')
      const orig = n.cols.quote && !clean(n.cols.note).startsWith(String(n.cols.quote)) ? String(n.cols.quote) : ''
      const headTxt = [said, orig ? `(${orig})` : ''].filter(Boolean).join(' ')
      const academy = n.concept ? say(lang, 'note_academy', { title: await titleOf(l, n.concept) }) : ''
      out.push(say(lang, 'note_line', { n: i + 1, head: headTxt ? headTxt + ': ' : '', note: clean(n.cols.note).replace(/\n+/g, ' '), academy }))
      cites.push(cite(model.notes!.res, releaseOf(model, model.notes!.res), `${ref.book} ${n.ref}, note ${n.id}`))
    }
  }
  if (what.includes('questions')) {
    const qs = rowsIn(model.questions)
    facts.questions = qs.length
    out.push(qs.length ? say(lang, 'questions_head', { book, ref: refLabel(ref) }) : say(lang, 'questions_none', { book, ref: refLabel(ref) }))
    for (const q of qs) {
      out.push(say(lang, 'question_line', { q: String(q.cols.question ?? ''), a: String(q.cols.response ?? '') }))
      cites.push(cite(model.questions!.res, releaseOf(model, model.questions!.res), `${ref.book} ${q.ref}`))
    }
  }
  return { answer: out.join('\n'), cites }
}

async function installedBooks(l: Lang): Promise<string[]> {
  return Object.keys(BOOK_EN).filter((c) => c !== 'obs' && l.r.installed(`book:${c}`))
}

async function article(s: Sheet, l: Lang): Promise<Result> {
  const lang = l.lang
  const cites: string[] = []
  if (!s.concept) {
    const term = s.term ?? ''
    const kind = lang.startsWith('es') ? 'Palabras de Traducción' : 'Translation Words'
    return { answer: `${say(lang, 'article_none_head', { kind, term })} ${say(lang, 'article_none_tail', { term })}`, cites }
  }
  const ans = await l.r.article(s.concept, 'all')
  if (!ans.data) return { answer: say(lang, 'article_missing', {}), cites: [...cites, `id:${s.concept}`] }
  const a = ans.data
  const by = (...roles: string[]) => a.sections.filter((x) => roles.includes(x.role))
  const main = s.concept.startsWith('tw:') ? (by('definition').length ? by('definition').slice(0, 1) : by('intro').slice(0, 1)) : by('description')
  facts = { kind: 'article', title: a.title }
  const out: string[] = [say(lang, 'article_head', { title: a.title })]
  for (const x of main.length ? main : a.sections.slice(0, 1)) {
    out.push(clean(x.md))
    if (x.lang !== lang && x.lang) out.push(say(lang, 'article_other_lang', { lang: x.lang }))
  }
  if (s.concept.startsWith('ta:')) {
    const st = by('strategies')[0]
    if (st) out.push(say(lang, 'article_strategies', {}) + ' ' + clip(clean(st.md).replace(/\n+/g, ' '), 1200))
  }
  for (const c of ans.cites) cites.push(cite(c.res, c.release, `${c.id}, ${c.section}`))
  return { answer: out.join('\n\n'), cites }
}

/** The first sentence of a text (up to 220 characters). */
const firstSentence = (t: string): string => {
  const x = t.replace(/\s+/g, ' ').trim()
  const m = /^.{20,}?[.!?](?=\s|$)/.exec(x)
  return clip(m ? m[0] : x, 220)
}

async function choose(s: Sheet, l: Lang): Promise<Result> {
  const lang = l.lang
  const lines = [say(lang, 'choose_head')]
  const cites: string[] = []
  for (const [i, id] of (s.candidates ?? []).entries()) {
    const a = await l.r.article(id, 'all')
    const secs = a.data?.sections ?? []
    const d = secs.find((x) => x.role === 'definition') ?? secs.find((x) => x.role === 'description') ?? secs[0]
    const def = d ? firstSentence(clean(d.md).replace(/^#+.*$/gm, ' ')) : ''
    lines.push(say(lang, 'choose_line', { n: i + 1, title: a.data?.title ?? (await titleOf(l, id)), def }))
    for (const c of a.cites.slice(0, 1)) cites.push(cite(c.res, c.release, id))
    cites.push(`id:${id}`)
  }
  return { answer: lines.join('\n'), cites }
}

async function count(s: Sheet, l: Lang): Promise<Result> {
  const lang = l.lang
  const cites: string[] = []
  const what = s.what[0] ?? 'notes'
  const filterTxt = s.concept ? say(lang, 'count_filter', { title: names(l, s.concept) }) : ''
  const ref = s.ref ? parseRef(s.ref) : null
  const key = what === 'terms' ? 'links' : what
  if (ref) {
    const book = bookName(lang, ref.book)
    const model = await bookOf(l, ref.book)
    const lab = refLabel(ref) ? ' ' + refLabel(ref) : ''
    if (model) {
      const table = (model as any)[key] as { res: string; rows: HelpRow[] } | undefined
      const rows = (table?.rows ?? []).filter((x) => inRange(x, rangeOf(ref)) && !isIntroRow(x) && (!s.concept || x.concept === s.concept) && (key !== 'links' || x.concept))
      const verses = new Set(rows.map((x) => x.from)).size
      if (table) cites.push(cite(table.res, releaseOf(model, table.res), `${ref.book}${lab}`))
      const k = what === 'terms' ? 'count_terms' : what === 'questions' ? 'count_questions' : 'count_notes'
      return { answer: say(lang, k, { book, ref: lab, n: rows.length, filter: filterTxt, v: verses }), cites }
    }
    // not installed: the map of the whole Bible counts it
    const hit = mapCount(l, s.concept, what)
    if (hit && ref.kind === 'book' || hit && ref.kind !== 'book') {
      const cell = hit.books.get(ref.book)
      if (ref.kind === 'book') {
        const [n, v] = cell ?? [0, 0]
        cites.push(cite(hit.res, hit.release, `map, ${ref.book}`))
        const k = what === 'terms' ? 'count_terms' : 'count_notes'
        return { answer: `${say(lang, k, { book, ref: '', n, filter: filterTxt, v })} ${say(lang, 'count_map', { book })}`, cites }
      }
    }
    return { answer: say(lang, 'count_nothing', { need: `book:${ref.book}` }), cites }
  }
  const hit = mapCount(l, s.concept, what)
  if (!hit) return { answer: say(lang, 'count_nothing', { need: what }), cites }
  let n = 0
  const rows: [string, number][] = []
  for (const [b, [c]] of hit.books) { n += c!; rows.push([b, c!]) }
  rows.sort((a, b) => b[1] - a[1])
  cites.push(cite(hit.res, hit.release, 'map'))
  return { answer: say(lang, 'count_bible', { n, what: what === 'terms' ? 'key term links' : 'notes', filter: filterTxt, list: rows.slice(0, 8).map(([b, c]) => `${bookName(lang, b)} ${c}`).join(', ') }), cites }
}
/** Per-book counts from the map: the English tN / TWL (`xmap`), counted even for books that are not installed. */
function mapCount(l: Lang, concept: string | null, what: string): { books: Map<string, number[]>; res: string; release: string } | null {
  const x = l.maps.xmap?.core
  if (!x) return null
  const table = what === 'terms' || concept?.startsWith('tw:') ? x.links : x.notes
  if (!table || !concept) return null
  const m = table.rows.get(concept) as Map<string, number[]> | undefined
  if (!m) return { books: new Map(), res: what === 'terms' ? 'unfoldingWord/en/twl' : 'unfoldingWord/en/tn', release: 'v91' }
  const res = (x.res as [string, string][]).find((r) => r[0].endsWith(table === x.links ? '/twl' : '/tn'))
  return { books: m, res: res?.[0] ?? '', release: res?.[1] ?? '' }
}

async function rank(s: Sheet, l: Lang): Promise<Result> {
  const lang = l.lang
  const cites: string[] = []
  const ref = s.ref ? parseRef(s.ref) : null
  if (!ref) return { answer: say(lang, 'count_nothing', { need: 'a reference' }), cites }
  const book = bookName(lang, ref.book)
  const lab = refLabel(ref) ? ' ' + refLabel(ref) : ''
  const model = await bookOf(l, ref.book)
  if (!model) return { answer: say(lang, 'count_nothing', { need: `book:${ref.book}` }), cites }
  const rows = (model.notes?.rows ?? []).filter((x) => inRange(x, rangeOf(ref)) && !isIntroRow(x) && x.concept)
  const by = new Map<string, number>()
  for (const x of rows) by.set(x.concept!, (by.get(x.concept!) ?? 0) + 1)
  const sorted = [...by].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  cites.push(cite(model.notes!.res, releaseOf(model, model.notes!.res), `${ref.book}${lab}`))
  if (!sorted.length) return { answer: say(lang, 'rank_none', { book, ref: lab }), cites }
  const lines = [say(lang, 'rank_head', { book, ref: lab, n: rows.length })]
  for (const [i, [id, c]] of sorted.slice(0, 10).entries()) lines.push(say(lang, 'rank_line', { n: i + 1, title: await titleOf(l, id), count: c }))
  for (const [id] of sorted.slice(0, 10)) cites.push(`id:${id}`)
  return { answer: lines.join('\n'), cites }
}

async function resources(s: Sheet, l0: Lang | null): Promise<Result> {
  const lang = s.lang.startsWith('es') ? 'es-419' : 'en'
  const installed = await installedLangs()
  const cites: string[] = []
  const lines = [say(lang, 'res_head', { list: installed.join(', ') })]
  const asked = s.lang
  if (!installed.includes(asked)) {
    lines.push(say(lang, 'res_not_installed', { lang: asked }))
    return { answer: lines.join('\n'), cites }
  }
  const l = (await getLang(asked))!
  const res = (l.maps.map.core.res as [string, string][]).filter((x) => !/\/(ugl|uhl)$/.test(x[0]))
  const cov: string[] = []
  for (const [k, c] of l.maps.map.core.coverage as Map<string, { whole: string[]; partial: string[] }>) {
    const n = c.whole.length + c.partial.length
    if (n) cov.push(`${resShort(k).toUpperCase()} ${n} books`)
  }
  for (const [k, rel] of res) cites.push(cite(k, rel))
  lines.push(say(lang, 'res_lang', {
    lang: asked, res: res.map(([k, r]) => `${resShort(k).toUpperCase()} ${r}`).join(', '),
    installed: (await installedBooks(l)).map((b) => bookName(lang, b)).join(', '), coverage: cov.join(', '),
  }))
  return { answer: lines.join('\n'), cites }
}

// -------------------------------------------------------------------------------------------------------------- advice

const STOPW = new Set('a an the of in on at to for and or but is are was were be been do does did can could should would will i we you he she it they me my our your his her its their this that these those with from by as about into than there here has have had not no what which who whom where when how why if so then also any some all y de la el los las un una que en con por para se su sus mi es lo al del'.split(' '))
const toks = (s: string): string[] => fold(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOPW.has(t))
const altOf = (note: string): string | null => {
  const m = /(?:Alternate translations?|Traducci[oó]n(?:es)? alternativas?)\s*:\s*(.+)$/is.exec(note)
  if (!m) return null
  return [...m[1]!.matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]).join(' / ') || m[1]!.trim()
}

async function advice(s: Sheet, l: Lang): Promise<Result> {
  const lang = l.lang
  const cites: string[] = []
  const ref = s.ref ? parseRef(s.ref) : null
  if (!ref || ref.kind !== 'verses') return { answer: say(lang, 'bad_ref', { ref: s.ref ?? '' }), cites }
  const book = bookName(lang, ref.book)
  const phrase = s.phrase ?? ''
  const model = await bookOf(l, ref.book)
  const out: string[] = [say(lang, 'advice_head', { book, ref: refLabel(ref), phrase })]
  let articleId = s.concept
  let matched = false
  if (model) {
    const al = await alignedOf(l, ref.book, model)
    const range = rangeOf(ref)
    const want = new Set(toks(phrase))
    const scored: { row: HelpRow; score: number; said: string }[] = []
    for (const row of model.notes?.rows ?? []) {
      if (!inRange(row, range) || isIntroRow(row) || !clean(row.cols.note)) continue
      const quotes = quoteIn(al, row.quote)
      let best = 0
      let said = ''
      for (const q of quotes) {
        const have = new Set(toks(q.text))
        if (!have.size || !want.size) continue
        const inter = [...have].filter((t) => want.has(t)).length
        const score = inter / Math.min(have.size, want.size)
        if (score > best) { best = score; said = q.text }
      }
      scored.push({ row, score: best, said: quotes[0]?.text ?? said })
    }
    const hits = scored.filter((x) => x.score >= 0.6).sort((a, b) => b.score - a.score).slice(0, 2)
    if (hits.length) {
      matched = true
      for (const h of hits) {
        const note = clean(h.row.cols.note).replace(/\n+/g, ' ')
        out.push(say(lang, 'advice_note', { res: model.notes!.res, release: releaseOf(model, model.notes!.res), said: h.said ? `«${h.said}»: ` : '', note }))
        const alt = altOf(note)
        if (alt) out.push(say(lang, 'advice_alt', { alt }))
        cites.push(cite(model.notes!.res, releaseOf(model, model.notes!.res), `${ref.book} ${h.row.ref}, note ${h.row.id}`))
        if (h.row.concept && !articleId) articleId = h.row.concept
      }
    } else out.push(say(lang, 'advice_no_note', { phrase, book, ref: refLabel(ref) }))
    const uKey = textKey(model, 'ust')
    const simple = model.texts.find((t) => t.res === uKey)
    if (simple) {
      const text = textOfRange(ref.book, simple.pieces as any, simple.events as any, range[0], range[1])
      if (text) {
        out.push(say(lang, 'advice_simple', { label: upper(simple.res), text }))
        cites.push(cite(simple.res, releaseOf(model, simple.res), `${ref.book} ${refLabel(ref)}`))
      }
    }
  } else out.push(`${book} is not installed on this device.`)
  if (articleId) {
    const ans = await l.r.article(articleId, 'all')
    if (ans.data) {
      const by = (...r: string[]) => ans.data!.sections.filter((x) => r.includes(x.role))
      out.push(say(lang, 'advice_academy', { title: ans.data.title }))
      cites.push(`id:${articleId}`)
      if (!matched) out.push(say(lang, 'advice_general'))
      const d = by('description')[0]
      if (d) out.push(clip(clean(d.md).replace(/\n+/g, ' '), 700))
      const st = by('strategies')[0]
      if (st) out.push(say(lang, 'article_strategies') + ' ' + clip(clean(st.md).replace(/\n+/g, ' '), 900))
      for (const c of ans.cites.slice(0, 1)) cites.push(cite(c.res, c.release, articleId))
    }
  } else if (!matched) out.push(say(lang, 'advice_none'))
  return { answer: out.join('\n'), cites }
}

// ------------------------------------------------------------------------------------------------------------------ main

export async function answerSheet(s: Sheet): Promise<Result> {
  facts = {}
  const lang = s.lang
  const l = await getLang(lang)
  if (s.intent === 'resources') return resources(s, l)
  if (!l) return { answer: say('en', 'res_not_installed', { lang }), cites: [] }
  let r: Result
  switch (s.intent) {
    case 'passage': r = await passage(s, l); break
    case 'article': r = await article(s, l); break
    case 'choose': r = await choose(s, l); break
    case 'count': r = await count(s, l); break
    case 'rank': r = await rank(s, l); break
    case 'advice': r = await advice(s, l); break
    case 'search': r = { answer: say(lang, 'search'), cites: [] }; break
    default: r = { answer: say(lang, s.intent === 'unknown' ? 'unknown' : 'no_intent'), cites: [] }
  }
  const src = r.cites.length ? sourceLine(lang, r.cites) : ''
  if (src) r.answer += '\n' + src
  return r
}

