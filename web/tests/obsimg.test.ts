// The Open Bible Stories pictures (obsimg.ts, handoff/mini-servant/plan-obs-imagenes-v3.md): a frame's picture comes from the
// phone, else Door43, else a placeholder, and an OBS answer (never a Bible one) gets a picture per frame. The pictures as their
// own catalog (download, share, remove): obsimg-catalog.test.ts.
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { addObsPictures, cdnUrl, frameKey, frameOfLine, imagesLine, IW, obsStoryOf, pickSource } from '../src/obsimg'
import { md } from '../src/md'
import { ALL_PACKS, installPacks } from './fs-packs'
import { fullPhone, turn } from './harness'

describe('where a picture comes from', () => {
  test('frame keys and Door43 addresses', () => {
    expect(frameKey(3, 5)).toBe('03-05')
    expect(cdnUrl(1, 3)).toBe('https://cdn.door43.org/obs/jpg/360px/obs-en-01-03.jpg')
  })
  test('the phone, else Door43 online, else the placeholder', () => {
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
    // no pictures on the phone (no IndexedDB here): Door43's picture (bun has no navigator: counted online)
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
    expect(imagesLine('es', { bytes: 21076377 })).toBe('598 imágenes · 20.1 MB ✓')
    expect(imagesLine('en', null)).toBe(en.none)
    expect(imagesLine('en', { partial: true })).toBe(en.partial)
    // no zip any more: the pictures come here, or in a .tcpack; the question before mobile data names the size
    for (const ui of ['en', 'es', 'pt', 'fr', 'id', 'hi', 'ar']) {
      expect(IW(ui).none).toContain('.tcpack')
      expect(IW(ui).none).not.toContain('zip')
      expect(IW(ui).metered).toContain('{mb}')
    }
  })
})
