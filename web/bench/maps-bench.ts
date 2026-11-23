// The map speed bench, shipped ONLY in the dev APK (web/build.py --devapk). It mounts the real `mountMap` at 375 px in three scenes, N times
// each after a warm-up, cold (basemap cache reset) and warm, and reads the page's own `performance` marks (`map:first-draw`, `map:redraw`).
// Results: a table on the page and `window.__mapBench` (a promise of the JSON), read over Chrome DevTools Protocol on the phone.
import { decodeBasemap } from '@bt-synergy/language-pack-v3'
import { drawMap, fit } from '@bt-synergy/language-pack-client'
import { MAP_LIGHT, mountMap, resetMapCache, setBasemapSource } from '../src/mapview'
import { basemapBytes, scenes, stats, type Scene, type Stats } from './scenes'

const N = Math.max(1, Number(new URLSearchParams(location.search).get('n')) || 10)
const W = 375
// set up inside the guarded run (see run()), so that a throw there still leaves window.__mapBench resolved with {error}
let bytes: Uint8Array
let stage: HTMLElement
/** Time from `t` to the second animation frame after it (the paint of what was just drawn); null on a page that has no frames (hidden). */
const raf = (t = performance.now()) => new Promise<number | null>((res) => {
  let done = false
  const fin = (v: number | null) => { if (!done) { done = true; res(v) } }
  requestAnimationFrame(() => requestAnimationFrame(() => fin(performance.now() - t))) // two frames: the paint of what was just drawn
  setTimeout(() => fin(null), 1000) // a hidden page has no frames
})
type Mark = { start: number; duration: number; detail: { basemap?: boolean } | null }
const marks = (name: string): Mark[] => performance.getEntriesByName(name, 'measure').map((e: any) => ({ start: e.startTime, duration: e.duration, detail: e.detail ?? null }))

