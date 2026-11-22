// mapview.ts and the basemap of packs.ts (encargo-ms-mapas.md task 3; diseno-mapas.md 5.6, 5.5; mapas-render-decision.md "Para E2").
// mapSvg is tested as text (pure); mountMap with a tiny fake DOM written here (no happy-dom); the basemap lookup of packs.ts against the
// signed sample of fixtures/maps/ (its catalog lists the `basemap` complement), with fake-indexeddb as the phone's store.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { encodeBasemap, type Basemap } from '@bt-synergy/language-pack-v3'
import { MAX_SCALE, minScale, project, type MapPoint } from '@bt-synergy/language-pack-client'
import { BTS_DIR } from './bts-dir'
import { mapsFixture } from './maps-fixture'
import { MAP_DARK, MAP_LIGHT, MAP_T, mapSvg, mountMap, readTheme, resetMapCache, setBasemapSource } from '../src/mapview'
import { addedClient, basemapStore, setBasemapStore, basemapBytes, reloadPacks, setBasemapFetchMs, resetAddedStore, setPacksServers, setTrustedKeys } from '../src/packs'

const FAKE_IDB = join(BTS_DIR, 'packages', 'language-pack-client', 'node_modules', 'fake-indexeddb', 'build', 'esm', 'index.js')

// ---------------------------------------------------------------------------------------------------------------- data

/** A small basemap made here (not the real one): a square of land around Bethel, a lake and a river. Degrees x 100. */
const SMALL: Basemap = {
  bbox: [3300, 3000, 3800, 3400],
  paths: [
    { layer: 1, points: [[3350, 3050], [3750, 3050], [3750, 3350], [3350, 3350]] },
    { layer: 2, points: [[3560, 3100], [3600, 3100], [3600, 3130], [3560, 3130]] },
    { layer: 3, points: [[3400, 3300], [3500, 3250], [3600, 3200]] },
  ],
}
const SMALL_BYTES = encodeBasemap(SMALL)
const bethel: MapPoint[] = [
  { id: 'place:bethel', lat: 31.93, lon: 35.22, sure: 3, form: 1, label: 'Betel', verses: 69 },
  { id: 'place:jerusalem', lat: 31.78, lon: 35.23, sure: 3, form: 1, label: 'Jerusalén', verses: 800 },
]
const BASE = { pack: 'es-419', points: bethel, summary: 'Mapa: Betel, unos 15 km al norte de Jerusalén', ui: 'es', dir: 'ltr' as const, width: 320, height: 240 }
const SVG_DIR = join(import.meta.dir, 'fixtures', 'mapview')
/** The text saved for a known answer (made on the first run; delete the file to make it again after a deliberate change). */
function golden(name: string, text: string) {
  const f = join(SVG_DIR, name)
  if (process.env.UPDATE_GOLDEN === '1') { mkdirSync(SVG_DIR, { recursive: true }); writeFileSync(f, text) }
  if (!existsSync(f)) throw new Error(`the saved text ${f} is missing (UPDATE_GOLDEN=1 makes it)`)
  return readFileSync(f, 'utf8')
}

// ---------------------------------------------------------------------------------------------------- the drawing (pure)

