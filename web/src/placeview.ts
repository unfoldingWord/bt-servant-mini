// A place answer's map and its list (diseno-mapas.md 5.6), as the bubble shows them. The map is drawn when it comes into view (a
// conversation with many maps does not draw them all at once); the list is the whole alternative to it: every place with how sure it is,
// references in <bdi> (in Arabic, "13:1-14:2" must not be reordered). All text goes in as text, never as markup.
import { mountMap, type MapOpts } from './mapview'
import type { MapBlock, PlaceList } from './pipeline'

type Mount = (el: HTMLElement, o: MapOpts) => Promise<{ redraw(): void; destroy(): void }>

/** The maps on the screen: drawn again when the window changes size, let go of when their answer is gone. */
const live = new Set<{ host: HTMLElement; destroy(): void; redraw(): void }>()
if (typeof addEventListener === 'function') {
  addEventListener('resize', () => { for (const a of live) { if (a.host.isConnected) a.redraw(); else { a.destroy(); live.delete(a) } } })
}

function make(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** `ui`: the language of the answer (its direction). `mount`: the map's drawing (tests give their own). */
export function placeBlock(m: { map?: MapBlock; list?: PlaceList }, ui: string, mount: Mount = mountMap): HTMLElement {
  const dir = /^ar(-|$)/i.test(ui) ? 'rtl' : 'ltr'
  const wrap = make('div', 'place-block')
  wrap.dir = dir
  const map = m.map
  if (map) {
    const host = make('div', 'place-map')
    wrap.appendChild(host)
    const opts: MapOpts = { pack: map.pack, points: map.points, summary: map.summary, ui, dir, ...(map.small ? { height: 180 } : {}) }
    const go = () => {
      for (const a of live) if (!a.host.isConnected) { a.destroy(); live.delete(a) }
      void mount(host, opts).then((api) => { live.add({ host, ...api }) }).catch((e) => { console.warn('map: kept as its list', e) })
    }
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go() } })
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
