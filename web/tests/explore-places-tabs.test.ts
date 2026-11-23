// Browse's places tab (explore.ts, explorelugares.ts; X2 steps 3 and 4 of plan-explorar-personas-lugares.md): "People and places" with its two
// subtabs when a pack has both, "Places" or "People" alone when it has one, no tab when it has neither; the chosen subtab that goes falls
// back to the first; the places tab (search, book, the points the map gets, the list under it); a tap on a point or a row opens the card and
// Back finds the search as it was; a card of a pack that went leaves the stack. Runs on the shared stand-in page (fake-page.ts) with a
// hand-made place reader (places-world.ts) over the signed geo sample, and a map drawing written here that only records what it is given.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { installPacks } from './fs-packs'
import { kinFixture } from './fixtures/kin/family'
import { mapsFixture } from './maps-fixture'
import { event, JER, place, v, world, type World } from './places-world'
import { onKinReady, peoplePacks, setKinReader, warmKin, type KinReader } from '../src/kin'
import { placePacks, resetPlaces, setPlaceReader, type PlaceReader } from '../src/places'
import { backExplore, closeExplore, exploreOpen, kinReadyExplore, openExplore, openPlace, redrawExplore, resetExplore, setExploreHooks, setExploreMapMount, type ExploreHooks } from '../src/explore'
import { renderLugaresTab, resetLugaresTab, stopLugaresTab, type PlacesCtx } from '../src/explorelugares'
import type { MapOpts } from '../src/mapview'
import { $, $$, doc, FakeEl, installPage, restorePage, sleep, store, until } from './fake-page'

// ---------------------------------------------------------------------------------------------------------------------- the data
const fillers = Array.from({ length: 40 }, (_, i) => `lug:f${String(i).padStart(2, '0')}`)
/** English: Jerusalem (3 verses), Bethel (2, with a note), Egypt (a region, two events), a sea, Ur (uncertain), one with no point, one named nowhere, 40 more in Matthew. */
const EN: World = {
  topics: [
    ['lug:jerusalem', place('Jerusalem')], ['lug:bethel', place('Bethel')], ['lug:egypt', place('Egypt')], ['lug:redsea', place('Red Sea')], ['lug:ur', place('Ur')],
    ['lug:lost', place('Lostville')], ['lug:quiet', place('Quietville')], ['ev:exodus', event('The exodus')], ['ev:flight', event('The flight')],
    ...fillers.map((id, i): [string, ReturnType<typeof place>] => [id, place(`Filler ${String(i).padStart(2, '0')}`)]),
  ],
  geo: {
    'lug:jerusalem': JER, 'lug:bethel': { lat: 3194, lon: 3522, sure: 3, form: 1 }, 'lug:egypt': { lat: 2700, lon: 3000, sure: 1, form: 2 },
    'lug:redsea': { lat: 2800, lon: 3400, sure: 2, form: 3 }, 'lug:ur': { lat: 3030, lon: 4600, sure: 1, form: 1 }, 'lug:quiet': { lat: 3300, lon: 3600, sure: 3, form: 1 },
    ...Object.fromEntries(fillers.map((id, i) => [id, { lat: 3000 + i, lon: 3500 + i, sure: 2 as const, form: 1 as const }])),
  },
  verses: {
    'lug:jerusalem': [v(1, 14, 18), v(40, 2, 1), v(40, 4, 5)], 'lug:bethel': [v(1, 12, 8), v(1, 28, 19)], 'lug:egypt': [v(2, 1, 1), v(40, 2, 13)],
    'lug:redsea': [v(2, 14, 2)], 'lug:ur': [v(1, 11, 28)], 'lug:lost': [v(1, 10, 1)],
    'ev:exodus': [v(2, 12, 31), v(2, 12, 37)], 'ev:flight': [v(40, 2, 13)],
    ...Object.fromEntries(fillers.map((id, i) => [id, [v(40, 5, 1 + (i % 20))]])),
  },
  relations: [{ from: 'ev:exodus', to: 'lug:egypt', type: 'place' }, { from: 'ev:flight', to: 'lug:egypt', type: 'place' }],
  places: { names: { 'lug:bethel': 'Bethel' }, notes: { 'lug:bethel': 'of Ephraim' }, aliases: {} },
}
/** Spanish, a second pack with places: two places, one of them with no point. */
const ES: World = {
  topics: [['lug:belen', place('Belén')], ['lug:nazaret', place('Nazaret')]],
  geo: { 'lug:belen': { lat: 3170, lon: 3520, sure: 3, form: 1 } },
  verses: { 'lug:belen': [v(40, 2, 1)], 'lug:nazaret': [v(40, 2, 23)] },
}
const NOGEO: World = { ...EN, geo: undefined }

// ---------------------------------------------------------------------------------------------------- the page and its stand-ins
let packs: string[] = ['en']
let ui = 'en'
let hooksRan: { label: string; sheet: any }[] = []
let allowRun = true
const hooks: ExploreHooks = {
  ui: () => ui, packs: () => packs, packName: (l) => l, addLang: () => {},
  ask: () => true, mode: () => true, ask5: () => true, saved5: () => [], resume5: () => true,
  run: (label, sheet) => { hooksRan.push({ label, sheet }); return allowRun },
}
let family = new Set<string>(['en'])
const kinReader = async (l: string): Promise<KinReader> => (family.has(l) ? kinFixture() : { ...kinFixture(), people: async () => ({ data: null }) as any })
let worlds: Record<string, World | undefined> = {}
let base: PlaceReader
const setWorlds = (w: Record<string, World | undefined>) => {
  worlds = w
  resetPlaces()
  setPlaceReader(async (lang) => {
    const x = worlds[lang]
    if (!x) throw new Error(`no places in ${lang}`)
    return world(base, x)
  })
}
const setFamily = (l: string[]) => { family = new Set(l); setKinReader(kinReader) }
// the maps: what each drawing was given, and how many were destroyed
let mounts: MapOpts[] = []
let destroyed = 0
const mount = async (_el: unknown, o: MapOpts) => {
  mounts.push(o)
  return { redraw() {}, destroy() { destroyed++ } }
}
/** The maps of the tab (full gestures) and the small ones of a card. */
const tabMaps = () => mounts.filter((m) => m.gestures === 'full')
const lastTabMap = () => tabMaps().at(-1)!

