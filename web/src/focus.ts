// What an answer shows first. A stuck translator asks about one word or phrase of a passage ("What does redeemer mean in
// Ruth 4?", «extiende tu manto»): the notes about that word come first and the rest is folded behind a button, still there.
// This module is pure (no packs, no DOM): the words a question names, and which helps are about them.
//
// The fold in a Markdown answer is plain text, so it reads well when shared: a paragraph that starts with FOLD ("▸ 64 more
// notes") is the button, and everything after it is inside, up to the next FOLD or the answer's source line (md.ts).
import books from './data/books.json'
import booknames from './data/booknames.json'

export const FOLD = '▸ '

/** Lower case, accents off (not the vowel signs of Hindi or Arabic: those are letters there). */
const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const words = (s: string): string[] => fold(s).split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean)

// How a question asks, and what it asks to see: never what it is about.
const STOP = new Set(words(
  // en
  'a an the of in on at to for and or but is are was were be been do does did can could should would will i we you he she it they ' +
  'my me your his her their this that these those what which who whom whose where when why how there here about with from by as into ' +
  'mean means meaning meant say says said tell tells explain word words term terms phrase verse verses chapter bible book passage ' +
  'note notes translation translate translating question questions text help helps key show give please here it its one ones ' +
  'other others something someone did does like understand language people my our comprehension ult ust glt gst bsb ' +
  // es
  'el la los las un una unos unas de del en y o u que qué quien quién quienes donde dónde cuando como cómo cual cuál es son fue era eran ' +
  'se su sus mi mis tu tus lo le les al por para con sin sobre hay dice dicen decir quiere significa significado puede ser esto eso ' +
  'nota notas traduccion traducción traduzco traducir palabra palabras versiculo versículo capitulo capítulo pasaje libro biblia ' +
  'pregunta preguntas texto ayuda ayudas idioma pueblo nuestro nuestra explica explicame comprension comprensión ' +
  // fr
  'le la les un une des de du d l et ou qui quoi où quand comment est sont était sa son ses mon ma mes dans sur pour par avec ' +
  'veut dire signifie mot mots verset versets chapitre livre traduire traduction note notes quel quelle quels quelles ce cette ' +
  // id
  'yang di ke dari dan atau apa siapa mana kapan bagaimana adalah itu ini ada dalam pada untuk dengan tentang ayat pasal kitab ' +
  'arti maksud kata catatan terjemahan menerjemahkan alkitab ' +
  // hi
  'में का की के है हैं था थे कौन किस कहाँ कब क्या कैसे और या से पर को ने यह वह पद अध्याय मतलब अर्थ शब्द नोट्स अनुवाद करें करूँ ' +
  // ar
  'في من على إلى عن ما ماذا هو هي هل أين متى كيف لماذا أي التي الذي هذا هذه ذلك تلك و أو معنى كلمة ملاحظات الترجمة أترجم آية الأصحاح',
))
// Book names in every language the app reads: "Rut", "Ruth", "Jonás"… name the passage, not the word.
const BOOKS = new Set<string>()
for (const table of [...Object.values(books as Record<string, Record<string, string>>), ...Object.values(booknames as Record<string, Record<string, string>>)])
  for (const [k, v] of Object.entries(table)) for (const s of [k, v]) for (const w of words(s)) if (!/^\d+$/.test(w)) BOOKS.add(w)

/** A word's first letters: "redeemer" and "redeem", «redentor» and «redención», "arrepiente" and «arrepentirse» meet there. */
export const stem = (w: string): string => {
  const x = /^\p{Script=Arabic}/u.test(w) ? w.replace(/^(?:وال|ال|و|ب|ل)(?=\p{L}{3})/u, '') : w
  return x.slice(0, 5)
}

/** The stems of the words a question is about, with how it asks and the passage it names left out. */
export function focusWords(...texts: (string | null | undefined)[]): string[] {
  const out: string[] = []
  for (const t of texts) {
    if (!t) continue
    for (const w of words(t)) {
      if (/\d/.test(w) || STOP.has(w) || BOOKS.has(w)) continue
      if (w.length < (/[\x00-\x7f]/.test(w) ? 4 : 3)) continue
      const s = stem(w)
      if (!out.includes(s)) out.push(s)
    }
  }
  return out
}

/** The question's own words for some stems ("redeemer", not "redee"), to name what the first notes are about. */
export function wordsOf(stems: string[], ...texts: (string | null | undefined)[]): string[] {
  const out: string[] = []
  for (const t of texts) for (const w of words(t ?? '')) if (stems.includes(stem(w)) && !out.some((o) => stem(o) === stem(w))) out.push(w)
  return out
}

/** Which of the stems a text has. */
export function hits(text: string, stems: string[]): string[] {
  if (!stems.length || !text) return []
  const have = new Set(words(text).map(stem))
  return stems.filter((s) => have.has(s))
}

/** What a help offers to be matched by: its quote in the texts (all versions), and the titles of its key terms and article. */
export type Matchable = { quote: string; titles: string }

/**
 * The helps about the question's words, best first, and the others in their own order. A word that most helps have (Yahweh,
 * God) says nothing about which one is asked, so it does not count; neither does anything when no help matches.
 */
export function focusOrder(items: Matchable[], stems: string[]): { first: number[]; rest: number[]; used: string[] } {
  const all = items.map((_, i) => i)
  if (!stems.length || !items.length) return { first: [], rest: all, used: [] }
  const per = items.map((x) => ({ q: hits(x.quote, stems), t: hits(x.titles, stems) }))
  const common = stems.filter((s) => items.length >= 4 && per.filter((p) => p.q.includes(s) || p.t.includes(s)).length > items.length * 0.6)
  const used = stems.filter((s) => !common.includes(s))
  const score = per.map((p) => 2 * p.q.filter((s) => used.includes(s)).length + p.t.filter((s) => used.includes(s)).length)
  const first = all.filter((i) => score[i]! > 0).sort((a, b) => score[b]! - score[a]! || a - b)
  if (!first.length || first.length === items.length) return { first: [], rest: all, used: [] }
  return { first, rest: all.filter((i) => score[i] === 0), used: used.filter((s) => first.some((i) => per[i]!.q.includes(s) || per[i]!.t.includes(s))) }
}

/** How many notes a verse shows before the rest folds, when the question names no word. */
export const SHOWN = 5
