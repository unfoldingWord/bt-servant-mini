// The packs server against an in-memory R2 bucket that behaves like R2 for what the server uses: head, get with a range
// and with onlyIf.etagDoesNotMatch (then an object with no body), and a range starting past the end that throws.
import { describe, expect, test } from 'bun:test'
import { handle, parsePath, parseRange } from '../src/index'

function memoryBucket(files: Record<string, Uint8Array>) {
  const etagOf = (k: string) => new Bun.CryptoHasher('md5').update(files[k]!).digest('hex')
  const meta = (k: string) => ({ key: k, size: files[k]!.length, etag: etagOf(k), httpEtag: `"${etagOf(k)}"`, writeHttpMetadata() {} })
  const calls: string[] = []
  return {
    calls,
    async head(k: string) {
      calls.push(`head ${k}`)
      return files[k] ? meta(k) : null
    },
    async get(k: string, o: any = {}) {
      calls.push(`get ${k}`)
      const b = files[k]
      if (!b) return null
      if (o.onlyIf?.etagDoesNotMatch === etagOf(k)) return meta(k)
      let part = b
      if (o.range) {
        const r = o.range
        if ('suffix' in r) part = b.subarray(Math.max(0, b.length - r.suffix))
        else {
          if (r.offset >= b.length) throw new Error('range not satisfiable (R2)')
          part = b.subarray(r.offset, r.length === undefined ? undefined : r.offset + r.length)
        }
      }
      return { ...meta(k), body: new Response(part).body! }
    },
  } as any
}

const bytes = (n: number, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed) & 255)
const SEG = 'a'.repeat(64)
const COMP = 'c'.repeat(64)
const MODEL = '25937ade35ce4462bbb5879de7c420ba63b70e009c13f81a316d23de4c47ccb7'
const files = {
  'v3/catalog/en.seg': bytes(300, 2),
  'v3/catalog/es-419.seg': bytes(200, 3),
  'v3/catalog/ar.seg': bytes(150, 4),
  'v3/catalog/common.seg': bytes(120, 5),
  [`v3/seg/${SEG}.seg`]: bytes(1000, 6),
  [`v3/seg/${MODEL}.seg`]: bytes(5000, 7),
  [`v3/complement/${COMP}`]: bytes(60, 8),
}
const env = () => ({ PACKS: memoryBucket(files) })
const req = (path: string, init: RequestInit = {}) => new Request(`https://packs.test${path}`, init)
const body = async (r: Response) => new Uint8Array(await r.arrayBuffer())

describe('paths', () => {
  test('catalogs, the common catalog and segments map to the bucket keys of translation-helps', () => {
    expect(parsePath('en/catalog')).toEqual({ route: 'catalog', lang: 'en', key: 'v3/catalog/en.seg' })
    expect(parsePath('ES-419/catalog')).toEqual({ route: 'catalog', lang: 'es-419', key: 'v3/catalog/es-419.seg' })
    expect(parsePath('es/catalog')).toEqual({ route: 'catalog', lang: 'es', key: 'v3/catalog/es.seg', alias: 'v3/catalog/es-419.seg' })
    expect(parsePath('common/catalog')).toEqual({ route: 'catalog', lang: 'common', key: 'v3/catalog/common.seg' })
    expect(parsePath(`seg/${SEG}`)).toEqual({ route: 'seg', id: SEG, key: `v3/seg/${SEG}.seg` })
    expect(parsePath('seg/catalog')).toEqual({ route: 'catalog', lang: 'seg', key: 'v3/catalog/seg.seg' })
  })
  test('anything else is a bad path, so no other key is ever read', () => {
    for (const p of ['en', 'en/catalog/x', '../catalog', '%2e%2e/catalog', 'seg/ABC', `seg/${SEG.toUpperCase()}`, `seg/${SEG}x`, 'e/catalog', 'en_US/catalog', ''])
      expect(parsePath(p)).toBeNull()
  })
  test('ranges', () => {
    expect(parseRange('bytes=0-9')).toEqual({ offset: 0, length: 10 })
    expect(parseRange('bytes=100-')).toEqual({ offset: 100 })
    expect(parseRange('bytes=-5')).toEqual({ suffix: 5 })
    expect(parseRange('bytes=-0')).toBe('unsatisfiable')
    expect(parseRange('bytes=0-1,5-6')).toBeNull()
    expect(parseRange('items=0-1')).toBeNull()
  })
})

