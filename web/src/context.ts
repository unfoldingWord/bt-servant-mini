// What online AI is given (Abel, Nov 15, phase 2b: "the graph is a good tool so the model reuses only what is really relevant
// to the branch it is on"). The conversation's points are notes and the packs already link them (passage -> its key terms,
// note -> its Translation Academy article, article -> related ones), as in a linked-notes app. Before the call, code chooses,
// within the service's limit (MAX_CONTEXT, worker/wrangler.toml), in this order of priority:
//   1. the current path: the point and its ancestors (label and compact sheet of each);
//   2. the current point's helps (what the phone found); of an article, only the sections the question needs;
//   3. one link away (the Academy articles its notes cite, its key terms, related articles), ranked by likeness to the
//      question, and only those that share a word with it;
//   4. points of other branches (or too far up for the history) that share something with the question: the same word, the
//      same passage, as backlinks do. Nothing unrelated.
// The worker's contract is unchanged: one `helps` string, the history and the sources. No DOM here: tested under bun.
import type { GNode, Graph } from './graph'
import { focusWords, hits, unfold } from './focus'

/** The online service cuts the helps it is sent to this size (MAX_CONTEXT in worker/wrangler.toml). */
export const MAX_CONTEXT = 9500

// ------------------------------------------------------------------------------------------------- what the question asks

/** How to translate it (strategies, suggestions), what it is (description, definition), or anything else. */
export type Ask = 'how' | 'what' | 'other'
const HOW = new RegExp([
  'translat', 'tradu', 'menerjemah', 'terjemah', 'अनुवाद', 'ترجم',
  // "what do I do when…", "how do I say…": a translator's how, without the word
  'what (?:do|should|can) (?:i|we) do', 'how (?:do|can|should|could) (?:i|we|you) (?:say|express|handle|deal|render|write)',
  'qu[eé] (?:hago|hacemos|debo hacer)', 'c[oó]mo (?:digo|decimos|expreso|expresamos|manejo)', 'que (?:faire|dois-je faire)', 'comment (?:dire|exprimer)',
  'apa yang (?:harus|perlu) (?:saya|kami|kita) (?:lakukan|buat)', 'bagaimana (?:mengatakan|mengungkapkan)', 'क्या करूँ', 'क्या करें', 'कैसे कहें', 'ماذا (?:أفعل|نفعل)', 'كيف (?:أقول|نقول|أعبر)',
].join('|'), 'iu')
const WHAT = new RegExp([
  '^\\W*(?:what|who) (?:is|are|was|were)\\b', 'what does .+ mean', 'meaning of', '\\bdefin', 'tell me about',
  '^\\W*(?:qu[eé]|qui[eé]n) (?:es|son|era|eran)\\b', 'qu[eé] (?:significa|quiere decir)', 'significado', '\\bh[aá]blame de',
  "qu['’]est-ce", 'que (?:veut dire|signifie)', 'qui (?:est|sont|était)', 'signification',
  '^\\W*apa (?:itu|arti|maksud)', '^\\W*siapa(?:kah)? ', '\\bartinya\\b', '\\bpengertian\\b',
  'क्या है', 'क्या हैं', 'कौन था', 'कौन है', 'का अर्थ', 'का मतलब', 'परिभाषा',
  '^\\W*(?:ما|من) (?:هو|هي|هم)(?=\\s|$)', 'ما معنى', 'ماذا يعني', 'ماذا تعني', 'تعريف',
].join('|'), 'iu')
export const askOf = (q: string): Ask => (HOW.test(q) ? 'how' : WHAT.test(q) ? 'what' : 'other')

// ------------------------------------------------------------------------------------------------------- article sections

export type Section = { sid: string; role: string; level: number; title?: string; md: string; lang?: string }
export type Art = { id: string; title: string; sections: Section[] }
/** A section's kind: the pack's role, else read from its heading; `applied` is Academy's "Examples of … Strategies Applied". */
export type Kind = 'intro' | 'definition' | 'description' | 'facts' | 'translation-suggestions' | 'examples' | 'strategies' | 'applied'
  | 'reason' | 'bible-references' | 'word-data' | 'unknown'

