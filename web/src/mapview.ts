// The map on the screen (diseno-mapas.md 5.6; mapas-render-decision.md "Para E2"). The SVG is built on the phone by the client's `drawMap`
// (pure, no DOM); this file adds what needs the page: the basemap (looked for by packs.ts, read once per pack), the theme as literal colors
// read from the style sheet when drawing, text width from a canvas, pan and zoom, the three buttons, and the timing marks
// `map:first-draw` and `map:redraw` (performance.measure) that are read on a phone over CDP.
import { decodeBasemap, type Basemap } from '@bt-synergy/language-pack-v3'
import {
  clampScale, drawMap, fit, MAX_SCALE, minScale, project, unproject,
  type Frame, type MapPoint, type Theme,
} from '@bt-synergy/language-pack-client'
import { basemapBytes, onPacksChanged } from './packs'

export type { MapPoint }
export type MapOpts = { pack: string; points: MapPoint[]; summary: string; ui: string; dir: 'ltr' | 'rtl'; width?: number; height?: number; gestures?: 'chat' | 'full'; onPick?: (id: string) => void } // 'chat': one finger scrolls the page; 'full': one finger moves the map; onPick: a tap on a point (a tap on a cluster zooms in on it first)

/** The map's height rule: three quarters of its width, between 200 and 360 px; a given `height` wins (never below 120). placeview.ts reserves the same box. */
export const MAP_RATIO = 0.75, MAP_MIN_H = 200, MAP_MAX_H = 360
export const mapHeight = (w: number, height?: number): number => Math.max(120, Math.round(height ?? Math.min(MAP_MAX_H, Math.max(MAP_MIN_H, w * MAP_RATIO))))

// ------------------------------------------------------------------------------------------------------------------ theme

/**
 * Colors the SVG carries as literals (a shared or copied image keeps them; `var()` would not resolve there). Contrast of the point, the
 * route and the cluster circle against both the land and the sea is at least 3:1 in both themes (the numbers are in the tests).
 */
