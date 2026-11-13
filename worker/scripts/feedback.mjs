// The reports people sent about answers (the thumbs down in the app), newest first.
//   node scripts/feedback.mjs [how many=20]      (run in worker/, with wrangler signed in to the unfoldingWord account)
//   node scripts/feedback.mjs 20 --json          the reports as they are stored
// Set WRANGLER to a wrangler.js path to use one that is not on PATH.
import { execFileSync } from 'node:child_process'

const n = Number(process.argv[2] ?? 20)
const asJson = process.argv.includes('--json')
const wr = (...args) => {
  const cmd = process.env.WRANGLER ? [process.execPath, [process.env.WRANGLER, ...args]] : ['npx', ['wrangler', ...args]]
  return execFileSync(cmd[0], cmd[1], { encoding: 'utf8', shell: !process.env.WRANGLER, stdio: ['ignore', 'pipe', 'ignore'] })
}
const keys = JSON.parse(wr('kv', 'key', 'list', '--binding', 'USAGE', '--prefix', 'fb:', '--remote', '-c', 'wrangler.toml'))
  .map((k) => k.name)
  .sort()
  .reverse()
  .slice(0, n)
const reports = keys.map((k) => JSON.parse(wr('kv', 'key', 'get', k, '--binding', 'USAGE', '--remote', '-c', 'wrangler.toml')))
if (asJson) {
  console.log(JSON.stringify(reports, null, 1))
} else {
  const one = (s, max = 400) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  for (const r of reports) {
    console.log(`\n=== ${r.received} · ${r.app} ${r.flavor} · ui ${r.ui} · model ${r.model} · online ${r.online} · packs ${r.packs.join(',')}`)
    console.log(`reasons: ${r.reasons.join(', ') || '-'}${r.comment ? `\ncomment: ${r.comment}` : ''}`)
    r.conversation.forEach((m, i) => {
      const mark = i === r.reported ? '>> ' : '   '
      if (m.who === 'me') console.log(`${mark}Q: ${one(m.text)}`)
      else console.log(`${mark}A: ${one(m.ai ? `[online] ${m.ai}` : `${m.intro ?? ''} ${m.info ?? m.text ?? ''}`)}${i === r.reported && m.details ? `\n      details: ${one(m.details, 900)}` : ''}`)
    })
  }
  console.log(`\n${reports.length} report(s)`)
}
