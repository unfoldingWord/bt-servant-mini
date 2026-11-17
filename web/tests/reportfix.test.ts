// User reports of Nov 15-17 (cases in cases/reports.jsonl, "rf-…"): the pieces of code behind them, and the report scripts'
// reading of the KV (worker/scripts/fb-kv.mjs).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env, langByWords, type ConvState } from '../src/pipeline'
import { alike, findSections, findStories, headingsOfText, sectionRef } from '../src/storyfind'
import { obsAnswer, obsMissing, obsServer } from '../src/obs'
import { fullPhone, turn } from './harness'
import { installPacks } from './fs-packs'
// @ts-expect-error a plain ES module of the worker's scripts
import { keysAfter, parseArgs, parseBulk, saveMark, sinceMark } from '../../worker/scripts/fb-kv.mjs'

beforeAll(async () => {
  await fullPhone()
  env.helpsLang = null
}, 120_000)

describe('a story by its section heading (storyfind.ts)', () => {
  test('words alike: the same, a start, one root', () => {
    expect(alike('lion', 'lions')).toBe(true)
    expect(alike('templo', 'temple')).toBe(true)
    expect(alike('construye', 'construction')).toBe(true)
    expect(alike('construye', 'constant')).toBe(false)
    expect(alike('den', 'daniel')).toBe(false)
    expect(alike('pez', 'peace')).toBe(false)
  })
  test("a text's headings, each to the verse before the next one, within its chapter", () => {
    const pieces = [['Head A', false], ['v1', false], ['v2', false], ['Head B', false], ['v3', false], ['v4', false], ['v1', false]]
    const events: [number, string, string][] = [[0, 'chapter', '1'], [0, 'open', 'para:s1'], [1, 'close', ''], [1, 'verse', '1'], [2, 'verse', '2'],
      [3, 'open', 'para:s1'], [4, 'close', ''], [4, 'verse', '3'], [5, 'verse', '4'], [6, 'chapter', '2'], [6, 'verse', '1']]
    const s = headingsOfText('rut', { pieces, events }, 'en')
    expect(s.map((x) => [sectionRef(x), x.title])).toEqual([['rut 1:1-2', 'Head A'], ['rut 1:3-4', 'Head B']])
  })
  test('Spanish words find English headings: names, story words, roots', async () => {
    expect(sectionRef((await findSections(['foso', 'leones'], 'es', ['dan']))[0]!)).toMatch(/^dan 6:10-/)
    expect((await findSections(['construye', 'templo'], 'es', ['1ki']))[0]!.title).toBe('Temple Construction Begins')
    expect(await findSections(['concubinas'], 'es', ['est'])).toEqual([])
  }, 60_000)
  test('Open Bible Stories by title, every word', async () => {
    expect((await findStories(['diluvio'], 'es'))[0]?.n).toBe(3)
    expect(await findStories(['Jonás', 'pez'], 'es')).toEqual([])
  }, 60_000)
  test('never the whole book: a story read as a book with nothing in it is searched in the whole Bible', async () => {
    const c: ConvState = { last: null }
    const r = await turn(c, { q: 'Rut y la tormenta en el mar', slots: { intent: 'passage', book: 'Rut', lang: 'es', what: ['text'] } as any }, 'es')
    expect(r.ref).not.toBe('rut')
  }, 60_000)
})

describe("the reply's language: the question's words over the reader's guess", () => {
  test('langByWords', () => {
    env.nav = 'es'
    expect(langByWords('¿Dónde se tragó a Jonás un gran pez?')).toBe('es')
    expect(langByWords('Où Jonas a-t-il été avalé ?')).toBe('fr')
    expect(langByWords('Qui est Jonas dans le livre ?')).toBe('fr')
    expect(langByWords('Who is Jonah?')).toBe('en')
    expect(langByWords('Jonás pez')).toBe(null)
    expect(langByWords('ما هي النعمة؟')).toBe('ar')
  })
})

describe('Open Bible Stories the packs server has and the packs here do not list', () => {
  const saved = { ...obsServer }
  beforeAll(async () => {
    await installPacks(['es-419']) // a phone whose packs came before the server had OBS
  }, 120_000)
  afterAll(async () => {
    Object.assign(obsServer, saved)
    await fullPhone()
  }, 120_000)
  test('not asked without the internet allowed', async () => {
    obsServer.allowed = () => false
    expect(await obsMissing('es-419')).toBeNull()
  })
  test('asked: a language this phone downloaded can add them on a tap', async () => {
    obsServer.allowed = () => true
    obsServer.origin = async () => 'added'
    obsServer.size = async () => 150_000
    expect(await obsMissing('es-419')).toEqual({ lang: 'es-419', bytes: 150_000, canAdd: true })
    const { answer, facts } = await obsAnswer({ ref: 'obs 1', what: ['text'], lang: 'es-419' }, 'es')
    expect(facts.add).toEqual({ lang: 'es-419', bytes: 150_000 })
    expect(answer).toContain('Toca abajo')
    const c: ConvState = { last: null }
    const r = await turn(c, { q: 'OBS 1', slots: null }, 'es')
    expect((r.reply.follow ?? []).some((f: any) => f.add?.unit === 'obs' && /147 KB|146 KB|150 KB/.test(f.label))).toBe(true)
  }, 60_000)
  test('a language that came with the app: not offered (its unit comes with the app)', async () => {
    obsServer.allowed = () => true
    obsServer.origin = async () => 'shipped'
    obsServer.size = async () => 150_000
    expect(await obsMissing('es-419')).toBeNull()
  })
})

describe('the report scripts (worker/scripts/fb-kv.mjs)', () => {
  test('arguments and --since', () => {
    expect(parseArgs(['5', '--since', 'last', '--json'])).toEqual({ positional: ['5'], since: 'last' })
    expect(parseArgs(['--since=2026-11-15'])).toEqual({ positional: [], since: '2026-11-15' })
    expect(keysAfter(['fb:2026-11-17T1:a', 'fb:2026-11-15T2:b', 'fb:2026-11-14T9:c'], sinceMark('2026-11-15', 'x'))).toEqual(['fb:2026-11-17T1:a', 'fb:2026-11-15T2:b'])
    expect(() => sinceMark('yesterday', 'x')).toThrow()
  })
  test('the mark of the newest report shown, per script', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fbstate-'))
    const f = join(dir, 'state.json')
    try {
      expect(sinceMark('last', 'feedback', f)).toBeNull()
      saveMark('feedback', ['fb:2026-11-16T1:a', 'fb:2026-11-17T1:b'], f)
      saveMark('feedback', ['fb:2026-11-15T1:c'], f) // an older one does not move it back
      expect(sinceMark('last', 'feedback', f)).toBe('fb:2026-11-17T1:b')
      expect(sinceMark('last', 'training', f)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  test("bulk get's output: plain values and values with metadata", () => {
    const m = parseBulk(JSON.stringify({ 'fb:a': '{"received":"x"}', 'fb:b': { value: '{"received":"y"}', metadata: null }, 'fb:c': null }))
    expect([...m.entries()]).toEqual([['fb:a', { received: 'x' }], ['fb:b', { received: 'y' }]])
  })
})
