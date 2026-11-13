// The usage counts the phones sent (only those whose person turned them on), added up over the last N days.
//   node scripts/usage.mjs [days=30]        (run in worker/, with wrangler signed in to the unfoldingWord account)
// Set WRANGLER to a wrangler.js path to use one that is not on PATH.
import { execFileSync } from 'node:child_process'

const days = Number(process.argv[2] ?? 30)
const wr = (...args) => {
  const cmd = process.env.WRANGLER ? [process.execPath, [process.env.WRANGLER, ...args]] : ['npx', ['wrangler', ...args]]
  return execFileSync(cmd[0], cmd[1], { encoding: 'utf8', shell: !process.env.WRANGLER, stdio: ['ignore', 'pipe', 'ignore'] })
}
const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
const keys = JSON.parse(wr('kv', 'key', 'list', '--binding', 'USAGE', '--prefix', 'stats:', '--remote', '-c', 'wrangler.toml'))
  .map((k) => k.name)
  .filter((k) => k.slice(6) >= since)
  .sort()
const total = { reports: 0, c: {}, dims: {} }
const perDay = []
for (const k of keys) {
  const s = JSON.parse(wr('kv', 'key', 'get', k, '--binding', 'USAGE', '--remote', '-c', 'wrangler.toml'))
  perDay.push([k.slice(6), s.reports, s.c.asked ?? 0, s.c.answers ?? 0, s.c.empty ?? 0])
  total.reports += s.reports
  for (const [n, v] of Object.entries(s.c)) total.c[n] = (total.c[n] ?? 0) + v
  for (const [n, v] of Object.entries(s.dims)) total.dims[n] = (total.dims[n] ?? 0) + v
}
const table = (o) => Object.entries(o).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `  ${k.padEnd(28)} ${v}`).join('\n')
console.log(`Usage since ${since} (${keys.length} days with reports)\n`)
console.log('day          phones  typed  answers  found nothing')
for (const [d, r, a, n, e] of perDay) console.log(`${d}   ${String(r).padStart(6)} ${String(a).padStart(6)} ${String(n).padStart(8)} ${String(e).padStart(14)}`)
console.log(`\nCounts (all days)\n${table(total.c)}`)
if (total.c.answers) console.log(`  ${'average seconds per answer'.padEnd(28)} ${(total.c.secs / total.c.answers).toFixed(1)}`)
console.log(`\nPhone-days by version, language, model, memory, packs\n${table(total.dims)}`)
