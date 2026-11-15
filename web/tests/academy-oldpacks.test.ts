// A phone with the older packs (Translation Academy: the translate manual only, though their maps name every manual): a
// question about a process article ("set up a team") is left to the other routes, never "not installed on this device";
// one about a translate article still gets it.
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { ALL_PACKS, installPacks, OLD_PACKS_DIR, usePacksDir } from './fs-packs'
import { turn } from './harness'

const have = existsSync(OLD_PACKS_DIR)
beforeAll(async () => {
  if (!have) return
  usePacksDir(OLD_PACKS_DIR)
  await installPacks(ALL_PACKS)
})
afterAll(async () => {
  usePacksDir()
  await installPacks(ALL_PACKS)
})

const bad = /not installed|no está instalad|tidak terpasang|इंस्टॉल नहीं|غير مثبت/i
const team: [string, string][] = [
  ['en', 'How do I set up a translation team?'],
  ['es', '¿Cómo formo un equipo de traducción?'],
  ['id', 'Bagaimana membentuk tim penerjemah?'],
  ['hi', 'अनुवाद दल कैसे बनाएँ?'],
  ['ar', 'كيف نشكل فريق ترجمة؟'],
]
for (const [lang, q] of team)
  test.skipIf(!have)(`old packs, ${lang}: ${q} is not answered "not installed"`, async () => {
    const r = await turn({ last: null }, { q, slots: null }, lang)
    expect(r.route).not.toBe('academy')
    expect(JSON.stringify(r.reply)).not.toMatch(bad)
  }, 60_000)

test.skipIf(!have)('old packs: a translate-manual article still comes', async () => {
  const r = await turn({ last: null }, { q: 'How do I translate idioms?', slots: null }, 'en')
  expect(r.route).toBe('academy')
  expect(r.concept).toBe('ta:translate/figs-idiom')
}, 60_000)
