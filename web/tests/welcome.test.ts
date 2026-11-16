// The welcome "What would you like to do today?" (welcome.ts) and the learning path (learn.ts): each door leads where it says
// with the packs there are (a book's light path; Translation Academy in the manuals' order, with a verse to try; the chat with How
// to ask; Browse), no suggested article is missing from the pack, Skip and "Start over" work, it shows once and never next to
// How to ask's invitation, and a storage that throws is handled. The screen runs on a small stand-in for the page (bun has none).
import { test, expect, beforeAll, afterAll } from 'bun:test'
import { ALL_PACKS, installPacks, OLD_PACKS_DIR, usePacksDir } from './fs-packs'
import { turn } from './harness'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { type Answer, LT, learnSeq, learnStep, levelOf, resetLearn, START, startOf, TRIPS, tryVerse } from '../src/learn'
import { bookStart, closeWelcome, forgetWelcome, offerFirst, openWelcome, setWelcomeHooks, translatingText, welcomeDue, welcomeSaved, WT } from '../src/welcome'
import { closeHowto, endInvite, forgetHowto, setHowtoHooks } from '../src/howto'
import { manualArticles } from '../src/explore'
import { openLang, CANON } from '../src/packs'
import { booksOf } from '../src/suggest'
import { newGraph } from '../src/graph'
import { answer, type ConvState, pathStart } from '../src/pipeline'
import type { Sheet } from '../src/answer'

const UIS = ['en', 'es', 'fr', 'id', 'hi', 'ar']
/** The pack of each app language (French has none here: an English pack, as a French phone would answer from) */
const PACK: Record<string, string> = { en: 'en', es: 'es-419', fr: 'en', id: 'id', hi: 'hi', ar: 'ar' }
const PHONES = UIS.map((ui) => [ui, PACK[ui]!] as const).filter(([, p]) => ALL_PACKS.includes(p))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const article = (id: string, lang: string): Sheet =>
  ({ id: 'x', intent: 'article', concept: id, lang, ref: null, what: [], version: null, term: null, phrase: null, candidates: null })

// ---------------------------------------------------------------------------------------------------- a stand-in page

