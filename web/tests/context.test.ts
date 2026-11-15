// What online AI is given (context.ts, phase 2b): the sections a question needs, read from the pack's roles or else from the
// headings in six languages; the path, the articles one link away and the earlier points that share something with the
// question; nothing unrelated; never more than the service takes.
import { beforeAll, describe, expect, test } from 'bun:test'
import { askOf, type Art, buildContext, type CMsg, headingKind, kindsOf, MAX_CONTEXT, packReader, pickSections, sectionsText } from '../src/context'
import { addNode, type Graph, newGraph, type NodeSheet } from '../src/graph'
import { openLang } from '../src/packs'
import { ALL_PACKS, installPacks } from './fs-packs'

describe('what the question asks', () => {
  test('how to translate, in six languages', () => {
    for (const q of ['How do I translate metaphors?', '¿Cómo traduzco las metáforas?', 'Comment traduire une métaphore ?', 'Bagaimana menerjemahkan metafora?',
      'रूपक का अनुवाद कैसे करें?', 'كيف أترجم الاستعارة؟', 'What do I do when something does not exist in my culture?'])
      expect(askOf(q)).toBe('how')
  })
  test('what it is, in six languages', () => {
    for (const q of ['What is a metaphor?', '¿Qué es una metáfora?', "Qu'est-ce qu'une métaphore ?", 'Apa itu metafora?', 'रूपक क्या है?', 'ما هي الاستعارة؟', 'What does redeemer mean?'])
      expect(askOf(q)).toBe('what')
  })
  test('anything else; the helps\' own names ("translation notes") do not ask how', () => {
    expect(askOf('Notes on Ruth 2:3')).toBe('other')
    expect(askOf('Show me the translation notes for Ruth 2:3')).toBe('other')
    expect(askOf('Muéstrame las notas de traducción de Rut 2:3')).toBe('other')
    expect(askOf('What do the translation notes say about Ruth 2:3?')).toBe('other')
    expect(askOf('How do I translate the translation notes of Ruth 2:3?')).toBe('how')
    expect(askOf('And the next verse?')).toBe('other')
  })
})

describe('section kinds from headings', () => {
  test('the six languages, accents and vowel signs aside', () => {
    expect(headingKind('Estrategias de traducción')).toBe('strategies')
    expect(headingKind('Ejemplos de estrategias de traducción aplicadas')).toBe('applied')
    expect(headingKind('Examples of Translation Strategies Applied')).toBe('applied')
    expect(headingKind('Strategi Penerjemahan')).toBe('strategies')
    expect(headingKind('Contoh Penerapan Strategi Penerjemahan')).toBe('applied')
    expect(headingKind('अनुवाद की रणनीतियाँ')).toBe('strategies')
    expect(headingKind('अनुवाद के लिए लागू की गई रणनीतियों के उदाहरण')).toBe('applied')
    expect(headingKind('استراتيجيَّات الترجمة')).toBe('strategies')
    expect(headingKind('أمثلة على الاستراتيجيَّات المطبَّقة')).toBe('applied')
    expect(headingKind('الوصف')).toBe('description')
    expect(headingKind('Definisi')).toBe('definition')
    expect(headingKind('अनुवाद के सुझाव')).toBe('translation-suggestions')
    expect(headingKind('शब्द तथ्य')).toBe('word-data')
    // a heading that only has the word is no section of that kind
    expect(headingKind('रूपक के रूप में तथ्यों के नमूने')).toBeNull()
    expect(headingKind('The Parts of a Metaphor')).toBeNull()
  })
  test("by position, when nothing says: an Academy article's last two sections are its strategies", () => {
    const a: Art = { id: 'ta:translate/x', title: 'X', sections: ['a', 'b', 'c', 'd', 'e'].map((t, i) => ({ sid: `s${i}`, role: 'unknown', level: 3, title: t, md: `${t} text` })) }
    expect(kindsOf(a)).toEqual(['description', 'unknown', 'unknown', 'strategies', 'applied'])
  })
  test("the pack's second strategies section is the strategies applied", () => {
    const a: Art = { id: 'ta:translate/x', title: 'X', sections: [
      { sid: 'description', role: 'description', level: 3, md: 'd' }, { sid: 'strategies', role: 'strategies', level: 3, md: 's' },
      { sid: 'strategies-2', role: 'strategies', level: 3, md: 'a' }] }
    expect(kindsOf(a)).toEqual(['description', 'strategies', 'applied'])
  })
})

