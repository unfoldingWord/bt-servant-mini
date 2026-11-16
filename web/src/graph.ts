// The conversation's graph (Abel, Nov 14–15): every answer with something in it is a point, and code alone decides how it
// joins the one before: it goes on along the same passage (`line`), goes into something that passage holds (`deeper`: a
// key term, the Academy article its note cites, its book's or chapter's introduction) or leaves for something else
// (`branch`). The person creates nothing; they see the graph (Map), and a tap on a point goes back there to go on from it.
// No DOM here (main.ts draws it), so the decisions are tested under bun.
import type { Learn } from './learn'

export type Edge = 'start' | 'line' | 'deeper' | 'branch'
/** The compact sheet of a turn: what re-opens it (`lang`, `what`) and what the next turn is compared with (`ref`, `concept`). */
export type NodeSheet = { intent: string; ref: string | null; concept: string | null; what: string[]; term: string | null; lang: string }
export type GNode = {
  id: string; parent: string | null; edge: Edge
  /** 2–5 words in the app's language: "Ruth 2:3 · Notes", "glean", "Introduction to Numbers 6" */
  label: string
  sheet: NodeSheet
  /** the index of its (latest) answer in the conversation's messages */
  msg: number
  at: number
  /** the kind of answer (pipeline.ts `answered`): passage, intro, article, meaning, search… */
  kind: string
  /** the articles the answer holds or offers (its key terms, the Academy article its notes cite, its buttons), and for a
   * search the verses it found: what makes the next point `deeper` */
  links?: string[]
  /** shown again as it was (its message copied), not asked again from its sheet: answers that needed the typed question */
  copy?: boolean
  /** a search: the verses it found, in order ("the second one" after going back to it) */
  found?: string[]
  /**
   * the conversation drifted far from its topic here and a new conversation was offered under this point's answer (`offered`),
   * the person said to continue here (`stayed`), or this point was moved to a new conversation and is its first (`moved`):
   * the topic is measured again from here, so the same drift is never offered twice
   */
  drift?: 'offered' | 'stayed' | 'moved'
}
/**
 * `path`: the light path the person started through a book ("Voy a traducir Rut"), and where it is; `pathBefore`: the path it
 * replaced, while the answer that started the new one offers a new conversation (moved there, the old one comes back)
 */
export type Graph = { nodes: GNode[]; cur: string | null; path?: Path; pathBefore?: Path
  /** the step after `path`, when the last answer was on it (the button "Next: …" under it; the composer offers it too) */
  pathNext?: Path
  /** the learning path through Translation Academy the person started from the welcome (learn.ts), and where it is */
  learn?: Learn }

export const newGraph = (): Graph => ({ nodes: [], cur: null })
export const nodeOf = (g: Graph | undefined, id: string | null | undefined): GNode | undefined =>
  id ? g?.nodes.find((n) => n.id === id) : undefined

/** A point where the person was reading: a passage or an introduction, or the verses a search found. */
const isPassage = (n: GNode) => (n.kind === 'passage' || n.kind === 'intro') && !!n.sheet.ref
const isPlace = (n: GNode) => isPassage(n) || (n.kind === 'search' && !!n.sheet.ref)

/** "rut 2:3" -> { book: rut, ch: 2 }; "rut front:intro" -> { book: rut, ch: null, intro }; "rut" -> { book: rut, ch: null } */
export function place(ref: string | null): { book: string; ch: number | null; intro: boolean } | null {
  const m = /^([0-9a-z]{3})(?: (front|\d+)(?::(intro|\d+))?)?/.exec(ref ?? '')
  if (!m) return null
  return { book: m[1]!, ch: m[2] && m[2] !== 'front' ? +m[2] : null, intro: m[3] === 'intro' }
}

