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
    // what to show, not what to look for
    'notes note notas nota translation traduccion traducción traduction terjemahan catatan questions question preguntas pregunta pertanyaan text texto teks texte '
  ).split(/\s+/),
)
// ar
const AR_STOP = new Set('في من على إلى عن ما ماذا من هو هي هل أين متى كيف لماذا أي التي الذي الذين هذا هذه ذلك تلك و أو ثم مع عند كان كانت يكون آية الآية آيات الكتاب المقدس سفر أصحاح الأصحاح يتحدث تتحدث يقول تقول قصة أرني أظهر ملاحظات ملاحظة الترجمة أسئلة نص'.split(' ').map((w) => fold(w)))
const HI_STOP = new Set('टिप्पणी टिप्पणियाँ टिप्पणियां अनुवाद प्रश्न पाठ में का की के है हैं था थे कौन कौन-सा किस किसमें कहाँ कब क्या कैसे और या से पर को ने यह वह पद पदों बाइबल अध्याय बात बारे कहता कहते बताता'.split(' '))

/** The content words of a question, longest first within the question order (names usually survive). */
export function keywords(q: string): string[] {
  const toks = q
    .replace(/[«»"“”‘’'?¿!¡.,;:()\-]/g, ' ')
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
  return t ? textOfRange(model.book, t.pieces as any, t.events as any, from, to) : ''
}
const parseRef = (ref: string): [number, number] => {
  const m = /^(\d+):(\d+)/.exec(ref)
  return m ? [Number(m[1]), Number(m[2])] : [0, 0]
}

/** Verses where the word links hold every concept (or as many as possible), from the English pack (it has every book). */
async function byConcepts(groups: string[][], words: string[], packLang = 'en'): Promise<Found[]> {
  const roots = words.map((w) => fold(w)).filter((w) => w.length >= 3).map((w) => w.slice(0, Math.min(6, Math.max(3, w.length - 2))))
  const textHits = (t: string) => { const toks = fold(t).split(/[^\p{L}]+/u); return roots.filter((r) => toks.some((x) => x.startsWith(r))).length }
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
    // the words of a question in Spanish can match the Spanish text, when the Spanish pack has the book
    let local: BookModel | undefined
    if (packLang !== 'en' && roots.length) {
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
      const text = verseText(model, from, from)
      const texts = [...model.texts, ...(local?.texts ?? [])]
      const tx = roots.length ? textHits(texts.map((t) => textOfRange(model.book, t.pieces as any, t.events as any, from, from)).join(' ')) : 0
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
async function byText(words: string[], packLang: string): Promise<Found[]> {
  const tries: string[][] = [words]
  const longest = [...words].sort((a, b) => b.length - a.length)
  if (words.length > 2) tries.push(longest.slice(0, 2))
  if (words.length > 1) tries.push(longest.slice(0, 1))
  for (const pl of packLang === 'en' ? ['en'] : [packLang, 'en']) {
    const { r } = await lang(pl)
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
