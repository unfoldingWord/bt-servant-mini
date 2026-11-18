// The Resources and server screens (resources.ts, handoff/mini-servant/encargo-ms-menu.md task 3): a card per language with its
// parts, [Download] on a part a downloaded language lacks (never on one that came with the app), a download that stopped as a
// card of its own, downloads that outlive the screen (in memory), cancel and retry, no language, Arabic right to left, and the
// server screen filling in as languages answer. What the packs and the network answer is replaced through `deps`; the shipped
// language is the real es-419 from disk. Runs on a small stand-in for the page (bun has none).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { installPacks } from './fs-packs'
import {
  cancelDownload, count, deps, downloads, downloadsSummary, onDownloads, renderResources, renderServer, resetDownloads, resourcesBox, RT, startDownload, watching, type ResCtx,
} from '../src/resources'

class FakeEl {
  tagName: string; className = ''; children: FakeEl[] = []; parentElement: FakeEl | null = null; dataset: Record<string, string> = {}
  dir = ''; type = ''; hidden = false; accept = ''; files: unknown[] | null = null; onclick: (() => void) | null = null; onchange: (() => void) | null = null
  text = ''
  constructor(tag: string) { this.tagName = tag.toUpperCase() }
  get textContent(): string { return [this.text, ...this.children.map((c) => c.textContent)].filter(Boolean).join(' ') }
  set textContent(v: string) { this.children = []; this.text = v }
  appendChild(c: FakeEl) { c.parentElement = this; this.children.push(c); return c }
  append(...cs: FakeEl[]) { for (const c of cs) this.appendChild(c) }
  replaceChildren(...cs: FakeEl[]) { this.children = []; this.text = ''; this.append(...cs) }
  click() { this.onclick?.() }
  all(): FakeEl[] { return this.children.flatMap((c) => [c, ...c.all()]) }
  buttons(): FakeEl[] { return this.all().filter((e) => e.tagName === 'BUTTON') }
  button(re: RegExp): FakeEl | undefined { return this.buttons().find((b) => re.test(b.textContent)) }
  cards(): FakeEl[] { return this.all().filter((e) => e.className.includes('res-card')) }
}
const saved = { document: (globalThis as any).document, ls: (globalThis as any).localStorage }
const mem = new Map<string, string>()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const real = { ...deps }
const noImages = { imagesInstalled: async () => null, imagesOffer: async () => null }
const fakeReader = (listed: string[], installed: string[]) => ({
  listed: (u: string) => listed.includes(u), installed: (u: string) => installed.includes(u), size: () => 1_500_000,
})
let refreshed = 0
const ctx = (ui = 'es'): ResCtx => ({ ui, refresh: () => void refreshed++, openServer: () => {}, openLanguage: () => {} })
const host = () => new FakeEl('div') as unknown as FakeEl & HTMLElement

beforeAll(async () => {
  ;(globalThis as any).document = { createElement: (t: string) => new FakeEl(t) }
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size },
  }
  await installPacks(['es-419'])
})
afterAll(() => {
  ;(globalThis as any).document = saved.document
  ;(globalThis as any).localStorage = saved.ls
  Object.assign(deps, real)
})
beforeEach(() => {
  resetDownloads()
  Object.assign(deps, real, noImages, { online: () => true, meteredNow: () => false })
  mem.clear()
  refreshed = 0
})
/** A phone with one downloaded language, `hi`: a book and Key Words there, Stories listed but not installed. */
const withDownloaded = () => Object.assign(deps, {
  installedLangs: async () => ['hi'], origin: async () => 'added' as const, partialLangs: () => [] as string[],
  openLang: async () => fakeReader(['book:tit', 'art:tw:kt', 'art:tw:names', 'art:tw:other', 'obs'], ['book:tit', 'art:tw:kt', 'art:tw:names', 'art:tw:other']),
})

