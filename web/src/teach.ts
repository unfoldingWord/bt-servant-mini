// Teach and correct (propuesta-composer-sugerencias.md §5 "Fase 3", §2.3): after a question is sent, a small line under the
// person's message says how the app read it ("Understood: Ruth 2:3 · notes"), and a tap puts the question back in the box to
// correct it; an answer that found nothing for a free question offers the ways of asking code reads, as buttons that write in
// the box (never send); and with no model, the composer's row says once what a free question will do ("Free question: I will
// search the helps for these words"), only the first three times. No message text is kept here, only a number of times.
import { codeReads, type ConvState, placeLabel } from './pipeline'
import { nodeOf, type Graph, type GNode } from './graph'
import { introLabel, whatWord } from './converse'
import { bookShown } from './firstuse'
import { has, replyLang } from './commands'
import { bidiLabel, rtlLang, strip as unmarked } from './bidi'

type T = { got: string; search: string; fix: string; lead: string; free: string }
const STR: Record<string, T> = {
  en: { got: 'Understood: {what}', search: 'a search in the helps', fix: 'Tap to put this question back in the box and correct it', lead: 'Ways of asking I understand:',
    free: 'Free question: I will search the helps for these words' },
  es: { got: 'Entendí: {what}', search: 'una búsqueda en las ayudas', fix: 'Toca para volver a poner esta pregunta en la caja y corregirla', lead: 'Formas de preguntar que entiendo:',
    free: 'Pregunta libre: buscaré estas palabras en las ayudas' },
  fr: { got: 'Compris : {what}', search: 'une recherche dans les aides', fix: 'Touchez pour remettre cette question dans la zone de saisie et la corriger', lead: 'Façons de demander que je comprends :',
    free: 'Question libre : je chercherai ces mots dans les aides' },
  id: { got: 'Dipahami: {what}', search: 'pencarian di bahan bantu', fix: 'Ketuk untuk menaruh lagi pertanyaan ini di kotak dan memperbaikinya', lead: 'Cara bertanya yang saya pahami:',
    free: 'Pertanyaan bebas: saya akan mencari kata-kata ini di bahan bantu' },
  hi: { got: 'समझा: {what}', search: 'सहायता में खोज', fix: 'यह प्रश्न फिर से बॉक्स में डालकर सुधारने के लिए टैप करें', lead: 'पूछने के तरीके जो मैं समझता हूँ:',
    free: 'खुला प्रश्न: मैं ये शब्द सहायता में खोजूँगा' },
  ar: { got: 'فهمت: {what}', search: 'بحث في المساعدات', fix: 'المس لإعادة هذا السؤال إلى المربع وتصحيحه', lead: 'طرق السؤال التي أفهمها:',
    free: 'سؤال حر: سأبحث عن هذه الكلمات في المساعدات' },
}
export const TT = (ui: string): T => STR[ui] ?? STR.en!

// ------------------------------------------------------------------------------------------------- "Understood: …"

/**
 * How the app read a question, as the name of its point in the conversation's graph, in the app's language: the passage and
 * what was shown ("Ruth 2:3 · notes", as the composer's "✓" says it), an introduction, the article's title, or for a free
 * search "a search in the helps" (its point is named by the question itself, which says nothing new).
 */
export function understoodLabel(n: GNode, ui: string): string {
  if (n.kind === 'search') return TT(ui).search
  const m = /^([0-9a-z]{3}) (.+)$/.exec(n.sheet.ref ?? '')
  // (an article, a story of Open Bible Stories: the point's own name)
  if (!m || m[1] === 'obs' || !['passage', 'count', 'intro'].includes(n.kind)) return placeLabel(n, ui)
  // the book as the composer writes it in the app's language (bookShown: Hindi and French too, where bookLabel says it in English)
  const book = bookShown(ui, m[1]!)
  const im = /^(front|\d+):intro$/.exec(m[2]!)
  if (im) return introLabel(ui, im[1] === 'front' ? book : `${book} ${im[1]}`)
  const w = n.sheet.what.length === 1 ? whatWord(ui, n.sheet.what[0]!) : null
  return w ? `${book} ${m[2]} · ${w.toLocaleLowerCase(ui)}` : `${book} ${m[2]}`
}

