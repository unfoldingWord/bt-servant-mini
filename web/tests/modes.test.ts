// Guided modes (modes.ts): which modes the phone offers (books, Translation Academy, the 5M behind its dev switch), the words in the
// six app languages, and "5M OBS 1" as a tap sends it, read like the typed words in every app language.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { ALL_PACKS, installPacks } from './fs-packs'
import { withObs } from './obs-fixture'
import { type Five, fiveOffered, fiveStories, fiveText, fiveViewTitle, MT, sendTyped, type ModeData, modeSub, modesFor, modeTitle } from '../src/modes'
import { WT } from '../src/welcome'
import { type ConvState } from '../src/pipeline'

const UIS = ['en', 'es', 'fr', 'id', 'hi', 'ar']
const store = new Map<string, string>()
const fake = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k), key: () => null, length: 0,
}
const before = (globalThis as any).localStorage
beforeAll(() => { ;(globalThis as any).localStorage = fake })
afterAll(async () => {
  ;(globalThis as any).localStorage = before
  await withObs('en', 'installed')
})
const on = () => store.set('btsm.dev.obs5m', '1')
const off = () => store.delete('btsm.dev.obs5m')

const story1: Five = { source: 'test', obs: true, stories: [{ story: 1, title: 'The Creation', titleLang: 'en', reference: 'x', tfLang: 'en' }] }
const none: Five = { source: 'test', obs: false, stories: [] }
const d = (o: Partial<ModeData> = {}): ModeData => ({ books: true, manuals: true, five: none, ...o })

describe('which modes show', () => {
  test('books and manuals on the phone, the 5M off: the two modes of the welcome', () => {
    expect(modesFor(d())).toEqual(['book', 'learn'])
  })
  test('the 5M shows with stories (the dev switch, or a pack later), after the other two', () => {
    expect(modesFor(d({ five: story1 }))).toEqual(['book', 'learn', 'obs5m'])
    expect(modesFor(d({ five: { source: 'pack', obs: true, stories: story1.stories } as Five }))).toEqual(['book', 'learn', 'obs5m'])
  })
  test('a test file that cannot be read still offers the 5M (it says so); a pack with no stories does not', () => {
    expect(modesFor(d({ five: 'unreadable' }))).toContain('obs5m')
    expect(modesFor(d({ five: { source: 'pack', obs: true, stories: [] } }))).not.toContain('obs5m')
  })
  test('no Translation Academy manual: no "Learn to translate"; no book: no "Translate a book"', () => {
    expect(modesFor(d({ manuals: false }))).toEqual(['book'])
    expect(modesFor(d({ books: false }))).toEqual(['learn'])
    expect(modesFor(d({ manuals: false, five: story1 }))).toEqual(['book', 'obs5m'])
  })
  test('nothing to offer: no mode at all (Browse then draws no section)', () => {
    expect(modesFor(d({ books: false, manuals: false }))).toEqual([])
    expect(fiveOffered(none)).toBe(false)
    expect(fiveOffered('unreadable')).toBe(true)
  })
})

describe('fiveStories with the phone’s packs', () => {
  test('switch off: no stories, whatever the packs have', async () => {
    await installPacks(ALL_PACKS)
    await withObs('en', 'installed')
    off()
    expect(await fiveStories(['en'])).toEqual({ stories: [], source: 'test', obs: false })
    expect(fiveOffered(await fiveStories(['en']))).toBe(false)
  })
  test('switch on: story 1 from the test file, its title from the phone’s Open Bible Stories when installed', async () => {
    await installPacks(ALL_PACKS)
    on()
    await withObs('en', 'installed')
    const a = await fiveStories(['en'])
    expect(a).not.toBe('unreadable')
    if (a === 'unreadable') return
    expect(a.source).toBe('test')
    expect(a.obs).toBe(true)
    expect(a.stories.map((s) => s.story)).toEqual([1])
    expect(a.stories[0]!.tfLang).toBe('en')
    expect(a.stories[0]!.title.length).toBeGreaterThan(0)
    // no Open Bible Stories on the phone: still the session (the cards come from the test file), and it says there are none
    await withObs('en', 'none')
    const b = await fiveStories(['en'])
    expect(b).not.toBe('unreadable')
    if (b === 'unreadable') return
    expect(b.obs).toBe(false)
    expect(b.stories[0]!.titleLang).toBe('en')
    expect(b.stories[0]!.title.length).toBeGreaterThan(0)
    await withObs('en', 'installed')
    off()
  })
})

