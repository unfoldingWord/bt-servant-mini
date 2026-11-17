// The Open Bible Stories pictures without internet (obsimg.ts, handoff/mini-servant/plan-obs-imagenes.md): the pack's zip is
// read by its directory, only a file whose hash the app knows goes in, sharing gives the same bytes back, a frame's picture
// comes from the phone, else Door43, else a placeholder, and an OBS answer (never a Bible one) gets a picture per frame.
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import {
  addObsPictures, cdnUrl, exportImages, frameKey, frameOfLine, imagesInstalled, imagesLine, installImages, isZip, IW, localUrl,
  obsStoryOf, pickSource, readIndex, removeImages, setImageStore, setKnown, type ImagePack, type ImageStore,
} from '../src/obsimg'
import known from '../src/data/obsimages.json'
import { md } from '../src/md'
import { ALL_PACKS, installPacks } from './fs-packs'
import { fullPhone, turn } from './harness'

// ------------------------------------------------------------------------------------------------ a zip as obs_images.py makes it

const crc32 = (b: Uint8Array): number => {
  let c = ~0
  for (const x of b) {
    c ^= x
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
/** Stored entries, date 1980-01-01, no extra fields (`method` 8 marks an entry compressed, to test that it is turned down). */
function storedZip(entries: [string, Uint8Array][], method = 0): Uint8Array {
  const parts: Uint8Array[] = [], central: Uint8Array[] = []
  let at = 0
  for (const [name, data] of entries) {
    const n = new TextEncoder().encode(name)
    const h = new DataView(new ArrayBuffer(30))
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true)
    h.setUint16(12, 0x21, true); h.setUint32(14, crc32(data), true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true)
    h.setUint16(26, n.length, true)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true)
    c.setUint16(10, method, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc32(data), true); c.setUint32(20, data.length, true)
    c.setUint32(24, data.length, true); c.setUint16(28, n.length, true); c.setUint32(42, at, true)
    parts.push(new Uint8Array(h.buffer), n, data)
    central.push(new Uint8Array(c.buffer), n)
    at += 30 + n.length + data.length
  }
  const size = central.reduce((s, x) => s + x.length, 0)
  const e = new DataView(new ArrayBuffer(22))
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true)
  e.setUint32(12, size, true); e.setUint32(16, at, true)
  const all = [...parts, ...central, new Uint8Array(e.buffer)]
  const out = new Uint8Array(all.reduce((s, x) => s + x.length, 0))
  let p = 0
  for (const x of all) { out.set(x, p); p += x.length }
  return out
}
const img = (key: string) => new TextEncoder().encode(`RIFF-fake-webp-${key}`)
const KEYS = ['01-01', '01-02', '03-05', '50-17']
const PACK = storedZip([['LICENSE.txt', new TextEncoder().encode('Sweet Publishing, CC BY-SA 3.0')], ...KEYS.map((k): [string, Uint8Array] => [`obs-images/${k}.webp`, img(k)])])
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

function memoryStore(): ImageStore & { rec: ImagePack | null } {
  const s = {
    rec: null as ImagePack | null,
    get: async () => s.rec,
    put: async (p: ImagePack) => { s.rec = p },
    del: async () => { s.rec = null },
  }
  return s
}

afterAll(() => {
  setKnown()
  setImageStore()
})