type Sel = { tag?: string; id?: string; cls: string[]; attr?: [string, string]; notDisabled?: boolean }
const parse = (s: string): Sel[][] => s.split(',').map((g) => g.trim().split(/\s+/).map((c) => {
  const m = /^([a-z0-9]+)?(?:#([\w-]+))?((?:\.[\w-]+)*)(?:\[([\w-]+)="([^"]*)"\])?(:not\(:disabled\))?$/i.exec(c)
  if (!m) throw new Error(`selector not supported here: ${c}`)
  return { tag: m[1], id: m[2], cls: (m[3] ?? '').split('.').filter(Boolean), attr: m[4] ? [m[4], m[5]!] : undefined, notDisabled: !!m[6] }
}))
class FakeEl {
  tagName: string; id = ''; className = ''; children: FakeEl[] = []; parentElement: FakeEl | null = null
  dataset: Record<string, string> = {}; attrs = new Map<string, string>(); dir = ''; inert = false; disabled = false; tabIndex = 0
  type = ''; onclick: ((e: unknown) => void) | null = null; onkeydown: unknown = null; style: Record<string, string> = {}; text = ''
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
  replaceChildren(...cs: FakeEl[]) { for (const c of this.children) c.parentElement = null; this.children = []; this.text = ''; this.append(...cs) }
  remove() { const p = this.parentElement; if (p) { p.children = p.children.filter((x) => x !== this); this.parentElement = null } }
  get isConnected(): boolean { let x: FakeEl | null = this; while (x) { if (x === doc.body) return true; x = x.parentElement } return false }
  contains(o: unknown): boolean { let x = o as FakeEl | null; while (x) { if (x === this) return true; x = x.parentElement } return false }
  get childElementCount() { return this.children.length }
  get lastElementChild() { return this.children[this.children.length - 1] ?? null }
  setAttribute(k: string, v: string) { this.attrs.set(k, String(v)) }
  getAttribute(k: string) { return this.attrs.get(k) ?? null }
  focus() { doc.activeElement = this }
  click() { this.onclick?.({ target: this }) }
  scrollIntoView() {}
  private is(s: Sel): boolean {
    if (s.tag && this.tagName !== s.tag.toUpperCase()) return false
    if (s.id && this.id !== s.id) return false
    if (s.cls.some((c) => !this.classList.contains(c))) return false
    if (s.attr && (s.attr[0].startsWith('data-') ? this.dataset[s.attr[0].slice(5)] : this.getAttribute(s.attr[0])) !== s.attr[1]) return false
    return !(s.notDisabled && this.disabled)
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
  querySelector: (s: string) => doc.body.matches(s) ? doc.body : doc.body.querySelector(s),
  querySelectorAll: (s: string) => doc.body.querySelectorAll(s),
  addEventListener: (_t: string, f: (e: unknown) => void) => listeners.add(f),
  removeEventListener: (_t: string, f: (e: unknown) => void) => listeners.delete(f),
}
const key = (k: string) => { for (const f of [...listeners]) f({ key: k, preventDefault() {} }) }
const $ = (s: string) => doc.querySelector(s)
const $$ = (s: string) => doc.querySelectorAll(s)
/** Waits until a selector shows (the screen reads the packs first). */
async function until(s: string, ms = 8000): Promise<FakeEl> {
  for (let t = 0; t < ms; t += 20) { const e = $(s); if (e) return e; await sleep(20) }
  throw new Error(`never showed: ${s}`)
}

// a phone's storage (bun has none), which a test can make throw
const store = new Map<string, string>()
const goodStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k),
}
const saved = { localStorage: (globalThis as any).localStorage, document: (globalThis as any).document, HTMLElement: (globalThis as any).HTMLElement }
let log: FakeEl, lock: FakeEl | null = null
/** What the hooks were asked to do. */
const did: { start: [string, (c: ConvState) => Promise<any>][]; learn: [any, string, Sheet][]; browse: number; busy: boolean; asked: string[] } =
  { start: [], learn: [], browse: 0, busy: false, asked: [] }
let packs: string[] = ['en']

beforeAll(() => {
  ;(globalThis as any).localStorage = goodStorage
  ;(globalThis as any).document = doc
  ;(globalThis as any).HTMLElement = FakeEl
  log = new FakeEl('main')
  log.id = 'log'
  doc.body.appendChild(log)
  setWelcomeHooks({
    packs: () => packs,
    start: (label, make) => void did.start.push([label, make]),
    learn: (l, label, sheet) => void did.learn.push([l, label, sheet]),
    browse: () => void did.browse++,
    busy: () => did.busy,
  })
  setHowtoHooks({ ask: (q) => void did.asked.push(q), busy: () => false, type: () => {}, browse: () => {}, onlineSettings: () => {}, packs: () => packs, helpsLang: () => null })
})
afterAll(() => {
  closeWelcome()
  closeHowto()
  ;(globalThis as any).localStorage = saved.localStorage
  ;(globalThis as any).document = saved.document
  ;(globalThis as any).HTMLElement = saved.HTMLElement
  usePacksDir()
})
/** A new phone: nothing stored, an empty conversation on screen. */
function freshPhone() {
  closeWelcome()
  closeHowto()
  ;(globalThis as any).localStorage = goodStorage
  store.clear()
  forgetWelcome()
  forgetHowto()
  log.replaceChildren(Object.assign(new FakeEl('div'), { className: 'welcome' }))
  did.start = []; did.learn = []; did.browse = 0; did.busy = false; did.asked = []
}
/** What main.ts renderConv does in the welcome's slot: the welcome, else How to ask's line (appended to the empty conversation). */
function slot(ui: string, occasion: string, fresh: boolean) {
  const line = offerFirst(ui, occasion, fresh)
  if (line) log.querySelector('div.welcome')!.appendChild(line as unknown as FakeEl)
  return line
}

// ------------------------------------------------------------------------------------------------------- the screen

