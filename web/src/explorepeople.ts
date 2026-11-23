// The people tab and the person view of Browse (explore.ts). The tab: a search box and the most named people (or those whose name begins
// with what is typed), one tap to open a person; the lists are made by peoplelist.ts. The person view draws the family tree (tree.ts, treeview.ts).
// It takes its words and what it needs from Browse as arguments, so it never imports explore.ts (no cycle).
import { bidiLabel, rtlLang } from './bidi'
import { count } from './usage'
import { buildTree, type TreeMode } from './tree'
import { renderTree } from './treeview'
import { familyCredit, treeBarItems, treeBase, treeStep, treeWords, type TreeBarItem } from './pipeline'
import type { Followup } from './converse'
import type { Sheet } from './answer'
import { KT } from './kin'
import { findPeople, tieLine, verseLine, type PersonRow } from './peoplelist'

export type PeopleText = {
  /** the search box's label and placeholder */
  search: string
  /** a search that found nobody */
  none: string
  /** there are more than the rows shown */
  more: string
  /** the list could not be read */
  fail: string
  loading: string
  /** "in {lang}": a person found in a pack that is not the first */
  inLang: string
}
export type PeopleCtx = {
  ui: string
  /** the packs with a people index built, in Browse's order (peoplePacks) */
  packs: string[]
  name: (pack: string) => string
  text: PeopleText
  /** Browse's drawn chevron */
  chevron: () => HTMLElement
  /** a person was tapped (`name`: the name the row showed) */
  onOpen: (pack: string, id: string, name: string) => void
}

