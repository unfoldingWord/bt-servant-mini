// Measures the context online AI is given (phase 2b, web/src/context.ts) against the one it replaced, on the same questions:
// each conversation runs through the app's own decisions (web/tests/harness.ts, the packs on disk, gold slots), the request is
// built the old way (main.ts before 2b) and the new way (buildContext), and both go to Workers AI with the worker's own prompt
// (src/prompt.ts answerRequest), so nothing is deployed and no counter of the service moves. A request that comes out the same
// both ways is asked once.
//   bun scripts/eval-context.ts <out.json> [--dry] [--only <set>,…]      (sets: article, passage, followup, new)
// env: CF_ACCOUNT_ID (wrangler.toml), WRANGLER_CONFIG (on Windows: %APPDATA%/xdg.config/.wrangler/config/default.toml)
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { answerRequest } from '../src/prompt.ts'
import { fullPhone, loadCases, turn, type Turn as CaseTurn } from '../../web/tests/harness'
import { type ConvState } from '../../web/src/pipeline'
import { passageContext } from '../../web/src/answer'
import { branchOf, nodeOf } from '../../web/src/graph'
import { unfold } from '../../web/src/focus'
import { openLang } from '../../web/src/packs'
import { buildContext, type CMsg, MAX_CONTEXT, packReader } from '../../web/src/context'

const args = process.argv.slice(2)
const out = args.find((a) => !a.startsWith('--') && !/^[a-z,]+$/.test(a)) ?? 'eval-context.json'
const DRY = args.includes('--dry')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1]!.split(',') : null

type Case = { id: string; set: string; lang: string; turns: CaseTurn[]; ids?: string[]; check?: (text: string, helps: string) => boolean; note?: string }
const cases: Case[] = []
const sl = (q: string, s: Record<string, unknown>, lang = 'en'): CaseTurn => ({ q, slots: { what: [], lang, ...s } as any })
const art = (q: string, lang: string, id: string): CaseTurn =>
  ({ q, sheet: { id: 'gold', intent: 'article', ref: null, what: [], version: null, concept: id, term: null, phrase: null, candidates: null, lang: lang === 'es' ? 'es-419' : lang } })
// the 14 article questions and 8 passage questions of web/tests/gen-helps.ts (eval-answers.mjs)
const ART: [string, string, string][] = [
  ['How to translate metaphors?', 'en', 'ta:translate/figs-metaphor'], ['How do I translate idioms?', 'en', 'ta:translate/figs-idiom'],
  ['How do I translate a simile?', 'en', 'ta:translate/figs-simile'], ['How do I translate hyperbole?', 'en', 'ta:translate/figs-hyperbole'],
  ['What do I do when something does not exist in my culture?', 'en', 'ta:translate/translate-unknown'],
  ['How do I translate personification?', 'en', 'ta:translate/figs-personification'],
  ['How do I translate rhetorical questions?', 'en', 'ta:translate/figs-rquestion'],
  ['How do I translate "snow" if we have no snow?', 'en', 'ta:translate/translate-unknown'],
  ['How do I translate names?', 'en', 'ta:translate/translate-names'],
  ['¿Cómo traduzco las metáforas?', 'es', 'ta:translate/figs-metaphor'], ['¿Cómo traduzco los modismos?', 'es', 'ta:translate/figs-idiom'],
  ['Bagaimana menerjemahkan metafora?', 'id', 'ta:translate/figs-metaphor'],
  ['What is grace?', 'en', 'tw:kt/grace'], ['What does redeemer mean?', 'en', 'tw:kt/redeem'],
]
for (const [q, lang, id] of ART) cases.push({ id: `art-${id.split('/').pop()}-${lang}-${cases.length}`, set: 'article', lang, turns: [art(q, lang, id)], ids: [id] })
const PASS: [string, string, number, number, number | null, string[]][] = [
  ['Notes on Ruth 2:3', 'rut', 2, 3, null, ['notes']], ['Ruth 3:9 notes', 'rut', 3, 9, null, ['notes']], ['Notes on John 1:1', 'jhn', 1, 1, null, ['notes']],
  ['Titus 2:1-3', 'tit', 2, 1, 3, ['text', 'notes']], ['Notes on Genesis 1:2', 'gen', 1, 2, null, ['notes']], ['Notes on Psalm 23:1', 'psa', 23, 1, null, ['notes']],
  ['Notes on Romans 8:1', 'rom', 8, 1, null, ['notes']], ['Key terms in Ruth 1:16', 'rut', 1, 16, null, ['terms']],
]
for (const [q, book, chapter, v1, v2, what] of PASS)
  cases.push({ id: `pass-${book}${chapter}-${v1}`, set: 'passage', lang: 'en', turns: [sl(q, { intent: 'passage', book, chapter, verse_start: v1, verse_end: v2, what })] })
