// Reading the answer reports (`fb:` keys in the USAGE KV) for feedback.mjs and training-candidates.mjs. Read-only on the KV.
// The keys are listed once and fetched in one `wrangler kv bulk get` per 100 keys (one wrangler start instead of one per
// report); if bulk get fails (it is an open beta), each key is fetched on its own as before.
// `--since <ISO date|last>` keeps the reports received after that moment; `last` means after the newest report this script
// already showed, kept in worker/.feedback-state.json (git-ignored: it holds only report keys, never their text).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const STATE_FILE = '.feedback-state.json'
const BULK_MAX = 100 // keys per bulk get (the Cloudflare API limit)

export function wrangler(where) {
  return (...args) => {
    const cmd = process.env.WRANGLER ? [process.execPath, [process.env.WRANGLER, ...args]] : ['npx', ['wrangler', ...args]]
    return execFileSync(cmd[0], cmd[1], {
      encoding: 'utf8', shell: !process.env.WRANGLER, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 512 * 1024 * 1024,
    })
  }
}

/** Splits argv into positional values and the value of `--since` (null when absent). */
export function parseArgs(argv) {
  const positional = []
  let since = null
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--since') since = argv[++i] ?? ''
    else if (a.startsWith('--since=')) since = a.slice(8)
    else if (!a.startsWith('--')) positional.push(a)
  }
  return { positional, since }
}

/** The moment after which reports are kept: an ISO date (or prefix of one), the saved mark for `last`, or null for all. */
export function sinceMark(since, script, stateFile = STATE_FILE) {
  if (since == null) return null
  if (since === 'last') {
    const saved = readState(stateFile)[script]
    if (!saved) console.error(`--since last: no report shown yet by ${script}; showing all`)
    return saved ?? null
  }
  if (!/^\d{4}-\d{2}(-\d{2}(T[\d:.]+Z?)?)?$/.test(since)) throw new Error(`--since wants an ISO date (2026-11-15 or 2026-11-15T10:00) or "last", got "${since}"`)
  return `fb:${since}`
}

/** Keys newer than the mark (keys are `fb:<ISO time>:<id>`, so they sort by time). */
export function keysAfter(keys, mark) {
  return mark ? keys.filter((k) => k > mark) : keys
}

export function readState(stateFile = STATE_FILE) {
  try { return JSON.parse(readFileSync(stateFile, 'utf8')) } catch { return {} }
}

/** Remembers the newest key this script showed, for the next `--since last`. */
export function saveMark(script, keys, stateFile = STATE_FILE) {
  if (!keys.length) return
  const newest = [...keys].sort().at(-1)
  const state = readState(stateFile)
  if (state[script] && state[script] >= newest) return
  writeFileSync(stateFile, JSON.stringify({ ...state, [script]: newest }, null, 1) + '\n')
}

/** All `fb:` key names, newest first. */
export function listKeys(wr, where) {
  return JSON.parse(wr('kv', 'key', 'list', '--binding', 'USAGE', '--prefix', 'fb:', where, '-c', 'wrangler.toml'))
    .map((k) => k.name)
    .sort()
    .reverse()
}

/** Bulk get's output, `{ key: value }` (value a string, or `{ value, metadata }`), as key -> parsed report. */
export function parseBulk(text) {
  const out = new Map()
  for (const [k, v] of Object.entries(JSON.parse(text))) {
    const raw = v && typeof v === 'object' ? v.value : v
    if (raw == null) continue
    out.set(k, typeof raw === 'string' ? JSON.parse(raw) : raw)
  }
  return out
}

/** `{ key, report }` for these keys, in the same order (a key whose value is gone is skipped). */
export function getReports(wr, where, keys) {
  if (!keys.length) return []
  let got = new Map()
  const dir = mkdtempSync(join(tmpdir(), 'fb-'))
  try {
    for (let i = 0; i < keys.length; i += BULK_MAX) {
      const file = join(dir, `keys-${i}.json`)
      writeFileSync(file, JSON.stringify(keys.slice(i, i + BULK_MAX)))
      for (const [k, r] of parseBulk(wr('kv', 'bulk', 'get', file, '--binding', 'USAGE', where, '-c', 'wrangler.toml'))) got.set(k, r)
    }
  } catch (e) {
    console.error(`bulk get failed (${String(e.message ?? e).split('\n')[0]}); fetching the reports one by one`)
    got = new Map()
    for (const k of keys) {
      try { got.set(k, JSON.parse(wr('kv', 'key', 'get', k, '--binding', 'USAGE', where, '-c', 'wrangler.toml'))) } catch {}
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return keys.filter((k) => got.has(k)).map((k) => ({ key: k, report: got.get(k) }))
}
