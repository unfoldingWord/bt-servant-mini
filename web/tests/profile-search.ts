// Where the cold time of a free search goes, per pack: opening it and reading its maps, then reading every book into the word
// index; the index's size; and how long the screen would freeze meanwhile (a timer every 10 ms: the waits over 50 ms between
// two of its ticks, and the longest).   bun tests/profile-search.ts [ar en …]
import { heapStats } from 'bun:jsc'
import { installPacks, ALL_PACKS } from './fs-packs'
import { openLang } from '../src/packs'
import { indexBytes, prepareIndex } from '../src/textindex'

const ms = (t: number) => `${(performance.now() - t).toFixed(0)} ms`.padStart(9)
const mb = (n: number) => `${(n / 2 ** 20).toFixed(1)} MB`
/** The JS heap with typed arrays (their buffers are outside heapUsed). */
const heap = () => { Bun.gc(true); return heapStats().heapSize }

for (const pack of process.argv.slice(2).length ? process.argv.slice(2) : ALL_PACKS) {
  await installPacks([pack])
  const h0 = heap()
  let t = performance.now()
  const r = await openLang(pack)
  await r.maps()
  const open = ms(t)
  const h1 = heap()
  t = performance.now()
  const gaps: number[] = []
  let tick = performance.now()
  const timer = setInterval(() => { const n = performance.now(); if (n - tick > 50) gaps.push(n - tick); tick = n }, 10)
  await prepareIndex(r)
  clearInterval(timer)
  const index = ms(t)
  const h2 = heap()
  console.log(`${pack.padEnd(6)} open+maps ${open}  read every book and index it ${index}  index ${mb(await indexBytes(r))}` +
    `  heap: maps ${mb(h1 - h0)}, index and kept segments ${mb(h2 - h1)}  freezes > 50 ms: ${gaps.length}, longest ${Math.max(0, ...gaps).toFixed(0)} ms`)
}
