// The offline model: FunctionGemma 270M fine-tuned to write the slots of the call sheet. It runs in llama-server inside the
// app; the page reaches it through the Android bridge (window.Android), or through http://127.0.0.1:8080 on a desktop.
// The light build ships no model: it is downloaded from the packs servers (stored there as a content-addressed segment, so
// a server needs no route of its own; the first server that has it, the next when one fails) or loaded from a file.
import prompt from './data/prompt.json'
import models from './data/models.json'
// @ts-ignore: bun bundles the grammar as text (TypeScript has no type for a .gbnf file)
import grammar from './data/slots.gbnf' with { type: 'text' }
import type { Slots } from './sheet'
import { packsServers } from './packs'
import { webComplete, webInit, webLoad, webState } from './webmodel'

// The installable web app (build.py defines __PWA__ for its bundle): the model runs in the browser (webmodel.ts).
import version from './data/version.json'
declare const __PWA__: boolean
export const PWA = typeof __PWA__ !== 'undefined' && __PWA__
if (PWA) webInit()
// The iOS app: the same bridge as Android (window.Android, given by the app's Swift code), with platform() = 'ios'. Some
// things the Android app does are not there yet: loading or sharing the model as a file, and discreet mode.
export const IOS = (() => {
  try {
    return typeof window !== 'undefined' && window.Android?.platform?.() === 'ios'
  } catch {
    return false
  }
})()
/** Without the model file features and discreet mode: the web app and (for now) the iOS app. */
export const LIMITED = PWA || IOS

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
      /** 'ios' in the iOS app (absent on Android) */
      platform?(): string
      /** sha256 of the model on the phone, '' when unknown (Android 0.9.5+) */
      modelSha?(): string
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
    const b = body as { prompt: string; n_predict: number; stop: string[]; grammar?: string }
    return { content: await webComplete(b.prompt, b.n_predict, b.stop, b.grammar) }
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
  // the servers are being asked which one has the model: for the page, the download has started
  if (choosing) return { state: 'downloading', detail: '0' }
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
/**
 * The shape of the model's reply (data/slots.gbnf): llama-server (Android, desktop), the iOS app's llama.cpp (Llama.swift)
 * and wllama (the web app) sample only what keeps the reply inside it, so the reply is always a call sheet JSON.parse reads.
 */
export const GRAMMAR: string = grammar
/** Whether the model on this phone reads a follow-up's state (trained with it, models.json "followups"), and is that model. */
export const followUps = (): boolean => !!(MODEL as { followups?: boolean }).followups && !modelOutdated()
/** The Android app has a model, but not the one this version expects (it records the sha256 of what it installs). */
export function modelOutdated(): boolean {
  try {
    const A = window.Android
    if (PWA || !A?.modelSha || modelState().state !== 'ready') return false
    return A.modelSha().toLowerCase() !== MODEL.sha256.toLowerCase()
  } catch {
    return false
  }
}
/** Whether the page is asking the servers which one has the model, before the phone's download starts. */
let choosing = false
/**
 * The first packs server that has the model (a HEAD request, `ms` each); the first server when none answers, so the phone's
 * own download reports the failure. Each server is asked in turn: Mini's own first, the old one after it.
 */
export async function modelServer(list: readonly string[] = packsServers(), f: typeof fetch = (i, o) => fetch(i, o), ms = 8000): Promise<string> {
  for (const base of list) {
    const c = new AbortController()
    const t = setTimeout(() => c.abort(), ms)
    try {
      const r = await f(base + MODEL.path, { method: 'HEAD', signal: c.signal, cache: 'no-store' })
      const size = Number(r.headers.get('Content-Length') ?? '')
      if (r.ok && (!size || size === MODEL.bytes)) return base
    } catch {
      /* no answer: the next one */
    } finally {
      clearTimeout(t)
    }
  }
  return list[0]!
}
/** The addresses of the model, the one to try first at the head. */
export function modelUrls(first: string, list: readonly string[] = packsServers()): string[] {
  return [first, ...list.filter((s) => s !== first)].map((s) => s + MODEL.path)
}
export function downloadModel() {
  if (PWA) return void webLoad()
  const A = window.Android
  if (!A || choosing) return
  choosing = true
  void modelServer()
    .then((first) => {
      const urls = modelUrls(first)
      // the iOS app takes them all (Engine.swift goes to the next address when a download fails); Android takes one, and a
      // retry asks the servers again (a cut download resumes from any of them: the same bytes)
      A.downloadModel(IOS ? urls.join(' ') : urls[0]!, MODEL.sha256, String(MODEL.bytes))
    })
    .catch(() => {})
    .finally(() => {
      choosing = false
    })
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
/**
 * The slots for one question; `raw` is what the model wrote, for the details view. Without a model: no slots.
 * `state` (a follow-up): the compact state of the conversation's previous turn, a line "STATE {...}" put before the question;
 * only a model trained for it gets one (followUps()), or it would copy the state into every question.
 */
export async function slotsOf(question: string, state = ''): Promise<{ slots: Slots | null; raw: string; ms: number }> {
  if (modelOff()) return { slots: null, raw: '(model turned off: references and searches only)', ms: 0 }
  if (!modelReady()) return { slots: null, raw: '(no model on this phone yet: references and searches only)', ms: 0 }
  const t0 = performance.now()
  let r: any
  const body = {
    prompt: prompt.template.replace('<<Q>>', (state ? `${state}
` : '') + question.replace(/\s+/g, ' ').trim()),
    temperature: 0, seed: 0, n_predict: 200, stop: ['<end_of_turn>'], cache_prompt: true, grammar: GRAMMAR,
  }
  try {
    r = await complete(body)
    // a llama-server that cannot read the grammar answers with an error and no reply: once more without it, as before
    if (r?.error && typeof r.content !== 'string') r = await complete({ ...body, grammar: undefined })
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