describe('a language card', () => {
  test('a downloaded language that lacks a part: the part has [Download] with its size', async () => {
    withDownloaded()
    const h = host()
    await renderResources(h, ctx())
    const card = h.cards().find((c) => c.dataset.lang === 'hi')!
    expect(card.textContent).toContain('lo descargaste')
    expect(card.textContent).toContain('✓ Palabras clave')
    expect(card.textContent).toContain('＋ Historias de la Biblia')
    const b = card.buttons().find((x) => /Descargar/.test(x.textContent))!
    expect(b.textContent).toBe('Descargar · ≈1.4 MB')
    expect(h.textContent).not.toMatch(/módulo|paquete|unidad|catálogo/i)
  })

  test('a language that came with the app: its parts as ✓, no [Download], no "not for this language"', async () => {
    const h = host()
    await renderResources(h, ctx())
    const card = h.cards().find((c) => c.dataset.lang === 'es-419')!
    expect(card.textContent).toContain('viene con la app')
    expect(card.textContent).toContain('✓ Biblia:')
    expect(card.textContent).not.toContain('＋')
    expect(card.textContent).not.toContain('No viene')
    expect(card.buttons().some((b) => /Descargar/.test(b.textContent))).toBe(false)
    expect(card.buttons().some((b) => /Quitar/.test(b.textContent))).toBe(false)
    expect(card.buttons().some((b) => /Guardar para compartir/.test(b.textContent))).toBe(true)
  })

  test('the original text shows only when there; a part the catalog does not list is said in grey', async () => {
    withDownloaded()
    const h = host()
    await renderResources(h, ctx())
    const t = h.cards().find((c) => c.dataset.lang === 'hi')!.textContent
    expect(t).not.toContain('Texto original')
    expect(t).toContain('No viene para este idioma: Translation Academy')
  })
})

describe('a download that did not end', () => {
  test('it is a card of its own with [Continue] and [Remove], and says its size without internet', async () => {
    Object.assign(deps, { installedLangs: async () => [], partialLangs: () => ['hi'], partialMark: () => ({ b: 20_971_520 }), online: () => false })
    const h = host()
    await renderResources(h, ctx())
    const card = h.cards().find((c) => c.dataset.lang === 'hi')!
    expect(card.textContent).toContain('descarga sin terminar (20.0 MB)')
    expect(card.buttons().map((b) => b.textContent)).toEqual(['Seguir', 'Quitar'])
    card.buttons()[0]!.click()
    await sleep(10)
    expect(h.cards().find((c) => c.dataset.lang === 'hi')!.buttons()[0]!.textContent).toBe('Hace falta internet para descargar.')
  })

  test('the old mark (no size) still draws the card', async () => {
    Object.assign(deps, { installedLangs: async () => [], partialLangs: () => ['hi'], partialMark: () => null })
    const h = host()
    await renderResources(h, ctx())
    expect(h.cards()[0]!.textContent).toContain('descarga sin terminar')
  })
})

