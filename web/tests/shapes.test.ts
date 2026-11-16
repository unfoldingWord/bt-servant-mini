// The composer's ways of asking (data/shapes.json), checked both ways (propuesta-composer-sugerencias.md §5 fase 0): each shape,
// written in each app language with sample books and words and typed as text, must give the call sheet its button gives. A
// passage shape must also be read by code alone (directSheet: no model, the same reading with or without one), so the
// composer's "✓" can be offered for it. A shape that fails in a language is not offered there (suggest.ts SHAPES_OFF).
import { describe, expect, test } from 'bun:test'
import shapes from '../src/data/shapes.json'
import glossary from '../src/data/kt-glossary.json'
import { fillName, introText, shapeOffered } from '../src/suggest'
import { whatWord } from '../src/converse'
import { buildSheet, type Slots } from '../src/sheet'
import { directSheet, env, readQuestion } from '../src/pipeline'
import { fullPhone, turn } from './harness'

const LANGS = ['en', 'es', 'fr', 'id', 'hi', 'ar'] as const
type Lang = (typeof LANGS)[number]
const S = shapes as unknown as Record<string, { text: Record<Lang, string> }>
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')
// books with one name, two words ("1 Juan"), short and long names, and books only some packs have
const REFS: [string, number, number | null][] = [['rut', 2, 3], ['jon', 1, 3], ['1jn', 3, 2], ['tit', 1, 5], ['mat', 5, 3], ['gen', 1, 1], ['psa', 23, 1], ['rev', 21, null]]
const TERMS: Record<Lang, [string, string][]> = {
  en: [['grace', 'tw:kt/grace'], ['faith', 'tw:kt/faith']], es: [['gracia', 'tw:kt/grace'], ['fe', 'tw:kt/faith']],
  fr: [], id: [], hi: [], ar: [],
}
for (const l of ['fr', 'id', 'hi', 'ar'] as const)
  for (const id of ['tw:kt/grace', 'tw:kt/faith']) TERMS[l].push([(glossary as any)[id][l][0], id])

/** What a typed question gets with no reader (a phone with no model): the reading step as main.ts calls it for a direct one. */
async function typed(q: string, ui: string) {
  env.nav = ui
  return readQuestion(q, { slots: null, raw: '', ms: 0 }, { last: null }, null)
}
const pick = (s: { intent: string; ref: string | null; what: string[]; lang: string }) => ({ intent: s.intent, ref: s.ref, what: s.what, lang: s.lang })

describe('passage shapes, typed = button', () => {
  for (const ui of LANGS)
    for (const [code, ch, v] of REFS) {
      const ref = `${fillName(ui, code)} ${ch}${v ? `:${v}` : ''}`
      const cases: [string, string, string[]][] = [
        ['passage', fill(S.passage!.text[ui], { ref }), []],
        ['notes', fill(S.notes!.text[ui], { ref }), ['notes']],
        ...(['notes', 'questions', 'terms', 'text'] as const).map((k): [string, string, string[]] => [`help ${k}`, `${ref} ${whatWord(ui, k)}`, [k]]),
        ['intro (chapter)', fill(S.intro!.text[ui], { what: `${fillName(ui, code)} ${ch}` }), ['intro']],
        ['intro chip', introText(ui, code, ch), ['intro']],
      ]
      for (const [shape, q, what] of cases)
        test(`${ui} ${shape}: ${q}`, async () => {
          await fullPhone()
          env.nav = ui
          const slots = directSheet(q)
          const base = shape === 'intro (chapter)' ? 'intro' : shape
          if (S[base] && !shapeOffered(base, ui, code)) {
            // not offered: then code must not claim to read it either (no "✓" that lies)
            const got = (await typed(q, ui)).sheet
            if (slots) expect(pick((await buildSheet('c', slots, env.helpsLang)).sheet)).toEqual(pick(got))
            return
          }
          expect(slots, 'read by code alone').not.toBeNull()
          const button: Slots = { intent: 'passage', book: code, chapter: ch, verse_start: shape.startsWith('intro') ? null : v, verse_end: null, what, lang: slots!.lang }
          const want = (await buildSheet('b', button, env.helpsLang)).sheet
          const got = (await typed(q, ui)).sheet
          expect(pick(got)).toEqual(pick(want))
          // and the slots the composer shows are the ones the answer is built from
          expect(pick((await buildSheet('c', slots!, env.helpsLang)).sheet)).toEqual(pick(got))
        })
    }
})

describe('book introduction, typed = button', () => {
  for (const ui of LANGS)
    for (const code of ['rut', 'jon', '1jn', 'tit'])
      test(`${ui}: ${fill(S.intro!.text[ui], { what: fillName(ui, code) })}`, async () => {
        await fullPhone()
        const q = fill(S.intro!.text[ui], { what: fillName(ui, code) })
        const got = (await typed(q, ui)).sheet
        expect([got.intent, got.ref, got.what]).toEqual(['passage', `${code} front:intro`, ['intro']])
      })
})

describe('word shapes, typed = button (the article)', () => {
  for (const ui of LANGS)
    for (const shape of ['meaning', 'howTranslate'])
      for (const [term, id] of TERMS[ui])
        test(`${ui} ${shape}: ${fill(S[shape]!.text[ui], { term })}`, async () => {
          await fullPhone()
          const q = fill(S[shape]!.text[ui], { term })
          const r = await turn({ last: null }, { q, slots: null }, ui)
          // offered only where it reads (suggest.ts SHAPES_OFF); where it is off, say so if it starts to read
          if (shapeOffered(shape, ui)) expect(r.concept).toBe(id)
          else if (r.concept === id) console.log(`now reads, could be offered: ${ui} ${shape}: ${q}`)
        })
})
