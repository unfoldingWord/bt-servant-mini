// Where the 5M study session's tables come from: the installed packs' `obs` unit (format 3: `reader.obsSession(n)`), one story at
// a time, as the `Fixture` the session reads (dev.ts types). No pack with the tables = no 5M: there is no built-in story and no
// dev switch. `on5m()` is the one sync question the app asks ("does this phone have 5M?"); it is true once `refresh5()` found
// a pack with the tables (the app asks at its start and after each pack change). Tests plug a source in with `setSource5`.
import type { Fixture, FxList, FxPart, Code } from './dev'
import { installedLangs, onPacksChanged, openLang } from './packs'

/** What the 5M session reads from: the stories that have a session, and one story's tables */
export type Source5 = {
  /** Stories with a session in some installed pack, with the language of each (the manual's language) */
  coverage(): Promise<Map<number, string[]>>
  /** One story's tables; `prefer`: the language to read it in first (else the first pack that has it, English first) */
  session(n: number, prefer?: string | null): Promise<Fixture | null>
}

/** The bits of the client's `TfSessionData` this reads (language-pack-client `obsSession`) */
type TfSession = {
  story: number; title: string; reference?: string; release: string
  frames: { n: number; text: string; image?: string }[]
  parts: { code: string; title?: string; text?: string; block?: { key: string; title: string; text?: string }
    lists: { code: string; title?: string; text?: string; questions: { id: string; q: string; a?: string; frames: number[] }[]
      terms: { frame: number; terms: { id: string; term?: string; text: string }[] }[] }[] }[]
}

/** One story of a pack as the session's tables. Frames are Mini's OBS refs ("1:5"); a question's frames come as numbers of the story. */
export function fixtureOfSession(s: TfSession, lang: string): Fixture {
  const ref = (f: number): string => `${s.story}:${f}`
  const fx: Fixture = {
    story: s.story, title: s.title, reference: s.reference ?? '', tfLang: lang, release: s.release,
    frames: s.frames.map((f) => ({ ref: ref(f.n), text: f.text, image: f.image ?? '' })),
    parts: [], shared: {}, questions: [], terms: [],
  }
  for (const p of s.parts) {
    // (a part that has lists but no heading row of its own has no heading step: the client's empty row is left out)
    if (p.block) fx.shared[p.block.key] = { title: p.block.title, text: p.block.text ?? '' }
    if (p.lists.length === 0 || p.title !== undefined || p.text !== undefined || p.block)
      fx.parts.push({ part: p.code as Code, list: null, title: p.title ?? null, text: p.text ?? null, shared: p.block?.key ?? null })
    for (const l of p.lists) {
      fx.parts.push({ part: p.code as Code, list: l.code as FxList, title: l.title ?? null, text: l.text ?? null, shared: null })
      for (const q of l.questions) fx.questions.push({ id: q.id, part: p.code as Code, list: l.code as FxList, frames: q.frames.map((f) => ref(f % 100)), q: q.q, a: q.a ?? null })
      for (const g of l.terms) for (const t of g.terms) fx.terms.push({ frame: ref(g.frame % 100), k: +(t.id.split('/')[1] ?? 0), term: t.term ?? '', text: t.text })
    }
  }
  return fx
}

/** Installed packs that carry the 5M tables, English first (the only language with the manual so far) */
const order = async (prefer?: string | null): Promise<string[]> => {
  const have = await installedLangs().catch(() => [] as string[])
  const first = [prefer, 'en'].filter((l): l is string => !!l && have.includes(l))
  return [...new Set([...first, ...have])]
}

const fromPacks: Source5 = {
  async coverage() {
    const out = new Map<number, string[]>()
    for (const l of await order()) {
      try {
        const tf = (await (await openLang(l)).obs())?.tf
        for (const n of tf?.stories ?? []) out.set(n, [...(out.get(n) ?? []), l])
      } catch {}
    }
    return out
  },
  async session(n, prefer) {
    for (const l of await order(prefer)) {
      try {
        const s = await (await openLang(l)).obsSession(n)
        if (s) return fixtureOfSession(s as TfSession, l)
      } catch {}
    }
    return null
  },
}

let src: Source5 = fromPacks
let covered: Map<number, string[]> = new Map()
let cache = new Map<string, Promise<Fixture | null>>()
let gen = 0 // changes with every refresh: a read that started before it does not leave its tables behind
const now = new Map<string, Fixture>() // `story|language the tables came in` (a story read in English never answers for Indonesian)
const last = new Map<number, Fixture>() // the story's tables as last read, for a caller that names no language
/** The language a story's tables come in when `prefer` is asked: it, else English, else the first pack that has the story (same rule as `order`) */
const pick = (n: number, prefer?: string | null): string => {
  const have = covered.get(n)
  if (!have?.length) return prefer ?? ''
  return [prefer, 'en'].find((l): l is string => !!l && have.includes(l)) ?? have[0]!
}

/** Does this phone have 5M (some installed pack carries the tables)? Sync: what `refresh5` last found. */
export const on5m = (): boolean => covered.size > 0
/** The stories that have a session, in order */
export const covered5 = (): number[] => [...covered.keys()].sort((a, b) => a - b)
/**
 * Looks for the tables again (at the app's start, after a pack is added or removed); resolves to whether 5M is on. When the
 * stories and the packs that carry them are the same as before, what was read stays (nothing flickers; the manual's release is
 * fixed, so the same coverage is the same tables); `force` reads everything again.
 */
export async function refresh5(force = false): Promise<boolean> {
  const mine = src
  const next = await mine.coverage().catch(() => new Map<number, string[]>())
  if (mine !== src) return covered.size > 0 // (the source was changed meanwhile: that change decides)
  const key = (m: Map<number, string[]>) => JSON.stringify([...m].sort((x, y) => x[0] - y[0]))
  if (force || key(next) !== key(covered)) {
    gen++
    cache = new Map()
    now.clear(); last.clear()
    covered = next
  }
  return covered.size > 0
}
/** The pack tables of a story (read once per story and language); null when no pack has it */
export function fixtureOf5(n: number, prefer?: string | null): Promise<Fixture | null> {
  const k = `${n}|${pick(n, prefer)}`
  let p = cache.get(k)
  if (!p) {
    const g = gen
    p = src.session(n, prefer).then((f) => { if (f && g === gen) { now.set(`${n}|${f.tfLang}`, f); now.set(k, f) } return f }, () => { if (g === gen) cache.delete(k); return null })
    cache.set(k, p)
  }
  // (what a story was last asked for, also from the cache: the labels that know no language read it)
  const g = gen
  void p.then((f) => { if (f && g === gen) last.set(n, f) })
  return p
}
/**
 * A story's tables if read already (labels and the composer cannot wait); null before. `lang`: the language they were asked in
 * (a session's `tfLang`, a sheet's `lang`): only tables that came in the language that asks resolves to; without it, the last read.
 */
export const fixtureNow5 = (n: number, lang?: string | null): Fixture | null => lang ? now.get(`${n}|${pick(n, lang)}`) ?? null : last.get(n) ?? null
/** Tests: another source (null: the packs again); the caches go */
export function setSource5(s: Source5 | null): void {
  src = s ?? fromPacks
  gen++
  cache = new Map(); now.clear(); last.clear(); covered = new Map()
}

onPacksChanged(() => { void refresh5().then(() => { for (const f of listeners) f() }) })
const listeners: (() => void)[] = []
/** Called when a pack change found a different answer (the screens that show 5M draw again) */
export const onFive = (f: () => void): void => void listeners.push(f)
