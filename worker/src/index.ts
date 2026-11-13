// BT Servant Mini — online helper (level 3).
//   POST /v1/session { idToken }  -> { token, name, exp }   a Google sign-in becomes a session of 30 days
//   POST /v1/answer  { question, lang, helps, history? } -> { text, model }   with the session, when sign-in is required
//   POST /v1/usage   { days: [{ d, c }], app, flavor, ui, packs, model, online, mem } -> { ok }   usage counts (opt-in)
//   POST /v1/feedback { reasons, comment, conversation, reported, app, ... } -> { ok }   a report on one answer
// The app sends the question and the translation helps it already found on the phone; the model answers from them only,
// in the person's language, and names its sources. It does not search, keep the questions, or see other conversations.
//
// Who may ask: the app's key (X-BTSM-Key, a Worker secret), a signed-in person (when GOOGLE_CLIENT_ID is set), a few answers
// a minute per address, and daily caps per person and for everyone (KV), so the cost of Workers AI has a ceiling even if
// the key is dug out of an APK.

export interface Env {
  AI: { run(model: string, input: unknown): Promise<any> }
  USAGE?: KVNamespace
  MODEL: string
  MAX_CONTEXT: string
  /** Answers a day for everyone together, and for one person. */
  DAILY_CAP: string
  PERSON_DAILY_CAP: string
  /** The app's key (a Worker secret): requests without it are refused. Unset, the service is open (local `wrangler dev`). */
  APP_KEY?: string
  /**
   * Pages allowed without the key (comma-separated origins): the installable web app, whose code is public and so cannot
   * hold a key. A browser always sends the true Origin; a script elsewhere can fake it, which the daily caps bound.
   */
  ALLOWED_ORIGINS?: string
  /** The Google OAuth web client id the app signs in with (the ID token's audience). Unset, no sign-in is required. */
  GOOGLE_CLIENT_ID?: string
  /** Signs the sessions this service gives out (a Worker secret). */
  SESSION_SECRET?: string
}

