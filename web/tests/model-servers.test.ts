// The phone's model comes from the first packs server that has it (a HEAD request each); the iOS app gets every address in
// order. Fake servers, no network.
import { describe, expect, mock, test } from 'bun:test'
// model.ts sets a callback on window at load: a window only for that, so the other test files do not see one
const hadWindow = 'window' in globalThis
if (!hadWindow) (globalThis as any).window = {}
// the browser's model runner (not installed for the tests): a fake whose downloads and loads the tests decide
const fake = {
  downloads: [] as string[], deleted: [] as string[], loads: 0,
  answer: (_url: string): Uint8Array | Error => new Uint8Array(0), loadFails: false,
}
class FakeWllama {
  modelManager = {
    getModelOrDownload: async ({ url }: { url: string }) => {
      fake.downloads.push(url)
      const a = fake.answer(url)
      if (a instanceof Error) throw a
      return { open: async () => [new Blob([a])] }
    },
  }
  cacheManager = { delete: async (u: string) => void fake.deleted.push(u), open: async () => null }
  async loadModel() {
    fake.loads++
    if (fake.loadFails) throw new Error('out of memory')
  }
}
mock.module('@wllama/wllama', () => ({ Wllama: FakeWllama, LoggerWithoutDebug: {} }))
;(globalThis as any).location ??= { href: 'http://localhost/' }
const { MODEL, modelServer, modelUrls } = await import('../src/model')
const web = await import('../src/webmodel')
const { setPacksServers } = await import('../src/packs')
const { createHash } = await import('node:crypto')
if (!hadWindow) delete (globalThis as any).window

const A = 'https://a.test'
const B = 'https://b.test'
const head = (plan: Record<string, Response | 'down'>) => {
  const calls: string[] = []
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method} ${String(input)}`)
    const a = plan[new URL(String(input)).origin]
    if (!a || a === 'down') throw new TypeError('Failed to fetch')
    return a
  }) as typeof fetch
  return { f, calls }
}
const has = (size = MODEL.bytes) => new Response(null, { headers: { 'Content-Length': String(size) } })

describe('the model server', () => {
  test('the first server that has it, asked with HEAD at the model path', async () => {
    const { f, calls } = head({ [A]: has(), [B]: has() })
    expect(await modelServer([A, B], f)).toBe(A)
    expect(calls).toEqual([`HEAD ${A}${MODEL.path}`])
  })
  test('down, missing, or a different size: the next one', async () => {
    for (const first of ['down', new Response(null, { status: 404 }), new Response(null, { status: 503 }), has(1234)] as const) {
      const { f } = head({ [A]: first, [B]: has() })
      expect(await modelServer([A, B], f)).toBe(B)
    }
  })
  test('none answers: the first, so the phone reports the failure itself', async () => {
    const { f } = head({})
    expect(await modelServer([A, B], f)).toBe(A)
  })
  test('a server that does not answer in time: the next one', async () => {
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith(A)) return new Promise<Response>((_, j) => init!.signal!.addEventListener('abort', () => j(new Error('timeout'))))
      return has()
    }) as typeof fetch
    expect(await modelServer([A, B], f, 30)).toBe(B)
  })
  test('the addresses for the iOS app: the chosen server first, then the others in order', () => {
    expect(modelUrls(B, [A, B])).toEqual([`${B}${MODEL.path}`, `${A}${MODEL.path}`])
    expect(modelUrls(A, [A, B])).toEqual([`${A}${MODEL.path}`, `${B}${MODEL.path}`])
    expect(MODEL.path).toBe(`/v3/packs/seg/${MODEL.sha256}`)
  })
})

describe('the model in the browser (web app)', () => {
  const good = Uint8Array.from({ length: 5000 }, (_, i) => (i * 31) & 255)
  web.EXPECTED.bytes = good.length
  web.EXPECTED.sha256 = createHash('sha256').update(good).digest('hex')
  const fresh = (answer: typeof fake.answer, loadFails = false) => {
    Object.assign(fake, { downloads: [], deleted: [], loads: 0, answer, loadFails })
  }
  test('sha256Blob matches the platform digest for every length and chunking', async () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 128, 1000, 70001]) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 7 + n) & 255)
      const want = createHash('sha256').update(b).digest('hex')
      expect(await web.sha256Blob(new Blob([b]))).toBe(want)
      // in uneven parts, as a stream may give them
      const parts = [b.subarray(0, Math.min(n, 3)), b.subarray(Math.min(n, 3), Math.min(n, 70)), b.subarray(Math.min(n, 70))]
      expect(await web.sha256Blob(new Blob(parts))).toBe(want)
    }
  })
  test('the first server that gives the model whole; one load', async () => {
    setPacksServers([A, B])
    fresh(() => good)
    await web.webLoad()
    expect(web.webState().state).toBe('ready')
    expect(fake.downloads).toEqual([web.modelUrl(A)])
    expect(fake.loads).toBe(1)
    await web.webForget()
  })
  test('a failed download or a damaged file: the next server (the damaged copy is dropped)', async () => {
    setPacksServers([A, B])
    fresh((url) => (url.startsWith(A) ? new Error('network') : good))
    await web.webLoad()
    expect(web.webState().state).toBe('ready')
    expect(fake.downloads).toEqual([web.modelUrl(A), web.modelUrl(B)])
    await web.webForget()
    fresh((url) => (url.startsWith(A) ? good.map((x) => x ^ 1) : good))
    await web.webLoad()
    expect(web.webState().state).toBe('ready')
    expect(fake.deleted).toEqual([web.modelUrl(A)])
    expect(fake.loads).toBe(1)
    await web.webForget()
  })
  test('a load that fails after a good download is the error: no second download', async () => {
    setPacksServers([A, B])
    fresh(() => good, true)
    await web.webLoad()
    expect(web.webState()).toEqual({ state: 'error', detail: 'out of memory' })
    expect(fake.downloads).toEqual([web.modelUrl(A)])
    expect(fake.loads).toBe(1)
    await web.webForget()
  })
  test('every server fails: the error, nothing loaded', async () => {
    setPacksServers([A, B])
    fresh(() => new Error('offline'))
    await web.webLoad()
    expect(web.webState().state).toBe('error')
    expect(fake.loads).toBe(0)
    setPacksServers()
  })
})
