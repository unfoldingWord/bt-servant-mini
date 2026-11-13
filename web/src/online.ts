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
/** The online answer, or null when it cannot be had (off, no internet, server error, too slow). */
export async function onlineAnswer(question: string, lang: string, helps: string, history: Turn[]): Promise<{ text: string; model: string } | null> {
  if (!onlineOn() || !onlineAvailable() || !navigator.onLine) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30000)
  try {
    const r = await fetch(`${onlineUrl()}/v1/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, lang, helps: helps.slice(0, 7000), history: history.slice(-4) }),
      signal: ctrl.signal,
    })
    if (!r.ok) return null
    const j = await r.json()
    return typeof j.text === 'string' && j.text.trim() ? { text: j.text.trim(), model: String(j.model ?? '') } : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
export const modelLabel = (model: string): string =>
  /llama-3\.3-70b/.test(model) ? 'Llama 3.3 70B' : /gemma-3/.test(model) ? 'Gemma 3' : model.split('/').pop() ?? model
