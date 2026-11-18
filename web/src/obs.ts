// Open Bible Stories (Fase 2c, Abel Nov 15): the 50 stories of a language's `obs` unit, read through the pinned client
// (`reader.stories()`, `reader.stories(ref)`, `reader.story(n)`). A story is told from Bible passages: the ranges come from the
// common `xtopics` (every language has them, with or without the obs unit), the frames, the title, the source line and the
// story's notes, questions and key terms from the `obs` unit. This module is DOM-free and reads no answer or pipeline state:
// answer.ts writes the answer from `obsAnswer`, pipeline.ts adds the buttons (`obsSteps`, `storyStep`) and reads questions
// (`obsAsked`, `namedStory`), explore.ts lists the stories (`storyList`), the search finds frames (`searchObs`), and online AI
// gets the story's plain text (`storyText`).
//
// Where OBS comes from: the question's pack, else English, else any pack on the phone that has the unit. A pack that lists the
// unit and does not have it (installed before OBS came with a language) says so with its size and offers to add it; one
// that does not list it says plainly that its packs have no Open Bible Stories yet. Nothing here throws for a missing unit.
import { BOOKS, bookNumber, type ObsModel, parseRef as v3Ref, verseId } from '@bt-synergy/language-pack-v3'
import type { PackReader } from '@bt-synergy/language-pack-client'
import { installedLangs, openLang, origin, PACK_NAMES, serverUnitSize, uiLangs } from './packs'
import { FOLD } from './focus'
import { bidiLabel } from './bidi'
import { keywords } from './search'
import { bookCandidates, bookExact, fold } from './sheet'
import booknames from './data/booknames.json'
import versification from './data/versification.json'

type L = 'en' | 'es' | 'fr' | 'id' | 'hi' | 'ar'
const UIS: L[] = ['en', 'es', 'fr', 'id', 'hi', 'ar']
const ui6 = (ui: string): L => ((UIS as string[]).includes(ui) ? (ui as L) : ui.startsWith('es') ? 'es' : 'en')
const fill = (t: string, v: Record<string, string | number>): string => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))

// ------------------------------------------------------------------------------------------------------------------ words

type Words = {
  /** Browse's entry and its subtitle */
  browse: string; browseSub: string
  /** the sentence before an answer */
  found: string; foundStory: string
  /** headings and folds */
  notes: string; questions: string; terms: string; notesFold: string; questionsFold: string
  noNotes: string; noQuestions: string
  /** the buttons */
  next: string; nextStory: string; whole: string; first: string; bible: string; toldIn: string; also: string; add: string
  /** not there */
  missing: string; missingAdd: string; missingLater: string; none: string; fromOther: string; noStory: string; noFrame: string
  /** the search's part and its button */
  inStories: string
}
const W: Record<L, Words> = {
  en: {
    browse: 'Bible stories (OBS)', browseSub: 'Open Bible Stories: the 50 stories',
    found: 'Here is {ref} of Open Bible Stories ({title}).', foundStory: 'Here is the story {ref}: {title}.',
    notes: 'Translation notes for {ref}', questions: 'Comprehension questions for {ref}', terms: 'Key terms', notesFold: 'Notes for {ref} ({n})', questionsFold: 'Questions ({n})',
    noNotes: 'There are no translation notes for {ref}.', noQuestions: 'There are no comprehension questions for {ref}.',
    next: 'Next: {ref}', nextStory: 'Next story: {name}', whole: 'The whole story: {ref}', first: 'Start the story: {ref}', bible: 'Bible: {ref}',
    toldIn: 'This part is told in {ref}: {title}', also: '(also {refs})', add: 'Add Open Bible Stories ({size})',
    missing: 'Open Bible Stories are not on this phone yet ({pack}, {size}).', missingAdd: 'Tap below to add them (internet needed once).',
    missingLater: 'They will come with the next update of this pack.',
    none: 'The language packs on this phone have no Open Bible Stories yet, so I cannot show {ref}.',
    fromOther: 'From the {lang} pack (the {mine} pack has no Open Bible Stories yet).',
    noStory: 'Open Bible Stories has 50 stories, numbered 1 to 50: there is no story {n}.', noFrame: 'Story {n} has frames 1 to {last}: there is no frame {f}.',
    inStories: 'In Open Bible Stories',
  },
  es: {
    browse: 'Historias de la Biblia (OBS)', browseSub: 'Open Bible Stories: las 50 historias',
    found: 'Aquí está {ref} de las Historias de la Biblia ({title}).', foundStory: 'Aquí está la historia {ref}: {title}.',
    notes: 'Notas de traducción de {ref}', questions: 'Preguntas de comprensión de {ref}', terms: 'Palabras clave', notesFold: 'Notas de {ref} ({n})', questionsFold: 'Preguntas ({n})',
    noNotes: 'No hay notas de traducción para {ref}.', noQuestions: 'No hay preguntas de comprensión para {ref}.',
    next: 'Siguiente: {ref}', nextStory: 'Siguiente historia: {name}', whole: 'Toda la historia: {ref}', first: 'Empezar la historia: {ref}', bible: 'Biblia: {ref}',
    toldIn: 'Esta parte se cuenta en {ref}: {title}', also: '(también {refs})', add: 'Agregar Historias de la Biblia ({size})',
    missing: 'Las Historias de la Biblia todavía no están en este teléfono ({pack}, {size}).', missingAdd: 'Toca abajo para agregarlas (hace falta internet una vez).',
    missingLater: 'Llegarán con la próxima actualización de este paquete.',
    none: 'Los paquetes de idioma de este teléfono todavía no traen Historias de la Biblia (OBS), así que no puedo mostrar {ref}.',
    fromOther: 'Del paquete {lang} (el paquete {mine} todavía no trae Historias de la Biblia).',
    noStory: 'Las Historias de la Biblia son 50, numeradas del 1 al 50: no hay historia {n}.', noFrame: 'La historia {n} tiene los cuadros 1 a {last}: no hay cuadro {f}.',
    inStories: 'En las Historias de la Biblia',
  },
  fr: {
    browse: 'Histoires bibliques (OBS)', browseSub: 'Open Bible Stories : les 50 histoires',
    found: 'Voici {ref} des Open Bible Stories ({title}).', foundStory: 'Voici l’histoire {ref} : {title}.',
    notes: 'Notes de traduction pour {ref}', questions: 'Questions de compréhension pour {ref}', terms: 'Mots clés', notesFold: 'Notes pour {ref} ({n})', questionsFold: 'Questions ({n})',
    noNotes: 'Il n’y a pas de notes de traduction pour {ref}.', noQuestions: 'Il n’y a pas de questions de compréhension pour {ref}.',
    next: 'Suite : {ref}', nextStory: 'Histoire suivante : {name}', whole: 'Toute l’histoire : {ref}', first: 'Commencer l’histoire : {ref}', bible: 'Bible : {ref}',
    toldIn: 'Ce passage est raconté dans {ref} : {title}', also: '(aussi {refs})', add: 'Ajouter les Open Bible Stories ({size})',
    missing: 'Les Open Bible Stories ne sont pas encore sur ce téléphone ({pack}, {size}).', missingAdd: 'Touchez ci-dessous pour les ajouter (internet nécessaire une fois).',
    missingLater: 'Elles viendront avec la prochaine mise à jour de ce paquet.',
    none: 'Les paquets de langue de ce téléphone n’ont pas encore d’Open Bible Stories (OBS), donc je ne peux pas afficher {ref}.',
    fromOther: 'Du paquet {lang} (le paquet {mine} n’a pas encore d’Open Bible Stories).',
    noStory: 'Les Open Bible Stories ont 50 histoires, numérotées de 1 à 50 : il n’y a pas d’histoire {n}.', noFrame: 'L’histoire {n} a les images 1 à {last} : il n’y a pas d’image {f}.',
    inStories: 'Dans les Open Bible Stories',
  },
  id: {
    browse: 'Cerita Alkitab (OBS)', browseSub: 'Open Bible Stories: 50 cerita',
    found: 'Ini {ref} dari Open Bible Stories ({title}).', foundStory: 'Ini cerita {ref}: {title}.',
    notes: 'Catatan terjemahan untuk {ref}', questions: 'Pertanyaan pemahaman untuk {ref}', terms: 'Istilah kunci', notesFold: 'Catatan untuk {ref} ({n})', questionsFold: 'Pertanyaan ({n})',
    noNotes: 'Tidak ada catatan terjemahan untuk {ref}.', noQuestions: 'Tidak ada pertanyaan pemahaman untuk {ref}.',
    next: 'Berikutnya: {ref}', nextStory: 'Cerita berikutnya: {name}', whole: 'Seluruh cerita: {ref}', first: 'Mulai cerita: {ref}', bible: 'Alkitab: {ref}',
    toldIn: 'Bagian ini diceritakan dalam {ref}: {title}', also: '(juga {refs})', add: 'Tambahkan Open Bible Stories ({size})',
    missing: 'Open Bible Stories belum ada di ponsel ini ({pack}, {size}).', missingAdd: 'Ketuk di bawah untuk menambahkannya (perlu internet sekali).',
    missingLater: 'Akan datang bersama pembaruan berikutnya dari paket ini.',
    none: 'Paket bahasa di ponsel ini belum memuat Open Bible Stories (OBS), jadi saya tidak dapat menampilkan {ref}.',
    fromOther: 'Dari paket {lang} (paket {mine} belum memuat Open Bible Stories).',
    noStory: 'Open Bible Stories punya 50 cerita, bernomor 1 sampai 50: tidak ada cerita {n}.', noFrame: 'Cerita {n} punya bingkai 1 sampai {last}: tidak ada bingkai {f}.',
    inStories: 'Dalam Open Bible Stories',
  },
  hi: {
    browse: 'बाइबल की कहानियाँ (OBS)', browseSub: 'Open Bible Stories: 50 कहानियाँ',
    found: 'यह Open Bible Stories का {ref} है ({title})।', foundStory: 'यह कहानी {ref} है: {title}।',
    notes: '{ref} के लिए अनुवाद टिप्पणियाँ', questions: '{ref} के लिए समझ के प्रश्न', terms: 'मुख्य शब्द', notesFold: '{ref} की टिप्पणियाँ ({n})', questionsFold: 'प्रश्न ({n})',
    noNotes: '{ref} के लिए कोई अनुवाद टिप्पणी नहीं है।', noQuestions: '{ref} के लिए समझ का कोई प्रश्न नहीं है।',
    next: 'आगे: {ref}', nextStory: 'अगली कहानी: {name}', whole: 'पूरी कहानी: {ref}', first: 'कहानी शुरू करें: {ref}', bible: 'बाइबल: {ref}',
    toldIn: 'यह भाग {ref} में बताया गया है: {title}', also: '(यह भी: {refs})', add: 'Open Bible Stories जोड़ें ({size})',
    missing: 'Open Bible Stories अभी इस फ़ोन पर नहीं हैं ({pack}, {size})।', missingAdd: 'उन्हें जोड़ने के लिए नीचे टैप करें (एक बार इंटरनेट चाहिए)।',
    missingLater: 'वे इस पैक के अगले अपडेट के साथ आएँगी।',
    none: 'इस फ़ोन के भाषा-पैकों में अभी Open Bible Stories (OBS) नहीं हैं, इसलिए मैं {ref} नहीं दिखा सकता।',
    fromOther: '{lang} पैक से ({mine} पैक में अभी Open Bible Stories नहीं हैं)।',
    noStory: 'Open Bible Stories में 1 से 50 तक 50 कहानियाँ हैं: कहानी {n} नहीं है।', noFrame: 'कहानी {n} में फ़्रेम 1 से {last} तक हैं: फ़्रेम {f} नहीं है।',
    inStories: 'Open Bible Stories में',
  },
  ar: {
    browse: 'قصص الكتاب المقدس (OBS)', browseSub: 'Open Bible Stories: القصص الخمسون',
    found: 'هذا {ref} من Open Bible Stories ({title}).', foundStory: 'هذه القصة {ref}: {title}.',
    notes: 'ملاحظات الترجمة لـ{ref}', questions: 'أسئلة الفهم لـ{ref}', terms: 'الكلمات الرئيسية', notesFold: 'ملاحظات {ref} ({n})', questionsFold: 'الأسئلة ({n})',
    noNotes: 'لا توجد ملاحظات ترجمة لـ{ref}.', noQuestions: 'لا توجد أسئلة فهم لـ{ref}.',
    next: 'التالي: {ref}', nextStory: 'القصة التالية: {name}', whole: 'القصة كاملة: {ref}', first: 'ابدأ القصة: {ref}', bible: 'الكتاب المقدس: {ref}',
    toldIn: 'هذا الجزء مروي في {ref}: {title}', also: '(وأيضًا {refs})', add: 'إضافة Open Bible Stories ({size})',
    missing: 'Open Bible Stories ليست على هذا الهاتف بعد ({pack}، {size}).', missingAdd: 'اضغط أدناه لإضافتها (يلزم الإنترنت مرة واحدة).',
    missingLater: 'ستأتي مع التحديث القادم لهذه الحزمة.',
    none: 'حزم اللغات على هذا الهاتف لا تحتوي بعد على Open Bible Stories (OBS)، فلا أستطيع عرض {ref}.',
    fromOther: 'من حزمة {lang} (حزمة {mine} لا تحتوي بعد على Open Bible Stories).',
    noStory: 'في Open Bible Stories خمسون قصة مرقّمة من 1 إلى 50: لا توجد قصة {n}.', noFrame: 'القصة {n} فيها الإطارات من 1 إلى {last}: لا يوجد إطار {f}.',
    inStories: 'في Open Bible Stories',
  },
}
export const OW = (ui: string): Words => W[ui6(ui)]

