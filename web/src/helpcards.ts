// The helps under an online answer: which of what the phone found shows as cards in sight (a title and its first line, a tap
// opens it), and how the rest is labelled behind its fold ("See all 66 notes and the text in 3 versions"). Without online AI the
// phone's answer is drawn as always (main.ts, view.ts); with it, these cards keep the helps in view under the AI's text, so the
// translator does not miss them. No DOM here: tested under bun.
import type { Study } from './answer'
import { focusOrder, focusWords } from './focus'

/** An article the online answer is (or will be) grounded in: `ai.sources`, else the reply's sources or its article. */
export type CardSource = { id: string; title?: string; label?: string }
/** A free search's row (view.ts HelpItem, the fields used here). */
type Help = { kind: 'note' | 'question'; snippet: string; ref: string }

export type CardInput = {
  study?: Study | null; info?: string; intro?: string | null; ctx?: string; lang?: string
  helps?: { head: string; items: Help[] }[]
  /** the articles given to online AI, in its order (cited first) */
  sources?: CardSource[]
  /** the ids the online answer cites (its `sources`): marked on their cards */
  cited?: string[]
  /** what the person asked: the notes about its words come first (focus.ts), as in the passage view */
  question?: string
}

export type Card =
  /** a Translation Words or Translation Academy article: opens in the panel */
  | { kind: 'article'; id: string; title: string; line: string; cited: boolean }
  /** the passage's first text (ULT before UST before the others): opens the passage below */
  | { kind: 'text'; label: string; title: string; line: string }
  /** a translation note of the passage, by its index in the study: opens in the panel */
  | { kind: 'note'; i: number; title: string; line: string; ref: string; focus: boolean }
  /** a free search's note or question (group, item): opens in the panel */
  | { kind: 'help'; g: number; i: number; title: string; line: string; head: string }
  /** the phone's answer itself, when it is none of the above: opens it below */
  | { kind: 'answer'; title: string; line: string }

/** How much more the fold holds, for its label. */
export type More = { notes?: number; texts?: number; terms?: number; questions?: number }

/** At most this many cards: what fits a phone's screen under the answer. */
export const MAX_CARDS = 5
const MAX_ARTICLES = 2
const MAX_NOTES = 3
/** a passage asked with no word: its first notes, as a taste of the rest */
const PLAIN_NOTES = 2
const MAX_HELPS = 3

