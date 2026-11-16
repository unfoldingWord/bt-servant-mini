// The helps under an online answer (helpcards.ts): an online answer always shows what the phone found as cards in sight, the
// articles it cites first; the rest is folded behind a label with its counts; the offline answer is drawn as always.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chooseCards, CARDS_T, firstLine, moreLabel, showsCards, studyOrder, type Card } from '../src/helpcards'
import { setQuestion, type Study } from '../src/answer'
import { type Case, runCase } from './harness'
import { ALL_PACKS, installPacks, usePacksDir } from './fs-packs'
import { env, type Reply } from '../src/pipeline'
import { shareText } from '../src/share'
import { openLang } from '../src/packs'

const ask = (id: string, lang: string, q: string, slots: Case['slots'] = null): Case => ({ id, set: 'helpcards', lang, q, slots, expect: {} })
beforeAll(async () => {
  usePacksDir()
  await installPacks(ALL_PACKS)
  env.helpsLang = null
})
afterAll(() => setQuestion(null))

/** The cards an online answer to this reply shows (main.ts renderMsg gives the same input). */
const cardsOf = (r: Reply, q: string, cited?: string[]) =>
  chooseCards({ study: r.study, info: r.info, intro: r.intro, ctx: r.ctx, lang: r.lang, helps: r.helps, sources: r.sources, cited, question: q })

const study = (over: Partial<Study> = {}): Study => ({
  lang: 'en', head: 'Ruth 4:14', book: 'rut', ch: 4, v1: 14, v2: 14,
  texts: [
    { label: 'UST', verses: [{ v: '14', p: [['The women said to Naomi, '], ['Praise Yahweh!']] }] },
    { label: 'ULT', verses: [{ v: '14', p: [['And the women said to Naomi, “Blessed be Yahweh, who has not left you without a '], ['redeemer', 'n1 t0'], [' today.”']] }] },
    { label: 'BSB', verses: [{ v: '14', p: [['Then the women said to Naomi…']] }] },
  ],
  notes: [
    { said: 'Blessed be Yahweh', orig: '', note: 'This is a way of praising God. Alternate translation: “Praise Yahweh”', ref: '4:14', quotes: 'Blessed be Yahweh' },
    { said: 'a redeemer', orig: '', note: 'This refers to Obed, who will care for Naomi. See [[tw:kt/redeem]].', ref: '4:14', quotes: 'a redeemer', about: 'redeem' },
    { said: 'today', orig: '', note: 'The women mean on this day, when the child was born.', ref: '4:14', quotes: 'today' },
    { said: 'his name', orig: '', note: 'Name here stands for the reputation of the person.', ref: '4:14', quotes: 'his name' },
  ],
  terms: [
    { id: 'tw:kt/redeem', title: 'redeem, redemption, redeemer', said: 'redeemer', orig: '' },
    { id: 'tw:kt/yahweh', title: 'Yahweh', said: 'Yahweh', orig: '' },
  ],
  questions: [{ q: 'What did the women say?', a: 'Blessed be Yahweh.' }],
  heads: { notes: 'Translation notes', terms: 'Key terms', questions: 'Questions' },
  ...over,
})

