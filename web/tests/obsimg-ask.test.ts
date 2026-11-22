// Getting the pictures from the frame (obsimgask.ts, issue #8): in the placeholder, [Download] and [Load from a file]; online
// without the pictures, a quiet line and [Download] on the first picture only; nothing extra with the pictures on the phone;
// the download is Resources' (mobile data asked first, no internet said); the frames redraw when the pictures arrive.
// Runs on a small stand-in for the page (bun has none); what the phone and the network answer goes through `deps`.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { fillPicture, IW } from '../src/obsimg'
import { reloadPacks } from '../src/packs'
import { deps, resetDownloads, RT } from '../src/resources'

class El {
  tagName: string; className = ''; children: El[] = []; parentElement: El | null = null; text = ''
  lang = ''; dir = ''; type = ''; hidden = false; accept = ''; src = ''; alt = ''; files: unknown[] | null = null
  onclick: (() => void) | null = null; onerror: (() => void) | null = null; onchange: (() => void) | null = null
  constructor(tag: string) { this.tagName = tag.toUpperCase() }
  get isConnected(): boolean { return this.parentElement ? this.parentElement.isConnected : this === root }
  get textContent(): string { return [this.text, ...this.children.map((c) => c.textContent)].filter(Boolean).join(' ') }
  set textContent(v: string) { this.children = []; this.text = v }
  private adopt(c: El) { c.remove(); c.parentElement = this }
  appendChild(c: El) { this.adopt(c); this.children.push(c); return c }
  append(...cs: El[]) { for (const c of cs) this.appendChild(c) }
  prepend(c: El) { this.adopt(c); this.children.unshift(c) }
  replaceChildren(...cs: El[]) { for (const c of this.children) c.parentElement = null; this.children = []; this.text = ''; this.append(...cs) }
  after(c: El) { const p = this.parentElement!; c.remove(); c.parentElement = p; p.children.splice(p.children.indexOf(this) + 1, 0, c) }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((x) => x !== this); this.parentElement = null }
  all(): El[] { return this.children.flatMap((c) => [c, ...c.all()]) }
  querySelector(q: string): El | null {
    const m = (e: El) => (q.startsWith('.') ? e.className.split(' ').includes(q.slice(1)) : e.tagName === q.toUpperCase())
    return this.all().find(m) ?? null
  }
  buttons(): El[] { return this.all().filter((e) => e.tagName === 'BUTTON') }
  button(re: RegExp): El | undefined { return this.buttons().find((b) => re.test(b.textContent)) }
}
const root = new El('body')
const saved = { document: (globalThis as any).document, navigator: (globalThis as any).navigator, ls: (globalThis as any).localStorage }
const real = { ...deps }
const sleep = (ms = 15) => new Promise((r) => setTimeout(r, ms))
const online = (on: boolean) => { Object.defineProperty(globalThis, 'navigator', { value: { onLine: on }, configurable: true }) }
/** A frame's figure on the page, filled and waited for. */
async function frame(ui = 'en', f = 3): Promise<El> {
  const fig = new El('figure')
  fig.className = 'obs-pic'
  root.append(fig)
  fillPicture(fig as unknown as HTMLElement, 1, f, `OBS 1:${f}`, ui)
  await sleep()
  return fig
}
const none = (img: any = null) => { deps.imagesInstalled = async () => img }

beforeAll(async () => {
  await import('../src/obsimgask') // loaded on demand by obsimg.ts: warm, so a frame is drawn within the wait
  ;(globalThis as any).document = { createElement: (t: string) => new El(t), querySelector: (q: string) => root.querySelector(q) }
  const mem = new Map<string, string>()
  ;(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) }
})
afterAll(() => {
  ;(globalThis as any).document = saved.document
  ;(globalThis as any).localStorage = saved.ls
  if (saved.navigator) Object.defineProperty(globalThis, 'navigator', { value: saved.navigator, configurable: true })
  else delete (globalThis as any).navigator
  Object.assign(deps, real)
})
beforeEach(() => {
  root.replaceChildren()
  resetDownloads()
  Object.assign(deps, real)
  none()
  deps.meteredNow = () => false
  online(false)
})

