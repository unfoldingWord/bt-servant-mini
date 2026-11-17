// The 5M study session's model: which steps a part has, where the learner is, and how a step becomes a sheet and back.
// DOM-free; reads the story's tables (dev.ts `Fixture`) and nothing else.
import { ORDER, type Code, type Fixture, type FxPart, type FxQuestion } from './dev'
import { obsLabel, obsRef, type ObsFacts } from './obs'
import type { Sheet } from './answer'
import { W5 } from './obs5mwords'

export { ORDER }
export type { Code }

export type StepKind = 'block' | 'frame' | 'm1-open' | 'observation' | 'review' | 'translation' | 'question' | 'draft' | 'check' | 'story-level'
/**
 * One screen of the session. `block`/`text`: the heading and body this step shows (an opening card, a `###` section, the shared
 * instruction of drafting/checking); `intro`: a list row's own title and instruction, carried by the first step of that list;
 * `shared`: the `fx.shared` key of a drafting/checking step; `frame`: Mini's OBS ref "1:5" (null for story-level steps).
 */
export type Step = {
  part: Code; at: number; kind: StepKind; frame: string | null
  block?: string; text?: string; intro?: { title: string | null; text: string | null }; shared?: string
  questions: string[]; terms: number[]
}
/**
 * Where a session is. `checked`: the team's marks on the checking cards ([Understood] / [Confusing: revisit frame]) by frame and
 * OBS tQ id; kept in this copy only (never counted, never shown as a count).
 */
export type Session = { story: number; part: Code; at: number; lang: string; tfLang: string; started: number; done: Code[]
  checked?: Record<string, Record<string, 'understood' | 'confusing'>> }
/**
 * What a frame's helps are: its OBS facts (key terms) and the tA articles its notes cite (obs.ts `frameHelps` fills them);
 * `twl`: its word links with their words (a translation term's article is found by them)
 */
export type ObsFrameHelps = { facts: ObsFacts; academy: string[]; twl?: { id: string; words: string }[]; tq?: { id: string; q: string; a: string | null }[] }

type Draft = Omit<Step, 'part' | 'at' | 'questions' | 'terms'> & { questions?: string[]; terms?: number[] }
const finish = (part: Code, ds: Draft[]): Step[] => ds.map((d, at) => ({ ...d, part, at, questions: d.questions ?? [], terms: d.terms ?? [] }))
const intro = (r: FxPart | undefined): Step['intro'] => (r ? { title: r.title, text: r.text } : undefined)
const withIntro = (d: Draft, r: FxPart | undefined): Draft => (r ? { ...d, intro: intro(r) } : d)

