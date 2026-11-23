// Writes web/tests/fixtures/kin/: the sample of tc-study's language-pack-client (`buildSample({ acai: true })`, es-419 with Titus,
// the common catalog built with the ACAI fixture: Abraham, Sara, Isaac, Rebeca, Ismael, Agar, Cetura's sons, Esaú, Israel…),
// installed as Mini installs a language and laid out as tests/fs-packs.ts serves packs (`<lang>/state.json`, `seg/xx/<id>`),
// with the sample's public key (key.json) for setTrustedKeys. Run again when bt-synergy.ref moves:
//   cd web && bun tests/make-kin-fixture.ts
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BTS_DIR } from './bts-dir'

const CLIENT = join(BTS_DIR, 'packages', 'language-pack-client')
const { buildSample } = await import(join(CLIENT, 'test', 'sample.ts'))
const { startFakeServer } = await import(join(CLIENT, 'test', 'fakeServer.ts'))
const { createClient, memoryStore, httpSource } = await import('@bt-synergy/language-pack-client')
const { installWant } = await import('../src/packs')

const OUT = join(import.meta.dir, 'fixtures', 'kin')
const LANG = 'es-419'
const sample = await buildSample({ acai: true })
const trust = { trustedKeys: { [sample.keys.keyId]: Uint8Array.from(sample.keys.publicKey.match(/../g)!, (p: string) => parseInt(p, 16)) } }
const server = startFakeServer(sample, {})
try {
  const store = memoryStore()
  const client = createClient({ store, source: httpSource({ base: server.url }), trust })
  // as a download from the menu: the map units (xtopics, topics), the books there are, the shared units
  await client.install(LANG, installWant(['tit'], false))
  rmSync(join(OUT, LANG), { recursive: true, force: true }) // not OUT: family.ts lives beside
  const dir = join(OUT, LANG)
  for (const id of await store.ids()) {
    mkdirSync(join(dir, 'seg', id.slice(0, 2)), { recursive: true })
    writeFileSync(join(dir, 'seg', id.slice(0, 2), id), (await store.get(id))!)
  }
  writeFileSync(join(dir, 'state.json'), JSON.stringify(await store.getState()))
  writeFileSync(join(OUT, 'key.json'), JSON.stringify({ keyId: sample.keys.keyId, publicKey: sample.keys.publicKey }) + '\n')
  console.log(`${(await store.ids()).length} segments in ${dir}`)
} finally {
  server.stop()
}
