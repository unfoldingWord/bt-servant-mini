// Share an answer (WhatsApp is where translators talk): the question, the answer as plain text, the reference and the app
// link. Android and iOS apps have a native share sheet through the bridge (window.Android.share); the browser uses
// navigator.share, or opens WhatsApp with the text ready. Only the number of shares is counted (usage.ts), never the text.
import { strip } from './bidi'
import { bookLabel } from './converse'
import { unfold } from './focus'
import { slugLabel } from './links'
import { count } from './usage'
import type { Fixture } from './dev'
import { obsLabel } from './obs'
import { ORDER, steps, type Session } from './obs5m'
import { W5 } from './obs5mwords'

export const APP_LINK = 'https://bt-servant-mini.unfoldingword.workers.dev'
const LIMIT = 1000

/** The part of a Msg that sharing reads. */
export type ShareMsg = { who: string; text?: string; intro?: string | null; info?: string; ai?: { text: string }; meta?: string; limits?: boolean; packs?: boolean }

const LABELS: Record<string, { label: string; tip: string; ai: string }> = {
  en: { label: 'Share', tip: 'Share this answer (WhatsApp…)', ai: 'Online AI' },
  es: { label: 'Compartir', tip: 'Compartir esta respuesta (WhatsApp…)', ai: 'IA en línea' },
  fr: { label: 'Partager', tip: 'Partager cette réponse (WhatsApp…)', ai: 'IA en ligne' },
  id: { label: 'Bagikan', tip: 'Bagikan jawaban ini (WhatsApp…)', ai: 'AI daring' },
  hi: { label: 'साझा करें', tip: 'यह उत्तर साझा करें (WhatsApp…)', ai: 'ऑनलाइन AI' },
  ar: { label: 'مشاركة', tip: 'شارك هذه الإجابة (WhatsApp…)', ai: 'ذكاء اصطناعي عبر الإنترنت' },
}

/** Markdown to the plain words (what WhatsApp would otherwise show as stars and hashes). */
export function plainText(src: string): string {
  // the folds' buttons and ends (focus.ts) are for the screen: a shared answer has their contents, not "▸ More notes (64)"
  return unfold(src.replace(/\r/g, ''))
    .replace(/\[\[([^\]\n]+)\]\]/g, (_, h: string) => slugLabel(h))
    .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/(^|[\s(«“])\*([^*\s][^*\n]*?)\*(?=[\s).,;:!?»”]|$)/g, '$1$2')
    .replace(/(^|[\s(«“])_([^_\n]+?)_(?=[\s).,;:!?»”]|$)/g, '$1$2')
    .replace(/^[ \t]*[*•]\s+/gm, '- ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** At most `max` characters, cut after a paragraph, else after a sentence, else at a space; "…" when something was left out. */
export function trimAt(s: string, max = LIMIT): string {
  if (s.length <= max) return s
  const head = s.slice(0, max)
  const floor = max * 0.5 // not so early that most of the answer goes
  const para = head.lastIndexOf('\n\n')
  let cut = para >= floor ? para : -1
  if (cut < 0) {
    const m = [...head.matchAll(/[.!?。؟۔।](?=\s|$)/g)].pop()
    if (m && m.index! + 1 >= floor) cut = m.index! + 1
  }
  if (cut < 0) cut = Math.max(head.lastIndexOf(' '), floor)
  return head.slice(0, cut).trimEnd() + '…'
}

/** "Rut 2:3 (GLT)": the reference from the call sheet in the details, and the text's label from the answer. */
export function referenceOf(m: ShareMsg, ui: string): string {
  const ref = /"ref":\s*"([^"]+)"/.exec(m.meta ?? '')?.[1]
  const source = /^\*\*([A-Z]{2,6})\*\* \(/m.exec(m.info ?? '')?.[1]
  let label = ''
  if (ref) {
    const [code, rest] = ref.split(' ')
    label = `${bookLabel(ui, code!)}${rest ? ' ' + rest.replace(/^front:intro$/, '') : ''}`.trim()
  } else {
    // an article: its title, the first heading of the answer
    label = /^#{1,3}\s*(.+)$/m.exec(m.info ?? '')?.[1]?.replace(/\*+/g, '').trim() ?? ''
  }
  return label && source && ref ? `${label} (${source})` : label
}

