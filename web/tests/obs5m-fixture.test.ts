// The dev switch (?dev=obs5m) and the story 1 fixture of the 5M session: the switch is off until set, the copied phase 0 file is
// unchanged, and the adapter gives the tables Mini's 5M session reads (frames, parts, questions, terms, shared blocks).
import { test, expect, beforeAll, afterAll } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { devOn, initDev, loadFixture, ORDER } from '../src/dev'

const FILE = new URL('../src/data/dev/obs5m-story1.json', import.meta.url)
const SHA = 'd0f94ce30c2f977f70dda2d7244a04d7407d9e6aa41006334e40b0e7dabea559'

const store = new Map<string, string>()
const fake = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  key: () => null, length: 0,
}
const before = (globalThis as any).localStorage
const beforeLoc = (globalThis as any).location
beforeAll(() => { (globalThis as any).localStorage = fake })
afterAll(() => { (globalThis as any).localStorage = before; (globalThis as any).location = beforeLoc })

test('the switch is off by default and on once set', () => {
  store.clear()
  expect(devOn('obs5m')).toBe(false)
  localStorage.setItem('btsm.dev.obs5m', '1')
  expect(devOn('obs5m')).toBe(true)
})

test('a storage that throws leaves the switch off', () => {
  ;(globalThis as any).localStorage = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  expect(devOn('obs5m')).toBe(false)
  expect(() => initDev()).not.toThrow()
  ;(globalThis as any).localStorage = fake
})

test('?dev=obs5m sets the switch once; without it nothing changes', () => {
  store.clear()
  ;(globalThis as any).location = { search: '?x=1' }
  initDev()
  expect(devOn('obs5m')).toBe(false)
  ;(globalThis as any).location = { search: '?dev=obs5m' }
  initDev()
  expect(devOn('obs5m')).toBe(true)
  expect(store.get('btsm.dev.obs5m')).toBe('1')
})

test("the copied phase 0 file is unchanged", () => {
  expect(createHash('sha256').update(readFileSync(FILE)).digest('hex')).toBe(SHA)
})

test('the fixture adapts the file', async () => {
  const fx = await loadFixture()
  expect(fx.story).toBe(1)
  expect(fx.title).toBe('The Creation')
  expect(fx.frames.length).toBe(16)
  expect(fx.frames[0]!.text.startsWith('This is how God made everything')).toBe(true)
  expect(fx.frames[4]!.ref).toBe('1:5')
  expect(fx.parts.length).toBe(16)
  for (const p of fx.parts) expect(ORDER).toContain(p.part)
  expect(fx.parts.some((p) => p.part === 'm1' && p.list === 'terms')).toBe(true)
  const ids = fx.questions.map((q) => q.id)
  expect(new Set(ids).size).toBe(ids.length)
  const refs = new Set(fx.frames.map((f) => f.ref))
  for (const q of fx.questions) {
    for (const r of q.frames) expect(refs.has(r)).toBe(true)
  }
  for (const t of fx.terms) expect(refs.has(t.frame)).toBe(true)
  for (const p of fx.parts) if (p.shared) expect(fx.shared[p.shared]).toBeDefined()
})
