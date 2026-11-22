// The headless part of the map bench: the basemap decode and the pure drawing (`mapSvg`, no DOM, no canvas: text width is estimated) for the
// three scenes, N times after one warm-up. It leaves out what needs the page (the mount, the layout, the paint): that is maps-bench.ts.
//   cd web && bun bench/maps-node.ts [N]
import { decodeBasemap } from '@bt-synergy/language-pack-v3'
import { fit } from '@bt-synergy/language-pack-client'
import { MAP_LIGHT, mapSvg } from '../src/mapview'
import { basemapBytes, scenes, stats } from './scenes'

const N = Number(process.argv[2]) || 10
const time = <T>(f: () => T): number => { const t = performance.now(); f(); return performance.now() - t }
const bytes = basemapBytes()
const runs = (f: () => number) => { f(); return stats(Array.from({ length: N }, f)) }
const out: Record<string, unknown> = { runtime: `bun ${(globalThis as any).Bun.version}`, n: N, basemapBytes: bytes.length, decode: runs(() => time(() => decodeBasemap(bytes))) }
const basemap = decodeBasemap(bytes)
for (const s of scenes()) {
  const f = { ...fit(s.points, 375, 281, 40), width: 375 + 300, height: 281 + 300 } // the picture is drawn larger than the screen, as mountMap does
  const draw = (withBase: boolean) => runs(() => time(() => mapSvg({ pack: 'x', points: s.points, summary: s.title, ui: 'en', dir: 'ltr', basemap: withBase ? basemap : undefined as never, theme: MAP_LIGHT, frame: f })))
  out[s.id] = { points: s.points.length, drawWithBasemap: draw(true), drawWithoutBasemap: draw(false) }
}
console.log(JSON.stringify(out, null, 1))
