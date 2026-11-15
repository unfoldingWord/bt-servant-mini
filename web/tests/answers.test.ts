// Regression tests on the ANSWERS (not the call sheets): every case in tests/cases/*.jsonl goes through the app's own
// decisions (pipeline.ts) over the packs on disk, and must get the right kind of answer, about the right passage or article,
// with something found. A case marked `known` is expected to fail today: it never fails the build, and it is flagged when it
// starts passing (then drop its `known` in make_cases.py). Each set has a score; the build fails when a set falls below its
// baseline (tests/baseline.json) or a case that is not known fails. After an improvement: UPDATE_BASELINE=1 bun test (it never
// lowers a set's baseline unless ALLOW_LOWER=1 is set too).
import { describe, expect, test } from 'bun:test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Case, check, loadCases, type Outcome, runCase } from './harness'

const FILES = ['q36', 'langs', 'new18', 'followup', 'reports', 'quechua', 'academy']
// ANSWERS=fast (build.py's default): only the cases marked fast, a minute at most; the scores are compared on a full run
const FAST = process.env.ANSWERS === 'fast'
const BASELINE = join(import.meta.dir, 'baseline.json')
type Score = { pass: number; total: number; known: number; must?: number }
const baseline: Record<string, Score> = JSON.parse(readFileSync(BASELINE, 'utf-8')).sets
const scores: Record<string, Score> = {}
const nowPassing: string[] = []
const knownFails: string[] = []
const sizes: Record<string, number> = {}
const slow: [number, string][] = []

/** The `must` regexes of the 36 (written for an explained answer): how many answers already hold them, for information. */
const mustPass = (k: Case & { must?: string[][] }, o: Outcome) => !!k.must && k.must.every((g) => g.some((p) => new RegExp(p, 'iu').test(o.text)))

for (const f of FILES)
  describe(f, () => {
    for (const k of loadCases(`${f}.jsonl`) as (Case & { must?: string[][]; fast?: boolean })[]) {
      sizes[k.set] = (sizes[k.set] ?? 0) + 1
      if (FAST && !k.fast) continue
      test(k.known ? `${k.id} (known)` : k.id, async () => {
        const t = performance.now()
        const o = await runCase(k).catch((e): Outcome => ({ route: 'failed', step: 'error', ref: null, concept: null, text: String(e), found: 0, useful: false, reply: null }))
        slow.push([performance.now() - t, k.id])
        const bad = check(k, o)
        if (o.route === 'failed') bad.unshift(`error: ${o.text}`)
        const s = (scores[k.set] ??= { pass: 0, total: 0, known: 0 })
        s.total++
        if (!bad.length) s.pass++
        if (k.known) s.known++
        if (k.must) s.must = (s.must ?? 0) + (mustPass(k, o) ? 1 : 0)
        if (k.known && !bad.length) nowPassing.push(`${k.id} (${k.known})`)
        if (k.known && bad.length) knownFails.push(`${k.set} ${k.id}: ${bad.join('; ')}`)
        if (!k.known) expect(bad, `${k.id}: ${k.q}`).toEqual([])
      }, 600_000) // the Arabic free search can take a minute on a busy machine (search.ts)
    }
  })

test('every set keeps its baseline score', () => {
  const lines = Object.entries(scores).map(([set, s]) =>
    `${set.padEnd(14)} ${String(s.pass).padStart(3)}/${s.total} right` + `  (known-open ${s.known}, baseline ${baseline[set]?.pass ?? '-'})` +
    (s.must !== undefined ? `  must-regexes ${s.must}/${s.total}` : ''))
  console.log(`\nAnswers per set:\n${lines.join('\n')}`)
  console.log(`slowest: ${slow.sort((a, b) => b[0] - a[0]).slice(0, 5).map(([ms, id]) => `${id} ${(ms / 1000).toFixed(1)} s`).join(', ')}`)
  if (knownFails.length) console.log(`\nKnown-open (${knownFails.length}):\n${knownFails.join('\n')}`)
  if (nowPassing.length) console.warn(`\nKnown cases that pass now (drop their "known" in tests/make_cases.py):\n${nowPassing.join('\n')}`)
  if (FAST) return
  if (process.env.UPDATE_BASELINE && Object.entries(sizes).every(([set, n]) => scores[set]?.total === n)) {
    // a baseline only goes up: a lower score keeps the old one, unless ALLOW_LOWER=1 says the drop is meant
    const next: Record<string, Score> = { ...baseline }
    for (const [set, s] of Object.entries(scores)) {
      if (baseline[set] && s.pass < baseline[set]!.pass && !process.env.ALLOW_LOWER)
        console.warn(`baseline kept for ${set}: ${s.pass} right is below ${baseline[set]!.pass} (ALLOW_LOWER=1 to lower it)`)
      else next[set] = s
    }
    writeFileSync(BASELINE, JSON.stringify({ note: 'Right answers per set (tests/answers.test.ts). Raise it with UPDATE_BASELINE=1 bun test.', sets: next }, null, 1) + '\n')
    return
  }
  // only whole sets count (a run filtered with -t has part of them)
  for (const [set, s] of Object.entries(scores)) if (s.total === sizes[set]) expect(s.pass, `${set} fell below its baseline`).toBeGreaterThanOrEqual(baseline[set]?.pass ?? 0)
})
