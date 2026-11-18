// The arrow that takes the reader back to the latest message (like the one in BT Servant full). The rules are plain functions of the
// scroll numbers so they can be tested; initToBottom wires them to the conversation (#log) and the box (#ask).

export interface Metrics { scrollTop: number; clientHeight: number; scrollHeight: number }

/** Within this many px of the end the reader counts as being at the bottom (fractional scroll positions, a bounce, a line more). */
export const AT_BOTTOM_PX = 48

export const distance = (m: Metrics): number => Math.max(0, m.scrollHeight - m.scrollTop - m.clientHeight)

export const atBottom = (m: Metrics): boolean => distance(m) <= AT_BOTTOM_PX

/** Shown only when the reader is more than one screen above the end. A hidden log has no height: never shown then. */
export const shouldShow = (m: Metrics): boolean => m.clientHeight > 0 && distance(m) > m.clientHeight

/** A node added to the log counts as a new answer only if it is a real bot message: not the person's own, the waiting line, a mark, quick rows, notes or the welcome card. */
export function isAnswerNode(className: string): boolean {
  const c = ` ${className} `
  return c.includes(' msg ') && c.includes(' bot ') && !c.includes(' pending ')
}

/** What covers the whole screen (cards, the PIN lock): the arrow is not shown over them. */
export const OVERLAYS = '#about, #safety, #report, #howto, #welcome, #lock, #explore.open, #gmap.open, #saved.open, #s5out.open'
/** Sets `data-tb-off` on `body` while an overlay is open (CSS hides the arrow by it; no :has() needed). True when one is open. */
export function syncOverlay(body: { querySelector(q: string): unknown; hasAttribute(n: string): boolean; setAttribute(n: string, v: string): void; removeAttribute(n: string): void }): boolean {
  const open = !!body.querySelector(OVERLAYS)
  if (open !== body.hasAttribute('data-tb-off')) {
    if (open) body.setAttribute('data-tb-off', '')
    else body.removeAttribute('data-tb-off')
  }
  return open
}

/** The frame reads the layout only when the log, the box or the window changed, or an overlay opened or closed; a body change that is neither costs nothing. */
export const needsRead = (s: { logDirty: boolean; overlayWas: boolean; overlayNow: boolean }): boolean => s.logDirty || s.overlayWas !== s.overlayNow

/** The arrow's `bottom` in px: just above the box, but never lower than the visible area (a keyboard over the page shrinks it). */
export const arrowBottom = (inner: number, formTop: number, vvEdge?: number): number =>
  Math.max(0, Math.round(inner - Math.min(formTop, vvEdge ?? inner) + 10))

/**
 * The dot on the arrow: lit when an answer arrives while the reader is up in the conversation, put out at the bottom. A batch that
 * also removes a real message is a redraw (another chat opened), not an arrival.
 */
export function nextDot(dot: boolean, s: { away: boolean; answers: number; redraw: boolean; bottom: boolean }): boolean {
  if (s.bottom || s.redraw) return s.bottom ? false : dot
  return dot || (s.away && s.answers > 0)
}

export const scrollBehavior = (reduce: boolean): ScrollBehavior => (reduce ? 'auto' : 'smooth')

const LABEL: Record<string, string> = {
  en: 'Scroll to the latest',
  es: 'Ir al final',
  fr: 'Aller au dernier message',
  id: 'Ke pesan terbaru',
  hi: 'नवीनतम संदेश पर जाएँ',
  ar: 'الانتقال إلى الأسفل',
}
export const toBottomLabel = (lang: string): string => LABEL[lang] ?? LABEL.en!

const ARROW = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>'

export function initToBottom(log: HTMLElement, form: HTMLElement): { setLang(l: string): void } {
  const b = document.createElement('button')
  b.id = 'tobottom'
  b.type = 'button'
  b.hidden = true
  b.innerHTML = `${ARROW}<i class="tb-dot" aria-hidden="true" hidden></i>`
  document.body.appendChild(b)
  const dotEl = b.querySelector('.tb-dot') as HTMLElement
  let dot = false
  let away = false // the state before the latest change, so an answer that just made the log taller still counts as arriving at the bottom
  const metrics = (): Metrics => ({ scrollTop: log.scrollTop, clientHeight: log.clientHeight, scrollHeight: log.scrollHeight })
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  const place = () => b.style.setProperty('--tb-bottom', `${arrowBottom(window.innerHeight, form.getBoundingClientRect().top, vv ? vv.offsetTop + vv.height : undefined)}px`)
  // what changed in the log since the last draw: only noted by the observer, read in the frame (no layout read per mutation batch)
  let answers = 0
  let redraw = false
  let direct = false
  let logDirty = true // the log, the box or the window changed since the last read
  let overlayWas = false
  const draw = () => {
    const hidden = syncOverlay(document.body)
    if (!needsRead({ logDirty, overlayWas, overlayNow: hidden })) return
    logDirty = false
    overlayWas = hidden
    const m = metrics()
    if (direct) dot = nextDot(dot, { away, answers, redraw, bottom: false })
    answers = 0; redraw = false; direct = false
    if (atBottom(m)) dot = false
    away = !atBottom(m)
    b.hidden = hidden || !shouldShow(m)
    dotEl.hidden = !dot
    if (!b.hidden) place()
  }
  let queued = 0
  const later = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; draw() }) } // (a body change: draws, but reads the layout only if an overlay changed)
  const soon = () => { logDirty = true; if (!queued) queued = requestAnimationFrame(() => { queued = 0; draw() }) }
  log.addEventListener('scroll', soon, { passive: true })
  window.addEventListener('resize', soon)
  vv?.addEventListener('resize', soon)
  vv?.addEventListener('scroll', soon)
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(soon).observe(form)
  new MutationObserver((list) => {
    for (const r of list) {
      // a class or `hidden` change inside the log (a fold opened, a card grown) only changes the heights: soon() reads them
      if (r.type === 'attributes' || r.target !== log) continue
      direct = true
      r.addedNodes.forEach((n) => { if (n instanceof HTMLElement && isAnswerNode(n.className)) answers++ })
      r.removedNodes.forEach((n) => { if (n instanceof HTMLElement && !n.classList.contains('pending')) redraw = true })
    }
    soon()
  }).observe(log, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'] })
  // overlays opening or closing: a card added to or taken off the body (its direct children only: not every redraw inside the page), or
  // the `open` class of the ones that stay (Browse, the map, saved items, the outline)
  const watchClass = new MutationObserver(later)
  const watchOpen = () => document.querySelectorAll('#explore, #gmap, #saved, #s5out').forEach((n) => watchClass.observe(n, { attributes: true, attributeFilter: ['class'] }))
  new MutationObserver(() => { watchOpen(); later() }).observe(document.body, { childList: true })
  watchOpen()
  b.addEventListener('click', () => {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    log.scrollTo({ top: log.scrollHeight, behavior: scrollBehavior(reduce) })
  })
  return { setLang: (l) => { b.setAttribute('aria-label', toBottomLabel(l)); b.title = toBottomLabel(l) } }
}
