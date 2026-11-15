// Checks the word index (src/textindex.ts) against the client's own search in memory, query by query: same hits, in the same
// order, with the same snippets and scores. Slow (the client reads every row of a pack on each search), so a script, not a test.
//   bun tests/index-equiv.ts            # every pack on disk
//   bun tests/index-equiv.ts ar hi
import { installPacks, ALL_PACKS } from './fs-packs'
import { openLang } from '../src/packs'
import { searchIndex } from '../src/textindex'
import { keywords } from '../src/search'
import { QUESTIONS } from './bench-search'

const EXTRA: Record<string, string[]> = {
  en: ['God', 'the', 'love', 'fish sea', 'Jonah', 'barley harvest', 'lost sheep', 'grace', "Lord's", 'son of man', 'x-ray'],
  'es-419': ['Dios', 'amor', 'pez', 'mar', 'cebada', 'oveja perdida', 'gracia', 'Jesús', 'el', 'tragado'],
  id: ['Allah', 'kasih', 'ikan', 'Yunus', 'domba', 'jelai', 'Yesus', 'yang'],
  hi: ['परमेश्वर', 'प्रेम', 'मछली', 'योना', 'भेड़', 'यीशु', 'और', 'जौ'],
  ar: ['الله', 'محبة', 'حوت', 'يونان', 'يسوع', 'الماء', 'و', 'خروف', 'شعير', 'God', 'the'],
}

const packs = process.argv.slice(2).length ? process.argv.slice(2) : ALL_PACKS
let bad = 0
let n = 0
for (const pack of packs) {
  await installPacks([pack])
  const r = await openLang(pack)
  const qs = new Set<string>(EXTRA[pack] ?? [])
  for (const { pack: p, qs: list } of Object.values(QUESTIONS)) {
    if (p !== pack) continue
    for (const q of list) {
      const kw = keywords(q)
      qs.add(kw.join(' '))
      for (const w of kw) qs.add(w)
    }
  }
  for (const q of qs) {
    for (const f of [{ kinds: ['text' as const], limit: 30 }, { kinds: ['note' as const, 'question' as const], limit: 20 }]) {
      n++
      const want = (await r.search(q, f)).data ?? []
      // the index gives snippets and ids on demand: all of them here, to compare whole hits
      const got = await Promise.all((await searchIndex(r, q, f)).map(async ({ more, ...h }) => {
        const m = await more()
        return { kind: h.kind, book: h.book, ref: h.ref, res: h.res, ...(m.id !== undefined ? { id: m.id } : {}), snippet: m.snippet, score: h.score }
      }))
      const a = JSON.stringify(want)
      const b = JSON.stringify(got)
      if (a === b) continue
      bad++
      console.log(`DIFF ${pack} ${JSON.stringify(q)} ${f.kinds.join(',')}`)
      const strip = (h: any) => `${h.book} ${h.ref} ${h.res} ${h.id ?? ''} ${h.score.toFixed(6)}`
      for (let i = 0; i < Math.max(want.length, got.length); i++) {
        const x = want[i] ? strip(want[i]) : '-'
        const y = got[i] ? strip(got[i]) : '-'
        if (x !== y || JSON.stringify(want[i]) !== JSON.stringify(got[i])) console.log(`  ${i}: client ${x} | index ${y}${x === y ? ' (snippet differs)' : ''}`)
      }
    }
  }
  console.log(`${pack}: ${qs.size} queries checked`)
}
console.log(bad ? `${bad} of ${n} searches differ` : `all ${n} searches identical`)
