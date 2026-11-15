// The next-step buttons under an answer (converse.ts followups, pipeline.ts packSteps): each a complete call sheet built by
// code, in the app's language; and a pressed button moves the conversation's state, so "and the notes?" after it is about it.
import { beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { answer, type ConvState } from '../src/pipeline'
import { againStep } from '../src/converse'
import { ALL_PACKS, installPacks } from './fs-packs'

beforeAll(fullPhone)
const refs = (f: { sheet?: { ref: string | null; concept: string | null } }[]) => f.map((x) => x.sheet?.ref ?? x.sheet?.concept)

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
    const ta = f.find((x) => x.sheet?.concept?.startsWith('ta:'))
    expect(ta?.label).toMatch(/^Academy: /)
    expect(ta?.sheet?.intent).toBe('article')
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
    expect((r.reply.follow ?? []).filter((x) => x.sheet?.concept?.startsWith('ta:')).length).toBeGreaterThan(0)
  })
})

describe('a pressed button moves the state', () => {
  test('"next verse" pressed, then "and the notes?" is about the new verse', async () => {
    const c: ConvState = { last: null }
    const r = await turn(c, { q: 'Show me Ruth 2:3', slots: null }, 'en')
    const next = (r.reply.follow ?? []).find((x) => x.sheet?.ref === 'rut 2:4')!
    await answer(c, { sheet: next.sheet!, ui: 'en', meta: '(button)' }, performance.now())
    const r2 = await turn(c, { q: 'And the notes?', slots: null }, 'en')
    expect(r2.ref).toBe('rut 2:4')
  })
})

describe("buttons under an introduction (a report of Nov 15: none under Jonah's)", () => {
  test("the book's: chapter 1, its introduction, the notes of 1:1, its key terms, Browse at the book", async () => {
    const r = await turn({ last: null }, { q: 'Introduction to Ruth', slots: null }, 'en')
    const f = r.reply.follow ?? []
    expect(refs(f).slice(0, 3)).toEqual(['rut 1', 'rut 1:intro', 'rut 1:1'])
    expect(f.find((x) => x.sheet?.ref === 'rut 1' && x.sheet.what.includes('terms'))?.label).toBe('Key terms of Ruth 1')
    const b = f.find((x) => x.browse)
    expect(b?.browse?.book).toBe('rut')
    expect(b?.browse?.lang).toBeTruthy() // a pack that has the book
    // not about starting: no "how to start" articles
    expect(f.some((x) => x.sheet?.concept?.startsWith('ta:'))).toBe(false)
  })
  test('about to translate a book: also the Translation Academy articles on starting, in Spanish', async () => {
    const r = await turn({ last: null }, { q: 'Voy a empezar a traducir Jonás', slots: null }, 'es')
    expect(r.ref).toBe('jon front:intro')
    const f = r.reply.follow ?? []
    // (a light path starts: its next step first, the first section; graph.ts Path)
    expect(f[0]!.label).toMatch(/^Siguiente: Jonás 1:1–\d+ · secciones$/)
    expect(f[1]!.label).toBe('Leer Jonás 1')
    expect(refs(f)).toContain('ta:translate/translate-process')
    expect(f.find((x) => x.browse)?.label).toBe('Explorar Jonás')
    expect(f.length).toBeLessThanOrEqual(9)
  })
  test('a verse or a name is not "starting a book": "Quiero traducir Jonás 1:3", "voy a traducir el nombre de Rut"', async () => {
    expect((await turn({ last: null }, { q: 'Quiero traducir Jonás 1:3', slots: null }, 'es')).ref).toBe('jon 1:3')
    expect((await turn({ last: null }, { q: 'Voy a traducir el nombre de Rut', slots: null }, 'es')).ref).not.toBe('rut front:intro')
  }, 60_000)
  test("a chapter's: its text, the notes of its first verse, the next chapter's introduction; the last chapter has none after", async () => {
    const r = await turn({ last: null }, { q: 'Introduction to Ruth 2', slots: null }, 'en')
    expect(refs(r.reply.follow ?? [])).toEqual(expect.arrayContaining(['rut 2', 'rut 2:1', 'rut 3:intro', 'rut front:intro']))
    const r4 = await turn({ last: null }, { q: 'Introduction to Ruth 4', slots: null }, 'en')
    expect(refs(r4.reply.follow ?? [])).not.toContain('rut 5:intro')
  })
})

