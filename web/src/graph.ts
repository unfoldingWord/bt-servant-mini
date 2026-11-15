// The conversation's graph (Abel, Nov 14–15): every answer with something in it is a point, and code alone decides how it
// joins the one before: it goes on along the same passage (`line`), goes into something that passage holds (`deeper`: a
// key term, the Academy article its note cites, its book's or chapter's introduction) or leaves for something else
// (`branch`). The person creates nothing; they see the graph (Map), and a tap on a point goes back there to go on from it.
// No DOM here (main.ts draws it), so the decisions are tested under bun.

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
}
export type Graph = { nodes: GNode[]; cur: string | null }

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

/** What is compared: the new turn's kind, its sheet, and what it links to. */
export type Turn = { kind: string; sheet: NodeSheet; links?: string[] }

/**
 * How a new turn joins the current point (code only, no model):
 * - a passage of the book and chapter being read (or the chapter next to it), after a passage or an article from it: `line`,
 *   on the passage it continues;
 * - an introduction to the book being read, an article or term the current point holds or offers, a question about the
 *   passage being read ("what does glean mean here?"), a verse a search found: `deeper`, under the current point;
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
    if (P && N.book === P.book) {
      if (N.intro) return P.intro && N.ch === P.ch ? { edge: 'line', parent: p!.id } : deeper
      if (P.ch === null || N.ch === null || Math.abs(N.ch - P.ch) <= 1) return { edge: 'line', parent: p!.id }
    }
    return branch
  }
  const id = t.sheet.concept
  if (id && (c.links?.includes(id) || p?.links?.includes(id))) return deeper
  // about the passage being read: "what does glean mean here?", advice on its verse, a count in its chapter
  if (N && P && N.book === P.book && (N.ch === null || P.ch === null || N.ch === P.ch)) return deeper
  return branch
}

let seq = 0
/** A new point, joined by `classify`; it becomes the current one. */
export function addNode(g: Graph, t: Turn & { label: string; copy?: boolean }, msg = -1): GNode {
  const { edge, parent } = classify(g, t)
  const n: GNode = { id: `n${Date.now().toString(36)}${(seq++).toString(36)}`, parent, edge, label: t.label, sheet: t.sheet, msg, at: Date.now(), kind: t.kind }
  if (t.links?.length) n.links = [...new Set(t.links)].slice(0, 40)
  if (t.copy) n.copy = true
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
