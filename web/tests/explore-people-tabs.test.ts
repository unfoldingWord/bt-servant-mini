// Browse's people tab (explore.ts, kin.ts; X1 step 2 of plan-explorar-personas-lugares.md): it shows only when a pack's people index
// is built and has people; with one pack's worth of data it is a tab like the others, without subtabs; the chosen tab that goes
// falls back to the first; a person's view whose pack went leaves the stack. Runs on a small stand-in for the page (bun has none).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { installPacks } from './fs-packs'
import { kinFixture } from './fixtures/kin/family'
import { creditLine } from '../src/pipeline'
import { familyOf, KT, onKinReady, peoplePacks, setKinReader, warmKin, type KinReader } from '../src/kin'
import { backExplore, closeExplore, exploreOpen, exploreStale, kinReadyExplore, openExplore, openPerson, redrawExplore, resetExplore, setExploreHooks, XT, type ExploreHooks } from '../src/explore'
import { renderPeopleTab, resetPeopleTab, stopPeopleTab, type PeopleCtx } from '../src/explorepeople'

// ---------------------------------------------------------------------------------------------------- a stand-in page

import { $, $$, doc, FakeEl, installPage, restorePage, sleep, store, until } from './fake-page'

// what the hooks were asked
let packs: string[] = ['en']
let hooksRan: string[] = []
let allowRun = true
const hooks: ExploreHooks = {
  ui: () => 'en', packs: () => packs, packName: (l) => l, addLang: () => {},
  ask: () => true, mode: () => true, ask5: () => true, saved5: () => [], resume5: () => true, run: (l) => { hooksRan.push(l); return allowRun },
}
// the packs that have family data (the others answer as a pack without xtopics: no people)
let family = new Set<string>(['en'])
// (a pack whose people are read when its gate opens: to build the second pack's index while the first one is on screen)
const gates = new Map<string, Promise<void>>()
const readerOf = async (l: string): Promise<KinReader> => {
  if (!family.has(l)) return { ...kinFixture(), people: async () => ({ data: null }) as any }
  const gate = gates.get(l)
  const r = kinFixture()
  return gate ? { ...r, people: async () => { await gate; return r.people() } } : r
}
const setFamily = (l: string[]) => { family = new Set(l); setKinReader(readerOf) }
const gone = async (s: string, ms = 8000) => {
  for (let t = 0; t < ms; t += 20) { if (!$(s)) return; await sleep(20) }
  throw new Error(`still there: ${s}`)
}
const tabNames = () => $$('.ex-tabs button').map((b) => b.textContent)
const selected = () => $$('.ex-tabs button').find((b) => b.getAttribute('aria-selected') === 'true')?.textContent
/** Browse's home is drawn and the idle build of the people indexes is over (warmKin waits for idle: up to 1.5 s without it). */
async function homeReady(want: string[]) {
  openExplore('bar')
  await sleep(100)
  for (let t = 0; t < 8000 && peoplePacks(packs).join() !== want.join(); t += 50) await sleep(50)
  expect(peoplePacks(packs)).toEqual(want)
  await sleep(150) // the redraw the index tells
}

let offKin = () => {}
beforeAll(async () => {
  installPage()
  doc.body.appendChild(Object.assign(new FakeEl('main'), { id: 'log' }))
  setExploreHooks(hooks)
  offKin = onKinReady(kinReadyExplore) // as main.ts does
  await installPacks(['en'])
})
afterAll(() => {
  offKin()
  closeExplore(false)
  resetExplore()
  setKinReader()
  restorePage()
})
beforeEach(() => {
  closeExplore(false)
  resetExplore()
  store.clear()
  packs = ['en']
  hooksRan = []
  allowRun = true
  gates.clear()
  setFamily(['en'])
})