/** The nearest point at or above `id` that is a passage (an introduction counts): where the conversation is reading. */
export function passageAt(g: Graph, id: string | null, self = true): GNode | undefined {
  let n = nodeOf(g, id)
  if (n && !self) n = nodeOf(g, n.parent)
  while (n && !isPassage(n)) n = nodeOf(g, n.parent)
  return n
}
/** Where "← Back to …" under a `deeper` or `branch` point goes: the nearest point above it that is a passage (or a search's verses). */
export function backTarget(g: Graph, id: string): GNode | undefined {
  const n = nodeOf(g, id)
  if (!n || (n.edge !== 'deeper' && n.edge !== 'branch')) return undefined
  let p = nodeOf(g, n.parent)
  while (p && !isPlace(p)) p = nodeOf(g, p.parent)
  return p
}
/** The point and up to `n` points above it, oldest first: the branch the online answer is given as history. */
export function branchOf(g: Graph, id: string, n = 3): GNode[] {
  const out: GNode[] = []
  let x = nodeOf(g, id)
  while (x && out.length <= n) {
    out.unshift(x)
    x = nodeOf(g, x.parent)
  }
  return out
}

/** Whether a passage ref ("gen 6:1-8:22", a story's range) holds the chapter of a place (Genesis 7). */
function inChapters(ref: string, N: { book: string; ch: number | null }): boolean {
  const m = /^([0-9a-z]{3}) (\d+)(?::\d+)?(?:-(?:(\d+):)?\d+)?$/.exec(ref)
  if (!m || m[1] !== N.book || N.ch === null) return false
  return N.ch >= +m[2]! && N.ch <= (m[3] ? +m[3] : +m[2]!)
}

/** What is compared: the new turn's kind, its sheet, and what it links to. */
export type Turn = { kind: string; sheet: NodeSheet; links?: string[] }

/** Two places on the same line: introductions of the same book, both of it or of chapters next to each other; a passage of
 * the book and chapter of a passage or an introduction (or the chapter next to it), or of a book whose introduction it is. */
function sameLine(A: NonNullable<ReturnType<typeof place>>, N: NonNullable<ReturnType<typeof place>>): boolean {
  if (A.book !== N.book) return false
  const near = A.ch !== null && N.ch !== null && Math.abs(N.ch - A.ch) <= 1
  if (N.intro) return A.intro && ((A.ch === null && N.ch === null) || near)
  return A.ch === null || N.ch === null || near
}

/**
 * How a new turn joins the current point (code only, no model):
 * - a passage or introduction on the line of a passage the conversation came through (the same book and chapter, or the
 *   chapter next to it; the nearest such passage above, even past a detour): `line`, on that passage;
 * - an introduction to the book being read, an article or term the current point holds or offers (under the current point)
 *   or the passage being read holds (under that passage), a question about the passage being read ("what does glean mean
 *   here?"), a verse a search found: `deeper`;
 * - anything else: `branch`, under the current point.
 */
export function classify(g: Graph, t: Turn): { edge: Edge; parent: string | null } {
  const c = nodeOf(g, g.cur)
  if (!c) return { edge: 'start', parent: null }
  const deeper = { edge: 'deeper' as const, parent: c.id }
  const branch = { edge: 'branch' as const, parent: c.id }
  const p = passageAt(g, c.id)
  const P = place(p?.sheet.ref ?? null)
  const N = place(t.sheet.ref)
  if ((t.kind === 'passage' || t.kind === 'intro') && N) {
    // a verse the search found
    if (c.kind === 'search' && c.links?.includes(t.sheet.ref!)) return deeper
    // the line of the nearest passage above that it continues (Ruth 2:3 → Mark 1:1 → Ruth 2:5 goes back on Ruth's line)
    for (let a: GNode | undefined = p; a; a = passageAt(g, a.id, false)) {
      const A = place(a.sheet.ref)
      if (A && sameLine(A, N)) return { edge: 'line', parent: a.id }
    }
    if (N.intro && P && N.book === P.book) return deeper
    // Open Bible Stories (obs.ts): a story is a point linked to its passages. The story a passage is told in ("This part is
    // told in OBS 3", `obs:3` in the passage's links), and a passage a story is told from (the story's links hold its ranges)
    if (N.book === 'obs' && N.ch !== null) {
      const story = `obs:${N.ch}`
      if (c.links?.includes(story)) return deeper
      if (p?.links?.includes(story)) return { edge: 'deeper', parent: p.id }
    }
    if (c.sheet.ref?.startsWith('obs ') && c.links?.some((l) => l === t.sheet.ref || inChapters(l, N))) return deeper
    return branch
  }
  const id = t.sheet.concept
  if (id && c.links?.includes(id)) return deeper
  if (id && p?.links?.includes(id)) return { edge: 'deeper', parent: p.id }
  // about the passage being read: "what does glean mean here?", advice on its verse, a count in its chapter
  if (N && P && N.book === P.book && (N.ch === null || P.ch === null || N.ch === P.ch)) return deeper
  return branch
}