const DEBOUNCE = 160
let gen = 0 // each drawing of the tab is one; a later drawing (or any other view) makes the earlier one's timer and answers void
let pending: ReturnType<typeof setTimeout> | undefined
/** Browse draws something else (or the tab again): what the tab was waiting for is let go (its debounce, its lines not yet in). */
export function stopPeopleTab() {
  gen++
  clearTimeout(pending)
  live = null
}
let live: { packs: (p: string[]) => void } | null = null
/** Another pack's people were read while the tab is on screen: they are added to the search in place (the box is not drawn again). */
export function updatePeoplePacks(packs: string[]) {
  live?.packs(packs)
}
let lastQuery = '' // kept while the app is open: Back from a person finds the search as it was
/** Tests and a change of packs: forget the search. */
export function resetPeopleTab() {
  lastQuery = ''
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** The people tab: the search box, then the list (made the first time with "Opening…"). */
export function renderPeopleTab(body: HTMLElement, c: PeopleCtx): void {
  const dir = rtlLang(c.ui) ? 'rtl' : 'ltr'
  const wrap = el('div', 'ex-people')
  const input = el('input', 'ex-psearch')
  input.type = 'search'
  input.value = lastQuery
  input.placeholder = c.text.search
  input.setAttribute('aria-label', c.text.search)
  input.setAttribute('autocomplete', 'off')
  input.setAttribute('autocapitalize', 'off')
  input.setAttribute('spellcheck', 'false')
  input.setAttribute('enterkeyhint', 'search')
  input.dir = 'auto' // what is typed goes in its own direction (a Hebrew or Arabic name in an English app)
  const out = el('div', 'ex-plist')
  wrap.append(input, out)
  body.appendChild(wrap)

  stopPeopleTab()
  const my = gen
  let token = 0
  let started = lastQuery.trim() !== '' // a search is counted once, when the box goes from empty to something, not by key

  const show = async (q: string, first = false) => {
    const mine = ++token
    out.replaceChildren()
    if (first) out.appendChild(el('p', 'ex-note ex-opening', c.text.loading))
    const found = await findPeople(c.packs, q).catch(() => null)
    if (mine !== token || my !== gen) return // typed again meanwhile, or Browse moved on
    out.replaceChildren()
    if (!found) {
      out.appendChild(el('p', 'ex-note ex-pfail', c.text.fail))
      return
    }
    if (!found.rows.length) {
      out.appendChild(el('p', 'ex-note ex-pnone', c.text.none))
      return
    }
    const rows = el('div', 'ex-rows ex-prows')
    rows.dir = dir
    const subs: [PersonRow, HTMLElement][] = []
    for (const r of found.rows) {
      const row = el('button', 'ex-row')
      row.type = 'button'
      row.dataset.pack = r.pack
      row.dataset.id = r.id
      row.onclick = () => {
        c.onOpen(r.pack, r.id, r.name)
      }
      const t = el('span', 'ex-row-t', bidiLabel(r.name, c.ui))
      t.dir = rtlLang(r.pack) ? 'rtl' : 'ltr'
      const s = el('span', 'ex-row-s')
      s.textContent = bidiLabel(subOf(c, r, verseLine(c.ui, r)), c.ui)
      row.append(t, s, c.chevron())
      rows.appendChild(row)
      if (r.dup) subs.push([r, s])
    }
    out.appendChild(rows)
    if (found.more) out.appendChild(el('p', 'ex-note ex-pmore', c.text.more))
    // the rows with a name another has: who they are in a line (after the list is drawn: nothing waits for it)
    for (const [r, s] of subs) {
      void tieLine(c.ui, r).then((line) => {
        if (mine === token && my === gen && line) s.textContent = bidiLabel(subOf(c, r, line), c.ui)
      }).catch(() => {})
    }
  }

  input.oninput = () => {
    const q = input.value
    lastQuery = q
    if (q.trim() === '') started = false
    else if (!started) {
      started = true
      count('explore.people.search')
    }
    if (my !== gen) return
    clearTimeout(pending)
    pending = setTimeout(() => { if (my === gen) void show(q) }, DEBOUNCE)
  }
  live = {
    packs: (p) => {
      const first = c.packs[0]
      c.packs = p
      // (no search and the same first pack: the list is the same, nothing to draw)
      if (input.value.trim() === '' && p[0] === first) return
      void show(input.value)
    },
  }
  void show(lastQuery, true)
}

/** The line under a name: what is known of the person, and the language when it is not the first pack's. */
function subOf(c: PeopleCtx, r: PersonRow, line: string): string {
  const lang = r.inLang ? c.text.inLang.replace('{lang}', c.name(r.inLang)) : ''
  return [line, lang].filter(Boolean).join(' · ')
}

export type PersonText = {
  loading: string
  /** the family could not be read */
  fail: string
  /** the data has no family for the person */
  empty: string
}
export type PersonCtx = {
  ui: string
  text: PersonText
  /** the name the row showed: the title until the tree names the person, and the name when the data has none for them */
  hint?: string
  /** the view's title, once the name is known */
  setTitle: (name: string) => void
  /** a tap on a person or a tree button: another person view on top of this one (Browse stays open) */
  onOpen: (pack: string, id: string, mode: TreeMode) => void
  /** a button that answers in the chat (a person's card or article, a verse, a story): `runInChat` of Browse */
  onChat: (label: string, sheet: Sheet) => void
}

/**
 * The view of one person: their family tree (tree.ts, the same one the chat draws, treeview.ts) with its notice and the credit line of
 * the data. A tap on a name opens the bar under it; its tree buttons ("Tree of X", "Ancestors of X") open that person here, the others
 * (the person, the verse of the tie, a story) run in the chat. Back is the stack's: one person at a time.
 */
export function renderPerson(body: HTMLElement, v: { pack: string; id: string; mode: TreeMode }, c: PersonCtx): void {
  const wrap = el('div', 'ex-person')
  wrap.dataset.pack = v.pack
  wrap.dataset.id = v.id
  wrap.dataset.mode = v.mode
  wrap.appendChild(el('p', 'ex-note ex-opening', c.text.loading))
  body.appendChild(wrap)
  if (c.hint) c.setTitle(c.hint) // (the name the row showed, until the tree says it)
  void (async () => {
    try {
      const view = await buildTree(v.pack, v.id, v.mode, c.ui)
      const credit = await familyCredit(v.pack, c.ui, v.id).catch(() => '')
      // the name: the tree's («(sin nombre)» for a person the data names nothing real); the row's name only when there is one (a raw own
      // name shown by an alias); never a raw id
      if (c.hint && (view.focus.unnamed || view.focus.name === v.id)) {
        view.focus = { ...view.focus, name: c.hint }
        delete view.focus.unnamed
      } else if (view.focus.name === v.id) view.focus = { ...view.focus, name: KT(c.ui).unnamed, unnamed: true }
      c.setTitle(view.focus.name)
      const base = treeBase(v.pack)
      // what each button of the tree is: the chat's buttons, and what Browse does with them
      const items = new Map<Followup, TreeBarItem>()
      const note = (kind: 'tree' | 'up', id: string, name: string): Followup => {
        const follow = treeStep(base, view.ui, kind, id, name)
        items.set(follow, { kind, id, follow })
        return follow
      }
      const button = (f: Followup): HTMLButtonElement => {
        const it = items.get(f)
        const b = el('button', '', bidiLabel(f.label, view.ui))
        b.type = 'button'
        if (it) b.dataset.kind = it.kind
        if (it?.id) b.dataset.id = it.id
        b.onclick = () => {
          if (it && (it.kind === 'tree' || it.kind === 'up') && it.id) c.onOpen(v.pack, it.id, it.kind)
          else if (f.sheet) c.onChat(f.label, f.sheet)
        }
        return b
      }
      const tree = renderTree(view, {
        bar: async (id, from) => {
          const its = await treeBarItems(base, view.ui, id, from, view.mode, view.focus.id)
          for (const it of its) items.set(it.follow, it)
          return its.map((i) => i.follow)
        },
        button,
        words: treeWords(view.ui, view),
        ancestors: view.mode === 'tree' ? note('up', view.focus.id, view.focus.name) : undefined,
        treeOf: (id) => note('tree', id, view.nodes.find((n) => n.id === id)?.name ?? ''),
      })
      const block = el('div', 'tree-block')
      block.appendChild(tree)
      const nothing = !view.parents.length && !view.partners.length && !view.siblings.length && !view.nodes.length && !view.line?.length
      if (nothing) block.appendChild(el('p', 'ex-note ex-pempty', c.text.empty))
      if (credit) {
        const p = el('p', 'credit', credit)
        p.dir = rtlLang(c.ui) ? 'rtl' : 'ltr'
        block.appendChild(p)
      }
      wrap.replaceChildren(block)
    } catch {
      // (anything that went wrong, the reading or the drawing: said, with Back there; never «Opening…» for good)
      wrap.replaceChildren(el('p', 'ex-note ex-pfail', c.text.fail))
    }
  })()
}
