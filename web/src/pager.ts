// A long answer in parts (Abel, Nov 17: a whole chapter or a whole story made one bubble so long that scrolling up the
// conversation was hard). Only how the bubble is drawn: the message's text and data are never touched, so sharing, saving,
// online AI and the 5M session still get the whole answer. The units are never cut: a verse (in every version at once), an
// OBS frame (with its picture, ms/obsimg), or a block of any other answer (a heading kept with what follows it).
// One part at a time, with ◀ ▶ and "Verses 4–6 of 22" under it (Abel chose this over "Show more", Nov 17).
// The parts are as tall as the screen lets them be, measured (Abel, Nov 17: cut by counts, four frames with their pictures
// made a part two to ten screens tall, and ▶ jumped back to the bubble's top): an answer that fits on the screen has no
// parts; a part holds the units that fit in the conversation's height with the bar, at least one. Measured again when the
// bubble changes size (a fold opened, a picture loaded, the phone turned), the part being read kept where it is.
import { rtlLang } from './bidi'

type L = 'en' | 'es' | 'fr' | 'id' | 'hi' | 'ar'
type Words = {
  verses: string; frames: string; verse: string; frame: string; parts: string; prev: string; next: string
}
const W: Record<L, Words> = {
  en: { verses: 'Verses {a}–{b} of {n}', frames: 'Frames {a}–{b} of {n}', verse: 'Verse {a} of {n}', frame: 'Frame {a} of {n}', parts: 'Part {a} of {n}', prev: 'Previous part', next: 'Next part' },
  es: { verses: 'Versículos {a}–{b} de {n}', frames: 'Cuadros {a}–{b} de {n}', verse: 'Versículo {a} de {n}', frame: 'Cuadro {a} de {n}', parts: 'Parte {a} de {n}', prev: 'Parte anterior', next: 'Parte siguiente' },
  fr: { verses: 'Versets {a}–{b} sur {n}', frames: 'Images {a}–{b} sur {n}', verse: 'Verset {a} sur {n}', frame: 'Image {a} sur {n}', parts: 'Partie {a} sur {n}', prev: 'Partie précédente', next: 'Partie suivante' },
  id: { verses: 'Ayat {a}–{b} dari {n}', frames: 'Bingkai {a}–{b} dari {n}', verse: 'Ayat {a} dari {n}', frame: 'Bingkai {a} dari {n}', parts: 'Bagian {a} dari {n}', prev: 'Bagian sebelumnya', next: 'Bagian berikutnya' },
  hi: { verses: 'पद {a}–{b} (कुल {n})', frames: 'फ़्रेम {a}–{b} (कुल {n})', verse: 'पद {a} (कुल {n})', frame: 'फ़्रेम {a} (कुल {n})', parts: 'भाग {a} (कुल {n})', prev: 'पिछला भाग', next: 'अगला भाग' },
  ar: { verses: 'الآيات {a}–{b} من {n}', frames: 'الإطارات {a}–{b} من {n}', verse: 'الآية {a} من {n}', frame: 'الإطار {a} من {n}', parts: 'الجزء {a} من {n}', prev: 'الجزء السابق', next: 'الجزء التالي' },
}
const UIS: L[] = ['en', 'es', 'fr', 'id', 'hi', 'ar']
export const PW = (ui: string): Words => W[(UIS as string[]).includes(ui.split('-')[0]!) ? (ui.split('-')[0] as L) : 'en']
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))

/** Shorter than this (characters, the folds' too) and without a picture, an answer is never taller than a screen: not measured. */
const SHORT = 600
/** The bar's height with its margins (index.html .pager: 44 px buttons, 6 + 12 px), and some room around a part. */
const BAR = 62
const ROOM = 24

export type Kind = 'verses' | 'frames' | 'parts'
export type Unit = { els: HTMLElement[]; label: string }
const len = (e: Element) => (e.textContent ?? '').replace(/\s+/g, ' ').length

/**
 * The folds of a story's frame or a chapter's verse ("Notes for OBS 1:3 (6)", "1:3 · 4") go with its part: they show with it.
 * `key(ch, v)` says which unit a fold's "ch:v" belongs to.
 */
function foldsWith(box: HTMLElement, key: (ch: number, v: number) => Unit | undefined) {
  for (const d of box.querySelectorAll<HTMLElement>('details')) {
    if (d.closest('.tx') || d.classList.contains('more-tx')) continue
    const m = /(\d+):(\d+)/.exec(d.querySelector(':scope > summary')?.textContent ?? '')
    const u = m ? key(+m[1]!, +m[2]!) : undefined
    if (u && !u.els.includes(d)) u.els.push(d)
  }
}

