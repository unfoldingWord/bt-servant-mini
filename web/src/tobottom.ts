// The arrow that takes the reader back to the latest message (like the one in BT Servant full). The rules are plain functions of the
// scroll numbers so they can be tested; initToBottom wires them to the conversation (#log) and the box (#ask).

export interface Metrics { scrollTop: number; clientHeight: number; scrollHeight: number }

/** Within this many px of the end the reader counts as being at the bottom (fractional scroll positions, a bounce, a line more). */
export const AT_BOTTOM_PX = 48

export const distance = (m: Metrics): number => Math.max(0, m.scrollHeight - m.scrollTop - m.clientHeight)

export const atBottom = (m: Metrics): boolean => distance(m) <= AT_BOTTOM_PX

/** Shown only when the reader is more than one screen above the end. A hidden log has no height: never shown then. */
export const shouldShow = (m: Metrics): boolean => m.clientHeight > 0 && distance(m) > m.clientHeight

/** A node added to the log counts as a new answer unless it is the person's own message, the waiting line or the welcome card. */
export function isAnswerNode(className: string): boolean {
  const c = ` ${className} `
  return !c.includes(' me ') && !c.includes(' pending ') && !c.includes(' welcome ')
}

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
  const place = () => b.style.setProperty('--tb-bottom', `${Math.max(0, Math.round(window.innerHeight - form.getBoundingClientRect().top + 10))}px`)
  const draw = () => {
    const m = metrics()
    if (atBottom(m)) dot = false
    b.hidden = !shouldShow(m)
    dotEl.hidden = !dot
    if (!b.hidden) place()
  }
  let queued = 0
  const soon = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; draw() }) }
  const sense = () => { away = !atBottom(metrics()); soon() }
  log.addEventListener('scroll', sense, { passive: true })
  window.addEventListener('resize', sense)
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(soon).observe(form)
  new MutationObserver((list) => {
    let answers = 0
    let redraw = false
    let direct = false
    for (const r of list) {
      if (r.target === log) {
        direct = true
        r.addedNodes.forEach((n) => { if (n instanceof HTMLElement && isAnswerNode(n.className)) answers++ })
        r.removedNodes.forEach((n) => { if (n instanceof HTMLElement && !n.classList.contains('pending')) redraw = true })
      }
    }
    if (direct) dot = nextDot(dot, { away, answers, redraw, bottom: false })
    else away = !atBottom(metrics()) // a part turned in an answer (◀ ▶) or a fold opened: the height changed in place
    soon()
  }).observe(log, { childList: true, subtree: true })
  b.addEventListener('click', () => {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    log.scrollTo({ top: log.scrollHeight, behavior: scrollBehavior(reduce) })
  })
  return { setLang: (l) => { b.setAttribute('aria-label', toBottomLabel(l)); b.title = toBottomLabel(l) } }
}
