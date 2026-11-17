// A long answer in parts (Abel, Nov 17: a whole chapter or a whole story made one bubble so long that scrolling up the
// conversation was hard). Only how the bubble is drawn: the message's text and data are never touched, so sharing, saving,
// online AI and the 5M session still get the whole answer. The units are never cut: a verse (in every version at once), an
// OBS frame (with its picture, ms/obsimg), or a block of any other answer (a heading kept with what follows it).
// Two ways, while Abel chooses (localStorage 'btsm-pager'): 'more' shows the first part and "Show more"; 'pages' (the
// default) shows one part at a time with ◀ ▶ under it.
import { rtlLang } from './bidi'

type L = 'en' | 'es' | 'fr' | 'id' | 'hi' | 'ar'
type Words = {
  verses: string; frames: string; parts: string
  moreVerses: string; moreFrames: string; moreParts: string; less: string; prev: string; next: string
}
const W: Record<L, Words> = {
  en: { verses: 'Verses {a}–{b} of {n}', frames: 'Frames {a}–{b} of {n}', parts: 'Part {a} of {n}', moreVerses: 'Show more (verses {a}–{b})', moreFrames: 'Show more (frames {a}–{b})', moreParts: 'Show the rest', less: 'Show less', prev: 'Previous part', next: 'Next part' },
  es: { verses: 'Versículos {a}–{b} de {n}', frames: 'Cuadros {a}–{b} de {n}', parts: 'Parte {a} de {n}', moreVerses: 'Mostrar más (versículos {a}–{b})', moreFrames: 'Mostrar más (cuadros {a}–{b})', moreParts: 'Mostrar el resto', less: 'Mostrar menos', prev: 'Parte anterior', next: 'Parte siguiente' },
  fr: { verses: 'Versets {a}–{b} sur {n}', frames: 'Images {a}–{b} sur {n}', parts: 'Partie {a} sur {n}', moreVerses: 'Afficher plus (versets {a}–{b})', moreFrames: 'Afficher plus (images {a}–{b})', moreParts: 'Afficher la suite', less: 'Afficher moins', prev: 'Partie précédente', next: 'Partie suivante' },
  id: { verses: 'Ayat {a}–{b} dari {n}', frames: 'Bingkai {a}–{b} dari {n}', parts: 'Bagian {a} dari {n}', moreVerses: 'Tampilkan lagi (ayat {a}–{b})', moreFrames: 'Tampilkan lagi (bingkai {a}–{b})', moreParts: 'Tampilkan sisanya', less: 'Tampilkan lebih sedikit', prev: 'Bagian sebelumnya', next: 'Bagian berikutnya' },
  hi: { verses: 'पद {a}–{b} (कुल {n})', frames: 'फ़्रेम {a}–{b} (कुल {n})', parts: 'भाग {a} (कुल {n})', moreVerses: 'और दिखाएँ (पद {a}–{b})', moreFrames: 'और दिखाएँ (फ़्रेम {a}–{b})', moreParts: 'बाकी दिखाएँ', less: 'कम दिखाएँ', prev: 'पिछला भाग', next: 'अगला भाग' },
  ar: { verses: 'الآيات {a}–{b} من {n}', frames: 'الإطارات {a}–{b} من {n}', parts: 'الجزء {a} من {n}', moreVerses: 'عرض المزيد (الآيات {a}–{b})', moreFrames: 'عرض المزيد (الإطارات {a}–{b})', moreParts: 'عرض الباقي', less: 'عرض أقل', prev: 'الجزء السابق', next: 'الجزء التالي' },
}
const UIS: L[] = ['en', 'es', 'fr', 'id', 'hi', 'ar']
export const PW = (ui: string): Words => W[(UIS as string[]).includes(ui.split('-')[0]!) ? (ui.split('-')[0] as L) : 'en']
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))

export type PagerMode = 'more' | 'pages'
export function pagerMode(): PagerMode {
  try { return localStorage.getItem('btsm-pager') === 'more' ? 'more' : 'pages' } catch { return 'pages' }
}

/** Longer than this (characters of text), an answer is cut in parts; a part holds about this much (about a screen at 375 px). */
export const LONG = 1500
export const PART = 900
/** A passage's part: two versions are drawn one after the other, so each holds less (about three verses). */
const PART_VERSES = 600
/** At most this many OBS frames in a part (each has its picture). */
const FRAMES = 4