describe('which helps show as cards', () => {
  test('a passage asked about a word: its text with the version, the notes about the word, the key term', () => {
    const { cards, more } = chooseCards({ study: study(), question: 'What does redeemer mean in Ruth 4:14?' })
    expect(cards.map((c) => c.kind)).toEqual(['text', 'note', 'article'])
    const text = cards[0] as Extract<Card, { kind: 'text' }>
    expect(text.label).toBe('ULT') // ULT before UST, as the passage view orders them
    expect(text.line).toContain('redeemer')
    expect((cards[1] as Extract<Card, { kind: 'note' }>).i).toBe(1)
    expect((cards[1] as Extract<Card, { kind: 'note' }>).focus).toBe(true)
    expect((cards[2] as Extract<Card, { kind: 'article' }>).id).toBe('tw:kt/redeem')
    expect(more).toEqual({ texts: 3, notes: 4, terms: 2, questions: 1 })
  })
  test('the notes shown are the ones the passage view shows first (focus.ts)', () => {
    const s = study()
    const q = 'What does redeemer mean in Ruth 4:14?'
    const notes = chooseCards({ study: s, question: q }).cards.filter((c) => c.kind === 'note').map((c) => (c as Extract<Card, { kind: 'note' }>).i)
    expect(notes).toEqual(studyOrder(s, q).first.slice(0, notes.length))
  })
  test('a passage with no word asked: its first two notes', () => {
    const { cards } = chooseCards({ study: study(), question: 'Ruth 4:14' })
    expect(cards.filter((c) => c.kind === 'note').map((c) => (c as Extract<Card, { kind: 'note' }>).i)).toEqual([0, 1])
    expect(cards.some((c) => c.kind === 'article')).toBe(false)
  })
  test('the articles the answer cites come first, marked, and are not shown twice', () => {
    const { cards } = chooseCards({
      study: study(), question: 'What does redeemer mean in Ruth 4:14?',
      sources: [{ id: 'ta:translate/figs-metonymy', title: 'Metonymy' }, { id: 'tw:kt/redeem', title: 'redeem, redemption, redeemer' }],
      cited: ['tw:kt/redeem'],
    })
    const first = cards[0] as Extract<Card, { kind: 'article' }>
    expect(first.kind).toBe('article')
    expect(first.id).toBe('tw:kt/redeem')
    expect(first.cited).toBe(true)
    expect(cards.filter((c) => c.kind === 'article' && c.id === 'tw:kt/redeem')).toHaveLength(1)
    expect((cards[1] as Extract<Card, { kind: 'article' }>).cited).toBe(false)
  })
  test('the order does not change when the answer arrives (cards stay where they were while it was written)', () => {
    const sources = [{ id: 'tw:kt/redeem', title: 'redeem' }, { id: 'ta:translate/figs-metonymy', title: 'Metonymy' }]
    const before = chooseCards({ study: study(), question: 'redeemer in Ruth 4:14', sources })
    const after = chooseCards({ study: study(), question: 'redeemer in Ruth 4:14', sources, cited: sources.map((s) => s.id) })
    const key = (c: Card) => `${c.kind}:${'id' in c ? c.id : 'i' in c ? c.i : c.title}`
    expect(after.cards.map(key)).toEqual(before.cards.map(key))
  })
  test('an article answer: the article, with its own first line', () => {
    const info = '# Metaphor\n\n## Description\n\nA metaphor is a figure of speech in which one concept is used in place of another. More text.'
    const { cards } = chooseCards({ info, ctx: 'ta:translate/figs-metaphor', sources: [{ id: 'ta:translate/figs-metaphor' }] })
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ kind: 'article', id: 'ta:translate/figs-metaphor', title: 'Metaphor' })
    expect((cards[0] as Extract<Card, { kind: 'article' }>).line).toMatch(/^A metaphor is a figure of speech/)
  })
  test("a word's meaning (the article without ctx): one card, with the phone's heading and first line", () => {
    const info = '## redimir, redentor, redención\n*Translation Words v37*\nEl término “redimir” se refiere a recomprar algo. Más.\n▸ Más sobre «redimir»'
    const { cards } = chooseCards({ info, sources: [{ id: 'tw:kt/redeem' }], cited: ['tw:kt/redeem'] })
    expect(cards).toEqual([{ kind: 'article', id: 'tw:kt/redeem', title: 'redimir, redentor, redención', line: 'El término “redimir” se refiere a recomprar algo.', cited: true }])
  })
  test('a free search: its first rows, the rest counted', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ kind: i < 5 ? 'note' : 'question', snippet: `Snippet ${i}.`, ref: `Ruth 1:${i + 1}` }) as const)
    const { cards, more } = chooseCards({ helps: [{ head: 'Notes', items: items.slice(0, 5) }, { head: 'Questions', items: items.slice(5) }] })
    expect(cards.map((c) => c.kind)).toEqual(['help', 'help', 'help'])
    expect(more).toEqual({ notes: 5, questions: 2 })
  })
  test('a plain answer kept as text: the answer itself is a card', () => {
    const { cards } = chooseCards({ info: '### Ruth 1:16\n\nULT: But Ruth said, “Do not urge me to leave you.”' })
    expect(cards).toEqual([{ kind: 'answer', title: 'Ruth 1:16', line: 'ULT: But Ruth said, “Do not urge me to leave you.”' }])
  })
  test('never more than a phone screen of cards', () => {
    const s = study({ notes: Array.from({ length: 9 }, (_, i) => ({ said: 'redeemer', orig: '', note: `Note ${i} about the redeemer.`, ref: '4:14', quotes: 'redeemer' })) })
    const sources = [{ id: 'tw:kt/redeem' }, { id: 'ta:translate/figs-metonymy' }, { id: 'tw:kt/yahweh' }]
    expect(chooseCards({ study: s, question: 'redeemer', sources }).cards.length).toBeLessThanOrEqual(5)
  })
})

describe('the offline answer is unchanged', () => {
  test('cards only with an online answer or while it is written', () => {
    expect(showsCards({})).toBe(false)
    expect(showsCards({ ai: undefined })).toBe(false)
    expect(showsCards({ ai: { text: 'x', model: 'm' } })).toBe(true)
    expect(showsCards({}, true)).toBe(true)
  })
})