describe('the people tab', () => {
  test('no pack with family data: no tab, only Bible and Academy', async () => {
    setFamily([])
    openExplore('bar')
    await until('.ex-modes .ex-row')
    warmKin(packs)
    await sleep(2200) // past the idle build
    expect(peoplePacks(packs)).toEqual([])
    expect(tabNames()).toEqual(['Bible', 'Translation Academy'])
    expect($('.ex-people')).toBeNull()
  })

  test('with family data it is the third tab, "People"; only the packs with people count, in the order given', async () => {
    packs = ['zz', 'en'] // zz: no data (not even readable as a language)
    await homeReady(['en'])
    expect(tabNames()).toEqual(['Bible', 'Translation Academy', 'People'])
  })

  test('only people on the phone: no tab bar and no subtabs, the people tab itself', async () => {
    packs = ['zz']
    setFamily(['zz'])
    await homeReady(['zz'])
    expect($('.ex-tabs')).toBeNull()
    expect($('.ex-psearch')).not.toBeNull()
  })

  test('the tab chosen is drawn; when it goes, the first one there is', async () => {
    await homeReady(['en'])
    $$('.ex-tabs button').find((b) => b.textContent === 'People')!.click()
    await until('.ex-people')
    expect(selected()).toBe('People')
    // the family data is gone (the packs changed: kin forgets what it built and builds again, now without people)
    setFamily([])
    redrawExplore()
    await gone('.ex-people')
    await until('.ex-books')
    expect(tabNames()).toEqual(['Bible', 'Translation Academy'])
    expect(selected()).toBe('Bible')
    // and it stays on Bible when the people come back (it does not jump to People alone)
    setFamily(['en'])
    warmKin(packs)
    for (let t = 0; t < 4000 && !tabNames().includes('People'); t += 50) await sleep(50)
    expect(tabNames()).toEqual(['Bible', 'Translation Academy', 'People'])
    expect(selected()).toBe('Bible')
  })
})

describe('the list and the search in the tab', () => {
  test('the most named first, a search narrows it, a tap opens the person; the counts are numbers only', async () => {
    store.set('btsm.usage', '1')
    await homeReady(['en'])
    $$('.ex-tabs button').find((b) => b.textContent === 'People')!.click()
    await until('.ex-prows .ex-row')
    expect($$('.ex-prows .ex-row').length).toBeGreaterThan(3)
    expect($$('.ex-prows .ex-row').length).toBeLessThanOrEqual(30)
    const box = $('.ex-psearch')! as any
    box.value = 'isa'
    box.oninput()
    box.value = 'isaa'
    box.oninput() // two keys, one search
    for (let t = 0; t < 4000 && $$('.ex-prows .ex-row').length !== 1; t += 50) await sleep(50)
    const rows = $$('.ex-prows .ex-row')
    expect(rows.length).toBe(1)
    expect(rows[0]!.dataset.id).toBe('per:isaac')
    box.value = 'qqqq'
    box.oninput()
    await until('.ex-pnone')
    box.value = 'isaa'
    box.oninput()
    await until('.ex-prows .ex-row')
    $('.ex-prows .ex-row')!.click()
    await until('.ex-person')
    expect($('.ex-person')!.dataset.id).toBe('per:isaac')
    const days = JSON.parse(store.get('btsm.usage.days') ?? '{}') as Record<string, Record<string, number>>
    const c = Object.values(days)[0] ?? {}
    expect(c['explore.people.open']).toBe(1)
    expect(c['explore.people.search']).toBe(1)
    expect(c['explore.people.person']).toBe(1)
    // Back: the tab with the search as it was
    expect(backExplore()).toBe(true)
    await until('.ex-psearch')
    expect(($('.ex-psearch') as any).value).toBe('isaa')
    // coming back to the tab is not opening it again
    const after = Object.values(JSON.parse(store.get('btsm.usage.days') ?? '{}') as Record<string, Record<string, number>>)[0] ?? {}
    expect(after['explore.people.open']).toBe(1)
  })
})

// the tab drawn by itself, into a box of its own (the reader and the packs as each test gives them)
const people = (n: number): KinReader =>
  ({ people: async () => ({ data: Array.from({ length: n }, (_, i) => ({ id: `per:p${i}`, name: `Mar${i}`, names: [`Mar${i}`], verses: i + 1 })) }) }) as unknown as KinReader
const ctx = (over: Partial<PeopleCtx> = {}): PeopleCtx => ({
  ui: 'en', packs: ['en'], name: (l) => l, chevron: () => doc.createElement('span') as any, onOpen: () => {},
  text: { search: XT('en').pSearch, none: XT('en').pNone, more: XT('en').pMore, fail: XT('en').pFail, loading: XT('en').loading, inLang: XT('en').inLang }, ...over,
})
const drawn: { remove: () => void }[] = [] // (taken off the page after each test: other files look the page up by class)
const draw = (c: PeopleCtx) => {
  const body = doc.createElement('div') as any
  doc.body.appendChild(body)
  drawn.push(body)
  renderPeopleTab(body, c)
  return body as typeof doc.body
}
const type = async (body: typeof doc.body, q: string) => {
  const box = body.querySelector('.ex-psearch') as any
  box.value = q
  box.oninput()
}
const rowsOf = (body: typeof doc.body) => body.querySelectorAll('.ex-prows .ex-row')
const waitRows = async (body: typeof doc.body, n: number) => {
  for (let t = 0; t < 4000 && rowsOf(body).length !== n; t += 25) await sleep(25)
  expect(rowsOf(body).length).toBe(n)
}

