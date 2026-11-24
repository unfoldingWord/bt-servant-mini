// How to ask, what its "Try it" sends: nothing while an answer is on its way or the PIN lock is on, the second question dropped when
// the lock comes on or the conversation changes in between, and the follow card (a passage, then "next verse") asked in one
// conversation state. The card and its example read the same pack for the Bible Stories.
import { afterAll, describe, expect, test } from 'bun:test'
import { ALL_PACKS, installPacks } from './fs-packs'
import { withObs } from './obs-fixture'
import { turn } from './harness'
import { askAll, askSheet, cardsFor, examplesOf, type HowtoHooks, phoneHas } from '../src/howto'
import type { ConvState } from '../src/pipeline'

afterAll(async () => { await installPacks(ALL_PACKS) })

/** Hooks that record what was asked; `state` is what the page says. */
function hooks(state: { busy?: boolean; locked?: boolean; conv?: string; onAsk?: (q: string) => void }) {
  const asked: string[] = []
  const h: HowtoHooks = {
    ask: (q) => { asked.push(q); state.onAsk?.(q); return true },
    busy: () => !!state.busy, locked: () => !!state.locked, conv: () => state.conv ?? 'c1',
    type: () => {}, browse: () => {}, onlineSettings: () => {}, saved: () => {}, menu: () => {},
    askSheet: (label) => { asked.push(`sheet:${label}`); return true },
    packs: () => ['en'], helpsLang: () => null,
  }
  return { h, asked }
}

describe('Try it sends only when the chat can take it', () => {
  test('an answer on its way, or the lock on: nothing is asked, at once (no waiting for a minute)', async () => {
    for (const state of [{ busy: true }, { locked: true }]) {
      const { h, asked } = hooks(state)
      const t0 = Date.now()
      expect(await askAll(['a', 'b'], h)).toBe(false)
      expect(await askSheet({ label: 'x', ref: 'rut 2:4', what: ['who'], lang: 'en' }, h)).toBe(false)
      expect(asked).toEqual([])
      expect(Date.now() - t0).toBeLessThan(500)
    }
  })

  test('free: the questions go one after the other, each when the answer before is done', async () => {
    const state: { busy: boolean; onAsk?: (q: string) => void } = { busy: false }
    state.onAsk = () => { state.busy = true; setTimeout(() => { state.busy = false }, 30) } // an answer takes a moment
    const { h, asked } = hooks(state)
    expect(await askAll(['Rut 2:3', 'versículo siguiente'], h, 5)).toBe(true)
    expect(asked).toEqual(['Rut 2:3', 'versículo siguiente'])
    expect(await askSheet({ label: 'Quién es quién en Rut 2:4', ref: 'rut 2:4', what: ['who'], lang: 'es-419' }, hooks({}).h)).toBe(true)
  })

  test('the second question is dropped when the lock came on, or the conversation changed, while the first was answered', async () => {
    for (const change of ['lock', 'conversation'] as const) {
      const state: { busy: boolean; locked?: boolean; conv?: string; onAsk?: (q: string) => void } = { busy: false }
      state.onAsk = () => {
        state.busy = true
        setTimeout(() => {
          state.busy = false
          if (change === 'lock') state.locked = true
          else state.conv = 'c2'
        }, 20)
      }
      const { h, asked } = hooks(state)
      expect(await askAll(['Rut 2:3', 'versículo siguiente'], h, 5)).toBe(false)
      expect(asked, change).toEqual(['Rut 2:3'])
    }
  })

  test('a hook that does not take the question (the page refused it) stops the rest', async () => {
    const { h, asked } = hooks({})
    h.ask = (q) => { asked.push(q); return false }
    expect(await askAll(['a', 'b'], h, 5)).toBe(false)
    expect(asked).toEqual(['a'])
  })

  test('the follow card: its passage and then its next verse, asked through the guide in one conversation, are both answered', async () => {
    if (!ALL_PACKS.includes('en')) return
    await installPacks(['en'])
    await withObs('en')
    const ex = (await examplesOf('en', ['en'], 'en'))!
    const card = cardsFor('en', ex, true, true, { obs: false, books: true, people: false, places: false }).find((c) => c.id === 'follow')!
    expect(card.ask).toEqual([ex.passage, ex.follow[0]])
    const conv: ConvState = { last: null }
    const answers: Awaited<ReturnType<typeof turn>>[] = []
    const state = { busy: false }
    const { h } = hooks(state)
    h.ask = (q) => {
      state.busy = true
      void turn(conv, { q }, 'en').then((r) => { answers.push(r) }).finally(() => { state.busy = false })
      return true
    }
    expect(await askAll(card.ask, h, 5)).toBe(true)
    while (state.busy) await new Promise((r) => setTimeout(r, 5))
    expect(answers.length).toBe(2)
    expect(answers[0]!.ref).toBe(ex.ref)
    const [code, cv] = ex.ref.split(' ')
    const [ch, v] = cv!.split(':').map(Number)
    expect(answers[1]!.ref).toBe(`${code} ${ch}:${v! + 1}`) // the next verse of the same passage
    expect(answers[1]!.found).toBeGreaterThan(0)
  }, 120000)
})

describe('the Bible Stories card and its example read the same pack', () => {
  test('the stories only in English, the app and its pack in Spanish: the card is there and so is its example', async () => {
    if (!ALL_PACKS.includes('es-419') || !ALL_PACKS.includes('en')) return
    await installPacks(['es-419', 'en'])
    await withObs('en')
    // (the first pack on the phone has none: both look further, to English, the same way)
    expect((await phoneHas(['es-419', 'en'])).obs).toBe(true)
    const ex = (await examplesOf('es', ['es-419', 'en'], 'es-419'))!
    expect(ex.obs).toMatch(/^OBS \d+:\d+$/)
  }, 120000)

  test('no stories anywhere: neither the card nor the example', async () => {
    if (!ALL_PACKS.includes('es-419') || !ALL_PACKS.includes('en')) return
    await installPacks(['es-419', 'en'])
    await withObs('en', 'none')
    expect((await phoneHas(['es-419', 'en'])).obs).toBe(false)
    const ex = (await examplesOf('es', ['es-419', 'en'], 'es-419x'))!
    expect(ex.obs).toBeNull()
  }, 120000)
})
