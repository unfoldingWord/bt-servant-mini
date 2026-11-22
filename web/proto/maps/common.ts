// Shared by the three variants: data decode, scenes, projection, clustering, labels, gestures, page chrome, bench.
// Everything here is counted as "common" and subtracted from each variant's bundle size.
export type Lang = 'es' | 'ar'
export type Pt = { id: string; lon: number; lat: number; es: string; ar: string; v: number; hollow?: boolean; main?: boolean; ref?: boolean; n?: number }
export type Scene = { id: string; pts: Pt[]; route: boolean; title: Record<Lang, string>; aria: Record<Lang, string> }
export const BBOX = { w: 8, s: 22, e: 52, n: 43 }

// ---------- data ----------
export type Path = { layer: 1 | 2 | 3; lon: Float32Array; lat: Float32Array }
export async function loadBasemap(url: string): Promise<Path[]> {
  const buf = await (await fetch(url)).arrayBuffer()
  const raw = new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
  const dv = new DataView(raw.buffer)
  const scale = dv.getInt32(0, true) / BBOX.w // west * scale
  let o = 16
  const parts: Uint8Array[] = []
  for (let i = 0; i < 4; i++) { const n = dv.getUint32(o, true); o += 4; parts.push(raw.subarray(o, o + n)); o += n }
  const vi = (a: Uint8Array) => { let p = 0; return () => { let r = 0, s = 0, b; do { b = a[p++]; r += (b & 127) * 2 ** s; s += 7 } while (b & 128); return r } }
  const L = vi(parts[0]), C = vi(parts[1]), X = vi(parts[2]), Y = vi(parts[3])
  const out: Path[] = []
  let px = 0, py = 0
  const zz = (n: number) => (n % 2 ? -(n + 1) / 2 : n / 2)
  for (let i = 0; i < parts[0].length; ) { // layer stream: one single-byte varint per path
    const ly = L(); i++
    const n = C(); const lon = new Float32Array(n), lat = new Float32Array(n)
    for (let j = 0; j < n; j++) { px += zz(X()); py += zz(Y()); lon[j] = px / scale; lat[j] = py / scale }
    out.push({ layer: ly as 1 | 2 | 3, lon, lat })
  }
  return out
}
/** one pass of corner cutting so 0.015 deg segments read as curves */
export function chaikin(p: Path): Path {
  const closed = p.layer < 3, n = p.lon.length, m = closed ? n * 2 : (n - 1) * 2 + 2
  const lon = new Float32Array(m), lat = new Float32Array(m)
  let k = 0
  if (!closed) { lon[k] = p.lon[0]; lat[k++] = p.lat[0] }
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const j = (i + 1) % n
    lon[k] = .75 * p.lon[i] + .25 * p.lon[j]; lat[k++] = .75 * p.lat[i] + .25 * p.lat[j]
    lon[k] = .25 * p.lon[i] + .75 * p.lon[j]; lat[k++] = .25 * p.lat[i] + .75 * p.lat[j]
  }
  if (!closed) { lon[k] = p.lon[n - 1]; lat[k++] = p.lat[n - 1] }
  return { layer: p.layer, lon, lat }
}

