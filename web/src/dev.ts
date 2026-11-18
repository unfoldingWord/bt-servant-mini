// The 5M study session's tables as the session reads them (`Fixture`), and the built-in story 1 of phase 0, which only the tests
// use (five.ts reads the packs; there is no dev switch any more: a phone without a pack with the tables has no 5M).
import type { Source5 } from './five'

/** The parts of a 5M session, in order (phase 0's `codes.parts`) */
export const ORDER = ['intro', 'frames', 'community', 'm1', 'm2', 'drafting', 'm3', 'checking', 'm4', 'm5', 'conclusion'] as const
export type Code = (typeof ORDER)[number]

export type FxList = 'observation' | 'terms' | 'discourse' | 'theology' | 'journal'
/** Frame refs are Mini's OBS refs, "1:5" (see obs.ts `obsRef`) */
export type FxQuestion = { id: string; part: Code; list: FxList; frames: string[]; q: string; a: string | null }
export type FxTerm = { frame: string; k: number; term: string; text: string }  // text verbatim (guidance with the bold term)
export type FxPart = { part: Code; list: FxList | null; title: string | null; text: string | null; shared: string | null }  // one tf-parts row, in file order
export type Fixture = {
  story: number; title: string; reference: string
  frames: { ref: string; text: string; image: string }[]
  parts: FxPart[]; shared: Record<string, { title: string; text: string }>
  questions: FxQuestion[]; terms: FxTerm[]; tfLang: string; release?: string
}

type Raw = {
  obs: { title: string; reference: string; frames: { id: number; ref: string; text: string; image: string }[] }
  'tf-parts': { part: Code; list?: FxList; title?: string; text?: string; shared?: string }[]
  'tf-questions': { id: string; part: Code; list: FxList; frames: { id: number; ref: string }[]; q: string; a?: string | null }[]
  'tf-terms': { frame: number; k: number; term: string; text: string; ref: string }[]
  'tf-shared': { key: string; title: string; text: string }[]
}

/** The file is read when asked, never bundled: a fetch in the page (served beside it, dev builds only), the file itself under bun */
async function readRaw(): Promise<Raw> {
  if (typeof (globalThis as any).Bun !== 'undefined') return JSON.parse(await (globalThis as any).Bun.file(new URL('./data/dev/obs5m-story1.json', import.meta.url)).text())
  const r = await fetch('dev/obs5m-story1.json')
  if (!r.ok) throw new Error(`dev/obs5m-story1.json: ${r.status}`)
  return r.json()
}

/** Story 1's phase 0 tables as the session reads them: renames only, nothing is parsed */
export async function loadFixture(): Promise<Fixture> {
  const raw = await readRaw()
  const ref = new Map(raw.obs.frames.map((f) => [f.id, f.ref]))
  const of = (id: number): string => ref.get(id) ?? ''
  return {
    story: 1, title: raw.obs.title, reference: raw.obs.reference, tfLang: 'en',
    frames: raw.obs.frames.map((f) => ({ ref: f.ref, text: f.text, image: f.image })),
    parts: raw['tf-parts'].map((p) => ({ part: p.part, list: p.list ?? null, title: p.title ?? null, text: p.text ?? null, shared: p.shared ?? null })),
    shared: Object.fromEntries(raw['tf-shared'].map((s) => [s.key, { title: s.title, text: s.text }])),
    questions: raw['tf-questions'].map((q) => ({ id: q.id, part: q.part, list: q.list, frames: q.frames.map((f) => of(f.id)), q: q.q, a: q.a ?? null })),
    terms: raw['tf-terms'].map((t) => ({ frame: of(t.frame), k: t.k, term: t.term, text: t.text })),
  }
}

/** The tests' source: story 1 of phase 0, as an English pack would give it */
export const fixtureSource = (): Source5 => ({
  coverage: async () => new Map([[1, ['en']]]),
  session: async (n) => (n === 1 ? loadFixture() : null),
})
