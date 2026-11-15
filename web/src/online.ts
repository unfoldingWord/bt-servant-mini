// Level 3: with internet, and only if the person turned it on, a larger open model (BT Servant Mini's online helper,
// Cloudflare Workers AI) writes a conversational answer from the helps the app already found on the phone. The question and
// those helps leave the phone; nothing else does. Without internet or on any error the offline answer stands alone.
import online from './data/online.json'

const KEY = 'btsm.online'
const URL_KEY = 'btsm.onlineUrl' // for testing against a local `wrangler dev`
export const onlineUrl = (): string => {
  try {
    return localStorage.getItem(URL_KEY) || online.url
  } catch {
    return online.url
  }
}
// not in the iOS app yet: the online service accepts the Android app's key or the web app's origin, not the iOS app
export const onlineAvailable = (): boolean => !!onlineUrl() && (window as any).Android?.platform?.() !== 'ios'
/** Whether the phone has a connection now. On Android, from the app (WebView keeps navigator.onLine true without one). */
export function isOnline(): boolean {
  try {
    const b = (window as any).Android
    if (b?.online) return !!b.online()
  } catch {}
  return navigator.onLine
}
/** The app's key for the online service: from the APK (Android bridge), or set by hand for desktop testing. */
export const onlineKey = (): string => {
  try {
    return (window as any).Android?.onlineKey?.() || localStorage.getItem('btsm.onlineKey') || ''
  } catch {
    return ''
  }
}
export function onlineOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
export function setOnline(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {}
}

/**
 * The question read online into the call sheet (the phone model's job), when the person turned the online helper on and there
 * is a connection: a 70B model reads free questions better than the phone's 270M, above all in English and Spanish. Null on
 * any problem or after 8 s, and the phone model reads it instead. Unlike an answer, a failure here changes nothing on screen.
 */
