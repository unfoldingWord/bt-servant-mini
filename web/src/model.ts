// The offline model: FunctionGemma 270M fine-tuned to write the slots of the call sheet. It runs in llama-server inside the
// app; the page reaches it through the Android bridge (window.Android), or through http://127.0.0.1:8080 on a desktop.
// The light build ships no model: it is downloaded from the packs server (stored there as a content-addressed segment, so
// the server needs no route of its own) or loaded from a file.
import prompt from './data/prompt.json'
import models from './data/models.json'
import type { Slots } from './sheet'
import { PACKS_SERVER } from './packs'
import { webComplete, webInit, webLoad, webState } from './webmodel'

// The installable web app (build.py defines __PWA__ for its bundle): the model runs in the browser (webmodel.ts).
import version from './data/version.json'
declare const __PWA__: boolean
export const PWA = typeof __PWA__ !== 'undefined' && __PWA__
if (PWA) webInit()

declare global {
  interface Window {
    Android?: {
      complete(id: string, body: string): void
      ready(): boolean
      status(): string
      flavor(): string
      version(): string
      onlineKey?(): string
      downloadModel(url: string, sha: string, size: string): void
      pickModel(sha: string): void
      exportModel(name: string): string
      saveBegin(name: string, mime: string): string
      saveChunk(b64: string): string
      saveEnd(): string
    }
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
  if (PWA) {
    const b = body as { prompt: string; n_predict: number; stop: string[] }
    return { content: await webComplete(b.prompt, b.n_predict, b.stop) }
  }
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

export type ModelState = { state: 'ready' | 'missing' | 'copying' | 'starting' | 'downloading' | 'importing' | 'error'; detail: string }
export function modelState(): ModelState {
  if (PWA) return webState()
  if (!window.Android) return { state: 'ready', detail: '' }
  const s = window.Android.status()
  const i = s.indexOf(':')
  return { state: (i < 0 ? s : s.slice(0, i)) as ModelState['state'], detail: i < 0 ? '' : s.slice(i + 1) }
}
const OFF_KEY = 'btsm.model.off'
/** The person chose no model: the app answers references and searches only (the model stays on the phone). */
export function modelOff(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === '1'
  } catch {
    return false
  }
}
export function setModelOff(off: boolean) {
  try {
    localStorage.setItem(OFF_KEY, off ? '1' : '0')
  } catch {}
}
export function modelReady(): boolean {
  if (PWA) return webState().state === 'ready'
  return window.Android ? window.Android.ready() : true
}
export const appVersion = (): string => (PWA ? `${version.version}-web` : window.Android ? window.Android.version() : 'desktop')
export const isLite = (): boolean => (PWA ? true : window.Android ? window.Android.flavor() === 'lite' : false)
export const MODEL = models.models[0]!
export function downloadModel() {
  if (PWA) return void webLoad()
  window.Android?.downloadModel(PACKS_SERVER + MODEL.path, MODEL.sha256, String(MODEL.bytes))
}
export function pickModelFile() {
  window.Android?.pickModel(MODEL.sha256)
}
export function exportModel(): string {
  return window.Android ? window.Android.exportModel(`${MODEL.name}.gguf`) : 'no Android bridge'
}

/** Writes bytes made in the page (a .tcpack) to the phone's Downloads folder, through the bridge in chunks. */
export async function saveToDownloads(name: string, bytes: Uint8Array, mime = 'application/octet-stream'): Promise<string> {
  const A = window.Android
  if (!A) {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    a.click()
    URL.revokeObjectURL(url)
    return ''
  }
  let err = A.saveBegin(name, mime)
  if (err) return err
  const CH = 1 << 20
  for (let i = 0; i < bytes.length && !err; i += CH) {
    let bin = ''
    const part = bytes.subarray(i, i + CH)
    for (let j = 0; j < part.length; j += 0x8000) bin += String.fromCharCode(...part.subarray(j, j + 0x8000))
    err = A.saveChunk(btoa(bin))
  }
  return err || A.saveEnd()
}

/** The slots for one question; `raw` is what the model wrote, for the details view. Without a model: no slots. */
export async function slotsOf(question: string): Promise<{ slots: Slots | null; raw: string; ms: number }> {
  if (modelOff()) return { slots: null, raw: '(model turned off: references and searches only)', ms: 0 }
  if (!modelReady()) return { slots: null, raw: '(no model on this phone yet: references and searches only)', ms: 0 }
  const t0 = performance.now()
  let r: any
  try {
    r = await complete({
      prompt: prompt.template.replace('<<Q>>', question.replace(/\s+/g, ' ').trim()),
      temperature: 0, seed: 0, n_predict: 200, stop: ['<end_of_turn>'], cache_prompt: true,
    })
  } catch (e) {
    // the model did not answer (it stopped, or is still starting): go on as without a model, references and searches
    return { slots: null, raw: `(the model did not answer: ${e instanceof Error ? e.message : String(e)})`, ms: Math.round(performance.now() - t0) }
  }
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