const LANGS: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', id: 'Indonesian', hi: 'Hindi', ar: 'Arabic' }
const CORS = {
  'Access-Control-Allow-Origin': '*', // the app's pages come from https://appassets.androidplatform.net
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-BTSM-Key, Authorization',
  'Access-Control-Max-Age': '86400',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

function system(lang: string): string {
  const name = LANGS[lang] ?? 'the language of the question'
  return [
    'You are BT Servant, a warm and careful assistant for Bible translators, answering inside the BT Servant Mini app.',
    `Answer in ${name}.`,
    'Use ONLY the translation helps given below (Bible texts, translation notes, comprehension questions, key terms, articles).',
    'When the helps include "Context of the passage" (surrounding verses, chapter and book introductions) and the question is about translating or understanding a passage:',
    'start with one or two sentences saying what is happening in the verse and why, in the flow of the story or argument (what came before, what it leads to);',
    'then say how to translate it, going through the phrases the notes point out and their alternate translations.',
    'Explain and paraphrase them simply so a translator can act on them; when you give a suggestion, base it on a note or an article.',
    'Name the resource you use (for example: the ULT, a translation note, the Translation Words article "grace").',
    'If the helps do not answer the question, say so in one sentence and suggest how to ask (a reference, a word, a phrase in quotes).',
    'Never invent verses, notes, numbers or facts that are not in the helps. Do not preach.',
    'Be brief: at most about 230 words. Use short paragraphs or a short list; you may use **bold** for key words.',
  ].join(' ')
}

// ------------------------------------------------------------------------------------------------------------- limits

// A few answers a minute per address, counted per isolate (a soft limit, no storage needed).
const PER_MINUTE = 8
const seen = new Map<string, number[]>()
function limited(ip: string): boolean {
  const now = Date.now()
  const times = (seen.get(ip) ?? []).filter((t) => now - t < 60_000)
  if (times.length >= PER_MINUTE) {
    seen.set(ip, times)
    return true
  }
  times.push(now)
  seen.set(ip, times)
  if (seen.size > 5000) seen.clear()
  return false
}

/** Today's count of a key in KV (approximate: KV is eventually consistent, enough for a ceiling). */
const day = () => new Date().toISOString().slice(0, 10)
async function count(env: Env, key: string): Promise<number> {
  return Number((await env.USAGE?.get(`${day()}:${key}`)) ?? 0)
}
async function bump(env: Env, key: string): Promise<void> {
  if (!env.USAGE) return
  const k = `${day()}:${key}`
  await env.USAGE.put(k, String(Number((await env.USAGE.get(k)) ?? 0) + 1), { expirationTtl: 3 * 86400 })
}

/** Compares two strings in a time that does not depend on where they differ. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

// -------------------------------------------------------------------------------------------------------- usage counts

// The app's usage counts, sent only by phones whose person turned them on: totals per day, with no question text and no id
// of the phone or the person. They are added into one record per day, `stats:<day>` in KV:
//   { reports, c: { asked: 120, "kind.search": 30, ... }, dims: { "ui.es": 4, "app.0.9.2-mini": 5, "pack.ar": 2, ... } }
// `reports` is phones-days; a dimension counts phones that day. Nothing about the sender (address, time) is kept.
const DAY = /^\d{4}-\d{2}-\d{2}$/
const KEY = /^[a-z]+(\.[a-z0-9_-]{1,24})?$/
const CODE = /^[a-z]{2,3}(-[a-z0-9]{1,12}){0,3}$/i
const usageSeen = new Map<string, number[]>()
function usageLimited(ip: string): boolean {
  const now = Date.now()
  const times = (usageSeen.get(ip) ?? []).filter((t) => now - t < 60_000)
  times.push(now)
  usageSeen.set(ip, times)
  if (usageSeen.size > 5000) usageSeen.clear()
  return times.length > 6
}
type Stats = { reports: number; c: Record<string, number>; dims: Record<string, number> }
/** The report, checked and reduced to what is allowed; null when it is not a usage report. */
function usageReport(body: any): { days: { d: string; c: Record<string, number> }[]; dims: string[] } | null {
  if (!body || !Array.isArray(body.days) || !body.days.length || body.days.length > 45) return null
  const now = Date.now()
  const days: { d: string; c: Record<string, number> }[] = []
  for (const x of body.days) {
    if (!x || typeof x.d !== 'string' || !DAY.test(x.d) || typeof x.c !== 'object' || !x.c) return null
    const age = (now - Date.parse(`${x.d}T00:00:00Z`)) / 86400_000
    if (!(age > -2 && age < 60)) continue // a phone's clock can be off; very old days are dropped
    const c: Record<string, number> = {}
    for (const [k, v] of Object.entries(x.c).slice(0, 80))
      if (KEY.test(k) && Number.isInteger(v) && (v as number) >= 0) c[k] = Math.min(v as number, k === 'secs' ? 100_000 : 5000)
    days.push({ d: x.d, c })
  }
  const dims: string[] = []
  const add = (name: string, v: unknown, re: RegExp) => { if (typeof v === 'string' && re.test(v)) dims.push(`${name}.${v.toLowerCase()}`) }
  add('app', body.app, /^[\w.-]{1,24}$/)
  add('flavor', body.flavor, /^(full|lite|desktop)$/)
  add('ui', body.ui, /^(en|es|fr|id|hi|ar)$/)
  add('model', body.model, /^[a-z]{1,12}$/)
  if (typeof body.online === 'boolean') dims.push(`online.${body.online ? 'on' : 'off'}`)
  if (typeof body.mem === 'number' && body.mem > 0 && body.mem <= 64) dims.push(`mem.${body.mem}`)
  if (Array.isArray(body.packs)) for (const p of body.packs.slice(0, 20)) add('pack', p, CODE)
  return { days, dims }
}
async function addUsage(env: Env, report: NonNullable<ReturnType<typeof usageReport>>): Promise<void> {
  if (!env.USAGE) return
  for (const { d, c } of report.days) {
    const key = `stats:${d}`
    const s: Stats = ((await env.USAGE.get(key, 'json')) as Stats | null) ?? { reports: 0, c: {}, dims: {} }
    s.reports++
    for (const [k, v] of Object.entries(c)) s.c[k] = (s.c[k] ?? 0) + v
    for (const k of report.dims) s.dims[k] = (s.dims[k] ?? 0) + 1
    await env.USAGE.put(key, JSON.stringify(s))
  }
}

// ------------------------------------------------------------------------------------------------------------ feedback

// A person's report on one answer (web/src/feedback.ts): what went wrong, a comment, and the conversation up to that answer
// if they left it in. Kept 180 days in KV as fb:<time>:<random>; nothing about the sender (address) is kept.
// worker/scripts/feedback.mjs prints them.
const REASONS = new Set(['understood', 'wrong', 'missing', 'language', 'error', 'slow', 'other'])
const feedbackSeen = new Map<string, number[]>()
function feedbackLimited(ip: string): boolean {
  const now = Date.now()
  const times = (feedbackSeen.get(ip) ?? []).filter((t) => now - t < 60_000)
  times.push(now)
  feedbackSeen.set(ip, times)
  if (feedbackSeen.size > 5000) feedbackSeen.clear()
  return times.length > 5
}
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v ? v.slice(0, max) : undefined)
/** The report, checked and reduced to its known fields; null when it is not one. */
function feedbackReport(b: any): Record<string, unknown> | null {
  if (!b || b.v !== 1 || !Array.isArray(b.conversation) || !b.conversation.length || b.conversation.length > 12) return null
  const conversation = []
  for (const m of b.conversation) {
    if (!m || (m.who !== 'me' && m.who !== 'bot')) return null
    const x: Record<string, string> = { who: m.who }
    for (const k of ['text', 'intro', 'info', 'ai', 'details']) {
      const v = str(m[k], 4100)
      if (v) x[k] = v
    }
    conversation.push(x)
  }
  const reasons = Array.isArray(b.reasons) ? [...new Set(b.reasons.filter((r: unknown) => typeof r === 'string' && REASONS.has(r)))] : []
  const pick = (v: unknown, re: RegExp) => (typeof v === 'string' && re.test(v) ? v : undefined)
  return {
    received: new Date().toISOString().slice(0, 16),
    reasons, comment: str(b.comment, 2000) ?? '', conversation,
    reported: Number.isInteger(b.reported) ? Math.min(Math.max(b.reported, 0), conversation.length - 1) : conversation.length - 1,
    app: pick(b.app, /^[\w.-]{1,24}$/), flavor: pick(b.flavor, /^(full|lite|desktop)$/), ui: pick(b.ui, /^(en|es|fr|id|hi|ar)$/),
    model: pick(b.model, /^[a-z]{1,12}$/), online: typeof b.online === 'boolean' ? b.online : undefined,
    mem: typeof b.mem === 'number' && b.mem > 0 && b.mem <= 64 ? b.mem : undefined,
    packs: Array.isArray(b.packs) ? b.packs.filter((p: unknown) => typeof p === 'string' && CODE.test(p)).slice(0, 20) : [],
  }
}

