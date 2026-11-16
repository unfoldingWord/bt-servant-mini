// End to end against a local packs server (not part of `bun test`; needs packs-server's `wrangler dev` and `sync.mjs --local`):
//   cd packs-server && bun sync.mjs --local && npx wrangler dev --local     (http://127.0.0.1:8787)
//   cd web && bun tests/packs-server-local.ts [http://127.0.0.1:8787] [lang]
// The app's own code (packs.ts, model.ts) with a server list whose first server is down: the offers, a whole language
// downloaded into IndexedDB (fake-indexeddb, as in the client's tests) and read back, and the model found with HEAD and read
// with a Range, all from the local server through the fallback.
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

await import(resolve(import.meta.dir, '../../../bts-client/packages/language-pack-client/node_modules/fake-indexeddb/auto/index.mjs'))
const LOCAL = process.argv[2] ?? 'http://127.0.0.1:8787'
const LANG = process.argv[3] ?? 'id'
const DEAD = 'http://127.0.0.1:9' // nothing listens there: the first server "is down"

const packs = await import('../src/packs')
packs.setPacksServers([DEAD, LOCAL])
const seen = new Map<string, number>()
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const origin = new URL(String(input instanceof Request ? input.url : input)).origin
  seen.set(origin, (seen.get(origin) ?? 0) + 1)
  if (String(input).startsWith('./packs/')) return new Response(JSON.stringify({ langs: [] })) // a light build: nothing shipped
  return realFetch(input, init)
}) as typeof fetch

const t0 = Date.now()
const offers = await packs.offers()
console.log('offers:', offers.map((o) => `${o.lang} ${(o.bytes / 1048576).toFixed(1)} MB`).join(', '))
const offer = offers.find((o) => o.lang === LANG)
if (!offer) throw new Error(`no offer for ${LANG}`)
let last = 0
const got = await packs.downloadLang(LANG, (p) => (last = p.bytes), { offer })
console.log(`downloaded ${LANG}: ${got.books} books, ${(last / 1048576).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
console.log('installed:', await packs.installedLangs())
const reader = await packs.openLang(LANG)
const ref = `${offer.books[0]!.toUpperCase()} 1:1`
const verse = await reader.passage(ref)
console.log(`${ref}:`, JSON.stringify(verse.data).slice(0, 160))
const tw = await reader.article('tw:kt/god')
console.log('tW kt/god (common catalog):', JSON.stringify(tw.data).slice(0, 120))

// model.ts loads the browser's model runner, which is not needed (nor installed) here
Bun.plugin({ setup: (b) => void b.module('@wllama/wllama', () => ({ exports: { Wllama: class {}, LoggerWithoutDebug: {} }, loader: 'object' })) })
;(globalThis as any).window = {}
const { MODEL, modelServer } = await import('../src/model')
const server = await modelServer([DEAD, LOCAL])
console.log('model server:', server)
const head = await fetch(server + MODEL.path, { method: 'HEAD' })
console.log('model HEAD:', head.status, head.headers.get('Content-Length'), head.headers.get('Accept-Ranges'))
const tail = await fetch(server + MODEL.path, { headers: { Range: `bytes=${MODEL.bytes - 16}-` } })
console.log('model Range:', tail.status, tail.headers.get('Content-Range'))
const whole = await fetch(server + MODEL.path)
const sha = createHash('sha256').update(new Uint8Array(await whole.arrayBuffer())).digest('hex')
console.log('model sha256 matches:', sha === MODEL.sha256)
console.log('requests per server:', Object.fromEntries(seen))