test('the first time a language is on the phone: the welcome, once, as a dialog over the app', async () => {
  if (!ALL_PACKS.includes('en')) return
  await installPacks(['en'])
  packs = ['en']
  freshPhone()
  expect(welcomeDue(true)).toBe(true)
  expect(slot('en', 'c1', true)).toBeNull() // no invitation line next to it
  const box = await until('#welcome .card')
  expect(box.getAttribute('role')).toBe('dialog')
  expect(box.getAttribute('aria-modal')).toBe('true')
  expect(box.getAttribute('aria-labelledby')).toBe('welcome-t')
  expect($('#welcome-t')!.textContent).toBe(WT('en').title)
  expect(doc.activeElement).toBe($('#welcome-t')) // the title has the focus: a screen reader reads it
  expect(box.dir).toBe('ltr')
  expect(log.inert).toBe(true) // the app behind does not take the focus
  expect($$('.wl-door').map((d) => d.dataset.door)).toEqual(['book', 'learn', 'look', 'explore'])
  expect(store.has('btsm.welcome.v1')).toBe(true)
  // drawn again (the same conversation, another one): never a second time, and never How to ask's line instead
  expect(slot('en', 'c1', true)).toBeNull()
  expect($$('#welcome').length).toBe(1)
  key('Escape')
  expect($('#welcome')).toBeNull()
  expect(log.inert).toBe(false)
  expect(slot('en', 'c2', true)).toBeNull()
  expect(slot('en', 'c3', false)).toBeNull()
  await sleep(50)
  expect($('#welcome')).toBeNull()
  expect($('.howto-invite')).toBeNull()
  // "Erase everything": a phone handed to someone new shows it again
  forgetWelcome()
  forgetHowto()
  expect(welcomeDue(true)).toBe(true)
})

test('never two welcomes: a phone that had How to ask’s line keeps it, and a phone already used gets the line', async () => {
  freshPhone()
  store.set('btsm.howto', '1') // the invitation showed before this version
  expect(welcomeDue(true)).toBe(false)
  expect(slot('en', 'c1', true)).not.toBeNull()
  await sleep(30)
  expect($('#welcome')).toBeNull()
  expect($$('.howto-invite').length).toBe(1)
  // questions already asked on this phone (an update): the line, not the screen
  freshPhone()
  expect(slot('en', 'c1', false)).not.toBeNull()
  await sleep(30)
  expect($('#welcome')).toBeNull()
  // the line was tapped or dismissed: nothing
  freshPhone()
  endInvite()
  expect(slot('en', 'c1', true)).toBeNull()
  await sleep(30)
  expect($('#welcome')).toBeNull()
})

test('it waits for the first questions and the PIN, and never covers the lock', async () => {
  freshPhone()
  const safety = new FakeEl('div')
  safety.id = 'safety'
  doc.body.appendChild(safety)
  slot('en', 'c1', true)
  await sleep(400)
  expect($('#welcome')).toBeNull()
  safety.remove()
  await until('#welcome')
  closeWelcome()
  // the PIN lock: openWelcome (also from the menu) does nothing under it; once open, the lock is never made inert
  lock = new FakeEl('div')
  lock.id = 'lock'
  doc.body.appendChild(lock)
  openWelcome('en')
  expect($('#welcome')).toBeNull()
  lock.remove()
  openWelcome('en')
  doc.body.appendChild(lock)
  expect(lock.inert).toBe(false)
  closeWelcome()
  lock.remove()
  // the conversation got a question before it could open: not shown (and the next empty conversation gets How to ask's line)
  freshPhone()
  doc.body.appendChild(safety)
  slot('en', 'c1', true)
  log.replaceChildren()
  safety.remove()
  await sleep(700)
  expect($('#welcome')).toBeNull()
})