const counts = () => (Object.values(JSON.parse(store.get('btsm.usage.days') ?? '{}') as Record<string, Record<string, number>>)[0] ?? {})
const tabNames = () => $$('.ex-tabs button').map((b) => b.textContent)
const subNames = () => $$('.ex-subtabs button').map((b) => b.textContent)
const gone = async (s: string, ms = 8000) => {
  for (let t = 0; t < ms; t += 20) { if (!$(s)) return; await sleep(20) }
  throw new Error(`still there: ${s}`)
}
const waitFor = async (f: () => boolean, what: string, ms = 8000) => {
  for (let t = 0; t < ms && !f(); t += 25) await sleep(25)
  if (!f()) throw new Error(`never: ${what}`)
}
/** Browse opened and settled: the people indexes built (when there are any) and the home drawn with the tabs they bring. */
async function homeReady(want: string[], tab: string[]) {
  openExplore('bar')
  await sleep(100)
  for (let t = 0; t < 8000 && peoplePacks(packs).join() !== want.join(); t += 50) await sleep(50)
  expect(peoplePacks(packs)).toEqual(want)
  await waitFor(() => tabNames().join('|') === tab.join('|'), `the tabs ${tab.join(', ')} (have ${tabNames().join(', ')})`)
}
const clickTab = (name: string) => $$('.ex-tabs button').find((b) => b.textContent === name)!.click()
const clickSub = (name: string) => $$('.ex-subtabs button').find((b) => b.textContent === name)!.click()
const rows = () => $$('.ex-lrows .ex-row')
const rowNames = () => rows().map((r) => r.querySelector('.ex-row-t')!.textContent)
const type = (q: string) => {
  const box = $('.ex-lsearch')! as any
  box.value = q
  box.oninput()
}
const typeAndWait = async (q: string, n: number) => {
  type(q)
  await waitFor(() => rows().length === n, `${n} rows for "${q}" (have ${rows().length})`)
}

let offKin = () => {}
beforeAll(async () => {
  installPage()
  doc.body.appendChild(Object.assign(new FakeEl('main'), { id: 'log' }))
  setExploreHooks(hooks)
  setExploreMapMount(mount)
  offKin = onKinReady(kinReadyExplore) // as main.ts does
  await installPacks(['en'])
  base = await mapsFixture().open()
})
afterAll(() => {
  offKin()
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
  packs = ['en']
  ui = 'en'
  hooksRan = []
  allowRun = true
  mounts = []
  destroyed = 0
  setFamily(['en'])
  setWorlds({ en: EN })
})

