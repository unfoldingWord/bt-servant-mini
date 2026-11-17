// The "Guided modes" section of Browse (explore.ts, modes.ts) and the 5M view: which modes show with the dev switch, Open Bible
// Stories, Translation Academy, books and no packs; a tap on a story asks for "5M OBS 1"; a mode tapped while an answer is on its
// way says so and does nothing else; Arabic rows run right to left; the usage counts are numbers only. Runs on a small stand-in
// for the page (bun has none).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { ALL_PACKS, installPacks } from './fs-packs'
import { withObs } from './obs-fixture'
import { closeExplore, exploreOpen, openExplore, openExploreAt, resetExplore, setExploreHooks, backExplore, type ExploreHooks } from '../src/explore'
import { fiveText, MT, modeTitle } from '../src/modes'
import { forgetSessions, saveSession, savedSessions } from '../src/obs5mstore'
import { loadFixture } from '../src/dev'
import { W5 } from '../src/obs5mwords'
import { resetFixture5 } from '../src/pipeline'

// ---------------------------------------------------------------------------------------------------- a stand-in page

type Sel = { tag?: string; id?: string; cls: string[]; attr?: [string, string] }
const parse = (s: string): Sel[][] => s.split(',').map((g) => g.trim().split(/\s+/).map((c) => {
  const m = /^([a-z0-9]+)?(?:#([\w-]+))?((?:\.[\w-]+)*)(?:\[([\w-]+)="([^"]*)"\])?$/i.exec(c)
  if (!m) throw new Error(`selector not supported here: ${c}`)
  return { tag: m[1], id: m[2], cls: (m[3] ?? '').split('.').filter(Boolean), attr: m[4] ? [m[4], m[5]!] : undefined }
}))
class FakeEl {
  tagName: string; id = ''; className = ''; children: FakeEl[] = []; parentElement: FakeEl | null = null
  dataset: Record<string, string> = {}; attrs = new Map<string, string>(); dir = ''; inert = false; disabled = false; tabIndex = 0
  type = ''; onclick: ((e: unknown) => void) | null = null; style: Record<string, string> = {}; text = ''; scrollTop = 0
  constructor(tag: string) { this.tagName = tag.toUpperCase() }
  get classList() {
    const set = () => new Set(this.className.split(/\s+/).filter(Boolean))
    const put = (s: Set<string>) => { this.className = [...s].join(' ') }
    return {
      add: (...c: string[]) => { const s = set(); c.forEach((x) => s.add(x)); put(s) },
      remove: (...c: string[]) => { const s = set(); c.forEach((x) => s.delete(x)); put(s) },
      contains: (c: string) => set().has(c),
      toggle: (c: string) => { const s = set(); const on = !s.has(c); if (on) s.add(c); else s.delete(c); put(s); return on },
    }
  }
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join('') }
  set textContent(v: string) { this.replaceChildren(); this.text = v }
  set innerHTML(_v: string) { this.replaceChildren() }
  appendChild(c: FakeEl) { c.remove(); c.parentElement = this; this.children.push(c); return c }
  append(...cs: FakeEl[]) { for (const c of cs) this.appendChild(c) }
  prepend(c: FakeEl) { c.remove(); c.parentElement = this; this.children.unshift(c) }
  replaceChildren(...cs: FakeEl[]) { for (const c of this.children) c.parentElement = null; this.children = []; this.text = ''; this.append(...cs) }
  remove() { const p = this.parentElement; if (p) { p.children = p.children.filter((x) => x !== this); this.parentElement = null } }
  contains(o: unknown): boolean { let x = o as FakeEl | null; while (x) { if (x === this) return true; x = x.parentElement } return false }
  get childElementCount() { return this.children.length }
  setAttribute(k: string, v: string) { this.attrs.set(k, String(v)) }
  getAttribute(k: string) { return this.attrs.get(k) ?? null }
  focus() { doc.activeElement = this }
  click() { this.onclick?.({ target: this }) }
  private is(s: Sel): boolean {
    if (s.tag && this.tagName !== s.tag.toUpperCase()) return false
    if (s.id && this.id !== s.id) return false
    if (s.cls.some((c) => !this.classList.contains(c))) return false
    if (s.attr && (s.attr[0].startsWith('data-') ? this.dataset[s.attr[0].slice(5)] : this.getAttribute(s.attr[0])) !== s.attr[1]) return false
    return true
  }
  matches(sel: string) {
    return parse(sel).some((chain) => {
      if (!this.is(chain[chain.length - 1]!)) return false
      let i = chain.length - 2
      for (let a = this.parentElement; a && i >= 0; a = a.parentElement) if (a.is(chain[i]!)) i--
      return i < 0
    })
  }
  querySelectorAll(sel: string): FakeEl[] {
    const out: FakeEl[] = []
    const walk = (e: FakeEl) => { for (const c of e.children) { if (c.matches(sel)) out.push(c); walk(c) } }
    walk(this)
    return out
  }
  querySelector(sel: string) { return this.querySelectorAll(sel)[0] ?? null }
}
const listeners = new Set<(e: unknown) => void>()
const doc = {
  body: new FakeEl('body'), activeElement: null as FakeEl | null,
  createElement: (t: string) => new FakeEl(t),
  createTextNode: (t: string) => Object.assign(new FakeEl('#text'), { text: t }),
  querySelector: (s: string) => doc.body.querySelector(s),
  addEventListener: (_t: string, f: (e: unknown) => void) => listeners.add(f),
  removeEventListener: (_t: string, f: (e: unknown) => void) => listeners.delete(f),
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const $ = (s: string) => doc.querySelector(s)
const $$ = (s: string) => doc.body.querySelectorAll(s)
async function until(s: string, ms = 8000): Promise<FakeEl> {
  for (let t = 0; t < ms; t += 20) { const e = $(s); if (e) return e; await sleep(20) }
  throw new Error(`never showed: ${s}`)
}
const store = new Map<string, string>()
const fake = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k), key: () => null, length: 0,
}
const saved = { localStorage: (globalThis as any).localStorage, document: (globalThis as any).document, MutationObserver: (globalThis as any).MutationObserver, HTMLElement: (globalThis as any).HTMLElement }