let seq = 0
/** A new point, joined by `classify`; it becomes the current one. */
export function addNode(g: Graph, t: Turn & { label: string; copy?: boolean; found?: string[] }, msg = -1): GNode {
  const { edge, parent } = classify(g, t)
  const n: GNode = { id: `n${Date.now().toString(36)}${(seq++).toString(36)}`, parent, edge, label: t.label, sheet: t.sheet, msg, at: Date.now(), kind: t.kind }
  if (t.links?.length) n.links = [...new Set(t.links)].slice(0, 40)
  if (t.copy) n.copy = true
  if (t.found?.length) n.found = t.found.slice(0, 40)
  g.nodes.push(n)
  g.cur = n.id
  return n
}

/** A row of the Map: a point (indented by its depth) or "… 6 more" for the middle of a long line. */
export type MapRow =
  | { k: 'node'; node: GNode; depth: number; cur: boolean }
  | { k: 'more'; n: number; key: string; depth: number }
/** A line of more `line` points than this in a row shows its first and last two and "… N more" between. */
export const LINE_FOLD = 5

/**
 * The tree in reading order: a point, the points that go deeper or branch from it (indented one step), then the ones that go
 * on along its line (same depth). `open`: the folded lines the person opened (by their first point's id).
 */
export function mapRows(g: Graph, open: Set<string> = new Set()): MapRow[] {
  const kids = new Map<string | null, GNode[]>()
  for (const n of g.nodes) {
    const k = nodeOf(g, n.parent) ? n.parent : null
    kids.set(k, [...(kids.get(k) ?? []), n])
  }
  const rows: MapRow[] = []
  const walk = (n: GNode, depth: number) => {
    rows.push({ k: 'node', node: n, depth, cur: n.id === g.cur })
    const ks = kids.get(n.id) ?? []
    for (const x of ks.filter((x) => x.edge !== 'line')) walk(x, depth + 1)
    for (const x of ks.filter((x) => x.edge === 'line')) walk(x, depth)
  }
  // (iteratively for the roots: a conversation's first point, and any whose parent is gone)
  for (const r of kids.get(null) ?? []) walk(r, 0)
  // fold the long lines: consecutive `line` points at the same depth, unless the current one is in the middle
  const out: MapRow[] = []
  for (let i = 0; i < rows.length;) {
    const r = rows[i]!
    if (r.k !== 'node' || r.node.edge !== 'line') { out.push(r); i++; continue }
    let j = i
    while (j < rows.length && rows[j]!.k === 'node' && (rows[j] as { node: GNode }).node.edge === 'line' && rows[j]!.depth === r.depth) j++
    const run = rows.slice(i, j) as Extract<MapRow, { k: 'node' }>[]
    const mid = run.slice(2, -2)
    if (run.length > LINE_FOLD && !open.has(r.node.id) && !mid.some((x) => x.cur)) {
      out.push(...run.slice(0, 2), { k: 'more', n: mid.length, key: r.node.id, depth: r.depth }, ...run.slice(-2))
    } else out.push(...run)
    i = j
  }
  return out
}

// ----------------------------------------------------------------------------------------------------------- drift
// Guiding without blocking (Abel, Nov 15): when the conversation has gone far from where it started, the answer offers once to
// go on in a new conversation; the person may ignore it. Never on a point that goes on along the passage or goes into it.

/** Never before this many points (the first four turns are never asked). */
export const DRIFT_MIN_POINTS = 5
/** This many new topics (`branch` steps) from the topic's start is a drift. */
export const DRIFT_BRANCHES = 3
/** A line this long (points from the topic's start to the one before), then a passage of another book: a drift too. */
export const DRIFT_LINE = 4

/**
 * Whether a new point drifted far from its conversation's topic: only a `branch`, from the fifth point on, measured from the
 * topic's start (the first point, or the nearest point above where a new conversation was already offered: the same drift is
 * not offered again); a drift is {@link DRIFT_BRANCHES} new topics from there, or a passage of another book after a line of
 * {@link DRIFT_LINE} points.
 */
