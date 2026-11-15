// First use: the welcome's examples come from the installed pack (never a book it lacks), the picker picks the pack of the
// question's / app's / phone's language, and the download fetches a few segments at a time without changing what the client sees.
import { test, expect } from 'bun:test'
import { installPacks, ALL_PACKS } from './fs-packs'
import { examplesFor, packFor, preferred } from '../src/firstuse'
import { openLang, prefetching } from '../src/packs'

const UIS = ['en', 'es', 'fr', 'id', 'hi', 'ar']

for (const pack of ALL_PACKS) {
  test(`examples from ${pack} name only what it has`, async () => {
    await installPacks([pack])
    const r = await openLang(pack)
    for (const ui of UIS) {
      const ex = await examplesFor(ui, pack)
      expect(ex.length).toBeGreaterThanOrEqual(2)
      for (const e of ex) {
        expect(e.lang).toBe(pack)
        if (e.ref) expect(r.installed(`book:${e.ref.split(' ')[0]}`)).toBe(true)
        if (e.concept) expect((await r.article(e.concept)).data).toBeTruthy()
      }
      // a verse, then the notes of one
      expect(ex[0]!.intent).toBe('passage')
      expect(ex[1]!.what).toEqual(['notes'])
    }
  })
}

test('Indonesian has no Ruth: its examples do not offer it', async () => {
  if (!ALL_PACKS.includes('id')) return
  await installPacks(['id'])
  const ex = await examplesFor('id', 'id')
  expect(ex.some((e) => e.ref?.startsWith('rut '))).toBe(false)
  expect(ex.map((e) => e.label).join(' ')).not.toMatch(/\bRut\b/)
})

test('the pack of a language code', () => {
  expect(packFor('es')).toBe('es-419')
  expect(packFor('es-MX')).toBe('es-419')
  expect(packFor('pt-BR')).toBe('pt-br')
  expect(packFor('id-ID')).toBe('id')
  expect(packFor('fr')).toBe('fr')
  expect(packFor('xx')).toBeNull()
  expect(preferred(['en', 'es-419', 'id'], ['es', 'en'])).toBe('es-419')
  expect(preferred(['en', 'id'], ['es', 'id-ID'])).toBe('id')
  expect(preferred(['en', 'id'], ['qu'])).toBe('en')
  expect(preferred([], ['en'])).toBeNull()
})

test('prefetching: same bytes in the order asked, at most `ahead` requests at once, a failure where it belongs', async () => {
  const order = Array.from({ length: 20 }, (_, i) => `s${i}`)
  let now = 0, most = 0, calls = 0
  const source = {
    catalog: async () => 'not-modified' as const,
    segment: async (id: string) => {
      calls++
      now++
      most = Math.max(most, now)
      await new Promise((r) => setTimeout(r, 5))
      now--
      if (id === 's13') throw new Error('HTTP 500')
      return new TextEncoder().encode(id)
    },
  }
  const src = prefetching(source, order, 6)
  const got: string[] = []
  let failed = ''
  for (const id of order) {
    try {
      got.push(new TextDecoder().decode(await src.segment(id)))
    } catch (e) {
      failed = id
      break
    }
  }
  expect(got).toEqual(order.slice(0, 13))
  expect(failed).toBe('s13')
  expect(most).toBeLessThanOrEqual(6)
  expect(most).toBeGreaterThan(1)
  // never more than the window past the last segment asked for
  expect(calls).toBeLessThanOrEqual(13 + 6)
  // a segment outside the plan goes straight to the source
  expect(new TextDecoder().decode(await src.segment('other'))).toBe('other')
})