export type Kind = 'verses' | 'frames' | 'parts'
export type Unit = { els: HTMLElement[]; len: number; label: string }
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
  if (frames.length > 1) {
    const out: { kind: Kind; units: Unit[]; last: Element } = {
      kind: 'frames', last: frames[frames.length - 1]!,
      units: frames.map((p) => {
        const pic = p.previousElementSibling?.matches('figure.obs-pic') ? (p.previousElementSibling as HTMLElement) : null
        const label = /:(\d+)/.exec(p.firstElementChild?.textContent ?? '')?.[1] ?? ''
        return { els: pic ? [pic, p] : [p], len: len(p), label }
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
        if (u) { u.els.push(v); u.len = Math.max(u.len, len(v)) } else byKey.set(key, { els: [v], len: len(v), label })
      }
      last = p.closest('details.more-tx') ?? p.closest('.tx') ?? p
    }
    // a verse counts as long as its longest version (two versions make a part about twice as tall: a few verses each)
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
  const blocks = kids.flatMap((e) => (/^(UL|OL)$/.test(e.tagName) && len(e) > PART ? ([...e.children] as HTMLElement[]) : [e]))
  for (const e of blocks) {
    const prev = units[units.length - 1]
    // a heading goes with what follows it
    if (prev && /^H[1-6]$/.test(prev.els[prev.els.length - 1]!.tagName)) { prev.els.push(e); prev.len += len(e); continue }
    units.push({ els: [e], len: len(e), label: '' })
  }
  return units.length > 1 ? { kind: 'parts', units, last: kids[kids.length - 1]! } : null
}

/** The units cut in parts of about PART characters (FRAMES frames at most), a unit never cut. */
export function partsOf(kind: Kind, units: Unit[]): Unit[][] {
  const out: Unit[][] = [[]]
  let size = 0
  for (const u of units) {
    const cur = out[out.length - 1]!
    if (cur.length && (size + u.len > (kind === 'verses' ? PART_VERSES : PART) || (kind === 'frames' && cur.length >= FRAMES))) { out.push([u]); size = u.len } else { cur.push(u); size += u.len }
  }
  return out
}
const first = (l: string) => l.split('-')[0]!
const lastOf = (l: string) => l.split('-').pop()!

/**
 * Cuts a long answer drawn in `box` in parts (none when it is short). `ui`: the app's language (the bar's words and its
 * direction: in Arabic "previous" is on the right and points right). Returns whether it did.
 */
export function pageAnswer(box: HTMLElement, ui: string, mode: PagerMode = pagerMode()): boolean {
  if (len(box) < LONG) return false
  const found = unitsOf(box)
  if (!found) return false
  const parts = partsOf(found.kind, found.units)
  if (parts.length < 2) return false
  const w = PW(ui)
  const rtl = rtlLang(ui)
  const n = parts.length
  const range = (p: Unit[]) => ({ a: first(p[0]!.label), b: lastOf(p[p.length - 1]!.label) })
  const total = lastOf(found.units[found.units.length - 1]!.label)
  const show = (k: number | 'all') => parts.forEach((p, i) => p.forEach((u) => u.els.forEach((e) => { e.hidden = k !== 'all' && i !== k })))
  const bar = document.createElement('div')
  bar.className = `pager pager-is-${mode}`
  bar.dir = rtl ? 'rtl' : 'ltr'
  found.last.after(bar)
  const top = () => {
    const at = (box.closest('.msg') as HTMLElement | null) ?? box
    if (at.getBoundingClientRect().top < 0) at.scrollIntoView({ block: 'start' })
  }
  const button = (cls: string, text: string, label?: string) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = cls
    b.textContent = text
    if (label) b.setAttribute('aria-label', label)
    return b
  }
  if (mode === 'more') {
    const rest = parts.slice(1).flat()
    const r = { a: first(rest[0]!.label), b: lastOf(rest[rest.length - 1]!.label) }
    const more = found.kind === 'verses' ? fill(w.moreVerses, r) : found.kind === 'frames' ? fill(w.moreFrames, r) : w.moreParts
    const b = button('pager-more', more)
    let open = false
    b.setAttribute('aria-expanded', 'false')
    b.onclick = () => {
      open = !open
      show(open ? 'all' : 0)
      b.textContent = open ? w.less : more
      b.setAttribute('aria-expanded', String(open))
      if (!open) top()
    }
    bar.appendChild(b)
    show(0)
    return true
  }
  let k = 0
  const prev = button('pager-btn', rtl ? '▶' : '◀', w.prev)
  const next = button('pager-btn', rtl ? '◀' : '▶', w.next)
  const label = document.createElement('span')
  label.className = 'pager-label'
  label.setAttribute('aria-live', 'polite')
  const draw = () => {
    show(k)
    const r = range(parts[k]!)
    label.textContent = found.kind === 'verses' ? fill(w.verses, { ...r, n: total }) : found.kind === 'frames' ? fill(w.frames, { ...r, n: total }) : fill(w.parts, { a: k + 1, n })
    prev.disabled = k === 0
    next.disabled = k === n - 1
  }
  // at the first or the last part the button pressed is off: the focus goes to the other one (not lost)
  prev.onclick = () => { if (k > 0) { k--; draw(); top(); if (prev.disabled) next.focus() } }
  next.onclick = () => { if (k < n - 1) { k++; draw(); top(); if (next.disabled) prev.focus() } }
  bar.append(prev, label, next)
  draw()
  return true
}