// ---------- scenes ----------
const P = (id: string, lat: number, lon: number, es: string, ar: string, v: number, x: Partial<Pt> = {}): Pt => ({ id, lat, lon, es, ar, v, ...x })
// 12 stops; Lystra repeats (return leg) and the last stop is Antioch again, so the dashed line shows the loop.
const paul: Pt[] = [
  P('antioch', 36.20, 36.16, 'Antioquía de Siria', 'أنطاكية', 60), P('seleucia', 36.12, 35.93, 'Seleucia', 'سلوقية', 12),
  P('salamis', 35.18, 33.90, 'Salamina', 'سلاميس', 15), P('paphos', 34.76, 32.41, 'Pafos', 'بافوس', 11),
  P('perga', 36.96, 30.85, 'Perge', 'برجة', 12), P('pisantioch', 38.31, 31.19, 'Antioquía de Pisidia', 'أنطاكية بيسيدية', 20),
  P('iconium', 37.87, 32.49, 'Iconio', 'إيقونية', 18), P('lystra', 37.58, 32.45, 'Listra', 'لسترة', 14),
  P('derbe', 37.35, 33.36, 'Derbe', 'دربة', 10, { hollow: true }), P('lystra2', 37.58, 32.45, 'Listra', 'لسترة', 14),
  P('attalia', 36.89, 30.70, 'Atalia', 'أتالية', 9), P('antioch2', 36.20, 36.16, 'Antioquía de Siria', 'أنطاكية', 60),
].map((p, i) => ({ ...p, n: i + 1 }))
function synth(): Pt[] {
  let s = 12345
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
  const centers = [[35.2, 31.8], [36.2, 36.2], [29.9, 31.2], [38, 33], [44.4, 33.3], [35.5, 33.9], [23.7, 37.9], [39.5, 33.5], [41.5, 40], [34, 35]]
  const out: Pt[] = []
  for (let i = 0; i < 230; i++) {
    const c = centers[i % centers.length], a = r() * 6.283, d = Math.sqrt(r()) * (1.6 + (i % 3))
    out.push(P('s' + i, c[1] + Math.sin(a) * d * .8, c[0] + Math.cos(a) * d, 'Lugar ' + (i + 1), 'مكان ' + (i + 1), 1 + Math.floor(r() * r() * 80), { hollow: r() < .15 }))
  }
  return out
}
export const SCENES: Record<string, Scene> = {
  bethel: { id: 'bethel', route: false,
    pts: [P('bethel', 31.93, 35.22, 'Betel', 'بيت إيل', 69, { main: true }), P('jer', 31.78, 35.23, 'Jerusalén', 'أورشليم', 800, { ref: true })],
    title: { es: '¿Dónde queda Betel?', ar: 'أين تقع بيت إيل؟' },
    aria: { es: 'Mapa: Betel, unos 15 km al norte de Jerusalén', ar: 'خريطة: بيت إيل، على بعد 15 كم شمال أورشليم' } },
  paul: { id: 'paul', route: true, pts: paul,
    title: { es: 'Primer viaje de Pablo (Hechos 13–14)', ar: 'رحلة بولس الأولى (أعمال 13–14)' },
    aria: { es: 'Mapa: 12 paradas del primer viaje de Pablo, de Antioquía a Antioquía', ar: 'خريطة: 12 محطة من رحلة بولس الأولى، من أنطاكية إلى أنطاكية' } },
  cluster: { id: 'cluster', route: false, pts: synth(),
    title: { es: '230 lugares agrupados', ar: '230 مكانا مجمعة' },
    aria: { es: 'Mapa: 230 lugares agrupados', ar: 'خريطة: 230 مكانا مجمعة' } },
}
export const UI = {
  es: { zin: 'Acercar', zout: 'Alejar', frame: 'Encuadre', legend: 'Ruta aproximada: líneas rectas entre paradas, no el camino.', solid: 'punto seguro', hollow: 'ubicación incierta', credit: 'Mapa: Natural Earth' },
  ar: { zin: 'تكبير', zout: 'تصغير', frame: 'إعادة الإطار', legend: 'مسار تقريبي: خطوط مستقيمة بين المحطات، وليس الطريق.', solid: 'نقطة مؤكدة', hollow: 'موقع غير مؤكد', credit: 'الخريطة: Natural Earth' },
}

// ---------- view ----------
export type View = { lon0: number; lat0: number; k: number; cos: number; w: number; h: number } // k = px per degree of latitude
export function fit(pts: { lon: number; lat: number }[], w: number, h: number, pad = 44): View {
  let a = 1e9, b = -1e9, c = 1e9, d = -1e9
  for (const p of pts) { a = Math.min(a, p.lon); b = Math.max(b, p.lon); c = Math.min(c, p.lat); d = Math.max(d, p.lat) }
  const lon0 = (a + b) / 2, lat0 = (c + d) / 2, cos = Math.cos(lat0 * Math.PI / 180)
  const spanY = Math.max(d - c, 0.72), spanX = Math.max((b - a) * cos, 0.72 * w / h)
  return { lon0, lat0, cos, w, h, k: Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY) }
}
export const px = (v: View, lon: number, lat: number): [number, number] => [(lon - v.lon0) * v.cos * v.k + v.w / 2, (v.lat0 - lat) * v.k + v.h / 2]
export const unpx = (v: View, x: number, y: number): [number, number] => [v.lon0 + (x - v.w / 2) / (v.cos * v.k), v.lat0 - (y - v.h / 2) / v.k]