describe('mapSvg', () => {
  const { decodeBasemap } = require('@bt-synergy/language-pack-v3')
  const base = decodeBasemap(SMALL_BYTES) as Basemap
  test('a known answer on a small basemap is the text saved', () => {
    const svg = mapSvg({ ...BASE, basemap: base, theme: MAP_LIGHT })
    expect(svg).toBe(golden('betel-light.svg', svg))
    expect(svg).toContain('role="img"')
    expect(svg).toContain('aria-label="Mapa: Betel, unos 15 km al norte de Jerusalén"')
    expect(svg).toContain('map-land')
    expect(svg).toContain('Betel')
  })
  test('structure, independent of the saved text: the point is at its projected pixel, with its label, role and summary', () => {
    const frame = { lat: 31.93, lon: 35.22, scale: 400, width: 320, height: 240 }
    const svg = mapSvg({ ...BASE, basemap: base, theme: MAP_LIGHT, frame })
    const [x, y] = project(frame, 31.93, 35.22)
    const c = /<circle class="map-dot"[^>]*data-id="place:bethel"[^>]*cx="([-\d.]+)" cy="([-\d.]+)"/.exec(svg)!
    expect(Number(c[1])).toBeCloseTo(x, 0)
    expect(Number(c[2])).toBeCloseTo(y, 0)
    const [x2, y2] = project(frame, 31.78, 35.23)
    const j = /<circle class="map-dot"[^>]*data-id="place:jerusalem"[^>]*cx="([-\d.]+)" cy="([-\d.]+)"/.exec(svg)!
    expect(Number(j[1])).toBeCloseTo(x2, 0)
    expect(Number(j[2])).toBeCloseTo(y2, 0)
    expect(svg).toMatch(/<text class="map-label"[^>]*>Betel<\/text>/)
    expect(svg).toContain('role="img"')
    expect(svg).toContain('aria-label="Mapa: Betel, unos 15 km al norte de Jerusalén"')
  })
  test('the dark theme gives other literal colors, and no var() in either', () => {
    const light = mapSvg({ ...BASE, basemap: base, theme: MAP_LIGHT })
    const dark = mapSvg({ ...BASE, basemap: base, theme: MAP_DARK })
    expect(dark).not.toBe(light)
    expect(dark).toContain(MAP_DARK.land)
    expect(dark).toContain(MAP_DARK.sea)
    expect(dark).not.toContain(MAP_LIGHT.land)
    for (const s of [light, dark]) expect(s).not.toContain('var(')
  })
  test('without a basemap it draws the same, on plain sea', () => {
    const svg = mapSvg({ ...BASE, theme: MAP_LIGHT })
    expect(svg).toContain('map-sea')
    expect(svg).not.toContain('map-land')
    expect(svg).toContain('map-dot')
    expect(svg).toContain('Betel')
  })
  test('a name with <script> and quotes comes out escaped', () => {
    const evil: MapPoint[] = [{ ...bethel[0]!, label: '<b>"&' }]
    const svg = mapSvg({ ...BASE, points: evil, summary: 'a "b" <i>', theme: MAP_LIGHT })
    expect(svg).not.toContain('<b>')
    expect(svg).not.toContain('<i>')
    expect(svg).toContain('&lt;b&gt;&quot;&amp;')
    expect(svg).toContain('a &quot;b&quot; &lt;i&gt;')
  })
  test('right-to-left: the root says so and the map is not mirrored (Jerusalem stays south of Betel)', () => {
    const svg = mapSvg({ ...BASE, dir: 'rtl', theme: MAP_LIGHT })
    expect(svg).toContain('direction="rtl"')
    const cy = [...svg.matchAll(/class="map-dot"[^>]*cy="([\d.]+)"/g)].map((m) => Number(m[1]))
    expect(cy.length).toBe(2)
    expect(cy[0]).toBeLessThan(cy[1]!) // Betel (north) above Jerusalem
  })
})

