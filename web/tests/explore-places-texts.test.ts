// The words of Browse's places tab in the six languages (explore.ts XT): every key is there and is not the English one, hi and ar carry the
// "pending native review" mark on each of their lines, and the places tab and its card run without the network (airplane mode: nothing they do
// asks for a server). Runs on the shared stand-in page (fake-page.ts) with a hand-made place reader (places-world.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { installPacks } from './fs-packs'
import { mapsFixture } from './maps-fixture'
import { JER, place, v, world, type World } from './places-world'
import { setKinReader } from '../src/kin'
import { resetPlaces, setPlaceReader, type PlaceReader } from '../src/places'
import { backExplore, closeExplore, openExplore, resetExplore, setExploreHooks, setExploreMapMount, XT, type ExploreHooks } from '../src/explore'
import type { MapOpts } from '../src/mapview'
import { $, $$, doc, FakeEl, installPage, restorePage, sleep, store, until } from './fake-page'

const KEYS = ['places', 'peoplePlaces', 'lSearch', 'lNone', 'lMore', 'lAll', 'lBook', 'lFail', 'lMap', 'lCardFail', 'lSure', 'lCount'] as const
const LANGS = ['en', 'es', 'fr', 'id', 'hi', 'ar'] as const
const TAB: Record<string, string> = { en: 'Places', es: 'Lugares', fr: 'Lieux', id: 'Tempat', hi: 'स्थान', ar: 'أماكن' }

const WORLD: World = {
  topics: [['lug:jerusalem', place('Jerusalem')], ['lug:bethel', place('Bethel')]],
  geo: { 'lug:jerusalem': JER, 'lug:bethel': { lat: 3194, lon: 3522, sure: 3, form: 1 } },
  verses: { 'lug:jerusalem': [v(1, 14, 18), v(40, 2, 1)], 'lug:bethel': [v(1, 12, 8)] },
}
let ui = 'en'
const hooks: ExploreHooks = {
  ui: () => ui, packs: () => ['en'], packName: (l) => l, addLang: () => {},
  ask: () => true, mode: () => true, ask5: () => true, saved5: () => [], resume5: () => true, run: () => true,
}
let base: PlaceReader
const asked: string[] = []
let realFetch = globalThis.fetch
let mounts: MapOpts[] = []
beforeAll(async () => {
  installPage()
  doc.body.appendChild(Object.assign(new FakeEl('main'), { id: 'log' }))
  setExploreHooks(hooks)
  setExploreMapMount(async (_e, o) => { mounts.push(o); return { redraw() {}, destroy() {} } })
  await installPacks(['en'])
  base = await mapsFixture().open()
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
  closeExplore(false)
  resetExplore()
  setExploreMapMount()
  setKinReader()
  setPlaceReader()
  resetPlaces()
  restorePage()
})
beforeEach(() => {
  closeExplore(false)
  resetExplore()
  store.clear()
  ui = 'en'
  asked.length = 0
  mounts = []
  setKinReader(async () => ({ people: async () => ({ data: null }) }) as any) // no people: "Places" alone
  resetPlaces()
  setPlaceReader(async () => world(base, WORLD))
})

