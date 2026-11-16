// What the person sees of saved items and notes (saved.ts keeps them): ☆ Save and ✎ Note under an answer and on an article,
// "Your note" above an answer about the same verse or article, and the Saved view (full screen like Browse, under the PIN
// lock like it) with its two lists, a search box, groups, names, notes, share and delete. Opening an item asks it again the
// usual way (main.ts hooks); one that needs a pack no longer on the phone says so, with the way to add it.
import { titleFor } from './answer'
import { bidiLabel, dirOf, rtlLang } from './bidi'
import { md, mdDir } from './md'
import { shareNow, shareText } from './share'
import {
  addSaved, allTags, keyOf, personal, editSaved, fill, findSaved, groupSaved, itemTitle, type Note, noteFor, noteShareText, notesAbout, noteTitle,
  type Query, removeNote, removeSaved, reopen, type Result, type Saved, searchNotes, searchSaved, setNote, ST, MAX_ITEMS, MAX_NOTES,
  notes as allNotes, savedItems,
} from './saved'
import type { Sheet } from './answer'

export type SavedHooks = {
  ui: () => string
  /** an answer is on its way, or the app is locked: nothing is asked now */
  busy: () => boolean
  /** ask the chat for a call sheet (no typing, no model), or a question as typed */
  run: (label: string, sheet: Sheet) => void
  ask: (q: string) => void
  /** to the languages view, where a pack is added */
  addLang: () => void
  packName: (lang: string) => string
  /** the menu, Browse and the Map close when an item opens in the chat */
  closeOthers: () => void
}
let hooks: SavedHooks | null = null
export function setSavedHooks(h: SavedHooks) {
  hooks = h
}
const ui = () => hooks?.ui() ?? 'en'

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
function button(cls: string, text: string, on: () => void): HTMLButtonElement {
  const b = el('button', cls, text)
  b.type = 'button'
  b.onclick = on
  return b
}
const dirUi = (l: string) => (rtlLang(l) ? 'rtl' : 'ltr')
/** What a refused change says (the phone is full, or the most there may be). */
const why = (r: Result, l: string, max: number) => (r === 'full' ? ST(l).full : fill(ST(l).many, { n: max }))
/** A delete that asks once more, inside the page (Android's WebView shows no confirm()). */
function deleteButton(l: string, go: () => void): HTMLButtonElement {
  const b = button('sv-act sv-del', ST(l).del, () => {})
  let armed: ReturnType<typeof setTimeout> | null = null
  b.onclick = () => {
    if (!armed) {
      b.textContent = ST(l).confirmDel
      b.classList.add('armed')
      armed = setTimeout(() => { armed = null; b.textContent = ST(l).del; b.classList.remove('armed') }, 4000)
      return
    }
    clearTimeout(armed)
    go()
  }
  return b
}

// ------------------------------------------------------------------------------------------------------------------ notes

/**
 * The box where a note is written (the phone's keyboard can dictate): the note tied to `q` if there is one, Save and Cancel.
 * An empty note saved deletes it. `done` runs after a save or a cancel.
 */
export function noteEditor(q: Query, label: string, l: string, done: () => void): HTMLElement {
  const s = ST(l)
  const box = el('div', 'sv-editor')
  box.dir = dirUi(l)
  const ta = el('textarea', 'sv-ta')
  ta.dir = 'auto'
  ta.rows = 4
  ta.placeholder = s.notePh
  ta.setAttribute('aria-label', s.yourNote)
  ta.value = noteFor(q)?.text ?? ''
  const msg = el('p', 'sv-msg')
  msg.setAttribute('role', 'status')
  const row = el('div', 'sv-acts')
  row.append(
    button('sv-act sv-primary', s.saveNote, () => {
      const r = setNote(q, label, ta.value, l)
      if (r !== 'ok') return void (msg.textContent = why(r, l, MAX_NOTES))
      redrawNotes()
      box.remove()
      done()
    }),
    button('sv-act', s.cancel, () => { box.remove(); done() }),
  )
  box.append(ta, row, msg)
  setTimeout(() => ta.focus(), 0)
  return box
}