describe('the sections a question needs, from the packs', () => {
  let read: ReturnType<typeof packReader>
  beforeAll(async () => {
    await installPacks(ALL_PACKS)
    read = packReader(openLang as any)
  })
  test('how to translate a metaphor: the strategies and the strategies applied, in every language', async () => {
    for (const lang of ALL_PACKS) {
      const a = (await read('ta:translate/figs-metaphor', lang))!
      expect(pickSections(a, 'how').map((p) => p.kind)).toEqual(['description', 'strategies', 'applied'])
      const t = sectionsText(a, 'how', 6000)
      expect(t.length).toBeLessThanOrEqual(6400)
      // the strategies whole (to the last one), the examples after them
      const st = a.sections[kindsOf(a).indexOf('strategies')]!.md.trim()
      expect(t).toContain(st.slice(-40))
    }
  })
  test('what a metaphor is: the description, not the strategies', async () => {
    const a = (await read('ta:translate/figs-metaphor', 'en'))!
    const t = sectionsText(a, 'what', 6000)
    expect(t).toContain('### Description')
    expect(t).not.toContain('Translation Strategies')
  })
  test('Hindi, Indonesian and Arabic headings: the sections found on articles that have them', async () => {
    const want = async (lang: string, id: string, kind: string) =>
      expect(pickSections((await read(id, lang))!, 'how').map((p) => p.kind)).toContain(kind)
    await want('hi', 'tw:kt/amen', 'translation-suggestions') // अनुवाद के लिए सुझाव
    await want('hi', 'ta:translate/figs-exmetaphor', 'strategies') // अनुवाद की युक्तियाँ
    await want('hi', 'ta:translate/figs-litany', 'applied') // अनुवाद के कौशल का व्यावहारिक उपयोग (its only strategies)
    await want('hi', 'ta:translate/figs-aside', 'strategies') // अनुवाद कौशल
    await want('id', 'tw:kt/lamb', 'translation-suggestions') // Usulan Penerjemahan
    await want('ar', 'tw:other/creation', 'translation-suggestions') // مقترحات للترجمة
  })
  test('how many articles find their strategies / suggestions, against English', async () => {
    const found: Record<string, Record<string, boolean>> = {}
    for (const lang of ALL_PACKS) {
      found[lang] = {}
      const r = await openLang(lang)
      for (const g of ['ta:translate', 'tw:kt', 'tw:other']) for (const a of ((await r.articles(g)) ?? []) as any[]) {
        if (!a?.sections?.length) continue
        const want = a.id.startsWith('ta:') ? 'strategies' : 'translation-suggestions'
        found[lang]![a.id] = pickSections({ id: a.id, title: a.title, sections: a.sections }, 'how').some((p) => p.kind === want)
      }
    }
    const en = Object.keys(found.en!).filter((id) => found.en![id])
    for (const lang of ALL_PACKS.filter((l) => l !== 'en')) {
      const have = en.filter((id) => found[lang]![id] !== undefined)
      const miss = have.filter((id) => !found[lang]![id])
      const ta = have.filter((id) => id.startsWith('ta:'))
      const missTa = miss.filter((i) => i.startsWith('ta:')).length
      console.log(`${lang}: ${have.length - miss.length}/${have.length} (tA ${ta.length - missTa}/${ta.length}, TW ${have.length - ta.length - (miss.length - missTa)}/${have.length - ta.length})`)
      // what is left are articles whose translation has no such section (Hindi "bride": definition and references only)
      expect(miss.length).toBeLessThanOrEqual(Math.ceil(have.length * 0.05))
    }
  }, 120000)
  test('Translation Words: the translation suggestions for how, the definition for what', async () => {
    for (const lang of ALL_PACKS) {
      const a = (await read('tw:kt/grace', lang))!
      expect(pickSections(a, 'how').map((p) => p.kind)).toEqual(['definition', 'translation-suggestions'])
      expect(pickSections(a, 'what').map((p) => p.kind)).toEqual(['definition'])
    }
  })
})

