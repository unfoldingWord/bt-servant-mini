// The conversation Map's lanes, drawn (graph.ts mapRows decides where each row sits and is tested there; this is only the drawing).
// Each row has a gutter of one 18px column per lane; one SVG behind the rows draws the lanes from the rows' real positions, after
// layout, and again when the list changes size (a fold opened, the window turned, a font arrived). The current path is the
// accent colour, thick, with filled dots; the rest is the rail colour with hollow dots. In right-to-left text the gutter and the
// x positions are on the right. Colours are CSS variables (index.html .gm-*), so light and dark need nothing here.
import { dirOf } from './bidi'
import { type GraphWords, laneCount, laneWidth, type MapRow, stepKind } from './graph'

/** The room around the lanes (half each side); a lane's column is 18px, narrower with many lanes (graph.ts laneWidth). */
export const GUTTER_PAD = 14
const NS = 'http://www.w3.org/2000/svg'

export type LanesOpts = {
  t: GraphWords
  rtl: boolean
  /** a tap on a point: go back there */
  onGo: (id: string) => void
  /** a tap on "… N more": open that chain */
  onOpen: (key: string) => void
}

const h = (tag: string, cls: string, text?: string): HTMLElement => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** "comes from «X»": the name in its own direction, so a name in another script does not scramble the sentence. */
function fromText(tpl: string, name: string): DocumentFragment {
  const f = document.createDocumentFragment()
  const [a = '', b = ''] = tpl.split('{x}')
  const bdi = h('bdi', '', name)
  bdi.dir = dirOf(name)
  f.append(a, bdi, b)
  return f
}

/** The list of rows with the lanes behind them; `here`: the row of the current point. */
export function lanesList(rows: readonly MapRow[], o: LanesOpts): { list: HTMLElement; here: HTMLElement | null } {
  const { t } = o
  const lanes = laneCount(rows)
  const guts: HTMLElement[] = []
  const list = h('div', 'ex-rows gm-rows')
  list.dir = o.rtl ? 'rtl' : 'ltr'
  let here: HTMLElement | null = null
  const els: HTMLElement[] = []
  const flash = (ix: number) => {
    const to = els[ix]
    if (!to) return
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    to.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' })
    to.classList.remove('gm-flash')
    void to.offsetWidth
    to.classList.add('gm-flash')
    setTimeout(() => to.classList.remove('gm-flash'), 1300)
  }
  for (const r of rows) {
    const row = h('div', r.k === 'node' && r.cur ? 'gm-n on' : 'gm-n')
    if (r.k === 'node') row.dataset.id = r.node.id
    const gut = h('span', 'gm-gut')
    gut.style.width = `${GUTTER_PAD + lanes * laneWidth(Infinity, lanes)}px` // (set again once the list's width is known)
    guts.push(gut)
    gut.setAttribute('aria-hidden', 'true')
    row.appendChild(gut)
    const txt = h('span', 'gm-txt')
    if (r.k === 'group') {
      // a 5M session: its name over its steps (the steps are the points to go back to)
      row.classList.add('gm-group')
      const name = h('span', 'ex-row-t', r.label)
      name.dir = 'ltr'
      txt.appendChild(name)
    } else if (r.k === 'more') {
      row.classList.add('gm-more')
      const b = h('button', 'ex-row-t gm-go', t.more.replace('{n}', String(r.n))) as HTMLButtonElement
      b.type = 'button'
      txt.appendChild(b)
      row.onclick = () => o.onOpen(r.key)
    } else {
      const name = h('button', 'ex-row-t gm-go') as HTMLButtonElement
      name.type = 'button'
      const label = h('span', 'gm-name', r.node.label)
      label.dir = dirOf(r.node.label) // what the person asked, or a button's label: its own direction
      name.appendChild(label)
      if (r.forks >= 2) name.appendChild(h('span', 'gm-fork', t.forks.replace('{n}', String(r.forks))))
      txt.appendChild(name)
      const sub = h('span', 'ex-row-s')
      const kind = t.kinds[stepKind(r.node)]
      sub.append(r.cur ? `${t.here} · ${kind}` : kind)
      const par = r.from === null ? null : rows[r.from]
      if (par?.k === 'node') {
        // the origin of a branch far above: its own small button (the row itself goes to the point)
        const from = h('button', 'gm-from') as HTMLButtonElement
        from.type = 'button'
        from.appendChild(fromText(t.from, par.node.label))
        const ix = par.ix
        from.onclick = (e) => {
          e.stopPropagation()
          flash(ix)
        }
        sub.append(' · ', from)
      }
      txt.appendChild(sub)
      if (r.cur) {
        name.setAttribute('aria-current', 'true')
        here = row
      }
      const id = r.node.id
      row.onclick = (e) => {
        if (!(e.target as Element).closest('.gm-from')) o.onGo(id)
      }
    }
    row.appendChild(txt)
    list.appendChild(row)
    els.push(row)
  }

  // the lanes: one SVG behind the rows, from where the rows really are
  let svg: SVGSVGElement | null = null
  const draw = () => {
    const W = list.clientWidth
    if (!W) return
    // the gutter first (a narrower lane column when many lanes would take over 40% of the width), then the rows' real positions;
    // always redrawn: it is cheap, and it settles after one more pass (the observer fires only when the size changes)
    const lw = laneWidth(W, lanes)
    for (const g of guts) g.style.width = `${GUTTER_PAD + lanes * lw}px`
    const H = list.scrollHeight
    svg?.remove()
    const s = document.createElementNS(NS, 'svg')
    s.setAttribute('class', 'gm-svg')
    s.setAttribute('aria-hidden', 'true')
    s.setAttribute('width', String(W))
    s.setAttribute('height', String(H))
    const y = (ix: number) => els[ix]!.offsetTop + els[ix]!.offsetHeight / 2
    const x = (lane: number) => {
      const v = GUTTER_PAD / 2 + lw / 2 + lane * lw
      return o.rtl ? W - v : v
    }
    const add = (tag: string, a: Record<string, string | number>) => {
      const e = document.createElementNS(NS, tag)
      for (const k in a) e.setAttribute(k, String(a[k]))
      s.appendChild(e)
    }
    for (const r of rows) {
      if (r.p === null) continue
      const q = rows[r.p]!
      const x1 = x(q.lane), y1 = y(r.p), x2 = x(r.lane), y2 = y(r.ix)
      const k = Math.min(30, y2 - y1)
      const d = x1 === x2 ? `M${x1} ${y1}L${x2} ${y2}` : `M${x1} ${y1}C${x1} ${y1 + k * 0.73} ${x2} ${y1 + k * 0.27} ${x2} ${y1 + k}L${x2} ${y2}`
      add('path', { d, class: `gm-e${r.hot && q.hot ? ' hot' : ''}${r.k === 'more' || q.k === 'more' ? ' cut' : ''}` })
    }
    for (const r of rows) {
      if (r.k === 'node') add('circle', { cx: x(r.lane), cy: y(r.ix), r: r.cur ? 6.5 : 4.5, class: `gm-d${r.hot ? ' hot' : ''}${r.cur ? ' cur' : ''}` })
    }
    list.prepend(s)
    svg = s
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(draw).observe(list)
  else requestAnimationFrame(draw)
  return { list, here }
}