/** One note as it shows above an answer or on a card: the person's words, in their own direction. */
function noteText(n: Note): HTMLElement {
  const p = el('p', 'sv-notetext', n.text)
  p.dir = dirOf(n.text)
  return p
}
const SHOWN_NOTES = 3
function fillNotes(host: HTMLElement) {
  host.innerHTML = ''
  let q: Query | null = null
  try { q = JSON.parse(host.dataset.q ?? 'null') } catch {}
  const l = ui()
  host.dir = dirUi(l)
  const list = notesAbout(q).slice(0, SHOWN_NOTES)
  for (const n of list) {
    const head = el('div', 'mynote-head')
    // a note tied to another verse of this passage says which
    const other = q?.k === 'passage' && n.key !== keyOf(q)
    head.appendChild(el('span', '', bidiLabel(other ? `${ST(l).yourNote} · ${noteTitle(n, l)}` : ST(l).yourNote, l)))
    const edit = button('sv-act', ST(l).edit, () => {
      edit.disabled = true
      host.appendChild(noteEditor(n.q, n.label, l, () => { edit.disabled = false }))
    })
    head.appendChild(edit)
    host.append(head, noteText(n))
  }
}
/**
 * "Your note" above an answer (or an article in the panel): the notes tied to it, and to its verses. Empty (and not shown)
 * when there is none: a note written later fills it (redrawNotes).
 */
export function yourNotes(q: Query | null | undefined): HTMLElement {
  const host = el('div', 'mynote')
  host.dataset.q = JSON.stringify(q ?? null)
  fillNotes(host)
  return host
}
/** A note was written, changed or deleted: every "Your note" on the page shows it. */
export function redrawNotes() {
  for (const h of document.querySelectorAll<HTMLElement>('.mynote[data-q]')) fillNotes(h)
  if (savedOpen()) draw()
}

// ------------------------------------------------------------------------------------------------------- the save button

const STAR = '☆', STARRED = '★'
/**
 * ☆ Save / ★ Saved for one query; `ai()`: the online answer to keep with it, when there is one by the time it is tapped (it
 * may arrive after the button is drawn). A tap on ★ takes it out of Saved.
 */
export function saveButton(o: { q: Query; label: string; ai?: () => { text: string; model: string } | undefined; question?: string; cls?: string }): HTMLElement {
  const l = ui()
  const s = ST(l)
  const b = el('button', o.cls ?? 'keep-btn')
  b.type = 'button'
  const msg = el('span', 'keep-msg')
  msg.setAttribute('role', 'status')
  const draw = () => {
    const on = !!findSaved(o.q, !!o.ai?.())
    b.textContent = `${on ? STARRED : STAR} ${on ? s.saved : s.save}`
    b.classList.toggle('on', on)
    b.setAttribute('aria-pressed', String(on))
    b.title = on ? s.unsaveTip : s.saveTip
  }
  let armed: ReturnType<typeof setTimeout> | null = null
  b.onclick = async () => {
    msg.textContent = ''
    const ai = o.ai?.()
    const had = findSaved(o.q, !!ai)
    if (had) {
      // one the person named or grouped: a second tap
      if (personal(had) && !armed) {
        msg.textContent = s.sure
        armed = setTimeout(() => { armed = null; msg.textContent = '' }, 4000)
        return
      }
      if (armed) clearTimeout(armed)
      armed = null
      removeSaved(had.id)
      return void draw()
    }
    // an article is named by its title (the question that found it may have been "what does grace mean?")
    const label = o.q.k === 'article' ? await titleFor(o.q.lang, o.q.id).catch(() => o.label) : o.label
    const r = addSaved({ q: o.q, label, ui: l, ...(ai ? { ai, question: o.question ?? o.label } : {}) })
    if (r.res !== 'ok') msg.textContent = why(r.res, l, MAX_ITEMS)
    draw()
  }
  draw()
  const w = el('span', 'keep-one')
  w.append(b, msg)
  return w
}

/**
 * Under an answer, next to Share: ☆ Save and ✎ Note (its box opens below them). Null when there is nothing to open again
 * (an answer that could not answer).
 */
