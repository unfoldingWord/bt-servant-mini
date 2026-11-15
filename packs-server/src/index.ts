/**
 * BT Servant Mini's packs server: a read-only copy of the `/v3/packs/...` routes of translation-helps v2 (format 3 language
 * packs, `src/api/routes/packsV3.ts` there), serving the R2 bucket `bt-servant-mini-packs`, which `sync.mjs` fills byte for
 * byte from the server the app used before. The requests the app makes (web/src/packs.ts, model.ts, webmodel.ts, the Android
 * and iOS model downloads):
 *
 *   GET|HEAD /v3/packs/{lang}/catalog   → v3/catalog/{lang}.seg   (no-cache: revalidated with If-None-Match → 304)
 *   GET|HEAD /v3/packs/common/catalog   → v3/catalog/common.seg
 *   GET|HEAD /v3/packs/seg/{sha256}     → v3/seg/{sha256}.seg     (immutable; Range for the 291 MB model)
 *   OPTIONS  (CORS preflight)
 *
 * A language code with a regional alias is looked up as itself first, then as its alias (es → es-419), as the old server
 * does. Errors are JSON in the same shape as the old server's: the client reads `catalog not found` as "no pack yet".
 */

export interface Env {
  PACKS?: R2Bucket
}

export const CORS: Record<string, string> = {
  // Every origin gets the same answer (the web app, the Android and iOS WebViews, file: pages): nothing here is private,
  // and an answer that varied by Origin could be cached for the wrong one.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, If-None-Match',
  'Access-Control-Expose-Headers': 'ETag, Content-Range, Content-Length, Accept-Ranges, Retry-After',
  'Access-Control-Max-Age': '86400',
}
const NO_STORE = 'no-store'
const CATALOG_CACHE_CONTROL = 'no-cache, no-transform'
const SEGMENT_CACHE_CONTROL = 'public, max-age=31536000, immutable, no-transform'
const CONTENT_TYPE = 'application/octet-stream'
/** A segment id: sha256 in lowercase hex. Uppercase is a bad path, not an alias. */
const SEGMENT_ID_RE = /^[0-9a-f]{64}$/
const LANGUAGE_RE = /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/
/** Regional variants (translation-helps `VARIANTS`): asked for when the code itself has no catalog. */
const VARIANTS: Record<string, string> = { es: 'es-419', pt: 'pt-br', zh: 'zh-hans', ar: 'ar-x-strong' }
const PREFIX = '/v3/packs/'

export type Target =
  | { route: 'catalog'; lang: string; key: string; alias?: string }
  | { route: 'seg'; id: string; key: string }

/** `path` is what follows `/v3/packs/`, still percent-encoded: a `%` never matches, so `..` and `%2F` never reach a key. */
export function parsePath(path: string): Target | null {
  const parts = path.split('/')
  if (parts.length !== 2) return null
  const [first = '', second = ''] = parts
  // `seg` is also a language (Segeju): the second element decides.
  if (first === 'seg' && second !== 'catalog') {
    return SEGMENT_ID_RE.test(second) ? { route: 'seg', id: second, key: `v3/seg/${second}.seg` } : null
  }
  if (second !== 'catalog') return null
  const lang = first.toLowerCase()
  if (lang === 'common') return { route: 'catalog', lang, key: 'v3/catalog/common.seg' }
  if (!LANGUAGE_RE.test(lang)) return null
  const variant = VARIANTS[lang]
  return { route: 'catalog', lang, key: `v3/catalog/${lang}.seg`, ...(variant ? { alias: `v3/catalog/${variant}.seg` } : {}) }
}

// ------------------------------------------------------------------------------------------------------------ headers

/** Etags without quotes or W/, so a client that drops the quotes still gets its 304. */
export function parseIfNoneMatch(header: string | null): string[] {
  if (!header) return []
  return header
    .split(',')
    .map((t) => t.trim().replace(/^W\//, '').replace(/^"(.*)"$/, '$1'))
    .filter((t) => t !== '')
}
const matches = (tags: string[], etag: string) => tags.some((t) => t === '*' || t === etag)

type Range = { offset: number; length?: number } | { suffix: number }
/** One `bytes=` range; anything else (several ranges, other units, garbage) is ignored, as RFC 9110 allows. */
export function parseRange(header: string | null): Range | 'unsatisfiable' | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  const [, first = '', last = ''] = m
  if (first === '' && last === '') return null
  if (first === '') {
    const suffix = Number(last)
    return suffix === 0 ? 'unsatisfiable' : { suffix }
  }
  const offset = Number(first)
  if (last === '') return { offset }
  const end = Number(last)
  if (end < offset) return null
  return { offset, length: end - offset + 1 }
}
/** The bytes a satisfiable range covers in an object of `size` bytes, end inclusive. */
export function rangeBounds(range: Range, size: number): [number, number] {
  if ('suffix' in range) return [Math.max(0, size - range.suffix), size - 1]
  const start = range.offset
  const end = range.length === undefined ? size - 1 : Math.min(size, start + range.length) - 1
  return [start, end]
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': NO_STORE, ...extra },
  })
}
const cacheControl = (t: Target) => (t.route === 'catalog' ? CATALOG_CACHE_CONTROL : SEGMENT_CACHE_CONTROL)
const hasBody = (o: R2Object | R2ObjectBody): o is R2ObjectBody => 'body' in o && (o as R2ObjectBody).body !== undefined

