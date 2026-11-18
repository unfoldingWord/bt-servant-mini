// A story question with more than one possible story offers them instead of picking one (storychoice.ts, pipeline.ts route obs-question;
// Abel, Nov 18). The English pack has the stories of Mini's packs server (obs-fixture.ts: every title, the frames of some stories).
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { ALL_PACKS, installPacks } from './fs-packs'
import { fullPhone, nextSteps, stepTarget, turn } from './harness'
import { withObs } from './obs-fixture'
import type { ConvState } from '../src/pipeline'
import { namedStories, choiceReply, MAX_CHOICES } from '../src/storychoice'
import { buildObsIndex, findStoriesIx, resetObsIndex } from '../src/obsindex'
import { buildTermIndex, resetTermIndex } from '../src/termindex'
import { keywords } from '../src/search'

afterAll(async () => {
  resetObsIndex()
  resetTermIndex()
  await installPacks(ALL_PACKS)
})
beforeEach(async () => {
  await installPacks(ALL_PACKS)
  await fullPhone()
})
const ask = async (q: string, ui: string, c: ConvState = { last: null }) => turn(c, { q }, ui)
const steps = (r: any) => nextSteps({ reply: r.reply } as any)

describe('«historia de Jesús»: choices, the birth first', () => {
  for (const [q, ui, line] of [['historia de Jesús', 'es', 'Varias historias hablan de Jesús. ¿Cuál quieres ver?'], ['the story of Jesus', 'en', 'Several stories are about Jesus. Which one do you want to see?'],
    ['قصة يسوع', 'ar', 'هناك عدة قصص عن يسوع. أيّها تريد أن ترى؟']] as const)
    test(`${q} (${ui})`, async () => {
      const r: any = await ask(q, ui)
      expect(r.answered).toBe('choose')
      expect(r.reply.intro).toBe(line)
      const f = steps(r)
      expect(f.length).toBeLessThanOrEqual(5)
      // the stories in the typing row's order: the titles with Jesus in the stories' order, OBS 23 first
      expect(f.map((x: any) => stepTarget(x)).slice(0, 4)).toEqual(['obs 23 text,notes', 'obs 24 text,notes', 'obs 25 text,notes', 'obs 26 text,notes'])
      expect(f[0].label).toBe('OBS 23 · The Birth of Jesus')
      expect(f[0].sheet).toMatchObject({ intent: 'passage', ref: 'obs 23', what: ['text', 'notes'], lang: 'en' })
      // more than five: the last button lists them all, in Browse, filtered, as the typing row's «Todas»
      const all = f.at(-1)
      expect(all.browse).toMatchObject({ obs: true, lang: 'en' })
      expect(all.browse.only.slice(0, 4)).toEqual([23, 24, 25, 26])
      expect(all.label).toMatch(/\(\d+\)/)
      expect(all.browse.only.length).toBeGreaterThan(MAX_CHOICES)
    })
  test('a tap on a story is answered as a story button is', async () => {
    const c: ConvState = { last: null }
    const r: any = await ask('historia de Jesús', 'es', c)
    const s = steps(r)[0].sheet
    const a: any = await turn(c, { q: '', sheet: s } as any, 'es')
    expect(a.ref).toBe('obs 23')
  })
  test('the order is the typing row\'s (findStoriesIx) for the same words', async () => {
    await buildTermIndex(ALL_PACKS)
    await buildObsIndex(ALL_PACKS)
    const row = findStoriesIx(keywords('Jesús'), { ui: 'es', order: ALL_PACKS, termPacks: ALL_PACKS, partial: false })!.hits.map((h) => h.n)
    const m = await namedStories('historia de Jesús', 'es')
    expect(m && 'many' in m).toBe(true)
    const send = (m as any).many.map((e: any) => e.n)
    expect(send.slice(0, 4)).toEqual(row.slice(0, 4))
    expect(send[0]).toBe(23)
  })
})

describe('one story is clearly it: answered directly, as before', () => {
  for (const [q, ui, ref] of [['la historia de Noé', 'es', 'obs 3'], ['the story of Noah', 'en', 'obs 3'], ['قصة نوح', 'ar', 'obs 3'],
    ['la historia del hijo pródigo', 'es', 'obs 35'], ['the story of the prodigal son', 'en', 'obs 35'], ['قصة الابن الضال', 'ar', 'obs 35'],
    ['la historia de Moisés', 'es', 'obs 9']] as const)
    test(`${q} (${ui}) → ${ref}`, async () => {
      const r: any = await ask(q, ui)
      expect(r.answered).toBe('passage')
      expect(r.ref).toBe(ref)
    })
})

describe('no story: the search goes on as before', () => {
  test('Jonah (OBS has none): the verses of Jonah', async () => {
    for (const [q, ui] of [['la historia de Jonás', 'es'], ['the story of Jonah', 'en']] as const) {
      const r: any = await ask(q, ui)
      expect(r.answered, q).toBe('search')
      expect(r.ref, q).toMatch(/^jon /)
    }
  })
  test('another word, or a name in no story: not a story (the review of Nov 17)', async () => {
    for (const q of ['the story of Paul shipwreck', 'la historia de Lázaro y el rico', 'l’histoire de José et Marie']) expect(await namedStories(q, 'en'), q).toBeNull()
  })
})

describe('the choice itself', () => {
  test('five or fewer: a button each; more: four and «Todas (n)»', () => {
    const mk = (n: number) => ({ many: Array.from({ length: n }, (_, i) => ({ n: i + 1, title: `T${i + 1}` })), topic: 'x', lang: 'en' })
    expect(choiceReply(mk(5), 'en').follow.length).toBe(5)
    expect(choiceReply(mk(5), 'en').follow.every((f) => !!f.sheet)).toBe(true)
    const six = choiceReply(mk(6), 'en').follow
    expect(six.length).toBe(5)
    expect(six[4]!.label).toBe('All (6)')
    expect(six[4]!.browse?.only).toEqual([1, 2, 3, 4, 5, 6])
    expect(choiceReply(mk(6), 'es').follow[4]!.label).toBe('Todas (6)')
  })
})
