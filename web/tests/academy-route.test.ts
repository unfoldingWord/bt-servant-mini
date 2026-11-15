// The `academy` route (pipeline.ts): which Translation Academy article a training question gets, by the word list
// (src/data/ta-synonyms.json) and the titles of the packs. The answers themselves are in tests/cases/academy.jsonl.
import { expect, test } from 'bun:test'
import { installPacks, ALL_PACKS } from './fs-packs'
import { openLang } from '../src/packs'
import { academyFor, taStem } from '../src/pipeline'
import syn from '../src/data/ta-synonyms.json'

test('every article of the word list is in the English pack', async () => {
  await installPacks(ALL_PACKS)
  const names = ((await (await openLang('en')).maps()) as any).map?.core?.names ?? {}
  const missing = Object.keys((syn as any).ids).filter((id) => !names[id])
  expect(missing).toEqual([])
})

test('plural and article do not count', () => {
  expect(taStem('Metaphors')).toBe('metaphor')
  expect(taStem('modismos')).toBe('modismo')
  expect(taStem('process')).toBe('process')
  expect(taStem('الاستعارة')).toBe('استعاره')
})

const right: [string, string, string][] = [
  ['en', 'How do I translate modisms?', 'ta:translate/figs-idiom'],
  ['en', 'How to translate metaphors?', 'ta:translate/figs-metaphor'],
  ['en', 'What book of the Bible should I translate first?', 'ta:translate/translation-difficulty'],
  ['en', 'I am starting in translation, how should I start?', 'ta:process/process-manual'],
  ['en', 'How do I set up a translation team?', 'ta:process/setup-team'],
  ['en', 'How do we choose the translation team?', 'ta:translate/choose-team'],
  ['en', 'How do I check a translation?', 'ta:checking/intro-checking'],
  ['en', 'How do I make a back translation?', 'ta:checking/vol2-backtranslation'],
  ['en', 'How do I translate names?', 'ta:translate/translate-names'],
  ['en', 'How do I translate a simple metaphor?', 'ta:translate/figs-simetaphor'],
  ['es', '¿Cómo traduzco los modismos?', 'ta:translate/figs-idiom'],
  ['es', '¿Qué libro de la Biblia debo traducir primero?', 'ta:translate/translation-difficulty'],
  ['es', '¿Con qué libro empiezo a traducir?', 'ta:translate/translation-difficulty'],
  ['es', 'Estoy empezando en la traducción, ¿cómo debo empezar?', 'ta:process/process-manual'],
  ['es', '¿Cómo formo un equipo de traducción?', 'ta:process/setup-team'],
  ['es', '¿Cómo traduzco nombres?', 'ta:translate/translate-names'],
  ['hi', 'अनुवाद दल कैसे बनाएँ?', 'ta:process/setup-team'],
  ['ar', 'كيف أترجم الاستعارة؟', 'ta:translate/figs-metaphor'],
]
for (const [lang, q, id] of right)
  test(`${q} -> ${id}`, async () => {
    await installPacks(ALL_PACKS)
    const pack = lang === 'es' ? 'es-419' : lang
    expect((await academyFor(q, [...new Set([pack, 'en'])], lang))?.id).toBe(id)
  })

// not training questions, or not about one article: the other routes answer them
const none = [
  'What is the first book of the Bible?',
  'How do I translate the name Yahweh?',
  '¿Cómo traduzco esto en mi idioma?',
  'How should I start translating Ruth?',
  'What does grace mean?',
  'Who was on the team of Paul?',
]
for (const q of none)
  test(`${q} -> none`, async () => {
    await installPacks(ALL_PACKS)
    expect((await academyFor(q, ['en']))?.id ?? null).toBe(null)
  })
