// The map of each Open Bible Stories frame to its verses (obs-frames, in the common xtopics core; source bible-story-builder at
// c07d4539): a frame's exact passages under it and on its buttons, "told in OBS n:f" from a verse by the map, and the picture of
// that frame for a one-verse answer. The packs on disk predate the table, so the real table (fixtures/obs-frames-c07d4539.json,
// 586 frames) is put in the xtopics core the readers read; without it everything is as before (obs.test.ts).
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PackReader } from '@bt-synergy/language-pack-client'
import { ALL_PACKS, installPacks } from './fs-packs'
import { fullPhone } from './harness'
import { withObs } from './obs-fixture'
import { forgetFrameTables, framesTelling, obsAnswer, obsSteps, pictureFrame, rangeOfRef, storyAt, storyStep } from '../src/obs'
import { addVersePicture, cdnUrl, IW, setImageStore, verseOf, type ImagePack, type ImageStore } from '../src/obsimg'
import { openLang } from '../src/packs'

afterAll(async () => { await installPacks(ALL_PACKS) })

const FRAMES = JSON.parse(readFileSync(resolve(import.meta.dir, 'fixtures/obs-frames-c07d4539.json'), 'utf8')).obsFrames as Record<string, [number, number][]>
const SRC = 'bcv-commons/bible-story-builder'
const origMaps = new WeakMap<PackReader, PackReader['mapsOf']>()
/** The reader of `lang` with the table in its xtopics core (`on`), or as the pack has it. */
async function withFrames(lang = 'en', on = true): Promise<PackReader> {
  forgetFrameTables()
  const r = await openLang(lang)
  const orig = origMaps.get(r) ?? r.mapsOf
  origMaps.set(r, orig)
  r.mapsOf = async (units, o) => {
    const m = await orig.call(r, units, o)
    if (!on || !m.xtopics) return m
    return { ...m, xtopics: { ...m.xtopics, core: { ...m.xtopics.core, res: [...m.xtopics.core.res, [SRC, 'c07d4539']], obsFrames: FRAMES } } }
  }
  return r
}

