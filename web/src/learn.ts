// Learning to translate (Fase 2e, Abel, Nov 16): a path through the Translation Academy manuals, in their own order, one short
// article at a time. No new content: the articles of the packs on the phone. It works like the light path through a book
// (graph.ts Path): each article on it says where it is ("Learning · Introduction · 2 of 8"), offers the next one first and a
// verse whose note cites it ("Try it on a verse"); an answer off it offers one tap back; the Map has "Continue the lessons".
// Proposed, never imposed: anything can be asked any time. No DOM here (welcome.ts draws the choice), so it is tested under bun.
import { CANON, installedLangs, openLang } from './packs'
import { manualArticles, manualSections, type Manual, XT } from './explore'
import type { Sheet } from './answer'
import type { ConvState, Reply } from './pipeline'
import { MAX_FOLLOW } from './converse'
import { bookShown } from './firstuse'

/** Where a learning path starts: the Introduction manual, the topics that trip people up most, the Checking manual. */
export type LearnKind = 'intro' | 'trips' | 'translate' | 'checking'
/** A learning path in a conversation (kept in its graph): the kind, the article it is on (and its title), the pack it reads. */
export type Learn = { kind: LearnKind; at: string; title: string; lang: string }
/** The two answers of the welcome ("Have you translated before?", "Have you studied translation?"): 0 no, 1 a little, 2 yes. */
export type Answer = 0 | 1 | 2
export type Level = 'new' | 'some' | 'experienced'

/** Never translated (and studied it a little at most): new; then up to one "yes" or two "a little": some experience; more: experienced. */
export function levelOf(before: Answer, studied: Answer): Level {
  if (before === 0 && studied <= 1) return 'new'
  return before + studied <= 2 ? 'some' : 'experienced'
}
export const START: Record<Level, LearnKind> = { new: 'intro', some: 'trips', experienced: 'checking' }
/** When a pack lacks the manual a path starts with: the next one that exists. */
const NEXT_KIND: Record<LearnKind, LearnKind[]> = {
  intro: ['intro', 'translate', 'checking'], trips: ['trips', 'translate', 'checking'], translate: ['translate', 'checking'], checking: ['checking', 'translate'],
}

// The manuals' own order (unfoldingWord en_ta v88 intro/toc.yaml and checking/toc.yaml; the Translate manual's is
// data/ta-sections.json, through explore.ts manualSections). An article a pack has that these do not list goes after, by title.
export const ORDER: Record<'intro' | 'checking', string[]> = {
  intro: ['ta-intro', 'translate-why', 'uw-intro', 'statement-of-faith', 'translation-guidelines', 'open-license', 'gl-strategy', 'finding-answers'],
  checking: ['intro-checking', 'intro-check', 'goal-checking', 'authority-process', 'peer-check', 'team-oral-chunk-check', 'important-term-check',
    'trans-note-check', 'language-community-check', 'other-methods', 'clear', 'natural', 'acceptable', 'community-evaluation', 'church-leader-check',
    'accuracy-check', 'good', 'alignment-tool', 'vol2-steps', 'vol2-things-to-check', 'level3-questions', 'level3-approval', 'vol2-backtranslation',
    'vol2-backtranslation-purpose', 'vol2-backtranslation-who', 'vol2-backtranslation-kinds', 'vol2-backtranslation-written',
    'vol2-backtranslation-guidelines', 'formatting', 'alphabet', 'spelling', 'punctuation', 'complete', 'verses', 'headings', 'publishing', 'self-assessment'],
}
/**
 * The topics that most often trip people up (metaphor, names, implicit information, key terms), each with the articles tried in
 * order until the pack has one (the Indonesian pack has no "Translating key terms": the Checking manual's "Key terms check").
 */
export const TRIPS: string[][] = [
  ['ta:translate/figs-metaphor', 'ta:translate/figs-simile'],
  ['ta:translate/translate-names', 'ta:translate/translate-transliterate'],
  ['ta:translate/figs-explicit', 'ta:translate/figs-explicitinfo'],
  ['ta:translate/translate-key-terms', 'ta:checking/important-term-check', 'ta:translate/translate-terms'],
]

/** One article of a path: its id, its title in the pack, and the part of the path it is in (a manual, or the difficult topics). */
export type Step = { id: string; title: string; part: LearnKind }

async function inOrder(lang: string, m: 'intro' | 'checking'): Promise<{ id: string; title: string }[]> {
  const list = await manualArticles(lang, m)
  const at = (id: string) => {
    const i = ORDER[m].indexOf(id.slice(`ta:${m}/`.length))
    return i < 0 ? Infinity : i
  }
  // (manualArticles sorts by title: the stable sort keeps that order for the ones not listed)
  return [...list].sort((a, b) => at(a.id) - at(b.id))
}
const translateOrder = async (lang: string, ui: string) => (await manualSections(lang, 'translate', ui)).flatMap((g) => g.items)

