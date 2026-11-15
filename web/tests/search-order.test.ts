// A free search finds the same verses, notes and questions, in the same order, as before the word index (src/textindex.ts):
// the hits below are what the client's own search in memory gave (bench-search.ts --impl before, Nov 2026), one pack installed.
import { test, expect } from 'bun:test'
import { installPacks, ALL_PACKS } from './fs-packs'
import { run } from './bench-search'

const CASES: { pack: string; q: string; how: string; verses: string[]; helps: string[] }[] = [
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
    helps: ['note hi act 18:17 mj77'],
  },
  {
    pack: 'ar', q: 'أين ابتلع الحوت يونان؟', how: 'concepts',
    verses: ['jon 1:17 concepts', 'jon 4:6 concepts', 'mat 12:40 concepts', 'jon 1:5 concepts', 'jon 2:1 concepts'],
    helps: [],
  },
]

for (const c of CASES) {
  test(`same hits in the same order: ${c.pack} "${c.q}"`, async () => {
    if (!ALL_PACKS.includes(c.pack)) return
    await installPacks([c.pack])
    const cold = await run(c.q, c.pack)
    expect({ how: cold.how, verses: cold.verses, helps: cold.helps }).toEqual({ how: c.how, verses: c.verses, helps: c.helps })
    // the second time, from the index already built
    const warm = await run(c.q, c.pack)
    expect([warm.verses, warm.helps]).toEqual([c.verses, c.helps])
  }, 120000)
}