export function drifts(g: Graph, n: GNode): boolean {
  if (n.edge !== 'branch' || g.nodes.length < DRIFT_MIN_POINTS) return false
  const way: GNode[] = []
  for (let x = nodeOf(g, n.parent); x; x = nodeOf(g, x.parent)) {
    way.unshift(x)
    if (x.drift) break
  }
  const root = way[0]
  if (!root) return false
  if ([...way.slice(1), n].filter((x) => x.edge === 'branch').length >= DRIFT_BRANCHES) return true
  const R = place(root.sheet.ref), N = place(n.sheet.ref)
  return way.length >= DRIFT_LINE && !!R && !!N && (n.kind === 'passage' || n.kind === 'intro') && R.book !== N.book
}

// ------------------------------------------------------------------------------------------------------------ light paths
// "Voy a traducir Rut", "Estoy revisando Jonás 2": a path through the book, offered as the first next step of each answer on it,
// with a small line saying where it is ("Ruth 1:6–18 · step 4 of 5: notes"). The person may ask anything any time; an answer
// off the path offers one tap back to it, and the Map has "Continue the path".

/** A section of a chapter: its first and last verse. */
export type Sec = [number, number]
/**
 * Where a path is: the book, its chapter (null: the book's introduction, before any chapter), the step (1–5: introduction,
 * the section's text, its key terms, its notes, its comprehension questions), the section (from step 2), the pack it reads,
 * and the task the person announced.
 */
export type Path = { book: string; ch: number | null; step: number; sec: Sec | null; lang: string; task: 'translate' | 'review'
  /**
   * the steps the packs on the phone can answer for this book: the introduction and the sections always; the key terms, the
   * notes, the questions only when a pack has them for it (the Hindi pack has no questions for Acts). None: all five (a path
   * kept from before this was known).
   */
  has?: number[]
  /** the app's language when the path started: where its steps take a missing kind of help from, after English (helpsPack) */
  app?: string }
/** The five steps of a path, in order; `pathSteps`: those the packs can answer for its book. */
export const ALL_STEPS = [1, 2, 3, 4, 5]
export const pathSteps = (p: Path): number[] => (p.has?.length ? p.has : ALL_STEPS)
/** Whether a step is the last one of its section (then the next section follows). */
export const lastOfSection = (p: Path): boolean => p.step >= 2 && p.step === Math.max(...pathSteps(p))

const secRef = (ch: number, [a, b]: Sec) => (a === b ? `${ch}:${a}` : `${ch}:${a}-${b}`)
/** The passage and helps of a step: the introduction; then the section's text, its key terms, its notes, its questions. */
export function stepTarget(p: Path): { ref: string; what: string[] } | null {
  if (p.step === 1) return { ref: p.ch ? `${p.book} ${p.ch}:intro` : `${p.book} front:intro`, what: ['intro'] }
  if (!p.ch || !p.sec) return null
  return { ref: `${p.book} ${secRef(p.ch, p.sec)}`, what: [[], [], ['text'], ['terms'], ['notes'], ['questions']][p.step] ?? ['text'] }
}

/**
 * Which step of the path an answer is, from its passage and what it shows (`secs`: the sections of the answer's chapter), or
 * null: a chapter's introduction (that chapter, from its start), the book's (only before any chapter); a section (by its range,
 * or a one-verse section) with its text, only its key terms, only its notes, only its questions. A verse, a whole chapter: none.
 */
export function stepOf(p: Path, ref: string | null, what: string[], secs: Sec[]): Path | null {
  const m = /^([0-9a-z]{3}) (front|\d+)(?::(intro|\d+)(?:-(\d+))?)?$/.exec(ref ?? '')
  if (!m || m[1] !== p.book || !m[3]) return null
  if (m[3] === 'intro') return m[2] === 'front' ? (p.ch === null ? { ...p, step: 1, sec: null } : null) : { ...p, step: 1, ch: +m[2]!, sec: null }
  if (m[2] === 'front') return null
  const ch = +m[2]!, a = +m[3]
  const sec: Sec | null = m[4] ? [a, +m[4]] : secs.some(([x, y]) => x === a && y === a) ? [a, a] : null
  if (!sec) return null
  const only = (k: string) => what.length === 1 && what[0] === k
  const step = what.includes('text') ? 2 : only('terms') ? 3 : only('notes') ? 4 : only('questions') ? 5 : 0
  // (a step the packs cannot answer for this book is not on the path: "questions" asked anyway is a question of its own)
  return step && pathSteps(p).includes(step) ? { ...p, step, ch, sec } : null
}

