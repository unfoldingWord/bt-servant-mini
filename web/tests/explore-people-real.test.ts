// X1's goal with the real packs of the APK build (apk-packs-r7: en, es-419), when they are on this machine: from the people tab, search
// "Abraham", open him, see the notice and the credit line, tap Isaac, then Jacob, and Back twice is Abraham again. Runs on the shared
// stand-in page (fake-page.ts); skips itself without the packs.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { $, $$, installPage, restorePage, sleep, store, until } from './fake-page'
import { peoplePacks, onKinReady, setKinReader, warmKin } from '../src/kin'
import { backExplore, closeExplore, kinReadyExplore, openExplore, resetExplore, setExploreHooks, type ExploreHooks } from '../src/explore'

const REAL = resolve(import.meta.dir, '../../../apk-packs-r7')
let ran: string[] = []
const hooks: ExploreHooks = {
  ui: () => 'en', packs: () => ['en', 'es-419'], packName: (l) => l, addLang: () => {},
  ask: () => true, mode: () => true, ask5: () => true, saved5: () => [], resume5: () => true, run: (l) => { ran.push(l); return true },
}
let off = () => {}
let realFetch = globalThis.fetch
const asked: string[] = []

describe.skipIf(!existsSync(REAL))('the people tab with the real packs', () => {
  beforeAll(async () => {
    installPage()
    const { installPacks, usePacksDir } = await import('./fs-packs')
    usePacksDir(REAL)
    await installPacks(['en', 'es-419'])
    // airplane mode: the packs are read from disk as the app reads them (openLang), and anything asked of http(s) is recorded and fails
    realFetch = globalThis.fetch
    globalThis.fetch = ((input: any, init?: any) => {
      const url = String(input?.url ?? input)
      if (/^https?:/i.test(url)) {
        asked.push(url)
        return Promise.reject(new TypeError('no network'))
      }
      return realFetch(input, init)
    }) as typeof fetch
    setKinReader()
    setExploreHooks(hooks)
    off = onKinReady(kinReadyExplore)
    closeExplore(false)
    resetExplore() // (other files used Browse before: start from its home)
    store.clear()
  })
  afterAll(async () => {
    globalThis.fetch = realFetch
    off()
    closeExplore(false)
    resetExplore()
    setKinReader()
    const { usePacksDir } = await import('./fs-packs')
    usePacksDir()
    restorePage()
  })

  const tap = async (name: string) => {
    const b = $$('.tv-name').find((x) => x.textContent.includes(name))
    if (!b) throw new Error(`no ${name} in the tree`)
    b.click()
    for (let t = 0; t < 8000 && !$('.tv-bar button[data-kind="tree"]'); t += 25) await sleep(25)
    $('.tv-bar button[data-kind="tree"]')!.click()
  }
  const at = async (id: string) => {
    for (let t = 0; t < 8000 && $('.ex-person')?.dataset.id !== id; t += 25) await sleep(25)
    expect($('.ex-person')!.dataset.id).toBe(id)
    await until('.ex-person .tv', 8000)
  }

  test('Abraham to Isaac to Jacob, and Back twice', async () => {
    store.set('btsm.usage', '1')
    warmKin(['en', 'es-419'])
    openExplore('bar')
    for (let t = 0; t < 30000 && peoplePacks(['en', 'es-419']).length < 2; t += 100) await sleep(100)
    expect(peoplePacks(['en', 'es-419'])).toEqual(['en', 'es-419'])
    await sleep(200)
    $$('.ex-tabs button').find((b) => b.textContent === 'People')!.click()
    await until('.ex-psearch', 8000)
    const box = $('.ex-psearch') as any
    box.value = 'abraham'
    box.oninput()
    const row = await until('.ex-prows .ex-row[data-id="per:abraham"]', 8000)
    row.click()
    await at('per:abraham')
    // the notice of the tree and the credit line of the data
    expect($('.tv-note')!.textContent.length).toBeGreaterThan(10)
    expect($('.credit')!.textContent).toMatch(/TIPNR/)
    await tap('Isaac')
    await at('per:isaac')
    await tap('Jacob')
    const jacob = $('.ex-person')!.dataset.id!
    expect(jacob).not.toBe('per:isaac')
    await at(jacob)
    expect(backExplore()).toBe(true)
    await at('per:isaac')
    expect(backExplore()).toBe(true)
    await at('per:abraham')
    expect(ran).toEqual([]) // everything stayed in Browse
    expect(asked).toEqual([]) // and nothing asked a server (airplane mode)
  })
})
