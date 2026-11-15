// The packs servers in order (Mini's own first, the old preview after it): a request goes to the next server when one fails,
// for the language packs (serverSource), the phone's model (modelServer) and the trusted keys. Fake servers, no network.
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { newerOnly, serverSource, packsServers, setPacksServers } from '../src/packs'
import { PACKS_DIR } from './fs-packs'
import { MINI_SERVER, PACKS_SERVERS, PREVIEW_SERVER, STAGING_KEYS, TRUSTED_KEYS, trustedKeys } from '../src/shared'

const A = 'https://a.test'
const B = 'https://b.test'
type Answer = Response | 'down' | 'hang'
/** A fetch that answers per server with `plan(server, path)` and records each request. */
function fakeFetch(plan: (server: string, path: string, init?: RequestInit) => Answer) {
  const calls: string[] = []
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const server = url.origin
    calls.push(`${init?.method ?? 'GET'} ${server}${url.pathname}`)
    const a = plan(server, url.pathname, init)
    if (a === 'down') throw new TypeError('Failed to fetch')
    if (a === 'hang') {
      return new Promise<Response>((_, reject) => {
        const s = init?.signal
        if (s?.aborted) return reject(s.reason)
        s?.addEventListener('abort', () => reject(s.reason ?? new Error('aborted')))
      })
    }
    return a
  }) as typeof fetch
  return { f, calls }
}
const bytes = (s: string) => new TextEncoder().encode(s)
const ok = (s: string) => new Response(bytes(s), { headers: { 'Content-Length': String(s.length), ETag: '"e"' } })
const noCatalog = () => new Response(JSON.stringify({ error: 'catalog not found' }), { status: 404 })
const noSegment = () => new Response(JSON.stringify({ error: 'segment not found' }), { status: 404 })
const text = (b: Uint8Array) => new TextDecoder().decode(b)
const SEG = 'c'.repeat(64)

describe('the server list', () => {
  test("Mini's own server first, the old preview after it", () => {
    expect(PACKS_SERVERS).toEqual([MINI_SERVER, PREVIEW_SERVER])
    expect(MINI_SERVER).toBe('https://bt-servant-mini-packs.unfoldingword.workers.dev')
    expect(PREVIEW_SERVER).toBe('https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev')
    expect(packsServers()).toEqual(PACKS_SERVERS)
    setPacksServers([A])
    expect(packsServers()).toEqual([A])
    setPacksServers()
    expect(packsServers()).toEqual(PACKS_SERVERS)
  })
})

describe('serverSource', () => {
  test('the first server answers: the others are not asked', async () => {
    const { f, calls } = fakeFetch(() => ok('cat'))
    const s = serverSource([A, B], { fetch: f })
    const got = await s.catalog('en')
    expect(got !== 'not-modified' && text(got.bytes)).toBe('cat')
    expect(calls).toEqual([`GET ${A}/v3/packs/en/catalog`])
  })
  test('a server that does not answer: the next one, and it goes last for the rest of the download', async () => {
    const { f, calls } = fakeFetch((server) => (server === A ? 'down' : ok('from b')))
    const s = serverSource([A, B], { fetch: f })
    const got = await s.catalog('id')
    expect(got !== 'not-modified' && text(got.bytes)).toBe('from b')
    expect(text(await s.segment(SEG))).toBe('from b')
    expect(text(await s.segment(SEG))).toBe('from b')
    expect(calls).toEqual([`GET ${A}/v3/packs/id/catalog`, `GET ${B}/v3/packs/id/catalog`, `GET ${B}/v3/packs/seg/${SEG}`, `GET ${B}/v3/packs/seg/${SEG}`])
  })
  test('a server error (5xx) or a rate limit: the next one', async () => {
    for (const status of [500, 502, 503, 429]) {
      const { f } = fakeFetch((server) => (server === A ? new Response('x', { status }) : ok('b')))
      expect(text(await serverSource([A, B], { fetch: f }).segment(SEG))).toBe('b')
    }
  })
  test('no catalog on the first server: the next one has it, and the first stays first', async () => {
    const { f, calls } = fakeFetch((server, path) => (server === A && path.includes('/hi/') ? noCatalog() : ok(server)))
    const s = serverSource([A, B], { fetch: f })
    const hi = await s.catalog('hi')
    expect(hi !== 'not-modified' && text(hi.bytes)).toBe(B)
    const en = await s.catalog('en')
    expect(en !== 'not-modified' && text(en.bytes)).toBe(A)
    expect(calls).toEqual([`GET ${A}/v3/packs/hi/catalog`, `GET ${B}/v3/packs/hi/catalog`, `GET ${A}/v3/packs/en/catalog`])
  })
  test('a segment missing on the first server comes from the next one', async () => {
    const { f } = fakeFetch((server) => (server === A ? noSegment() : ok('seg')))
    expect(text(await serverSource([A, B], { fetch: f }).segment(SEG))).toBe('seg')
  })
  test('no server has the language: E_NO_PACK, even when another one is down', async () => {
    const { f } = fakeFetch(() => noCatalog())
    await expect(serverSource([A, B], { fetch: f }).catalog('xx')).rejects.toMatchObject({ code: 'E_NO_PACK' })
    const { f: g } = fakeFetch((server) => (server === A ? 'down' : noCatalog()))
    await expect(serverSource([A, B], { fetch: g }).catalog('xx')).rejects.toMatchObject({ code: 'E_NO_PACK' })
  })
  test('every server down: a network error', async () => {
    const { f } = fakeFetch(() => 'down')
    await expect(serverSource([A, B], { fetch: f }).segment(SEG)).rejects.toMatchObject({ code: 'E_NETWORK' })
    await expect(serverSource([A, B], { fetch: f }).catalog('en')).rejects.toMatchObject({ code: 'E_NETWORK' })
  })
  test('a catalog request that hangs gets its own time per server, then the next server answers', async () => {
    const { f, calls } = fakeFetch((server) => (server === A ? 'hang' : ok('b')))
    const s = serverSource([A, B], { fetch: f, catalogMs: 50 })
    const t0 = Date.now()
    const got = await s.catalog('en', { signal: AbortSignal.timeout(2000) })
    expect(got !== 'not-modified' && text(got.bytes)).toBe('b')
    expect(Date.now() - t0).toBeLessThan(1500)
    expect(calls.length).toBe(2)
  })
  test('a cancel by the person stops at once: no other server is asked', async () => {
    const { f, calls } = fakeFetch(() => 'hang')
    const c = new AbortController()
    const p = serverSource([A, B], { fetch: f }).segment(SEG, c.signal)
    c.abort(new Error('cancelled'))
    await expect(p).rejects.toThrow('cancelled')
    await p.catch(() => {})
    expect(calls).toEqual([`GET ${A}/v3/packs/seg/${SEG}`])
  })
  test('If-None-Match goes to each server tried, and a 304 is "not modified"', async () => {
    const seen: (string | null)[] = []
    const { f } = fakeFetch((server, _p, init) => {
      seen.push(new Headers(init?.headers).get('If-None-Match'))
      return server === A ? 'down' : new Response(null, { status: 304 })
    })
    expect(await serverSource([A, B], { fetch: f }).catalog('en', { etag: '"e1"' })).toBe('not-modified')
    expect(seen).toEqual(['"e1"', '"e1"'])
  })
})

