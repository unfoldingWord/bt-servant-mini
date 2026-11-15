// Prints what the first screen of an answer shows, for a hand review of focus: the intro, the start of the markdown answer
// (up to the first fold), and the study view's first notes.   bun run tests/focus-dump.ts <case-id>… (or "q:<lang>:<question>")
import { loadCases, runCase, type Case } from './harness'
import { setQuestion } from '../src/answer'
import { focusOrder, focusWords } from '../src/focus'

const FILES = ['q36', 'langs', 'new18', 'followup', 'reports', 'quechua', 'academy']
const all = FILES.flatMap((f) => loadCases(`${f}.jsonl`))
const ids = process.argv.slice(2)
const FIRST = Number(process.env.FIRST ?? 900)
for (const id of ids) {
  const k: Case | undefined = id.startsWith('q:')
    ? { id, set: 'adhoc', lang: id.split(':')[1]!, q: id.split(':').slice(2).join(':'), slots: null, expect: {} }
    : all.find((x) => x.id === id)
  if (!k) { console.log(`?? ${id}`); continue }
  setQuestion(process.env.ASKQ ? k.q : null)
  const o = await runCase(k)
  const m = o.reply as any
  console.log(`\n=== ${k.id} [${o.step}/${o.route}] ${k.q}`)
  if (m.intro) console.log(`intro: ${m.intro}`)
  if (m.study) {
    const s = m.study
    console.log(`study: ${s.head}${s.focus ? ` focus=${JSON.stringify(s.focus)}` : ''} texts=${s.texts.map((t: any) => t.label).join(',')} notes=${s.notes.length} terms=${s.terms.length} q=${s.questions.length}`)
    // as renderStudy orders them for this question
    const o = focusOrder(s.notes.map((n: any) => ({ quote: n.quotes ?? n.said, titles: n.about ?? '' })), focusWords(s.focus?.length ? s.focus.join(' ') : k.q))
    console.log(`  source: ${s.source}${s.summary ? ` | ${s.summary}` : ''} | first: ${o.first.length ? `focus ${o.used} (${o.first.length})` : s.first ?? 'text'}`)
    for (const i of (o.first.length ? o.first : o.rest).slice(0, 3)) { const n = s.notes[i]; console.log(`  note ${n.ref} «${n.said}» ${String(n.note).slice(0, 100)}`) }
  }
  const info = String(m.info ?? '')
  const cut = info.indexOf('<details')
  console.log(`info (${info.length} chars${cut >= 0 ? `, fold at ${cut}` : ''}):\n${info.slice(0, cut >= 0 ? Math.min(cut, FIRST) : FIRST)}`)
}
process.exit(0)