test('Skip, ×, Back and "Start over" (the menu) work, and the focus goes back where it was', async () => {
  freshPhone()
  const opener = new FakeEl('button')
  doc.body.appendChild(opener)
  opener.focus()
  openWelcome('en')
  ;($$('.wl-nav button').find((b) => b.textContent === WT('en').skip)!).click()
  expect($('#welcome')).toBeNull()
  expect(welcomeSaved()?.door).toBe('skip')
  expect(doc.activeElement).toBe(opener)
  // Start over: the screen again, at its first view
  openWelcome('en')
  expect($('#welcome-t')!.textContent).toBe(WT('en').title)
  $('.wl-door[data-door="learn"]')!.click()
  expect($('#welcome-t')!.textContent).toBe(WT('en').q1)
  expect($('.wl-step')!.textContent).toBe(WT('en').qStep.replace('{n}', '1'))
  $('.wl-opt[data-a="1"]')!.click()
  expect($('#welcome-t')!.textContent).toBe(WT('en').q2)
  ;($$('.wl-nav button').find((b) => b.textContent === WT('en').back)!).click()
  expect($('#welcome-t')!.textContent).toBe(WT('en').q1)
  $('.wl-x')!.click()
  expect($('#welcome')).toBeNull()
  opener.remove()
})

test('Arabic: right to left, never auto', () => {
  freshPhone()
  openWelcome('ar')
  expect($('#welcome .card')!.dir).toBe('rtl')
  expect($('#welcome-t')!.textContent).toBe(WT('ar').title)
  closeWelcome()
  openWelcome('hi')
  expect($('#welcome .card')!.dir).toBe('ltr')
  closeWelcome()
})

test('a storage that throws: never shown (better than every time); one that cannot write: shown once in this run', async () => {
  freshPhone()
  ;(globalThis as any).localStorage = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } }
  forgetWelcome()
  expect(welcomeDue(true)).toBe(false)
  expect(slot('en', 'c1', true)).toBeNull()
  await sleep(30)
  expect($('#welcome')).toBeNull()
  expect(welcomeSaved()).toBeNull()
  // reads, but cannot write: once, then not again
  ;(globalThis as any).localStorage = { ...goodStorage, setItem: () => { throw new Error('full') } }
  store.clear()
  forgetWelcome()
  slot('en', 'c1', true)
  await until('#welcome')
  $('.wl-door[data-door="explore"]')!.click()
  expect(did.browse).toBe(1)
  expect(welcomeDue(true)).toBe(false)
  expect(slot('en', 'c2', true)).toBeNull()
  await sleep(30)
  expect($('#welcome')).toBeNull()
  ;(globalThis as any).localStorage = goodStorage
})

// --------------------------------------------------------------------------------------------------------- the doors

test('door 4, "Just explore": Browse; door 3, a passage or a word: the chat with How to ask', async () => {
  freshPhone()
  openWelcome('en')
  $('.wl-door[data-door="explore"]')!.click()
  expect(did.browse).toBe(1)
  expect($('#welcome')).toBeNull()
  expect(welcomeSaved()?.door).toBe('explore')
  openWelcome('es')
  $('.wl-door[data-door="look"]')!.click()
  expect($('#welcome')).toBeNull()
  expect($('#howto .card')?.getAttribute('role')).toBe('dialog') // the guide, in the app's language
  expect($('#howto-t')).not.toBeNull()
  expect(welcomeSaved()?.door).toBe('look')
  closeHowto()
})

for (const [ui, pack] of PHONES) {
  test(`${ui} with ${pack}: door 1 lists the pack's books, and a book starts its light path at its introduction`, async () => {
    await installPacks([pack])
    packs = [pack]
    freshPhone()
    openWelcome(ui)
    $('.wl-door[data-door="book"]')!.click()
    expect($('#welcome-t')!.textContent).toBe(WT(ui).whichBook)
    await until('.wl-book')
    const listed = $$('.wl-book').map((b) => b.dataset.book!)
    const have = new Set(Object.values(await booksOf([pack])).flatMap((x) => [...x]))
    expect(listed).toEqual(CANON.filter((c) => have.has(c)))
    // a short book the pack has: Ruth, else the first New Testament one
    const code = ['rut', 'jon', 'tit', 'col'].find((c) => listed.includes(c)) ?? listed[0]!
    $(`.wl-book[data-book="${code}"]`)!.click()
    expect($('#welcome')).toBeNull()
    await sleep(10)
    expect(did.start.length).toBe(1)
    const [label, make] = did.start[0]!
    expect(label).toBe(translatingText(ui, code))
    const c: ConvState = { last: null }
    const r = await answer(c, await make(c), performance.now())
    expect([r.answered, r.ref], label).toEqual(['intro', `${code} front:intro`])
    expect(r.reply.pathLine, label).toBeTruthy()
    expect(c.graph?.path?.book).toBe(code)
    expect(r.reply.follow?.[0]?.pathNext, `${label}: the first section next`).toBe(true)
  }, 120000)
}

