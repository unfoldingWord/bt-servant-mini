// "¿Quiénes fueron los hijos de Isaac?" (Abel, Nov 17): the search kept «quiénes» and «fueron» as words to look for, found «fueron
// hijos» in the Spanish pack (no Genesis) and never Isaac's sons; only online AI answered. Now the question words are left out
// (search.ts STOP), family words go to English when the language's pack lacks the passage (story-words-more.json), and Isaac's
// article is a button in sight (a person the question names).
import { beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { keywords } from '../src/search'
import { splitFollow } from '../src/converse'
import type { ConvState } from '../src/pipeline'

describe('who were the sons of Isaac', () => {
  test('the question words are not looked for', () => {
    expect(keywords('¿Quiénes fueron los hijos de Isaac?')).toEqual(['hijos', 'Isaac'])
    expect(keywords('¿Quiénes eran los hijos de Isaac?')).toEqual(['hijos', 'Isaac'])
    // («eran» capitalized is a name: Eran, Numbers 26:36)
    expect(keywords('¿Quién fue Eran?')).toEqual(['Eran'])
    // first in the question or in capitals: the verb
    expect(keywords('Eran muchos los hijos de Jacob?')).not.toContain('Eran')
    expect(keywords('¿QUIÉNES ERAN LOS HIJOS DE ISAAC?').map((w) => w.toLowerCase())).toEqual(['hijos', 'isaac'])
    expect(keywords('Qui étaient les fils d’Isaac ?').map((w) => w.toLowerCase())).not.toContain('étaient')
    expect(keywords('من هم أبناء إسحاق؟')).not.toContain('هم')
  })
  beforeAll(fullPhone)
  for (const [q, ui] of [['¿Quiénes fueron los hijos de Isaac?', 'es'], ['Qui étaient les fils d’Isaac ?', 'fr'], ['من هم أبناء إسحاق؟', 'ar']] as const) {
    test(`${q}: verses with Isaac and his son(s), and Isaac's article in sight`, async () => {
      const r = await turn({ last: null } as ConvState, { q, slots: null }, ui)
      expect(r.answered).toBe('search')
      const info = r.reply.info ?? ''
      // every verse shown names Isaac (in the English text, or the Arabic)
      expect(info).toMatch(/Isaac|إِسْحَاقَ|إِسْحاقَ/)
      // and a son of his (the English text, or the Arabic «ٱبْنَا»/«ابْنَهُ»)
      expect(info).toMatch(/sons?|ٱبْنَا|ابْنَهُ|بَنُو|بني/)
      expect(r.reply.meta).toMatch(/findall: verses/)
      const { shown } = splitFollow(r.reply.follow ?? [], 0)
      expect(shown.some((f) => f.sheet?.concept === 'tw:names/isaac')).toBe(true)
    })
  }
})
