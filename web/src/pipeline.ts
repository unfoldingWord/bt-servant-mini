// The decisions between the question and the answer, without the page: what a question asks for once its slots are known,
// and which answer it gets. main.ts draws; this decides, so the decisions can be tested under bun (web/tests/).
import { answerSheet, booksWith, clean, facts, linkedVerses, type Result, setUiLang, type Sheet, type Study, studyOf } from './answer'
import { bookCode, bookExact, buildSheet, fold, type Slots } from './sheet'
import { asksWhere, FT, noFit } from './findall'
import { asksIntro, chapterNumber, has, kindOf, pattern, replyLang, withoutReply } from './commands'
import { articleForQuestion, asksAbout, GOOD_COVERAGE, introFor, keywords, searchHelps, searchVerses, versesOf } from './search'
import { bookLabel, followups, intro, searchIntro } from './converse'
import { hasLang, installedLangs, openLang } from './packs'
import type { HelpItem } from './view'
import taSynonyms from './data/ta-synonyms.json'
import bookTables from './data/books.json'

/**
 * What the page tells the decisions: the app's language (the fallback for a question's), the helps language chosen in the
 * menu, the word "details" in the app's language, and a language pack's name (main.ts makes these follow its own state).
 */
export const env = { nav: 'en', helpsLang: null as string | null, details: 'details', packName: (l: string): string => l }

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
  'the a an one ones show me see open give let please and what about on for of in to with result results now then ok okay is can could i ' +
  'el la lo los las un uno una muestrame ver quiero dame abre abrir y que sobre de del en para con resultado resultados por favor ahora cual es puedo ' +
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

// headings of the notes and questions a free search finds, in the app's language
const HTS: Record<string, { notes: string; questions: string; note: string; question: string; onlyHelps: string }> = {
  en: { notes: 'Translation notes that mention «{w}»', questions: 'Questions that mention «{w}»', note: 'Note', question: 'Question', onlyHelps: 'No verse has «{w}», but these helps do:' },
  es: { notes: 'Notas de traducción que mencionan «{w}»', questions: 'Preguntas que mencionan «{w}»', note: 'Nota', question: 'Pregunta', onlyHelps: 'Ningún versículo tiene «{w}», pero estas ayudas sí:' },
  fr: { notes: 'Notes de traduction qui mentionnent «{w}»', questions: 'Questions qui mentionnent «{w}»', note: 'Note', question: 'Question', onlyHelps: "Aucun verset n'a «{w}», mais ces aides oui :" },
  id: { notes: 'Catatan terjemahan yang menyebut «{w}»', questions: 'Pertanyaan yang menyebut «{w}»', note: 'Catatan', question: 'Pertanyaan', onlyHelps: 'Tidak ada ayat dengan «{w}», tetapi alat bantu ini ada:' },
  hi: { notes: '«{w}» का उल्लेख करने वाले अनुवाद नोट्स', questions: '«{w}» का उल्लेख करने वाले प्रश्न', note: 'नोट', question: 'प्रश्न', onlyHelps: 'किसी पद में «{w}» नहीं है, पर इन सहायक संसाधनों में है:' },
  ar: { notes: 'ملاحظات الترجمة التي تذكر «{w}»', questions: 'الأسئلة التي تذكر «{w}»', note: 'ملاحظة', question: 'سؤال', onlyHelps: 'لا توجد آية فيها «{w}»، لكن هذه الأدوات المساعدة فيها:' },
}
export const HT = () => HTS[env.nav] ?? HTS.en!
/**
 * A search snippet of a note as plain text: it is a cut piece of the note's Markdown, so a heading, a link or a bold can be
 * half there. The marks go; the words stay (a link keeps its label, [[ta:translate/figs-metaphor]] becomes "figs metaphor").
 */
export function plainSnippet(s: string): string {
  return s
    .replace(/[«»]/g, '')
    .replace(/\[\[([^\]]*)\]\]?/g, (_, x: string) => x.split('/').pop()!.replace(/[-_]/g, ' '))
    .replace(/\[([^\]]*)\]\([^)]*\)?/g, '$1')
    .replace(/\]\([^)\s]*\)?/g, '')
    .replace(/(^|[\s…(])(?:tw|ta):[\w/-]+\]\]\)?/g, '$1') // the end of a [[tw:…]] link whose start was cut off
    .replace(/\]\]\)?/g, '')
    .replace(/\[[^\]]*$/, '')
    .replace(/(^|\s)#{1,6}\s+/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
}

// "¿Cómo traduzco «cordero» si en mi pueblo solo hay llamas?" and "¿Qué significa «redentor» en Rut 4?": the questions of a
// translator who works far from the Bible's world. The term's article first, then what helps with it (a report of Nov 13).
export const TERM_T: Record<string, { unknown: string; meaning: string; inRef: string; all: string }> = {
  en: { unknown: 'When something does not exist where you translate, this is what the helps say:', meaning: 'This is what «{term}» means:', inRef: 'In {ref} it appears in {list}.', all: '{ref}: all the helps' },
  es: { unknown: 'Cuando algo no existe donde traduces, esto dicen las ayudas:', meaning: 'Esto significa «{term}»:', inRef: 'En {ref} aparece en {list}.', all: '{ref}: todas las ayudas' },
  fr: { unknown: "Quand une chose n'existe pas là où vous traduisez, voici ce que disent les aides :", meaning: 'Voici ce que signifie « {term} » :', inRef: 'Dans {ref}, il apparaît en {list}.', all: '{ref} : toutes les aides' },
  id: { unknown: 'Jika sesuatu tidak ada di tempat Anda menerjemahkan, inilah kata bahan bantu:', meaning: 'Inilah arti «{term}»:', inRef: 'Di {ref} muncul pada {list}.', all: '{ref}: semua bahan bantu' },
  hi: { unknown: 'जब कोई चीज़ वहाँ नहीं होती जहाँ आप अनुवाद करते हैं, तो सहायताएँ यह कहती हैं:', meaning: '«{term}» का अर्थ यह है:', inRef: '{ref} में यह {list} में आता है।', all: '{ref}: सभी सहायताएँ' },
  ar: { unknown: 'عندما لا يوجد شيء حيث تترجم، هذا ما تقوله المساعدات:', meaning: 'هذا معنى «{term}»:', inRef: 'في {ref} يرد في {list}.', all: '{ref}: كل المساعدات' },
}
export const TT = (ui: string) => TERM_T[ui] ?? TERM_T.en!
/** "jon 1:17" as the person reads it: "Jonás 1:17". */
export const refLabelOf = (ui: string, ref: string): string => { const [code, rest] = ref.split(' '); return `${bookLabel(ui, code!)}${rest ? ' ' + rest.replace(/^front:intro$/, '') : ''}`.trim() }
/**
 * The one Translation Words article the question's words name, leaving out book names: two words together first ("pez
 * grande"), then each word, exact names before a close spelling ("jueces" ~ "juez").
 */
