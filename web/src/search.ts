// Open questions ("in which verse does Abraham sacrifice Isaac?"): the question's content words -> verses.
// 1) Words that name a Translation Words article (names and key terms, in any of the five languages) become concepts; the verses
//    whose word links hold all of them are found through the common map (books) and each book's links (verses). Works whatever
//    language the question is in. 2) Otherwise, full-text search of the installed texts, dropping common words before names.
import type { BookModel, HelpRow } from '@bt-synergy/language-pack-v3'
import { textOfRange } from '@lpc/query/passage'
import glossary from './data/kt-glossary.json'
import booknames from './data/booknames.json'
import books from './data/books.json'
import { installedLangs, openLang } from './packs'
import { fold } from './sheet'
import storyWords from './data/story-words.json'

/** Common story words of a question in English ("mar" -> "sea"), to match the English text when the language's pack lacks the book. */
const LEX = storyWords as unknown as Record<string, Record<string, string>>
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
    'notes note notas nota translation traduccion traducción traduction terjemahan catatan questions question preguntas pregunta pertanyaan text texto teks texte '
  ).split(/\s+/),
)
// ar
const AR_STOP = new Set('أسفار الأسفار يرد ترد في من على إلى عن ما ماذا من هو هي هل أين متى كيف لماذا أي التي الذي الذين هذا هذه ذلك تلك و أو ثم مع عند كان كانت يكون آية الآية آيات الكتاب المقدس سفر أصحاح الأصحاح يتحدث تتحدث يقول تقول قصة أرني أظهر ملاحظات ملاحظة الترجمة أسئلة نص'.split(' ').map((w) => fold(w)))
const HI_STOP = new Set('किन पुस्तकों किताबों पुस्तकें किताबें टिप्पणी टिप्पणियाँ टिप्पणियां अनुवाद प्रश्न पाठ में का की के है हैं था थे कौन कौन-सा किस किसमें कहाँ कब क्या कैसे और या से पर को ने यह वह पद पदों बाइबल अध्याय बात बारे कहता कहते बताता'.split(' '))

