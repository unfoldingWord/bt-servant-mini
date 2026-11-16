// MACULA in Mini (macula.ts): who is who in a verse (the referents) and the verse's sentence structure (the syntax trees).
// The first part reads a small fixture of the orig segments of Ruth 2 and Titus 1 (fixtures/macula-2026-11-16.json: trees,
// referents, the words of those chapters, the ULT and Van Dyck alignments of their positions, the Translation Words names of
// their referents; extracted from the packs on disk, which carry the same orig segments as Mini's server), so it needs no
// packs. The second part runs the app's own pipeline on the packs on disk: the buttons, the typed question in six languages,
// "who is Boaz?" staying the article, and the time to answer one verse, cold and warm.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  asksWho, type Gloss, hasWho, MAC, type MacBook, macBook, maculaAnswer, maculaSteps, type Names, resetMacula, strongKey,
  type TNode, treeOf, treeText, whoIn,
} from '../src/macula'
import { ALL_PACKS } from './fs-packs'
import { fullPhone, turn } from './harness'
import type { ConvState } from '../src/pipeline'
import type { Sheet } from '../src/answer'

type FxBook = {
  chapter: number; verses: Record<string, number>; words: Record<string, [string, string]>; sentences: any[]; referents: any
  gloss: Record<string, { res: string; byPos: Record<string, number[]>; words: Record<string, string> }>
  strongs: Record<string, string[]>; titles: Record<string, string>
}
const FX = JSON.parse(readFileSync(resolve(import.meta.dir, 'fixtures/macula-2026-11-16.json'), 'utf8')) as { release: string; books: Record<string, FxBook> }

/** The fixture's chapter as macula.ts reads a book (macBookOf does the same from a real orig model). */
function fixture(book: 'rut' | 'tit', l = 'en'): { mb: MacBook; g: Gloss; names: Names } {
  const b = FX.books[book]!
  const starts = Object.values(b.verses).sort((x, y) => x - y)
  const mb: MacBook = {
    book, greek: book === 'tit', release: FX.release,
    verse: (c, v) => { const s = b.verses[`${c}:${v}`]; return s === undefined ? undefined : [s, starts.find((x) => x > s) ?? Infinity] },
    word: (p) => { const w = b.words[p]; return w ? { form: w[0], strong: w[1] } : undefined },
    sentences: b.sentences, referents: b.referents,
  }
  const gl = b.gloss[l]!
  const g: Gloss = { res: gl.res, lang: l, at: (p) => gl.byPos[p], word: (o) => gl.words[o] }
  const inv = new Map<string, string[]>()
  for (const [s, ids] of Object.entries(b.strongs)) inv.set(strongKey(s), [...new Set([...(inv.get(strongKey(s)) ?? []), ...ids])])
  return { mb, g, names: { ids: (s) => inv.get(s), title: (id) => b.titles[id] } }
}
const lines = (book: 'rut' | 'tit', c: number, v: number, l = 'en') => {
  const { mb, g, names } = fixture(book, l)
  return whoIn(mb, g, names, c, v)!.items
}
/** A tree as "role(children)" text: "*(& V* & *(V PP PP) …)" with words left out. */
const shape = (n: TNode): string => {
  const kids = n.kids.filter((k): k is TNode => k.k === 'n').map(shape)
  const name = (n.role || '*') + (n.clause && n.role ? '*' : '')
  return kids.length ? `${name}(${kids.join(' ')})` : name
}

