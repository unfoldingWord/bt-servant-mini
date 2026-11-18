// What the conversation (#log) shows while its height changes and when a question is sent. On the phone the keyboard changes the
// page's height (MainActivity pads the WebView by the keyboard), and the browser keeps `scrollTop`: opening the keyboard hid the
// last 300 px of the conversation under it, and on send the view was left far up while the keyboard closed under a smooth scroll
// (Abel, Nov 18). The rules are plain functions of the scroll numbers so they can be tested; initKeepView wires them to #log.

/** The log's height changed from `oldH` to `newH`: the scroll position that keeps the bottom of what is seen where it was. */
export const keptTop = (top: number, oldH: number, newH: number): number => Math.max(0, top + oldH - newH)

/** The scroll position that puts `el`'s top `gap` px under the log's top (the browser clamps it at the end of the log). */
export const topOf = (top: number, elTop: number, logTop: number, gap = 8): number => Math.max(0, top + elTop - logTop - gap)

/** After a send the target is kept this long: the keyboard closes and the page grows in this time. */
export const FOLLOW_MS = 1200

export interface Scroller { scrollTop: number; readonly clientHeight: number }

/**
 * The log's scroll, kept across height changes. `follow(target)` scrolls to `target()` now and again after every height change
 * for `ms` (the question just sent stays in view while the keyboard closes); otherwise a height change keeps the bottom.
 */
export class KeepView {
  private h: number
  private until = 0
  private target: (() => number) | null = null
  constructor(private log: Scroller, private now: () => number = () => Date.now()) {
    this.h = log.clientHeight
  }
  follow(target: () => number, ms = FOLLOW_MS) {
    this.target = target
    this.until = this.now() + ms
    this.log.scrollTop = target()
  }
  /** The reader scrolled by hand (a touch, the wheel): the target is let go. */
  release() { this.target = null }
  /** The log's height may have changed (ResizeObserver). */
  resized() {
    const h = this.log.clientHeight
    const was = this.h
    this.h = h
    if (h === was) return
    if (this.target && this.now() < this.until) { this.log.scrollTop = this.target(); return }
    this.target = null
    // a hidden log (a card over it) has no height: nothing to keep
    if (!was || !h) return
    this.log.scrollTop = keptTop(this.log.scrollTop, was, h)
  }
}

export function initKeepView(log: HTMLElement): KeepView {
  const k = new KeepView(log)
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => k.resized()).observe(log)
  else addEventListener('resize', () => k.resized())
  for (const ev of ['touchstart', 'wheel'] as const) log.addEventListener(ev, () => k.release(), { passive: true })
  return k
}

/** To the end of the log. */
export const toEnd = (log: HTMLElement) => () => log.scrollHeight
/** The question just sent at the top, its answer under it (both seen; a short answer leaves the log at its end). */
export const toQuestion = (log: HTMLElement, q: HTMLElement) => () =>
  q.isConnected ? topOf(log.scrollTop, q.getBoundingClientRect().top, log.getBoundingClientRect().top) : log.scrollTop