// ------------------------------------------------------------------------------------------------------------------ the tabs
describe('which tab, which subtabs', () => {
  test('people and places: one tab, "People and places", with two subtabs; People first', async () => {
    await homeReady(['en'], ['Bible', 'Translation Academy', 'People and places'])
    clickTab('People and places')
    await until('.ex-psearch')
    expect(subNames()).toEqual(['People', 'Places'])
    expect($$('.ex-subtabs button').find((b) => b.textContent === 'People')!.getAttribute('aria-selected')).toBe('true')
    expect($('.ex-lsearch')).toBeNull()
    clickSub('Places')
    await until('.ex-lsearch')
    expect($('.ex-psearch')).toBeNull()
    expect($$('.ex-subtabs button').find((b) => b.textContent === 'Places')!.getAttribute('aria-selected')).toBe('true')
  })

  test('only places: the tab is "Places" and has no subtabs', async () => {
    setFamily([])
    openExplore('bar')
    await waitFor(() => tabNames().includes('Places'), 'the Places tab')
    expect(tabNames()).toEqual(['Bible', 'Translation Academy', 'Places'])
    clickTab('Places')
    await until('.ex-lsearch')
    expect($('.ex-subtabs')).toBeNull()
    expect($('.ex-psearch')).toBeNull()
  })

  test('only people: "People", as in X1, no subtabs', async () => {
    setWorlds({})
    await homeReady(['en'], ['Bible', 'Translation Academy', 'People'])
    clickTab('People')
    await until('.ex-psearch')
    expect($('.ex-subtabs')).toBeNull()
  })

  test('without `geo` the places are not offered: nothing changes from X1', async () => {
    setWorlds({ en: NOGEO })
    await homeReady(['en'], ['Bible', 'Translation Academy', 'People'])
    clickTab('People')
    await until('.ex-psearch')
    expect($('.ex-subtabs')).toBeNull()
    expect($('.ex-lsearch')).toBeNull()
  })

  test('neither people nor places: no tab at all', async () => {
    setFamily([])
    setWorlds({})
    // (the people index is built and the places are read: waited for by what tells it, not by a fixed time)
    const built = new Promise<void>((r) => { const off = onKinReady(() => { off(); r() }) })
    openExplore('bar')
    await until('.ex-books')
    warmKin(packs)
    await Promise.race([built, sleep(8000)])
    expect(peoplePacks(packs)).toEqual([])
    expect(await placePacks(packs)).toEqual([])
    await sleep(100) // (a redraw, if there were one, has happened)
    expect(tabNames()).toEqual(['Bible', 'Translation Academy'])
    expect($('.ex-subtabs')).toBeNull()
  })

  test('only places on the phone (no Bible, no Academy): the places tab alone, with no bar of tabs', async () => {
    setFamily([])
    packs = ['zz']
    setWorlds({ zz: EN })
    openExplore('bar')
    await until('.ex-lsearch')
    expect($('.ex-tabs')).toBeNull()
    expect($('.ex-subtabs')).toBeNull()
  })

  test('the subtab chosen goes (the places went): the first one there is, People', async () => {
    await homeReady(['en'], ['Bible', 'Translation Academy', 'People and places'])
    clickTab('People and places')
    await until('.ex-psearch')
    clickSub('Places')
    await until('.ex-lsearch')
    // the places are gone (the packs changed: places forgets what it read), the people stay
    setWorlds({})
    redrawExplore()
    await until('.ex-psearch')
    expect($('.ex-lsearch')).toBeNull()
    expect(tabNames()).toEqual(['Bible', 'Translation Academy', 'People'])
    expect($('.ex-subtabs')).toBeNull()
    // and when they come back the tab is "People and places" again, on the People subtab
    setWorlds({ en: EN })
    redrawExplore()
    await waitFor(() => subNames().length === 2, 'the subtabs')
    expect(tabNames()).toEqual(['Bible', 'Translation Academy', 'People and places'])
    expect($('.ex-psearch')).not.toBeNull()
  })

  test('the people go while the Places subtab is on screen: the tab becomes "Places" and keeps the list', async () => {
    await homeReady(['en'], ['Bible', 'Translation Academy', 'People and places'])
    clickTab('People and places')
    await until('.ex-psearch')
    clickSub('Places')
    await until('.ex-lsearch')
    setFamily([])
    redrawExplore()
    await waitFor(() => tabNames().includes('Places'), 'the Places tab')
    await until('.ex-lsearch')
    expect($('.ex-subtabs')).toBeNull()
  })

  test('the tab shows in the six languages (the names of the tab and of the subtabs)', async () => {
    const want: Record<string, [string, string, string]> = {
      en: ['People and places', 'People', 'Places'], es: ['Personas y lugares', 'Personas', 'Lugares'], fr: ['Personnes et lieux', 'Personnes', 'Lieux'],
      id: ['Orang dan tempat', 'Orang', 'Tempat'], hi: ['लोग और स्थान', 'लोग', 'स्थान'], ar: ['أشخاص وأماكن', 'أشخاص', 'أماكن'],
    }
    for (const [l, [tab, a, b]] of Object.entries(want)) {
      closeExplore(false)
      resetExplore()
      ui = l
      openExplore('bar')
      await waitFor(() => tabNames().includes(tab), `${tab} in ${l}`)
      $$('.ex-tabs button').find((x) => x.textContent === tab)!.click()
      await until('.ex-subtabs')
      expect(subNames()).toEqual([a, b])
    }
  })
})