test('door 1 for every book in every app language: what it sends reads as that book (else the book by its code)', async () => {
  for (const ui of UIS) for (const code of CANON) {
    const t = translatingText(ui, code)
    // every name reads back, except a few English ones code reads only as a book with words around ("Song of Songs")
    if (pathStart(t)?.book !== code) expect(`${ui} ${code}`).toBe('en sng')
  }
  if (!ALL_PACKS.includes('en')) return
  await installPacks(['en'])
  const c: ConvState = { last: null }
  const made = await bookStart('en', 'sng', c)
  expect(made.path?.book).toBe('sng')
  expect(made.sheet.ref).toBe('sng front:intro')
})

// ----------------------------------------------------------------------------------------------- learning to translate

test('two questions at most: the level and where it starts', () => {
  const L = (a: number, b: number) => levelOf(a as Answer, b as Answer)
  expect(L(0, 0)).toBe('new')
  expect([L(1, 0), L(0, 1), L(1, 1), L(2, 0), L(0, 2)]).toEqual(['some', 'some', 'some', 'some', 'some'])
  expect([L(2, 1), L(1, 2), L(2, 2)]).toEqual(['experienced', 'experienced', 'experienced'])
  expect(START).toEqual({ new: 'intro', some: 'trips', experienced: 'checking' })
})

for (const [ui, pack] of PHONES) {
  test(`${ui} with ${pack}: door 2 suggests a start for each level, and Start begins it`, async () => {
    await installPacks([pack])
    resetLearn()
    packs = [pack]
    for (const [a, b, kind] of [[0, 0, 'intro'], [1, 0, 'trips'], [2, 2, 'checking']] as const) {
      freshPhone()
      openWelcome(ui)
      $('.wl-door[data-door="learn"]')!.click()
      $(`.wl-opt[data-a="${a}"]`)!.click()
      $(`.wl-opt[data-a="${b}"]`)!.click()
      expect($('#welcome-t')!.textContent).toBe(WT(ui).suggestT)
      const go = await until('.wl-pick button')
      expect($('.wl-pick h3')!.textContent).toBeTruthy()
      // someone experienced is offered translating a book with its notes first among the others
      const alts = $$('.wl-alts button').map((x) => x.textContent)
      expect(alts.includes(WT(ui).withBook), `${ui} ${kind}`).toBe(true)
      if (kind === 'checking') expect(alts[0]).toBe(WT(ui).withBook)
      go.click()
      expect($('#welcome')).toBeNull()
      await sleep(10)
      const [l, label, sheet] = did.learn[0]!
      expect(l.kind).toBe(kind)
      expect(l.lang).toBe(pack)
      expect(sheet.concept).toBe(l.at)
      expect(label).toBe(l.title)
      expect(welcomeSaved()).toEqual({ door: 'learn', before: a, studied: b })
    }
  }, 120000)
}

