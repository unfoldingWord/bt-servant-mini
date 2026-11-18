// A name alone (Abel, Nov 18; encargo of ms/kin-name): "Abraham" is answered by who he is, the Translation Words article, as before
// ms/kin; the family is one plain line inside the article's fold and a button, never in its place. A person with no article ("Hamul")
// gets a card: how they are tied to someone known (kin.ts tiesOfPerson), the whole family and the verses behind buttons. "hijos de
// X" keeps the family answer, the article as its first button. Two people of that name: which one, first.
import { beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { kinQuestion } from '../src/kin'
import type { ConvState } from '../src/pipeline'

const ask = (q: string, ui: string, c: ConvState = { last: null }) => turn(c, { q, slots: null }, ui)
const labels = (r: { reply: { follow?: { label: string }[] } }) => (r.reply.follow ?? []).map((f) => f.label)

beforeAll(async () => {
  await fullPhone()
  await kinQuestion('hijos de Isaac', 'es', null)
})

describe('a name with a Translation Words article: the article, as before', () => {
  for (const [q, ui] of [['Abraham', 'es'], ['Abraham', 'en'], ['Abraham', 'fr'], ['Abraham', 'id'], ['अब्राहम', 'hi'], ['إسحاق', 'ar']] as const) {
    test(`${q} (${ui})`, async () => {
      const r = await ask(q, ui)
      expect(r.answered).toBe('article')
      expect(r.concept).toBe(ui === 'ar' ? 'tw:names/isaac' : 'tw:names/abraham')
      // its first lines are the article's, not the family's
      expect((r.reply.info ?? '').split('\n')[0]).toMatch(/^## /)
    })
  }
  test('the family line is inside the fold, plain, after the article; its button is the whole family', async () => {
    const r = await ask('Abraham', 'es')
    const info = r.reply.info!
    const fam = info.indexOf('Familia de Abraham:')
    expect(fam).toBeGreaterThan(info.indexOf('▸'))
    // (inside «Más sobre…», the first fold: before its first end mark, not in a later fold)
    expect(fam).toBeLessThan(info.indexOf('◂'))
    expect(info).not.toMatch(/\*\*Familia de Abraham/)
    const b = r.reply.follow!.find((f) => f.sheet?.intent === 'kin')!
    expect(b.sheet!.what).toEqual(['family'])
  })
})

describe('a name with no article (a minor person): who they are, by the nearest known person', () => {
  const cases: [string, string, RegExp][] = [
    ['Hamul', 'es', /^\*\*Hamul\*\* — descendiente de Judá/],
    // (the packs on disk have no ACAI links: Tamar and Rahab are not known there; with them the line names them too)
    ['Perez', 'en', /^\*\*Perez\*\* — son of Judah/],
    ['Salmon', 'en', /^\*\*Salmon\*\* — father of Boaz/],
    ['Zimran', 'es', /^\*\*Zimran\*\* — hijo de Abraham, hermano de/],
  ]
  for (const [q, ui, re] of cases) {
    test(`${q} (${ui})`, async () => {
      const r = await ask(q, ui)
      expect(r.route).toBe('kin')
      expect(r.reply.info).toMatch(re)
      // not every relation: the whole family and the verses behind buttons
      expect(r.reply.info).not.toMatch(/\*\*(Padres|Parents|Hijos|Children):\*\*/)
      expect(labels(r)).toEqual(expect.arrayContaining([ui === 'es' ? 'Más familia' : 'More family']))
    })
  }
  test('«Dónde se nombra a X» lists the verses; «Más familia» the whole family', async () => {
    const c: ConvState = { last: null }
    const r = await ask('Hamul', 'es', c)
    const where = r.reply.follow!.find((f) => /^Dónde se nombra a Hamul$/.test(f.label))
    const card = r.reply.follow!.find((f) => f.label === 'Más familia')!
    const all = await turn(c, { q: '', sheet: card.sheet! }, 'es')
    expect(all.reply.info).toMatch(/\*\*Padres:\*\* /)
    if (where) {
      const v = await turn(c, { q: '', sheet: where.sheet! }, 'es')
      expect(v.reply.info).toMatch(/^\*\*Hamul\*\* — Se nombra en \d+ versículos\./)
      expect((v.reply.follow ?? []).some((f) => f.sheet?.intent === 'passage')).toBe(true)
    }
  })
  test('two people of that name, neither with an article: which one, first («Adah»)', async () => {
    const r = await ask('Adah', 'en')
    expect(r.answered).toBe('choose')
    expect(labels(r).length).toBe(2)
  })
})

describe('«hijos de X»: the family answer, the article first among its buttons', () => {
  for (const [q, ui] of [['hijos de Abraham', 'es'], ['sons of Abraham', 'en'], ['anak-anak Abraham', 'id'], ['أبناء إسحاق', 'ar']] as const) {
    test(`${q}`, async () => {
      const r = await ask(q, ui)
      expect(r.answered).toBe('family')
      expect(r.reply.follow![0]!.sheet?.concept).toBe(ui === 'ar' ? 'tw:names/isaac' : 'tw:names/abraham')
    })
  }
})

describe('ordinary words are not taken for a name', () => {
  // (and words that are a minor person's name in some pack: «ira», «sal», «mar», «nun», «hur», written in lower case)
  for (const [q, ui] of [['gracia', 'es'], ['amor', 'es'], ['Dios', 'es'], ['Jerusalén', 'es'], ['hello', 'en'], ['Rut', 'es'], ['grace', 'en'], ['ira', 'es'], ['sal', 'es'], ['mar', 'es'], ['mesa', 'es'], ['nun', 'en'], ['hur', 'en'], ['bela', 'es'],
    // (and capitalized, as a phone keyboard writes them: a word with an article is that article, never a person's card)
    ['Ira', 'es'], ['Sal', 'es'], ['Mar', 'es'], ['Gracia', 'es'], ['Amor', 'es']] as const) {
    test(`${q}`, async () => {
      expect((await ask(q, ui)).route).not.toBe('kin')
    })
  }
})

describe('the reader does not decide a name alone (Abel’s phone, Nov 18)', () => {
  // a reader read «Abraham», in a 5M session, as a passage of Genesis: the verses that mention him came instead of his article
  for (const slots of [{ intent: 'passage', book: 'gen', lang: 'en', what: ['text'] }, { intent: 'search', book: 'gen', lang: 'en' }, { intent: 'search', lang: 'es', what: ['notes'] }]) {
    test(`«Abraham» read as ${JSON.stringify(slots)}: still his article, in the app’s language`, async () => {
      const r = await turn({ last: null }, { q: 'Abraham', slots: slots as never }, 'es')
      expect(r.answered).toBe('article')
      expect(r.concept).toBe('tw:names/abraham')
      expect(r.reply.meta).toMatch(/a name alone/)
    })
  }
  test('«abraham» in lower case: his article too (no capital needed when there is an article)', async () => {
    const r = await turn({ last: null }, { q: 'abraham', slots: { intent: 'passage', book: 'gen', lang: 'en', what: ['text'] } as never }, 'es')
    expect(r.concept).toBe('tw:names/abraham')
  })
  test('a key term alone is not touched by this (only names of people): «gracia» as the reader reads it', async () => {
    const r = await turn({ last: null }, { q: 'gracia', slots: { intent: 'article', term: 'gracia', lang: 'es' } as never }, 'es')
    expect(r.reply.meta ?? '').not.toMatch(/a name alone/)
  })
})
