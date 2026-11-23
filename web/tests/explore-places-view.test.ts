// The place view of Browse (explore.ts, explorelugares.ts renderPlace, pipeline.ts placeCard; X2 step 3 of plan-explorar-personas-lugares.md):
// the card of a place with events, without them, with no point, with no verses, with many; its buttons run the right sheet in the chat through
// the hook (and close Browse, or say it is busy); Arabic runs right to left with the references in <bdi>; all text goes in as text.
// Runs on the shared stand-in page (fake-page.ts) with a hand-made place reader (places-world.ts) and a map drawing that only records.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { installPacks } from './fs-packs'
import { mapsFixture } from './maps-fixture'
import { event, JER, place, v, world, type World } from './places-world'
import { setKinReader } from '../src/kin'
import { resetPlaces, setPlaceReader, type PlaceReader } from '../src/places'
import { backExplore, closeExplore, exploreOpen, openExplore, openPlace, resetExplore, setExploreHooks, setExploreMapMount, XT, type ExploreHooks } from '../src/explore'
import type { MapOpts } from '../src/mapview'
import { $, $$, doc, FakeEl, installPage, restorePage, sleep, store, until } from './fake-page'

const many = Array.from({ length: 12 }, (_, i) => v(1, 1, 1 + i))
const events = Array.from({ length: 7 }, (_, i) => `ev:e${i}`)
const WORLD: World = {
  topics: [
    ['lug:jerusalem', place('Jerusalem')], ['lug:egypt', place('Egypt')], ['lug:lost', place('Lostville')], ['lug:quiet', place('Quietville')],
    ['lug:many', place('Manyplace')], ['lug:html', place('<img src=x onerror=boom()>')],
    ['ev:exodus', event('The exodus')], ['ev:flight', event('The flight')], ...events.map((id, i): [string, ReturnType<typeof event>] => [id, event(`Event ${i}`)]),
  ],
  geo: {
    'lug:jerusalem': JER, 'lug:egypt': { lat: 2700, lon: 3000, sure: 1, form: 2 }, 'lug:quiet': { lat: 3300, lon: 3600, sure: 3, form: 1 },
    'lug:many': { lat: 3100, lon: 3500, sure: 2, form: 1 }, 'lug:html': { lat: 3200, lon: 3400, sure: 2, form: 1 },
  },
  verses: {
    'lug:jerusalem': [v(1, 14, 18), v(40, 2, 1), v(40, 4, 5)], 'lug:egypt': [v(2, 1, 1), v(40, 2, 13)], 'lug:lost': [v(1, 10, 1)], 'lug:many': many, 'lug:html': [v(1, 1, 1)],
    'ev:exodus': [v(2, 12, 31), v(2, 12, 37)], 'ev:flight': [v(40, 2, 13)], ...Object.fromEntries(events.map((id, i) => [id, [v(1, 2 + i, 1)]])),
  },
  relations: [
    { from: 'ev:exodus', to: 'lug:egypt', type: 'place' }, { from: 'ev:flight', to: 'lug:egypt', type: 'place' },
    ...events.map((id) => ({ from: id, to: 'lug:many', type: 'place' })),
  ],
}

let ui = 'en'
let hooksRan: { label: string; sheet: any }[] = []
let allowRun = true
const hooks: ExploreHooks = {
  ui: () => ui, packs: () => ['en'], packName: (l) => l, addLang: () => {},
  ask: () => true, mode: () => true, ask5: () => true, saved5: () => [], resume5: () => true,
  run: (label, sheet) => { hooksRan.push({ label, sheet }); return allowRun },
}
let base: PlaceReader
let mounts: MapOpts[] = []
const mount = async (_el: unknown, o: MapOpts) => {
  mounts.push(o)
  return { redraw() {}, destroy() {} }
}
const counts = () => (Object.values(JSON.parse(store.get('btsm.usage.days') ?? '{}') as Record<string, Record<string, number>>)[0] ?? {})
const waitFor = async (f: () => boolean, what: string, ms = 8000) => {
  for (let t = 0; t < ms && !f(); t += 25) await sleep(25)
  if (!f()) throw new Error(`never: ${what}`)
}
/** Browse open on a place's card, drawn (the list under it is the reading of the card). */
async function card(id: string) {
  openExplore('bar')
  await until('.ex-tabs')
  openPlace('en', id)
  await until('.ex-place-card')
}
const buttons = () => $$('.ex-pbar button')
const button = (kind: string) => buttons().find((b) => b.dataset.kind === kind)
const rowsOf = () => $$('.ex-pverses .ex-row')
const eventsOf = () => $$('.ex-pevent')