describe('who is who (referents, fixture)', () => {
  test('Ruth 2:3: "she" left, went and gleaned, and "her" chance, all map to Ruth', () => {
    const it = lines('rut', 2, 3)
    const ruth = it.filter((x) => x.to.strong === 'H7327')
    expect(ruth.map((x) => x.gl)).toEqual(['So she left', 'and went', 'to glean', 'her chance'])
    for (const x of ruth) expect(x.to.gl).toBe('Ruth')
    expect(ruth.slice(0, 3).every((x) => x.role === 'subj')).toBe(true)
    // the suffix "her" is the pronoun itself, with its Hebrew part
    expect(ruth[3]!.role).toBe('ref')
    expect(ruth[3]!.suffix).toBe('הָ')
  })
  test('Ruth 2:4: "And he said" maps to Boaz (and "coming", "to him", "May bless you")', () => {
    const it = lines('rut', 2, 4)
    const said = it.find((x) => x.gl === 'And he said')!
    expect(said.to.gl).toBe('Boaz')
    expect(said.to.id).toBe('tw:names/boaz')
    expect(said.role).toBe('subj')
    expect(it.map((x) => x.to.gl)).toEqual(['Boaz', 'Boaz', 'Boaz', 'Boaz'])
    expect(it.find((x) => x.gl === 'to him')!.role).toBe('ref')
  })
  test('Titus 1:5: "you" maps to Titus, "I left" to Paul (and its object to Titus)', () => {
    const it = lines('tit', 1, 5)
    expect(it.find((x) => x.gl === 'you' && x.orig === 'σε')!.to.gl).toBe('Titus')
    const left = it.filter((x) => x.gl === 'I left')
    expect(left.find((x) => x.role === 'subj')!.to.gl).toBe('Paul')
    expect(left.find((x) => x.role === 'obj')!.to.gl).toBe('Titus')
    // "To Titus" in the text: the name by its Translation Words title
    expect(it.find((x) => x.orig === 'σοι')!.to.gl).toBe('Titus')
  })
  test('in Arabic (Van Dyck): the same entities, in Arabic words, the name in its shortest form', () => {
    const it = lines('rut', 2, 4, 'ar')
    expect(it.map((x) => x.gl)).toContain('وَقَالَ')
    for (const x of it) expect(x.to.gl).toMatch(/بُوعَزَ?/)
    expect(it[0]!.to.gl!.startsWith('بِ')).toBe(false)
  })
  test('a verse with no referents has none (Titus 1:1)', () => {
    const { mb, g, names } = fixture('tit')
    expect(hasWho(mb, 1, 1)).toBe(false)
    expect(whoIn(mb, g, names, 1, 1)!.items).toEqual([])
    expect(hasWho(mb, 1, 5)).toBe(true)
  })
  test('an entity the text has no word for says so (no gateway word, original kept)', () => {
    const { mb, names } = fixture('rut')
    const it = whoIn(mb, null, names, 2, 4)!.items
    // no aligned text: the names still come from Translation Words, nothing is made up
    expect(it.every((x) => x.gl === '')).toBe(true)
    expect(it[0]!.to.gl).toBe('Boaz')
    const none = whoIn(mb, null, null, 2, 4)!.items
    expect(none[0]!.to.gl).toBeNull()
    expect(none[0]!.to.orig).toContain('בֹ')
  })
})

describe('the sentence structure (trees, fixture)', () => {
  test('Ruth 2:3 has its clauses and roles: left, went, gleaned in the field after the reapers, and her chance came', () => {
    const { mb, g } = fixture('rut')
    const t = treeOf(mb, g, 2, 3)!
    expect(t.sentences.length).toBe(1)
    const s = t.sentences[0]!
    expect(s.before).toBe(false)
    expect(s.after).toBe(false)
    expect(shape(s.root)).toBe('*(& v* & v* & *(v pp pp) & *(v s adv(p*)))')
    const text = treeText(t, 'en')
    expect(text).toContain('V: to glean')
    expect(text).toContain('PP: after (אַחֲרֵ֖י) · the reapers')
    expect(text).toContain('S: her chance')
    // the "and" of וַתֵּלֶךְ is a part of the word: its words ("So she left") are shown once, at the verb
    expect(text.match(/So she left/g)!.length).toBe(1)
  })
  test('two words the text translates together are one box ("from Bethlehem")', () => {
    const { mb, g } = fixture('rut')
    expect(treeText(treeOf(mb, g, 2, 4)!, 'en')).toMatch(/PP: from Bethlehem \(\S+ \S+\)\n/)
  })
  test('Titus 1:1 is shown as its own slice of a sentence that goes on to 1:4', () => {
    const { mb, g } = fixture('tit')
    const t = treeOf(mb, g, 1, 1)!
    const s = t.sentences[0]!
    expect(s.before).toBe(false)
    expect(s.after).toBe(true)
    const text = treeText(t, 'en')
    expect(text).toContain('S: Paul')
    // the rest of the sentence (1:2–4: "To Titus, a true son") is not drawn here
    expect(text).not.toContain('Titus')
    // and 1:2 is a middle slice: it starts before and goes on
    const t2 = treeOf(mb, g, 1, 2)!.sentences[0]!
    expect([t2.before, t2.after]).toEqual([true, true])
  })
  test('the Arabic diagram has the Arabic words in the same tree', () => {
    const { mb, g } = fixture('rut', 'ar')
    const text = treeText(treeOf(mb, g, 2, 4)!, 'ar')
    expect(text).toContain('فاعل: بِبُوعَزَ')
    expect(text).toContain('جار ومجرور: مِنْ بَيْتِ لَحْمٍ')
  })
})