const SEQS = new Map<string, Promise<Step[]>>()
/** The articles of a path in a pack, in order (empty when the pack has none of them). Read once per pack. */
export function learnSeq(kind: LearnKind, lang: string): Promise<Step[]> {
  const key = `${kind}|${lang}`
  let p = SEQS.get(key)
  if (!p) {
    p = makeSeq(kind, lang).catch(() => [])
    p.then((s) => { if (!s.length && SEQS.get(key) === p) SEQS.delete(key) })
    SEQS.set(key, p)
  }
  return p
}
async function makeSeq(kind: LearnKind, lang: string): Promise<Step[]> {
  const as = (part: LearnKind) => (a: { id: string; title: string }): Step => ({ id: a.id, title: a.title, part })
  if (kind === 'intro' || kind === 'checking') return (await inOrder(lang, kind)).map(as(kind))
  const tr = (await translateOrder(lang, 'en')).map(as('translate'))
  if (kind === 'translate') return tr
  // the difficult topics first (each the first article the pack has), then the rest of the Translate manual in its order
  const has = new Map<string, string>()
  for (const m of ['translate', 'checking'] as const) for (const a of await manualArticles(lang, m)) has.set(a.id, a.title)
  const trips: Step[] = []
  for (const group of TRIPS) {
    const id = group.find((x) => has.has(x))
    if (id) trips.push({ id, title: has.get(id)!, part: 'trips' })
  }
  if (!trips.length) return []
  const taken = new Set(trips.map((s) => s.id))
  return [...trips, ...tr.filter((s) => !taken.has(s.id))]
}

/**
 * Where a path for this level starts, with the packs in `packs` (the person's own language first): in that language, its kind
 * or the next manual that exists there; only then another pack. The pack it reads and its first article; null when no pack has
 * any of them.
 */
export async function startOf(kind: LearnKind, packs: string[]): Promise<{ learn: Learn; first: Step } | null> {
  for (const lang of packs) {
    for (const k of NEXT_KIND[kind]) {
      const seq = await learnSeq(k, lang)
      if (seq[0]) return { learn: { kind: k, at: seq[0].id, title: seq[0].title, lang }, first: seq[0] }
    }
  }
  return null
}

// ---------------------------------------------------------------------------------------------------------- a verse to try
/** Books tried first for a verse that shows an article (short, and in most packs), then the rest in Bible order. */
const PREFER = ['rut', 'jon', 'tit', 'mrk', 'jhn', 'act', 'mat', 'luk', 'gen', 'rom', 'eph', 'php', 'col', 'jas', '1pe', '2pe', '3jn', 'phm']
/** At most this many books are read for one article (a phone reads a book in a fraction of a second). */
const MAX_BOOKS = 6
const VERSES = new Map<string, Promise<{ ref: string; lang: string } | null>>()
/**
 * A verse whose note cites the article, in a book of the packs on the phone (`packs`, in order), or null: from the map of which
 * books' notes cite it (the whole Bible), then the notes of a few of those books.
 */
export function tryVerse(id: string, packs: string[]): Promise<{ ref: string; lang: string } | null> {
  const key = `${id}|${packs.join(',')}`
  let p = VERSES.get(key)
  if (!p) {
    p = findVerse(id, packs).catch(() => null)
    VERSES.set(key, p)
  }
  return p
}
async function findVerse(id: string, packs: string[]): Promise<{ ref: string; lang: string } | null> {
  let read = 0
  for (const lang of packs) {
    const r = await openLang(lang).catch(() => null)
    if (!r) continue
    const cites = ((await r.maps()) as any)?.xmap?.core?.notes?.rows?.get(id) as Map<string, number[]> | undefined
    const books = [...new Set([...PREFER, ...CANON])].filter((b) => r.installed(`book:${b}`) && (!cites || (cites.get(b)?.[0] ?? 0) > 0))
    for (const b of books) {
      if (read++ >= MAX_BOOKS) return null
      const m: any = await r.book(b).catch(() => null)
      const row = ((m?.notes?.rows ?? []) as any[]).find((x) => x.concept === id && !(x.cols?.isIntro === true || x.cols?.isIntro === 'true') && x.from % 1000 > 0)
      if (row) return { ref: `${b} ${Math.floor(row.from / 1000) % 1000}:${row.from % 1000}`, lang }
    }
  }
  return null
}