// ------------------------------------------------------------------------------------------------------------ serving

/** One object, or null when the key is missing. */
async function serve(request: Request, bucket: R2Bucket, target: Target, key: string): Promise<Response | null> {
  const tags = parseIfNoneMatch(request.headers.get('If-None-Match'))
  const isHead = request.method === 'HEAD'
  const segment = target.route === 'seg'
  // A catalog is whole or nothing: its Range is ignored. HEAD reads Range like the GET it stands for.
  const range = segment ? parseRange(request.headers.get('Range')) : null
  const notModified = (etag: string) =>
    new Response(null, { status: 304, headers: { ...CORS, ETag: etag, 'Cache-Control': cacheControl(target) } })
  const unsatisfiable = (size: number) => json(416, { error: 'range not satisfiable' }, { 'Content-Range': `bytes */${size}` })

  if (range === 'unsatisfiable') {
    const head = await bucket.head(key)
    if (!head) return null
    return matches(tags, head.etag) ? notModified(head.httpEtag) : unsatisfiable(head.size)
  }
  // R2 checks a single etag itself and then sends no body; a list or `*` is compared after the read.
  const single = tags.length === 1 && tags[0] !== '*' ? tags[0] : undefined
  let object: R2Object | R2ObjectBody | null
  if (isHead) {
    object = await bucket.head(key)
  } else {
    try {
      object = await bucket.get(key, {
        ...(single !== undefined ? { onlyIf: { etagDoesNotMatch: single } } : {}),
        ...(range ? { range } : {}),
      })
    } catch (err) {
      // R2 rejects a range that starts past the end instead of answering it.
      if (!range) throw err
      const head = await bucket.head(key)
      if (!head) return null
      if (rangeBounds(range, head.size)[0] < head.size) throw err
      return matches(tags, head.etag) ? notModified(head.httpEtag) : unsatisfiable(head.size)
    }
  }
  if (!object) return null
  if (matches(tags, object.etag)) {
    if (hasBody(object)) await object.body.cancel()
    return notModified(object.httpEtag)
  }
  if (range && rangeBounds(range, object.size)[0] >= object.size) {
    if (hasBody(object)) await object.body.cancel()
    return unsatisfiable(object.size)
  }

  const headers = new Headers(CORS)
  // The route, not the upload, decides the type and the caching; the bytes on the wire are the stored bytes (the client
  // hashes what it receives, and a catalog's size is the file's length): no Content-Encoding.
  headers.set('Content-Type', CONTENT_TYPE)
  headers.set('Cache-Control', cacheControl(target))
  headers.set('ETag', object.httpEtag)
  if (segment) headers.set('Accept-Ranges', 'bytes')
  let status = 200
  if (range) {
    const [start, end] = rangeBounds(range, object.size)
    status = 206
    headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`)
    headers.set('Content-Length', String(end - start + 1))
  } else {
    headers.set('Content-Length', String(object.size))
  }
  return new Response(!isHead && hasBody(object) ? object.body : null, { status, headers })
}

/** Check order: OPTIONS, other routes (404), method (405), bad path (400), no bucket (503), then the object (404 when missing). */
async function respond(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (!url.pathname.startsWith(PREFIX)) {
    if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
      return json(200, { service: 'bt-servant-mini-packs', routes: ['/v3/packs/{lang}/catalog', '/v3/packs/common/catalog', '/v3/packs/seg/{sha256}'] })
    }
    return json(404, { error: 'not found' })
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { error: 'method not allowed' }, { Allow: 'GET, HEAD, OPTIONS' })
  }
  const target = parsePath(url.pathname.slice(PREFIX.length))
  if (!target) return json(400, { error: 'bad pack path' })
  const bucket = env.PACKS
  if (!bucket) return json(503, { error: 'packs are not configured' })
  const served =
    (await serve(request, bucket, target, target.key)) ??
    (target.route === 'catalog' && target.alias ? await serve(request, bucket, target, target.alias) : null)
  if (served) return served
  return json(404, { error: target.route === 'catalog' ? 'catalog not found' : 'segment not found' })
}

export async function handle(request: Request, env: Env): Promise<Response> {
  // HEAD gives the headers of the GET it stands for with no body, errors included.
  const bodiless = (res: Response) => (request.method === 'HEAD' && res.body ? new Response(null, { status: res.status, headers: res.headers }) : res)
  try {
    return bodiless(await respond(request, env))
  } catch (err) {
    console.error(`[packs] ${request.method} ${new URL(request.url).pathname} failed:`, err)
    return bodiless(json(500, { error: 'internal error' }))
  }
}

export default { fetch: (request: Request, env: Env) => handle(request, env) } satisfies ExportedHandler<Env>
