// Runs a question through the app's own decisions (web/src/pipeline.ts) with no browser and no model: the slots a reader
// would give are part of the case (gold slots, or none = code only), or the case starts from a gold call sheet.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ALL_PACKS, installPacks } from './fs-packs'
import { answer, env, type ConvState, type Made, questionOf, readQuestion } from '../src/pipeline'
import type { Sheet } from '../src/answer'
import type { Slots } from '../src/sheet'

/** What a case expects of the answer. `route` may list several; `ref`/`concept` are the answer's target; `has` are regexes. */
export type Expect = {
  route?: string | string[]; ref?: string | null; concept?: string | null; has?: string[]; not?: string[]
  /** false: an answer that finds nothing is right (an article that does not exist, the weather) */
  useful?: boolean
  /** not this verse (an ordinal must not pick an earlier search result) */
  notRef?: string
  /** not an article matching this regex (a question the academy route must leave alone) */
  notConcept?: string
  /** not this kind of answer ("I want to translate Jonah's prayer" is not the book's introduction) */
  notRoute?: string
  /** next-step buttons the answer must offer: each regex matches a button's target ("jon 1", "ta:translate/translate-names", "browse") */
  follow?: string[]
}
export type Turn = { q: string; slots?: Slots | null; sheet?: Sheet }
export type Case = Turn & {
  id: string; set: string; lang: string; from?: string
  /** turns before this one, in the same conversation */
  before?: Turn[]
  expect: Expect
  /** expected to fail today (why): reported, never fails the build */
  known?: string
}

export function loadCases(file: string): Case[] {
  return readFileSync(join(import.meta.dir, 'cases', file), 'utf-8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
}

/** route: the kind of answer (passage, article, search, meaning…); step: the route-table step that gave it */
export type Outcome = {
  route: string; step: string; ref: string | null; concept: string | null; text: string; found: number; useful: boolean; reply: unknown
}

let installed = ''
/** The full build: every pack on disk. */
export async function fullPhone() {
  if (installed === 'all') return
  await installPacks(ALL_PACKS)
  installed = 'all'
}

/** One turn as main.ts runs it: the question, the reading step (from slots) or a ready sheet, then the answer. */
export async function turn(c: ConvState, t: Turn, lang: string) {
  env.nav = lang
  const { q, target } = questionOf(t.q, c)
  const made: Made = t.sheet
    ? { sheet: { ...t.sheet, id: 'gold' }, ui: lang, meta: '(gold sheet)', q }
    : await readQuestion(q, { slots: t.slots ? { ...t.slots } : null, raw: '', ms: 0 }, c, target)
  return answer(c, made, performance.now())
}

export async function runCase(k: Case): Promise<Outcome> {
  await fullPhone()
  const c: ConvState = { last: null }
  for (const b of k.before ?? []) await turn(c, b, k.lang)
  const r = await turn(c, k, k.lang)
  const m = r.reply
  const text = [m.intro ?? '', m.info ?? '', ...(m.helps ?? []).flatMap((g) => [g.head, ...g.items.map((i) => `${i.ref} ${i.snippet}`)]), m.text ?? ''].join('\n')
  return {
    route: r.answered, step: r.route, ref: r.ref, concept: r.concept, text, found: r.found, useful: r.found > 0, reply: m,
  }
}

const asList = (v: string | string[]) => (Array.isArray(v) ? v : [v])
/** "/^jon /" is a pattern; anything else must be equal (null: none) */
const fits = (want: string | null, got: string | null) =>
  want !== null && want.length > 2 && want.startsWith('/') && want.endsWith('/') ? new RegExp(want.slice(1, -1)).test(got ?? '') : got === want
/** What is wrong with an outcome, by the case's expectations ([] = right). */
export function check(k: Case, o: Outcome): string[] {
  const e = k.expect
  const bad: string[] = []
  if (e.route && !asList(e.route).includes(o.route)) bad.push(`route ${o.route} (want ${asList(e.route).join('|')})`)
  if (e.ref !== undefined && !fits(e.ref, o.ref)) bad.push(`ref ${o.ref} (want ${e.ref})`)
  if (e.notRef && o.ref === e.notRef) bad.push(`ref ${o.ref} (must not be)`)
  if (e.notRoute && o.route === e.notRoute) bad.push(`route ${o.route} (must not be)`)
  if (e.notConcept && new RegExp(e.notConcept).test(o.concept ?? '')) bad.push(`concept ${o.concept} (must not match ${e.notConcept})`)
  if (e.concept !== undefined && !fits(e.concept, o.concept)) bad.push(`concept ${o.concept} (want ${e.concept})`)
  for (const h of e.has ?? []) if (!new RegExp(h, 'iu').test(o.text)) bad.push(`missing /${h}/`)
  for (const h of e.not ?? []) if (new RegExp(h, 'iu').test(o.text)) bad.push(`has /${h}/`)
  const targets = nextSteps(o).map(stepTarget)
  for (const f of e.follow ?? []) if (!targets.some((t) => new RegExp(f, 'iu').test(t))) bad.push(`no button /${f}/ (has ${targets.join(', ') || 'none'})`)
  if ((e.useful ?? true) && !o.useful) bad.push('nothing found (no source cited)')
  return bad
}

type Step = { label: string; sheet?: { ref: string | null; concept: string | null; what: string[] }; browse?: { book?: string; manual?: string }; again?: string }
/** The next-step buttons under an answer, and the way back to the passage it left ("← Back to …", its own row) last. */
export const nextSteps = (o: Outcome): Step[] => {
  const r = o.reply as { follow?: Step[]; back?: Step } | null
  return [...(r?.follow ?? []), ...(r?.back ? [r.back] : [])]
}
/** What a button leads to: "jon 1 text,notes", "ta:translate/translate-names", "browse jon", "again". */
export const stepTarget = (f: Step): string =>
  f.sheet ? `${f.sheet.ref ?? f.sheet.concept ?? ''} ${f.sheet.what.join(',')}`.trim() : f.browse ? `browse ${f.browse.book ?? f.browse.manual ?? ''}`.trim() : 'again'
/**
 * Whether an answer offers a next step (Abel, Nov 15: every answer must): a button, or the way to add the language asked in
 * (`packs`: the languages view). An error never reaches here as a reply (main.ts gives it "Try again" and Browse).
 */
export const offersNext = (o: Outcome): boolean => nextSteps(o).length > 0 || !!(o.reply as { packs?: boolean } | null)?.packs