describe('the question, read by code', () => {
  const yes: [string, string | null][] = [
    ["who is 'he' in Ruth 2:4?", 'he'], ['Who is he in Ruth 2:4?', 'he'], ['who does he refer to in Ruth 2:4', 'he'], ['Who is who in this verse?', null],
    ['¿Quién es «él» en Rut 2:4?', 'él'], ['¿A quién se refiere «ella» en Rut 2:3?', 'ella'], ['¿Quién es quién en este versículo?', null],
    ['À qui se réfère « il » dans Ruth 2:4 ?', 'il'], ['Qui est qui dans ce verset ?', null],
    ["Siapa yang dimaksud dengan 'dia' dalam Rut 2:4?", 'dia'], ["'Dia' dalam Rut 2:4 merujuk kepada siapa?", 'Dia'], ['Siapa adalah siapa dalam ayat ini?', null],
    ["रूत 2:4 में 'वह' कौन है?", 'वह'], ['इस पद में कौन किसको दर्शाता है?', null],
    ["من هو 'هو' في راعوث 2:4؟", 'هو'], ['إلى من يعود الضمير «هو» في راعوث 2:4؟', 'هو'], ['مَن هو مَن في هذه الآية؟', null],
  ]
  for (const [q, w] of yes) test(`asks who: ${q}`, () => expect(asksWho(q)).toEqual({ word: w }))
  const no = [
    'who is Boaz?', 'Who is Boaz in Ruth 2:4?', '¿Quién es Booz?', '¿quién es el redentor?', 'Qui est Boaz ?', 'Siapa Boas?', 'बोअज़ कौन है?', 'من هو بوعز؟',
    "What does 'kinsman redeemer' refer to?", 'who is speaking here?', 'Who are the Moabites?', 'Who wrote Ruth?', 'Ruth 2:4', 'What does glean mean here?',
  ]
  for (const q of no) test(`does not: ${q}`, () => expect(asksWho(q)).toBeNull())
})

// ------------------------------------------------------------------------------------------------- on the packs on disk

