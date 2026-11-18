// A report of Nov 18: asking who Jesus' disciples were gave the Translation Words article «disciple» (what a disciple is), not
// who they were. Now "who were the disciples / the apostles / the twelve (of Jesus)?" opens «The twelve» (tw:kt/thetwelve),
// whose article names them, with Matthew 10:2-4 (the list) as the first button; "what is a disciple?" still opens «disciple».
import { beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { articleForQuestion } from '../src/search'
import type { ConvState } from '../src/pipeline'

const TWELVE = ['tw:kt/thetwelve']

describe('who were the disciples of Jesus', () => {
  beforeAll(fullPhone)
  test('the twelve, in each language', async () => {
    for (const q of [
      '¿Quiénes eran los discípulos de Jesús?', 'Quienes fueron los doce apóstoles', '¿Quiénes eran los doce?',
      'Who were the disciples of Jesus?', 'Who were Jesus’ twelve apostles?', 'Who are the twelve?',
      'Qui étaient les disciples de Jésus ?', 'Qui étaient les douze apôtres ?',
      'Siapa murid-murid Yesus?', 'Siapakah kedua belas rasul?',
      'من هم تلاميذ يسوع؟', 'من هم الرسل الاثنا عشر؟',
      'यीशु के चेले कौन थे?',
      'Who were the disciples of Jesus Christ?', 'Qui sont les apôtres de Jésus-Christ ?', '¿Quiénes eran los apóstoles de Jesucristo?',
      'Who were the 12 apostles?', 'Siapa saja murid Yesus?',
    ]) expect([q, await articleForQuestion(q)]).toEqual([q, TWELVE])
  })
  test('someone else’s disciples, or one disciple: not the twelve', async () => {
    for (const q of ['Who were the disciples of John the Baptist?', '¿Quiénes eran los discípulos de los fariseos?', 'Who is a disciple?', 'Who were the twelve tribes?'])
      expect([q, await articleForQuestion(q)]).not.toEqual([q, TWELVE])
  })
  test('what a disciple is: still «disciple»', async () => {
    expect(await articleForQuestion('¿Qué es un discípulo?')).toEqual(['tw:kt/disciple'])
    expect(await articleForQuestion('What is a disciple?')).toEqual(['tw:kt/disciple'])
    expect(await articleForQuestion('What is an apostle?')).toEqual(['tw:kt/apostle'])
  })
  for (const [q, ui, slots, mat] of [
    ['¿Quiénes eran los discípulos de Jesús?', 'es', null, 'Mateo 10:2'],
    // as the model reads it (an article about «discípulos de Jesús»)
    ['¿Quiénes eran los discípulos de Jesús?', 'es', { intent: 'article', term: 'discípulos de Jesús', lang: 'es' }, 'Mateo 10:2'],
    ['Who were the twelve apostles?', 'en', null, 'Matthew 10:2'],
    // the Indonesian pack has no «The twelve»: the English article, not "not installed"
    ['Siapa murid-murid Yesus?', 'id', null, 'Matthew 10:2'],
  ] as const)
    test(`${q} (${slots ? 'model' : 'no model'}): the article of the twelve, and Matthew 10:2-4 first`, async () => {
      const r = await turn({ last: null } as ConvState, { q, slots: slots as any }, ui)
      expect(r.answered).toBe('article')
      expect(r.concept).toBe('tw:kt/thetwelve')
      const labels = (r.reply.follow ?? []).map((f) => f.label)
      expect(labels[0]).toContain(mat)
      expect(labels.filter((l) => l.includes(mat.slice(0, -2))).length).toBe(1)
      expect(r.reply.info ?? '').toMatch(/twelve|doce/i)
    })
})
