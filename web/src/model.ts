// The offline model: FunctionGemma 270M fine-tuned to write the slots of the call sheet. It runs in llama-server inside the app;
// the page reaches it through the Android bridge (window.Android), or through http://127.0.0.1:8080 on a desktop for testing.
import prompt from './data/prompt.json'
import type { Slots } from './sheet'

declare global {
  interface Window {
    Android?: { complete(id: string, body: string): void; ready(): boolean; status(): string }
    __llm?: (id: string, result: string) => void
  }
}

const pending = new Map<string, (r: string) => void>()
window.__llm = (id, result) => {
  pending.get(id)?.(result)
  pending.delete(id)
}

let seq = 0
async function complete(body: object): Promise<any> {
  const json = JSON.stringify(body)
  if (window.Android) {
    const id = String(++seq)
    const raw = await new Promise<string>((res) => {
      pending.set(id, res)
      window.Android!.complete(id, json)
    })
    if (raw.startsWith('ERROR:')) throw new Error(raw.slice(6))
    return JSON.parse(raw)
  }
  const r = await fetch('http://127.0.0.1:8080/completion', { method: 'POST', body: json, headers: { 'Content-Type': 'application/json' } })
  return r.json()
}

export function modelReady(): boolean {
  return window.Android ? window.Android.ready() : true
}
export function modelStatus(): string {
  return window.Android ? window.Android.status() : 'desktop'
}

/** The slots for one question; `raw` is what the model wrote, for the details view. */
export async function slotsOf(question: string): Promise<{ slots: Slots | null; raw: string; ms: number }> {
  const t0 = performance.now()
  const r = await complete({
    prompt: prompt.template.replace('<<Q>>', question.replace(/\s+/g, ' ').trim()),
    temperature: 0, seed: 0, n_predict: 200, stop: ['<end_of_turn>'], cache_prompt: true,
  })
  const raw: string = r.content ?? ''
  const ms = Math.round(performance.now() - t0)
  let txt = raw.trim()
  const end = txt.lastIndexOf('}')
  if (end > 0) txt = txt.slice(0, end + 1)
  try {
    return { slots: JSON.parse(txt), raw, ms }
  } catch {
    return { slots: null, raw, ms }
  }
}