const PACKS = ALL_PACKS.includes('en')
describe.skipIf(!PACKS)('in the app (packs on disk)', () => {
  const budget = MAC.budgetMs
  beforeAll(async () => {
    await fullPhone()
    MAC.budgetMs = 30_000 // (the tests decide by the data, not by the machine's speed; the budget has its own test)
  })
  afterAll(() => { MAC.budgetMs = budget })
  const sheet = (ref: string, what: string[], lang = 'en'): Sheet =>
    ({ id: 't', intent: 'passage', ref, what, lang, version: null, concept: null, term: null, phrase: null, candidates: null } as unknown as Sheet)

  test('under one verse: "Who is who" only where there are referents; the structure under every verse', async () => {
    const r24 = (await maculaSteps(sheet('rut 2:4', ['text', 'notes']), 'en')).map((f) => `${f.label} ${f.sheet!.what}`)
    expect(r24).toEqual(['Who is who in this verse? who', 'See the sentence structure structure'])
    const t11 = (await maculaSteps(sheet('tit 1:1', ['text', 'notes']), 'en')).map((f) => f.sheet!.what.join())
    expect(t11).toEqual(['structure'])
    // a chapter, a range, an introduction: none
    expect(await maculaSteps(sheet('rut 2', ['text']), 'en')).toEqual([])
    expect(await maculaSteps(sheet('rut 2:3-5', ['text']), 'en')).toEqual([])
    expect(await maculaSteps(sheet('rut 2:intro', ['intro']), 'en')).toEqual([])
  })
  test('the passage answer of Ruth 2:4 offers both, in the six languages', async () => {
    for (const [ui, q] of [['en', 'Ruth 2:4'], ['es', 'Rut 2:4'], ['fr', 'Ruth 2:4'], ['id', 'Rut 2:4'], ['hi', 'रूत 2:4'], ['ar', 'راعوث 2:4']] as const) {
      const r = await turn({ last: null }, { q }, ui)
      const whats = (r.reply.follow ?? []).map((f) => f.sheet?.what.join())
      expect(whats, `${ui}: ${(r.reply.follow ?? []).map((f) => f.label).join(' | ')}`).toContain('who')
      expect(whats).toContain('structure')
    }
  })
  test('Titus 1:1 gets no "Who is who" button', async () => {
    const r = await turn({ last: null }, { q: 'Titus 1:1' }, 'en')
    const whats = (r.reply.follow ?? []).map((f) => f.sheet?.what.join())
    expect(whats).not.toContain('who')
    expect(whats).toContain('structure')
  })
  test('"who is \'he\' in Ruth 2:4?" is answered by code: "And he said" → Boaz, the structure and Boaz\'s article next', async () => {
    const c: ConvState = { last: null }
    const r = await turn(c, { q: "who is 'he' in Ruth 2:4?" }, 'en')
    expect(r.route).toBe('macula')
    expect(r.ref).toBe('rut 2:4')
    expect(r.reply.intro).toBe('In Ruth 2:4, «he» refers to:')
    expect(r.reply.info).toContain('**And he said**')
    expect(r.reply.info).toMatch(/And he said\*\* .*→ \*\*Boaz\*\*/)
    const m = r.reply.macula!
    expect(m.kind).toBe('who')
    const labels = (r.reply.follow ?? []).map((f) => f.label)
    expect(labels).toContain('See the sentence structure')
    expect(labels).toContain('Boaz')
    // the conversation is on Ruth 2:4 now: "and the notes?" goes there
    const n = await turn(c, { q: 'and the notes?' }, 'en')
    expect(n.ref).toBe('rut 2:4')
  })
  test('a typed question in each language is recognized and answered from the verse', async () => {
    for (const [ui, q] of [['es', '¿Quién es «él» en Rut 2:4?'], ['fr', 'À qui se réfère « il » dans Ruth 2:4 ?'], ['id', "Siapa yang dimaksud dengan 'dia' dalam Rut 2:4?"],
      ['hi', "रूत 2:4 में 'वह' कौन है?"], ['ar', "من هو 'هو' في راعوث 2:4؟"]] as const) {
      const r = await turn({ last: null }, { q }, ui)
      expect(r.route, `${ui}: ${q}`).toBe('macula')
      expect(r.ref).toBe('rut 2:4')
      expect(r.reply.macula?.kind).toBe('who')
    }
    // "who is who in this verse?" after a verse: that verse
    const c: ConvState = { last: null }
    await turn(c, { q: 'Titus 1:5' }, 'en')
    const r = await turn(c, { q: 'Who is who in this verse?' }, 'en')
    expect(r.route).toBe('macula')
    expect(r.ref).toBe('tit 1:5')
    expect(r.reply.info).toMatch(/\*\*you\*\* \(σε, pronoun\) → \*\*Titus\*\*/)
  })
  test('"who is Boaz?" stays the Translation Words article', async () => {
    const r = await turn({ last: null }, { q: 'who is Boaz?' }, 'en')
    expect(r.route).not.toBe('macula')
    expect(r.concept).toBe('tw:names/boaz')
    // and after a verse too
    const c: ConvState = { last: null }
    await turn(c, { q: 'Ruth 2:4' }, 'en')
    const r2 = await turn(c, { q: 'Who is Boaz?' }, 'en')
    expect(r2.route).not.toBe('macula')
  })
  test('the structure button: Titus 1:1 says the sentence continues in 1:2, and offers it first', async () => {
    const d = await maculaAnswer(sheet('tit 1:1', ['structure']), 'en')
    expect(d.reply.intro).toContain('The sentence continues in Titus 1:2.')
    expect(d.reply.macula?.kind).toBe('tree')
    expect(d.reply.follow![0]!.label).toBe('Sentence structure of Titus 1:2')
    const a = await maculaAnswer(sheet('rut 2:4', ['structure'], 'ar'), 'ar')
    expect(a.reply.intro).toContain('بنية الجملة في راعوث 2:4')
    expect(a.reply.macula?.kind === 'tree' && a.reply.macula.greek).toBe(false)
  })
  test('time to answer one verse, cold (book read) and warm', async () => {
    const time = async (ref: string, what: string) => { const t0 = performance.now(); await maculaAnswer(sheet(ref, [what]), 'en'); return performance.now() - t0 }
    // (Jonah: no other test reads its orig segment, so the first answer reads it, as on a phone the first time)
    resetMacula()
    const cold = await time('jon 1:3', 'who')
    const warm = await time('jon 1:4', 'who')
    const tree = await time('jon 1:5', 'structure')
    const treeCold = await time('jon 2:1', 'structure')
    console.log(`MACULA one verse (Jonah): cold ${cold.toFixed(0)} ms (segment read), warm ${warm.toFixed(1)} ms, structure warm ${tree.toFixed(1)} ms / ${treeCold.toFixed(1)} ms`)
    expect(warm).toBeLessThan(100)
    expect(tree).toBeLessThan(100)
    expect(cold).toBeLessThan(5000)
  })
  test('a big book not read yet does not hold the answer: past the budget, both buttons, and the book is read meanwhile', async () => {
    resetMacula()
    MAC.budgetMs = 0
    try {
      const t0 = performance.now()
      const steps = await maculaSteps(sheet('gen 1:3', ['text']), 'en')
      const ms = performance.now() - t0
      expect(steps.map((f) => f.sheet!.what.join())).toEqual(['who', 'structure'])
      // the read goes on: once done, the next verse's buttons are exact
      expect(await macBook('gen', 'en')).not.toBeNull()
      console.log(`Genesis: buttons in ${ms.toFixed(0)} ms (budget 0), the book read after`)
    } finally {
      MAC.budgetMs = 30_000
    }
  })
})