/** The units of a bubble's answer, and where the bar goes (after `last`): OBS frames first, then a passage's verses, else blocks. */
function unitsOf(box: HTMLElement): { kind: Kind; units: Unit[]; last: Element } | null {
  // an OBS story's frames: each paragraph that starts with its "**1:3**" (obsAnswer), the words tappable or not (m.obs gone)
  const story = (p: HTMLElement) => (p.firstChild === p.firstElementChild && p.firstElementChild?.tagName === 'STRONG' ? /^(\d{1,2}):\d{1,2}$/.exec(p.firstElementChild.textContent?.trim() ?? '')?.[1] : undefined)
  const all = [...box.querySelectorAll<HTMLElement>('p')].filter((p) => story(p))
  const frames = all.filter((p) => story(p) === story(all[0]!))
  // one frame (its picture, its text, its helps folded) is never cut
  if (frames.length === 1) return null
  if (frames.length > 1) {
    const out: { kind: Kind; units: Unit[]; last: Element } = {
      kind: 'frames', last: frames[frames.length - 1]!,
      units: frames.map((p) => {
        const pic = p.previousElementSibling?.matches('figure.obs-pic') ? (p.previousElementSibling as HTMLElement) : null
        const label = /:(\d+)/.exec(p.firstElementChild?.textContent ?? '')?.[1] ?? ''
        return { els: pic ? [pic, p] : [p], label }
      }),
    }
    const n = /^(\d+):/.exec(frames[0]!.firstElementChild?.textContent ?? '')?.[1]
    foldsWith(box, (ch, v) => (String(ch) === n ? out.units.find((u) => +u.label === v) : undefined))
    return out
  }
  const study = box.classList.contains('study') ? box : box.querySelector<HTMLElement>('.study')
  if (study) {
    // the same verse in every version is one unit: its label and how many times that label came before (a range over chapters)
    const byKey = new Map<string, Unit>()
    let last: Element | null = null
    for (const p of study.querySelectorAll<HTMLElement>('p.vv')) {
      const seen = new Map<string, number>()
      for (const v of p.querySelectorAll<HTMLElement>(':scope > span.vs')) {
        const label = v.dataset.v ?? ''
        const k = (seen.get(label) ?? 0) + 1
        seen.set(label, k)
        const key = `${label}#${k}`
        const u = byKey.get(key)
        if (u) u.els.push(v)
        else byKey.set(key, { els: [v], label })
      }
      last = p.closest('details.more-tx') ?? p.closest('.tx') ?? p
    }
    // in verse order (a version that bridges "1-2" where the first has "1" and "2" falls in place, not at the end)
    const units = [...byKey.entries()]
      .sort(([a, x], [b, y]) => +a.split('#')[1]! - +b.split('#')[1]! || +first(x.label) - +first(y.label))
      .map(([, u]) => u)
    if (units.length < 2 || !last) return null
    // a verse's notes fold ("1:3 · 4") with the first unit whose label holds that verse (one chapter: the usual long answer)
    foldsWith(study, (_ch, v) => units.find((u) => +first(u.label) <= v && v <= +lastOf(u.label)))
    return { kind: 'verses', units, last }
  }
  const kids = [...box.children] as HTMLElement[]
  const units: Unit[] = []
  // a long list is cut between its items (13 questions of a chapter); a short one stays a block
  const blocks = kids.flatMap((e) => (/^(UL|OL)$/.test(e.tagName) && len(e) > SHORT ? ([...e.children] as HTMLElement[]) : [e]))
  for (const e of blocks) {
    const prev = units[units.length - 1]
    // a heading goes with what follows it
    if (prev && /^H[1-6]$/.test(prev.els[prev.els.length - 1]!.tagName)) { prev.els.push(e); continue }
    units.push({ els: [e], label: '' })
  }
  return units.length > 1 ? { kind: 'parts', units, last: kids[kids.length - 1]! } : null
}


/**
 * The parts by measured height (`h`: each unit's, in px): from the start, as many units as fit in `room`, at least one, a unit
 * never cut. `from`: a part starts there (the unit the reader is at, measured again); `keep`: that part holds at least up to
 * this unit (a fold opened in it makes it taller, it does not lose its last units). Indexes of the units, part by part.
 */
