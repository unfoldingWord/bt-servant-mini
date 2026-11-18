// Review fixes of the story row (Corrección 1 of task C): the row agrees with the answer and the send, the accessible names, a
// meaning question keeps its words, grapheme cuts, story-word variants, a stale or failed index. Same fixtures as obsindex.test.ts.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { booksOf, cutGraphemes, type Ctx, ready, resetSuggest } from '../src/suggest'
import { buildObsIndex, findStoriesIx, obsIndexSizes, resetObsIndex, storyTelling } from '../src/obsindex'
import { namedStory, rangeOfRef, storyAt } from '../src/obs'
import { findStories } from '../src/storyfind'
import { keywords } from '../src/search'
import { openLang } from '../src/packs'
import { Composer } from '../src/composer'
import { buildTermIndex, resetTermIndex } from '../src/termindex'
import { has } from '../src/commands'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { forgetFrameTables } from '../src/obs'
import { ALL_PACKS } from './fs-packs'
import { fullPhone } from './harness'
import { withObs } from './obs-fixture'

const store = new Map<string, string>()
;(globalThis as any).localStorage ??= { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k), key: () => null, length: 0 }

// the frame map (obs-frames), put in the packs' xtopics core as tests/obs-frames.test.ts does
const FRAMES = JSON.parse(readFileSync(resolve(import.meta.dir, 'fixtures/obs-frames-c07d4539.json'), 'utf8')).obsFrames as Record<string, [number, number][]>
const origMaps = new Map<string, any>()
async function withFrames(lang: string) {
  const r = await openLang(lang)
  if (!origMaps.has(lang)) origMaps.set(lang, r.mapsOf)
  const orig = origMaps.get(lang)
  r.mapsOf = (async (units: any, o: any) => {
    const m = await orig.call(r, units, o)
    return m.xtopics ? { ...m, xtopics: { ...m.xtopics, core: { ...m.xtopics.core, obsFrames: FRAMES } } } : m
  }) as any
}
let all: Ctx['books'] = null
beforeAll(async () => {
  await fullPhone()
  await withObs('hi')
  for (const l of ['en', 'hi']) await withFrames(l)
  forgetFrameTables()
  all = await booksOf(ALL_PACKS)
  await buildTermIndex(ALL_PACKS)
  await buildObsIndex(ALL_PACKS)
})
afterAll(async () => {
  for (const [l, f] of origMaps) (await openLang(l)).mapsOf = f
  forgetFrameTables()
  resetObsIndex()
  resetTermIndex()
})
const ctx = (ui: string): Ctx => ({ ui, conv: { last: null }, helpsLang: null, packs: ALL_PACKS, books: all })
const row = async (q: string, ui: string) => (await ready(q, ctx(ui))).items
const nums = (items: Awaited<ReturnType<typeof row>>) => items.filter((x) => x.kind === 'story').map((x) => Number(/(\d+)/.exec(x.sheet!.ref!)![1]))
const isStory = (x: { kind: string }) => x.kind === 'story' || x.kind === 'stories'

describe('a meaning question with a story word', () => {
  test('keeps its words handling: no story request, and the lead still reads the rest as the term', async () => {
    for (const [q, ui] of [['¿Qué significa historia', 'es'], ['what does story mean', 'en'], ['qué significa historia de Jesús', 'es'], ['how do I translate story', 'en']] as const)
      expect((await row(q, ui)).filter(isStory), q).toEqual([])
    const a = await row('qué significa Jesús', 'es')
    expect(a[0]!.label).toBe('Jesús · palabra clave')
  })
  test('a story request still ends with the key term', async () => {
    expect((await row('historia de Jesús', 'es')).at(-1)!.label).toBe('Jesús · palabra clave')
  })
})

describe('accessible names', () => {
  test('contain the visible text (WCAG 2.5.3), without the arrow, and say the title\'s language', async () => {
    const strip = (l: string) => l.replace(/\s*[▸◂]$/, '').replace(/…$/, '')
    for (const [q, ui] of [['historia de Jesús', 'es'], ['story of Jesus', 'en'], ['قصة يسوع', 'ar'], ['यीशु की कहानी', 'hi'], ['Génesis 6', 'es'], ['Lucas 2:7', 'es'], ['la historia del hijo pródigo', 'es']] as const)
      for (const it of await row(q, ui))
        if (isStory(it)) {
          expect(it.aria, `${q}: ${it.label}`).toBeTruthy()
          expect(it.aria!.includes(strip(it.label)), `${q}: «${it.aria}» holds «${strip(it.label)}»`).toBe(true)
          expect(/[▸◂]/.test(it.aria!), it.aria).toBe(false)
          if (it.kind === 'story') expect(it.alang).toBeTruthy()
        }
    const r = await row('historia de Jesús', 'es')
    expect(r[0]!.aria).toBe('OBS 26 · Jesus Starts His Ministry')
    expect(r[0]!.alang).toBe('en')
    expect(r.find((x) => x.kind === 'stories')!.aria).toMatch(/^Todas \(\d+\)$/)
    expect((await row('Génesis 6', 'es')).at(-1)!.aria).toBe('Se cuenta en OBS 3: The Flood')
    expect((await row('Genesis 6', 'en')).at(-1)!.aria).toBe('Told in OBS 3: The Flood')
  })
})