describe('the fold is labelled with its counts', () => {
  test('in Spanish', () => {
    expect(moreLabel({ notes: 66, texts: 3 }, 'es')).toBe('Ver las 66 notas y el texto en 3 versiones')
    expect(moreLabel({ notes: 66 }, 'es')).toBe('Ver las 66 notas')
    expect(moreLabel({ notes: 4, texts: 2, terms: 5 }, 'es')).toBe('Ver las 4 notas, el texto en 2 versiones y 5 palabras clave')
    expect(moreLabel({}, 'es')).toBe('Ver todo lo que encontró el teléfono')
  })
  test('in English, singular and plural', () => {
    expect(moreLabel({ notes: 1, questions: 1 }, 'en')).toBe('See the note and 1 question')
    expect(moreLabel({ notes: 12, texts: 3 }, 'en')).toBe('See all 12 notes and the text in 3 versions')
  })
  test('in every language of the app, with no placeholder left', () => {
    for (const ui of Object.keys(CARDS_T)) {
      for (const n of [1, 2, 3, 11, 66, 100]) {
        const l = moreLabel({ notes: n, texts: n, terms: n, questions: n }, ui)
        expect(l, `${ui} ${n}`).not.toMatch(/[{}]/)
        expect(l.length).toBeGreaterThan(8)
      }
    }
    expect(moreLabel({ notes: 66, texts: 3 }, 'ar')).toBe('عرض 66 ملاحظة والنص في 3 ترجمات')
  })
  test('first lines are plain text', () => {
    expect(firstLine('# Title\n\nThis is **bold** and [a link](tw:kt/god). And more.')).toBe('This is bold and a link.')
  })
})

describe('real answers: an online answer always shows what the phone found', () => {
  const cases: [Case, string[]][] = [
    [ask('h-redeemer', 'en', 'What do the notes say about redeemer in Ruth 4?'), ['note']],
    [ask('h-manto', 'es', 'Rut 3:9 que quiere decir extiende tu manto sobre tu sierva'), []],
    [ask('h-redentor', 'es', '¿Qué significa redentor en Rut 4:14?'), ['article']],
    [ask('h-unknown', 'en', 'How do I translate Ruth 1:1 "in the days when the judges ruled"?'), ['article']],
    [ask('h-grieve', 'en', 'What does it mean to grieve the Holy Spirit?'), []],
    [ask('h-ruth116', 'en', 'Ruth 1:16', { intent: 'passage', book: 'Ruth', chapter: 1, verse_start: 16, lang: 'en' } as any), ['text']],
    [ask('h-covenant', 'en', 'What does the word covenant mean in the Bible?', { intent: 'article', term: 'covenant', lang: 'en' } as any), ['article']],
    [ask('h-metaphor', 'es', '¿Qué es una metáfora?'), []],
    [ask('h-ar', 'ar', 'ماذا تعني كلمة الفادي في راعوث 4؟'), []],
  ]
  for (const [k, kinds] of cases)
    test(`${k.id}: cards for what was found`, async () => {
      setQuestion(null)
      const o = await runCase(k)
      const r = o.reply as Reply
      // online AI is asked only when the phone found something (main.ts)
      if (!(r.info || r.helps?.length || r.study)) return
      const { cards } = cardsOf(r, k.q, (r.sources ?? []).map((s) => s.id))
      expect(cards.length, `${k.id} (${o.step})`).toBeGreaterThan(0)
      for (const kind of kinds) expect(cards.map((c) => c.kind), `${k.id} (${o.step})`).toContain(kind)
      // the cited articles first
      const cited = cards.findIndex((c) => c.kind === 'article' && c.cited)
      if (cited >= 0) expect(cards.slice(0, cited).every((c) => c.kind === 'article' && c.cited)).toBe(true)
      for (const c of cards) expect(c.title.trim().length, `${k.id} ${c.kind}`).toBeGreaterThan(0)
    }, 120_000)
})

describe('sharing an online answer', () => {
  test('sends the online answer, also when the phone had no text of its own', () => {
    const ai = { text: 'The online answer.', model: 'm' }
    expect(shareText({ who: 'bot', info: 'The phone answer.', ai } as any, 'en')).toContain('The online answer.')
    expect(shareText({ who: 'bot', info: 'The phone answer.', ai } as any, 'en')).not.toContain('The phone answer.')
    expect(shareText({ who: 'bot', study: {} as any, ai } as any, 'en')).toContain('The online answer.')
    expect(shareText({ who: 'bot', info: 'The phone answer.' } as any, 'en')).toContain('The phone answer.')
  })
})

describe('a language pack that failed to open', () => {
  test('is opened again on the next read (the failure is not kept)', async () => {
    const first = openLang('zz-none')
    let failed = false
    await first.catch(() => { failed = true })
    expect(failed).toBe(true) // a language not on the phone does not open
    expect(openLang('zz-none')).not.toBe(first)
  })
})