const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[ـ]/g, '').toLowerCase().trim()
/**
 * Section headings in the six languages, folded (no accents; no Hindi vowel signs, Arabic short vowels or shadda), for the
 * packs whose sections say `unknown` (id, hi, ar today, and Academy's checking/process/intro manuals). Applied first: its
 * heading also says "strategies".
 */
const HEADINGS: [Kind, string[]][] = [
  ['applied', ['strategies applied', 'strategy applied', 'estrategias de traduccion aplicadas', 'estrategias aplicadas', 'strategies appliquees',
    'strategies de traduction appliquees', 'penerapan strategi', 'strategi penerjemahan yang diterapkan', 'लागू की गई', 'रणनीतियों के प्रयोग', 'रणनीतियों का प्रयोग',
    'المطبقة', 'المطبّقة']],
  ['strategies', ['translation strategies', 'translation strategy', 'estrategias de traduccion', 'estrategia de traduccion', 'strategies de traduction',
    'strategie de traduction', 'strategi penerjemahan', 'strategi terjemahan', 'अनुवाद की रणनीति', 'अनुवाद रणनीति', 'استراتيجيات الترجمة', 'استراتيجية الترجمة']],
  ['translation-suggestions', ['translation suggestions', 'sugerencias de traduccion', 'suggestions de traduction', 'saran penerjemahan', 'saran terjemahan',
    'अनुवाद के सुझाव', 'अनुवाद सुझाव', 'اقتراحات للترجمة', 'اقتراحات الترجمة']],
  ['definition', ['definition', 'definicion', 'definisi', 'परिभाषा', 'التعريف']],
  ['description', ['description', 'descripcion', 'deskripsi', 'विवरण', 'वर्णन', 'الوصف']],
  ['reason', ['reason this is a translation', 'reasons this is a translation', 'razon por la', 'razones por la', 'raison pour', 'raisons pour',
    'mengapa ini menjadi', 'कारण यह', 'اسباب كون', 'سبب كون']],
  ['bible-references', ['bible references', 'referencias biblicas', 'references bibliques', 'referensi alkitab', 'बाइबल सन्दर्भ', 'बाइबल संदर्भ', 'مراجع الكتاب', 'الشواهد الكتابية']],
  ['word-data', ['word data', 'datos de esta palabra', 'donnees du mot', 'data kata', 'शब्द तथ्य', 'शब्द डेटा', 'ارقام قاموس', 'بيانات الكلمة']],
  // a heading that is the word alone ("Facts:"), not one that has it ("Patterned Pairs of Facts…")
  ['facts', ['^facts', '^datos', '^faits', '^fakta', '^तथ्य']],
  ['examples', ['examples from the bible', 'ejemplos de la biblia', 'exemples de la bible', 'contoh dari alkitab', 'contoh-contoh dari alkitab',
    'बाइबल से उदाहरण', 'امثلة من الكتاب']],
]
const FOLDED: [Kind, string[]][] = HEADINGS.map(([k, hs]) => [k, hs.map((h) => (h.startsWith('^') ? '^' + fold(h.slice(1)) : fold(h)))])
/** The kind a heading names, or null ("^…": the heading is that word, with at most a colon after it). */
export function headingKind(title: string | undefined): Kind | null {
  const t = fold(title ?? '').replace(/[:：\s]+$/, '')
  if (!t) return null
  for (const [k, hs] of FOLDED) if (hs.some((h) => (h.startsWith('^') ? t === h.slice(1) : t.includes(h)))) return k
  return null
}

/**
 * Each section's kind: the pack's role where it says one (Academy's second `strategies`, or an `examples` headed "… Strategies
 * Applied", is `applied`), else its heading, else the kind of the section it sits under. An Academy article with no
 * strategies found by either is read by position (description → … → strategies → strategies applied: the last two
 * top-level sections).
 */