/**
 * The step after this one: after an introduction, the first section of its chapter (`secs`: the sections of the path's chapter,
 * chapter 1 before any); then the section's key terms, its notes, its questions (those the packs can answer: `has`); then the
 * next section's text, or the first of the next chapter (`nextSecs`). Null at the end of the book.
 */
export function nextStep(p: Path, secs: Sec[], nextSecs: Sec[]): Path | null {
  if (p.step === 1) return secs[0] ? { ...p, step: 2, ch: p.ch ?? 1, sec: secs[0] } : null
  if (!p.sec || !p.ch) return null
  const later = pathSteps(p).find((s) => s > p.step)
  if (later) return { ...p, step: later }
  // the first section that ends after this one: a section the list does not have (a path saved with the guessed sections, a
  // range typed by hand) goes on from where it ended, without skipping verses
  const n = secs.find(([, b]) => b > p.sec![1])
  if (n) return { ...p, step: 2, sec: n }
  return nextSecs[0] ? { ...p, step: 2, ch: p.ch + 1, sec: nextSecs[0] } : null
}

/** Where a step is, said short: "Ruth", "Ruth 1", "Ruth 1:6–18" (`book`: the book's name in the app's language). */
export function stepPlace(p: Path, book: string): string {
  if (p.step === 1 || !p.ch || !p.sec) return p.ch ? `${book} ${p.ch}` : book
  return `${book} ${secRef(p.ch, p.sec).replace('-', '–')}`
}

// ------------------------------------------------------------------------------------------------------------- words
type L = 'en' | 'es' | 'fr' | 'id' | 'hi' | 'ar'
export type GraphWords = {
  map: string; mapLong: string; hint: string; here: string; more: string; back: string; points: string; close: string
  edge: Record<Edge, string>
}
const G: Record<L, GraphWords> = {
  en: { map: 'Map', mapLong: 'Map of this conversation', hint: 'Tap a point to go back to it and continue from there. Nothing is deleted.', here: 'You are here', more: '… {n} more', back: 'Back to {label}', points: '{n} points', close: 'Close',
    edge: { start: 'start', line: 'same passage', deeper: 'from the point above', branch: 'new topic' } },
  es: { map: 'Mapa', mapLong: 'Mapa de esta conversación', hint: 'Toca un punto para volver ahí y seguir desde ese punto. No se borra nada.', here: 'Estás aquí', more: '… {n} más', back: 'Volver a {label}', points: '{n} puntos', close: 'Cerrar',
    edge: { start: 'inicio', line: 'mismo pasaje', deeper: 'del punto de arriba', branch: 'tema nuevo' } },
  fr: { map: 'Carte', mapLong: 'Carte de cette conversation', hint: "Touchez un point pour y revenir et continuer à partir de là. Rien n'est effacé.", here: 'Vous êtes ici', more: '… {n} de plus', back: 'Revenir à {label}', points: '{n} points', close: 'Fermer',
    edge: { start: 'début', line: 'même passage', deeper: 'du point au-dessus', branch: 'nouveau sujet' } },
  id: { map: 'Peta', mapLong: 'Peta percakapan ini', hint: 'Ketuk sebuah titik untuk kembali ke sana dan melanjutkan dari situ. Tidak ada yang dihapus.', here: 'Anda di sini', more: '… {n} lagi', back: 'Kembali ke {label}', points: '{n} titik', close: 'Tutup',
    edge: { start: 'awal', line: 'bagian yang sama', deeper: 'dari titik di atas', branch: 'topik baru' } },
  hi: { map: 'नक्शा', mapLong: 'इस बातचीत का नक्शा', hint: 'किसी बिंदु पर टैप करें, वहाँ लौटें और वहीं से आगे बढ़ें। कुछ भी नहीं मिटता।', here: 'आप यहाँ हैं', more: '… {n} और', back: '{label} पर लौटें', points: '{n} बिंदु', close: 'बंद करें',
    edge: { start: 'शुरुआत', line: 'वही भाग', deeper: 'ऊपर वाले बिंदु से', branch: 'नया विषय' } },
  ar: { map: 'الخريطة', mapLong: 'خريطة هذه المحادثة', hint: 'اضغط على نقطة للعودة إليها والمتابعة من هناك. لا يُحذف شيء.', here: 'أنت هنا', more: '… {n} أخرى', back: 'العودة إلى {label}', points: '{n} نقاط', close: 'إغلاق',
    edge: { start: 'البداية', line: 'المقطع نفسه', deeper: 'من النقطة أعلاه', branch: 'موضوع جديد' } },
}
export const GT = (ui: string): GraphWords => G[(ui in G ? ui : 'en') as L]
/** The button under an answer: "← Back to Ruth 2:3" (the arrow points back in right-to-left text too). */
export const backLabel = (ui: string, label: string): string => `${ui === 'ar' ? '→' : '←'} ${GT(ui).back.replace('{label}', label)}`
/** The divider in the chat where the person went back: "Back to Ruth 2:3". */
export const backLine = (ui: string, label: string): string => GT(ui).back.replace('{label}', label)