/** Markdown cut at its `### ` lines: one block per heading; what comes before the first heading (if any) is a block under `title` */
function blocksOf(title: string | null, text: string | null): { block: string; text: string }[] {
  const t = (text ?? '').trim()
  if (!t) return title ? [{ block: title, text: '' }] : []
  const out: { block: string; text: string }[] = []
  for (const p of t.split(/^(?=### )/m)) {
    const m = /^### (.*)\n?/.exec(p)
    if (m) out.push({ block: m[1]!.trim(), text: p.slice(m[0].length).trim() })
    else if (p.trim()) out.push({ block: title ?? '', text: p.trim() })
  }
  return out
}
/** The blocks of a plain row (its own text, or the shared entry it points to) */
function rowBlocks(fx: Fixture, r: FxPart): Draft[] {
  const sh = r.shared ? fx.shared[r.shared] : null
  return blocksOf(sh ? sh.title : r.title, sh ? sh.text : r.text).map((b) => ({ kind: 'block', frame: null, block: b.block, text: b.text }))
}

/** A frame's questions: those whose first frame it is */
const byFrame = (qs: FxQuestion[], f: string) => qs.filter((q) => q.frames[0] === f).map((q) => q.id)

/** The steps of a part, in the order of the story's `tf-parts` rows */
export function steps(fx: Fixture, part: Code): Step[] {
  const rows = fx.parts.filter((p) => p.part === part)
  if (!rows.length) return []
  const frames = fx.frames.map((f) => f.ref)
  const qs = fx.questions.filter((q) => q.part === part)
  const list = (l: FxPart['list']) => rows.find((r) => r.list === l)
  const head = rows.find((r) => !r.list)
  const opening = (): Draft[] => (head ? [{ kind: 'block', frame: null, block: head.title ?? '', text: head.text ?? '' }] : [])
  switch (part) {
    case 'frames':
      return finish(part, frames.map((f) => ({ kind: 'frame', frame: f })))
    case 'm1': {
      const obs = qs.filter((q) => q.list === 'observation')
      const loose = qs.filter((q) => !q.frames.length).map((q) => q.id)
      const open: Draft[] = head ? [{ kind: 'm1-open', frame: null, block: head.title ?? '', text: head.text ?? '', intro: intro(list('observation')) }] : []
      const out: Draft[] = [
        ...open,
        ...frames.map((f): Draft => ({ kind: 'observation', frame: f, questions: byFrame(obs, f) })),
        { kind: 'review', frame: null },
        ...frames.map((f, i): Draft => withIntro({ kind: 'translation', frame: f, terms: fx.terms.flatMap((t, k) => (t.frame === f ? [k] : [])) }, i === 0 ? list('terms') : undefined)),
      ]
      if (loose.length) out.push({ kind: 'story-level', frame: null, questions: loose })
      return finish(part, out)
    }
    case 'm2': {
      const one = (l: 'discourse' | 'theology'): Draft[] =>
        qs.filter((q) => q.list === l && (l === 'theology' || q.frames.length)).map((q, i) => withIntro({ kind: 'question', frame: q.frames[0] ?? null, questions: [q.id] }, i === 0 ? list(l) : undefined))
      const loose = qs.filter((q) => q.list === 'discourse' && !q.frames.length).map((q) => q.id)
      const out = [...opening(), ...one('discourse'), ...one('theology')]
      if (loose.length) out.push({ kind: 'story-level', frame: null, questions: loose })
      return finish(part, out)
    }
    case 'm3': {
      const j = qs.filter((q) => q.list === 'journal').map((q) => q.id)
      const out = opening()
      if (j.length) out.push(withIntro({ kind: 'story-level', frame: null, questions: j }, list('journal')))
      return finish(part, out)
    }
    case 'drafting':
    case 'checking': {
      const key = rows.find((r) => r.shared)?.shared ?? undefined
      const sh = key ? fx.shared[key] : undefined
      return finish(part, frames.map((f): Draft => ({ kind: part === 'drafting' ? 'draft' : 'check', frame: f, shared: key, block: sh?.title, text: sh?.text })))
    }
    default:
      return finish(part, rows.flatMap((r) => rowBlocks(fx, r)))
  }
}

export const stepAt = (fx: Fixture, s: Session): Step | null => steps(fx, s.part)[s.at] ?? null
export const stepId = (s: Pick<Session, 'story' | 'part' | 'at'>): string => `obs5m:${s.story}/${s.part}/${s.at}`

/** The following step, across parts (parts with no steps are skipped, the part left is marked done); null at the very end */
export function next(fx: Fixture, s: Session): Session | null {
  if (s.at + 1 < steps(fx, s.part).length) return { ...s, at: s.at + 1 }
  for (let i = ORDER.indexOf(s.part) + 1; i < ORDER.length; i++) {
    if (!steps(fx, ORDER[i]!).length) continue
    return { ...s, part: ORDER[i]!, at: 0, done: s.done.includes(s.part) ? s.done : [...s.done, s.part] }
  }
  return null
}
/** The step before, across parts (to the last step of the previous part that has any); null at the very first */
export function prev(fx: Fixture, s: Session): Session | null {
  if (s.at > 0) return { ...s, at: s.at - 1 }
  for (let i = ORDER.indexOf(s.part) - 1; i >= 0; i--) {
    const n = steps(fx, ORDER[i]!).length
    if (n) return { ...s, part: ORDER[i]!, at: n - 1 }
  }
  return null
}
/** Go to a part (its step `at`, kept inside the part) */
export function jump(fx: Fixture, s: Session, part: Code, at = 0): Session {
  return { ...s, part, at: Math.max(0, Math.min(at, steps(fx, part).length - 1)) }
}

/** The call sheet of the step: intent 'obs5m', ref 'obs 1:5' (a frame step) or 'obs 1', concept = the step id. Needs `fx` for the step's frame. */
export function sheetOf(fx: Fixture, s: Session, lang: string): Sheet {
  const f = stepAt(fx, s)?.frame
  const ref = f ? obsRef(s.story, +f.split(':')[1]!) : obsRef(s.story)
  return { id: `f${Date.now()}`, intent: 'obs5m', ref, what: [], version: null, concept: stepId(s), term: null, phrase: null, candidates: null, lang }
}
/** The session behind an obs5m sheet; `base` (the session in progress) gives language, start and done. Null for another sheet or a step that does not exist. */
export function sessionOfSheet(sh: Sheet, fx: Fixture, base: Session | null): Session | null {
  if (sh.intent !== 'obs5m') return null
  const m = /^obs5m:(\d+)\/([a-z0-9]+)\/(\d+)$/.exec(sh.concept ?? '')
  if (!m || !(ORDER as readonly string[]).includes(m[2]!)) return null
  const s: Session = { story: +m[1]!, part: m[2] as Code, at: +m[3]!, lang: base?.lang ?? sh.lang, tfLang: base?.tfLang ?? fx.tfLang, started: base?.started ?? Date.now(), done: base ? [...base.done] : [] }
  return s.story === fx.story && stepAt(fx, s) ? s : null
}

/** Links to offer under a frame: its key terms (tW), the tA articles its notes cite, and the frame itself; none when the OBS unit is missing */
export function frameLinks(helps: ObsFrameHelps | null, frame: string): string[] {
  if (!helps) return []
  const [n, f] = frame.split(':').map(Number)
  return [...new Set([...helps.facts.terms, ...helps.academy, obsRef(n!, f)])]
}

// ----------------------------------------------------------------------------------------------------------- the step card

/**
 * A step's card (pipeline.ts route `obs5m` puts it on `reply.card`; the view draws it). `title`: the part's heading (the manual's,
 * else the part's name); `frame`: the frame's ref ('obs 1:5'), text and image; `blocks`: the manual's markdown as it is in the
 * tables (a `### ` heading, its text), never reworded; `questions`: with the manual's answer `a`, which the view shows only
 * behind [Show answer] and which no text of the answer carries; `terms`: the translation terms, each with its tW article when the
 * frame's word links name it (`concept`), else null; `tfLang`: the language of the manual's rows.
 */
export type Card5 = {
  step: Step; title: string; frame?: { ref: string; text: string; image: string }; blocks: string[]
  questions: { id: string; q: string; a: string | null }[]; terms: { term: string; text: string; concept: string | null }[]; tfLang: string
  /** a checking step: the frame's OBS tQ (from its helps), each a community-check card; its answer, like `questions`', only behind [Show answer] */
  checks?: { id: string; q: string; a: string | null }[]
}
const fill = (t: string, v: Record<string, string | number>): string => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))
const wordsOf = (t: string): string[] => t.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean)
/** The tW article of a translation term: the frame's word link whose words are all in the term (or the term's all in it) */
export function termConcept(term: string, twl: { id: string; words: string }[] | undefined): string | null {
  const t = wordsOf(term)
  for (const x of twl ?? []) {
    const w = wordsOf(x.words)
    if (w.length && t.length && (w.every((a) => t.includes(a)) || t.every((a) => w.includes(a)))) return x.id
  }
  return null
}
/** The card of a session's step (`helps`: the frame's, null when the OBS unit is missing: no term links then) */
export function cardOf(fx: Fixture, s: Session, helps: ObsFrameHelps | null, ui: string): Card5 | null {
  const st = stepAt(fx, s)
  if (!st) return null
  const head = fx.parts.find((p) => p.part === s.part && !p.list)
  const title = head?.title || W5(ui).parts[s.part]
  const blocks: string[] = []
  const add = (h: string | null | undefined, t: string | null | undefined) => {
    if (h && h !== title) blocks.push(`### ${h}`)
    if (t?.trim()) blocks.push(t)
  }
  add(st.block, st.text)
  if (st.intro) add(st.intro.title, st.intro.text)
  const fr = st.frame ? fx.frames.find((f) => f.ref === st.frame) : undefined
  const n = st.frame ? +st.frame.split(':')[1]! : 0
  const byId = new Map(fx.questions.map((q) => [q.id, q]))
  return {
    step: st, title, blocks, tfLang: s.tfLang,
    ...(fr ? { frame: { ref: obsRef(s.story, n), text: fr.text, image: fr.image } } : {}),
    questions: st.questions.flatMap((id) => { const q = byId.get(id); return q ? [{ id, q: q.q, a: q.a }] : [] }),
    terms: st.terms.flatMap((k) => { const t = fx.terms[k]; return t ? [{ term: t.term, text: t.text, concept: termConcept(t.term, helps?.twl) }] : [] }),
    ...(st.kind === 'check' ? { checks: (helps?.tq ?? []).map((x) => ({ ...x })) } : {}),
  }
}
/**
 * Where a step is, in the app's language: "Movement 1 · observation · frame 5/16" (a frame's step), "Movement 2 · question 2/7"
 * (a question's), "Introduction · text" (the others). The bar, the marker, the next step's button and the way back say it.
 */
export function stepPlace(fx: Fixture, s: Session, ui: string): string {
  const st = stepAt(fx, s)
  const w = W5(ui)
  const v = { part: w.parts[s.part], kind: st ? w.kinds[st.kind] : '' }
  if (st?.kind === 'question') {
    const qs = steps(fx, s.part).filter((x) => x.kind === 'question')
    return fill(w.placeQuestion, { ...v, n: qs.findIndex((x) => x.at === st.at) + 1, of: qs.length })
  }
  if (st?.frame) return fill(w.place, { ...v, n: +st.frame.split(':')[1]!, of: fx.frames.length })
  return fill(w.placeNoFrame, v)
}
/** A step as a point of the Map, short: "OBS 1 · M1 · f5", "OBS 1 · Introduction · Key Idea" */
export function stepShort(fx: Fixture, s: Session, ui: string): string {
  const st = stepAt(fx, s)
  const part = /^m\d$/.test(s.part) ? s.part.toUpperCase() : W5(ui).parts[s.part]
  const tail = st?.frame ? `f${st.frame.split(':')[1]}` : st?.block || (st ? W5(ui).kinds[st.kind] : String(s.at + 1))
  return `${obsLabel(s.story)} · ${part} · ${tail}`
}