// the 48 follow-ups (fase0 data/eval-followup.jsonl, as web/tests/cases/followup.jsonl has them with gold slots)
for (const k of loadCases('followup.jsonl').filter((k) => /eval-followup/.test(k.from ?? '') && !k.id.endsWith('-code')))
  cases.push({ id: k.id, set: 'followup', lang: k.lang, turns: [...(k.before ?? []), { q: k.q, slots: k.slots }] })
// where the context matters (code reads the questions, as without the online reader)
const has = (...re: RegExp[]) => (t: string) => re.every((r) => r.test(t))
cases.push({ id: 'new-glean-earlier', set: 'new', lang: 'en', note: 'a point of another branch: the glean article after moving to Numbers',
  turns: [{ q: 'Notes on Ruth 2:3' }, { q: 'What does glean mean here?' }, { q: 'Numbers 6:24' }, { q: 'What did the note on glean say?' }],
  check: has(/glean/i, /left|behind|leftover|remain|pick/i) })
cases.push({ id: 'new-metaphor-how', set: 'new', lang: 'en', note: 'strategies must be in the context', ids: ['ta:translate/figs-metaphor'],
  turns: [art('How do I translate metaphors?', 'en', 'ta:translate/figs-metaphor')], check: (t, h) => /Translation Strategies/.test(h) && /simile|plain|meaning|same image|literal/i.test(t) })