// what the hooks were asked
let packs: string[] = ['en']
let ui = 'en'
let allow = true
let did: { mode: string[]; ask5: number[]; resume: number[]; ask: string[] } = { mode: [], ask5: [], resume: [], ask: [] }
const hooks: ExploreHooks = {
  ui: () => ui, packs: () => packs, packName: (l) => l, addLang: () => {},
  ask: (label) => { did.ask.push(label); return allow },
  mode: (id) => { did.mode.push(id); if (allow) closeExplore(false); return allow },
  ask5: (n) => { did.ask5.push(n); return allow },
  saved5: () => savedSessions(),
  resume5: (e) => { did.resume.push(e.story); return allow },
}
const on = () => store.set('btsm.dev.obs5m', '1')
const off = () => store.delete('btsm.dev.obs5m')
const counts = (): Record<string, number> => {
  const days = JSON.parse(store.get('btsm.usage.days') ?? '{}') as Record<string, Record<string, number>>
  return Object.values(days)[0] ?? {}
}

beforeAll(async () => {
  ;(globalThis as any).localStorage = fake
  ;(globalThis as any).document = doc
  ;(globalThis as any).HTMLElement = FakeEl
  ;(globalThis as any).MutationObserver = class { observe() {} }
  doc.body.appendChild(Object.assign(new FakeEl('main'), { id: 'log' }))
  setExploreHooks(hooks)
  await installPacks(ALL_PACKS)
  await withObs('en', 'installed')
})
afterAll(() => {
  closeExplore(false)
  ;(globalThis as any).localStorage = saved.localStorage
  ;(globalThis as any).document = saved.document
  ;(globalThis as any).MutationObserver = saved.MutationObserver
  ;(globalThis as any).HTMLElement = saved.HTMLElement
})
beforeEach(() => {
  closeExplore(false)
  resetExplore()
  resetFixture5()
  store.clear()
  store.set('btsm.usage', '1')
  packs = ['en']; ui = 'en'; allow = true
  did = { mode: [], ask5: [], resume: [], ask: [] }
})
const modeIds = () => $$('.ex-modes .ex-row').map((r) => r.dataset.mode)

