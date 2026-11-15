import { test, expect } from 'bun:test'
import { installPacks, ALL_PACKS } from './fs-packs'
import { buildSheet } from '../src/sheet'
import { answerSheet } from '../src/answer'

test('packs on disk', () => { expect(ALL_PACKS.length).toBeGreaterThan(0) })
test('Rut 2:3, Spanish only, app in Spanish', async () => {
  await installPacks(['es-419'])
  const { sheet } = await buildSheet('t', { intent: 'passage', book: 'Rut', chapter: 2, verse_start: 3, verse_end: null, what: ['text'], lang: 'es' } as any)
  const r = await answerSheet(sheet)
  console.log(sheet.lang, sheet.ref, r.answer.slice(0, 120))
  expect(r.answer).toContain('2:3')
})
test('Ruth 2:3, Spanish only, app in English (known bug)', async () => {
  await installPacks(['es-419'])
  const { sheet } = await buildSheet('t', { intent: 'passage', book: 'Ruth', chapter: 2, verse_start: 3, verse_end: null, what: ['text'], lang: 'en' } as any)
  const r = await answerSheet(sheet)
  console.log(sheet.lang, sheet.ref, r.answer.slice(0, 120))
})
