// The words of Browse's people tab in the six languages (explore.ts XT), the tab's name in each, right to left in Arabic, and Browse's
// people without the network (airplane mode: nothing the tab does asks for a server). Runs on the shared stand-in page (fake-page.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { installPacks } from './fs-packs'
import { kinFixture } from './fixtures/kin/family'
import { onKinReady, peoplePacks, setKinReader, warmKin } from '../src/kin'
import { backExplore, closeExplore, kinReadyExplore, openExplore, openPerson, resetExplore, setExploreHooks, XT, type ExploreHooks } from '../src/explore'
import { $, $$, installPage, restorePage, sleep, store, until } from './fake-page'

const KEYS = ['people', 'pSearch', 'pNone', 'pMore', 'pFail', 'pEmpty', 'pTreeFail'] as const
const LANGS = ['en', 'es', 'fr', 'id', 'hi', 'ar'] as const
const TAB: Record<string, string> = { en: 'People', es: 'Personas', fr: 'Personnes', id: 'Orang', hi: 'लोग', ar: 'أشخاص' }

let ui = 'en'
const hooks: ExploreHooks = {
  ui: () => ui, packs: () => ['en'], packName: (l) => l, addLang: () => {},
  ask: () => true, mode: () => true, ask5: () => true, saved5: () => [], resume5: () => true, run: () => true,
}
let off = () => {}
let realFetch = globalThis.fetch
const asked: string[] = []
beforeAll(async () => {
  installPage()
  setExploreHooks(hooks)
  off = onKinReady(kinReadyExplore)
  await installPacks(['en'])
  realFetch = globalThis.fetch // (the one that serves the packs on disk)
  // airplane mode: a request to anywhere but the packs already on the phone is recorded and fails
  globalThis.fetch = ((input: any, init?: any) => {
    const url = String(input?.url ?? input)
    if (/^(\.\/|\/|packs\/|file:)/.test(url)) return realFetch(input, init)
    asked.push(url)
    return Promise.reject(new TypeError('no network'))
  }) as typeof fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
  off()
  closeExplore(false)
  resetExplore()
  setKinReader()
  restorePage()
})
beforeEach(() => {
  closeExplore(false)
  resetExplore()
  store.clear()
  ui = 'en'
  asked.length = 0
  setKinReader(async () => kinFixture())
})
const ready = async () => {
  openExplore('bar')
  for (let t = 0; t < 8000 && peoplePacks(['en']).length < 1; t += 50) await sleep(50)
  await sleep(200)
}

describe('the words of the people tab', () => {
  test('every key is there, not empty, in each of the six languages', () => {
    for (const l of LANGS) for (const k of KEYS) {
      const v = XT(l)[k]
      expect(typeof v).toBe('string')
      expect(v.trim().length).toBeGreaterThan(0)
    }
  })
  test('fr, id, hi and ar are not the English ones; es is not either', () => {
    for (const l of LANGS.filter((x) => x !== 'en')) for (const k of KEYS) expect([l, k, XT(l)[k] === XT('en')[k]]).toEqual([l, k, false])
  })
  test('the tab is named as each language says it', async () => {
    for (const l of LANGS) {
      closeExplore(false)
      resetExplore()
      ui = l
      warmKin(['en'])
      await ready()
      expect($$('.ex-tabs button').map((b) => b.textContent)).toContain(TAB[l])
    }
  })
})

describe('right to left', () => {
  test('Arabic: the search box takes the direction of what is typed, the list and the tree run right to left', async () => {
    ui = 'ar'
    await ready()
    $$('.ex-tabs button').find((b) => b.textContent === TAB.ar)!.click()
    await until('.ex-prows .ex-row')
    expect(($('.ex-psearch') as any).dir).toBe('auto')
    expect(($('.ex-psearch') as any).getAttribute('aria-label')).toBe(XT('ar').pSearch)
    expect(($('.ex-prows') as any).dir).toBe('rtl')
    openPerson('en', 'per:isaac')
    await until('.ex-person .tv')
    expect(($('.tv') as any).dir).toBe('rtl')
  })
  test('English is left to right', async () => {
    await ready()
    $$('.ex-tabs button').find((b) => b.textContent === TAB.en)!.click()
    await until('.ex-prows .ex-row')
    expect(($('.ex-prows') as any).dir).toBe('ltr')
  })
})

describe('airplane mode', () => {
  test('opening the tab, searching, opening a tree and going back ask no server for anything', async () => {
    await ready()
    $$('.ex-tabs button').find((b) => b.textContent === TAB.en)!.click()
    await until('.ex-prows .ex-row')
    const box = $('.ex-psearch') as any
    box.value = 'isaac'
    box.oninput()
    const row = await until('.ex-prows .ex-row[data-id="per:isaac"]')
    row.click()
    await until('.ex-person .tv')
    expect(backExplore()).toBe(true)
    await until('.ex-psearch')
    expect(asked).toEqual([])
  })
  test('a pack without family data: no people tab (and still no request)', async () => {
    setKinReader(async () => ({ ...kinFixture(), people: async () => ({ data: null }) as any }))
    openExplore('bar')
    await until('.ex-tabs')
    warmKin(['en'])
    await sleep(2200)
    expect(peoplePacks(['en'])).toEqual([])
    expect($$('.ex-tabs button').map((b) => b.textContent)).not.toContain(TAB.en)
    expect(asked).toEqual([])
  })
})