// --------------------------------------------------------------------------------------------------------------- references

/** A story and, for one frame, the frame: "obs 3:5" is story 3, frame 5; "obs 34" the whole story. */
export type ObsRef = { n: number; f: number | null }
export function parseObsRef(ref: string | null | undefined): ObsRef | null {
  const m = /^obs\s+(\d+)(?::(\d+))?$/.exec((ref ?? '').trim().toLowerCase())
  return m ? { n: +m[1]!, f: m[2] ? +m[2] : null } : null
}
export const isObsRef = (ref: string | null | undefined): boolean => /^obs(\s|$)/.test(ref ?? '')
export const obsRef = (n: number, f?: number | null): string => (f ? `obs ${n}:${f}` : `obs ${n}`)
/** "OBS 3:5", the same in every language (the product's name, as the app says "Translation Academy"). */
export const obsLabel = (n: number, f?: number | null): string => (f ? `OBS ${n}:${f}` : `OBS ${n}`)
/** What a tap on a story's 5M sends, as if typed ("5M OBS 1"): the one place it is spelled (modes.ts, pipeline.ts). */
export const fiveAsk = (n: number): string => `5M ${obsLabel(n)}`
/** "3. The Flood" -> "The Flood" (the packs keep the number in the title; Arabic's "٢. …" too). */
export const cleanTitle = (t: string | undefined): string => String(t ?? '').replace(/^\s*\p{Nd}{1,2}\s*[.:)\-–]\s*/u, '').trim()

const BOOK_EN = (booknames as any).BOOK_EN as Record<string, string>
const BOOK_ES = (booknames as any).BOOK_ES as Record<string, string>
const BOOK_AR = (booknames as any).BOOK_AR as Record<string, string>
const VERSES = versification as Record<string, number[]>
/** "gen 6:1-8:22" in the app's language: "Genesis 6:1–8:22". */
export function bibleLabel(ui: string, ref: string): string {
  const [code, rest] = [ref.slice(0, 3), ref.slice(4)]
  const t = ui === 'es' ? BOOK_ES : ui === 'ar' ? BOOK_AR : BOOK_EN
  return `${t[code] ?? BOOK_EN[code] ?? code} ${rest.replace(/-/g, '–')}`.trim()
}

/**
 * A Mini passage ref ("gen 6", "gen 6-8", "gen 6:1-3", "gen 6:1-8:22", "gen 6:intro") as verse ids, or null (a book, an obs
 * ref).
 */
export function rangeOfRef(ref: string | null | undefined): [number, number] | null {
  const t = (ref ?? '').trim().toLowerCase()
  const chs = /^([1-3]?[a-z]{2,3})\s+(\d+)-(\d+)$/.exec(t)
  if (chs && chs[1] !== 'obs' && VERSES[chs[1]!] && +chs[3]! >= +chs[2]!) {
    try {
      return [verseId(chs[1]!, +chs[2]!, 0), verseId(chs[1]!, +chs[3]!, 999)]
    } catch {
      return null
    }
  }
  const m = /^([1-3]?[a-z]{2,3})\s+(\d+)(?::(intro|\d+)(?:-(\d+)(?::(\d+))?)?)?$/.exec(t)
  if (!m || m[1] === 'obs' || !VERSES[m[1]!]) return null
  const [, b, c, v1, x, y] = m
  try {
    if (!v1 || v1 === 'intro') return [verseId(b!, +c!, 0), verseId(b!, +c!, 999)]
    if (y) return [verseId(b!, +c!, +v1), verseId(b!, +x!, +y)]
    return [verseId(b!, +c!, +v1), verseId(b!, +c!, x ? +x : +v1)]
  } catch {
    return null
  }
}
/** A story's range text ("gen 6:1-8:22", "deu 18:15") as verse ids. */
export function rangeOfStoryRef(r: string): [number, number] | null {
  const m = /^([1-3]?[a-z]{2,3})\s+(.+)$/.exec(r.trim())
  if (!m) return null
  try {
    return v3Ref(m[1]!, m[2]!) ?? null
  } catch {
    return null
  }
}
/** How many verses a range holds (by the versification), for where a verse sits in a story. */
export function versesIn(from: number, to: number): number {
  const book = BOOKS[Math.floor(from / 1_000_000) - 1]
  const ch = (id: number) => Math.floor(id / 1000) % 1000
  const v = (id: number) => id % 1000
  const counts = book ? VERSES[book] : undefined
  if (!counts) return Math.max(1, to - from + 1)
  let n = 0
  for (let c = ch(from); c <= ch(to); c++) {
    const last = counts[c - 1] ?? 0
    const a = c === ch(from) ? Math.max(1, v(from)) : 1
    const z = c === ch(to) ? Math.min(last, v(to)) : last
    if (z >= a) n += z - a + 1
  }
  return Math.max(1, n)
}