export function keepButtons(o: { q: Query | null | undefined; label: string; ai?: () => { text: string; model: string } | undefined; question?: string }): HTMLElement | null {
  if (!o.q) return null
  const q = o.q
  const l = ui()
  const row = el('span', 'keep')
  row.dir = dirUi(l)
  const note = el('button', 'keep-btn', `✎ ${ST(l).note}`)
  note.type = 'button'
  note.title = ST(l).noteTip
  note.onclick = () => {
    if (note.disabled) return
    note.disabled = true
    row.after(noteEditor(q, o.label, l, () => { note.disabled = false }))
  }
  row.append(saveButton({ q, label: o.label, ai: o.ai, question: o.question }), note)
  return row
}

// ------------------------------------------------------------------------------------------------------- the Saved view

type Tab = 'saved' | 'notes'
let box: { root: HTMLElement; title: HTMLElement; body: HTMLElement; back: HTMLButtonElement; close: HTMLButtonElement } | null = null
let tab: Tab = 'saved'
let text = ''
let tag: string | null = null
let detail: Saved | null = null
let opener: HTMLElement | null = null

function ensure() {
  if (box) return box
  const root = el('div')
  root.id = 'saved'
  root.tabIndex = -1
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'sv-title')
  const head = el('div', 'ex-head')
  const back = button('ex-btn ex-back', '', () => { detail = null; draw() })
  back.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'
  const title = el('h2', 'ex-title')
  title.id = 'sv-title'
  const close = button('ex-btn', '✕', () => closeSaved())
  head.append(back, title, close)
  const body = el('div', 'ex-body')
  root.append(head, body)
  document.body.appendChild(root)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && savedOpen()) {
      e.preventDefault()
      closeSaved()
    }
  })
  // the PIN lock covers it: it closes under the lock, so nothing is shown behind it
  new MutationObserver(() => { if (savedOpen() && document.querySelector('#lock')) closeSaved(false) }).observe(document.body, { childList: true })
  box = { root, title, body, back, close }
  return box
}

export const savedOpen = () => !!box?.root.classList.contains('open')
/** Opens the Saved view (on its notes with `t`); false under the PIN lock, where nothing of it is shown. */
export function openSaved(t?: Tab): boolean {
  if (typeof document === 'undefined' || document.querySelector('#lock')) return false
  const b = ensure()
  opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
  if (t) tab = t
  detail = null
  b.root.classList.add('open')
  b.root.focus({ preventScroll: true })
  draw()
  return true
}
export function closeSaved(refocus = true) {
  if (!savedOpen()) return
  box!.root.classList.remove('open')
  detail = null
  const to = opener
  opener = null
  if (refocus && to?.isConnected) to.focus({ preventScroll: true })
}
/** Android's back: from an answer back to the list, or closes. False when it is not open. */
export function backSaved(): boolean {
  if (!savedOpen()) return false
  if (detail) {
    detail = null
    draw()
  } else closeSaved()
  return true
}

/** Opens a saved query in the chat the usual way, or says in `status` why it cannot now. */
async function openQuery(q: Query, label: string, status: HTMLElement) {
  const l = ui()
  status.innerHTML = ''
  if (!hooks || hooks.busy()) return void (status.textContent = ST(l).busy)
  const p = await reopen(q, label)
  if (p.k === 'missing') {
    status.appendChild(el('span', '', p.lang ? fill(ST(l).missing, { lang: hooks.packName(p.lang) }) : ST(l).noLang))
    status.appendChild(button('sv-act', ST(l).addLang, () => { closeSaved(false); hooks?.addLang() }))
    return
  }
  if (hooks.busy()) return void (status.textContent = ST(l).busy)
  closeSaved(false)
  hooks.closeOthers()
  if (p.k === 'sheet') hooks.run(p.label, p.sheet)
  else hooks.ask(p.q)
}

