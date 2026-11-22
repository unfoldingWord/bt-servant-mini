// Stage 2, `answer`: call sheets -> answers. One recipe per intent over `language-pack-client`; one plain-text template file per
// language (templates/<lang>.json). Every answer names the resource and release it comes from.
//
//   bun run src/answer.ts <sheets.jsonl> <filler>      writes out/answers-<filler>.jsonl
import type { PackReader } from '@bt-synergy/language-pack-client'
import { type BookModel, type HelpRow, verseId } from '@bt-synergy/language-pack-v3'
import { textOfRange } from '@lpc/query/passage'
import { type AlignedText, alignIndex, quoteIn } from './align'
import { openLang, hasLang, installedLangs } from './packs'
import { type PatchMark, patchCite, patchForAI, patchNotice, patchTag, patchTextForAI, versionName } from './aquifer'
import { FOLD, FOLD_END, focusOrder, focusWords, SHOWN, wordsOf } from './focus'
import { isObsRef, obsAnswer, storyText } from './obs'
import type { PlaceRef, Trip } from '@lpc/query/geo'
import tEn from './data/tpl-en.json'
import tEs from './data/tpl-es.json'
import tFr from './data/tpl-fr.json'
import tId from './data/tpl-id.json'
import tHi from './data/tpl-hi.json'
import tAr from './data/tpl-ar.json'

export type Sheet = {
  id: string; intent: string; ref: string | null; what: string[]; version: string | null; concept: string | null
  term: string | null; phrase: string | null; candidates: string[] | null; lang: string
}
/** What the last answer found, for the conversational sentence around it (set by the recipes, read by converse.ts). */
export let facts: Record<string, any> = {}
/** options: the articles to pick from, when the answer asks "which do you mean?" (the app shows them as buttons). */
export type Result = { answer: string; cites: string[]; options?: { id: string; title: string }[] }
/** Bible text as a reader sees it: the braces that mark implied words in the ULT/UST are left out. */
const plain = (t: string): string => t.replace(/\{/g, ' ').replace(/\}/g, '').replace(/ {2,}/g, ' ')
/** A text in another script than its pack's language is not that language (BSOJ's ar ARST New Testament is the English UST, Nov 2026). */
const SCRIPT: Record<string, RegExp> = { ar: /[؀-ۿ]/, hi: /[ऀ-ॿ]/ }
const wrongScript = (lang: string, text: string): boolean => !!SCRIPT[lang] && !SCRIPT[lang]!.test(text)

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

const templates: Record<string, Record<string, string>> = { en: tEn, es: tEs, fr: tFr, id: tId, hi: tHi, ar: tAr }
/** The language the person wrote in: the answer's fixed words follow it, whatever pack the content comes from. */
let UI: string | null = null
export function setUiLang(l: string | null) { UI = l && templates[l] ? l : null }
/**
 * The question being answered, when the caller knows it: a passage answer puts the notes about the words it names first
 * (focus.ts). Without it, only the sheet's own term or phrase can say what the question is about.
 */
let QUESTION: string | null = null
/** The words the reader took from the question as its term or phrase: they count whatever they are ("know", "see"). */
let NAMED: (string | null | undefined)[] = []
export function setQuestion(q: string | null | undefined, sheet?: { term?: string | null; phrase?: string | null } | null) {
  QUESTION = q?.trim() || null
  NAMED = sheet ? [sheet.term, sheet.phrase] : []
}
/**
 * Whether a line is an answer's source line ("Source: unfoldingWord/en/tn v91.", in any of the six languages): the app draws it
 * in the answer's "details" fold, not under the answer (Abel, Nov 17); the message keeps it (sharing, saving, online AI).
 */
export function isSourceLine(t: string): boolean {
  const s = t.trim()
  return Object.values(templates).some((x) => { const pre = x.source?.split('{list}')[0]!.trim(); return !!pre && s.startsWith(pre) })
}
function tpl(lang: string): Record<string, string> {
  return templates[UI ?? (lang.startsWith('es') ? 'es' : 'en')]!
}
function say(lang: string, key: string, vars: Record<string, string | number> = {}): string {
  const t = tpl(lang)[key]
  if (t === undefined) throw new Error(`no template ${key} for ${lang}`)
  return t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}
import booknames from './data/booknames.json'
const bookName = (lang: string, code: string): string =>
  (lang.startsWith('es') ? BOOK_ES : lang === 'ar' ? ((booknames as any).BOOK_AR as Record<string, string>) : BOOK_EN)[code] ?? code

/** A note or an article in plain text: no headings, no links the reader cannot follow (as `clean` of language-pack-mcp). */
export function clean(md: unknown, keepHeadings = false): string {
  return String(md ?? '')
    .replace(/^#+\s*/gm, (h) => (keepHeadings ? h : ''))
    // links stay: md() turns the ones the app can open ([[tw:kt/faith]], [1:2](ref:jon 1:2), ../kt/faith.md) into taps
    .replace(/\((?:ver|see):\s*rc:\/\/[^)\s]+\)/gi, '')
    .replace(/[ \t]+\./g, '.')
    // a doubled period ("word..") becomes one, but not the "../" of a link (../figs-simile/01.md must stay a tap)
    .replace(/(?<!\.)\.\.(?![./])/g, '.')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + ' …' : s)
const resShort = (res: string): string => res.split('/').pop()!
const upper = (res: string): string => resShort(res).toUpperCase()

/** `ch2`: the chapter of `v2` when a range crosses chapters (`jon 1:17-2:10`); otherwise `ch`. */
type Ref = { book: string; kind: 'book' | 'chapter' | 'verses' | 'bookintro' | 'chapintro'; ch?: number; v1?: number; v2?: number; ch2?: number }
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
  if ((x = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(rest))) return { book, kind: 'verses', ch: +x[1]!, v1: +x[2]!, ch2: +x[3]!, v2: +x[4]! }
  if ((x = /^(\d+):(\d+)(?:-(\d+))?$/.exec(rest))) return { book, kind: 'verses', ch: +x[1]!, v1: +x[2]!, v2: x[3] ? +x[3] : +x[2]! }
  return null
}
function rangeOf(r: Ref): [number, number] {
  const b = r.book
  if (r.kind === 'book' || r.kind === 'bookintro') return [verseId(b, 0, 0), verseId(b, 999, 999)]
  if (r.kind === 'chapter' || r.kind === 'chapintro') return [verseId(b, r.ch!, 0), verseId(b, r.ch!, 999)]
  return [verseId(b, r.ch!, r.v1!), verseId(b, r.ch2 ?? r.ch!, r.v2!)]
}
const refLabel = (r: Ref): string =>
  r.kind === 'book' ? '' : r.kind === 'bookintro' ? '' : r.kind === 'chapter' || r.kind === 'chapintro' ? String(r.ch)
    : r.ch2 !== undefined && r.ch2 !== r.ch ? `${r.ch}:${r.v1}-${r.ch2}:${r.v2}` : `${r.ch}:${r.v1}${r.v2 !== r.v1 ? '-' + r.v2 : ''}`

/** The Aquifer patch mark of a row that came from one (the client marks every such row; a base row has none). */
const patchOfRow = (row: HelpRow | undefined): PatchMark | undefined => (row as { patch?: PatchMark } | undefined)?.patch
/** The notice and the source-line entry when the book's notes (a table the reader keeps whole) came from an Aquifer patch. */
function patchTail(lang: string, model: BookModel): { notice: string; cite: string } | null {
  const m = patchOfRow(model.notes?.rows[0])
  return m ? { notice: patchNotice(UI ?? lang, [m]), cite: patchCite(m) } : null
}
/** What a text is called: a patch text (yaapi) by its readable name, a pack's by its short code (GLT, GST). */
const textName = (t: { res: string }): string => {
  const m = patchOfRow(t as unknown as HelpRow)
  return m ? versionName(m) : resShort(t.res).toUpperCase()
}
const isIntroRow = (row: HelpRow): boolean => row.cols.isIntro === true || row.cols.isIntro === 'true'
const inRange = (row: HelpRow, [from, to]: [number, number]): boolean => row.from <= to && row.to >= from

/** What is installed and cached per language, opened once. */
type Lang = { lang: string; r: PackReader; maps: any; aligned: Map<string, AlignedText[]> }
// The promise is kept at once, not its result after the awaits: a lookup still running when the packs change
// (resetLangs) would otherwise write its old answer into the new cache.
const langs = new Map<string, Promise<Lang | null>>()
/** After a language is added or removed. */
export function resetLangs() {
  langs.clear()
}
function getLang(lang: string): Promise<Lang | null> {
  let p = langs.get(lang)
  if (!p) {
    p = (async () => {
      if (!(await hasLang(lang))) return null
      const r = await openLang(lang)
      return { lang, r, maps: await r.maps(), aligned: new Map() }
    })()
    langs.set(lang, p)
    // a failed read is not remembered: the next call tries again
    p.catch(() => { if (langs.get(lang) === p) langs.delete(lang) })
  }
  return p
}
/** `lang` first, then English, then every other installed pack: where an answer can come from when `lang` is not installed. */
async function packsFor(lang: string): Promise<string[]> {
  return [...new Set([lang, 'en', ...(await installedLangs())])]
}
async function bookOf(l: Lang, code: string): Promise<BookModel | undefined> {
  return l.r.installed(`book:${code}`) ? await l.r.book(code) : undefined
}
async function alignedOf(l: Lang, code: string, model: BookModel): Promise<AlignedText[]> {
  let a = l.aligned.get(code)
  if (a === undefined) l.aligned.set(code, (a = alignIndex(model as any)))
  return a
}
/** A patch's release is a git commit (`UWTranslationNotes@603546c…`), not a version: shown as "Aquifer", never as the hash. */
const releaseOf = (model: BookModel, key: string): string => {
  const r = model.res.find((x) => x[0] === key)?.[1] ?? ''
  // (a yaapi text's release is `ABBR@sha256:…`: shown as its source too)
  return /@(sha256:)?[0-9a-f]{7,}$/i.test(r) ? (key.startsWith('yaapi/') ? 'yaapi' : 'Aquifer') : r
}
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
/** The helps by their names (product names, the same in every language, as the app says "Translation Academy"). */
const HELPS: Record<string, string> = { tn: 'Translation Notes', tq: 'Translation Questions', twl: 'Translation Words Links', tw: 'Translation Words', ta: 'Translation Academy' }
/** "Translation Notes v91 · ULT v91": the resources and releases an answer shows, short, for the line at its top. */
const topSource = (cites: string[]): string => {
  const seen = new Set<string>()
  for (const c of cites) {
    const m = /^(\S+) (v?[\d.]+)\b/.exec(c)
    if (m) seen.add(`${HELPS[resShort(m[1]!)] ?? upper(m[1]!)} ${m[2]}`)
  }
  // the notes first, then the texts, then the rest
  const rank = (x: string) => (x.startsWith(HELPS.tn!) ? 0 : Object.values(HELPS).some((h) => x.startsWith(h + ' ')) ? 2 : 1)
  return [...seen].sort((a, b) => rank(a) - rank(b)).join(' · ')
}
/**
 * Puts the source line ("Translation Notes v91 — Ruth 4") in the answer's heading block, so it is first and never inside a
 * fold; with no heading, it becomes the first block.
 */
