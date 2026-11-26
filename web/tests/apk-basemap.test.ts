// The APK carries the map background (web/build.py → packs/common/complements/<sha256>.basemap): on a phone with no internet, the first
// map finds it in the app's own folder. Runs with PACKS_DIR set to the packs of the build, against the folder the last build.py wrote.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { memoryStore } from '@lpc/store/memory'
import { PACKS_DIR, installPacks } from './fs-packs'
import { basemapBytes, setBasemapStore, setPacksServers } from '../src/packs'

const SHIPPED = resolve(import.meta.dir, '../../app/src/full/assets/www/packs/common/complements')
const files = existsSync(SHIPPED) ? readdirSync(SHIPPED).filter((f) => f.endsWith('.basemap')) : []
const packsFetch = globalThis.fetch
const asked: string[] = []

describe.skipIf(files.length === 0 || !process.env.PACKS_DIR)('the APK ships the map background (the folder the last build.py wrote)', () => {
  beforeAll(async () => {
    // the airplane: only the app's own folder answers; any other address fails as it does with no network
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      asked.push(url)
      const m = /^\.\/packs\/common\/complements\/([0-9a-f]{64})\.basemap$/.exec(url)
      if (m) return new Response(readFileSync(`${SHIPPED}/${m[1]}.basemap`))
      return packsFetch(input as RequestInfo)
    }) as typeof fetch
    setPacksServers([])
    setBasemapStore(async () => memoryStore())
    await installPacks(['en'])
  })
  afterAll(() => { globalThis.fetch = packsFetch; setBasemapStore(); setPacksServers() })

  test('the first map of an installed language gets the file from the app folder, checked against the catalog, with no server asked', async () => {
    expect(PACKS_DIR).toBeTruthy()
    const b = await basemapBytes('en')
    expect(b).not.toBeNull()
    expect(files.map((f) => f.replace('.basemap', ''))).toContain(createHash('sha256').update(b!).digest('hex'))
    expect(asked.filter((u) => /^https?:/.test(u))).toEqual([])
  })
})