// ---------------------------------------------------------------------------------------------------- the places tab: search, book
describe('the places tab', () => {
  const openPlaces = async () => {
    setFamily([])
    openExplore('bar')
    await waitFor(() => tabNames().includes('Places'), 'the Places tab')
    clickTab('Places')
    await until('.ex-lrows .ex-row')
  }

  test('with no search: the map gets every place with a point (not 30), the list 30 rows and the note to keep typing', async () => {
    store.set('btsm.usage', '1')
    await openPlaces()
    await waitFor(() => tabMaps().length === 1, 'the map')
    const m = lastTabMap()
    // 47 places: 46 with a point on the map (the one with no point is only in the list)
    expect(m.points.length).toBe(46)
    expect(m.points.some((p) => p.id === 'lug:lost')).toBe(false)
    expect(m.gestures).toBe('full')
    expect(m.pack).toBe('en')
    expect(m.height).toBeGreaterThanOrEqual(260)
    expect(m.height).toBeLessThanOrEqual(520)
    expect(m.summary).toBe('Map of places (46)')
    expect(typeof m.onPick).toBe('function')
    expect(rows().length).toBe(30)
    expect($('.ex-lmore')!.textContent).toBe('Keep typing to narrow it down.')
    // the most named first
    expect(rowNames().slice(0, 3)).toEqual(['Jerusalem', 'Bethel (of Ephraim)', 'Egypt'])
    expect(counts()['explore.places.open']).toBe(1)
  })

  test('the rows say how sure the place is, in words, and how many verses name it', async () => {
    await openPlaces()
    await typeAndWait('', 30)
    const sub = (name: string) => rows().find((r) => r.querySelector('.ex-row-t')!.textContent.startsWith(name))
    // (the tags are there at once, the counts a moment later)
    expect(sub('Egypt')!.querySelector('.ex-row-s')!.textContent).toContain('region')
    await waitFor(() => sub('Jerusalem')!.querySelector('.ex-row-s')!.textContent.includes('Named in 3 verses.'), 'the count of Jerusalem')
    const only = async (q: string, name: string, tag: string) => {
      type(q)
      await waitFor(() => rowNames().join() === name, `${name} alone`)
      expect(rows()[0]!.querySelector('.ex-row-s')!.textContent).toContain(tag)
    }
    await only('lostv', 'Lostville', 'location unknown')
    await only('ur', 'Ur', 'uncertain location')
    await only('red', 'Red Sea', 'water')
  })

  test('a search narrows the list and the map together; the old map is destroyed; the box keeps its text', async () => {
    store.set('btsm.usage', '1')
    await openPlaces()
    await waitFor(() => tabMaps().length === 1, 'the map')
    const before = destroyed
    const box = $('.ex-lsearch')! as any
    box.focus()
    await typeAndWait('beth', 1)
    expect(rowNames()).toEqual(['Bethel (of Ephraim)'])
    await waitFor(() => tabMaps().length === 2, 'the second map')
    expect(lastTabMap().points.map((p) => p.id)).toEqual(['lug:bethel'])
    expect(destroyed).toBeGreaterThan(before)
    expect($('.ex-lsearch')).toBe(box) // the same box, not drawn again
    expect(doc.activeElement).toBe(box)
    expect(box.value).toBe('beth')
    expect(counts()['explore.places.search']).toBe(1)
    type('bethe') // still something: not another search
    await sleep(300)
    expect(counts()['explore.places.search']).toBe(1)
    // a search with nothing: the note, and no map (nothing to draw)
    type('qqqq')
    await until('.ex-lnone')
    expect($('.ex-lnone')!.textContent).toBe('No place with that name.')
    expect(rows().length).toBe(0)
  })

  test('two keys, one search (the debounce); a search that matches only places with no point leaves the map out', async () => {
    await openPlaces()
    await waitFor(() => tabMaps().length === 1, 'the map')
    type('lo')
    type('lost')
    await waitFor(() => rows().length === 1, 'the row')
    await sleep(300)
    expect(tabMaps().length).toBe(1) // (the point-less place has nothing to show: no new map)
    expect(rowNames()).toEqual(['Lostville'])
    expect(($('.ex-lmap') as any).style.display).toBe('none')
  })

  test('the book filter: the books that name a place, by name; it narrows list and map; "All books" gives them back', async () => {
    await openPlaces()
    await waitFor(() => $$('.ex-lbook option').length > 1, 'the books')
    const opts = $$('.ex-lbook option')
    expect(opts[0]!.textContent).toBe('All books')
    expect(opts.map((o) => o.value)).toEqual(['', 'gen', 'exo', 'mat'])
    expect(opts.map((o) => o.textContent).slice(1)).toEqual(['Genesis', 'Exodus', 'Matthew'])
    const sel = $('.ex-lbook')! as any
    sel.value = 'gen'
    sel.onchange()
    // Genesis names Jerusalem, Bethel, Ur and Lostville (no point)
    await waitFor(() => rows().length === 4, 'the places of Genesis')
    expect(rowNames()).toEqual(['Jerusalem', 'Bethel (of Ephraim)', 'Lostville', 'Ur'])
    await waitFor(() => tabMaps().length === 2, 'the map of Genesis')
    expect(lastTabMap().points.map((p) => p.id).sort()).toEqual(['lug:bethel', 'lug:jerusalem', 'lug:ur'])
    // book and search together
    await typeAndWait('ur', 1)
    expect(rowNames()).toEqual(['Ur'])
    sel.value = ''
    sel.onchange()
    await waitFor(() => rows().length === 1, 'still Ur')
    type('')
    await waitFor(() => rows().length === 30, 'all of them')
    expect($('.ex-lmore')).not.toBeNull()
    // Matthew names the 40 more, and fewer than 30 are not noted
    sel.value = 'exo'
    sel.onchange()
    await waitFor(() => rows().length === 2, 'the places of Exodus')
    expect($('.ex-lmore')).toBeNull()
    expect(rowNames()).toEqual(['Egypt', 'Red Sea'])
  })

  test('a tap on a map point opens the place; Back finds the search and the book as they were', async () => {
    store.set('btsm.usage', '1')
    await openPlaces()
    await waitFor(() => $$('.ex-lbook option').length > 1, 'the books')
    const sel = $('.ex-lbook')! as any
    sel.value = 'gen'
    sel.onchange()
    await typeAndWait('b', 1)
    await waitFor(() => tabMaps().length >= 2, 'a map')
    lastTabMap().onPick!('lug:bethel')
    await until('.ex-place')
    expect($('.ex-place')!.dataset.id).toBe('lug:bethel')
    expect($('.ex-title')!.textContent).toBeTruthy()
    await waitFor(() => $('.ex-title')!.textContent === 'Bethel (of Ephraim)', 'the title')
    expect(counts()['explore.places.place']).toBe(1)
    expect(backExplore()).toBe(true)
    await until('.ex-lsearch')
    expect(($('.ex-lsearch') as any).value).toBe('b')
    await waitFor(() => rows().length === 1, 'the same list')
    expect(($('.ex-lbook') as any).value).toBe('gen')
    expect(rowNames()).toEqual(['Bethel (of Ephraim)'])
    // coming back to the tab is not opening it again
    expect(counts()['explore.places.open']).toBe(1)
  })

  test('a tap on a row opens the card the same way', async () => {
    await openPlaces()
    rows().find((r) => r.querySelector('.ex-row-t')!.textContent === 'Egypt')!.click()
    await until('.ex-place')
    expect($('.ex-place')!.dataset.pack).toBe('en')
    expect($('.ex-place')!.dataset.id).toBe('lug:egypt')
    expect(backExplore()).toBe(true)
    await until('.ex-lsearch')
  })

  test('Browse draws something else: the map is destroyed and a late search does nothing', async () => {
    await openPlaces()
    await waitFor(() => tabMaps().length === 1, 'the map')
    const before = destroyed
    type('beth')
    clickTab('Bible') // (a new drawing, before the debounce is over)
    await until('.ex-books')
    expect(destroyed).toBe(before + 1)
    await sleep(400)
    expect(tabMaps().length).toBe(1)
  })
})

// --------------------------------------------------------------------------------------------------- the tab by itself, and two packs
const ctx = (over: Partial<PlacesCtx> = {}): PlacesCtx => ({
  ui: 'en', packs: ['en'], chevron: () => doc.createElement('span') as any, onOpen: () => {}, mount,
  text: { search: 'Search a place', none: 'None', more: 'More', fail: 'Fail', loading: 'Opening…', book: 'Book', allBooks: 'All books', mapSum: 'Map of {n} places', count: 'Places found: {n}' }, ...over,
})
const drawn: { remove: () => void }[] = [] // (taken off the page after each test: other files look the page up by class)
const draw = (c: PlacesCtx) => {
  const body = doc.createElement('div') as any
  doc.body.appendChild(body)
  drawn.push(body)
  renderLugaresTab(body, c)
  return body as typeof doc.body
}