/** A message as this needs it (main.ts Msg). */
type M = { who: string; text?: string; mark?: boolean; node?: string }
/**
 * The «Understood» of an answer: every answer with a point in the graph that answers the person's own message (not a "Back to …"
 * divider) has one; help answers and errors have no point, so none. `q`: the person's message, what a tap puts back in the box.
 */
export function understoodFor(msgs: M[], graph: Graph | undefined, m: M, ui: string): { label: string; q: string } | null {
  if (m.who !== 'bot' || !m.node) return null
  const n = nodeOf(graph, m.node)
  const prev = msgs[msgs.indexOf(m) - 1]
  if (!n || prev?.who !== 'me' || prev.mark || !prev.text?.trim()) return null
  return { label: TT(ui).got.replace('{what}', understoodLabel(n, ui)), q: prev.text }
}

/**
 * The line under the person's message: in the app's language and direction (never `auto`: an English reference in an Arabic
 * app keeps the line right to left), the other direction's runs isolated (bidiLabel), as text only. A tap: `restore`.
 */
export function understoodLine(got: { label: string }, ui: string, restore: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'got'
  b.dir = rtlLang(ui) ? 'rtl' : 'ltr'
  b.textContent = bidiLabel(got.label, ui)
  b.title = TT(ui).fix
  b.onclick = restore
  return b
}

// ------------------------------------------------------------------------------------------------- "didn't find": the shapes

/** A way of asking under an answer: it writes `fill` in the box, or (`choose`) lists the books in the composer's row. */
export type Shape = { label: string; fill?: string; choose?: true }
/** The kinds of answer that are not "found nothing": out of scope, no pack, past a book's end (they say why themselves). */
const SAYS_WHY = new Set(['outofscope', 'nopack', 'edge', 'choose', 'resources'])
/** An answer that found nothing for a typed question: no point in the graph, no source. */
export const foundNothing = (r: { answered: string; found: number; node: string | null }): boolean =>
  !r.node && r.found === 0 && !SAYS_WHY.has(r.answered)

/** The ways of asking under such an answer: a short lead, then a button per shape (in the app's language and direction). */
export function shapeRow(shapes: Shape[], ui: string, offer: (s: Shape) => void): HTMLElement {
  const box = document.createElement('div')
  box.className = 'shapes'
  box.dir = rtlLang(ui) ? 'rtl' : 'ltr'
  box.setAttribute('role', 'group')
  const lead = document.createElement('p')
  lead.className = 'shapes-lead'
  lead.textContent = TT(ui).lead
  box.appendChild(lead)
  const row = document.createElement('div')
  row.className = 'follow'
  for (const s of shapes) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'shape'
    b.textContent = bidiLabel(s.label, ui)
    b.onclick = () => offer(s)
    row.appendChild(b)
  }
  box.appendChild(row)
  box.setAttribute('aria-label', TT(ui).lead)
  return box
}

// ------------------------------------------------------------------------------------------------- the free question, no model

const KEY = 'btsm.freehint'
/** The times the grey line went with a free question: it shows while fewer than three. */
const SHOWN = 3
function times(): number {
  try {
    return Number(globalThis.localStorage?.getItem(KEY) ?? 0) || 0
  } catch {
    return SHOWN // (no storage: never shown, rather than every time)
  }
}
/** Whether the grey line may still show (the first three free questions). */
export const freeHintDue = (): boolean => times() < SHOWN
/** A free question was sent with the grey line showing: one time more. */
export function freeHintSeen() {
  try {
    globalThis.localStorage?.setItem(KEY, String(times() + 1))
  } catch {}
}
/** "Erase everything" (menu > Safety): the line shows again the first three times. */
export function forgetFreeHint() {
  try {
    globalThis.localStorage?.removeItem(KEY)
  } catch {}
}
/**
 * The grey line for the text in the box, or null: only with no model and no online reader (`reader` false), while due, for a
 * question the code does not read (a reference, a follow-up, a story's number get their "✓" or are answered by code), not
 * help or "in English", and only once it is a question (two words, or six letters), not the first letters of a word.
 */
export function freeLine(text: string, ui: string, conv: ConvState, reader: boolean): string | null {
  if (reader || !freeHintDue()) return null
  const t = unmarked(text).trim()
  if (!t || t.length > 120 || (t.split(/\s+/).length < 2 && t.length < 6)) return null
  if (has('help', t) || replyLang(t) || codeReads(t, conv)) return null
  return TT(ui).free
}
