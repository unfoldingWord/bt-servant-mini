// Not a test: scores the `obs` set on three paths and prints the failures. Run: bun tests/obs-eval.ts [file.jsonl]
//   gold   = the case's own slots (what a perfect reader would say)
//   model  = the real phone model (llama-server on 127.0.0.1:8080 with ms-all-q8.gguf, the app's prompt and grammar, temp 0,
//            as model.ts slotsOf does); every turn of a conversation goes through it, except the turns code reads by itself
//   code   = no reader at all (slots null)
// OBS5M=1 turns the dev switch of the 5M session on (only the ms/obs5m branch has it).
import { request } from 'node:http'
import { readFileSync } from 'node:fs'
import { check, fullPhone, loadCases, type Case, type Turn } from './harness'
import { answer, codeReads, env, type ConvState, type Made, questionOf, readQuestion } from '../src/pipeline'
import { has } from '../src/commands'
import prompt from '../src/data/prompt.json'
import type { Slots } from '../src/sheet'

if (process.env.OBS5M) {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k), key: () => null, length: 0 }
  await (await import('./five-on')).fiveOn(true)
}
const GRAMMAR = readFileSync(new URL('../src/data/slots.gbnf', import.meta.url), 'utf8')
const post = (body: object) => new Promise<any>((res, rej) => {
  const data = JSON.stringify(body)
  const r = request({ host: '127.0.0.1', port: 8080, path: '/completion', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (s) => {
    let t = ''; s.on('data', (d) => (t += d)); s.on('end', () => { try { res(JSON.parse(t)) } catch (e) { rej(e) } })
  })
  r.on('error', rej); r.end(data)
})
async function modelSlots(q: string): Promise<{ slots: Slots | null; raw: string }> {
  const r = await post({ prompt: (prompt as any).template.replace('<<Q>>', q.replace(/\s+/g, ' ').trim()), temperature: 0, seed: 0, n_predict: 200, stop: ['<end_of_turn>'], cache_prompt: true, grammar: GRAMMAR })
  let txt = String(r.content ?? '').trim()
  const end = txt.lastIndexOf('}'); if (end > 0) txt = txt.slice(0, end + 1)
  try { return { slots: JSON.parse(txt), raw: txt } } catch { return { slots: null, raw: txt } }
}
type Mode = 'gold' | 'model' | 'code'
const log: string[] = []
async function turn(c: ConvState, t: Turn, lang: string, mode: Mode) {
  env.nav = lang
  const { q, target } = questionOf(t.q, c)
  const byCode = !has('help', q) && codeReads(q, c)
  let slots: Slots | null = null
  if (mode === 'gold') slots = t.slots ?? null
  if (mode === 'model' && !byCode) { const m = await modelSlots(q); slots = m.slots; log.push(`${t.q} => ${m.raw}`) }
  const made: Made = await readQuestion(q, { slots: slots && !byCode ? { ...slots } : null, raw: '', ms: 0 }, c, target)
  return answer(c, made, performance.now())
}
await fullPhone()
const file = process.argv[2] ?? 'obs.jsonl'
const cases = loadCases(file) as (Case & { kind?: string })[]
const rows: { id: string; lang: string; kind: string; mode: Mode; ok: boolean; bad: string[]; q: string; got: string; slots: string }[] = []
for (const mode of ['gold', 'model', 'code'] as Mode[])
  for (const k of cases) {
    const c: ConvState = { last: null }
    let o: any, bad: string[]
    try {
      for (const b of k.before ?? []) await turn(c, b, k.lang, mode)
      log.length = 0
      const r: any = await turn(c, k, k.lang, mode)
      const m = r.reply
      o = { route: r.answered, step: r.route, ref: r.ref, concept: r.concept, found: r.found, useful: r.found > 0, reply: m,
        text: [m.intro ?? '', m.info ?? '', ...(m.helps ?? []).flatMap((g: any) => [g.head, ...g.items.map((i: any) => `${i.ref} ${i.snippet}`)]), m.text ?? ''].join('\n') }
      bad = check(k, o)
    } catch (e) { o = { route: 'failed', step: 'error', ref: null }; bad = [`error ${String(e).slice(0, 80)}`] }
    rows.push({ id: k.id, lang: k.lang, kind: k.kind ?? '?', mode, ok: !bad.length, bad, q: k.q, got: `${o.route}/${o.step} ${o.ref ?? ''}`, slots: mode === 'model' ? log.at(-1)?.split(' => ')[1] ?? '' : '' })
  }
const pct = (a: typeof rows) => `${a.filter((r) => r.ok).length}/${a.length}`
for (const mode of ['gold', 'model', 'code'] as Mode[]) {
  const m = rows.filter((r) => r.mode === mode)
  console.log(`\n== ${mode}: ${pct(m)}`)
  console.log(' by lang: ' + [...new Set(m.map((r) => r.lang))].map((l) => `${l} ${pct(m.filter((r) => r.lang === l))}`).join(', '))
  console.log(' by kind: ' + [...new Set(m.map((r) => r.kind))].map((l) => `${l} ${pct(m.filter((r) => r.kind === l))}`).join(', '))
  for (const r of m.filter((r) => !r.ok)) console.log(`  FAIL ${r.id} [${r.kind}] ${r.q} -> ${r.got} | ${r.bad.join('; ')}${r.slots ? ` | model: ${r.slots}` : ''}`)
}
process.exit(0)