export function kindsOf(a: Art): Kind[] {
  const out: Kind[] = []
  const top = Math.min(...a.sections.filter((s) => s.role !== 'intro').map((s) => s.level), 99)
  let strategies = 0
  for (const [i, s] of a.sections.entries()) {
    const byHead = headingKind(s.title)
    let k: Kind
    if (s.role && s.role !== 'unknown') {
      k = s.role as Kind
      if (k === 'strategies' && strategies++ > 0) k = 'applied'
      if (k === 'examples' && byHead === 'applied') k = 'applied'
    } else if (byHead) k = byHead
    else {
      // under a section (deeper level): its kind
      let p = i - 1
      while (p >= 0 && a.sections[p]!.level >= s.level) p--
      k = p >= 0 && s.level > top ? out[p]! : 'unknown'
    }
    out.push(k)
  }
  // a heading-read article can name strategies twice (Hindi metaphor: a sub-heading under the reason): the one right before
  // "applied" is the article's, or else the last one
  const st = out.flatMap((k, i) => (k === 'strategies' ? [i] : []))
  if (st.length > 1) {
    const ap = out.indexOf('applied')
    const keep = ap > 0 && out[ap - 1] === 'strategies' ? ap - 1 : st.at(-1)!
    for (const i of st) if (i !== keep && a.sections[i]!.level > top) out[i] = 'unknown'
  }
  if (a.id.startsWith('ta:translate/') && !out.includes('strategies')) {
    const tops = a.sections.flatMap((s, i) => (s.level === top && s.role !== 'intro' ? [i] : []))
    if (tops.length >= 4) {
      if (out[tops.at(-1)!] === 'unknown') out[tops.at(-1)!] = 'applied'
      if (out[tops.at(-2)!] === 'unknown') out[tops.at(-2)!] = 'strategies'
      if (out[tops[0]!] === 'unknown') out[tops[0]!] = 'description'
    }
  }
  return out
}