export async function onlineSlots(question: string, state = ''): Promise<{ slots: any; model: string; ms: number } | null> {
  if (!onlineOn() || !onlineAvailable() || !isOnline()) return null
  if (signInAvailable() && !onlineSession()) return null
  const t0 = performance.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000) // measured: median 3 s, 90% under 5 s, worst 7 s
  try {
    const r = await fetch(`${onlineUrl()}/v1/slots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-BTSM-Key': onlineKey(), ...(onlineSession() ? { Authorization: `Bearer ${onlineSession()!.token}` } : {}) },
      body: JSON.stringify({ question: (state ? `${state}
` : '') + question }),
      signal: ctrl.signal,
    })
    if (!r.ok) return null
    const j = await r.json()
    const s = j?.slots
    if (!s || typeof s !== 'object' || typeof s.intent !== 'string') return null
    return { slots: s, model: String(j.model ?? ''), ms: Math.round(performance.now() - t0) }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export type Turn = { role: 'user' | 'assistant'; text: string }
/** An article the phone found for the question: "ta:translate/figs-metaphor" (title optional: the helps' first heading stands in). */
export type Source = { id: string; title?: string }
export type OnlineAnswer = { text: string; model: string; sources: { id: string; title: string; label: string }[] }

const KIND_NAME: Record<string, Record<string, string>> = {
  ta: { en: 'Translation Academy', es: 'Traducción Académica (Translation Academy)', fr: 'Académie de traduction (Translation Academy)', id: 'Akademi Terjemahan (Translation Academy)', hi: 'अनुवाद अकादमी (Translation Academy)', ar: 'أكاديمية الترجمة (Translation Academy)' },
  tw: { en: 'Translation Words', es: 'Palabras de traducción (Translation Words)', fr: 'Mots de traduction (Translation Words)', id: 'Kata-kata Terjemahan (Translation Words)', hi: 'अनुवाद शब्द (Translation Words)', ar: 'كلمات الترجمة (Translation Words)' },
}
const SOURCE_WORD: Record<string, [string, string]> = {
  en: ['Source', 'Sources'], es: ['Fuente', 'Fuentes'], fr: ['Source', 'Sources'], id: ['Sumber', 'Sumber'], hi: ['स्रोत', 'स्रोत'], ar: ['المصدر', 'المصادر'],
}
/** "Translation Academy: Metaphor", in the app's language. */
export const sourceLabel = (id: string, title: string, ui: string): string => `${(KIND_NAME[id.slice(0, 2)] ?? KIND_NAME.ta!)[ui] ?? KIND_NAME[id.slice(0, 2)]?.en ?? 'Helps'}: ${title}`

/**
 * The articles to show under the answer, whatever the model wrote: from what the phone found (not from the model), with the
 * title the phone gave or else the heading the helps start with, else the end of the id.
 */
export function withSources(sources: Source[], helps: string, ui: string): OnlineAnswer['sources'] {
  const heading = (helps.match(/^#{1,3} (.+)$/m)?.[1] ?? '').trim()
  const out: OnlineAnswer['sources'] = []
  for (const s of sources.slice(0, 4)) {
    if (!/^(ta|tw):/.test(s.id) || out.some((o) => o.id === s.id)) continue
    const title = (s.title || heading || s.id.split('/').pop()!).replace(/\s+/g, ' ').trim()
    out.push({ id: s.id, title, label: sourceLabel(s.id, title, ui) })
  }
  return out
}
/**
 * The answer's text with its sources named: when the model already wrote an article's title the text stands as it is; otherwise
 * a last line "Source: Translation Academy: Metaphor" is added, so a source is never missing even if Llama forgot it.
 */
export function citeSources(text: string, sources: OnlineAnswer['sources'], ui: string): string {
  const low = text.toLowerCase()
  const missing = sources.filter((s) => !low.includes(s.title.toLowerCase()))
  if (!missing.length) return text
  const w = SOURCE_WORD[ui] ?? SOURCE_WORD.en!
  return `${text}

*${w[missing.length > 1 ? 1 : 0]}: ${missing.map((s) => s.label).join('; ')}*`
}

/**
 * The online answer, or null when it cannot be had (off, no internet, server error, more than 45 s). `sources` are the articles
 * the phone found (the message's `ctx`): they are sent so the model grounds the answer in them and names them, and come back in
 * `sources` (always, whatever the model wrote) for the app to show as a source line or button under the answer.
 */
export async function onlineAnswer(question: string, lang: string, helps: string, history: Turn[], sources: Source[] = []): Promise<OnlineAnswer | null> {
  if (!onlineOn() || !onlineAvailable() || !isOnline()) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 45000) // with the passage context an answer can take 20-30 s
  try {
    const cut = helps.slice(0, 9500)
    const found = withSources(sources, cut, lang)
    const r = await fetch(`${onlineUrl()}/v1/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-BTSM-Key': onlineKey(), ...(onlineSession() ? { Authorization: `Bearer ${onlineSession()!.token}` } : {}) },
      body: JSON.stringify({ question, lang, helps: cut, history: history.slice(-4), sources: found.map(({ id, title }) => ({ id, title })) }),
      signal: ctrl.signal,
    })
    onlineProblem = ''
    if (r.status === 401) {
      const j = await r.json().catch(() => ({}))
      if (j.signIn) {
        signOut()
        onlineProblem = 'signin'
      }
      return null
    }
    if (r.status === 429) {
      onlineProblem = 'limit'
      return null
    }
    if (!r.ok) {
      onlineProblem = 'network'
      return null
    }
    const j = await r.json()
    return typeof j.text === 'string' && j.text.trim() ? { text: citeSources(j.text.trim(), found, lang), model: String(j.model ?? ''), sources: found } : null
  } catch {
    onlineProblem = 'network' // no connection, the service down, or more than 45 s
    return null
  } finally {
    clearTimeout(timer)
  }
}
export const modelLabel = (model: string): string =>
  /llama-3\.3-70b/.test(model) ? 'Llama 3.3 70B' : /gemma-3/.test(model) ? 'Gemma 3' : model.split('/').pop() ?? model

// ------------------------------------------------------------------------------------------------- sign-in (Google)
// Only when the person turns online AI on, and only on a build that has a Google client id. The service turns the Google
// sign-in into its own session of 30 days; the app keeps that session, not the Google account.

const SESSION_KEY = 'btsm.online.session'
type Session = { token: string; exp: number; name: string }
export function onlineSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null
    return s && s.token && s.exp > Date.now() ? s : null
  } catch {
    return null
  }
}
export function signOut() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {}
}
/** Whether this build asks for a sign-in (it has a Google client id). */
export const signInAvailable = (): boolean => {
  try {
    return !!(window as any).Android?.signInAvailable?.()
  } catch {
    return false
  }
}
export async function signIn(): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const A = (window as any).Android
  if (!A?.signIn) return { ok: false, error: 'not available' }
  const g = await new Promise<any>((res) => {
    ;(window as any).__signin = (r: any) => res(r)
    A.signIn()
  })
  if (!g?.idToken) return { ok: false, error: g?.error ?? 'cancelled' }
  try {
    const r = await fetch(`${onlineUrl()}/v1/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-BTSM-Key': onlineKey() },
      body: JSON.stringify({ idToken: g.idToken }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.token) return { ok: false, error: j.error ?? `HTTP ${r.status}` }
    const s: Session = { token: j.token, exp: j.exp, name: j.name || g.name || '' }
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    } catch {}
    return { ok: true, name: s.name }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
/** Why the last online answer did not come: '' (none, or no internet), 'signin' (the session ended), 'limit' (daily cap). */
export let onlineProblem: '' | 'signin' | 'limit' | 'network' = ''
