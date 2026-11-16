// The decisions between the question and the answer, without the page: what a question asks for once its slots are known,
// and which answer it gets. main.ts draws; this decides, so the decisions can be tested under bun (web/tests/).
import { answerSheet, booksWith, clean, facts, linkedVerses, type Result, setQuestion, setUiLang, type Sheet, type Study, studyOf } from './answer'
import { bookCode, bookExact, bookNameWords, buildSheet, endsLongName, fold, idsOf, type Slots } from './sheet'
import { asksWhere, FT, noFit } from './findall'
import { asksIntro, chapterNumber, type Command, has, kindOf, pattern, replyLang, withoutReply } from './commands'
import { articleForQuestion, articlesNamed, asksAbout, GOOD_COVERAGE, introFor, RELAX_COVERAGE, keywords, searchHelps, searchVerses, versesOf, textsOfVerses } from './search'
import { academyLabel, bookLabel, browseStep, type Followup, followups, intro, introLabel, MAX_FOLLOW, nextWords, searchIntro, whatWord } from './converse'
import { learnStep } from './learn'
import { addNode, backLabel, backTarget, drifts, GD, type GNode, type Graph, lastOfSection, newGraph, nextStep, type NodeSheet, nodeOf, passageAt, type Path, pathStartLine, pathWords, place, type Sec, stepOf, stepTarget } from './graph'
import { CANON, hasLang, installedLangs, openLang } from './packs'
import { verseId } from '@bt-synergy/language-pack-v3'
import type { HelpItem } from './view'
import taSynonyms from './data/ta-synonyms.json'
import bookTables from './data/books.json'
import guideWords from './data/guide.json'
import shapes from './data/shapes.json'
import versification from './data/versification.json'

/**
 * What the page tells the decisions: the app's language (the fallback for a question's), the helps language chosen in the
 * menu, the word "details" in the app's language, and a language pack's name (main.ts makes these follow its own state).
 */
export const env = { nav: 'en', helpsLang: null as string | null, details: 'details', packName: (l: string): string => l }

export type Hit = { book: string; ch: number; v: number }
/** What a conversation keeps for the next question (main.ts adds its messages and title). */
/** The verses a free search found, and the words it says it found them by: "say it in English" keeps them (repeatOf). */
export type Found = { hits: Hit[]; how: string; used: string[]; words?: string[] }
export type ConvState = { last: Sheet | null; found?: Hit[]
  /** the compact state of the last question (its sheet, book as a code) that a follow-up is read with, and when */
  state?: { s: Record<string, unknown>; at: number }
  /** the last question asked (without its "reply in …"), to ask it again in another language ("repeat that in Indonesian") */
  prevQ?: string
  /**
   * What the last answer was asked for, once resolved (keepState): the slots (a follow-up already moved to its verse), the
   * button's sheet when it came from a button, and the question typed (none for a button). "In English" asks it again.
   */
  prevResolved?: { slots: Slots; sheet?: Sheet; q?: string; ui?: string; found?: Found }
  /** questionOf made this question a repeat of prevResolved: readQuestion builds it from there, and no reader runs (codeReads) */
  again?: string
  /** the conversation's points and how they join (graph.ts): made by `answer`, saved with the conversation */
  graph?: Graph }

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
// "¿Cómo debo traducir el nombre de Jonás?": the sentence before the name's article and "How to Translate Names"
const TERM_NAME: Record<string, string> = {
  en: 'For a name, this is what the helps say:', es: 'Para un nombre, esto dicen las ayudas:', fr: 'Pour un nom, voici ce que disent les aides :',
  id: 'Untuk sebuah nama, inilah kata bahan bantu:', hi: 'किसी नाम के लिए सहायताएँ यह कहती हैं:', ar: 'بخصوص الأسماء، هذا ما تقوله المساعدات:',
}
export const TT = (ui: string) => ({ ...(TERM_T[ui] ?? TERM_T.en!), name: TERM_NAME[ui] ?? TERM_NAME.en! })
/** "jon 1:17" as the person reads it: "Jonás 1:17". */
export const refLabelOf = (ui: string, ref: string): string => { const [code, rest] = ref.split(' '); return `${bookLabel(ui, code!)}${rest ? ' ' + rest.replace(/^front:intro$/, '') : ''}`.trim() }
/**
 * The one Translation Words article the question's words name, leaving out book names: two words together first ("pez
 * grande"), then each word, exact names before a close spelling ("jueces" ~ "juez").
 */
