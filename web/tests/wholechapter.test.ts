// "Capítulo completo (Éxodo 22)" (Abel, Nov 17: "no entiendo por qué muestra las notas primero si solicité el pasaje"; "buscó
// notas que incluyan «Completo» en Éxodo 22 en vez de buscar Éxodo 22 completo"). A button's label is never read as a question
// (main.ts typedFor: its words do not choose the notes shown first), and typed, "completo / entero / whole / complet…" say how
// much to show, not what the question is about (focus.ts STOP).
import { beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { focusWords } from '../src/focus'
import type { ConvState } from '../src/pipeline'

describe('"the whole chapter" is not a word to look for', () => {
  test('in the six languages, the qualifiers are not focus words; the book and the chapter neither', () => {
    for (const q of ['Capítulo completo (Éxodo 22)', 'Éxodo 22 completo', 'el capítulo entero de Éxodo 22', 'the whole chapter of Exodus 22',
      'Exodus 22, the entire chapter', 'tout le chapitre complet de Exode 22', 'seluruh pasal Keluaran 22', 'निर्गमन 22 पूरा अध्याय', 'الخروج 22 كاملا'])
      expect(focusWords(q), q).toEqual([])
    // asked about as a word, it is the word (Abel: "¿y si hay algún artículo de las palabras que se llame Completo?")
    for (const [q, w] of [['¿Qué significa completo en Éxodo 22?', 'completo'], ['la palabra completo en Mateo 5:48', 'completo'], ['What does "whole" mean in Luke 11:36?', 'whole'],
      ['What does whole mean in Luke 11:36?', 'whole'], ['Que signifie complet dans Matthieu 5:48 ?', 'complet'],
      // small words between the cue and the word
      ['¿Qué significa el completo?', 'completo'], ['El significado de completo en Mateo 5:48', 'completo'], ['What is the meaning of whole in Luke 11:36?', 'whole'],
      // (not Hindi: focus.ts folds its vowel signs away, «पूरा» is «पर», a small word, before and after this change)
      ['Que veut dire complet ?', 'complet']])
      expect(focusWords(q), q).toEqual(focusWords(`«${w}»`))
    // the cue elsewhere in the question: still how much to show
    for (const q of ['¿Qué significa el capítulo completo de Rut 1?', 'Explícame el significado de Éxodo 22 completo', 'What does the whole chapter of Exodus 22 mean?'])
      expect(focusWords(q), q).toEqual([])
    // a real word still counts
    expect(focusWords('¿Qué dice Éxodo 22 sobre el ladrón?')).toContain(focusWords('ladrón')[0]!)
  })
})

describe('typed "Éxodo 22 completo": the chapter, its notes not chosen by «completo»', () => {
  beforeAll(fullPhone)
  test('the passage first; no note of the chapter goes first because it quotes "complete"', async () => {
    const r = await turn({ last: null } as ConvState, { q: 'Éxodo 22 completo', slots: { intent: 'passage', book: 'exo', chapter: 22, what: ['text', 'notes'], lang: 'en' } }, 'es')
    expect(r.ref).toBe('exo 22')
    expect(r.reply.study?.focus ?? []).toEqual([])
  })
})

describe('«completo» as the word asked about: still a search term and its article', () => {
  beforeAll(fullPhone)
  test('"¿Qué significa completo?" and "What does complete mean?": the article «perfect, complete»', async () => {
    for (const [q, ui] of [['¿Qué significa completo?', 'es'], ['What does complete mean?', 'en']] as const) {
      const r = await turn({ last: null } as ConvState, { q, slots: null }, ui)
      expect(r.concept, q).toBe('tw:other/perfect')
    }
  })
  test('"la palabra completo en Mateo 5:48": the verse, its notes about «completo» first', async () => {
    const r = await turn({ last: null } as ConvState, { q: 'la palabra completo en Mateo 5:48', slots: null }, 'es')
    expect(r.ref).toBe('mat 5:48')
    expect(r.reply.study?.focus).toEqual(['completo'])
  })
  test('"completo" alone: a search, with the article «Perfecto» as a button', async () => {
    const r = await turn({ last: null } as ConvState, { q: 'completo', slots: null }, 'es')
    expect((r.reply.follow ?? []).some((f) => f.sheet?.concept === 'tw:other/perfect')).toBe(true)
  })
})
