// Family trees (handoff/mini-servant/diseno-arboles.md): built on the phone from the family data the packs already have (the
// `parent-of`, `partner-of`, `sibling-of` relations of the `xtopics` core; names and gender from the people index). No DOM here
// (treeview.ts draws it), so it is tested under bun. Nothing is stored: a conversation keeps only `TreeOf` and builds it again.

/** A person in a tree. `n`: how many children the data gives; `unnamed`: the data has no real name («Unnamed#9», `a_wife_of_Lot`). */
export type TP = { id: string; name: string; g?: 1 | 2; unnamed?: true; half?: true; n: number }
/** The two views: the tree (parents, the person, spouses, siblings, descendants) and the line of ancestors. */
export type TreeMode = 'tree' | 'up'
/** How a tree is built again (all a saved conversation keeps of it): `open`, the generations open when it is drawn. */
export type TreeOf = { pack: string; id: string; mode: TreeMode; open: 1 | 2 | 3 }
export type TreeView = {
  mode: TreeMode
  /** generations of descendants open when drawn (tree: 1 or 2; «descendants»: up to 3), §4.2.5 */
  open: 1 | 2 | 3
  ui: string
  pack: string
  focus: TP
  /** each parent with its own parents (the grandparents) */
  parents: (TP & { up: TP[] })[]
  partners: TP[]
  siblings: TP[]
  /** the focus's children, by their other parent when there are two groups or more; `with` absent: not named in the data */
  groups: { with?: TP; kids: number[] }[]
  /** descendants (indexes from `groups` and `kids`): up to 4 generations and 150 people, by whole generations */
  nodes: (TP & { kids?: number[] })[]
  /** «up»: one row per generation; `mother` the other parent shown small, `others` more fathers the data gives, `gap` n unnamed
   *  generations joined into one row (then `p` is the last of them) */
  line?: { p: TP; mother?: TP; others?: TP[]; gap?: number }[]
  /** the descendants were cut at the cap (4 generations or 150 people) */
  cut: boolean
}

// ------------------------------------------------------------------------------------------------------------------ building
import { BOOKS } from '@bt-synergy/language-pack-v3'
import { colon, familyOf, KIN_T, KT, peopleById, shownAsMaker, tiesOf, versesIn, withName, type KinLang } from './kin'

/** Most generations of descendants built, and most people (whole generations: one that does not fit whole is left out). */
const GENS = 4
const MAX_NODES = 150
/** Most generations of the line of ancestors. */
const MAX_LINE = 80
/** Rows (children + grandchildren) that may be open when a tree is drawn, and for «descendants» (up to 3 generations). */
const OPEN_TREE = 40
const OPEN_DOWN = 60
/** Consecutive generations with no name joined into one row from this many. */
const GAP_FROM = 3

const isUnnamed = (raw: string): boolean => /^Unnamed#/i.test(raw) || raw.includes('_')

/** The generations open when drawn, from the rows of each generation (`sizes`): `limit` rows at most, `max` generations. */
function openFor(sizes: number[], limit: number, max: 1 | 2 | 3): 1 | 2 | 3 {
  let k = 1
  let total = sizes[0] ?? 0
  for (let g = 1; g < Math.min(max, sizes.length); g++) {
    total += sizes[g]!
    if (total > limit) break
    k = g + 1
  }
  return k as 1 | 2 | 3
}

/**
 * The tree of a person (`per:` ids only) as the view the drawing and the text use. `open`: undefined, the generations open are chosen
 * here (children, and grandchildren when both are 40 rows or fewer); 1 or 2, as given; 3, «descendants»: up to three generations while
 * they are 60 rows or fewer (the saved `TreeOf` keeps what was chosen, so a rebuild is the same).
 */