// ------------------------------------------------------------------------------------------------------------------- packs

const read = async (l: string): Promise<PackReader | null> => {
  try {
    return await openLang(l)
  } catch {
    return null
  }
}
/** The packs to look in, in order: the question's, English, the others on the phone. */
async function order(lang: string): Promise<string[]> {
  const have = await installedLangs().catch(() => [] as string[])
  return [...new Set([lang, 'en', ...have])].filter((l) => have.includes(l))
}
/** The first pack with the obs unit installed, the question's first. */
export async function obsPack(lang: string): Promise<{ lang: string; r: PackReader } | null> {
  for (const l of await order(lang)) {
    const r = await read(l)
    if (r?.installed('obs')) return { lang: l, r }
  }
  return null
}
/** A pack that lists the obs unit and does not have it: its size, and whether this phone can add it (a pack it downloaded). */
export type ObsMissing = { lang: string; bytes: number; canAdd: boolean }
/**
 * Asking the packs server whether it has Open Bible Stories for a language: main.ts allows it where the person allows the
 * internet (online AI or usage counts) and there is a connection; tests replace `size` and `origin`.
 */
export const obsServer = {
  allowed: (): boolean => false,
  size: (lang: string): Promise<number | null> => serverUnitSize(lang, 'obs'),
  origin: (lang: string): Promise<'added' | 'shipped' | null> => origin(lang),
}
/** What the server said per language this session: asked once, not under every answer (no answer is asked again later). */
const serverSaid = new Map<string, Promise<number | null>>()
/** `ask`: may ask the packs server (an answer about OBS itself; never the buttons under a passage, storyAt). */
export async function obsMissing(lang: string, ask = false): Promise<ObsMissing | null> {
  const langs = await order(lang)
  for (const l of langs) {
    const r = await read(l)
    if (r && r.listed('obs') && !r.installed('obs')) return { lang: l, bytes: r.size('obs'), canAdd: (await origin(l).catch(() => null)) === 'added' }
  }
  // no pack here lists them (installed before the server had them, a report of Nov 17: "OBS 1" said there were none and online
  // AI answered): the server may have them for the question's language or English, when this phone downloaded that language
  // (its unit can be added on a tap: addUnit)
  if (!ask || !obsServer.allowed()) return null
  for (const l of langs.filter((x) => x === lang || x === 'en')) {
    if ((await obsServer.origin(l).catch(() => null)) !== 'added') continue
    if (!serverSaid.has(l)) serverSaid.set(l, obsServer.size(l).catch(() => null))
    const bytes = await serverSaid.get(l)!
    if (bytes === null) serverSaid.delete(l)
    if (bytes) return { lang: l, bytes, canAdd: true }
  }
  return null
}
/** Whether any pack on the phone has Open Bible Stories (Browse offers them only then). */
export const hasObs = async (lang: string): Promise<boolean> => !!(await obsPack(lang))
export const sizeText = (bytes: number): string =>
  bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
const packName = (l: string): string => PACK_NAMES[l] ?? l

// ---------------------------------------------------------------------------------------------------------- the stories list

/** A story as Browse and the buttons name it: its title (without its number) and the Bible ranges it is told from. */
export type StoryEntry = { n: number; title: string; refs: string[] }
const lists = new WeakMap<PackReader, Promise<StoryEntry[]>>()
/**
 * The 50 stories of a pack in order. The titles come from the language's topics; a pack whose topics lack them takes them from
 * its obs unit (when installed), else none (the label says "OBS N" alone).
 */
export function storyList(r: PackReader): Promise<StoryEntry[]> {
  let p = lists.get(r)
  if (!p) {
    p = (async () => {
      const ans = await r.stories()
      const model = r.installed('obs') ? await r.obs().catch(() => undefined) : undefined
      const own = new Map((model?.stories ?? []).map((s) => [s.n, cleanTitle(s.title)]))
      return (ans.data?.stories ?? []).map((s) => {
        const t = /^Story \d+$/.test(s.title) ? '' : cleanTitle(s.title)
        return { n: s.n, title: t || own.get(s.n) || '', refs: s.refs }
      })
    })()
    lists.set(r, p)
    p.catch(() => { if (lists.get(r) === p) lists.delete(r) })
  }
  return p
}
/** A story's entry from the first pack that knows it (its obs pack first: the title in that language). */
async function entryOf(lang: string, n: number): Promise<StoryEntry | null> {
  const at = await obsPack(lang)
  for (const l of [...new Set([...(at ? [at.lang] : []), ...(await order(lang))])]) {
    const r = await read(l)
    const e = r ? (await storyList(r).catch(() => [])).find((x) => x.n === n) : undefined
    if (e) return e
  }
  return null
}
/** A story's title from a pack in the app's language (not `had`, the one already read), or '' (none on the phone, no title). */
async function uiTitle(n: number, ui: string, had: string): Promise<string> {
  for (const l of uiLangs(ui, await installedLangs().catch(() => [] as string[]))) {
    if (l === had) continue
    const r = await read(l)
    const e = r ? (await storyList(r).catch(() => [])).find((x) => x.n === n) : undefined
    if (e?.title) return e.title
  }
  return ''
}
/** "OBS 3: The Flood", "OBS 3" without a title. */
export const storyName = (e: { n: number; title: string }, f?: number | null): string => (e.title ? `${obsLabel(e.n, f)}: ${e.title}` : obsLabel(e.n, f))

// -------------------------------------------------------------------------------------------------- passages -> stories

/**
 * The story a passage is told in, with the frame nearest to it: of the stories whose ranges meet the passage, the one most
 * about it (the fewest verses over the fewest ranges: "The Flood" for Genesis 7, not "Jesus Is the Promised Messiah", which
 * runs over half the Old Testament). The frame: the frame whose words share the most rare words with the passage's text
 * (`text`, when the story is in that language); else where the passage sits in the story's ranges; else none (the story).
 */
export type Told = { n: number; f: number | null; title: string; lang: string; ref: string; also?: string[] }

/**
 * The frames that tell a passage, from the `obs-frames` table of the common topics (bible-story-builder's map of each frame to its
 * verses), most specific first: the fewest verses, then story order. Empty when no pack on the phone has the table (a common catalog
 * from before it) or no frame tells the passage. `r`: a reader of any pack (the common unit is the same for all).
 */
export async function framesTelling(r: PackReader, range: [number, number]): Promise<{ n: number; f: number; verses: number }[]> {
  if (typeof (r as Partial<PackReader>).framesAt !== 'function' || noTable.has(r)) return []
  const [a, z] = [Math.max(range[0], Math.floor(range[0] / 1000) * 1000 + 1), range[1]]
  if (Math.floor(a / 1_000_000) !== Math.floor(z / 1_000_000) || a > z) return []
  const ans = await r.framesAt(a, z).catch(() => null)
  // a pack whose common catalog has no table answers so once: not asked again (a new reader after an update asks again)
  if (ans && (ans.data === null || ans.coverage?.['bcv-commons/bible-story-builder'] === 'none')) noTable.add(r)
  return (ans?.data?.frames ?? []).map((x) => ({ n: x.story, f: x.frame, verses: x.verses }))
}
let noTable = new WeakSet<PackReader>()
/** Forgets which packs had no frame map (the tests change a reader's maps in place). */
export const forgetFrameTables = (): void => { noTable = new WeakSet() }
/** The verse ids of a passage of one book, by the versification ("gen 6:1-8:22" every verse of the three chapters). */
function idsOf(from: number, to: number): number[] {
  const book = BOOKS[Math.floor(from / 1_000_000) - 1]
  const counts = book ? VERSES[book] : undefined
  const out: number[] = []
  const ch = (id: number) => Math.floor(id / 1000) % 1000
  for (let c = ch(from); c <= ch(to) && counts; c++) {
    const last = counts[c - 1] ?? 0
    const a = c === ch(from) ? Math.max(1, from % 1000) : 1
    const z = c === ch(to) ? Math.min(last, to % 1000) : last
    for (let v = a; v <= z; v++) out.push(Math.floor(from / 1_000_000) * 1_000_000 + c * 1000 + v)
  }
  return out
}
/**
 * The frames that tell a passage exactly, from the map, most specific first: for one verse, every frame that tells it; for a passage of
 * several verses, the frames whose verses cover all of it (a frame that only touches one end does not tell it). Empty for a chapter or
 * an introduction (a range from verse 0: the stories' own ranges decide, as before), with no table, or when no frame covers the passage.
 */