describe('downloads outside the screen', () => {
  test('the state survives closing and opening the screen; the menu gets a summary and a change notice', async () => {
    withDownloaded()
    let finish!: () => void
    let seenChange = 0
    const off = onDownloads(() => void seenChange++)
    let report!: (a: number, b: number) => void
    startDownload('part:hi:obs', (_s, progress) => { report = progress; return new Promise<void>((r) => { finish = r }) })
    report(3_250_000, 10_276_044)
    expect(downloadsSummary()).toEqual({ a: 3_250_000, b: 10_276_044 })
    expect(seenChange).toBeGreaterThan(0)
    const h1 = host()
    await renderResources(h1, ctx())
    expect(h1.textContent).toContain('Descargando… 3.1 / 9.8 MB')
    report(5_000_000, 10_276_044)
    const h2 = host()
    await renderResources(h2, ctx())
    expect(h2.textContent).toContain('Descargando… 4.8 / 9.8 MB')
    expect(h2.button(/Cancelar/)).toBeDefined()
    finish()
    await sleep(10)
    expect(downloads()).toEqual([])
    expect(downloadsSummary()).toBeNull()
    off()
  })

  test('a failure shows its reason and [Try again] runs it once more; cancel leaves nothing', async () => {
    withDownloaded()
    let runs = 0
    let fail = true
    startDownload('part:hi:obs', async (signal) => {
      runs++
      if (fail) throw new Error('timeout')
      await new Promise<void>((_, rej) => signal.addEventListener('abort', () => rej(new Error('canceled'))))
    })
    await sleep(5)
    expect(downloads()).toMatchObject([{ key: 'part:hi:obs', error: 'timeout' }])
    const h = host()
    await renderResources(h, ctx())
    expect(h.textContent).toContain('Hace falta internet para descargar.') // a timeout, in words (the raw message is only in the console)
    expect(h.textContent).not.toContain('timeout')
    fail = false
    Object.assign(deps, { serverUnitSize: async () => 1_500_000, addUnits: async () => { runs++ } })
    h.button(/Reintentar/)!.click()
    await sleep(5)
    expect(runs).toBe(2)
    await sleep(10)
    expect(downloads()).toEqual([]) // the retry went through the gate and finished
    startDownload('part:hi:obs', (signal) => new Promise<void>((_, rej) => signal.addEventListener('abort', () => rej(new Error('canceled')))))
    cancelDownload('part:hi:obs')
    await sleep(5)
    expect(downloads()).toEqual([])
    const h2 = host()
    await renderResources(h2, ctx())
    expect(h2.button(/Descargar/)).toBeDefined()
  })

  test('a tap on a part: mobile data asks first, the second tap downloads what is missing', async () => {
    withDownloaded()
    const asked: string[][] = []
    Object.assign(deps, { meteredNow: () => true, serverUnitSize: async () => 1_500_000, addUnits: async (_l: string, u: string[]) => void asked.push(u) })
    const h = host()
    await renderResources(h, ctx())
    h.button(/Descargar/)!.click()
    await sleep(10)
    expect(h.button(/por datos móviles/)!.textContent).toBe('1.4 MB por datos móviles. ¿Seguir?')
    expect(asked).toEqual([])
    h.button(/por datos móviles/)!.click()
    await sleep(20)
    expect(asked).toEqual([['obs']])
  })

  test('a size more than 20 % off the one shown is said first', async () => {
    withDownloaded()
    Object.assign(deps, { serverUnitSize: async () => 4_000_000, addUnits: async () => {} })
    const h = host()
    await renderResources(h, ctx())
    h.button(/Descargar/)!.click()
    await sleep(10)
    expect(h.button(/¿Seguir\?/)!.textContent).toBe('Son 3.8 MB. ¿Seguir?')
  })
})

describe('no language, and right to left', () => {
  test('no language: the sentence and the search button first; the pictures stay', async () => {
    Object.assign(deps, { installedLangs: async () => [], partialLangs: () => [] })
    const h = host()
    await renderResources(h, ctx())
    expect(h.textContent).toContain('Todavía no hay ningún idioma en este teléfono.')
    expect(h.cards().length).toBe(1)
    expect(h.buttons()[0]!.textContent).toBe('Buscar más idiomas en el servidor')
    expect(h.textContent).toContain('Imágenes de las Historias de la Biblia')
  })

  test('Arabic: dir rtl, the words in Arabic, Latin names isolated', async () => {
    withDownloaded()
    const h = host()
    await renderResources(h, ctx('ar'))
    expect(h.dir).toBe('rtl')
    expect(h.textContent).toContain(RT('ar').langs)
    expect(h.textContent).toContain('تنزيل')
    expect(h.textContent).toMatch(/⁨Translation Academy⁩/)
    Object.assign(deps, { offerCandidates: async () => [], offers: async () => [] })
    const hs = host()
    await renderServer(hs, ctx('ar'))
    expect(hs.dir).toBe('rtl')
  })

  test('every text exists in the six languages', () => {
    const keys = Object.keys(RT('en')).sort()
    for (const l of ['es', 'fr', 'id', 'hi', 'ar']) expect(Object.keys(RT(l)).sort()).toEqual(keys)
  })
})