// ------------------------------------------------------------------------------------------------------------ sign-in

const b64url = (bytes: ArrayBuffer | Uint8Array): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s: string): Uint8Array => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const text = new TextEncoder()

let certs: { at: number; keys: any[] } | null = null
async function googleKeys(): Promise<any[]> {
  if (certs && Date.now() - certs.at < 3600_000) return certs.keys
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs')
  certs = { at: Date.now(), keys: ((await r.json()) as any).keys ?? [] }
  return certs.keys
}

/** A Google ID token's claims, when its signature, issuer, audience and expiry hold; otherwise null. */
async function verifyGoogle(idToken: string, audience: string): Promise<{ sub: string; name?: string } | null> {
  const [h, p, sig] = idToken.split('.')
  if (!h || !p || !sig) return null
  const header = JSON.parse(new TextDecoder().decode(fromB64url(h)))
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(p)))
  const jwk = (await googleKeys()).find((k) => k.kid === header.kid)
  if (!jwk || header.alg !== 'RS256') return null
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(sig), text.encode(`${h}.${p}`))
  if (!ok) return null
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) return null
  if (claims.aud !== audience || !(claims.exp * 1000 > Date.now()) || !claims.sub) return null
  return { sub: String(claims.sub), name: typeof claims.given_name === 'string' ? claims.given_name : undefined }
}

/** The service's own session: who (a hash of the Google id, nothing else) and until when, signed with SESSION_SECRET. */
async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', text.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', key, text.encode(data)))
}
async function issue(env: Env, sub: string): Promise<{ token: string; exp: number }> {
  const who = b64url(await crypto.subtle.digest('SHA-256', text.encode(`btsm:${sub}`))).slice(0, 22)
  const exp = Date.now() + 30 * 86400_000
  const payload = b64url(text.encode(JSON.stringify({ who, exp })))
  return { token: `${payload}.${await hmac(env.SESSION_SECRET!, payload)}`, exp }
}
async function session(env: Env, req: Request): Promise<string | null> {
  const m = /^Bearer\s+([\w-]+)\.([\w-]+)$/.exec(req.headers.get('Authorization') ?? '')
  if (!m || !env.SESSION_SECRET) return null
  if (!same(await hmac(env.SESSION_SECRET, m[1]!), m[2]!)) return null
  const { who, exp } = JSON.parse(new TextDecoder().decode(fromB64url(m[1]!)))
  return typeof who === 'string' && exp > Date.now() ? who : null
}

