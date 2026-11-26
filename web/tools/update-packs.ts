// Brings the packs the APK ships up to the revisions a packs server has, keeping the units each language already has:
//   bun tools/update-packs.ts <packs dir (old, read)> <out dir (new)> <server> [lang ...]
// Each language folder (state.json + seg/) is copied to <out>/<lang>, then the language is refreshed and its installed units are
// installed again from the server with the client of bt-synergy.ref (the segments the new revision names and the folder lacks are
// downloaded; the catalogs are checked against the trusted keys). Then `bun tools/complements.ts <out> <out>` adds the map background.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, httpSource } from '@bt-synergy/language-pack-client'
import { fsStore } from '@lpc/node/fsStore'
import { trustedKeys } from '../src/shared'

const [from, to, server, ...only] = process.argv.slice(2)
if (!from || !to || !server) { console.error('usage: bun tools/update-packs.ts <old packs dir> <new packs dir> <server> [lang ...]'); process.exit(2) }
const langs = (only.length ? only : readdirSync(from).filter((d) => existsSync(join(from, d, 'state.json'))))
for (const lang of langs) {
  const dir = join(to, lang)
  mkdirSync(dir, { recursive: true })
  cpSync(join(from, lang), dir, { recursive: true })
  const state = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'))
  const units = Object.keys(state.units).map((k) => k.replace(/^[^/]+\//, ''))
  const client = createClient({ store: fsStore(dir), source: httpSource({ base: server }), trust: { trustedKeys: trustedKeys() } })
  const r = await client.refresh(lang)
  const rep: any = await client.install(lang, { units: [...new Set(units)], defaults: false })
  await client.prune()
  console.log(lang, 'revision', JSON.stringify((r as any).revision ?? r).slice(0, 80), 'fetched', rep.fetched?.length ?? 0, 'waiting', rep.waiting?.length ?? 0, 'problems', rep.problems?.length ?? 0)
}
