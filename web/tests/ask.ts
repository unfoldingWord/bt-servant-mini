// Asks questions through the app's own decisions (no reader, code alone) with every pack installed, and prints what each
// answer is: its route, target, sources, first sentence and the start of its text, and the search's details line.
//   bun tests/ask.ts en "Where was Jonah swallowed by a fish?" "Daniel lion"
//   bun tests/ask.ts --case report-jonah-where      # a case of tests/cases/*.jsonl (with its turns and slots)
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadCases, runCase, type Case } from './harness'

const args = process.argv.slice(2)
const cases: Case[] = []
if (args[0] === '--case') {
  const all = readdirSync(join(import.meta.dir, 'cases')).flatMap((f) => loadCases(f))
  for (const id of args.slice(1)) cases.push(...all.filter((k) => k.id === id))
} else {
  const [lang, ...qs] = args
  for (const q of qs) cases.push({ id: q, set: 'ask', lang: lang!, q, slots: null, expect: {} })
}
for (const k of cases) {
  const t = performance.now()
  const o = await runCase(k)
  const ms = performance.now() - t
  const m = o.reply as { intro?: string; info?: string; meta?: string; helps?: { items: unknown[] }[]; follow?: { label: string }[] }
  console.log(`\n# ${k.id}  [${k.lang}] ${k.q}\n  ${o.step}/${o.route} ref=${o.ref} concept=${o.concept} found=${o.found} ${ms.toFixed(0)} ms`)
  console.log(`  intro: ${m.intro ?? ''}`)
  console.log(`  info: ${(m.info ?? '').replace(/\s+/g, ' ').slice(0, 300)}`)
  if (m.helps?.length) console.log(`  helps: ${m.helps.map((g) => g.items.length).join('+')}`)
  if (m.follow?.length) console.log(`  follow: ${m.follow.map((f) => f.label).join(' | ')}`)
  console.log(`  meta: ${(m.meta ?? '').split('\n').filter((l) => /^(search|rescued|helps|academy|findall)/.test(l)).join(' / ')}`)
}