describe('the tab by itself', () => {
  beforeEach(() => { resetPeopleTab(); setKinReader(async () => people(45)) })
  afterEach(() => { stopPeopleTab(); for (const b of drawn.splice(0)) b.remove() })
  afterAll(() => { stopPeopleTab(); resetPeopleTab() })

  test('more than 30 matches: 30 rows and the note to keep typing; fewer: no note', async () => {
    const body = draw(ctx())
    await waitRows(body, 30)
    expect(body.querySelector('.ex-pmore')!.textContent).toBe(XT('en').pMore)
    await type(body, 'mar4')
    await waitRows(body, 6) // Mar4, Mar40..Mar44
    expect(body.querySelector('.ex-pmore')).toBeNull()
  })

  test('a slow answer does not overwrite a newer one (the list is read late, two searches typed meanwhile)', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    setKinReader(async () => ({ people: async () => { await gate; return await people(45).people() } }) as unknown as KinReader)
    const body = draw(ctx())
    await sleep(30)
    await type(body, 'mar1')
    await sleep(250) // past the debounce: that search is waiting for the read too
    await type(body, 'mar2')
    await sleep(250)
    release()
    await waitRows(body, 11) // Mar2, Mar20..Mar29: the last one typed, and only it
    expect(rowsOf(body)[0]!.dataset.id).toMatch(/^per:p2/)
    await sleep(100)
    expect(rowsOf(body).length).toBe(11)
  })

  test('the search is forgotten by a change of packs (resetPeopleTab), kept otherwise', async () => {
    let body = draw(ctx())
    await waitRows(body, 30)
    await type(body, 'mar3')
    await sleep(300)
    body = draw(ctx())
    expect((body.querySelector('.ex-psearch') as any).value).toBe('mar3')
    resetPeopleTab()
    body = draw(ctx())
    expect((body.querySelector('.ex-psearch') as any).value).toBe('')
  })

  test('a homonym line says who it is, in the DOM, after the list is drawn', async () => {
    setKinReader(async () => ({ ...kinFixture(), people: async () => ({ data: [
      { id: 'per:isaac', name: 'Judas', names: ['Judas'], verses: 5 }, { id: 'per:esau', name: 'Judas', names: ['Judas'], verses: 3 }, { id: 'per:sarah', name: 'Sara', names: ['Sara'], verses: 9 },
    ] }) }) as unknown as KinReader)
    const body = draw(ctx({ ui: 'es' }))
    await waitRows(body, 3)
    const line = (id: string) => rowsOf(body).find((r) => r.dataset.id === id)!.querySelector('.ex-row-s')!.textContent
    for (let t = 0; t < 3000 && !/(hijo|padre) de/.test(line('per:esau')); t += 25) await sleep(25)
    expect(line('per:isaac')).toMatch(/(hijo|padre) de/)
    expect(line('per:esau')).toMatch(/(hijo|padre) de/)
    expect(line('per:sarah')).not.toMatch(/(hijo|padre) de/) // not a homonym: the verses only
  })

  test('Arabic: the box takes the direction of what is typed, the rows run right to left', async () => {
    const body = draw(ctx({ ui: 'ar' }))
    await waitRows(body, 30)
    expect((body.querySelector('.ex-psearch') as any).dir).toBe('auto')
    expect((body.querySelector('.ex-prows') as any).dir).toBe('rtl')
  })

  test('a list that cannot be read says so (not "nobody with that name")', async () => {
    setKinReader(async () => ({ people: async () => { throw new Error('boom') } }) as unknown as KinReader)
    const body = draw(ctx())
    for (let t = 0; t < 3000 && !body.querySelector('.ex-pfail'); t += 25) await sleep(25)
    expect(body.querySelector('.ex-pfail')!.textContent).toBe(XT('en').pFail)
    expect(body.querySelector('.ex-pnone')).toBeNull()
  })

  test('drawing something else lets go of the debounce: nothing is searched later', async () => {
    const body = draw(ctx())
    await waitRows(body, 30)
    await type(body, 'mar4')
    stopPeopleTab() // Browse drew another view
    await sleep(400)
    expect(rowsOf(body).length).toBe(30) // the list of before: the search did not run
  })
})

