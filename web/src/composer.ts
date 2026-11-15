// The row of typing suggestions above the chat box, inside the same card (propuesta-composer-sugerencias.md §2): what suggest.ts
// offers for the text, as buttons that never take the focus from the box (the keyboard stays open), the chapter or verse strip
// in Latin digits, and a "✓" that sends. The box is never rewritten while the keyboard composes (isComposing: Gboard, Hindi,
// Arabic, swipe typing): a tap then waits for the composition to end. Menu > "Typing suggestions" turns it off (kept on the
// phone): then the row is never drawn and the app is as before.
//
// The "✓" sends the box's text as it is (hooks.send: the form's submit). main.ts answers a question that is only a reference
// with readQuestion and no reader, which reads it with pipeline.ts directSheet: the very reading the "✓" shows. So the "✓" and
// the send arrow ask the same thing, and nothing the "✓" promises goes through the model.
import { booksOf, type Ctx, loadHelps, resetHelps, type Row, ST, type Strip, suggest, type Suggestion } from './suggest'
import { buildSheet } from './sheet'
import { type ConvState, env } from './pipeline'
import type { Sheet } from './answer'

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
  /** the "✓" tapped while the keyboard was composing: sent when it ends */
  sendLabel: string | null = null
  /** a book that is not on this phone, tapped: the row says so and offers Browse */
  missing: string | null = null
  books: Record<string, Set<string>> | null = null
  private reading: Promise<void> | null = null
  /** the packs the books were read for */
  private readFor = ''
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(readonly box: Box, readonly hooks: Hooks, readonly draw: (c: Composer) => void = () => {}, readonly delay = 100) {
    live.add(this)
  }
  ctx(): Ctx {
    return { ui: this.hooks.ui(), conv: this.hooks.conv(), helpsLang: env.helpsLang, packs: this.hooks.packs(), books: this.books }
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
    resetHelps()
    this.books = null
    this.reading = null
    this.missing = null
    this.refresh()
  }
  /** Typing: the row is made after a short pause (100 ms), never while the keyboard composes. */
  onInput() {
    this.missing = null
    if (this.composing) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.refresh(), this.delay)
  }
  compositionStart() {
    this.composing = true
  }
  compositionEnd() {
    this.composing = false
    // a "✓" tapped while the keyboard composed: sent now, if it still says the same for what the box now holds
    if (this.sendLabel !== null) {
      const label = this.sendLabel
      this.sendLabel = null
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
    if (!composerOn() || !this.box.value.trim()) {
      this.row = { items: [] }
      this.madeFor = this.box.value
    } else {
      if (this.books && this.readFor && this.readFor !== this.hooks.packs().join(' ')) {
        this.books = null
        this.reading = null
      }
      if (!this.books) void this.readBooks()
      this.row = suggest(this.box.value, this.ctx())
      this.madeFor = this.box.value
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
    if (this.row.items.some((x) => x.send && x.label === label)) this.hooks.send()
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
    this.box.setSelectionRange?.(text.length, text.length)
    this.missing = null
    this.refresh()
  }
  /** A tap on a button of the row. */
  async tap(s: Suggestion) {
    if (!composerOn() || this.hooks.busy()) return
    if (s.send) {
      // while the keyboard composes, the send waits for the composition to end (Gboard keeps a word open)
      if (this.composing) {
        this.sendLabel = s.label
        return
      }
      // only the "✓" made for this very text, and only if read again now it says the same; otherwise the row is made again
      if (!this.current) return this.refresh()
      return this.sendIf(s.label)
    }
    if (s.kind === 'missing') {
      this.missing = s.book ?? ''
      return this.draw(this)
    }
    if (s.slots) {
      const { sheet, ui } = await buildSheet(`c${Date.now()}`, s.slots, env.helpsLang)
      this.hooks.ask(s.label, sheet, ui)
      return this.clear()
    }
    if (s.fill !== undefined) this.write(s.fill)
  }
  tapNumber(strip: Strip, n: number) {
    if (!composerOn() || this.hooks.busy()) return
    this.write(`${strip.base}${strip.sep}${n}`)
  }
  /** After a question is sent: an empty row. */
  clear() {
    if (!this.composing) this.box.value = ''
    this.pending = null
    this.missing = null
    this.refresh()
  }
}

// --------------------------------------------------------------------------------------------------------------- the DOM

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const d = document.createElement(tag)
  if (cls) d.className = cls
  if (text !== undefined) d.textContent = text
  return d
}
/** A button that does not take the focus from the box (the keyboard stays open). */
function chip(cls: string, label: string, on: () => void): HTMLButtonElement {
  const b = el('button', cls)
  b.type = 'button'
  const t = el('bdi')
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
      wrap.appendChild(chip('cmp-chip', s.browse, () => { if (!hooks.busy()) hooks.browse() }))
    } else {
      for (const it of row.items) {
        const b = chip(`cmp-chip cmp-${it.kind}`, it.label, () => void c.tap(it))
        if (it.kind === 'missing') b.setAttribute('aria-disabled', 'true')
        wrap.appendChild(b)
      }
      const st = row.strip
      if (st) {
        const nums = el('span', 'cmp-nums')
        nums.setAttribute('role', 'group')
        nums.setAttribute('aria-label', st.unit === 'chapter' ? s.chapter : s.verse)
        for (let n = 1; n <= st.max; n++) {
          const b = chip('cmp-n', String(n), () => c.tapNumber(st, n))
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
  box.addEventListener('input', (e) => {
    if ((e as InputEvent).isComposing) return
    c.onInput()
  })
  box.addEventListener('compositionstart', () => c.compositionStart())
  box.addEventListener('compositionend', () => c.compositionEnd())
  box.addEventListener('focus', () => { if (!c.books && composerOn()) void c.readBooks() })
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