// first_draw: drawn WITHOUT the basemap (it arrives later); basemap_redraw: the redraw when it arrives; ready_total: mount start to the end of that
// redraw (the map with its basemap, what the person sees); mount_to_first_draw: mount start to the end of the first-draw mark; *_paint: to the 2nd frame after
const METRICS = ['mount_to_first_draw', 'first_draw', 'basemap_redraw', 'ready_total', 'mount_to_paint', 'zoom_redraw', 'zoom_paint', 'plain_redraw', 'plain_paint'] as const
type Run = Record<(typeof METRICS)[number], number | null>
async function once(scene: Scene, cold: boolean): Promise<Run> {
  performance.clearMeasures()
  if (cold) resetMapCache()
  const host = document.createElement('div')
  stage.appendChild(host)
  const opts = { pack: 'bench', points: scene.points, summary: scene.title, ui: 'en', dir: 'ltr' as const, width: W }
  const t0 = performance.now()
  const api = await mountMap(host, opts)
  const first = marks('map:first-draw')[0]
  // not `await mountMap` timed: the basemap decode (a microtask started inside mountMap) can run before the await continues
  const mount_to_first_draw = first ? first.start + first.duration - t0 : null
  await api.ready
  const ready_total = performance.now() - t0
  const arrival = marks('map:redraw').find((m) => m.detail?.basemap)
  const paint = await raf(t0)
  performance.clearMeasures()
  const tz = performance.now()
  ;(host.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement).click() // a zoom change: the real path (zoomAt, then commit -> redraw)
  const zoom = marks('map:redraw')[0]
  const zoom_paint = await raf(tz)
  performance.clearMeasures()
  const tp = performance.now()
  api.redraw()
  const plain = marks('map:redraw')[0]
  const plain_paint = await raf(tp)
  api.destroy()
  host.remove()
  return { mount_to_first_draw, first_draw: first?.duration ?? null, basemap_redraw: arrival?.duration ?? null, ready_total, mount_to_paint: paint, zoom_redraw: zoom?.duration ?? null, zoom_paint, plain_redraw: plain?.duration ?? null, plain_paint }
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
  const rows = (mode: 'decode_cold' | 'warm') => res.scenes.map((s: any) => METRICS.map((k) => `<tr><td>${s.id} ${mode} ${k}</td><td>${f(s[mode][k])}</td></tr>`).join('')).join('')
  const t = (title: string, body: string) => `<h2>${title}</h2><table><tr><th>metric (ms)</th><th>min</th><th>median</th><th>p90</th><th>max</th></tr>${body}</table>`
  const bm = res.basemap
  const tg = res.targets
  document.getElementById('out')!.innerHTML =
    `<p>${res.userAgent}<br>N=${res.n} after 1 warm-up, width ${W}px, dpr ${res.devicePixelRatio}, cores ${res.hardwareConcurrency}</p>` +
    `<p>with basemap (a, ${tg.firstDrawJudgedOn}) ${tg.firstDrawMedianMs} ms vs ${tg.firstDrawTargetMs}: <b class="${tg.firstDrawOk ? 'ok' : 'bad'}">${tg.firstDrawOk ? 'ok' : 'over'}</b><br>` +
    `redraw (${tg.redrawJudgedOn}) ${tg.redrawMedianMs} ms vs ${tg.redrawTargetMs}: <b class="${tg.redrawOk ? 'ok' : 'bad'}">${tg.redrawOk ? 'ok' : 'over'}</b></p>` +
    `<p>${res.notes.join('<br>')}</p>` + (res.shortMetrics.length ? `<p class="bad">fewer than N samples: ${res.shortMetrics.join('; ')}</p>` : '') +
    t('basemap (' + bm.bytes + ' bytes)', ['decode', 'draw_smooth0_251pts', 'draw_smooth1_251pts'].map((k) => `<tr><td>${k}</td><td>${f(bm[k])}</td></tr>`).join('')) +
    t('decode_cold (cache reset before each run; bytes from memory, no storage read)', rows('decode_cold')) + t('warm (basemap cached)', rows('warm')) +
    `<pre id="json"></pre>`
  document.getElementById('json')!.textContent = JSON.stringify(res)
}