describe('a name: its article and "How to Translate Names" (a report of Nov 15)', () => {
  test('"¿Cómo debo traducir el nombre de Jonás?": Jonah, not the article "name"; both articles as buttons and as online sources', async () => {
    const r = await turn({ last: null }, { q: '¿Cómo debo traducir el nombre de Jonás?', slots: null }, 'es')
    expect(r.concept).toBe('tw:names/jonah')
    const f = r.reply.follow ?? []
    expect(refs(f).slice(0, 2)).toEqual(['tw:names/jonah', 'ta:translate/translate-names'])
    expect(f[1]!.label).toMatch(/^Academia: /)
    expect(r.reply.sources?.map((s) => s.id)).toEqual(['tw:names/jonah', 'ta:translate/translate-names'])
    expect(r.reply.sources?.[1]?.title).toMatch(/nombres/i)
  })
  test('a Translation Words article whose text links "How to Translate Names": that article among the first buttons, and as a source', async () => {
    const r = await turn({ last: null }, { q: 'Who was Jonah?', slots: null }, 'en')
    const f = r.reply.follow ?? []
    expect(refs(f).slice(0, 5)).toContain('ta:translate/translate-names')
    expect(refs(f).filter((x) => x?.startsWith('jon ')).length).toBeGreaterThan(0)
    expect(r.reply.sources?.map((s) => s.id)).toEqual(['tw:names/jonah', 'ta:translate/translate-names'])
  })
  test("\"How do I translate the name Moses?\": the Academy article, with Moses' article first", async () => {
    const r = await turn({ last: null }, { q: 'How do I translate the name Moses?', slots: null }, 'en')
    expect(r.concept).toBe('ta:translate/translate-names')
    expect(refs(r.reply.follow ?? [])[0]).toBe('tw:names/moses')
  })
})

describe('the other answers offer next steps too', () => {
  test('a Translation Words article with no links: the verses where it appears', async () => {
    const r = await turn({ last: null }, { q: 'What is grace?', slots: null }, 'en')
    expect(r.concept).toBe('tw:kt/grace')
    expect((r.reply.follow ?? []).filter((x) => /^[0-9a-z]{3} \d+:\d+$/.test(x.sheet?.ref ?? '')).length).toBeGreaterThan(0)
  })
  test('a Translation Academy article: Browse at its manual', async () => {
    const r = await turn({ last: null }, { q: 'How to translate metaphors?', slots: null }, 'en')
    expect((r.reply.follow ?? []).find((x) => x.browse)?.browse).toMatchObject({ manual: 'translate' })
  })
  test('nothing found: an example passage, "Finding Answers", Browse', async () => {
    const r = await turn({ last: null }, { q: 'asdf', slots: null }, 'en')
    const f = r.reply.follow ?? []
    expect(f.some((x) => x.sheet?.intent === 'passage')).toBe(true)
    expect(refs(f)).toContain('ta:intro/finding-answers')
    expect(f.at(-1)?.browse).toEqual({})
  })
  test("past the book's end: its last chapter, its introduction, Browse", async () => {
    const c: ConvState = { last: null }
    await turn(c, { q: 'Show me Ruth 4', slots: null }, 'en')
    const r = await turn(c, { q: 'and the next chapter?', slots: null }, 'en')
    expect(r.answered).toBe('edge')
    expect(refs(r.reply.follow ?? [])).toEqual(expect.arrayContaining(['rut 4', 'rut front:intro']))
  })
  test('a ranking: the articles ranked', async () => {
    const r = await turn({ last: null }, { q: 'x', sheet: { id: 'x', intent: 'rank', ref: 'jon 1', what: ['notes'], version: null, concept: null, term: null, phrase: null, candidates: null, lang: 'en' } }, 'en')
    expect((r.reply.follow ?? []).filter((x) => x.sheet?.concept?.startsWith('ta:')).length).toBeGreaterThan(1)
  })
  test("the labels in the app's language (Arabic)", async () => {
    const r = await turn({ last: null }, { q: 'asdf', slots: null }, 'ar')
    expect((r.reply.follow ?? []).at(-1)?.label).toBe('تصفّح الكتاب المقدس والمساعدات')
  }, 60_000)
})

describe('review of Nov 15', () => {
  test('a book no pack has ("Pengantar Obaja" with only Indonesian): no buttons to it, only the ways forward', async () => {
    try {
      await installPacks(['id'])
      const r = await turn({ last: null }, { q: 'Pengantar Obaja', slots: null }, 'id')
      const f = r.reply.follow ?? []
      expect(f.length).toBeGreaterThan(0)
      expect(f.some((x) => x.sheet?.ref?.startsWith('oba') || x.browse?.book === 'oba')).toBe(false)
      expect(f.at(-1)?.browse).toEqual({})
    } finally {
      await installPacks(ALL_PACKS)
    }
  }, 60_000)
  test('"Try again" carries what to ask again: the typed question or the button\'s sheet; with neither, no button', () => {
    expect(againStep('es', { q: '¿Qué es la gracia?' })[0]?.again?.q).toBe('¿Qué es la gracia?')
    const sheet = { id: 'x', intent: 'passage', ref: 'rut 1', what: ['text'], version: null, concept: null, term: null, phrase: null, candidates: null, lang: 'en' }
    expect(againStep('en', { sheet, label: 'Read Ruth 1' })[0]).toMatchObject({ label: 'Try again', again: { sheet, label: 'Read Ruth 1' } })
    expect(againStep('en', undefined)).toEqual([])
  })
  test('"the name Yahweh" is a key term: its article with "Translate Unknowns" (its own links may still name the other)', async () => {
    const r = await turn({ last: null }, { q: 'How do I translate the name Yahweh?', slots: null }, 'en')
    expect(refs(r.reply.follow ?? []).slice(0, 2)).toEqual(['tw:kt/yahweh', 'ta:translate/translate-unknown'])
    expect(r.reply.sources?.[1]?.id).toBe('ta:translate/translate-unknown')
  }, 60_000)
})
