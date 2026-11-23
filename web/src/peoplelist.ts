// The people of the packs as Browse lists and searches them (explorepeople.ts draws it; nothing here touches the page, so bun tests it).
// One list per pack, built once from the people index kin.ts keeps (`peopleById`: it reads no core, `PersonEntry.verses` is there already):
// the persons with a real name, the most named first, each with its names folded as kin.ts folds them. The list is keyed on that
// index, so when kin.ts builds a new one (a change of packs: resetKin) the list is made again, and the old one is let go.
import type { PersonEntry } from '@bt-synergy/language-pack-client'
import { foldName, peopleById, personOf, shownAs, tiesLine, tiesOfPerson, versesCount, type Tie } from './kin'

/** The rows Browse shows at most: never the whole list in the page. */
export const LIST_MAX = 30

type Entry = { id: string; name: string; gender?: 1 | 2; verses: number; folded: string[]; key: string }
const lists = new WeakMap<Map<string, PersonEntry>, Entry[]>()

/** A name the data keeps for a person it has no name for ("Unnamed#9", `a_wife_of_Lot`): not one a person looks for (as the tree decides it, tree.ts). */
export const rawName = (n: string): boolean => /^Unnamed#/i.test(n) || n.includes('_')

/** The persons of a pack with a real name, the most named first (ties by id, so the order is the same on every phone); [] when the pack has no people. */
export async function peopleList(pack: string): Promise<Entry[]> {
  return (await listOf(pack)) ?? []
}
/** null: the pack's people could not be read (kin.ts has none for it). */
async function listOf(pack: string): Promise<Entry[] | null> {
  const by = await peopleById(pack)
  if (!by) return null
  let l = lists.get(by)
  if (!l) {
    l = []
    for (const e of by.values()) {
      // (a raw own name: the first real one it is also found by is its name; with none, it is not in the list)
      const name = e.name && !rawName(e.name) ? e.name : e.names.find((n) => n && !rawName(n))
      if (!name) continue
      const folded = [...new Set(e.names.filter((n) => n && !rawName(n)).map(foldName).filter(Boolean))]
      if (!folded.length) continue
      l.push({ id: e.id, name, gender: e.gender, verses: e.verses, folded, key: foldName(name) })
    }
    l.sort((a, b) => b.verses - a.verses || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    lists.set(by, l)
  }
  return l
}

/** One row of the list. `inLang`: the pack it was found in when that is not the first one given (the app's language). `dup`: another row has the same name. */
export type PersonRow = { pack: string; id: string; name: string; gender?: 1 | 2; verses: number; inLang?: string; dup: boolean }
export type PeopleFound = { rows: PersonRow[]; more: boolean }

/**
 * Without a query: the most named people of the first pack (of those given, the ones with a people index built). With one: the people
 * whose name, or any other name they are found by, begins with it (folded: without marks, case or an Arabic article), in each pack in
 * order and joined by `id`: a person is shown in the first pack that has it, and the others add only who the first does not have.
 * Up to LIST_MAX; `more`: there were others (the person types more to narrow it). No transliteration.
 */
export async function findPeople(packs: string[], query: string): Promise<PeopleFound> {
  const q = foldName(query)
  const rows: PersonRow[] = []
  let more = false
  const seen = new Set<string>()
  let read = 0
  for (const [i, pack] of packs.entries()) {
    const got = await listOf(pack)
    if (got) read++
    const list = got ?? []
    if (!q) {
      // (the first pack with people: the list alone, from one language)
      if (!list.length) continue
      for (const e of list) {
        if (rows.length >= LIST_MAX) { more = true; break }
        rows.push({ pack, id: e.id, name: e.name, gender: e.gender, verses: e.verses, dup: false })
      }
      break
    }
    for (const e of list) {
      if (seen.has(e.id) || !e.folded.some((f) => f.startsWith(q))) continue
      seen.add(e.id)
      if (rows.length >= LIST_MAX) { more = true; continue }
      rows.push({ pack, id: e.id, name: e.name, gender: e.gender, verses: e.verses, ...(i > 0 ? { inLang: pack } : {}), dup: false })
    }
  }
  // (the packs given have people: none that can be read now is a failure, not «nobody»)
  if (packs.length && !read) throw new Error('people unreadable')
  const names = new Map<string, number>()
  for (const r of rows) names.set(foldName(r.name), (names.get(foldName(r.name)) ?? 0) + 1)
  for (const r of rows) r.dup = (names.get(foldName(r.name)) ?? 0) > 1
  return { rows, more }
}

/** The line under a person's name when it is not enough (the same name as another row): how they are tied to someone known ("hijo de Isaac"), else how many verses name them. */
export async function tieLine(ui: string, row: Pick<PersonRow, 'pack' | 'id' | 'gender' | 'verses'>): Promise<string> {
  const ties = await tiesOfPerson(row.pack, row.id).catch(() => [] as Tie[])
  const names = new Map<string, string>()
  for (const x of ties.flatMap((t) => t.ids)) {
    const p = await personOf(row.pack, x)
    names.set(x, await shownAs(row.pack, x, p?.name ?? x).catch(() => p?.name ?? x))
  }
  const text = tiesLine(ui, row.gender, ties, (x) => names.get(x) ?? x)
  return text || (row.verses > 0 ? versesCount(ui, row.verses) : '')
}

/** The line under every row: how many verses name the person (what is known of each, in a word), and the language when it is not the first. */
export const verseLine = (ui: string, row: Pick<PersonRow, 'verses'>): string => (row.verses > 0 ? versesCount(ui, row.verses) : '')