describe('the pack file', () => {
  test('its directory: every picture with where its bytes are, the license left out', () => {
    const index = readIndex(PACK)
    expect(Object.keys(index).sort()).toEqual(KEYS)
    for (const k of KEYS) {
      const [start, len] = index[k]!
      expect(new TextDecoder().decode(PACK.subarray(start, start + len))).toBe(`RIFF-fake-webp-${k}`)
    }
  })
  test('a compressed entry, a cut file or no zip at all is turned down', () => {
    expect(() => readIndex(storedZip([['obs-images/01-01.webp', img('01-01')]], 8))).toThrow(/compressed/)
    expect(() => readIndex(PACK.subarray(0, PACK.length - 30))).toThrow()
    expect(() => readIndex(new TextEncoder().encode('not a zip at all, just words'))).toThrow(/not a zip/)
  })
  test('a zip is told from a .tcpack by its first bytes (a .tcpack starts with 0x89 "TLP")', () => {
    expect(isZip(PACK)).toBe(true)
    expect(isZip(new Uint8Array([0x89, 0x54, 0x4c, 0x50, 1, 0]))).toBe(false)
    expect(isZip(new Uint8Array([0x50, 0x4b]))).toBe(false)
  })
  test('frame keys and Door43 addresses', () => {
    expect(frameKey(3, 5)).toBe('03-05')
    expect(cdnUrl(1, 3)).toBe('https://cdn.door43.org/obs/jpg/360px/obs-en-01-03.jpg')
  })
  // the pack web/obs_images.py built (outside git: ../../obs-images-pack), when it is on this machine
  const built = resolve(import.meta.dir, '../../../obs-images-pack/bt-servant-mini-obs-images.zip')
  test.skipIf(!existsSync(built))('the built pack: the hash and size the app knows, 598 pictures, every one a WebP', () => {
    const b = new Uint8Array(readFileSync(built))
    expect(sha(b)).toBe(known.sha256)
    expect(b.length).toBe(known.bytes)
    const index = readIndex(b)
    expect(Object.keys(index).length).toBe(known.count)
    expect(known.count).toBe(598)
    for (const [start, len] of Object.values(index)) {
      expect(new TextDecoder().decode(b.subarray(start, start + 4))).toBe('RIFF')
      expect(new TextDecoder().decode(b.subarray(start + 8, start + 12))).toBe('WEBP')
      expect(len).toBeLessThan(120_000)
    }
    // story 1 has 16 frames, story 6 has 7 (the CDN has no 06-08)
    expect(index['01-16']).toBeDefined()
    expect(index['06-07']).toBeDefined()
    expect(index['06-08']).toBeUndefined()
  })
})

describe('on the phone', () => {
  let store: ReturnType<typeof memoryStore>
  beforeEach(() => {
    store = memoryStore()
    setImageStore(store)
    setKnown([{ sha256: sha(PACK), bytes: PACK.length, count: KEYS.length }])
  })

  test('the known file goes in; sharing gives the same bytes back; removing leaves nothing', async () => {
    expect(await imagesInstalled()).toBeNull()
    expect(await installImages(PACK)).toEqual({ count: 4, bytes: PACK.length })
    expect(await imagesInstalled()).toEqual({ count: 4, bytes: PACK.length })
    const out = await exportImages()
    expect(sha(out!)).toBe(sha(PACK))
    await removeImages()
    expect(await imagesInstalled()).toBeNull()
    expect(await exportImages()).toBeNull()
  })
  test('any other file is turned down, in the words of the UI, and nothing is kept', async () => {
    const other = storedZip([['obs-images/01-01.webp', img('01-01')]])
    await expect(installImages(other, 'es')).rejects.toThrow(IW('es').unknown)
    await expect(installImages(new Uint8Array([1, 2, 3]))).rejects.toThrow(IW('en').unknown)
    // the right hash with the wrong count of pictures (the app's record and the file disagree)
    setKnown([{ sha256: sha(PACK), bytes: PACK.length, count: 598 }])
    await expect(installImages(PACK)).rejects.toThrow(IW('en').unknown)
    expect(store.rec).toBeNull()
  })
  test('a frame on the phone: a blob: URL with that picture (made once); a frame not in the pack: none', async () => {
    expect(await localUrl(3, 5)).toBeNull()
    await installImages(PACK)
    const u = await localUrl(3, 5)
    expect(u).toStartWith('blob:')
    expect(await localUrl(3, 5)).toBe(u)
    const [start, len] = store.rec!.index['03-05']!
    const part = store.rec!.blob.slice(start, start + len, 'image/webp')
    expect(part.type).toBe('image/webp')
    expect(await part.text()).toBe('RIFF-fake-webp-03-05')
    expect(await localUrl(2, 1)).toBeNull()
    // two pictures of a frame at once: one URL; installing the same pack again keeps it (a lazy picture still loads)
    const [a, b] = await Promise.all([localUrl(1, 1), localUrl(1, 1)])
    expect(a).toBe(b)
    await installImages(PACK)
    expect(await localUrl(3, 5)).toBe(u)
    // removed: the URL is let go, and none is given
    await removeImages()
    expect(await localUrl(3, 5)).toBeNull()
  })
  test('a failed read of the phone is tried again, not kept as "no pack"', async () => {
    await installImages(PACK)
    let fails = 1
    setImageStore({ ...store, get: async () => { if (fails-- > 0) throw new Error('busy'); return store.rec } })
    expect(await imagesInstalled()).toBeNull()
    expect(await imagesInstalled()).toEqual({ count: 4, bytes: PACK.length })
  })
  test('where a picture comes from: the phone, else Door43 online, else the placeholder', () => {
    expect(pickSource('blob:x', false, 1, 3)).toEqual({ kind: 'local', src: 'blob:x' })
    expect(pickSource('blob:x', true, 1, 3)).toEqual({ kind: 'local', src: 'blob:x' })
    expect(pickSource(null, true, 1, 3)).toEqual({ kind: 'cdn', src: cdnUrl(1, 3) })
    expect(pickSource(null, false, 1, 3)).toEqual({ kind: 'none', src: '' })
  })
})