describe('the server screen', () => {
  const offer = (lang: string, bytes: number) => ({
    lang, books: ['tit'], bytes, segments: [], sizes: {}, units: [], obs: true,
    parts: [{ id: 'bible', state: 'have', n: 30, missing: [], bytes: 0 }, { id: 'tw', state: 'have', missing: [], bytes: 0 }, { id: 'obs', state: 'have', missing: [], bytes: 0 }],
  })
  test('each language appears as it answers, with its parts and one [Download · MB]; then the closing line', async () => {
    let step!: () => void
    const wait = new Promise<void>((r) => { step = r })
    Object.assign(deps, {
      offerCandidates: async () => ['hi', 'fr', 'bn'],
      offers: async (on: (o: unknown, l: string) => void) => { on(offer('hi', 100_663_296), 'hi'); await wait; on(null, 'bn'); on(offer('fr', 3_355_443), 'fr'); return [] },
    })
    const h = host()
    const p = renderServer(h, ctx())
    await sleep(10)
    expect(h.textContent).toContain('Buscando… (1 de 3)')
    expect(h.cards().filter((c) => c.dataset.lang).map((c) => c.dataset.lang)).toEqual(['hi'])
    expect(h.cards()[0]!.textContent).toContain('Biblia: 30 libros · Palabras clave · Historias de la Biblia')
    expect(h.button(/Descargar/)!.textContent).toBe('Descargar · 96.0 MB')
    step()
    await p
    expect(h.cards().filter((c) => c.dataset.lang).map((c) => c.dataset.lang)).toEqual(['hi', 'fr'])
    expect(h.textContent).not.toContain('Buscando')
    expect(h.textContent).toContain('La app busca en una lista fija de idiomas.')
  })

  test('no answer: the message of today; a tap starts the language with its offer and shows its progress', async () => {
    Object.assign(deps, { offerCandidates: async () => ['hi'], offers: async (on: (o: unknown, l: string) => void) => { on(null, 'hi'); return [] }, online: () => false })
    const h = host()
    await renderServer(h, ctx())
    expect(h.textContent).toContain('Sin internet, o el servidor no respondió.')
    let got: unknown
    Object.assign(deps, {
      online: () => true,
      offers: async (on: (o: unknown, l: string) => void) => { on(offer('hi', 1_048_576), 'hi'); return [] },
      downloadLang: async (_l: string, p: (x: unknown) => void, o: { offer: unknown }) => { got = o.offer; p({ bytes: 524_288, totalBytes: 1_048_576 }); await sleep(30) },
    })
    const h2 = host()
    await renderServer(h2, ctx())
    h2.button(/Descargar/)!.click()
    await sleep(15)
    expect((got as { lang: string }).lang).toBe('hi')
    expect(h2.textContent).toContain('Descargando… 0.5 / 1.0 MB')
    await sleep(40)
  })
})

