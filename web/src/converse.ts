// The conversational layer: one sentence that presents what was found, and follow-up suggestions. Built from what the recipes
// actually found (answer.ts `facts`), never generated: small models on the phone invented counts and verses when asked to talk
// (Qwen3 0.6B, Llama 3.2 1B and Gemma 3 1B measured on 12 Nov 2026), so no model writes these words.
import type { Sheet } from './answer'
import booknames from './data/booknames.json'

type L = 'en' | 'es' | 'fr' | 'id' | 'hi'
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]!

const W: Record<L, {
  text: (n: number) => string; notes: (n: number) => string; questions: (n: number) => string; terms: (n: number) => string; and: string
  found: string[]; nothing: string; article: string[]; choose: string[]; counted: string[]; advice: string[]; resources: string[]
  lNotes: string; lQuestions: string; lTerms: string; lNext: string; lText: string
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
  },
}
const lang = (ui: string): L => (['en', 'es', 'fr', 'id', 'hi'].includes(ui) ? (ui as L) : 'en')
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')
function list(items: string[], and: string): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`
}
const bookFor = (ui: string, code: string): string =>
  (ui === 'es' ? (booknames as any).BOOK_ES : (booknames as any).BOOK_EN)[code] ?? code

/** The sentence before the found information, or null when the answer already speaks for itself (not understood, not found). */
export function intro(sheet: Sheet, facts: Record<string, any>, ui: string): string | null {
  const w = W[lang(ui)]
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

export type Followup = { label: string; sheet: Sheet }
/** Next steps the person can tap: they carry a ready call sheet, so they do not go through the model again. */
export function followups(sheet: Sheet, facts: Record<string, any>, ui: string): Followup[] {
  const w = W[lang(ui)]
  const m = /^([0-9a-z]{3}) (\d+):(\d+)(?:-(\d+))?$/.exec(sheet.ref ?? '')
  if (sheet.intent !== 'passage' || !m || facts.kind !== 'passage') return []
  const [, code, ch, v1, v2] = m
  const same = (what: string[], ref = sheet.ref!): Sheet => ({ ...sheet, id: `f${Date.now()}`, ref, what, version: null })
  const out: Followup[] = []
  if (!sheet.what.includes('notes')) out.push({ label: w.lNotes, sheet: same(['notes']) })
  if (!sheet.what.includes('questions')) out.push({ label: w.lQuestions, sheet: same(['questions']) })
  if (!sheet.what.includes('text')) out.push({ label: w.lText, sheet: same(['text']) })
  const next = Number(v2 ?? v1) + 1
  out.push({ label: `${w.lNext} (${bookFor(ui, code!)} ${ch}:${next})`, sheet: same(sheet.what, `${code} ${ch}:${next}`) })
  return out
}

const S: Record<L, { concepts: string; text: string; none: string; nothing: string }> = {
  en: { concepts: 'These verses mention {words}:', text: 'These verses contain «{words}»:', none: "I didn't find verses with {words}. Try other words or a name.", nothing: 'Tell me some words or names from the passage you are looking for.' },
  es: { concepts: 'Estos versículos mencionan {words}:', text: 'Estos versículos contienen «{words}»:', none: 'No encontré versículos con {words}. Prueba otras palabras o un nombre.', nothing: 'Dime algunas palabras o nombres del pasaje que buscas.' },
  fr: { concepts: 'Ces versets mentionnent {words} :', text: 'Ces versets contiennent «{words}» :', none: "Je n'ai pas trouvé de verset avec {words}. Essayez d'autres mots ou un nom.", nothing: 'Donnez-moi quelques mots ou noms du passage que vous cherchez.' },
  id: { concepts: 'Ayat-ayat ini menyebut {words}:', text: 'Ayat-ayat ini memuat «{words}»:', none: 'Saya tidak menemukan ayat dengan {words}. Coba kata lain atau sebuah nama.', nothing: 'Sebutkan beberapa kata atau nama dari bagian yang Anda cari.' },
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