export async function buildTree(pack: string, id: string, mode: TreeMode, ui: string, open?: 1 | 2 | 3): Promise<TreeView> {
  const t = KT(ui)
  const people = await peopleById(pack)
  const sh = await shownAsMaker(pack)
  const view: TreeView = { mode, open: open === 2 ? 2 : 1, ui, pack, focus: { id, name: id, n: 0 }, parents: [], partners: [], siblings: [], groups: [], nodes: [], cut: false }
  if (!people || !sh || !id.startsWith('per:')) return view
  const core = sh.core
  const ties = tiesOf(core)
  const per = (l: string[] | undefined): string[] => (l ?? []).filter((x) => x.startsWith('per:'))
  const mk = (pid: string, fallback?: string): TP => {
    const p = people.get(pid)
    const raw = p?.name ?? fallback ?? pid
    const out: TP = { id: pid, name: '', n: per(ties.children.get(pid)).length }
    if (isUnnamed(raw)) { out.unnamed = true; out.name = t.unnamed } else out.name = sh.shown(pid, raw)
    if (p?.gender) out.g = p.gender
    return out
  }
  // the order of people the family data gives no order for (§4.2): first canonical book they are named in, then verses, then id
  const first = (pid: string): number => {
    let at = Infinity
    for (const b of core.occurrences.get(pid)?.keys() ?? []) { const i = BOOKS.indexOf(b); if (i >= 0 && i < at) at = i }
    return at
  }
  const byFame = (a: string, b: string): number => first(a) - first(b) || versesIn(core, b) - versesIn(core, a) || (a < b ? -1 : 1)
  const sorted = (l: string[]): string[] => [...l].sort(byFame)
  view.focus = mk(id)

  if (mode === 'up') {
    const line: NonNullable<TreeView['line']> = []
    const seen = new Set([id])
    let cur = id
    // two fathers, or two with no gender: the one named in more verses, then the smaller id (the other is shown, never dropped)
    const best = (l: string[]): string[] => [...l].sort((a, b) => versesIn(core, b) - versesIn(core, a) || (a < b ? -1 : 1))
    const g = (x: string) => people.get(x)?.gender
    while (line.length < MAX_LINE) {
      const ps = per(ties.parents.get(cur))
      const fathers = ps.filter((x) => g(x) === 1)
      const neutral = ps.filter((x) => g(x) === undefined)
      const mothers = ps.filter((x) => g(x) === 2)
      const pool = fathers.length ? fathers : neutral.length ? neutral : mothers
      if (!pool.length) break
      const [next, ...rest] = best(pool)
      if (!next || seen.has(next)) break
      seen.add(next)
      const row: NonNullable<TreeView['line']>[number] = { p: mk(next) }
      if (pool !== mothers && mothers.length) row.mother = mk(best(mothers)[0]!)
      if (rest.length) row.others = rest.map((x) => mk(x))
      line.push(row)
      cur = next
      if (line.length === MAX_LINE && per(ties.parents.get(cur)).length) view.cut = true
    }
    // three or more unnamed generations in a row are one row (the last one stays, with how many there were)
    const out: typeof line = []
    for (let i = 0; i < line.length; ) {
      if (!line[i]!.p.unnamed) { out.push(line[i++]!); continue }
      let j = i
      while (j < line.length && line[j]!.p.unnamed) j++
      if (j - i >= GAP_FROM) out.push({ ...line[j - 1]!, gap: j - i })
      else out.push(...line.slice(i, j))
      i = j
    }
    view.line = out
    return view
  }

  // the focus's own family: the order of its children and the half siblings come from the family data (verses of the relations)
  const fam = (await familyOf(pack, id).catch(() => null))?.data ?? null
  const famIds = (l: { id: string }[] | undefined) => per((l ?? []).map((r) => r.id))
  const withRest = (l: string[], all: string[] | undefined) => [...l, ...sorted(per(all).filter((x) => !l.includes(x)))]
  const parentIds = withRest(famIds(fam?.parents), ties.parents.get(id))
  const partnerIds = withRest(famIds(fam?.partners), ties.partners.get(id))
  const siblingIds = withRest(famIds(fam?.siblings), ties.siblings.get(id))
  const childIds = withRest(famIds(fam?.children), ties.children.get(id)).filter((c) => c !== id)
  const half = new Set((fam?.siblings ?? []).filter((r) => r.half).map((r) => r.id))
  view.parents = parentIds.map((p) => ({ ...mk(p), up: sorted(per(ties.parents.get(p))).map((x) => mk(x)) }))
  view.partners = partnerIds.map((p) => mk(p))
  view.siblings = siblingIds.map((s) => { const x = mk(s); if (half.has(s)) x.half = true; return x })

  // descendants, a whole generation at a time
  const seen = new Set<string>([id, ...parentIds, ...childIds])
  const gens: number[][] = []
  const gensIds: string[][] = []
  const add = (ids: string[]): number[] => ids.map((c) => { view.nodes.push(mk(c)); return view.nodes.length - 1 })
  gens.push(add(childIds))
  gensIds.push(childIds)
  for (let depth = 2; depth <= GENS + 1; depth++) {
    const level = gensIds[gensIds.length - 1]!
    const next: string[] = []
    const owner: number[] = []
    level.forEach((p, i) => {
      for (const c of sorted(per(ties.children.get(p)))) {
        if (seen.has(c)) continue
        seen.add(c)
        next.push(c)
        owner.push(gens[gens.length - 1]![i]!)
      }
    })
    if (!next.length) break
    if (depth === GENS + 1 || view.nodes.length + next.length > MAX_NODES) { view.cut = true; break }
    const idx = add(next)
    idx.forEach((n, i) => { (view.nodes[owner[i]!]!.kids ??= []).push(n) })
    gens.push(idx)
    gensIds.push(next)
  }

  // the focus's children by their other parent (only these are grouped): two groups or more, else one without a title
  const byOther = new Map<string, number[]>()
  childIds.forEach((c, i) => {
    const others = sorted(per(ties.parents.get(c)).filter((x) => x !== id))
    const pick = others.find((x) => ties.partners.get(id)?.includes(x)) ?? others[0] ?? ''
    const l = byOther.get(pick)
    if (l) l.push(gens[0]![i]!)
    else byOther.set(pick, [gens[0]![i]!])
  })
  const none = byOther.get('')
  const named = [...byOther].filter(([k]) => k)
  if (byOther.size >= 2) view.groups = [...named.map(([k, kids]) => ({ with: mk(k), kids })), ...(none ? [{ kids: none }] : [])]
  else if (gens[0]!.length) view.groups = [{ kids: gens[0]! }]

  const sizes = gens.map((x) => x.length)
  view.open = open === 1 || open === 2 ? open : open === 3 ? openFor(sizes, OPEN_DOWN, 3) : openFor(sizes, OPEN_TREE, 2)
  return view
}