/** A section with what sits under it (its sub-sections of no other kind: Idiom's "Reasons" sits under its description), as one block. */
function withChildren(a: Art, kinds: Kind[], i: number): Section[] {
  const s = a.sections[i]!
  const out = [s]
  for (let j = i + 1; j < a.sections.length && a.sections[j]!.level > s.level && s.role !== 'intro'; j++) {
    if (kinds[j] !== kinds[i] && kinds[j] !== 'unknown') break
    out.push(a.sections[j]!)
  }
  return out
}
const bodyOf = (s: Section): string => String(s.md ?? '').replace(/^#{1,6} .*\n+/, '').trim()
const clipTo = (t: string, n: number): string => (t.length <= n ? t : t.slice(0, Math.max(0, n)).replace(/\s+\S*$/, '') + ' …')

/**
 * The sections a question needs, each [kind, its blocks] with a share of the room, best first:
 * - how to translate: Academy's strategies and the strategies applied (and a short description); Translation Words' translation
 *   suggestions (and a short definition);
 * - what it is: the description (and what follows it before the next kind) or the definition;
 * - else the article's introduction and first section.
 */
export function pickSections(a: Art, ask: Ask): { kind: Kind; secs: Section[]; max: number }[] {
  const kinds = kindsOf(a)
  const first = (k: Kind) => kinds.indexOf(k)
  const block = (i: number, max: number) => (i < 0 ? null : { kind: kinds[i]!, secs: withChildren(a, kinds, i), max })
  const ta = a.id.startsWith('ta:')
  const lead = first('description') >= 0 ? first('description') : first('definition') >= 0 ? first('definition') : first('intro')
  let picks: ({ kind: Kind; secs: Section[]; max: number } | null)[]
  if (ask === 'how' && ta && first('strategies') >= 0) picks = [block(lead, 600), block(first('strategies'), 2600), block(first('applied'), 3200)]
  else if (ask === 'how' && !ta && first('translation-suggestions') >= 0) picks = [block(lead, 900), block(first('translation-suggestions'), 2400)]
  else if (ask === 'what' && lead >= 0) {
    // the description and the sections right after it that are no other kind ("The Parts of a Metaphor")
    const secs = withChildren(a, kinds, lead)
    for (let j = lead + secs.length; j < a.sections.length && kinds[j] === 'unknown'; j++) secs.push(a.sections[j]!)
    picks = [{ kind: kinds[lead]!, secs, max: 3600 }, ...(ta ? [] : [block(first('facts'), 1200)])]
  } else {
    const i0 = a.sections.findIndex((s) => s.role === 'intro' && bodyOf(s))
    const i1 = a.sections.findIndex((s, i) => i !== i0 && s.role !== 'intro' && bodyOf(s) && !['bible-references', 'word-data'].includes(kinds[i]!))
    picks = [block(i0, 1200), block(i1, 2400)]
    // an Academy article's strategies stay, as the phone's own answer shows them
    if (ta && ask === 'other') picks.push(block(first('strategies'), 1800))
  }
  const out = picks.filter((p): p is NonNullable<typeof p> => !!p && p.secs.some((s) => bodyOf(s)))
  return out.filter((p, i) => out.findIndex((q) => q.secs[0] === p.secs[0]) === i)
}

/** The chosen sections as Markdown ("### Translation Strategies" + text), within `room` characters. */
export function sectionsText(a: Art, ask: Ask, room: number): string {
  const picks = pickSections(a, ask)
  const want = picks.reduce((n, p) => n + p.max, 0)
  const scale = want > room ? room / want : 1
  return picks.map((p) => {
    const text = p.secs.map((s, k) => {
      const t = bodyOf(s)
      const head = s.title?.replace(/[:：\s]+$/, '').trim()
      return head && (k > 0 || t) ? `${'#'.repeat(Math.min(4, 3 + (k ? 1 : 0)))} ${head}\n${t}` : t
    }).filter(Boolean).join('\n\n')
    return clipTo(text, Math.floor(p.max * scale))
  }).join('\n\n')
}

// ------------------------------------------------------------------------------------------------------------- the build

/** A message as main.ts keeps it (only what the context reads). */
export type CMsg = { who: 'me' | 'bot'; text?: string; mark?: boolean; intro?: string | null; info?: string; ai?: { text: string } | null
  ctx?: string; sources?: { id: string; title?: string }[] }
export type HTurn = { role: 'user' | 'assistant'; text: string }
/** Reads an article (its sections) in a language, or null. */
export type ReadArticle = (id: string, lang: string) => Promise<Art | null>

export type Input = {
  /** the question as asked (the label of the turn) */
  question: string
  /** the answer the phone gave, and its point of the graph */
  m: CMsg; msgs: CMsg[]; graph?: Graph; node?: string | null
  /** the passage's context (answer.ts passageContext), when the answer is a passage */
  passage?: string
  /** the pack the answer came from */
  lang: string
  read?: ReadArticle
  max?: number
}
export type Built = { helps: string; history: HTurn[]; sources: { id: string; title?: string }[]
  /** what went in, for the tests and the measure */
  parts: { current: number; passage: number; linked: string[]; backlinks: string[]; path: number } }

const nodeById = (g: Graph | undefined, id: string | null | undefined): GNode | undefined => (id ? g?.nodes.find((n) => n.id === id) : undefined)
function ancestors(g: Graph, id: string): GNode[] {
  const out: GNode[] = []
  for (let x = nodeById(g, id); x && out.length < 50; x = nodeById(g, x.parent)) out.unshift(x)
  return out
}

/** The history online AI gets: the branch this answer is on (its point and up to 3 above it), else the last turns. */
export function historyOf(msgs: CMsg[], graph: Graph | undefined, node: string | null | undefined): { turns: HTurn[]; nodes: string[] } {
  const turns: HTurn[] = []
  const nodes: string[] = []
  const path = graph && node && nodeById(graph, node) ? ancestors(graph, node) : null
  if (path) {
    // the point and up to 3 above it, without the point itself (its question is the one asked now)
    for (const n of path.slice(-4, -1)) {
      const a = msgs[n.msg], q = msgs[n.msg - 1]
      if (a?.who !== 'bot') continue
      turns.push({ role: 'user', text: q?.who === 'me' && !q.mark && q.text ? q.text : n.label })
      turns.push({ role: 'assistant', text: a.ai?.text ?? a.intro ?? '' })
      nodes.push(n.id)
    }
  } else for (const x of msgs.slice(-7, -2)) {
    // (not the divider where the person went back to a point: it is no question)
    if (x.who === 'me' && x.text && !x.mark) turns.push({ role: 'user', text: x.text })
    else if (x.who === 'bot') turns.push({ role: 'assistant', text: x.ai?.text ?? x.intro ?? '' })
  }
  // the service keeps the last 4 turns: the points of the others are not in the history
  const kept = Math.ceil(Math.min(4, turns.length) / 2)
  return { turns, nodes: nodes.slice(-kept) }
}

const sheetLine = (n: GNode): string =>
  [n.kind, n.sheet.ref, n.sheet.concept, n.sheet.what.length ? n.sheet.what.join(', ') : '', n.sheet.term ? `«${n.sheet.term}»` : ''].filter(Boolean).join(' · ')
const placeOf = (ref: string | null | undefined): string | null => /^([0-9a-z]{3}) (\d+)/.exec(ref ?? '')?.slice(1, 3).join(' ') ?? null
/** The paragraphs of an answer that have the question's words (with the heading they sit under), within `room`. */
function excerpt(md: string, stems: string[], room: number): string {
  const paras = unfold(md).split(/\n{2,}/).map((p) => p.trim()).filter((p) => p && !/^\*[^*].*\*$/.test(p))
  const keep = paras.filter((p) => hits(p, stems).length)
  const head = paras.find((p) => /^#{1,3} /.test(p))
  // (its headings as plain lines: under the backlink's own heading they would read as new sections)
  return clipTo([...(head && !keep.includes(head) ? [head] : []), ...(keep.length ? keep : paras.slice(0, 2))].map((p) => p.replace(/^#{1,6} /gm, '')).join('\n\n'), room)
}

/**
 * The helps, history and sources of an online answer. The article the phone found starts the helps with its heading (the
 * service names it from there); the rest follows under headings of their own.
 */
export async function buildContext(i: Input): Promise<Built> {
  const max = i.max ?? MAX_CONTEXT
  const { m, graph } = i
  const node = nodeById(graph, i.node)
  const ask = askOf(i.question)
  const stems = focusWords(i.question, [node?.sheet.term])
  const { turns: history, nodes: inHistory } = historyOf(i.msgs, graph, i.node)
  const sources = (m.sources ?? (m.ctx ? [{ id: m.ctx }] : [])).filter((s) => /^(ta|tw):/.test(s.id))
  const read = i.read
  const parts: Built['parts'] = { current: 0, passage: 0, linked: [], backlinks: [], path: 0 }

  // 1. the path: the point and its ancestors, oldest first (only when there is one above it)
  const path = graph && node ? ancestors(graph, node.id) : []
  const pathText = path.length > 1
    ? clipTo(`# Where this question is in the conversation (oldest first)\n${path.map((n, k) => `${k + 1}. ${n.label} (${sheetLine(n)})${n.id === node!.id ? ' ← this question' : ''}`).join('\n')}`, 700)
    : ''

  // 4. backlinks: points the history does not carry that share a word or the passage with the question
  const here = placeOf(node?.sheet.ref)
  const back: { n: GNode; score: number }[] = []
  for (const n of graph?.nodes ?? []) {
    if (!node || n.id === node.id || inHistory.includes(n.id) || n.msg < 0) continue
    if (n.sheet.concept && n.sheet.concept === node.sheet.concept) continue
    if (n.sheet.ref && n.sheet.ref === node.sheet.ref && !n.sheet.concept) continue
    const named = hits([n.label, n.sheet.term ?? '', n.sheet.concept?.split('/').pop()?.replace(/-/g, ' ') ?? ''].join(' '), stems).length
    const samePlace = !!here && placeOf(n.sheet.ref) === here
    const score = 3 * named + (samePlace ? 1 : 0)
    if (score >= 3 || (samePlace && stems.length && hits(unfold(i.msgs[n.msg]?.info ?? ''), stems).length)) back.push({ n, score })
  }
  back.sort((a, b) => b.score - a.score || b.n.at - a.n.at)
  const backs: string[] = []
  const backIds: string[] = []
  for (const { n } of back.slice(0, 2)) {
    const a = i.msgs[n.msg]
    if (a?.who !== 'bot') continue
    const said = a.ai?.text ? a.ai.text : excerpt(`${a.intro ?? ''}\n\n${a.info ?? ''}`, stems, 1300)
    if (!said.trim()) continue
    backs.push(`## ${n.label} (earlier in this conversation)\n${clipTo(said, 1300)}`)
    parts.backlinks.push(n.label)
    if (n.sheet.concept) backIds.push(n.sheet.concept)
  }

  // 3. one link away: the articles this point links to that share a word with the question, best first (not one an earlier
  // point brings already: what was said there stays)
  const linked: string[] = []
  const cur = m.ctx ?? null
  if (read && node && stems.length) {
    const ids = [...new Set([...(m.sources ?? []).map((s) => s.id), ...(node.links ?? [])])].filter((id) => /^(ta|tw):/.test(id) && id !== cur && !backIds.includes(id)).slice(0, 12)
    const cands: { a: Art; score: number }[] = []
    for (const id of ids) {
      const a = await read(id, i.lang).catch(() => null)
      if (!a) continue
      const title = hits(`${a.title} ${id.split('/').pop()!.replace(/-/g, ' ')}`, stems).length
      const body = hits(pickSections(a, ask).flatMap((p) => p.secs.map(bodyOf)).join('\n'), stems).length
      const score = 3 * title + body
      // the article the phone named as a source goes in when there is room; any other only when its title is the question's word
      if (score >= 3 || (sources.some((s) => s.id === id) && score >= 1)) cands.push({ a, score })
    }
    cands.sort((x, y) => y.score - x.score)
    for (const { a } of cands.slice(0, 2)) {
      const kind = a.id.startsWith('ta:') ? 'Translation Academy' : 'Translation Words'
      linked.push(`## ${a.title} (${kind}, linked from this answer)\n${sectionsText(a, ask, 1800)}`)
      parts.linked.push(a.id)
    }
  }

  // 2. the current point's helps, with the room the others leave (the passage's context gives up its end first)
  const extra = [linked.join('\n\n'), backs.join('\n\n'), pathText].filter(Boolean)
  const room = Math.max(4000, max - extra.reduce((n, t) => n + t.length + 2, 0) - 40)
  let current = ''
  const art = cur && read ? await read(cur, i.lang).catch(() => null) : null
  if (art) {
    // the article the phone found: its heading as the phone wrote it, then the sections the question needs
    const head = (m.info ?? '').match(/^#{1,3} .+$/m)?.[0] ?? `## ${art.title}`
    const top = [m.intro?.trim(), head].filter(Boolean).join('\n\n')
    current = `${top}\n\n${sectionsText(art, ask, Math.max(1000, room - top.length - 4))}`
  } else {
    const found = `${m.intro ?? ''}\n\n${unfold(m.info ?? '')}`.trim()
    const ctx = i.passage?.trim() ?? ''
    if (ctx) {
      const f = clipTo(found, Math.min(5000, room - Math.min(ctx.length, 1500)))
      current = `${f}\n\n# Context of the passage\n\n${clipTo(ctx, room - f.length - 30)}`
      parts.passage = Math.min(ctx.length, room - f.length - 30)
    } else current = clipTo(found, room)
  }
  parts.current = current.length
  parts.path = pathText.length
  const helps = [current, ...extra].join('\n\n').slice(0, max)
  return { helps, history, sources, parts }
}

/** Reads an article from the packs: the answer's language, then English (as the answers fall back to it). */
export function packReader(open: (lang: string) => Promise<{ article: (id: string, s: 'all') => Promise<{ data?: { id: string; title: string; sections: Section[] } | null }> }>): ReadArticle {
  const cache = new Map<string, Promise<Art | null>>()
  return (id, lang) => {
    const key = `${lang} ${id}`
    if (!cache.has(key)) cache.set(key, (async () => {
      for (const l of [...new Set([lang, 'en'])]) {
        try {
          const a = (await (await open(l)).article(id, 'all')).data
          if (a?.sections?.length) return { id: a.id, title: a.title, sections: a.sections }
        } catch { /* the next pack */ }
      }
      return null
    })())
    return cache.get(key)!
  }
}