beforeAll(async () => {
  installPage()
  doc.body.appendChild(Object.assign(new FakeEl('main'), { id: 'log' }))
  setExploreHooks(hooks)
  setExploreMapMount(mount)
  await installPacks(['en'])
  base = await mapsFixture().open()
})
afterAll(() => {
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
  hooksRan = []
  allowRun = true
  mounts = []
  setKinReader(async () => ({ people: async () => ({ data: null }) }) as any) // no people: the places tab alone
  resetPlaces()
  setPlaceReader(async () => world(base, WORLD))
})

describe('the card of a place', () => {
  test('Egypt: name, how sure in words, a small map, its verses and its events, each with its passage; the credit line', async () => {
    store.set('btsm.usage', '1')
    await card('lug:egypt')
    expect($('.ex-title')!.textContent).toBe('Egypt')
    expect($('.ex-ptag')!.textContent).toBe('region')
    // the small map: 180 px, the chat's gestures, the one point
    await waitFor(() => mounts.length === 1, 'the small map')
    expect(mounts[0]!.height).toBe(180)
    expect(mounts[0]!.gestures).toBeUndefined()
    expect(mounts[0]!.points.map((p) => p.id)).toEqual(['lug:egypt'])
    // the verses
    expect($$('.ex-sub').map((h) => h.textContent)).toEqual(['Where it appears (2)', 'It happened here:'])
    expect(rowsOf().map((r) => r.textContent)).toEqual(['Exodus 1:1', 'Matthew 2:13'])
    // the events, each with its passage (a range of one chapter is one reference)
    expect(eventsOf().map((e) => e.textContent)).toEqual(['The exodus — Exodus 12:31-37', 'The flight — Matthew 2:13'])
    // the credit: the sources, plain text
    const credit = $('.ex-place-card .credit')!.textContent
    expect(credit).toMatch(/^Places: /)
    expect(credit).toMatch(/TIPNR/)
    expect(credit).not.toMatch(/\*/)
    expect(counts()['explore.places.place']).toBe(1)
  })

  test('the buttons: the card, what happened, where it appears; each runs its sheet in the chat and Browse closes', async () => {
    store.set('btsm.usage', '1')
    await card('lug:egypt')
    expect(buttons().map((b) => b.dataset.kind)).toEqual(['card', 'happened', 'verses'])
    expect(buttons().map((b) => b.textContent)).toEqual(['Details of Egypt', 'What happened here?', 'Where it appears (2)'])
    button('happened')!.click()
    expect(hooksRan.length).toBe(1)
    expect(hooksRan[0]!.label).toBe('What happened here?')
    expect(hooksRan[0]!.sheet).toMatchObject({ intent: 'place', what: ['happened'], concept: 'lug:egypt', term: 'Egypt', lang: 'en' })
    expect(exploreOpen()).toBe(false)
    expect(counts()['explore.places.toChat']).toBe(1)
    expect(counts()['explore.people.toChat']).toBeUndefined()
    // the other two
    openExplore('bar')
    await until('.ex-place-card')
    button('card')!.click()
    expect(hooksRan[1]!.sheet).toMatchObject({ intent: 'place', what: ['card'], concept: 'lug:egypt' })
    openExplore('bar')
    await until('.ex-place-card')
    button('verses')!.click()
    expect(hooksRan[2]!.sheet).toMatchObject({ intent: 'place', what: ['verses'], concept: 'lug:egypt' })
    expect(counts()['explore.places.toChat']).toBe(3)
  })

  test('a tap on a verse or on the passage of an event runs that passage in the chat', async () => {
    await card('lug:egypt')
    rowsOf()[1]!.click()
    expect(hooksRan[0]!.label).toBe('Matthew 2:13')
    expect(hooksRan[0]!.sheet).toMatchObject({ intent: 'passage', ref: 'mat 2:13', what: ['text', 'notes'], lang: 'en' })
    openExplore('bar')
    await until('.ex-place-card')
    ;(eventsOf()[0]!.querySelector('button') as any).click()
    expect(hooksRan[1]!.sheet).toMatchObject({ intent: 'passage', ref: 'exo 12:31-37' })
  })

  test('Browse busy (an answer is on its way): nothing runs, it says so, the card stays and nothing is counted', async () => {
    store.set('btsm.usage', '1')
    allowRun = false
    await card('lug:egypt')
    button('card')!.click()
    expect(hooksRan.length).toBe(1)
    expect(exploreOpen()).toBe(true)
    expect($('.ex-busy')!.textContent).toBe(XT('en').busy)
    expect($('.ex-place-card')).not.toBeNull()
    expect(counts()['explore.places.toChat']).toBeUndefined()
  })

  test('a place with no events: no events block and no "What happened here?"; sure of its point: said in words', async () => {
    await card('lug:jerusalem')
    expect($('.ex-title')!.textContent).toBe('Jerusalem')
    expect($('.ex-ptag')!.textContent).toBe(XT('en').lSure)
    expect(eventsOf().length).toBe(0)
    expect($$('.ex-sub').map((h) => h.textContent)).toEqual(['Where it appears (3)'])
    expect(buttons().map((b) => b.dataset.kind)).toEqual(['card', 'verses'])
    expect(rowsOf().length).toBe(3)
  })

  test('a place with no point: "location unknown", no map, and its verse', async () => {
    await card('lug:lost')
    expect($('.ex-ptag')!.textContent).toBe('location unknown')
    await sleep(100)
    expect(mounts.length).toBe(0)
    expect($('.place-map')).toBeNull()
    expect(rowsOf().map((r) => r.textContent)).toEqual(['Genesis 10:1'])
    expect(buttons().map((b) => b.dataset.kind)).toEqual(['card']) // (one verse: the list of one is the verse itself)
  })

  test('a place named in no verse: no verses block, the map and the card button; nothing broken', async () => {
    await card('lug:quiet')
    expect($('.ex-sub')).toBeNull()
    expect(rowsOf().length).toBe(0)
    expect(buttons().map((b) => b.dataset.kind)).toEqual(['card'])
    await waitFor(() => mounts.length === 1, 'the small map')
  })

  test('many verses and many events: the first 8 and the first 5; the whole lists are one button away', async () => {
    await card('lug:many')
    expect(rowsOf().length).toBe(8)
    expect(eventsOf().length).toBe(5)
    expect($$('.ex-sub')[0]!.textContent).toBe('Where it appears (12)')
    expect(buttons().map((b) => b.dataset.kind)).toEqual(['card', 'happened', 'verses'])
    expect(button('verses')!.textContent).toBe('Where it appears (12)')
  })

  test('all text goes in as text: a name that looks like markup is shown as it is', async () => {
    await card('lug:html')
    const name = '<img src=x onerror=boom()>'
    expect($('.ex-title')!.textContent).toBe(name)
    expect(button('card')!.textContent).toContain(name)
    expect($$('img').length).toBe(0)
  })

  test('a place that is not there (or whose data cannot be read) says so, with Back there', async () => {
    openExplore('bar')
    await until('.ex-tabs')
    openPlace('en', 'lug:nowhere', 'Nowhere')
    await until('.ex-pfail')
    expect($('.ex-pfail')!.textContent).toBe(XT('en').lCardFail)
    expect($('.ex-opening')).toBeNull()
  })

  test('Arabic: the card runs right to left and its references are in <bdi>', async () => {
    ui = 'ar'
    await card('lug:egypt')
    expect(($('.ex-place') as any).dir).toBe('rtl')
    const refs = $$('.ex-pverses .place-ref')
    expect(refs.length).toBe(2)
    expect(refs.every((r) => r.tagName === 'BDI')).toBe(true)
    // the numbers of a reference are a left-to-right run of their own
    expect($$('.ex-pverses .place-num').every((n) => n.dir === 'ltr')).toBe(true)
    expect($$('.ex-pevent .place-ref').length).toBe(2)
    expect(buttons().length).toBe(3)
  })
})

describe('the card while Browse draws it', () => {
  test('no "Opening…" of the drawing comes after the card is painted', async () => {
    await card('lug:egypt')
    await sleep(300) // (past the 150 ms after which a drawing says it is opening)
    expect($$('.ex-note').some((n) => n.textContent === XT('en').loading)).toBe(false)
  })

  test('Back before the card arrives: nothing is painted and no small map is mounted', async () => {
    openExplore('bar')
    await until('.ex-tabs')
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    resetPlaces()
    setPlaceReader(async () => { await gate; return world(base, WORLD) })
    openPlace('en', 'lug:egypt', 'Egypt')
    expect(backExplore()).toBe(true)
    await until('.ex-tabs')
    release()
    await sleep(400)
    expect($('.ex-place-card')).toBeNull()
    expect($('.ex-place')).toBeNull()
    expect($('.place-block')).toBeNull()
    expect(mounts.length).toBe(0)
  })
})