// ------------------------------------------------------------------------------------------------------------- the words
type W = { mark: string; trips: string; next: string; tryIt: string; back: string; resume: string }
const STR: Record<string, W> = {
  en: { mark: 'Learning · {part} · {n} of {m}', trips: 'Common difficulties', next: 'Next: {title}', tryIt: 'Try it on a verse: {ref}',
    back: 'Back to the lessons: {title}', resume: 'Continue the lessons: {title}' },
  es: { mark: 'Aprendiendo · {part} · {n} de {m}', trips: 'Dificultades frecuentes', next: 'Siguiente: {title}', tryIt: 'Pruébalo en un versículo: {ref}',
    back: 'Volver a las lecciones: {title}', resume: 'Seguir las lecciones: {title}' },
  fr: { mark: 'Apprendre · {part} · {n} sur {m}', trips: 'Difficultés fréquentes', next: 'Suivant : {title}', tryIt: 'Essayer sur un verset : {ref}',
    back: 'Revenir aux leçons : {title}', resume: 'Continuer les leçons : {title}' },
  id: { mark: 'Belajar · {part} · {n} dari {m}', trips: 'Kesulitan yang sering muncul', next: 'Berikutnya: {title}', tryIt: 'Coba pada sebuah ayat: {ref}',
    back: 'Kembali ke pelajaran: {title}', resume: 'Lanjutkan pelajaran: {title}' },
  hi: { mark: 'सीखना · {part} · {m} में से {n}', trips: 'आम कठिनाइयाँ', next: 'आगे: {title}', tryIt: 'किसी पद पर आज़माएँ: {ref}',
    back: 'पाठों पर लौटें: {title}', resume: 'पाठ जारी रखें: {title}' },
  ar: { mark: 'التعلّم · {part} · {n} من {m}', trips: 'صعوبات شائعة', next: 'التالي: {title}', tryIt: 'جرّبه على آية: {ref}',
    back: 'العودة إلى الدروس: {title}', resume: 'متابعة الدروس: {title}' },
}
export const LT = (ui: string): W => STR[ui] ?? STR.en!
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? '')
/** The name of a part of a path: the manual's name in Browse, or "Common difficulties". */
export const partName = (ui: string, part: LearnKind): string => (part === 'trips' ? LT(ui).trips : XT(ui).manuals[part as Manual][0])
/** "Learning · Introduction · 2 of 8": where an article is in its part of the path. */
export function learnMark(ui: string, seq: Step[], i: number): string {
  const part = seq[i]!.part
  const same = seq.filter((s) => s.part === part)
  return fill(LT(ui).mark, { part: partName(ui, part), n: String(same.indexOf(seq[i]!) + 1), m: String(same.length) })
}
/** "Continue the lessons: Metaphor" (the Map's row) and "← Back to the lessons: Metaphor" (under an answer off the path). */
export function learnLabel(ui: string, l: Learn, kind: 'back' | 'resume'): string {
  const t = fill(LT(ui)[kind], { title: l.title })
  return kind === 'back' ? `${ui === 'ar' ? '→' : '←'} ${t}` : t
}

const article = (id: string, lang: string): Sheet =>
  ({ id: `f${Date.now()}`, intent: 'article', concept: id, lang, ref: null, what: [], version: null, term: null, phrase: null, candidates: null })
/** The article a path is on, as a call sheet (the Map's "Continue the lessons", the way back). */
export const learnSheet = (l: Learn): Sheet => article(l.at, l.lang)

/**
 * The learning path after an answer: an article of the path moves it there, says where it is and offers the next article first,
 * then a verse whose note cites it; an answer off it (a passage, another article) offers one tap back, unless the answer already
 * has a way back to a book's path. Kept in the conversation's graph.
 */
export async function learnStep(c: ConvState, done: { reply: Reply; answered: string; concept: string | null }, sheet: Sheet, ui: string): Promise<void> {
  const g = c.graph
  const L = g?.learn
  if (!g || !L) return
  const reply = done.reply
  const seq = await learnSeq(L.kind, L.lang)
  const id = sheet.intent === 'article' ? done.concept ?? sheet.concept : null
  const i = id ? seq.findIndex((s) => s.id === id) : -1
  if (i >= 0) {
    const s = seq[i]!
    g.learn = { ...L, at: s.id, title: s.title }
    reply.pathMark = learnMark(ui, seq, i)
    const steps: NonNullable<Reply['follow']> = []
    const nx = seq[i + 1]
    if (nx) steps.push({ label: fill(LT(ui).next, { title: nx.title }), sheet: article(nx.id, L.lang), pathNext: true })
    const v = await tryVerse(s.id, [...new Set([L.lang, ...(await installedLangs().catch(() => []))])])
    if (v) {
      const [code, cv] = v.ref.split(' ')
      steps.push({ label: fill(LT(ui).tryIt, { ref: `${bookShown(ui, code!)} ${cv}` }),
        sheet: { ...article('', v.lang), intent: 'passage', concept: null, ref: v.ref, what: ['text', 'notes'] } })
    }
    const dup = (f: { sheet?: Sheet }) => !!f.sheet && steps.some((x) => x.sheet!.intent === f.sheet!.intent && x.sheet!.concept === f.sheet!.concept && x.sheet!.ref === f.sheet!.ref)
    reply.follow = [...steps, ...(reply.follow ?? []).filter((f) => !dup(f))].slice(0, MAX_FOLLOW)
    return
  }
  // (not under a step of a book's path, nor where there is already a way back to one)
  if (reply.pathMark || reply.pathBack || done.answered === 'edge' || done.answered === 'nopack') return
  reply.pathBack = { label: learnLabel(ui, L, 'back'), sheet: learnSheet(L), toPath: true }
}

/** Tests and a change of packs: read the paths again. */
export function resetLearn() {
  SEQS.clear()
  VERSES.clear()
}
