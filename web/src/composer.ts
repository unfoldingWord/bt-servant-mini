// The row of typing suggestions above the chat box, inside the same card (propuesta-composer-sugerencias.md §2): what suggest.ts
// offers for the text, as buttons that never take the focus from the box (the keyboard stays open), the chapter or verse strip
// in Latin digits, and a "✓" that sends. The box is never rewritten while the keyboard composes (isComposing: Gboard, Hindi,
// Arabic, swipe typing): a tap then waits for the composition to end. Menu > "Typing suggestions" turns it off (kept on the
// phone): then the row is never drawn and the app is as before.
//
// The "✓" sends the box's text as it is (hooks.send: the form's submit). main.ts answers a question code reads (a reference, or
// a follow-up of the conversation: pipeline.ts codeReads) with readQuestion and no reader, which reads it with directSheet or
// followUp: the very reading the "✓" shows. So the "✓" and the send arrow ask the same thing, and nothing the "✓" promises goes
// through the model.
//
// Phase 2: with the box empty and the focus in it, the row shows where the conversation is and the ways of asking (state A);
// the word index (termindex.ts) is built at idle after the first answer (`answered`), and dropped when the packs change.
//
// Phase 3 (teach.ts): with no model and no online reader, a free question gets a grey line ("Free question: I will search the
// helps for these words") the first three times; "Understood: …" under a message puts the question back (`restore`); the ways
// of asking under an answer that found nothing write in the box (`offer`).
//
// Usage counts (usage.ts, only when the person turned them on; approved by Abel on Nov 16, propuesta §9 item 1), never text:
//   sent.typed   a question sent from the box with Enter or the send arrow
//   sent.chip    a question sent by a button of the row (the "✓", a word, an introduction, the path's next step)
//   sent.code    one of those two that code read by itself (every row button; typed text main.ts reads by code)
//   sent.free    one of those two that went to the readers or the search (sent.typed + sent.chip = sent.code + sent.free)
//   cmp.fill     a button that wrote in the box (a book, a number, a help, a shape; also a shape under "found nothing")
//   cmp.undo     the first edit after such a button only deleted some of what it wrote (a wrong button)
//   cmp.missing  a book that is not on this phone, tapped
// Questions sent another way (How to ask's "Try it", a saved item, "Try again") count none of these.
import { booksOf, type Ctx, loadHelps, resetSuggest, type Row, shapesFor, ST, startRow, type Strip, suggest, type Suggestion } from './suggest'
import { scheduleTermIndex } from './termindex'
import { scheduleObsIndex } from './obsindex'
import { freeHintSeen, freeLine, type Shape } from './teach'
import { count } from './usage'
import { buildSheet } from './sheet'
import { type ConvState, env } from './pipeline'
import type { Sheet } from './answer'
import { bidiLabel, rtlLang, strip as unmarked } from './bidi'

const KEY = 'btsm.suggest'
/** Whether "Typing suggestions" is on (on unless turned off in the menu). */
export function composerOn(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) !== '0'
  } catch {
    return true
  }
}
export function setComposerOn(on: boolean) {
  try {
    globalThis.localStorage?.setItem(KEY, on ? '1' : '0')
  } catch {}
  for (const c of live) c.refresh()
}

export type Hooks = {
  ui: () => string
  conv: () => ConvState
  /** the installed packs, in installedLangs() order */
  packs: () => string[]
  /** a question is being answered, or the app is locked: the row's buttons do nothing */
  busy: () => boolean
  /** sends the box's text (the form's submit) */
  send: () => void
  /** asks a ready sheet, as a button under an answer does (runSheet) */
  ask: (label: string, sheet: Sheet, ui: string) => void
  /** Browse (the books there are) */
  browse: () => void
  /** a model or the online reader would read a free question (then no grey line); none given: as if one would */
  reader?: () => boolean
  /** [Resume] a saved 5M session of this story (dev switch `obs5m`; main.ts) */
  resume?: (story: number) => void
  /** "All (n)": Browse's list of Bible stories filtered to these (their numbers), under this title (main.ts openExploreAt) */
  stories?: (lang: string, ids: number[], title: string) => void
}
/** The box as the composer sees it: the textarea, or a plain object in the tests. */
export type Box = { value: string; focus(): void; setSelectionRange?(a: number, b: number): void }

const live = new Set<Composer>()

