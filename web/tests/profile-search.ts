// Where the cold time of a free search goes, per pack: opening it and reading its maps, then reading every book into the word
// index, and the index's size.   bun tests/profile-search.ts [ar en …]
import { installPacks, ALL_PACKS } from './fs-packs'
import { openLang } from '../src/packs'
import { indexBytes, prepareIndex } from '../src/textindex'

const ms = (t: number) => `${(performance.now() - t).toFixed(0)} ms`.padStart(9)
const mb = (n: number) => `${(n / 2 ** 20).toFixed(1)} MB`

for (const pack of process.argv.slice(2).length ? process.argv.slice(2) : ALL_PACKS) {
  await installPacks([pack])
  Bun.gc(true)
  const heap0 = process.memoryUsage().heapUsed
  let t = performance.now()
  const r = await openLang(pack)
  await r.maps()
  const open = ms(t)
  t = performance.now()
  await prepareIndex(r)
  const index = ms(t)
  Bun.gc(true)
  const heap1 = process.memoryUsage().heapUsed
  const rss = process.memoryUsage().rss
  console.log(`${pack.padEnd(6)} open+maps ${open}  read every book and index it ${index}  index ${mb(await indexBytes(r))}  heap +${mb(heap1 - heap0)}  rss ${mb(rss)}`)
}