const worst = (...v: (number | null | undefined)[]) => (v.some((x) => x == null) ? null : Math.max(...(v as number[])))
async function main() {
  const res: any = {
    userAgent: navigator.userAgent, devicePixelRatio, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: (navigator as any).deviceMemory ?? null,
    n: N, width: W, startedAt: new Date().toISOString(),
    notes: ['decode_cold = the basemap cache was reset before each run, but the bytes come from memory (base64 in the bundle): the time to read them from storage or the network is NOT included',
      'first_draw is drawn without the basemap; the person sees ready_total (with it)', '*_paint = to the 2nd animation frame; null on a hidden page (no frames)'],
    basemap: basemapPart(), scenes: [],
  }
  for (const s of scenes()) res.scenes.push({ id: s.id, title: s.title, points: s.points.length, decode_cold: await series(s, true), warm: await series(s, false) })
  const med = (sc: any, mode: string, k: string): number | null => sc[mode][k]?.median ?? null
  const a = res.scenes[0], c = res.scenes[2]
  const first = worst(med(a, 'decode_cold', 'ready_total'), med(a, 'warm', 'ready_total'))
  const withPaint = [med(c, 'warm', 'zoom_paint'), med(c, 'warm', 'plain_paint')]
  const usePaint = withPaint.every((x) => x != null)
  const redraw = usePaint ? worst(...withPaint) : worst(med(c, 'warm', 'zoom_redraw'), med(c, 'warm', 'plain_redraw'))
  res.targets = {
    firstDrawTargetMs: 50, firstDrawJudgedOn: 'scene a, ready_total (map with basemap), the larger of the decode_cold and warm medians', firstDrawMedianMs: first, firstDrawOk: first != null && first < 50,
    redrawTargetMs: 300, redrawJudgedOn: usePaint ? 'scene c, warm, the larger of zoom_paint and plain_paint medians' : 'scene c, warm, the larger of zoom_redraw and plain_redraw medians: judged WITHOUT paint (no frames on this page)',
    redrawJudgedWithPaint: usePaint, redrawMedianMs: redraw, redrawOk: redraw != null && redraw < 300,
  }
  // a metric with fewer than N samples (a mark missing, a hidden page's paint)
  res.shortMetrics = res.scenes.flatMap((sc: any) => (['decode_cold', 'warm'] as const).flatMap((m) => METRICS.filter((k) => (sc[m][k]?.n ?? 0) < N).map((k) => `${sc.id} ${m} ${k}: ${sc[m][k]?.n ?? 0}/${N}`)))
  res.finishedAt = new Date().toISOString()
  return res
}
async function run() {
  await new Promise((r) => setTimeout(r, 300)) // the page settles first
  try {
    bytes = basemapBytes()
    setBasemapSource(async () => bytes) // the real basemap, never fetched
    stage = document.getElementById('stage')!
    const res = await main()
    try { show(res) } catch (e) { res.renderError = String((e as any)?.stack ?? e) } // the results stay valid when the table cannot be drawn
    const st = document.getElementById('status')
    if (st) st.textContent = 'done'
    return res
  } catch (e) {
    const msg = String((e as any)?.stack ?? e)
    const st = document.getElementById('status')
    if (st) st.textContent = 'error: ' + msg
    return { error: msg, userAgent: navigator.userAgent }
  } finally {
    document.body.setAttribute('data-done', '1')
  }
}
;// ?hold=1: a manual gesture view, no speed run and no window.__mapBench. The real mountMap stays on screen (200-point scene) between filler
// text, so a person can check on a phone that one finger scrolls the page and two fingers move and zoom the map.
async function hold() {
  bytes = basemapBytes()
  setBasemapSource(async () => bytes)
  const stage = document.getElementById('stage')!
  document.getElementById('status')!.textContent = ''
  const scene = scenes().find((x) => x.id === 'c-cluster') // the heavy scene the bench judges redraw on; no fallback
  if (!scene) throw new Error('scene c-cluster not found in bench/scenes.ts')
  const width = Math.min(W, Math.max(200, document.documentElement.clientWidth - 16))
  const host = document.createElement('div')
  stage.style.width = width + 'px'
  stage.appendChild(host)
  await mountMap(host, { pack: 'bench', points: scene.points, summary: scene.title, ui: 'es', dir: 'ltr' as const, width })
  const out = document.getElementById('readout')!
  document.getElementById('npoints')!.textContent = String(scene.points.length)
  const layer = host.querySelector('div[style*="will-change"]') as HTMLElement | null // mapview's picture layer: translate(..) scale(..)
  const rest = layer?.style.transform ?? '' // the transform at mount = rest; it returns to it when the fingers lift
  let moved = 0, maxScale = 1, last = '-'
  const scaleOf = (t: string) => Number(/scale\(([-\d.e]+)/.exec(t)?.[1]) || 1
  if (layer) new MutationObserver(() => { // every change, so a short pinch is not missed between polls
    const t = layer.style.transform
    if (t !== rest) { moved++; last = t; maxScale = Math.max(maxScale, scaleOf(t)) }
  }).observe(layer, { attributes: true, attributeFilter: ['style'] })
  const tick = () => {
    out.textContent = `scrollY ${Math.round(window.scrollY)} | puntos ${scene.points.length} | mapa ahora ${layer?.style.transform || '(sin capa)'} | cambios ${moved} | escala max ${maxScale.toFixed(2)} | ultimo ${last}`
  }
  tick()
  setInterval(tick, 150)
}
if (new URLSearchParams(location.search).get('hold') === '1') void hold().catch((e) => { document.getElementById('status')!.textContent = 'error: ' + String((e as any)?.stack ?? e) })
else (window as any).__mapBench = run()