describe('the words of the places tab', () => {
  test('every key is there, not empty, in each of the six languages', () => {
    for (const l of LANGS) for (const k of KEYS) {
      const s = XT(l)[k]
      expect(typeof s).toBe('string')
      expect(s.trim().length).toBeGreaterThan(0)
    }
  })
  test('es, fr, id, hi and ar are not the English ones (the tab\'s own name and the sentences)', () => {
    for (const l of LANGS.filter((x) => x !== 'en')) for (const k of KEYS.filter((x) => x !== 'lMore')) expect([l, k, XT(l)[k] === XT('en')[k]]).toEqual([l, k, false])
  })
  test('the map\'s text says how many places in each language', () => {
    for (const l of LANGS) expect(XT(l).lMap).toContain('{n}')
  })
  test('hi and ar carry "pending native review" on every line that has the new words; the others do not', () => {
    const src = readFileSync(join(import.meta.dir, '..', 'src', 'explore.ts'), 'utf8').split(/\r?\n/)
    const start = (l: string) => src.findIndex((x) => x.startsWith(`  ${l}: {`))
    const order = [...LANGS].map((l) => ({ l, at: start(l) })).sort((a, b) => a.at - b.at)
    for (const [i, { l, at }] of order.entries()) {
      expect(at).toBeGreaterThan(0)
      const end = order[i + 1]?.at ?? src.findIndex((x, n) => n > at && x === '}')
      const lines = src.slice(at, end).filter((x) => KEYS.some((k) => new RegExp(`(^|\\s)${k}:`).test(x)))
      expect(lines.length).toBeGreaterThanOrEqual(3)
      for (const line of lines) expect([l, line.includes('pending native review')]).toEqual([l, l === 'hi' || l === 'ar'])
    }
  })
  test('the tab is named as each language says it', async () => {
    for (const l of LANGS) {
      closeExplore(false)
      resetExplore()
      ui = l
      openExplore('bar')
      for (let t = 0; t < 8000 && !$$('.ex-tabs button').some((b) => b.textContent === TAB[l]); t += 50) await sleep(50)
      expect($$('.ex-tabs button').map((b) => b.textContent)).toContain(TAB[l])
    }
  })
})

describe('right to left, and no network', () => {
  test('Arabic: the tab, its box and its list, and the card, run right to left', async () => {
    ui = 'ar'
    openExplore('bar')
    for (let t = 0; t < 8000 && !$$('.ex-tabs button').some((b) => b.textContent === TAB.ar); t += 50) await sleep(50)
    $$('.ex-tabs button').find((b) => b.textContent === TAB.ar)!.click()
    await until('.ex-lrows .ex-row')
    expect(($('.ex-places') as any).dir).toBe('rtl')
    expect(($('.ex-lsearch') as any).getAttribute('aria-label')).toBe(XT('ar').lSearch)
    expect(($('.ex-lsearch') as any).dir).toBe('auto')
    expect(($('.ex-lbook') as any).getAttribute('aria-label')).toBe(XT('ar').lBook)
    expect($$('.ex-lbook option')[0]!.textContent).toBe(XT('ar').lAll)
    expect(($('.ex-lrows') as any).dir).toBe('rtl')
    for (let t = 0; t < 2000 && !mounts.length; t += 25) await sleep(25)
    expect(mounts[0]!.dir).toBe('rtl')
    expect(mounts[0]!.summary).toBe(XT('ar').lMap.replace('{n}', '2'))
  })
  test('English is left to right', async () => {
    openExplore('bar')
    for (let t = 0; t < 8000 && !$$('.ex-tabs button').some((b) => b.textContent === TAB.en); t += 50) await sleep(50)
    $$('.ex-tabs button').find((b) => b.textContent === TAB.en)!.click()
    await until('.ex-lrows .ex-row')
    expect(($('.ex-lrows') as any).dir).toBe('ltr')
  })
  test('airplane mode: opening the tab, searching, filtering by book, opening a card and going back ask no server for anything', async () => {
    openExplore('bar')
    for (let t = 0; t < 8000 && !$$('.ex-tabs button').some((b) => b.textContent === TAB.en); t += 50) await sleep(50)
    $$('.ex-tabs button').find((b) => b.textContent === TAB.en)!.click()
    await until('.ex-lrows .ex-row')
    const box = $('.ex-lsearch') as any
    box.value = 'beth'
    box.oninput()
    const row = await until('.ex-lrows .ex-row[data-id="lug:bethel"]')
    const sel = $('.ex-lbook') as any
    sel.value = 'gen'
    sel.onchange()
    await sleep(200)
    row.click()
    await until('.ex-place-card')
    expect(backExplore()).toBe(true)
    await until('.ex-lsearch')
    expect(asked).toEqual([])
  })
})
