// Focus: the answer to what was asked comes first, the rest is folded, the source is at the top (focus.ts, answer.ts, md.ts,
// view.ts). The study view orders its notes with focusOrder over the question (renderStudy), so these cases check that order
// on the study each answer carries, and the Markdown answer's order with the question given to answer.ts (setQuestion).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { focusOrder, focusWords, FOLD, hits } from '../src/focus'
import { md } from '../src/md'
import { setQuestion, type Study } from '../src/answer'
import { type Case, runCase } from './harness'
import { ALL_PACKS, installPacks, usePacksDir } from './fs-packs'
import { env } from '../src/pipeline'

const ask = (id: string, lang: string, q: string, slots: Case['slots'] = null): Case => ({ id, set: 'focus', lang, q, slots, expect: {} })
// the test files share the packs and the app's state: a phone with every pack, as answers.test.ts has
beforeAll(async () => {
  usePacksDir()
  await installPacks(ALL_PACKS)
  env.helpsLang = null
})
afterAll(() => setQuestion(null))

describe('the words a question is about', () => {
  test('a word, without how the question asks or the passage it names', () => {
    expect(focusWords('What does redeemer mean in Ruth 4?')).toEqual(['redee'])
    expect(focusWords('¿Qué significa redentor en Rut 4?')).toEqual(['reden'])
    expect(focusWords('What do the translation notes say about John 3:16?')).toEqual([])
    expect(focusWords('Show me Ruth 1:16 in the ULT.')).toEqual([])
    expect(focusWords('Rut 3:9 que quiere decir extiende tu manto sobre tu sierva')).toContain('manto')
  })
  test('a word that most notes have does not choose among them', () => {
    const notes = ['God said', 'God saw', 'God made', 'the fish of God', 'a great fish'].map((quote) => ({ quote, titles: '' }))
    const o = focusOrder(notes, focusWords('God and the fish'))
    expect(o.first).toEqual([3, 4])
    expect(o.used).toEqual(['fish'])
  })
  test('no word matched, or all matched: nothing moves', () => {
    const notes = [{ quote: 'a', titles: '' }, { quote: 'b', titles: '' }]
    expect(focusOrder(notes, ['zzzzz']).first).toEqual([])
    expect(hits('Kinsman-redeemer', ['redee'])).toEqual(['redee'])
  })
})

describe('folds in a Markdown answer', () => {
  test('a fold runs to the next fold or the source line', () => {
    const html = md(`## Ruth 4\n*TN v91 — Ruth 4*\n\nfirst\n\n${FOLD}More notes (2)\n\n1. a\n\n2. b\n\n${FOLD}4:2 · notes: 1\n\n3. c\n\n*Source: x v1.*\n\nafter`)
    expect(html).toContain('<details class="fold"><summary>More notes (2)</summary><ol start="1">')
    expect(html).toContain('</details><details class="fold"><summary>4:2 · notes: 1</summary>')
    expect(html).toMatch(/<\/ol><\/details><p><em>Source: x v1\.<\/em><\/p><p>after<\/p>$/)
    expect(html.indexOf('first')).toBeLessThan(html.indexOf('<details'))
  })
  test('every new phrase is said in the six languages', () => {
    const keys = ['chapter_summary', 'chapter_verses', 'focus_head', 'more_notes', 'verse_fold', 'terms_fold', 'questions_fold', 'article_more', 'article_suggestions']
    for (const l of ['en', 'es', 'fr', 'id', 'hi', 'ar']) {
      const t = JSON.parse(readFileSync(join(import.meta.dir, `../src/data/tpl-${l}.json`), 'utf-8'))
      for (const k of keys) expect(t[k], `${l} ${k}`).toBeString()
    }
  })
})

/** The study's notes in the order the bubble shows them for this question. */
const studyFirst = (s: Study, q: string): Study['notes'] => {
  const o = focusOrder(s.notes.map((n) => ({ quote: n.quotes ?? n.said, titles: n.about ?? '' })), focusWords(q))
  return o.first.map((i) => s.notes[i]!)
}