test('no suggested article is missing from its pack, in every pack, and each path is in the manual’s order', async () => {
  for (const pack of ALL_PACKS) {
    await installPacks([pack])
    resetLearn()
    const has = new Set<string>()
    for (const m of ['intro', 'process', 'translate', 'checking'] as const) for (const a of await manualArticles(pack, m)) has.add(a.id)
    for (const kind of ['intro', 'trips', 'translate', 'checking'] as const) {
      const seq = await learnSeq(kind, pack)
      expect(seq.length, `${pack} ${kind}`).toBeGreaterThan(0)
      for (const s of seq) expect(has.has(s.id), `${pack} ${kind}: ${s.id}`).toBe(true)
      expect(new Set(seq.map((s) => s.id)).size).toBe(seq.length)
      // (each article once, and its title from the pack)
      for (const s of seq) expect(s.title.length).toBeGreaterThan(0)
    }
    // the manuals' own order: the Introduction manual starts with its introduction, the Checking manual with its own
    expect((await learnSeq('intro', pack))[0]!.id).toBe('ta:intro/ta-intro')
    expect((await learnSeq('checking', pack))[0]!.id).toBe('ta:checking/intro-checking')
    // the difficult topics: one per topic, each the first the pack has (Indonesian has no "key terms" article: the next one)
    const trips = (await learnSeq('trips', pack)).filter((s) => s.part === 'trips').map((s) => s.id)
    for (const [i, id] of trips.entries()) {
      const group = TRIPS.find((g) => g.includes(id))!
      expect(group.slice(0, group.indexOf(id)).every((x) => !has.has(x)), `${pack}: ${id}`).toBe(true)
      expect(TRIPS.indexOf(group)).toBeGreaterThanOrEqual(i)
    }
  }
}, 180000)

test('a pack without the manual a level starts with: the next one that exists (older packs: no Introduction manual)', async () => {
  if (!existsSync(join(OLD_PACKS_DIR, 'en', 'state.json'))) return
  usePacksDir(OLD_PACKS_DIR)
  try {
    await installPacks(['en'])
    resetLearn()
    const r: any = await openLang('en')
    if (r.installed('art:ta:intro')) return // (these packs have it after all: nothing to test)
    const s = await startOf('intro', ['en'])
    expect(s?.learn.kind).toBe('translate')
    expect((await manualArticles('en', 'translate')).some((a) => a.id === s!.first.id)).toBe(true)
    const k = await startOf('checking', ['en'])
    expect(k?.learn.kind).toBe(r.installed('art:ta:checking') ? 'checking' : 'translate')
  } finally {
    usePacksDir()
    resetLearn()
  }
}, 120000)

for (const [ui, pack] of PHONES) {
  test(`${ui} with ${pack}: the lessons say where they are, offer the next article and a verse to try, and the way back`, async () => {
    await installPacks([pack])
    resetLearn()
    const st = (await startOf('trips', [pack]))!
    const seq = await learnSeq(st.learn.kind, pack)
    const c: ConvState = { last: null, graph: newGraph() }
    c.graph!.learn = st.learn
    const r1 = await turn(c, { q: st.first.title, sheet: article(st.first.id, pack) }, ui)
    expect([r1.answered, r1.concept]).toEqual(['article', st.first.id])
    expect(r1.found).toBeGreaterThan(0)
    expect(r1.reply.pathMark).toBe(LT(ui).mark.replace('{part}', LT(ui).trips).replace('{n}', '1').replace('{m}', String(seq.filter((s) => s.part === 'trips').length)))
    const [next, tryIt] = r1.reply.follow!
    expect(next!.pathNext).toBe(true)
    expect(next!.sheet?.concept).toBe(seq[1]!.id)
    // a verse whose note cites the article (Hindi has notes for Acts only)
    expect(tryIt!.sheet?.intent, `${ui}: no verse to try`).toBe('passage')
    const ref = tryIt!.sheet!.ref!
    if (pack === 'hi') expect(ref.startsWith('act ')).toBe(true)
    if (pack === 'id') expect(['col', '1th', '2th', '1ti', '2ti', 'tit', 'phm', '2pe', '3jn']).toContain(ref.split(' ')[0])
    const m: any = await (await openLang(tryIt!.sheet!.lang)).book(ref.split(' ')[0]!)
    const [ch, v] = ref.split(' ')[1]!.split(':').map(Number)
    expect(m.notes.rows.some((x: any) => x.concept === st.first.id && x.from % 1000000 === ch! * 1000 + v!)).toBe(true)
    // tried: the verse with its notes, and one tap back to the lesson
    const r2 = await turn(c, { q: tryIt!.label, sheet: tryIt!.sheet as Sheet }, ui)
    expect([r2.answered, r2.ref]).toEqual(['passage', ref])
    expect(r2.found).toBeGreaterThan(0)
    expect(r2.reply.pathMark).toBeUndefined()
    expect(r2.reply.pathBack?.toPath).toBe(true)
    expect(r2.reply.pathBack?.sheet?.concept).toBe(st.first.id)
    expect(r2.reply.pathBack?.label).toContain(st.first.title)
    // Next: the second article, marked 2 of …; the path moves there (the Map's "Continue the lessons")
    const r3 = await turn(c, { q: next!.label, sheet: next!.sheet as Sheet }, ui)
    expect(r3.concept).toBe(seq[1]!.id)
    expect(r3.reply.pathMark).toContain('2')
    expect(c.graph!.learn!.at).toBe(seq[1]!.id)
    expect(c.graph!.learn!.title).toBe(seq[1]!.title)
  }, 120000)
}