describe('which answers get pictures', () => {
  test('the story from the call sheet at the end of the details; a Bible passage, a range or no story: none', () => {
    const sheet = (ref: string) => `fast · 0.2 s\nsearch: "ref": "rut 2:3"\nobs: ok (en pack)\n${JSON.stringify({ ref, what: [] }, null, 1)}`
    expect(obsStoryOf(sheet('obs 3:5'))).toBe(3)
    expect(obsStoryOf(sheet('obs 34'))).toBe(34)
    expect(obsStoryOf(sheet('rut 2:3'))).toBeNull()
    expect(obsStoryOf(sheet('obs 3:5-7'))).toBeNull()
    expect(obsStoryOf(sheet('obs 60'))).toBeNull()
    expect(obsStoryOf(undefined)).toBeNull()
    // an earlier "ref" (the search's) does not count: the last one is the answer's sheet
    expect(obsStoryOf(`"ref": "obs 3:5"\n${JSON.stringify({ ref: 'gen 1:1' })}`)).toBeNull()
  })
  test('a frame line of that story', () => {
    expect(frameOfLine('3:5', 3)).toBe(5)
    expect(frameOfLine(' 3:12 ', 3)).toBe(12)
    expect(frameOfLine('4:5', 3)).toBeNull()
    expect(frameOfLine('GLT', 3)).toBeNull()
  })

  // a small stand-in for the page: paragraphs with a first child, `before`, and the elements framePicture makes
  class P {
    firstChild: any; firstElementChild: any; inserted: any[] = []
    constructor(lead: string | null, first = true) {
      const strong = lead === null ? null : { tagName: 'STRONG', textContent: lead }
      this.firstElementChild = strong
      this.firstChild = first ? strong : { nodeType: 3 }
    }
    before(x: any) { this.inserted.push(x) }
  }
  const page = () => {
    const made: any[] = []
    ;(globalThis as any).document = {
      createElement: (tag: string) => {
        const e: any = { tagName: tag.toUpperCase(), className: '', textContent: '', children: [] as any[], parent: null,
          prepend(c: any) { c.parent = e; e.children.unshift(c) },
          remove() { if (e.parent) e.parent.children = e.parent.children.filter((x: any) => x !== e) },
          querySelector: (q: string) => e.children.find((c: any) => (q === 'img' ? c.tagName === 'IMG' : c.className === q.slice(1))) ?? null }
        made.push(e)
        return e
      },
    }
    return made
  }
  test('an OBS answer: a picture before each frame of its story, none before other lines', async () => {
    setImageStore(memoryStore()) // no pack on the phone: Door43's picture (bun has no navigator: counted online)
    page()
    const ps = [new P('3:5'), new P('GLT'), new P('3:6', false), new P(null), new P('4:1'), new P('3:7')]
    const box: any = { querySelectorAll: () => ps }
    expect(addObsPictures(box, JSON.stringify({ ref: 'obs 3' }), 'en')).toBe(2)
    expect(ps.map((p) => p.inserted.length)).toEqual([1, 0, 0, 0, 0, 1])
    expect(ps[0]!.inserted[0].className).toBe('obs-pic')
    await new Promise((r) => setTimeout(r, 0))
    const pic = ps[0]!.inserted[0].children[0]
    expect(pic.tagName).toBe('IMG')
    expect([pic.src, pic.alt, pic.loading, pic.width, pic.height]).toEqual([cdnUrl(3, 5), 'OBS 3:5', 'lazy', 640, 360])
    // the picture does not load (offline, Door43 down): the placeholder, in the words of the UI
    pic.onerror()
    expect(ps[0]!.inserted[0].children[0].className).toBe('obs-pic-none')
    expect(ps[0]!.inserted[0].children[0].textContent).toBe(IW('en').missing)
    // a Bible answer is left as it is
    const bible = [new P('2:3')]
    expect(addObsPictures({ querySelectorAll: () => bible } as any, JSON.stringify({ ref: 'rut 2:3' }), 'en')).toBe(0)
    expect(bible[0]!.inserted).toEqual([])
    delete (globalThis as any).document
  })
})