describe('the gate on every kind of download, and on a retry', () => {
  const warn = console.warn
  beforeAll(() => { console.warn = () => {} })
  afterAll(() => { console.warn = warn })

  test('a language that stopped: [Continue] asks the offer again; mobile data asks first; a size 20 % off is said', async () => {
    const started: unknown[] = []
    Object.assign(deps, {
      installedLangs: async () => [], partialLangs: () => ['hi'], partialMark: () => ({ b: 10_485_760 }), meteredNow: () => true,
      offerOf: async () => ({ lang: 'hi', books: [], bytes: 10_485_760, segments: [], sizes: {}, units: [], parts: [] }),
      downloadLang: async (_l: string, _p: unknown, o: { offer: unknown }) => void started.push(o.offer),
    })
    const h = host()
    await renderResources(h, ctx())
    h.button(/Seguir/)!.click()
    await sleep(10)
    expect(h.button(/por datos móviles/)!.textContent).toBe('10.0 MB por datos móviles. ¿Seguir?')
    expect(started).toEqual([])
    h.button(/por datos móviles/)!.click()
    await sleep(20)
    expect(started.length).toBe(1)
    // not metered, but the plan grew: said first
    resetDownloads()
    Object.assign(deps, { meteredNow: () => false, offerOf: async () => ({ lang: 'hi', books: [], bytes: 20_971_520, segments: [], sizes: {}, units: [], parts: [] }) })
    const h2 = host()
    await renderResources(h2, ctx())
    h2.button(/Seguir/)!.click()
    await sleep(10)
    expect(h2.button(/¿Seguir\?/)!.textContent).toBe('Son 20.0 MB. ¿Seguir?')
  })

  test('the pictures: the same two-tap rule', async () => {
    const got: unknown[] = []
    Object.assign(deps, {
      installedLangs: async () => [], partialLangs: () => [], meteredNow: () => true,
      imagesOffer: async () => ({ bytes: 21_076_377, segments: [], sizes: {} }),
      downloadImages: async (_p: unknown, _s: unknown, o: unknown) => void got.push(o),
    })
    const h = host()
    await renderResources(h, ctx())
    h.button(/Descargar/)!.click()
    await sleep(10)
    expect(h.button(/por datos móviles/)!.textContent).toBe('20.1 MB por datos móviles. ¿Seguir?')
    h.button(/por datos móviles/)!.click()
    await sleep(20)
    expect(got.length).toBe(1)
  })

  test('the confirming tap checks the connection first', async () => {
    withDownloaded()
    const asked: string[][] = []
    Object.assign(deps, { meteredNow: () => true, serverUnitSize: async () => 1_500_000, addUnits: async (_l: string, u: string[]) => void asked.push(u) })
    const h = host()
    await renderResources(h, ctx())
    h.button(/Descargar/)!.click()
    await sleep(10)
    deps.online = () => false
    h.button(/por datos móviles/)!.click()
    await sleep(10)
    expect(h.button(/Hace falta internet/)).toBeDefined()
    expect(asked).toEqual([])
  })

  test('a retry goes through the gate again, and a failure is never shown raw', async () => {
    withDownloaded()
    startDownload('part:hi:obs', async () => { throw new Error('pack segment 3 failed') })
    await sleep(5)
    Object.assign(deps, { meteredNow: () => true, serverUnitSize: async () => 1_500_000, addUnits: async () => {} })
    const h = host()
    await renderResources(h, ctx())
    expect(h.textContent).toContain('No se pudo descargar.')
    expect(h.textContent).not.toContain('pack')
    h.button(/Reintentar/)!.click()
    await sleep(10)
    // mobile data: the retry asked first, nothing started
    expect(h.button(/por datos móviles/)).toBeDefined()
    expect(downloads()[0]!.error).toBeDefined()
    deps.online = () => false
    h.button(/por datos móviles/)!.click()
    await sleep(10)
    expect(h.button(/Hace falta internet/)).toBeDefined()
  })

  test('the progress uses one unit for both numbers', async () => {
    withDownloaded()
    startDownload('images', (_s, progress) => { progress(200_000, 524_288); return new Promise<void>(() => {}) })
    const h = host()
    await renderResources(h, ctx())
    expect(h.textContent).toContain('Descargando… 195 / 512 KB')
    expect(h.textContent).not.toContain('0.2 / 512 KB')
  })
})

