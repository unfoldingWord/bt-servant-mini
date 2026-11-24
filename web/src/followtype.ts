// The type of a next-step button (follow-ups grouped by type): worked out when the row is drawn, from the fields the button
// already has, so nothing is stored and a conversation saved before still draws. No DOM here, so it is tested under bun.
import { type Followup, splitFollow } from './converse'

export const FOLLOW_TYPES = ['continue', 'read', 'understand', 'people', 'places', 'actions'] as const
export type FollowType = (typeof FOLLOW_TYPES)[number]

/**
 * continue: the next step of a path or a session (and the ways back to one), a way back, "Try again", a unit to add (it is asked
 *   again after it); read: a passage, a chapter, a story, the 5M session of one, a book or a list of stories in Browse;
 *   understand: an article (Translation Words or Academy), a manual in Browse, a passage asked only for its helps (no text),
 *   a count, a ranking, advice; people: the family data (kin); places: the place data; actions: the guide, a typed question, the rest.
 */
export function followType(f: Followup): FollowType {
  try {
    if (f.pathNext || f.sessionNext || f.toPath || f.toSession || f.back || f.again || f.add) return 'continue'
    if (f.howto || f.typed) return 'actions'
    if (f.browse) return f.browse.manual ? 'understand' : 'read'
    switch (f.sheet?.intent) {
      case 'passage': {
        const w = f.sheet.what
        return Array.isArray(w) && w.length && !w.includes('text') ? 'understand' : 'read'
      }
      case 'obs5m': return 'read'
      case 'article': case 'count': case 'advice': case 'search': case 'choose': return 'understand'
      case 'kin': return 'people'
      case 'place': return 'places'
    }
  } catch { /* an old or odd button: the safest type */ }
  return 'actions'
}

/** The buttons in the order of their types; inside a type, the order they came in (a stable sort). */
export function sortByType(follow: Followup[]): Followup[] {
  const rank = new Map<FollowType, number>(FOLLOW_TYPES.map((t, i) => [t, i]))
  return follow.map((f, i) => ({ f, i, r: rank.get(followType(f))! })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.f)
}
/** The buttons one type after another: [type, buttons] in the order of the types. */
export function groupByType(follow: Followup[]): { type: FollowType; items: Followup[] }[] {
  const out: { type: FollowType; items: Followup[] }[] = []
  for (const f of sortByType(follow)) {
    const t = followType(f)
    const last = out[out.length - 1]
    if (last && last.type === t) last.items.push(f)
    else out.push({ type: t, items: [f] })
  }
  return out
}

/**
 * What followRow draws: the buttons in sight and the ones behind "More", in groups. What is in sight is chosen by splitFollow on
 * the ORIGINAL order (so the set is the one it always was); only then are the buttons put in the order of their types. A group
 * has a `title` unless it continues the type of the last button in sight (the same title is not said twice).
 */
export function layoutFollow(follow: Followup[], backs: number): { shown: Followup[]; groups: { type: FollowType; title: boolean; items: Followup[] }[] } {
  const { shown, more } = splitFollow(follow, backs)
  const sorted = sortByType(shown)
  const last = sorted.length ? followType(sorted[sorted.length - 1]!) : null
  const groups = groupByType(more).map((g, i) => ({ ...g, title: !(i === 0 && g.type === last) }))
  return { shown: sorted, groups }
}

/** The titles of the types, shown only over the buttons behind "More" (the app's language; English for any other). */
const TITLES: Record<string, Record<FollowType, string>> = {
  en: { continue: 'Continue', read: 'Read', understand: 'Understand', people: 'People', places: 'Places', actions: 'Actions' },
  es: { continue: 'Continuar', read: 'Leer', understand: 'Entender', people: 'Personas', places: 'Lugares', actions: 'Acciones' },
  fr: { continue: 'Continuer', read: 'Lire', understand: 'Comprendre', people: 'Personnes', places: 'Lieux', actions: 'Actions' },
  id: { continue: 'Lanjutkan', read: 'Baca', understand: 'Pahami', people: 'Orang', places: 'Tempat', actions: 'Tindakan' },
  hi: { continue: 'जारी रखें', read: 'पढ़ें', understand: 'समझें', people: 'लोग', places: 'स्थान', actions: 'कार्रवाइयाँ' },
  ar: { continue: 'متابعة', read: 'قراءة', understand: 'فهم', people: 'أشخاص', places: 'أماكن', actions: 'إجراءات' },
}
export const followTitle = (ui: string, t: FollowType): string => (TITLES[ui.split('-')[0]!] ?? TITLES.en!)[t]

/** Line icons (24x24, stroke), one per type; decorative. */
export const FOLLOW_ICONS: Record<FollowType, string> = {
  continue: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
  read: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 0 4 21.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 1 1.5 1.5z"/>',
  understand: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.7.6 1 1.3 1 2.1h5c0-.8.3-1.5 1-2.1A6 6 0 0 0 12 3z"/>',
  people: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
  places: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  actions: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
}
/** The icon as markup (the same attributes as main.ts svg(): a line icon in the text's color, hidden from screen readers). */
export const followIcon = (t: FollowType, size = 16): string =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${FOLLOW_ICONS[t]}</svg>`
