// How much of the question sets code reads alone today (the composer's baseline, propuesta-composer-sugerencias.md §5 fase 0):
//   direct  = the question is only a reference (directRef): the model and the online reader are skipped
//   right   = with no reader at all (slots null, as on a phone with no model), the answer is still right (check())
//   bun tests/code-share.ts [real-questions.jsonl]
import { existsSync, readFileSync } from 'node:fs'
import { check, loadCases, runCase, type Case } from './harness'
import { directRef, env } from '../src/pipeline'
import { has } from '../src/commands'

const sets = ['q36', 'langs', 'new18', 'reports']
const real = process.argv[2] ?? 'C:/Users/LENOVO/Git/Github/bt-servant-workspace/handoff/mini-servant/investigacion/preguntas-bt-servant/candidatas.jsonl'
const direct = (q: string, lang: string) => { env.nav = lang; return !has('help', q) && directRef(q) }
for (const set of sets) {
  const cases = loadCases(`${set}.jsonl`)
  let d = 0, right = 0, rightBefore = 0
  for (const k of cases) {
    if (direct(k.q, k.lang)) d++
    const bare: Case = { ...k, slots: null, sheet: undefined, before: k.before?.map((b) => ({ q: b.q, slots: null })) }
    const o = await runCase(bare).catch(() => null)
    if (o && !check(bare, o).length) right++
    if (k.slots === null && !k.sheet) rightBefore++
  }
  console.log(`${set.padEnd(8)} ${cases.length} questions: direct (model skipped) ${d} (${Math.round((100 * d) / cases.length)}%), right with code alone ${right} (${Math.round((100 * right) / cases.length)}%)`)
}
if (existsSync(real)) {
  const qs = readFileSync(real, 'utf-8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
  const d = qs.filter((x) => direct(x.question, x.lang)).length
  const passage = qs.filter((x) => x.intent_guess === 'passage').length
  console.log(`real     ${qs.length} questions (${passage} passages): direct (model skipped) ${d} (${Math.round((100 * d) / qs.length)}%)`)
}
