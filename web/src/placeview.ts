// A place answer's map and its list (diseno-mapas.md 5.6), as the bubble shows them. The map is drawn when it comes into view (a
// conversation with many maps does not draw them all at once); the list is the whole alternative to it: every place with how sure it is,
// references in <bdi> (in Arabic, "13:1-14:2" must not be reordered). All text goes in as text, never as markup.
import { mountMap, type MapOpts } from './mapview'
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

/** The height the host keeps while it waits: an empty host would have none, and nothing that has no height is ever seen come into view. */
const reserved = (small?: boolean) => (small ? 180 : 240)

/** `ui`: the language of the answer (its direction). `mount`: the map's drawing (tests give their own). */
export function placeBlock(m: { map?: MapBlock; list?: PlaceList }, ui: string, mount: Mount = mountMap): HTMLElement {
  const dir = /^ar(-|$)/i.test(ui) ? 'rtl' : 'ltr'
  const wrap = make('div', 'place-block')
  wrap.dir = dir
  const map = m.map
  if (map) {
    listen()
    const host = make('div', 'place-map')
    host.style.minHeight = `${reserved(map.small)}px`
    wrap.appendChild(host)
    const opts: MapOpts = { pack: map.pack, points: map.points, summary: map.summary, ui, dir, ...(map.small ? { height: 180 } : {}) }
    const go = () => {
      sweepMaps()
      mount(host, opts).then((api) => { host.style.minHeight = ''; live.add({ host, ...api }) })
        // (a map that cannot be drawn is hidden: the list stays, the whole alternative)
        .catch((e) => { host.className = 'place-map failed'; host.style.minHeight = ''; console.warn('map: kept as its list', e) })
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
      if (it.ref) { if (it.text) li.appendChild(document.createTextNode(' — ')); li.appendChild(make('bdi', 'place-ref', it.ref)) }
      ul.appendChild(li)
    }
    wrap.appendChild(ul)
  }
  return wrap
}
