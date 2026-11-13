// The model in the browser (the installable web app, for iPhone and anything without the Android app): the same GGUF file
// the Android app runs, through wllama (llama.cpp built to WebAssembly). It is downloaded once from the packs server and kept
// in the browser's cache storage, so it loads without internet afterwards. It runs in a worker; the page stays responsive.
import { LoggerWithoutDebug, Wllama } from '@wllama/wllama'
import models from './data/models.json'
import { PACKS_SERVER } from './packs'

const MODEL = models.models[0]!
// wllama wants a URL that ends in .gguf: the fragment says so, and the server never sees it (same file, same address)
const URL_ = `${PACKS_SERVER}${MODEL.path}#${MODEL.name}.gguf`
type State = { state: 'missing' | 'downloading' | 'starting' | 'ready' | 'error'; detail: string }
let st: State = { state: 'missing', detail: '' }
let w: Wllama | null = null
let busy: Promise<void> | null = null

const make = () =>
  (w ??= new Wllama({ default: new URL('./wllama.wasm', location.href).href }, { logger: LoggerWithoutDebug, allowOffline: true, parallelDownloads: 1 }))

export const webState = (): State => st

/** At launch: if the model was downloaded before, load it (no internet needed); otherwise it stays "missing". */
export async function webInit(): Promise<void> {
  // "starting" from the first moment, so the page (drawn while the cache is checked) keeps asking until it is known
  st = { state: 'starting', detail: '' }
  try {
    const cached = await make().cacheManager.open(URL_)
    if (!cached) return void (st = { state: 'missing', detail: '' })
  } catch {
    return void (st = { state: 'missing', detail: '' })
  }
  await webLoad()
}

/** Downloads the model (or takes it from the cache) and loads it; the state says how far it got. */
export function webLoad(): Promise<void> {
  if (busy) return busy
  busy = (async () => {
    st = { state: 'starting', detail: '' }
    try {
      await make().loadModelFromUrl(URL_, {
        n_ctx: 1024,
        // the CPU (WebAssembly): WebGPU froze the page in testing, and a 270M model needs no GPU
        n_gpu_layers: 0,
        progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
          if (total && loaded < total) st = { state: 'downloading', detail: String(Math.floor((loaded / total) * 100)) }
          else st = { state: 'starting', detail: '' }
        },
      })
      st = { state: 'ready', detail: '' }
      // keep it: ask the browser not to clear this site's storage when space runs low
      navigator.storage?.persist?.().catch(() => {})
    } catch (e) {
      st = { state: 'error', detail: e instanceof Error ? e.message : String(e) }
    } finally {
      busy = null
    }
  })()
  return busy
}

/** One completion (greedy, as on the phone). */
export async function webComplete(prompt: string, nPredict: number, stop: string[]): Promise<string> {
  if (st.state !== 'ready' || !w) throw new Error('the model is not loaded')
  const r = await w.createCompletion({ prompt, max_tokens: nPredict, temperature: 0, seed: 0, stop })
  return r.choices[0]?.text ?? ''
}

/** Removes the downloaded model from this browser. */
export async function webForget(): Promise<void> {
  try {
    await w?.exit()
  } catch {}
  w = null
  try {
    await new Wllama({ default: new URL('./wllama.wasm', location.href).href }, { logger: LoggerWithoutDebug }).cacheManager.delete(URL_)
  } catch {}
  st = { state: 'missing', detail: '' }
}
