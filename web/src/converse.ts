// The conversational layer: one sentence that presents what was found, and follow-up suggestions. Built from what the recipes
// actually found (answer.ts `facts`), never generated: small models on the phone invented counts and verses when asked to talk
// (Qwen3 0.6B, Llama 3.2 1B and Gemma 3 1B measured on 12 Nov 2026), so no model writes these words.
import type { Sheet } from './answer'
import booknames from './data/booknames.json'
import shapes from './data/shapes.json'

type L = 'en' | 'es' | 'fr' | 'id' | 'hi' | 'ar'
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]!

const W: Record<L, {
  text: (n: number) => string; notes: (n: number) => string; questions: (n: number) => string; terms: (n: number) => string; and: string
  found: string[]; nothing: string; article: string[]; choose: string[]; counted: string[]; advice: string[]; resources: string[]
  lNotes: string; lQuestions: string; lTerms: string; lNext: string; lText: string
  lPrev: string; lPrevCh: string; lNextCh: string; lChapter: string; lAcademy: string
}> = {
  en: {
    text: (n) => (n === 1 ? 'the verse text' : `the text in ${n} versions`), notes: (n) => (n === 1 ? '1 translation note' : `${n} translation notes`),
    questions: (n) => (n === 1 ? '1 comprehension question' : `${n} comprehension questions`), terms: (n) => (n === 1 ? '1 key term' : `${n} key terms`), and: 'and',
    found: ['For {ref} I found {list}.', "Here's {list} for {ref}.", 'I looked up {ref}: {list}.'],
    nothing: "I didn't find anything for {ref} in the packs on this phone.",
    article: ['Here is the article «{title}»:', 'I found the article «{title}». This is what it says:'],
    choose: ['There is more than one article with that name. Which one do you mean?'],
    counted: ["Here's what I counted:", 'This is the count from the installed helps:'],
    advice: ['For «{phrase}», this is what the translation helps say:', 'Here is the help I found for «{phrase}»:'],
    resources: ['This is what is on this phone:'],
    lNotes: 'Notes', lQuestions: 'Questions', lTerms: 'Key terms', lNext: 'Next verse', lText: 'Verse text',
    lPrev: 'Previous verse', lPrevCh: 'Previous chapter', lNextCh: 'Next chapter', lChapter: 'Whole chapter', lAcademy: 'Academy: {title}',
  },
  es: {
    text: (n) => (n === 1 ? 'el texto del versículo' : `el texto en ${n} versiones`), notes: (n) => (n === 1 ? '1 nota de traducción' : `${n} notas de traducción`),
    questions: (n) => (n === 1 ? '1 pregunta de comprensión' : `${n} preguntas de comprensión`), terms: (n) => (n === 1 ? '1 palabra clave' : `${n} palabras clave`), and: 'y',
    found: ['Para {ref} encontré {list}.', 'Aquí tienes {list} de {ref}.', 'Busqué {ref} y encontré {list}.'],
    nothing: 'No encontré nada para {ref} en los paquetes de este teléfono.',
    article: ['Aquí está el artículo «{title}»:', 'Encontré el artículo «{title}». Esto dice:'],
    choose: ['Hay más de un artículo con ese nombre. ¿Cuál buscas?'],
    counted: ['Esto es lo que conté:', 'Este es el conteo en las ayudas instaladas:'],
    advice: ['Para «{phrase}», esto dicen las ayudas de traducción:', 'Esto encontré para «{phrase}»:'],
    resources: ['Esto es lo que hay en este teléfono:'],
    lNotes: 'Notas', lQuestions: 'Preguntas', lTerms: 'Palabras clave', lNext: 'Versículo siguiente', lText: 'Texto',
    lPrev: 'Versículo anterior', lPrevCh: 'Capítulo anterior', lNextCh: 'Capítulo siguiente', lChapter: 'Capítulo completo', lAcademy: 'Academia: {title}',
  },
  fr: {
    text: (n) => (n === 1 ? 'le texte du verset' : `le texte en ${n} versions`), notes: (n) => (n === 1 ? '1 note de traduction' : `${n} notes de traduction`),
    questions: (n) => (n === 1 ? '1 question de compréhension' : `${n} questions de compréhension`), terms: (n) => (n === 1 ? '1 mot clé' : `${n} mots clés`), and: 'et',
    found: ["Pour {ref}, j'ai trouvé {list}.", 'Voici {list} pour {ref}.'],
    nothing: "Je n'ai rien trouvé pour {ref} dans les paquets de ce téléphone.",
    article: ["Voici l'article «{title}» :", "J'ai trouvé l'article «{title}». Voici ce qu'il dit :"],
    choose: ['Plusieurs articles portent ce nom. Lequel cherchez-vous ?'],
    counted: ["Voici ce que j'ai compté :"],
    advice: ['Pour «{phrase}», voici ce que disent les aides à la traduction :'],
    resources: ['Voici ce qui se trouve sur ce téléphone :'],
    lNotes: 'Notes', lQuestions: 'Questions', lTerms: 'Mots clés', lNext: 'Verset suivant', lText: 'Texte',
    lPrev: 'Verset précédent', lPrevCh: 'Chapitre précédent', lNextCh: 'Chapitre suivant', lChapter: 'Chapitre entier', lAcademy: 'Académie : {title}',
  },
  id: {
    text: (n) => (n === 1 ? 'teks ayat' : `teks dalam ${n} versi`), notes: (n) => `${n} catatan terjemahan`,
    questions: (n) => `${n} pertanyaan pemahaman`, terms: (n) => `${n} istilah kunci`, and: 'dan',
    found: ['Untuk {ref}, saya menemukan {list}.', 'Ini {list} untuk {ref}.'],
    nothing: 'Saya tidak menemukan apa pun untuk {ref} di paket ponsel ini.',
    article: ['Ini artikel «{title}»:', 'Saya menemukan artikel «{title}». Isinya:'],
    choose: ['Ada lebih dari satu artikel dengan nama itu. Yang mana yang Anda maksud?'],
    counted: ['Ini hasil hitungan saya:'],
    advice: ['Untuk «{phrase}», ini kata bahan bantu penerjemahan:'],
    resources: ['Ini yang ada di ponsel ini:'],
    lNotes: 'Catatan', lQuestions: 'Pertanyaan', lTerms: 'Istilah kunci', lNext: 'Ayat berikutnya', lText: 'Teks',
    lPrev: 'Ayat sebelumnya', lPrevCh: 'Pasal sebelumnya', lNextCh: 'Pasal berikutnya', lChapter: 'Seluruh pasal', lAcademy: 'Akademi: {title}',
  },
  hi: {
    text: (n) => (n === 1 ? 'पद का पाठ' : `${n} संस्करणों में पाठ`), notes: (n) => `${n} अनुवाद टिप्पणियाँ`,
    questions: (n) => `${n} समझ के प्रश्न`, terms: (n) => `${n} मुख्य शब्द`, and: 'और',
    found: ['{ref} के लिए मुझे {list} मिले।', 'यह रहे {ref} के लिए {list}।'],
    nothing: 'इस फ़ोन के पैकेजों में {ref} के लिए मुझे कुछ नहीं मिला।',
    article: ['यह रहा लेख «{title}»:', 'मुझे लेख «{title}» मिला। इसमें लिखा है:'],
    choose: ['इस नाम के एक से अधिक लेख हैं। आप कौन-सा चाहते हैं?'],
    counted: ['मैंने यह गिना:'],
    advice: ['«{phrase}» के लिए अनुवाद सहायता यह कहती है:'],
    resources: ['इस फ़ोन पर यह है:'],
    lNotes: 'टिप्पणियाँ', lQuestions: 'प्रश्न', lTerms: 'मुख्य शब्द', lNext: 'अगला पद', lText: 'पाठ',
    lPrev: 'पिछला पद', lPrevCh: 'पिछला अध्याय', lNextCh: 'अगला अध्याय', lChapter: 'पूरा अध्याय', lAcademy: 'अकादमी: {title}',
  },
  ar: {
    text: (n) => (n === 1 ? 'نص الآية' : `النص في ${n} ترجمات`), notes: (n) => `${n} من ملاحظات الترجمة`,
    questions: (n) => `${n} من أسئلة الفهم`, terms: (n) => `${n} من الكلمات الرئيسية`, and: 'و',
    found: ['وجدتُ لـ {ref} {list}.', 'إليك {list} لـ {ref}.'],
    nothing: 'لم أجد شيئًا لـ {ref} في حزم هذا الهاتف.',
    article: ['إليك مقالة «{title}»:', 'وجدتُ مقالة «{title}». هذا ما تقوله:'],
    choose: ['هناك أكثر من مقالة بهذا الاسم. أيّها تقصد؟'],
    counted: ['هذا ما أحصيته:'],
    advice: ['بخصوص «{phrase}»، هذا ما تقوله مساعدات الترجمة:'],
    resources: ['هذا ما يوجد على هذا الهاتف:'],
    lNotes: 'الملاحظات', lQuestions: 'الأسئلة', lTerms: 'الكلمات الرئيسية', lNext: 'الآية التالية', lText: 'النص',
    lPrev: 'الآية السابقة', lPrevCh: 'الأصحاح السابق', lNextCh: 'الأصحاح التالي', lChapter: 'الأصحاح كله', lAcademy: 'الأكاديمية: {title}',
  },
}
const lang = (ui: string): L => (['en', 'es', 'fr', 'id', 'hi', 'ar'].includes(ui) ? (ui as L) : 'en')
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')
function list(items: string[], and: string): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`
}
const bookFor = (ui: string, code: string): string =>
  (ui === 'es' ? (booknames as any).BOOK_ES : ui === 'ar' ? (booknames as any).BOOK_AR : (booknames as any).BOOK_EN)[code] ?? code

/** The sentence before the found information, or null when the answer already speaks for itself (not understood, not found). */
const INTRO: Record<L, { found: string; label: string }> = {
  en: { found: 'Here is the introduction to {what}.', label: shapes.intro.text.en },
  es: { found: 'Esta es la introducción a {what}.', label: shapes.intro.text.es },
  fr: { found: "Voici l'introduction à {what}.", label: shapes.intro.text.fr },
  id: { found: 'Ini pengantar untuk {what}.', label: shapes.intro.text.id },
  hi: { found: 'यह {what} का परिचय है।', label: shapes.intro.text.hi },
  ar: { found: 'هذه مقدمة {what}.', label: shapes.intro.text.ar },
}

export function intro(sheet: Sheet, facts: Record<string, any>, ui: string): string | null {
  const w = W[lang(ui)]
  if (facts.kind === 'passage' && facts.intro && !facts.texts && !facts.notes) return fill(INTRO[lang(ui)].found, { what: facts.intro })
  if (facts.kind === 'passage') {
    const items: string[] = []
    if (facts.texts) items.push(w.text(facts.texts))
    if (facts.notes) items.push(w.notes(facts.notes))
    if (facts.questions) items.push(w.questions(facts.questions))
    if (facts.terms) items.push(w.terms(facts.terms))
    const ref = `${bookFor(ui, facts.code)} ${facts.ref}`.trim()
    return items.length ? fill(pick(w.found), { ref, list: list(items, w.and) }) : fill(w.nothing, { ref })
  }
  if (facts.kind === 'article') return fill(pick(w.article), { title: facts.title })
  switch (sheet.intent) {
    case 'choose': return pick(w.choose)
    case 'count': case 'rank': return pick(w.counted)
    case 'resources': return pick(w.resources)
    case 'advice': return sheet.phrase ? fill(pick(w.advice), { phrase: sheet.phrase }) : null
  }
  return null
}

/**
 * A next step under an answer: a ready call sheet (no model call), or Browse opened at a book or a Translation Academy manual
 * (`browse`), or the same question asked again (`again`, after an error).
 */
export type Browse = { book?: string; manual?: string; lang?: string
  /** the list of Open Bible Stories (obs.ts) */
  obs?: boolean }
/** What "Try again" asks again: the question as the person typed it, or the button's sheet (with its label) */
export type Again = { q?: string; sheet?: Sheet; label?: string }
/**
 * `back`: the way back to an earlier point of the conversation (graph.ts; the point's id): main.ts goes back there instead of
 * asking the sheet as a new question. '' marks a button back to the passage before that has no point yet (pipeline.ts noIntro).
 */
export type Followup = { label: string; sheet?: Sheet; browse?: Browse; again?: Again; back?: string
  /** "← Back to the path: …" (pipeline.ts pathStep): drawn like the way back */
  toPath?: boolean
  /** "Next: Ruth 1:2 · notes", the light path's next step (first under the answer, marked) */
  pathNext?: boolean
  /** "← Back to the session: …", the way back to a 5M session's current step (pipeline.ts sessionStep): drawn like the way back */
  toSession?: boolean
  /** "Next: Movement 1 · observation · frame 6/16", a 5M session's next step (first under a step's card, marked) */
  sessionNext?: boolean
  /** a unit to add to a language on a tap ("Add Open Bible Stories (218 KB)"), then `sheet` is asked again (main.ts) */
  add?: { lang: string; unit: string }
  /** one of the steps that stay in sight when the others go behind "More ▸" (the verse or chapter before and after, the next
   *  section, the story this passage is told in, an introduction's chapter to read) */
  key?: boolean }
/** The most buttons under one answer (they wrap; more is a wall on a phone). */
export const MAX_FOLLOW = 9
/** The buttons in sight under an answer, the way back included; the others behind "More ▸" (Abel, Nov 17: ten were too many). */
export const SHOWN = 5
/**
 * The buttons in sight and the ones behind "More ▸", each in its order. `backs`: how many ways back are drawn above them (they
 * count). In sight first: a path's or a session's next step, a unit to add, try again, the key steps; then the others in their
 * order, until there is no room. One button alone behind "More ▸" is shown instead.
 */
export function splitFollow(follow: Followup[], backs = 0): { shown: Followup[]; more: Followup[] } {
  const room = Math.max(3, SHOWN - backs)
  if (follow.length <= room + 1) return { shown: follow, more: [] }
  const first = (f: Followup) => !!(f.pathNext || f.sessionNext || f.add || f.again || f.back || f.toPath || f.toSession || f.key)
  const pick = new Set<Followup>()
  for (const f of follow) if (pick.size < room && first(f)) pick.add(f)
  for (const f of follow) if (pick.size < room) pick.add(f)
  return { shown: follow.filter((f) => pick.has(f)), more: follow.filter((f) => !pick.has(f)) }
}

/** The words of the next steps that are not about one verse: a chapter to read, Browse, try again. */
const NX: Record<L, { read: string; notesOf: string; termsOf: string; browseBook: string; browseAcademy: string; browse: string; again: string; howName: string; howThing: string }> = {
  en: { read: 'Read {ref}', notesOf: shapes.notes.text.en, termsOf: 'Key terms of {ref}', browseBook: 'Browse {book}', browseAcademy: 'Browse Translation Academy', browse: 'Browse the Bible and the helps', again: 'Try again', howName: 'How to translate this name', howThing: 'How to translate it' },
  es: { read: 'Leer {ref}', notesOf: shapes.notes.text.es, termsOf: 'Palabras clave de {ref}', browseBook: 'Explorar {book}', browseAcademy: 'Explorar Translation Academy', browse: 'Explorar la Biblia y las ayudas', again: 'Intentar de nuevo', howName: 'Cómo traducir este nombre', howThing: 'Cómo traducirlo' },
  fr: { read: 'Lire {ref}', notesOf: shapes.notes.text.fr, termsOf: 'Mots clés de {ref}', browseBook: 'Parcourir {book}', browseAcademy: 'Parcourir Translation Academy', browse: 'Parcourir la Bible et les aides', again: 'Réessayer', howName: 'Comment traduire ce nom', howThing: 'Comment le traduire' },
  id: { read: 'Baca {ref}', notesOf: shapes.notes.text.id, termsOf: 'Istilah kunci {ref}', browseBook: 'Jelajahi {book}', browseAcademy: 'Jelajahi Translation Academy', browse: 'Jelajahi Alkitab dan bahan bantu', again: 'Coba lagi', howName: 'Cara menerjemahkan nama ini', howThing: 'Cara menerjemahkannya' },
  hi: { read: '{ref} पढ़ें', notesOf: shapes.notes.text.hi, termsOf: '{ref} के मुख्य शब्द', browseBook: '{book} ब्राउज़ करें', browseAcademy: 'Translation Academy ब्राउज़ करें', browse: 'बाइबल और सहायता ब्राउज़ करें', again: 'फिर से कोशिश करें', howName: 'इस नाम का अनुवाद कैसे करें', howThing: 'इसका अनुवाद कैसे करें' },
  ar: { read: 'اقرأ {ref}', notesOf: shapes.notes.text.ar, termsOf: 'الكلمات الرئيسية في {ref}', browseBook: 'تصفّح {book}', browseAcademy: 'تصفّح Translation Academy', browse: 'تصفّح الكتاب المقدس والمساعدات', again: 'حاول مرة أخرى', howName: 'كيف أترجم هذا الاسم', howThing: 'كيف أترجمه' },
}
export const nextWords = (ui: string) => NX[lang(ui)]
/** "Introduction to Jonah", in the app's language. */
export const introLabel = (ui: string, what: string): string => fill(INTRO[lang(ui)].label, { what })
/** Browse: at a book, at a Translation Academy manual, or where it was left. */
export function browseStep(ui: string, at: Browse = {}): Followup {
  const n = NX[lang(ui)]
  return { label: at.book ? fill(n.browseBook, { book: bookFor(ui, at.book) }) : at.manual ? n.browseAcademy : n.browse, browse: at }
}
/** The same question asked again (an answer that failed): none when there is nothing to ask again with. */
export const againStep = (ui: string, again: Again | undefined): Followup[] =>
  again?.q || again?.sheet ? [{ label: NX[lang(ui)].again, again }] : []

/**
 * Next steps the person can tap under a passage: they carry a ready call sheet, so they do not go through the model again.
 * The helps not shown yet, the verse before and after, the whole chapter, `extra` (the Translation Academy article the
 * notes cite, pipeline.ts), and the chapter's and the book's introductions. Under an introduction: under the book's, its
 * chapter 1 (text, its introduction, the notes of 1:1, its key terms); under a chapter's, its text, the notes of its first
 * verse and the next chapter's introduction; `extra` after the first three, Browse at the book last.
 */
export function followups(sheet: Sheet, facts: Record<string, any>, ui: string, extra: Followup[] = [], bounds: Map<number, number> | null = null): Followup[] {
  const w = W[lang(ui)]
  const same = (what: string[], ref = sheet.ref!): Sheet => ({ ...sheet, id: `f${Date.now()}`, ref, what, version: null })
  const im = /^([0-9a-z]{3}) (front|\d+):intro$/.exec(sheet.ref ?? '')
  if (sheet.intent === 'passage' && im) {
    const [, code, at] = im
    const book = bookFor(ui, code!)
    const n = NX[lang(ui)]
    const label = INTRO[lang(ui)].label
    const ch = at === 'front' ? 1 : +at!
    const out: Followup[] = [{ label: fill(n.read, { ref: `${book} ${ch}` }), sheet: same(['text', 'notes'], `${code} ${ch}`), key: true }]
    if (at === 'front') out.push({ label: fill(label, { what: `${book} 1` }), sheet: same(['intro'], `${code} 1:intro`) })
    out.push({ label: fill(n.notesOf, { ref: `${book} ${ch}:1` }), sheet: same(['notes'], `${code} ${ch}:1`) })
    out.push(...extra)
    if (at === 'front') out.push({ label: fill(n.termsOf, { ref: `${book} 1` }), sheet: same(['terms'], `${code} 1`) })
    else {
      if (!bounds || bounds.has(ch + 1)) out.push({ label: fill(label, { what: `${book} ${ch + 1}` }), sheet: same(['intro'], `${code} ${ch + 1}:intro`) })
      out.push({ label: fill(label, { what: book }), sheet: same(['intro'], `${code} front:intro`) })
    }
    out.push(browseStep(ui, { book: code!, lang: sheet.lang }))
    return out.slice(0, MAX_FOLLOW)
  }
  const m = /^([0-9a-z]{3}) (\d+)(?::(\d+)(?:-(\d+))?)?$/.exec(sheet.ref ?? '')
  if (sheet.intent !== 'passage' || !m || facts.kind !== 'passage') return extra
  const [, code, ch, v1] = m
  const book = bookFor(ui, code!)
  const out: Followup[] = []
  if (!sheet.what.includes('notes')) out.push({ label: w.lNotes, sheet: same(['notes']) })
  if (!sheet.what.includes('questions')) out.push({ label: w.lQuestions, sheet: same(['questions']) })
  if (!sheet.what.includes('terms')) out.push({ label: w.lTerms, sheet: same(['terms']) })
  if (!sheet.what.includes('text')) out.push({ label: w.lText, sheet: same(['text']) })
  // (bounds: chapter -> its last verse, when the book is in a pack: verse 1 goes back to the chapter before's last verse)
  const c = +ch!
  if (v1) {
    const prev = +v1 > 1 ? `${c}:${+v1 - 1}` : c > 1 && bounds?.get(c - 1) ? `${c - 1}:${bounds.get(c - 1)}` : null
    if (prev) out.push({ label: `${w.lPrev} (${book} ${prev})`, sheet: same(sheet.what, `${code} ${prev}`), key: true })
    if (facts.next) out.push({ label: `${w.lNext} (${book} ${facts.next})`, sheet: same(sheet.what, `${code} ${facts.next}`), key: true })
    out.push({ label: `${w.lChapter} (${book} ${ch})`, sheet: same(['text', 'notes'], `${code} ${ch}`) })
  } else {
    if (c > 1) out.push({ label: `${w.lPrevCh} (${book} ${c - 1})`, sheet: same(sheet.what, `${code} ${c - 1}`), key: true })
    if (bounds?.has(c + 1)) out.push({ label: `${w.lNextCh} (${book} ${c + 1})`, sheet: same(sheet.what, `${code} ${c + 1}`), key: true })
  }
  out.push(...extra)
  // the chapter's and the book's introductions: the context a translator needs, one tap away
  const label = INTRO[lang(ui)].label
  out.push({ label: fill(label, { what: `${book} ${ch}` }), sheet: same(['intro'], `${code} ${ch}:intro`) })
  out.push({ label: fill(label, { what: book }), sheet: same(['intro'], `${code} front:intro`) })
  return out.slice(0, MAX_FOLLOW)
}
/** What a passage answer showed, in a word ("Notes", "Key terms"), for the name of a point of the graph; null for the rest. */
export function whatWord(ui: string, what: string): string | null {
  const w = W[lang(ui)]
  return ({ notes: w.lNotes, questions: w.lQuestions, terms: w.lTerms, text: w.lText } as Record<string, string>)[what] ?? null
}
/** "Academy: Metaphor", in the app's language. */
export const academyLabel = (ui: string, title: string): string => fill(W[lang(ui)].lAcademy, { title })

const S: Record<L, { concepts: string; text: string; none: string; nothing: string }> = {
  en: { concepts: 'These verses mention {words}:', text: 'These verses contain «{words}»:', none: "I didn't find verses with {words}. Try other words or a name.", nothing: 'Tell me some words or names from the passage you are looking for.' },
  es: { concepts: 'Estos versículos mencionan {words}:', text: 'Estos versículos contienen «{words}»:', none: 'No encontré versículos con {words}. Prueba otras palabras o un nombre.', nothing: 'Dime algunas palabras o nombres del pasaje que buscas.' },
  fr: { concepts: 'Ces versets mentionnent {words} :', text: 'Ces versets contiennent «{words}» :', none: "Je n'ai pas trouvé de verset avec {words}. Essayez d'autres mots ou un nom.", nothing: 'Donnez-moi quelques mots ou noms du passage que vous cherchez.' },
  id: { concepts: 'Ayat-ayat ini menyebut {words}:', text: 'Ayat-ayat ini memuat «{words}»:', none: 'Saya tidak menemukan ayat dengan {words}. Coba kata lain atau sebuah nama.', nothing: 'Sebutkan beberapa kata atau nama dari bagian yang Anda cari.' },
  ar: { concepts: 'هذه الآيات تذكر {words}:', text: 'هذه الآيات تحتوي «{words}»:', none: 'لم أجد آيات فيها {words}. جرّب كلمات أخرى أو اسمًا.', nothing: 'اذكر بعض الكلمات أو الأسماء من المقطع الذي تبحث عنه.' },
  hi: { concepts: 'इन पदों में {words} का उल्लेख है:', text: 'इन पदों में «{words}» है:', none: 'मुझे {words} वाले पद नहीं मिले। दूसरे शब्द या कोई नाम आज़माएँ।', nothing: 'जिस भाग को आप खोज रहे हैं, उसके कुछ शब्द या नाम बताइए।' },
}
/** The sentence before search results: what was searched, and how. */
export function searchIntro(how: 'concepts' | 'text' | 'none', words: string[], ui: string): string {
  const s = S[lang(ui)]
  if (!words.length) return s.nothing
  const w = list(words, W[lang(ui)].and)
  return fill(how === 'concepts' ? s.concepts : how === 'text' ? s.text : s.none, { words: w })
}
export const bookLabel = bookFor