/** The message to send, or null when the answer has nothing to share. */
export function shareText(m: ShareMsg, ui: string, question?: string): string | null {
  if (m.limits || m.packs) return null
  const body = m.ai?.text || m.info // the online answer first, then the phone's
  if (!body?.trim()) return null
  const parts: string[] = []
  if (question?.trim()) parts.push(question.trim())
  // the online answer says it is one (as its badge in the app): "Online AI: …"
  const ai = !!m.ai?.text
  parts.push((ai ? `${(LABELS[ui.split('-')[0]!] ?? LABELS.en!).ai}: ` : '') + trimAt(plainText(body)))
  const ref = referenceOf(m, ui)
  if (ref) parts.push(ref)
  parts.push(APP_LINK)
  return strip(parts.join('\n\n')) // no isolate marks (bidi.ts): WhatsApp and the other apps get the plain words
}

/** Hands the text to the system: the app's share sheet, the browser's, or WhatsApp's link. */
export async function shareNow(text: string): Promise<void> {
  const A = (window as any).Android
  try {
    if (typeof A?.share === 'function') return void A.share(text)
    if (typeof navigator.share === 'function') return await navigator.share({ text })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return // the person closed the sheet
  }
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener')
}

const ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>'

/** The sources of the dev fixture (its `resources` rows), named on what a session shares */
const DEV_SOURCES = 'Source (dev fixture, not published): unfoldingWord/en/obs v9 · unfoldingWord/en/obs-tf v4 (CC-BY-SA-4.0, unfoldingWord and Formation Stories)'

/**
 * What a 5M session shares (5M from the packs): the story's title and reference, the sources, then the parts done and the one
 * in progress with their questions. The manual's answers are never in it, except those revealed on a card (`revealed`: question
 * ids; kept in memory only). It reads the tables, never a card kept in a conversation's history.
 */
export function shareSession(fx: Fixture, s: Session, revealed: Set<string>, ui: string): string {
  const w = W5(ui)
  const out = [`${obsLabel(s.story)} · ${fx.title}`, fx.reference, DEV_SOURCES]
  for (const p of ORDER) {
    if (p !== s.part && !s.done.includes(p)) continue
    // (R19) the part in progress lists only the questions of the steps reached (up to the current one), never the frames ahead
    const reached = p === s.part ? new Set(steps(fx, p).slice(0, s.at + 1).flatMap((st) => st.questions)) : null
    const qs = fx.questions.filter((q) => q.part === p && (!reached || reached.has(q.id)))
    if (!qs.length) continue
    out.push('', `${w.parts[p]}${p === s.part ? '' : ' ✓'}`)
    for (const q of qs) {
      out.push(`- ${q.q}`)
      if (revealed.has(q.id) && q.a) out.push(`  → ${q.a}`)
    }
  }
  // (R19) the same room as a shared answer: cut with an ellipsis, then the link
  return strip(`${trimAt(out.join('\n'))}\n\n${APP_LINK}`)
}

/** The share button for a bot answer, or null when it has nothing to share. `question`: what the person asked. */
export function shareButton(m: ShareMsg, ui: string, question?: string, labelUi = ui): HTMLElement | null {
  const text = shareText(m, ui, question)
  // (what is shared keeps the answer's language; the button's own words are the app's: `labelUi`)
  return text ? shareTextButton(text, labelUi) : null
}
/** The share button for a text made already, or made when tapped (a 5M session's `shareSession`: what was revealed since counts) */
export function shareTextButton(text: string | (() => string), ui: string): HTMLElement {
  const L = LABELS[ui] ?? LABELS.en!
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'share'
  b.title = b.ariaLabel = L.tip
  b.innerHTML = `${ICON}<span></span>`
  b.lastElementChild!.textContent = L.label
  b.onclick = () => {
    count('share')
    void shareNow(typeof text === 'function' ? text() : text)
  }
  return b
}
