// A place answer's map and its list (diseno-mapas.md 5.6), as the bubble shows them. The map is drawn when it comes into view (a
// conversation with many maps does not draw them all at once); the list is the whole alternative to it: every place with how sure it is,
// references in <bdi> (in Arabic, "13:1-14:2" must not be reordered). All text goes in as text, never as markup.
import { mountMap, MAP_MAX_H, MAP_MIN_H, MAP_RATIO, type MapOpts } from './mapview'
import { splitNumbers } from './bidi'
import type { MapBlock, PlaceList } from './pipeline'

type Mount = (el: HTMLElement, o: MapOpts) => Promise<{ redraw(): void; destroy(): void }>
type Live = { host: HTMLElement; destroy(): void; redraw(): void }

/** The maps on the screen, and the observers still waiting for their host to come into view. */
const live = new Set<Live>()
const waiting = new Set<{ host: HTMLElement; io: IntersectionObserver }>()
let listening = false

/** Lets go of the maps whose answer is gone and of the observers of hosts that left before they were seen. One that throws does not stop the others. */
export function sweepMaps(): void {
  for (const a of [...live]) {
    if (a.host.isConnected) continue
    live.delete(a)
    try { a.destroy() } catch (e) { console.warn('map: destroy failed', e) }
  }
  for (const w of [...waiting]) {
    if (w.host.isConnected) continue
    waiting.delete(w)
    try { w.io.disconnect() } catch { /* already gone */ }
  }
}
/** The window changed size: every map on the screen is drawn again, the others let go of. */
export function resizeMaps(): void {
  sweepMaps()
  for (const a of [...live]) {
    try { a.redraw() } catch (e) { console.warn('map: redraw failed', e) }
  }
}
const listen = () => {
  if (listening || typeof globalThis.addEventListener !== 'function') return
  globalThis.addEventListener('resize', resizeMaps)
  listening = true
}

function make(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/**
 * The box the host keeps while it waits: an empty host would have none, and nothing that has no height is ever seen come into view. It is the
 * height mapview.ts will give the map (`mapHeight`): a small map is 180 px; the others take 3/4 of the width, between 200 and 360 px. The
 * width is not known before the host is on the page, so the box is a ratio the browser resolves (CSS aspect-ratio with min and max height).
 */
const reserved = (small?: boolean): Record<string, string> =>
  small ? { minHeight: '180px' } : { minHeight: `${MAP_MIN_H}px`, maxHeight: `${MAP_MAX_H}px`, aspectRatio: `1 / ${MAP_RATIO}` }
const release = (host: HTMLElement) => { host.style.minHeight = ''; host.style.maxHeight = ''; host.style.aspectRatio = '' }

/** A reference: <bdi> with each number (a verse, a range, a frame) in a left-to-right <bdi dir="ltr"> of its own, so "12:1-13:3" after an Arabic book name never splits. */
export function refNode(ref: string): HTMLElement {
  const bdi = make('bdi', 'place-ref')
  for (const p of splitNumbers(ref)) {
    if (!p.num) { bdi.appendChild(document.createTextNode(p.text)); continue }
    const n = make('bdi', 'place-num', p.text)
    n.dir = 'ltr'
    n.style.whiteSpace = 'nowrap' // a range never breaks at its hyphen
    bdi.appendChild(n)
  }
  return bdi
}

/** `ui`: the language of the answer (its direction). `mount`: the map's drawing (tests give their own). */
export function placeBlock(m: { map?: MapBlock; list?: PlaceList }, ui: string, mount: Mount = mountMap): HTMLElement {
  const dir = /^ar(-|$)/i.test(ui) ? 'rtl' : 'ltr'
  const wrap = make('div', 'place-block')
  wrap.dir = dir
  const map = m.map
  if (map) {
    listen()
    const host = make('div', 'place-map')
    Object.assign(host.style, reserved(map.small))
    wrap.appendChild(host)
    const opts: MapOpts = { pack: map.pack, points: map.points, summary: map.summary, ui, dir, ...(map.small ? { height: 180 } : {}) }
    const go = () => {
      sweepMaps()
      mount(host, opts).then((api) => { release(host); live.add({ host, ...api }) })
        // (a map that cannot be drawn is hidden: the list stays, the whole alternative)
        .catch((e) => { host.className = 'place-map failed'; release(host); console.warn('map: kept as its list', e) })
    }
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver((es) => {
        if (!es.some((e) => e.isIntersecting)) return
        io.disconnect()
        for (const w of waiting) if (w.io === io) waiting.delete(w)
        go()
      })
      waiting.add({ host, io })
      io.observe(host)
    } else setTimeout(go, 0)
  }
  const list = m.list
  if (list && list.items.length) {
    if (list.head) wrap.appendChild(make('p', 'place-head', list.head))
    const ul = make('ul', 'place-list')
    for (const it of list.items) {
      const li = document.createElement('li')
      if (it.text) li.appendChild(make('bdi', 'place-name', it.text))
      if (it.note) li.appendChild(document.createTextNode(` (${it.note})`))
      if (it.tag) li.appendChild(make('span', 'place-tag', ` · ${it.tag}`))
      if (it.ref) { if (it.text) li.appendChild(document.createTextNode(' — ')); li.appendChild(refNode(it.ref)) }
      ul.appendChild(li)
    }
    wrap.appendChild(ul)
  }
  return wrap
}
