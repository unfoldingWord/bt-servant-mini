// Where each 5M session is, kept on the phone so it can be resumed from another conversation (`btsm.5m.v1`, 5M from the packs
// `obs5m`). One entry per story: the conversation it lives in, the session's place (part, step, parts done, languages, start)
// and the team's checking marks, the time it was last used, and whether the team ended it. Never an answer of the manual,
// never a note (notes are saved.ts', tied to the step id). Like the conversations it is kept only while menu > Safety keeps
// them (`keepHistory`), it goes with "Erase everything", and the PIN covers what shows it. Every read and write is in try/catch.
import type { ConvState } from './pipeline'
import { type Code, ORDER, type Session } from './obs5m'
import { newGraph } from './graph'

export const KEY5 = 'btsm.5m.v1'
/** One story's saved place: `s` its session, `conv` the conversation it was in, `ended` the team pressed [End session] */
export type Saved5 = { story: number; conv: string; s: Session; updated: number; ended?: boolean }
type Entry = Omit<Saved5, 'story'>

// (protect.ts keepHistory, read here directly: protect.ts brings the model's code with it)
const keep = (): boolean => {
  try {
    return localStorage.getItem('btsm.history') !== 'none'
  } catch {
    return false
  }
}
function read(): Record<string, Entry> {
  try {
    const d = JSON.parse(localStorage.getItem(KEY5) ?? 'null')
    return d && d.v === 1 && d.stories && typeof d.stories === 'object' ? d.stories : {}
  } catch {
    return {}
  }
}
function write(stories: Record<string, Entry>) {
  try {
    localStorage.setItem(KEY5, JSON.stringify({ v: 1, stories }))
  } catch {}
}
/** The session's place and marks only (nothing else a Session may carry is kept); null when the entry is not a session */
function placeOf(s: Session): Session | null {
  try {
    if (!s || typeof s !== 'object' || !(ORDER as readonly string[]).includes(s.part) || !Number.isInteger(s.at) || !Number.isInteger(s.story)) return null
    if (typeof s.lang !== 'string' || typeof s.tfLang !== 'string' || !Array.isArray(s.done)) return null
    const done = s.done.filter((p): p is Code => (ORDER as readonly string[]).includes(p as string))
    const out: Session = { story: s.story, part: s.part, at: s.at, lang: s.lang, tfLang: s.tfLang, started: +s.started || Date.now(), done }
    if (s.checked && typeof s.checked === 'object') {
      const c: NonNullable<Session['checked']> = {}
      for (const [f, m] of Object.entries(s.checked)) {
        const marks: Record<string, 'understood' | 'confusing'> = {}
        for (const [id, v] of Object.entries(m ?? {})) if (v === 'understood' || v === 'confusing') marks[id] = v
        c[f] = marks
      }
      out.checked = c
    }
    return out
  } catch {
    return null
  }
}

/** Keeps where the session is (after each answer of a conversation that has one); nothing when conversations are not kept */
export function saveSession(convId: string, s: Session): void {
  if (!keep()) return
  try {
    const p = placeOf(s)
    if (!p) return
    const all = read()
    all[String(s.story)] = { conv: convId, s: p, updated: Date.now() }
    write(all)
  } catch {}
}
/** The saved sessions, the most recently used first; none when conversations are not kept */
export function savedSessions(): Saved5[] {
  if (!keep()) return []
  try {
    const out: Saved5[] = []
    for (const [k, e] of Object.entries(read())) {
      try {
        const s = e && typeof e.conv === 'string' ? placeOf(e.s) : null
        if (s) out.push({ story: +k, conv: e.conv, s, updated: +e.updated || 0, ...(e.ended ? { ended: true } : {}) })
      } catch {}
    }
    return out.sort((a, b) => b.updated - a.updated)
  } catch {
    return []
  }
}
/** "Erase everything", or conversations no longer kept: the saved places go */
export function forgetSessions(): void {
  try {
    localStorage.removeItem(KEY5)
  } catch {}
}

/**
 * [End session] (the outline): the conversation leaves the session (`g.session` cleared, so its light path or learning path
 * offers its buttons again: `pathPaused` cleared, the path itself was never touched). The saved place stays, marked ended: it
 * can still be resumed. The team's notes are untouched (saved.ts).
 */
export function endSession(c: ConvState): void {
  const g = c.graph
  const s = g?.session
  if (!g) return
  delete g.session
  delete g.pathPaused
  if (!s || !keep()) return
  try {
    const all = read()
    const e = all[String(s.story)]
    if (e) {
      e.ended = true
      write(all)
    }
  } catch {}
}

/**
 * Where [Resume] goes: the conversation it was in, if it is still there (`open`); else an empty conversation (`empty`), else a
 * new one when there is room (`new`, the app keeps `max`), else the conversation on screen (`here`): the place is resumed, the
 * earlier consultations are gone.
 */
export function resumeTarget(conv: string, convs: { id: string; empty: boolean }[], current: string, max: number):
  { k: 'open' | 'empty'; id: string } | { k: 'new' } | { k: 'here' } {
  if (convs.some((c) => c.id === conv)) return { k: 'open', id: conv }
  const empty = convs.find((c) => c.id === current && c.empty) ?? convs.find((c) => c.empty)
  if (empty) return { k: 'empty', id: empty.id }
  if (convs.length < max) return { k: 'new' }
  return { k: 'here' }
}
/** The saved session put back into a conversation, before its step is asked again (its parts done, start and marks are kept) */
export function resumeIn(c: ConvState, s: Session): void {
  const g = (c.graph ??= newGraph())
  g.session = placeOf(s) ?? undefined
  g.pathPaused = !!g.path
  delete g.pathNext
}

// ---- the answers the team revealed, by conversation and card (the step's point). In memory only: never saved, so a reload
// forgets them. A card always draws hidden, so a redraw, [End session] or "Erase everything" forgets its reveals too (R: reveals
// never outlive the card): what share and the online context carry is only what the card on screen shows.
const revealed5 = new Map<string, Set<string>>()
export function revealOn(conv: string, node: string, id: string, shown: boolean): void {
  const k = `${conv}|${node}`
  const set = revealed5.get(k) ?? new Set<string>()
  if (shown) set.add(id)
  else set.delete(id)
  revealed5.set(k, set)
}
/** The question ids revealed on one card */
export const revealedOn = (conv: string, node: string): Set<string> => new Set(revealed5.get(`${conv}|${node}`) ?? [])
/** The question ids revealed on any card of a conversation */
export const revealedIn = (conv: string): Set<string> => new Set([...revealed5].flatMap(([k, v]) => (k.startsWith(`${conv}|`) ? [...v] : [])))
/** A card is drawn again (hidden): its reveals go */
export const forgetCard = (conv: string, node: string): void => void revealed5.delete(`${conv}|${node}`)
/** [End session]: the conversation's reveals go */
export function forgetReveals(conv: string): void {
  for (const k of [...revealed5.keys()]) if (k.startsWith(`${conv}|`)) revealed5.delete(k)
}
/** "Erase everything" */
export const forgetAllReveals = (): void => revealed5.clear()