// ----------------------------------------------------------------------------------------------------------------------- text
/** The tree as text (§6), in the view's language: what is open when drawn. For sharing, reports and screen readers. */
export function treeText(view: TreeView): string {
  const ui = view.ui
  const t = KIN_T[ui as KinLang] ?? KIN_T.en
  const comma = ui === 'ar' ? '، ' : ', '
  const f = view.focus
  if (view.mode === 'up') {
    const head = withName(ui, t.up, f.name)
    const arrow = ui === 'ar' ? ' → ' : ' ← '
    const names = (view.line ?? []).map((r) => (r.gap ? t.gap.replace('{n}', String(r.gap)) : r.p.name))
    return names.length ? `${colon(ui, head)} ${names.join(arrow)}.` : `${colon(ui, head)} ${t.upEnd}`
  }
  const out: string[] = [withName(ui, t.tree, f.name)]
  if (view.parents.length) out.push(`${colon(ui, t.parentsL)} ${view.parents.map((p) => p.name).join(comma)}`)
  if (view.partners.length) {
    const ps = view.partners
    const label = ps.every((p) => p.g === 2) ? (ps.length > 1 ? t.wives : t.wife) : ps.length === 1 && ps[0]!.g === 1 ? t.husband : t.spouses
    out.push(`${colon(ui, label)} ${ps.map((p) => p.name).join(comma)}`)
  }
  if (view.siblings.length) {
    const nm = view.siblings.map((s) => (s.half ? `${s.name} (${t.half[s.g === 2 ? 1 : 0]})` : s.name))
    out.push(`${colon(ui, t.siblingsL)} ${nm.join(comma)}`)
  }
  if (view.groups.length) {
    out.push(colon(ui, t.childrenL))
    const walk = (idx: number[], depth: number) => {
      for (const i of idx) {
        const n = view.nodes[i]!
        out.push(`${'– '.repeat(depth)}${n.name}`)
        if (depth < view.open && n.kids) walk(n.kids, depth + 1)
      }
    }
    const several = view.groups.length > 1
    for (const g of view.groups) {
      if (several) {
        const title = g.with ? t.withP.replace('{x}', g.with.name) : f.g === 2 ? t.noFather : t.noMother
        out.push(`${title} (${g.kids.length})`)
      }
      walk(g.kids, 1)
    }
  }
  return out.join('\n')
}