/** The row's state and what a tap does, without the DOM (tests/composer.test.ts drives it with a plain box). */
export class Composer {
  row: Row = { items: [] }
  /** the text the row was made for: a "✓" counts only for that text */
  madeFor = ''
  composing = false
  /** a text a tap wrote while the keyboard was composing: written when it ends */
  pending: string | null = null
  /** a story's button tapped while the keyboard was composing: asked when it ends, if the box and the row still say the same */
  waiting: { label: string; text: string } | null = null
  /** the "✓" tapped while the keyboard was composing: sent when it ends */
  sendLabel: string | null = null
  /** the box's text when that "✓" was tapped: typed on since, the send is dropped */
  sendText = ''
  /** a book that is not on this phone, tapped: the row says so and offers Browse */
  missing: string | null = null
  /** the box has the focus (state A shows only then: the keyboard is open) */
  focused = false
  /** state A's Passage was tapped: the empty box lists the books */
  choosing = false
  books: Record<string, Set<string>> | null = null
  /** how the question being sent left the box: typed (Enter, the send arrow) or a row's "✓"; null: sent some other way */
  via: 'typed' | 'chip' | null = null
  /** what a button of the row last wrote in the box: the next edit, if it only deletes some of it, is an undo (cmp.undo) */
  filled: string | null = null
  /** the grey line of a free question with no model (teach.ts freeLine), or null */
  hint: string | null = null
  private reading: Promise<void> | null = null
  /** the packs the books were read for */
  private readFor = ''
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(readonly box: Box, readonly hooks: Hooks, readonly draw: (c: Composer) => void = () => {}, readonly delay = 100) {
    live.add(this)
  }
  ctx(): Ctx {
    return { ui: this.hooks.ui(), conv: this.hooks.conv(), helpsLang: env.helpsLang, packs: this.hooks.packs(), books: this.books, choosing: this.choosing }
  }
  /** Reads which books the packs have (once; again after the packs change). */
  readBooks(): Promise<void> {
    const packs = this.hooks.packs()
    // (none known yet: the app is still listing them)
    if (!packs.length) return Promise.resolve()
    return (this.reading ??= booksOf(packs).then((b) => {
      this.books = b
      this.readFor = packs.join(' ')
      this.refresh()
    }).catch(() => {
      this.reading = null
    }))
  }
  /** The packs changed: the books are read again, the row made again. */
  reset() {
    resetSuggest()
    this.books = null
    this.reading = null
    this.missing = null
    this.refresh()
  }
  /** Typing: the row is made after a short pause (100 ms), never while the keyboard composes. */
  onInput() {
    // (after a button wrote in the box: deleting into what it wrote undoes it, once. Deleting only its trailing space keeps
    // watching, as the first backspace after "Romanos " does; any other edit ends the watch)
    if (this.filled !== null) {
      const w = this.filled.trimEnd()
      const v = this.box.value
      if (v.length < w.length && w.startsWith(v)) {
        count('cmp.undo')
        this.filled = null
      } else if (!(v.length >= w.length && this.filled.startsWith(v))) this.filled = null
    }
    this.missing = null
    this.choosing = false
    if (this.composing) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.refresh(), this.delay)
  }
  compositionStart() {
    this.composing = true
  }
  compositionEnd() {
    this.composing = false
    // a story's button tapped while the keyboard composed: asked now, if the box holds what it held and the row still offers it
    if (this.waiting) {
      const w = this.waiting
      this.waiting = null
      if (this.box.value !== w.text) return this.onInput()
      this.refresh()
      const again = this.row.items.find((x) => (x.kind === 'story' || x.kind === 'stories') && x.label === w.label)
      return again ? void this.tap(again) : undefined
    }
    // a "✓" tapped while the keyboard composed: sent now, if it still says the same for what the box now holds
    if (this.sendLabel !== null) {
      const label = this.sendLabel
      this.sendLabel = null
      // (a word committed now counts: "Rut 2:3?" reads the same, but the person went on typing, so nothing is sent)
      if (this.box.value !== this.sendText) {
        this.pending = null
        return this.onInput()
      }
      this.pending = null
      return this.sendIf(label)
    }
    if (this.pending !== null) {
      const t = this.pending
      this.pending = null
      this.write(t)
    } else this.onInput()
  }
  /** Makes the row for the box's text now. */
  refresh() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.hint = null
    if (!composerOn()) {
      this.row = { items: [] }
      this.madeFor = this.box.value
    } else if (!unmarked(this.box.value).trim()) {
      // A: only while the box has the focus (the keyboard is open); the books are read for the list of Passage
      if (this.choosing && !this.books) void this.readBooks()
      this.row = this.focused ? startRow(this.ctx()) : { items: [] }
      this.madeFor = this.box.value
    } else {
      if (this.books && this.readFor && this.readFor !== this.hooks.packs().join(' ')) {
        this.books = null
        this.reading = null
      }
      if (!this.books) void this.readBooks()
      const ctx = this.ctx()
      this.row = suggest(this.box.value, ctx)
      this.madeFor = this.box.value
      // E: nothing to offer for free text; with no model, the grey line says what will happen (the first three times)
      const r = this.row
      if (ctx.books && !r.items.length && !r.pick?.length && !r.strip && !r.needs?.length)
        this.hint = freeLine(this.box.value, ctx.ui, ctx.conv, this.hooks.reader?.() ?? true)
      // the books a "✓" or an introduction depends on, read once (as the answer would), then the row again for the same text
      const needs = this.row.needs
      if (needs?.length) {
        const text = this.box.value
        void Promise.all(needs.map(([p, c]) => loadHelps(p, c))).then(() => {
          if (this.box.value === text && !this.composing) this.refresh()
        })
      }
    }
    this.draw(this)
  }
  /**
   * Sends the box's text only if the row made again now, for what the box holds and where the conversation is, still offers
   * this very "✓" (the state may have moved since it was made: an answer arrived, the packs changed, a word was committed).
   */
  sendIf(label: string) {
    this.refresh()
    if (!this.row.items.some((x) => x.send && x.label === label)) return
    this.via = 'chip'
    try {
      this.hooks.send()
    } finally {
      this.via = null
    }
  }
  /** The "✓" shown is for the text in the box now (not one typed since). */
  get current(): boolean {
    return this.madeFor === this.box.value
  }
  /** Writes in the box (a book, a number, a help), keeps the focus there, and makes the row for it. */
  write(text: string) {
    if (this.composing) {
      this.pending = text
      return
    }
    this.box.value = text
    this.box.focus()
    this.focused = true
    this.box.setSelectionRange?.(text.length, text.length)
    this.missing = null
    this.choosing = false
    this.refresh()
  }
  /** A tap on a button of the row. */
  async tap(s: Suggestion) {
    if (!composerOn() || this.hooks.busy()) return
    if (s.send) {
      // while the keyboard composes, the send waits for the composition to end (Gboard keeps a word open)
      if (this.composing) {
        this.sendLabel = s.label
        this.sendText = this.box.value
        return
      }
      // only the "✓" made for this very text, and only if read again now it says the same; otherwise the row is made again
      if (!this.current) return this.refresh()
      return this.sendIf(s.label)
    }
    // a story's button: the sheet, or Browse's list, waits for the keyboard's composition like the "✓" (a word kept open is not yet typed)
    if ((s.kind === 'story' || s.kind === 'stories') && this.composing) {
      this.waiting = { label: s.label, text: this.box.value }
      return
    }
    if (s.list) {
      this.hooks.stories?.(s.list.lang, s.list.ids, s.list.title)
      return
    }
    if (s.kind === 'missing') {
      if (!s.lacks) count('cmp.missing')
      this.missing = s.book ?? ''
      return this.draw(this)
    }
    if (s.slots) {
      const { sheet, ui } = await buildSheet(`c${Date.now()}`, s.slots, env.helpsLang)
      // (a question may have been sent, or the app locked, while the sheet was built: then nothing is asked, nothing counted)
      if (!composerOn() || this.hooks.busy()) return
      this.hooks.ask(s.label, sheet, ui)
      this.chipSent()
      return this.clear()
    }
    // a saved 5M session: its conversation (or a new one) at its place
    if (s.resume !== undefined) {
      this.hooks.resume?.(s.resume)
      return this.clear()
    }
    // an article, the path's next step: asked as the button under an answer asks it
    if (s.sheet) {
      this.hooks.ask(s.ask ?? s.label, { ...s.sheet, id: `c${Date.now()}` }, this.hooks.ui())
      this.chipSent()
      // (a story's button is read by code like the "✓": no model, no reader)
      if (s.kind === 'story') count('sent.code')
      return this.clear()
    }
    // Passage: the books, in the row
    if (s.choose) {
      this.choosing = true
      return this.refresh()
    }
    if (s.fill !== undefined) this.filledBy(s.fill)
  }
  tapNumber(strip: Strip, n: number) {
    if (!composerOn() || this.hooks.busy()) return
    this.filledBy(`${strip.base}${strip.sep}${n}`)
  }
  /** A button wrote in the box: counted (cmp.fill), and its next edit watched for an undo. */
  private filledBy(text: string) {
    count('cmp.fill')
    this.write(text)
    this.filled = text
  }
  /** A ready question asked by a button of the row (no box, no reader): sent.chip, read by code. */
  private chipSent() {
    count('sent.chip')
    count('sent.code')
  }
  /**
   * A question left the box (main.ts submit, once it knows whether code reads it: `direct`): counted by how it was sent, typed
   * or the "✓" (nothing when sent another way: How to ask, a saved item, Try again); the grey line went with it once more; then
   * the row is emptied.
   */
  sent(direct: boolean) {
    const via = this.via
    this.via = null
    if (via === 'typed' && !direct && this.hint) freeHintSeen()
    if (via) {
      count(via === 'chip' ? 'sent.chip' : 'sent.typed')
      count(direct ? 'sent.code' : 'sent.free')
    }
    this.clear()
  }
  /** "Understood: …" tapped: the person's question back in the box, to correct it (not counted: no button of the row). */
  restore(q: string) {
    this.write(q)
    this.filled = null
  }
  /** A way of asking under an answer that found nothing: written in the box (cmp.fill), or Passage's books listed in the row. */
  offer(s: Shape) {
    if (s.choose) {
      this.write('')
      this.choosing = true
      return this.refresh()
    }
    if (s.fill !== undefined) this.filledBy(s.fill)
  }
  /** The ways of asking for a question that found nothing (suggest.ts shapesFor), once the books are known. */
  async shapesFor(q: string): Promise<Shape[]> {
    if (!this.books) await this.readBooks()
    if (!this.books) return []
    return shapesFor(q, this.ctx(), composerOn()).map((s) => ({ label: s.label, ...(s.fill !== undefined ? { fill: s.fill } : {}), ...(s.choose ? { choose: true as const } : {}) }))
  }
  /** After a question is sent: an empty row (state A, if the box keeps the focus). */
  clear() {
    if (!this.composing) this.box.value = ''
    this.filled = null
    this.pending = null
    this.missing = null
    this.choosing = false
    this.refresh()
  }
  /**
   * An answer arrived (main.ts respond): state A shows where the conversation is now, and the word index is built at idle (the
   * first time; again after the packs change). Never before: reading the names at the app's start would slow it.
   */
  answered() {
    // (once built, the row for what is being typed is made again: the words show without another key)
    const again = () => { if (unmarked(this.box.value).trim() && !this.composing) this.refresh() }
    scheduleTermIndex(() => this.hooks.packs(), again)
    scheduleObsIndex(() => this.hooks.packs(), again)
    if (!unmarked(this.box.value).trim()) this.refresh()
  }
  /** The box has the focus, or lost it: state A shows only with the focus. */
  focusChanged(on: boolean) {
    this.focused = on
    if (!on) this.choosing = false
    if (!unmarked(this.box.value).trim()) this.refresh()
  }
}

