// The 5M tables come in the language asked, not the app's (Abel, Nov 19: app in es, content es-419, in a 5M session of OBS 6
// "En indonesio" gave the card with the English tables; the `id` pack has 5M for stories 1–16). Real packs (en, id, es-419).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { installPacks, usePacksDir } from './fs-packs'
import { turn } from './harness'
import { type ConvState, type Made, answer, env } from '../src/pipeline'
import { fixtureNow5, fixtureOf5, refresh5, setSource5 } from '../src/five'
import { sessionOfSheet } from '../src/obs5m'

const DIR = process.env.PACKS_DIR || 'C:/Users/LENOVO/Git/Github/wt/msmm/apk-packs-r7'
const have = existsSync(`${DIR}/id/state.json`)
const store = new Map<string, string>()
const fake = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k), key: () => null, length: 0,
}
const before = (globalThis as any).localStorage
const helps0 = env.helpsLang
beforeAll(async () => {
  if (!have) return
  ;(globalThis as any).localStorage = fake
  usePacksDir(DIR)
  await installPacks(['en', 'id', 'es-419'])
  setSource5(null)
  await refresh5(true)
})
afterAll(() => {
  ;(globalThis as any).localStorage = before
  env.helpsLang = helps0
  usePacksDir()
  setSource5(null)
})
const press = (c: ConvState, f: { sheet?: any }, ui: string) =>
  answer(c, { sheet: { ...f.sheet, id: `t${Date.now()}${Math.random()}` }, ui, meta: '(button)' } as Made, performance.now())
const tf = (c: ConvState) => c.graph!.session!.tfLang

describe.skipIf(!have)('5M tables in the language asked', () => {
  test('fixtureNow5 / fixtureOf5: a story read in en does not answer for id', async () => {
    const en = await fixtureOf5(1, 'en')
    expect(en?.tfLang).toBe('en')
    expect(fixtureNow5(1, 'id')).toBeNull()
    const id = await fixtureOf5(1, 'id')
    expect(id?.tfLang).toBe('id')
    expect(fixtureNow5(1, 'en')?.tfLang).toBe('en')
    expect(fixtureNow5(1, 'id')?.tfLang).toBe('id')
    expect(fixtureNow5(1, 'es-419')?.tfLang).toBe('en') // es has no 5M: English
  })

  test('interface es, content es-419: "En indonesio" in a 5M session of OBS 6 makes the id tables, words stay in es', async () => {
    env.helpsLang = 'es-419'
    const c: ConvState = { last: null }
    let r: any = await turn(c, { q: '5M OBS 6' }, 'es')
    expect(tf(c)).toBe('en')
    for (let i = 0; i < 4; i++) r = await press(c, r.reply.follow[0], 'es')
    expect(tf(c)).toBe('en')
    const ri: any = await turn(c, { q: 'En indonesio' }, 'es')
    expect(ri.reply.ui).toBe('es')
    expect(tf(c)).toBe('id')
    expect(ri.reply.card?.tfLang).toBe('id')
    // the next step stays in the tables asked, with the interface's words
    const nx: any = await press(c, ri.reply.follow[0], 'es')
    expect(tf(c)).toBe('id')
    expect(nx.reply.card?.tfLang).toBe('id')
    expect(nx.reply.follow[0].label).toStartWith('Siguiente: ')
  })

  test('content id + "5M OBS 1": the id tables', async () => {
    env.helpsLang = 'id'
    const c: ConvState = { last: null }
    const r: any = await turn(c, { q: '5M OBS 1' }, 'es')
    expect(tf(c)).toBe('id')
    expect(r.reply.card?.tfLang).toBe('id')
    expect(r.reply.ui).toBe('es')
  })

  test('story 20 asked in id: no id tables for it, so the English ones', async () => {
    const cov = await (await import('../src/five')).covered5()
    expect(cov).toContain(20)
    const f = await fixtureOf5(20, 'id')
    expect([f?.story, f?.tfLang]).toEqual([20, 'en'])
    expect(fixtureNow5(20, 'id')?.tfLang).toBe('en')
  })

  test('a session keeps its tables language when its steps go on, and when resumed from its saved place', async () => {
    env.helpsLang = 'es-419'
    const c: ConvState = { last: null }
    await turn(c, { q: '5M OBS 3' }, 'es')
    await turn(c, { q: 'En indonesio' }, 'es')
    expect(tf(c)).toBe('id')
    const s = c.graph!.session!
    const id = await fixtureOf5(3, s.tfLang)
    // the step's sheet in the content language reads the session's own tables, not the English ones
    const sh = { id: 'x', intent: 'obs5m', ref: 'obs 3', what: [], version: null, concept: `obs5m:3/${s.part}/${s.at}`, term: null, phrase: null, candidates: null, lang: s.lang } as any
    expect(sessionOfSheet(sh, id!, s)?.tfLang).toBe('id')
    // from the saved place: a button resumed with the saved language
    const r: any = await answer(c, { sheet: { ...sh, id: 'y' }, ui: 'es', meta: '(resume)' } as Made, performance.now())
    expect(r.reply.card?.tfLang).toBe('id')
    expect(tf(c)).toBe('id')
  })
})
