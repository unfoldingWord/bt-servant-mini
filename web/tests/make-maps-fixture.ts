// Writes web/tests/fixtures/maps/: the sample of tc-study's language-pack-client built with the maps (`buildSample({ geo: true })`:
// the common catalog with `geo`, `routes`, `born-in` and the `basemap` complement; es-419 with `places`), every book the sample has,
// installed as Mini installs a language and laid out as tests/fs-packs.ts serves packs (`<lang>/state.json`, `seg/xx/<id>`),
// with the sample's public key (key.json) for setTrustedKeys. Run again when bt-synergy.ref moves:
//   cd web && bun tests/make-maps-fixture.ts
//
// What it holds (ids, and the es-419 name where there is one; read it back with mapsFixture() in maps-fixture.ts):
//  books: only `tit` (the sample has no other), plus Open Bible Stories (obs 1, 2, 10, 50) and the tW articles of the sample.
//  places (geo; sure 0-3, form 1 city 2 region 3 water 5 other, lat/lon in 1/100 degree in the core):
//    lug:jerusalem "Jerusalén" sure 2 form 1 (31.78, 35.23; tW tw:names/jerusalem)
//    lug:bethlehem-gen-35-16 "Belén" sure 3 form 1 (31.71, 35.21; note "de Judá"; tW tw:names/bethlehem)
//    lug:bethlehem-jos-19-15 "Belén" sure 1 form 1 (32.74, 35.19; note "de Zabulón"): the homonym of the one above
//    lug:egypt "Egipto" sure 1 form 2 region (30.11, 31.34; tW tw:names/egypt)
//    lug:ur "Ur" sure 2 form 5 (30.96, 46.10)
//    every place has a point (sure >= 1); none is "sure 0". alias "Sión" -> lug:jerusalem.
//  people (topics): per:abraham "Abraham", per:sarah "Sarah", per:isaac "Isaac", per:terah "Terah", per:absalom "Absalom",
//    per:zechariah-2ki-14-29 and per:zechariah-luk-1-5 "Zechariah" (two homonyms). Names come out in English: the sample has no es-419 names for people.
//  born-in: per:abraham -> lug:ur (Theographic, confidence 80). died-in: none.
//  events: ev:abraham-enters-canaan, ev:abraham-goes-to-egypt, ev:creation-of-all-things, ev:exodus-from-egypt, ev:moses-flees-pharaoh,
//    ev:plagues-of-egypt, ev:sojourn-in-canaan-and-egypt (titles in English). lug:egypt's events: abraham-goes-to-egypt, exodus-from-egypt, sojourn-in-canaan-and-egypt.
//  routes: ev:exodus-from-egypt = [lug:egypt, lug:jerusalem] (E3).
//  NOT there: verses of any place or person (their book parts, gen, exo…, are not in the sample): placeQuery(...).verses is 0 and
//    placesOf / passagePlaces give nothing, with a notInstalled `xtopics` part. Tests of "where it appears" need a hand-made reader.
//  basemap complement: complements/<sha256 hex>.basemap, id 78039b68f1470b38d98103244826e33262facf5cd9cb69db43ca91f1246d94cf (77 bytes, 3 paths).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BTS_DIR } from './bts-dir'

const CLIENT = join(BTS_DIR, 'packages', 'language-pack-client')
const { buildSample } = await import(join(CLIENT, 'test', 'sample.ts'))
const { startFakeServer } = await import(join(CLIENT, 'test', 'fakeServer.ts'))
const { createClient, memoryStore, httpSource } = await import('@bt-synergy/language-pack-client')
const { installWant } = await import('../src/packs')

const OUT = join(import.meta.dir, 'fixtures', 'maps')
const LANG = 'es-419'
const sample = await buildSample({ geo: true })
const trust = { trustedKeys: { [sample.keys.keyId]: Uint8Array.from(sample.keys.publicKey.match(/../g)!, (p: string) => parseInt(p, 16)) } }
const server = startFakeServer(sample, {})
try {
  const store = memoryStore()
  const client = createClient({ store, source: httpSource({ base: server.url }), trust })
  // as a download from the menu (with Open Bible Stories): the map units (xtopics, topics), the books there are, the shared units
  // the first install brings the catalog; its status lists every book the sample has
  await client.install(LANG, installWant(['tit'], false))
  const books = (await client.status(LANG)).units.filter((u) => u.key.startsWith(`${LANG}/book:`)).map((u) => u.key.slice(`${LANG}/book:`.length))
  console.log('books:', books.join(' '))
  await client.install(LANG, installWant(books))
  rmSync(OUT, { recursive: true, force: true })
  const dir = join(OUT, LANG)
  for (const id of await store.ids()) {
    mkdirSync(join(dir, 'seg', id.slice(0, 2)), { recursive: true })
    writeFileSync(join(dir, 'seg', id.slice(0, 2), id), (await store.get(id))!)
  }
  writeFileSync(join(dir, 'state.json'), JSON.stringify(await store.getState()))
  writeFileSync(join(OUT, 'key.json'), JSON.stringify({ keyId: sample.keys.keyId, publicKey: sample.keys.publicKey }) + '\n')
  // the basemap complement, where Mini looks for it: complements/<sha256 hex>.basemap
  mkdirSync(join(OUT, 'complements'), { recursive: true })
  for (const [id, bytes] of sample.complements ?? []) writeFileSync(join(OUT, 'complements', `${id}.basemap`), bytes)
  console.log(`${(await store.ids()).length} segments in ${dir}`)
} finally {
  server.stop()
}
