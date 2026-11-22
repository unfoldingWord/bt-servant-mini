// The map on the screen (diseno-mapas.md 5.6; mapas-render-decision.md "Para E2"). The SVG is built on the phone by the client's `drawMap`
// (pure, no DOM); this file adds what needs the page: the basemap (looked for by packs.ts, read once per pack), the theme as literal colors
// read from the style sheet when drawing, text width from a canvas, pan and zoom, the three buttons, and the timing marks
// `map:first-draw` and `map:redraw` (performance.measure) that are read on a phone over CDP.
import { decodeBasemap, type Basemap } from '@bt-synergy/language-pack-v3'
import {
  clampScale, drawMap, fit, MAX_SCALE, minScale, unproject,
  type Frame, type MapPoint, type Theme,
} from '@bt-synergy/language-pack-client'
import { basemapBytes, onPacksChanged } from './packs'

export type { MapPoint }
export type MapOpts = { pack: string; points: MapPoint[]; summary: string; ui: string; dir: 'ltr' | 'rtl'; width?: number; height?: number }

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
  const h = Math.max(120, Math.round(o.height ?? Math.min(360, Math.max(200, w * 0.75))))
  const m = Math.round(0.4 * Math.min(w, h)) // margin drawn around the screen
  const words = wordsFor(o.ui)
  const ac = new AbortController()
  const on = (t: EventTarget, type: string, f: (e: any) => void, opt: AddEventListenerOptions = {}) => t.addEventListener(type, f, { ...opt, signal: ac.signal })

  let basemap: Basemap | undefined // arrives later: the map is on the screen before it
  let theme = readTheme()
  const measure = textMeasure(12)
  let bbox = DEFAULT_BBOX
  let lo = minScale(bbox, w, h)
  const home = (): Frame => { const f = fit(o.points, w, h, HOME_MARGIN); return { ...f, scale: clampScale(f.scale, bbox, w, h) } }

  const box = document.createElement('div')
  box.setAttribute('class', 'map-box')
  box.style.cssText = `position:relative;overflow:hidden;width:100%;height:${h}px;touch-action:pan-x pan-y;user-select:none;-webkit-user-select:none;border-radius:12px;border:1px solid var(--line, #0002);background:${theme.sea}`
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
  box.appendChild(hint)
  let hintTimer: ReturnType<typeof setTimeout> | undefined
  const showHint = () => { hint.style.opacity = '1'; clearTimeout(hintTimer); hintTimer = setTimeout(() => { hint.style.opacity = '0' }, 1500) }
  el.appendChild(box)

  let view: Frame = home() // the screen's own frame (w x h); the picture is drawn on this frame grown by m on each side
  let tx = -m, ty = -m, s = 1, dead = false
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
  const frameAll = () => { view = home(); draw('map:redraw') }

  draw('map:first-draw')
  // The basemap is read after the first drawing, never waited for: when it arrives the map is drawn again (a gesture in progress is committed).
  const ready = basemapOfPack(o.pack).then((b) => {
    if (dead || !b) return
    basemap = b
    bbox = b.bbox
    lo = minScale(bbox, w, h)
    if (s === 1 && tx === -m && ty === -m) draw('map:redraw', { basemap: true })
    else commit({ basemap: true })
  })

  on(bIn, 'click', () => { zoomAt(STEP, w / 2, h / 2); commit() })
  on(bOut, 'click', () => { zoomAt(1 / STEP, w / 2, h / 2); commit() })
  on(bFit, 'click', frameAll)

  // pointers: one drags, two pinch; a quick second tap goes back to the first view
  const ptr = new Map<number, [number, number]>()
  const touch = new Set<number>() // the pointers that are fingers
  let down: { t: number; x: number; y: number; moved: boolean } | null = null
  let lastTap: { t: number; x: number; y: number } | null = null
  const rel = (e: PointerEvent | WheelEvent): [number, number] => { const r = box.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  on(box, 'pointerdown', (e: PointerEvent) => {
    try { box.setPointerCapture(e.pointerId) } catch { /* not captured */ }
    const p = rel(e)
    if (e.pointerType === 'touch') touch.add(e.pointerId)
    if (ptr.size === 0) down = { t: Date.now(), x: p[0], y: p[1], moved: false }
    else if (down) down.moved = true
    ptr.set(e.pointerId, p)
  })
  on(box, 'pointermove', (e: PointerEvent) => {
    const p = ptr.get(e.pointerId)
    if (!p) return
    const n = rel(e)
    if (down && Math.hypot(n[0] - down.x, n[1] - down.y) > 8) down.moved = true
    if (ptr.size === 1) {
      if (touch.has(e.pointerId)) { if (down?.moved) showHint() } // one finger scrolls the page, not the map
      else { tx += n[0] - p[0]; ty += n[1] - p[1]; put() }
    }
    else if (ptr.size === 2) {
      const o2 = [...ptr.entries()].find(([id]) => id !== e.pointerId)![1]
      const d1 = Math.hypot(n[0] - o2[0], n[1] - o2[1]), d0 = Math.hypot(p[0] - o2[0], p[1] - o2[1])
      tx += (n[0] - p[0]) / 2; ty += (n[1] - p[1]) / 2
      if (d0 > 0) zoomAt(d1 / d0, (n[0] + o2[0]) / 2, (n[1] + o2[1]) / 2)
      else put()
    }
    ptr.set(e.pointerId, n)
  })
  const up = (e: PointerEvent) => {
    touch.delete(e.pointerId)
    if (!ptr.delete(e.pointerId) || ptr.size) return
    const d = down
    down = null
    if (d && !d.moved && Date.now() - d.t < 300) {
      const now = Date.now()
      if (lastTap && now - lastTap.t < 350 && Math.hypot(d.x - lastTap.x, d.y - lastTap.y) < 30) { lastTap = null; frameAll(); return }
      lastTap = { t: now, x: d.x, y: d.y }
    }
    commit()
  }
  on(box, 'pointerup', up)
  on(box, 'pointercancel', up)
  on(box, 'wheel', (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return // a plain wheel scrolls the page
    e.preventDefault()
    const [x, y] = rel(e)
    zoomAt(Math.exp(-e.deltaY * 0.0015), x, y)
    clearTimeout(pending)
    pending = setTimeout(commit, 150)
  }, { passive: false })
  // two fingers must not also scroll the page
  on(box, 'touchmove', (e: TouchEvent) => { if (e.touches.length >= 2) e.preventDefault() }, { passive: false })
  // the system switches between light and dark: the next drawing takes the new colors
  const mq = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
  if (mq) on(mq, 'change', () => api.redraw())

  const api = {
    ready,
    redraw() { clearTimeout(pending); if (!dead) { if (s === 1 && tx === -m && ty === -m) draw('map:redraw'); else commit() } },
    destroy() { dead = true; clearTimeout(pending); clearTimeout(hintTimer); ac.abort(); box.remove() },
  }
  return api
}
