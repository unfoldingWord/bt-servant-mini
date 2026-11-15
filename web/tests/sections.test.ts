// Sections of a chapter and introductions the helps lack (user reports of Nov 15, on a phone with en + es-419):
// "Voy a empezar a traducir el libro de Rut" wants the first section of chapter 1 ("Rut 1:1–5"), and "Introduction to
// Numbers 6" must say plainly that there is none (the English pack has Numbers only as BSB text) and offer what there is,
// with the passage the person was on.
import { afterAll, expect, test } from 'bun:test'
import { ALL_PACKS, installPacks } from './fs-packs'
import { fullPhone, nextSteps, stepTarget, turn } from './harness'
import { type ConvState, sectionsOf } from '../src/pipeline'

afterAll(async () => { await installPacks(ALL_PACKS) })

test('a chapter\'s sections come from the BSB headings, else 5 verses each', async () => {
  await fullPhone()
  expect(await sectionsOf('rut', 1, 'en')).toEqual([[1, 5], [6, 18], [19, 22]])
  // Ruth 2 has one heading only (the whole chapter): blocks of 5 verses
  expect((await sectionsOf('rut', 2, 'en'))[0]).toEqual([1, 5])
  // Psalm 119: no 1-verse section from the title's heading, and its 176 verses in blocks of 8
  const psa = await sectionsOf('psa', 119, 'en')
  expect(psa[0]).toEqual([1, 8])
  expect(psa.length).toBe(22)
})

test('the reporter\'s phone (en + es-419): no introduction to Numbers 6, said plainly, with the passage before', async () => {
  await installPacks(['en', 'es-419'])
  for (const [lang, before, q, none] of [
    ['en', 'Ruth 1:16', 'Introduction to Numbers 6', /no introduction to Numbers 6.*do not cover Numbers/s],
    ['es', 'Rut 1:16', 'Introducción a Números 6', /no tienen introducción a Números 6.*no cubren Números/s],
  ] as const) {
    const c: ConvState = { last: null }
    await turn(c, { q: before }, lang)
    const r = await turn(c, { q }, lang)
    expect(r.reply.intro ?? '').toMatch(none)
    const targets = nextSteps({ reply: r.reply } as any).map(stepTarget)
    expect(targets[0]).toBe('num 6 text,notes')
    expect(targets).toContain('rut 1:16 text,notes,questions,terms')
    expect(targets).toContain('browse num')
  }
}, 30_000)