export function pagesOf(h: number[], room: number, from = 0, keep = -1): number[][] {
  const cut = (a: number, b: number, upTo: number) => {
    const out: number[][] = []
    let cur: number[] = []
    let size = 0
    for (let i = a; i < b; i++) {
      if (cur.length && size + h[i]! > room && i > upTo) { out.push(cur); cur = []; size = 0 }
      cur.push(i)
      size += h[i]!
    }
    if (cur.length) out.push(cur)
    return out
  }
  return [...cut(0, from, -1), ...cut(from, h.length, keep)]
}
const first = (l: string) => l.split('-')[0]!
const lastOf = (l: string) => l.split('-').pop()!
/**
 * An element's height with its margins (0 when it is not drawn). A verse (inline, sharing its lines with the next one): from its
 * top to the next verse's, so that the verses of a version add up to the version's height.
 */
function tall(e: HTMLElement): number {
  const r = e.getBoundingClientRect()
  if (!r.height) return 0
  const s = getComputedStyle(e)
  if (s.display === 'inline') {
    const n = e.nextElementSibling?.getBoundingClientRect()
    return n?.height ? Math.max(0, n.top - r.top) : r.height
  }
  return r.height + (parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0)
}

/** The bubbles measured again when the conversation's height changes (each says false once it is gone). */
const onLog = new Set<() => boolean>()
let logRO: ResizeObserver | null = null
function watchLog(f: () => boolean) {
  onLog.add(f)
  const lg = document.getElementById('log')
  if (logRO || !lg) return
  logRO = new ResizeObserver(() => { for (const g of [...onLog]) if (!g()) onLog.delete(g) })
  logRO.observe(lg)
}

/**
 * Cuts a long answer drawn in `box` in parts when it is taller than the conversation (measured once it is on the screen, and
 * again when it changes size). `ui`: the app's language (the bar's words and its direction: in Arabic "previous" is on the
 * right and points right). Returns whether it may be cut (it has units to cut between).
 */