// --------------------------------------------------------------------------------------------------------------- main

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
    if (url.pathname === '/health') return json({ ok: true, model: env.MODEL, signIn: !!env.GOOGLE_CLIENT_ID })
    if (req.method !== 'POST' || !['/v1/answer', '/v1/session', '/v1/usage', '/v1/feedback'].includes(url.pathname)) return json({ error: 'not found' }, 404)
    // the app's key: anyone who only found the address gets nothing
    const fromApp = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean).includes(req.headers.get('Origin') ?? '')
    if (env.APP_KEY && !same(req.headers.get('X-BTSM-Key') ?? '', env.APP_KEY) && !fromApp) return json({ error: 'unauthorized' }, 401)
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
    if (url.pathname === '/v1/usage') {
      if (usageLimited(ip)) return json({ error: 'too many requests, wait a minute' }, 429)
      const report = usageReport(await req.json().catch(() => null))
      if (!report) return json({ error: 'not a usage report' }, 400)
      await addUsage(env, report)
      return json({ ok: true, days: report.days.length })
    }
    if (url.pathname === '/v1/feedback') {
      if (feedbackLimited(ip)) return json({ error: 'too many requests, wait a minute' }, 429)
      const raw = await req.text()
      if (raw.length > 150_000) return json({ error: 'too large' }, 413)
      let body: unknown = null
      try { body = JSON.parse(raw) } catch {}
      const report = feedbackReport(body)
      if (!report) return json({ error: 'not a report' }, 400)
      if (env.USAGE) {
        const key = `fb:${new Date().toISOString()}:${crypto.randomUUID().slice(0, 8)}`
        await env.USAGE.put(key, JSON.stringify(report), { expirationTtl: 180 * 86400 })
      }
      return json({ ok: true })
    }
    if (limited(ip)) return json({ error: 'too many requests, wait a minute' }, 429)

    let body: { question?: unknown; lang?: unknown; helps?: unknown; history?: unknown; idToken?: unknown }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'bad json' }, 400)
    }

    if (url.pathname === '/v1/session') {
      if (!env.GOOGLE_CLIENT_ID || !env.SESSION_SECRET) return json({ error: 'sign-in is not set up' }, 503)
      const who = typeof body.idToken === 'string' ? await verifyGoogle(body.idToken, env.GOOGLE_CLIENT_ID).catch(() => null) : null
      if (!who) return json({ error: 'sign-in failed' }, 401)
      const s = await issue(env, who.sub)
      return json({ token: s.token, exp: s.exp, name: who.name ?? '' })
    }

    // a signed-in person, when sign-in is required
    let person = 'anyone'
    if (env.GOOGLE_CLIENT_ID) {
      const who = await session(env, req)
      if (!who) return json({ error: 'sign in', signIn: true }, 401)
      person = who
    }
    if ((await count(env, 'all')) >= (Number(env.DAILY_CAP) || 300)) return json({ error: 'daily limit reached for today', limit: 'all' }, 429)
    if (person !== 'anyone' && (await count(env, `p:${person}`)) >= (Number(env.PERSON_DAILY_CAP) || 40))
      return json({ error: 'your daily limit is reached', limit: 'person' }, 429)

    const question = typeof body.question === 'string' ? body.question.trim().slice(0, 600) : ''
    const lang = typeof body.lang === 'string' ? body.lang : 'en'
    const max = Number(env.MAX_CONTEXT) || 9500
    const helps = typeof body.helps === 'string' ? body.helps.slice(0, max) : ''
    if (!question) return json({ error: 'no question' }, 400)

    const history = Array.isArray(body.history)
      ? (body.history as { role?: string; text?: string }[])
          .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
          .slice(-4)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text!.slice(0, 800) }))
      : []
    const messages = [
      { role: 'system', content: system(lang) },
      ...history,
      { role: 'user', content: `Question: ${question}\n\nTranslation helps found on the phone:\n${helps || '(none found)'}` },
    ]
    try {
      const out = await env.AI.run(env.MODEL, { messages, max_tokens: 550, temperature: 0.3 })
      const answer = String(out?.response ?? '').trim()
      if (!answer) return json({ error: 'empty answer' }, 502)
      await Promise.all([bump(env, 'all'), person !== 'anyone' ? bump(env, `p:${person}`) : Promise.resolve()])
      return json({ text: answer, model: env.MODEL })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 502)
    }
  },
}
