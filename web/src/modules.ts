// The parts of a language (Bible, Key Words, Translation Academy, original text, Bible Stories), told from its units.
// No DOM and no fetch: the screens (resources.ts) and the offers (packs.ts) read what a language has through these functions.
// The user never sees the word "unit"; the parts are what the screen names.
import { CANON } from './canon'

export type PartId = 'bible' | 'tw' | 'ta' | 'orig' | 'obs'

/** In screen order (the 5M session goes after `obs`: it is no unit, it rides in `obs`). `orig` is never downloaded on its own. */
export const PARTS: readonly { id: PartId; units: (u: string) => boolean; addable: boolean }[] = [
  { id: 'bible', units: (u) => u.startsWith('book:'), addable: true },
  { id: 'tw', units: (u) => /^art:tw:(kt|names|other)$/.test(u), addable: true },
  { id: 'ta', units: (u) => /^art:ta:(intro|process|translate|checking)$/.test(u), addable: true },
  { id: 'orig', units: (u) => u.startsWith('orig:'), addable: false },
  { id: 'obs', units: (u) => u === 'obs', addable: true },
]

/**
 * have: all it lists is installed (n: books, manuals…); missing: the catalog lists units the phone lacks; absent: it lists none.
 * For `orig`, absent also means "listed, none installed": the screen shows it only when have and never prints "not for this language" for it.
 */
export type PartLine = { id: PartId; state: 'have' | 'missing' | 'absent'; n?: number; missing: string[]; bytes: number }
type Reader = { listed(u: string): boolean; installed(u: string): boolean; size(u: string): number }

// What a catalog may list for each part (the reader cannot give its list of units, so it is asked about each one)
const FIXED: Record<PartId, () => string[]> = {
  bible: () => CANON.map((b) => `book:${b}`),
  tw: () => ['art:tw:kt', 'art:tw:names', 'art:tw:other'],
  ta: () => ['art:ta:intro', 'art:ta:process', 'art:ta:translate', 'art:ta:checking'],
  orig: () => CANON.map((b) => `orig:${b}`),
  obs: () => ['obs'],
}

/** The parts of a language the phone downloaded, against its stored catalog. */
export function partsOfReader(r: Reader): PartLine[] {
  return PARTS.map((p) => {
    const all = FIXED[p.id]()
    // an installed unit the catalog no longer lists still counts as installed
    const have = all.filter((u) => r.installed(u))
    const missing = p.addable ? all.filter((u) => r.listed(u) && !r.installed(u)) : []
    if (!have.length && !missing.length) return { id: p.id, state: 'absent' as const, missing: [], bytes: 0 }
    if (!missing.length) return { id: p.id, state: 'have' as const, n: have.length, missing: [], bytes: 0 }
    return { id: p.id, state: 'missing' as const, n: have.length, missing, bytes: missing.reduce((n, u) => n + (r.size(u) || 0), 0) }
  })
}

/** The parts a list of units brings (a language that comes with the app; an offer): only what is there, never missing or absent. */
export function partsOfUnits(units: readonly string[]): PartLine[] {
  const out: PartLine[] = []
  for (const p of PARTS) {
    // same count as partsOfReader: only the units it would ask about (book:xyz and art:ta:foo are no part's)
    const known = new Set(FIXED[p.id]())
    const n = units.filter((u) => known.has(u)).length
    if (n) out.push({ id: p.id, state: 'have', n, missing: [], bytes: 0 })
  }
  return out
}

/** The 5M session line: whether it shows (the switch is on and some story is covered) and how many stories. The screen words it. */
export function fiveLine(on: boolean, n: number): { n: number } | null {
  return on && n > 0 ? { n } : null
}