describe('after a change of packs', () => {
  test('Browse open with its stack emptied (resetExplore) is drawn again as its home', async () => {
    await homeReady(['en'])
    resetExplore() // as onPacksChanged does
    expect(exploreStale()).toBe(true)
    redrawExplore() // as refreshInstalled does when the list is the same but the stack was emptied
    await sleep(150)
    expect(exploreStale()).toBe(false)
    expect(tabNames()).toEqual(['Bible', 'Translation Academy', 'People'])
    expect(backExplore()).toBe(true) // the home alone: Back closes
  })
})

/** A name in the tree drawn (its button), tapped: its bar opens under it; the bar's buttons are returned once they are there. */
const tapName = async (name: string) => {
  const b = $$('.tv-name').find((x) => x.textContent.includes(name))
  if (!b) throw new Error(`no name ${name} in the tree`)
  b.click()
  for (let t = 0; t < 4000 && !$('.tv-bar button'); t += 25) await sleep(25)
  return $$('.tv-bar button')
}
const personOpen = async (id: string) => {
  for (let t = 0; t < 4000 && $('.ex-person')?.dataset.id !== id; t += 25) await sleep(25)
  expect($('.ex-person')!.dataset.id).toBe(id)
  await until('.ex-person .tv')
}

describe('the person view draws the family tree', () => {
  test('Abraham: the notice and the credit line, Isaac, then Esau, and Back twice is Abraham again, one view at a time', async () => {
    store.set('btsm.usage', '1')
    await homeReady(['en'])
    openPerson('en', 'per:abraham')
    await personOpen('per:abraham')
    expect($('.tv-note')!.textContent.length).toBeGreaterThan(10)
    expect($('.credit')!.textContent).toMatch(/TIPNR/)
    // the title is the person's name once the tree has it (setTitle)
    for (let t = 0; t < 2000 && $('.ex-title')?.textContent !== 'Abraham'; t += 25) await sleep(25)
    expect($('.ex-title')!.textContent).toBe('Abraham')
    // the credit line is the one the chat gives a tree (the sources the data names: TIPNR and ACAI in the fixture)
    const sources = (await familyOf('en', 'per:abraham')).data!.sources
    expect(sources.length).toBeGreaterThan(1)
    expect($('.credit')!.textContent).toBe(creditLine('en', sources).replace(/^\*|\*$/g, ''))
    expect($('.credit')!.textContent).toMatch(/ACAI/)
    // Isaac's bar: his tree button opens him here
    let bar = await tapName('Isaac')
    expect(bar.map((b) => b.dataset.kind)).toContain('tree')
    bar.find((b) => b.dataset.kind === 'tree')!.click()
    await personOpen('per:isaac')
    bar = await tapName('Esa')
    bar.find((b) => b.dataset.kind === 'tree')!.click()
    await personOpen('per:esau')
    // Back: Isaac, then Abraham
    expect(backExplore()).toBe(true)
    await personOpen('per:isaac')
    expect(backExplore()).toBe(true)
    await personOpen('per:abraham')
    const days = JSON.parse(store.get('btsm.usage.days') ?? '{}') as Record<string, Record<string, number>>
    expect((Object.values(days)[0] ?? {})['explore.people.person']).toBe(3) // one per view opened
    expect(hooksRan).toEqual([]) // nothing ran in the chat
  })

  test('the person, the verse and the story run in the chat (hooks.run); Browse closes, a busy chat leaves it open with the note', async () => {
    store.set('btsm.usage', '1')
    await homeReady(['en'])
    openPerson('en', 'per:abraham')
    await personOpen('per:abraham')
    const bar = await tapName('Isaac')
    const kinds = bar.map((b) => b.dataset.kind)
    expect(kinds).toContain('person')
    expect(kinds).toContain('verse')
    allowRun = false
    bar.find((b) => b.dataset.kind === 'verse')!.click()
    await sleep(50)
    expect(hooksRan.length).toBe(1)
    expect($('.ex-busy')).not.toBeNull()
    expect(exploreOpen()).toBe(true)
    allowRun = true
    bar.find((b) => b.dataset.kind === 'person')!.click()
    await sleep(50)
    expect(hooksRan.length).toBe(2)
    expect(exploreOpen()).toBe(false)
    const days = JSON.parse(store.get('btsm.usage.days') ?? '{}') as Record<string, Record<string, number>>
    expect((Object.values(days)[0] ?? {})['explore.people.toChat']).toBe(1) // only the one that ran
  })

  test('the ancestors button of the tree opens the line of ancestors here', async () => {
    await homeReady(['en'])
    openPerson('en', 'per:isaac')
    await personOpen('per:isaac')
    const up = $$('.tv-top button').find((b) => b.dataset.kind === 'up')
    expect(up).toBeTruthy()
    up!.click()
    await until('.ex-person[data-mode="up"]')
    expect($('.ex-person')!.dataset.id).toBe('per:isaac')
  })

  test('a person with no relations: the empty notice, and Back still there', async () => {
    await homeReady(['en'])
    openPerson('en', 'per:nobody')
    await until('.ex-pempty')
    expect(backExplore()).toBe(true)
    await until('.ex-tabs')
  })

  test('a family that cannot be read says so', async () => {
    await homeReady(['en'])
    setKinReader(async () => ({ ...kinFixture(), people: async () => { throw new Error('boom') }, mapsOf: async () => { throw new Error('boom') } }) as unknown as KinReader)
    openPerson('en', 'per:abraham')
    await until('.ex-pfail')
    expect($('.ex-pfail')!.textContent).toBe(XT('en').pTreeFail)
    expect(backExplore()).toBe(true)
  })

  test('the pack goes with the tree on screen: the view leaves, Browse is not broken', async () => {
    packs = ['en', 'zz']
    setFamily(['en', 'zz'])
    await homeReady(['en', 'zz'])
    openPerson('zz', 'per:abraham')
    await personOpen('per:abraham')
    packs = ['en']
    redrawExplore()
    await sleep(200)
    expect($('.ex-person')).toBeNull()
    expect($('.ex-tabs')).not.toBeNull()
  })
})

