// Open questions ("in which verse does Abraham sacrifice Isaac?"): the question's content words -> verses.
// 1) Words that name a Translation Words article (names and key terms, in any of the five languages) become concepts; the verses
//    whose word links hold all of them are found through the common map (books) and each book's links (verses). Works whatever
//    language the question is in. 2) Otherwise, full-text search of the installed texts, dropping common words before names.
import { mapView, verseId, type BookModel, type HelpRow } from '@bt-synergy/language-pack-v3'
import glossary from './data/kt-glossary.json'
import booknames from './data/booknames.json'
import books from './data/books.json'
import { installedLangs, openLang } from './packs'
import { bookExact, fold } from './sheet'
import storyWords from './data/story-words.json'
import storyWordsMore from './data/story-words-more.json'
import { rankVerses, resetIndexes, searchIndex, searchIntros, type RankedVerse, type Ranking, type Term } from './textindex'

/** Common story words of a question in English ("mar" -> "sea"), to match the English text when the language's pack lacks the book. */
const LEX: Record<string, Record<string, string>> = Object.fromEntries(Object.entries(storyWords as unknown as Record<string, Record<string, string>>)
  .map(([l, t]) => [l, l === '_' ? t : { ...((storyWordsMore as unknown as Record<string, Record<string, string>>)[l] ?? {}), ...t }]))
const toEnglish = (ws: string[], l: string): string[] => {
  // the question's language first; a French question answered from the English pack still has French words
  const tables = [LEX[l.split('-')[0]!], ...Object.entries(LEX).filter(([k]) => k !== '_' && k !== l.split('-')[0]).map(([, t]) => t)]
  return ws.map((w) => tables.map((t) => t?.[fold(w)]).find((x) => typeof x === 'string')).filter((x): x is string => !!x)
}
const rootsOf = (ws: string[]): string[] =>
  ws.map((w) => fold(w)).filter((w) => w.length >= 3).map((w) => w.slice(0, Math.min(6, Math.max(3, w.length - 2))))

const STOP = new Set(
  (
    // en
    'a an the of in on at to for and or but is are was were be been do does did can could should would will i we you he she it they ' +
    'my me your his her their this that these those what which who whom whose where when why how there here about with from by as into ' +
    'verse verses bible book chapter passage say says said talk talks speak speaks tell tells story find show me please find where ' +
    // es
    'el la los las un una unos unas de del en y o u que qué quien quién donde dónde cuando cuándo como cómo cual cuál es son fue era ' +
    'se su sus mi mis tu tus lo le les al por para con sin sobre hay habla hablan dice dicen versiculo versículo versiculos biblia libro ' +
    'capitulo capítulo pasaje parte cuenta historia encuentra muestra muestrame muéstrame donde aparece ' +
    // fr
    'le la les un une des de du d l et ou que qui quoi où quand comment est sont était se sa son ses mon ma mes dans sur pour par avec ' +
    'parle parlent dit disent verset versets bible livre chapitre passage quel quelle il elle ils elles avec est été être par ' +
    // id
    'yang di ke dari dan atau apa siapa mana kapan bagaimana adalah itu ini ada dalam pada untuk dengan tentang ayat ayatnya alkitab ' +
    'kitab pasal bagian berbicara mengatakan berkata cerita tunjukkan ' +
    // how a question names what it looks for, not what it looks for ("what books mention the word grace")
    'mention mentions mentioned mentioning word words term terms books contain contains appear appears used uses use ' +
    'menciona mencionan mencionado mencionada mencionar palabra palabras termino término terminos términos libros contiene contienen usa usan aparecen ' +
    'mentionne mentionnent mot mots terme termes livres contient quels quelles cuales cuáles saja ' +
    // how a question asks, not what it looks for ("como traduzco…", "que quiere decir…")
    'translate translating meaning ' +
    'traduzco traducir traduce traducimos quiere quieren decir significa significan eso esto ' +
    'traduire signifie ' +
    'menerjemahkan maksud ' +
    'menyebut menyebutkan kata istilah kitab-kitab memuat muncul ' +
    // what to show, not what to look for
    'notes note notas nota translation traduccion traducción traduction terjemahan catatan questions question preguntas pregunta pertanyaan text texto teks texte ' +
    // how a question asks where something happens ("where does it happen", "¿dónde pasa…?"), and the small words that are rare
    // in the Bible's text (a rarity ranking would put them first: "atas" in "berjalan di atas air")
    'happen happens happened happening occur occurs occurred get gets got have has had ' +
    'pasa pasó sucede sucedió ocurre ocurrió está están estaba estaban hizo hace tiene tienen tenía tenían había habían ' +
    'ont été être était étaient avait avaient fait passe arrive trouve ' +
    'atas bawah oleh akan sudah telah juga tidak bisa harus saat ketika terjadi ' +
    // the person's own situation ("in our village nobody knows snow"): never what is looked for
    'orang kami kita saya tahu kampung desa disebut sebut disebutkan '
  ).split(/\s+/).map((w) => fold(w)),
)
// ar
const AR_STOP = new Set('لا لم لن قد كل له لي به بها فيه فيها يا يوجد توجد أترجم نترجم ترجم بلادنا بلدنا عندنا لغتنا يذكر تذكر يذكره ذكر يحدث حدث حدثت وقع وقعت أسفار الأسفار يرد ترد في من على إلى عن ما ماذا من هو هي هل أين متى كيف لماذا أي التي الذي الذين هذا هذه ذلك تلك و أو ثم مع عند كان كانت يكون آية الآية آيات الكتاب المقدس سفر أصحاح الأصحاح يتحدث تتحدث يقول تقول قصة أرني أظهر ملاحظات ملاحظة الترجمة أسئلة نص'.split(' ').map((w) => fold(w)))
const HI_STOP = new Set('किन पुस्तकों किताबों पुस्तकें किताबें टिप्पणी टिप्पणियाँ टिप्पणियां अनुवाद प्रश्न पाठ में का की के है हैं था थे कौन कौन-सा किस किसमें कहाँ कब क्या कैसे और या से पर को ने यह वह पद पदों बाइबल अध्याय बात बारे कहता कहते बताता हुआ हुई हुए होता होती गया गई वर्णन उल्लेख भी तो ही जो वो हो एक इस उस'.split(' '))