// the person's own situation ("en mi pueblo solo hay llamas"): never the term they ask about
const SITUATION = new Set('pueblo pueblos idioma lengua cultura comunidad tierra zona region solo village language culture community country area only langue village communaute region seulement desa bahasa budaya daerah hanya conocen conocemos conoce tenemos tienen hay existe existen usan usamos visto saben sabemos know knows have has exist exists see seen connaissons connaissent existe punya mengenal tahu ada'.split(' '))
export async function termArticle(q: string, ui: string): Promise<string | null> {
  let kw = keywords(q).filter((k) => !bookCode(ui, k) && !bookCode('en', k) && !SITUATION.has(fold(k)))
  // the words right after "how do I translate" are the thing asked about ("…we don't have sheep, how do I translate lamb?")
  const asked = pattern('howTranslate').exec(q)
  if (asked) {
    const after = asked.index + asked[0].length
    kw = [...kw.filter((k) => q.indexOf(k, after) >= 0), ...kw.filter((k) => q.indexOf(k, after) < 0)]
  }
  const pairs = kw.slice(0, -1).map((k, i) => `${k} ${kw[i + 1]}`)
  for (const t of [...pairs, ...kw]) {
    const ids = await articleForQuestion(t)
    if (ids?.length === 1) return ids[0]!
  }
  for (const t of kw) {
    const ids = await articleForQuestion(`qué es ${t}`)
    if (ids?.length === 1) return ids[0]!
  }
  return null
}
/** The phrase the model took from the question, without the question's own words ("que quiere decir eso", "como traduzco"). */
export function cleanPhrase(phrase: string, q: string): string | null {
  let p = phrase.replace(/[¿?!¡]/g, ' ').replace(/\s+/g, ' ').trim()
  // the question's words at the start ("que quiere decir eso"), never inside: "el que es fiel" is the verse's text
  for (const c of ['meaning', 'howTranslate', 'noWord'] as const) p = p.replace(new RegExp('^(?:' + pattern(c).source + ')', 'iu'), ' ').trim()
  // the person's own situation: "…, en mi pueblo no conocen el mar"
  p = p.replace(/,?\s*(?:en|in|dans|di|dalam|donde|where) (?:mi|my|mis|nuestro|nuestra|our|mon|ma|notre|kami|saya) (?:pueblo|idioma|lengua|cultura|comunidad|village|language|culture|community|langue|desa|bahasa|budaya)\b.*$/iu, '')
  p = p.replace(/^[,.;:\s]+|[,.;:\s]+$/g, '')
  if (!keywords(p).length) return null // nothing left but question words ("eso")
  // the whole question is not a phrase of the verse (unless the person quoted it)
  if (!/[«"“]/.test(q) && p.length > 0.8 * q.replace(/\s+/g, ' ').trim().length) return null
  return p
}

// Without the language: the light build starts with none, and a question in a language that is not here finds nothing.
// Saying so (and where to add it) instead of "I didn't find…", which reads as a fault of the app.
export const NOPACK: Record<string, { none: string; missing: string; add: string }> = {
  en: { none: 'There is no language on this phone yet, so I have nothing to search in. Add one below: from the internet, or from a file someone shared with you.', missing: '{lang} is not on this phone, and I found nothing in the languages that are ({have}). Add {lang} to search in it.', add: 'Add languages ›' },
  es: { none: 'Todavía no hay ningún idioma en este teléfono, así que no tengo dónde buscar. Añade uno aquí abajo: desde internet o desde un archivo que alguien te compartió.', missing: '{lang} no está en este teléfono, y no encontré nada en los idiomas que sí están ({have}). Añade {lang} para buscar en él.', add: 'Añadir idiomas ›' },
  fr: { none: "Il n'y a encore aucune langue sur ce téléphone, je n'ai donc rien où chercher. Ajoutez-en une ci-dessous : par internet, ou depuis un fichier qu'on vous a partagé.", missing: "{lang} n'est pas sur ce téléphone, et je n'ai rien trouvé dans les langues qui y sont ({have}). Ajoutez {lang} pour y chercher.", add: 'Ajouter des langues ›' },
  id: { none: 'Belum ada bahasa di ponsel ini, jadi saya tidak punya tempat untuk mencari. Tambahkan satu di bawah: dari internet, atau dari file yang dibagikan seseorang kepada Anda.', missing: '{lang} tidak ada di ponsel ini, dan saya tidak menemukan apa pun dalam bahasa yang ada ({have}). Tambahkan {lang} untuk mencari di dalamnya.', add: 'Tambah bahasa ›' },
  hi: { none: 'इस फ़ोन पर अभी कोई भाषा नहीं है, इसलिए मेरे पास खोजने के लिए कुछ नहीं है। नीचे से एक जोड़ें: इंटरनेट से, या किसी की आपके साथ साझा की गई फ़ाइल से।', missing: '{lang} इस फ़ोन पर नहीं है, और जो भाषाएँ हैं ({have}) उनमें मुझे कुछ नहीं मिला। उसमें खोजने के लिए {lang} जोड़ें।', add: 'भाषाएँ जोड़ें ›' },
  ar: { none: 'لا توجد أي لغة على هذا الهاتف بعد، لذا ليس لدي ما أبحث فيه. أضف لغة من الأسفل: من الإنترنت، أو من ملف شاركه أحدهم معك.', missing: '{lang} ليست على هذا الهاتف، ولم أجد شيئًا في اللغات الموجودة ({have}). أضف {lang} للبحث فيها.', add: 'إضافة لغات ›' },
}
export const NP = (ui: string) => NOPACK[ui] ?? NOPACK.en!
/** The pack a question's language is answered from ("es" → "es-419"). */
export const packCode = (l: string) => (l.startsWith('es') ? 'es-419' : l.startsWith('pt') ? 'pt-br' : l)

// ---------------------------------------------------------------------------------------------------- follow-up state
// The conversation, compacted to what a follow-up needs: the last question's sheet, only its non-empty fields, with the book
// as a code (about 30 tokens). Code keeps it, not the model; it is replaced at every question, dropped by a question about
// nothing in particular, and forgotten after 30 minutes. The reader decides what to take from it (trained with new-topic rows).
const STATE_KEYS = ['intent', 'book', 'chapter', 'verse_start', 'verse_end', 'what', 'term'] as const
const STATE_MS = 30 * 60_000
export function stateLine(c: ConvState): string {
  if (!c.state || Date.now() - c.state.at > STATE_MS) return ''
  return `STATE ${JSON.stringify(c.state.s)}`
}
export function keepState(c: ConvState, s: Slots) {
  if (!['passage', 'count', 'article', 'advice', 'rank'].includes(s.intent ?? '')) {
    delete c.state
    return
  }
  const code = s.book ? bookCode(s.lang ?? env.nav, s.book) : null
  const out: Record<string, unknown> = {}
  for (const k of STATE_KEYS) {
    const v = k === 'book' ? code : (s as Record<string, unknown>)[k]
    if (v !== null && v !== undefined && !(Array.isArray(v) && !v.length)) out[k] = v
  }
  c.state = { s: out, at: Date.now() }
}

/** A follow-up ("and verse 4?") names no book: take the book (and chapter) of the last passage of this conversation. */
export function withContext(slots: Slots, last: Sheet | null, q: string): Slots {
  const m = /^([0-9a-z]{3}) (\d+)/.exec(last?.ref ?? '')
  if (!m) return slots
  const [, code, ch] = m
  const named = bookCode(slots.lang ?? env.nav, slots.book ?? null)
  if (named) return slots
  // short question with a number and no book: verse (or chapter) of the same passage
  const words = q.trim().split(/\s+/).length
  const nums = /(\d+)\s*[:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?|(\d+)(?:\s*[-–]\s*(\d+))?/.exec(q.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))))
  // only when the words around the number are not a name ("Mathew 3" names a book, "and verse 4?" does not)
  if (words <= 8 && nums && keywords(q).filter((w) => !/^\d/.test(w)).length === 0) {
    const isChap = /cap[ií]tulo|chapter|chapitre|pasal|अध्याय|أصحاح/i.test(q)
    const asked = /not[ae]s?|catatan|टिप्पणि/i.test(q) ? ['notes'] : /question|pregunta|pertanyaan|प्रश्न|أسئلة/i.test(q) ? ['questions']
      : /text|texto|teks|पाठ|dice|say|dit/i.test(q) ? ['text'] : null
    const base = { ...slots, intent: 'passage', book: code, what: asked ?? last!.what }
    if (nums[1]) return { ...base, chapter: +nums[1], verse_start: +nums[2]!, verse_end: nums[3] ? +nums[3] : null }
    if (isChap) return { ...base, chapter: +nums[4]!, verse_start: null, verse_end: null }
    return { ...base, chapter: Number(ch), verse_start: +nums[4]!, verse_end: nums[5] ? +nums[5] : null }
  }
  if (['passage', 'advice'].includes(slots.intent ?? '') && (slots.chapter || slots.verse_start))
    return { ...slots, book: code, chapter: slots.chapter ?? Number(ch) }
  return slots
}
/** The language of a question when the model did not say: by script, then by common words; else the app's language. */
const COMMON: Record<string, RegExp> = {
  en: /\b(the|what|who|how|where|which|does|is|was|help|me|please|verse|notes?|say|says)\b/gi,
  es: /\b(el|la|los|las|qu[eé]|qui[eé]n|c[oó]mo|d[oó]nde|cu[aá]l|es|era|ay[uú]dame|por favor|vers[ií]culo|notas?|dice)\b/gi,
  fr: /\b(le|la|les|que|qui|comment|o[uù]|quel|est|était|aide|moi|verset|notes?|dit)\b/gi,
  id: /\b(apa|siapa|bagaimana|di mana|yang|adalah|tolong|ayat|catatan|kata|dalam|itu)\b/gi,
}
export function guessLang(q: string): string {
  if (/[؀-ۿ]/.test(q)) return 'ar'
  if (/[ऀ-ॿ]/.test(q)) return 'hi'
  let best = env.nav
  let most = 0
  for (const [l, re] of Object.entries(COMMON)) {
    const n = q.match(re)?.length ?? 0
    if (n > most) {
      most = n
      best = l
    }
  }
  return best
}