// ---------- layout: clusters + labels (same logic for every variant) ----------
export type Dot = { x: number; y: number; num?: number; hollow?: boolean; main?: boolean; ref?: boolean; cluster?: number }
export type Label = { x: number; y: number; text: string; side: 1 | -1; main?: boolean }
let _ctx: CanvasRenderingContext2D | null = null
export function textW(t: string, bold = false) {
  _ctx ||= document.createElement('canvas').getContext('2d')!
  _ctx.font = (bold ? '600 ' : '') + '12px system-ui, sans-serif'
  return _ctx.measureText(t).width
}
export type Cand = { x: number; y: number; text: string; v: number; main?: boolean; r: number }
export function placeLabels(cand: Cand[], side: 1 | -1, W: number, H: number): Label[] {
  cand.sort((a, b) => b.v - a.v)
  const placed: [number, number, number, number][] = [], labels: Label[] = []
  for (const c of cand) {
    const wt = textW(c.text, c.main), x0 = side === 1 ? c.x + c.r + 3 : c.x - c.r - 3 - wt
    const box: [number, number, number, number] = [x0, c.y - 8, x0 + wt, c.y + 8]
    if (box[0] < 2 || box[2] > W - 2 || box[1] < 2 || box[3] > H - 2) continue
    if (placed.some(b => !(b[2] < box[0] || b[0] > box[2] || b[3] < box[1] || b[1] > box[3]))) continue
    placed.push(box); labels.push({ x: side === 1 ? x0 : x0 + wt, y: c.y, text: c.text, side, main: c.main })
  }
  return labels
}
export function layout(scene: Scene, v: View, lang: Lang, margin = 0): { dots: Dot[]; labels: Label[]; line: [number, number][] } {
  const side: 1 | -1 = lang === 'ar' ? -1 : 1
  const vis = (x: number, y: number) => x > -margin - 20 && y > -margin - 20 && x < v.w + margin + 20 && y < v.h + margin + 20
  const dots: Dot[] = [], cand: Cand[] = []
  const line: [number, number][] = []
  if (scene.pts.length > 200) {
    const cell = 44, g = new Map<string, { x: number; y: number; n: number; p: Pt }>()
    for (const p of scene.pts) {
      const [x, y] = px(v, p.lon, p.lat)
      if (!vis(x, y)) continue
      const key = Math.floor(x / cell) + ',' + Math.floor(y / cell), c = g.get(key)
      if (c) { c.x += x; c.y += y; c.n++; if (p.v > c.p.v) c.p = p } else g.set(key, { x, y, n: 1, p })
    }
    for (const c of g.values()) {
      if (c.n > 1) dots.push({ x: c.x / c.n, y: c.y / c.n, cluster: c.n })
      else { dots.push({ x: c.x, y: c.y, hollow: c.p.hollow }); cand.push({ x: c.x, y: c.y, text: c.p[lang], v: c.p.v, r: 5 }) }
    }
  } else {
    for (const p of scene.pts) {
      const [x, y] = px(v, p.lon, p.lat)
      if (scene.route) line.push([x, y])
      if (!vis(x, y)) continue
      dots.push({ x, y, num: p.n, hollow: p.hollow, main: p.main, ref: p.ref })
      cand.push({ x, y, text: p[lang], v: p.main ? 1e9 : p.v, main: p.main, r: p.n ? 11 : p.main ? 7 : 5 })
    }
  }
  const labels = placeLabels(cand, side, v.w, v.h)
  return { dots, labels, line }
}