const dateOf = (at: number, l: string) => {
  try {
    return new Date(at).toLocaleDateString(l, { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

let list: HTMLElement | null = null
function draw() {
  const b = ensure()
  const l = ui()
  const s = ST(l)
  b.root.dir = dirUi(l)
  b.back.style.visibility = detail ? 'visible' : 'hidden'
  b.back.setAttribute('aria-label', s.back)
  b.close.setAttribute('aria-label', s.close)
  b.body.innerHTML = ''
  if (detail) return drawAnswer(b.body, detail)
  b.title.textContent = s.title
  const tabs = el('div', 'ex-tabs')
  tabs.setAttribute('role', 'tablist')
  for (const [k, label] of [['saved', `${s.title} (${savedItems().length})`], ['notes', `${s.notesTab} (${allNotes().length})`]] as const) {
    const t = button(tab === k ? 'on' : '', bidiLabel(label, l), () => { tab = k; text = ''; draw() })
    t.setAttribute('role', 'tab')
    t.setAttribute('aria-selected', String(tab === k))
    tabs.appendChild(t)
  }
  b.body.appendChild(tabs)
  const kept = (() => { try { return localStorage.getItem('btsm.history') !== 'none' } catch { return true } })()
  b.body.appendChild(el('p', 'ex-note sv-private', kept ? s.private : `${s.private} ${s.notKept}`))
  const find = el('input', 'sv-find')
  find.type = 'search'
  find.dir = 'auto'
  find.placeholder = tab === 'saved' ? s.search : s.searchNotes
  find.setAttribute('aria-label', find.placeholder)
  find.value = text
  find.oninput = () => { text = find.value; drawList() }
  b.body.appendChild(find)
  if (tab === 'saved' && allTags().length) {
    if (tag && !allTags().includes(tag)) tag = null
    const chips = el('div', 'sv-tags')
    for (const t of [null, ...allTags()]) {
      const c = button(tag === t ? 'on' : '', t ?? s.allTags, () => { tag = t; draw() })
      c.dir = 'auto'
      c.setAttribute('aria-pressed', String(tag === t))
      chips.appendChild(c)
    }
    b.body.appendChild(chips)
  }
  list = el('div', 'sv-list')
  b.body.appendChild(list)
  drawList()
}

function drawList() {
  if (!list) return
  const l = ui()
  const s = ST(l)
  list.innerHTML = ''
  if (tab === 'notes') {
    const all = allNotes()
    const ns = searchNotes(text, l)
    if (!all.length) list.appendChild(el('p', 'ex-note', s.emptyNotes))
    else if (!ns.length) list.appendChild(el('p', 'ex-note', s.noMatch))
    for (const n of ns) list.appendChild(noteCard(n))
    return
  }
  const items = searchSaved(text, tag, l)
  if (!savedItems().length) list.appendChild(el('p', 'ex-note', s.empty))
  else if (!items.length) list.appendChild(el('p', 'ex-note', s.noMatch))
  for (const g of groupSaved(items)) {
    list.appendChild(el('h3', '', bidiLabel(`${s.groups[g.kind]} (${g.items.length})`, l)))
    for (const x of g.items) list.appendChild(itemCard(x))
  }
}

/** A saved item: its title (a tap opens it), what it is, its groups and note, and Note · Edit · Delete. */
function itemCard(x: Saved): HTMLElement {
  const l = ui()
  const s = ST(l)
  const card = el('div', 'sv-card')
  card.dir = dirUi(l)
  const status = el('div', 'sv-msg')
  status.setAttribute('role', 'status')
  const title = itemTitle(x, l)
  const open = button('sv-open', '', () => (x.ai ? (detail = x, draw()) : void openQuery(x.q, title, status)))
  const t = open.appendChild(el('span', 'sv-t', title))
  t.dir = dirOf(title)
  const sub = [x.ai ? fill(s.online, { model: x.ai.model }) : '', x.name && x.q.k === 'passage' ? itemTitle({ ...x, name: undefined }, l) : '', dateOf(x.at, l)].filter(Boolean).join(' · ')
  open.appendChild(el('span', 'sv-s', bidiLabel(sub, l)))
  card.appendChild(open)
  if (x.tags.length) {
    const tg = el('div', 'sv-chips')
    for (const g of x.tags) tg.appendChild(el('span', 'sv-chip', g)).dir = 'auto'
    card.appendChild(tg)
  }
  const n = noteFor(x.q)
  if (n) card.appendChild(noteText(n))
  const acts = el('div', 'sv-acts')
  const noteB = button('sv-act', `✎ ${s.note}`, () => {
    noteB.disabled = true
    acts.after(noteEditor(x.q, title, l, () => { noteB.disabled = false }))
  })
  const editB = button('sv-act', s.edit, () => {
    editB.disabled = true
    acts.after(editForm(x, () => { editB.disabled = false }))
  })
  acts.append(noteB, editB, deleteButton(l, () => { removeSaved(x.id); draw() }))
  card.append(acts, status)
  return card
}

/** The person's name for an item and its groups. */
function editForm(x: Saved, done: () => void): HTMLElement {
  const l = ui()
  const s = ST(l)
  const f = el('div', 'sv-editor')
  f.dir = dirUi(l)
  const name = el('input', 'sv-in')
  name.dir = 'auto'
  name.placeholder = s.name
  name.setAttribute('aria-label', s.name)
  name.value = x.name ?? ''
  const tags = el('input', 'sv-in')
  tags.dir = 'auto'
  tags.placeholder = s.tags
  tags.setAttribute('aria-label', s.tags)
  tags.value = x.tags.join(', ')
  const msg = el('p', 'sv-msg')
  const acts = el('div', 'sv-acts')
  acts.append(
    button('sv-act sv-primary', s.save, () => {
      const r = editSaved(x.id, name.value, [tags.value])
      if (r !== 'ok') return void (msg.textContent = why(r, l, MAX_ITEMS))
      draw()
    }),
    button('sv-act', s.cancel, () => { f.remove(); done() }),
  )
  f.append(name, tags, acts, msg)
  setTimeout(() => name.focus(), 0)
  return f
}

/** A note: what it is about (a tap opens that), the person's words, and Edit · Share · Delete. */
function noteCard(n: Note): HTMLElement {
  const l = ui()
  const s = ST(l)
  const card = el('div', 'sv-card')
  card.dir = dirUi(l)
  const status = el('div', 'sv-msg')
  status.setAttribute('role', 'status')
  const title = noteTitle(n, l)
  const open = button('sv-open', '', () => void openQuery(n.q, title, status))
  open.appendChild(el('span', 'sv-t', title)).dir = dirOf(title)
  open.appendChild(el('span', 'sv-s', dateOf(n.at, l)))
  card.append(open, noteText(n))
  const acts = el('div', 'sv-acts')
  const editB = button('sv-act', s.edit, () => {
    editB.disabled = true
    acts.after(noteEditor(n.q, n.label, l, () => { editB.disabled = false }))
  })
  acts.append(editB, button('sv-act', s.share, () => void shareNow(noteShareText(n, l))), deleteButton(l, () => { removeNote(n.id); redrawNotes() }))
  card.append(acts, status)
  return card
}

/** A saved online answer: its text as it was (it cannot be asked again without internet), and Ask again · Note · Share · Delete. */
function drawAnswer(body: HTMLElement, x: Saved) {
  const l = ui()
  const s = ST(l)
  const b = ensure()
  const title = itemTitle(x, l)
  b.title.textContent = title
  b.title.dir = dirOf(title)
  if (x.question && x.question !== title) body.appendChild(el('p', 'sv-q', x.question)).dir = dirOf(x.question)
  const ai = el('div', 'ai')
  ai.appendChild(el('span', 'ai-badge', bidiLabel(fill(s.online, { model: x.ai!.model }), l)))
  const t = el('div', 'ai-text')
  t.dir = mdDir(x.ai!.text)
  t.innerHTML = md(x.ai!.text) // md() escapes everything first
  ai.appendChild(t)
  body.appendChild(ai)
  const n = noteFor(x.q)
  if (n) {
    const h = el('div', 'mynote')
    h.dir = dirUi(l)
    const head = el('div', 'mynote-head')
    head.appendChild(el('span', '', s.yourNote))
    h.append(head, noteText(n))
    body.appendChild(h)
  }
  const status = el('div', 'sv-msg')
  status.setAttribute('role', 'status')
  const acts = el('div', 'sv-acts')
  acts.dir = dirUi(l)
  const noteB = button('sv-act', `✎ ${s.note}`, () => {
    noteB.disabled = true
    acts.after(noteEditor(x.q, title, l, () => { noteB.disabled = false }))
  })
  acts.append(
    button('sv-act sv-primary', s.askAgain, () => void openQuery(x.q, x.question || title, status)),
    noteB,
    button('sv-act', s.share, () => {
      const t = shareText({ who: 'bot', ai: { text: x.ai!.text } }, l, x.question)
      if (t) void shareNow(t)
    }),
    deleteButton(l, () => { removeSaved(x.id); detail = null; draw() }),
  )
  body.append(acts, status)
}