describe('the section on Browse’s home', () => {
  test('the switch off: the two modes of the welcome, in their own section, over the tabs', async () => {
    openExplore('bar')
    await until('.ex-modes .ex-row')
    expect(modeIds()).toEqual(['book', 'learn'])
    expect($('.ex-body .ex-sub')!.textContent).toBe(MT('en').section)
    const rows = $$('.ex-modes .ex-row')
    expect(rows[0]!.textContent).toContain(MT('en').book)
    expect(rows[1]!.textContent).toContain(MT('en').learn)
    // no 5M row, and nothing of it anywhere
    expect($('.ex-row[data-mode="obs5m"]')).toBeNull()
    expect($$('.ex-modes .ex-mode-m').length).toBe(2) // the drawn mark of each row
  })
  test('the switch on: the 5M row as the third, named as a test', async () => {
    on()
    openExplore('bar')
    await until('.ex-modes .ex-row')
    expect(modeIds()).toEqual(['book', 'learn', 'obs5m'])
    expect($('.ex-row[data-mode="obs5m"]')!.textContent).toContain(modeTitle('en', 'obs5m', { source: 'test', obs: true, stories: [{ story: 1 } as any] }))
    expect($('.ex-row[data-mode="obs5m"]')!.textContent).toContain('(test)')
  })
  test('Open Bible Stories are not a mode: their row is the Bible tab’s, with or without them the modes are the same', async () => {
    await withObs('en', 'none')
    openExplore('bar')
    await until('.ex-modes .ex-row')
    expect(modeIds()).toEqual(['book', 'learn'])
    expect($('.ex-obs')).toBeNull()
    closeExplore(false)
    await withObs('en', 'installed')
    resetExplore()
    openExplore('bar')
    await until('.ex-obs')
    expect(modeIds()).toEqual(['book', 'learn'])
  })
  test('no language on the phone: Browse’s "no language" and no section', async () => {
    packs = []
    openExplore('bar')
    await until('.ex-pill')
    expect($('.ex-modes')).toBeNull()
    expect(modeIds()).toEqual([])
  })
  test('the section is there with either tab (books and manuals both on the phone)', async () => {
    openExplore('bar')
    await until('.ex-modes .ex-row')
    const tabs = $$('.ex-tabs button')
    expect(tabs.length).toBe(2)
    tabs[1]!.click() // Translation Academy
    await until('.ex-rows .ex-row-s')
    await sleep(50)
    expect(modeIds()).toEqual(['book', 'learn'])
  })
  test('Arabic: the rows run right to left, and the marks are drawings (not the characters ▶ ›)', async () => {
    ui = 'ar'
    packs = ['ar']
    on()
    openExplore('bar')
    await until('.ex-modes .ex-row')
    expect($('.ex-modes')!.dir).toBe('rtl')
    expect($('.ex-body .ex-sub')!.textContent).toBe(MT('ar').section)
    expect(modeIds().length).toBeGreaterThanOrEqual(2)
    for (const r of $$('.ex-modes .ex-row')) {
      expect(r.textContent).not.toContain('▶')
      expect(r.textContent).not.toContain('›')
    }
    // the 5M's name keeps "OBS 5M" in one piece inside the Arabic line (isolated, as bidiLabel does)
    const t = $('.ex-row[data-mode="obs5m"] .ex-row-t')!.textContent
    expect(t).toContain('OBS 5M')
    expect(/[⁦-⁩]OBS 5M[⁦-⁩]/.test(t)).toBe(true)
  })
  test('English: the rows run left to right', async () => {
    openExplore('bar')
    await until('.ex-modes .ex-row')
    expect($('.ex-modes')!.dir).toBe('ltr')
  })
})