describe('the tab by itself', () => {
  beforeEach(() => resetLugaresTab())

  test('it reads the first pack with places; the search is forgotten by resetLugaresTab and kept otherwise', async () => {
    setWorlds({ en: EN, es: ES })
    let body = draw(ctx({ packs: ['es', 'en'], ui: 'es' }))
    await waitFor(() => body.querySelectorAll('.ex-lrows .ex-row').length === 2, 'the two places of es')
    expect(body.querySelectorAll('.ex-lrows .ex-row').map((r) => r.dataset.pack)).toEqual(['es', 'es'])
    // the point-less one is in the list, not on the map
    await waitFor(() => tabMaps().length === 1, 'the map')
    expect(lastTabMap().points.map((p) => p.id)).toEqual(['lug:belen'])
    expect(lastTabMap().pack).toBe('es')
    ;(body.querySelector('.ex-lsearch') as any).value = 'naz'
    ;(body.querySelector('.ex-lsearch') as any).oninput()
    await sleep(300)
    body = draw(ctx({ packs: ['es', 'en'], ui: 'es' }))
    expect((body.querySelector('.ex-lsearch') as any).value).toBe('naz')
    resetLugaresTab()
    body = draw(ctx({ packs: ['es', 'en'], ui: 'es' }))
    expect((body.querySelector('.ex-lsearch') as any).value).toBe('')
    stopLugaresTab()
    for (const b of drawn.splice(0)) b.remove()
  })

  test('Arabic: the tab runs right to left, the box takes the direction of what is typed, the map keeps its own', async () => {
    setWorlds({ en: EN })
    const body = draw(ctx({ ui: 'ar' }))
    await waitFor(() => body.querySelectorAll('.ex-lrows .ex-row').length === 30, 'the rows')
    expect((body.querySelector('.ex-places') as any).dir).toBe('rtl')
    expect((body.querySelector('.ex-lsearch') as any).dir).toBe('auto')
    expect((body.querySelector('.ex-lrows') as any).dir).toBe('rtl')
    await waitFor(() => tabMaps().length === 1, 'the map')
    expect(lastTabMap().dir).toBe('rtl')
    stopLugaresTab()
    for (const b of drawn.splice(0)) b.remove()
  })

  test('a map that cannot be drawn is hidden and the list stays', async () => {
    setWorlds({ en: EN })
    const body = draw(ctx({ mount: async () => { throw new Error('no canvas') } }))
    await waitFor(() => body.querySelectorAll('.ex-lrows .ex-row').length === 30, 'the rows')
    await sleep(50)
    expect((body.querySelector('.ex-lmap') as any).style.display).toBe('none')
    stopLugaresTab()
    for (const b of drawn.splice(0)) b.remove()
  })

  test('a map drawn late for a search that was replaced is destroyed, not kept', async () => {
    setWorlds({ en: EN })
    const slow: (() => void)[] = []
    const late = (_e: unknown, o: MapOpts) => new Promise<{ redraw(): void; destroy(): void }>((r) => { mounts.push(o); slow.push(() => r({ redraw() {}, destroy() { destroyed++ } })) })
    const body = draw(ctx({ mount: late }))
    await waitFor(() => body.querySelectorAll('.ex-lrows .ex-row').length === 30, 'the rows')
    ;(body.querySelector('.ex-lsearch') as any).value = 'beth'
    ;(body.querySelector('.ex-lsearch') as any).oninput()
    await waitFor(() => slow.length === 2, 'the second drawing')
    slow[0]!() // the first drawing comes late: nobody wants it
    await sleep(20)
    expect(destroyed).toBe(1)
    slow[1]!()
    await sleep(20)
    expect(destroyed).toBe(1)
    stopLugaresTab()
    expect(destroyed).toBe(2)
    for (const b of drawn.splice(0)) b.remove()
  })
})

// ----------------------------------------------------------------------------------------------------------------- the stack
describe('the stack with places', () => {
  test('the card of a pack that is taken off the phone leaves the stack; so does one reopened after it went', async () => {
    setFamily([])
    setWorlds({ en: EN, es: ES })
    packs = ['en', 'es']
    openExplore('bar')
    await waitFor(() => tabNames().includes('Places'), 'the Places tab')
    openPlace('es', 'lug:belen', 'Belén')
    await until('.ex-place')
    expect($('.ex-place')!.dataset.pack).toBe('es')
    packs = ['en'] // es was removed
    resetPlaces()
    redrawExplore()
    await gone('.ex-place')
    await until('.ex-tabs')
    expect(backExplore()).toBe(true) // the home alone: Back closes
    expect(exploreOpen()).toBe(false)
    // the same with Browse closed: the stack is kept, the card of the pack that went is not
    packs = ['en', 'es']
    openExplore('bar')
    await waitFor(() => tabNames().includes('Places'), 'the Places tab')
    openPlace('es', 'lug:belen')
    await until('.ex-place')
    closeExplore(false)
    packs = ['en']
    openExplore('bar')
    await until('.ex-tabs')
    expect($('.ex-place')).toBeNull()
  })

  test('Back takes one view at a time: card, then the tab', async () => {
    setFamily([])
    openExplore('bar')
    await waitFor(() => tabNames().includes('Places'), 'the Places tab')
    clickTab('Places')
    await until('.ex-lrows .ex-row')
    openPlace('en', 'lug:egypt', 'Egypt')
    await until('.ex-place')
    openPlace('en', 'lug:bethel', 'Bethel')
    await waitFor(() => $('.ex-place')!.dataset.id === 'lug:bethel', 'the second card')
    expect(backExplore()).toBe(true)
    await waitFor(() => $('.ex-place')?.dataset.id === 'lug:egypt', 'the first card')
    expect(backExplore()).toBe(true)
    await until('.ex-lsearch')
  })
})