describe('the passage view shows the notes about the question first', () => {
  const cases: [Case, RegExp][] = [
    [ask('f-redeemer', 'en', 'What do the notes say about redeemer in Ruth 4?'), /redeem/i],
    [ask('f-world', 'en', 'Notes about the world in John 3:16', { intent: 'passage', book: 'John', chapter: 3, verse_start: 16, what: ['notes'], lang: 'en' } as any), /world/i],
    [ask('f-arrepiente', 'es', 'Jonas 3:9 dice que Dios se arrepiente? como puede ser',
      { intent: 'passage', book: 'Jonás', chapter: 3, verse_start: 9, lang: 'es', what: ['notes'] } as any), /volverse atrás/],
    [ask('f-gate', 'en', 'Ruth 4 notes about the gate', { intent: 'passage', book: 'Ruth', chapter: 4, what: ['notes'], lang: 'en' } as any), /gate/i],
    [ask('f-tarshish', 'en', 'Jonah 1:3 notes about Tarshish'), /Tarshish/],
    [ask('f-deep', 'en', 'What do the notes in Jonah 2 say about the deep?'), /deep/i],
    [ask('f-grace', 'en', 'Titus 2:11 notes on grace'), /grace/i],
  ]
  for (const [k, about] of cases)
    test(`${k.id}: the first note is about ${about}`, async () => {
      setQuestion(null)
      const o = await runCase(k)
      const s = (o.reply as { study?: Study }).study
      expect(s, `${k.id} has a study (route ${o.step})`).toBeDefined()
      const first = studyFirst(s!, k.q)
      expect(first.length).toBeGreaterThan(0)
      expect(`${first[0]!.quotes} ${first[0]!.about}`).toMatch(about)
      expect(first.length).toBeLessThan(s!.notes.length)
    }, 120_000)
})

describe('the Markdown answer', () => {
  test('with the question: the notes about its word first, the others folded, the source on top', async () => {
    const k = ask('m-redeemer', 'en', 'What do the notes say about redeemer in Ruth 4?')
    setQuestion(k.q)
    const info = String(((await runCase(k)).reply as any).info)
    setQuestion(null)
    const [head, src] = info.split('\n')
    expect(head).toBe('## Ruth 4 (en)')
    expect(src).toMatch(/^\*Translation Notes v\d+.* — Ruth 4\*$/)
    const focusAt = info.indexOf('### Notes about «redeemer»')
    const firstFold = info.indexOf(FOLD)
    expect(focusAt).toBeGreaterThan(0)
    expect(focusAt).toBeLessThan(firstFold)
    // what is before the first fold is about the redeemer
    const shown = info.slice(focusAt, firstFold).split('\n\n').filter((b) => /^\d+\. /.test(b))
    expect(shown.length).toBeGreaterThan(2)
    for (const b of shown) expect(b).toMatch(/redeem|redemption/i)
  }, 120_000)
  test('a whole chapter: a summary line, then one fold per verse', async () => {
    setQuestion(null)
    const info = String(((await runCase(ask('m-ruth4', 'en', 'Ruth 4', { intent: 'passage', book: 'Ruth', chapter: 4, lang: 'en' } as any))).reply as any).info)
    const blocks = info.split('\n\n')
    expect(blocks[1]).toMatch(/^Ruth 4: 22 verses, translation notes: \d+\.$/)
    expect(blocks[2]).toMatch(/^▸ 4:1 · notes: \d+$/)
    expect(blocks.filter((b) => /^▸ 4:\d+/.test(b)).length).toBeGreaterThanOrEqual(20)
  }, 120_000)
  test('a key term: its definition first, more and the translation suggestions folded', async () => {
    const o = await runCase(ask('m-covenant', 'en', 'What does the word covenant mean in the Bible?', { intent: 'article', term: 'covenant', lang: 'en' } as any))
    const info = String((o.reply as any).info)
    expect(info.split('\n')[1]).toMatch(/^\*Translation Words v\d+\*$/)
    const firstFold = info.indexOf(FOLD)
    expect(info.slice(0, firstFold)).toMatch(/formal, binding agreement/)
    expect(info.slice(firstFold)).toMatch(/▸ More about «covenant»/)
    expect(info.slice(firstFold)).toMatch(/▸ Translation Suggestions/i)
  }, 120_000)
  test('with a "how do I translate" question: the translation suggestions in sight', async () => {
    const k = ask('m-bautizar', 'es', 'en mi idioma no hay palabra para bautizar, como lo traduzco?', { intent: 'article', term: 'bautizar', lang: 'es' } as any)
    setQuestion(k.q)
    const info = String(((await runCase(k)).reply as any).info)
    setQuestion(null)
    const sug = info.indexOf('### Sugerencias de traducción')
    expect(sug).toBeGreaterThan(0)
    expect(sug).toBeLessThan(info.indexOf(FOLD))
  }, 120_000)
  test('advice: the note that covers more of the phrase first', async () => {
    const o = await runCase(ask('m-manto', 'es', 'Rut 3:9 que quiere decir extiende tu manto sobre tu sierva',
      { intent: 'advice', book: 'Rut', chapter: 3, verse_start: 9, phrase: 'extiende tu manto sobre tu sierva', lang: 'es' } as any))
    const info = String((o.reply as any).info)
    const first = info.split('\n\n').find((b) => /^Nota de traducción/.test(b))!
    expect(first).toMatch(/manto/)
    // the alternate translation is the note's own words, not the link after them
    expect(info).toContain('Traducción alternativa: “Por favor, cásate conmigo”')
    expect(info).not.toMatch(/alternativa: \[?ta:/)
  }, 120_000)
})