describe('the second pack’s people are read while Browse is on screen', () => {
  const second = async () => {
    packs = ['en', 'zz']
    let open!: () => void
    gates.set('zz', new Promise<void>((r) => { open = r }))
    setFamily(['en', 'zz'])
    await homeReady(['en'])
    return async () => {
      open()
      for (let t = 0; t < 8000 && peoplePacks(packs).length < 2; t += 50) await sleep(50)
      expect(peoplePacks(packs)).toEqual(['en', 'zz'])
      await sleep(200)
    }
  }
  test('on the Bible tab: the home is not drawn again (the scroll stays)', async () => {
    const release = await second()
    const body = $('.ex-body')!
    body.scrollTop = 123
    const tabs = $('.ex-tabs')
    await release()
    expect(body.scrollTop).toBe(123)
    expect($('.ex-tabs')).toBe(tabs) // the same element: not drawn again
  })
  test('on the people tab: what is typed stays, the box is the same, the new pack’s people join the search', async () => {
    const release = await second()
    $$('.ex-tabs button').find((b) => b.textContent === 'People')!.click()
    await until('.ex-prows .ex-row')
    const box = $('.ex-psearch') as any
    box.value = 'isa'
    box.oninput()
    await sleep(400)
    await release()
    expect($('.ex-psearch')).toBe(box)
    expect(box.value).toBe('isa')
    // (the search ran again with both packs: the same fixture, so a person is shown once, from the first pack)
    expect($$('.ex-prows .ex-row').filter((r) => r.dataset.id === 'per:isaac').length).toBe(1)
  })
})