describe('several downloads, a closed screen, disposing', () => {
  test('two downloads at once are both kept, and the summary adds them', async () => {
    withDownloaded()
    startDownload('part:hi:obs', (_s, p) => { p(1_000_000, 4_000_000); return new Promise<void>(() => {}) })
    startDownload('images', (signal, p) => { p(2_000_000, 20_000_000); return new Promise<void>((_, rej) => signal.addEventListener('abort', () => rej(new Error('canceled')))) })
    expect(downloads().map((d) => d.key).sort()).toEqual(['images', 'part:hi:obs'])
    expect(downloadsSummary()).toEqual({ a: 3_000_000, b: 24_000_000 })
    cancelDownload('images')
    await sleep(5)
    expect(downloads().map((d) => d.key)).toEqual(['part:hi:obs'])
  })

  test('a download that finishes with the screen closed: no watcher is left, and the next screen shows it done', async () => {
    withDownloaded()
    let finish!: () => void
    startDownload('part:hi:obs', () => new Promise<void>((r) => { finish = r }))
    const h = host()
    const dispose = await renderResources(h, ctx())
    expect(watching()).toBe(1)
    dispose()
    expect(watching()).toBe(0)
    const before = h.textContent
    // the Stories are on the phone by the time it ends
    Object.assign(deps, { openLang: async () => fakeReader(['book:tit', 'art:tw:kt', 'obs'], ['book:tit', 'art:tw:kt', 'obs']) })
    finish()
    await sleep(10)
    expect(h.textContent).toBe(before) // nothing painted after dispose
    const h2 = host()
    await renderResources(h2, ctx())
    expect(h2.cards().find((c) => c.dataset.lang === 'hi')!.textContent).toContain('✓ Historias de la Biblia')
    expect(watching()).toBe(1)
  })

  test('a new render into the same host disposes the one before; a disconnected host stops following', async () => {
    withDownloaded()
    const h = host()
    await renderResources(h, ctx())
    await renderResources(h, ctx())
    expect(watching()).toBe(1)
    ;(h as any).isConnected = true // it was on the page, and now leaves
    startDownload('part:hi:obs', () => new Promise<void>(() => {}))
    expect(watching()).toBe(1)
    ;(h as any).isConnected = false
    startDownload('images', () => new Promise<void>(() => {}))
    expect(watching()).toBe(0)
  })

  test('the server screen paints nothing after dispose, even when the server answers later', async () => {
    let late!: (o: unknown, l: string) => void
    let end!: () => void
    Object.assign(deps, { offerCandidates: async () => ['hi'], offers: (on: typeof late) => new Promise<[]>((r) => { late = on; end = () => r([]) }) })
    const h = host()
    void renderServer(h, ctx())
    await sleep(10)
    await renderResources(h, ctx()) // a render into the same host disposes the server screen
    const text = h.textContent
    late({ lang: 'hi', books: [], bytes: 1, segments: [], sizes: {}, units: [], parts: [] }, 'hi')
    end()
    await sleep(10)
    expect(h.textContent).toBe(text)
  })

  test('the server screen: a failed question gives the usual message; a language that arrived leaves the list', async () => {
    Object.assign(deps, { offerCandidates: async () => ['hi'], offers: async () => { throw new Error('boom') }, online: () => true })
    const warn = console.warn
    console.warn = () => {}
    const h = host()
    await renderServer(h, ctx())
    expect(h.textContent).toContain('Sin internet, o el servidor no respondió.') // online, but the question failed: no answer
    expect(h.textContent).not.toContain('todavía no tiene')
    let have: string[] = []
    const o = { lang: 'hi', books: [], bytes: 1_048_576, segments: [], sizes: {}, units: [], parts: [] }
    Object.assign(deps, {
      installedLangs: async () => have,
      offers: async (on: (x: unknown, l: string) => void) => { on(o, 'hi'); return [] },
      offerOf: async () => o,
      downloadLang: async () => { have = ['hi'] },
    })
    const h2 = host()
    await renderServer(h2, ctx())
    h2.button(/Descargar/)!.click()
    await sleep(40)
    expect(h2.cards().filter((c) => c.dataset.lang)).toEqual([])
    console.warn = warn
  })

  test('the server screen: a plan 20 % bigger than the size it was found with is said at the tap', async () => {
    Object.assign(deps, {
      offerCandidates: async () => ['hi'], meteredNow: () => false,
      offers: async (on: (o: unknown, l: string) => void) => { on({ lang: 'hi', books: [], bytes: 1_048_576, segments: [], sizes: {}, units: [], parts: [] }, 'hi'); return [] },
      offerOf: async () => ({ lang: 'hi', books: [], bytes: 2_097_152, segments: [], sizes: {}, units: [], parts: [] }),
    })
    const h = host()
    await renderServer(h, ctx())
    h.button(/Descargar/)!.click()
    await sleep(10)
    expect(h.button(/¿Seguir\?/)!.textContent).toBe('Son 2.0 MB. ¿Seguir?')
  })
})