function withTop(out: string[], line: string) {
  const i = out.findIndex((b) => /^#{1,3}\s/.test(b) && !b.startsWith(FOLD))
  if (i === 0) out[0] += `\n*${line}*`
  else out.unshift(`*${line}*`)
}
/** The key terms and the Academy article a note is about: the terms tied to the same words of the text, and its own article. */
const aboutOf = (n: HelpRow, links: HelpRow[]): string[] =>
  [...new Set([...links.filter((x) => x.quote?.some((p) => n.quote?.includes(p))).map((x) => x.concept!), ...(n.concept ? [n.concept] : [])])]
/** The text resource of a version in this language: ult -> ult or glt, ust -> ust or gst. */
const textKey = (model: BookModel, version: 'ult' | 'ust'): string | undefined =>
  model.texts.map((t) => t.res).find((k) => (version === 'ult' ? /\/(ult|glt)$/ : /\/(ust|gst)$/).test(k))
const names = (l: Lang, id: string): string => (l.maps.map?.core.names?.[id] as string[] | undefined)?.[0] ?? id.split('/').pop()!
/** Whether the pack of `l` (or the English one, where the panel looks next) has this article: packs carry only some Academy manuals. */
async function hasArticle(l: Lang, id: string): Promise<boolean> {
  for (const pl of await packsFor(l.lang)) {
    try {
      const x = await getLang(pl)
      if (x && (await x.r.article(id)).data) return true
    } catch { /* the next pack */ }
  }
  return false
}
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
  // Open Bible Stories (obs.ts): a story or one frame, from the first pack that has them, or what is missing
  if (isObsRef(s.ref)) {
    const o = await obsAnswer({ ref: s.ref, what: s.what, lang }, UI ?? (lang.startsWith('es') ? 'es' : 'en'))
    facts = o.facts
    return { answer: o.answer, cites: o.cites }
  }
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
    // (not when the book's only texts are a patch's, unaligned Bible texts: they are shown, labelled, below)
    const patchTextsOnly = !!model?.texts.length && model.texts.every((t) => !!patchOfRow(t as unknown as HelpRow))
    if (key && !cover(key) && !patchTextsOnly) {
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
  /** The marks of the patches the items shown came from: the notice, and the source line (a report) say so. */
  const patched: PatchMark[] = []
  const tagOf = (row: HelpRow | undefined): string => {
    const m = patchOfRow(row)
    if (!m) return ''
    patched.push(m)
    return ` *(${patchTag(UI ?? lang, m)})*`
  }
  const head = say(lang, 'passage_head', { book, ref: refLabel(ref), lang }).replace(/\s+\(/, ' (').replace(/\s{2,}/g, ' ')
  out.push('## ' + head)
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
      const note = clean(row.cols.note, true)
      // a note with its own title needs no second one; its headings go under the answer's
      if (!/^#/.test(note)) out.push('### ' + say(lang, 'intro_head', { what: what_ }))
      out.push(note.replace(/^#{1,2}\s/gm, '### ') + tagOf(row))
      facts.intro = what_
      cites.push(cite(model.notes!.res, releaseOf(model, model.notes!.res), `${ref.book} intro, note ${row.id}`))
    } else out.push(say(lang, 'intro_none', { what: what_ }))
  }
  const rowsIn = (t: { rows: HelpRow[] } | undefined, noIntro = true): HelpRow[] => (t?.rows ?? []).filter((x) => inRange(x, range) && !(noIntro && isIntroRow(x)))
  const lab = refLabel(ref)
  const intros = ref.kind === 'bookintro' || ref.kind === 'chapintro'
  // the texts asked for: ULT/UST (GLT/GST in Spanish); a language whose texts have other names shows them all
  const wanted = s.version ? '/' + verKey(s.version as 'ult' | 'ust') : ''
  const texts = wantText && !intros ? model.texts.filter((t) => !(wanted && model.texts.some((x) => x.res.endsWith(wanted)) && !t.res.endsWith(wanted))) : []
  const cited = new Set<string>()
  /** The texts of verses `from`..`to`, one line each; each text is cited once. */
  const textLines = (from: number, to: number): string[] => {
    const lines: string[] = []
    for (const t of texts) {
      const text = plain(textOfRange(ref.book, t.pieces as any, t.events as any, from, to))
      if (!text || wrongScript(lang, text)) continue
      const tm = patchOfRow(t as unknown as HelpRow)
      lines.push((tm ? `**${textName(t)}**: ${text}` : say(lang, 'text_line', { label: `**${textName(t)}**`, res: t.res, release: releaseOf(model, t.res), text })) + tagOf(t as unknown as HelpRow))
      if (!cited.has(t.res)) {
        cited.add(t.res)
        facts.texts++
        cites.push(cite(t.res, releaseOf(model, t.res), `${ref.book} ${lab}`))
      }
    }
    return lines
  }
  const wantNotes = what.includes('notes'), wantTerms = what.includes('terms'), wantQs = what.includes('questions')
  // a chapter (or a book, or more than a few verses) is long: a summary line, and the rest folded per verse (per chapter for a book)
  const long = !intros && (ref.kind === 'chapter' || ref.kind === 'book' || (ref.kind === 'verses' && ((ref.ch2 ?? ref.ch) !== ref.ch || ref.v2! - ref.v1! >= 3)))
  const byChapter = ref.kind === 'book'
  const t0 = model.texts[0]
  const slices = !long || !t0 ? [] : verseSlices(ref.book, t0.events as any, (t0.pieces as unknown[]).length, range[0], range[1])
  const verseIds = [...new Set(slices.map((x) => (byChapter ? verseId(ref.book, x.ch, 0) : verseId(ref.book, x.ch, x.first))))]
  const nVerses = new Set(slices.map((x) => verseId(ref.book, x.ch, x.first))).size
  const groupOf = (from: number): number => (byChapter ? from - (from % 1000) : from)
  const groupLabel = (id: number): string => (byChapter ? `${book} ${Math.floor(id / 1000) % 1000}` : `${Math.floor(id / 1000) % 1000}:${id % 1000}`)

  // key terms: each once, with the words of the text they are tied to (a note about those words is about the term too)
  const links = wantTerms || wantNotes ? rowsIn(model.links).filter((x) => x.concept) : []
  const seen = new Map<string, HelpRow>()
  for (const x of links) if (!seen.has(x.concept!)) seen.set(x.concept!, x)
  const titles = new Map<string, string>()
  const title = async (id: string): Promise<string> => {
    if (!titles.has(id)) titles.set(id, await titleOf(l, id))
    return titles.get(id)!
  }
  const termLines: string[] = []
  if (wantTerms) {
    for (const [id, x] of seen) {
      const said = quoteIn(al, x.quote)[0]?.text ?? String(x.cols.origWords ?? '')
      termLines.push(say(lang, 'term_line', { said: `**${said}**`, title: await title(id) }))
      cites.push(cite(model.links!.res, releaseOf(model, model.links!.res), `${ref.book} ${x.ref}, ${id}`))
    }
    facts.terms = seen.size
  }

  // the notes, and which of them are about the words of the question
  const notes = wantNotes ? rowsIn(model.notes).filter((x) => clean(x.cols.note)) : []
  facts.notes = notes.length
  const stems = focusWords(QUESTION, [s.term, s.phrase, ...NAMED])
  const focus = stems.length && notes.length > 1
    ? focusOrder(await Promise.all(notes.map(async (n) => ({
      quote: quoteIn(al, n.quote).map((q) => q.text).join(' '),
      titles: (await Promise.all(aboutOf(n, links).map(title))).join(' '),
    }))), stems)
    : { first: [] as number[], rest: notes.map((_, i) => i), used: [] as string[] }
  const noteLine = async (i: number, withRef: boolean): Promise<string> => {
    const n = notes[i]!
    const said = quoteIn(al, n.quote).map((q) => `«${q.text}»`).join(' / ')
    const orig = n.cols.quote && !clean(n.cols.note).startsWith(String(n.cols.quote)) ? String(n.cols.quote) : ''
    const headTxt = [withRef ? n.ref : '', said, orig ? `(${orig})` : ''].filter(Boolean).join(' ')
    // "[Academy: title]" is a tap when the article can be opened: "[text](id)" is the link md() and linkTarget() know
    const academy = n.concept ? say(lang, 'note_academy', { title: await title(n.concept) }) + (!clean(n.cols.note).includes(n.concept) && (await hasArticle(l, n.concept)) ? `(${n.concept})` : '') : ''
    cites.push(cite(model.notes!.res, releaseOf(model, model.notes!.res), `${ref.book} ${n.ref}, note ${n.id}`))
    return say(lang, 'note_line', { n: i + 1, head: headTxt ? `**${headTxt}**: ` : '', note: clean(n.cols.note).replace(/\n+/g, ' '), academy }) + tagOf(n)
  }
  const qs = wantQs ? rowsIn(model.questions) : []
  facts.questions = qs.length
  const qLines = qs.map((q) => {
    cites.push(cite(model.questions!.res, releaseOf(model, model.questions!.res), `${ref.book} ${q.ref}`))
    return say(lang, 'question_line', { q: `**${String(q.cols.question ?? '')}**`, a: String(q.cols.response ?? '') }) + tagOf(q)
  })
  // one thing asked (only notes, only the text…): that thing, as it is
  const only = what.filter((w) => w !== 'intro').length === 1

  if (long && (wantNotes || wantText)) out.push(say(lang, wantNotes ? 'chapter_summary' : 'chapter_verses', { book, ref: lab, v: nVerses, n: notes.length }))
  const rest = focus.rest
  if (focus.first.length) {
    // the question names a word: its notes, then the verses they are in; the other notes behind a button
    const words = wordsOf(focus.used, s.term, s.phrase, ...NAMED, QUESTION).map((w) => `«${w}»`).join(', ')
    out.push('### ' + say(lang, 'focus_head', { words, book, ref: lab, n: focus.first.length, all: notes.length }))
    for (const i of focus.first) out.push(await noteLine(i, long))
    if (long) {
      for (const id of [...new Set(focus.first.map((i) => notes[i]!.from))].slice(0, 3))
        out.push(...textLines(id, id).map((x) => `${groupLabel(id)} ${x}`))
    } else out.push(...textLines(range[0], range[1]))
  } else if (!long || (only && wantText)) {
    out.push(...textLines(range[0], range[1]))
    if (wantText && !intros && !cited.size) out.push(say(lang, 'text_none', { label: (s.version ?? '').toUpperCase(), ref: `${book} ${lab}`.trim() }))
  }
  if (wantNotes && !notes.length) out.push(say(lang, 'notes_none', { book, ref: lab }))
  // "no questions" is said before the folds, not inside the last one
  if (wantQs && !qs.length) out.push(say(lang, 'questions_none', { book, ref: lab }))
  if (!long) {
    if (notes.length && !focus.first.length) {
      // a verse's notes: all of them when they are few, else the first ones and a button for the others
      out.push('### ' + say(lang, 'notes_head', { book, ref: lab }))
      const shown = rest.length > SHOWN + 2 ? SHOWN : rest.length
      for (const i of rest.slice(0, shown)) out.push(await noteLine(i, false))
      if (rest.length > shown) {
        out.push(FOLD + say(lang, 'more_notes', { n: rest.length - shown }))
        for (const i of rest.slice(shown)) out.push(await noteLine(i, false))
      }
    } else if (rest.length && focus.first.length) {
      out.push(FOLD + say(lang, 'more_notes', { n: rest.length }))
      for (const i of rest) out.push(await noteLine(i, false))
    }
  } else if (wantNotes || (wantText && !only)) {
    // a long passage: one button per verse (per chapter for a book) with its text and its notes
    const folded = new Set(rest)
    const ids = [...new Set([...verseIds, ...notes.map((n) => groupOf(n.from))])].sort((a, b) => a - b)
    for (const id of ids) {
      const mine = notes.map((_, i) => i).filter((i) => folded.has(i) && groupOf(notes[i]!.from) === id)
      const lines = byChapter || (only && wantNotes) || (wantText && only) ? [] : textLines(id, id)
      if (!mine.length && !lines.length) continue
      out.push(FOLD + (mine.length ? say(lang, 'verse_fold', { ref: groupLabel(id), n: mine.length }) : groupLabel(id)))
      out.push(...lines)
      for (const i of mine) out.push(await noteLine(i, byChapter))
    }
  }
  if (wantTerms) {
    if (only) out.push('### ' + say(lang, 'terms_head', { book, ref: lab }), ...(termLines.length ? termLines : ['-']))
    else if (termLines.length) out.push(FOLD + say(lang, 'terms_fold', { n: termLines.length }), ...termLines)
  }
  if (wantQs && qs.length) {
    if (only) out.push('### ' + say(lang, 'questions_head', { book, ref: lab }), ...qLines)
    else out.push(FOLD + say(lang, 'questions_fold', { n: qs.length }), ...qLines)
  }
  // where it comes from, at the top: resource, release and passage (the full source line still ends the answer)
  // items from an Aquifer patch: one notice with the attribution, and the patch in the source line (a report carries it)
  if (patched.length) {
    // (outside the last fold, or the attribution would stay hidden behind its button)
    if (out.some((b) => b.startsWith(FOLD))) out.push(FOLD_END)
    out.push(patchNotice(UI ?? lang, patched))
    for (const m of new Map(patched.map((x) => [x.patch + x.release + x.review, x])).values()) cites.push(patchCite(m))
  }
  const top = topSource(cites)
  if (top) withTop(out, `${top} — ${book} ${lab}`.trim())
  return { answer: out.join('\n\n'), cites }
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
  const by = (...roles: string[]) => ownRoles(a.sections).filter((x) => roles.includes(x.role))
  const main = s.concept.startsWith('tw:') ? (by('definition').length ? by('definition').slice(0, 1) : by('intro').slice(0, 1)) : by('description')
  facts = { kind: 'article', title: a.title }
  for (const c of ans.cites) cites.push(cite(c.res, c.release, `${c.id}, ${c.section}`))
  const top = topSource(cites)
  const out: string[] = ['## ' + say(lang, 'article_head', { title: a.title }) + (top ? `\n*${top}*` : '')]
  // the definition first; a long one shows its first paragraphs, and the rest is behind a button
  const shown = main.length ? main : a.sections.slice(0, 1)
  const [lead, more] = splitLead(shown.map((x) => clean(x.md)).join('\n\n'), 600)
  out.push(lead)
  const other = shown.find((x) => x.lang && x.lang !== lang)?.lang
  if (other) out.push(say(lang, 'article_other_lang', { lang: other }))
  if (s.concept.startsWith('ta:')) {
    const st = by('strategies')[0]
    if (st) out.push('### ' + say(lang, 'article_strategies', {}) + '\n' + clip(clean(st.md), 1500))
  }
  // Translation Words: how to translate the word, one tap away; in sight when the question asks how to translate it
  const sug = s.concept.startsWith('tw:') ? by('translation-suggestions')[0] : undefined
  const sugTitle = String(sug?.title ?? '').replace(/[:：\s]+$/, '') || say(lang, 'article_suggestions')
  const howTo = !!QUESTION && HOW_TO.test(QUESTION)
  if (sug && clean(sug.md) && howTo) out.push('### ' + sugTitle, clip(clean(sug.md), 1500))
  if (more) out.push(FOLD + say(lang, 'article_more', { title: a.title }), more)
  if (sug && clean(sug.md) && !howTo) out.push(FOLD + sugTitle, clip(clean(sug.md), 1500))
  return { answer: out.join('\n\n'), cites }
}

/**
 * The sections whose role is their own, not passed down from the section they sit under (packs built since bt-synergy
 * c68e3622 give a sub-section its parent's role): the answers pick the sections they did before, not their sub-sections too.
 */
function ownRoles<T extends { role: string; level: number }>(secs: T[]): T[] {
  return secs.filter((s, i) => {
    let p = i - 1
    while (p >= 0 && secs[p]!.level >= s.level) p--
    return !(p >= 0 && secs[p]!.role === s.role)
  })
}

/** A question that asks how to translate something: the article's translation suggestions come first. */
const HOW_TO = /translat|tradu[cz]|menerjemah|अनुवाद|ترجم/i
/** A text cut after its first paragraphs (at least one, up to about `max` characters), and the rest ('' when nothing is left). */
function splitLead(t: string, max: number): [string, string] {
  const parts = t.split(/\n{2,}/)
  let n = 1
  let len = parts[0]!.length
  while (n < parts.length && len + parts[n]!.length <= max) len += parts[n++]!.length
  // a heading never ends what is shown: it belongs to what it heads
  while (n > 1 && /^#/.test(parts[n - 1]!)) n--
  return [parts.slice(0, n).join('\n\n'), parts.slice(n).join('\n\n')]
}

/** The first sentence of a text (up to 220 characters). */
const firstSentence = (t: string): string => {
  const x = t.replace(/\s+/g, ' ').trim()
  const m = /^.{20,}?[.!?](?=\s|$)/.exec(x)
  return clip(m ? m[0] : x, 220)
}

async function choose(s: Sheet, l: Lang): Promise<Result> {
  const lang = l.lang
  const lines = ['**' + say(lang, 'choose_head') + '**', '']
  const cites: string[] = []
  const options: { id: string; title: string }[] = []
  for (const [i, id] of (s.candidates ?? []).entries()) {
    const a = await l.r.article(id, 'all')
    const secs = a.data?.sections ?? []
    const d = secs.find((x) => x.role === 'definition') ?? secs.find((x) => x.role === 'description') ?? secs[0]
    const def = d ? firstSentence(clean(d.md).replace(/^#+.*$/gm, ' ')) : ''
    const title = a.data?.title ?? (await titleOf(l, id))
    options.push({ id, title })
    lines.push(say(lang, 'choose_line', { n: i + 1, title, def }))
    for (const c of a.cites.slice(0, 1)) cites.push(cite(c.res, c.release, id))
    cites.push(`id:${id}`)
  }
  return { answer: lines.join('\n'), cites, options }
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
  return { answer: say(lang, 'count_bible', { n, what: say(lang, what === 'terms' ? 'word_links' : 'word_notes'), filter: filterTxt, list: rows.slice(0, 8).map(([b, c]) => `${bookName(lang, b)} ${c}`).join(', ') }), cites }
}
/** The verses of a passage linked to an article ("redentor" in Ruth 4: 4:1, 4:3…), from the passage's key-term links. */
export async function linkedVerses(ref: string, concept: string, packLang: string): Promise<string[]> {
  const r = parseRef(ref)
  if (!r) return []
  for (const pl of await packsFor(packLang)) {
    const l = await getLang(pl)
    const model = l ? await bookOf(l, r.book) : undefined
    const rows = (model?.links?.rows ?? []) as HelpRow[]
    if (!rows.length) continue
    const range = rangeOf(r)
    const refs = rows.filter((x) => x.concept === concept && inRange(x, range)).map((x) => x.ref)
    return [...new Set(refs)]
  }
  return []
}
/**
 * "What books of the Bible mention grace?": every book whose verses link to the article, in Bible order, with how many
 * verses in each. From the map of the whole Bible (English TWL), so it counts books that are not installed too.
 */
export async function booksWith(concept: string, packLang: string): Promise<Result> {
  const own = await getLang(packLang)
  let en: Lang | null = packLang === 'en' ? own : await getLang('en')
  if (!own && !en) for (const pl of await installedLangs()) if ((en = await getLang(pl))) break
  const l = own?.maps.xmap?.core ? own : en
  const title = own ? names(own, concept) : l ? names(l, concept) : concept.split('/').pop()!
  const lang = own?.lang ?? packLang
  const hit = l ? mapCount(l, concept, 'terms') : null
  const order = Object.keys(BOOK_EN)
  const rows = [...(hit?.books ?? new Map<string, number[]>())]
    .map(([b, c]) => [b, c[1] ?? c[0] ?? 0] as [string, number])
    .filter(([, v]) => v > 0)
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
  if (!hit || !rows.length) return { answer: say(lang, 'books_none', { title }), cites: [] }
  const v = rows.reduce((s, [, n]) => s + n, 0)
  return {
    answer: `**${say(lang, 'books_head', { title, v, b: rows.length })}**\n\n${rows.map(([b, n]) => `${bookName(lang, b)} ${n}`).join(' · ')}`,
    cites: [cite(hit.res, hit.release, 'map'), `id:${concept}`],
  }
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

async function rank(s: Sheet, l0: Lang): Promise<Result> {
  let l = l0
  const lang = l.lang
  const cites: string[] = []
  const ref = s.ref ? parseRef(s.ref) : null
  if (!ref) return { answer: say(lang, 'count_nothing', { need: 'a reference' }), cites }
  const book = bookName(lang, ref.book)
  const lab = refLabel(ref) ? ' ' + refLabel(ref) : ''
  let model = await bookOf(l, ref.book)
  // a pack can have the book without its notes (Hindi James): the notes of the next pack that has them, as passages do
  if (model && !model.notes) {
    for (const pl of await packsFor(lang)) {
      const x = await getLang(pl)
      const m = x ? await bookOf(x, ref.book) : undefined
      if (m?.notes) { model = m; l = x!; break }
    }
  }
  if (!model?.notes) return { answer: say(lang, 'count_nothing', { need: `book:${ref.book}` }), cites }
  const rows = model.notes.rows.filter((x) => inRange(x, rangeOf(ref)) && !isIntroRow(x) && x.concept)
  const by = new Map<string, number>()
  for (const x of rows) by.set(x.concept!, (by.get(x.concept!) ?? 0) + 1)
  const sorted = [...by].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  cites.push(cite(model.notes!.res, releaseOf(model, model.notes!.res), `${ref.book}${lab}`))
  if (!sorted.length) return { answer: say(lang, 'rank_none', { book, ref: lab }), cites }
  const lines = ['**' + say(lang, 'rank_head', { book, ref: lab, n: rows.length }) + '**', '']
  for (const [i, [id, c]] of sorted.slice(0, 10).entries()) lines.push(say(lang, 'rank_line', { n: i + 1, title: await titleOf(l, id), count: c }))
  for (const [id] of sorted.slice(0, 10)) cites.push(`id:${id}`)
  const pt = patchTail(lang, model)
  if (pt) { lines.push('', pt.notice); cites.push(pt.cite) }
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
  // the "(See: [[ta:…]])" after it is a link, not a translation («[ta:translate/figs-idiom» was shown as one)
  const rest = m[1]!.replace(/\[\[[^\]]*\]\]/g, '').replace(/\((?:ver|see)\b[^)]*\)/gi, '').trim()
  return [...rest.matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]).join(' / ') || rest.replace(/[\s.]+$/, '') || null
}

async function advice(s: Sheet, l: Lang): Promise<Result> {
  const lang = l.lang
  const cites: string[] = []
  const ref = s.ref ? parseRef(s.ref) : null
  if (!ref || ref.kind !== 'verses') return { answer: say(lang, 'bad_ref', { ref: s.ref ?? '' }), cites }
  const book = bookName(lang, ref.book)
  const phrase = s.phrase ?? ''
  const model = await bookOf(l, ref.book)
  const out: string[] = ['## ' + say(lang, 'advice_head', { book, ref: refLabel(ref), phrase })]
  let articleId = s.concept
  let matched = false
  if (model) {
    const al = await alignedOf(l, ref.book, model)
    const range = rangeOf(ref)
    const want = new Set(toks(phrase))
    const scored: { row: HelpRow; score: number; cover: number; said: string }[] = []
    for (const row of model.notes?.rows ?? []) {
      if (!inRange(row, range) || isIntroRow(row) || !clean(row.cols.note)) continue
      const quotes = quoteIn(al, row.quote)
      let best = 0
      let cover = 0
      let said = ''
      for (const q of quotes) {
        const have = new Set(toks(q.text))
        if (!have.size || !want.size) continue
        const inter = [...have].filter((t) => want.has(t)).length
        const score = inter / Math.min(have.size, want.size)
        if (score > best) { best = score; said = q.text }
        cover = Math.max(cover, inter / want.size)
      }
      scored.push({ row, score: best, cover, said: quotes[0]?.text ?? said })
    }
    // of the notes that quote the phrase, first the one that has more of it («extiende tu manto…» before «tu sierva»)
    const hits = scored.filter((x) => x.score >= 0.6).sort((a, b) => b.cover - a.cover || b.score - a.score).slice(0, 2)
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
    } else {
      out.push(say(lang, 'advice_no_note', { phrase, book, ref: refLabel(ref) }))
      // the phrase was not found in a note (it may be the person's own words): the verse's notes, so the help is still there
      for (const x of scored.slice(0, 3)) {
        const note = clean(x.row.cols.note).replace(/\n+/g, ' ')
        out.push(say(lang, 'advice_note', { res: model.notes!.res, release: releaseOf(model, model.notes!.res), said: x.said ? `«${x.said}»: ` : '', note }))
        cites.push(cite(model.notes!.res, releaseOf(model, model.notes!.res), `${ref.book} ${x.row.ref}, note ${x.row.id}`))
      }
    }
    const uKey = textKey(model, 'ust')
    const simple = model.texts.find((t) => t.res === uKey)
    if (simple) {
      const text = plain(textOfRange(ref.book, simple.pieces as any, simple.events as any, range[0], range[1]))
      if (text && !wrongScript(lang, text)) {
        out.push(say(lang, 'advice_simple', { label: upper(simple.res), text }))
        cites.push(cite(simple.res, releaseOf(model, simple.res), `${ref.book} ${refLabel(ref)}`))
      }
    }
  } else out.push(`${book} is not installed on this device.`)
  if (articleId) {
    const ans = await l.r.article(articleId, 'all')
    if (ans.data) {
      const by = (...r: string[]) => ownRoles(ans.data!.sections).filter((x) => r.includes(x.role))
      out.push('### ' + say(lang, 'advice_academy', { title: ans.data.title }))
      cites.push(`id:${articleId}`)
      if (!matched) out.push(say(lang, 'advice_general'))
      const d = by('description')[0]
      if (d) out.push(clip(clean(d.md).replace(/\n+/g, ' '), 700))
      const st = by('strategies')[0]
      if (st) out.push('### ' + say(lang, 'article_strategies') + '\n' + clip(clean(st.md), 900))
      for (const c of ans.cites.slice(0, 1)) cites.push(cite(c.res, c.release, articleId))
    }
  } else if (!matched) out.push(say(lang, 'advice_none'))
  const pt = (model ? patchTail(lang, model) : null)
  if (pt) { out.push(pt.notice); cites.push(pt.cite) }
  const top = topSource(cites)
  if (top) withTop(out, top)
  return { answer: out.join('\n\n'), cites }
}

// ------------------------------------------------------------------------------------------------------------------ main

export async function answerSheet(s: Sheet): Promise<Result> {
  facts = {}
  const lang = s.lang
  let l = await getLang(lang)
  if (s.intent === 'resources') return resources(s, l)
  // a sheet made for a language that is not (or no longer) installed: any installed pack answers
  if (!l) for (const pl of await packsFor(lang)) if ((l = await getLang(pl))) break
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
  // the last fold ends here: the source line and whatever a route adds after this answer stay in sight
  if (r.answer.split('\n\n').some((b) => b.startsWith(FOLD))) r.answer += '\n\n' + FOLD_END
  // *…*, not _…_: resource ids have underscores (es-419_gl), which break an underscore italic
  if (src) r.answer += '\n\n*' + src + '*'
  return r
}


// ------------------------------------------------------------------------------------------------------------- study view

/** One piece of a verse: its text, and for a word the helps it is part of (`n3` the fourth note, `t0` the first term). */
export type StudyPiece = [text: string, keys?: string]
/** quotes: what the note quotes in every text; about: the titles of its key terms and article (what focus.ts matches) */
export type StudyNote = { said: string; orig: string; note: string; concept?: string; ref: string; quotes?: string; about?: string
  /** it came from an Aquifer patch: the short tag that says so (aquifer.ts patchTag) */
  patch?: string }
export type StudyTerm = { id: string; title: string; said: string; orig: string }
/** A passage as the bubble shows it: each text with its words tied to the notes and key terms that quote them. */
export type Study = {
  lang: string; head: string; book: string; ch: number; v1: number; v2: number
  /** `tag`: an unaligned text of a patch (yaapi) says so, with its version (aquifer.ts patchTag) */
  texts: { label: string; tag?: string; verses: { v: string; p: StudyPiece[] }[] }[]
  notes: StudyNote[]; terms: StudyTerm[]; questions: { q: string; a: string; patch?: string }[]
  /** items came from an Aquifer patch: the notice with its attribution (aquifer.ts patchNotice) */
  aquifer?: string
  heads: { notes: string; terms: string; questions: string
    /** templates the view fills: {words} {n} {all}, {n}, {ref} {n} (older studies kept in a conversation have none) */
    focus?: string; more?: string; verse?: string; termsN?: string; questionsN?: string }
  /** "TN v91 · ULT v91 — Ruth 4": what it comes from, shown at the top */
  source?: string
  /** a chapter or more: the summary line, and the notes folded per verse */
  summary?: string; long?: boolean
  /** the one thing asked for (notes, terms, text), shown first */
  first?: string
  /** the words the question names (focus.ts), when the sheet or the question says them */
  focus?: string[]
}

/** The pieces of a text between two verse ids, cut at each verse, with each piece's index. */
function verseSlices(book: string, events: [number, string, string][], total: number, from: number, to: number) {
  const out: { v: string; start: number; end: number; ch: number; first: number }[] = []
  let chapter = 0
  let label = ''
  let first = 0
  let last = 0
  let start = 0
  const flush = (end: number) => {
    if (!first) return
    const lo = verseId(book, chapter, first)
    const hi = verseId(book, chapter, last)
    if (lo <= to && hi >= from && end > start) out.push({ v: label, start, end, ch: chapter, first })
  }
  for (const [position, kind, arg] of events) {
    if (kind !== 'chapter' && kind !== 'verse') continue
    flush(position)
    start = position
    const m = /^(\d+)(?:-(\d+))?/.exec(arg)
    if (!m) { first = last = 0; continue }
    if (kind === 'chapter') { chapter = Number(m[1]); first = last = 0 }
    else { first = Number(m[1]); last = m[2] === undefined ? first : Number(m[2]); label = arg }
  }
  flush(total)
  return out
}

/** The study view of a passage sheet (verses or one chapter), or null when the answer is better as plain text. */
export async function studyOf(s: Sheet): Promise<Study | null> {
  if (!s.ref || !['passage', 'advice'].includes(s.intent) || s.phrase) return null
  const ref = parseRef(s.ref)
  if (!ref || (ref.kind !== 'verses' && ref.kind !== 'chapter')) return null
  if (s.what.length === 1 && (s.what[0] === 'questions' || s.what[0] === 'intro')) return null
  const l = await getLang(s.lang)
  if (!l) return null
  const model = await bookOf(l, ref.book)
  if (!model) return null
  const lang = l.lang
  const range = rangeOf(ref)
  const al = await alignedOf(l, ref.book, model)
  const rowsIn = (t: { rows: HelpRow[] } | undefined): HelpRow[] => (t?.rows ?? []).filter((x) => inRange(x, range) && !isIntroRow(x))
  const noteRows = rowsIn(model.notes).filter((x) => clean(x.cols.note))
  const linkRows = rowsIn(model.links).filter((x) => x.concept)
  // which helps quote each position of the original
  const byPos = new Map<number, string[]>()
  const tie = (positions: number[] | undefined, key: string) => {
    for (const p of positions ?? []) {
      const list = byPos.get(p)
      if (!list) byPos.set(p, [key])
      else if (!list.includes(key)) list.push(key)
    }
  }
  noteRows.forEach((n, i) => tie(n.quote, `n${i}`))
  const termIds: string[] = []
  for (const x of linkRows) {
    let i = termIds.indexOf(x.concept!)
    if (i < 0) i = termIds.push(x.concept!) - 1
    tie(x.quote, `t${i}`)
  }
  const ultFirst = (qs: { res: string; text: string }[]) => (qs.find((q) => /\/(ult|glt)$/.test(q.res)) ?? qs[0])?.text ?? ''
  const texts: Study['texts'] = []
  const wanted = s.version ? '/' + (lang.startsWith('es') ? (s.version === 'ult' ? 'glt' : 'gst') : s.version) : ''
  for (const t of model.texts) {
    if (wanted && model.texts.some((x) => x.res.endsWith(wanted)) && !t.res.endsWith(wanted)) continue
    const pieces = t.pieces as unknown as [string, boolean][]
    const slices = verseSlices(ref.book, t.events as any, pieces.length, range[0], range[1])
    if (!slices.length) continue
    // word ordinal of each piece, for its alignment
    const ordinal: number[] = []
    let n = 0
    for (const p of pieces) ordinal.push(p[1] ? n++ : -1)
    const verses = slices.map(({ v, start, end }) => ({
      v,
      p: pieces.slice(start, end).map((p, k): StudyPiece => {
        const text = p[0].replace(/\{/g, ' ').replace(/\}/g, '')
        const o = ordinal[start + k]!
        if (o < 0 || !t.align) return [text]
        const keys = [...new Set((t.align[o] ?? []).flatMap((pos) => byPos.get(pos) ?? []))]
        return keys.length ? [text, keys.join(' ')] : [text]
      }),
    }))
    const sample = verses.map((x) => x.p.map((p) => p[0]).join('')).join(' ')
    if (!sample.trim() || wrongScript(lang, sample)) continue
    texts.push({ label: textName(t), verses, ...(patchOfRow(t as unknown as HelpRow) ? { tag: patchTag(UI ?? lang, patchOfRow(t as unknown as HelpRow)!) } : {}) })
  }
  if (!texts.length) return null
  const titles = new Map<string, string>()
  const title = async (id: string): Promise<string> => {
    if (!titles.has(id)) titles.set(id, await titleOf(l, id))
    return titles.get(id)!
  }
  const terms: StudyTerm[] = []
  for (const id of termIds) {
    const x = linkRows.find((r) => r.concept === id)!
    terms.push({ id, title: await title(id), said: ultFirst(quoteIn(al, x.quote)), orig: String(x.cols.origWords ?? '') })
  }
  const notes: StudyNote[] = []
  for (const n of noteRows) {
    const qs = quoteIn(al, n.quote)
    notes.push({
      said: ultFirst(qs),
      orig: String(n.cols.quote ?? ''),
      note: clean(n.cols.note),
      concept: n.concept,
      ref: n.ref,
      quotes: qs.map((q) => q.text).join(' / '),
      about: (await Promise.all(aboutOf(n, linkRows).map(title))).join(' / '),
      ...(patchOfRow(n) ? { patch: patchTag(UI ?? lang, patchOfRow(n)!) } : {}),
    })
  }
  const questions = rowsIn(model.questions).map((q) => ({ q: String(q.cols.question ?? ''), a: String(q.cols.response ?? ''), ...(patchOfRow(q) ? { patch: patchTag(UI ?? lang, patchOfRow(q)!) } : {}) }))
  const marks = [...noteRows, ...rowsIn(model.questions), ...model.texts.filter((t) => texts.some((x) => x.label === textName(t))) as unknown as HelpRow[]].map(patchOfRow).filter((m): m is PatchMark => !!m)
  const book = bookName(lang, ref.book)
  const lab = refLabel(ref)
  const releases = [...(model.notes ? [model.notes.res] : []), ...model.texts.map((t) => t.res)]
    .filter((res) => res === model.notes?.res ? noteRows.length : texts.some((t) => t.label === textName(model.texts.find((x) => x.res === res) ?? { res })))
    // (notes from an Aquifer patch have a commit as their release, not a version: "Translation Notes (Aquifer)")
    .map((res) => (res === model.notes?.res && patchOfRow(model.notes.rows[0])
      ? `${HELPS[resShort(res)] ?? upper(res)} (Aquifer)`
      : patchOfRow(model.texts.find((x) => x.res === res) as unknown as HelpRow)
        ? textName(model.texts.find((x) => x.res === res)!)
        : `${HELPS[resShort(res)] ?? upper(res)} ${releaseOf(model, res)}`.trim()))
  const long = ref.kind === 'chapter' || (ref.ch2 ?? ref.ch) !== ref.ch || (ref.v2 ?? 0) - (ref.v1 ?? 0) >= 3
  const nVerses = new Set(texts[0]!.verses.map((x) => x.v)).size
  const asked = s.what.filter((w) => w !== 'intro')
  const raw = (key: string, keep: string[]) => say(lang, key, Object.fromEntries(keep.map((k) => [k, `{${k}}`])))
  return {
    lang, book: ref.book, ch: ref.ch ?? 0, v1: ref.v1 ?? 0, v2: ref.v2 ?? 0,
    head: say(lang, 'passage_head', { book, ref: lab, lang }).replace(/\s+\(/, ' (').replace(/\s{2,}/g, ' '),
    texts, notes, terms, questions,
    heads: {
      notes: say(lang, 'notes_head', { book, ref: lab }),
      terms: say(lang, 'terms_head', { book, ref: lab }),
      questions: say(lang, 'questions_head', { book, ref: lab }),
      focus: say(lang, 'focus_head', { book, ref: lab, words: '{words}', n: '{n}', all: '{all}' }),
      more: raw('more_notes', ['n']), verse: raw('verse_fold', ['ref', 'n']), termsN: raw('terms_fold', ['n']), questionsN: raw('questions_fold', ['n']),
    },
    source: `${[...new Set(releases)].join(' · ')} — ${book} ${lab}`.trim(),
    ...(marks.length ? { aquifer: patchNotice(UI ?? lang, marks).split('**').join('') } : {}),
    long, summary: long ? say(lang, 'chapter_summary', { book, ref: lab, v: nVerses, n: notes.length }) : undefined,
    first: asked.length === 1 ? asked[0] : undefined,
    focus: wordsOf(focusWords(QUESTION, [s.term, s.phrase, ...NAMED]), s.term, s.phrase, ...NAMED, QUESTION),
  }
}

/** An article for the panel: its title and its text with the links kept, or null when the pack has no such article. */
export async function articleView(lang: string, id: string): Promise<{ title: string; md: string; lang: string } | null> {
  for (const pl of await packsFor(lang)) {
    const l = await getLang(pl)
    if (!l) continue
    try {
      const a = (await l.r.article(id, 'all')).data
      if (!a) continue
      const md = a.sections
        .filter((x: any) => x.role !== 'word-data')
        .map((x: any) => String(x.md ?? '').trim())
        .filter(Boolean)
        .join('\n\n')
      return { title: a.title ?? (await titleOf(l, id)), md, lang: pl }
    } catch { /* the next pack */ }
  }
  return null
}

/** The title of an article in a language (or its name from the maps), for links shown before it is opened. */
export async function titleFor(lang: string, id: string): Promise<string> {
  let l: Lang | null = null
  for (const pl of await packsFor(lang)) if ((l = await getLang(pl))) break
  return l ? titleOf(l, id) : id.split('/').pop()!
}

/** One note or question in full, for the panel: what a free search found cut short. */
export async function helpView(lang: string, book: string, id: string, which: 'note' | 'question'): Promise<{ title: string; md: string; ref: string } | null> {
  const l = await getLang(lang)
  if (!l) return null
  const model = await bookOf(l, book)
  const row = (which === 'note' ? model?.notes : model?.questions)?.rows.find((x) => x.id === id)
  if (!model || !row) return null
  const title = `${bookName(l.lang, book)} ${row.ref}`
  // an item from an Aquifer patch says so, with the notice and the attribution
  const pm = patchOfRow(row)
  const aq = pm ? `

*(${patchTag(UI ?? l.lang, pm)})*

${patchNotice(UI ?? l.lang, [pm])}` : ''
  if (which === 'question') return { title, ref: row.ref, md: `**${String(row.cols.question ?? '')}**

${String(row.cols.response ?? '')}${aq}` }
  const al = await alignedOf(l, book, model)
  const qs = quoteIn(al, row.quote)
  const said = (qs.find((q) => /\/(ult|glt)$/.test(q.res)) ?? qs[0])?.text ?? ''
  const orig = String(row.cols.quote ?? '')
  const head = [said ? `«${said}»` : '', orig && orig !== said ? `(${orig})` : ''].filter(Boolean).join(' ')
  const note = clean(row.cols.note, true) // the panel has room for the note's own headings
  const academy = row.concept && !note.includes(row.concept) ? `

[[${row.concept}]]` : ''
  return { title, ref: row.ref, md: (head ? `**${head}**

` : '') + note + academy + aq }
}

// ------------------------------------------------------------------------------------------------- context for online AI

/**
 * What the online model needs to say what is happening in a passage before it says how to translate it: the verses around
 * it in the simple text (UST/GST), the chapter's introduction and the start of the book's introduction (what the book is
 * about, its outline). Each part is cut to a size, so the whole stays compact. Empty for anything but a verse range.
 */
export async function passageContext(s: Sheet): Promise<string> {
  if (!s.ref || !['passage', 'advice'].includes(s.intent)) return ''
  // a story of Open Bible Stories: its plain text (the branch is on a story)
  if (isObsRef(s.ref)) return storyText(s.ref, s.lang).catch(() => '')
  const ref = parseRef(s.ref)
  if (!ref || ref.kind !== 'verses') return ''
  const l = await getLang(s.lang)
  const model = l ? await bookOf(l, ref.book) : undefined
  if (!l || !model) return ''
  const book = bookName(l.lang, ref.book)
  const parts: string[] = []
  // the verses around, numbered, from the simple text (or the first text)
  const simple = model.texts.find((t) => /\/(ust|gst)$/.test(t.res)) ?? model.texts[0]
  if (simple) {
    const first = Math.max(1, (ref.v1 ?? 1) - 3)
    const lastCh = ref.ch2 ?? ref.ch!
    const from = verseId(ref.book, ref.ch!, first)
    const to = verseId(ref.book, lastCh, (ref.v2 ?? ref.v1 ?? 1) + 3)
    const pieces = simple.pieces as unknown as [string, boolean][]
    const verses = verseSlices(ref.book, simple.events as any, pieces.length, from, to)
      .map(({ v, start, end }) => `${v} ${pieces.slice(start, end).map((p) => p[0]).join('').replace(/\{/g, ' ').replace(/\}/g, '').replace(/\s+/g, ' ').trim()}`)
      .join(' ')
    if (verses && !wrongScript(l.lang, verses)) parts.push(`## Surrounding verses, ${book} ${ref.ch} (${resShort(simple.res).toUpperCase()})\n${clip(verses, 1400)}`)
  }
  const intros = (model.notes?.rows ?? []).filter(isIntroRow)
  const bookIntro = intros[0]
  const chapIntro = intros.find((x) => x !== bookIntro && x.from === verseId(ref.book, ref.ch!, 1))
  if (chapIntro) parts.push(`## Introduction to ${book} ${ref.ch} (translation notes)\n${clip(clean(chapIntro.cols.note), 1300)}`)
  if (bookIntro) parts.push(`## Introduction to ${book} (translation notes, beginning)\n${clip(clean(bookIntro.cols.note), 1600)}`)
  // the surrounding verses are a patch's unaligned text: its source, license and that it is not Door43's go with it
  const tm = patchOfRow(simple as unknown as HelpRow)
  if (tm && parts.some((x) => x.startsWith('## Surrounding verses'))) parts.unshift(patchTextForAI(tm))
  // the book's notes come from an Aquifer patch (the reader keeps a table whole): the model says so when it uses them
  const pm = patchOfRow(model.notes?.rows[0])
  if (pm) parts.push(patchForAI(pm))
  return parts.join('\n\n')
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Place, distance and travel-time sentences (diseno-mapas.md 5.3 and 5.8). Pure functions: they take what language-pack-client gives (`PlaceRef`,
// `Trip`) and the UI language, and return the text. Every sentence is whole per language (hi and ar agree in gender and number, so no sentence is
// built word by word); only the eight directions are fragments, and each fragment is a whole phrase with its own preposition.
// `trip` is always `trip(a, b)` of the client, with `a` the first place named in the call (direction from a to b): "a is north of b" reads the
// opposite direction. So `trip(place, ref)` for `whereLine` and `refDaysLine`, and `trip(a, b)` for `distanceLine`; `daysLine` takes any trip.
// ---------------------------------------------------------------------------------------------------------------------------------------------
type GeoLang = 'en' | 'es' | 'fr' | 'id' | 'hi' | 'ar'
type GeoText = {
  /** the eight directions, clockwise from north: where something stands in relation to {ref} */
  dir: string[]
  /** "according to the proposed location" (certainty 2), with the separator that joins it to the sentence */
  pre: string
  where: string; near: string; onMap: string; uncertain: string; uncertainRef: string
  region: string; water: string; waterRef: string; unknown: string
  straight: string; nearDist: string; regionDist: string; waterDist: string; uncertainDist: string
  /** "on foot, by donkey or by camel", "on horseback", and the ship with its season */
  foot: string; horse: string; ship: string
  less: string; over: string; lessAll: string
  sep: string; end: string; approx: string; refDays: string
  born: string; bornF: string; bornNone: string; bornNoneF?: string; died: string; diedF: string; diedNone: string; diedNoneF?: string
}
const geoText: Record<GeoLang, GeoText> = {
  en: {
    dir: ['north of {ref}', 'northeast of {ref}', 'east of {ref}', 'southeast of {ref}', 'south of {ref}', 'southwest of {ref}', 'west of {ref}', 'northwest of {ref}'],
    pre: 'According to the proposed location, ',
    where: '{pre}{name} was about {n} km {loc}.', near: '{pre}{name} was next to {ref}.', onMap: '{name} is shown on the map.',
    uncertain: 'It is not known for certain where {name} was; several sites have been proposed.',
    uncertainRef: 'It is not known for certain where {name} was; several sites near {ref} have been proposed.',
    region: '{name} is a region; it has no exact point on the map.', water: '{name} is a body of water.', waterRef: '{name}, near {ref}.',
    unknown: 'It is not known where {name} was.',
    straight: '{pre}about {n} km in a straight line; {a} is {loc}.', nearDist: '{pre}{a} was next to {b} (less than 3 km).',
    regionDist: '{name} is a region; it has no point to measure from.', waterDist: '{name} is a river or other water; it has no point to measure from.',
    uncertainDist: 'It is not known for certain where {name} was, so no distance is given.',
    foot: 'on foot, by donkey or by camel', horse: 'on horseback', ship: 'by ship, in the sailing season (spring to autumn)',
    less: 'less than a day', over: 'more than two months', lessAll: 'less than a day {foot}',
    sep: '; ', end: '.', approx: '(approx.)', refDays: '{pre}from {ref} to {name}, {foot}: {r} (approx.).',
    born: 'According to Theographic, {name} was born in {place}.', bornF: 'According to Theographic, {name} was born in {place}.',
    bornNone: 'The data I have do not say where {name} was born.',
    died: 'According to Theographic, {name} died in {place}.', diedF: 'According to Theographic, {name} died in {place}.',
    diedNone: 'The data I have do not say where {name} died.',
  },
  es: {
    dir: ['al norte de {ref}', 'al noreste de {ref}', 'al este de {ref}', 'al sureste de {ref}', 'al sur de {ref}', 'al suroeste de {ref}', 'al oeste de {ref}', 'al noroeste de {ref}'],
    pre: 'Según la ubicación propuesta, ',
    where: '{pre}{name} estaba a unos {n} km {loc}.', near: '{pre}{name} estaba junto a {ref}.', onMap: '{name} aparece en el mapa.',
    uncertain: 'No se sabe con certeza dónde estaba {name}; se han propuesto varios sitios.',
    uncertainRef: 'No se sabe con certeza dónde estaba {name}; se han propuesto varios sitios cerca de {ref}.',
    region: '{name} es una región; no tiene un punto exacto en el mapa.', water: '{name} es una masa de agua.', waterRef: '{name}, cerca de {ref}.',
    unknown: 'No se sabe dónde estaba {name}.',
    straight: '{pre}unos {n} km en línea recta; {a} está {loc}.', nearDist: '{pre}{a} estaba junto a {b} (a menos de 3 km).',
    regionDist: '{name} es una región; no tiene un punto para medir.', waterDist: '{name} es un río u otra agua; no tiene un punto para medir.',
    uncertainDist: 'No se sabe con certeza dónde estaba {name}, así que no se da una distancia.',
    foot: 'a pie, en burro o en camello', horse: 'a caballo', ship: 'en barco, en la temporada de navegación (primavera a otoño)',
    less: 'menos de un día', over: 'más de dos meses', lessAll: 'menos de un día {foot}',
    sep: '; ', end: '.', approx: '(aprox.)', refDays: '{pre}de {ref} a {name}, {foot}: {r} (aprox.).',
    born: 'Según Theographic, {name} nació en {place}.', bornF: 'Según Theographic, {name} nació en {place}.',
    bornNone: 'Los datos que tengo no dicen dónde nació {name}.',
    died: 'Según Theographic, {name} murió en {place}.', diedF: 'Según Theographic, {name} murió en {place}.',
    diedNone: 'Los datos que tengo no dicen dónde murió {name}.',
  },
  fr: {
    dir: ['au nord de {ref}', 'au nord-est de {ref}', "à l'est de {ref}", 'au sud-est de {ref}', 'au sud de {ref}', 'au sud-ouest de {ref}', "à l'ouest de {ref}", 'au nord-ouest de {ref}'],
    pre: "Selon l'emplacement proposé, ",
    where: '{pre}{name} se trouvait à environ {n} km {loc}.', near: '{pre}{name} se trouvait tout près de {ref}.', onMap: '{name} figure sur la carte.',
    uncertain: "On ne sait pas avec certitude où se trouvait {name} ; plusieurs sites ont été proposés.",
    uncertainRef: "On ne sait pas avec certitude où se trouvait {name} ; plusieurs sites près de {ref} ont été proposés.",
    region: "{name} est une région ; elle n'a pas de point précis sur la carte.", water: '{name} est une étendue d’eau.', waterRef: '{name}, près de {ref}.',
    unknown: 'On ne sait pas où se trouvait {name}.',
    straight: '{pre}environ {n} km à vol d’oiseau ; {a} est {loc}.', nearDist: '{pre}{a} se trouvait tout près de {b} (à moins de 3 km).',
    regionDist: "{name} est une région ; elle n'a pas de point à mesurer.", waterDist: "{name} est un fleuve ou une autre étendue d’eau ; il n'a pas de point à mesurer.",
    uncertainDist: "On ne sait pas avec certitude où se trouvait {name} ; aucune distance n'est donnée.",
    foot: "à pied, à dos d'âne ou de chameau", horse: 'à cheval', ship: 'en bateau, pendant la saison de navigation (du printemps à l’automne)',
    less: "moins d'un jour", over: 'plus de deux mois', lessAll: "moins d'un jour {foot}",
    sep: ' ; ', end: '.', approx: '(approx.)', refDays: '{pre}de {ref} à {name}, {foot} : {r} (approx.).',
    born: 'Selon Theographic, {name} est né à {place}.', bornF: 'Selon Theographic, {name} est née à {place}.',
    bornNone: 'Les données que j’ai ne disent pas où {name} est né.', bornNoneF: 'Les données que j’ai ne disent pas où {name} est née.',
    died: 'Selon Theographic, {name} est mort à {place}.', diedF: 'Selon Theographic, {name} est morte à {place}.',
    diedNone: 'Les données que j’ai ne disent pas où {name} est mort.', diedNoneF: 'Les données que j’ai ne disent pas où {name} est morte.',
  },
  id: {
    dir: ['di sebelah utara {ref}', 'di sebelah timur laut {ref}', 'di sebelah timur {ref}', 'di sebelah tenggara {ref}', 'di sebelah selatan {ref}', 'di sebelah barat daya {ref}', 'di sebelah barat {ref}', 'di sebelah barat laut {ref}'],
    pre: 'Menurut lokasi yang diusulkan, ',
    where: '{pre}{name} berada sekitar {n} km {loc}.', near: '{pre}{name} berada tepat di dekat {ref}.', onMap: '{name} ditunjukkan di peta.',
    uncertain: 'Tidak diketahui dengan pasti di mana {name} berada; beberapa tempat telah diusulkan.',
    uncertainRef: 'Tidak diketahui dengan pasti di mana {name} berada; beberapa tempat dekat {ref} telah diusulkan.',
    region: '{name} adalah sebuah wilayah; tidak ada titik pastinya di peta.', water: '{name} adalah badan air.', waterRef: '{name}, dekat {ref}.',
    unknown: 'Tidak diketahui di mana {name} berada.',
    straight: '{pre}sekitar {n} km dalam garis lurus; {a} berada {loc}.', nearDist: '{pre}{a} berada tepat di dekat {b} (kurang dari 3 km).',
    regionDist: '{name} adalah sebuah wilayah; tidak ada titik untuk diukur.', waterDist: '{name} adalah sungai atau perairan lain; tidak ada titik untuk diukur.',
    uncertainDist: 'Tidak diketahui dengan pasti di mana {name} berada, jadi jaraknya tidak diberikan.',
    foot: 'berjalan kaki, dengan keledai atau unta', horse: 'berkuda', ship: 'dengan kapal, pada musim berlayar (musim semi sampai musim gugur)',
    less: 'kurang dari sehari', over: 'lebih dari dua bulan', lessAll: 'kurang dari sehari {foot}',
    sep: '; ', end: '.', approx: '(perkiraan)', refDays: '{pre}dari {ref} ke {name}, {foot}: {r} (perkiraan).',
    born: 'Menurut Theographic, {name} lahir di {place}.', bornF: 'Menurut Theographic, {name} lahir di {place}.',
    bornNone: 'Data yang saya miliki tidak menyebutkan di mana {name} lahir.',
    died: 'Menurut Theographic, {name} meninggal di {place}.', diedF: 'Menurut Theographic, {name} meninggal di {place}.',
    diedNone: 'Data yang saya miliki tidak menyebutkan di mana {name} meninggal.',
  },
  // hi, ar: pending native review
  hi: {
    dir: ['{ref} के उत्तर में', '{ref} के उत्तर-पूर्व में', '{ref} के पूर्व में', '{ref} के दक्षिण-पूर्व में', '{ref} के दक्षिण में', '{ref} के दक्षिण-पश्चिम में', '{ref} के पश्चिम में', '{ref} के उत्तर-पश्चिम में'],
    pre: 'प्रस्तावित स्थान के अनुसार, ',
    where: '{pre}{name} {loc} लगभग {n} किमी दूर है।', near: '{pre}{name} {ref} के बिलकुल पास है।', onMap: '{name} नक्शे पर दिखाया गया है।',
    uncertain: 'निश्चित रूप से नहीं पता कि {name} कहाँ था; कई जगहें सुझाई गई हैं।',
    uncertainRef: 'निश्चित रूप से नहीं पता कि {name} कहाँ था; {ref} के पास कई जगहें सुझाई गई हैं।',
    region: '{name} एक क्षेत्र है; नक्शे पर इसका कोई ठीक बिंदु नहीं है।', water: '{name} एक जलराशि है।', waterRef: '{name}, {ref} के पास।',
    unknown: 'यह नहीं पता कि {name} कहाँ था।',
    straight: '{pre}सीधी रेखा में लगभग {n} किमी; {a} {loc} है।', nearDist: '{pre}{a} {b} के बिलकुल पास है (3 किमी से कम)।',
    regionDist: '{name} एक क्षेत्र है; इसमें नापने के लिए कोई बिंदु नहीं है।', waterDist: '{name} एक नदी या जलराशि है; इसमें नापने के लिए कोई बिंदु नहीं है।',
    uncertainDist: 'निश्चित रूप से नहीं पता कि {name} कहाँ था, इसलिए दूरी नहीं दी गई।',
    foot: 'पैदल, गधे या ऊँट से', horse: 'घोड़े से', ship: 'जहाज़ से, नौकायन के मौसम में (वसंत से पतझड़ तक)',
    less: 'एक दिन से कम', over: 'दो महीने से अधिक', lessAll: '{foot} एक दिन से कम',
    sep: '; ', end: '।', approx: '(लगभग)', refDays: '{pre}{ref} से {name} तक, {foot}: {r} (लगभग)।',
    born: 'Theographic के अनुसार, {name} का जन्म {place} में हुआ।', bornF: 'Theographic के अनुसार, {name} का जन्म {place} में हुआ।',
    bornNone: 'मेरे पास मौजूद आँकड़े नहीं बताते कि {name} का जन्म कहाँ हुआ।',
    died: 'Theographic के अनुसार, {name} की मृत्यु {place} में हुई।', diedF: 'Theographic के अनुसार, {name} की मृत्यु {place} में हुई।',
    diedNone: 'मेरे पास मौजूद आँकड़े नहीं बताते कि {name} की मृत्यु कहाँ हुई।',
  },
  ar: {
    dir: ['شمال {ref}', 'شمال شرق {ref}', 'شرق {ref}', 'جنوب شرق {ref}', 'جنوب {ref}', 'جنوب غرب {ref}', 'غرب {ref}', 'شمال غرب {ref}'],
    pre: 'بحسب الموقع المقترح، ',
    where: '{pre}موقع {name}: على بعد نحو {n} كم {loc}.', near: '{pre}{name} قريب جدًا من {ref}.', onMap: '{name} مبيّن على الخريطة.',
    uncertain: 'لا يُعرف بيقين أين كان موقع {name}؛ اقتُرحت عدة مواقع.',
    uncertainRef: 'لا يُعرف بيقين أين كان موقع {name}؛ اقتُرحت عدة مواقع قرب {ref}.',
    region: '{name} منطقة؛ ليس لها نقطة محددة على الخريطة.', water: '{name} مسطح مائي.', waterRef: '{name}، قرب {ref}.',
    unknown: 'لا يُعرف أين كان موقع {name}.',
    straight: '{pre}نحو {n} كم في خط مستقيم؛ {a} {loc}.', nearDist: '{pre}{a} قريب جدًا من {b} (أقل من 3 كم).',
    regionDist: '{name} منطقة؛ ليس لها نقطة للقياس.', waterDist: '{name} نهر أو مسطح مائي؛ ليس له نقطة للقياس.',
    uncertainDist: 'لا يُعرف بيقين أين كان موقع {name}، فلا تُعطى مسافة.',
    foot: 'سيرًا على الأقدام أو على حمار أو جمل', horse: 'على الحصان', ship: 'بالسفينة، في موسم الإبحار (من الربيع إلى الخريف)',
    less: 'أقل من يوم', over: 'أكثر من شهرين', lessAll: 'أقل من يوم {foot}',
    sep: '؛ ', end: '.', approx: '(تقريبًا)', refDays: '{pre}من {ref} إلى {name}، {foot}: {r} (تقريبًا).',
    born: 'بحسب Theographic، وُلد {name} في {place}.', bornF: 'بحسب Theographic، وُلدت {name} في {place}.',
    bornNone: 'البيانات التي لديّ لا تذكر أين وُلد {name}.', bornNoneF: 'البيانات التي لديّ لا تذكر أين وُلدت {name}.',
    died: 'بحسب Theographic، مات {name} في {place}.', diedF: 'بحسب Theographic، ماتت {name} في {place}.',
    diedNone: 'البيانات التي لديّ لا تذكر أين مات {name}.', diedNoneF: 'البيانات التي لديّ لا تذكر أين ماتت {name}.',
  },
}
const geoLang = (ui: string): GeoLang => {
  const l = (ui || '').slice(0, 2).toLowerCase()
  return (l in geoText ? l : 'en') as GeoLang
}
const geoFill = (tpl: string, v: Record<string, string>): string => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k]! : m))
const geoUp = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
/** "N km" rounded as shown: under 10 km to the km, up to 100 to 5 km, more to 10 km. */
function geoKm(km: number): number {
  if (km < 10) return Math.max(1, Math.round(km))
  if (km <= 100) return Math.round(km / 5) * 5
  return Math.round(km / 10) * 10
}
const GEO_DIR: Record<Trip['direction'], number> = { N: 0, NE: 1, E: 2, SE: 3, S: 4, SW: 5, W: 6, NW: 7 }
/** The phrase "north of Y" for where `a` stands in relation to `b`: the opposite of the bearing a to b. */
const geoLoc = (t: GeoText, d: Trip['direction'], ref: string): string => geoFill(t.dir[(GEO_DIR[d] + 4) % 8]!, { ref })
const geoPre = (t: GeoText, sure: number): string => (sure === 2 ? t.pre : '')

/** "It is not known where X was": a place with no point (certainty 0). */
export function unknownPlaceLine(ui: string, place: PlaceRef): string {
  return geoFill(geoText[geoLang(ui)].unknown, { name: place.name })
}

/**
 * Where `place` is, in relation to `ref` (the nearest reference place): "Bethel was about 15 km north of Jerusalem." `trip` is `trip(place, ref)` of the
 * client (undefined when either has no point or has nothing to measure). Region, water and uncertain places get their own sentences, without km.
 */
export function whereLine(ui: string, place: PlaceRef, ref: PlaceRef | null, trip: Trip | undefined): string {
  const t = geoText[geoLang(ui)]
  const v = { name: place.name, ref: ref?.name ?? '' }
  if (place.sure === 0) return unknownPlaceLine(ui, place)
  if (place.form === 2) return geoFill(t.region, v)
  if (place.form === 3) return geoFill(ref ? t.waterRef : t.water, v)
  if (place.sure === 1) return geoFill(ref ? t.uncertainRef : t.uncertain, v)
  if (!ref || !trip) return geoFill(t.onMap, v)
  const pre = geoPre(t, trip.sure)
  if (trip.near) return geoFill(t.near, { ...v, pre })
  return geoFill(t.where, { ...v, pre, n: String(geoKm(trip.km)), loc: geoLoc(t, trip.direction, ref.name) })
}

/**
 * The distance between two places in a straight line: "About 9 km in a straight line; Bethlehem is south of Jerusalem." `trip` is `trip(a, b)`. A region
 * or a water has no point to measure; an uncertain or unlocated place gives no number.
 */
export function distanceLine(ui: string, a: PlaceRef, b: PlaceRef, trip: Trip | undefined): string {
  const t = geoText[geoLang(ui)]
  const nopoint = [a, b].find((p) => p.sure === 0)
  if (nopoint) return unknownPlaceLine(ui, nopoint)
  const shape = [a, b].find((p) => p.form === 2 || p.form === 3)
  if (shape) return geoFill(shape.form === 2 ? t.regionDist : t.waterDist, { name: shape.name })
  const doubt = [a, b].find((p) => p.sure === 1)
  if (doubt) return geoFill(t.uncertainDist, { name: doubt.name })
  if (!trip) return ''
  const pre = geoPre(t, trip.sure)
  if (trip.near) return geoFill(t.nearDist, { pre, a: a.name, b: b.name })
  return geoUp(geoFill(t.straight, { pre, a: a.name, n: String(geoKm(trip.km)), loc: geoLoc(t, trip.direction, b.name) }))
}

/** Whole days as a range (approx.): "about 8 to 11 days", "about 3 days", "less than a day", "more than two months". */
function geoRange(l: GeoLang, t: GeoText, d: { low: number; high: number }): string {
  if (d.low >= 60) return t.over
  if (d.low === 0 && d.high <= 1) return t.less
  const same = d.low === d.high
  const [a, b] = [String(d.low), String(d.high)]
  switch (l) {
    case 'en': return same ? `about ${a} ${d.low === 1 ? 'day' : 'days'}` : `about ${a} to ${b} days`
    case 'es': return same ? (d.low === 1 ? 'un día' : `unos ${a} días`) : `unos ${a} a ${b} días`
    case 'fr': return same ? `environ ${a} ${d.low === 1 ? 'jour' : 'jours'}` : `environ ${a} à ${b} jours`
    case 'id': return same ? `sekitar ${a} hari` : `sekitar ${a} sampai ${b} hari`
    case 'hi': return same ? `लगभग ${a} दिन` : `लगभग ${a} से ${b} दिन`
    case 'ar': {
      // number agreement: 1 and 2 are words, 3 to 10 take the plural, 11 or more the accusative singular
      const unit = (n: number) => (n === 1 ? 'يوم واحد' : n === 2 ? 'يومين' : n <= 10 ? `${n} أيام` : `${n} يومًا`)
      return same ? `نحو ${unit(d.low)}` : `نحو ${a} إلى ${unit(d.high)}`
    }
  }
}

/**
 * How long the trip takes, from the client's `Trip` (the rules of 5.8 are there: no `days` with certainty below 2, nearer than 3 km, or without a
 * point): "On foot, by donkey or by camel: about 8 to 11 days; on horseback: about 4 to 6 days (approx.)." Empty string without `trip.days`.
 */
export function daysLine(ui: string, trip: Trip | undefined): string {
  if (!trip?.days) return ''
  const l = geoLang(ui)
  const t = geoText[l]
  const { foot, horse, ship } = trip.days
  const lessFoot = foot.low === 0 && foot.high <= 1
  const lessHorse = horse.low === 0 && horse.high <= 1
  const colon = l === 'fr' ? ' : ' : ': '
  const parts: string[] = []
  if (lessFoot && lessHorse) parts.push(geoFill(t.lessAll, { foot: t.foot }))
  else {
    parts.push(`${t.foot}${colon}${geoRange(l, t, foot)}`)
    parts.push(`${t.horse}${colon}${geoRange(l, t, horse)}`)
  }
  if (ship) parts.push(`${t.ship}${colon}${geoRange(l, t, ship)}`)
  const pre = geoPre(t, trip.sure)
  const body = parts.join(t.sep)
  return (pre ? pre + body : geoUp(body)) + ` ${t.approx}${t.end}`
}

/** For the place card: the days on foot from its reference place, as `refDaysLine(ui, place, ref, trip(place, ref))`. Empty string without days. */
export function refDaysLine(ui: string, place: PlaceRef, ref: PlaceRef, trip: Trip | undefined): string {
  if (!trip?.days) return ''
  const l = geoLang(ui)
  const t = geoText[l]
  const pre = geoPre(t, trip.sure)
  const s = geoFill(t.refDays, { pre, ref: ref.name, name: place.name, foot: t.foot, r: geoRange(l, t, trip.days.foot) })
  return pre ? s : geoUp(s)
}

/** "According to Theographic, Paul was born in Tarsus." `place` null: "The data I have do not say where X was born." `female` picks fr and ar agreement. */
export function bornLine(ui: string, person: string, place: PlaceRef | null, female = false): string {
  const t = geoText[geoLang(ui)]
  return place ? geoFill(female ? t.bornF : t.born, { name: person, place: place.name }) : geoFill((female && t.bornNoneF) || t.bornNone, { name: person })
}

export function diedLine(ui: string, person: string, place: PlaceRef | null, female = false): string {
  const t = geoText[geoLang(ui)]
  return place ? geoFill(female ? t.diedF : t.died, { name: person, place: place.name }) : geoFill((female && t.diedNoneF) || t.diedNone, { name: person })
}
