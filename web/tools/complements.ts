// Puts the map background (the `basemap` complement) into the packs the APK ships:
//   bun tools/complements.ts <packs dir> <out packs dir> [--fetch <server base url>]
// For each language folder of <packs dir> (state.json + seg/), the common catalog it has installed lists the complement and its
// sha256; the file is looked for in <packs dir>/complements/<sha256>.basemap (and, with --fetch, downloaded from
// <server>/v3/packs/complement/<sha256> into it when missing), checked against the length and sha256 the catalog says, and copied to
// <out packs dir>/common/complements/<sha256>.basemap, where the app looks first (web/src/packs.ts `COMPLEMENTS_DIR`).
// A catalog that lists none (older packs) copies nothing. A listed complement that cannot be found is an error (exit 1): the build
// must not ship maps with no coastlines by accident.
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { basemapOf, catalogView, hex, KNOWN, readSegment } from '@bt-synergy/language-pack-v3'

const [packs, out, ...rest] = process.argv.slice(2)
const fetchFrom = rest[0] === '--fetch' ? rest[1]?.replace(/\/+$/, '') : undefined
if (!packs || !out) { console.error('usage: bun tools/complements.ts <packs dir> <out packs dir> [--fetch <server>]'); process.exit(2) }

const find = (dir: string, name: string): string | null => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) { const r = find(p, name); if (r) return r } else if (e.name === name) return p
  }
  return null
}
const wanted = new Map<string, { size: number; langs: string[] }>()
for (const d of readdirSync(packs, { withFileTypes: true })) {
  if (!d.isDirectory() || !existsSync(join(packs, d.name, 'state.json'))) continue
  const state = JSON.parse(readFileSync(join(packs, d.name, 'state.json'), 'utf8'))
  const id = state.published?.common?.id
  if (!id) continue
  const file = find(join(packs, d.name, 'seg'), id)
  if (!file) { console.error(`${d.name}: the common catalog ${id} is not in seg/`); process.exit(1) }
  const { seg } = await readSegment(new Uint8Array(readFileSync(file)), { known: KNOWN.catalog, expectedClass: 'catalog' })
  const b = basemapOf(catalogView(seg).complements)
  if (!b) continue
  const bid = hex(b.id)
  const w = wanted.get(bid) ?? { size: b.size, langs: [] }
  w.langs.push(d.name)
  wanted.set(bid, w)
}
let bad = 0
for (const [id, { size, langs }] of wanted) {
  const src = join(packs, 'complements', `${id}.basemap`)
  if (!existsSync(src) && fetchFrom) {
    const r = await fetch(`${fetchFrom}/v3/packs/complement/${id}`).catch(() => null)
    if (r?.ok) {
      // checked before it is kept: a truncated or wrong body must not stay on disk and block the next run
      const got = new Uint8Array(await r.arrayBuffer())
      if (got.length === size && createHash('sha256').update(got).digest('hex') === id) { mkdirSync(join(packs, 'complements'), { recursive: true }); writeFileSync(src, got) }
      else console.error(`${fetchFrom} answered the basemap ${id} with other bytes than the catalog lists: not kept`)
    }
  }
  if (!existsSync(src)) { console.error(`the basemap ${id} (listed by ${langs.join(', ')}) is not at ${src}${fetchFrom ? ` and ${fetchFrom} does not have it` : ' (pass --fetch <server>)'}`); bad++; continue }
  const bytes = readFileSync(src)
  if (statSync(src).size !== size || createHash('sha256').update(bytes).digest('hex') !== id) { console.error(`${src} is not the file the catalog lists (length or sha256)`); bad++; continue }
  const dest = join(out, 'common', 'complements', `${id}.basemap`)
  mkdirSync(join(out, 'common', 'complements'), { recursive: true })
  copyFileSync(src, dest)
  console.log(`basemap ${id.slice(0, 12)}… ${size} B -> common/complements (${langs.join(', ')})`)
}
if (bad) process.exit(1)
if (!wanted.size) console.log('no basemap listed by the packs: nothing copied')
