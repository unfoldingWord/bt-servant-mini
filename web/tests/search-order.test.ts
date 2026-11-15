// A free search finds the same verses, notes and questions, in the same order, as before the word index (src/textindex.ts):
// the hits below are what the client's own search in memory gave (bench-search.ts --impl before, Nov 2026), one pack installed,
// except where the index matches whole Arabic and Hindi words on purpose (said at the case).
import { test, expect } from 'bun:test'
import { installPacks, ALL_PACKS } from './fs-packs'
import { run } from './bench-search'
import { openLang } from '../src/packs'
import { searchVerses } from '../src/search'
import { searchIndex } from '../src/textindex'

const CASES: { pack: string; packs?: string[]; q: string; how: string; verses: string[]; helps: string[] }[] = [
  {
    pack: 'en', q: 'Where is the barley harvest mentioned?', how: 'text',
    verses: ['rut 2:23 text:barley harvest', 'jol 1:11 text:barley harvest', '2sa 21:9 text:barley harvest', 'ezk 45:13 text:barley harvest', 'rut 1:22 text:barley harvest'],
    helps: ['note en rut 1:22 bgy3', 'note en pro 25:13 sxk7', 'question en rut 1:22 f327', 'question en rut 2:23 zj8n'],
  },
  {
    pack: 'es-419', q: '¿Dónde dice que Jonás fue tragado por un pez?', how: 'concepts',
    verses: ['jon 1:17 concepts', 'jon 2:1 concepts', 'jon 2:10 concepts'],
    helps: [],
  },
  {
    pack: 'id', q: 'Di mana Yesus berjalan di atas air?', how: 'text',
    verses: ['3jn 1:3 text:berjalan', '3jn 1:4 text:berjalan'],
    helps: ['note id col 1:1 gtm3', 'question id col 2:6 zuqz'],
  },
  {
    pack: 'hi', q: 'योना को मछली ने कहाँ निगला?', how: 'concepts',
    verses: ['jon 1:17 concepts', 'jon 2:1 concepts', 'jon 2:10 concepts', 'mat 12:40 concepts'],
    // the client's search found a note on Acts 18:17 (Sosthenes beaten) through pieces of words; whole words find none
    helps: [],
  },
  {
    pack: 'ar', q: 'أين ابتلع الحوت يونان؟', how: 'concepts',
    verses: ['jon 1:17 concepts', 'jon 4:6 concepts', 'mat 12:40 concepts', 'jon 1:5 concepts', 'jon 2:1 concepts'],
    helps: [],
  },
  {
    // the text route in Arabic (no word names an article): verses from the Arabic texts (AVD, NAV) since they pass the
    // text filter and their alef wasla (ٱلْخُبْزِ) reads as alef; before, the verses came through English ("bread")
    pack: 'ar', packs: ['ar', 'en'], q: 'أين يذكر الخبز؟', how: 'text',
    verses: ['exo 29:23 text:الخبز', 'ezk 4:16 text:الخبز', 'jhn 6:32 text:الخبز', 'jhn 6:58 text:الخبز', 'jhn 6:51 text:الخبز', 'mrk 8:5 text:الخبز'],
    helps: ['note ar 2th 3:8 ruh3', 'note ar jud 1:12 aq79'],
  },
]

for (const c of CASES) {
  test(`same hits in the same order: ${c.pack} "${c.q}"`, async () => {
    const packs = c.packs ?? [c.pack]
    if (!packs.every((p) => ALL_PACKS.includes(p))) return
    await installPacks(packs)
    const cold = await run(c.q, c.pack)
    expect({ how: cold.how, verses: cold.verses, helps: cold.helps }).toEqual({ how: c.how, verses: c.verses, helps: c.helps })
    // the second time, from the index already built
    const warm = await run(c.q, c.pack)
    expect([warm.verses, warm.helps]).toEqual([c.verses, c.helps])
  }, 120000)
}

test('an Arabic question finds Arabic verses, written with or without vowels, alef wasla or alef maqsura', async () => {
  if (!ALL_PACKS.includes('ar')) return
  await installPacks(['ar'])
  const v = await searchVerses('أين حصاد الشعير؟', null, 'ar')
  expect(v.how).toBe('text')
  expect(v.hits.map((h) => `${h.book} ${h.ch}:${h.v}`)).toContain('rut 2:23')
  for (const h of v.hits) expect(h.text).toMatch(/[؀-ۿ]/)
  const r = await openLang('ar')
  const avd = async (w: string) => (await searchIndex(r, w, { kinds: ['text'], limit: 30 })).filter((h) => /\/avd$/.test(h.res)).length
  // AVD writes ٱللهِ and مُوسَى: typed as most people type them
  expect(await avd('الله')).toBeGreaterThan(0)
  expect(await avd('موسي')).toBeGreaterThan(0)
  expect(await avd('موسى')).toBe(await avd('موسي'))
}, 120000)