// --------------------------------------------------------------------------------------------------------------- the DOM

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const d = document.createElement(tag)
  if (cls) d.className = cls
  if (text !== undefined) d.textContent = text
  return d
}
/**
 * A button that does not take the focus from the box (the keyboard stays open). Its label in the app's direction, the runs of the
 * other direction isolated (bidi.ts bidiLabel: "Ruth · اسم" in Arabic).
 */
function chip(cls: string, label: string, on: () => void, ui = ''): HTMLButtonElement {
  const b = el('button', cls)
  b.type = 'button'
  const t = el('bdi')
  if (ui) {
    t.dir = rtlLang(ui) ? 'rtl' : 'ltr'
    label = bidiLabel(label, ui)
  }
  t.textContent = label
  b.appendChild(t)
  b.addEventListener('pointerdown', (e) => e.preventDefault())
  b.addEventListener('mousedown', (e) => e.preventDefault())
  b.onclick = on
  return b
}

let mounted: Composer | null = null
/**
 * Puts the row above the box, inside the form's card, and listens to the box. Returns the composer: main.ts calls `clear()`
 * after sending and `reset()` when the packs change.
 */
export function mountComposer(form: HTMLElement, box: HTMLTextAreaElement, hooks: Hooks): Composer {
  const wrap = el('div', 'cmp')
  wrap.setAttribute('role', 'group')
  wrap.hidden = true
  const said = el('span', 'cmp-said')
  said.setAttribute('aria-live', 'polite')
  form.prepend(wrap)
  form.appendChild(said)
  let lastSaid = ''
  let sayTimer: ReturnType<typeof setTimeout> | null = null
  const draw = (c: Composer) => {
    const ui = hooks.ui()
    const s = ST(ui)
    wrap.setAttribute('aria-label', s.row)
    wrap.replaceChildren()
    const row = c.row
    if (c.missing !== null) {
      const it = row.items.find((x) => x.kind === 'missing' && x.book === c.missing)
      wrap.appendChild(el('span', 'cmp-note', it?.label ?? s.notHere))
      wrap.appendChild(chip('cmp-chip', s.browse, () => { if (!hooks.busy()) hooks.browse() }, ui))
    } else if (c.hint) {
      // E with no model: what a free question will do, grey, no button (the first three times)
      const note = el('span', 'cmp-note cmp-free', c.hint)
      note.dir = rtlLang(ui) ? 'rtl' : 'ltr'
      wrap.appendChild(note)
    } else {
      for (const it of row.items) {
        const b = chip(`cmp-chip cmp-${it.kind}`, it.label, () => void c.tap(it), ui)
        if (it.aria) b.setAttribute('aria-label', it.aria)
        if (it.kind === 'missing') b.setAttribute('aria-disabled', 'true')
        wrap.appendChild(b)
      }
      // the books to pick from (Passage, "Notas de ")
      if (row.pick?.length) {
        const list = el('span', 'cmp-pick')
        list.setAttribute('role', 'group')
        list.setAttribute('aria-label', s.books)
        for (const it of row.pick) list.appendChild(chip('cmp-chip cmp-book', it.label, () => void c.tap(it), ui))
        wrap.appendChild(list)
      }
      const st = row.strip
      if (st) {
        const nums = el('span', 'cmp-nums')
        nums.setAttribute('role', 'group')
        nums.setAttribute('aria-label', st.unit === 'chapter' ? s.chapter : s.verse)
        for (let n = 1; n <= st.max; n++) {
          const b = chip('cmp-n', String(n), () => c.tapNumber(st, n), ui)
          b.setAttribute('aria-label', `${st.unit === 'chapter' ? s.chapter : s.verse} ${n}`)
          nums.appendChild(b)
        }
        wrap.appendChild(nums)
      }
    }
    wrap.hidden = !wrap.childElementCount
    wrap.scrollLeft = 0
    // the "✓" is said to a screen reader when it changes and the typing stopped (600 ms)
    const ok = row.items.find((x) => x.kind === 'ok')?.label ?? ''
    if (sayTimer) clearTimeout(sayTimer)
    if (ok && ok !== lastSaid) sayTimer = setTimeout(() => { said.textContent = ok; lastSaid = ok }, 600)
    if (!ok) lastSaid = ''
  }
  const c = new Composer(box, hooks, draw)
  mounted = c
  // a question sent from the box by the person (Enter, the send arrow), not by How to ask or a saved item (which submit the form
  // too): marked for the submit that follows at once (main.ts calls `sent`), then forgotten
  const typed = () => {
    c.via ??= 'typed'
    setTimeout(() => { if (c.via === 'typed') c.via = null }, 0)
  }
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) typed() })
  form.addEventListener('click', (e) => { if ((e.target as Element | null)?.closest?.('button[type="submit"]')) typed() }, true)
  box.addEventListener('input', (e) => {
    if ((e as InputEvent).isComposing) return
    c.onInput()
  })
  box.addEventListener('compositionstart', () => c.compositionStart())
  box.addEventListener('compositionend', () => c.compositionEnd())
  box.addEventListener('focus', () => {
    if (!c.books && composerOn()) void c.readBooks()
    c.focusChanged(true)
  })
  box.addEventListener('blur', () => c.focusChanged(false))
  return c
}
/** The composer on the page, if mounted. */
export const composer = () => mounted

/** Menu: the "Typing suggestions" switch (on by default; kept on the phone). */
export function composerSwitch(ui: string, on: string, off: string): HTMLButtonElement {
  const b = el('button', 'mrow')
  b.type = 'button'
  b.setAttribute('role', 'switch')
  const sub = el('span', 'mrow-s')
  const paint = () => {
    b.setAttribute('aria-checked', String(composerOn()))
    sub.textContent = composerOn() ? on : off
  }
  b.append(el('span', 'mrow-t', ST(ui).toggle), sub)
  b.onclick = () => {
    setComposerOn(!composerOn())
    paint()
  }
  paint()
  return b
}