describe('the real answers', () => {
  beforeEach(async () => { await fullPhone() })
  afterAll(async () => { await installPacks(ALL_PACKS) })

  test('OBS 3:5 and OBS 34: the details name the story and every frame line is drawn as <p><strong>N:F</strong>', async () => {
    const one: any = await turn({ last: null }, { q: 'What does OBS 3:5 say?' }, 'en')
    expect(obsStoryOf(one.reply.meta)).toBe(3)
    expect(md(one.reply.info)).toContain('<p><strong>3:5</strong> ')
    const whole: any = await turn({ last: null }, { q: 'OBS 34' }, 'en')
    expect(obsStoryOf(whole.reply.meta)).toBe(34)
    expect((md(whole.reply.info).match(/<p[^>]*><strong>34:\d+<\/strong> /g) ?? []).length).toBe(10)
    // a Bible passage: no story
    const ruth: any = await turn({ last: null }, { q: 'Ruth 2:3' }, 'en')
    expect(obsStoryOf(ruth.reply.meta)).toBeNull()
  })
})

describe('words', () => {
  test('every UI language (and pt) has every line; the menu line with the size', () => {
    const en = IW('en')
    for (const ui of ['es', 'pt', 'fr', 'id', 'hi', 'ar']) {
      const w = IW(ui)
      for (const k of Object.keys(en) as (keyof typeof en)[]) {
        expect(w[k], `${ui}.${k}`).toBeTruthy()
        if (k !== 'credit') expect(w[k], `${ui}.${k}`).not.toBe(en[k])
      }
    }
    expect(IW('pt-br')).toBe(IW('pt'))
    expect(IW('es-419')).toBe(IW('es'))
    expect(IW('sw')).toBe(en)
    expect(imagesLine('es', { count: 598, bytes: 20208753 })).toBe('598 imágenes · 19.3 MB ✓')
    expect(imagesLine('en', null)).toBe(en.none)
    for (const ui of ['en', 'es', 'pt', 'fr', 'id', 'hi', 'ar']) expect(IW(ui).none).toContain('bt-servant-mini-obs-images.zip')
  })
})