// ------------------------------------------------------------------------- closing, resizing, being used, reading in the background
const setHeight = (h?: number) => { if (h === undefined) delete (globalThis as any).innerHeight; else (globalThis as any).innerHeight = h }
const fireResize = async () => {
  ;(globalThis as any).dispatchEvent(new Event('resize'))
  await sleep(400) // (past its own debounce)
}
const openPlacesTab = async () => {
  setFamily([])
  openExplore('bar')
  await waitFor(() => tabNames().includes('Places'), 'the Places tab')
  clickTab('Places')
  await until('.ex-lrows .ex-row')
  await waitFor(() => tabMaps().length === 1, 'the map')
}

describe('Browse closed', () => {
  test('closing destroys the map, lets go of the debounce and the resize: nothing is mounted or searched later', async () => {
    await openPlacesTab()
    const before = destroyed
    type('beth') // (a search waiting in its debounce)
    setHeight(500)
    closeExplore(false)
    expect(destroyed).toBe(before + 1)
    await fireResize()
    await sleep(300)
    expect(mounts.length).toBe(1)
    // opening again draws the tab again, with the search as it was
    openExplore('bar')
    await until('.ex-lsearch')
    expect(($('.ex-lsearch') as any).value).toBe('beth')
    setHeight()
  })
  test('closing from a card leaves no map of it alive either', async () => {
    await openPlacesTab()
    openPlace('en', 'lug:egypt', 'Egypt')
    await until('.ex-place-card')
    await waitFor(() => mounts.length === 2, 'the small map') // (drawn: its host is on the page)
    const before = destroyed
    closeExplore(false)
    expect(destroyed).toBeGreaterThan(before) // (swept: its host left the page)
    expect($('.ex-place-card')).toBeNull()
  })
})

describe('the window changes size', () => {
  test('with the box in focus (the keyboard changed the height) the map is not mounted again; after, only a real change of height draws it again, from the same places', async () => {
    setHeight(800)
    await openPlacesTab()
    const box = $('.ex-lsearch')! as any
    box.focus()
    setHeight(450)
    await fireResize()
    expect(mounts.length).toBe(1)
    // the keyboard goes away: the height is the first one again, nothing to draw
    doc.activeElement = null
    setHeight(800)
    await fireResize()
    expect(mounts.length).toBe(1)
    // a real change (a turn of the phone), the box not in use: the same points at the new height, no new search
    setHeight(500)
    await fireResize()
    expect(mounts.length).toBe(2)
    expect(mounts[1]!.height).toBe(275)
    expect(mounts[1]!.points.length).toBe(mounts[0]!.points.length)
    expect(destroyed).toBe(1)
    setHeight()
  })
})

describe('a change that only renames the tab while the places tab is in use', () => {
  const run = async (use: () => void) => {
    await openPlacesTab()
    const box = $('.ex-lsearch')!
    use()
    await sleep(300) // (a search typed has drawn its map by now)
    const m0 = mounts.length, d0 = destroyed
    // the people index of the phone is built while the box is in use
    const built = new Promise<void>((r) => { const off = onKinReady(() => { off(); r() }) })
    setFamily(['en'])
    warmKin(packs)
    await Promise.race([built, sleep(8000)])
    await waitFor(() => peoplePacks(packs).length === 1, 'the people')
    await sleep(200)
    expect($('.ex-lsearch')).toBe(box) // not drawn again: no loss of focus, text or map
    expect(mounts.length).toBe(m0)
    expect(destroyed).toBe(d0)
    expect(tabNames()).toEqual(['Bible', 'Translation Academy', 'Places']) // (the name changes with the next drawing)
    clickTab('Bible')
    await until('.ex-books')
    expect(tabNames()).toEqual(['Bible', 'Translation Academy', 'People and places'])
  }
  test('the box has the focus', async () => run(() => ($('.ex-lsearch') as any).focus()))
  test('the box has text in it', async () => run(() => { const b = $('.ex-lsearch') as any; b.value = 'beth'; b.oninput() }))
})

describe('the places are read in the background', () => {
  test('Bible is drawn without waiting for a slow reading of places; the tab appears when it ends; later packs are not read once the first has places', async () => {
    setFamily([])
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const asked: string[] = []
    resetPlaces()
    setPlaceReader(async (lang) => {
      asked.push(lang)
      await gate
      const w = lang === 'en' ? EN : undefined
      if (!w) throw new Error('no places')
      return world(base, w)
    })
    packs = ['en', 'es']
    openExplore('bar')
    await until('.ex-books') // the Bible is there while the places are still being read
    expect(tabNames()).not.toContain('Places')
    await sleep(100)
    expect(tabNames()).not.toContain('Places')
    release()
    await waitFor(() => tabNames().includes('Places'), 'the Places tab')
    expect(tabNames()).toEqual(['Bible', 'Translation Academy', 'Places'])
    expect(asked).not.toContain('es') // (the first pack had places: the second is not read for them)
  })

  test('the reading ends with another answer while the places tab is in use (text in the box): nothing is drawn again under it', async () => {
    packs = ['zz', 'en'] // (zz has no places yet)
    await openPlacesTab()
    type('beth')
    await waitFor(() => rows().length === 1, 'the search')
    setWorlds({ en: EN, zz: EN }) // (zz has them now: the first pack with places is another; Browse learns it when it reads them again)
    openExplore('bar') // (draws the tab again from what it knew, and reads the places in the background)
    await waitFor(() => rows().length === 1, 'the tab drawn again')
    const box = $('.ex-lsearch')!
    await sleep(100)
    const m0 = mounts.length
    await sleep(400)
    expect($('.ex-lsearch')).toBe(box)
    expect(mounts.length).toBe(m0)
    expect(tabNames()).toContain('Places') // (the name goes with the next drawing)
  })
})