/** A help's first sentence, as plain text: no headings, links or emphasis. */
export function firstLine(src: string, n = 140): string {
  // not its headings, its source line ("*Translation Words v37*") or its fold buttons
  const lines = (src ?? '').split('\n').map((l) => l.trim())
    .filter((l) => l && !/^#{1,6}\s/.test(l) && !/^(▸|◂|---)/.test(l) && !/^([*_])[^*_].*\1$/.test(l))
  const x = (lines.join(' '))
    .replace(/\[\[[^\]]+\]\]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_#>`]/g, '').replace(/^[-•]\s+/, '').replace(/\s+/g, ' ').trim()
  const m = /^.{20,}?[.!?。।؟](?=\s|$)/.exec(x)
  const s = m ? m[0] : x
  return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + ' …' : s
}
/** A Markdown answer's first heading, as plain text. */
const headingOf = (src: string): string => (/^#{1,6}\s+(.+)$/m.exec(src ?? '')?.[1] ?? '').replace(/[*_`]/g, '').trim()
/** "tw:kt/redeem" → "redeem" (until the title is read). */
const idTitle = (id: string): string => id.split('/').pop()!.replace(/[-_]/g, ' ')

const ORDER = (label: string) => (/^(ULT|GLT)$/.test(label) ? 0 : /^(UST|GST)$/.test(label) ? 1 : 2)

/** The passage's notes in the order its view shows them for this question (view.ts renderStudy): about the question first. */
export function studyOrder(s: Study, question?: string): { first: number[]; rest: number[] } {
  const stems = s.focus?.length ? focusWords(null, s.focus) : focusWords(question)
  return focusOrder(s.notes.map((n) => ({ quote: n.quotes ?? n.said, titles: n.about ?? '' })), stems)
}

/**
 * The cards to show under an online answer, best first, and what the fold holds besides them. The rule: the articles the answer
 * is grounded in (cited first, at most 2); the passage's first text with its version; the notes about the asked word or phrase
 * (at most 3; with no word asked, the first 2); the key terms the question names; for a free search, its first rows; and when
 * none of these exist, the phone's answer itself. Never empty when the phone found something.
 */
export function chooseCards(x: CardInput): { cards: Card[]; more: More } {
  const cards: Card[] = []
  const more: More = {}
  const cited = new Set(x.cited ?? [])
  const s = x.study ?? null
  const titled = new Map<string, string>()
  for (const t of s?.terms ?? []) titled.set(t.id, t.title)
  // the article the phone answered with: its `ctx`, or (a word's meaning) the first source of its kind when the answer is that
  // article ("## redeem…" then "*Translation Words v37*")
  const kindOf = /^[*_][^\n]*Translation (Words|Academy)/m.exec((x.info ?? '').split('\n').slice(0, 3).join('\n'))?.[1]
  const own = x.ctx ?? (s || x.helps?.length || !kindOf ? undefined : x.sources?.find((a) => a.id.startsWith(kindOf === 'Words' ? 'tw:' : 'ta:'))?.id)
  const ownHead = own && x.info ? headingOf(x.info) : ''
  if (own && ownHead) titled.set(own, ownHead)
  type Article = Extract<Card, { kind: 'article' }>
  const article = (id: string, title?: string): Article => ({
    // the phone's own heading (in the helps' language) before the title the source was given
    kind: 'article', id, title: (titled.get(id) || title || idTitle(id)).replace(/\s+/g, ' ').trim(),
    // the article the phone answered with: its own words; another one is read when drawn (view.ts)
    line: id === own && x.info ? firstLine(x.info) : '', cited: cited.has(id),
  })
  // 1. the articles the answer is grounded in, cited ones first, in the order they were given
  const given = [...(x.sources ?? []), ...(x.ctx ? [{ id: x.ctx }] : [])].filter((a) => /^(ta|tw):/.test(a.id))
  const seen = new Set<string>()
  const arts = given.filter((a) => !seen.has(a.id) && seen.add(a.id))
  arts.sort((a, b) => Number(cited.has(b.id)) - Number(cited.has(a.id)))
  for (const a of arts.slice(0, MAX_ARTICLES)) cards.push(article(a.id, a.title))
  const shown = (id: string) => cards.some((c) => c.kind === 'article' && c.id === id)

  if (s) {
    // 2. the passage's first text, with its version
    const texts = [...s.texts].sort((a, b) => ORDER(a.label) - ORDER(b.label))
    const t = texts[0]
    if (t) {
      const line = t.verses.map((v) => v.p.map(([w]) => w).join('')).join(' ').replace(/\s+/g, ' ').trim()
      if (line) cards.push({ kind: 'text', label: t.label, title: s.head, line: line.length > 240 ? line.slice(0, 240).replace(/\s+\S*$/, '') + ' …' : line })
    }
    if (s.texts.length > 1) more.texts = s.texts.length
    // 3. the notes about the asked word or phrase; with none asked, the first ones
    const order = studyOrder(s, x.question)
    const notes = order.first.length ? order.first.slice(0, MAX_NOTES) : order.rest.slice(0, PLAIN_NOTES)
    for (const i of notes) {
      const n = s.notes[i]!
      cards.push({ kind: 'note', i, title: n.said ? `«${n.said}»` : n.ref, line: firstLine(n.note), ref: n.ref, focus: order.first.includes(i) })
    }
    if (s.notes.length > notes.length) more.notes = s.notes.length
    // 4. the key terms the question names (an article already shown is not shown twice)
    const stems = s.focus?.length ? focusWords(null, s.focus) : focusWords(x.question)
    const tOrder = focusOrder(s.terms.map((t) => ({ quote: t.said, titles: t.title })), stems)
    const terms = tOrder.first.map((i) => s.terms[i]!).filter((t) => !shown(t.id)).slice(0, MAX_ARTICLES)
    for (const t of terms) cards.push(article(t.id, t.title))
    if (s.terms.length > terms.length) more.terms = s.terms.length
    if (s.questions.length) more.questions = s.questions.length
  }
  // 5. a free search: its first rows (notes and questions), the others behind the fold
  let rows = 0
  let notesAll = 0
  let questionsAll = 0
  ;(x.helps ?? []).forEach((g, gi) =>
    g.items.forEach((h, ii) => {
      if (h.kind === 'question') questionsAll++
      else notesAll++
      if (rows >= MAX_HELPS) return
      rows++
      cards.push({ kind: 'help', g: gi, i: ii, title: h.ref, line: firstLine(h.snippet), head: g.head })
    }))
  if (rows && notesAll + questionsAll > rows) {
    if (notesAll) more.notes = (more.notes ?? 0) + notesAll
    if (questionsAll) more.questions = (more.questions ?? 0) + questionsAll
  }
  // 6. nothing above (an older answer kept as text, a passage without its view): the phone's answer itself
  if (!cards.some((c) => c.kind !== 'article' || c.id === own) && (x.info || x.intro)) {
    const title = headingOf(x.info ?? '') || firstLine(x.intro ?? '', 80)
    const line = firstLine(x.info ?? '') || firstLine(x.intro ?? '')
    if (title || line) cards.push({ kind: 'answer', title: title || line, line: title ? line : '' })
  }
  return { cards: cards.slice(0, MAX_CARDS), more }
}

/** Shows cards (online answer, or one being written) or the phone's answer as always (offline). */
export const showsCards = (m: { ai?: unknown }, pending = false): boolean => !!m.ai || pending

// ------------------------------------------------------------------------------------------------------------------ labels

type Forms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }
type Labels = {
  head: string; see: string; all: string; and: string; sep?: string; cited: string
  text: string; note: string; tw: string; ta: string
  notes: Forms; texts: Forms; terms: Forms; questions: Forms
}
export const CARDS_T: Record<string, Labels> = {
  en: {
    head: 'Helps for this answer', see: 'See {list}', all: 'See everything the phone found', and: ' and ', cited: 'Source of the answer',
    text: 'Bible text', note: 'Translation note', tw: 'Translation Words', ta: 'Translation Academy',
    notes: { one: 'the note', other: 'all {n} notes' }, texts: { other: 'the text in {n} versions' },
    terms: { one: '1 key term', other: '{n} key terms' }, questions: { one: '1 question', other: '{n} questions' },
  },
  es: {
    head: 'Ayudas de esta respuesta', see: 'Ver {list}', all: 'Ver todo lo que encontró el teléfono', and: ' y ', cited: 'Fuente de la respuesta',
    text: 'Texto bíblico', note: 'Nota de traducción', tw: 'Palabras de traducción', ta: 'Traducción Académica',
    notes: { one: 'la nota', other: 'las {n} notas' }, texts: { other: 'el texto en {n} versiones' },
    terms: { one: '1 palabra clave', other: '{n} palabras clave' }, questions: { one: '1 pregunta', other: '{n} preguntas' },
  },
  fr: {
    head: 'Aides pour cette réponse', see: 'Voir {list}', all: 'Voir tout ce que le téléphone a trouvé', and: ' et ', cited: 'Source de la réponse',
    text: 'Texte biblique', note: 'Note de traduction', tw: 'Mots de traduction', ta: 'Académie de traduction',
    notes: { one: 'la note', other: 'les {n} notes' }, texts: { other: 'le texte en {n} versions' },
    terms: { one: '1 terme clé', other: '{n} termes clés' }, questions: { one: '1 question', other: '{n} questions' },
  },
  id: {
    head: 'Bahan bantu untuk jawaban ini', see: 'Lihat {list}', all: 'Lihat semua yang ditemukan ponsel', and: ' dan ', cited: 'Sumber jawaban',
    text: 'Teks Alkitab', note: 'Catatan terjemahan', tw: 'Kata-kata Terjemahan', ta: 'Akademi Terjemahan',
    notes: { other: 'semua {n} catatan' }, texts: { other: 'teks dalam {n} versi' },
    terms: { other: '{n} istilah kunci' }, questions: { other: '{n} pertanyaan' },
  },
  hi: {
    head: 'इस उत्तर की सहायता', see: '{list} देखें', all: 'फ़ोन को जो मिला वह सब देखें', and: ' और ', cited: 'उत्तर का स्रोत',
    text: 'बाइबल पाठ', note: 'अनुवाद नोट', tw: 'अनुवाद शब्द', ta: 'अनुवाद अकादमी',
    notes: { one: 'नोट', other: 'सभी {n} नोट्स' }, texts: { other: '{n} संस्करणों में पाठ' },
    terms: { other: '{n} मुख्य शब्द' }, questions: { other: '{n} प्रश्न' },
  },
  ar: {
    head: 'مساعدات هذه الإجابة', see: 'عرض {list}', all: 'عرض كل ما وجده الهاتف', and: ' و', sep: '، ', cited: 'مصدر الإجابة',
    text: 'نص الكتاب المقدس', note: 'ملاحظة ترجمة', tw: 'كلمات الترجمة', ta: 'أكاديمية الترجمة',
    notes: { one: 'الملاحظة', two: 'الملاحظتين', few: '{n} ملاحظات', other: '{n} ملاحظة' },
    texts: { two: 'النص في ترجمتين', few: 'النص في {n} ترجمات', other: 'النص في {n} ترجمة' },
    terms: { one: 'كلمة رئيسية واحدة', two: 'كلمتين رئيسيتين', few: '{n} كلمات رئيسية', other: '{n} كلمة رئيسية' },
    questions: { one: 'سؤال واحد', two: 'سؤالين', few: '{n} أسئلة', many: '{n} سؤالًا', other: '{n} سؤال' },
  },
}
export const cardsT = (ui: string): Labels => CARDS_T[ui.split('-')[0]!] ?? CARDS_T.en!

const plural = (ui: string, n: number): Intl.LDMLPluralRule => {
  try {
    return new Intl.PluralRules(ui).select(n)
  } catch {
    return n === 1 ? 'one' : 'other'
  }
}
/** "See all 66 notes and the text in 3 versions": what the fold holds, counted, in the app's language. */
export function moreLabel(more: More, ui: string): string {
  const L = cardsT(ui)
  const lang = CARDS_T[ui.split('-')[0]!] ? ui.split('-')[0]! : 'en'
  const parts: string[] = []
  for (const k of ['notes', 'texts', 'terms', 'questions'] as const) {
    const n = more[k]
    if (!n) continue
    const f = L[k]
    parts.push((f[plural(lang, n)] ?? f.other).replace('{n}', String(n)))
  }
  if (!parts.length) return L.all
  const list = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(L.sep ?? ', ')}${L.and}${parts[parts.length - 1]}`
  return L.see.replace('{list}', list)
}