describe('a mode’s tap', () => {
  test('"Translate a book" and "Learn to translate": the hook is asked, once; no answer on its way: Browse is closed for the welcome, counted as a number', async () => {
    openExplore('bar')
    await until('.ex-modes .ex-row')
    $('.ex-row[data-mode="book"]')!.click()
    expect(did.mode).toEqual(['book'])
    expect(exploreOpen()).toBe(false)
    expect(counts()['explore.mode.book']).toBe(1)
    openExplore('bar')
    await until('.ex-modes .ex-row')
    $('.ex-row[data-mode="learn"]')!.click()
    expect(did.mode).toEqual(['book', 'learn'])
    expect(counts()['explore.mode.learn']).toBe(1)
    // only numbers: the counts hold names of counters, never text
    expect(Object.keys(counts()).every((k) => /^[a-z0-9.]+$/.test(k))).toBe(true)
  })
  test('with an answer on its way: the note "An answer is on its way", Browse stays open, and nothing else happens', async () => {
    allow = false
    openExplore('bar')
    await until('.ex-modes .ex-row')
    for (const id of ['book', 'learn']) {
      $(`.ex-row[data-mode="${id}"]`)!.click()
      expect(exploreOpen()).toBe(true)
      expect($('.ex-busy')!.textContent).toBe('An answer is on its way: tap again when it is here.')
      expect($('.ex-busy')!.getAttribute('role')).toBe('status')
    }
    expect(counts()['explore.mode.book']).toBeUndefined()
    expect(counts()['explore.mode.learn']).toBeUndefined()
    expect(counts()['explore.answer']).toBeUndefined()
    expect($$('.ex-busy').length).toBe(1) // not piled up
  })
  test('"Translate a book" does not touch the welcome’s memory: Browse only asks the hook (which opens it with `at`)', async () => {
    store.set('btsm.welcome.v1', JSON.stringify({ door: 'look' }))
    openExplore('bar')
    await until('.ex-modes .ex-row')
    $('.ex-row[data-mode="learn"]')!.click()
    expect(store.get('btsm.welcome.v1')).toBe(JSON.stringify({ door: 'look' }))
  })
})

