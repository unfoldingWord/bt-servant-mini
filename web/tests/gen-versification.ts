// Writes src/data/versification.json: the last verse of each chapter of the 66 books, as the English pack's texts (ULT/UST)
// publish them (the composer's chapter and verse strip; no book is opened while typing). Run once when the packs change:
//   bun tests/gen-versification.ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bookView } from '@bt-synergy/language-pack-v3'
import { installPacks } from './fs-packs'
import { CANON, openLang } from '../src/packs'

await installPacks(['en'])
const r = await openLang('en')
const out: Record<string, number[]> = {}
for (const code of CANON) {
  const seg = (await r.segments(`book:${code}`))?.[0]
  if (!seg) throw new Error(`no ${code} in the English pack`)
  const last = new Map<number, number>()
  for (const t of bookView(seg).texts) {
    let ch = 0
    for (const [, kind, arg] of t.events) {
      if (kind === 'chapter') ch = parseInt(arg, 10) || 0
      else if (kind === 'verse' && ch) {
        const v = Math.max(...arg.split('-').map((x: string) => parseInt(x, 10) || 0))
        if (v > (last.get(ch) ?? 0)) last.set(ch, v)
      }
    }
  }
  const n = Math.max(...last.keys())
  out[code] = Array.from({ length: n }, (_, i) => last.get(i + 1) ?? 0)
}
const total = Object.values(out).reduce((a, x) => a + x.length, 0)
writeFileSync(join(import.meta.dir, '../src/data/versification.json'), JSON.stringify(out).replace(/\],/g, '],\n') + '\n')
console.log(`${Object.keys(out).length} books, ${total} chapters`)
