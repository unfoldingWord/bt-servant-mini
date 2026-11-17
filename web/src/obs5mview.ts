// The 5M study session's view (dev switch `obs5m`): a step's card, the session bar and the outline. Each draw* is a thin layer
// over a DOM-free model (cardModel, barModel, outlineModel) that the tests read.
// The core rule: the manual's answers are never on a card by default. Each one is drawn only when its own [Show answer] is
// tapped, and a new draw starts hidden again (nothing remembers it). No card has a text field. The marks of the checking cards
// live only in the session copy (`Session.checked`), and no count of them is shown anywhere.
import type { Sheet } from './answer'
import type { Fixture } from './dev'
import { md, mdDir } from './md'
import { bidiLabel, dirOf, rtlLang } from './bidi'
import { obsLabel, obsRef, parseObsRef } from './obs'
import { type Card5, type Code, next, ORDER, prev, type Session, stepPlace, steps } from './obs5m'
import { W5 } from './obs5mwords'
import { fillPicture } from './obsimg'

const fill = (t: string, v: Record<string, string | number>): string => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))
const dirUi = (ui: string): 'rtl' | 'ltr' => (rtlLang(ui) ? 'rtl' : 'ltr')
const frameNo = (f: string): number => +f.split(':')[1]!

// ---------------------------------------------------------------------------------------------------------------- the review

