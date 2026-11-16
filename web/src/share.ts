// Share an answer (WhatsApp is where translators talk): the question, the answer as plain text, the reference and the app
// link. Android and iOS apps have a native share sheet through the bridge (window.Android.share); the browser uses
// navigator.share, or opens WhatsApp with the text ready. Only the number of shares is counted (usage.ts), never the text.
import { strip } from './bidi'
import { bookLabel } from './converse'
import { unfold } from './focus'
import { slugLabel } from './links'
import { count } from './usage'

export const APP_LINK = 'https://bt-servant-mini.unfoldingword.workers.dev'
const LIMIT = 1000

/** The part of a Msg that sharing reads. */
export type ShareMsg = { who: string; text?: string; intro?: string | null; info?: string; ai?: { text: string }; meta?: string; limits?: boolean; packs?: boolean }

const LABELS: Record<string, { label: string; tip: string }> = {
  en: { label: 'Share', tip: 'Share this answer (WhatsApp…)' },
  es: { label: 'Compartir', tip: 'Compartir esta respuesta (WhatsApp…)' },
  fr: { label: 'Partager', tip: 'Partager cette réponse (WhatsApp…)' },
  id: { label: 'Bagikan', tip: 'Bagikan jawaban ini (WhatsApp…)' },
  hi: { label: 'साझा करें', tip: 'यह उत्तर साझा करें (WhatsApp…)' },
  ar: { label: 'مشاركة', tip: 'شارك هذه الإجابة (WhatsApp…)' },
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
  parts.push(trimAt(plainText(body)))
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

/** The share button for a bot answer, or null when it has nothing to share. `question`: what the person asked. */
export function shareButton(m: ShareMsg, ui: string, question?: string): HTMLElement | null {
  const text = shareText(m, ui, question)
  if (!text) return null
  const L = LABELS[ui] ?? LABELS.en!
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'share'
  b.title = b.ariaLabel = L.tip
  b.innerHTML = `${ICON}<span></span>`
  b.lastElementChild!.textContent = L.label
  b.onclick = () => {
    count('share')
    void shareNow(text)
  }
  return b
}