/** The content words of a question, longest first within the question order (names usually survive). */
export function keywords(q: string): string[] {
  const toks = q
    .replace(/[«»"“”‘’'?¿!¡.,;:()\-؟،؛।]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const out: string[] = []
  for (const t of toks) {
    const f = fold(t)
    if (/^\d+$/.test(f) || f.length < 3 || STOP.has(f) || HI_STOP.has(t) || AR_STOP.has(f) || AR_STOP.has(f.replace(/^(ال|و|ب|ل)/, ''))) continue
    if (!out.includes(t)) out.push(t)
  }
  return out.slice(0, 6)
}

type Lang = { r: Awaited<ReturnType<typeof openLang>>; maps: any }
const opened = new Map<string, Promise<Lang>>()
const lang = (l: string) => {
  if (!opened.has(l)) opened.set(l, openLang(l).then(async (r) => ({ r, maps: await r.maps() })))
  return opened.get(l)!
}

/** name -> Translation Words ids, from the pack's article names (en, es) and the key-term glossary (fr, id, hi). */
let NAMES: Map<string, string[]> | null = null
/** After a language is added or removed. */
export function resetSearch() {
  opened.clear()
  NAMES = null
}
async function names(): Promise<Map<string, string[]>> {
  if (NAMES) return NAMES
  const m = new Map<string, string[]>()
  const put = (k: string, id: string) => {
    if (k.length >= 3 && !m.get(k)?.includes(id)) m.set(k, [...(m.get(k) ?? []), id])
  }
  // "John (the Baptist)": both "john" and "john the baptist"
  const add = (n: string, id: string) => {
    put(fold(n.replace(/\(.*?\)/g, ' ')).replace(/\s+/g, ' ').trim(), id)
    if (/\(/.test(n)) put(fold(n.replace(/[()]/g, ' ')).replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim(), id)
  }
  for (const pl of await installedLangs()) {
    try {
      const { maps } = await lang(pl)
      for (const [id, ns] of Object.entries<string[]>(maps.map?.core?.names ?? {}))
        if (id.startsWith('tw:')) for (const n of ns) for (const part of String(n).split(/,\s*/)) add(part, id)
    } catch {}
  }
  for (const [id, byLang] of Object.entries(glossary as Record<string, Record<string, string[]>>))
    for (const ns of Object.values(byLang)) for (const n of ns) add(n, id)
  // People named like books, in every language of the book table: Jonas, Yunus, योना -> Jonah (tw:names/jonah)
  const en = (booknames as any).BOOK_EN as Record<string, string>
  for (const table of Object.values(books as Record<string, Record<string, string>>))
    for (const [name, code] of Object.entries(table)) {
      const ids = m.get(fold(en[code] ?? ''))?.filter((id) => id.startsWith('tw:names/'))
      if (ids?.length && !/\d/.test(name)) for (const id of ids) add(name, id)
    }
  return (NAMES = m)
}
/** A word's concept: exact name, or the name without a plural or verb ending (sacrifica -> sacrificio is too far; sacrifices -> sacrifice works). */
function conceptOf(word: string, m: Map<string, string[]>): string[] | null {
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
    if (i >= Math.max(5, Math.min(f.length, k.length) - 3) && i > bestLen) {
      best = k
      bestLen = i
    }
  }
  return best ? m.get(best)! : null
}

export type Found = { book: string; ch: number; v: number; text: string; why: string }
export type SearchResult = { keywords: string[]; concepts: string[]; hits: Found[]; how: 'concepts' | 'text' | 'none' }

const BOOKS: string[] = Object.keys((booknames as any).BOOK_EN).filter((c) => c !== 'obs')
const verseText = (model: BookModel, from: number, to: number): string => {
  const t = model.texts.find((x) => /\/(ult|glt)$/.test(x.res)) ?? model.texts.find((x) => /\/bsb$/.test(x.res)) ?? model.texts[0]
  return t ? textOfRange(model.book, t.pieces as any, t.events as any, from, to).replace(/[{}]/g, '') : ''
}
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
  const { r, maps } = await lang('en')
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
        const lr = (await lang(packLang)).r
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
      const localText = local ? verseText(local, from, from) : ''
      const text = localText && !wrongScript(packLang, localText) ? localText : verseText(model, from, from)
      const texts = [...model.texts, ...(local?.texts ?? [])]
      const read = (ts: typeof texts) => ts.map((t) => textOfRange(model.book, t.pieces as any, t.events as any, from, from)).join(' ')
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
async function packsFor(words: string[], packLang: string): Promise<string[]> {
  const PACK: Record<string, string> = { es: 'es-419', id: 'id', hi: 'hi', ar: 'ar' }
  const fromWords = Object.entries(LEX).filter(([k, t]) => k !== '_' && words.some((w) => t[fold(w)])).map(([k]) => PACK[k]).filter((x): x is string => !!x)
  const have = await installedLangs()
  return [...new Set([packLang, ...fromWords, 'en'])].filter((l) => have.includes(l))
}
/** All words together first, then the two longest, then the longest. */
const triesOf = (words: string[]): string[][] => {
  const longest = [...words].sort((a, b) => b.length - a.length)
  return [words, ...(words.length > 2 ? [longest.slice(0, 2)] : []), ...(words.length > 1 ? [longest.slice(0, 1)] : [])]
}

async function byText(words: string[], packLang: string): Promise<Found[]> {
  for (const pl of await packsFor(words, packLang)) {
    const { r } = await lang(pl)
    // in English, the words as written and their English for the story words ("pez" -> "fish")
    const english = pl === 'en' ? toEnglish(words, packLang) : []
    const tries = [...triesOf(words), ...(english.length ? triesOf([...words.filter((w) => !toEnglish([w], packLang).length), ...english]) : [])]
    for (const ws of tries) {
      const ans = await r.search(ws.join(' '), { kinds: ['text'], limit: 30 })
      const hits = (ans.data ?? []).filter((h) => /\/(ult|glt|bsb)$/.test(h.res))
      if (!hits.length) continue
      const seen = new Set<string>()
      const out: Found[] = []
      for (const h of hits) {
        const key = `${h.book} ${h.ref}`
        if (seen.has(key)) continue
        seen.add(key)
        const [ch, v] = parseRef(h.ref)
        out.push({ book: h.book, ch, v, text: h.snippet, why: `text:${ws.join(' ')}` })
        if (out.length >= 6) break
      }
      return out
    }
  }
  return []
}

export type HelpHit = { kind: 'note' | 'question'; book: string; ch: number; v: number; snippet: string; id: string; lang: string }
/** Translation notes and questions that contain the words of a free search, from the same packs as the verses. */
export async function searchHelps(question: string, packLang: string, limit = 4): Promise<HelpHit[]> {
  const words = keywords(question)
  if (!words.length) return []
  for (const pl of await packsFor(words, packLang)) {
    const { r } = await lang(pl)
    const english = pl === 'en' ? toEnglish(words, packLang) : []
    const tries = [...triesOf(words), ...(english.length ? triesOf([...words.filter((w) => !toEnglish([w], packLang).length), ...english]) : [])]
    for (const ws of tries) {
      const ans = await r.search(ws.join(' '), { kinds: ['note', 'question'], limit: 20 })
      const hits = (ans.data ?? []).filter((h) => /^\d+:\d+/.test(h.ref))
      if (!hits.length) continue
      const out: HelpHit[] = []
      for (const h of hits) {
        const [ch, v] = parseRef(h.ref)
        if (out.some((o) => o.book === h.book && o.ch === ch && o.v === v && o.kind === h.kind)) continue
        out.push({ kind: h.kind === 'question' ? 'question' : 'note', book: h.book, ch, v, snippet: h.snippet, id: h.id ?? '', lang: pl })
      }
      // notes first, then questions
      return out.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'note' ? -1 : 1)).slice(0, limit)
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
  const m = await names()
  const groups: string[][] = []
  const concepts: string[] = []
  for (const w of kw) {
    const ids = conceptOf(w, m)
    if (ids && !groups.some((g) => g.join() === ids.join())) {
      groups.push(ids)
      concepts.push(w)
    }
  }
  const others = kw.filter((w) => !concepts.includes(w) && !(conceptOf(w, m) ?? []).length)
  if (groups.length >= 1) {
    let hits = await byConcepts(groups, others, packLang)
    // other words in a language with no pack cannot match the English text: fall back to the verses of the names alone
    if (!hits.length && groups.length === 1) hits = await byConcepts(groups, [])
    if (hits.length) return { keywords: kw, concepts, hits, how: 'concepts' }
  }
  const hits = kw.length ? await byText(kw, packLang) : []
  return { keywords: kw, concepts, hits, how: hits.length ? 'text' : 'none' }
}