/** The words of the guidance (out of scope, drift, paths), in the app's languages. */
export type GuideWords = {
  /** out of scope: what Mini helps with, before the ways back; a key term's button */
  scope: string; term: string
  /** drift: the offer under the answer, its two buttons, and what it says when there are already 3 conversations */
  drift: string; newConv: string; stay: string; full: string
  /** paths: the steps' names, the marker, the line that proposes the path, the next step's button, the way back, the Map's row */
  steps: [string, string, string, string, string]; mark: string; start: string; next: string; toPath: string; resume: string
}
const GW: Record<L, GuideWords> = {
  en: { scope: 'I help with Bible translation: passages and their notes, key terms and Translation Academy. Try one of these:', term: 'Key term: {t}',
    drift: 'Shall we start a new conversation for this?', newConv: 'New conversation', stay: 'Continue here', full: 'You already have 3 conversations. Delete one in the menu to start another, or continue here.',
    steps: ['introduction', 'sections', 'key terms', 'notes', 'questions'], mark: '{place} · step {n} of {m}: {step}', start: 'A path through {book}: {steps}. Ask anything along the way.',
    next: 'Next: {place} · {step}', toPath: 'Back to the path: {place} · {step}', resume: 'Continue the path: {place} · {step}' },
  es: { scope: 'Te ayudo con la traducción de la Biblia: pasajes y sus notas, palabras clave y Translation Academy. Prueba una de estas:', term: 'Palabra clave: {t}',
    drift: '¿Empezamos una conversación nueva para esto?', newConv: 'Nueva conversación', stay: 'Seguir aquí', full: 'Ya tienes 3 conversaciones. Borra una en el menú para empezar otra, o sigue aquí.',
    steps: ['introducción', 'secciones', 'palabras clave', 'notas', 'preguntas'], mark: '{place} · paso {n} de {m}: {step}', start: 'Un camino por {book}: {steps}. Puedes preguntar cualquier cosa en el camino.',
    next: 'Siguiente: {place} · {step}', toPath: 'Volver al camino: {place} · {step}', resume: 'Seguir el camino: {place} · {step}' },
  fr: { scope: "J'aide à traduire la Bible : passages et leurs notes, mots clés et Translation Academy. Essayez l'un de ceux-ci :", term: 'Mot clé : {t}',
    drift: 'On commence une nouvelle conversation pour ceci ?', newConv: 'Nouvelle conversation', stay: 'Continuer ici', full: 'Vous avez déjà 3 conversations. Supprimez-en une dans le menu pour en commencer une autre, ou continuez ici.',
    steps: ['introduction', 'sections', 'mots clés', 'notes', 'questions'], mark: '{place} · étape {n} sur {m} : {step}', start: 'Un parcours de {book} : {steps}. Posez toute question en chemin.',
    next: 'Suite : {place} · {step}', toPath: 'Revenir au parcours : {place} · {step}', resume: 'Continuer le parcours : {place} · {step}' },
  id: { scope: 'Saya membantu penerjemahan Alkitab: perikop dan catatannya, istilah kunci, dan Translation Academy. Coba salah satu ini:', term: 'Istilah kunci: {t}',
    drift: 'Mulai percakapan baru untuk ini?', newConv: 'Percakapan baru', stay: 'Lanjut di sini', full: 'Anda sudah punya 3 percakapan. Hapus satu di menu untuk memulai yang lain, atau lanjut di sini.',
    steps: ['pengantar', 'bagian', 'istilah kunci', 'catatan', 'pertanyaan'], mark: '{place} · langkah {n} dari {m}: {step}', start: 'Jalur melalui {book}: {steps}. Tanyakan apa saja di sepanjang jalan.',
    next: 'Berikutnya: {place} · {step}', toPath: 'Kembali ke jalur: {place} · {step}', resume: 'Lanjutkan jalur: {place} · {step}' },
  hi: { scope: 'मैं बाइबल अनुवाद में मदद करता हूँ: भाग और उनकी टिप्पणियाँ, मुख्य शब्द और Translation Academy। इनमें से कोई आज़माएँ:', term: 'मुख्य शब्द: {t}',
    drift: 'क्या इसके लिए नई बातचीत शुरू करें?', newConv: 'नई बातचीत', stay: 'यहीं जारी रखें', full: 'आपके पास पहले से 3 बातचीत हैं। दूसरी शुरू करने के लिए मेनू में एक मिटाएँ, या यहीं जारी रखें।',
    steps: ['परिचय', 'खंड', 'मुख्य शब्द', 'टिप्पणियाँ', 'प्रश्न'], mark: '{place} · चरण {n}/{m}: {step}', start: '{book} का मार्ग: {steps}। रास्ते में कुछ भी पूछें।',
    next: 'आगे: {place} · {step}', toPath: 'मार्ग पर लौटें: {place} · {step}', resume: 'मार्ग जारी रखें: {place} · {step}' },
  ar: { scope: 'أساعد في ترجمة الكتاب المقدس: المقاطع وملاحظاتها، والكلمات الرئيسية، وTranslation Academy. جرّب واحدًا من هذه:', term: 'كلمة رئيسية: {t}',
    drift: 'هل نبدأ محادثة جديدة لهذا؟', newConv: 'محادثة جديدة', stay: 'المتابعة هنا', full: 'لديك 3 محادثات بالفعل. احذف واحدة من القائمة لتبدأ أخرى، أو تابع هنا.',
    steps: ['المقدمة', 'المقاطع', 'الكلمات الرئيسية', 'الملاحظات', 'الأسئلة'], mark: '{place} · الخطوة {n} من {m}: {step}', start: 'مسار عبر {book}: {steps}. اسأل عن أي شيء في الطريق.',
    next: 'التالي: {place} · {step}', toPath: 'العودة إلى المسار: {place} · {step}', resume: 'متابعة المسار: {place} · {step}' },
}
export const GD = (ui: string): GuideWords => GW[(ui in GW ? ui : 'en') as L]
const fillIn = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? '')
/** "Ruth 1:6–18 · step 4 of 5: notes" (`kind`: the marker, the next step's button, the way back to it, the Map's row). */
export function pathWords(ui: string, p: Path, book: string, kind: 'mark' | 'next' | 'toPath' | 'resume'): string {
  const w = GD(ui)
  // "step 4 of 4" when the packs have no questions for the book: the steps it has, counted
  const steps = pathSteps(p)
  const n = steps.indexOf(p.step) + 1 || p.step
  const text = fillIn(w[kind], { place: stepPlace(p, book), n: String(n), m: String(steps.length), step: w.steps[p.step - 1] ?? '' })
  return kind === 'toPath' ? `${ui === 'ar' ? '→' : '←'} ${text}` : text
}
/** "A path through Ruth: introduction → sections → …", the line that proposes a path when it starts (`has`: its steps). */
export const pathStartLine = (ui: string, book: string, has: number[] = ALL_STEPS): string =>
  fillIn(GD(ui).start, { book, steps: has.map((n) => GD(ui).steps[n - 1]).join(ui === 'ar' ? ' ← ' : ' → ') })
