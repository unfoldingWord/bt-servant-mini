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
export const onlineAvailable = (): boolean => !!onlineUrl()
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

export type Turn = { role: 'user' | 'assistant'; text: string }
/** The online answer, or null when it cannot be had (off, no internet, server error, more than 45 s). */
export async function onlineAnswer(question: string, lang: string, helps: string, history: Turn[]): Promise<{ text: string; model: string } | null> {
  if (!onlineOn() || !onlineAvailable() || !isOnline()) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 45000) // with the passage context an answer can take 20-30 s
  try {
    const r = await fetch(`${onlineUrl()}/v1/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-BTSM-Key': onlineKey(), ...(onlineSession() ? { Authorization: `Bearer ${onlineSession()!.token}` } : {}) },
      body: JSON.stringify({ question, lang, helps: helps.slice(0, 9500), history: history.slice(-4) }),
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
    return typeof j.text === 'string' && j.text.trim() ? { text: j.text.trim(), model: String(j.model ?? '') } : null
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
