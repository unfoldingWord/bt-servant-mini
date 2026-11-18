// The reports people sent about answers (the thumbs down in the app), newest first.
//   node scripts/feedback.mjs [how many=20]      (run in worker/, with wrangler signed in to the unfoldingWord account)
//   node scripts/feedback.mjs 20 --json          the reports as they are stored
//   node scripts/feedback.mjs --since 2026-11-15 the reports received from that date on (ISO date or date-time, UTC)
//   node scripts/feedback.mjs --since last       the reports after the newest one shown by the last `--since last` (with
//                                                a count, the oldest first: the next run goes on from there)
// All reports are fetched in one `wrangler kv bulk get` (see fb-kv.mjs). Set WRANGLER to a wrangler.js path to use one
// that is not on PATH. The reports hold people's questions: print them, never save them into the repo.
import { countOf, getReports, keysAfter, listKeys, parseArgs, pick, saveMark, sinceMark, wrangler } from './fb-kv.mjs'

const { positional, since } = parseArgs(process.argv.slice(2))
const n = countOf(positional[0], since == null ? 20 : Infinity) // with --since: every report after the mark, unless a count is given
const asJson = process.argv.includes('--json')
const where = '--remote'
const wr = wrangler()
const keys = pick(keysAfter(listKeys(wr, where), sinceMark(since, 'feedback')), n, since)
const got = getReports(wr, where, keys)
const reports = got.map((g) => g.report)
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
// (only `--since last` moves the mark: a plain run or a date shows reports without marking them seen)
if (since === 'last') saveMark('feedback', got.map((g) => g.key))
