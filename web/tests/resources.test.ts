// The Resources and server screens (resources.ts, handoff/mini-servant/encargo-ms-menu.md task 3): a card per language with its
// parts, [Download] on a part a downloaded language lacks (never on one that came with the app), a download that stopped as a
// card of its own, downloads that outlive the screen (in memory), cancel and retry, no language, Arabic right to left, and the
// server screen filling in as languages answer. What the packs and the network answer is replaced through `deps`; the shipped
// language is the real es-419 from disk. Runs on a small stand-in for the page (bun has none).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { installPacks } from './fs-packs'
import {
  cancelDownload, deps, downloads, downloadsSummary, onDownloads, renderResources, renderServer, resetDownloads, RT, startDownload, type ResCtx,
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
    expect(h.textContent).toContain('No se pudo descargar: timeout')
    fail = false
    h.button(/Reintentar/)!.click()
    await sleep(5)
    expect(runs).toBe(2)
    expect(downloads()[0]!.error).toBeUndefined()
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