describe('the box main.ts still calls (Resources, the server screen and the way back)', () => {
  test('the server screen is not repainted over by Resources on a download tick, and the way back works', async () => {
    withDownloaded()
    Object.assign(deps, { offerCandidates: async () => [], offers: async () => [] })
    const box = (await resourcesBox('es', () => {})) as unknown as FakeEl
    expect(box.textContent).toContain('Lo que la app puede leer sin internet')
    box.button(/Buscar más idiomas/)!.click()
    await sleep(20)
    expect(box.textContent).toContain('La app busca en una lista fija de idiomas.')
    expect(box.textContent).not.toContain('Lo que la app puede leer')
    startDownload('images', (_s, p) => { p(1, 2); return new Promise<void>(() => {}) })
    await sleep(10)
    expect(box.textContent).toContain('La app busca en una lista fija de idiomas.')
    expect(box.textContent).not.toContain('Lo que la app puede leer')
    expect(watching()).toBe(1) // Resources was disposed
    box.button(/Recursos/)!.click()
    await sleep(20)
    expect(box.textContent).toContain('Lo que la app puede leer sin internet')
    expect(box.textContent).not.toContain('La app busca')
    startDownload('part:hi:obs', () => new Promise<void>(() => {}))
    await sleep(10)
    expect(box.textContent).not.toContain('La app busca')
    expect(watching()).toBe(1)
  })
})

describe('plurals and lists', () => {
  test('Arabic: one book and the pictures count take their own forms; French has no "(s)"', async () => {
    withDownloaded()
    Object.assign(deps, { imagesInstalled: async () => ({ bytes: 21_076_377 }) })
    const h = host()
    await renderResources(h, ctx('ar'))
    expect(h.textContent).toContain('سفر واحد')
    expect(h.textContent).toContain('598 صورة')
    const f = host()
    await renderResources(f, ctx('fr'))
    expect(f.textContent).toContain('598 images')
    expect(RT('fr').lack).not.toContain('(s)')
  })
})