test('a verse to try is never one the pack lacks: none for an article no note cites', async () => {
  if (!ALL_PACKS.includes('en')) return
  await installPacks(['en'])
  resetLearn()
  expect(await tryVerse('ta:intro/open-license', ['en'])).toBeNull()
  const c: ConvState = { last: null, graph: newGraph() }
  const st = (await startOf('intro', ['en']))!
  c.graph!.learn = st.learn
  const r = await turn(c, { q: st.first.title, sheet: article(st.first.id, 'en') }, 'en')
  expect(r.reply.follow!.filter((f) => f.sheet?.intent === 'passage' && f.label.startsWith('Try it'))).toEqual([])
  expect(r.reply.follow![0]!.sheet?.concept).toBe('ta:intro/translate-why')
  // learnStep with no path in the conversation does nothing
  const plain: ConvState = { last: null }
  const reply = { follow: [] }
  await learnStep(plain, { reply, answered: 'article', concept: 'ta:intro/ta-intro' }, article('ta:intro/ta-intro', 'en'), 'en')
  expect(reply).toEqual({ follow: [] })
})

test('every app language has every word of the welcome and the lessons', () => {
  const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v).map((x) => `${k}.${x}`) : [k]))
  for (const ui of UIS) {
    expect(keys(WT(ui))).toEqual(keys(WT('en')))
    expect(keys(LT(ui))).toEqual(keys(LT('en')))
    if (ui !== 'en') expect(WT(ui).title).not.toBe(WT('en').title)
    expect(WT(ui).translating).toContain('{book}')
  }
})

// ------------------------------------------------------------------------------------- a book's path, only steps with helps

/** Walks a book's path from its start (as door 1 or typed), following "Next" `n` times: each answer's marker, and what it found. */
async function walk(ui: string, first: Awaited<ReturnType<typeof turn>>, c: ConvState, n: number) {
  const out = [{ mark: first.reply.pathMark, found: first.found, line: first.reply.pathLine }]
  let r = first
  for (let i = 0; i < n; i++) {
    const nx = r.reply.follow?.find((f) => f.pathNext)
    if (!nx) break
    r = await turn(c, { q: nx.label, sheet: nx.sheet as Sheet }, ui)
    out.push({ mark: r.reply.pathMark, found: r.found, line: undefined })
  }
  return out
}