export function pageAnswer(box: HTMLElement, ui: string): boolean {
  if (len(box) < SHORT && !box.querySelector('figure, img')) return false
  const found = unitsOf(box)
  if (!found) return false
  const units = found.units
  const w = PW(ui)
  const rtl = rtlLang(ui)
  const bar = document.createElement('div')
  bar.className = 'pager'
  bar.dir = rtl ? 'rtl' : 'ltr'
  bar.hidden = true
  // after the units and the folds that go with them (a frame's notes, a verse's), at the level of the last unit: the folds that
  // go with no unit (the story's questions) stay after the bar
  const level = found.last.parentElement
  const after = [found.last, ...units.flatMap((u) => u.els).filter((e) => e.parentElement === level)]
    .reduce((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? b : a))
  after.after(bar)
  const button = (cls: string, text: string, label?: string) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = cls
    b.textContent = text
    if (label) b.setAttribute('aria-label', label)
    return b
  }
  const prev = button('pager-btn', rtl ? '▶' : '◀', w.prev)
  const next = button('pager-btn', rtl ? '◀' : '▶', w.next)
  const label = document.createElement('span')
  label.className = 'pager-label'
  label.setAttribute('aria-live', 'polite')
  bar.append(prev, label, next)

  let pages: number[][] = [] // none: the answer is drawn whole
  let k = 0
  /** What the last measure saw (the bubble's width and height, the conversation's height): the same again, nothing to do. */
  let seen = ''
  // a fold opened or closed in the bubble just now (not a picture that loaded): the part keeps its units, a whole answer stays
  // whole (the bar would appear under the reader's finger)
  let toggled = 0
  box.addEventListener('toggle', () => { toggled = Date.now() }, true)
  const log = () => box.closest<HTMLElement>('#log')
  const show = () => units.forEach((u, i) => u.els.forEach((e) => { e.hidden = pages.length > 0 && !pages[k]!.includes(i) }))
  const total = lastOf(units[units.length - 1]!.label)
  const draw = () => {
    show()
    bar.hidden = !pages.length
    if (!pages.length) return
    const p = pages[k]!.map((i) => units[i]!)
    const r = { a: first(p[0]!.label), b: lastOf(p[p.length - 1]!.label) }
    // one verse or one frame in the part (a frame with its picture is about half a screen): "Frame 3 of 16"
    const one = r.a === r.b
    label.textContent = found.kind === 'verses' ? fill(one ? w.verse : w.verses, { ...r, n: total })
      : found.kind === 'frames' ? fill(one ? w.frame : w.frames, { ...r, n: total }) : fill(w.parts, { a: k + 1, n: pages.length })
    prev.disabled = k === 0
    next.disabled = k === pages.length - 1
  }
  /** Where an element is on the screen, from the top of the conversation. */
  const at = (e: Element | null | undefined) => (e ? e.getBoundingClientRect().top - (log()?.getBoundingClientRect().top ?? 0) : 0)
  /** What the reader sees of a unit (its version's block for a verse, its picture for a frame): its first part that is drawn
   *  (a verse's first version may be in the closed fold of the other versions). */
  const head = (i: number) => {
    const e = units[i]!.els.find((x) => x.getBoundingClientRect().height) ?? units[i]!.els[0]!
    return e.closest<HTMLElement>('.tx') ?? e
  }
  const state = (lg: HTMLElement | null) => `${box.clientWidth} ${Math.round(box.getBoundingClientRect().height)} ${lg?.clientHeight ?? innerHeight}`
  /**
   * Measured in the observer's turn, before the screen is painted (no flash of the whole answer). The reader's place is kept by
   * the browser (scroll anchoring: what is on the screen stays where it is when the bubble above it or around it changes);
   * only a conversation scrolled to its end is kept at its end.
   */
  const measure = () => {
    const lg = log()
    if (!box.isConnected || !box.clientWidth) return // not drawn yet (or in a closed view): measured when it is
    if (state(lg) === seen) return // its own cut, reported back: nothing changed
    const room = lg?.clientHeight || innerHeight
    const anchor = pages.length ? pages[k]![0]! : 0
    const atEnd = !!lg && lg.scrollTop + lg.clientHeight >= lg.scrollHeight - 2
    const fold = Date.now() - toggled < 1000
    // everything shown for a moment, measured, and cut (no paint in between)
    const old = pages
    pages = []
    show()
    bar.hidden = true
    const h = units.map((u) => u.els.reduce((s, e) => s + tall(e), 0))
    // what is drawn between the units and is in every part (a version's name, the key terms' fold, the notes' heading)
    const span = after.getBoundingClientRect().bottom - head(0).getBoundingClientRect().top
    // and in each version, a part's last verse ends its line (a verse is measured to the next verse's top): one line more each
    const versions = new Set(units.flatMap((u) => u.els).map((e) => e.closest('.tx')).filter(Boolean)).size
    const line = versions ? parseFloat(getComputedStyle(units[0]!.els[0]!).lineHeight) || 28 : 0
    const between = Math.max(0, span - h.reduce((a, b) => a + b, 0)) + versions * line
    // a block answer (an article, a list) is cut only when it is clearly longer than the screen, not into one full part and a
    // nearly empty one
    const over = found.kind === 'parts' ? room * 1.3 : room
    let cut: number[][] = []
    if (!(fold && !old.length) && box.getBoundingClientRect().height > over) {
      // a fold opened in the part being read: it keeps its units; else (a picture loaded, the phone turned, the keyboard) cut
      // again from its first unit
      const keep = old.length && fold ? old[k]![old[k]!.length - 1]! : -1
      cut = pagesOf(h, Math.max(room - BAR - ROOM - between, room / 3), anchor, keep)
    }
    pages = cut.length > 1 ? cut : []
    k = Math.max(0, pages.findIndex((p) => p[0] === anchor))
    draw()
    if (lg && atEnd && !old.length) lg.scrollTop = lg.scrollHeight // the conversation scrolled to its end stays there
    seen = state(lg)
  }
  if (typeof ResizeObserver === 'function') {
    // the bubble (a fold, a picture, the phone turned); the conversation's height (the keyboard, split screen): one observer
    // for all the bubbles, which forgets a bubble no longer on the screen
    new ResizeObserver(() => measure()).observe(box)
    let drawn = false // (made before it is put on the screen: forgotten only once it was there and is gone)
    watchLog(() => { if (!box.isConnected) return !drawn; drawn = true; measure(); return true })
  } else {
    addEventListener('resize', measure)
    setTimeout(measure, 0)
  }
  /** To the new part: its first unit at the top of the conversation. */
  const go = (to: number) => {
    k = to
    draw()
    seen = state(log())
    const lg = log()
    if (lg) lg.scrollTop += at(head(pages[k]![0]!)) - 8
  }
  // at the first or the last part the button pressed is off: the focus goes to the other one (not lost)
  prev.onclick = () => { if (k > 0) { go(k - 1); if (prev.disabled) next.focus() } }
  next.onclick = () => { if (k < pages.length - 1) { go(k + 1); if (next.disabled) prev.focus() } }
  return true
}