describe('the 5M view', () => {
  test('the row opens it: the explanation, the story, the note that only story 1 is there, and Back to Browse’s home', async () => {
    on()
    openExplore('bar')
    await until('.ex-modes .ex-row')
    $('.ex-row[data-mode="obs5m"]')!.click()
    await until('.ex-five .ex-row')
    expect($('#ex-title')?.textContent ?? $('.ex-title')!.textContent).toBe(MT('en').five)
    const body = $('.ex-body')!.textContent
    expect(body).toContain(MT('en').intro)
    expect(body).toContain(MT('en').stories)
    expect(body).toContain(MT('en').onlyOne)
    expect($$('.ex-five .ex-row').length).toBe(1)
    expect($('.ex-row[data-story="1"] .ex-row-t')!.textContent.startsWith('OBS 1:')).toBe(true)
    expect(counts()['explore.mode.obs5m']).toBe(1)
    backExplore()
    await until('.ex-modes .ex-row')
    expect(exploreOpen()).toBe(true)
  })
  test('a tap on the story asks for exactly the text "5M OBS 1", closes Browse, and counts', async () => {
    on()
    openExploreAt({ mode: 'obs5m' })
    await until('.ex-row[data-story="1"]')
    $('.ex-row[data-story="1"]')!.click()
    expect(did.ask5).toEqual([1])
    expect(fiveText(did.ask5[0]!)).toBe('5M OBS 1')
    expect(exploreOpen()).toBe(false)
    expect(counts()['explore.mode.obs5m']).toBe(2) // the view opened (1) and the story (1)
    expect(counts()['explore.answer']).toBe(1)
    expect(did.ask).toEqual([]) // not asked as a ready sheet: it goes the way typing goes
  })
  test('a story tapped with an answer on its way: the busy note, still open, no count of a session', async () => {
    on()
    openExploreAt({ mode: 'obs5m' })
    await until('.ex-row[data-story="1"]')
    allow = false
    $('.ex-row[data-story="1"]')!.click()
    expect(exploreOpen()).toBe(true)
    expect($('.ex-busy')).not.toBeNull()
    expect(counts()['explore.answer']).toBeUndefined()
    expect(counts()['explore.mode.obs5m']).toBe(1)
  })
  test('without Open Bible Stories on the phone it says what is missing; with them it does not', async () => {
    on()
    await withObs('en', 'none')
    openExploreAt({ mode: 'obs5m' })
    await until('.ex-row[data-story="1"]')
    expect($('.ex-body')!.textContent).toContain(MT('en').noObs)
    closeExplore(false)
    await withObs('en', 'installed')
    openExploreAt({ mode: 'obs5m' })
    await until('.ex-row[data-story="1"]')
    expect($('.ex-body')!.textContent).not.toContain(MT('en').noObs)
  })
  test('a saved session: [Resume] on top, the same call as the welcome’s, at most 3', async () => {
    on()
    const fx = await loadFixture()
    forgetSessions()
    saveSession('c1', { ...sheetOfSession(fx) })
    openExploreAt({ mode: 'obs5m' })
    await until('.ex-row[data-resume="1"]')
    expect($('.ex-row[data-resume="1"]')!.textContent).toContain(W5('en').resume.split(' ')[0]!)
    $('.ex-row[data-resume="1"]')!.click()
    expect(did.resume).toEqual([1])
    expect(exploreOpen()).toBe(false)
    forgetSessions()
  })
  test('a resume refused (an answer on its way): the busy note', async () => {
    on()
    const fx = await loadFixture()
    forgetSessions()
    saveSession('c1', { ...sheetOfSession(fx) })
    openExploreAt({ mode: 'obs5m' })
    await until('.ex-row[data-resume="1"]')
    allow = false
    $('.ex-row[data-resume="1"]')!.click()
    expect(exploreOpen()).toBe(true)
    expect($('.ex-busy')).not.toBeNull()
    forgetSessions()
  })
  test('Arabic: the view is right to left, "OBS 1" aside the Arabic words', async () => {
    ui = 'ar'
    packs = ['ar']
    on()
    openExploreAt({ mode: 'obs5m' })
    await until('.ex-row[data-story="1"]')
    expect($$('.ex-five').every((r) => r.dir === 'rtl')).toBe(true)
    expect($('.ex-body')!.textContent).toContain(MT('ar').intro)
    expect($('.ex-body')!.textContent).toContain(MT('ar').onlyOne)
  })
  test('from the welcome: Browse opens on the 5M view, counted as coming from the welcome', async () => {
    on()
    openExploreAt({ mode: 'obs5m', from: 'welcome' })
    await until('.ex-row[data-story="1"]')
    expect(counts()['explore.from.welcome']).toBe(1)
    expect(counts()['explore.from.answer']).toBeUndefined()
  })
})
describe('the modes list (the empty conversation, Start a mode)', () => {
  test('Browse opens on the modes alone, the same rows as the section, and Back goes to the home', async () => {
    on()
    openExploreAt({ mode: 'list', from: 'welcome' })
    await until('.ex-modes .ex-row')
    expect(modeIds()).toEqual(['book', 'learn', 'obs5m'])
    expect($('.ex-tabs')).toBeNull() // the list only: no tabs, no books
    expect($('#ex-title')?.textContent ?? $('.ex-title')!.textContent).toBe(MT('en').section)
    expect(backExplore()).toBe(true)
    await until('.ex-tabs')
    expect(modeIds()).toEqual(['book', 'learn', 'obs5m'])
  })
  test('a row there opens its mode as on the home, and Arabic runs right to left', async () => {
    openExploreAt({ mode: 'list', from: 'welcome' })
    await until('.ex-modes .ex-row')
    $$('.ex-modes .ex-row')[0]!.click()
    expect(did.mode).toEqual(['book'])
    closeExplore(false)
    resetExplore()
    ui = 'ar'
    packs = ['ar']
    openExploreAt({ mode: 'list', from: 'welcome' })
    await until('.ex-modes .ex-row')
    expect($('.ex-modes')!.dir).toBe('rtl')
  })
})
function sheetOfSession(_fx: Awaited<ReturnType<typeof loadFixture>>) {
  return { story: 1, part: 'm1' as const, at: 2, lang: 'en', tfLang: 'en' as const, started: Date.now(), done: [] }
}