describe('coming back from a card', () => {
  test('the list is where it was scrolled to', async () => {
    setFamily([])
    openExplore('bar')
    await waitFor(() => tabNames().includes('Places'), 'the Places tab')
    clickTab('Places')
    await until('.ex-lrows .ex-row')
    const body = $('.ex-body')! as any
    body.scrollTop = 321
    rows().find((r) => r.querySelector('.ex-row-t')!.textContent === 'Egypt')!.click()
    await until('.ex-place')
    expect(backExplore()).toBe(true)
    await until('.ex-lrows .ex-row')
    await waitFor(() => (($('.ex-body') as any).scrollTop === 321), 'the scroll')
    // (and only once: another drawing of the tab starts at the top)
    clickTab('Bible')
    await until('.ex-books')
    clickTab('Places')
    await until('.ex-lrows .ex-row')
    expect((($('.ex-body') as any).scrollTop)).toBe(0)
  })
})

describe('what a screen reader is told', () => {
  test('a polite status says how many places a search or a filter found, or that none was', async () => {
    await openPlacesTab()
    const s = $('.ex-lstatus')! as any
    expect(s.getAttribute('role')).toBe('status')
    expect(s.getAttribute('aria-live')).toBe('polite')
    expect(s.textContent).toBe('') // (nothing is said when the tab opens)
    type('beth')
    await waitFor(() => s.textContent === 'Places found: 1', 'one place')
    const sel = $('.ex-lbook')! as any
    await waitFor(() => $$('.ex-lbook option').length > 1, 'the books')
    type('')
    await waitFor(() => s.textContent === 'Places found: 47', 'all the places')
    sel.value = 'exo'
    sel.onchange()
    await waitFor(() => s.textContent === 'Places found: 2', 'the places of Exodus')
    type('qqqq')
    await waitFor(() => s.textContent === 'No place with that name.', 'none')
  })
})

// ------------------------------------------------------------------- a background answer and a home in use; a drawing in flight when Browse closes
describe('a background answer does not disturb a home in use', () => {
  /** The places are read through a gate: Browse is drawn without them, and the answer comes when `release` is called. */
  const gated = () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    resetPlaces()
    setPlaceReader(async () => { await gate; return world(base, EN) })
    return release
  }
  test('Bible scrolled: the reading of the places ends, the tab appears and the page is still where it was', async () => {
    setFamily([])
    const release = gated()
    openExplore('bar')
    await until('.ex-books')
    const body = $('.ex-body')! as any
    body.scrollTop = 50
    release()
    await waitFor(() => tabNames().includes('Places'), 'the Places tab')
    await sleep(50)
    expect(body.scrollTop).toBe(50)
    expect($('.ex-books')).not.toBeNull()
  })

  test('People alone (no places), page scrolled: the people index ends, the tab appears and the page is still where it was', async () => {
    let go!: () => void
    const gate = new Promise<void>((r) => { go = r })
    setKinReader(async () => ({ ...kinFixture(), people: async () => { await gate; return kinFixture().people() } }) as KinReader) // (the people index is built when the gate opens)
    setWorlds({})
    openExplore('bar')
    await until('.ex-books')
    expect(tabNames()).toEqual(['Bible', 'Translation Academy'])
    const body = $('.ex-body')! as any
    body.scrollTop = 40
    go()
    await waitFor(() => tabNames().includes('People'), 'the People tab')
    await sleep(50)
    expect(body.scrollTop).toBe(40)
  })

  test('closing with a change held back: nothing is drawn later, and the next opening has the tab', async () => {
    setFamily(['en'])
    const release = gated()
    openExplore('bar')
    await waitFor(() => tabNames().includes('People'), 'the People tab')
    clickTab('People')
    await until('.ex-psearch')
    ;($('.ex-psearch') as any).focus() // (the box in use: the answer is held back)
    release()
    await sleep(300)
    expect(tabNames()).toEqual(['Bible', 'Translation Academy', 'People'])
    closeExplore(false)
    doc.activeElement = null
    await sleep(400)
    expect($('.ex-tabs')).toBeNull() // (nothing drew a closed Browse)
    expect($('.ex-psearch')).toBeNull()
    openExplore('bar')
    await waitFor(() => tabNames().includes('People and places'), 'the tab with both')
  })

  test('the box of People in focus: the reading of the places ends, the box keeps its focus and the tab keeps its name', async () => {
    setFamily(['en'])
    const release = gated()
    openExplore('bar')
    await waitFor(() => tabNames().includes('People'), 'the People tab')
    clickTab('People')
    await until('.ex-psearch')
    const box = $('.ex-psearch')! as any
    box.focus()
    release()
    await sleep(300)
    expect($('.ex-psearch')).toBe(box)
    expect(doc.activeElement).toBe(box)
    expect(tabNames()).toEqual(['Bible', 'Translation Academy', 'People'])
    expect($('.ex-subtabs')).toBeNull()
    // the focus goes (another tab is tapped): the drawing has what was held back, and does not ask the answer again
    doc.activeElement = null
    clickTab('Translation Academy')
    await waitFor(() => tabNames().includes('People and places'), 'the tab with both at the next drawing')
  })

  test('the people index ends while the page is scrolled, with places there: the tab is renamed and the page is still where it was', async () => {
    setFamily([])
    openExplore('bar')
    await until('.ex-books')
    await waitFor(() => tabNames().includes('Places'), 'the Places tab')
    const body = $('.ex-body')! as any
    body.scrollTop = 40
    const built = new Promise<void>((r) => { const off = onKinReady(() => { off(); r() }) })
    setFamily(['en'])
    warmKin(packs)
    await Promise.race([built, sleep(8000)])
    await waitFor(() => tabNames().includes('People and places'), 'the tab renamed')
    await sleep(50)
    expect(body.scrollTop).toBe(40)
  })

  test('a held back change shows once the box that held it is let go: a second answer with the same set is not lost', async () => {
    setFamily([])
    openExplore('bar')
    await waitFor(() => tabNames().includes('Places'), 'the Places tab')
    clickTab('Places')
    await until('.ex-lsearch')
    ;($('.ex-lsearch') as any).focus()
    const built = new Promise<void>((r) => { const off = onKinReady(() => { off(); r() }) })
    setFamily(['en'])
    warmKin(packs)
    await Promise.race([built, sleep(8000)])
    await waitFor(() => peoplePacks(packs).length === 1, 'the people')
    await sleep(100)
    expect(tabNames()).toEqual(['Bible', 'Translation Academy', 'Places'])
    doc.activeElement = null
    kinReadyExplore() // (another answer, the same set: not dropped for being the same)
    await waitFor(() => tabNames().includes('People and places'), 'the tab with both')
  })
})