async function exactFrames(r: PackReader, range: [number, number]): Promise<{ n: number; f: number }[]> {
  if (range[0] % 1000 === 0) return []
  const found = (await framesTelling(r, range)).map(({ n, f, verses }) => ({ n, f, verses }))
  if (range[0] === range[1] || !found.length) return found.map(({ n, f }) => ({ n, f }))
  const want = idsOf(range[0], range[1])
  const out: { n: number; f: number }[] = []
  // only a frame with at least as many verses as the passage can cover it (the others are skipped without a lookup)
  for (const x of found.filter((y) => y.verses >= want.length)) {
    const have = new Set<number>()
    for (const ref of await frameRefsOf(r, x.n, x.f)) {
      const rr = rangeOfRef(ref)
      if (rr) for (let v = rr[0]; v <= rr[1]; v++) have.add(v)
    }
    if (want.length && want.every((v) => have.has(v))) out.push({ n: x.n, f: x.f })
  }
  return out
}
/** The Bible passages a frame tells ("gen 1:6-8"), from `obs-frames`; [] when the pack has no table or the frame tells none. */
export async function frameRefsOf(r: PackReader, n: number, f: number): Promise<string[]> {
  if (typeof (r as Partial<PackReader>).frameVerses !== 'function') return []
  const ans = await r.frameVerses(n, f).catch(() => null)
  return (ans?.data?.ranges ?? []).map((x) => `${x.book} ${x.ref}`)
}
/**
 * The frame whose picture shows a single verse (`ref` "gen 1:7"): the most specific frame of Open Bible Stories that tells it, or
 * null (a passage of more than one verse, a chapter, no table, no frame).
 */
export async function pictureFrame(ref: string, lang: string): Promise<{ n: number; f: number } | null> {
  const range = rangeOfRef(ref)
  if (!range || range[0] !== range[1]) return null
  for (const l of await order(lang)) {
    const r = await read(l)
    if (!r) continue
    const found = await framesTelling(r, range)
    if (found.length) return { n: found[0]!.n, f: found[0]!.f }
  }
  return null
}
export async function storyAt(ref: string, lang: string, text = ''): Promise<Told | null> {
  const range = rangeOfRef(ref)
  if (!range) return null
  const at = await obsPack(lang)
  // a phone without the unit: only when it can add it here (the button then offers to); a shipped pack gets it with the app
  const miss = at ? null : await obsMissing(lang)
  const where = at?.lang ?? (miss?.canAdd ? miss.lang : undefined)
  if (!where) return null
  const r = await read(where)
  if (!r) return null
  const list = await storyList(r).catch(() => [] as StoryEntry[])
  // the map of each frame to its verses (obs-frames), when the common catalog has it: the frame that tells the passage, exactly
  const exact = await exactFrames(r, range)
  if (exact.length) {
    const { n, f } = exact[0]!
    const title = list.find((e) => e.n === n)?.title ?? ''
    const also = exact.slice(1, 3).map((x) => obsRef(x.n, x.f))
    return { n, f, title, lang: where, ref: obsRef(n, f), ...(also.length ? { also } : {}) }
  }
  const cands: { e: StoryEntry; ranges: [number, number][]; cost: number }[] = []
  for (const e of list) {
    const ranges = e.refs.map(rangeOfStoryRef).filter((x): x is [number, number] => !!x)
    if (!ranges.some(([a, z]) => a <= range[1] && z >= range[0])) continue
    cands.push({ e, ranges, cost: ranges.reduce((s, [a, z]) => s + versesIn(a, z), 0) * ranges.length })
  }
  if (!cands.length) return null
  cands.sort((x, y) => x.cost - y.cost)
  let best = cands[0]!
  const framesOf = async (n: number) => (at ? ((await at.r.story(n).catch(() => null))?.data?.frames ?? []).filter((x) => x.text.trim()) : [])
  // a near tie (Mark 1:21-28 is in "John Baptizes Jesus" and in "Jesus Starts His Ministry", alike in size): the story whose
  // frames share the most rare words with the passage, when the stories are in the passage's language
  const close = cands.filter((c) => c.cost <= best.cost * 1.5)
  if (at && at.lang === lang && text.trim() && close.length > 1) {
    const frames = await Promise.all(close.map((c) => framesOf(c.e.n)))
    const scores = wordScores(frames.flat(), text)
    let k = 0
    const top = close.map((_, i) => Math.max(0, ...scores.slice(k, (k += frames[i]!.length))))
    const i = top.indexOf(Math.max(...top))
    if (top[i]! >= MIN_WORDS && top.filter((x) => x === top[i]).length === 1) best = close[i]!
  }
  let f: number | null = null
  if (at) {
    const frames = await framesOf(best.e.n)
    if (frames.length) f = nearestFrame(frames, best.ranges, range, text, at.lang === lang)
  }
  const title = best.e.title
  return { n: best.e.n, f, title, lang: where, ref: obsRef(best.e.n, f) }
}
const GOSPELS = new Set(['mat', 'mrk', 'luk', 'jhn'].map((b) => bookNumber(b)))
/** A word score this high says the frame tells the passage (about two rare words in common). */
const MIN_WORDS = 1.5
/** The words of a text as the stories are matched: folded, split at what is no letter, mark or digit (Hindi vowel signs are marks). */
const wordsOf = (s: string): string[] => fold(s).split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean)
/** Each frame's score: the rare words it shares with `text` (a word in fewer frames counts more). */
function wordScores(frames: { text: string }[], text: string): number[] {
  const want = new Set(wordsOf(text).filter((w) => w.length >= 4))
  const sets = frames.map((fr) => new Set(wordsOf(fr.text).filter((w) => w.length >= 4)))
  const df = new Map<string, number>()
  for (const s of sets) for (const w of s) df.set(w, (df.get(w) ?? 0) + 1)
  return sets.map((s) => {
    let x = 0
    for (const w of s) if (want.has(w)) x += 1 / df.get(w)!
    return x
  })
}
/** See storyAt. */
function nearestFrame(frames: { ref: string; text: string }[], ranges: [number, number][], range: [number, number], text: string, sameLang: boolean): number {
  const num = (fr: { ref: string }) => +fr.ref.split(':')[1]!
  // 1. the words: rare words of the passage in a frame (the story in the passage's language)
  if (sameLang && text.trim()) {
    const scores = wordScores(frames, text)
    const top = scores.indexOf(Math.max(...scores))
    if (top >= 0 && scores[top]! >= MIN_WORDS) return num(frames[top]!)
  }
  // 2. where the passage sits: in its own range when the ranges are the same story told by several Gospels, else over the
  // ranges in order (Exodus 16, then Numbers 10–14, …)
  const i = ranges.findIndex(([a, z]) => a <= range[1] && z >= range[0])
  const parallel = new Set(ranges.map(([a]) => Math.floor(a / 1_000_000)).filter((b) => GOSPELS.has(b))).size > 1
  const used = parallel ? [ranges[i]!] : ranges
  const before = parallel ? 0 : ranges.slice(0, i).reduce((s, [a, z]) => s + versesIn(a, z), 0)
  const [a, z] = ranges[i]!
  const start = Math.max(a, range[0])
  const within = start > a ? versesIn(a, start) - 1 : 0
  const total = used.reduce((s, [x, y]) => s + versesIn(x, y), 0) || 1
  const k = Math.min(frames.length - 1, Math.max(0, Math.floor(((before + within) / total) * frames.length)))
  return num(frames[k]!)
}

// ------------------------------------------------------------------------------------------------------------------ answer