// ---------- gestures ----------
export function gestures(el: HTMLElement, a: { pan(dx: number, dy: number): void; zoom(f: number, x: number, y: number): void; end(): void; frame(): void }) {
  const ptr = new Map<number, [number, number]>()
  const rel = (e: PointerEvent | WheelEvent): [number, number] => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  el.style.touchAction = 'none'
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); ptr.set(e.pointerId, rel(e)) })
  el.addEventListener('pointermove', e => {
    if (!ptr.has(e.pointerId)) return
    const p = ptr.get(e.pointerId)!, n = rel(e)
    if (ptr.size === 1) a.pan(n[0] - p[0], n[1] - p[1])
    else if (ptr.size === 2) {
      const o = [...ptr.entries()].find(([id]) => id !== e.pointerId)![1], d1 = Math.hypot(n[0] - o[0], n[1] - o[1]), dp = Math.hypot(p[0] - o[0], p[1] - o[1])
      a.pan((n[0] - p[0]) / 2, (n[1] - p[1]) / 2)
      if (dp > 0) a.zoom(d1 / dp, (n[0] + o[0]) / 2, (n[1] + o[1]) / 2)
    }
    ptr.set(e.pointerId, n)
  })
  const up = (e: PointerEvent) => { ptr.delete(e.pointerId); if (!ptr.size) a.end() }
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up)
  el.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = rel(e); a.zoom(Math.exp(-e.deltaY * .0015), x, y); clearTimeout((el as any)._t); (el as any)._t = setTimeout(a.end, 150) }, { passive: false })
  el.addEventListener('dblclick', a.frame)
}

// ---------- html label layer (the browser shapes Arabic natively) ----------
export class LabelLayer {
  root = document.createElement('div')
  constructor(parent: HTMLElement) { this.root.className = 'lbls'; parent.appendChild(this.root) }
  set(dots: Dot[], labels: Label[]) {
    let h = ''
    for (const l of labels) h += `<span class="lb${l.main ? ' m' : ''}" style="transform:translate(${l.x.toFixed(1)}px,${(l.y - 8).toFixed(1)}px)${l.side === -1 ? ' translateX(-100%)' : ''}">${l.text}</span>`
    for (const d of dots) {
      if (d.cluster) h += `<span class="cn" style="transform:translate(${d.x.toFixed(1)}px,${(d.y - 8).toFixed(1)}px) translateX(-50%)">${d.cluster}</span>`
      else if (d.num) h += `<span class="cn st${d.hollow ? ' h' : ''}" style="transform:translate(${d.x.toFixed(1)}px,${(d.y - 8).toFixed(1)}px) translateX(-50%)">${d.num}</span>`
    }
    this.root.innerHTML = h
  }
  offset(dx: number, dy: number) { this.root.style.transform = `translate(${dx}px,${dy}px)` }
}

// ---------- api each variant implements ----------
export interface Api {
  panBy(dx: number, dy: number): void
  zoomAt(f: number, x: number, y: number): void
  frame(): void
  commit(): void
  settle(): Promise<void>
}
export type Ctx = { paths: Path[]; reliefUrl: string; scene: Scene; lang: Lang; box: HTMLElement; w: number; h: number; relief: boolean }
export const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()