describe('correction 2', () => {
  const warn = console.warn
  beforeAll(() => { console.warn = () => {} })
  afterAll(() => { console.warn = warn })
  const offerOfBytes = (bytes: number) => ({ lang: 'hi', books: [], bytes, segments: [], sizes: {}, units: [], parts: [] })

  test('the confirming tap downloads the offer whose size was shown, not the one the list had', async () => {
    const used: number[] = []
    Object.assign(deps, {
      meteredNow: () => true,
      offerCandidates: async () => ['hi'],
      offers: async (on: (o: unknown, l: string) => void) => { on(offerOfBytes(1_048_576), 'hi'); return [] },
      offerOf: async () => offerOfBytes(1_100_000), // the plan of today
      downloadLang: async (_l: string, _p: unknown, o: { offer: { bytes: number } }) => void used.push(o.offer.bytes),
    })
    const h = host()
    await renderServer(h, ctx())
    h.button(/Descargar/)!.click()
    await sleep(10)
    expect(h.button(/por datos móviles/)!.textContent).toBe('1.0 MB por datos móviles. ¿Seguir?')
    h.button(/por datos móviles/)!.click()
    await sleep(20)
    expect(used).toEqual([1_100_000])
  })

  test('Back during a scan disposes at once; reopening joins the scan (no doubled requests, no callbacks into the old screen)', async () => {
    let asked = 0
    let answer!: (o: unknown, l: string) => void
    let end!: () => void
    Object.assign(deps, {
      offerCandidates: async () => ['hi', 'fr'], installedLangs: async () => [], partialLangs: () => [],
      offers: (on: typeof answer) => new Promise<[]>((r) => { asked++; answer = on; end = () => r([]) }),
    })
    const box = (await resourcesBox('es', () => {})) as unknown as FakeEl
    box.button(/Buscar más idiomas/)!.click()
    await sleep(15)
    expect(asked).toBe(1)
    const old = box.all().find((e) => e.className === '')!
    box.button(/Recursos/)!.click() // Back while the scan runs
    await sleep(15)
    expect(box.textContent).toContain('Lo que la app puede leer sin internet')
    box.button(/Buscar más idiomas/)!.click() // reopened
    await sleep(15)
    expect(asked).toBe(1) // it joined the running scan
    answer(offerOfBytes(2_097_152), 'hi')
    await sleep(5)
    expect(box.textContent).toContain('Buscando… (1 de 2)')
    expect(old.textContent).toContain('(0 de 2)') // the old screen was not touched by the answer
    expect(box.cards().map((c) => c.dataset.lang)).toContain('hi')
    end()
    await sleep(10)
    expect(box.textContent).not.toContain('Buscando')
  })

  test('failures are told by their type first: a fetch TypeError or a timeout is the connection, an odd message is not', async () => {
    withDownloaded()
    startDownload('part:hi:obs', async () => { throw new TypeError('Load failed') })
    startDownload('images', async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }) })
    startDownload('lang:fr', async () => { throw new Error('the pack says no') })
    await sleep(10)
    const h = host()
    await renderResources(h, ctx())
    const lines = h.all().filter((e) => e.className.includes('res-dl')).map((e) => e.textContent)
    expect(lines.filter((l) => l.includes('Hace falta internet')).length).toBe(2)
    expect(lines.filter((l) => l.includes('No se pudo descargar.')).length).toBe(1)
  })

  test('counts: Arabic one, two, three to ten, eleven and more, and zero as a plural; Spanish "falta 1" and "faltan 2"', async () => {
    expect([1, 2, 3, 10, 11, 0].map((n) => count('ar', 'book', n))).toEqual(['سفر واحد', 'سفران', '3 أسفار', '10 أسفار', '11 سفرًا', '0 أسفار'])
    expect([1, 2, 5, 12].map((n) => count('ar', 'manual', n))).toEqual(['دليل واحد', 'دليلان', '5 أدلة', '12 دليلًا'])
    expect([1, 2, 4, 20].map((n) => count('ar', 'story', n))).toEqual(['قصة واحدة', 'قصتان', '4 قصص', '20 قصة'])
    expect([1, 2, 7, 598].map((n) => count('ar', 'picture', n))).toEqual(['صورة واحدة', 'صورتان', '7 صور', '598 صورة'])
    expect(count('es', 'book', 1)).toBe('1 libro')
    Object.assign(deps, {
      installedLangs: async () => ['hi'], origin: async () => 'added' as const, partialLangs: () => [] as string[],
      openLang: async () => fakeReader(['book:tit', 'book:rut', 'book:jon'], ['book:tit']),
    })
    const h = host()
    await renderResources(h, ctx())
    expect(h.textContent).toContain('＋ Biblia: faltan 2 libros')
    Object.assign(deps, { openLang: async () => fakeReader(['book:tit', 'book:rut'], ['book:tit']) })
    const h2 = host()
    await renderResources(h2, ctx())
    expect(h2.textContent).toContain('＋ Biblia: falta 1 libro')
  })

  test('Arabic lists of names use the Arabic comma', async () => {
    Object.assign(deps, {
      installedLangs: async () => ['hi'], origin: async () => 'added' as const, partialLangs: () => [] as string[],
      openLang: async () => fakeReader(['book:tit'], ['book:tit']), // the other parts are not listed
    })
    const h = host()
    await renderResources(h, ctx('ar'))
    expect(h.textContent).toContain('الكلمات الرئيسية، ')
    const e = host()
    await renderResources(e, ctx('es'))
    expect(e.textContent).toContain('Palabras clave, Translation Academy, Historias de la Biblia')
  })
})