/** What an OBS answer found, for the buttons under it (pipeline.ts obsSteps). */
export type ObsFacts = {
  kind: 'obs'; n: number; f: number | null; title: string; refs: string[]
  /** a frame's own passages, from obs-frames ("gen 1:6-8"); [] for a story, or when the pack has no table */
  frameRefs: string[]
  state: 'ok' | 'missing' | 'none' | 'nostory' | 'noframe'
  /** the pack the story came from (ok, noframe), the pack that can add the unit (missing) */
  pack: string | null; frames: number; add?: { lang: string; bytes: number }; terms: string[]
}
/** "A Bible story from: Genesis 6-8" without what the packs sometimes put around it. */
const plainLine = (s: string) => s.replace(/^[_*\s]+|[_*\s]+$/g, '')
/** A note as plain text: no headings, no "(See: rc://…)" a reader cannot follow. */
const tidyNote = (s: unknown) => String(s ?? '').replace(/^#+\s*/gm, '').replace(/\((?:ver|see):\s*rc:\/\/[^)\s]+\)/gi, '').replace(/\s+/g, ' ').trim()

/**
 * The answer to "obs N" (a story) or "obs N:F" (a frame): the frames' text, the notes and questions asked for (the others one
 * tap away, folded), the frame's key terms as links, and where it comes from. `what` as a passage's ("text", "notes"…).
 */
export async function obsAnswer(s: { ref: string | null; what: string[]; lang: string }, ui: string): Promise<{ answer: string; cites: string[]; facts: ObsFacts }> {
  const w = OW(ui)
  const p = parseObsRef(s.ref)
  const facts: ObsFacts = { kind: 'obs', n: p?.n ?? 0, f: p?.f ?? null, title: '', refs: [], frameRefs: [], state: 'none', pack: null, frames: 0, terms: [] }
  const label = p ? obsLabel(p.n, p.f) : String(s.ref ?? 'OBS')
  if (!p || p.n < 1 || p.n > 50) {
    facts.state = 'nostory'
    return { answer: fill(w.noStory, { n: p?.n ?? '?' }), cites: [], facts }
  }
  const entry = await entryOf(s.lang, p.n)
  if (entry) Object.assign(facts, { title: entry.title, refs: entry.refs })
  const at = await obsPack(s.lang)
  if (!at) {
    const miss = await obsMissing(s.lang, true)
    const told = entry?.refs.length ? `\n\n${entry.title ? `**${storyName(entry)}** — ` : ''}${entry.refs.map((r) => bibleLabel(ui, r)).join('; ')}` : ''
    if (miss) {
      facts.state = 'missing'
      facts.pack = miss.lang
      if (miss.canAdd) facts.add = { lang: miss.lang, bytes: miss.bytes }
      return { answer: `${fill(w.missing, { pack: packName(miss.lang), size: sizeText(miss.bytes) })} ${miss.canAdd ? w.missingAdd : w.missingLater}${told}`, cites: [], facts }
    }
    return { answer: fill(w.none, { ref: label }) + told, cites: [], facts }
  }
  facts.pack = at.lang
  const ans = await at.r.story(p.n)
  const data = ans.data
  const frames = (data?.frames ?? []).filter((x) => x.text.trim())
  facts.frames = frames.length
  if (data) Object.assign(facts, { title: cleanTitle(data.title) || facts.title, refs: data.refs.length ? data.refs : facts.refs })
  if (!data || !frames.length) {
    facts.state = 'none'
    return { answer: fill(w.none, { ref: label }), cites: [], facts }
  }
  const frameN = (x: { ref: string }) => +x.ref.split(':')[1]!
  const shown = p.f ? frames.filter((x) => frameN(x) === p.f) : frames
  if (p.f && !shown.length) {
    facts.state = 'noframe'
    return { answer: fill(w.noFrame, { n: p.n, f: p.f, last: frameN(frames[frames.length - 1]!) }), cites: [], facts }
  }
  facts.state = 'ok'
  const cites: string[] = []
  const what = s.what.length ? s.what : ['text', 'notes', 'questions', 'terms']
  const all = !p.f // a whole story: its frames, the helps folded per frame
  const out: string[] = []
  const name = facts.title ? `${label} · ${facts.title}` : label
  out.push(`## ${name}`)
  // the story's own source line at the top ("A Bible story from: Genesis 6-8"); the resources and releases once, at the end
  if (data.reference) out[0] += `\n*${plainLine(data.reference)}*`
  const storyRes = ans.cites.find((c) => c.id === `obs:${p.n}`)
  if (storyRes) cites.push(`${storyRes.res} ${storyRes.release} (obs ${p.n}${p.f ? ':' + p.f : ''})`)
  for (const fr of shown) out.push(`**${p.n}:${frameN(fr)}** ${fr.text.replace(/\s+/g, ' ').trim()}`)
  // a frame: the verses it tells, exactly (obs-frames), under its text
  if (p.f) {
    facts.frameRefs = await frameRefsOf(at.r, p.n, p.f)
    if (facts.frameRefs.length) out.push(`*${facts.frameRefs.map((r) => bidiLabel(bibleLabel(ui, r), ui)).join('; ')}*`)
  }
  const noteLines = (fr: (typeof frames)[number]) => fr.notes.filter((x) => tidyNote(x.cols.note)).map((x, i) => {
    const c = ans.cites.find((y) => y.id === x.id)
    if (c) cites.push(`${c.res} ${c.release} (obs ${x.ref}, note ${x.id})`)
    const q = String(x.cols.quote ?? '').trim()
    return `${i + 1}. ${q ? `**«${q}»**: ` : ''}${tidyNote(x.cols.note)}`
  })
  const qLines = (fr: (typeof frames)[number]) => fr.questions.map((x) => {
    const c = ans.cites.find((y) => y.id === x.id)
    if (c) cites.push(`${c.res} ${c.release} (obs ${x.ref}, question ${x.id})`)
    return `- **${String(x.cols.question ?? '').trim()}** ${String(x.cols.response ?? '').trim()}`
  })
  const wantNotes = what.includes('notes'), wantQs = what.includes('questions'), wantTerms = what.includes('terms') || what.length > 1
  if (!all) {
    const fr = shown[0]!
    const lab = obsLabel(p.n, p.f)
    const notes = noteLines(fr)
    const qs = qLines(fr)
    // the key terms of the frame, each a link to its article (the panel opens it)
    const terms = [...new Map(fr.links.filter((x) => x.concept).map((x) => [x.concept!, String(x.cols.origWords ?? '').trim() || x.concept!.split('/').pop()!])).entries()]
    facts.terms = terms.map(([id]) => id)
    for (const [id] of terms) cites.push(`id:${id}`)
    const links = terms.map(([id, t]) => `[${t}](${id})`).join(' · ')
    // each help behind its own button with its count, as under a passage (Abel, Nov 17: open, a frame's helps took the whole
    // screen); only the one help a question asks for alone stays open ("the notes of story 3, frame 4"). "There are none" only
    // for that one (it is the answer then; otherwise only the helps there are show, Abel, Nov 17), said first: after a fold it
    // would be inside it.
    const asked = (['notes', 'questions', 'terms'] as const).filter((x) => what.includes(x))
    const only = asked.length === 1 ? asked[0] : null
    const said: string[] = [], open: string[] = [], folds: string[] = []
    if (notes.length) {
      if (only === 'notes') open.push(`### ${fill(w.notes, { ref: lab })}`, notes.join('\n'))
      else folds.push(FOLD + fill(w.notesFold, { ref: lab, n: notes.length }), notes.join('\n'))
    } else if (only === 'notes') said.push(fill(w.noNotes, { ref: lab }))
    if (qs.length) {
      if (only === 'questions') open.push(`### ${fill(w.questions, { ref: lab })}`, ...qs)
      else folds.push(FOLD + fill(w.questionsFold, { n: qs.length }), ...qs)
    } else if (only === 'questions') said.push(fill(w.noQuestions, { ref: lab }))
    if (terms.length && wantTerms) {
      if (only === 'terms') open.push(`*${w.terms}:* ${links}`)
      else folds.push(`${FOLD}${w.terms} (${terms.length})`, links)
    }
    out.push(...said, ...open, ...folds)
  } else {
    // a whole story: the notes of each frame behind its own button, then the questions
    if (wantNotes || what.includes('text'))
      for (const fr of shown) {
        const notes = noteLines(fr)
        if (notes.length) out.push(FOLD + fill(w.notesFold, { ref: obsLabel(p.n, frameN(fr)), n: notes.length }), notes.join('\n'))
      }
    const qs = shown.flatMap((fr) => qLines(fr).map((l) => l.replace(/^- /, `- ${p.n}:${frameN(fr)} `)))
    if (qs.length) out.push(FOLD + fill(w.questionsFold, { n: qs.length }), ...qs)
  }
  return { answer: out.join('\n\n'), cites, facts }
}

/**
 * What one frame's helps are, for the 5M session's step (obs5m.ts `ObsFrameHelps`): the facts of its OBS answer (`terms`: the
 * tW ids of its word links), the Translation Academy articles its notes cite (each note's link, else an rc://…/ta/man/… in its
 * text, which the answer leaves out), its word links with their words, and how many notes and questions it has. Null when the
 * story or the frame is not on the phone (the obs unit missing, no such frame). Reads; changes nothing of `obsAnswer`.
 */
export type ObsFrameData = {
  facts: ObsFacts; academy: string[]; twl: { id: string; words: string }[]; notes: number; questions: number
  /** its comprehension questions (OBS tQ) with their answers: the 5M checking card shows them, each answer behind [Show answer] */
  tq: { id: string; q: string; a: string | null }[]
}
export async function frameHelps(ref: string, lang: string, ui: string): Promise<ObsFrameData | null> {
  const p = parseObsRef(ref)
  if (!p?.f) return null
  const { facts } = await obsAnswer({ ref, what: ['terms'], lang }, ui)
  if (facts.state !== 'ok' || !facts.pack) return null
  const r = await read(facts.pack)
  const fr = r ? (await r.story(p.n)).data?.frames?.find((x) => +x.ref.split(':')[1]! === p.f) : undefined
  if (!fr) return null
  const academy: string[] = []
  for (const x of fr.notes) {
    const ids = x.concept?.startsWith('ta:') ? [x.concept] : [...String(x.cols.note ?? '').matchAll(/rc:\/\/[^/\s]+\/ta\/man\/([\w-]+)\/([\w-]+)/g)].map((m) => `ta:${m[1]}/${m[2]}`)
    for (const id of ids) if (!academy.includes(id)) academy.push(id)
  }
  const twl = [...new Map(fr.links.filter((x) => x.concept).map((x) => [x.concept!, String(x.cols.origWords ?? '').trim()])).entries()].map(([id, words]) => ({ id, words }))
  const tq = fr.questions.map((x) => ({ id: x.id, q: String(x.cols.question ?? '').trim(), a: String(x.cols.response ?? '').trim() || null })).filter((x) => x.q)
  return { facts, academy, twl, notes: fr.notes.filter((x) => tidyNote(x.cols.note)).length, questions: fr.questions.length, tq }
}

/**
 * The first frame, counting from OBS 1:1, that has notes in the phone's Open Bible Stories: the welcome's example (firstuse.ts). Reads
 * the first few stories only (a pack with notes for just some of them, like the Hindi one, is still found), never all fifty.
 */
export async function firstNotedFrame(lang: string, stories = 6): Promise<{ n: number; f: number; lang: string } | null> {
  const at = await obsPack(lang)
  if (!at) return null
  for (let n = 1; n <= stories; n++) {
    const frames = (await at.r.story(n).catch(() => null))?.data?.frames ?? []
    const f = frames.filter((x) => x.notes.some((y) => tidyNote(y.cols.note))).map((x) => +x.ref.split(':')[1]!).filter((x) => x > 0).sort((a, b) => a - b)[0]
    if (f) return { n, f, lang: at.lang }
  }
  return null
}

/** The sentence before an answer: "Here is OBS 3:5 of Open Bible Stories (The Flood)." (runs of the other direction isolated). */
export const introLine = (f: ObsFacts, ui: string): string | null =>
  f.state !== 'ok' ? null : bidiLabel(f.f ? fill(OW(ui).found, { ref: obsLabel(f.n, f.f), title: f.title || obsLabel(f.n) }) : fill(OW(ui).foundStory, { ref: obsLabel(f.n), title: f.title || obsLabel(f.n) }), ui)
/** Said when the story came from another pack than the question's. */
export const fromOtherLine = (f: ObsFacts, lang: string, ui: string): string | null =>
  f.pack && f.pack !== lang && (f.state === 'ok' || f.state === 'noframe') ? bidiLabel(fill(OW(ui).fromOther, { lang: packName(f.pack), mine: packName(lang) }), ui) : null

// ------------------------------------------------------------------------------------------------------------------ buttons

/** A next step of an OBS answer, as data (pipeline.ts makes the buttons' sheets). */
export type ObsStep =
  | { k: 'obs'; label: string; ref: string; what: string[] }
  | { k: 'bible'; label: string; ref: string }
  | { k: 'add'; label: string; lang: string }
  | { k: 'browse'; label: string }
/**
 * The buttons under an OBS answer: the next frame (or the next story at the last frame), the whole story (under a frame) or
 * its first frame (under the story), its Bible passages (up to 3), the way to add the unit when it is missing, the list of
 * stories. The key terms are added by pipeline.ts (twStep), from `facts.terms`.
 */
export async function obsSteps(f: ObsFacts, lang: string, ui: string): Promise<ObsStep[]> {
  const w = OW(ui)
  const out: ObsStep[] = []
  if (f.state === 'missing' && f.add) out.push({ k: 'add', label: fill(w.add, { size: sizeText(f.add.bytes) }), lang: f.add.lang })
  if (f.state === 'ok' || f.state === 'noframe') {
    const nextName = async (n: number) => storyName({ n, title: (await entryOf(f.pack ?? lang, n))?.title ?? '' })
    if (f.f && f.state === 'ok') {
      if (f.f < f.frames) out.push({ k: 'obs', label: fill(w.next, { ref: obsLabel(f.n, f.f + 1) }), ref: obsRef(f.n, f.f + 1), what: ['text', 'notes', 'questions', 'terms'] })
      else if (f.n < 50) out.push({ k: 'obs', label: fill(w.nextStory, { name: await nextName(f.n + 1) }), ref: obsRef(f.n + 1), what: ['text', 'notes'] })
    }
    if (f.f) out.push({ k: 'obs', label: fill(w.whole, { ref: obsLabel(f.n) }), ref: obsRef(f.n), what: ['text', 'notes'] })
    else if (f.state === 'ok') out.push({ k: 'obs', label: fill(w.first, { ref: obsLabel(f.n, 1) }), ref: obsRef(f.n, 1), what: ['text', 'notes', 'questions', 'terms'] })
  }
  // a frame's own passages when the pack has them (obs-frames), else the story's
  const refs = f.f && f.frameRefs?.length ? f.frameRefs : f.refs
  for (const r of refs.slice(0, 3)) out.push({ k: 'bible', label: fill(w.bible, { ref: bibleLabel(ui, r) }), ref: r })
  if (f.state === 'ok' && !f.f && f.n < 50) {
    const t = (await entryOf(f.pack ?? lang, f.n + 1))?.title ?? ''
    out.push({ k: 'obs', label: fill(w.nextStory, { name: storyName({ n: f.n + 1, title: t }) }), ref: obsRef(f.n + 1), what: ['text', 'notes'] })
  }
  if (f.state !== 'missing' && (await obsPack(lang))) out.push({ k: 'browse', label: w.browse })
  return out
}
/** The button under a passage: "This part is told in OBS 3: The Flood" (to the nearest frame when there is one). */
export async function storyStep(ref: string, lang: string, ui: string, text = ''): Promise<{ label: string; ref: string; lang: string } | null> {
  const t = await storyAt(ref, lang, text).catch(() => null)
  if (!t) return null
  // the story's title in the app's language when a pack on the phone has it (Abel, Nov 17: "Sin Enters the World" in a Spanish
  // app, the passage's pack being English), else the story pack's
  const title = (await uiTitle(t.n, ui, t.lang)) || t.title
  const label = fill(OW(ui).toldIn, { ref: obsLabel(t.n, t.f), title: title || obsLabel(t.n) }).replace(/: OBS \d+$/, '')
  const also = (t.also ?? []).map((x) => { const p = parseObsRef(x); return p ? obsLabel(p.n, p.f) : x })
  return { label: also.length ? `${label} ${fill(OW(ui).also, { refs: also.join(', ') })}` : label, ref: t.ref, lang: t.lang }
}

// ---------------------------------------------------------------------------------------------------------------- questions

const DIGITS = (q: string) => q.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
/** The names of OBS, in the six languages: then a number is a story ("OBS 34", "Historias de la Biblia 3:5"). */
const NAME = String.raw`(?:obs|open\s+bible\s+stor(?:y|ies)|historias?\s+(?:de\s+la\s+)?biblia|histoires?\s+bibliques?|cerita(?:-cerita)?\s+alkitab|बाइबल\s+(?:की\s+)?कहानि(?:याँ|यां|यों)|قصص\s+الكتاب\s+المقدس)`
/** The word "story" (then a number is a story: "story 34", "historia 34", "कहानी 34", "القصة 34"). */
/** The Arabic letters that join the word after them: "و" and, "ف" so, "ب" in, "ك" as, "ل" for ("للقصة 1", "والإطار"). */
const AR_PRE = String.raw`(?:[وفبكل]?ال|[وف]?لل|[وفبكل])?`
const STORY = String.raw`(?:story|historia|histoire|cerita|कहानी|${AR_PRE}قصة)`
const FRAME = String.raw`(?:frame|marco|cuadro|image|cadre|bingkai|गद्यांश|फ़्रेम|फ्रेम|${AR_PRE}إطار|${AR_PRE}مشهد)`
/** A frame word anywhere ("next frame", "l'image suivante", "والإطار التالي", "अगला फ़्रेम"): pipeline.ts reads it as a verse of OBS. */
export const FRAME_ANY = new RegExp(String.raw`(?<![\p{L}\p{M}])${FRAME}(?![\p{L}\p{M}])`, 'giu')
const NUM = String.raw`(?:no\.?\s*|n[º°o]\.?\s*|#\s*|nomor\s+|संख्या\s+|رقم\s+)?(\d{1,3})(?!\d)`
const BY_NAME = new RegExp(String.raw`(?<![\p{L}\p{M}])${NAME}\s*${NUM}(?:\s*[:.,]\s*(\d{1,3})(?!\d))?`, 'iu')
const BY_STORY = new RegExp(String.raw`(?<![\p{L}\p{M}])${STORY}\s*${NUM}(?:\s*[:.]\s*(\d{1,3})(?!\d))?`, 'iu')
/** A frame word alone ("frame", "cuadro", "إطار"…): "story 2 frame 3" is a story. */
const FRAME_WORD = new RegExp(String.raw`^${FRAME}$`, 'iu')
const FRAME_N = new RegExp(String.raw`(?<![\p{L}\p{M}])${FRAME}\s*${NUM}`, 'iu')
const NOTES = /(?<![\p{L}])(?:notes?|notas?|catatan|टिप्पणि|ملاحظ)/iu
const QUESTIONS = /(?<![\p{L}])(?:questions?|preguntas?|pertanyaan|प्रश्न|سؤال|أسئلة|الأسئلة)/iu
/**
 * A question that names a story by its number: "¿qué dice OBS 3:5?", "historia 34", "Open Bible Stories 3", "story 3, frame 4",
 * "القصة 34". Its ref ("obs 3:5") and what to show (the notes when it asks for notes, …), or null.
 */
export function obsAsked(q0: string): { ref: string; what: string[] } | null {
  const q = DIGITS(q0)
  const m = BY_NAME.exec(q) ?? BY_STORY.exec(q)
  if (!m) return null
  const n = +m[1]!
  // a numbered book is no story: "cerita Alkitab 1 Samuel 17", "histoire biblique 2 Rois 5", "story 2 Kings 5", and its
  // abbreviations ("story 1 Cor 13", "story 1Jn 3", "story 1 Thess 4"): a book's name or code as the passage reader knows
  // it, or any word but a frame's followed by a chapter number
  if (n >= 1 && n <= 3) {
    const end = m.index + (m[0].match(new RegExp(String.raw`^[\s\S]*?(?<!\d)${m[1]}(?!\d)`))?.[0].length ?? m[0].length)
    const next = q.slice(end).trim().split(/[\s.,;:!?¿¡؟()]+/).filter(Boolean)
    const w = next[0]
    if (w && /^\p{L}/u.test(w)) {
      const exact = (name: string) => !!bookExact(name) || bookCandidates('en', name).some((c) => c.how === 'exact')
      if (exact(`${n} ${w}`) || (next[1] && exact(`${n} ${w} ${next[1]}`))) return null
      if (next[1] && /^\d+$/.test(next[1]) && !FRAME_WORD.test(w)) return null
    }
  }
  const f = m[2] ? +m[2] : FRAME_N.exec(q) ? +FRAME_N.exec(q)![1]! : null
  // (a year, a page: no story is 0 or above 50; "OBS 0" is said to have no story, as a number of OBS)
  if (!m[0].match(new RegExp(NAME, 'iu')) && (n < 1 || n > 50)) return null
  const asks = [NOTES.test(q) ? 'notes' : '', QUESTIONS.test(q) ? 'questions' : ''].filter(Boolean)
  return { ref: obsRef(n, f), what: asks.length ? asks : f ? ['text', 'notes', 'questions', 'terms'] : ['text', 'notes'] }
}
/** "the story of Noah", "la historia de José", "l'histoire de …", "cerita tentang …", "… की कहानी", "قصة …": what it names. */
const NAMED = [
  /(?:^|\s)(?:the\s+)?story\s+(?:of|about)\s+(.+)$/i,
  /(?:^|\s)(?:la\s+)?historia\s+(?:de|del|sobre)\s+(.+)$/i,
  /(?:^|\s)(?:l['’]\s*)?histoire\s+(?:de|du|d['’]|sur)\s*(.+)$/i,
  /(?:^|\s)cerita\s+(?:tentang\s+)?(.+)$/i,
  /^(.+?)\s+की\s+कहानी/,
  /(?:^|\s)(?:[وفبكل]?ال|[وف]?لل|[وفبكل])?قصة\s+(.+)$/,
]
/**
 * Stories by the common names of what they tell, in the six languages: a name read the same whatever OBS pack is on the phone
 * (an English pack's titles have no "Noé", "نوح" or "नूह"). A name in several stories is in each (Isaac: 5 and 6), so it alone
 * names none; Abraham is in stories 4 to 6 and goes to the first, which tells his call; Paul (46, 47) and Saul (King Saul in
 * 17) are left out; Jonah is in no story. Each entry is a name of one or more words, folded as `fold` folds them.
 */
const STORY_NAMES: Record<number, string[]> = {
  1: ['creation', 'creacion', 'la creacion', 'penciptaan', 'सृष्टि', 'الخلق', 'الخليقة'],
  2: ['adam', 'eve', 'adan', 'eva', 'ève', 'hawa', 'आदम', 'हव्वा', 'آدم', 'حواء'],
  3: ['noah', 'noe', 'nuh', 'नूह', 'نوح', 'flood', 'diluvio', 'deluge', 'air bah', 'जलप्रलय', 'الطوفان'],
  4: ['abraham', 'abram', 'अब्राहम', 'इब्राहीम', 'ابراهيم', 'ابرام'],
  5: ['isaac', 'ishak', 'इसहाक', 'اسحق', 'اسحاق'],
  6: ['isaac', 'ishak', 'इसहाक', 'اسحق', 'اسحاق', 'rebekah', 'rebeca', 'rebecca', 'ribka', 'रिबका', 'رفقة'],
  7: ['jacob', 'esau', 'yakub', 'याकूब', 'एसाव', 'يعقوب', 'عيسو'],
  8: ['joseph', 'jose', 'yusuf', 'यूसुफ', 'يوسف'],
  9: ['moses', 'moises', 'moise', 'musa', 'मूसा', 'موسى', 'burning bush', 'zarza'],
  10: ['plagues', 'plagas', 'plaies', 'tulah', 'विपत्तियाँ', 'الضربات'],
  11: ['passover', 'pascua', 'paque', 'paskah', 'फसह', 'الفصح'],
  12: ['exodus', 'exodo', 'exode', 'red sea', 'mar rojo', 'mer rouge', 'laut merah', 'लाल समुद्र', 'البحر الاحمر'],
  13: ['ten commandments', 'diez mandamientos', 'dix commandements', 'sepuluh perintah', 'दस आज्ञाएँ', 'الوصايا العشر'],
  15: ['joshua', 'josue', 'yosua', 'यहोशू', 'يشوع', 'jericho', 'jerico', 'yerikho', 'यरीहो', 'اريحا'],
  16: ['gideon', 'gedeon', 'गिदोन', 'جدعون'],
  17: ['david', 'daud', 'दाऊद', 'داود', 'goliath', 'goliat', 'गोलियत', 'جليات'],
  18: ['solomon', 'salomon', 'salomo', 'सुलैमान', 'سليمان'],
  19: ['elijah', 'elias', 'elie', 'elia', 'एलिय्याह', 'ايليا', 'elisha', 'eliseo', 'elisee', 'elisa', 'एलीशा', 'اليشع'],
  23: ['christmas', 'navidad', 'noel', 'natal', 'क्रिसमस', 'الميلاد'],
  24: ['baptism', 'bautismo', 'bapteme', 'baptisan', 'बपतिस्मा', 'المعمودية', 'معمودية'],
  25: ['temptation', 'tentacion', 'tentation', 'pencobaan', 'परीक्षा', 'التجربة'],
  27: ['good samaritan', 'samaritan', 'samaritano', 'samaritain', 'samaria yang baik', 'सामरी', 'السامري'],
  33: ['sower', 'sembrador', 'semeur', 'penabur', 'बोने वाले', 'الزارع'],
  35: ['prodigal', 'prodigal son', 'prodigo', 'hijo prodigo', 'prodigue', 'fils prodigue', 'anak yang hilang', 'उड़ाऊ', 'उड़ाऊ पुत्र', 'الضال', 'الابن الضال'],
  36: ['transfiguration', 'transfiguracion', 'transfigurasi', 'रूपान्तरण', 'التجلي'],
  37: ['lazarus', 'lazaro', 'lazare', 'लाज़र', 'लाजर', 'لعازر'],
  40: ['crucifixion', 'penyaliban', 'क्रूस पर चढ़ाया', 'الصلب'],
  41: ['resurrection', 'resurreccion', 'kebangkitan', 'पुनरुत्थान', 'القيامة'],
  43: ['pentecost', 'pentecostes', 'pentecote', 'pentakosta', 'पिन्तेकुस्त', 'الخمسين'],
  45: ['stephen', 'esteban', 'etienne', 'stefanus', 'स्तिफनुस', 'استفانوس', 'ethiopian', 'etiope', 'ethiopien', 'الحبشي'],
  47: ['philippi', 'filipos', 'philippes', 'filipi', 'फिलिप्पी', 'فيلبي'],
}
const NAME_INDEX: [number, string[]][] = Object.entries(STORY_NAMES).flatMap(([n, names]) => names.map((s) => [+n, s.split(' ').map(fold)] as [number, string[]]))
/** An Arabic word as written and without a joined letter or article before it ("ونوح", "لنوح", "والطوفان"). */
const arForms = (x: string): string[] => /^[ء-ي]/.test(x) ? [x, x.replace(/^(?:[وفبكل]?ال|[وف]?لل)(?=\S{3})/, ''), x.replace(/^[وفبكل](?=\S{3})/, '')] : [x]
/**
 * The one story the content words of a question name by STORY_NAMES, when names of that story are all its words ("Noé",
 * "Noah and the flood"), or null: no name, names of two stories, or another word too ("Paul shipwreck", "Lázaro y el rico",
 * "José et Marie" are not the story, but verses or another story: the search goes on as before).
 */
export function storyByName(words: string[]): number | null {
  const toks = words.map(fold).filter(Boolean)
  if (!toks.length) return null
  const is = (x: string, w: string) => arForms(x).some((f) => f === w || f === w.replace(/^ال/, '') || (w.length >= 4 && f.startsWith(w) && f.length <= w.length + 2))
  const named = NAME_INDEX.filter(([, ws]) => ws.every((w) => toks.some((x) => is(x, w))))
  const stories = new Set(named.map(([n]) => n))
  if (stories.size !== 1) return null
  const covered = (x: string) => named.some(([, ws]) => ws.some((w) => is(x, w)))
  return toks.every(covered) ? [...stories][0]! : null
}
/**
 * Every story that names (STORY_NAMES) all the words given, a name in several stories giving each ("Isaac": 5 and 6), for the
 * typing suggestions (obsindex.ts): unlike storyByName it does not need one story. `partial`: the last word may be the start of
 * a name ("noe" for Noé being typed).
 */
export function storiesNamed(words: string[], partial = false): number[] {
  const toks = words.map(fold).filter(Boolean)
  if (!toks.length) return []
  const last = toks.length - 1
  const is = (x: string, w: string, i: number) => arForms(x).some((f) => f === w || f === w.replace(/^ال/, '') || (w.length >= 4 && f.startsWith(w) && f.length <= w.length + 2) || (partial && i === last && f.length >= 3 && w.startsWith(f)))
  const named = NAME_INDEX.filter(([, ws]) => ws.every((w) => toks.some((x, i) => is(x, w, i))))
  const covered = (x: string, i: number) => named.some(([, ws]) => ws.some((w) => is(x, w, i)))
  return toks.every(covered) ? [...new Set(named.map(([n]) => n))].sort((a, b) => a - b) : []
}
/**
 * A story named by what it is about ("the story of Noah", "la historia de José"), when Open Bible Stories are on the phone and
 * one story clearly is it: its title has every word, or its frames name them far more than any other story's. Null otherwise
 * (then the question goes on as before: "la historia de Jonás" finds Jonah's verses, OBS has no story of Jonah). When the
 * pack's titles and frames do not say, a common name in STORY_NAMES does ("la historia de Noé" with an English pack).
 */
export async function namedStory(q: string, lang: string): Promise<{ ref: string; what: string[] } | null> {
  const t = q.replace(/[¿?!¡.,;:«»"“”؟،()]/g, ' ').replace(/\s+/g, ' ').trim()
  const hit = NAMED.map((re) => re.exec(t)).find((m) => m?.[1])
  if (!hit) return null
  const at = await obsPack(lang)
  if (!at) return null
  // else a common name ("Noé", "نوح", "नूह"): the story it names, whatever the pack's language
  const byName = (): { ref: string; what: string[] } | null => { const n = storyByName(keywords(hit[1]!)); return n ? { ref: obsRef(n), what: ['text', 'notes'] } : null }
  const want = keywords(hit[1]!).map((x) => fold(x)).filter((x) => x.length >= 3)
  if (!want.length) return byName()
  const has = (s: string) => { const toks = wordsOf(s); return want.filter((w) => toks.some((x) => x === w || (w.length >= 5 && x.startsWith(w.slice(0, w.length - 1))))).length }
  const list = await storyList(at.r).catch(() => [] as StoryEntry[])
  const byTitle = list.filter((e) => e.title && has(e.title) === want.length)
  if (byTitle.length === 1) return { ref: obsRef(byTitle[0]!.n), what: ['text', 'notes'] }
  const model = await at.r.obs().catch(() => undefined)
  const counts = (model?.stories ?? []).map((s) => ({ n: s.n, c: s.frames.filter((fr) => has(fr.text) === want.length).length })).sort((a, b) => b.c - a.c)
  const [a, b] = counts
  if (a && a.c >= 3 && a.c >= 2 * (b?.c ?? 0)) return { ref: obsRef(a.n), what: ['text', 'notes'] }
  return byName()
}

// ------------------------------------------------------------------------------------------------------------------- search

export type ObsHit = { ref: string; label: string; snippet: string; lang: string }
/** Each frame's words, read once per unit (a whole unit is about 600 frames). */
const FRAME_WORDS = new WeakMap<ObsModel, Map<object, string[]>>()
function frameWords(model: ObsModel): Map<object, string[]> {
  let m = FRAME_WORDS.get(model)
  if (!m) {
    m = new Map()
    for (const st of model.stories) for (const fr of st.frames) m.set(fr, wordsOf(fr.text))
    FRAME_WORDS.set(model, m)
  }
  return m
}
/**
 * The frames and titles of Open Bible Stories that hold every content word of a question (the question's pack, else the
 * first one with the unit): titles first, then frames, at most `limit`. Nothing when no pack has the unit.
 */
export async function searchObs(q: string, lang: string, limit = 3): Promise<ObsHit[]> {
  const at = await obsPack(lang)
  if (!at) return []
  const want = keywords(q).map((w) => fold(w)).filter((w) => w.length >= 3)
  if (!want.length) return []
  const model = await at.r.obs().catch(() => undefined)
  if (!model) return []
  const list = await storyList(at.r).catch(() => [] as StoryEntry[])
  const holds = (toks: string[]) => want.every((w) => toks.some((x) => x === w || (w.length >= 4 && x.startsWith(w))))
  const out: ObsHit[] = []
  for (const e of list) if (e.title && holds(wordsOf(e.title))) out.push({ ref: obsRef(e.n), label: storyName(e), snippet: e.title, lang: at.lang })
  const toks = frameWords(model)
  for (const s of model.stories) {
    for (const fr of s.frames) {
      if (out.length >= limit * 3) break
      if (!holds(toks.get(fr) ?? [])) continue
      const title = list.find((e) => e.n === s.n)?.title ?? cleanTitle(s.title)
      out.push({ ref: obsRef(s.n, fr.n), label: storyName({ n: s.n, title }, fr.n), snippet: fr.text.replace(/\s+/g, ' ').trim(), lang: at.lang })
    }
  }
  return out.slice(0, limit)
}

// ------------------------------------------------------------------------------------------------------------- online AI

/** The plain text of a story (its title, source line and frames), for online AI as the context of a branch on a story. */
export async function storyText(ref: string, lang: string, max = 4000): Promise<string> {
  const p = parseObsRef(ref)
  const at = p ? await obsPack(lang) : null
  if (!p || !at) return ''
  const data = (await at.r.story(p.n).catch(() => null))?.data
  const frames = (data?.frames ?? []).filter((x) => x.text.trim())
  if (!data || !frames.length) return ''
  const head = `## Open Bible Stories ${p.n}: ${cleanTitle(data.title)}${data.reference ? ` (${plainLine(data.reference)})` : ''}`
  const body = frames.map((fr) => `${fr.ref.replace(/^0/, '').replace(/:0/, ':')} ${fr.text.replace(/\s+/g, ' ').trim()}`).join('\n')
  const t = `${head}\n${body}`
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + ' …' : t
}