// ---------- page + bench ----------
const raf = () => new Promise<number>(r => requestAnimationFrame(r))
export async function mount(variant: string, create: (c: Ctx) => Promise<Api>) {
  const t_entry = performance.now()
  const q = new URLSearchParams(location.search)
  const lang = (q.get('lang') || 'es') as Lang, sc = SCENES[q.get('scene') || 'bethel'], bench = q.has('bench')
  const data = q.get('data') === 'fine' ? 'basemap-fine' : 'basemap', relief = q.get('relief') !== '0'
  const rel = q.get('relief') === '2' ? 'relief-2' : 'relief-1'
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = lang
  if (q.has('dark')) document.documentElement.dataset.theme = 'dark'
  const ui = UI[lang]
  document.body.innerHTML = `<main><h1>${sc.title[lang]}</h1><div id="map" class="map"></div>
    <div class="btns"><button id="zi" aria-label="${ui.zin}">+</button><button id="zo" aria-label="${ui.zout}">&minus;</button><button id="fr" aria-label="${ui.frame}">&#9635;</button></div>
    ${sc.route ? `<p class="lg">${ui.legend}</p>` : ''}<p class="lg">&#9679; ${ui.solid} &nbsp; &#9675; ${ui.hollow} &nbsp; ${ui.credit}</p>
    <ol class="list">${sc.pts.slice(0, 12).map(p => `<li>${p[lang]}</li>`).join('')}</ol></main>`
  const box = document.getElementById('map')!
  const w = box.clientWidth, h = box.clientHeight
  const t0 = performance.now()
  const paths = (await loadBasemap(`data/${data}.bin`)).map(chaikin)
  const t_data = performance.now() - t0
  const t1 = performance.now()
  const api = await create({ paths, reliefUrl: `data/${rel}.png`, scene: sc, lang, box, w, h, relief })
  await api.settle(); await raf(); await raf()
  const t_draw = performance.now() - t1
  gestures(box, { pan: api.panBy, zoom: api.zoomAt, end: api.commit, frame: api.frame })
  const c = (id: string, f: () => void) => document.getElementById(id)!.addEventListener('click', f)
  c('zi', () => { api.zoomAt(1.6, w / 2, h / 2); api.commit() }); c('zo', () => { api.zoomAt(1 / 1.6, w / 2, h / 2); api.commit() }); c('fr', api.frame)
  document.title = `${variant} ${sc.id}`
  const res: any = { variant, scene: sc.id, lang, data, relief, w, h, ua: navigator.userAgent.slice(-60), dpr: devicePixelRatio, t_boot: +t_entry.toFixed(0), t_data: +t_data.toFixed(0), t_draw: +t_draw.toFixed(0) }
  ;(window as any).__api = api
  if (bench) {
    await new Promise(r => setTimeout(r, 400))
    // pan 3 s via rAF, +-90 px sine; per-frame JS cost measured around panBy
    const dts: number[] = [], js: number[] = []
    let last = await raf(), prev = 0
    const start = last
    while (last - start < 3000) {
      const t = await raf(); dts.push(t - last); last = t
      const off = 90 * Math.sin((t - start) / 450), a = performance.now()
      api.panBy(off - prev, 0); prev = off; js.push(performance.now() - a)
    }
    api.panBy(-prev, 0); api.commit(); await api.settle()
    dts.sort((a, b) => a - b)
    res.pan = { frames: dts.length, fps: +(dts.length / 3).toFixed(1), p50: +dts[dts.length >> 1].toFixed(1), p95: +dts[Math.floor(dts.length * .95)].toFixed(1), max: +dts[dts.length - 1].toFixed(1), jsAvg: +(js.reduce((a, b) => a + b, 0) / js.length).toFixed(2) }
    // zoom x2 then back, time until settled + 2 frames; 4 reps
    const zs: number[] = []
    for (let i = 0; i < 4; i++) {
      const a = performance.now(); api.zoomAt(i % 2 ? .5 : 2, w / 2, h / 2); api.commit(); await api.settle(); await raf(); await raf()
      zs.push(performance.now() - a); await new Promise(r => setTimeout(r, 200))
    }
    res.zoomMs = zs.map(z => +z.toFixed(0)); res.zoomAvg = +(zs.reduce((a, b) => a + b, 0) / zs.length).toFixed(0)
    const pm = (performance as any).memory
    if (pm) res.heapMB = +(pm.usedJSHeapSize / 1048576).toFixed(1)
    res.requests = performance.getEntriesByType('resource').map(r => r.name.replace(location.origin, '')).filter(n => !n.startsWith('/result'))
    res.external = res.requests.filter((n: string) => /^https?:/.test(n))
    res.nodes = document.getElementsByTagName('*').length
    res.marks = (window as any).__marks
    fetch('result', { method: 'POST', body: JSON.stringify(res) }).catch(() => {})
  }
  ;(window as any).__res = res
}
