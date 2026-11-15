// The phone's model comes from the first packs server that has it (a HEAD request each); the iOS app gets every address in
// order. Fake servers, no network.
import { describe, expect, mock, test } from 'bun:test'
// model.ts sets a callback on window at load: a window only for that, so the other test files do not see one
const hadWindow = 'window' in globalThis
if (!hadWindow) (globalThis as any).window = {}
// the browser's model runner is not used here (and not installed for the tests)
mock.module('@wllama/wllama', () => ({ Wllama: class {}, LoggerWithoutDebug: {} }))
const { MODEL, modelServer, modelUrls } = await import('../src/model')
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