describe('a server that fell behind', () => {
  test('a catalog turned down (older than the phone has) goes to the next server; the first stays first', async () => {
    const { f, calls } = fakeFetch((server) => ok(server === A ? 'old' : 'new'))
    const s = serverSource([A, B], { fetch: f, accept: async (_n, b) => text(b) !== 'old' })
    const got = await s.catalog('en')
    expect(got !== 'not-modified' && text(got.bytes)).toBe('new')
    expect(calls).toEqual([`GET ${A}/v3/packs/en/catalog`, `GET ${B}/v3/packs/en/catalog`])
    await s.catalog('en')
    expect(calls[2]).toBe(`GET ${A}/v3/packs/en/catalog`)
  })
  test('every server turned down: the first answer, so the client says why (E_DOWNGRADE)', async () => {
    const { f } = fakeFetch((server) => ok(server))
    const got = await serverSource([A, B], { fetch: f, accept: async () => false }).catalog('en')
    expect(got !== 'not-modified' && text(got.bytes)).toBe(A)
  })
  test('"not modified" is never turned down', async () => {
    const { f, calls } = fakeFetch(() => new Response(null, { status: 304 }))
    expect(await serverSource([A, B], { fetch: f, accept: async () => false }).catalog('en', { etag: '"e"' })).toBe('not-modified')
    expect(calls.length).toBe(1)
  })
  test('a segment request that stalls: the next server after its own time', async () => {
    const { f } = fakeFetch((server) => (server === A ? 'hang' : ok('seg')))
    expect(text(await serverSource([A, B], { fetch: f, segmentMs: 50 }).segment(SEG))).toBe('seg')
  })
})

describe('newerOnly', () => {
  // the English catalog the tests' packs carry (signed with the staging key, revision 3)
  const st = JSON.parse(readFileSync(join(PACKS_DIR, 'en', 'state.json'), 'utf8'))
  const en = st.published.en
  const file = join(PACKS_DIR, 'en', 'seg', en.id.slice(0, 2), en.id)
  const store = (published: Record<string, unknown>) => async () => ({ getState: async () => ({ published }) }) as any
  test.skipIf(!existsSync(file))('a catalog older than the one on the phone is turned down; the same or newer is taken', async () => {
    const bytes = new Uint8Array(readFileSync(file))
    expect(await newerOnly(store({}))('en', bytes)).toBe(true)
    expect(await newerOnly(store({ en: { ...en } }))('en', bytes)).toBe(true)
    expect(await newerOnly(store({ en: { ...en, revision: en.revision - 1 } }))('en', bytes)).toBe(true)
    expect(await newerOnly(store({ en: { ...en, revision: en.revision + 1 } }))('en', bytes)).toBe(false)
    expect(await newerOnly(store({ en: { ...en, revision: en.revision + 1 } }))('en', new Uint8Array([1, 2, 3]))).toBe(true) // the client rejects it
  })
})

describe('trusted keys', () => {
  test('staging today; a production key slot, empty', async () => {
    const { PRODUCTION_KEYS } = await import('../src/shared')
    expect(PRODUCTION_KEYS).toBe('')
    expect(TRUSTED_KEYS).toBe(STAGING_KEYS)
    expect(Object.keys(trustedKeys())).toEqual(['78d2e6299a2de4d0'])
    expect(trustedKeys()['78d2e6299a2de4d0']!.length).toBe(32)
  })
  test('several keys, comma-separated; an empty or broken entry is skipped', () => {
    const k = trustedKeys(` aaaa:${'01'.repeat(32)}, ,bbbb:zz,${STAGING_KEYS}`)
    expect(Object.keys(k).sort()).toEqual(['78d2e6299a2de4d0', 'aaaa'])
    expect(k.aaaa![0]).toBe(1)
  })
})
