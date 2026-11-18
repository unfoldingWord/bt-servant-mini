// The story 1 fixture of the 5M session (only the tests use it): the copied phase 0 file is unchanged, and the adapter gives the tables Mini's 5M session reads (frames, parts, questions, terms, shared blocks).
import { test, expect } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { loadFixture, ORDER } from '../src/dev'

const FILE = new URL('../src/data/dev/obs5m-story1.json', import.meta.url)
const SHA = 'd0f94ce30c2f977f70dda2d7244a04d7407d9e6aa41006334e40b0e7dabea559'

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