// the person's own situation ("en mi pueblo solo hay llamas"): never the term they ask about
const SITUATION = new Set('pueblo pueblos idioma lengua cultura comunidad tierra zona region solo village language culture community country area only langue village communaute region seulement desa bahasa budaya daerah hanya conocen conocemos conoce tenemos tienen hay existe existen usan usamos visto saben sabemos know knows have has exist exists see seen connaissons connaissent existe punya mengenal tahu ada'.split(' '))
export async function termArticle(q: string, ui: string): Promise<string | null> {
  // not the words of "what does … mean" nor "here / there" ("Apa arti anak domba di situ?": "arti anak" named Anak)
  let kw = keywords(strip(q, ['here', 'there'])).filter((k) => !bookCode(ui, k) && !bookCode('en', k) && !SITUATION.has(fold(k)) && !MEAN_WORDS.has(fold(k)))
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
/**
 * "¿Cómo debo traducir el nombre de Jonás?": the person's or place's article the question names, a book's name too ("Jonás"
 * is the prophet here, not his book); else the article of the other words (termArticle), without the word "name".
 */
async function nameArticle(q: string, ui: string): Promise<string | null> {
  const t = strip(q.replace(new RegExp(NAME_RE.source, 'giu'), ' '), ['howTranslate'])
  const kw = keywords(t).filter((k) => !SITUATION.has(fold(k)) && !MEAN_WORDS.has(fold(k)))
  const people = [...(await articlesNamed(kw))].filter((id) => id.startsWith('tw:names/'))
  if (people.length === 1) return people[0]!
  return termArticle(t, ui)
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
export function keepState(c: ConvState, s: Slots, from: { q?: string; sheet?: Sheet; ui?: string } = {}) {
  c.prevResolved = { slots: { ...s }, ...from }
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

/** A call sheet as the slots it could have come from (a button's sheet, to keep as the state). */
export function slotsOfSheet(s: Sheet): Slots {
  const m = /^([0-9a-z]{3})(?: (\d+)(?::(\d+)(?:-(\d+))?)?)?/.exec(s.ref ?? '')
  return { intent: s.intent, lang: s.lang, book: m?.[1] ?? null, chapter: m?.[2] ? +m[2] : null, verse_start: m?.[3] ? +m[3] : null,
    verse_end: m?.[4] ? +m[4] : null, what: s.what, term: s.term }
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
// ------------------------------------------------------------------------------------------- follow-ups read by code
// Offline, the phone's model reads the short question alone ("¿Y las notas?" -> unknown, "¿Qué significa cordero ahí?" -> an
// article): code completes it from the conversation's state (book, chapter, verse, which help, the term) when the question
// has no reference of its own and says one of these things, in words of data/commands.json:
//   "and the notes / questions / key words / text?"   the same passage, another help (a count: the same chapter, another help)
//   "the next / previous (verse | chapter)"            the passage after or before
//   "and verse 5? / chapter 3? / 3:5"                  the same book (a count stays a count)
//   "what does X mean here / there / in this verse?"   the term X in the state's passage (the meaning route)
//   "how many times / notes … in this chapter?"        a count in the state's chapter (the state's term, or X)
//   "how do I translate this? / translate this"        the state's passage with its helps (advice on it)
// Anything else is left to the reader: a new reference, a book's name or other words of its own are a new topic.
type StateS = { intent?: string; book?: string; chapter?: number; verse_start?: number; verse_end?: number; what?: string[]; term?: string }
// (the longer phrases first: "combien de fois" before the "de" of `also`, which goes last)
const FU_WORDS: Command[] = ['next', 'previous', 'thisChapter', 'whole', 'here', 'that', 'verse', 'chapter', 'notes', 'questions', 'text', 'terms', 'also']
const strip = (q: string, cs: Command[]) => cs.reduce((t, c) => t.replace(new RegExp(pattern(c).source, 'giu'), ' '), q)
const latinDigits = (q: string) => q.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
// the words of "what does X mean" around the term
const MEAN_WORDS = new Set('mean means meaning significa significan quiere decir veut dire signifie signifient arti maksud अर्थ मतलब معنى يعني تعني'.split(' ').map(fold))
/** "العدد" is both a verse and the book of Numbers: in a follow-up, "والعدد 5" is verse 5. */
const isVerseWord = (w: string) => new RegExp(`^\\s*(?:${pattern('verse').source})\\s*$`, 'iu').test(w)
/** The question names a passage or a book of its own: a new topic, never completed from the state. */
function ownRef(q: string, s0: Slots, lang: string): boolean {
  if (introAsked(q, lang)) return true
  const r = refInText({ intent: 'unknown', lang }, q)
  // "والعدد 5" in a follow-up is verse 5; "سفر العدد 5" and "العدد 5:3" are the book of Numbers
  if (r.book && (!isVerseWord(r.book) || r.verse_start || /سفر\s+و?العدد/.test(q))) return true
  if (s0.book && fold(q).includes(fold(s0.book)) && !isVerseWord(s0.book) && bookCode(lang, s0.book)) return true
  // a book named alone ("and Jonah?"), besides the follow-up's own words ("Dan" is "and" in Indonesian, not Daniel)
  return strip(q, FU_WORDS).split(/[^\p{L}\p{M}\d]+/u).some((w) => w.length > 2 && !!bookExact(w) && !isVerseWord(w))
}
/** The state, when it is fresh (30 minutes). */
const freshState = (c: ConvState): StateS | null => (c.state && Date.now() - c.state.at <= STATE_MS ? (c.state.s as StateS) : null)

/**
 * A follow-up completed from the state: its slots, what kind it was (for the details line), words that may name a term to
 * count, and `counted` when it asks how many verses or chapters the passage has (answered from the text, not a count of helps).
 * The verse and chapter numbers are not checked here: readQuestion checks them against the book (past its end, it says so).
 */
export type FollowUp = { slots: Slots; how: string; termWords?: string[]; counted?: 'verses' | 'chapters' }
/** "3-5", "3 al 5", "3 à 5", "3 sampai 5", "3 से 5", "3 إلى 5" */
const RANGE = () => `\\s*(?:[-–]|${pattern('range').source})\\s*`
/** The numbers of a follow-up: chapter and verses ("1:3-5", "chapter 3 verse 5"), or one number or range with its unit. */
function numbersOf(t: string): { ch?: number; v1?: number; v2?: number; n?: number; n2?: number } | null {
  const m = new RegExp(`(\\d+)\\s*[:.]\\s*(\\d+)(?:${RANGE()}(\\d+))?`, 'iu').exec(t)
  if (m) return { ch: +m[1]!, v1: +m[2]!, v2: m[3] ? +m[3] : undefined }
  const chN = chapterNumber(t)
  const vm = new RegExp(`(?:${pattern('verse').source})\\s*(\\d+)(?:${RANGE()}(\\d+))?`, 'iu').exec(t)
  if (chN !== null && vm) return { ch: chN, v1: +vm[1]!, v2: vm[2] ? +vm[2] : undefined }
  const one = new RegExp(`(\\d+)(?:${RANGE()}(\\d+))?`, 'iu').exec(t)
  if (!one) return null
  if ((t.match(/\d+/g) ?? []).length > (one[2] ? 2 : 1)) return null // more numbers than one range: not read here
  return { n: +one[1]!, n2: one[2] ? +one[2] : undefined }
}
/** A "there" word ("what does lamb mean there?", "वहाँ मेम्ना का क्या अर्थ है?") at the start or the end of the question: not "there was a famine". */
function thereAtEdge(t: string): boolean {
  const toks = t.replace(/[¿?!¡.,;:«»"“”()؟،]/g, ' ').trim()
  const re = pattern('there').source
  return new RegExp(`^(?:${re})`, 'iu').test(toks) || new RegExp(`(?:${re})$`, 'iu').test(toks)
}
export function followUp(q: string, s0: Slots, c: ConvState): FollowUp | null {
  const st = freshState(c)
  const code = st?.book && bookCode('en', st.book) ? st.book : null
  if (!st || !code) return null
  const lang = s0.lang ?? env.nav
  if (ownRef(q, s0, lang)) return null
  const t = latinDigits(q)
  // "the next book", "how many books…": about books, not this passage
  if (has('bookWord', t)) return null
  const rest = keywords(strip(t, ['range', ...FU_WORDS]))
  const kind = kindOf(t)
  const counting = st.intent === 'count' || st.intent === 'rank'
  const ch = st.chapter ?? null
  const v1 = st.verse_start ?? null
  const v2 = st.verse_end ?? null
  const base: Slots = { lang, book: code, chapter: ch, verse_start: v1, verse_end: v2 }
  // what a passage keeps showing: what was asked last, unless that was the terms for one word ("what does lamb mean")
  const shown = kind ?? (st.intent === 'passage' && !st.term ? st.what ?? [] : [])
  const keep = (s: Slots, how: string): FollowUp =>
    ({ slots: counting ? { ...s, intent: st.intent, what: kind ?? st.what ?? ['notes'], term: st.term ?? null } : { intent: 'passage', what: shown, ...s }, how })

  // "what does lamb mean here / there?": the term in the state's passage
  if (has('meaning', t) && (has('here', t) || has('that', t) || thereAtEdge(t)) && ch) {
    const term = keywords(strip(t, ['here', 'there', 'that', 'also'])).filter((w) => !MEAN_WORDS.has(fold(w)))
    const at = { ...base, verse_start: counting ? null : v1, verse_end: counting ? null : v2, intent: 'passage' }
    if (term.length >= 1 && term.length <= 3) return { slots: { ...at, what: ['terms'], term: term.join(' ') }, how: 'meaning here' }
    // "what does it mean here?": the passage's notes
    return term.length ? null : { slots: { ...at, what: ['text', 'notes'] }, how: 'meaning here, no word' }
  }
  // "how many times in this chapter?": a count in the state's chapter, of the state's term or of the word named
  if (has('howMany', t) && ch) {
    const scoped = has('thisChapter', t) || has('here', t) || has('that', t)
    // "how many verses are in this chapter?", "how many chapters are there?": from the text, with nothing else asked
    const unit = strip(t, ['thisChapter'])
    if (has('verse', unit) || has('chapter', unit)) {
      if (keywords(strip(t, ['howMany', 'there', ...FU_WORDS])).length) return null
      return has('verse', unit) ? { slots: { ...base, verse_start: null, verse_end: null, intent: 'passage', what: ['text'] }, how: 'how many verses', counted: 'verses' }
        : { slots: { ...base, chapter: null, verse_start: null, verse_end: null, intent: 'passage', what: ['text'] }, how: 'how many chapters', counted: 'chapters' }
    }
    const words = keywords(strip(t, ['howMany', ...FU_WORDS]))
    if (!scoped && words.length) return null
    const verse = has('that', t) && v1 ? { verse_start: v1, verse_end: v2 } : { verse_start: null, verse_end: null }
    // the state's term ("redeemer"), unless a word of the question names another article (readQuestion looks)
    const term = st.term ?? null
    return {
      slots: { ...base, ...verse, intent: 'count', what: kind ?? (term ? ['terms'] : counting ? st.what ?? ['notes'] : ['notes']), term },
      how: 'count here', termWords: words.length && words.length <= 3 ? words : undefined,
    }
  }
  // "how do I translate this?": the state's passage with all its helps
  if ((has('howTranslate', t) || has('translateThis', t)) && !keywords(strip(t, ['howTranslate', 'translateThis', 'this', ...FU_WORDS])).length)
    return { slots: { ...base, intent: 'advice', what: [] }, how: 'translate this' }
  if (rest.length) return null // other words of its own: a new topic
  const nums = numbersOf(t)
  const last = v2 ?? v1
  // "and the next verse?", "the previous chapter", "the next 3 verses"
  if ((has('next', t) || has('previous', t)) && ch) {
    const fwd = has('next', t)
    if (nums) {
      // only "the next / previous N verses" of a verse
      if (nums.n === undefined || nums.n2 !== undefined || !has('verse', t) || !v1 || nums.n < 1 || nums.n > 50) return null
      return fwd ? keep({ ...base, verse_start: last! + 1, verse_end: last! + nums.n }, `next ${nums.n} verses`)
        : keep({ ...base, verse_start: Math.max(1, v1 - nums.n), verse_end: v1 - 1 }, `previous ${nums.n} verses`)
    }
    const byChapter = (has('chapter', t) && !has('verse', t)) || !v1
    // a verse or chapter past the book's ends is checked by readQuestion (0: before the first)
    if (byChapter) return keep({ ...base, chapter: ch + (fwd ? 1 : -1), verse_start: null, verse_end: null }, fwd ? 'next chapter' : 'previous chapter')
    return keep({ ...base, verse_start: fwd ? last! + 1 : v1! - 1, verse_end: null }, fwd ? 'next verse' : 'previous verse')
  }
  // "and verse 5?", "and verses 3-5?", "¿y el capítulo 3?", "chapter 3 verse 5", "1:3-5"
  if (nums && t.trim().split(/\s+/).length <= 10) {
    if (nums.ch !== undefined) return keep({ ...base, chapter: nums.ch, verse_start: nums.v1!, verse_end: nums.v2 ?? null }, 'chapter and verse')
    const asChapter = (has('chapter', t) && !has('verse', t)) || (!has('verse', t) && !v1)
    if (asChapter) return nums.n2 === undefined ? keep({ ...base, chapter: nums.n!, verse_start: null, verse_end: null }, 'chapter') : null
    return ch ? keep({ ...base, verse_start: nums.n!, verse_end: nums.n2 ?? null }, nums.n2 ? 'verses' : 'verse') : null
  }
  // "the whole chapter"
  if (has('whole', t) && ch) return keep({ ...base, verse_start: null, verse_end: null, ...(counting ? {} : { what: kind ?? ['text'] }) }, 'whole chapter')
  // "and the notes?": the same passage, another help
  if (kind) return keep(base, 'other help')
  return null
}

// What code says when a follow-up goes past the book ("the next verse" after Ruth 4:22), and how many verses or chapters
const EDGE: Record<string, { lastVerse: string; firstVerse: string; firstChapter: string; noChapter: string; noVerse: string; verses: string; chapters: string }> = {
  en: { lastVerse: '{ref} is the last verse of {book}.', firstVerse: '{ref} is the first verse of {book}.', firstChapter: '{book} 1 is the first chapter.',
    noChapter: '{book} has {n} chapters: there is no chapter {ch}.', noVerse: '{book} {ch} has {n} verses: there is no verse {v}.',
    verses: '{book} {ch} has {n} verses.', chapters: '{book} has {n} chapters.' },
  es: { lastVerse: '{ref} es el último versículo de {book}.', firstVerse: '{ref} es el primer versículo de {book}.', firstChapter: '{book} 1 es el primer capítulo.',
    noChapter: '{book} tiene {n} capítulos: no hay capítulo {ch}.', noVerse: '{book} {ch} tiene {n} versículos: no hay versículo {v}.',
    verses: '{book} {ch} tiene {n} versículos.', chapters: '{book} tiene {n} capítulos.' },
  fr: { lastVerse: '{ref} est le dernier verset de {book}.', firstVerse: '{ref} est le premier verset de {book}.', firstChapter: '{book} 1 est le premier chapitre.',
    noChapter: "{book} a {n} chapitres : il n'y a pas de chapitre {ch}.", noVerse: "{book} {ch} a {n} versets : il n'y a pas de verset {v}.",
    verses: '{book} {ch} a {n} versets.', chapters: '{book} a {n} chapitres.' },
  id: { lastVerse: '{ref} adalah ayat terakhir {book}.', firstVerse: '{ref} adalah ayat pertama {book}.', firstChapter: '{book} 1 adalah pasal pertama.',
    noChapter: '{book} memiliki {n} pasal: tidak ada pasal {ch}.', noVerse: '{book} {ch} memiliki {n} ayat: tidak ada ayat {v}.',
    verses: '{book} {ch} memiliki {n} ayat.', chapters: '{book} memiliki {n} pasal.' },
  hi: { lastVerse: '{ref} {book} का अंतिम पद है।', firstVerse: '{ref} {book} का पहला पद है।', firstChapter: '{book} 1 पहला अध्याय है।',
    noChapter: '{book} में {n} अध्याय हैं: अध्याय {ch} नहीं है।', noVerse: '{book} {ch} में {n} पद हैं: पद {v} नहीं है।',
    verses: '{book} {ch} में {n} पद हैं।', chapters: '{book} में {n} अध्याय हैं।' },
  ar: { lastVerse: '{ref} هي الآية الأخيرة في {book}.', firstVerse: '{ref} هي الآية الأولى في {book}.', firstChapter: '{book} 1 هو الأصحاح الأول.',
    noChapter: 'في {book} {n} أصحاحات: لا يوجد أصحاح {ch}.', noVerse: 'في {book} {ch} {n} آية: لا توجد آية {v}.',
    verses: 'في {book} {ch} {n} آية.', chapters: 'في {book} {n} أصحاحات.' },
}
const fillT = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))
/** How many verses each chapter of a book has (chapter -> last verse), from the first text of the first pack that has the book. */
const boundsCache = new Map<string, Promise<Map<number, number> | null>>()
export function boundsOf(code: string): Promise<Map<number, number> | null> {
  if (!boundsCache.has(code)) {
    const p = (async () => {
      for (const l of new Set([env.helpsLang ?? 'en', 'en', ...(await installedLangs())])) {
        try {
          const r = await openLang(l)
          if (!r.installed(`book:${code}`)) continue
          const events = ((await r.book(code)) as any)?.texts?.[0]?.events as [number, string, string][] | undefined
          if (!events?.length) continue
          const out = new Map<number, number>()
          let chN = 0
          for (const [, kind, arg] of events) {
            const m = /^(\d+)(?:-(\d+))?/.exec(String(arg ?? ''))
            if (!m) continue
            if (kind === 'chapter') chN = +m[1]!
            else if (kind === 'verse' && chN) out.set(chN, Math.max(out.get(chN) ?? 0, +(m[2] ?? m[1])!))
          }
          if (out.size) return out
        } catch {}
      }
      return null
    })().catch(() => null)
    boundsCache.set(code, p)
    // nothing found (no pack has the book yet): look again next time, a pack may be added
    p.then((b) => { if (!b && boundsCache.get(code) === p) boundsCache.delete(code) })
  }
  return boundsCache.get(code)!
}
/** After a language is added or removed: the books' chapters and sections are read again (main.ts onPacksChanged). */
export function resetBooks() {
  boundsCache.clear()
  headsCache.clear()
  HAS.clear()
}
/**
 * A follow-up's numbers checked against the book: "the next verse" at a chapter's end is the first of the next chapter, "the
 * previous verse" of verse 1 the last of the chapter before; past the book's ends (or "verse 50", "chapter 9") it says so
 * instead. Returns the slots to answer, or the sentence to answer with. No bounds (the book in no pack): as asked.
 */
async function boundsCheck(fu: FollowUp, ui: string): Promise<{ slots: Slots; note?: undefined } | { note: string }> {
  const s = { ...fu.slots }
  const code = s.book!
  const b = await boundsOf(code)
  if (!b) return { slots: s }
  const T = EDGE[ui] ?? EDGE.en!
  const book = bookLabel(ui, code)
  const nCh = Math.max(...b.keys())
  if (fu.counted === 'chapters') return { note: fillT(T.chapters, { book, n: nCh }) }
  let ch = s.chapter ?? null
  if (fu.counted === 'verses') return ch && b.has(ch) ? { note: fillT(T.verses, { book, ch, n: b.get(ch)! }) } : { slots: s }
  if (ch === null) return { slots: s }
  if (ch < 1) return { note: fillT(T.firstChapter, { book }) }
  if (!b.has(ch)) return { note: fillT(T.noChapter, { book, n: nCh, ch }) }
  let v = s.verse_start ?? null
  if (v === null) return { slots: s }
  let end = s.verse_end ?? null
  if (v < 1) {
    // before verse 1: the last verse of the chapter before
    if (ch === 1) return { note: fillT(T.firstVerse, { ref: `${book} 1:1`, book }) }
    ch -= 1
    v = b.get(ch)!
    end = null
  } else if (v > b.get(ch)!) {
    if (!fu.how.startsWith('next')) return { note: fillT(T.noVerse, { book, ch, n: b.get(ch)!, v }) }
    // the verse after a chapter's last is the first of the next chapter
    if (!b.has(ch + 1)) return { note: fillT(T.lastVerse, { ref: `${book} ${ch}:${b.get(ch)}`, book }) }
    const span = end ? end - v : 0
    ch += 1
    v = 1
    end = span ? 1 + span : null
  }
  end = end ? Math.min(end, b.get(ch)!) : null
  return { slots: { ...s, chapter: ch, verse_start: v, verse_end: end && end > v ? end : null } }
}

/**
 * Whether code alone reads the question as a follow-up of this conversation ("¿Y las notas?", "and the next verse?"): then
 * the phone's model (about 4 s) can be skipped, as for a reference alone (directRef).
 */
export const followUpByCode = (q: string, c: ConvState): boolean =>
  ordinalPick(q) === undefined && !!followUp(q, { intent: 'unknown', lang: /[؀-ۿ]/.test(q) ? 'ar' : /[ऀ-ॿ]/.test(q) ? 'hi' : guessLang(q) }, c)

/** The language of a question when the model did not say: by script, then by common words; else the app's language. */
const COMMON: Record<string, RegExp> = {
  // with no reader (no model yet, offline), these words alone tell the language: also a translator's own words ("Voy a
  // empezar a traducir Jonás" was answered in English on a phone in English)
  en: /\b(the|what|who|how|where|which|does|is|was|help|me|please|verse|notes?|say|says|translate|translating|want|start|on|of)\b/gi,
  es: /\b(el|la|los|las|qu[eé]|qui[eé]n|c[oó]mo|d[oó]nde|cu[aá]l|es|era|ay[uú]dame|por favor|vers[ií]culo|notas?|dice|traducir|traduzco|traduce|voy|vamos|empezar|empiezo|quiero|necesito|libro|puedo|debo|puedes|podr[ií]as|dime|d[ií]melo|decir(?:lo|me)?|mu[eé]strame|mostrar|significa|del|dios|y(?!\s+a\b)|con|por)\b/gi,
  fr: /\b(le|la|les|que|qui|comment|o[uù]|quel|est|était|aide|moi|versets?|notes?|dit|traduire|traduis|traduit|livre|je|veux|dois|peux|commencer|signifie|veut|dire|du|des|et|dieu|il|dans|combien|pourquoi|sur|avec)\b/gi,
  id: /\b(apa|siapa|bagaimana|di mana|yang|adalah|tolong|ayat|catatan|kata|dalam|itu|terjemahkan|menerjemahkan|saya|mau|ingin|kitab|mulai)\b/gi,
}
export function guessLang(q: string): string {
  if (/[؀-ۿ]/.test(q)) return 'ar'
  if (/[ऀ-ॿ]/.test(q)) return 'hi'
  // a tie stays in the app's language ("Que signifie grâce ?" has "que" in French and in Spanish)
  let best = env.nav
  let most = COMMON[env.nav] ? (q.match(COMMON[env.nav]!)?.length ?? 0) : 0
  for (const [l, re] of Object.entries(COMMON)) {
    const n = q.match(re)?.length ?? 0
    if (n > most) {
      most = n
      best = l
    }
  }
  return best
}

// "Voy a empezar a traducir Jonás", "I want to translate Ruth", "Je vais traduire Jonas": about to translate a book (a report
// of Nov 15: the introduction came with no next step). The book's introduction, then how to start (Translation Academy).
const START_BOOK = new RegExp('(?<![\\p{L}\\p{M}])(?:' + [
  "(?:voy|vamos|van|va) a (?:empezar a |comenzar a |iniciar (?:la )?|)tradu(?:cir|ccion)", "(?:empezar|comenzar|empiezo|comienzo|empezamos|comenzamos) (?:a |con )?(?:tradu(?:cir|ccion)|la traducci[oó]n)",
  "quiero (?:empezar a )?traducir", "queremos (?:empezar a )?traducir",
  "(?:i|we) (?:want|plan|need) to (?:start |begin )?translat(?:e|ing)", "(?:i am|we are|i'm|we're) (?:going|about) to (?:start |begin )?translat(?:e|ing)","(?:start|begin|starting|beginning) (?:to )?translat(?:e|ing)",
  "(?:je vais|nous allons|on va) (?:commencer à )?traduire", "(?:commencer|commence) à traduire", "je veux traduire",
  "(?:saya|kami|kita) (?:akan |mau |ingin )?(?:mulai )?menerjemahkan", "mulai menerjemahkan",
  "अनुवाद (?:शुरू|करना चाहता|करना चाहती|करने वाला|करने वाली)", "(?:سأبدأ|سنبدأ|أريد|نريد|سوف) (?:أن )?(?:ب)?(?:ترجمة|أترجم|نترجم)", "سأترجم", "سنترجم",
].join('|') + ')(?![\\p{L}\\p{M}])', 'iu')
/** "how do I translate the name …", "el nombre de …": a question about a name */
const NAME_RE = /(?<![\p{L}\p{M}])(?:names?|nombres?|nom|noms|nama|नाम|اسم|الاسم|أسماء)(?![\p{L}\p{M}])/iu
// the words that may stand around the book's name in "I want to translate the book of Ruth"
const START_FILLER = new Set((
  'the book of i we to now please also ' + 'el libro de del la a ya ahora por favor tambien ' + 'le livre du de la maintenant ' +
  'kitab buku sekarang ' + 'पुस्तक किताब की का अब ' + 'سفر كتاب الآن'
).split(' ').map(fold))
/**
 * The book a question is about starting to translate ("Voy a empezar a traducir Jonás", "I want to translate the book of Ruth"),
 * only when nothing else is left once the start words, the book's exact name and a few small words are taken out: "I want to
 * translate Jonah's prayer", "…Lamb of God in John", "Vamos a traducir la Biblia" ask something else (review of Nov 15).
 */
export function startBookCode(q: string): string | null {
  const tb = new RegExp(pattern('translateBook').source, 'giu')
  const sb = new RegExp(START_BOOK.source, 'giu')
  if (!sb.test(q) && !sb.test(fold(q)) && !has('translateBook', q)) return null
  const t = fold(q.replace(sb, ' ').replace(tb, ' ')).replace(sb, ' ').replace(tb, ' ')
  const words = t.replace(/[¿?!¡.,;:«»"“”؟،]/g, ' ').split(/\s+/).filter((w) => w && !START_FILLER.has(w))
  return words.length && words.length <= 3 ? bookExact(words.join(' ')) : null
}
/** Whether the question is about starting to translate a book ("voy a empezar a traducir Jonás", "how do I translate the book of Ruth?"). */
export const startsBook = (q: string): boolean => !!startBookCode(q) || (has('translateBook', q) && !NAME_RE.test(q))

// ------------------------------------------------------------------------------------------------------- light paths
// "Voy a traducir Rut", "Estoy revisando Jonás 2", "I'm translating Titus 1": the person announces a task on a book. The answer
// is the book's (or the chapter's) introduction, as before, and a path through it starts (graph.ts Path): each answer on it
// says where it is and offers the next step first. Proposed, never imposed: anything can be asked any time.
type Phrases = Record<string, string[]>
const G_DATA = guideWords as unknown as { offTopic: Phrases; weak: Phrases; bible: Phrases; translate: Phrases; review: Phrases }
const anyOf = (p: Phrases) => new RegExp(`(?<![\\p{L}\\p{M}])(?:${Object.values(p).flat().join('|')})(?![\\p{L}\\p{M}])`, 'giu')
const TASK_TRANSLATE = anyOf(G_DATA.translate)
const TASK_REVIEW = anyOf(G_DATA.review)
const PATH_FILLER = new Set('i am we are now the chapter estoy estamos ahora el capitulo je nous suis le chapitre saya kami sedang pasal मैं हम अध्याय أنا نحن الأصحاح'.split(' ').map(fold))
export type PathStart = { book: string; ch: number | null; task: 'translate' | 'review' }
/**
 * The book (and chapter) a person announces working on, only when nothing else is left once the task's words (data/guide.json,
 * and the start words of `startBookCode`), the book's exact name, a chapter number and a few small words are taken out: "I want
 * to translate Jonah's prayer" or "Estoy revisando Jonás 2:3, ¿qué significa…?" ask something else.
 */
export function pathStart(q: string): PathStart | null {
  const t0 = latinDigits(q)
  const test = (re: RegExp) => { re.lastIndex = 0; const a = re.test(t0); re.lastIndex = 0; const b = re.test(fold(t0)); re.lastIndex = 0; return a || b }
  const review = test(TASK_REVIEW)
  const sb = new RegExp(START_BOOK.source, 'giu')
  const tb = new RegExp(pattern('translateBook').source, 'giu')
  if (!review && !test(TASK_TRANSLATE) && !sb.test(t0) && !sb.test(fold(t0)) && !has('translateBook', q)) return null
  const out = (s: string) => s.replace(TASK_REVIEW, ' ').replace(TASK_TRANSLATE, ' ').replace(sb, ' ').replace(tb, ' ')
  const words = out(fold(out(t0))).replace(/[¿?!¡.,;:«»"“”؟،]/g, ' ').split(/\s+/)
    .filter((w) => w && !START_FILLER.has(w) && !PATH_FILLER.has(w) && !new RegExp(`^${pattern('chapter').source}$`, 'iu').test(w))
  // a chapter last ("Jonás 2"); a verse ("Quiero traducir Jonás 1:3") asks for that verse, not a path
  const num = /^(\d+)$/.exec(words[words.length - 1] ?? '')
  const name = num ? words.slice(0, -1) : words
  if (!name.length || name.length > 3) return null
  const book = bookExact(name.join(' '))
  return book ? { book, ch: num ? +num[1]! : null, task: review ? 'review' : 'translate' } : null
}

/** "Introduction to Jonah", "Introducción a Jonás 1", "¿De qué trata el libro de Jonás?": the book or chapter asked about. */
export function introAsked(q: string, lang: string): Slots | null {
  // "Voy a empezar a traducir Jonás" too: the start words and the book's name, nothing else
  if (!asksIntro(q)) {
    const code = startBookCode(q)
    return code ? ({ intent: 'passage', book: code, chapter: null, verse_start: null, verse_end: null, what: ['intro'], lang } as Slots) : null
  }
  const t = q.replace(/[¿?!¡.,;:«»"“”؟]/g, ' ').replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  const words = t.split(/\s+/).filter(Boolean)
  const chFirst = chapterNumber(t)
  // a book's name starts at a word of content or a number ("1 Juan"), never at a small word that is also an abbreviation
  // somewhere: "¿Quién es el autor de Rut?" read "es" as Isaiah (French "Es")
  // (or a name of the question's own language that is also a small word there: "متى", Matthew and "when")
  const content = new Set(keywords(t).map((w) => fold(w)))
  const own = (bookTables as Record<string, Record<string, string>>)[lang] ?? {}
  for (let i = 0; i < words.length; i++) {
    const w = fold(words[i]!)
    if (!/^\d+$/.test(w) && !content.has(w) && !(w.length >= 3 && own[w])) continue
    // a name of several words exactly as a table has it, longest first (as refInText reads one: "Introducción a Hechos de los
    // apóstoles", "प्रेरितों के काम का परिचय"), then up to three words read loosely
    for (let k = Math.min(BOOK_WORDS, words.length - i); k >= 1; k--) {
      const name = words.slice(i, i + k).join(' ')
      const code = k > 3 ? (endsLongName(words[i + k - 1]!) ? bookExact(name) : null) : bookCode(lang, name)
      if (!code) continue
      const ch = /^\d+$/.test(words[i + k] ?? '') ? Number(words[i + k]) : chFirst
      return { intent: 'passage', book: code, chapter: ch, verse_start: null, verse_end: null, what: ['intro'], lang } as Slots
    }
  }
  return null
}

/** The most words a book's name has in the tables ("cantar de los cantares"), and room for a "le livre de" before it. */
const BOOK_WORDS = Math.max(...Object.values(bookTables as Record<string, Record<string, string>>).flatMap((t) => Object.keys(t).map((n) => n.split(' ').length))) + 3
/** A reference written in the question ("Rut 1:16", "1 Juan 3:2") that the model missed: read it by code. */
export function refInText(slots: Slots, q: string): Slots {
  if (slots.book && bookCode(slots.lang ?? env.nav, slots.book) && slots.chapter)
    return !slots.intent || slots.intent === 'unknown' ? { ...slots, intent: 'passage', what: kindOf(q) ?? slots.what ?? [] } : slots
  const ch = pattern('chapter').source
  const t = q
    .replace(new RegExp(`${ch}\\s*(\\d+)\\s+(?:of|de|del|du|dari|का|من)\\s+((?:[123]\\s*)?[\\p{L}][\\p{L}\\p{M}]+)`, 'iu'), '$2 $1')
    .replace(new RegExp(`\\s+${ch}\\s*(\\d+)`, 'iu'), ' $1')
    .replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  // every reference-like match, in order, until one names a book: "Notas de 1 Juan 3:2" first matches "de 1", whose number
  // starts a numbered book, so the reading starts again at that digit ("1 Juan 3:2"); the word before it ("Catatan") is never
  // read as a misspelled book (it was Lamentations, "Ratapan")
  const re = /((?:[123]\s*)?[\p{L}][\p{L}\p{M}.]+(?:\s+(?:de|of|des|du)\s+[\p{L}]+)?)\s+(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?/gu
  const lang = slots.lang ?? env.nav
  let m: RegExpExecArray | null
  let code: string | null = null
  let name = ''
  while (!code && (m = re.exec(t))) {
    if (!m[3] && /^[123]$/.test(m[2]!)) {
      const after = t.slice(m.index + m[0].length).match(/^\s+([\p{L}][\p{L}\p{M}]*)(?:\s+([\p{L}][\p{L}\p{M}]*))?/u)
      if (after && (bookExact(`${m[2]} ${after[1]}`) || (after[2] && bookExact(`${m[2]} ${after[1]} ${after[2]}`)))) {
        re.lastIndex = m.index + m[0].length - m[2]!.length
        continue
      }
    }
    // a name of several words, exactly as a table has it, longest first: the pattern takes one word before the number, so
    // "प्रेरितों के काम 1:8" was "काम", "رؤيا يوحنا 1:1" was John and "Kisah Para Rasul 1:1" nothing. Only when that word ends
    // such a name: this runs on every keystroke (the composer), and most references are one word
    const before = t.slice(0, m.index + m[1]!.length).split(/\s+/).filter(Boolean)
    for (let k = endsLongName(before[before.length - 1] ?? '') ? Math.min(BOOK_WORDS, before.length) : 0; k >= 2 && !code; k--) {
      const n = before.slice(-k).join(' ')
      if (bookExact(n)) {
        name = n
        code = bookCode(lang, n)
      }
    }
    const words = m[1]!.trim().split(/\s+/)
    for (let k = Math.min(3, words.length); k >= 1 && !code; k--) {
      name = words.slice(-k).join(' ')
      code = bookCode(lang, name)
    }
    if (!code) continue
    const what = kindOf(q) ?? slots.what ?? []
    return { ...slots, intent: slots.intent === 'advice' ? 'advice' : 'passage', book: name, chapter: +m[2]!, verse_start: m[3] ? +m[3] : null, verse_end: m[4] ? +m[4] : null, what }
  }
  return slots
}

// The words that may stand next to a book's name in a question that asks for the book itself ("Lee Daniel", "el libro de
// Daniel", "Show me the whole book of Ruth", "la historia de Rut", "Quiero leer Rut", "¿Cuántos capítulos tiene Rut?",
// "Primera carta a los Corintios", "Evangelio de Juan"): no story to search for. With REF_FILLER, SAY_FILLER and the command
// words (storyWords strips those); a plural is read as its singular.
const BOOK_FILLER = new Set((
  'read show open see view whole all complete entire full book books story bible text chapter please now want wants need ' +
  'give get have has contains count number many much first second third gospel letter epistle apostle apostles solomon ' +
  'lee leer leeme ver muestra muestrame mostrarme ensename abre abrir todo toda entero entera completo completa libro historia ' +
  'biblia texto capitulo por favor ahora quiero queremos quisiera necesito dame tiene tienen hay para cuantos cuantas cuanto ' +
  'numero primera primer primero segunda segundo tercera tercero evangelio carta epistola apostol apostoles salomon ' +
  'lis lire montre ouvre voir tout toute entier entiere complet complete livre histoire bible texte chapitre maintenant veux ' +
  'voudrais combien nombre premiere premier deuxieme seconde troisieme evangile lettre epitre apotre apotres ' +
  'baca bacakan buka lihat tampilkan semua seluruh lengkap kitab buku cerita kisah alkitab teks pasal sekarang mau ingin ' +
  'berapa jumlah ada pertama kedua ketiga injil surat rasul ' +
  'पढ़ें पढ़ो पढ़िए दिखाओ दिखाइए पूरा पूरी पुस्तक किताब कहानी बाइबल पाठ अध्याय कितने कितनी पहला पहली दूसरा दूसरी तीसरा पत्र सुसमाचार चाहता चाहती ' +
  'اقرأ اعرض أرني افتح كل كامل كاملا سفر كتاب قصة المقدس نص أصحاح كم عدد أريد اريد الأولى الاولى الثانية الثالثة رسالة إنجيل انجيل'
).split(' ').map(fold))
const STORY_STRIP: Command[] = ['intro', 'overview', 'about', 'tell', 'notes', 'questions', 'terms', 'text', 'whole', 'chapter', 'verse', 'bookWord', 'howMany', 'again', 'replyVerb', 'this', 'here', 'also']
const isFiller = (w: string): boolean => {
  const f = fold(w)
  // a plural as its singular ("capítulos", "apóstoles"), never down to a small word: "toes" is not "to" ("Daniel toes" is no book)
  const singular = [f.replace(/es$/, ''), f.replace(/s$/, '')].filter((x) => x !== f && x.length >= 4)
  return [f, ...singular].some((x) => BOOK_FILLER.has(x) || SAY_FILLER.has(x) || REF_FILLER.has(x) || START_FILLER.has(x))
}
/**
 * The words of a question beyond the books it names and the words that ask for a book ("Lee Daniel" has none; "Daniel en el
 * foso de los leones" has "foso", "leones"). `code`: the book read; every word of its names in any language goes too
 * ("Hechos de los apóstoles", "Gospel of John", "Kisah Para Rasul").
 */
export function storyWords(q: string, code?: string): string[] {
  const words = latinDigits(q).replace(/[¿?!¡.,;:«»"“”؟،()]/g, ' ').split(/\s+/).filter(Boolean)
  const own = code ? bookNameWords(code) : new Set<string>()
  const book = words.map((w) => own.has(fold(w)) || own.has(fold(w).replace(/^ال/, '')))
  for (let i = 0; i < words.length; i++)
    // (a name of several words only when its last word ends one: the longest-name reading of refInText)
    for (let k = Math.min(BOOK_WORDS, words.length - i); k >= 1; k--)
      if (k === 1 || endsLongName(words[i + k - 1]!))
        if (bookExact(words.slice(i, i + k).join(' '))) { for (let j = i; j < i + k; j++) book[j] = true; break }
  const rest = strip(words.filter((_, i) => !book[i]).join(' '), STORY_STRIP)
  return keywords(rest).filter((w) => !isFiller(w) && !/^\d+$/.test(w))
}
/** A passage read as a whole book (no chapter) whose question names more than the book: a story to find in it. */
const bookStory = (q: string, sheet: Sheet): boolean =>
  sheet.intent === 'passage' && !!sheet.ref && /^[1-3]?[a-z]{2,3}$/.test(sheet.ref) && storyWords(q, sheet.ref).length >= 1

/** An open question: the model said search, or there is no reference and the question names things ("where does Abraham…"). */
export function isOpen(q: string, sheet: Sheet): boolean {
  if (sheet.intent === 'search') return true
  // "¿Dónde fue tragado Jonás por un pez?" read as the book of Jonah (a report of Nov 14: the answer told the story, not
  // the verse): where in the book, when the question names more than the book
  if (sheet.ref && /^[1-3]?[a-z]{2,3}$/.test(sheet.ref) && sheet.intent === 'passage' && has('where', q))
    return keywords(q).filter((w) => !bookExact(w)).length >= 1
  // "Daniel en el foso de los leones" read as the book of Daniel (a report of Nov 15: the whole book came, 357 verses): a story
  // in the book, searched there (the search route falls back to the book when it finds nothing there)
  if (bookStory(q, sheet)) return true
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

// What may stand around "in English" when the person only asks to have the last answer in that language ("¿Me lo puedes decir
// en inglés?", "Puedes decirlo en inglés", "Can you say that in Spanish?", "Tu peux me le dire en anglais ?", "Bisa katakan itu
// dalam bahasa Inggris?", "क्या आप इसे अंग्रेज़ी में बता सकते हैं?", "هل يمكنك أن تقولها بالإنجليزية؟"): a report of Nov 16 searched «puedes»
const SAY_FILLER = new Set((
  'can could would you please say it that this tell me show give write answer reply now again same the and ok in to ' +
  'me lo la eso esto puedes puede podrias podria podes decir decirlo decirmelo dimelo dilo dime decirme mostrar mostrarlo muestramelo escribir escribelo escribirlo ' +
  'repetir repitelo darmelo damelo ahora tambien y por favor en otra vez de nuevo lo mismo se ' +
  'repites repiteme repetirlo repetirmelo dices das explicas explicalo explicamelo explicar explicarlo explain explaining repeat ' +
  'tu vous peux pouvez pourrais pourriez le dire me moi dis dites montre montrez ecris ecrivez ca cela s il te plait et maintenant aussi en ' +
  'explique expliquez expliquer redis redites redire repete repetez ' +
  'bisa bisakah dapatkah tolong katakan katakanlah sampaikan tulis tuliskan itu ini jawab kamu anda coba ulangi lagi dan sekarang dalam juga ' +
  'क्या आप तुम इसे यह वह बता बताइए बताओ बताएँ बताएं सकते सकती हैं हो कहें कहिए कहो लिखें लिखिए फिर से मुझे कृपया और भी ' +
  'هل يمكنك ممكن تستطيع أن ان تقول تقولها تقوله قل قلها قله لي ذلك هذا هذه اكتب اكتبها اكتبه من فضلك أعد اعد مرة أخرى اخرى و أيضا ايضا'
).split(' ').map(fold))
/** Nothing left but the words of "can you say it" (each folded word is in SAY_FILLER): only a request to say it again. */
const onlySayIt = (q: string): boolean => q.replace(/[¿?!¡.,;:«»"“”'’()؟،-]/g, ' ').split(/\s+/).filter(Boolean).every((w) => SAY_FILLER.has(fold(w)))

/**
 * "… Reply in Indonesian", "Ruth 2:3 in English" (the helps in that language, the rest read as usual); "Repeat your last answer
 * in Indonesian", "¿Me lo puedes decir en inglés?", "in English?" (the last question again, its helps in that language). The
 * reply's own words stay in the question's language: a language named is the helps' (a report of Nov 16 came out in English).
 */
export function questionOf(q0: string, c: ConvState): { q: string; target: string | null } {
  const target = replyLang(q0)
  const rest = target ? withoutReply(q0) : q0
  let q = rest || q0
  // ("and the notes in Spanish?" is not a repeat: it asks for the notes; "Dímelo en francés" leaves nothing: it is one). The
  // last answer may have come from a button: then there is no question to repeat, only what it was asked for (prevResolved)
  if (target && (c.prevQ || c.prevResolved) && (!rest || has('again', q) || onlySayIt(q) || (!keywords(q).length && !kindOf(q))))
    q = c.again = c.prevResolved?.q ?? c.prevQ ?? q
  else {
    c.prevQ = q
    delete c.again
  }
  return { q, target }
}

/** What a question asks for, from what a reader made of it: the call sheet, the app language it is answered in, the details line. */
export type Made = { sheet: Sheet; ui: string; meta: string; q?: string
  /** going back to this point of the graph (returnTo): the answer is attached to it, no new point */
  at?: string
  /** the person announced a task on a book ("Voy a traducir Rut", "I'm reviewing Jonah 2"): a path through it starts (pathStart) */
  path?: PathStart
  /** why the question cannot be out of scope: the reader read a book, a term or an intent, or code read a follow-up */
  inScope?: string
  /** the language the reader said the question is in (the out-of-scope reply is in it) */
  qLang?: string
  /** what code answers by itself, with no sheet to answer: past a book's end, how many verses or chapters */
  note?: { text: string; fromText: boolean }
  /** the helps were asked for in a language that is not on the phone, or lacks this: said before the answer (helpsIn) */
  langNote?: string
  /** the question named the language of its helps ("…in Hindi", "repeat it in English"): their pack, which a missing kind of
   * help is never silently taken from another pack for (helps-elsewhere offers it as a button instead) */
  wanted?: string
  /** the last search again in another language: these verses, not a new search (ROUTES 'found-again') */
  keep?: Found }
/**
 * The reader's article names a term the question does not have (no word of it, nor one that starts like it: "concubinas" is
 * «concubina»), the conversation was not about it either, and no article of it is one the question names in its own words
 * ("Háblame del arca del pacto" read as "ark of the covenant", "ما هي النعمة؟" as "grace" are kept): a report of Nov 16 read
 * "¿Puedes decirlo?" as «metáfora». Only a bare article reading (no book, no other language asked about): a passage's or
 * advice's term names a figure or a key term of the verse ("Anak Domba Allah" → metafora), and a follow-up's term comes from
 * the conversation.
 */
export async function strayTerm(s: Slots, q: string, c: ConvState): Promise<boolean> {
  if (s.intent !== 'article' || !s.term || s.book || s.other_language) return false
  const ws = (t: string) => fold(t).split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean)
  // a word's start: "concubin" for "concubinas", the whole of a short one ("paz")
  const stem = (w: string) => (w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 3)))
  const said = ws(q)
  const inQ = (t: string) => ws(t).some((w) => said.some((u) => u.startsWith(stem(w)) || (u.length >= 4 && w.startsWith(stem(u)))))
  if (fold(q).includes(fold(s.term).trim()) || inQ(s.term)) return false
  const before = freshState(c)?.term
  if (before && (fold(before) === fold(s.term) || inQ(before))) return false
  // the term's articles, and the ones the question's words name (a few of them together: "arca del pacto"), in the packs the
  // answer reads from: the helps language chosen, the question's and the app's language, English (each a map lookup: sheet.ts
  // nameIndex; reading every pack's names took 3.4 s cold)
  const have = await installedLangs().catch(() => ['en'])
  const packs = [...new Set([env.helpsLang, packCode(s.lang ?? env.nav), packCode(env.nav), 'en'])].filter((l): l is string => !!l && have.includes(l))
  const its = (await idsOf(s.term, packs).catch(() => null)) ?? []
  if (!its.length) return true
  const named = new Set<string>([...((await articleForQuestion(q).catch(() => null)) ?? []), ...(await articlesNamed(keywords(q)).catch(() => new Set<string>()))])
  const one = await termArticle(q, s.lang ?? env.nav).catch(() => null)
  if (one) named.add(one)
  if (its.some((id) => named.has(id))) return false
  const kw = new Set(keywords(q).map((w) => fold(w)))
  const words = q.replace(/[¿?!¡.,;:«»"“”؟،()]/g, ' ').split(/\s+/).filter(Boolean)
  const content = (w: string) => kw.has(fold(w)) || kw.has(fold(w).replace(/^ال/, ''))
  for (let i = 0; i < words.length; i++) {
    if (!content(words[i]!)) continue
    for (let k = 1; k <= 4 && i + k <= words.length; k++) {
      if (!content(words[i + k - 1]!)) continue
      const w = words.slice(i, i + k).join(' ')
      for (const x of new Set([w, w.replace(/^ال/, '')]))
        if (((await idsOf(x, packs).catch(() => null)) ?? []).some((id) => its.includes(id))) return false
    }
  }
  return true
}

// "Dímelo en francés" with no French helps on the phone: said plainly before the answer, which comes in the language there is
const HELPS_IN: Record<string, { absent: string; lacks: string }> = {
  en: { absent: 'There are no helps in {lang} on this phone, so this is in {have}.', lacks: 'The helps in {lang} on this phone do not have this, so this is in {have}.' },
  es: { absent: 'No hay ayudas en {lang} en este teléfono, así que esto está en {have}.', lacks: 'Las ayudas en {lang} de este teléfono no tienen esto, así que está en {have}.' },
  fr: { absent: "Il n'y a pas d'aides en {lang} sur ce téléphone : voici donc la réponse en {have}.", lacks: "Les aides en {lang} de ce téléphone n'ont pas cela : voici donc la réponse en {have}." },
  id: { absent: 'Tidak ada bahan bantu dalam bahasa {lang} di ponsel ini, jadi ini dalam bahasa {have}.', lacks: 'Bahan bantu dalam bahasa {lang} di ponsel ini tidak memuat ini, jadi ini dalam bahasa {have}.' },
  hi: { absent: 'इस फ़ोन पर {lang} में सहायता नहीं है, इसलिए यह {have} में है।', lacks: 'इस फ़ोन पर {lang} की सहायता में यह नहीं है, इसलिए यह {have} में है।' },
  ar: { absent: 'لا توجد مساعدات باللغة {lang} على هذا الهاتف، لذا هذا باللغة {have}.', lacks: 'المساعدات باللغة {lang} على هذا الهاتف ليس فيها هذا، لذا هذا باللغة {have}.' },
}
/** The helps asked in a language (`target`, an app language) that the sheet could not be answered from: what to say first. */
async function helpsIn(target: string | null, sheet: Sheet, ui: string): Promise<{ langNote?: string; wanted?: string }> {
  const want = target ? packCode(target) : null
  if (!want) return {}
  if (sheet.lang === want) return { wanted: want }
  const names = LANG_NAMES[ui] ?? LANG_NAMES.en!
  const name = (l: string) => names[l.startsWith('es') ? 'es' : l] ?? env.packName(l)
  const t = HELPS_IN[ui] ?? HELPS_IN.en!
  const text = ((await hasLang(want).catch(() => false)) ? t.lacks : t.absent).replace('{lang}', name(want)).replace('{have}', name(sheet.lang))
  return { langNote: text, wanted: want }
}

/**
 * The last answer again, its helps in another language ("¿Me lo puedes decir en inglés?", "in English" after a button): what it
 * was asked for as it was resolved (a follow-up is not moved again: "¿y el siguiente?" then "en inglés" stays on that verse), no
 * reader (codeReads). A button's sheet stays that sheet, from the pack asked for when the phone has it (and, for a passage, its
 * book; for an Academy article, the article).
 */
async function repeatOf(p: NonNullable<ConvState['prevResolved']>, target: string | null, prefer: string | null, raw: string, ms: number): Promise<Made> {
  const meta = `model ${ms} ms\n${raw}\n(the last answer again${target ? ` with the helps in ${target}` : ''}, as it was resolved)`
  const inScope = 'the last answer again'
  if (p.sheet) {
    const ui = p.ui ?? env.nav
    let sheet: Sheet = { ...p.sheet, id: `r${Date.now()}` }
    if (prefer && (await hasLang(prefer).catch(() => false))) {
      if (sheet.concept) {
        if (!sheet.concept.startsWith('ta:') || (await hasTa(prefer, sheet.concept))) sheet = { ...sheet, lang: prefer }
      } else if (sheet.ref) {
        const b = await buildSheet(sheet.id, { ...slotsOfSheet(p.sheet), lang: ui }, prefer)
        sheet = { ...sheet, lang: b.sheet.lang }
      } else sheet = { ...sheet, lang: prefer }
    }
    return { sheet, ui, meta, inScope, ...(await helpsIn(target, sheet, ui)) }
  }
  const { sheet, ui } = await buildSheet(`q${Date.now()}`, p.slots, prefer)
  return { sheet, ui, meta, ...(p.q !== undefined ? { q: p.q } : {}), inScope, ...(p.found ? { keep: p.found } : {}), ...(await helpsIn(target, sheet, ui)) }
}

/** The reading step once the slots are known (from the phone's model, the online one, or none): code reads what they missed. */
export async function readQuestion(q: string, read: { slots: Slots | null; raw: string; ms: number }, c: ConvState, target: string | null): Promise<Made> {
  const { raw, ms } = read
  // a language named for the answer ("… in English"): its pack for the helps; the reply's own words stay in the question's language
  const prefer = target ? packCode(target) : env.helpsLang
  const again = c.again === q ? c.prevResolved : undefined
  delete c.again
  if (again) return repeatOf(again, target, prefer, raw, ms)
  const given = read.slots ? { ...read.slots } : null
  // "and the notes in Spanish?": the reader may take the language named for the question's own; the reply's words stay in
  // the language of the rest of the question
  if (target && given?.lang && packCode(given.lang) === packCode(target)) given.lang = guessLang(q)
  // an article the question does not name (a report of Nov 16: "Puedes decirlo" read as «metáfora»): read by code instead
  const slots = given && (await strayTerm(given, q, c)) ? ({ intent: 'unknown', lang: given.lang } as Slots) : given
  const stray = slots !== given ? `\n(the reader's term «${given!.term}» is not in the question: read by code)` : ''
  // never out of scope (ROUTES 'out-of-scope') over a reading of the question (a book, a term, a known intent: the phone's or the
  // online reader), nor over a follow-up code read from the conversation ("thanks, and the next verse?"); on a passage, "What is
  // the weather tomorrow?" is out of scope (its first button goes back to the passage), not a search that finds junk
  const heard = !!slots && (!!slots.book || !!slots.term || ['passage', 'article', 'count', 'rank', 'advice', 'resources'].includes(slots.intent ?? ''))
  const scope = heard ? { inScope: 'read by the reader' } : {}
  const followed = { inScope: 'a follow-up of the conversation' }
  const s0 = refInText(slots?.lang ? slots : { ...(slots ?? { intent: 'unknown' }), lang: guessLang(q) }, q)
  if (s0.phrase) s0.phrase = cleanPhrase(s0.phrase, q)
  // the script says the language even when the model does not know it: Arabic letters, Devanagari
  if (/[؀-ۿ]/.test(q)) s0.lang = 'ar'
  else if (/[ऀ-ॿ]/.test(q)) s0.lang = 'hi'
  // a command word next to a reference ("Jonás 1:3 notas") says what to show, with or without a model
  const shown = kindOf(q)
  if (shown && s0.book && s0.chapter && !(s0.what ?? []).includes(shown[0]!)) Object.assign(s0, { intent: 'passage', what: shown })
  // a follow-up with no reference of its own, completed from the state by code: only when the reader gave nothing usable
  // (no reader, "unknown", a passage with no book), never over a good reading; not when it picks a search result
  const unread = !slots || !slots.intent || slots.intent === 'unknown' || (slots.intent === 'passage' && !slots.book)
  // (without a greeting or thanks before it: "gracias, ¿y el siguiente?" is "¿y el siguiente?")
  const fu = unread && ordinalPick(q) === undefined ? followUp(withoutWeak(q), s0, c) : null
  if (fu) {
    // checked against the book: past its ends it says so ("Ruth 4:22 is the last verse of Ruth")
    const checked = await boundsCheck(fu, fu.slots.lang ?? env.nav)
    if (checked.note !== undefined) {
      c.prevResolved = { slots: { ...fu.slots }, q }
      const { sheet, ui } = await buildSheet(`q${Date.now()}`, fu.slots, prefer)
      return { sheet, ui, meta: `model ${ms} ms
${raw}${stray}
(follow-up by code: ${fu.how}, checked against the book)`, q, note: { text: checked.note, fromText: !!fu.counted }, ...followed }
    }
    let s = checked.slots
    // "who is speaking here?" names no article: the passage with its notes, not its key terms
    if (fu.how === 'meaning here' && !(await termArticle(q, s.lang ?? env.nav))) {
      s = { ...s, what: ['text', 'notes'], term: null }
      fu.how += ' (no article: the passage)'
    }
    keepState(c, s, { q })
    const { sheet, ui } = await buildSheet(`q${Date.now()}`, s, prefer)
    // "how many times does lamb appear in this chapter?": the article a word names exactly (not "appear")
    const named = fu.termWords ? [...(await articlesNamed(fu.termWords))].filter((id) => id.startsWith('tw:')) : []
    if (named.length === 1) Object.assign(sheet, { concept: named[0]!, candidates: null, what: ['terms'] })
    return { sheet, ui, meta: `model ${ms} ms\n${raw}${stray}\n(follow-up by code: ${fu.how})`, q, ...followed, ...(await helpsIn(target, sheet, ui)) }
  }
  const picked = pickFound(q, s0, c)
  if (picked) {
    const p = passageOf(picked.hit, picked.what, s0.lang ?? env.nav)
    keepState(c, p)
    const { sheet, ui } = await buildSheet(`q${Date.now()}`, p, prefer)
    return { sheet, ui, meta: `model ${ms} ms\n${raw}${stray}\n(follow-up on the search results)`, ...(await helpsIn(target, sheet, ui)) }
  }
  // a task announced on a book ("Estoy revisando Jonás 2"): its introduction, where the path starts
  const path = pathStart(q) ?? undefined
  const asked = introAsked(q, s0.lang ?? env.nav) ??
    (path ? ({ intent: 'passage', book: path.book, chapter: path.ch, verse_start: null, verse_end: null, what: ['intro'] } as Slots) : null)
  const s = asked ? { ...asked, lang: s0.lang ?? env.nav } : withContext(s0, c.last, q)
  keepState(c, s, { q })
  const { sheet, ui } = await buildSheet(`q${Date.now()}`, s, prefer)
  return { sheet, ui, meta: `model ${ms} ms\n${raw}${stray}`, q, ...(path ? { path } : {}), ...scope, ...(slots?.lang ? { qLang: slots.lang } : {}), ...(await helpsIn(target, sheet, ui)) }
}

// What may stand next to a reference that is only a reference ("muéstrame Rut 2:3", "montre-moi Ruth 2:3 s'il te plaît")
const REF_FILLER = new Set((
  'show me the of please ' + 'muestrame mostrar el la de por favor ' + 'montre moi le du s il te vous plait ' +
  'tunjukkan tolong ' + 'दिखाओ दिखाइए दिखाएँ का की के ' + 'أرني اعرض'
).split(' ').map(fold))
const SHOW_KINDS = ['terms', 'notes', 'questions', 'text', 'intro', 'chapter'] as const
/**
 * The composer's ways of asking for a passage (data/shapes.json: "Notes on {ref}", "Introducción a {what}"), around the
 * reference: their small words ("on", "sur", "a", "à") are taken out only there, at the start or the end, never anywhere
 * ("Ruth 2:3 to 5" is a range).
 */
const SHAPE_EDGES: { head: string; tail: string }[] = (['notes', 'intro'] as const).flatMap((k) =>
  Object.values((shapes as unknown as Record<string, { text: Record<string, string> }>)[k]!.text).map((t) => {
    const [head, tail] = t.split(/\{(?:ref|what)\}/)
    return { head: fold(head ?? '').trim(), tail: fold(tail ?? '').trim() }
  }))
function withoutShape(q: string): string {
  const f = fold(q).trim()
  for (const { head, tail } of SHAPE_EDGES) {
    if (head && f.startsWith(head + ' ')) return f.slice(head.length)
    if (tail && f.endsWith(' ' + tail)) return f.slice(0, -tail.length)
  }
  return q
}
/**
 * The question is only a reference, read by code alone ("Rut 2:3", "Jonás 1:3 notas", "1 Juan 3:2", "योना 1:3"): every word
 * is the book's name, a number, what to show ("notes", "key terms", "intro") or a few filler words. Then the phone's model
 * (about 4 s) and the online reader are skipped. Any other word ("why", "who speaks", "translate", "and Ruth 2:4") keeps
 * them: a wrong skip costs a wrong answer, a missed one only 4 s.
 */
export const directRef = (q: string): boolean => !!directSheet(q)

/**
 * The question read by code alone when it is only a reference (directRef's test), as the slots readQuestion turns into the
 * call sheet when no reader runs: the same reading for the composer's "✓ Rut 2:3 · notas" and for the answer (main.ts sends a
 * direct question to readQuestion with no slots). Null when it is not only a reference, or when this conversation would read it
 * otherwise (a pick of a search result, a task announced on a book): then no "✓" is offered. The book is not checked against
 * the packs here (buildSheet does that, and the composer with the same test).
 */
export function directSheet(q: string, c: ConvState = { last: null }): Slots | null {
  const lang = /[؀-ۿ]/.test(q) ? 'ar' : /[ऀ-ॿ]/.test(q) ? 'hi' : guessLang(q)
  const s = introAsked(q, lang) ?? refInText({ intent: 'unknown', lang }, q)
  const code = s.book && s.chapter ? bookCode(s.lang ?? lang, s.book) : null
  if (!code) return null
  // the words of the book's name as the question wrote it ("1 Juan": "Juan" alone would be John)
  // (an introduction's reading has the book's code: its name as written comes from the reference, "1 यूहन्ना 3 का परिचय")
  const asWritten = refInText({ intent: 'unknown', lang }, q).book
  const same = asWritten && bookCode(lang, asWritten) === code ? asWritten : ''
  const name = new Set([s.book!, same].flatMap((b) => fold(b).split(/\s+/)).filter(Boolean))
  let rest = withoutShape(q)
  for (const k of SHOW_KINDS) rest = rest.replace(new RegExp(pattern(k).source, 'giu'), ' ')
  const words = rest.replace(/[¿?!¡.,;«»"“”'’()؟،-]/g, ' ').split(/\s+/).filter(Boolean)
  if (!words.every((w) => /^[\d०-९٠-٩:.–-]+$/.test(w) || name.has(fold(w)) || bookExact(w) === code || REF_FILLER.has(fold(w)))) return null
  const s0 = unreadSlots(q)
  if (ordinalPick(q) === undefined && followUp(withoutWeak(q), s0, c)) return null
  if (pickFound(q, s0, c) || pathStart(q)) return null
  const asked = introAsked(q, s0.lang ?? env.nav)
  return asked ? { ...asked, lang: s0.lang ?? env.nav } : withContext(s0, c.last, q)
}

/** What readQuestion starts from when no reader ran (slots null), without its effects (the conversation's state is not kept). */
function unreadSlots(q: string): Slots {
  const s0 = refInText({ intent: 'unknown', lang: guessLang(q) }, q)
  if (/[؀-ۿ]/.test(q)) s0.lang = 'ar'
  else if (/[ऀ-ॿ]/.test(q)) s0.lang = 'hi'
  const shown = kindOf(q)
  if (shown && s0.book && s0.chapter && !(s0.what ?? []).includes(shown[0]!)) Object.assign(s0, { intent: 'passage', what: shown })
  return s0
}
/**
 * The follow-up code reads from this conversation ("notas", "siguiente", "5" after Rut 2:3), as readQuestion reads it when no
 * reader ran, without its effects (no state kept, no book read, the book's ends not checked). Null when the question is not
 * one, picks a search result, or has a word that may name a book ("العدد 5" after Rut 2:3 is Numbers 5 to a reader, verse 5
 * to the follow-up: the reader decides, as decided on Nov 15 for fu-ar-numbers-read).
 */
export function followUpPreview(q: string, c: ConvState): FollowUp | null {
  if (ordinalPick(q) !== undefined) return null
  const lang = /[؀-ۿ]/.test(q) ? 'ar' : /[ऀ-ॿ]/.test(q) ? 'hi' : guessLang(q)
  if (refInText({ intent: 'unknown', lang }, q).book) return null
  return followUp(withoutWeak(q), unreadSlots(q), c)
}
const VERSES = versification as Record<string, number[]>
/**
 * A follow-up whose answer is only its slots, so the composer may show it ("✓ Rut 2:3 · notas") and the send may skip the
 * readers: a passage (another verse, chapter or help of it), not a count, a term "here" or advice (their answers read more
 * than the slots), within the book's chapters and verses as data/versification.json has them (readQuestion moves "the next
 * verse" past a chapter's end, or says there is none: those go the usual way).
 */
export function previewable(f: FollowUp): boolean {
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
/**
 * Whether code alone reads the question: only a reference in this conversation (directSheet with it, as the composer's "✓"
 * reads it), or a follow-up of this conversation the composer shows with a "✓" (followUpPreview, previewable). Then main.ts
 * skips the readers (the phone's model, about 4 s; the online one) and readQuestion reads it with no slots: the very reading
 * the "✓" showed. Other follow-ups ("what does lamb mean here?", "how many times … here?", "how do I translate this?") still
 * go to the readers, and so does a reference that is also a follow-up here ("العدد 5" after Ruth 2:3: directRef alone reads
 * Numbers 5, but with no slots readQuestion would read verse 5 of Ruth).
 */
export function codeReads(q: string, c: ConvState): boolean {
  // the last answer again in another language ("en inglés"): readQuestion builds it from what it was asked for (repeatOf)
  if (c.again === q) return true
  if (directSheet(q, c)) return true
  const fu = followUpPreview(q, c)
  return !!fu && previewable(fu)
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
  // only those the pack can show (older packs name all four manuals but carry one: "not installed on this device")
  const out: { id: string; title: string }[] = []
  for (const x of [...rel].sort((a, b) => rank(a) - rank(b))) {
    if (out.length >= max) break
    if (names[x]?.length && (await hasTa(lang, x))) out.push({ id: x, title: String(names[x][0]) })
  }
  return out
}
/** An article's name in a pack (the first of its names), or null when the pack does not list it. */
async function nameIn(lang: string, id: string): Promise<string | null> {
  const names = ((await (await openLang(lang)).maps()) as any).map?.core?.names ?? {}
  return names[id]?.length ? String(names[id][0]) : null
}
/**
 * The next steps that need the packs, each a ready sheet (no model call): under a passage, the Translation Academy article
 * its first note that cites one cites; under a Translation Words article, the articles it links to ("See also: sheep,
 * shepherd", "How to Translate Unknowns"); under a Translation Academy article, its related articles.
 */
async function packSteps(sheet: Sheet, study: Study | null, ui: string): Promise<Follow[]> {
  const article = (id: string, l: string): Sheet =>
    ({ ...sheet, id: `f${Date.now()}`, intent: 'article', concept: id, lang: l, ref: null, what: [], phrase: null, candidates: null, term: null, version: null })
  if (sheet.intent === 'passage' && study) {
    const id = study.notes.find((n) => n.concept?.startsWith('ta:'))?.concept
    if (!id) return []
    for (const l of new Set([sheet.lang, 'en'])) {
      if (!(await hasTa(l, id))) continue
      const title = await nameIn(l, id)
      return title ? [{ label: academyLabel(ui, title), sheet: article(id, l) }] : []
    }
    return []
  }
  if (sheet.intent !== 'article' || !sheet.concept) return []
  if (sheet.concept.startsWith('ta:')) return (await relatedOf(sheet.lang, sheet.concept)).map((o) => ({ label: o.title, sheet: article(o.id, sheet.lang) }))
  if (!sheet.concept.startsWith('tw:')) return []
  const a = (await (await openLang(sheet.lang)).article(sheet.concept, 'all')).data
  const md = (a?.sections ?? []).filter((s) => s.role !== 'bible-references').map((s) => String(s.md ?? '')).join('\n')
  const out: Follow[] = []
  // [sheep](../other/sheep.md), [How to Translate Unknowns](rc://en/ta/man/translate/translate-unknown)
  for (const m of md.matchAll(/\[([^\]]+)\]\((?:\.\.\/(kt|other|names)\/([\w-]+)\.md|rc:\/\/[^/]+\/ta\/man\/([\w-]+)\/([\w-]+))\)/g)) {
    const id = m[2] ? `tw:${m[2]}/${m[3]}` : `ta:${m[4]}/${m[5]}`
    if (id === sheet.concept || out.some((o) => o.sheet?.concept === id)) continue
    const ok = id.startsWith('ta:') ? await hasTa(sheet.lang, id) : !!(await nameIn(sheet.lang, id))
    if (ok) out.push({ label: id.startsWith('ta:') ? academyLabel(ui, m[1]!) : m[1]!, sheet: article(id, sheet.lang) })
    if (out.length >= 4) break
  }
  return out
}
// ----------------------------------------------------------------------------------------------------------- next steps
// Every answer offers next steps (Abel, Nov 15: "every answer must offer follow-up options"): buttons built by code, the most
// useful first. The ones that need the packs are made here; converse.ts makes those about one passage.
const articleSheet = (base: Sheet, id: string, l: string): Sheet =>
  ({ ...base, id: `f${Date.now()}`, intent: 'article', concept: id, lang: l, ref: null, what: [], phrase: null, candidates: null, term: null, version: null })
const passageSheet = (base: Sheet, ref: string, what: string[], l = base.lang): Sheet =>
  ({ ...base, id: `f${Date.now()}`, intent: 'passage', ref, what, lang: l, concept: null, phrase: null, candidates: null, term: null, version: null })
/** A Translation Academy article as a button, from the first pack that can show it (the sheet's, English, the others). */
async function taStep(base: Sheet, id: string, ui: string): Promise<Follow | null> {
  for (const l of new Set([base.lang, 'en', ...(await installedLangs())])) {
    if (!(await hasTa(l, id))) continue
    const title = await nameIn(l, id)
    return title ? { label: academyLabel(ui, title), sheet: articleSheet(base, id, l) } : null
  }
  return null
}
/** A Translation Words article as a button, by its name in the sheet's pack. */
async function twStep(base: Sheet, id: string): Promise<Follow | null> {
  const title = (await nameIn(base.lang, id).catch(() => null)) ?? (await nameIn('en', id).catch(() => null))
  return title ? { label: title, sheet: articleSheet(base, id, base.lang) } : null
}
/** The verses with an article's term, from the sheet's pack, else the English one (the Spanish key-term links are fewer). */
async function versesAny(id: string, l: string) {
  for (const x of new Set([l, 'en'])) {
    const hits = await versesOf([id], x).catch(() => [])
    if (hits.length) return hits
  }
  return []
}
/** The first verses where an article's term stands, each a button to its text and notes. */
async function verseSteps(base: Sheet, id: string, ui: string, n = 3): Promise<Follow[]> {
  const hits = (await versesAny(id, base.lang)).slice(0, n)
  const out: Follow[] = []
  for (const h of hits) out.push({ label: hitLabel(ui, h), sheet: await hitSheet(h, ['text', 'notes'], ui) })
  return out
}
/** The books listed, each as its first verse with the term (from the installed books), in Bible order. */
async function bookFirsts(base: Sheet, id: string, ui: string, n = 5): Promise<Follow[]> {
  const hits = await versesAny(id, base.lang)
  const first = new Map<string, Hit>()
  const at = (h: Hit) => h.ch * 1000 + h.v
  for (const h of hits) if (!first.has(h.book) || at(h) < at(first.get(h.book)!)) first.set(h.book, h)
  const order = [...first.values()].sort((a, b) => CANON.indexOf(a.book) - CANON.indexOf(b.book)).slice(0, n)
  const out: Follow[] = []
  for (const h of order) out.push({ label: hitLabel(ui, h), sheet: await hitSheet(h, ['text', 'notes'], ui) })
  return out
}
/** An article's title as its button says it ("Academy: How to Translate Names" -> "How to Translate Names"). */
const titleOfStep = (follow: Follow[], id: string): string | undefined => {
  const f = follow.find((x) => x.sheet?.concept === id)
  return f ? (id.startsWith('ta:') ? f.label.replace(/^[^:]+:\s*/, '') : f.label) : undefined
}
/** "How to translate it": the Translation Academy article for a Translation Words article (names, things unknown where one translates). */
const howToOf = (id: string): string | null =>
  id.startsWith('tw:names/') ? 'ta:translate/translate-names' : id.startsWith('tw:other/') ? 'ta:translate/translate-unknown' : null
/** The Translation Academy articles about starting to translate (all four manuals' packs have them, Nov 2026). */
const START_TA = ['ta:translate/translate-process', 'ta:translate/first-draft']
/** The pack that has a book (for Browse to open it there), the sheet's first. */
async function packWithBook(code: string, l: string): Promise<string | null> {
  for (const x of new Set([l, env.helpsLang ?? l, 'en', ...(await installedLangs())])) {
    try { if ((await openLang(x)).installed(`book:${code}`)) return x } catch {}
  }
  return null
}
/** A book the packs have, for an example to tap: the one named, else Jonah, Ruth, else the first there is. */
async function exampleBook(l: string, named: string | null): Promise<{ code: string; lang: string } | null> {
  for (const code of [named, 'jon', 'rut'].filter((x): x is string => !!x)) {
    const p = await packWithBook(code, l)
    if (p) return { code, lang: p }
  }
  for (const code of CANON) {
    const p = await packWithBook(code, l)
    if (p) return { code, lang: p }
  }
  return null
}
/** Ways forward when nothing (or little) was found: an example passage to read, "Finding Answers" (Translation Academy), Browse. */
async function wayForward(base: Sheet, ui: string, named: string | null = null): Promise<Follow[]> {
  const out: Follow[] = []
  const ex = await exampleBook(base.lang, named).catch(() => null)
  if (ex) out.push({ label: nextWords(ui).read.replace('{ref}', `${bookLabel(ui, ex.code)} 1`), sheet: passageSheet(base, `${ex.code} 1`, ['text', 'notes'], ex.lang) })
  const fa = await taStep(base, 'ta:intro/finding-answers', ui).catch(() => null)
  if (fa) out.push(fa)
  out.push(browseStep(ui))
  return out
}
/** A book and its introduction to go on with (a note past a book's end, a count in a chapter). */
async function bookSteps(base: Sheet, ui: string): Promise<Follow[]> {
  const m = /^([0-9a-z]{3})(?: (\d+))?/.exec(base.ref ?? '')
  if (!m) return []
  const [, code, ch] = m
  const book = bookLabel(ui, code!)
  const b = await boundsOf(code!).catch(() => null)
  // past the book's end ("the next chapter" after Ruth 4): its last chapter
  const c = !ch ? 1 : b && !b.has(+ch) ? Math.max(1, Math.min(+ch, Math.max(...b.keys()))) : +ch
  const out: Follow[] = [{ label: nextWords(ui).read.replace('{ref}', `${book} ${c}`), sheet: passageSheet(base, `${code} ${c}`, ['text', 'notes']) }]
  out.push({ label: introLabel(ui, book), sheet: passageSheet(base, `${code} front:intro`, ['intro']) })
  out.push(browseStep(ui, { book: code! }))
  return out
}
// --------------------------------------------------------------------------------------------- sections and introductions
// A report of Nov 15 ("Voy a empezar a traducir el libro de Rut"): after an introduction, one studies a chapter a section at a
// time ("Rut 1:1–5"), not only the whole chapter or one verse. And "Introduction to Numbers 6" (the English notes have no
// Numbers, only its BSB text): say so plainly and offer what there is, with the passage the person was on.
const SEC_T: Record<string, { first: string; next: string; around: string; back: string; noIntro: string; noNotes: string }> = {
  en: { first: 'First section: {ref}', next: 'Next section: {ref}', around: 'Its section: {ref}', back: 'Back to {ref}', noIntro: 'The helps on this phone have no introduction to {what}.',
    noNotes: 'The Translation Notes here do not cover {book} yet, so it has no introductions; its text is here.' },
  es: { first: 'Primera sección: {ref}', next: 'Sección siguiente: {ref}', around: 'Su sección: {ref}', back: 'Volver a {ref}', noIntro: 'Las ayudas de este teléfono no tienen introducción a {what}.',
    noNotes: 'Las Notas de traducción de aquí todavía no cubren {book}, así que no tiene introducciones; su texto sí está.' },
  fr: { first: 'Première section : {ref}', next: 'Section suivante : {ref}', around: 'Sa section : {ref}', back: 'Revenir à {ref}', noIntro: "Les aides de ce téléphone n'ont pas d'introduction à {what}.",
    noNotes: "Les Notes de traduction d'ici ne couvrent pas encore {book} : pas d'introductions, mais son texte est là." },
  id: { first: 'Bagian pertama: {ref}', next: 'Bagian berikutnya: {ref}', around: 'Bagiannya: {ref}', back: 'Kembali ke {ref}', noIntro: 'Bahan bantu di ponsel ini tidak punya pengantar untuk {what}.',
    noNotes: 'Catatan Terjemahan di sini belum mencakup {book}, jadi tidak ada pengantarnya; teksnya ada.' },
  hi: { first: 'पहला खंड: {ref}', next: 'अगला खंड: {ref}', around: 'इसका खंड: {ref}', back: '{ref} पर लौटें', noIntro: 'इस फ़ोन की सहायता में {what} का कोई परिचय नहीं है।',
    noNotes: 'यहाँ की अनुवाद टिप्पणियाँ अभी {book} को शामिल नहीं करतीं, इसलिए इसका कोई परिचय नहीं है; इसका पाठ यहाँ है।' },
  ar: { first: 'المقطع الأول: {ref}', next: 'المقطع التالي: {ref}', around: 'مقطعها: {ref}', back: 'العودة إلى {ref}', noIntro: 'لا توجد في مساعدات هذا الهاتف مقدمة لـ {what}.',
    noNotes: 'ملاحظات الترجمة هنا لا تغطي {book} بعد، فلا مقدمات له؛ لكن نصه موجود.' },
}
const ST = (ui: string) => SEC_T[ui] ?? SEC_T.en!
/**
 * A book's introductions in the first pack whose notes have the book (`want`: the first that has that one): the book's
 * (`front`) and the chapters that have one. (The Arabic pack has the English notes of Numbers, which the English pack lacks.)
 */
type Intros = { lang: string; front: boolean; chapters: Set<number> }
async function introsOf(code: string, l: string, want?: number | 'front'): Promise<Intros | null> {
  for (const x of new Set([l, 'en', ...(await installedLangs())])) {
    try {
      const r = await openLang(x)
      if (!r.installed(`book:${code}`)) continue
      const rows = (((await r.book(code)) as any)?.notes?.rows ?? []).filter((y: any) => y.cols?.isIntro === true || y.cols?.isIntro === 'true')
      if (!rows.length) continue
      // as answer.ts reads them: the first is the book's, a chapter's starts at its verse 1
      const chapters = new Set<number>()
      for (let ch = 1; ch <= 150; ch++) if (rows.some((y: any) => y !== rows[0] && y.from === verseId(code, ch, 1))) chapters.add(ch)
      if (typeof want === 'number' && !chapters.has(want)) continue
      return { lang: x, front: true, chapters }
    } catch {}
  }
  return null
}
// "Notes in English, from the Arabic pack.": an introduction answered from another pack (the Arabic pack has English notes)
const LANG_NAMES: Record<string, Record<string, string>> = {
  en: { en: 'English', es: 'Spanish', fr: 'French', id: 'Indonesian', hi: 'Hindi', ar: 'Arabic' },
  es: { en: 'inglés', es: 'español', fr: 'francés', id: 'indonesio', hi: 'hindi', ar: 'árabe' },
  fr: { en: 'anglais', es: 'espagnol', fr: 'français', id: 'indonésien', hi: 'hindi', ar: 'arabe' },
  id: { en: 'Inggris', es: 'Spanyol', fr: 'Prancis', id: 'Indonesia', hi: 'Hindi', ar: 'Arab' },
  hi: { en: 'अंग्रेज़ी', es: 'स्पेनिश', fr: 'फ़्रेंच', id: 'इंडोनेशियाई', hi: 'हिंदी', ar: 'अरबी' },
  ar: { en: 'الإنجليزية', es: 'الإسبانية', fr: 'الفرنسية', id: 'الإندونيسية', hi: 'الهندية', ar: 'العربية' },
}
// ("Questions in English, from the English pack.": a step of a path, or a question, answered by another pack: helpsElsewhere)
const FROM_T: Record<string, string> = {
  en: '{what} in {notes}, from the {pack} pack.', es: '{what} en {notes}, del paquete de {pack}.', fr: '{what} en {notes}, du paquet {pack}.',
  id: '{what} dalam bahasa {notes}, dari paket bahasa {pack}.', hi: '{notes} में {what}, {pack} पैकेज से।', ar: '{what} باللغة {notes}، من حزمة اللغة {pack}.',
}
export type HelpKind = 'notes' | 'questions' | 'terms'
const FROM_WHAT: Record<string, Record<HelpKind, string>> = {
  en: { notes: 'Notes', questions: 'Questions', terms: 'Key terms' }, es: { notes: 'Notas', questions: 'Preguntas', terms: 'Palabras clave' },
  fr: { notes: 'Notes', questions: 'Questions', terms: 'Mots clés' }, id: { notes: 'Catatan', questions: 'Pertanyaan', terms: 'Istilah kunci' },
  hi: { notes: 'टिप्पणियाँ', questions: 'प्रश्न', terms: 'मुख्य शब्द' }, ar: { notes: 'ملاحظات', questions: 'أسئلة', terms: 'كلمات رئيسية' },
}
function fromPack(ui: string, pack: string, text: string, kind?: HelpKind, said?: string): string {
  const names = LANG_NAMES[ui] ?? LANG_NAMES.en!
  const base = (l: string) => (l.startsWith('es') ? 'es' : l.startsWith('pt') ? 'pt' : l)
  const name = (l: string) => names[base(l)] ?? env.packName(l)
  // the notes' own language: by their script, else by their words (the Arabic pack's notes of Numbers are English)
  // (helps from another pack: the language their own rows are written in, helpKinds; an introduction: read from the answer)
  const body = text.replace(/^[#*].*$/gm, ' ')
  const notes = said ?? (/[؀-ۿ]{3}/.test(body) ? 'ar' : /[ऀ-ॿ]{3}/.test(body) ? 'hi' : guessLang(body.slice(0, 600)))
  return (FROM_T[ui] ?? FROM_T.en!).replace('{what}', (FROM_WHAT[ui] ?? FROM_WHAT.en!)[kind ?? 'notes']).replace('{notes}', name(notes)).replace('{pack}', name(pack))
}

// ----------------------------------------------------------------------------------------- helps from another pack
// The Hindi pack has notes for Acts only and no questions at all. A step of a path ("Ruth 1:1–5 · notes") or a question asking
// for one kind of help ("notes Ruth 2:3") is answered by the pack it is asked in when that pack has that kind of help for the
// book; else by another installed pack that has it (English first), and the answer says so ("Notes in English, from the
// English pack."). One function decides it, for the steps a path counts (stepsHad) and for the answer (the helps-elsewhere
// route), so a counted step is always one that is answered.
type Kinds = Record<HelpKind, boolean> & { said: Record<'notes' | 'questions', string> }
const HAS = new Map<string, Promise<Kinds | null>>()
/** The base language of a pack ("es-419" -> "es"). */
const baseOf = (pack: string) => (pack.startsWith('es') ? 'es' : pack.startsWith('pt') ? 'pt' : pack.split('-')[0]!)
/**
 * The language a pack's notes or questions are written in, from their own text (`sample`): the Arabic pack's notes of Numbers
 * are English. The quotes in the original languages (Hebrew, Greek, and the parentheses around them) and the links are left out;
 * then the script (Arabic, Devanagari); then the common words, on 200 letters at least; else the pack's own language.
 */
export function helpsLangOf(sample: string, pack: string): string {
  const t = sample
    .replace(/\[\[[^\]]*\]\]|\[[^\]]*\]\([^)]*\)|\[[^\]]*\]|rc:\/\/\S+/g, ' ')
    .replace(/\([^)]*[\u0590-\u05ff\u0370-\u03ff\u1f00-\u1fff][^)]*\)/g, ' ')
    .replace(/[\u0590-\u05ff\u0370-\u03ff\u1f00-\u1fff\u2060]+/g, ' ')
  if (/[\u0600-\u06ff]{3}/.test(t)) return 'ar'
  if (/[\u0900-\u097f]{3}/.test(t)) return 'hi'
  const own = baseOf(pack)
  if (t.replace(/[^\p{L}]+/gu, '').length < 200) return own
  let best = own
  let most = COMMON[own] ? (t.match(COMMON[own]!)?.length ?? 0) : 0
  for (const [l, re] of Object.entries(COMMON)) {
    const n = t.match(re)?.length ?? 0
    if (n > most) { most = n; best = l }
  }
  return best
}
/**
 * What kinds of helps a pack has for a book (not its introductions), and the language its notes and questions are written in;
 * read once. Null: the pack does not have the book. A read that fails is not kept (the next one tries again).
 */
function helpKinds(lang: string, book: string): Promise<Kinds | null> {
  const key = `${lang}|${book}`
  let p = HAS.get(key)
  if (!p) {
    const read: Promise<Kinds | null> = (async () => {
      const r = await openLang(lang)
      if (!r.installed(`book:${book}`)) return null
      const m: any = await r.book(book)
      const rows = (t: any) => ((t?.rows ?? []) as any[]).filter((x) => !(x.cols?.isIntro === true || x.cols?.isIntro === 'true'))
      const notes = rows(m?.notes), questions = rows(m?.questions)
      const sample = (xs: any[], cols: string[]) => xs.slice(0, 40).map((x) => cols.map((c) => String(x.cols?.[c] ?? '')).join(' ')).join(' ')
      return {
        terms: rows(m?.links).some((x) => x.concept), notes: notes.length > 0, questions: questions.length > 0,
        said: { notes: helpsLangOf(sample(notes, ['note']), lang), questions: helpsLangOf(sample(questions, ['question', 'response']), lang) },
      }
    })()
    p = read.catch(() => {
      if (HAS.get(key) === p) HAS.delete(key)
      return null
    })
    HAS.set(key, p)
  }
  return p
}
/** The pack of each app language (the app's own language is the second place a missing kind of help is taken from). */
const UI_PACKS: Record<string, string> = { en: 'en', es: 'es-419', fr: 'fr', id: 'id', hi: 'hi', ar: 'ar' }
/**
 * The pack that answers a book's notes, questions or key terms asked in `lang`: that pack when it has them for the book, else
 * the English pack, else the pack of the app's language (`ui`), when installed and they have them; null when none does. Not any
 * other pack: someone reading in Hindi with Spanish on the phone does not get Spanish notes.
 */
export async function helpsPack(book: string, kind: HelpKind, lang: string, ui: string): Promise<string | null> {
  const installed = await installedLangs().catch(() => [] as string[])
  for (const l of new Set([lang, ...['en', UI_PACKS[ui] ?? ''].filter((x) => installed.includes(x))])) {
    if ((await helpKinds(l, book))?.[kind]) return l
  }
  return null
}
/** The one kind of help a passage sheet asks for (a path's step, "notes Ruth 2:3"), or null (its text, or several kinds). */
export function helpKindOf(sheet: Sheet): HelpKind | null {
  if (sheet.intent !== 'passage' || !sheet.ref || /:intro$/.test(sheet.ref) || sheet.what.length !== 1) return null
  const k = sheet.what[0]
  return k === 'notes' || k === 'questions' || k === 'terms' ? k : null
}
/**
 * The pack other than the sheet's that answers its one kind of help (helpsPack), with the language those helps are written in;
 * or null: the sheet's own, none, or a sheet in a language not on the phone.
 */
export async function helpsElsewhere(sheet: Sheet, ui: string): Promise<{ lang: string; kind: HelpKind; said: string } | null> {
  const kind = helpKindOf(sheet)
  // (asked in a language that is not on the phone, "Dímelo en francés": the answer says so, as before; never another pack)
  if (!kind || !(await installedLangs().catch(() => [] as string[])).includes(sheet.lang)) return null
  const book = sheet.ref!.slice(0, 3)
  const l = await helpsPack(book, kind, sheet.lang, ui)
  if (!l || l === sheet.lang) return null
  const k = await helpKinds(l, book)
  return { lang: l, kind, said: kind === 'terms' ? baseOf(l) : k?.said[kind] ?? baseOf(l) }
}
// The question named the language of its helps and that pack lacks this kind for the book: said plainly, and the other
// pack's offered as a button ("Ver las notas en inglés"), never taken silently
const NONE_T: Record<string, { none: string; see: string; what: Record<HelpKind, string>; whatSee?: Record<HelpKind, string> }> = {
  en: { none: 'The {lang} helps on this phone have no {what} for {book}.', see: 'See the {what} in {other}', what: { notes: 'notes', questions: 'questions', terms: 'key terms' } },
  es: { none: 'Las ayudas en {lang} de este teléfono no tienen {what} para {book}.', see: 'Ver las {what} en {other}', what: { notes: 'notas', questions: 'preguntas', terms: 'palabras clave' } },
  fr: { none: "Les aides en {lang} de ce téléphone n'ont pas de {what} pour {book}.", see: 'Voir les {what} en {other}', what: { notes: 'notes', questions: 'questions', terms: 'mots clés' } },
  id: { none: 'Bahan bantu dalam bahasa {lang} di ponsel ini tidak memuat {what} untuk {book}.', see: 'Lihat {what} dalam bahasa {other}', what: { notes: 'catatan', questions: 'pertanyaan', terms: 'istilah kunci' } },
  hi: { none: 'इस फ़ोन पर {lang} की सहायता में {book} के लिए {what} नहीं हैं।', see: '{other} में {what} देखें', what: { notes: 'टिप्पणियाँ', questions: 'प्रश्न', terms: 'मुख्य शब्द' } },
  ar: { none: 'المساعدات باللغة {lang} على هذا الهاتف ليس فيها {what} لسفر {book}.', see: 'عرض {what} باللغة {other}', what: { notes: 'ملاحظات', questions: 'أسئلة', terms: 'كلمات رئيسية' },
    whatSee: { notes: 'الملاحظات', questions: 'الأسئلة', terms: 'الكلمات الرئيسية' } },
}
const langName = (ui: string, l: string) => (LANG_NAMES[ui] ?? LANG_NAMES.en!)[baseOf(l)] ?? env.packName(l)
/** "Las ayudas en hindi de este teléfono no tienen notas para Rut." and its button "Ver las notas en inglés". */
export function noneInWords(ui: string, sheetLang: string, other: string, kind: HelpKind, book: string): { none: string; see: string } {
  const t = NONE_T[ui] ?? NONE_T.en!
  return {
    none: t.none.replace('{lang}', langName(ui, sheetLang)).replace('{what}', t.what[kind]).replace('{book}', book),
    see: t.see.replace('{what}', (t.whatSee ?? t.what)[kind]).replace('{other}', langName(ui, other)),
  }
}
/** An introduction the sheet's pack does not have, from another installed pack that has it (null: none has it). */
export async function introElsewhere(sheet: Sheet): Promise<string | null> {
  const m = /^([0-9a-z]{3}) (front|\d+):intro$/.exec(sheet.ref ?? '')
  if (!m) return null
  const i = await introsOf(m[1]!, sheet.lang, m[2] === 'front' ? 'front' : +m[2]!).catch(() => null)
  return i && i.lang !== sheet.lang ? i.lang : null
}
/** Chapter -> the verses its sections start at, from a text's section headings (BSB has them; ULT, UST, GLT, GST do not). */
const headsCache = new Map<string, Promise<Map<number, number[]> | null>>()
function headsOf(code: string): Promise<Map<number, number[]> | null> {
  if (!headsCache.has(code)) {
    const p = (async () => {
      for (const l of new Set([env.helpsLang ?? 'en', 'en', ...(await installedLangs())])) {
        try {
          const r = await openLang(l)
          if (!r.installed(`book:${code}`)) continue
          for (const t of (((await r.book(code)) as any)?.texts ?? []) as { events?: [number, string, string][] }[]) {
            const out = new Map<number, number[]>()
            let ch = 0, heading = false
            for (const [, kind, arg] of t.events ?? []) {
              if (kind === 'chapter') ch = parseInt(String(arg), 10) || ch
              else if (kind === 'open' && /^para:s\d?$/.test(String(arg))) heading = true
              else if (kind === 'verse' && heading && ch) {
                const v = parseInt(String(arg), 10)
                if (v) out.set(ch, [...(out.get(ch) ?? []), v])
                heading = false
              }
            }
            if (out.size) return out
          }
        } catch {}
      }
      return null
    })().catch(() => null)
    headsCache.set(code, p)
    p.then((h) => { if (!h && headsCache.get(code) === p) headsCache.delete(code) })
  }
  return headsCache.get(code)!
}
/** The ranges a chapter's introduction (else the book's) outlines in that chapter ("1:1-5 …"): where its sections start. */
async function outlineStarts(code: string, ch: number, l: string, last: number): Promise<number[]> {
  for (const x of new Set([l, 'en'])) {
    try {
      const r = await openLang(x)
      if (!r.installed(`book:${code}`)) continue
      const rows = (((await r.book(code)) as any)?.notes?.rows ?? []).filter((y: any) => y.cols?.isIntro === true || y.cols?.isIntro === 'true')
      const chapIntro = rows.find((y: any) => y !== rows[0] && y.from === verseId(code, ch, 1))
      for (const row of [chapIntro, rows[0]].filter(Boolean)) {
        const starts = new Set<number>()
        // (Arabic and Devanagari digits read as ASCII ones)
        const note = String(row.cols.note ?? '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
          .replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d)))
        for (const m of note.matchAll(/(?<![\d:])(\d+):(\d+)\s*[-–]\s*(?:(\d+):)?(\d+)/g)) {
          if (+m[1]! !== ch || (m[3] && +m[3] !== ch) || +m[4]! >= last || +m[4]! < +m[2]!) continue
          // a range of another book in the prose ("see Genesis 12:1-3")
          const named = /([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)?)\s*$/u.exec(note.slice(Math.max(0, m.index! - 30), m.index!))?.[1]
          const other = named?.split(/\s+/).map((_, i, w) => bookCode(x, w.slice(i).join(' '))).find(Boolean)
          if (other && other !== code) continue
          starts.add(+m[2]!).add(+m[4]! + 1)
        }
        if (starts.size) return [...starts].sort((a, b) => a - b)
      }
    } catch {}
  }
  return []
}
/** A chapter's sections as [first verse, last verse]: from the text's headings, else its introduction's outline, else 5 verses each. */
export async function sectionsOf(code: string, ch: number, l: string): Promise<[number, number][]> {
  const last = (await boundsOf(code).catch(() => null))?.get(ch)
  if (!last) return []
  // (a source that leaves the whole chapter as one section is no help: the next one)
  const splits = (s: number[]) => s.filter((v) => v > 1 && v <= last).length > 0
  let starts = (await headsOf(code).catch(() => null))?.get(ch) ?? []
  if (!splits(starts)) starts = await outlineStarts(code, ch, l, last)
  if (!splits(starts)) { starts = []; for (let v = 1; v <= last; v += 5) starts.push(v) }
  starts = [...new Set([1, ...starts.filter((v) => v >= 1 && v <= last)])].sort((a, b) => a - b)
  // a heading before verse 1 and another before verse 2 (a psalm's title) make a 1-verse section: one section
  if (starts[1] === 2) starts.splice(1, 1)
  const out: [number, number][] = []
  starts.forEach((v, i) => {
    const end = (starts[i + 1] ?? last + 1) - 1
    // a long section (Psalm 119, 176 verses) in blocks of about 8 verses
    const n = end - v + 1 > 30 ? Math.ceil((end - v + 1) / 8) : 1
    const size = Math.ceil((end - v + 1) / n)
    for (let a = v; a <= end; a += size) out.push([a, Math.min(end, a + size - 1)])
  })
  return out
}
const secRef = (ch: number, [a, b]: [number, number]) => (a === b ? `${ch}:${a}` : `${ch}:${a}-${b}`)
/** "First section: Ruth 1:1–5" (or "Next section: …"), a button to its text and notes. */
function sectionStep(base: Sheet, code: string, ch: number, sec: [number, number], ui: string, kind: 'first' | 'next' | 'around'): Follow {
  const label = ST(ui)[kind].replace('{ref}', `${bookLabel(ui, code)} ${secRef(ch, sec).replace('-', '–')}`)
  return { label, sheet: passageSheet(base, `${code} ${secRef(ch, sec)}`, ['text', 'notes']) }
}
/** The first section of a chapter as a button (none when the book's text is in no pack). */
async function firstSection(base: Sheet, code: string, ch: number, ui: string): Promise<Follow | null> {
  const secs = await sectionsOf(code, ch, base.lang).catch(() => [])
  return secs[0] && secs.length > 1 ? sectionStep(base, code, ch, secs[0], ui, 'first') : null
}
/**
 * A verse in its place, as buttons: the section it is in ("Its section: Esther 2:12–18", when the chapter has more than one and
 * the section is more than the verse) and its chapter ("Read Esther 2"). `base`: the verse's own sheet (its pack).
 * TODO(sections): the packs will carry each book's section map (`reader.sections(book)`, not in staging yet, Nov 16); when they
 * do, sectionsOf should read it first, before the headings and outline guesses, and this button follows it with no change here.
 */
async function placeSteps(base: Sheet, h: Hit, ui: string): Promise<Follow[]> {
  const out: Follow[] = []
  const secs = await sectionsOf(h.book, h.ch, base.lang).catch(() => [])
  const sec = secs.length > 1 ? secs.find(([a, b]) => a <= h.v && h.v <= b) : undefined
  if (sec && sec[0] < sec[1]) out.push(sectionStep(base, h.book, h.ch, sec, ui, 'around'))
  out.push({ label: nextWords(ui).read.replace('{ref}', `${bookLabel(ui, h.book)} ${h.ch}`), sheet: passageSheet(base, `${h.book} ${h.ch}`, ['text', 'notes']) })
  return out
}
/** Under a passage that is one section ("Ruth 1:1-5"): the next one, in this chapter or the first of the next. */
async function nextSection(base: Sheet, ui: string): Promise<Follow | null> {
  const m = /^([0-9a-z]{3}) (\d+):(\d+)-(\d+)$/.exec(base.ref ?? '')
  if (!m) return null
  const [code, ch, v1, v2] = [m[1]!, +m[2]!, +m[3]!, +m[4]!]
  const secs = await sectionsOf(code, ch, base.lang).catch(() => [])
  const i = secs.findIndex(([a, b]) => a === v1 && b === v2)
  if (i < 0) return null
  if (secs[i + 1]) return sectionStep(base, code, ch, secs[i + 1]!, ui, 'next')
  const after = await sectionsOf(code, ch + 1, base.lang).catch(() => [])
  return after[0] ? sectionStep(base, code, ch + 1, after[0], ui, 'next') : null
}
/**
 * An introduction the helps do not have ("Introduction to Numbers 6"): what to say, and what there is instead: the chapter's
 * text, the passage the person was on, the book's introduction and the nearest chapter introductions that exist, Browse.
 */
async function noIntro(sheet: Sheet, ui: string, before: Sheet | null): Promise<{ said: string; follow: Follow[] } | null> {
  const m = /^([0-9a-z]{3}) (front|\d+):intro$/.exec(sheet.ref ?? '')
  if (!m) return null
  const code = m[1]!
  const ch = m[2] === 'front' ? null : +m[2]!
  const b = await boundsOf(code).catch(() => null)
  if (!b) return null
  const book = bookLabel(ui, code)
  const T = ST(ui)
  const intros = await introsOf(code, sheet.lang).catch(() => null)
  const said = [T.noIntro.replace('{what}', ch ? `${book} ${ch}` : book), intros ? '' : T.noNotes.replace('{book}', book)].filter(Boolean).join(' ')
  const at = ch && b.has(ch) ? ch : 1
  const follow: Follow[] = [{ label: nextWords(ui).read.replace('{ref}', `${book} ${at}`), sheet: passageSheet(sheet, `${code} ${at}`, ['text', 'notes']) }]
  if (before?.ref && before.intent === 'passage' && !/intro$/.test(before.ref) && before.ref !== `${code} ${at}`)
    follow.push({ label: T.back.replace('{ref}', refLabelOf(ui, before.ref)), sheet: { ...before, id: `f${Date.now()}` }, back: '' })
  if (intros) {
    const il = intros.lang
    if (ch && intros.front) follow.push({ label: introLabel(ui, book), sheet: passageSheet(sheet, `${code} front:intro`, ['intro'], il) })
    const has = [...intros.chapters].sort((x, y) => x - y)
    const prev = ch ? has.filter((c) => c < ch).pop() : undefined
    const next = has.find((c) => c > (ch ?? 0))
    for (const c of [prev, next]) if (c) follow.push({ label: introLabel(ui, `${book} ${c}`), sheet: passageSheet(sheet, `${code} ${c}:intro`, ['intro'], il) })
  }
  follow.push(browseStep(ui, { book: code }))
  return { said, follow }
}
/** Each button once (the same sheet or the same Browse), at most MAX_FOLLOW; Browse at a book opens the pack that has it. */
async function tidy(follow: Follow[], l: string): Promise<Follow[]> {
  const seen = new Set<string>()
  const out: Follow[] = []
  for (const f of follow) {
    const key = f.sheet ? `${f.sheet.intent} ${f.sheet.ref ?? ''} ${f.sheet.concept ?? ''} ${f.sheet.what.join(',')}` : f.browse ? `browse ${f.browse.book ?? ''} ${f.browse.manual ?? ''}` : `again ${f.again?.q ?? f.again?.label ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    if (f.browse?.book) {
      const p = await packWithBook(f.browse.book, f.browse.lang ?? l).catch(() => null)
      if (!p) continue
      out.push({ ...f, browse: { ...f.browse, lang: p } })
    } else out.push(f)
  }
  return out.slice(0, MAX_FOLLOW)
}

const clipTo = (s: string, n: number): string => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + ' …' : s)
// the sentence before the article
const TA_T: Record<string, string> = {
  en: 'Translation Academy has an article about this:', es: 'Translation Academy tiene un artículo sobre esto:',
  fr: 'Translation Academy a un article à ce sujet :', id: 'Translation Academy punya artikel tentang ini:',
  hi: 'Translation Academy में इस पर एक लेख है:', ar: 'في Translation Academy مقالة عن هذا:',
}

// -------------------------------------------------------------------------------------------------------------- the answer

export type Follow = Followup
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
  /** the next steps are the general ways forward the answer step added, the route having made none */
  fallback?: boolean
  /** the articles online AI is given as sources (its first is `ctx`): a Translation Words article and the Translation Academy one its text links to */
  sources?: { id: string; title?: string }[]
  /** "← Back to Ruth 2:3": the way back to the passage this point left (graph.ts), on its own row above the next steps */
  back?: Follow
  /** on a light path: where it is ("Ruth 1:6–18 · step 4 of 5: notes"); when it starts, the line that proposes it */
  pathMark?: string; pathLine?: string
  /** off the path: "← Back to the path: Ruth 1:6–18 · notes", on the row of the way back */
  pathBack?: Follow
  /** the conversation drifted far from its topic: offer a new conversation for this question (main.ts, while it is the last answer) */
  drift?: boolean
}
/** The answer, what kind it was (for the usage counts), and what tests check: the route-table step that made it, its target, how many sources it shows. */
export type Answered = {
  reply: Reply; answered: string; route: string
  /** the passage or article the answer is about, and how many sources it shows (cited helps, verses found, options) */
  ref: string | null; concept: string | null; found: number
  /** the sheet whose passage context online AI may get (when the answer came from a call sheet) */
  sheet: Sheet | null
  /** the point of the conversation's graph this answer is (null: an answer with nothing in it makes none) */
  node: string | null
}
/** What the routes work on: the question's sheet as it goes, and what earlier routes added to it. */
type Ctx = Made & {
  c: ConvState; t0: number; others: Follow[]; searched: string
  /** a sentence before the answer's own: a free search answered by something else than verses says so */
  lead?: string
  /** the call sheet's answer, once the `sheet` route has run */
  r?: Result
  /** where the answer's notes come from when another pack had them ("Notes in English, from the Arabic pack.") */
  from?: string
}
type Done = Omit<Answered, 'route' | 'sheet' | 'node'>
/** A step of the answer: when it applies, and what it does. A step returns the answer, or null to let the next step go on. */
type Route = { name: string; when: (x: Ctx) => boolean; run: (x: Ctx) => Promise<Done | null> }

const secs = (x: Ctx) => ((performance.now() - x.t0) / 1000).toFixed(1)
const hitLabel = (ui: string, h: Hit) => `${bookLabel(ui, h.book)} ${h.ch}:${h.v}`
const hitSheet = async (h: Hit, what: string[], ui: string) => (await buildSheet(`h${Date.now()}`, passageOf(h, what, ui), env.helpsLang)).sheet

/** A free search's best verse holds this much of the rarity of its words (or all of them): the verses are the answer. */
const GOOD = GOOD_COVERAGE
/** Below this, verses with some of the words are not shown: they would be unrelated (search.ts, Strength.coverage). */
const RELAX = RELAX_COVERAGE
/**
 * "Where does X happen?" says "It is in …" (one verse as the answer) only when the question names two things or more and its
 * best verse is this far ahead of the next passage's: "Where was Jesus born?" has many verses with Jesus and born alike.
 */
const CLEAR = 1.2
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
    x.lead = FT(x.ui).article.replace('{all}', words.join(' '))
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
      x.lead = FT(x.ui).academy.replace('{all}', words.join(' '))
      x.searched += `\nfindall: academy ${ta.id} (${ta.how})`
      return true
    }
  }
  const intro = await introFor(x.q!, x.sheet.lang)
  if (intro) {
    x.sheet = { ...base, intent: 'passage', concept: null, ref: intro.ref, what: ['intro'], lang: intro.lang } as Sheet
    x.lead = FT(x.ui).intro.replace('{all}', words.join(' '))
    x.searched += `\nfindall: introduction ${intro.ref}`
    return true
  }
  return false
}

/**
 * The next steps under an answer that is not a passage: a Translation Words article, its verses (when the name-verses step did
 * not list them), how to translate it, the articles it links to; a Translation Academy article, its related ones and its manual
 * in Browse; a count, the verses or the passage counted; a ranking, the articles ranked; advice on a verse, its helps and the
 * article cited; the rest, ways forward.
 */
async function otherSteps(x: Ctx, steps: Follow[]): Promise<Follow[]> {
  const { sheet, ui, r } = x
  const id = sheet.concept
  const cited = (r?.cites ?? []).filter((c) => c.startsWith('id:')).map((c) => c.slice(3))
  const article = async (a: string) => (a.startsWith('ta:') ? taStep(sheet, a, ui) : twStep(sheet, a))
  const some = async (ids: string[]) => (await Promise.all(ids.map((a) => article(a).catch(() => null)))).filter((f): f is Follow => !!f)
  const m = /^([0-9a-z]{3})(?: (\d+))?(?::(\d+))?/.exec(sheet.ref ?? '')
  const passage = (what: string[]) => sheet.ref ? [{ label: TT(ui).all.replace('{ref}', refLabelOf(ui, sheet.ref)), sheet: passageSheet(sheet, sheet.ref, what) }] : []
  switch (sheet.intent) {
    case 'article': {
      if (!id) return steps
      if (id.startsWith('ta:')) return [...steps, browseStep(ui, { manual: id.slice(3, id.indexOf('/')), lang: sheet.lang })]
      const verses = x.others.length ? [] : await verseSteps(sheet, id, ui)
      const how = howToOf(id)
      const howB = how && !steps.some((f) => f.sheet?.concept === how) ? await taStep(sheet, how, ui).catch(() => null) : null
      // the Academy article first among the links ("How to Translate Names")
      const ta = steps.filter((f) => f.sheet?.concept?.startsWith('ta:'))
      return [...verses, ...(howB ? [howB] : []), ...ta, ...steps.filter((f) => !ta.includes(f))]
    }
    case 'count': {
      const out: Follow[] = []
      if (id && sheet.ref && m?.[2]) {
        for (const v of (await linkedVerses(sheet.ref, id, sheet.lang).catch(() => [])).slice(0, 4))
          out.push({ label: `${bookLabel(ui, m[1]!)} ${v}`, sheet: passageSheet(sheet, `${m[1]} ${v}`, ['text', 'notes']) })
      } else if (id) out.push(...(await bookFirsts(sheet, id, ui, 4)))
      if (sheet.ref) out.push(...passage(sheet.what.length ? sheet.what : ['notes']))
      if (id) out.push(...(await some([id])))
      if (m) out.push(...(await bookSteps(sheet, ui)))
      // a count of nothing named (no article, no passage): the ways forward
      return out.length ? out : wayForward(sheet, ui)
    }
    case 'rank': return [...(await some(cited.slice(0, 5))), ...passage(['notes'])]
    case 'advice': return [...passage(['text', 'notes', 'questions', 'terms']), ...(await some(cited.filter((c) => c.startsWith('ta:')).slice(0, 2))), ...(m ? await bookSteps(sheet, ui) : [])]
    case 'choose': return steps
  }
  return [...steps, ...(await wayForward(sheet, ui, m?.[1] ?? null))]
}

// ------------------------------------------------------------------------------------------------------- out of scope
// "What's the weather tomorrow?", "¿Quién ganó el partido?", "Bonjour": nothing Mini helps with. Today such a question searched
// anyway ("hello" found hell); now one line says what Mini helps with and two or three buttons lead back. Detected
// conservatively: a word of data/guide.json `offTopic` must be there and nothing about the Bible or its helps, or only `weak`
// words (a greeting, thanks, "how much", "what time") with nothing else ("hello, who is Naomi?" is answered). Never when the
// reader read something (a book, a term, a known intent) or the conversation is on a passage (readQuestion `inScope`).
const OFF_TOPIC = anyOf(G_DATA.offTopic)
const WEAK = anyOf(G_DATA.weak)
const BIBLE_WORDS = anyOf(G_DATA.bible)
const HELP_WORDS: Command[] = ['intro', 'notes', 'questions', 'terms', 'verse', 'chapter', 'translateBook', 'howTranslate', 'translateThis', 'bookWord']
const hit = (re: RegExp, q: string) => { re.lastIndex = 0; const a = re.test(q); re.lastIndex = 0; const b = re.test(fold(q)); re.lastIndex = 0; return a || b }
/** A question without its off-topic and weak words (as typed, then without accents). */
const withoutOffTopic = (q: string): string => {
  const out = (s: string) => s.replace(OFF_TOPIC, ' ').replace(WEAK, ' ')
  return out(fold(out(q)))
}
/** A question without its greetings, thanks and the like (`weak`), or as it is when nothing else is left. */
export function withoutWeak(q: string): string {
  WEAK.lastIndex = 0
  const t = q.replace(WEAK, ' ').replace(/^[\s,.;:!¡¿،]+/u, '').replace(/\s+/g, ' ').trim()
  WEAK.lastIndex = 0
  return t || q
}
/** Whether a question has a word of `offTopic` or `weak`: the gate before {@link outOfScopeQ}. */
export const offTopic = (q: string): boolean => hit(OFF_TOPIC, q) || hit(WEAK, q)
const UI_LANGS6 = ['en', 'es', 'fr', 'id', 'hi', 'ar']
const OFF_BY_LANG = Object.keys(G_DATA.offTopic).map((l) => [l, anyOf({ [l]: [...G_DATA.offTopic[l]!, ...(G_DATA.weak[l] ?? [])] })] as const)
/** The language whose off-topic or weak words a question has (the most of them), or null: "¿Qué tiempo hará mañana?" is Spanish. */
export function offTopicLang(q: string): string | null {
  let best: string | null = null
  let most = 0
  for (const [l, re] of OFF_BY_LANG) {
    const n = (q.match(re)?.length ?? 0) + (fold(q).match(re)?.length ?? 0)
    if (n > most) {
      most = n
      best = l
    }
  }
  return best
}
/**
 * Whether a typed question is out of scope (with no reading of it and no passage in the conversation): an off-topic word and
 * nothing about the Bible ({@link aboutBible}); or weak words only, nothing else left once they are out.
 */
export async function outOfScopeQ(q: string, ui: string): Promise<boolean> {
  if (!offTopic(q)) return false
  if (!hit(OFF_TOPIC, q) && keywords(withoutOffTopic(q)).length) return false
  return !(await aboutBible(q, ui))
}
/**
 * Whether anything in a question is about the Bible or its helps: a reference, a book's name, a help word (notes, verse,
 * translate…), a word of `bible` (God, church, Scripture…), a key term of the packs named exactly, a Translation Academy title.
 */
export async function aboutBible(q: string, ui: string): Promise<boolean> {
  const t = latinDigits(q)
  if (/\d+\s*[:.]\s*\d+/.test(t)) return true
  if (hit(BIBLE_WORDS, q) || HELP_WORDS.some((c) => has(c, q))) return true
  const words = t.replace(/[¿?!¡.,;:«»"“”؟،()]/g, ' ').split(/\s+/).filter(Boolean)
  for (let i = 0; i < words.length; i++)
    for (let k = 3; k >= 1; k--) if (i + k <= words.length && bookExact(words.slice(i, i + k).join(' '))) return true
  // the rest, once the off-topic words are out: a key term named there ("the weather in Jerusalem"), not one the off-topic words
  // look like ("hello" is not hell, "gracias" not grace, "terima kasih" not love)
  const rest = withoutOffTopic(q)
  const kw = keywords(rest)
  if (kw.length && [...(await articlesNamed(kw).catch(() => new Set<string>()))].some((id) => id.startsWith('tw:'))) return true
  if (!kw.length) return false
  const packs: string[] = []
  for (const l of new Set([packCode(ui), 'en'])) if (await hasLang(l).catch(() => false)) packs.push(l)
  return !!(await academyFor(rest, packs, ui, true).catch(() => null))
}
/**
 * Out of scope: what Mini helps with in one line, in the question's language, and the ways back: the passage the conversation
 * is on (back to that point) or an example passage of an installed pack; a key term (of that passage, else an example); a
 * Translation Academy topic (the one its notes cite, else how translation is done).
 */
async function outOfScope(x: Ctx): Promise<Done> {
  // in the question's language, not the app's (a report of Nov 15: "¿Qué tiempo hará mañana?" was answered in English): the
  // reader's, else the language of its off-topic words, else the common words'; the way back to a path too (pathStep reads x.ui)
  const ql = x.qLang ?? offTopicLang(x.q ?? '') ?? guessLang(x.q ?? '')
  const ui = UI_LANGS6.includes(ql) ? ql : x.ui
  x.ui = ui
  const g = x.c.graph
  const at = g?.cur ? passageAt(g, g.cur) : undefined
  // the pack of that language when it is on the phone (the key term's name), else the sheet's, else English or the first there is
  const base: Sheet = (await hasLang(packCode(ui)).catch(() => false)) ? { ...x.sheet, lang: packCode(ui) }
    : (await hasLang(x.sheet.lang).catch(() => false)) ? x.sheet : { ...x.sheet, lang: (await hasLang('en')) ? 'en' : (await installedLangs())[0] ?? 'en' }
  const follow: Follow[] = []
  if (at) follow.push({ label: backLabel(ui, placeLabel(at, ui)), sheet: sheetOfNode(at), back: at.id })
  else {
    const ex = await exampleBook(base.lang, null).catch(() => null)
    if (ex) follow.push({ label: nextWords(ui).read.replace('{ref}', `${bookLabel(ui, ex.code)} 1`), sheet: passageSheet(base, `${ex.code} 1`, ['text', 'notes'], ex.lang) })
  }
  const links = at?.links ?? []
  for (const id of [...links.filter((l) => l.startsWith('tw:')), 'tw:kt/grace', 'tw:kt/faith', 'tw:kt/love']) {
    const f = await twStep(base, id).catch(() => null)
    if (f) { follow.push({ ...f, label: GD(ui).term.replace('{t}', f.label) }); break }
  }
  for (const id of [...links.filter((l) => l.startsWith('ta:')), 'ta:translate/translate-process', 'ta:intro/finding-answers']) {
    const f = await taStep(base, id, ui).catch(() => null)
    if (f) { follow.push(f); break }
  }
  return {
    answered: 'outofscope', ref: null, concept: null, found: 0,
    reply: { intro: GD(ui).scope, follow, ui, meta: `${env.details} · ${secs(x)} s\n${x.meta}\n(out of scope: no help searched)` },
  }
}

/** The answer's steps, in order: the first that returns an answer wins (`sheet`, `name-verses` and `options` build the last one). */
export const ROUTES: Route[] = [
  {
    // "¿Me lo puedes decir en inglés?" after a free search: the verses it found, from the pack asked for (a new search there
    // found others: Esther 2:14 became 2:17), each a button as before; the notes and questions with the question's words, and
    // the articles they name ("Ester", "Concubina"), from that pack
    name: 'found-again',
    when: (x) => !!x.keep?.hits.length,
    run: async (x) => {
      const { c, ui } = x
      const k = x.keep!
      const hits = k.hits.slice(0, 6)
      const texts = await textsOfVerses(hits, x.sheet.lang).catch(() => hits.map(() => ''))
      const lines = hits.map((h, i) => (texts[i] ? `**${hitLabel(ui, h)}** — ${texts[i]}` : '')).filter(Boolean)
      if (!lines.length) return null
      c.found = hits
      const at = (h: Hit, what: string[]) => passageSheet(x.sheet, `${h.book} ${h.ch}:${h.v}`, what)
      const follow: Follow[] = hits.slice(0, 4).map((h) => ({ label: hitLabel(ui, h), sheet: at(h, ['text', 'notes']) }))
      follow.splice(1, 0, ...(await placeSteps(follow[0]!.sheet!, hits[0]!, ui)))
      const words = k.words ?? k.used
      for (const id of [...(await articlesNamed(words).catch(() => new Set<string>()))].filter((i) => i.startsWith('tw:')).slice(0, 2)) {
        const f = await twStep(x.sheet, id).catch(() => null)
        if (f) follow.push(f)
      }
      const helps = x.q ? await searchHelps(x.q, x.sheet.lang).catch(() => []) : []
      const groups = (['note', 'question'] as const).map((kd) => ({
        head: (kd === 'note' ? HT().notes : HT().questions).replace('{w}', words.join(' ')),
        items: helps.filter((h) => h.kind === kd).map((h) => ({ ...h, snippet: plainSnippet(h.snippet), ref: hitLabel(ui, h) })),
      })).filter((g) => g.items.length)
      return {
        answered: 'search', ref: `${hits[0]!.book} ${hits[0]!.ch}:${hits[0]!.v}`, concept: null, found: lines.length + helps.length,
        reply: { ui, follow, intro: searchIntro(k.how, k.used, ui), info: lines.join('\n\n'), helps: groups.length ? groups : undefined,
          meta: `${env.details} · ${secs(x)} s\n${x.meta}\nthe same verses (${hits.map((h) => `${h.book} ${h.ch}:${h.v}`).join(', ')})` },
      }
    },
  },
  {
    // what code answered by itself (readQuestion): past a book's end ("Ruth 4:22 is the last verse of Ruth"), or how many
    // verses or chapters the passage has, from the text
    name: 'note',
    when: (x) => x.note !== undefined,
    run: async (x) => ({
      answered: x.note!.fromText ? 'count' : 'edge', ref: x.note!.fromText ? x.sheet.ref : null, concept: null, found: x.note!.fromText ? 1 : 0,
      reply: { info: x.note!.text, ui: x.ui, follow: await bookSteps(x.sheet, x.ui).catch(() => []), meta: `${env.details} · ${secs(x)} s
${x.meta}` },
    }),
  },
  {
    // a typed question about nothing Mini helps with (the weather, a match, "hello!"): what it helps with, and ways back; never
    // over a reading of it, nor in a conversation on a passage
    name: 'out-of-scope',
    when: (x) => x.q !== undefined && !x.at && !x.inScope && offTopic(x.q),
    run: async (x) => ((await outOfScopeQ(x.q!, x.ui)) ? outOfScope(x) : null),
  },
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
      const follow: Follow[] = (await relatedOf(lang, m.id).catch(() => [])).map((o) =>
        ({ label: o.title, sheet: { ...asked, id: `f${Date.now()}`, concept: o.id } as Sheet }))
      // "How do I translate the name Moses?": Moses' article first
      const who = m.id === 'ta:translate/translate-names' && NAME_RE.test(q!) ? await nameArticle(q!, ui).catch(() => null) : null
      const whoB = who?.startsWith('tw:names/') ? await twStep(asked, who) : null
      if (whoB) follow.unshift(whoB)
      follow.push(browseStep(ui, { manual: m.id.slice(3, m.id.indexOf('/')), lang }))
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
      // "¿Cómo debo traducir el nombre de Jonás?": the name, not the article "name" (a report of Nov 15)
      const named = NAME_RE.test(q!) ? await nameArticle(q!, ui) : null
      // the model's own term first ("…no sheep. How do I translate lamb?" -> lamb), then the question's words
      const id = named ?? (sheet.concept?.startsWith('tw:') ? sheet.concept : null) ?? await termArticle(q!, ui)
      // with no article for the thing ("pez grande"), "there is no … where I live" still wants "Translate Unknowns"
      if (!id && !(has('noWord', q!) && sheet.ref)) return null
      // a name (Jonah): the article and "How to Translate Names"; anything else: "Translate Unknowns"
      // (only a person's or place's article: "the name Yahweh" is a key term, translated as its article says)
      const isName = !!id && id.startsWith('tw:names/')
      const taId = isName ? 'ta:translate/translate-names' : 'ta:translate/translate-unknown'
      const base = { ...sheet, id: `t${Date.now()}`, ref: null, what: [], phrase: null, candidates: null, term: null } as Sheet
      const art = id ? await answerSheet({ ...base, intent: 'article', concept: id }) : null
      const ta = await answerSheet({ ...base, intent: 'article', concept: taId })
      // the article alone, the Academy article, the passage asked about, the verses with the term, the articles it links to
      const follow: Follow[] = []
      const tw = id ? await twStep(base, id) : null
      if (tw) follow.push(tw)
      const taB = await taStep(base, taId, ui)
      if (taB) follow.push(taB)
      if (sheet.ref) follow.push({ label: TT(ui).all.replace('{ref}', refLabelOf(ui, sheet.ref)), sheet: { ...sheet, id: `p${Date.now()}`, intent: 'passage', what: ['text', 'notes'], phrase: null } as Sheet })
      // (the verses with the term only when no passage is asked about: then that passage is the place)
      if (id) follow.push(...(sheet.ref ? [] : await verseSteps(base, id, ui)), ...(await packSteps(articleSheet(base, id, sheet.lang), null, ui).catch(() => [])))
      // online AI gets both articles as its sources (named under its answer)
      const sources = [id, taId].filter((v): v is string => !!v).map((v) => ({ id: v, title: titleOfStep(follow, v) }))
      return {
        answered: 'translate-unknown', ref: sheet.ref, concept: id ?? taId, found: (art?.cites.length ?? 0) + ta.cites.length,
        reply: { intro: isName ? TT(ui).name : TT(ui).unknown, info: art ? `${art.answer}\n\n${ta.answer}` : ta.answer, ui, lang: sheet.lang, follow, sources,
          meta: `${env.details} · ${secs(x)} s\n${x.meta}\ntranslate ${isName ? 'names' : 'unknowns'}: ${id ?? '(no article)'}` },
      }
    },
  },
  {
    // "¿Qué significa «redentor» en Rut 4?": the article of the term and where it is in the passage, not the whole passage
    // (not when it quotes a phrase of the verse: "Rut 3:9 qué quiere decir «extiende tu manto…»" wants the notes on that phrase)
    name: 'meaning',
    // (not over an introduction asked for: "¿Quién es el autor de Rut?" is no meaning of «autor»)
    when: ({ q, sheet }) => q !== undefined && !!sheet.ref && !/:intro$/.test(sheet.ref) && has('meaning', q) && ['passage', 'advice'].includes(sheet.intent) && !(sheet.intent === 'advice' && sheet.phrase),
    run: async (x) => {
      const { sheet, ui } = x
      const id = await termArticle(x.q!, ui)
      if (!id) return null
      const art = await answerSheet({ ...sheet, id: `a${Date.now()}`, intent: 'article', concept: id, ref: null, what: [], phrase: null, candidates: null, term: null } as Sheet)
      const where = await linkedVerses(sheet.ref!, id, sheet.lang ?? 'en')
      const label = refLabelOf(ui, sheet.ref!)
      const passage = { ...sheet, id: `p${Date.now()}`, intent: 'passage', what: ['text', 'notes', 'questions', 'terms'], phrase: null } as Sheet
      const links = await packSteps(articleSheet(sheet, id, sheet.lang), null, ui).catch(() => [])
      return {
        answered: 'meaning', ref: sheet.ref, concept: id, found: art.cites.length,
        reply: { info: art.answer + (where.length ? `\n\n${TT(ui).inRef.replace('{ref}', label).replace('{list}', where.join(', '))}` : ''),
          ui, lang: sheet.lang, follow: [{ label: TT(ui).all.replace('{ref}', label), sheet: passage },
            // the verses of the passage where it stands, the article alone, the articles its text links to
            ...where.slice(0, 3).map((v) => ({ label: `${bookLabel(ui, sheet.ref!.slice(0, 3))} ${v}`, sheet: passageSheet(sheet, `${sheet.ref!.slice(0, 3)} ${v}`, ['text', 'notes']) })),
            ...[await twStep(sheet, id)].filter((f): f is Follow => !!f), ...links],
          sources: [{ id }, ...links.filter((f) => f.sheet?.concept?.startsWith('ta:')).slice(0, 1).map((f) => ({ id: f.sheet!.concept!, title: titleOfStep([f], f.sheet!.concept!) }))],
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
        reply: { info: r.answer, ui, lang: sheet.lang, follow: [{ label: (await nameIn(sheet.lang, ids[0]!).catch(() => null)) ?? keywords(q!).join(' '), sheet: article }, ...(await bookFirsts(sheet, ids[0]!, ui))],
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
      const scope = x.sheet.ref && /^[1-3]?[a-z]{2,3}$/.test(x.sheet.ref) ? x.sheet.ref : null
      // a story in a book ("Daniel en el foso de los leones" read as Daniel, isOpen): searched in that book only, without its
      // name; unless a verse there fits well, the book itself as the reader read it (the sheet route answers it), never the
      // weaker answers below (an article, an introduction, notes elsewhere: "Quiero leer Rut" is Ruth)
      const inBook = scope && x.sheet.intent === 'passage' && !has('where', q) ? scope : null
      const res = inBook ? await searchVerses(storyWords(q, inBook).join(' '), null, x.sheet.lang, inBook) : await searchVerses(q, x.sheet.term, x.sheet.lang)
      // a where-question read as a book ("¿Dónde fue tragado Jonás…?" -> Jonah): that book's verses first
      if (scope && !inBook && res.hits.some((h) => h.book === scope)) res.hits = [...res.hits.filter((h) => h.book === scope), ...res.hits.filter((h) => h.book !== scope)]
      if (inBook) {
        const s0 = res.strength
        if (!res.hits.length || (s0 && !s0.full && s0.coverage < GOOD)) {
          x.searched = `\nsearch in ${inBook}: ${JSON.stringify(res.keywords)}, nothing fits well (coverage ${(s0?.coverage ?? 0).toFixed(2)}): the book`
          return null
        }
      }
      const st = res.strength
      const cover = st ? st.coverage : 1
      const good = res.hits.length > 0 && (!st || st.full || cover >= GOOD)
      x.searched = `\nsearch: ${res.how} ${JSON.stringify(res.keywords)} concepts ${JSON.stringify(res.concepts)}` +
        (st ? `\nfindall: ${good ? 'verses' : 'weak'}, coverage ${cover.toFixed(2)}, margin ${st.margin.toFixed(2)}, found ${JSON.stringify(st.matched)}, not ${JSON.stringify(st.missing)}` : '')
      const kind = kindOf(q)
      if (!good && (await findBeyondVerses(x, res.keywords))) {
        c.found = [] // "the second one" must not pick an earlier search's verse
        return null
      }
      const usable = good || (res.hits.length > 0 && cover >= RELAX)
      // the notes and questions that contain the same words, each a button to its verse's notes or questions
      const helps0 = (usable && kind) || inBook ? [] : await searchHelps(q, x.sheet.lang).catch(() => [])
      // no verse fits: the notes and questions that hold every word, before verses with only some of them
      const helpsFirst = !good && helps0.some((h) => h.all)
      // nothing has the words well ("cebada" with "pueblo" and "traduzco"): the article one of them names, with its verses
      if (!usable && !helpsFirst) {
        const id0 = await termArticle(q, ui)
        // only an article a word names (not a close spelling: "internet" would be "intercede")
        const id = id0 && (await articlesNamed(res.keywords)).has(id0) ? id0 : null
        if (id) {
          x.sheet = { ...x.sheet, intent: 'article', concept: id, candidates: null, term: null, ref: null, phrase: null } as Sheet
          x.searched += `\nrescued: ${id}`
          if (res.keywords.length) x.lead = FT(ui).article.replace('{all}', res.keywords.join(' '))
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
      // "say it in English" after this answer: these verses again, not a search in the other pack (repeatOf)
      if (hits.length && c.prevResolved && c.prevResolved.q === q) c.prevResolved.found = { hits: hits.map((h) => ({ book: h.book, ch: h.ch, v: h.v })), how: res.how, used, words: res.keywords }
      const follow: Follow[] = []
      for (const h of hits.slice(0, 4)) follow.push({ label: hitLabel(ui, h), sheet: await hitSheet(h, ['text', 'notes'], ui) })
      // the best verse in its place: its section and its chapter, right after it ("Ester concubinas" found Esther 2:14: a report
      // of Nov 16 wanted Esther 2 and the verses around 2:14)
      if (follow[0]?.sheet) follow.splice(1, 0, ...(await placeSteps(follow[0].sheet, hits[0]!, ui)))
      const line =(h: (typeof hits)[number], whole = false) => `**${hitLabel(ui, h)}** — ${(whole ? h.full ?? h.text : h.text).replace(/\s+/g, ' ').trim()}`
      // "where does it happen?": the verse it happens in first, whole, then the others
      // one verse as THE answer only when the question names two things or more and that verse is clearly ahead of the next
      // one shown (read as a book, "Jonah": the next one of that book)
      const ahead = hits[1]?.score ? (hits[0]?.score ?? 0) / hits[1].score : Infinity
      const where = good && hits.length > 0 && (has('where', q) || asksWhere(q)) && res.keywords.length >= 2 && ahead >= CLEAR &&
        (!scope || hits[0]!.book === scope)
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
          reply: { ui, intro: t.intro, info: t.info, limits: true, follow: await wayForward(x.sheet, ui, named ?? null),
            meta: `${env.details} · ${secs(x)} s\n${x.meta}${x.searched}\nfindall: nothing fits` },
        }
      }
      // no verse shown: the verses of the notes and questions found, each its notes or questions
      if (!hits.length) {
        for (const h of helps.slice(0, 4)) follow.push({ label: hitLabel(ui, h), sheet: await hitSheet(h, [h.kind === 'note' ? 'notes' : 'questions'], ui) })
      }
      // the article the words name exactly, when one does ("Jonah fish": Jonah)
      for (const id of [...(await articlesNamed(res.keywords).catch(() => new Set<string>()))].filter((i) => i.startsWith('tw:')).slice(0, 2)) {
        const f = await twStep(x.sheet, id).catch(() => null)
        if (f) follow.push(f)
      }
      // nothing to tap yet (the language asked in is not on the phone): the ways forward
      if (!follow.length) follow.push(...(await wayForward(x.sheet, ui)))
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
    // an introduction the sheet's pack lacks and another installed pack has: from that one (the Arabic pack has the English
    // notes of Numbers, which the English pack lacks: "Introduction to Numbers 6")
    name: 'intro-elsewhere',
    when: (x) => x.sheet.intent === 'passage' && /:intro$/.test(x.sheet.ref ?? '') && !facts.intro,
    run: async (x) => {
      const l = await introElsewhere(x.sheet).catch(() => null)
      if (!l) return null
      // only the notes come from there: the sheet (and every button under the answer) stays in the person's pack
      const r = await answerSheet({ ...x.sheet, lang: l })
      if (!facts.intro) return null
      const [, code, at] = /^([0-9a-z]{3}) (front|\d+):intro$/.exec(x.sheet.ref!)!
      const what = at === 'front' ? bookLabel(x.ui, code!) : `${bookLabel(x.ui, code!)} ${at}`
      const wrong = String(facts.intro)
      // the book as the person names it, not as the other pack does ("العدد 6"), in what answer.ts wrote above the notes:
      // the heading (without the pack's code), the source line, the introduction's heading
      let n = 0
      r.answer = r.answer.split('\n').map((line) =>
        /^(#{2,3} |\*)/.test(line) && n++ < 3 ? line.replace(wrong, what).replace(/^(## .*) \([a-z]{2,3}(?:-\w+)?\)$/, '$1') : line).join('\n')
      facts.intro = what
      x.r = r
      x.from = fromPack(x.ui, l, r.answer)
      return null
    },
  },
  {
    // one kind of help the sheet's pack lacks for the book and another installed pack has (helpsPack: English first): from that
    // one, saying so. A path's "questions" step in Hindi, "notes Ruth 2:3" on a phone with the Hindi and English packs
    name: 'helps-elsewhere',
    when: (x) => !!helpKindOf(x.sheet),
    run: async (x) => {
      const e = await helpsElsewhere(x.sheet, x.ui).catch(() => null)
      if (!e) return null
      // the question named the language ("रूत 2:3 के नोट्स हिंदी में"): never taken silently from another pack; said, and offered
      if (x.wanted) {
        const w = noneInWords(x.ui, x.sheet.lang, e.lang, e.kind, bookLabel(x.ui, x.sheet.ref!.slice(0, 3)))
        x.from = w.none
        x.others.unshift({ label: w.see, sheet: { ...x.sheet, id: `f${Date.now()}`, lang: e.lang } })
        return null
      }
      // only the helps come from there: the sheet (and every button under the answer) stays in the person's pack
      const r = await answerSheet({ ...x.sheet, lang: e.lang })
      if (!r.cites.length) return null
      x.r = r
      x.from = fromPack(x.ui, e.lang, r.answer, e.kind, e.said)
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
      let said = intro(sheet, facts, ui)
      const found = facts // the answer's own facts (the steps below read the packs)
      // an introduction the helps do not have: say so, and offer what there is (the passage before this one among it)
      const none = sheet.intent === 'passage' && !found.intro ? await noIntro(sheet, ui, x.c.last).catch(() => null) : null
      if (none) said = none.said
      if (x.from) said = [said, x.from].filter(Boolean).join(' ')
      const study = await studyOf(sheet).catch(() => null)
      const steps = await packSteps(sheet, study, ui).catch(() => [])
      const bounds = sheet.intent === 'passage' && sheet.ref ? await boundsOf(sheet.ref.slice(0, 3)).catch(() => null) : null
      // about to translate a book ("voy a empezar a traducir Jonás"): under its introduction, how to start (Translation Academy)
      const start = sheet.intent === 'passage' && /:intro$/.test(sheet.ref ?? '') && x.q !== undefined && startsBook(x.q)
        ? (await Promise.all(START_TA.map((id) => taStep(sheet, id, ui).catch(() => null)))).filter((f): f is Follow => !!f) : []
      // a passage's buttons in a pack that has its book; a book no pack has ("Pengantar Obaja" with only Indonesian): its
      // buttons would fail the same way, so only the ways forward
      const pack = sheet.intent === 'passage' && sheet.ref ? await packWithBook(sheet.ref.slice(0, 3), sheet.lang).catch(() => null) : null
      const follow: Follow[] = sheet.intent !== 'passage' ? await otherSteps(x, steps)
        : none ? none.follow
        : pack && r!.cites.length ? followups({ ...sheet, lang: pack }, found, ui, [...steps, ...start], bounds) : []
      // sections: under a chapter's introduction (and a book's, to start translating) its first one, after "Read …"; under
      // a section, the next one first
      if (sheet.intent === 'passage' && pack && !none && follow.length) {
        const im = /^([0-9a-z]{3}) (front|\d+):intro$/.exec(sheet.ref ?? '')
        if (im && (im[2] !== 'front' || start.length)) {
          const f = await firstSection({ ...sheet, lang: pack }, im[1]!, im[2] === 'front' ? 1 : +im[2]!, ui).catch(() => null)
          if (f) follow.splice(1, 0, f)
        } else if (!im) {
          const f = await nextSection({ ...sheet, lang: pack }, ui).catch(() => null)
          if (f) follow.unshift(f)
        }
      }
      // a passage with nothing to go on from (the version asked for is not here): the ways forward, its book first
      if (sheet.intent === 'passage' && !follow.length) follow.push(...(await wayForward(sheet, ui, pack ? sheet.ref!.slice(0, 3) : null)))
      // online AI is given the article and the Translation Academy article its text links to ("How to Translate Names")
      const ta = sheet.concept?.startsWith('tw:') ? follow.find((f) => f.sheet?.concept?.startsWith('ta:'))?.sheet?.concept : undefined
      // a free search answered by an article or an introduction says so first
      const reply: Reply = { intro: x.lead ? [x.lead, said].filter(Boolean).join(' ') : said, info: r!.answer, follow: [...x.others, ...follow].slice(0, MAX_FOLLOW), ui,
        study: study ?? undefined, lang: sheet.lang, ctx: sheet.intent === 'article' ? sheet.concept ?? undefined : undefined,
        sources: sheet.intent === 'article' && ta ? [{ id: sheet.concept! }, { id: ta, title: titleOfStep(follow, ta) }] : undefined,
        meta: `${env.details} · ${secs(x)} s\n${x.meta}${x.searched}\n${JSON.stringify(sheet, null, 1)}` }
      if (sheet.ref && sheet.intent === 'passage') x.c.last = sheet
      return {
        answered: sheet.intent === 'passage' ? (/intro/.test(sheet.ref ?? '') ? 'intro' : 'passage') : sheet.intent,
        ref: sheet.ref, concept: sheet.concept, found: r!.cites.length + (r!.options?.length ?? 0), reply,
      }
    },
  },
]

// ------------------------------------------------------------------------------------------------------ the graph
// Every answer with something in it is a point of the conversation's graph (graph.ts); code alone decides how it joins the
// one before. Under a point that went deeper or branched off, the first button goes back to the passage it came from.

/** Kinds of answer that are no point: past a book's end, a language not on the phone, "which one do you mean?", nothing understood. */
const NO_POINT = new Set(['edge', 'nopack', 'choose', 'unknown', 'resources', 'outofscope'])
const compact = (s: Sheet, ref: string | null, concept: string | null): NodeSheet =>
  ({ intent: s.intent, ref, concept, what: [...(s.what ?? [])], term: s.term ?? null, lang: s.lang })
/** A point's sheet as a call sheet again (to re-open it, or as the back button's target). */
export const sheetOfNode = (n: GNode): Sheet => ({ id: `g${Date.now()}`, intent: n.sheet.intent, ref: n.sheet.ref, what: [...n.sheet.what], version: null,
  concept: n.sheet.concept, term: n.sheet.term, phrase: null, candidates: null, lang: n.sheet.lang })
const clip = (q: string, words = 6): string => { const w = q.replace(/[¿?¡!]/g, '').trim().split(/\s+/); return w.length > words ? `${w.slice(0, words).join(' ')}…` : w.join(' ') }
/** Where a point is, said short: "Ruth 2:3", "Introduction to Numbers 6"; else its label. */
export function placeLabel(n: GNode, ui: string): string {
  const im = /^([0-9a-z]{3}) (front|\d+):intro$/.exec(n.sheet.ref ?? '')
  if (im) return introLabel(ui, im[2] === 'front' ? bookLabel(ui, im[1]!) : `${bookLabel(ui, im[1]!)} ${im[2]}`)
  return (n.kind === 'passage') && n.sheet.ref ? refLabelOf(ui, n.sheet.ref) : n.label
}
/** A point's name in 2–5 words: the passage and what was shown ("Ruth 2:3 · Notes"), the article's title, else the question. */
async function pointLabel(kind: string, s: NodeSheet, ui: string, q: string | undefined): Promise<string> {
  const im = /^([0-9a-z]{3}) (front|\d+):intro$/.exec(s.ref ?? '')
  if (im) return introLabel(ui, im[2] === 'front' ? bookLabel(ui, im[1]!) : `${bookLabel(ui, im[1]!)} ${im[2]}`)
  if (kind === 'passage' && s.ref) {
    const w = s.what.length === 1 ? whatWord(ui, s.what[0]!) : null
    return w ? `${refLabelOf(ui, s.ref)} · ${w}` : refLabelOf(ui, s.ref)
  }
  if (s.concept && kind !== 'search' && kind !== 'count') {
    for (const l of new Set([s.lang, 'en'])) {
      const t = await nameIn(l, s.concept).catch(() => null)
      if (t) return t
    }
  }
  if (q) return clip(q)
  return s.concept?.split('/').pop()?.replace(/-/g, ' ') ?? (s.ref ? refLabelOf(ui, s.ref) : '…')
}
async function graphStep(c: ConvState, made: Made, done: Done, x: Ctx, step: string): Promise<string | null> {
  const g = (c.graph ??= newGraph())
  const reply = done.reply
  let id: string | null = null
  if (made.at && nodeOf(g, made.at)) {
    // back to a point: this answer shows it again, it is no new point
    id = made.at
    g.cur = id
  } else {
    if (NO_POINT.has(done.answered) || !(done.ref || done.concept || done.found > 0)) return null
    const kind = done.answered
    const sheet = compact(x.sheet, done.ref ?? x.sheet.ref, done.concept ?? x.sheet.concept)
    // the term the question was about ("what does glean mean here?"), as this turn's state has it: going back restores it
    const term = c.state?.s.term
    if (!sheet.term && typeof term === 'string') sheet.term = term
    // what the next point may go into: the key terms and cited articles of the passage, the articles offered, the verses found
    const links = [
      ...(reply.study?.terms.map((t) => t.id) ?? []), ...(reply.study?.notes.map((n) => n.concept ?? '') ?? []),
      ...(reply.sources?.map((s) => s.id) ?? []), ...(reply.ctx ? [reply.ctx] : []),
      ...(reply.follow ?? []).map((f) => (f.sheet?.intent === 'article' ? f.sheet.concept ?? '' : kind === 'search' ? f.sheet?.ref ?? '' : '')),
    ].filter(Boolean)
    // a search keeps the verses it found, in order: going back to it, "the second one" is its second verse
    const found = kind === 'search' ? (c.found ?? []).map((h) => `${h.book} ${h.ch}:${h.v}`) : undefined
    // only the sheet's own answer is asked again from the sheet; the others needed the typed question: shown again as they were
    const n = addNode(g, { kind, sheet, links: [...(found ?? []), ...links], found, label: await pointLabel(kind, sheet, x.ui, made.q), copy: step !== 'reply' || undefined })
    id = n.id
    // far from where the conversation started: offer once to go on in a new conversation (main.ts, under this answer)
    if (drifts(g, n)) {
      n.drift = 'offered'
      reply.drift = true
    }
  }
  const to = backTarget(g, id)
  if (to) {
    const target = sheetOfNode(to)
    reply.back = { label: backLabel(x.ui, placeLabel(to, x.ui)), sheet: target, back: to.id }
    // no other button to that same passage ("All of Ruth 2:3", "Ruth 2:3", "Back to Ruth 1:16" under a missing introduction)
    const keep = (reply.follow ?? []).filter((f) => f.back !== '' && !(to.kind !== 'search' && f.sheet?.intent === 'passage' && f.sheet.ref === target.ref))
    if (keep.length) reply.follow = keep
  } else if (reply.follow?.some((f) => f.back === '')) {
    // the button back to the passage before, with no point to go back to: an ordinary button
    reply.follow = reply.follow.map(({ back, ...f }) => f)
  }
  return id
}

/**
 * Back to a point (the back button, the Map): the conversation's state from its sheet (the passage being read, the compact
 * state, no search results), and the question that re-opens it attached to the same point; null when the point is shown again
 * as it was (its message, main.ts), or there is no such point.
 */
export function returnTo(c: ConvState, id: string, ui: string): Made | null {
  const n = nodeOf(c.graph, id)
  if (!n) return null
  c.graph!.cur = id
  const p = passageAt(c.graph!, id)
  c.last = p ? sheetOfNode(p) : null
  // a search: its verses again, and its first one as the passage shown (as the search route leaves them); else none
  c.found = (n.found ?? []).map((r) => /^([0-9a-z]{3}) (\d+):(\d+)$/.exec(r)).filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ book: m[1]!, ch: +m[2]!, v: +m[3]! }))
  if (c.found.length) c.last = { ...sheetOfNode(n), intent: 'passage', ref: n.found![0]!, what: ['text'], concept: null, term: null }
  const sheet = sheetOfNode(n)
  keepState(c, slotsOfSheet(sheet))
  if (n.copy) return null
  return { sheet, ui, meta: '(back to an earlier point: no model call)', at: id }
}

// ------------------------------------------------------------------------------------------------ drift: a new conversation
/** The conversations the phone keeps (main.ts): a drift's [New conversation] says so when they are all taken. */
export const MAX_CONVS = 3
export const roomForNew = (conversations: number): boolean => conversations < MAX_CONVS
/** A message as moveOut needs it (main.ts Msg). */
type Moved = { who: string; node?: string; pathLine?: string; back?: Follow; pathBack?: Follow; drift?: boolean }
/**
 * Drift, [New conversation]: the answer `m` and the question before it leave conversation `c` (its point too; `c` goes on from
 * the point before, or from nothing), and come back as the messages and graph of a new conversation whose first point it is
 * (main.ts makes that conversation, then returnTo its point). A path goes with it only when this answer started it
 * (`pathLine`), and the path it replaced comes back to `c`. Null when `m` is not an answer with a point in `c`.
 */
export function moveOut<M extends Moved>(c: ConvState & { msgs: M[] }, m: M, ui: string): { msgs: M[]; graph: Graph; title: string } | null {
  const i = c.msgs.indexOf(m)
  const n = nodeOf(c.graph, m.node)
  if (i < 0 || !n || !c.graph) return null
  const from = c.msgs[i - 1]?.who === 'me' ? i - 1 : i
  const moved = c.msgs.splice(from, i - from + 1)
  c.graph.nodes = c.graph.nodes.filter((x) => x.id !== n.id)
  // (its point was the last: the others keep their messages' places)
  if (n.parent && nodeOf(c.graph, n.parent)) returnTo(c, n.parent, ui)
  else {
    c.graph.cur = null
    c.last = null
    c.found = []
    delete c.state
  }
  // its way back led to a point of the old conversation: none in the new one
  const msgs = moved.map((x) => ({ ...x, drift: undefined, back: undefined, pathBack: undefined }))
  msgs[msgs.length - 1]!.node = n.id
  const graph: Graph = { nodes: [{ ...n, parent: null, edge: 'start', drift: 'moved', msg: msgs.length - 1 }], cur: n.id }
  if (m.pathLine && c.graph.path) {
    graph.path = c.graph.path
    if (c.graph.pathNext) graph.pathNext = c.graph.pathNext
    if (c.graph.pathBefore) c.graph.path = c.graph.pathBefore
    else delete c.graph.path
    delete c.graph.pathNext
  }
  delete c.graph.pathBefore
  const q = moved[0]?.who === 'me' ? (moved[0] as { text?: string }).text : undefined
  return { msgs, graph, title: (q ?? n.label).slice(0, 48) }
}

// ------------------------------------------------------------------------------------------------- the path, per answer
/**
 * The steps of a path through a book that the packs can answer, as the answer will (helpsPack): the introduction and the
 * sections always; its key terms, its notes, its questions when the path's pack (`lang`) has them for the book, else another
 * the English pack or the app language's pack does (its answer then says so). A Hindi-only phone's path through Acts has four
 * steps; with English too, five.
 */
export async function stepsHad(book: string, lang: string, ui: string): Promise<number[]> {
  const out = [1, 2]
  for (const [step, kind] of [[3, 'terms'], [4, 'notes'], [5, 'questions']] as const) if (await helpsPack(book, kind, lang, ui)) out.push(step)
  return out
}
/** The sections of a book's chapter (none when it has no such chapter or no text on the phone). */
const secsOf = (p: Path, ch: number | null): Promise<Sec[]> => (ch ? sectionsOf(p.book, ch, p.lang).catch(() => []) : Promise.resolve([]))
/** A step of the path as a call sheet (the next step's button, the way back to it, the Map's "Continue the path"). */
export function pathSheet(p: Path, base?: Sheet): Sheet | null {
  const t = stepTarget(p)
  if (!t) return null
  const b: Sheet = base ?? { id: '', intent: 'passage', ref: null, what: [], version: null, concept: null, term: null, phrase: null, candidates: null, lang: p.lang }
  return passageSheet(b, t.ref, t.what, p.lang)
}
/** "Continue the path: Ruth 1:6–18 · notes", "← Back to the path: …", in the app's language. */
export const pathLabel = (ui: string, p: Path, kind: 'mark' | 'next' | 'toPath' | 'resume'): string => pathWords(ui, p, bookLabel(ui, p.book), kind)

/**
 * The light path after an answer (graph.ts Path): a task announced on a book starts one at its introduction; an answer that is
 * a step of it (by its passage and what it shows) moves it there, says where it is, and offers the next step first; an answer
 * off it (another book, an article, a search) offers one tap back to where it was. Kept in the conversation's graph.
 */
async function pathStep(c: ConvState, made: Made, done: Done, x: Ctx): Promise<void> {
  const reply = done.reply
  const ref = done.ref ?? x.sheet.ref
  const P = place(ref)
  const g = (c.graph ??= newGraph())
  // (the path before this answer, kept while a new conversation is offered for it: main.ts moves only the new one)
  delete g.pathBefore
  let at: Path | null = null
  if (made.path && P?.book === made.path.book) {
    const has = await stepsHad(made.path.book, x.sheet.lang, x.ui)
    // (a book's path replaces the lessons: its steps are not "away from the lessons")
    delete g.learn
    at = { book: made.path.book, ch: made.path.ch, task: made.path.task, lang: x.sheet.lang, step: 1, sec: null, has }
    reply.pathLine = pathStartLine(x.ui, bookLabel(x.ui, at.book), has)
    if (reply.drift && g.path) g.pathBefore = g.path
  } else if (g.path) at = stepOf(g.path, ref, x.sheet.what ?? [], await secsOf(g.path, P?.ch ?? null))
  const p = g.path
  // (the next step is kept only while the last answer is on the path)
  delete g.pathNext
  if (at) {
    g.path = at
    reply.pathMark = pathLabel(x.ui, at, 'mark')
    const ch = at.ch ?? 1
    const nx = nextStep(at, await secsOf(at, ch), lastOfSection(at) ? await secsOf(at, ch + 1) : [])
    const sheet = nx ? pathSheet(nx, x.sheet) : null
    if (nx && sheet) {
      g.pathNext = nx
      // the next step first; a button to the same passage with those helps is that step ("First section: Ruth 1:1–5", "Notes")
      const same = (f: Follow) => f.sheet?.intent === 'passage' && f.sheet.ref === sheet.ref && sheet.what.every((w) => f.sheet!.what.includes(w))
      reply.follow = [{ label: pathLabel(x.ui, nx, 'next'), sheet, pathNext: true },...(reply.follow ?? []).filter((f) => !same(f))].slice(0, MAX_FOLLOW)
    }
    return
  }
  // off the path (another book, an article, a search): one tap back to where it was; not under an answer in the path's book
  // (near it). When the way back of the graph goes to that very step, it is that button, named as the way back to the path
  if (!p || P?.book === p.book || done.answered === 'edge' || done.answered === 'nopack') return
  const t = stepTarget(p)
  const to = (f: Follow | undefined) => !!f && f.back !== undefined && !!t && f.sheet?.ref === t.ref && t.what.every((w) => f.sheet!.what.includes(w))
  if (t && to(reply.back)) {
    reply.back = { ...reply.back!, label: pathLabel(x.ui, p, 'toPath'), toPath: true }
    return
  }
  // (out of scope: its way back to the point the conversation is on)
  const i = t ? (reply.follow ?? []).findIndex(to) : -1
  if (i >= 0) {
    reply.follow![i] = { ...reply.follow![i]!, label: pathLabel(x.ui, p, 'toPath'), toPath: true }
    return
  }
  const sheet = pathSheet(p, x.sheet)
  if (sheet) reply.pathBack = { label: pathLabel(x.ui, p, 'toPath'), sheet, toPath: true }
}

/** The answer to what a question asks for: the first route that gives one (the conversation keeps the last passage and search results). */
export async function answer(c: ConvState, made: Made, t0: number): Promise<Answered> {
  setUiLang(made.ui)
  // the words the question asks about put their notes first (focus.ts); none for a button press (no question)
  setQuestion(made.q, made.sheet)
  // a button (no question: a ready sheet, no reading step) moves the conversation too: "and the notes?" after it is about it
  if (made.q === undefined) keepState(c, slotsOfSheet(made.sheet), { sheet: made.sheet, ui: made.ui })
  const x: Ctx = { ...made, c, t0, others: [], searched: '' }
  for (const route of ROUTES) {
    if (!route.when(x)) continue
    const done = await route.run(x)
    if (!done) continue
    // every answer offers next steps: each once, Browse where the book is; and when an answer has none, ways forward
    const reply = done.reply
    // ("Dímelo en francés" with no French helps here: said first)
    if (made.langNote) reply.intro = [made.langNote, reply.intro].filter(Boolean).join(' ')
    reply.follow = await tidy(reply.follow ?? [], x.sheet.lang).catch(() => reply.follow ?? [])
    // (a language that is not on the phone: "Add languages" first, then these)
    if (!reply.follow.length) {
      const named = /^([0-9a-z]{3})/.exec(x.sheet.ref ?? '')?.[1] ?? null
      reply.follow = await wayForward(x.sheet, x.ui, named).catch(() => [browseStep(x.ui)])
      // a route that made none: the tests list where that is allowed (answers.test.ts NO_OWN_STEPS)
      reply.fallback = true
    }
    // the answer's point in the conversation's graph, and under a point that left the passage, the way back to it
    const node = await graphStep(c, made, done, x, route.name).catch(() => null)
    // on a light path: where it is and its next step first; off it, the way back to it
    await pathStep(c, made, done, x).catch(() => {})
    // on a learning path (learn.ts): where it is, the next article and a verse to try; off it, the way back to it
    await learnStep(c, done, x.sheet, x.ui).catch(() => {})
    return { ...done, route: route.name, sheet: x.r ? x.sheet : null, node }
  }
  throw new Error('no route answered') // `reply` always answers
}