describe('the frame map', () => {
  beforeEach(async () => {
    await fullPhone()
    await withObs('en')
    await withFrames('en')
  })

  test('a verse is told in the frame the map gives: Genesis 1:7 is OBS 1:3, Matthew 13:31 is OBS 34:1', async () => {
    const t = await storyAt('gen 1:7', 'en')
    expect([t?.n, t?.f, t?.ref, t?.also]).toEqual([1, 3, 'obs 1:3', undefined])
    expect((await storyAt('mat 13:31', 'en'))?.ref).toBe('obs 34:1')
    // where the words used to guess: Genesis 8:20 is the frame that tells it, 3:14
    expect((await storyAt('gen 8:20', 'en'))?.ref).toBe('obs 3:14')
  })

  test('a verse in several frames: the most specific first, the next two named on the button', async () => {
    const t = await storyAt('gen 3:6', 'en')
    expect([t?.ref, t?.also]).toEqual(['obs 2:5', ['obs 49:8', 'obs 48:2']])
    const s = await storyStep('gen 3:6', 'en', 'en')
    expect(s?.label).toBe('This part is told in OBS 2:5: Sin Enters the World (also OBS 49:8, OBS 48:2)')
    expect((await storyStep('gen 3:6', 'es', 'es'))?.label).toContain('(también OBS 49:8, OBS 48:2)')
  })

  test('a passage: the frame that covers all of it; a chapter, an introduction or a passage no frame covers: the stories as before', async () => {
    expect((await framesTelling(await openLang('en'), rangeOfRef('gen 6-8')!)).length).toBeGreaterThan(5)
    // Genesis 1:6-8 is the whole of OBS 1:3 (a frame that touches only 1:8 does not win)
    expect((await storyAt('gen 1:6-8', 'en'))?.ref).toBe('obs 1:3')
    // Genesis 1:6-12 is in no single frame, and chapters and introductions go by the stories' ranges: the same as without the map
    for (const ref of ['gen 1:6-12', 'gen 6-8', 'gen 6', 'gen 6:intro']) {
      const withMap = await storyAt(ref, 'en')
      await withFrames('en', false)
      const without = await storyAt(ref, 'en')
      await withFrames('en')
      expect([ref, withMap]).toEqual([ref, without])
    }
    // Ruth 1:1: no frame and no story
    expect(await storyAt('rut 1:1', 'en')).toBeNull()
  })
  test('the other frames on the button in Arabic, French, Indonesian and Hindi too', async () => {
    for (const [ui, word] of [['ar', 'وأيضًا'], ['fr', 'aussi'], ['id', 'juga'], ['hi', 'यह भी']] as const) {
      expect((await storyStep('gen 3:6', 'en', ui))?.label).toContain(`${word}`)
    }
  })

  test('a frame: its own passages under its text and on its buttons', async () => {
    const { answer, facts } = await obsAnswer({ ref: 'obs 1:3', what: ['text'], lang: 'en' }, 'en')
    expect(facts.frameRefs).toEqual(['gen 1:6-8'])
    expect(answer).toContain('*Genesis 1:6–8*')
    const steps = await obsSteps(facts, 'en', 'en')
    expect(steps.filter((s) => s.k === 'bible').map((s) => s.label)).toEqual(['Bible: Genesis 1:6–8'])
    // a frame of several books: each passage
    const many = await obsAnswer({ ref: 'obs 1:7', what: ['text'], lang: 'en' }, 'en')
    expect(many.facts.frameRefs).toEqual(['gen 1:20', 'gen 1:22'])
    // a whole story keeps the story's passages
    const story = await obsAnswer({ ref: 'obs 3', what: ['text'], lang: 'en' }, 'en')
    expect(story.facts.frameRefs).toEqual([])
    expect((await obsSteps(story.facts, 'en', 'en')).filter((s) => s.k === 'bible').map((s) => s.ref)).toEqual(['gen 6:1-8:22'])
  })

  test('the picture of a one-verse answer: the frame that tells it; none for a passage, a chapter or a verse no frame tells', async () => {
    expect(await pictureFrame('gen 1:7', 'en')).toEqual({ n: 1, f: 3 })
    expect(await pictureFrame('gen 3:6', 'en')).toEqual({ n: 2, f: 5 })
    expect(await pictureFrame('gen 1:6-8', 'en')).toBeNull()
    expect(await pictureFrame('gen 1', 'en')).toBeNull()
    expect(await pictureFrame('rut 1:1', 'en')).toBeNull()
    // the verse an answer is about, from its call sheet: one verse of a book only
    expect(verseOf('{"intent":"passage","ref":"gen 1:7"}')).toBe('gen 1:7')
    for (const m of ['{"ref":"gen 1:6-8"}', '{"ref":"obs 1:3"}', '{"ref":"gen 1"}', undefined]) expect(verseOf(m)).toBeNull()
  })

  test('a pack whose common catalog predates the table: no frame refs, no picture, the old guess for "told in"', async () => {
    await withFrames('en', false)
    expect(await pictureFrame('gen 1:7', 'en')).toBeNull()
    expect((await obsAnswer({ ref: 'obs 1:3', what: ['text'], lang: 'en' }, 'en')).facts.frameRefs).toEqual([])
    expect((await storyAt('gen 3:6', 'en'))?.n).toBe(2)
  })

  test('the picture drawn: above a one-verse answer with "OBS n:f" and the credit; nothing for a passage, an OBS answer or offline', async () => {
    const mem: ImageStore = { get: async () => null as ImagePack | null, put: async () => {}, del: async () => {} }
    setImageStore(mem) // no pictures on the phone: Door43's (bun has no navigator: counted online)
    ;(globalThis as any).document = {
      createElement: (tag: string) => {
        const e: any = { tagName: tag.toUpperCase(), className: '', textContent: '', children: [] as any[], parent: null,
          append(...c: any[]) { for (const x of c) { x.parent = e; e.children.push(x) } },
          prepend(c: any) { c.parent = e; e.children.unshift(c) },
          remove() { if (e.parent) e.parent.children = e.parent.children.filter((x: any) => x !== e) } }
        return e
      },
    }
    const frameOf = (ref: string) => pictureFrame(ref, 'en')
    const slot: any = document.createElement('div')
    expect(await addVersePicture(slot, JSON.stringify({ intent: 'passage', ref: 'gen 1:7' }), 'es', frameOf)).toEqual({ n: 1, f: 3 })
    const fig = slot.children[0]
    expect(fig.className).toBe('obs-pic verse-pic')
    const [img, cap] = fig.children
    expect([img.src, img.alt]).toEqual([cdnUrl(1, 3), 'OBS 1:3'])
    expect(cap.textContent).toBe(`OBS 1:3 · ${IW('es').credit}`)
    // a picture that does not load leaves no box (no placeholder for a verse)
    img.onerror()
    expect(slot.children).toEqual([])
    for (const meta of [{ ref: 'gen 1:6-8' }, { ref: 'obs 1:3' }, { ref: 'rut 1:1' }]) {
      const box: any = document.createElement('div')
      expect(await addVersePicture(box, JSON.stringify(meta), 'en', frameOf)).toBeNull()
      expect(box.children).toEqual([])
    }
    // offline with no pictures on the phone: nothing
    ;(globalThis as any).navigator = { onLine: false }
    const off: any = document.createElement('div')
    expect(await addVersePicture(off, JSON.stringify({ ref: 'gen 1:7' }), 'en', frameOf)).toBeNull()
    expect(off.children).toEqual([])
    delete (globalThis as any).navigator
    delete (globalThis as any).document
  })
})
