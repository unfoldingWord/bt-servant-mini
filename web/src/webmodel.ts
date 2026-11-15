// The model in the browser (the installable web app, for iPhone and anything without the Android app): the same GGUF file
// the Android app runs, through wllama (llama.cpp built to WebAssembly). It is downloaded once from the packs servers (the
// next one when one fails) and kept in the browser's cache storage, under the address it came from, so it loads without
// internet afterwards. It runs in a worker; the page stays responsive.
import { LoggerWithoutDebug, Wllama } from '@wllama/wllama'
import models from './data/models.json'
import { packsServers } from './packs'

const MODEL = models.models[0]!
/** What a download must be (the tests give a small file instead). */
export const EXPECTED = { bytes: MODEL.bytes, sha256: MODEL.sha256.toLowerCase() }
// wllama wants a URL that ends in .gguf: the fragment says so, and the server never sees it (same file, same address)
export const modelUrl = (server: string) => `${server}${MODEL.path}#${MODEL.name}.gguf`
/** The address the model was downloaded from (the browser keeps it under that address), once known. */
let from: string | null = null
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
  // a browser that downloaded it with 0.9.9 or before has it under the old server's address: that copy is used, not downloaded again
  for (const url of packsServers().map(modelUrl)) {
    try {
      if (await make().cacheManager.open(url)) {
        from = url
        break
      }
    } catch {}
  }
  if (!from) return void (st = { state: 'missing', detail: '' })
  await webLoad()
}

/**
 * Downloads the model (or takes it from the cache) and loads it; the state says how far it got. Only a download moves on to
 * the next server: when one fails, or what arrived is not the model (its SHA-256, checked once after the download; the damaged
 * copy is dropped). Loading happens once, after that: a load that fails (memory, WebAssembly) is the error, not a reason to
 * download 291 MB again from another server.
 */
const VERIFIED = 'btsm.model.verified'
/** Whether the model in the cache was checked (it holds the SHA-256 it was checked against). */
function verified(): boolean {
  try {
    return localStorage.getItem(VERIFIED) === EXPECTED.sha256
  } catch {
    return false
  }
}
function markVerified(on: boolean) {
  try {
    if (on) localStorage.setItem(VERIFIED, EXPECTED.sha256)
    else localStorage.removeItem(VERIFIED)
  } catch {}
}

export function webLoad(): Promise<void> {
  if (busy) return busy
  busy = (async () => {
    st = { state: 'starting', detail: '' }
    const progressCallback = ({ loaded, total }: { loaded: number; total: number }) => {
      if (total && loaded < total) st = { state: 'downloading', detail: String(Math.floor((loaded / total) * 100)) }
      else st = { state: 'starting', detail: '' }
    }
    try {
      const models = make().modelManager
      let model: Awaited<ReturnType<typeof models.getModelOrDownload>> | null = null
      // the whole model as it should be: the right size and SHA-256 (the damaged copy is dropped)
      const whole = async (url: string, got: NonNullable<typeof model>) => {
        st = { state: 'starting', detail: 'checking' }
        const blobs = await got.open()
        if (blobs.length === 1 && blobs[0]!.size === EXPECTED.bytes && (await sha256Blob(blobs[0]!)) === EXPECTED.sha256) {
          markVerified(true)
          return true
        }
        await make().cacheManager.delete(url).catch(() => {})
        markVerified(false)
        return false
      }
      if (from) {
        model = await models.getModelOrDownload({ url: from }, { progressCallback })
        // a copy from before the check existed (0.9.9 or older) is checked once, not at every start
        if (!verified() && !(await whole(from, model))) {
          model = null
          from = null
        }
      }
      if (!model) {
        let failure: unknown = null
        for (const url of packsServers().map(modelUrl)) {
          try {
            const got = await models.getModelOrDownload({ url }, { progressCallback })
            if (!(await whole(url, got))) throw new Error('the downloaded model is damaged (SHA-256)')
            from = url
            model = got
            break
          } catch (e) {
            failure = e
          }
        }
        if (!model) throw failure ?? new Error('no packs server')
      }
      st = { state: 'starting', detail: '' }
      await make().loadModel(model, {
        n_ctx: 1024,
        // the CPU (WebAssembly): WebGPU froze the page in testing, and a 270M model needs no GPU
        n_gpu_layers: 0,
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

// SHA-256 over a stream, a chunk at a time: the 291 MB file is never held in memory a second time (crypto.subtle has no
// incremental digest). About 6 s on a laptop for the 291 MB, longer on a phone; once, after the download.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
  0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
  0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
  0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])
export async function sha256Blob(blob: Blob): Promise<string> {
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const W = new Uint32Array(64)
  const block = (b: Uint8Array, o: number) => {
    for (let i = 0; i < 16; i++) W[i] = (b[o + 4 * i]! << 24) | (b[o + 4 * i + 1]! << 16) | (b[o + 4 * i + 2]! << 8) | b[o + 4 * i + 3]!
    for (let i = 16; i < 64; i++) {
      const x = W[i - 15]!
      const y = W[i - 2]!
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)
      W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) | 0
    }
    let a = H[0]!, b2 = H[1]!, c = H[2]!, d = H[3]!, e = H[4]!, f = H[5]!, g = H[6]!, h = H[7]!
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i]! + W[i]!) | 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const t2 = (S0 + ((a & b2) ^ (a & c) ^ (b2 & c))) | 0
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b2; b2 = a; a = (t1 + t2) | 0
    }
    H[0] = H[0]! + a; H[1] = H[1]! + b2; H[2] = H[2]! + c; H[3] = H[3]! + d
    H[4] = H[4]! + e; H[5] = H[5]! + f; H[6] = H[6]! + g; H[7] = H[7]! + h
  }
  const rest = new Uint8Array(64)
  let have = 0
  let total = 0
  const reader = blob.stream().getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    let i = 0
    if (have) {
      const n = Math.min(64 - have, value.length)
      rest.set(value.subarray(0, n), have)
      have += n
      i = n
      if (have < 64) continue
      block(rest, 0)
      have = 0
    }
    for (; i + 64 <= value.length; i += 64) block(value, i)
    rest.set(value.subarray(i), 0)
    have = value.length - i
  }
  const tail = new Uint8Array(have < 56 ? 64 : 128)
  tail.set(rest.subarray(0, have))
  tail[have] = 0x80
  const view = new DataView(tail.buffer)
  view.setUint32(tail.length - 8, Math.floor((total * 8) / 4294967296))
  view.setUint32(tail.length - 4, (total * 8) >>> 0)
  block(tail, 0)
  if (tail.length === 128) block(tail, 64)
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('')
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
  const cache = new Wllama({ default: new URL('./wllama.wasm', location.href).href }, { logger: LoggerWithoutDebug }).cacheManager
  for (const url of packsServers().map(modelUrl)) {
    try {
      await cache.delete(url)
    } catch {}
  }
  from = null
  markVerified(false)
  st = { state: 'missing', detail: '' }
}