/** "Introduction to Jonah", "Introducción a Jonás 1", "¿De qué trata el libro de Jonás?": the book or chapter asked about. */
export function introAsked(q: string, lang: string): Slots | null {
  if (!asksIntro(q)) return null
  const t = q.replace(/[¿?!¡.,;:«»"“”؟]/g, ' ').replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  const words = t.split(/\s+/).filter(Boolean)
  const chFirst = chapterNumber(t)
  for (let i = 0; i < words.length; i++)
    for (let k = 3; k >= 1; k--) {
      const code = bookCode(lang, words.slice(i, i + k).join(' '))
      if (!code) continue
      const ch = /^\d+$/.test(words[i + k] ?? '') ? Number(words[i + k]) : chFirst
      return { intent: 'passage', book: code, chapter: ch, verse_start: null, verse_end: null, what: ['intro'], lang } as Slots
    }
  return null
}

/** A reference written in the question ("Rut 1:16", "1 Juan 3:2") that the model missed: read it by code. */
export function refInText(slots: Slots, q: string): Slots {
  if (slots.book && bookCode(slots.lang ?? env.nav, slots.book) && slots.chapter)
    return !slots.intent || slots.intent === 'unknown' ? { ...slots, intent: 'passage', what: kindOf(q) ?? slots.what ?? [] } : slots
  const ch = pattern('chapter').source
  const t = q
    .replace(new RegExp(`${ch}\\s*(\\d+)\\s+(?:of|de|del|du|dari|का|من)\\s+((?:[123]\\s*)?[\\p{L}][\\p{L}\\p{M}]+)`, 'iu'), '$2 $1')
    .replace(new RegExp(`\\s+${ch}\\s*(\\d+)`, 'iu'), ' $1')
    .replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  const m = /((?:[123]\s*)?[\p{L}][\p{L}\p{M}.]+(?:\s+(?:de|of|des|du)\s+[\p{L}]+)?)\s+(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?/u.exec(t)
  if (!m) return slots
  const words = m[1]!.trim().split(/\s+/)
  let code: string | null = null
  let name = ''
  for (let k = Math.min(3, words.length); k >= 1 && !code; k--) {
    name = words.slice(-k).join(' ')
    code = bookCode(slots.lang ?? env.nav, name)
  }
  if (!code) return slots
  const what = kindOf(q) ?? slots.what ?? []
  return { ...slots, intent: slots.intent === 'advice' ? 'advice' : 'passage', book: name, chapter: +m[2]!, verse_start: m[3] ? +m[3] : null, verse_end: m[4] ? +m[4] : null, what }
}

/** An open question: the model said search, or there is no reference and the question names things ("where does Abraham…"). */
export function isOpen(q: string, sheet: Sheet): boolean {
  if (sheet.intent === 'search') return true
  // "¿Dónde fue tragado Jonás por un pez?" read as the book of Jonah (a report of Nov 14: the answer told the story, not
  // the verse): where in the book, when the question names more than the book
  if (sheet.ref && /^[1-3]?[a-z]{2,3}$/.test(sheet.ref) && sheet.intent === 'passage' && has('where', q))
    return keywords(q).filter((w) => !bookExact(w)).length >= 1
  if (sheet.ref) return false
  if (has('where', q)) return keywords(q).length >= 1
  if (kindOf(q) && keywords(q).length >= 2) return true // "notes about Abraham sacrificing Isaac"
  // a keyword first: with no article for it ("pez", "Jonah fish", "Moisés mar") the words become a free search
  if (sheet.intent === 'article' && !sheet.concept && !sheet.candidates?.length) return keywords(q).length >= 1
  // nothing understood and no article: even one word is worth a search ("ballena") rather than "I could not tell"
  if (sheet.intent === 'unknown') return keywords(q).length >= 1
  return ['advice', 'passage'].includes(sheet.intent) && keywords(q).length >= 2
}

// ------------------------------------------------------------------------------------------------------------ the question

/** "… Reply in Indonesian" (the answer's language, the rest read as usual); "Repeat your last answer in Indonesian" (the last question again). */
export function questionOf(q0: string, c: ConvState): { q: string; target: string | null } {
  const target = replyLang(q0)
  let q = target ? withoutReply(q0) || q0 : q0
  if (target && c.prevQ && (has('again', q) || !keywords(q).length)) q = c.prevQ
  else c.prevQ = q
  return { q, target }
}

/** What a question asks for, from what a reader made of it: the call sheet, the app language it is answered in, the details line. */
export type Made = { sheet: Sheet; ui: string; meta: string; q?: string }
/** The reading step once the slots are known (from the phone's model, the online one, or none): code reads what they missed. */
export async function readQuestion(q: string, read: { slots: Slots | null; raw: string; ms: number }, c: ConvState, target: string | null): Promise<Made> {
  const { slots, raw, ms } = read
  const s0 = refInText(slots?.lang ? slots : { ...(slots ?? { intent: 'unknown' }), lang: guessLang(q) }, q)
  if (s0.phrase) s0.phrase = cleanPhrase(s0.phrase, q)
  // the script says the language even when the model does not know it: Arabic letters, Devanagari
  if (/[؀-ۿ]/.test(q)) s0.lang = 'ar'
  else if (/[ऀ-ॿ]/.test(q)) s0.lang = 'hi'
  // a command word next to a reference ("Jonás 1:3 notas") says what to show, with or without a model
  const shown = kindOf(q)
  if (shown && s0.book && s0.chapter && !(s0.what ?? []).includes(shown[0]!)) Object.assign(s0, { intent: 'passage', what: shown })
  const picked = pickFound(q, s0, c)
  if (picked) {
    const { sheet, ui } = await buildSheet(`q${Date.now()}`, passageOf(picked.hit, picked.what, s0.lang ?? env.nav), env.helpsLang)
    return { sheet, ui, meta: `model ${ms} ms\n${raw}\n(follow-up on the search results)` }
  }
  const asked = introAsked(q, s0.lang ?? env.nav)
  let s = asked ? { ...asked, lang: s0.lang ?? env.nav } : withContext(s0, c.last, q)
  // asked in one language, wanted in another: the book by its code, then the other language's pack and words
  if (target) s = { ...s, book: s.book ? bookCode(s.lang ?? env.nav, s.book) ?? s.book : s.book, lang: target }
  keepState(c, s)
  const { sheet, ui } = await buildSheet(`q${Date.now()}`, s, target ? null : env.helpsLang)
  return { sheet, ui, meta: `model ${ms} ms\n${raw}`, q }
}

// What may stand next to a reference that is only a reference ("muéstrame Rut 2:3", "montre-moi Ruth 2:3 s'il te plaît")
const REF_FILLER = new Set((
  'show me the of please ' + 'muestrame mostrar el la de por favor ' + 'montre moi le du s il te vous plait ' +
  'tunjukkan tolong ' + 'दिखाओ दिखाइए दिखाएँ का की के ' + 'أرني اعرض'
).split(' ').map(fold))
const SHOW_KINDS = ['terms', 'notes', 'questions', 'text', 'intro', 'chapter'] as const
/**
 * The question is only a reference, read by code alone ("Rut 2:3", "Jonás 1:3 notas", "1 Juan 3:2", "योना 1:3"): every word
 * is the book's name, a number, what to show ("notes", "key terms", "intro") or a few filler words. Then the phone's model
 * (about 4 s) and the online reader are skipped. Any other word ("why", "who speaks", "translate", "and Ruth 2:4") keeps
 * them: a wrong skip costs a wrong answer, a missed one only 4 s.
 */
export function directRef(q: string): boolean {
  const lang = /[؀-ۿ]/.test(q) ? 'ar' : /[ऀ-ॿ]/.test(q) ? 'hi' : guessLang(q)
  const s = introAsked(q, lang) ?? refInText({ intent: 'unknown', lang }, q)
  const code = s.book && s.chapter ? bookCode(s.lang ?? lang, s.book) : null
  if (!code) return false
  // the words of the book's name as the question wrote it ("1 Juan": "Juan" alone would be John)
  const name = new Set(fold(s.book!).split(/\s+/))
  let rest = q
  for (const c of SHOW_KINDS) rest = rest.replace(new RegExp(pattern(c).source, 'giu'), ' ')
  const words = rest.replace(/[¿?!¡.,;«»"“”'’()؟،-]/g, ' ').split(/\s+/).filter(Boolean)
  return words.every((w) => /^[\d०-९٠-٩:.–-]+$/.test(w) || name.has(fold(w)) || bookExact(w) === code || REF_FILLER.has(fold(w)))
}

// ------------------------------------------------------------------------------------- training questions -> Translation Academy
// "How do I translate idioms?", "What book should I translate first?", "How do I set up a translation team?": questions about
// translating a kind of thing, or about starting, the team, checking. They get the Translation Academy article (all four manuals)
// that their words name: a hand list of words per language (data/ta-synonyms.json), or every word of an article's title.
// Only when the question has a training word (a cue) and one article clearly wins; otherwise the other routes answer as before.
type SynData = { cues: Record<string, string>; stop: string; ids: Record<string, Record<string, string[]>> }
const SYN = taSynonyms as unknown as SynData
/** A word as this route compares it: folded, a final s dropped (idioms = idiom, modismos = modismo), Arabic without its article. */
export function taStem(w: string): string {
  let s = fold(w)
  if (/^[a-z]{4,}$/.test(s) && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1)
  if (/^و?ال[ء-ي]{3,}$/.test(s)) s = s.replace(/^و?ال/, '')
  return s
}
const taTokens = (t: string): string[] => fold(t).split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean).map(taStem)
/** One word of an entry: `traduc*` is a beginning, `idioms|modisms` either word. */
type Slot = { w: string; prefix: boolean }[]
const slotOf = (spec: string): Slot =>
  spec.split('|').map((a) => (a.endsWith('*') ? { w: fold(a.slice(0, -1)).replace(/^ال(?=[ء-ي]{3})/, ''), prefix: true } : { w: taStem(a), prefix: false }))
const slotHas = (slot: Slot, t: string) => slot.some((a) => (a.prefix ? t.startsWith(a.w) : t === a.w))
const CUES: Slot = Object.values(SYN.cues).flatMap((l) => l.split(/\s+/).filter(Boolean)).flatMap(slotOf)
/** `ordered`: an entry written "=translat* team" holds only with its words in that order, at most one word between two. */
const ENTRIES: { id: string; slots: Slot[]; spec: string; ordered: boolean }[] = Object.entries(SYN.ids).flatMap(([id, byLang]) =>
  Object.values(byLang).flat().map((spec) => ({ id, spec, ordered: spec.startsWith('='), slots: spec.replace(/^=/, '').split(/\s+/).filter(Boolean).map(slotOf) })))
/** Whether the slots stand in order in `toks`, from position `i`, with at most one word between two. */
function inOrder(slots: Slot[], toks: string[], i: number): boolean {
  if (!slots.length) return true
  if (!toks[i] || !slotHas(slots[0]!, toks[i]!)) return false
  return slots.length === 1 || [i + 1, i + 2].some((j) => inOrder(slots.slice(1), toks, j))
}
const TA_STOP = new Set(SYN.stop.split(/\s+/).filter(Boolean).map(taStem))
/** The words of a title or question that count: no small words, no "how", "translate", "Bible"… */
const taContent = (ws: string[]) => ws.filter((w) => !TA_STOP.has(w) && !/^\d+$/.test(w) && (w.length >= 3 || (/[^\x00-\x7f]/.test(w) && w.length >= 2)))
/** The names of every Translation Academy article of a pack (titles and subtitles), as content words. */
const taTitles = new WeakMap<object, Promise<{ id: string; words: string[] }[]>>()
async function titlesOf(lang: string): Promise<{ id: string; words: string[] }[]> {
  const r = await openLang(lang)
  if (!taTitles.has(r))
    taTitles.set(r, (async () => {
      const core = ((await r.maps()) as any).map?.core ?? {}
      const out: { id: string; words: string[] }[] = []
      const add = (id: string, name: unknown) => {
        const words = taContent(taTokens(String(name ?? '').replace(/\(.*?\)/g, ' ')))
        if (id.startsWith('ta:') && words.length) out.push({ id, words })
      }
      for (const [id, ns] of Object.entries((core.names ?? {}) as Record<string, string[]>)) for (const n of ns) add(id, n)
      for (const [id, sub] of Object.entries((core.subtitles ?? {}) as Record<string, string>)) add(id, sub)
      return out
    })())
  return taTitles.get(r)!
}
/**
 * Whether a pack can show a Translation Academy article: read it, not only its name. Older packs list the names of all four
 * manuals in their maps but carry only the translate manual ("not installed on this device" for "set up a team").
 */
async function hasTa(lang: string, id: string): Promise<boolean> {
  if (!(await hasLang(lang))) return false
  try {
    return !!(await (await openLang(lang)).article(id, 'all')).data?.sections.length
  } catch {
    return false
  }
}

export type TaMatch = { id: string; score: number; how: string }
/**
 * The Translation Academy article a training question asks for, or null when it is not one or no article clearly wins.
 * `packs`: the packs whose titles are compared (the question's first). A word-list entry counts when its words stand
 * within three words of each other, and scores its number of words (half more when they stand together); a title scores its
 * number of words, when every one of them is in the question and at most one other word is. Either way, another word of the
 * question that names a Translation Words article cancels the match: "the team of horses", "first fruits", "the name Yahweh".
 */
export async function academyFor(q: string, packs: string[], ui = 'en', needCue = true): Promise<TaMatch | null> {
  const toks = taTokens(q)
  // `needCue` false: a free search that found no verse with its words ("metaphors in Jonah") may still name an article
  if (needCue && !toks.some((t) => slotHas(CUES, t)) && !has('howTranslate', q)) return null
  // a book named in the question's language or English ("How do I start translating Ruth?"): the passage and book routes
  // know better (not any language's: "nombres" is Numbers in French)
  const tables = bookTables as Record<string, Record<string, string>>
  if (q.split(/[^\p{L}\p{M}\d]+/u).some((w) => w.length > 2 && [ui, 'en'].some((l) => tables[l]?.[fold(w)]))) return null
  const asked = new Set(taContent(toks))
  const twName = new Map<string, boolean>()
  const namesTw = async (w: string) => {
    if (!twName.has(w)) twName.set(w, !!(await articleForQuestion(w))?.length)
    return twName.get(w)!
  }
  /** Whether the words of the question besides `used` (and its words of translating) name no Translation Words article. */
  const noTwBesides = async (used: (t: string) => boolean) => {
    for (const w of asked) if (!used(w) && !slotHas(CUES, w) && !SITUATION.has(w) && (await namesTw(w))) return false
    return true
  }
  const best = new Map<string, TaMatch>()
  const offer = (m: TaMatch) => { if ((best.get(m.id)?.score ?? 0) < m.score) best.set(m.id, m) }
  for (const e of ENTRIES) {
    const n = e.slots.length
    // every word within a window of n + 3 words ("translate … first", not "first" at the other end of the question)
    const near = e.ordered ? toks.some((_, i) => inOrder(e.slots, toks, i)) : toks.some((_, i) => e.slots.every((s) => toks.slice(i, i + n + 3).some((t) => slotHas(s, t))))
    if (!near || !(await noTwBesides((t) => e.slots.some((s) => slotHas(s, t))))) continue
    const together = toks.some((_, i) => e.slots.every((s, k) => toks[i + k] !== undefined && slotHas(s, toks[i + k]!)))
    offer({ id: e.id, score: n + (together && n > 1 ? 0.5 : 0), how: `words "${e.spec}"` })
  }
  for (const pl of packs) {
    for (const t of await titlesOf(pl).catch(() => [])) {
      if (!t.words.every((w) => asked.has(w))) continue
      const extra = [...asked].filter((w) => !t.words.includes(w))
      if (extra.length > 1 || (extra.length === 1 && (await articleForQuestion(extra[0]!))?.length)) continue
      offer({ id: t.id, score: t.words.length, how: `title [${t.words.join(' ')}] in ${pl}` })
    }
  }
  const ranked = [...best.values()].sort((a, b) => b.score - a.score)
  if (!ranked.length || (ranked[1] && ranked[1].score === ranked[0]!.score)) return null
  return ranked[0]!
}

/** The related articles to show as buttons: those the article's own text links to first, then the others, the same manual first. */
async function relatedOf(lang: string, id: string, max = 3): Promise<{ id: string; title: string }[]> {
  const r = await openLang(lang)
  const group = id.slice(0, id.lastIndexOf('/'))
  const art = ((await r.articles(group)) ?? []).find((a: any) => a.id === id) as any
  const rel: string[] = art?.related ?? []
  if (!rel.length) return []
  const text = (art.sections ?? []).map((x: any) => String(x.md ?? '')).join('\n')
  const manual = group.slice(3)
  // [Choosing a Team](../choose-team/01.md), (../../process/setup-team/01.md): the ids the text links to, in order
  const linked = [...text.matchAll(/\]\((?:\.\.\/)+(?:([a-z]+)\/)?([\w-]+)\/01\.md\)/g)].map((m) => `ta:${m[1] ?? manual}/${m[2]}`)
  const rank = (x: string) => (linked.includes(x) ? linked.indexOf(x) : 100 + (x.startsWith(group + '/') ? 0 : 100))
  const names = ((await r.maps()) as any).map?.core?.names ?? {}
  return [...rel].sort((a, b) => rank(a) - rank(b)).filter((x) => names[x]?.length).slice(0, max).map((x) => ({ id: x, title: String(names[x][0]) }))
}
const clipTo = (s: string, n: number): string => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + ' …' : s)
// the sentence before the article
const TA_T: Record<string, string> = {
  en: 'Translation Academy has an article about this:', es: 'Translation Academy tiene un artículo sobre esto:',
  fr: 'Translation Academy a un article à ce sujet :', id: 'Translation Academy punya artikel tentang ini:',
  hi: 'Translation Academy में इस पर एक लेख है:', ar: 'في Translation Academy مقالة عن هذا:',
}

// -------------------------------------------------------------------------------------------------------------- the answer

export type Follow = { label: string; sheet: Sheet }
/** An answer as data: main.ts draws it (and adds the online answer, the thumbs, the report). */
export type Reply = {
  text?: string; intro?: string | null; info?: string; follow?: Follow[]; meta?: string; ui?: string
  /** the passage drawn with tappable words (kept for the last messages only); lang: the pack the answer came from; ctx: its article */
  study?: Study; lang?: string; ctx?: string
  /** the notes and questions a free search found, each opened whole in the panel */
  helps?: { head: string; items: HelpItem[] }[]
  /** nothing could be answered: a link to About, which says what the app can and cannot do */
  limits?: boolean
  /** no language on the phone, or not the one asked in: a button to the languages view */
  packs?: boolean
}
/** The answer, what kind it was (for the usage counts), and what tests check: the route-table step that made it, its target, how many sources it shows. */
export type Answered = {
  reply: Reply; answered: string; route: string
  /** the passage or article the answer is about, and how many sources it shows (cited helps, verses found, options) */
  ref: string | null; concept: string | null; found: number
  /** the sheet whose passage context online AI may get (when the answer came from a call sheet) */
  sheet: Sheet | null
}
/** What the routes work on: the question's sheet as it goes, and what earlier routes added to it. */
type Ctx = Made & {
  c: ConvState; t0: number; others: Follow[]; searched: string
  /** the call sheet's answer, once the `sheet` route has run */
  r?: Result
}
type Done = Omit<Answered, 'route' | 'sheet'>
/** A step of the answer: when it applies, and what it does. A step returns the answer, or null to let the next step go on. */
type Route = { name: string; when: (x: Ctx) => boolean; run: (x: Ctx) => Promise<Done | null> }

const secs = (x: Ctx) => ((performance.now() - x.t0) / 1000).toFixed(1)
const hitLabel = (ui: string, h: Hit) => `${bookLabel(ui, h.book)} ${h.ch}:${h.v}`
const hitSheet = async (h: Hit, what: string[], ui: string) => (await buildSheet(`h${Date.now()}`, passageOf(h, what, ui), env.helpsLang)).sheet

/** A free search's best verse holds this much of the rarity of its words (or all of them): the verses are the answer. */
const GOOD = GOOD_COVERAGE
/** Below this, verses with some of the words are not shown: they would be unrelated (search.ts, Strength.coverage). */
const RELAX = 0.4
/**
 * No verse holds the words of a free search well: an article all of them name (Translation Words, "kinsman redeemer"), a
 * Translation Academy article (its title or listed words, without asking for a word of training: "metaphors in Jonah"), a
 * book or chapter introduction that holds every word ("What marriage custom is in Ruth?"). The sheet becomes that one (the next
 * steps answer it); false when none.
 */
async function findBeyondVerses(x: Ctx, words: string[]): Promise<boolean> {
  if (!words.length) return false
  const base = { ...x.sheet, candidates: null, term: null, phrase: null } as Sheet
  const ids = (await articleForQuestion(words.join(' ')))?.filter((id) => id.startsWith('tw:'))
  if (ids?.length === 1) {
    x.sheet = { ...base, intent: 'article', concept: ids[0]!, ref: null, what: [] } as Sheet
    x.searched += `\nfindall: article ${ids[0]}`
    return true
  }
  const packs: string[] = []
  for (const l of new Set([x.sheet.lang, 'en'])) if (await hasLang(l)) packs.push(l)
  const ta = await academyFor(x.q!, packs, x.ui, false)
  if (ta) {
    for (const l of [x.sheet.lang, 'en', ...(await installedLangs())]) {
      if (!(await hasTa(l, ta.id))) continue
      x.sheet = { ...base, intent: 'article', concept: ta.id, lang: l, ref: null, what: [] } as Sheet
      x.searched += `\nfindall: academy ${ta.id} (${ta.how})`
      return true
    }
  }
  const intro = await introFor(x.q!, x.sheet.lang)
  if (intro) {
    x.sheet = { ...base, intent: 'passage', concept: null, ref: intro.ref, what: ['intro'], lang: intro.lang } as Sheet
    x.searched += `\nfindall: introduction ${intro.ref}`
    return true
  }
  return false
}

/** The answer's steps, in order: the first that returns an answer wins (`sheet`, `name-verses` and `options` build the last one). */
export const ROUTES: Route[] = [
  {
    // "How do I translate idioms?", "What book should I translate first?", "How do I set up a translation team?": the Translation
    // Academy article the question's words name (academyFor), with its related articles as buttons. Only with no passage and no
    // article read yet, and only when one article clearly wins: otherwise the next steps answer as before.
    name: 'academy',
    when: ({ q, sheet }) => q !== undefined && !sheet.ref && !sheet.concept && !sheet.candidates?.length &&
      ['unknown', 'search', 'article', 'advice'].includes(sheet.intent) && !has('translateBook', q) && !has('noWord', q) && !has('whichBooks', q),
    run: async (x) => {
      const { sheet, ui, q } = x
      const packs: string[] = []
      for (const l of new Set([sheet.lang, 'en'])) if (await hasLang(l)) packs.push(l)
      const m = await academyFor(q!, packs, ui)
      if (!m) return null
      // the article from the question's pack, else the first pack that has it (the Indonesian pack has half the manual)
      let lang: string | null = null
      for (const l of [sheet.lang, 'en', ...(await installedLangs())]) if (await hasTa(l, m.id)) { lang = l; break }
      if (!lang) return null
      const asked = { ...sheet, id: `a${Date.now()}`, intent: 'article', concept: m.id, lang, ref: null, what: [], phrase: null, candidates: null, term: null } as Sheet
      const r = await answerSheet(asked)
      let info = r.answer
      // the intro, process and checking articles have no "description": their whole text, not only its first part
      const a = (await (await openLang(lang)).article(m.id, 'all')).data
      if (a && !a.sections.some((s) => s.role === 'description')) {
        const parts = r.answer.split('\n\n')
        const src = parts.length > 1 && parts.at(-1)!.startsWith('*') ? parts.at(-1)! : ''
        const shown = a.sections.filter((s) => s.role !== 'word-data' && String(s.md ?? '').trim())
        const body = shown.map((s) => (s.title && shown.length > 1 ? `**${s.title}**\n\n` : '') + clean(s.md)).join('\n\n')
        // "Choosing What to Translate" ends with its advice (start with Open Bible Stories): about 4,700 characters
        info = [parts[0], clipTo(body, 5000), src].filter(Boolean).join('\n\n')
      }
      const follow = (await relatedOf(lang, m.id).catch(() => [])).map((o) =>
        ({ label: o.title, sheet: { ...asked, id: `f${Date.now()}`, concept: o.id } as Sheet }))
      return {
        answered: 'article', ref: null, concept: m.id, found: r.cites.length,
        reply: { intro: TA_T[ui] ?? TA_T.en!, info, follow, ui, lang, ctx: m.id,
          meta: `${env.details} · ${secs(x)} s\n${x.meta}\nacademy: ${m.id} (${m.how}, score ${m.score})` },
      }
    },
  },
  {
    // "¿Cómo traduzco cordero si en mi pueblo solo hay llamas?": the article of the term, then "Translate Unknowns" (tA); the
    // passage's helps as a button when the question names one. Only when the question names an article: otherwise as usual.
    name: 'translate-unknown',
    when: ({ q }) => q !== undefined && (has('howTranslate', q) || has('noWord', q)) && !has('translateBook', q),
    run: async (x) => {
      const { sheet, ui, q } = x
      // the model's own term first ("…no sheep. How do I translate lamb?" -> lamb), then the question's words
      const id = (sheet.concept?.startsWith('tw:') ? sheet.concept : null) ?? await termArticle(q!, ui)
      // with no article for the thing ("pez grande"), "there is no … where I live" still wants "Translate Unknowns"
      if (!id && !(has('noWord', q!) && sheet.ref)) return null
      const base = { ...sheet, id: `t${Date.now()}`, ref: null, what: [], phrase: null, candidates: null, term: null } as Sheet
      const art = id ? await answerSheet({ ...base, intent: 'article', concept: id }) : null
      const ta = await answerSheet({ ...base, intent: 'article', concept: 'ta:translate/translate-unknown' })
      const follow = sheet.ref ? [{ label: TT(ui).all.replace('{ref}', refLabelOf(ui, sheet.ref)), sheet: { ...sheet, id: `p${Date.now()}`, intent: 'passage', what: ['text', 'notes'], phrase: null } as Sheet }] : []
      return {
        answered: 'translate-unknown', ref: sheet.ref, concept: id ?? 'ta:translate/translate-unknown', found: (art?.cites.length ?? 0) + ta.cites.length,
        reply: { intro: TT(ui).unknown, info: art ? `${art.answer}\n\n${ta.answer}` : ta.answer, ui, lang: sheet.lang, follow,
          meta: `${env.details} · ${secs(x)} s\n${x.meta}\ntranslate unknowns: ${id ?? '(no article)'}` },
      }
    },
  },
  {
    // "¿Qué significa «redentor» en Rut 4?": the article of the term and where it is in the passage, not the whole passage
    // (not when it quotes a phrase of the verse: "Rut 3:9 qué quiere decir «extiende tu manto…»" wants the notes on that phrase)
    name: 'meaning',
    when: ({ q, sheet }) => q !== undefined && !!sheet.ref && has('meaning', q) && ['passage', 'advice'].includes(sheet.intent) && !(sheet.intent === 'advice' && sheet.phrase),
    run: async (x) => {
      const { sheet, ui } = x
      const id = await termArticle(x.q!, ui)
      if (!id) return null
      const art = await answerSheet({ ...sheet, id: `a${Date.now()}`, intent: 'article', concept: id, ref: null, what: [], phrase: null, candidates: null, term: null } as Sheet)
      const where = await linkedVerses(sheet.ref!, id, sheet.lang ?? 'en')
      const label = refLabelOf(ui, sheet.ref!)
      const passage = { ...sheet, id: `p${Date.now()}`, intent: 'passage', what: ['text', 'notes', 'questions', 'terms'], phrase: null } as Sheet
      return {
        answered: 'meaning', ref: sheet.ref, concept: id, found: art.cites.length,
        reply: { info: art.answer + (where.length ? `\n\n${TT(ui).inRef.replace('{ref}', label).replace('{list}', where.join(', '))}` : ''),
          ui, lang: sheet.lang, follow: [{ label: TT(ui).all.replace('{ref}', label), sheet: passage }],
          meta: `${env.details} · ${secs(x)} s\n${x.meta}\nmeaning: ${id} in ${sheet.ref}` },
      }
    },
  },
  {
    // "What books of the Bible mention grace?": every book with the verses that use the term (not a search on "mention"),
    // when what is left of the question names one article; otherwise the question goes on as usual
    name: 'books',
    when: ({ q }) => q !== undefined && has('whichBooks', q),
    run: async (x) => {
      const { sheet, ui, q } = x
      const ids = await articleForQuestion(keywords(q!).join(' '))
      if (ids?.length !== 1) return null
      const r = await booksWith(ids[0]!, sheet.lang ?? 'en')
      const article = { ...sheet, id: `f${Date.now()}`, intent: 'article', concept: ids[0]!, candidates: null, term: null } as Sheet
      return {
        answered: 'books', ref: null, concept: ids[0]!, found: r.cites.length,
        reply: { info: r.answer, ui, lang: sheet.lang, follow: [{ label: keywords(q!).join(' '), sheet: article }],
          meta: `${env.details} · ${secs(x)} s\n${x.meta}\nbooks with ${ids[0]}` },
      }
    },
  },
  {
    // "Who was John the Baptist?": the article, when the words after "who was" name one (the sheet changes; the steps go on)
    name: 'article-for-question',
    when: ({ q, sheet }) => q !== undefined && !sheet.ref && ['unknown', 'search', 'article', 'advice', 'passage'].includes(sheet.intent) && !sheet.concept,
    run: async (x) => {
      const ids = await articleForQuestion(x.q!)
      if (ids?.length) x.sheet = { ...x.sheet, intent: ids.length === 1 ? 'article' : 'choose', concept: ids.length === 1 ? ids[0]! : null, candidates: ids.length > 1 ? ids : null, term: null }
      return null
    },
  },
  {
    // An open question: the verses with its words, ranked by their rarity (search.ts), and the notes and questions that have
    // them. "Where does X happen?": the best verse first, whole. With what to show ("notes about Jonah swallowed by the fish"),
    // the best verse's notes instead. When no verse holds the words well (findBeyondVerses): an article all the words name
    // (Translation Words, Translation Academy), a book or chapter introduction that holds them all, the notes and questions that
    // do, the verses with the rarest of them, an article one word names; and when nothing fits, what was searched and other ways
    // to ask, never something unrelated just to fill the space.
    name: 'search',
    when: ({ q, sheet }) => q !== undefined && isOpen(q, sheet),
    run: async (x) => {
      const { c, ui } = x
      const q = x.q!
      const res = await searchVerses(q, x.sheet.term, x.sheet.lang)
      // a where-question read as a book ("¿Dónde fue tragado Jonás…?" -> Jonah): that book's verses first
      const scope = x.sheet.ref && /^[1-3]?[a-z]{2,3}$/.test(x.sheet.ref) ? x.sheet.ref : null
      if (scope && res.hits.some((h) => h.book === scope)) res.hits = [...res.hits.filter((h) => h.book === scope), ...res.hits.filter((h) => h.book !== scope)]
      const st = res.strength
      const cover = st ? st.coverage : 1
      const good = res.hits.length > 0 && (!st || st.full || cover >= GOOD)
      x.searched = `\nsearch: ${res.how} ${JSON.stringify(res.keywords)} concepts ${JSON.stringify(res.concepts)}` +
        (st ? `\nfindall: ${good ? 'verses' : 'weak'}, coverage ${cover.toFixed(2)}, found ${JSON.stringify(st.matched)}, not ${JSON.stringify(st.missing)}` : '')
      const kind = kindOf(q)
      if (!good && (await findBeyondVerses(x, res.keywords))) return null
      const usable = good || (res.hits.length > 0 && cover >= RELAX)
      // the notes and questions that contain the same words, each a button to its verse's notes or questions
      const helps0 = usable && kind ? [] : await searchHelps(q, x.sheet.lang).catch(() => [])
      // no verse fits: the notes and questions that hold every word, before verses with only some of them
      const helpsFirst = !good && helps0.some((h) => h.all)
      // nothing has the words well ("cebada" with "pueblo" and "traduzco"): the article one of them names, with its verses
      if (!usable && !helpsFirst) {
        const id = await termArticle(q, ui)
        if (id) {
          x.sheet = { ...x.sheet, intent: 'article', concept: id, candidates: null, term: null, ref: null, phrase: null } as Sheet
          x.searched += `\nrescued: ${id}`
          c.found = []
          return null
        }
      }
      const helps = helpsFirst ? helps0.filter((h) => h.all) : helps0
      const hits = helpsFirst ? [] : usable ? res.hits : []
      c.found = hits.map((h) => ({ book: h.book, ch: h.ch, v: h.v }))
      if (hits.length) c.last = await hitSheet(hits[0]!, ['text'], ui)
      // "notes about Jonah swallowed by the fish": straight to the notes of the best verse; the other verses as buttons
      if (kind && hits.length) {
        x.sheet = await hitSheet(hits[0]!, kind, ui)
        for (const h of hits.slice(1, 4)) x.others.push({ label: hitLabel(ui, h), sheet: await hitSheet(h, kind, ui) })
        return null
      }
      const used = res.how === 'concepts' ? (st?.matched.length ? st.matched : res.concepts) : res.how === 'text' ? (hits[0]?.why.slice(5).split(' ') ?? res.keywords) : res.keywords
      const follow: Follow[] = []
      for (const h of hits.slice(0, 4)) follow.push({ label: hitLabel(ui, h), sheet: await hitSheet(h, ['text', 'notes'], ui) })
      const line = (h: (typeof hits)[number], whole = false) => `**${hitLabel(ui, h)}** — ${(whole ? h.full ?? h.text : h.text).replace(/\s+/g, ' ').trim()}`
      // "where does it happen?": the verse it happens in first, whole, then the others
      const where = good && hits.length > 0 && (has('where', q) || asksWhere(q))
      const info = where
        ? [line(hits[0]!, true), ...(hits.length > 1 ? [`### ${FT(ui).others}`, ...hits.slice(1).map((h) => line(h))] : [])].join('\n\n')
        : hits.map((h) => line(h)).join('\n\n')
      const words = res.keywords.join(' ')
      // each note or question is a row: its snippet as plain text, and a tap opens it whole in the panel
      const groups = (['note', 'question'] as const).map((k) => ({
        head: (k === 'note' ? HT().notes : HT().questions).replace('{w}', words),
        items: helps.filter((h) => h.kind === k).map((h) => ({ ...h, snippet: plainSnippet(h.snippet), ref: hitLabel(ui, h) })),
      })).filter((g) => g.items.length)
      // nothing found, and the question's language is not on the phone: that is why, more likely than the words
      const want = packCode(ui) // the question's language (the sheet's is the pack it fell back to)
      const have = await installedLangs()
      const absent = !hits.length && !helps.length && !have.includes(want)
      // nothing fits well: what was searched, and ways to ask again
      if (!absent && !hits.length && !helps.length) {
        const named = res.keywords.map((w) => bookExact(w)).find((b): b is string => !!b)
        const t = noFit(ui, res.keywords, st?.rarest ?? null, `${bookLabel(ui, named ?? 'jon')} ${named ? '1:1' : '1:17'}`)
        return {
          answered: 'search', ref: null, concept: null, found: 0,
          reply: { ui, intro: t.intro, info: t.info, limits: true, meta: `${env.details} · ${secs(x)} s\n${x.meta}${x.searched}\nfindall: nothing fits` },
        }
      }
      const first = hits[0]
      const partial = !good && hits.length > 0
      return {
        answered: absent ? 'nopack' : 'search', ref: first ? `${first.book} ${first.ch}:${first.v}` : null, concept: null, found: hits.length + helps.length,
        reply: { ui, follow, packs: absent || undefined,
          intro: absent ? NP(ui).missing.replaceAll('{lang}', env.packName(want)).replace('{have}', have.map((l) => env.packName(l)).join(', '))
            : where ? FT(ui).where.replace('{ref}', hitLabel(ui, first!))
            : partial ? FT(ui).partial.replace('{all}', words).replace('{some}', (st?.matched ?? []).join(' '))
            : hits.length || !helps.length ? searchIntro(res.how, used, ui) : HT().onlyHelps.replace('{w}', words),
          info: info || undefined, helps: groups.length ? groups : undefined,
          meta: `${env.details} · ${secs(x)} s\n${x.meta}${x.searched}${helps.length ? `\nhelps: ${helps.length}` : ''}` },
      }
    },
  },
  {
    // the call sheet's own answer (a passage, an article, a count…); the next steps add to it
    name: 'sheet',
    when: () => true,
    run: async (x) => {
      x.r = await answerSheet(x.sheet)
      return null
    },
  },
  {
    // Only a name ("John the Baptist"): the article, and also the verses that mention him (each opens its text and notes)
    name: 'name-verses',
    when: ({ q, sheet }) => q !== undefined && sheet.intent === 'article' && !!sheet.concept && !asksAbout(q),
    run: async (x) => {
      const { sheet, ui } = x
      const hits = (await versesOf([sheet.concept!], sheet.lang)).slice(0, 6)
      if (!hits.length) return null
      x.c.found = hits.map((h) => ({ book: h.book, ch: h.ch, v: h.v }))
      const title = /«([^»]+)»/.exec(intro(sheet, facts, ui) ?? '')?.[1] ?? x.q!
      x.r!.answer += '\n\n### ' + searchIntro('concepts', [title], ui).replace(/[:：]\s*$/, '') + '\n\n' +
        hits.map((h) => `**${hitLabel(ui, h)}** — ${h.text.replace(/\s+/g, ' ').trim()}`).join('\n\n')
      for (const h of hits.slice(0, 4)) x.others.push({ label: hitLabel(ui, h), sheet: await hitSheet(h, ['text', 'notes'], ui) })
      return null
    },
  },
  {
    // "Which John do you mean?": each article as a button
    name: 'options',
    when: (x) => !!x.r?.options?.length,
    run: async (x) => {
      for (const o of x.r!.options!) x.others.push({ label: o.title, sheet: { ...x.sheet, id: `f${Date.now()}`, intent: 'article', concept: o.id, candidates: null, term: null } })
      return null
    },
  },
  {
    // the answer of the call sheet, with the presenting sentence, the passage to tap and the next steps
    name: 'reply',
    when: () => true,
    run: async (x) => {
      const { sheet, ui, r } = x
      const said = intro(sheet, facts, ui)
      const study = await studyOf(sheet).catch(() => null)
      const reply: Reply = { intro: said, info: r!.answer, follow: [...followups(sheet, facts, ui), ...x.others], ui,
        study: study ?? undefined, lang: sheet.lang, ctx: sheet.intent === 'article' ? sheet.concept ?? undefined : undefined,
        meta: `${env.details} · ${secs(x)} s\n${x.meta}${x.searched}\n${JSON.stringify(sheet, null, 1)}` }
      if (sheet.ref && sheet.intent === 'passage') x.c.last = sheet
      return {
        answered: sheet.intent === 'passage' ? (/intro/.test(sheet.ref ?? '') ? 'intro' : 'passage') : sheet.intent,
        ref: sheet.ref, concept: sheet.concept, found: r!.cites.length + (r!.options?.length ?? 0), reply,
      }
    },
  },
]

/** The answer to what a question asks for: the first route that gives one (the conversation keeps the last passage and search results). */
export async function answer(c: ConvState, made: Made, t0: number): Promise<Answered> {
  setUiLang(made.ui)
  const x: Ctx = { ...made, c, t0, others: [], searched: '' }
  for (const route of ROUTES) {
    if (!route.when(x)) continue
    const done = await route.run(x)
    if (done) return { ...done, route: route.name, sheet: x.r ? x.sheet : null }
  }
  throw new Error('no route answered') // `reply` always answers
}
