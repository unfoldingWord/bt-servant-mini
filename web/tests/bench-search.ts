// Times free searches (no reference) per language, with every pack installed and with only the question's pack, cold (just
// after the packs are installed, nothing read yet) and warm (the same question again). Prints a table and, with --out, writes
// the hits of every question so two runs can be compared (same books, chapters and verses in the same order).
//   bun tests/bench-search.ts                       # every language, both setups
//   bun tests/bench-search.ts --langs ar,en --out before.json
//   bun tests/bench-search.ts --compare before.json after.json
//   bun tests/bench-search.ts --impl before,after   # with src/search-before.ts, a copy of an older search.ts (not committed):
//                                                   # both, one question after the other, under the same load
import { readFileSync, writeFileSync } from 'node:fs'
import { installPacks, ALL_PACKS } from './fs-packs'
import * as current from '../src/search'

type Impl = Pick<typeof current, 'searchVerses' | 'searchHelps' | 'resetSearch'>
async function impl(name: string): Promise<Impl> {
  // a variable path, so the copy is only looked for when asked
  const older = '../src/search-before'
  return name === 'before' ? await import(older) : current
}

/** Three questions per language: a name the word links know (Jonah), a story, and words no article names (text search). */
export const QUESTIONS: Record<string, { pack: string; qs: string[] }> = {
  en: { pack: 'en', qs: ['Where does it say Jonah was swallowed by a fish?', 'Where does Jesus walk on the water?', 'Where is the barley harvest mentioned?'] },
  es: { pack: 'es-419', qs: ['¿Dónde dice que Jonás fue tragado por un pez?', '¿Dónde camina Jesús sobre el agua?', '¿Dónde se habla de la cosecha de cebada?'] },
  id: { pack: 'id', qs: ['Di mana Yunus ditelan ikan besar?', 'Di mana Yesus berjalan di atas air?', 'Di mana disebut panen jelai?'] },
  hi: { pack: 'hi', qs: ['योना को मछली ने कहाँ निगला?', 'यीशु पानी पर कहाँ चला?', 'जौ की कटनी का वर्णन कहाँ है?'] },
  ar: { pack: 'ar', qs: ['أين ابتلع الحوت يونان؟', 'أين مشى يسوع على الماء؟', 'أين يذكر حصاد الشعير؟'] },
  fr: { pack: 'en', qs: ['Où Jonas a-t-il été avalé par un poisson ?'] },
}

export type Run = { verses: string[]; how: string; helps: string[]; vMs: number; hMs: number }
const now = () => performance.now()
export async function run(q: string, pack: string, s: Impl = current): Promise<Run> {
  let t = now()
  const v = await s.searchVerses(q, null, pack)
  const vMs = now() - t
  t = now()
  const h = await s.searchHelps(q, pack)
  const hMs = now() - t
  return {
    verses: v.hits.map((x) => `${x.book} ${x.ch}:${x.v} ${x.why}`),
    how: v.how,
    helps: h.map((x) => `${x.kind} ${x.lang} ${x.book} ${x.ch}:${x.v} ${x.id}`),
    vMs,
    hMs,
  }
}

async function main() {
  const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }
  const cmp = arg('--compare')
  if (cmp) return compare(cmp, process.argv[process.argv.indexOf('--compare') + 2]!)
  const langs = (arg('--langs') ?? Object.keys(QUESTIONS).join(',')).split(',')
  const setups = (arg('--setups') ?? 'all,own').split(',')
  const impls = (arg('--impl') ?? 'after').split(',')
  const out: Record<string, Record<string, Run & { warm: number }>> = Object.fromEntries(impls.map((i) => [i, {}]))
  const fmt = (ms: number) => (ms / 1000).toFixed(2).padStart(7)
  console.log(`${'impl'.padEnd(6)} ${'setup'.padEnd(5)} ${'lang'.padEnd(4)} cold(v+h) warm(v+h)  question`)
  for (const setup of setups) {
    for (const l of langs) {
      const { pack, qs } = QUESTIONS[l]!
      if (!ALL_PACKS.includes(pack)) continue
      for (const q of qs) {
        for (const name of impls) {
          const s = await impl(name)
          // cold: the packs just installed, nothing read or indexed yet
          await installPacks(setup === 'all' ? ALL_PACKS : [pack])
          s.resetSearch()
          Bun.gc(true)
          const cold = await run(q, pack, s)
          const warm = await run(q, pack, s)
          if (JSON.stringify([cold.verses, cold.helps]) !== JSON.stringify([warm.verses, warm.helps])) console.log('  ! warm hits differ from cold')
          out[name]![`${setup}|${l}|${q}`] = { ...cold, warm: warm.vMs + warm.hMs }
          console.log(`${name.padEnd(6)} ${setup.padEnd(5)} ${l.padEnd(4)} ${fmt(cold.vMs + cold.hMs)}  ${fmt(warm.vMs + warm.hMs)}   ${q}  [${cold.how} ${cold.verses.length}v ${cold.helps.length}h; v ${fmt(cold.vMs)} h ${fmt(cold.hMs)}]`)
        }
      }
    }
  }
  const file = arg('--out')
  // one file per implementation: <out>.<impl>.json
  if (file) for (const name of impls) writeFileSync(file.replace(/(\.json)?$/, `.${name}.json`), JSON.stringify(out[name], null, 1))
}

/** Same hits, in the same order, in two runs. */
function compare(a: string, b: string) {
  const A = JSON.parse(readFileSync(a, 'utf8'))
  const B = JSON.parse(readFileSync(b, 'utf8'))
  let diff = 0
  for (const k of Object.keys(A)) {
    if (!B[k]) continue
    for (const f of ['how', 'verses', 'helps']) {
      if (JSON.stringify(A[k][f]) === JSON.stringify(B[k][f])) continue
      diff++
      console.log(`DIFF ${k} ${f}\n  before ${JSON.stringify(A[k][f])}\n  after  ${JSON.stringify(B[k][f])}`)
    }
  }
  console.log(diff ? `${diff} differences` : 'same hits in the same order')
}

if (import.meta.main) await main()
