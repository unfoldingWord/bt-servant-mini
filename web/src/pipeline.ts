// The decisions between the question and the answer, without the page: what a question asks for once its slots are known,
// and which answer it gets. main.ts draws; this decides, so the decisions can be tested under bun (web/tests/).
import type { Sheet } from './answer'
import { bookCode, fold, type Slots } from './sheet'
import { has, kindOf } from './commands'
import { keywords } from './search'

/** What the page tells the decisions: the app's language (the fallback for a question's), the helps language chosen in the menu. */
export const env = { nav: 'en', helpsLang: null as string | null }

export type Hit = { book: string; ch: number; v: number }
/** What a conversation keeps for the next question (main.ts adds its messages and title). */
export type ConvState = { last: Sheet | null; found?: Hit[]
  /** the compact state of the last question (its sheet, book as a code) that a follow-up is read with, and when */
  state?: { s: Record<string, unknown>; at: number }
  /** the last question asked (without its "reply in …"), to ask it again in another language ("repeat that in Indonesian") */
  prevQ?: string }

const ORDINALS: [RegExp, number][] = [
  [/\b(first|primer[oa]?|premier|première|pertama)\b|पहल|الأول/i, 0], [/\b(second|segund[oa]|deuxième|kedua)\b|दूसर|الثاني/i, 1],
  [/\b(third|tercer[oa]?|troisième|ketiga)\b|तीसर|الثالث/i, 2], [/\b(fourth|cuart[oa]|quatrième|keempat)\b|चौथ/i, 3],
]
// The words a pick of a result may have besides its ordinal and what to show ("show me the third one", "y las notas del segundo")
const PICK_FILLER = new Set((
  'the a an one ones show me see open give let please and what about on for of in to with result results now then ok okay ' +
  'el la lo los las un uno una muestrame ver quiero dame abre abrir y que sobre de del en para con resultado resultados por favor ahora ' +
  'le les l une montre moi voir ouvre et sur du des pour avec resultat resultats je veux ' +
  'yang itu ini tunjukkan lihat buka dan tentang untuk hasil ke saya mau tolong ' +
  'वाला वाली वाले दिखाओ दिखाइए दिखाएँ दिखाएं और का की के परिणाम मुझे देखें खोलें ' +
  'و أرني اعرض افتح النتيجة عن في من'
).split(' ').map(fold))
/**
 * The result an ordinal picks, only when the question is just that pick ("the first one", "el segundo", "notes on the second"):
 * "What book of the Bible should I translate first?" asks something else (a report of Nov 14: it showed an earlier search hit).
 */
function ordinalPick(q: string): number | undefined {
  const ord = ORDINALS.find(([re]) => re.test(q))?.[1]
  if (ord === undefined) return undefined
  const toks = q.replace(/[¿?!¡.,;:«»"“”()؟،]/g, ' ').split(/\s+/).filter(Boolean)
  if (toks.length > 8) return undefined
  return toks.every((t) => ORDINALS.some(([re]) => re.test(t)) || PICK_FILLER.has(fold(t)) || kindOf(t)) ? ord : undefined
}

/** A follow-up with no book of its own: "the second one" (a search result), "that verse" or "and the questions?" (the last verse shown). */
export function pickFound(q: string, slots: Slots, c: ConvState): { hit: Hit; what: string[] } | null {
  const named = !has('that', q) && slots.book && fold(q).includes(fold(slots.book)) && bookCode(slots.lang ?? env.nav, slots.book)
  if (named) return null
  const ord = ordinalPick(q)
  const kind = kindOf(q)
  const lastM = /^([0-9a-z]{3}) (\d+)/.exec(c.last?.ref ?? '')
  if (has('whole', q) && lastM) return { hit: { book: lastM[1]!, ch: +lastM[2]!, v: 0 }, what: kind ?? ['text'] }
  if (ord !== undefined && c.found?.length) return { hit: c.found[Math.min(ord, c.found.length - 1)]!, what: kind ?? ['text', 'notes'] }
  const m = /^([0-9a-z]{3}) (\d+):(\d+)/.exec(c.last?.ref ?? '')
  if (!m) return null
  if (has('that', q) || (kind && keywords(q).length === 0))
    return { hit: { book: m[1]!, ch: +m[2]!, v: +m[3]! }, what: kind ?? ['text', 'notes'] }
  return null
}
export const passageOf = (h: Hit, what: string[], lang: string): Slots =>
  ({ intent: 'passage', book: h.book, chapter: h.ch, verse_start: h.v, verse_end: null, what, lang })