describe('the context of an online answer', () => {
  const sh = (ref: string | null, concept: string | null, intent: string, term: string | null = null): NodeSheet => ({ intent, ref, concept, what: ['notes'], term, lang: 'en' })
  /** A conversation as main.ts keeps it: each turn a question and an answer, each answer its point. */
  function conv(turns: [string, CMsg, { kind: string; sheet: NodeSheet; links?: string[] }][], parentOf?: (g: Graph) => void) {
    const g = newGraph()
    const msgs: CMsg[] = []
    for (const [q, m, t] of turns) {
      parentOf?.(g)
      msgs.push({ who: 'me', text: q }, m)
      addNode(g, { ...t, label: q }, msgs.length - 1)
    }
    return { g, msgs }
  }
  const art = (id: string, title: string, secs: [string, string, string][]): Art =>
    ({ id, title, sections: secs.map(([role, t, md], i) => ({ sid: `s${i}`, role, level: 3, title: t, md })) })
  const ARTS: Record<string, Art> = {
    'tw:other/glean': art('tw:other/glean', 'glean', [['definition', 'Definition', 'To glean is to pick up what the harvesters left.'],
      ['translation-suggestions', 'Translation Suggestions', 'Say "pick up" or "gather".']]),
    'tw:kt/love': art('tw:kt/love', 'love', [['definition', 'Definition', 'Love is to care for someone.']]),
    'ta:translate/figs-metaphor': art('ta:translate/figs-metaphor', 'Metaphor', [['description', 'Description', 'A metaphor speaks of one thing as another.'],
      ['strategies', 'Translation Strategies', '(1) Use a simile.'], ['examples', 'Examples of Translation Strategies Applied', 'He is a lion → he is like a lion.']]),
  }
  const read = async (id: string) => ARTS[id] ?? null

  test('an article question: the heading the phone wrote first, then the sections the question needs', async () => {
    const m: CMsg = { who: 'bot', intro: 'I found the article «Metaphor».', info: '## Metaphor\n\nA metaphor speaks…', ctx: 'ta:translate/figs-metaphor' }
    const { g, msgs } = conv([['How do I translate metaphors?', m, { kind: 'article', sheet: sh(null, 'ta:translate/figs-metaphor', 'article') }]])
    const b = await buildContext({ question: 'How do I translate metaphors?', m, msgs, graph: g, node: g.cur, lang: 'en', read })
    expect(b.helps.match(/^#{1,3} (.+)$/m)?.[1]).toBe('Metaphor')
    expect(b.helps).toContain('(1) Use a simile.')
    expect(b.helps).toContain('like a lion')
    expect(b.sources).toEqual([{ id: 'ta:translate/figs-metaphor' }])
    // one point: no path to show
    expect(b.parts.path).toBe(0)
    const w = await buildContext({ question: 'What is a metaphor?', m, msgs, graph: g, node: g.cur, lang: 'en', read })
    expect(w.helps).toContain('speaks of one thing as another')
    expect(w.helps).not.toContain('Use a simile')
  })

  test('an earlier point that shares the word comes back; an unrelated one does not', async () => {
    const ruth: CMsg = { who: 'bot', intro: 'Here are 2 notes for Ruth 2:3.', info: '## Ruth 2:3\n\n1. «field» a note about the field.' }
    const glean: CMsg = { who: 'bot', intro: 'glean', info: '## glean\n\nTo glean is to pick up what the harvesters left.\n\nIt was for the poor.' }
    const love: CMsg = { who: 'bot', intro: 'love', info: '## love\n\nLove is to care for someone.' }
    const num: CMsg = { who: 'bot', intro: 'Numbers 6:24', info: '## Numbers 6:24\n\nMay the LORD bless you.' }
    const num2: CMsg = { who: 'bot', intro: 'Numbers 6:25', info: '## Numbers 6:25\n\nMay the LORD make his face shine.' }
    const now: CMsg = { who: 'bot', intro: 'Numbers 6:26', info: '## Numbers 6:26\n\nThe LORD lift up his face.' }
    const { g, msgs } = conv([
      ['Notes on Ruth 2:3', ruth, { kind: 'passage', sheet: sh('rut 2:3', null, 'passage'), links: ['tw:other/glean'] }],
      ['What does glean mean here?', glean, { kind: 'meaning', sheet: sh('rut 2:3', 'tw:other/glean', 'passage', 'glean') }],
      ['What is love?', love, { kind: 'article', sheet: sh(null, 'tw:kt/love', 'article') }],
      ['Numbers 6:24', num, { kind: 'passage', sheet: sh('num 6:24', null, 'passage') }],
      ['Numbers 6:25', num2, { kind: 'passage', sheet: sh('num 6:25', null, 'passage') }],
      ['What did the note on glean say? Numbers 6:26', now, { kind: 'passage', sheet: sh('num 6:26', null, 'passage') }],
    ])
    const b = await buildContext({ question: 'What did the note on glean say?', m: now, msgs, graph: g, node: g.cur, lang: 'en', read })
    expect(b.parts.backlinks).toEqual(['What does glean mean here?'])
    expect(b.helps).toContain('pick up what the harvesters left')
    expect(b.helps).not.toContain('care for someone')
    // the path: every point above, oldest first, the current one marked
    expect(b.helps).toMatch(/1\. Notes on Ruth 2:3[^\n]*\n2\. What does glean mean here\?/)
    expect(b.helps).toContain('← this question')
    // the history: the branch (up to 3 above), as before
    expect(b.history.map((t) => t.text)).toEqual(['What is love?', 'love', 'Numbers 6:24', 'Numbers 6:24', 'Numbers 6:25', 'Numbers 6:25'])
    // a question that shares nothing brings no earlier point
    const none = await buildContext({ question: 'And the next verse?', m: now, msgs, graph: g, node: g.cur, lang: 'en', read })
    expect(none.parts.backlinks).toEqual([])
    expect(none.helps).not.toContain('harvesters')
  })

  test("a question that asks neither how nor what: the phone's own text when it fits", async () => {
    const m: CMsg = { who: 'bot', intro: 'I found the article «Metaphor».', info: '## Metaphor\n\nThe phone shows this.', ctx: 'ta:translate/figs-metaphor' }
    const { g, msgs } = conv([['Metaphor', m, { kind: 'article', sheet: sh(null, 'ta:translate/figs-metaphor', 'article') }]])
    const b = await buildContext({ question: 'Metaphor', m, msgs, graph: g, node: g.cur, lang: 'en', read })
    expect(b.helps).toContain('The phone shows this.')
  })

  test("the room in order: the phone's answer (5000) first, then the path, the linked articles, the earlier points; each whole or cut at its end", async () => {
    const words = (w: string, n: number) => `${w} `.repeat(n).trim()
    const big = (id: string, t: string): Art => art(id, t, [['definition', 'Definition', `${t} ${words('defn', 600)}`], ['translation-suggestions', 'Translation Suggestions', `${t} ${words('sugg', 600)}`]])
    const A: Record<string, Art> = { 'tw:other/glean': big('tw:other/glean', 'glean'), 'tw:other/harvest': big('tw:other/harvest', 'glean harvest') }
    const turns: [string, CMsg, { kind: string; sheet: NodeSheet; links?: string[] }][] = [
      ['What does glean mean?', { who: 'bot', intro: 'glean', info: `## glean\n\n${words('glean picked', 400)}` }, { kind: 'meaning', sheet: sh(null, 'tw:other/x1', 'meaning', 'glean') }],
      ['Tell me about glean again', { who: 'bot', intro: 'glean', info: `## glean2\n\n${words('glean field', 400)}` }, { kind: 'meaning', sheet: sh(null, 'tw:other/x2', 'meaning', 'glean') }],
      ...[0, 1, 2, 3].map((k): [string, CMsg, { kind: string; sheet: NodeSheet }] => [`Numbers 6:2${k}`, { who: 'bot', intro: 'n', info: '## N\n\nbless' }, { kind: 'passage', sheet: sh(`num 6:2${k}`, null, 'passage') }]),
    ]
    const q = 'How do I translate glean in Ruth 2:3?'
    const run = (notes: number, links: string[], passage: string) => {
      const now: CMsg = { who: 'bot', intro: 'Ruth 2:3', info: `## Ruth 2:3\n\n${words('note', notes)}` }
      const { g, msgs } = conv([...turns, [q, now, { kind: 'passage', sheet: sh('rut 2:3', null, 'passage', 'glean'), links }]])
      return buildContext({ question: q, m: now, msgs, graph: g, node: g.cur, lang: 'en', read: async (id) => A[id] ?? null, passage })
    }
    const full = await run(1500, ['tw:other/glean', 'tw:other/harvest'], words('ctx', 3000))
    expect(full.helps.length).toBeLessThanOrEqual(MAX_CONTEXT)
    // the phone's notes keep their 5000 characters
    expect(full.helps.indexOf('# Context of the passage')).toBeGreaterThanOrEqual(4990)
    // the path is there, whole and last; the linked articles come before the earlier points
    expect(full.helps.endsWith('← this question')).toBe(true)
    expect(full.parts.linked).toEqual(['tw:other/glean', 'tw:other/harvest'])
    // no room was left for the earlier points (lowest priority)
    expect(full.parts.backlinks).toEqual([])
    // with fewer notes and one linked article, the earlier points get the room that is left, each whole or ending in "…"
    const short = await run(600, ['tw:other/glean'], words('ctx', 100))
    expect(short.parts.backlinks.length).toBeGreaterThan(0)
    expect(short.helps.length).toBeLessThanOrEqual(MAX_CONTEXT)
    expect(short.helps.endsWith('← this question')).toBe(true)
    expect(short.helps.indexOf('linked from this answer')).toBeLessThan(short.helps.indexOf('earlier in this conversation'))
    for (const block of short.helps.split(/\n\n(?=## )/).filter((b) => /earlier in this conversation|linked from this answer/.test(b)))
      expect(block.split('\n\n# Where')[0]!.trim()).toMatch(/( …|[a-z])$/)
  })

  test('one link away: the key term the question names, ranked first; never past the limit', async () => {
    const long = 'x '.repeat(6000)
    const m: CMsg = { who: 'bot', intro: 'Ruth 2:3', info: `## Ruth 2:3\n\n${long}` }
    const { g, msgs } = conv([['How do I translate glean in Ruth 2:3?', m, { kind: 'passage', sheet: sh('rut 2:3', null, 'passage', 'glean'), links: ['tw:kt/love', 'tw:other/glean'] }]])
    const b = await buildContext({ question: 'How do I translate glean in Ruth 2:3?', m, msgs, graph: g, node: g.cur, lang: 'en', read, passage: `## Surrounding verses\n${long}` })
    expect(b.parts.linked).toEqual(['tw:other/glean'])
    expect(b.helps).toContain('Say "pick up" or "gather".')
    expect(b.helps.length).toBeLessThanOrEqual(MAX_CONTEXT)
    expect(b.helps).toContain('# Context of the passage')
  })
})