cases.push({ id: 'new-metaphor-what', set: 'new', lang: 'en', note: 'the description must be in the context', ids: ['ta:translate/figs-metaphor'],
  turns: [art('What is a metaphor?', 'en', 'ta:translate/figs-metaphor')], check: (t, h) => /### Description/.test(h) && /figure of speech|compar|image|topic/i.test(t) })
cases.push({ id: 'new-metaphor-what-es', set: 'new', lang: 'es', note: 'the description, in Spanish', ids: ['ta:translate/figs-metaphor'],
  turns: [art('¿Qué es una metáfora?', 'es', 'ta:translate/figs-metaphor')], check: (t, h) => /### Descripción/.test(h) && /figura|compar|imagen/i.test(t) })
cases.push({ id: 'new-glean-how', set: 'new', lang: 'en', note: 'a key term one link away from the passage',
  turns: [{ q: 'Notes on Ruth 2:3' }, sl('How do I translate glean in Ruth 2:3?', { intent: 'passage', book: 'rut', chapter: 2, verse_start: 3, what: ['notes'], term: 'glean' })],
  check: has(/glean/i) })

/** The request the app sent before phase 2b (main.ts, history and helps), kept here to measure against. */
function oldRequest(msgs: CMsg[], c: ConvState, pt: string | null, m: CMsg, onlineCtx: string) {
  const history: { role: 'user' | 'assistant'; text: string }[] = []
  const branch = c.graph && pt ? branchOf(c.graph, pt, 3).slice(0, -1) : null
  if (branch) {
    for (const n of branch) {
      const a = msgs[n.msg], q = msgs[n.msg - 1]
      if (a?.who !== 'bot') continue
      history.push({ role: 'user', text: q?.who === 'me' && !q.mark && q.text ? q.text : n.label })
      history.push({ role: 'assistant', text: a.ai?.text ?? a.intro ?? '' })
    }
  } else for (const x of msgs.slice(-7, -2)) {
    if (x.who === 'me' && x.text && !x.mark) history.push({ role: 'user', text: x.text })
    else if (x.who === 'bot') history.push({ role: 'assistant', text: x.ai?.text ?? x.intro ?? '' })
  }
  const found = `${m.intro ?? ''}\n\n${unfold(m.info ?? '')}`
  const helps = onlineCtx ? `${found.length > 5000 ? found.slice(0, 5000) + ' …' : found}\n\n# Context of the passage\n\n${onlineCtx}` : found
  const sources = (m.sources ?? (m.ctx ? [{ id: m.ctx }] : [])).filter((s) => /^(ta|tw):/.test(s.id))
  return { helps: helps.slice(0, MAX_CONTEXT), history, sources }
}

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
let TOKEN = ''
const ACCOUNT = process.env.CF_ACCOUNT_ID ?? ''
if (!DRY) {
  if (!ACCOUNT) throw new Error('set CF_ACCOUNT_ID')
  execSync('npx wrangler whoami', { stdio: 'ignore' }) // refreshes an expired OAuth token
  const cfg = readFileSync(process.env.WRANGLER_CONFIG || `${homedir()}/.config/.wrangler/config/default.toml`, 'utf8')
  TOKEN = /^oauth_token\s*=\s*"([^"]+)"/m.exec(cfg)![1]!
}
let calls = 0
async function ask(body: { question: string; lang: string; helps: string; history: unknown[]; sources: unknown[] }): Promise<string> {
  const { messages } = answerRequest(body, MAX_CONTEXT)
  for (let i = 0; i < 4; i++) {
    calls++
    // (Bun.fetch: the harness replaces fetch with the packs on disk, as on a phone with no internet)
    const r = await Bun.fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODEL}`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, max_tokens: 550, temperature: 0.3 }) })
    const j = await r.json().catch(() => null) as any
    if (j?.result?.response) return String(j.result.response).trim()
    await new Promise((s) => setTimeout(s, 5000))
  }
  return ''
}

// the answer's language: a few common words (Latin scripts), or the script (Hindi, Arabic)
const WORDS: Record<string, RegExp> = { en: / (the|and|of|to) /, es: / (el|la|de|que|los|en) /, fr: / (le|la|les|de|des|et) /, id: / (yang|dan|untuk|dengan|ini) / }
const SCRIPT: Record<string, RegExp> = { hi: /[ऀ-ॿ]/g, ar: /[؀-ۿ]/g }
function langOk(lang: string, text: string): boolean {
  if (SCRIPT[lang]) return (text.match(SCRIPT[lang]!) ?? []).length > text.replace(/\s/g, '').length * 0.4
  return !WORDS[lang] || WORDS[lang]!.test(` ${text.toLowerCase()} `)
}
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
/** Grounded: the answer shares at least 6 longer words with the helps it was given (not counting the question's). */
function grounded(text: string, helps: string, q: string): boolean {
  const w = (s: string) => new Set([...fold(s).matchAll(/[\p{L}]{5,}/gu)].map((m) => m[0]))
  const h = w(helps), qq = w(q)
  return [...w(text)].filter((x) => h.has(x) && !qq.has(x)).length >= 6
}
const ACADEMY = /translation academy|translation words|academia de traducci|ayudas? de traducci|palabras de traducci|akademi|kata-kata terjemahan|अनुवाद अकादमी|अनुवाद शब्द|أكاديمية الترجمة|كلمات الترجمة/i

await fullPhone()
const read = packReader(openLang as any)
const rows: any[] = []
let same = 0
for (const k of cases) {
  if (only && !only.includes(k.set)) continue
  const c: ConvState = { last: null }
  const msgs: CMsg[] = []
  let last: any = null
  for (const t of k.turns) {
    const r = await turn(c, t, k.lang)
    msgs.push({ who: 'me', text: t.q })
    const m: CMsg = { who: 'bot', ...(r.reply as any) }
    msgs.push(m)
    const pt = nodeOf(c.graph, r.node)
    if (pt) pt.msg = msgs.length - 1
    last = { r, m, pt }
  }
  const { r, m, pt } = last
  const q = k.turns.at(-1)!.q
  // main.ts asks online only for an answer with something found on the phone
  if (!(m.info || m.helps?.length || m.study)) { rows.push({ id: k.id, set: k.set, skipped: 'nothing found' }); continue }
  const onlineCtx = r.sheet ? await passageContext(r.sheet).catch(() => '') : ''
  const old = oldRequest(msgs, c, pt?.id ?? null, m, onlineCtx)
  const neu = await buildContext({ question: q, m, msgs, graph: c.graph, node: pt?.id ?? null, passage: onlineCtx, lang: m.lang || r.sheet?.lang || k.lang, read })
  const sameReq = old.helps === neu.helps && JSON.stringify(old.history.slice(-4)) === JSON.stringify(neu.history.slice(-4))
  const row: any = { id: k.id, set: k.set, lang: k.lang, q, route: r.answered, note: k.note, oldChars: old.helps.length, newChars: neu.helps.length, parts: neu.parts, same: sameReq }
  if (DRY) { row.oldHelps = old.helps; row.newHelps = neu.helps; rows.push(row); console.log(k.id, r.answered, old.helps.length, '->', neu.helps.length, JSON.stringify(neu.parts)); continue }
  const body = (x: typeof old) => ({ question: q, lang: k.lang, helps: x.helps, history: x.history, sources: x.sources.map((s) => ({ id: s.id })) })
  const a0 = await ask(body(old))
  const a1 = sameReq ? a0 : await ask(body(neu))
  if (sameReq) same++
  const score = (text: string, helps: string) => ({
    words: text.split(/\s+/).filter(Boolean).length, langOk: langOk(k.lang, text), grounded: grounded(text, helps, q), academy: ACADEMY.test(text),
    titled: (() => { const t = (helps.match(/^#{1,3} (.+)$/m)?.[1] ?? '').toLowerCase().split(',')[0]!.trim(); return !!t && text.toLowerCase().includes(t) })(),
    check: k.check ? k.check(text, helps) : null,
  })
  row.old = { ...score(a0, old.helps), text: a0 }
  row.new = { ...score(a1, neu.helps), text: a1 }
  rows.push(row)
  console.log(k.id, `${old.helps.length}->${neu.helps.length}`, 'old', JSON.stringify({ ...row.old, text: undefined }), 'new', JSON.stringify({ ...row.new, text: undefined }))
}
writeFileSync(out, JSON.stringify(rows, null, 1))
const done = rows.filter((r) => r.old || r.oldHelps !== undefined)
const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / (xs.length || 1))
for (const set of ['article', 'passage', 'followup', 'new']) {
  const rs = done.filter((r) => r.set === set)
  if (!rs.length) continue
  const chars = `chars ${mean(rs.map((r) => r.oldChars))} -> ${mean(rs.map((r) => r.newChars))}`
  if (DRY) { console.log(`${set} ${rs.length}: ${chars}, same request ${rs.filter((r) => r.same).length}`); continue }
  const n = (w: 'old' | 'new', f: string) => rs.filter((r) => r[w][f]).length
  const line = (w: 'old' | 'new') => `lang ${n(w, 'langOk')} grounded ${n(w, 'grounded')} academy ${n(w, 'academy')} titled ${n(w, 'titled')} check ${n(w, 'check')} words ${mean(rs.map((r) => r[w].words))}`
  console.log(`${set} ${rs.length} (${chars}; same request ${rs.filter((r) => r.same).length})\n  old: ${line('old')}\n  new: ${line('new')}`)
}
console.log(`skipped (nothing found): ${rows.filter((r) => r.skipped).map((r) => r.id).join(', ') || 'none'}; model calls ${calls}`)
