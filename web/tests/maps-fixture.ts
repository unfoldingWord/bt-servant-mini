// Reader over web/tests/fixtures/maps/ (made by make-maps-fixture.ts): the signed geo sample of tc-study's language-pack-client,
// es-419 installed as Mini installs it, plus the `basemap` complement where Mini looks for it. Not a test file.
//   const f = mapsFixture()
//   const r = await f.open()                 // a PackReader of es-419 (the client over the files, no network)
//   usePacksDir(f.dir); setTrustedKeys(f.trustedKeys)   // or serve it to the app's own reader, as kin.test.ts does
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, memoryStore } from '@bt-synergy/language-pack-client'

export type MapsFixture = ReturnType<typeof mapsFixture>
export function mapsFixture() {
  const dir = join(import.meta.dir, 'fixtures', 'maps')
  const lang = 'es-419'
  const key = JSON.parse(readFileSync(join(dir, 'key.json'), 'utf8')) as { keyId: string; publicKey: string }
  const publicKey = Uint8Array.from(key.publicKey.match(/../g)!, (p) => parseInt(p, 16))
  const trustedKeys = { [key.keyId]: publicKey }
  const compDir = join(dir, 'complements')
  const file = readdirSync(compDir).find((f) => f.endsWith('.basemap'))!
  /** the basemap complement: its catalog id (sha256 hex) and bytes, and the path Mini looks for, relative to the packs folder */
  const basemap = {
    id: file.slice(0, -'.basemap'.length),
    bytes: new Uint8Array(readFileSync(join(compDir, file))),
    path: `complements/${file}`,
  }
  const segDir = join(dir, lang, 'seg')
  async function open() {
    const store = memoryStore()
    for (const sub of readdirSync(segDir)) for (const id of readdirSync(join(segDir, sub))) await store.put(id, new Uint8Array(readFileSync(join(segDir, sub, id))))
    await store.setState(JSON.parse(readFileSync(join(dir, lang, 'state.json'), 'utf8')))
    return createClient({ store, trust: { trustedKeys } }).open(lang)
  }
  return { dir, lang, key, trustedKeys, basemap, open, hasBasemap: existsSync(join(dir, basemap.path)) }
}