describe('serving', () => {
  test('a catalog: the stored bytes, revalidated on every use, with CORS for every origin', async () => {
    const r = await handle(req('/v3/packs/en/catalog', { headers: { Origin: 'https://bt-servant-mini.unfoldingword.workers.dev' } }), env())
    expect(r.status).toBe(200)
    expect(await body(r)).toEqual(files['v3/catalog/en.seg'])
    expect(r.headers.get('Cache-Control')).toBe('no-cache, no-transform')
    expect(r.headers.get('Content-Type')).toBe('application/octet-stream')
    expect(r.headers.get('Content-Length')).toBe('300')
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(r.headers.get('Access-Control-Expose-Headers')).toContain('Content-Length')
    expect(r.headers.get('ETag')).toMatch(/^"[0-9a-f]{32}"$/)
    expect(r.headers.get('Content-Encoding')).toBeNull()
  })
  test('If-None-Match answers 304 (one tag, a list, or *), with or without quotes', async () => {
    const first = await handle(req('/v3/packs/en/catalog'), env())
    const etag = first.headers.get('ETag')!
    for (const inm of [etag, etag.slice(1, -1), `W/${etag}`, `"x", ${etag}`, '*']) {
      const r = await handle(req('/v3/packs/en/catalog', { headers: { 'If-None-Match': inm } }), env())
      expect(r.status).toBe(304)
      expect(r.body).toBeNull()
      expect(r.headers.get('ETag')).toBe(etag)
    }
    const other = await handle(req('/v3/packs/en/catalog', { headers: { 'If-None-Match': '"nope"' } }), env())
    expect(other.status).toBe(200)
  })
  test('a code with a regional alias is looked up as itself first, then as its alias', async () => {
    const e = env()
    const es = await handle(req('/v3/packs/es/catalog'), e)
    expect(es.status).toBe(200)
    expect(await body(es)).toEqual(files['v3/catalog/es-419.seg'])
    const ar = await handle(req('/v3/packs/ar/catalog'), e)
    expect(await body(ar)).toEqual(files['v3/catalog/ar.seg']) // ar has its own pack: ar-x-strong is never read
    expect(e.PACKS.calls).not.toContain('get v3/catalog/ar-x-strong.seg')
  })
  test('a segment: immutable, with ranges', async () => {
    const r = await handle(req(`/v3/packs/seg/${SEG}`), env())
    expect(r.status).toBe(200)
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable, no-transform')
    expect(r.headers.get('Accept-Ranges')).toBe('bytes')
    expect(await body(r)).toEqual(files[`v3/seg/${SEG}.seg`])
  })
  test('a complement (the map background): immutable, with no extension in the key; a bad id is a bad path', async () => {
    const r = await handle(req(`/v3/packs/complement/${COMP}`), env())
    expect(r.status).toBe(200)
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable, no-transform')
    expect(await body(r)).toEqual(files[`v3/complement/${COMP}`])
    expect(parsePath(`complement/${COMP}`)).toEqual({ route: 'complement', id: COMP, key: `v3/complement/${COMP}` })
    for (const bad of ['complement/catalog', 'complement/' + COMP.toUpperCase(), 'complement/abc', 'complement']) expect(parsePath(bad)).toBeNull()
    expect((await handle(req(`/v3/packs/complement/${'d'.repeat(64)}`), env())).status).toBe(404)
    expect(await (await handle(req(`/v3/packs/complement/${'d'.repeat(64)}`), env())).json()).toEqual({ error: 'complement not found' })
  })
  test('the model: HEAD gives its size (wllama), Range resumes a cut download (Android)', async () => {
    const all = files[`v3/seg/${MODEL}.seg`]!
    const head = await handle(req(`/v3/packs/seg/${MODEL}`, { method: 'HEAD' }), env())
    expect(head.status).toBe(200)
    expect(head.headers.get('Content-Length')).toBe('5000')
    expect(head.body).toBeNull()
    const mid = await handle(req(`/v3/packs/seg/${MODEL}`, { headers: { Range: 'bytes=4000-' } }), env())
    expect(mid.status).toBe(206)
    expect(mid.headers.get('Content-Range')).toBe('bytes 4000-4999/5000')
    expect(mid.headers.get('Content-Length')).toBe('1000')
    expect(await body(mid)).toEqual(all.subarray(4000))
    const tail = await handle(req(`/v3/packs/seg/${MODEL}`, { headers: { Range: 'bytes=-10' } }), env())
    expect(tail.headers.get('Content-Range')).toBe('bytes 4990-4999/5000')
    expect(await body(tail)).toEqual(all.subarray(4990))
    const some = await handle(req(`/v3/packs/seg/${MODEL}`, { headers: { Range: 'bytes=10-19' } }), env())
    expect(await body(some)).toEqual(all.subarray(10, 20))
    const headRange = await handle(req(`/v3/packs/seg/${MODEL}`, { method: 'HEAD', headers: { Range: 'bytes=0-9' } }), env())
    expect(headRange.status).toBe(206)
    expect(headRange.headers.get('Content-Length')).toBe('10')
  })
  test('a range past the end is 416 with the size', async () => {
    for (const range of ['bytes=5000-', 'bytes=-0']) {
      const r = await handle(req(`/v3/packs/seg/${MODEL}`, { headers: { Range: range } }), env())
      expect(r.status).toBe(416)
      expect(r.headers.get('Content-Range')).toBe('bytes */5000')
    }
  })
  test('a catalog ignores Range: it is whole or nothing', async () => {
    const r = await handle(req('/v3/packs/en/catalog', { headers: { Range: 'bytes=0-9' } }), env())
    expect(r.status).toBe(200)
    expect((await body(r)).length).toBe(300)
  })
})