/** The content words of a question, longest first within the question order (names usually survive). */
export function keywords(q: string): string[] {
  const toks = q
    .replace(/[«»"“”‘’'?¿!¡.,;:()\-؟،؛।]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const out: string[] = []
  for (const t of toks) {
    const f = fold(t)
    // two letters are a word in Arabic (دم "blood"); not in Hindi, whose vowel signs the index leaves out (जौ would be ज)
    if (/^\d+$/.test(f) || f.length < (/^[ء-ي]/.test(f) ? 2 : 3) || STOP.has(f) || HI_STOP.has(t) || AR_STOP.has(f) || AR_STOP.has(f.replace(/^(ال|و|ب|ل)/, ''))) continue
    // one Arabic word once, with or without its article (ثلج, الثلج)
    const key = f.replace(/^ال(?=[ء-ي]{2})/, '')
    if (!out.some((o) => fold(o).replace(/^ال(?=[ء-ي]{2})/, '') === key)) out.push(t)
  }
  return out.slice(0, 6)
}

type Reader = Awaited<ReturnType<typeof openLang>>
const opened = new Map<string, Promise<Reader>>()
/** A pack's reader; its maps only when asked (they take most of a second per pack to read). */
const reader = (l: string): Promise<Reader> => {
  if (!opened.has(l)) opened.set(l, openLang(l))
  return opened.get(l)!
}
const lang = async (l: string): Promise<{ r: Reader; maps: any }> => {
  const r = await reader(l)
  return { r, maps: await r.maps() }
}
/**
 * The article names of a pack: the core of its `map` unit alone, not all its maps (the word links of every book, read again
 * by every pack). Same names as `(await r.maps()).map.core.names`, which is still asked when the core does not read.
 */
async function namesOf(r: Reader): Promise<Record<string, string[]>> {
  try {
    for (const seg of (await r.segments('map')) ?? []) {
      if ((seg as any).h?.part !== 'core') continue
      return ((mapView(seg as any) as any).names ?? {}) as Record<string, string[]>
    }
  } catch {}
  return (await r.maps()).map?.core?.names ?? {}
}

/** name -> Translation Words ids, from the pack's article names (en, es) and the key-term glossary (fr, id, hi). */
/** The promise, set before the first await: a call still running when the packs change cannot write its names over the new ones. */
let NAMES: Promise<Map<string, string[]>> | null = null
/** After a language is added or removed. */
export function resetSearch() {
  opened.clear()
  resetIndexes()
  NAMES = null
}
function names(): Promise<Map<string, string[]>> {
  if (!NAMES) {
    const p = (NAMES = readNames())
    // a read that failed is tried again next time
    p.catch(() => { if (NAMES === p) NAMES = null })
  }
  return NAMES
}
async function readNames(): Promise<Map<string, string[]>> {
  const m = new Map<string, string[]>()
  const put = (k: string, id: string) => {
    if (k.length >= 3 && !m.get(k)?.includes(id)) m.set(k, [...(m.get(k) ?? []), id])
  }
  // "John (the Baptist)": both "john" and "john the baptist"
  const add = (n: string, id: string) => {
    put(fold(n.replace(/\(.*?\)/g, ' ')).replace(/\s+/g, ' ').trim(), id)
    if (/\(/.test(n)) put(fold(n.replace(/[()]/g, ' ')).replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim(), id)
  }
  // read side by side, added in the order of the packs
  const all = await Promise.all((await installedLangs()).map((pl) => reader(pl).then(namesOf).catch(() => ({}))))
  for (const ns0 of all)
    for (const [id, ns] of Object.entries<string[]>(ns0))
      if (id.startsWith('tw:')) for (const n of ns) for (const part of String(n).split(/,\s*/)) add(part, id)
  for (const [id, byLang] of Object.entries(glossary as Record<string, Record<string, string[]>>))
    for (const ns of Object.values(byLang)) for (const n of ns) add(n, id)
  // People named like books, in every language of the book table: Jonas, Yunus, योना -> Jonah (tw:names/jonah)
  const en = (booknames as any).BOOK_EN as Record<string, string>
  for (const table of Object.values(books as Record<string, Record<string, string>>))
    for (const [name, code] of Object.entries(table)) {
      const ids = m.get(fold(en[code] ?? ''))?.filter((id) => id.startsWith('tw:names/'))
      if (ids?.length && !/\d/.test(name)) for (const id of ids) add(name, id)
    }
  return m
}
/** A word's concept: exact name, or the name without a plural or verb ending (sacrifica -> sacrificio is too far; sacrifices -> sacrifice works). */
function conceptOf(word: string, m: Map<string, string[]>, strict = false): string[] | null {
  const f = fold(word)
  for (const k of [f, f.replace(/(es|s)$/, ''), f.replace(/(ed|ing)$/, ''), f.replace(/(ó|o|a|ar|er|ir|an|aron)$/, '')])
    if (m.has(k)) return m.get(k)!
  // same root: "sacrifica" ~ "sacrificio", "sacrificed" ~ "sacrifice" (one-word names, a shared start of 5+ letters)
  if (f.length < 5 || /[ऀ-ॿ]/.test(f)) return null
  let best: string | null = null
  let bestLen = 0
  for (const k of m.keys()) {
    if (k.includes(' ')) continue
    let i = 0
    while (i < f.length && i < k.length && f[i] === k[i]) i++
    // strict (the verse ranking): only an ending apart ("sacrificed" ~ "sacrifice"), not "berjalan" ~ "berjanji"
    if (i >= Math.max(5, Math.min(f.length, k.length) - (strict ? 2 : 3)) && i > bestLen) {
      best = k
      bestLen = i
    }
  }
  return best ? m.get(best)! : null
}

/** A verse found: `text` as a list shows it (a snippet around the words, or the whole verse), `full` the whole verse. */
export type Found = { book: string; ch: number; v: number; text: string; why: string; full?: string }
export type SearchResult = {
  keywords: string[]; concepts: string[]; hits: Found[]; how: 'concepts' | 'text' | 'none'
  /** whether the best verse (or its neighbours) holds every word, and how much of the words' rarity it holds */
  strength?: Strength
}

const BOOKS: string[] = Object.keys((booknames as any).BOOK_EN).filter((c) => c !== 'obs')
type Text = BookModel['texts'][number]
const mainText = (model: BookModel): Text | undefined =>
  model.texts.find((x) => /\/(ult|glt)$/.test(x.res)) ?? model.texts.find((x) => /\/bsb$/.test(x.res)) ?? model.texts[0]
const NUMBER = /^(\d+)(?:-(\d+))?/
/**
 * Verse id -> its text, for every verse of a text in one pass: what `textOfRange(book, …, id, id)` gives for each id, which
 * walks the whole book every time it is called (once per verse and per text made a story search take seconds per book).
 */
function verseTexts(book: string, t: Text): Map<number, string> {
  const parts = new Map<number, string[]>()
  const pieces = t.pieces as any[]
  let chapter = 0
  let first = 0
  let last = 0
  let start = 0
  const flush = (end: number) => {
    const lo = verseId(book, chapter, first)
    const hi = verseId(book, chapter, last)
    if (end <= start) return
    const s = pieces.slice(start, end).map((p) => p[0]).join('').trim()
    for (let id = lo; id <= hi; id++) {
      const l = parts.get(id)
      if (l) l.push(s)
      else parts.set(id, [s])
    }
  }
  for (const [position, kind, arg] of t.events as any[]) {
    if (kind !== 'chapter' && kind !== 'verse') continue
    flush(position)
    start = position
    const m = NUMBER.exec(arg)
    if (m === null) {
      first = last = 0
      continue
    }
    if (kind === 'chapter') {
      chapter = Number(m[1])
      first = last = 0
    } else {
      first = Number(m[1])
      last = m[2] === undefined ? first : Number(m[2])
    }
  }
  flush(pieces.length)
  const out = new Map<number, string>()
  for (const [id, l] of parts) out.set(id, l.filter((p) => p !== '').join(' '))
  return out
}
/** Each text read into verses once, when a verse of it is first needed; kept while the reader keeps the book. */
const SPLIT = new WeakMap<Text, Map<number, string>>()
/** A text in another script than the language's is not that language (BSOJ's ar ARST New Testament is the English UST). */
const wrongScript = (l: string, t: string): boolean =>
  l === 'ar' ? !/[؀-ۿ]/.test(t) : l === 'hi' ? !/[ऀ-ॿ]/.test(t) : false
const parseRef = (ref: string): [number, number] => {
  const m = /^(\d+):(\d+)/.exec(ref)
  return m ? [Number(m[1]), Number(m[2])] : [0, 0]
}

/** Verses where the word links hold every concept (or as many as possible), from the English pack (it has every book). */
async function byConcepts(groups: string[][], words: string[], packLang = 'en'): Promise<Found[]> {
  // the question's own words match its own pack's text; in English (or through LEX) they match the English text
  const ownRoots = rootsOf(words)
  // a word with a translation ("mar" -> "sea") is looked for in English only as its translation: "mar" would match "married"
  const untranslated = words.filter((w) => !toEnglish([w], packLang).length)
  const english = [...new Set([...rootsOf(untranslated), ...rootsOf(toEnglish(words, packLang))])]
  const roots = [...new Set([...ownRoots, ...english])]
  const hitsOf = (rs: string[], t: string) => { const toks = fold(t).split(/[^\p{L}]+/u); return rs.filter((r) => toks.some((x) => x.startsWith(r))).length }
  // English has every book, but a phone may not have it: the question's pack, then English, then any pack with the map
  const have = await installedLangs()
  let found: Awaited<ReturnType<typeof lang>> | null = null
  for (const pl of [...new Set([packLang, 'en', ...have])]) {
    if (!have.includes(pl)) continue
    try {
      const x = await lang(pl)
      if (x.maps.xmap?.core) { found = x; break }
    } catch {}
  }
  if (!found) return []
  const { r, maps } = found
  const links = maps.xmap?.core?.links?.rows as Map<string, Map<string, [number, number]>> | undefined
  if (!links) return []
  // books that hold the most concept groups
  const score = new Map<string, number>()
  for (const g of groups) {
    const books = new Set<string>()
    for (const id of g) for (const b of links.get(id)?.keys() ?? []) books.add(b)
    for (const b of books) score.set(b, (score.get(b) ?? 0) + 1)
  }
  const best = Math.max(0, ...score.values())
  if (best < 1) return []
  const books = [...score].filter(([, n]) => n === best).map(([b]) => b).sort((a, b) => BOOKS.indexOf(a) - BOOKS.indexOf(b)).slice(0, 4)
  // Score each verse by the concepts in a window of five verses around it (a story spreads its names over several verses):
  // first how many of the asked concepts the window holds, then how many links to them it has. One hit per passage.
  const hits: (Found & { n: number; dense: number; own: number })[] = []
  for (const b of books) {
    if (!r.installed(`book:${b}`)) continue
    const model = await r.book(b)
    if (!model?.links) continue
    // the words of a question in Spanish can match the Spanish text, when the Spanish pack has the book; and the verse is
    // shown in that language
    let local: BookModel | undefined
    if (packLang !== 'en') {
      try {
        const lr = await reader(packLang)
        if (lr.installed(`book:${b}`)) local = await lr.book(b)
      } catch {}
    }
    const byVerse = new Map<number, { ref: string; ids: string[] }>()
    for (const row of model.links.rows as HelpRow[]) {
      if (!row.concept) continue
      const e = byVerse.get(row.from) ?? { ref: row.ref, ids: [] }
      e.ids.push(row.concept)
      byVerse.set(row.from, e)
    }
    const textOf = (t: Text | undefined, from: number): string => {
      if (!t) return ''
      if (!SPLIT.has(t)) SPLIT.set(t, verseTexts(model.book, t))
      return SPLIT.get(t)!.get(from) ?? ''
    }
    const verseText = (m: BookModel, from: number) => textOf(mainText(m), from).replace(/[{}]/g, '')
    const groupOf = (id: string) => groups.findIndex((g) => g.includes(id))
    const scored: (Found & { n: number; dense: number; own: number })[] = []
    for (const [from, e] of byVerse) {
      const covered = new Set<number>()
      let dense = 0 // verses of the window that name two or more of the asked concepts: a story about them, not a list of names
      for (let d = -3; d <= 3; d++) {
        const w = byVerse.get(from + d)
        if (!w) continue
        const gs = new Set(w.ids.map(groupOf).filter((g) => g >= 0))
        for (const g of gs) covered.add(g)
        if (gs.size >= 2) dense++
      }
      const own = new Set(e.ids.map(groupOf).filter((g) => g >= 0)).size
      if (covered.size < Math.min(2, groups.length) || own === 0) continue
      const [ch, v] = parseRef(e.ref)
      const localText = local ? verseText(local, from) : ''
      const text = localText && !wrongScript(packLang, localText) ? localText : verseText(model, from)
      const read = (ts: Text[]) => ts.map((t) => textOf(t, from)).join(' ')
      // without the book in the question's language, only its English words (or none) can be compared
      const tx = Math.max(hitsOf(english, read(model.texts)), local ? hitsOf(ownRoots, read(local.texts)) : 0)
      if (groups.length === 1 && roots.length && tx === 0) continue
      scored.push({ book: b, ch, v, text, why: 'concepts', n: covered.size + tx, dense, own })
    }
    for (const h of scored) (h as any).bookWeight = scored.length
    hits.push(...scored)
  }
  hits.sort((a, b) => b.n - a.n || b.dense - a.dense || (b as any).bookWeight - (a as any).bookWeight || b.own - a.own)
  const out: Found[] = []
  for (const h of hits) {
    if (out.some((o) => o.book === h.book && o.ch === h.ch && Math.abs(o.v - h.v) <= 4)) continue
    out.push(h)
    if (out.length >= 5) break
  }
  return out
}

/** Full-text search of the Bible texts, all words together first, then fewer words. */
/** The packs a search looks in: the question's, those of the languages its words come from ("pez": es-419), then English. */
export async function packsFor(words: string[], packLang: string): Promise<string[]> {
  const PACK: Record<string, string> = { es: 'es-419', id: 'id', hi: 'hi', ar: 'ar' }
  const fromWords = Object.entries(LEX).filter(([k, t]) => k !== '_' && words.some((w) => t[fold(w)])).map(([k]) => PACK[k]).filter((x): x is string => !!x)
  const have = await installedLangs()
  const own = [...new Set([packLang, ...fromWords, 'en'])].filter((l) => have.includes(l))
  // none of those installed: one pack, not all (every extra pack scanned costs seconds)
  return own.length ? own : have.slice(0, 1)
}
/** All words together first, then the two longest, then the longest. */
const triesOf = (words: string[]): string[][] => {
  const longest = [...words].sort((a, b) => b.length - a.length)
  return [words, ...(words.length > 2 ? [longest.slice(0, 2)] : []), ...(words.length > 1 ? [longest.slice(0, 1)] : [])]
}

/** The Bible texts a verse is shown from; in Arabic AVD and NAV, never ARST (its New Testament is the English UST). */
const MAIN_TEXT = /\/(ult|glt|bsb|avd|nav)$/
const SKIP_TEXT = /\/arst$/
/** Endings dropped to match a word's other forms (swallowed ~ swallow, swallowing; tragado ~ tragar, tragó), longest first. */
const ENDINGS = ['aron', 'ando', 'ados', 'adas', 'ing', 'ado', 'ada', 'ent', 'ait', 'ed', 'es', 'ar', 'er', 'ir', 'os', 'as', 'ée', 'és', 's', 'ó', 'é', 'a', 'o', 'e']
/** A word's beginning, for the languages written with endings (not Hindi or Arabic: their words match whole, or with a prefix). */
export function stemOf(w: string): string | null {
  const f = fold(w)
  if (f.length < 4 || /[^a-z]/.test(f)) return null
  for (const e of ENDINGS) if (f.endsWith(e) && f.length - e.length >= 4) return f.slice(0, -e.length)
  return f
}
/** An Arabic word with and without its article and the one-letter words written onto it (و، ب، ل، ف). */
const arabicForms = (w: string): string[] => {
  const bare = w.replace(/^(?:و|ف)?(?:ب|ل)?(?:ال|لل)?(?=[ء-ي]{2,})/, '')
  return [...new Set([w, bare, ...['ال', 'و', 'وال', 'ب', 'بال', 'ل', 'لل', 'ف', 'فال'].map((p) => p + bare)])]
}
/** The phrases a question quotes («great fish», “the word”, "a phrase"), each as its words. */
export function quotedPhrases(q: string): string[][] {
  return [...q.matchAll(/[«“"]([^«»“”"]{2,80})[»”"]/g)].map((m) => m[1]!.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))).filter((p) => p.length > 0)
}
/** A best verse that holds this much of the rarity of the question's words fits well (pipeline.ts: the verses are the answer). */
export const GOOD_COVERAGE = 0.75
/** What a search looked for and what its best verse holds, by the question's words. */
export type Strength = {
  full: boolean; coverage: number; matched: string[]; missing: string[]
  /** the rarest word the pack has (a one-word search to suggest), else the longest */
  rarest: string | null
}
type Looked = { label: string; term: Term }
/** The terms of a question in a pack: each word with its other forms, its English (in the English pack), the article it names. */
function termsFor(kw: string[], phrases: string[][], pl: string, packLang: string, m: Map<string, string[]>): Looked[] {
  const inPhrase = new Set(phrases.flat().map((w) => fold(w)))
  const out: Looked[] = phrases.map((p) => ({ label: p.join(' '), term: { phrases: [p] } }))
  for (const w of kw) {
    if (inPhrase.has(fold(w))) continue
    // a word with an English translation ("mar" -> "sea") is looked for in English only as its translation ("mar" would match
    // "married"); in a question answered from the English pack (French: no pack), as written too ("avalé" -> "swallow", "lion")
    const english = pl === 'en' ? toEnglish([w], packLang) : []
    const forms = !english.length ? [w] : packLang.split('-')[0] === 'en' ? [...new Set([w, ...english])] : english
    const ar = /[؀-ۿ]/.test(w)
    const term: Term = {
      words: forms,
      forms: ar ? forms.flatMap(arabicForms) : [],
      prefixes: forms.map(stemOf).filter((s): s is string => !!s),
      concepts: (conceptOf(w, m, true) ?? []).filter((id) => id.startsWith('tw:')),
    }
    out.push({ label: w, term })
  }
  return out.slice(0, 8)
}

/**
 * The verses with the question's words, from the packs the search looks in: in each, every verse ranked by the rarity of the
 * words it holds (rankVerses). The first pack whose best verse fits well (every word, or GOOD_COVERAGE of their rarity)
 * answers; otherwise the pack whose best verse holds the most. Up to six verses, one per passage, none much weaker than the best.
 */
async function rankedSearch(kw: string[], phrases: string[][], packLang: string, m: Map<string, string[]>): Promise<{ hits: (Found & { snippet: string })[]; strength: Strength }> {
  let best: { pl: string; looked: Looked[]; ranking: Ranking; s: Strength } | null = null
  for (const pl of await packsFor([...kw, ...phrases.flat()], packLang)) {
    const r = await reader(pl)
    const looked = termsFor(kw, phrases, pl, packLang, m)
    if (!looked.length) continue
    const ranking = await rankVerses(r, looked.map((l) => l.term), { limit: 40, skipRes: SKIP_TEXT, mainRes: MAIN_TEXT })
    const top = ranking.hits[0]
    if (!top) continue
    // a word the pack does not have weighs as much as the rarest word it has: a word of another language, a question word, a
    // name spelled otherwise (none found: as much as a word in one verse)
    const most = Math.max(0, ...ranking.idf) || Math.log(1 + ranking.verses)
    const weight = (i: number) => (ranking.df[i] ? ranking.idf[i]! : most)
    const covered = top.own | top.near
    const total = looked.reduce((n, _, i) => n + weight(i), 0)
    // a word only in the verses either side counts half (a story spreads its names over a few verses)
    const got = looked.reduce((n, _, i) => n + (top.own & (1 << i) ? weight(i) : top.near & (1 << i) ? weight(i) / 2 : 0), 0)
    const s: Strength = {
      full: looked.every((_, i) => top.own & (1 << i)), coverage: total ? got / total : 0,
      matched: looked.filter((_, i) => covered & (1 << i)).map((l) => l.label), missing: looked.filter((_, i) => !(covered & (1 << i))).map((l) => l.label),
      rarest: looked.map((l, i) => ({ l: l.label, w: ranking.df[i] ? ranking.idf[i]! : -1 })).filter((t) => t.w > 0).sort((a, b) => b.w - a.w)[0]?.l ?? null,
    }
    if (!best || s.coverage > best.s.coverage) best = { pl, looked, ranking, s }
    // a verse that fits well: the next packs are not read (English, indexed for a question in Hindi, is 30-45 MB more)
    if (s.full || s.coverage >= GOOD_COVERAGE) break
  }
  if (!best) return { hits: [], strength: { full: false, coverage: 0, matched: [], missing: [...phrases.map((p) => p.join(' ')), ...kw], rarest: [...kw].sort((a, b) => b.length - a.length)[0] ?? null } }
  const { ranking } = best
  const top = ranking.hits[0]!
  const kept: RankedVerse[] = []
  for (const h of ranking.hits) {
    if (h.score < top.score / 2) break
    // found by words its shown text does not have (hi GST has Jonah's words under Matthew 1:16): the verse would not show them
    if (!h.shown && (h.own & ~h.text) === 0) continue
    const all = h.own | h.near
    // one verse per passage: a verse two or three from one already kept, holding nothing it does not, adds nothing
    if (kept.some((k) => k.book === h.book && k.ch === h.ch && Math.abs(k.v - h.v) <= 3 && ((k.own | k.near) & all) === all)) continue
    kept.push(h)
    if (kept.length >= 6) break
  }
  const why = `text:${best.s.matched.join(' ')}`
  const hits = await Promise.all(kept.map(async (h) => {
    const t = await h.more()
    return { book: h.book, ch: h.ch, v: h.v, text: t.text, snippet: t.snippet, why }
  }))
  return { hits: hits.filter((h) => h.text), strength: best.s }
}

/**
 * "What marriage custom is in Ruth?": the book or chapter introduction that holds every word of the question, from the packs the
 * search looks in (in English, the story words in English). Its passage ref ("rut front:intro") and the pack it is in.
 */
export async function introFor(question: string, packLang: string): Promise<{ ref: string; lang: string } | null> {
  const kw = keywords(question)
  if (!kw.length) return null
  const m = await names()
  const en = (booknames as any).BOOK_EN as Record<string, string>
  for (const pl of await packsFor(kw, packLang)) {
    // a book's name in English for the English pack ("Rut" -> "Ruth")
    const words = pl === 'en' ? kw.map((w) => { const c = bookExact(w); return c && en[c] ? en[c]! : w }) : kw
    const terms = termsFor(words, [], pl, packLang, m).map((l) => ({ ...l.term, concepts: [] }))
    const named = kw.map((w) => bookExact(w)).filter((c): c is string => !!c)
    const hit = (await searchIntros(await reader(pl), terms, 1, named))[0]
    if (hit) return { ref: `${hit.book} ${hit.ref}`, lang: pl }
  }
  return null
}

export type HelpHit = {
  kind: 'note' | 'question'; book: string; ch: number; v: number; snippet: string; id: string; lang: string
  /** all the question's words were found (not fewer of them) */
  all?: boolean
}
/** Translation notes and questions that contain the words of a free search, from the same packs as the verses. */
export async function searchHelps(question: string, packLang: string, limit = 4): Promise<HelpHit[]> {
  const words = keywords(question)
  if (!words.length) return []
  for (const pl of await packsFor(words, packLang)) {
    const r = await reader(pl)
    const english = pl === 'en' ? toEnglish(words, packLang) : []
    const tries = [...triesOf(words), ...(english.length ? triesOf([...words.filter((w) => !toEnglish([w], packLang).length), ...english]) : [])]
    for (const [i, ws] of tries.entries()) {
      const all = i === 0 || ws.length === words.length
      const hits = (await searchIndex(r, ws.join(' '), { kinds: ['note', 'question'], limit: 20 })).filter((h) => /^\d+:\d+/.test(h.ref))
      if (!hits.length) continue
      const out: (HelpHit & { more: (typeof hits)[number]['more'] })[] = []
      for (const h of hits) {
        const [ch, v] = parseRef(h.ref)
        if (out.some((o) => o.book === h.book && o.ch === ch && o.v === v && o.kind === h.kind)) continue
        out.push({ kind: h.kind === 'question' ? 'question' : 'note', book: h.book, ch, v, snippet: '', id: '', lang: pl, all, more: h.more })
      }
      // notes first, then questions; the snippets of those kept only (each reads its book)
      const kept = out.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'note' ? -1 : 1)).slice(0, limit)
      return Promise.all(kept.map(async ({ more, ...h }) => { const m = await more(); return { ...h, snippet: m.snippet, id: m.id ?? '' } }))
    }
  }
  return []
}

/**
 * "Who was John the Baptist?", "¿Qué es la gracia?", "Siapa Musa?": when what follows the question words is the name of a
 * Translation Words article, the article (or the articles that share the name) instead of a verse search.
 */
const ASKS: RegExp[] = [
  /^(?:who|what)(?:'s| is| was| were| are)?\s+(?:the\s+|a\s+|an\s+)?(.+)$/i,
  /^(?:tell me about|explain)\s+(?:the\s+)?(.+)$/i,
  /^(?:qui[eé]n(?:es)?|qu[eé]|cu[aá]l)\s+(?:es|era|fue|son|eran|fueron|significa)\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(.+)$/i,
  /^(?:h[aá]blame de|expl[ií]came)\s+(?:el\s+|la\s+|los\s+|las\s+)?(.+)$/i,
  /^(?:qui|que|qu'|qu’)\s*(?:est|était|étaient|sont|signifie)(?:-ce que|-ce qu')?\s+(?:le\s+|la\s+|les\s+|l'|l’)?(.+)$/i,
  /^(?:siapa(?:kah)?|apa(?:kah)?)\s+(?:itu\s+|adalah\s+|arti\s+)?(.+?)(?:\s+itu)?$/i,
  /^(.+?)\s+(?:कौन|क्या)\s+(?:था|थे|थी|है|हैं)$/,
  /^(?:من|ما|ماذا)\s+(?:هو|هي|كان|كانت|هم|يعني)?\s*(.+)$/,
]
/** Whether the question asks about something ("who was…", "¿qué es…?") rather than only naming it ("John the Baptist"). */
export function asksAbout(q: string): boolean {
  const t = q.trim().replace(/[¿?!¡.؟।]+/g, ' ').replace(/\s+/g, ' ').trim()
  return ASKS.some((re) => re.test(t))
}
/** The verses whose words link to an article (a person, a key term), best first. */
export async function versesOf(ids: string[], packLang = 'en'): Promise<Found[]> {
  return byConcepts([ids], [], packLang)
}
export async function articleForQuestion(q: string): Promise<string[] | null> {
  const t = q.trim().replace(/[¿?!¡.؟।]+/g, ' ').replace(/\s+/g, ' ').trim()
  const m = await names()
  for (const re of ASKS) {
    const hit = re.exec(t)
    if (!hit?.[1]) continue
    const k = fold(hit[1]).replace(/[«»"“”']/g, '').replace(/\s+/g, ' ').trim()
    const ids = m.get(k) ?? m.get(k.replace(/^(el|la|los|las|the|le|les|l)\s+/, '')) ?? m.get(k.replace(/^ال/, ''))
      ?? (!k.includes(' ') ? conceptOf(k, m) : null) // one name with a close spelling: Moïse ~ Moses
    if (ids?.length) return ids.filter((id) => id.startsWith('tw:'))
  }
  // the name alone: "John the Baptist", "Juan el Bautista", "gracia" (exact names only, no close spellings)
  const k = fold(t).replace(/[«»"“”']/g, '').replace(/\s+/g, ' ').trim()
  const ids = m.get(k) ?? m.get(k.replace(/^(el|la|los|las|the|le|les|l)\s+/, '')) ?? m.get(k.replace(/^ال/, ''))
  if (ids?.length) return ids.filter((id) => id.startsWith('tw:'))
  return null
}

export async function searchVerses(question: string, term: string | null, packLang: string): Promise<SearchResult> {
  const kw = keywords(question)
  if (term) for (const t of keywords(term)) if (!kw.some((k) => fold(k) === fold(t))) kw.push(t)
  const phrases = quotedPhrases(question)
  const m = await names()
  const concepts: string[] = []
  const seen: string[] = []
  for (const w of kw) {
    const ids = conceptOf(w, m)
    if (ids && !seen.includes(ids.join())) {
      seen.push(ids.join())
      concepts.push(w)
    }
  }
  if (!kw.length && !phrases.length) return { keywords: kw, concepts, hits: [], how: 'none' }
  const { hits, strength } = await rankedSearch(kw, phrases, packLang, m)
  // a word that names an article (a name, a key term): the verses that mention it, whole; else the words in context
  const how = !hits.length ? 'none' : concepts.length && !phrases.length ? 'concepts' : 'text'
  // a list shows the words found in context for a text search, the whole verse for names and key terms
  const shown = hits.map((h) => ({ book: h.book, ch: h.ch, v: h.v, text: how === 'text' ? h.snippet : h.text, full: h.text, why: how === 'text' ? h.why : 'concepts' }))
  return { keywords: kw, concepts, hits: shown, how, strength }
}
