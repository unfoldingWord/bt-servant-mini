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
