// "Quien es Judas?" (report, Nov 18): the Judah articles were offered («Pregunté por Judas no por Judá»). No article is named
// "Judas" alone, so the name lost its «s» as a plural (conceptOf) and became Judá. Now a name that starts the names of people
// (Judas Iscariot, Judas son of James) offers those people; a name of its own (Judah, John) is unchanged.
import { beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { articleForQuestion } from '../src/search'
import type { ConvState } from '../src/pipeline'

const JUDAS = ['tw:names/judasiscariot', 'tw:names/judassonofjames']

describe('who is Judas', () => {
  beforeAll(fullPhone)
  test('the articles whose name starts with Judas, not Judah', async () => {
    for (const q of ['¿Quién es Judas?', 'Quien es Judas?', 'Who is Judas?', 'Who was Judas', 'Qui est Judas ?'])
      expect(await articleForQuestion(q)).toEqual(expect.arrayContaining(JUDAS))
    // written small, and the full name
    expect(await articleForQuestion('quien es judas')).toEqual(expect.arrayContaining(JUDAS))
    expect(await articleForQuestion('Who is Judas Iscariot?')).toEqual(['tw:names/judasiscariot'])
    for (const q of ['¿Quién es Judas?', 'Who is Judas?']) expect(await articleForQuestion(q)).not.toContain('tw:names/judah')
  })
  test('a common word is not the first word of a place', async () => {
    // («mar» starts «mar de Galilea», «city» City of David, «the» the Great Sea: none of them a name two people share)
    expect(await articleForQuestion('¿Qué es mar?')).toBeNull()
    expect(await articleForQuestion('¿Qué es Mar?')).toBeNull()
    expect(await articleForQuestion('What is city?')).toBeNull()
    expect(await articleForQuestion('Who is The?')).toBeNull()
  })
  test('a name of its own is unchanged', async () => {
    expect(await articleForQuestion('Who was Judah?')).toContain('tw:names/judah')
    expect(await articleForQuestion('Who was Judah?')).not.toContain('tw:names/judasiscariot')
    expect(await articleForQuestion('¿Quién fue Juan?')).toEqual(expect.arrayContaining(['tw:names/johntheapostle', 'tw:names/johnthebaptist']))
  })
  for (const [q, ui, labels] of [
    ['Quien es Judas?', 'es', ['Judas Iscariote', 'Judas el hijo de Santiago']],
    ['Who is Judas?', 'en', ['Judas Iscariot', 'Judas son of James']],
  ] as const)
    test(`${q}: a choice between the two people named Judas`, async () => {
      const r = await turn({ last: null } as ConvState, { q, slots: null }, ui)
      expect(r.answered).toBe('choose')
      const info = r.reply.info ?? ''
      for (const l of labels) expect(info).toContain(l)
      expect(info).not.toMatch(/Jud[aá](?![s\p{L}])|Judah/u)
    })
})