// contrast ratios (WCAG relative luminance) of what is drawn against the land and the sea
const lum = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}
const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
describe('theme contrast', () => {
  for (const [name, t] of [['light', MAP_LIGHT], ['dark', MAP_DARK]] as const) {
    test(`${name}: point, hollow point, route and cluster are 3:1 against land and sea; label 4.5:1 against its halo`, () => {
      for (const k of ['point', 'pointHollow', 'route', 'cluster'] as const) {
        expect(ratio(t[k], t.land)).toBeGreaterThanOrEqual(3)
        expect(ratio(t[k], t.sea)).toBeGreaterThanOrEqual(3)
      }
      expect(ratio(t.label, t.halo)).toBeGreaterThanOrEqual(4.5)
      expect(ratio(t.clusterText, t.cluster)).toBeGreaterThanOrEqual(4.5)
      expect(ratio(t.coast, t.land)).toBeGreaterThanOrEqual(3) // the shore tells land from sea, as the two fills are close
    })
    test(`${name}: every color is a literal`, () => {
      for (const v of Object.values(t)) expect(v).toMatch(/^#[0-9a-f]{6}$/i)
    })
  }
})

// ------------------------------------------------------------------------------------------------------------- a fake DOM

type Handler = (e: any) => void
class FakeEl {
  tagName: string; children: FakeEl[] = []; parent: FakeEl | null = null; attrs = new Map<string, string>()
  style: Record<string, string> = {}; text = ''; html = ''; clientWidth = 320; offsetHeight = 0
  handlers = new Map<string, Handler[]>()
  constructor(tag: string) { this.tagName = tag.toUpperCase() }
  setAttribute(k: string, v: string) { this.attrs.set(k, String(v)) }
  getAttribute(k: string) { return this.attrs.get(k) ?? null }
  appendChild(c: FakeEl) { c.parent = this; this.children.push(c); return c }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null } }
  set textContent(v: string) { this.text = v }
  get textContent() { return this.text }
  set innerHTML(v: string) { this.html = v }
  get innerHTML() { return this.html }
  addEventListener(t: string, f: Handler, o?: { signal?: AbortSignal }) {
    this.handlers.set(t, [...(this.handlers.get(t) ?? []), f])
    o?.signal?.addEventListener('abort', () => this.handlers.set(t, (this.handlers.get(t) ?? []).filter((x) => x !== f)))
  }
  fire(t: string, e: Record<string, unknown> = {}) {
    const ev: any = { target: this, stopPropagation() { ev.stopped = true }, preventDefault() { ev.prevented = true }, ...e }
    for (const f of this.handlers.get(t) ?? []) f(ev)
    return ev
  }
  getBoundingClientRect() { return { left: 0, top: 0 } }
  setPointerCapture() {}
  find(pred: (e: FakeEl) => boolean): FakeEl[] { return [...(pred(this) ? [this] : []), ...this.children.flatMap((c) => c.find(pred))] }
  click() { this.fire('click') }
}
const vars = new Map<string, string>()
const saved = { document: (globalThis as any).document, getComputedStyle: (globalThis as any).getComputedStyle, matchMedia: (globalThis as any).matchMedia }
const docEl = new FakeEl('html')
const body = new FakeEl('body')
function installDom() {
  ;(globalThis as any).document = {
    documentElement: docEl, body,
    createElement: (t: string) => {
      const e = new FakeEl(t)
      if (t === 'canvas') (e as any).getContext = () => ({ font: '', measureText: (s: string) => ({ width: [...s].length * 7 }) })
      return e
    },
  }
  ;(globalThis as any).getComputedStyle = () => ({ getPropertyValue: (k: string) => vars.get(k) ?? '', fontFamily: 'system-ui' })
  ;(globalThis as any).matchMedia = undefined
}
/** the circles of the drawn points: [cx, cy] each, in the order drawn */
const dots = (html: string) => [...html.matchAll(/class="map-dot"[^>]*?cx="([-\d.]+)" cy="([-\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])] as const)
const layerOf = (el: FakeEl) => el.children[0]!.children[0]!
/** vertical pixels between the two points (a measure of the scale: they are 0.15 degrees of latitude apart in `bethel`) */
const gap = (el: FakeEl, deg = 0.15) => { const d = dots(layerOf(el).html); return Math.abs(d[0]![1] - d[1]![1]) / deg }
const sizes = (n: string) => performance.getEntriesByName(n).length

describe('mountMap', () => {
  beforeAll(installDom)
  afterAll(() => {
    ;(globalThis as any).document = saved.document; (globalThis as any).getComputedStyle = saved.getComputedStyle; (globalThis as any).matchMedia = saved.matchMedia
    setBasemapSource()
  })

  test('draws the basemap, with the summary as the label of the picture, and leaves a timing mark', async () => {
    vars.clear(); setBasemapSource(async () => SMALL_BYTES)
    const el = new FakeEl('div')
    const before = sizes('map:first-draw')
    const m = await mountMap(el as any, BASE)
    // at once, without a background; the basemap comes after
    expect(layerOf(el).html).not.toContain('map-land')
    expect(layerOf(el).html).toContain('map-dot')
    const re0 = sizes('map:redraw')
    await m.ready
    const svg = layerOf(el).html
    expect(svg).toContain('map-land')
    expect(svg).toContain('role="img"')
    expect(svg).toContain('aria-label="Mapa: Betel')
    expect(sizes('map:first-draw')).toBe(before + 1)
    expect(sizes('map:redraw')).toBe(re0 + 1)
    expect((performance.getEntriesByName('map:redraw').at(-1) as any).detail).toMatchObject({ basemap: true })
    m.destroy()
    expect(el.children.length).toBe(0)
  })

  test('a basemap that never arrives does not hold the map back', async () => {
    setBasemapSource(() => new Promise<Uint8Array | null>(() => {}))
    const el = new FakeEl('div')
    const m = await mountMap(el as any, BASE)
    expect(layerOf(el).html).toContain('map-dot')
    expect(layerOf(el).html).not.toContain('map-land')
    m.destroy()
  })

  test('with no basemap (none found), or one the reader rejects, it draws without one and shows no error', async () => {
    for (const src of [async () => null, async () => new Uint8Array([1, 2, 3, 4]), async () => { throw new Error('boom') }]) {
      setBasemapSource(src as any)
      const el = new FakeEl('div')
      const m = await mountMap(el as any, BASE)
      await m.ready
      const svg = layerOf(el).html
      expect(svg).toContain('map-dot')
      expect(svg).not.toContain('map-land')
      m.destroy()
    }
  })

  test('the basemap is read once per pack, and again after resetMapCache or for another pack', async () => {
    let n = 0
    setBasemapSource(async () => { n++; return SMALL_BYTES })
    const go = async (o: typeof BASE) => { const m = await mountMap(new FakeEl('div') as any, o); await m.ready; m.destroy() }
    for (let i = 0; i < 3; i++) await go(BASE)
    expect(n).toBe(1)
    resetMapCache()
    await go(BASE)
    expect(n).toBe(2)
    await go({ ...BASE, pack: 'hi' })
    expect(n).toBe(3)
  })

  test('a missing basemap is asked for again by the next map (the miss is not kept)', async () => {
    let n = 0
    setBasemapSource(async () => { n++; return null })
    for (let i = 0; i < 2; i++) { const m = await mountMap(new FakeEl('div') as any, BASE); await m.ready; m.destroy() }
    expect(n).toBe(2)
  })

  test('the colors come from the page when it is dark, as literals; a --map-sea override is used if it is a literal color', async () => {
    setBasemapSource(async () => SMALL_BYTES)
    vars.clear(); vars.set('--bg', '#262624')
    expect(readTheme()).toEqual(MAP_DARK)
    vars.set('--map-sea', '#112233')
    expect(readTheme().sea).toBe('#112233')
    vars.set('--map-sea', 'var(--evil)')
    expect(readTheme().sea).toBe(MAP_DARK.sea)
    vars.clear(); vars.set('--bg', '#f5f5f0')
    expect(readTheme()).toEqual(MAP_LIGHT)
    const el = new FakeEl('div')
    vars.set('--bg', '#262624')
    const m = await mountMap(el as any, BASE)
    await m.ready
    expect(layerOf(el).html).toContain(MAP_DARK.land)
    expect(layerOf(el).html).not.toContain('var(')
    vars.set('--bg', '#f5f5f0')
    m.redraw()
    expect(layerOf(el).html).toContain(MAP_LIGHT.land)
    m.destroy(); vars.clear()
  })

  test('the buttons zoom within the limits: + and - change the scale, and it never passes the basemap or MAX_SCALE', async () => {
    setBasemapSource(async () => SMALL_BYTES)
    const near: MapPoint[] = [{ ...bethel[0]!, id: 'a', lat: 31.93 }, { ...bethel[1]!, id: 'b', lat: 31.925 }] // 0.005 degrees apart
    const el = new FakeEl('div')
    const m = await mountMap(el as any, { ...BASE, points: near })
    await m.ready
    const btn = (label: string) => el.find((e) => e.tagName === 'BUTTON' && e.getAttribute('aria-label') === label)[0]!
    const g0 = gap(el, 0.005)
    btn(MAP_T.es.zin).click()
    expect(gap(el, 0.005)).toBeCloseTo(g0 * 1.6, -2) // the pixels are rounded to 0.1
    btn(MAP_T.es.zout).click(); btn(MAP_T.es.zout).click()
    expect(gap(el, 0.005)).toBeLessThan(g0)
    for (let i = 0; i < 40; i++) btn(MAP_T.es.zin).click()
    expect(gap(el, 0.005)).toBeCloseTo(MAX_SCALE, -2)
    // the fit button goes back to the first view
    btn(MAP_T.es.frame).click()
    expect(gap(el, 0.005)).toBeCloseTo(g0, -2)
    expect(sizes('map:redraw')).toBeGreaterThan(0)
    m.destroy()
    // zoomed out as far as it goes, the whole basemap fits the picture: a degree is `minScale` pixels (two points a degree apart)
    const far: MapPoint[] = [{ ...bethel[0]!, id: 'a', lat: 31.5 }, { ...bethel[1]!, id: 'b', lat: 32.5 }]
    const el2 = new FakeEl('div')
    const m2 = await mountMap(el2 as any, { ...BASE, points: far })
    await m2.ready
    const btn2 = (label: string) => el2.find((e) => e.tagName === 'BUTTON' && e.getAttribute('aria-label') === label)[0]!
    for (let i = 0; i < 30; i++) btn2(MAP_T.es.zout).click()
    expect(gap(el2, 1)).toBeCloseTo(minScale(SMALL.bbox, 320, 240), 0)
    m2.destroy()
  })

  test('the buttons stop the press from starting a drag', async () => {
    setBasemapSource(async () => SMALL_BYTES)
    const el = new FakeEl('div')
    const m = await mountMap(el as any, BASE)
    const group = el.find((e) => e.getAttribute('role') === 'group')[0]!
    expect(group.fire('pointerdown', { pointerId: 1 }).stopped).toBe(true)
    m.destroy()
  })

  test('drag moves the picture by the same pixels; two fingers zoom; a quick double tap goes back to the first view', async () => {
    setBasemapSource(async () => SMALL_BYTES)
    const el = new FakeEl('div')
    const m = await mountMap(el as any, BASE)
    const box = el.children[0]!
    const g0 = gap(el)
    const x0 = dots(layerOf(el).html)[0]![0]
    // drag 50 px to the right
    box.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 })
    box.fire('pointermove', { pointerId: 1, clientX: 150, clientY: 100 })
    expect(layerOf(el).style.transform).toContain('translate(')
    box.fire('pointerup', { pointerId: 1, clientX: 150, clientY: 100 })
    expect(dots(layerOf(el).html)[0]![0]).toBeCloseTo(x0 + 50, 0)
    expect(gap(el)).toBeCloseTo(g0, 0)
    // pinch: the two fingers go from 100 px apart to 200 px apart
    box.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 })
    box.fire('pointerdown', { pointerId: 2, clientX: 200, clientY: 100 })
    box.fire('pointermove', { pointerId: 2, clientX: 300, clientY: 100 })
    box.fire('pointerup', { pointerId: 2, clientX: 300, clientY: 100 })
    box.fire('pointerup', { pointerId: 1, clientX: 150, clientY: 100 })
    expect(gap(el)).toBeGreaterThan(g0 * 1.5)
    // double tap
    for (let i = 0; i < 2; i++) { box.fire('pointerdown', { pointerId: 1, clientX: 50, clientY: 50 }); box.fire('pointerup', { pointerId: 1, clientX: 50, clientY: 50 }) }
    expect(gap(el)).toBeCloseTo(g0, 0)
    m.destroy()
  })

  test('wheel: a plain turn does nothing (the page scrolls); with ctrl or meta it zooms', async () => {
    setBasemapSource(async () => SMALL_BYTES)
    const el = new FakeEl('div')
    const m = await mountMap(el as any, BASE)
    const box = el.children[0]!
    const flat = layerOf(el).style.transform
    const plain = box.fire('wheel', { clientX: 160, clientY: 120, deltaY: -300 })
    expect(layerOf(el).style.transform).toBe(flat)
    expect(plain.prevented).toBeFalsy()
    const z = box.fire('wheel', { clientX: 160, clientY: 120, deltaY: -300, ctrlKey: true })
    expect(z.prevented).toBe(true)
    expect(layerOf(el).style.transform).toContain('scale(1.')
    box.fire('wheel', { clientX: 160, clientY: 120, deltaY: 300, metaKey: true })
    expect(layerOf(el).style.transform).not.toBe(flat)
    m.destroy()
  })

  test('touch: one finger does not move the map (the page scrolls) and shows the hint; two fingers pan and pinch', async () => {
    setBasemapSource(async () => SMALL_BYTES)
    const el = new FakeEl('div')
    const m = await mountMap(el as any, BASE)
    const box = el.children[0]!
    const flat = layerOf(el).style.transform
    const hint = el.find((e) => e.getAttribute('aria-hidden') === 'true' && e.text.length > 0)[0]!
    expect(hint.text).toBe(MAP_T.es.hint)
    expect(box.style.cssText).toContain('touch-action:pan-x pan-y')
    expect(hint.style.opacity).toBe('0')
    const T = (id: number, x: number, y: number) => ({ identifier: id, clientX: x, clientY: y })
    box.fire('touchstart', { touches: [T(1, 100, 100)] })
    box.fire('touchmove', { touches: [T(1, 100, 160)] })
    expect(layerOf(el).style.transform).toBe(flat)
    expect(hint.style.opacity).toBe('1')
    box.fire('touchend', { touches: [] })
    // two fingers: moving both pans, spreading them zooms (the browser cancels the first pointer when it starts to scroll: no matter)
    const x0 = dots(layerOf(el).html)[0]![0], g0 = gap(el)
    box.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch' })
    box.fire('pointercancel', { pointerId: 1, pointerType: 'touch' })
    box.fire('touchstart', { touches: [T(1, 100, 100), T(2, 200, 100)] })
    const mv = box.fire('touchmove', { touches: [T(1, 120, 100), T(2, 200, 100)] })
    expect(mv.prevented).toBe(true)
    expect(layerOf(el).style.transform).not.toBe(flat)
    box.fire('touchmove', { touches: [T(1, 120, 100), T(2, 320, 100)] })
    box.fire('touchend', { touches: [T(1, 120, 100)] })
    box.fire('touchend', { touches: [] })
    expect(dots(layerOf(el).html)[0]![0]).not.toBeCloseTo(x0, 0)
    expect(gap(el)).toBeGreaterThan(g0 * 1.3)
    // a one-finger move is not prevented (the page scrolls)
    box.fire('touchstart', { touches: [T(1, 100, 100)] })
    expect(box.fire('touchmove', { touches: [T(1, 100, 140)] }).prevented).toBeFalsy()
    box.fire('touchend', { touches: [] })
    // double tap with a finger goes back to the first view
    for (let i = 0; i < 2; i++) { box.fire('touchstart', { touches: [T(1, 50, 50)] }); box.fire('touchend', { touches: [] }) }
    expect(gap(el)).toBeCloseTo(g0, 0)
    m.destroy()
  })

  test('the late basemap re-clamps the view: a fitted frame keeps its place with the scale clamped; a moved one is clamped too', async () => {
    let give!: (b: Uint8Array) => void
    setBasemapSource(() => new Promise<Uint8Array | null>((r) => { give = r }))
    const wide: MapPoint[] = [{ ...bethel[0]!, id: 'a', lat: 31.5 }, { ...bethel[1]!, id: 'b', lat: 34.5 }] // 3 degrees apart: fits below the small basemap's minimum
    const el = new FakeEl('div')
    const m = await mountMap(el as any, { ...BASE, points: wide })
    const lo = minScale(SMALL.bbox, 320, 240)
    expect(gap(el, 3)).toBeLessThan(lo) // the default limits let it fit
    give(SMALL_BYTES)
    await m.ready
    expect(gap(el, 3)).toBeGreaterThanOrEqual(lo - 1)
    m.destroy()
    // a view the person had moved (zoomed out as far as it goes before the basemap came) is clamped as well
    let give2!: (b: Uint8Array) => void
    setBasemapSource(() => new Promise<Uint8Array | null>((r) => { give2 = r }))
    const el2 = new FakeEl('div')
    const m2 = await mountMap(el2 as any, { ...BASE, points: wide })
    const out = el2.find((e) => e.tagName === 'BUTTON' && e.getAttribute('aria-label') === MAP_T.es.zout)[0]!
    for (let i = 0; i < 20; i++) out.click()
    expect(gap(el2, 3)).toBeLessThan(lo)
    give2(SMALL_BYTES)
    await m2.ready
    expect(gap(el2, 3)).toBeGreaterThanOrEqual(lo - 1)
    m2.destroy()
  })

  test('the theme changing in the middle of a gesture commits it and draws again', async () => {
    setBasemapSource(async () => SMALL_BYTES)
    let fire: (() => void) | undefined
    ;(globalThis as any).matchMedia = () => ({ matches: false, addEventListener: (_: string, f: () => void) => { fire = f } })
    const el = new FakeEl('div')
    const m = await mountMap(el as any, BASE)
    const box = el.children[0]!
    box.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 })
    box.fire('pointermove', { pointerId: 1, clientX: 140, clientY: 100 })
    const before = sizes('map:redraw')
    fire!()
    expect(layerOf(el).style.transform).toBe('translate(-96px,-96px) scale(1)')
    expect(sizes('map:redraw')).toBe(before + 1)
    ;(globalThis as any).matchMedia = undefined
    m.destroy()
  })

  test('the buttons are named in the six languages, and destroy takes the handlers away', async () => {
    setBasemapSource(async () => SMALL_BYTES)
    const words = new Set<string>()
    for (const ui of ['en', 'es', 'fr', 'id', 'hi', 'ar', 'es-419']) {
      const el = new FakeEl('div')
      const m = await mountMap(el as any, { ...BASE, ui, dir: ui === 'ar' ? 'rtl' : 'ltr' })
      const labels = el.find((e) => e.tagName === 'BUTTON').map((b) => b.getAttribute('aria-label')!)
      expect(labels.length).toBe(3)
      await m.ready
      for (const l of labels) { expect(l.length).toBeGreaterThan(0); words.add(ui + l) }
      const sym = el.find((e) => e.tagName === 'BUTTON').slice(0, 2).map((b) => b.textContent)
      expect(sym).toEqual(['+', '−'])
      expect(el.find((e) => e.getAttribute('role') === 'group')[0]!.getAttribute('aria-label')).toBe(MAP_T[ui.split('-')[0] as 'es'].group)
      if (ui === 'ar') expect(layerOf(el).html).toContain('direction="rtl"')
      m.destroy()
    }
    for (const t of Object.values(MAP_T)) for (const v of Object.values(t)) expect(v.trim()).not.toBe('')
    expect(new Set(Object.values(MAP_T).map((t) => t.zin)).size).toBe(6)
    const el = new FakeEl('div')
    const m = await mountMap(el as any, BASE)
    const box = el.children[0]!
    m.destroy()
    expect([...box.handlers.values()].flat().length).toBe(0)
  })

  test('a name with <script> reaches the page escaped', async () => {
    setBasemapSource(async () => SMALL_BYTES)
    const el = new FakeEl('div')
    const m = await mountMap(el as any, { ...BASE, points: [{ ...bethel[0]!, label: '<b>&' }], summary: '"><img src=x>' })
    const html = layerOf(el).html
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;b&gt;&amp;')
    expect(html).not.toContain('<img')
    m.destroy()
  })
})