/** A small seeded random (mulberry32): the same session always picks the same review */
function rand(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** The last frame the team has covered in M1's observation: up to the step it is at; the whole story once past it */
function covered(fx: Fixture, s: Session): number {
  const all = fx.frames.length
  if (s.part !== 'm1') return all
  const obs = steps(fx, 'm1').filter((x) => x.kind === 'observation' && x.at <= s.at && x.frame)
  const last = steps(fx, 'm1').find((x) => x.kind === 'observation' && x.at > s.at)
  return last ? (obs.length ? Math.max(...obs.map((x) => frameNo(x.frame!))) : 0) : all
}
/** The M1 review: 3 observation questions of the frames covered, picked at random with `seed` (the session's start) */
export function reviewPick(fx: Fixture, s: Session, seed: number): string[] {
  const upTo = covered(fx, s)
  const pool = fx.questions.filter((q) => q.part === 'm1' && q.list === 'observation' && q.frames.length && frameNo(q.frames[0]!) <= upTo).map((q) => q.id)
  const r = rand(seed)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool.slice(0, 3)
}

// ---------------------------------------------------------------------------------------------------------------- the card

export type QCard = { id: string; q: string; a: string | null; frame: string | null }
/**
 * What a step's card shows. `blocks`: the manual's markdown in sight; `folded`: the same behind [The manual's instruction] (a
 * drafting or checking step after the part's first frame); `questions`: with their answers, which the view draws only on
 * [Show answer]; `marks`: the buttons each question gets ('review': [We knew it] [Revisit this frame]; 'check': [Understood]
 * [Confusing: revisit frame]); `all`: the m1-open card's [All questions in one list].
 */
export type CardModel = {
  dir: 'rtl' | 'ltr'; title: string; frame?: { label: string; text: string; image: string }
  blocks: string[]; folded: string[] | null; questions: QCard[]; marks: 'review' | 'check' | null
  terms: Card5['terms']; all: { label: string; questions: QCard[] } | null
  words: { show: string; hide: string; knew: string; revisit: string; understood: string; confusing: string; instruction: string }
}
export function cardModel(card: Card5, ui: string, fx?: Fixture | null, s?: Session | null): CardModel {
  const w = W5(ui)
  const st = card.step
  const at: Session | null = s ? { ...s, part: st.part, at: st.at } : null
  const fold = (st.kind === 'draft' || st.kind === 'check') && st.at > 0
  const asQ = (q: { id: string; q: string; a: string | null }, frame: string | null): QCard => ({ id: q.id, q: q.q, a: q.a, frame })
  const byId = new Map((fx?.questions ?? []).map((q) => [q.id, q]))
  let questions: QCard[]
  let marks: CardModel['marks'] = null
  if (st.kind === 'review') {
    marks = 'review'
    questions = fx && at ? reviewPick(fx, at, s!.started).flatMap((id) => { const q = byId.get(id); return q ? [asQ(q, q.frames[0] ?? null)] : [] }) : []
  } else if (st.kind === 'check') {
    marks = 'check'
    questions = (card.checks ?? []).map((q) => asQ(q, st.frame))
  } else questions = card.questions.map((q) => asQ(q, st.frame))
  const all = st.kind === 'm1-open' && fx
    ? { label: w.view.allList, questions: fx.questions.filter((q) => q.part === 'm1' && q.list === 'observation').map((q) => asQ(q, q.frames[0] ?? null)) }
    : null
  const fr = card.frame ? parseObsRef(card.frame.ref) : null
  return {
    dir: rtlLang(card.tfLang) ? 'rtl' : 'ltr', title: card.title,
    ...(card.frame ? { frame: { label: fr ? obsLabel(fr.n, fr.f) : card.frame.ref, text: card.frame.text, image: card.frame.image } } : {}),
    blocks: fold ? [] : card.blocks, folded: fold && card.blocks.length ? card.blocks : null,
    questions, marks, terms: card.terms, all,
    words: { show: w.show, hide: w.hide, knew: w.knew, revisit: w.revisit, understood: w.understood, confusing: w.confusing, instruction: w.view.instruction },
  }
}

/** What a card can do: run a sheet (a turn of the chat), and hear of a reveal (share and online context). `s`: the session as it is now (main.ts gives a getter) */
export type CardHooks = {
  fx: Fixture; s: Session; run(label: string, sheet: Sheet): void; reveal?(id: string, shown: boolean): void; marked?(): void
  /** The frame's words tappable as in an OBS answer (Abel, Nov 17): `text` holds the frame's text, `ref` is "obs N:F", `root` the
   *  card, `lang` the language of that text (the manual's, `tfLang`: the quotes must be in it). They open the panel over the
   *  session (its notes and key terms; the session does not move, no answer is shown). */
  words?(text: HTMLElement, ref: string, root: HTMLElement, lang: string): void
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const d = document.createElement(tag)
  d.className = cls
  if (text !== undefined) d.textContent = text
  return d
}
function btn(cls: string, label: string, ui: string): HTMLButtonElement {
  const b = el('button', cls, bidiLabel(label, ui)) as HTMLButtonElement
  b.type = 'button'
  return b
}
const article = (concept: string, lang: string): Sheet =>
  ({ id: `f${Date.now()}`, intent: 'article', concept, lang, ref: null, what: [], version: null, term: null, phrase: null, candidates: null })

/**
 * The frame shown again (R14): its OBS answer ('obs 1:F', its text), a help of the step (deeper, with the way back); the
 * session's place does not move
 */
export function frameAgain(s: Session, frame: string): Sheet {
  return { id: `f${Date.now()}`, intent: 'passage', ref: obsRef(s.story, frameNo(frame)), what: ['text'], lang: s.lang, concept: null, term: null, phrase: null, candidates: null, version: null }
}

/** One question: its text, [Show answer] (the answer is drawn only then, and removed on [Hide answer]), and its marks */
function drawQ(q: QCard, m: CardModel, ui: string, on: CardHooks | undefined, marks: CardModel['marks']): HTMLElement {
  const li = el('li', marks === 'review' ? 's5-q s5-review' : marks === 'check' ? 's5-q s5-check' : 's5-q')
  li.dataset.id = q.id
  const t = el('p', 's5-q-text', q.q)
  t.dir = dirOf(q.q) === 'rtl' ? 'rtl' : m.dir
  li.appendChild(t)
  const row = el('div', 's5-q-row')
  row.dir = dirUi(ui)
  if (q.a) {
    const show = btn('s5-show', m.words.show, ui)
    show.setAttribute('aria-expanded', 'false')
    let shown: HTMLElement | null = null
    show.onclick = () => {
      if (shown) {
        shown.remove()
        shown = null
      } else {
        shown = el('p', 's5-a', q.a!)
        shown.dir = t.dir
        row.before(shown)
      }
      show.textContent = bidiLabel(shown ? m.words.hide : m.words.show, ui)
      show.setAttribute('aria-expanded', String(!!shown))
      on?.reveal?.(q.id, !!shown)
    }
    row.appendChild(show)
  }
  if (marks === 'review') {
    // [We knew it]: the team's own sign, kept nowhere; [Revisit this frame]: its observation step
    const knew = btn('s5-mark', m.words.knew, ui)
    knew.setAttribute('aria-pressed', 'false')
    knew.onclick = () => knew.setAttribute('aria-pressed', String(knew.getAttribute('aria-pressed') !== 'true'))
    const again = btn('s5-mark', m.words.revisit, ui)
    again.onclick = () => { if (on && q.frame) on.run(m.words.revisit, frameAgain(on.s, q.frame)) }
    row.append(knew, again)
  } else if (marks === 'check') {
    // the team's mark, in the session copy only; "Confusing" also opens the frame again
    const mine = (on && q.frame ? on.s.checked?.[q.frame]?.[q.id] : undefined) ?? null
    const set = (v: 'understood' | 'confusing') => {
      if (!on || !q.frame) return
      const c = (on.s.checked ??= {})
      ;(c[q.frame] ??= {})[q.id] = v
      ok.setAttribute('aria-pressed', String(v === 'understood'))
      no.setAttribute('aria-pressed', String(v === 'confusing'))
      on.marked?.()
    }
    const ok = btn('s5-mark', m.words.understood, ui)
    const no = btn('s5-mark', m.words.confusing, ui)
    ok.setAttribute('aria-pressed', String(mine === 'understood'))
    no.setAttribute('aria-pressed', String(mine === 'confusing'))
    ok.onclick = () => set('understood')
    no.onclick = () => {
      set('confusing')
      if (on && q.frame) on.run(m.words.confusing, frameAgain(on.s, q.frame))
    }
    row.append(ok, no)
  }
  if (row.childElementCount) li.appendChild(row)
  return li
}
function drawQs(qs: QCard[], m: CardModel, ui: string, on: CardHooks | undefined, marks: CardModel['marks']): HTMLElement {
  const ol = el('ol', 's5-qs')
  for (const q of qs) ol.appendChild(drawQ(q, m, ui, on, marks))
  return ol
}
function mdBox(blocks: string[]): HTMLElement {
  const box = el('div', 's5-md md')
  const src = blocks.join('\n\n')
  box.innerHTML = md(src) // md() escapes everything first
  box.dir = mdDir(src) === 'rtl' ? 'rtl' : 'ltr'
  return box
}

/** A step's card: the part's heading, the frame (image and text), the manual's text, the questions with their hidden answers */
export function drawCard(card: Card5, ui: string, on?: CardHooks): HTMLElement {
  const m = cardModel(card, ui, on?.fx, on?.s)
  const root = el('div', `s5-card s5-${card.step.kind}`)
  root.dir = m.dir
  root.dataset.lang = card.tfLang
  if (m.title) root.appendChild(el('h3', 's5-title', m.title))
  if (m.frame) {
    const fig = el('figure', 's5-frame')
    // the frame's picture (obsimg.ts): the phone's pack, else Door43's, else a placeholder; the fixture's URL only for a frame
    // whose ref is not an OBS one
    const p = parseObsRef(card.frame?.ref)
    if (!p?.f && m.frame.image) {
      const img = el('img', 's5-img') as HTMLImageElement
      img.src = m.frame.image
      img.alt = m.frame.label
      img.loading = 'lazy'
      fig.appendChild(img)
    }
    const cap = el('figcaption', 's5-frame-text')
    const words = el('span', '', m.frame.text)
    cap.append(el('b', '', `${m.frame.label} `), words)
    fig.appendChild(cap)
    if (p?.f && on?.words) on.words(words, obsRef(p.n, p.f), root, card.tfLang)
    if (p?.f) fillPicture(fig, p.n, p.f, m.frame.label, ui, 's5-img')
    root.appendChild(fig)
  }
  if (m.blocks.length) root.appendChild(mdBox(m.blocks))
  if (m.folded) {
    const b = btn('s5-fold', m.words.instruction, ui)
    b.setAttribute('aria-expanded', 'false')
    let box: HTMLElement | null = null
    b.onclick = () => {
      if (box) {
        box.remove()
        box = null
      } else b.after((box = mdBox(m.folded!)))
      b.setAttribute('aria-expanded', String(!!box))
    }
    root.appendChild(b)
  }
  if (m.terms.length) {
    const ul = el('ul', 's5-terms')
    for (const t of m.terms) {
      const li = el('li', 's5-term')
      if (t.concept && on) {
        const b = btn('s5-term-btn', t.term, ui)
        b.onclick = () => on.run(t.term, article(t.concept!, on.s.lang))
        li.appendChild(b)
      }
      li.appendChild(mdBox([t.text]))
      ul.appendChild(li)
    }
    root.appendChild(ul)
  }
  if (m.questions.length) root.appendChild(drawQs(m.questions, m, ui, on, m.marks))
  if (m.all) {
    // the handout at once: one card with every observation question, each answer hidden (a new card every time)
    const b = btn('s5-allbtn', m.all.label, ui)
    b.setAttribute('aria-expanded', 'false')
    let box: HTMLElement | null = null
    b.onclick = () => {
      if (box) {
        box.remove()
        box = null
      } else {
        box = el('div', 's5-card s5-all')
        box.dir = m.dir
        box.appendChild(el('h3', 's5-title', m.all!.label))
        box.appendChild(drawQs(m.all!.questions, m, ui, on, null))
        b.after(box)
      }
      b.setAttribute('aria-expanded', String(!!box))
    }
    root.appendChild(b)
  }
  return root
}

// ---------------------------------------------------------------------------------------------------------------- the bar

/** Where the bar says the session is: "OBS 1 · The Creation" over "M1 · observation · frame 5/16" (a movement as M1: 375 px) */
export function barModel(s: Session, fx: Fixture, ui: string): { dir: 'rtl' | 'ltr'; title: string; place: string; prev: boolean; next: boolean } {
  const w = W5(ui)
  let place = stepPlace(fx, s, ui)
  if (/^m\d$/.test(s.part)) place = place.replace(w.parts[s.part], s.part.toUpperCase())
  return { dir: dirUi(ui), title: fill(w.bar, { story: obsLabel(s.story), title: fx.title }), place, prev: !!prev(fx, s), next: !!next(fx, s) }
}
/**
 * The session bar, under the header: two lines (the story, where the session is) and ◀ ▶ [≡]. `dimmed`: the conversation is
 * on a branch, away from the session; tapping the lines is then the way back (else they open the outline).
 */
export function drawBar(s: Session, fx: Fixture, ui: string, on: { prev(): void; next(): void; outline(): void; back(): void }, dimmed: boolean): HTMLElement {
  const m = barModel(s, fx, ui)
  const w = W5(ui)
  const bar = el('div', dimmed ? 's5-bar dimmed' : 's5-bar')
  bar.id = 's5bar'
  bar.dir = m.dir
  bar.setAttribute('role', 'navigation')
  bar.setAttribute('aria-label', m.title)
  const where = el('button', 's5-where') as HTMLButtonElement
  where.type = 'button'
  where.append(el('span', 's5-bar-title', bidiLabel(m.title, ui)), el('span', 's5-bar-place', bidiLabel(m.place, ui)))
  where.setAttribute('aria-label', dimmed ? fill(w.back, { place: m.place }) : `${m.title} · ${m.place} · ${w.outline}`)
  where.onclick = () => (dimmed ? on.back() : on.outline())
  // under RTL the row mirrors: "previous" is on the right and points right
  const rtl = m.dir === 'rtl'
  const mk = (glyph: string, label: string, ok: boolean, f: () => void) => {
    const b = el('button', 's5-nav', glyph) as HTMLButtonElement
    b.type = 'button'
    b.setAttribute('aria-label', label)
    b.title = label
    b.disabled = !ok
    b.onclick = f
    return b
  }
  bar.append(where,
    mk(rtl ? '▶' : '◀', w.view.prevStep, m.prev, on.prev),
    mk(rtl ? '◀' : '▶', w.view.nextStep, m.next, on.next),
    mk('≡', w.outline, true, on.outline))
  return bar
}

// ---------------------------------------------------------------------------------------------------------------- the outline

export type OutlineRow = { part: Code; label: string; mark: '✓' | '●' | '○'; place: string | null; duration: string }
/** The 11 parts (those the story has): ✓ done, ● current (with where), ○ the others, each with the manual's time */
export function outlineModel(s: Session, fx: Fixture, ui: string): { dir: 'rtl' | 'ltr'; title: string; rows: OutlineRow[]; how: { label: string; hidden: boolean }; end: string } {
  const w = W5(ui)
  const rows = ORDER.filter((p) => steps(fx, p).length).map((p): OutlineRow => {
    const cur = p === s.part
    return { part: p, label: w.parts[p], mark: cur ? '●' : s.done.includes(p) ? '✓' : '○', place: cur ? barModel(s, fx, ui).place : null, duration: w.durations[p] }
  })
  // "How the five movements work" ships only after the licence check (decision 5): hidden in the mock
  return { dir: dirUi(ui), title: fill(w.bar, { story: obsLabel(s.story), title: fx.title }), rows, how: { label: w.how, hidden: true }, end: w.end }
}
export function drawOutline(s: Session, fx: Fixture, ui: string, on: { jump(p: Code): void; how(): void; end(): void }): HTMLElement {
  const m = outlineModel(s, fx, ui)
  const root = el('div', 's5-outline')
  root.dir = m.dir
  root.appendChild(el('h3', 's5-out-title', bidiLabel(m.title, ui)))
  const ol = el('ol', 's5-parts')
  for (const r of m.rows) {
    const li = el('li', `s5-part ${r.mark === '●' ? 'cur' : r.mark === '✓' ? 'done' : 'todo'}`)
    const b = el('button', 's5-part-btn') as HTMLButtonElement
    b.type = 'button'
    if (r.mark === '●') b.setAttribute('aria-current', 'step')
    b.append(el('span', 's5-part-mark', r.mark), el('span', 's5-part-name', bidiLabel(r.label, ui)))
    if (r.place) b.appendChild(el('span', 's5-part-place', bidiLabel(r.place, ui)))
    if (r.duration) b.appendChild(el('span', 's5-part-time', r.duration))
    b.onclick = () => on.jump(r.part)
    li.appendChild(b)
    ol.appendChild(li)
  }
  root.appendChild(ol)
  const how = btn('s5-how', m.how.label, ui)
  how.hidden = m.how.hidden
  how.onclick = () => on.how()
  const end = btn('s5-end', m.end, ui)
  end.onclick = () => on.end()
  root.append(how, end)
  return root
}