describe('title cuts', () => {
  test('by graphemes: no surrogate pair, combining mark or Hindi vowel sign is split', () => {
    expect(cutGraphemes('short', 34)).toBe('short')
    const cut = cutGraphemes('😀'.repeat(40), 10)
    expect([...cut].length).toBe(10)
    expect(cut.endsWith('…')).toBe(true)
    const marks = 'é'.repeat(40)
    expect(cutGraphemes(marks, 5)).toBe(`${'é'.repeat(4)}…`)
    const hi = cutGraphemes('यीशु का जन्म और उसके बाद की बातें जो बहुत लंबी हैं', 12)
    expect(/^\p{M}/u.test(hi)).toBe(false)
    expect(hi.endsWith('…')).toBe(true)
  })
})

describe('story words', () => {
  test('variants and plurals', () => {
    for (const w of ['कहानियां', 'कथाएं', 'القصه', 'حكاية', 'الحكايات', 'cerita-cerita', 'kisah-kisah', 'récits', 'relatos']) expect(has('story', `x ${w} y`), w).toBe(true)
  })
})

describe('the row agrees with the answer and the send', () => {
  test('case C names the story storyAt names (given no passage text) for several passages', async () => {
    const refs = ['gen 6', 'gen 7:1', 'gen 6:9-22', 'luk 2:7', 'mat 3:13-17', 'mrk 1:21-28', 'exo 12:29', 'exo 14', 'jhn 3:16', 'act 2:1-4', 'gen 1:1', 'gen 22:1-14', 'mat 28:1-10', 'jhn 1:1', 'dan 6', 'gen 1:7', 'mat 13:31', 'gen 8:20', 'gen 3:6', 'gen 1:6-8', 'gen 6-8']
    let told = 0
    for (const ref of refs) {
      const chip = storyTelling(rangeOfRef(ref)!, ALL_PACKS)
      const at = await storyAt(ref, 'en')
      expect(chip?.n ?? null, ref).toBe(at?.n ?? null)
      if (at) told++
    }
    console.log(`case C vs storyAt: ${told} of ${refs.length} passages told by a story, all the same`)
    expect(told).toBeGreaterThan(12)
    // the map is really read at the build: Genesis 3:6 is OBS 2 by the frame map (its ranges alone would say another)
    expect(storyTelling(rangeOfRef('gen 3:6')!, ALL_PACKS)?.n).toBe(2)
  })
  test('the top story of a request is the one namedStory sends; every title findStories finds is offered', async () => {
    const texts: [string, string][] = [['historia de Noé', 'es'], ['story of Noah', 'en'], ['la historia del hijo pródigo', 'es'], ['the story of the Flood', 'en'], ['historia de Moisés', 'es'], ['story of the Passover', 'en'], ['historia de Jesús', 'es'], ['story of Jesus', 'en']]
    let named = 0
    for (const [q, ui] of texts) {
      const top = nums(await row(q, ui))[0]
      const n = await namedStory(q, 'en')
      if (n) {
        named++
        expect(top, q).toBe(Number(/\d+/.exec(n.ref)![0]))
      }
      const topic = keywords(q.replace(/^(la |the )?(historia|story)( del| de| of)?( the)? /i, ''))
      const sent = await findStories(topic, 'en')
      if (sent.length) {
        const offered = findStoriesIx(topic, { ui, order: ALL_PACKS, termPacks: ALL_PACKS })!.hits.map((h) => h.n)
        for (const e of sent) expect(offered, `${q}: story ${e.n}`).toContain(e.n)
      }
    }
    expect(named).toBeGreaterThanOrEqual(3)
  })
})

describe('the index over time', () => {
  test('after resetSuggest the old index is gone: the row is today\'s until a new one is built', async () => {
    expect((await row('historia de Noé', 'es')).some(isStory)).toBe(true)
    resetSuggest()
    expect(obsIndexSizes()).toEqual({})
    expect((await row('historia de Noé', 'es')).some(isStory)).toBe(false)
    expect((await row('Génesis 6', 'es')).some(isStory)).toBe(false)
    await buildTermIndex(ALL_PACKS)
    await buildObsIndex(ALL_PACKS)
    expect((await row('historia de Noé', 'es')).some(isStory)).toBe(true)
  })
  test('a pack whose stories do not read leaves no partial index', async () => {
    resetObsIndex()
    const r = await openLang('hi')
    const orig = r.obs
    r.obs = (async () => { throw new Error('boom') }) as any
    await buildObsIndex(ALL_PACKS)
    expect(obsIndexSizes()).toEqual({})
    r.obs = orig
    resetObsIndex()
    await buildObsIndex(ALL_PACKS)
    expect(obsIndexSizes()).toEqual({ en: 50, hi: 50 })
  })
})

describe('composition', () => {
  test('a "✓" tapped while composing is kept, and a waiting story tap does not undo it', async () => {
    const log: string[] = []
    const box = { value: 'Génesis 6', focus() {} }
    const k = new Composer(box, { ui: () => 'es', conv: () => ({ last: null }), packs: () => ALL_PACKS, busy: () => false, send: () => { log.push('send') }, ask: (l: string) => { log.push(`ask ${l}`) }, browse() {} })
    k.books = all
    k.refresh()
    const ok = k.row.items.find((x) => x.kind === 'ok')!
    const st = k.row.items.find((x) => x.kind === 'story')!
    k.compositionStart()
    await k.tap(ok)
    await k.tap(st)
    k.compositionEnd()
    await new Promise((r) => setTimeout(r, 10))
    expect(log).toEqual(['send'])
  })
})
