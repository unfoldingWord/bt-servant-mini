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
