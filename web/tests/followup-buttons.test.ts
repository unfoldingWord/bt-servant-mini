// The next-step buttons under an answer (converse.ts followups, pipeline.ts packSteps): each a complete call sheet built by
// code, in the app's language; and a pressed button moves the conversation's state, so "and the notes?" after it is about it.
import { beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { answer, type ConvState } from '../src/pipeline'

beforeAll(fullPhone)
const refs = (f: { sheet: { ref: string | null; concept: string | null } }[]) => f.map((x) => x.sheet.ref ?? x.sheet.concept)

describe('buttons under a passage', () => {
  test('Ruth 2:3, text: the other helps, the verses around it, the chapter, an Academy article, the introductions', async () => {
    const c: ConvState = { last: null }
    const r = await turn(c, { q: 'Show me Ruth 2:3', slots: { intent: 'passage', book: 'rut', chapter: 2, verse_start: 3, what: ['text'], lang: 'en' } }, 'en')
    const f = r.reply.follow ?? []
    const labels = f.map((x) => x.label)
    expect(labels.slice(0, 3)).toEqual(['Notes', 'Questions', 'Key terms'])
    expect(refs(f)).toContain('rut 2:2')
    expect(refs(f)).toContain('rut 2:4')
    expect(refs(f)).toContain('rut 2')
    expect(refs(f)).toContain('rut 2:intro')
    const ta = f.find((x) => x.sheet.concept?.startsWith('ta:'))
    expect(ta?.label).toMatch(/^Academy: /)
    expect(ta?.sheet.intent).toBe('article')
    expect(f.length).toBeLessThanOrEqual(9)
  })
  test('in Spanish, the labels too (the Spanish notes of Jonah 1:3 cite Academy articles; those of Ruth 2:3 do not)', async () => {
    const c: ConvState = { last: null }
    const r = await turn(c, { q: 'Muéstrame Jonás 1:3', slots: { intent: 'passage', book: 'jon', chapter: 1, verse_start: 3, what: ['text'], lang: 'es' } }, 'es')
    const labels = (r.reply.follow ?? []).map((x) => x.label)
    expect(labels).toContain('Notas')
    expect(labels.some((l) => l.startsWith('Academia: '))).toBe(true)
    expect(labels.some((l) => l.startsWith('Versículo anterior'))).toBe(true)
    expect(labels.some((l) => l.startsWith('Capítulo completo'))).toBe(true)
  })
  test('verse 1: the previous verse is the last of the chapter before; Ruth 1:1 has none', async () => {
    const r = await turn({ last: null }, { q: 'Show me Ruth 2:1', slots: null }, 'en')
    expect(refs(r.reply.follow ?? [])).not.toContain('rut 2:0')
    expect(refs(r.reply.follow ?? [])).toContain('rut 1:22')
    const r1 = await turn({ last: null }, { q: 'Show me Ruth 1:1', slots: null }, 'en')
    expect((r1.reply.follow ?? []).some((x) => x.label.startsWith('Previous verse'))).toBe(false)
  })
  test('a whole chapter: the next chapter, while the book has one', async () => {
    const r = await turn({ last: null }, { q: 'Show me Ruth 2', slots: { intent: 'passage', book: 'rut', chapter: 2, what: ['text'], lang: 'en' } }, 'en')
    expect(refs(r.reply.follow ?? [])).toContain('rut 3')
    const r4 = await turn({ last: null }, { q: 'Show me Ruth 4', slots: { intent: 'passage', book: 'rut', chapter: 4, what: ['text'], lang: 'en' } }, 'en')
    expect(refs(r4.reply.follow ?? [])).not.toContain('rut 5')
  })
})

describe('buttons under an article', () => {
  test('a Translation Words article: the articles it links to', async () => {
    const c: ConvState = { last: null }
    const r = await turn(c, { q: 'What is a lamb?', slots: { intent: 'article', term: 'lamb', lang: 'en' } }, 'en')
    expect(r.reply.ctx).toBe('tw:kt/lamb')
    expect(refs(r.reply.follow ?? [])).toContain('tw:other/sheep')
  })
  test('a Translation Academy article: its related articles', async () => {
    const c: ConvState = { last: null }
    const r = await turn(c, { q: 'metaphor', sheet: { id: 'x', intent: 'article', concept: 'ta:translate/figs-metaphor', ref: null, what: [], version: null, term: null, phrase: null, candidates: null, lang: 'en' } }, 'en')
    expect((r.reply.follow ?? []).filter((x) => x.sheet.concept?.startsWith('ta:')).length).toBeGreaterThan(0)
  })
})

describe('a pressed button moves the state', () => {
  test('"next verse" pressed, then "and the notes?" is about the new verse', async () => {
    const c: ConvState = { last: null }
    const r = await turn(c, { q: 'Show me Ruth 2:3', slots: null }, 'en')
    const next = (r.reply.follow ?? []).find((x) => x.sheet.ref === 'rut 2:4')!
    await answer(c, { sheet: next.sheet, ui: 'en', meta: '(button)' }, performance.now())
    const r2 = await turn(c, { q: 'And the notes?', slots: null }, 'en')
    expect(r2.ref).toBe('rut 2:4')
  })
})
