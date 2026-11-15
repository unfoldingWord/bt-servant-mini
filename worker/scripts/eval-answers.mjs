// Measures the online answer on helps the app really builds (web/tests/gen-helps.ts writes them from the packs on disk), calling
// Workers AI directly with the worker's own prompt (src/prompt.ts), so nothing is deployed and no counter of the service moves.
//   bun scripts/eval-answers.mjs <helps.json> <out.json> [--old]
// --old uses the prompt and message of the commit before the change (git show 0eefbde:worker/src/index.ts); without it, the new
// ones with the article ids the way the app now sends them. Paced for the model's rate limits.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { answerRequest } from '../src/prompt.ts'
const [file, out] = process.argv.slice(2)
const OLD = process.argv.includes('--old')
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const ACCOUNT = process.env.CF_ACCOUNT_ID // the Cloudflare account of the service (wrangler.toml)
if (!ACCOUNT) throw new Error('set CF_ACCOUNT_ID')
execSync('npx wrangler whoami', { stdio: 'ignore' }) // refreshes an expired OAuth token
const CFG = readFileSync(process.env.WRANGLER_CONFIG || `${homedir()}/.config/.wrangler/config/default.toml`, 'utf8') // on Windows: %APPDATA%/xdg.config/.wrangler/config/default.toml
const TOKEN = /^oauth_token\s*=\s*"([^"]+)"/m.exec(CFG)[1]
let sysOld = null
if (OLD) {
  const src = execSync('git show 0eefbde:worker/src/index.ts', { encoding: 'utf8', maxBuffer: 1 << 24 })
  const body = src.slice(src.indexOf('function system'), src.indexOf('// ----', src.indexOf('function system')))
  const LANGS = { en: 'English', es: 'Spanish', fr: 'French', id: 'Indonesian', hi: 'Hindi', ar: 'Arabic' }
  sysOld = new Function('LANGS', body.replace('function system(lang: string): string', 'function system(lang)') + ' return system')(LANGS)
}
async function ask(c) {
  // the same function the worker's handler calls; the app's request body is {question, lang, helps, sources, history}
  const body = { question: c.q, lang: c.lang, helps: c.helps, history: [], ...(c.ids?.length && !c.oldClient ? { sources: c.ids.map((id) => ({ id })) } : {}) }
  const messages = OLD ? [{ role: 'system', content: sysOld(c.lang) },
    { role: 'user', content: `Question: ${c.q}

Translation helps found on the phone:
${c.helps || '(none found)'}` }]
    : answerRequest(body, 9500).messages
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODEL}`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, max_tokens: 550, temperature: 0.3 }) })
    const j = await r.json().catch(() => null)
    if (j?.result?.response) return String(j.result.response).trim()
    await new Promise((s) => setTimeout(s, 5000))
  }
  return ''
}
const cases = JSON.parse(readFileSync(file, 'utf8'))
// a question the helps found do NOT answer (the TA "process" manual is not in the packs): the phone found the metaphor article
const mismatch = cases.find((c) => c.ids?.[0] === 'ta:translate/figs-metaphor' && c.lang === 'en')
if (!OLD) for (const c of cases.filter((c) => c.kind === 'article').slice(0, 3)) cases.push({ ...c, kind: 'oldclient', oldClient: true }) // app 0.9.7: no sources in the request
if (mismatch) cases.push({ ...mismatch, q: 'How do I set up a translation team?', kind: 'mismatch' })
const WORDS = { en: / (the|and|of) /, es: / (el|la|de|que|los) /, id: / (yang|dan|untuk|dengan) / }
const names = (c) => (c.helps.match(/^#{1,3} (.+)$/m)?.[1] ?? '').toLowerCase()
const rows = []
for (const c of cases) {
  if (!c.helps) continue
  const raw = await ask(c)
  const text = raw
  const low = text.toLowerCase()
  const t = names(c)
  rows.push({ q: c.q, kind: c.kind, lang: c.lang, words: text.split(/\s+/).filter(Boolean).length,
    titled: !!t && low.includes(t), modelNamed: /translation academy|translation words|academia de traducci|akademi/i.test(raw),
    academy: /translation academy|translation words|academia de traducci|ayudas? de traducci|akademi/i.test(text),
    langOk: !WORDS[c.lang] || WORDS[c.lang].test(` ${low} `), text })
  console.log(rows.at(-1).kind, rows.at(-1).words, `academy=${rows.at(-1).academy} titled=${rows.at(-1).titled}`, rows.at(-1).langOk, c.q)
}
for (const r of rows.filter((r) => r.kind === 'mismatch')) console.log('MISMATCH:', r.text)
writeFileSync(out, JSON.stringify(rows, null, 1))
const art = rows.filter((r) => r.kind === 'article')
const old = rows.filter((r) => r.kind === 'oldclient')
console.log(`old clients (no sources) ${old.length}: names Academy/Words ${old.filter((r) => r.academy).length}, mean words ${Math.round(old.reduce((a, r) => a + r.words, 0) / (old.length || 1))}`)
const pas = rows.filter((r) => r.kind === 'passage')
console.log(`articles ${art.length}: names Academy/Words ${art.filter((r) => r.academy).length}, model named it ${art.filter((r) => r.modelNamed).length}, lang ok ${art.filter((r) => r.langOk).length}, mean words ${Math.round(art.reduce((a, r) => a + r.words, 0) / art.length)}`)
console.log(`passages ${pas.length}: lang ok ${pas.filter((r) => r.langOk).length}, mean words ${Math.round(pas.reduce((a, r) => a + r.words, 0) / pas.length)}`)
