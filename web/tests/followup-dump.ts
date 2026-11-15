// Dumps every follow-up case's outcome (scratch tool, not a test): bun tests/followup-dump.ts [set] [filter]
import { check, loadCases, runCase } from './harness'
const set = process.argv[2] ?? 'followup-code'
const filt = process.argv[3] ?? ''
let pass = 0, n = 0
for (const k of loadCases(process.argv[4] ?? 'followup.jsonl')) {
  if (k.set !== set || !k.id.includes(filt)) continue
  const o = await runCase(k).catch((e) => ({ route: 'failed', step: 'error', ref: null, concept: null, text: String(e), found: 0, useful: false, reply: null }))
  const bad = check(k, o); n++; if (!bad.length) pass++
  console.log(`${bad.length ? 'FAIL' : 'ok  '} ${k.id.padEnd(24)} ${k.q.padEnd(34)} -> ${o.route}/${o.step} ${o.ref} ${o.concept ?? ''} ${bad.join('; ')}`)
}
console.log(`${set}: ${pass}/${n}`)