describe('a person the data names only by a raw name', () => {
  test('opened from a tree button (no row name): the tree’s «(sin nombre)», never the raw id', async () => {
    setKinReader(async () => ({ ...kinFixture(), people: async () => ({ data: [{ id: 'per:isaac', name: 'a_wife_of_Lot', names: ['a_wife_of_Lot'], verses: 2 }] }) }) as unknown as KinReader)
    await homeReady(['en'])
    openPerson('en', 'per:isaac')
    await until('.ex-person .tv')
    await sleep(100)
    const shown = $('.ex-title')!.textContent + ' | ' + $('.tv-box.focus')!.textContent
    expect(shown).not.toMatch(/a_wife_of_Lot|per:|isaac/i)
    expect(shown).toContain(KT('en').unnamed)
  })
  test('the row shows an alias; its view is titled with it, and the tree names them so', async () => {
    setKinReader(async () => ({ ...kinFixture(), people: async () => ({ data: [
      { id: 'per:isaac', name: 'Unnamed#1', names: ['Unnamed#1', 'Ysaac'], verses: 5 }, { id: 'per:sarah', name: 'Sara', names: ['Sara'], verses: 9 },
    ] }) }) as unknown as KinReader)
    await homeReady(['en'])
    $$('.ex-tabs button').find((b) => b.textContent === 'People')!.click()
    await until('.ex-prows .ex-row')
    const box = $('.ex-psearch') as any
    box.value = 'ysa'
    box.oninput()
    const row = await until('.ex-prows .ex-row[data-id="per:isaac"]')
    expect(row.querySelector('.ex-row-t')!.textContent).toBe('Ysaac')
    row.click()
    await until('.ex-person')
    expect($('.ex-title')!.textContent).toBe('Ysaac') // at once: the row's name
    await until('.ex-person .tv')
    expect($('.ex-title')!.textContent).toBe('Ysaac')
    expect($('.tv-box.focus')!.textContent).toContain('Ysaac')
    expect($('.tv-box.focus')!.textContent).not.toContain('sin nombre')
  })
})

describe('the person view', () => {
  test('it is drawn on top of the home, and Back takes off one view at a time', async () => {
    await homeReady(['en'])
    openPerson('en', 'per:abraham')
    await until('.ex-person')
    openPerson('en', 'per:isaac')
    await sleep(100)
    expect($('.ex-person')!.dataset.id).toBe('per:isaac')
    expect(backExplore()).toBe(true)
    await sleep(100)
    expect($('.ex-person')!.dataset.id).toBe('per:abraham')
    expect(backExplore()).toBe(true)
    await until('.ex-modes .ex-row')
    expect($('.ex-person')).toBeNull()
  })

  test('its pack leaves the phone: the view leaves the stack, the others stay', async () => {
    packs = ['en', 'zz']
    setFamily(['en', 'zz'])
    await homeReady(['en', 'zz'])
    openPerson('en', 'per:abraham')
    openPerson('zz', 'per:isaac')
    await sleep(100)
    expect($('.ex-person')!.dataset.pack).toBe('zz')
    packs = ['en']
    redrawExplore() // (in the app: resetExplore empties the stack first, then refreshInstalled calls this with the new list)
    await sleep(100)
    expect($('.ex-person')!.dataset.pack).toBe('en') // the zz one left, the en one is the top now
    // after resetExplore: the stack is empty, Browse is on its home with the new list
    resetExplore()
    redrawExplore()
    await sleep(100)
    expect($('.ex-person')).toBeNull()
    expect($('.ex-tabs')).not.toBeNull()
  })

  test('the draw guard alone: a person of a pack that is not on the phone is not drawn', async () => {
    await homeReady(['en'])
    openPerson('zz', 'per:abraham') // (nothing pruned it first)
    await sleep(200)
    expect($('.ex-person')).toBeNull()
    expect($('.ex-tabs')).not.toBeNull()
  })

  test('a null or unrelated index does not redraw the home (the scroll stays)', async () => {
    await homeReady(['en'])
    const body = $('.ex-body') ?? $('.ex-tabs')!.parentElement!
    body.scrollTop = 123
    kinReadyExplore() // nothing changed since the last draw
    await sleep(100)
    expect(body.scrollTop).toBe(123)
  })

  test('the real event of a null index (a pack without people built) does not redraw the home either', async () => {
    await homeReady(['en'])
    const body = $('.ex-body') ?? $('.ex-tabs')!.parentElement!
    packs = ['en', 'zz']
    let told = 0
    const off = onKinReady(() => { told++ })
    body.scrollTop = 123
    warmKin(packs) // builds zz: no people, null
    for (let t = 0; t < 6000 && !told; t += 50) await sleep(50)
    off()
    expect(told).toBe(1)
    await sleep(100)
    expect(peoplePacks(packs)).toEqual(['en'])
    expect(body.scrollTop).toBe(123)
  })

  test('closed meanwhile (the stack is kept): opening Browse again checks the packs too', async () => {
    await homeReady(['en'])
    openPerson('en', 'per:abraham')
    await until('.ex-person')
    closeExplore(false)
    packs = ['zz']
    openExplore('bar') // (openExplore prunes before drawing: the person view is never drawn)
    await sleep(300)
    expect($('.ex-person')).toBeNull()
    expect(backExplore()).toBe(true) // it was the home (one view): Back closes Browse
  })
})