// ------------------------------------------------------------------------------------------------ the basemap lookup (packs.ts)

describe('basemapBytes', () => {
  const f = mapsFixture()
  const fx = f.dir
  const savedG = { fetch: globalThis.fetch, indexedDB: (globalThis as any).indexedDB }
  let fake: any
  /** what each place answers: the app's folder and a server; null = 404 */
  const serve = { app: null as Uint8Array | null, server: null as Uint8Array | null }
  const asked: string[] = []
  const ids = () => { const o: string[] = []; for (const d of readdirSync(join(fx, f.lang, 'seg'))) o.push(...readdirSync(join(fx, f.lang, 'seg', d))); return o }
  const stub = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    asked.push(url)
    const ok = (b: BodyInit) => new Response(b)
    const none = () => new Response(null, { status: 404 })
    if (url === './packs/index.json') return ok(JSON.stringify({ langs: [f.lang] }))
    const m = /^\.\/packs\/es-419\/(.+)$/.exec(url)
    if (m) {
      if (m[1] === 'ids.json') return ok(JSON.stringify(ids()))
      const p = join(fx, f.lang, m[1]!)
      return existsSync(p) ? ok(readFileSync(p)) : none()
    }
    if (url === `./packs/${'common/complements'}/${f.basemap.id}.basemap`) return serve.app ? ok(serve.app) : none()
    if (url === `http://packs.test/common/complements/${f.basemap.id}.basemap`) return serve.server ? ok(serve.server) : none()
    return none()
  }) as typeof fetch
  const phone = () => { ;(globalThis as any).indexedDB = new fake.IDBFactory(); resetAddedStore(); reloadPacks(); asked.length = 0 }
  const fetched = () => asked.filter((u) => u.includes('.basemap'))

  beforeAll(async () => {
    fake = await import(FAKE_IDB)
    globalThis.fetch = stub
    setTrustedKeys(f.trustedKeys)
    setPacksServers(['http://packs.test'])
  })
  afterAll(() => {
    globalThis.fetch = savedG.fetch
    ;(globalThis as any).indexedDB = savedG.indexedDB
    setTrustedKeys(); setPacksServers(); resetAddedStore()
  })

  test('the sample lists the basemap, and the file made for it is where Mini looks', () => {
    expect(f.hasBasemap).toBe(true)
    expect(f.basemap.path).toBe(`complements/${f.basemap.id}.basemap`)
  })
  test('found in the app folder: the bytes are the sample\'s, and they are kept in the phone\'s store (no network the second time)', async () => {
    phone(); serve.app = f.basemap.bytes; serve.server = null
    const got = await basemapBytes(f.lang)
    expect(got && [...got]).toEqual([...f.basemap.bytes])
    expect(fetched().length).toBe(1)
    expect([...(await (await basemapStore()).get(f.basemap.id))!]).toEqual([...f.basemap.bytes])
    serve.app = null
    asked.length = 0
    expect((await basemapBytes(f.lang))?.length).toBe(f.basemap.bytes.length)
    expect(fetched().length).toBe(0)
  })
  test('not in the app folder: the packs server, at the same relative path', async () => {
    phone(); serve.app = null; serve.server = f.basemap.bytes
    expect((await basemapBytes(f.lang))?.length).toBe(f.basemap.bytes.length)
    expect(fetched()).toEqual([`./packs/common/complements/${f.basemap.id}.basemap`, `http://packs.test/common/complements/${f.basemap.id}.basemap`])
  })
  test('nowhere: null, no error, and the network is not asked again for a while', async () => {
    phone(); serve.app = null; serve.server = null
    expect(await basemapBytes(f.lang)).toBeNull()
    const n = fetched().length
    expect(n).toBe(2)
    expect(await basemapBytes(f.lang)).toBeNull()
    expect(fetched().length).toBe(n)
    // a change of packs clears the wait
    reloadPacks()
    expect(await basemapBytes(f.lang)).toBeNull()
    expect(fetched().length).toBe(2 * n)
  })
  test('bytes whose sha256 is not the catalog\'s id are ignored (same length or not)', async () => {
    phone()
    const other = new Uint8Array(f.basemap.bytes); other[other.length - 1] ^= 1
    serve.app = other; serve.server = new Uint8Array(f.basemap.bytes.length + 3)
    expect(await basemapBytes(f.lang)).toBeNull()
    expect(await (await basemapStore()).get(f.basemap.id)).toBeUndefined()
    // the right bytes on the server are taken after the wrong ones in the app
    phone(); serve.server = f.basemap.bytes
    expect((await basemapBytes(f.lang))?.length).toBe(f.basemap.bytes.length)
  })
  test('the kept copy survives client.prune() (it is outside the client\'s store)', async () => {
    phone(); serve.app = f.basemap.bytes
    await basemapBytes(f.lang)
    await (await addedClient()).prune()
    serve.app = null; asked.length = 0
    expect((await basemapBytes(f.lang))?.length).toBe(f.basemap.bytes.length)
    expect(fetched().length).toBe(0)
  })
  test('the catalogs are read once per pack until the packs change, even when the basemap is missing', async () => {
    phone(); serve.app = null; serve.server = null
    const states = () => asked.filter((u) => u.endsWith('/state.json')).length
    await basemapBytes(f.lang); await basemapBytes(f.lang); await basemapBytes(f.lang)
    expect(states()).toBe(1)
    reloadPacks()
    await basemapBytes(f.lang)
    expect(states()).toBe(2)
  })
  test('a place that never answers is given up after its own short time, then the next one is tried', async () => {
    phone(); serve.app = null; serve.server = f.basemap.bytes
    const real = globalThis.fetch
    globalThis.fetch = ((u: any, i: any) => String(u).startsWith('./packs/common/') ? new Promise(() => {}) : (stub as any)(u, i)) as any
    setBasemapFetchMs(50)
    try {
      const t = Date.now()
      expect((await basemapBytes(f.lang))?.length).toBe(f.basemap.bytes.length)
      expect(Date.now() - t).toBeLessThan(2000)
    } finally { globalThis.fetch = real; setBasemapFetchMs() }
  })
  test('IndexedDB that fails (private mode) does not stop the other places or discard a good download', async () => {
    const bytes = f.basemap.bytes
    const ok = { get: async () => undefined, put: async () => {} } as any
    const cases: [string, () => Promise<any>][] = [
      ['the store cannot be opened', async () => { throw new Error('no idb') }],
      ['the store opens but get throws', async () => ({ ...ok, get: async () => { throw new Error('get') } })],
      ['the store opens but put throws', async () => ({ ...ok, put: async () => { throw new Error('put') } })],
    ]
    for (const [, make] of cases) {
      phone(); serve.app = null; serve.server = bytes
      setBasemapStore(make)
      try {
        expect((await basemapBytes(f.lang))?.length).toBe(bytes.length)
        serve.server = null; serve.app = bytes // another place, and the next time asks again: the copy was not kept
        reloadPacks()
        expect((await basemapBytes(f.lang))?.length).toBe(bytes.length)
      } finally { setBasemapStore() }
    }
    // and with no IndexedDB at all
    phone(); serve.app = bytes
    ;(globalThis as any).indexedDB = undefined
    resetAddedStore()
    expect((await basemapBytes(f.lang))?.length).toBe(bytes.length)
  })
  test('a language that is not installed, or an unknown one, gives null', async () => {
    phone(); serve.app = f.basemap.bytes
    expect(await basemapBytes('zz')).toBeNull()
  })
  test('the sample\'s basemap is the one decodeBasemap accepts and a map draws with it', async () => {
    phone(); serve.app = f.basemap.bytes
    setBasemapSource(basemapBytes)
    const el = new FakeEl('div')
    installDom()
    const m = await mountMap(el as any, { ...BASE, pack: f.lang })
    await m.ready
    expect(layerOf(el).html).toContain('map-land')
    m.destroy()
    setBasemapSource()
  })
})