describe('errors, in the old server shape', () => {
  test('missing catalog and segment: 404 with the text the client reads', async () => {
    const c = await handle(req('/v3/packs/fr/catalog'), env())
    expect(c.status).toBe(404)
    expect(await c.json()).toEqual({ error: 'catalog not found' })
    expect(c.headers.get('Cache-Control')).toBe('no-store')
    expect(c.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const s = await handle(req(`/v3/packs/seg/${'b'.repeat(64)}`), env())
    expect(s.status).toBe(404)
    expect(await s.json()).toEqual({ error: 'segment not found' })
  })
  test('bad path 400, writes 405, preflight 204, other routes 404, HEAD without a body', async () => {
    expect((await handle(req('/v3/packs/bad'), env())).status).toBe(400)
    for (const method of ['PUT', 'POST', 'DELETE']) {
      const r = await handle(req('/v3/packs/en/catalog', { method, body: method === 'DELETE' ? null : 'x' }), env())
      expect(r.status).toBe(405)
      expect(r.headers.get('Allow')).toBe('GET, HEAD, OPTIONS')
    }
    const pre = await handle(req('/v3/packs/en/catalog', { method: 'OPTIONS' }), env())
    expect(pre.status).toBe(204)
    expect(pre.headers.get('Access-Control-Allow-Headers')).toBe('Range, If-None-Match')
    expect((await handle(req('/v2/packs/x'), env())).status).toBe(404)
    expect((await handle(req('/'), env())).status).toBe(200)
    const h = await handle(req('/v3/packs/fr/catalog', { method: 'HEAD' }), env())
    expect(h.status).toBe(404)
    expect(h.body).toBeNull()
  })
  test('no bucket: 503; a failing bucket: 500', async () => {
    expect((await handle(req('/v3/packs/en/catalog'), {})).status).toBe(503)
    const broken = { PACKS: { head: async () => { throw new Error('down') }, get: async () => { throw new Error('down') } } } as any
    const orig = console.error
    console.error = () => {}
    try {
      const r = await handle(req('/v3/packs/en/catalog'), broken)
      expect(r.status).toBe(500)
      expect(await r.json()).toEqual({ error: 'internal error' })
    } finally {
      console.error = orig
    }
  })
})
