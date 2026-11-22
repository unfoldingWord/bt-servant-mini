// The map speed bench, shipped ONLY in the dev APK (web/build.py --devapk). It mounts the real `mountMap` at 375 px in three scenes, N times
// each after a warm-up, cold (basemap cache reset) and warm, and reads the page's own `performance` marks (`map:first-draw`, `map:redraw`).
// Results: a table on the page and `window.__mapBench` (a promise of the JSON), read over Chrome DevTools Protocol on the phone.
import { decodeBasemap } from '@bt-synergy/language-pack-v3'
import { drawMap, fit } from '@bt-synergy/language-pack-client'
import { MAP_LIGHT, mountMap, resetMapCache, setBasemapSource } from '../src/mapview'
import { basemapBytes, scenes, stats, type Scene, type Stats } from './scenes'

const N = Math.max(1, Number(new URLSearchParams(location.search).get('n')) || 10)
const W = 375
const bytes = basemapBytes()
setBasemapSource(async () => bytes) // the real basemap, never fetched
const stage = document.getElementById('stage')!
const raf = () => new Promise<number | null>((res) => {
  const t = performance.now(); let done = false
  const fin = (v: number | null) => { if (!done) { done = true; res(v) } }
  requestAnimationFrame(() => requestAnimationFrame(() => fin(performance.now() - t))) // two frames: the paint of what was just drawn
  setTimeout(() => fin(null), 1000) // a hidden page has no frames
})
type Mark = { start: number; duration: number; detail: { basemap?: boolean } | null }
const marks = (name: string): Mark[] => performance.getEntriesByName(name, 'measure').map((e: any) => ({ start: e.startTime, duration: e.duration, detail: e.detail ?? null }))

const METRICS = ['mount_total', 'first_draw', 'basemap_arrives', 'ready_total', 'paint_after_mount', 'zoom_redraw', 'plain_redraw'] as const
type Run = Record<(typeof METRICS)[number], number | null>
async function once(scene: Scene, cold: boolean): Promise<Run> {
  performance.clearMeasures()
  if (cold) resetMapCache()
  const host = document.createElement('div')
  stage.appendChild(host)
  const opts = { pack: 'bench', points: scene.points, summary: scene.title, ui: 'en', dir: 'ltr' as const, width: W }
  const t0 = performance.now()
  const api = await mountMap(host, opts)
  const mount_total = performance.now() - t0
  const first = marks('map:first-draw')[0]
  await api.ready
  const ready_total = performance.now() - t0
  const arrival = marks('map:redraw').find((m) => m.detail?.basemap)
  const paint = await raf()
  performance.clearMeasures()
  ;(host.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement).click() // a zoom change: the real path (zoomAt, then commit -> redraw)
  const zoom = marks('map:redraw')[0]
  performance.clearMeasures()
  api.redraw()
  const plain = marks('map:redraw')[0]
  api.destroy()
  host.remove()
  return { mount_total, first_draw: first?.duration ?? null, basemap_arrives: arrival?.duration ?? null, ready_total, paint_after_mount: paint, zoom_redraw: zoom?.duration ?? null, plain_redraw: plain?.duration ?? null }
}
async function series(scene: Scene, cold: boolean) {
  await once(scene, cold) // warm-up, dropped
  const runs: Run[] = []
  for (let i = 0; i < N; i++) { runs.push(await once(scene, cold)); await new Promise((r) => setTimeout(r, 0)) }
  return Object.fromEntries(METRICS.map((k) => [k, stats(runs.map((r) => r[k] as number))])) as Record<(typeof METRICS)[number], Stats | null>
}
const time = (f: () => unknown) => { const t = performance.now(); f(); return performance.now() - t }
function basemapPart() {
  const run = (f: () => number) => { f(); return stats(Array.from({ length: N }, f)) }
  const bm = decodeBasemap(bytes)
  const all = scenes()[2]!.points
  const frame = { ...fit(all, W, 281, 40), width: W + 300, height: 281 + 300 }
  const d = (smooth: number) => run(() => time(() => drawMap({ points: all, basemap: bm, frame, theme: MAP_LIGHT, summary: 's', smooth })))
  return { bytes: bytes.length, decode: run(() => time(() => decodeBasemap(bytes))), draw_smooth0_251pts: d(0), draw_smooth1_251pts: d(1) }
}

const f = (s: Stats | null) => (s ? `${s.min}</td><td>${s.median}</td><td>${s.p90}</td><td>${s.max}` : '-</td><td>-</td><td>-</td><td>-')
function show(res: any) {
  const rows = (mode: 'cold' | 'warm') => res.scenes.map((s: any) => METRICS.map((k) => `<tr><td>${s.id} ${mode} ${k}</td><td>${f(s[mode][k])}</td></tr>`).join('')).join('')
  const t = (title: string, body: string) => `<h2>${title}</h2><table><tr><th>metric (ms)</th><th>min</th><th>median</th><th>p90</th><th>max</th></tr>${body}</table>`
  const bm = res.basemap
  const tg = res.targets
  document.getElementById('out')!.innerHTML =
    `<p>${res.userAgent}<br>N=${res.n} after 1 warm-up, width ${W}px, dpr ${res.devicePixelRatio}, cores ${res.hardwareConcurrency}</p>` +
    `<p>first draw (a, warm) median ${tg.firstDrawMedianMs} ms vs ${tg.firstDrawTargetMs}: <b class="${tg.firstDrawOk ? 'ok' : 'bad'}">${tg.firstDrawOk ? 'ok' : 'over'}</b>; ` +
    `zoom redraw (c, warm) median ${tg.redrawMedianMs} ms vs ${tg.redrawTargetMs}: <b class="${tg.redrawOk ? 'ok' : 'bad'}">${tg.redrawOk ? 'ok' : 'over'}</b></p>` +
    t('basemap (' + bm.bytes + ' bytes)', ['decode', 'draw_smooth0_251pts', 'draw_smooth1_251pts'].map((k) => `<tr><td>${k}</td><td>${f(bm[k])}</td></tr>`).join('')) +
    t('cold (cache reset before each run)', rows('cold')) + t('warm (basemap cached)', rows('warm')) +
    `<pre id="json"></pre>`
  document.getElementById('json')!.textContent = JSON.stringify(res)
}

async function main() {
  const res: any = { userAgent: navigator.userAgent, devicePixelRatio, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: (navigator as any).deviceMemory ?? null, n: N, width: W, startedAt: new Date().toISOString(), basemap: basemapPart(), scenes: [] }
  for (const s of scenes()) res.scenes.push({ id: s.id, title: s.title, points: s.points.length, cold: await series(s, true), warm: await series(s, false) })
  const a = res.scenes[0].warm.first_draw?.median, c = res.scenes[2].warm.zoom_redraw?.median
  res.targets = { firstDrawTargetMs: 50, firstDrawMedianMs: a, firstDrawOk: a != null && a < 50, redrawTargetMs: 300, redrawMedianMs: c, redrawOk: c != null && c < 300 }
  res.finishedAt = new Date().toISOString()
  show(res)
  document.getElementById('status')!.textContent = 'done'
  document.body.setAttribute('data-done', '1')
  return res
}
;(window as any).__mapBench = new Promise((r) => setTimeout(r, 300)).then(main) // the page settles first