describe('Browse closed while it is still reading', () => {
  test('a drawing that ends after the close mounts no map, starts no timer and draws nothing', async () => {
    await openPlacesTab() // (the places are known, the home was on the places tab)
    closeExplore(false)
    const m0 = mounts.length
    openExplore('bar')
    closeExplore(false) // (before the drawing has read anything)
    await sleep(500)
    expect(mounts.length).toBe(m0)
    expect($('.ex-lsearch')).toBeNull()
    expect($('.ex-tabs')).toBeNull()
    setHeight(500)
    await fireResize()
    expect(mounts.length).toBe(m0)
    setHeight()
  })
})

// ------------------------------------------------------------ a change of packs while the places are read again; a drawing that is replaced
describe('a change of packs while the Places tab is chosen', () => {
  /** The places are read again through a gate (as after a pack is added); `outcome` is what the phone has when the gate opens. */
  const gated = () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    let outcome: World | undefined = EN
    resetPlaces()
    setPlaceReader(async () => {
      await gate
      if (!outcome) throw new Error('no places')
      return world(base, outcome)
    })
    return { release, set: (w?: World) => { outcome = w } }
  }
  const selected = () => $$('.ex-tabs button').find((b) => b.getAttribute('aria-selected') === 'true')?.textContent
  const selectedSub = () => $$('.ex-subtabs button').find((b) => b.getAttribute('aria-selected') === 'true')?.textContent

  test('the tab stays chosen while the places are read again, and after the answer', async () => {
    await openPlacesTab()
    const g = gated()
    packs = ['en', 'es'] // another language was added
    redrawExplore()
    await sleep(200)
    expect(selected()).toBe('Places')
    expect($('.ex-lsearch')).not.toBeNull()
    g.release()
    await sleep(400)
    expect(selected()).toBe('Places')
    expect($('.ex-lsearch')).not.toBeNull()
    await until('.ex-lrows .ex-row')
  })

  test('with people and places: the subtab chosen stays, too', async () => {
    openExplore('bar')
    await waitFor(() => tabNames().includes('People and places'), 'the tab with both')
    clickTab('People and places')
    await until('.ex-psearch')
    clickSub('Places')
    await until('.ex-lsearch')
    const g = gated()
    packs = ['en', 'es']
    redrawExplore()
    await sleep(200)
    expect(selected()).toBe('People and places')
    expect(selectedSub()).toBe('Places')
    g.release()
    await sleep(400)
    expect(selectedSub()).toBe('Places')
    expect($('.ex-lsearch')).not.toBeNull()
  })

  test('when the answer is that there are no places, it falls to the first tab there is', async () => {
    await openPlacesTab()
    const g = gated()
    g.set(undefined)
    packs = ['en', 'es']
    redrawExplore()
    await sleep(200)
    expect(selected()).toBe('Places')
    g.release()
    await until('.ex-books')
    expect(tabNames()).toEqual(['Bible', 'Translation Academy'])
    expect(selected()).toBe('Bible')
  })
})

describe('a drawing that another one replaced', () => {
  test('the scroll of the page is not written on the view that came after (a book tapped while the home was drawn again)', async () => {
    let go!: () => void
    const gate = new Promise<void>((r) => { go = r })
    setKinReader(async () => ({ ...kinFixture(), people: async () => { await gate; return kinFixture().people() } }) as KinReader)
    setWorlds({})
    offKin() // (Browse is told by hand, in the same tick as the tap)
    try {
      const built = new Promise<void>((r) => { const off = onKinReady(() => { off(); r() }) })
      openExplore('bar')
      await until('.ex-books')
      go()
      await Promise.race([built, sleep(8000)])
      await waitFor(() => peoplePacks(packs).length === 1, 'the people')
      const body = $('.ex-body')! as any
      body.scrollTop = 50
      const book = $$('.ex-books button')[0]!
      kinReadyExplore() // the home is drawn again (it will give the page back its 50)...
      ;(globalThis as any).requestAnimationFrame = (f: () => void) => setTimeout(f, 0) // (the book's view waits for a paint)
      book.click() // ...and a book is tapped before it ends
      await sleep(400)
      expect($('.ex-books')).toBeNull() // (the book's view is the one on screen)
      expect(body.scrollTop).toBe(0)
    } finally {
      offKin = onKinReady(kinReadyExplore)
      delete (globalThis as any).requestAnimationFrame
    }
  })
})
