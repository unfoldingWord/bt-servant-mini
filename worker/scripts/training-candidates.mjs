// The answer reports (thumbs down) as candidates for training the on-phone model: one JSON line per report, with the
// question, what the model understood (its slots), the call sheet the app built, the reasons and the comment, and an empty
// "correct" field. A person (or a larger model, checked by a person) fills "correct" with the right slots; only reviewed
// lines, with nothing personal left in the question, go into a training set.
//   node scripts/training-candidates.mjs [out=training-candidates.jsonl] [how many=200]
// Run in worker/, with wrangler signed in to the unfoldingWord account (WRANGLER: a wrangler.js path, if not on PATH).
// The file holds people's questions: it is git-ignored; keep it off shared drives and delete it once the set is built.
// Reports expire 180 days after they arrive: export before then.
// --since <ISO date|last>: only the reports received after that moment (`last`: after the newest this script exported).
// All reports are fetched in one `wrangler kv bulk get` (see fb-kv.mjs).
import { writeFileSync } from 'node:fs'
import { getReports, keysAfter, listKeys, parseArgs, saveMark, sinceMark, wrangler } from './fb-kv.mjs'

const { positional, since } = parseArgs(process.argv.slice(2))
const out = positional[0] ?? 'training-candidates.jsonl'
const n = Number(positional[1] ?? (since == null ? 200 : Infinity))
const where = process.env.LOCAL ? '--local' : '--remote' // LOCAL=1: the reports of a local `wrangler dev`
const wr = wrangler(where)
const keys = keysAfter(listKeys(wr, where), sinceMark(since, where === '--local' ? 'training-local' : 'training')).slice(0, n)

/** From an answer's details: the model's slots (the JSON line after "model N ms") and the app's call sheet (the last JSON block). */
function parseDetails(details = '') {
  const lines = details.split('\n')
  const at = lines.findIndex((l) => /^model \d+ ms$/.test(l.trim()))
  let slots = null
  let sheet = null
  if (at >= 0) try { slots = JSON.parse(lines[at + 1]) } catch {}
  const i = details.lastIndexOf('\n{')
  if (i >= 0) try { sheet = JSON.parse(details.slice(i)) } catch {}
  return { slots, sheet, noModel: /no model on this phone|follow-up: no model call/.test(details) }
}

const rows = []
const got = getReports(wr, where, keys)
for (const { key: k, report: r } of got) {
  const answer = r.conversation[r.reported]
  // the question is the person's message right before the reported answer
  const question = [...r.conversation.slice(0, r.reported)].reverse().find((m) => m.who === 'me')?.text
  if (!question || !answer) continue
  const { slots, sheet, noModel } = parseDetails(answer.details)
  rows.push({
    id: k, received: r.received, app: r.app, ui: r.ui, reasons: r.reasons, comment: r.comment,
    question, model_slots: slots, app_sheet: sheet && { intent: sheet.intent, ref: sheet.ref, what: sheet.what, concept: sheet.concept, lang: sheet.lang },
    answer_intro: answer.intro ?? answer.text ?? '', model_used: !noModel && !!slots,
    correct: null, // the right slots, filled by a reviewer
    personal_removed: false, // set to true once the question was checked for personal details
  })
}
writeFileSync(out, rows.map((x) => JSON.stringify(x)).join('\n') + (rows.length ? '\n' : ''))
saveMark(where === '--local' ? 'training-local' : 'training', got.map((g) => g.key))
console.log(`${rows.length} candidate(s) from ${keys.length} report(s) -> ${out}`)
