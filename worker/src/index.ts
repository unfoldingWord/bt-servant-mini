// BT Servant Mini — online helper (level 3).
//   POST /v1/session { idToken }  -> { token, name, exp }   a Google sign-in becomes a session of 30 days
//   POST /v1/answer  { question, lang, helps, history? } -> { text, model }   with the session, when sign-in is required
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
    'Explain and paraphrase them simply so a translator can act on them; when you give a suggestion, base it on a note or an article.',
    'Name the resource you use (for example: the ULT, a translation note, the Translation Words article "grace").',
    'If the helps do not answer the question, say so in one sentence and suggest how to ask (a reference, a word, a phrase in quotes).',
    'Never invent verses, notes, numbers or facts that are not in the helps. Do not preach.',
    'Be brief: at most about 180 words. Use short paragraphs or a short list; you may use **bold** for key words.',
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
    if (req.method !== 'POST' || !['/v1/answer', '/v1/session'].includes(url.pathname)) return json({ error: 'not found' }, 404)
    // the app's key: anyone who only found the address gets nothing
    if (env.APP_KEY && !same(req.headers.get('X-BTSM-Key') ?? '', env.APP_KEY)) return json({ error: 'unauthorized' }, 401)
    if (limited(req.headers.get('CF-Connecting-IP') ?? 'unknown')) return json({ error: 'too many requests, wait a minute' }, 429)

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
    const max = Number(env.MAX_CONTEXT) || 7000
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
      const out = await env.AI.run(env.MODEL, { messages, max_tokens: 450, temperature: 0.3 })
      const answer = String(out?.response ?? '').trim()
      if (!answer) return json({ error: 'empty answer' }, 502)
      await Promise.all([bump(env, 'all'), person !== 'anyone' ? bump(env, `p:${person}`) : Promise.resolve()])
      return json({ text: answer, model: env.MODEL })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 502)
    }
  },
}
