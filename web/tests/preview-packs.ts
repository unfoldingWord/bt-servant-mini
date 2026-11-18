// Packs from the staging preview server (PREVIEW_SERVER), laid out as tests/fs-packs.ts and build.py's PACKS_DIR serve them
// (`<lang>/state.json`, `seg/xx/<id>`): the packs published there that Mini's own server may not have yet (common rev 6 with ACAI,
// handoff/relevo-parentescos.md). GET only. For the slow family test (kin-preview.test.ts) and a web build to look at:
//   cd web && bun tests/preview-packs.ts <dir> [langs, default es-419,en,ar,hi,id]
//   python -I -X utf8 web/build.py --dev --no-tests   with PACKS_DIR=<dir>
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, httpSource, memoryStore } from '@bt-synergy/language-pack-client'
import { installWant } from '../src/packs'
import { PREVIEW_SERVER, trustedKeys } from '../src/shared'

/** Books enough for the family answers tried here (Genesis 25:26, Matthew 1:16, Judas). */
export const PREVIEW_BOOKS = ['gen', 'mat', 'luk']

/** Writes each language from the preview into `dir` (replacing what was there); returns the segments written per language. */
export async function previewPacks(dir: string, langs: string[], books: string[] = PREVIEW_BOOKS): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const lang of langs) {
    const store = memoryStore()
    const client = createClient({ store, source: httpSource({ base: PREVIEW_SERVER }), trust: { trustedKeys: trustedKeys() } })
    await client.install(lang, installWant(books, false))
    const to = join(dir, lang)
    rmSync(to, { recursive: true, force: true })
    for (const id of await store.ids()) {
      mkdirSync(join(to, 'seg', id.slice(0, 2)), { recursive: true })
      writeFileSync(join(to, 'seg', id.slice(0, 2), id), (await store.get(id))!)
    }
    writeFileSync(join(to, 'state.json'), JSON.stringify(await store.getState()))
    out[lang] = (await store.ids()).length
  }
  writeFileSync(join(dir, 'index.json'), JSON.stringify({ langs }))
  return out
}

if (import.meta.main) {
  const [dir, list] = process.argv.slice(2)
  if (!dir) throw new Error('usage: bun tests/preview-packs.ts <dir> [langs]')
  console.log(await previewPacks(dir, (list ?? 'es-419,en,ar,hi,id').split(',')))
}