describe('the words', () => {
  test('every app language has every word, and the names tell the 5M’s test name from its pack name', () => {
    const keys = Object.keys(MT('en')).sort()
    for (const ui of UIS) {
      expect(Object.keys(MT(ui)).sort()).toEqual(keys)
      for (const k of keys) expect((MT(ui) as any)[k].length).toBeGreaterThan(5)
      expect(modeTitle(ui, 'obs5m', story1)).not.toBe(modeTitle(ui, 'obs5m', { ...story1, source: 'pack' }))
      expect(modeTitle(ui, 'obs5m', { ...story1, source: 'pack' })).toBe(fiveViewTitle(ui))
      expect(modeTitle(ui, 'book')).toBe(MT(ui).book)
    }
  })
  test('the first two modes say what the welcome’s doors say', () => {
    for (const ui of UIS) {
      expect(modeSub(ui, 'book')).toBe(WT(ui).doors.book[1])
      expect(modeSub(ui, 'learn')).toBe(WT(ui).doors.learn[1])
    }
  })
  test('the design’s names', () => {
    expect(MT('es').section).toBe('Modos guiados')
    expect(MT('ar').section).toBe('المسارات الموجّهة')
    expect(modeTitle('es', 'obs5m', story1)).toBe('Sesión OBS 5M (prueba)')
  })
})

describe('"5M OBS 1", as a tap on the story sends it', () => {
  test('the text is the typed one', () => {
    expect(fiveText(1)).toBe('5M OBS 1')
  })
  for (const ui of UIS) {
    test(`${ui}: the text a tap sends starts a session like the typed words (same state, same count of 5m.start)`, async () => {
      on()
      store.set('btsm.usage', '1')
      await fullPhone()
      const start = () => Object.values(JSON.parse(store.get('btsm.usage.days') ?? '{}') as Record<string, Record<string, number>>)[0]?.['5m.start'] ?? 0
      const n0 = start()
      const a: ConvState = { last: null }
      const ra: any = await turn(a, { q: fiveText(1) }, ui)
      const n1 = start()
      const b: ConvState = { last: null }
      const rb: any = await turn(b, { q: '5M OBS 1' }, ui)
      const n2 = start()
      expect([ra.answered, ra.route]).toEqual(['obs5m', 'obs5m'])
      expect(n1 - n0).toBe(1)
      expect(n2 - n1).toBe(1)
      const { started: _a, ...sa } = a.graph!.session as any
      const { started: _b, ...sb } = b.graph!.session as any
      expect(sa).toEqual(sb)
      expect(ra.reply.sessionMark).toBe(rb.reply.sessionMark)
      store.delete('btsm.usage')
      store.delete('btsm.usage.days')
      off()
    })
  }
})

describe('sendTyped (what a tap on a story, and the 5M button, do with the page)', () => {
  const page = (busy: boolean) => {
    const input = { value: 'half a question' }
    const sent: string[] = []
    // as main.ts submit does: nothing while busy; else it takes the text and empties the box
    const form = { requestSubmit: () => { if (busy || !input.value.trim()) return; sent.push(input.value); input.value = '' } }
    return { input, form, sent }
  }
  test('sent: the text goes as typed and what was being written stays in the box', () => {
    const p = page(false)
    expect(sendTyped(p.input, p.form, fiveText(1))).toBe(true)
    expect(p.sent).toEqual(['5M OBS 1'])
    expect(p.input.value).toBe('half a question')
  })
  test('an answer on its way: false, nothing sent, the box as it was', () => {
    const p = page(true)
    expect(sendTyped(p.input, p.form, fiveText(1))).toBe(false)
    expect(p.sent).toEqual([])
    expect(p.input.value).toBe('half a question')
  })
})