test('a path skips the steps the packs cannot answer: Hindi Acts has no questions (4 steps), Indonesian Titus has them (5)', async () => {
  if (ALL_PACKS.includes('hi')) {
    await installPacks(['hi'])
    const c: ConvState = { last: null }
    // as typed (the coordinator's report), and from the welcome's door
    const r = await turn(c, { q: 'मैं प्रेरितों के काम का अनुवाद करने जा रहा हूँ' }, 'hi')
    expect(r.ref).toBe('act front:intro')
    expect(c.graph?.path?.has).toEqual([1, 2, 3, 4])
    expect(r.reply.pathLine).not.toContain('प्रश्न')
    const steps = await walk('hi', r, c, 5)
    expect(steps.map((s) => s.mark)).toEqual([
      expect.stringMatching(/ · चरण 1\/4: परिचय$/), expect.stringMatching(/ 1:1–\d+ · चरण 2\/4: खंड$/),
      expect.stringMatching(/ · चरण 3\/4: मुख्य शब्द$/), expect.stringMatching(/ · चरण 4\/4: टिप्पणियाँ$/),
      expect.stringMatching(/ 1:\d+–\d+ · चरण 2\/4: खंड$/), expect.stringMatching(/ · चरण 3\/4: मुख्य शब्द$/),
    ])
    // every step finds something (no "questions" step that finds nothing)
    for (const s of steps) expect(s.found, s.mark).toBeGreaterThan(0)
    // "questions" asked anyway is not a step of this path
    const q = await turn(c, { q: 'x', sheet: { ...article('', 'hi'), intent: 'passage', concept: null, ref: 'act 1:1-5', what: ['questions'] } }, 'hi')
    expect(q.reply.pathMark).toBeUndefined()
    const d = await bookStart('hi', 'act', { last: null })
    expect(d.path?.book).toBe('act')
  }
  if (ALL_PACKS.includes('id')) {
    await installPacks(['id'])
    const c: ConvState = { last: null }
    const r = await answer(c, await bookStart('id', 'tit', c), performance.now())
    expect(c.graph?.path?.has).toEqual([1, 2, 3, 4, 5])
    expect(r.reply.pathLine).toContain('pertanyaan')
    const steps = await walk('id', r, c, 5)
    expect(steps.map((s) => s.mark)).toEqual([
      expect.stringMatching(/ · langkah 1 dari 5: pengantar$/), expect.stringMatching(/ · langkah 2 dari 5: bagian$/), expect.stringMatching(/ · langkah 3 dari 5: istilah kunci$/),
      expect.stringMatching(/ · langkah 4 dari 5: catatan$/), expect.stringMatching(/ · langkah 5 dari 5: pertanyaan$/),
      expect.stringMatching(/ · langkah 2 dari 5: bagian$/),
    ])
    for (const s of steps) expect(s.found, s.mark).toBeGreaterThan(0)
  }
}, 180000)

test('the path model: next, step-of and the count follow the steps it has', async () => {
  const { nextStep, stepOf, pathWords, pathStartLine } = await import('../src/graph')
  const P = { book: 'act', ch: 1, step: 2, sec: [1, 5] as [number, number], lang: 'hi', task: 'translate' as const, has: [1, 2, 4] }
  const secs: [number, number][] = [[1, 5], [6, 11]]
  expect(nextStep(P, secs, [])).toMatchObject({ step: 4, sec: [1, 5] }) // no key terms: the notes
  expect(nextStep({ ...P, step: 4 }, secs, [])).toMatchObject({ step: 2, sec: [6, 11] }) // no questions: the next section
  expect(nextStep({ ...P, step: 4, sec: [6, 11] }, secs, [[1, 3]])).toMatchObject({ step: 2, ch: 2, sec: [1, 3] })
  expect(stepOf(P, 'act 1:1-5', ['questions'], secs)).toBeNull()
  expect(stepOf(P, 'act 1:1-5', ['terms'], secs)).toBeNull()
  expect(stepOf(P, 'act 1:1-5', ['notes'], secs)).toMatchObject({ step: 4 })
  expect(pathWords('en', { ...P, step: 4 }, 'Acts', 'mark')).toBe('Acts 1:1–5 · step 3 of 3: notes')
  expect(pathStartLine('en', 'Acts', P.has)).toBe('A path through Acts: introduction → sections → notes. Ask anything along the way.')
  // a path kept from before (no `has`): all five, as before
  const { has: _, ...old } = P
  expect(pathWords('en', { ...old, step: 5 }, 'Acts', 'mark')).toBe('Acts 1:1–5 · step 5 of 5: questions')
  expect(nextStep({ ...old, step: 3 }, secs, [])).toMatchObject({ step: 4 })
})