describe('the placeholder (no pictures, no internet)', () => {
  test('both buttons in the frame, in the language of the app; the words the issue asks for', async () => {
    const fig = await frame('en')
    const box = fig.querySelector('.obs-pic-none')!
    expect(box.textContent).toContain(IW('en').missing)
    expect(box.button(/Download pictures \(~20 MB\)/)).toBeTruthy()
    expect(box.button(/Load from a file/)).toBeTruthy()
    expect(fig.querySelector('.obs-pic-note')).toBeNull()
  })
  test('six languages, right to left in Arabic', async () => {
    for (const ui of ['es', 'pt', 'fr', 'id', 'hi', 'ar']) {
      root.replaceChildren()
      const box = (await frame(ui)).querySelector('.obs-pic-none')!
      expect(box.button(new RegExp(IW(ui).getPics.replace(/[()~]/g, '\\$&')))).toBeTruthy()
      expect(box.button(new RegExp(IW(ui).fromFile))).toBeTruthy()
      expect(box.dir).toBe(ui === 'ar' ? 'rtl' : 'ltr')
    }
  })
  test('a download not finished says Continue', async () => {
    none({ partial: true })
    const box = (await frame('en')).querySelector('.obs-pic-none')!
    expect(box.button(/Continue/)).toBeTruthy()
    expect(box.button(/Download pictures/)).toBeUndefined()
  })
  test('Download with no internet says so; Load from a file opens the picker', async () => {
    const box = (await frame('en')).querySelector('.obs-pic-none')!
    box.button(/Download pictures/)!.onclick!()
    await sleep()
    expect(box.button(new RegExp(RT('en').needNet))).toBeTruthy()
    const input = box.all().find((e) => e.tagName === 'INPUT')!
    expect([input.type, input.accept]).toEqual(['file', '.tcpack,application/octet-stream'])
  })
  test('Download online: the question before mobile data, then the progress; the same download as Resources', async () => {
    online(true)
    deps.meteredNow = () => true
    let offered = 0
    deps.imagesOffer = async () => { offered++; return { bytes: 21_000_000, segments: [], sizes: {} } as any }
    let release!: () => void
    deps.downloadImages = ((onP: any) => new Promise((res) => { onP({ bytes: 5_242_880, totalBytes: 20_971_520 }); release = () => res({ bytes: 1 }) })) as any
    // online and no local picture: Door43's picture and the line; its failure to load brings the placeholder
    const fig = await frame('en')
    fig.querySelector('img')!.onerror!()
    await sleep()
    const box = fig.querySelector('.obs-pic-none')!
    box.button(/Download pictures/)!.onclick!()
    await sleep()
    expect(box.button(/21\.\d MB over mobile data|20\.\d MB over mobile data/)).toBeTruthy()
    box.button(/over mobile data/)!.onclick!()
    await sleep()
    expect(box.textContent).toContain('Downloading… 5.0 / 20.0 MB')
    expect(box.buttons()).toHaveLength(0)
    release()
    await sleep()
    expect(offered).toBeGreaterThan(0)
  })
  test('a file with the pictures: the frame is drawn again once they are on the phone', async () => {
    const fig = await frame('en')
    const box = fig.querySelector('.obs-pic-none')!
    expect(box).toBeTruthy()
    deps.importPack = async () => ({ langs: [], rejected: 0, images: true as const })
    deps.imagesInstalled = async () => ({ bytes: 21_000_000 })
    const input = box.all().find((e) => e.tagName === 'INPUT')!
    input.files = [{ arrayBuffer: async () => new ArrayBuffer(4) }]
    await input.onchange!()
    reloadPacks() // what importing does
    await sleep(40)
    // the frame was drawn again (the stand-in phone holds no real pictures, so it ends as a placeholder, now with nothing to ask)
    const again = fig.querySelector('.obs-pic-none')
    expect(again).not.toBe(box)
    expect(again?.buttons() ?? []).toHaveLength(0)
  })
})

describe('a picture from the internet (no pictures on the phone)', () => {
  test('a quiet line and Download under the first picture only', async () => {
    online(true)
    const first = await frame('es', 1)
    expect(first.querySelector('img')).toBeTruthy()
    const note = first.querySelector('.obs-pic-note')!
    expect(note.textContent).toContain(IW('es').net)
    expect(note.button(new RegExp(IW('es').download))).toBeTruthy()
    expect(note.button(/Cargar|archivo/)).toBeUndefined()
    const second = await frame('es', 2)
    expect(second.querySelector('img')).toBeTruthy()
    expect(second.querySelector('.obs-pic-note')).toBeNull()
  })
  test('Arabic: the line is right to left; a download not finished says Continue', async () => {
    online(true)
    none({ partial: true })
    const note = (await frame('ar')).querySelector('.obs-pic-note')!
    expect(note.dir).toBe('rtl')
    expect(note.button(new RegExp(IW('ar').resume))).toBeTruthy()
  })
  test('with the pictures on the phone: nothing extra', async () => {
    online(true)
    none({ bytes: 21_000_000 })
    const fig = await frame('en')
    expect(fig.querySelector('.obs-pic-none')).toBeNull()
    expect(fig.querySelector('.obs-pic-note')?.buttons() ?? []).toHaveLength(0)
    expect(fig.querySelector('.obs-pic-note')?.textContent ?? '').not.toContain(IW('en').net)
  })
})

describe('words', () => {
  test('the new lines exist and differ from English in every language', () => {
    for (const ui of ['es', 'pt', 'fr', 'id', 'hi', 'ar']) {
      for (const k of ['getPics', 'fromFile', 'net'] as const) {
        expect(IW(ui)[k], `${ui}.${k}`).toBeTruthy()
        expect(IW(ui)[k], `${ui}.${k}`).not.toBe(IW('en')[k])
      }
    }
  })
})