export const MAP_LIGHT: Theme = {
  sea: '#cfe0ee', land: '#f1ead9', coast: '#7d725c', lake: '#cfe0ee', river: '#3f7fb0', route: '#b3402b',
  point: '#1f1f1f', pointHollow: '#1f1f1f', label: '#1f1f1f', halo: '#ffffff', cluster: '#34495e', clusterText: '#ffffff',
}
export const MAP_DARK: Theme = {
  sea: '#1c2733', land: '#3b3a33', coast: '#a39a82', lake: '#1c2733', river: '#6fa8d8', route: '#ff8a65',
  point: '#f5f0e0', pointHollow: '#f5f0e0', label: '#f2efe6', halo: '#1b1b19', cluster: '#e8d9b0', clusterText: '#1b1b19',
}
const LITERAL = /^(#[0-9a-f]{3,8}|rgba?\([0-9., %]+\)|hsla?\([0-9., %deg]+\))$/i
const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
function luminance(css: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(css.trim()) ?? null
  if (!m) return null
  const c = [0, 2, 4].map((i) => parseInt(m[1]!.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}
/**
 * The theme now: dark or light from the page's own background (`--bg`, as the style sheet sets it), else from the system setting; a
 * variable `--map-<key>` (`--map-sea`, `--map-point-hollow`...) in the style sheet overrides one color, if it is a literal color.
 */
export function readTheme(): Theme {
  let dark = false
  let cs: CSSStyleDeclaration | null = null
  try {
    cs = getComputedStyle(document.documentElement)
    const l = luminance(cs.getPropertyValue('--bg'))
    dark = l !== null ? l < 0.5 : !!globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches
  } catch { /* the light theme */ }
  const theme = { ...(dark ? MAP_DARK : MAP_LIGHT) }
  if (cs) {
    for (const k of Object.keys(theme) as (keyof Theme)[]) {
      const v = cs.getPropertyValue(`--map-${kebab(k)}`).trim()
      if (LITERAL.test(v)) theme[k] = v
    }
  }
  return theme
}

// ------------------------------------------------------------------------------------------------------------------ words

type L = 'en' | 'es' | 'fr' | 'id' | 'hi' | 'ar'
export const MAP_T: Record<L, { group: string; zin: string; zout: string; frame: string; hint: string }> = {
  en: { group: 'Map controls', zin: 'Zoom in', zout: 'Zoom out', frame: 'Show all the places', hint: 'Use two fingers to move the map' },
  es: { group: 'Controles del mapa', zin: 'Acercar', zout: 'Alejar', frame: 'Ver todos los lugares', hint: 'Usa dos dedos para mover el mapa' },
  fr: { group: 'Commandes de la carte', zin: 'Zoom avant', zout: 'Zoom arrière', frame: 'Voir tous les lieux', hint: 'Utilisez deux doigts pour déplacer la carte' },
  id: { group: 'Kontrol peta', zin: 'Perbesar', zout: 'Perkecil', frame: 'Tampilkan semua tempat', hint: 'Gunakan dua jari untuk menggeser peta' },
  // hi, ar: pending native review
  hi: { group: 'नक्शे के बटन', zin: 'ज़ूम इन', zout: 'ज़ूम आउट', frame: 'सभी स्थान दिखाएँ', hint: 'नक्शा हिलाने के लिए दो उंगलियों का उपयोग करें' },
  ar: { group: 'أزرار الخريطة', zin: 'تكبير', zout: 'تصغير', frame: 'إعادة الإطار', hint: 'استخدم إصبعين لتحريك الخريطة' },
}
const wordsFor = (ui: string) => MAP_T[ui.split('-')[0]!.toLowerCase() as L] ?? MAP_T.en

// ------------------------------------------------------------------------------------------------------------- the drawing

/** The SVG text of a map: `drawMap` with the page's choices already made. Pure (no DOM): without `frame` the picture fits the points. */
export function mapSvg(o: MapOpts & { basemap?: Basemap; theme: Theme; measure?: (t: string) => number; frame?: Frame }): string {
  const width = o.frame?.width ?? o.width ?? 320
  const height = o.frame?.height ?? o.height ?? 240
  return drawMap({
    points: o.points, ...(o.basemap ? { basemap: o.basemap } : {}), width, height, ...(o.frame ? { frame: o.frame } : {}),
    theme: o.theme, dir: o.dir, summary: o.summary, ...(o.measure ? { measure: o.measure } : {}), fontSize: 12,
  })
}

// ------------------------------------------------------------------------------------------------------------------ basemap

let basemapSource: (pack: string) => Promise<Uint8Array | null> = basemapBytes
/** Tests: read the basemap bytes from here instead of packs.ts (no argument puts it back). */
export function setBasemapSource(f?: (pack: string) => Promise<Uint8Array | null>) {
  basemapSource = f ?? basemapBytes
  resetMapCache()
}
// The basemap read and inflated once per pack; dropped when the pack changes (or a language is added or removed).
let cache: { pack: string; p: Promise<Basemap | undefined> } | null = null
/** Forgets the basemap read (the next map reads it again). Called when the packs change. */
export function resetMapCache(): void {
  cache = null
}
onPacksChanged(resetMapCache)
function basemapOfPack(pack: string): Promise<Basemap | undefined> {
  if (cache?.pack === pack) return cache.p
  const mine = {
    pack,
    p: (async () => {
      try {
        const bytes = await basemapSource(pack)
        return bytes ? decodeBasemap(bytes) : undefined // a basemap the reader rejects is dropped: the map has no background
      } catch { return undefined }
    })(),
  }
  cache = mine
  // a miss is not kept: the next map asks again (packs.ts does not go back to the network for a while)
  void mine.p.then((v) => { if (v === undefined && cache === mine) cache = null })
  return mine.p
}

// ------------------------------------------------------------------------------------------------------------- the screen

const DEFAULT_BBOX: [number, number, number, number] = [800, 2200, 5200, 4300] // the rectangle of the E1 basemap: 8-52 E, 22-43 N
const HOME_MARGIN = 40
const STEP = 1.6
const PICK_R = 24 // px: a tap picks the point this close to it
const PICK_ZOOM = 2.5 // a tap on several points at once zooms in this much, centered on the nearest
const PICK_WAIT = 300 // ms: the pick waits for a second tap (a double tap goes back to the first view and picks nothing)
const LABEL_AIR = 10 // the dot, its gap (6) and a little air, beside the label
const BUTTON_BOX = { x: 56, y: 4, bottom: 156 } // the buttons' column on the screen: from 56 px off the right edge (8 + 44 + 4), down to 8 + 3 x 44 + 2 x 6 + 4
const BUTTON_ROOM = 60
/**
 * The first view: the points fitted with the plain margin all round, then room taken on ONE side so the labels of up to 12 points are not
 * cut by the box: the labels grow to the right (to the left in right-to-left pages), and the room is as wide as the longest label as the
 * page measures it (an estimate without `measure`) needs beyond the margin. The height keeps the plain margin: the frame is fitted into
 * a narrower width and its centre moved so the room falls on that side. If a point or its label then lies under the buttons' column (always
 * on the right of the screen, in either direction) the room on the right grows by the column's width. The room never takes more than 40% of the width
 * (a quarter for the labels). Many points (clusters) show few labels: the plain fit.
 */
export function homeFrame(points: readonly { lat: number; lon: number; label: string }[], w: number, h: number, measure?: (t: string) => number, rtl = false): Frame {
  const plain = fit(points, w, h, HOME_MARGIN)
  if (points.length > 12) return plain
  const long = Math.max(0, ...points.map((p) => (!p.label ? 0 : measure ? measure(p.label) : p.label.length * 12 * 0.6 + 3)))
  const cap = Math.max(0, Math.min(w * 0.4, w - 160)) // all the room, buttons included; the labels' share is at most a quarter of the width
  const framed = (left: number, right: number): Frame => {
    if (left + right > cap) { const k = cap / (left + right); left *= k; right *= k }
    if (left + right <= 0) return plain
    // a single point has no width to fit: it keeps the plain scale, and the room comes from the centre shift alone
    const f0 = { ...fit(points, points.length <= 1 ? w : w - left - right, h, HOME_MARGIN), width: w, height: h } // the points centred on the whole width...
    const c = unproject(f0, w - (w / 2 + (left - right) / 2), h / 2) // ...then the centre moved: the block sits between `left` and `right`
    return { ...f0, lat: c.lat, lon: c.lon }
  }
  const covered = (f: Frame): boolean => points.some((p) => {
    const [x, y] = project(f, p.lat, p.lon)
    const lw = p.label ? (measure ? measure(p.label) : p.label.length * 12 * 0.6 + 3) : 0
    const x0 = rtl ? x - 6 - lw : x - 6, x1 = rtl ? x + 6 : x + 6 + lw
    return x1 >= w - BUTTON_BOX.x && x0 <= w && y + 9 >= BUTTON_BOX.y && y - 9 <= BUTTON_BOX.bottom
  })
  const room = Math.min(w / 4, Math.max(0, long + LABEL_AIR - HOME_MARGIN))
  const first = framed(rtl ? room : 0, rtl ? 0 : room)
  if (!covered(first)) return first
  // under the buttons: more room on the right, checked again; if still covered, one last step of the same size (then it is accepted: the room is capped,
  // and the person can pan; a very long label in the top-right band can still touch the column)
  const second = framed(rtl ? room : 0, (rtl ? 0 : room) + BUTTON_ROOM)
  return covered(second) ? framed(rtl ? room : 0, (rtl ? 0 : room) + 2 * BUTTON_ROOM) : second
}

function textMeasure(fontSize: number): ((t: string) => number) | undefined {
  try {
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) return undefined
    const family = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif'
    ctx.font = `${fontSize}px ${family}`
    return (t) => ctx.measureText(t).width + 3 // + the halo
  } catch { return undefined }
}
function mark(name: string, start: number, detail: Record<string, unknown>) {
  try { performance.measure(name, { start, end: performance.now(), detail }) } catch { /* no timing */ }
}
const FRAME_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>'

/**
 * Puts the map in `el`: SVG with the basemap (if any), pinch and drag (the picture moves with a CSS transform and is drawn again when the
 * fingers lift), a quick double tap back to the first view, and the buttons + / - / fit that need no gesture. The picture is drawn larger
 * than the screen, so a drag shows more map before the next drawing. `redraw()` draws again with the current theme; `destroy()` removes it.
 */
export async function mountMap(el: HTMLElement, o: MapOpts): Promise<{ redraw(): void; destroy(): void; ready: Promise<void> }> {
  const w = Math.max(120, Math.round(o.width ?? (el.clientWidth || 320)))
  const h = mapHeight(w, o.height)
  const m = Math.round(0.4 * Math.min(w, h)) // margin drawn around the screen
  const words = wordsFor(o.ui)
  const ac = new AbortController()
  const on = (t: EventTarget, type: string, f: (e: any) => void, opt: AddEventListenerOptions = {}) => t.addEventListener(type, f, { ...opt, signal: ac.signal })

  let basemap: Basemap | undefined // arrives later: the map is on the screen before it
  let theme = readTheme()
  const measure = textMeasure(12)
  let bbox = DEFAULT_BBOX
  let lo = minScale(bbox, w, h)
  const home = (): Frame => { const f = homeFrame(o.points, w, h, measure, o.dir === 'rtl'); return { ...f, scale: clampScale(f.scale, bbox, w, h) } }

  const full = o.gestures === 'full'
  const box = document.createElement('div')
  box.setAttribute('class', 'map-box')
  box.style.cssText = `position:relative;overflow:hidden;width:100%;height:${h}px;touch-action:${full ? 'none' : 'pan-x pan-y'};user-select:none;-webkit-user-select:none;border-radius:12px;border:1px solid var(--line, #0002);background:${theme.sea}`
  const layer = document.createElement('div')
  layer.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform'
  box.appendChild(layer)
  const ctl = document.createElement('div')
  ctl.setAttribute('role', 'group')
  ctl.setAttribute('aria-label', words.group)
  ctl.style.cssText = 'position:absolute;top:8px;right:8px;display:flex;flex-direction:column;gap:6px'
  const button = (text: string, label: string, html = false) => {
    const b = document.createElement('button')
    b.setAttribute('type', 'button')
    b.setAttribute('aria-label', label)
    b.setAttribute('title', label)
    b.style.cssText = 'width:44px;height:44px;border-radius:10px;border:1px solid var(--line, #0003);background:var(--card, #fff);color:var(--fg, #1a1a18);font:600 22px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer'
    if (html) b.innerHTML = text
    else b.textContent = text
    ctl.appendChild(b)
    return b
  }
  const bIn = button('+', words.zin)
  const bOut = button('−', words.zout)
  const bFit = button(FRAME_ICON, words.frame, true)
  on(ctl, 'pointerdown', (e) => e.stopPropagation()) // a button press is not the start of a drag
  box.appendChild(ctl)
  // "Use two fingers": shown for a moment when one finger moves over the map (it scrolls the page); it takes no room and is not read out
  const hint = document.createElement('div')
  hint.setAttribute('aria-hidden', 'true')
  hint.textContent = words.hint
  hint.style.cssText = 'position:absolute;left:0;right:0;bottom:0;padding:8px 12px;text-align:center;font:14px/1.3 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.6);pointer-events:none;opacity:0;transition:opacity .2s'
  hint.style.opacity = '0'
  if (!full) box.appendChild(hint) // the hint only makes sense when one finger scrolls the page
  let hintTimer: ReturnType<typeof setTimeout> | undefined
  const showHint = () => { if (full) return; hint.style.opacity = '1'; clearTimeout(hintTimer); hintTimer = setTimeout(() => { hint.style.opacity = '0' }, 1500) }
  el.appendChild(box)

  let view: Frame = home() // the screen's own frame (w x h); the picture is drawn on this frame grown by m on each side
  let tx = -m, ty = -m, s = 1, dead = false
  let userMoved = false // the view is no longer the fitted one
  let pending: ReturnType<typeof setTimeout> | undefined
  const bigFrame = (): Frame => ({ ...view, width: w + 2 * m, height: h + 2 * m })
  const put = () => { layer.style.transform = `translate(${tx}px,${ty}px) scale(${s})` }

  function draw(name: 'map:first-draw' | 'map:redraw', extra: Record<string, unknown> = {}) {
    if (dead) return
    const t0 = performance.now()
    theme = readTheme()
    const svg = mapSvg({ ...o, basemap, theme, ...(measure ? { measure } : {}), frame: bigFrame() })
    box.style.background = theme.sea
    layer.innerHTML = svg
    tx = -m; ty = -m; s = 1
    put()
    void (layer as HTMLElement).offsetHeight // layout now, so the time counts it
    mark(name, t0, { points: o.points.length, ...extra })
  }
  // The gesture ends: the view moves to where the picture was dragged and scaled to, and the picture is drawn again there.
  function commit(extra: Record<string, unknown> = {}) {
    if (dead || (s === 1 && tx === -m && ty === -m)) return
    const c = unproject(bigFrame(), (w / 2 - tx) / s, (h / 2 - ty) / s)
    view = { ...view, lat: c.lat, lon: c.lon, scale: Math.max(lo, Math.min(MAX_SCALE, view.scale * s)) }
    userMoved = true
    draw('map:redraw', extra)
  }
  function zoomAt(f: number, x: number, y: number) {
    const now = view.scale * s
    f = Math.max(lo / now, Math.min(MAX_SCALE / now, f))
    tx = x - (x - tx) * f
    ty = y - (y - ty) * f
    s *= f
    put()
  }
  const frameAll = () => { view = home(); userMoved = false; draw('map:redraw') }
  // A tap at (x, y) of the box: the point under it is picked; several under it (a cluster) zoom in on the nearest instead, unless the map cannot zoom more.
  let pickTimer: ReturnType<typeof setTimeout> | undefined
  function pickAt(x: number, y: number) {
    if (dead || !o.onPick) return
    const f = bigFrame()
    const near = o.points
      .map((p) => { const [px, py] = project(f, p.lat, p.lon); const sx = px * s + tx, sy = py * s + ty; return { id: p.id, sx, sy, d: Math.hypot(sx - x, sy - y) } })
      .filter((c) => c.d < PICK_R)
      .sort((a, b) => a.d - b.d)
    const n = near[0]
    if (!n) return
    if (near.length > 1 && view.scale * s < MAX_SCALE * 0.999) {
      tx += w / 2 - n.sx; ty += h / 2 - n.sy
      zoomAt(PICK_ZOOM, w / 2, h / 2)
      commit()
    } else o.onPick(n.id)
  }

  draw('map:first-draw')
  // The basemap is read after the first drawing, never waited for: when it arrives the map is drawn again (a gesture in progress is committed).
  const ready = basemapOfPack(o.pack).then((b) => {
    if (dead || !b) return
    basemap = b
    bbox = b.bbox
    lo = minScale(bbox, w, h)
    if (s === 1 && tx === -m && ty === -m) {
      // the limits changed: the fitted frame keeps its place with its scale clamped; a view the person moved is clamped too
      view = userMoved ? { ...view, scale: Math.max(lo, Math.min(MAX_SCALE, view.scale)) } : home()
      draw('map:redraw', { basemap: true })
    } else commit({ basemap: true })
  })

  on(bIn, 'click', () => { zoomAt(STEP, w / 2, h / 2); commit() })
  on(bOut, 'click', () => { zoomAt(1 / STEP, w / 2, h / 2); commit() })
  on(bFit, 'click', frameAll)

  // pointers: one drags, two pinch; a quick second tap goes back to the first view
  const ptr = new Map<number, [number, number]>()
  let down: { t: number; x: number; y: number; cx: number; cy: number; moved: boolean } | null = null // x, y: in the box; cx, cy: on the screen
  let lastTap: { t: number; x: number; y: number } | null = null
  const rel = (e: PointerEvent | WheelEvent): [number, number] => { const r = box.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  on(box, 'pointerdown', (e: PointerEvent) => {
    if (e.pointerType === 'touch') return // fingers are read from the touch events (the browser may cancel the pointers)
    try { box.setPointerCapture(e.pointerId) } catch { /* not captured */ }
    const p = rel(e)
    if (ptr.size === 0) down = { t: Date.now(), x: p[0], y: p[1], cx: e.clientX, cy: e.clientY, moved: false }
    else if (down) down.moved = true
    ptr.set(e.pointerId, p)
    clearTimeout(pickTimer)
  })
  on(box, 'pointermove', (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    const p = ptr.get(e.pointerId)
    if (!p) return
    const n = rel(e)
    if (down && Math.hypot(n[0] - down.x, n[1] - down.y) > 8) down.moved = true
    if (ptr.size === 1) { tx += n[0] - p[0]; ty += n[1] - p[1]; put() }
    else if (ptr.size === 2) {
      const o2 = [...ptr.entries()].find(([id]) => id !== e.pointerId)![1]
      const d1 = Math.hypot(n[0] - o2[0], n[1] - o2[1]), d0 = Math.hypot(p[0] - o2[0], p[1] - o2[1])
      tx += (n[0] - p[0]) / 2; ty += (n[1] - p[1]) / 2
      if (d0 > 0) zoomAt(d1 / d0, (n[0] + o2[0]) / 2, (n[1] + o2[1]) / 2)
      else put()
    }
    ptr.set(e.pointerId, n)
  })
  // the end of a touch that did not move is a tap: a second one soon after goes back to the first view. True when it did.
  function tapEnd(d: typeof down): boolean {
    if (!d || d.moved || Date.now() - d.t >= 300) return false
    const now = Date.now()
    if (lastTap && now - lastTap.t < 350 && Math.hypot(d.x - lastTap.x, d.y - lastTap.y) < 30) { lastTap = null; clearTimeout(pickTimer); frameAll(); return true }
    lastTap = { t: now, x: d.x, y: d.y }
    if (o.onPick) { const { x, y } = d; clearTimeout(pickTimer); pickTimer = setTimeout(() => pickAt(x, y), PICK_WAIT) }
    return false
  }
  const up = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (!ptr.delete(e.pointerId) || ptr.size) return
    const d = down
    down = null
    if (tapEnd(d)) return
    commit()
  }
  on(box, 'pointerup', up)
  on(box, 'pointercancel', up)
  on(box, 'wheel', (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return // a plain wheel scrolls the page
    e.preventDefault()
    clearTimeout(pickTimer)
    const [x, y] = rel(e)
    zoomAt(Math.exp(-e.deltaY * 0.0015), x, y)
    clearTimeout(pending)
    pending = setTimeout(commit, 150)
  }, { passive: false })
  // Fingers, from the touch events: one finger scrolls the page (the hint is shown; in 'full' it moves the map), two pan and pinch the map. The browser may cancel the
  // first pointer when the scroll starts, so the pointer events are not used for fingers.
  let tpos = new Map<number, [number, number]>()
  let dragging = false // 'full': one finger has gone past the threshold (or two were down): it follows the finger
  const fingers = (e: TouchEvent) => {
    const r = box.getBoundingClientRect()
    return Array.from(e.touches as ArrayLike<Touch>).map((t) => ({ id: t.identifier, p: [t.clientX - r.left, t.clientY - r.top] as [number, number], c: [t.clientX, t.clientY] as [number, number] }))
  }
  on(box, 'touchstart', (e: TouchEvent) => {
    clearTimeout(pickTimer)
    const ts = fingers(e)
    if (full && ts.length >= 2) dragging = true
    else if (ts.length === 1) dragging = false
    if (full && ts.length >= 2 && !down) down = { t: Date.now(), x: ts[0]!.p[0], y: ts[0]!.p[1], cx: ts[0]!.c[0], cy: ts[0]!.c[1], moved: true }
    else if (ts.length === 1 && !down) down = { t: Date.now(), x: ts[0]!.p[0], y: ts[0]!.p[1], cx: ts[0]!.c[0], cy: ts[0]!.c[1], moved: false }
    else if (down) down.moved = true
    tpos = new Map(ts.map((f) => [f.id, f.p]))
  }, { passive: true })
  on(box, 'touchmove', (e: TouchEvent) => {
    const ts = fingers(e)
    if (ts.length >= 2) {
      e.preventDefault() // two fingers must not also scroll the page
      const [a, b] = ts as [typeof ts[0], typeof ts[0]]
      const pa = tpos.get(a.id), pb = tpos.get(b.id)
      if (pa && pb) {
        const d0 = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]), d1 = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1])
        tx += (a.p[0] - pa[0] + b.p[0] - pb[0]) / 2
        ty += (a.p[1] - pa[1] + b.p[1] - pb[1]) / 2
        if (d0 > 0) zoomAt(d1 / d0, (a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2)
        else put()
      }
      if (down) down.moved = true
      if (full) dragging = true
    } else if (ts.length === 1 && down) {
      if (full) {
        e.preventDefault()
        const f = ts[0]!
        // a tap with a tremor does not move the map: it follows the finger once it is 8 px from where it began (the px up to there are not lost)
        if (!dragging && Math.hypot(f.c[0] - down.cx, f.c[1] - down.cy) <= 8) return
        dragging = true
        const p0 = tpos.get(f.id)
        if (p0) { tx += f.p[0] - p0[0]; ty += f.p[1] - p0[1]; put() }
      }
      // on the screen, not in the box: when the page scrolls under the finger the box moves with it
      if (Math.hypot(ts[0]!.c[0] - down.cx, ts[0]!.c[1] - down.cy) > 8) { down.moved = true; showHint() }
    }
    tpos = new Map(ts.map((f) => [f.id, f.p]))
  }, { passive: false })
  const touchEnd = (e: TouchEvent, cancelled: boolean) => {
    const ts = fingers(e)
    tpos = new Map(ts.map((f) => [f.id, f.p]))
    if (ts.length >= 2) return
    if (ts.length === 0) {
      const d = down
      const end = e.changedTouches?.[0] // a touch that ended away from where it began is not a tap, moves seen or not
      if (d && end && Math.hypot(end.clientX - d.cx, end.clientY - d.cy) > 8) d.moved = true
      down = null
      if (!cancelled && tapEnd(d)) return
    }
    commit() // no-op when nothing was dragged or scaled
  }
  on(box, 'touchend', (e: TouchEvent) => touchEnd(e, false), { passive: true })
  on(box, 'touchcancel', (e: TouchEvent) => touchEnd(e, true), { passive: true })
  // the system switches between light and dark: the next drawing takes the new colors
  const mq = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
  if (mq) on(mq, 'change', () => api.redraw())

  const api = {
    ready,
    redraw() { clearTimeout(pending); if (!dead) { if (s === 1 && tx === -m && ty === -m) draw('map:redraw'); else commit() } },
    destroy() { dead = true; clearTimeout(pending); clearTimeout(pickTimer); clearTimeout(hintTimer); ac.abort(); box.remove() },
  }
  return api
}
