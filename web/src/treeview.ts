/**
 * Draws a family tree (tree.ts, handoff/mini-servant/diseno-arboles.md §4.2-§4.5, §5): HTML and CSS only, one column, every name a
 * real button, branches folded (a closed branch is not in the DOM until it is opened), a tap on a name opens a bar under its row
 * (the buttons come from `o.bar`). Logical CSS properties so Arabic runs right to left; theme variables for dark mode; no
 * animation; no innerHTML: every text goes in with textContent.
 */
import type { Followup } from './converse'
import { KT } from './kin'
import type { TP, TreeView } from './tree'

/** The words of the tree in the answer's language. Templates hold `{x}` (a name) or `{n}` (a number). */
export type TreeWords = {
  title: string
  note: string
  parents: string
  /** «Esposa:», «Esposos:»... one label per case */
  wife: string
  wives: string
  husband: string
  spouses: string
  siblings: string
  children: string
  /** «Con {x}» */
  withP: string
  noMother: string
  noFather: string
  /** «Otro progenitor no nombrado en los datos»: the children's group with no other parent when the focus's gender is not known (absent: KIN_T's) */
  noParent?: string
  unnamed: string
  /** «{n} generaciones sin nombre en los datos» */
  gap: string
  upEnd: string
  /** «(los datos también dicen: {x})» */
  alsoSays: string
  /** «hijo de {x}» / «hija de {x}», by the child's gender (a child of unknown gender gets `childOf`) */
  childOf: string
  daughterOf: string
  /** «y {x}», the mother shown small next to the father in the ancestors line */
  and: string
  /** «Mostrar los hijos de {x}» / «Ocultar los hijos de {x}» */
  showKids: string
  hideKids: string
  /** accessible words after a name: «hijo», «hija» */
  sonL: string
  daughterL: string
  /** «+{n}» */
  more: string
  /** «(medio hermano)» */
  half: string
}
export type TreeOptions = {
  /** the buttons of the bar under a tapped name; `fromId` is the person it hangs from in the tree */
  bar: (id: string, fromId: string | null) => Promise<Followup[]>
  /** `followButton` of main.ts */
  button: (f: Followup) => HTMLButtonElement
  words: TreeWords
  /** «Antepasados de X» (the tree's top; absent: none drawn) */
  ancestors?: Followup
  /** the tree of a person at the cap (4 generations or 150 people): its «▸ N» opens that answer instead of unfolding */
  treeOf?: (id: string) => Followup
}

const CSS = `
.tv { margin: 4px 0 8px; font: 14px/1.4 system-ui, sans-serif; color: var(--fg); }
.tv-title { font-weight: 600; margin: 0 0 2px; }
.tv-note { font-size: 12px; color: var(--muted); margin: 0 0 8px; }
.tv-top { margin: 0 0 8px; }
.tv-boxes { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 6px; }
.tv-box { flex: 1 1 140px; min-width: 140px; border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; background: var(--card); }
.tv-box.focus { border-color: var(--accent); background: var(--accent-soft); font-weight: 600; margin: 0 0 6px; }
.tv-small { font-size: 12px; color: var(--muted); }
.tv-mother { margin-inline-start: 6px; }
.tv-line { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin: 4px 0; }
.tv-lab { font-size: 13px; color: var(--muted); }
.tv-name { font: 14px/1.25 system-ui, sans-serif; color: var(--fg); background: transparent; border: 1px solid var(--line); border-radius: 8px;
  padding: 4px 8px; min-height: 36px; text-align: start; }
.tv-name[aria-expanded=true] { border-color: var(--accent); background: var(--accent-soft); }
.tv-name.un, .tv-un { font-style: italic; color: var(--muted); }
.tv-name.sm { font-size: 12px; min-height: 32px; padding: 2px 6px; color: var(--muted); }
.tv-g { font-size: 12px; color: var(--muted); padding-inline-start: 4px; }
.tv-more { font: 13px/1.25 system-ui, sans-serif; color: var(--accent); background: transparent; border: 1px solid var(--line); border-radius: 8px; padding: 4px 8px; min-height: 36px; }
.tv-head { font-size: 13px; font-weight: 600; color: var(--muted); margin: 10px 0 2px; }
.tv { --tv-rail: var(--muted); }
@supports (color: color-mix(in srgb, red, blue)) { .tv { --tv-rail: color-mix(in srgb, var(--muted) 60%, transparent); } }
.tv-kids { margin: 0; padding: 0; margin-inline-start: 8px; }
.tv-item { position: relative; padding: 3px 0; padding-inline: 10px 0; }
.tv-item::before { content: ""; position: absolute; inset-inline-start: 0; top: 0; bottom: 0; border-inline-start: 2px solid var(--tv-rail); }
.tv-item:last-child::before { bottom: auto; height: 21px; }
.tv-item::after { content: ""; position: absolute; inset-inline-start: 0; top: 21px; width: 8px; border-top: 2px solid var(--tv-rail); }
.tv-row { display: flex; align-items: center; gap: 8px; margin: 0; }
.tv-tog { flex: none; width: 36px; min-width: 36px; height: 36px; font: 12px/1 system-ui, sans-serif; color: var(--accent); background: transparent;
  border: 1px solid var(--line); border-radius: 8px; padding: 0; }
.tv-tog.cap { width: auto; padding: 0 6px; }
.tv-bar { display: flex; flex-wrap: wrap; gap: 6px; min-height: 40px; align-items: center; margin: 2px 0 6px; margin-inline-start: 6px; padding: 4px 6px;
  border: 1px dashed var(--line); border-radius: 8px; background: var(--card); color: var(--muted); }
.tv-bar button, .tv-top button { font: 13px/1.3 system-ui, sans-serif; color: var(--fg); background: transparent; border: 1px solid var(--line); border-radius: 14px; padding: 6px 10px; min-height: 36px; }
.tv-up { position: relative; margin: 0 0 0 8px; padding: 4px 0; padding-inline: 10px 0; }
.tv-up::before { content: ""; position: absolute; inset-inline-start: 0; top: 0; bottom: 0; border-inline-start: 2px solid var(--tv-rail); }
.tv-up.last::before { bottom: auto; height: 22px; }
.tv-up::after { content: ""; position: absolute; inset-inline-start: 0; top: 22px; width: 8px; border-top: 2px solid var(--tv-rail); }
.tv-up > .tv-line { margin: 0; }
.tv-up > .tv-un { display: block; line-height: 36px; }
.tv-end { font-size: 13px; color: var(--muted); font-style: italic; margin: 6px 0; }
`
function css() {
  if (document.getElementById('tv-css')) return
  const st = document.createElement('style')
  st.id = 'tv-css'
  st.textContent = CSS
  document.head.appendChild(st)
}
function el(tag: string, cls: string, text?: string): HTMLElement {
  const d = document.createElement(tag)
  if (cls) d.className = cls
  if (text !== undefined) d.textContent = text
  return d
}
const fill = (tpl: string, k: string, v: string) => tpl.split(`{${k}}`).join(v)
/** right to left is decided by the answer's language only, never by the page */
const isRtl = (ui: string): boolean => ui === 'ar'
const MARK = ['', '♂', '♀']

/** A family tree as the bubble shows it. */
export function renderTree(v: TreeView, o: TreeOptions): HTMLElement {
  css()
  const w = o.words
  const rtl = isRtl(v.ui)
  const OPEN = rtl ? '◂' : '▸'
  const root = el('div', 'tv')
  root.dir = rtl ? 'rtl' : 'ltr'

  // ---- selection (§4.5): one name marked at a time; its bar sits right under its row
  let cur: { btn: HTMLElement; bar: HTMLElement } | null = null
  const closeBar = () => {
    if (!cur) return
    cur.btn.classList.remove('sel')
    cur.btn.setAttribute('aria-expanded', 'false')
    cur.bar.remove()
    cur = null
  }
  /** a name as a button; `anchor()` gives the element after which its bar goes; `from` the person it hangs from */
  function name(p: TP, anchor: () => HTMLElement, from: string | null, extra = '', desc = false): HTMLButtonElement {
    const b = el('button', `tv-name${p.unnamed ? ' un' : ''}${extra ? ` ${extra}` : ''}`) as HTMLButtonElement
    b.type = 'button'
    b.appendChild(el('span', 'tv-n', p.unnamed ? w.unnamed : p.name))
    if (p.g) b.appendChild(el('bdi', 'tv-g', MARK[p.g]))
    // «hijo», «hija» only for a descendant's row; a parent, spouse or sibling gets no such word
    const word = !desc ? '' : p.g === 1 ? w.sonL : p.g === 2 ? w.daughterL : ''
    b.setAttribute('aria-label', word ? `${p.unnamed ? w.unnamed : p.name}, ${word}` : p.unnamed ? w.unnamed : p.name)
    b.setAttribute('aria-expanded', 'false')
    b.onclick = () => {
      const same = cur?.btn === b
      closeBar()
      if (same) return
      const bar = el('div', 'tv-bar', '…')
      b.classList.add('sel')
      b.setAttribute('aria-expanded', 'true')
      anchor().after(bar)
      const mine = { btn: b as HTMLElement, bar }
      cur = mine
      o.bar(p.id, from).then(
        (fs) => {
          if (cur !== mine) return
          bar.textContent = ''
          for (const f of fs) bar.appendChild(o.button(f))
        },
        () => { if (cur === mine) bar.textContent = '' },
      )
    }
    return b
  }
  /** a name inside a line: its bar goes after the line */
  const inLine = (line: HTMLElement, p: TP, from: string | null) => name(p, () => line, from)
  /** a template with `{x}` where a name button goes */
  function withName(tpl: string, btn: HTMLElement, cls = 'tv-lab'): HTMLElement {
    const [a, b = ''] = tpl.split('{x}')
    const s = el('span', cls)
    if (a) s.append(a)
    s.appendChild(btn)
    if (b) s.append(b)
    return s
  }
  /** the person's box: the gender mark in a <bdi>, like the buttons' */
  const focusBox = (f: TP): HTMLElement => {
    const b = el('div', 'tv-box focus')
    b.appendChild(el('span', 'tv-n', f.name))
    if (f.g) b.appendChild(el('bdi', 'tv-g', MARK[f.g]))
    return b
  }
  const ofWord = (child: TP) => (child.g === 2 ? w.daughterOf : w.childOf)

  // ---- top
  root.appendChild(el('p', 'tv-title', w.title))
  root.appendChild(el('p', 'tv-note', w.note))
  if (o.ancestors && v.mode === 'tree') {
    const top = el('div', 'tv-top')
    top.appendChild(o.button(o.ancestors))
    root.appendChild(top)
  }

  if (v.mode === 'up') {
    drawUp(root, v)
    return root
  }

  // parents: a box each, with its own parents
  if (v.parents.length) {
    root.appendChild(el('div', 'tv-lab', w.parents))
    const boxes = el('div', 'tv-boxes')
    for (const p of v.parents) {
      const box = el('div', 'tv-box')
      box.appendChild(name(p, () => boxes, v.focus.id))
      if (p.up.length) {
        // the grandparents: small name buttons, each hanging from this parent
        const [a, b = ''] = ofWord(p).split('{x}')
        const small = el('div', 'tv-small')
        if (a) small.append(a)
        p.up.forEach((u, k) => {
          if (k) small.append(rtl ? '، ' : ', ')
          small.appendChild(name(u, () => boxes, p.id, 'sm'))
        })
        if (b) small.append(b)
        box.appendChild(small)
      }
      boxes.appendChild(box)
    }
    root.appendChild(boxes)
  }
  // the person
  root.appendChild(focusBox(v.focus))
  if (v.partners.length) {
    const line = el('div', 'tv-line')
    const gs = v.partners.map((p) => p.g)
    const lab = v.partners.length === 1
      ? gs[0] === 2 ? w.wife : gs[0] === 1 ? w.husband : w.spouses
      : gs.every((g) => g === 2) ? w.wives : w.spouses
    line.appendChild(el('span', 'tv-lab', lab))
    for (const p of v.partners) line.appendChild(inLine(line, p, v.focus.id))
    root.appendChild(line)
  }
  if (v.siblings.length) {
    const line = el('div', 'tv-line')
    line.appendChild(el('span', 'tv-lab', w.siblings))
    const add = (p: TP, at?: HTMLElement) => {
      const b = inLine(line, p, v.focus.id)
      if (at) at.before(b)
      else line.appendChild(b)
      if (p.half) b.after(el('span', 'tv-small', w.half))
    }
    const first = v.siblings.slice(0, 4)
    const rest = v.siblings.slice(4)
    for (const p of first) add(p)
    if (rest.length) {
      const m = el('button', 'tv-more', fill(w.more, 'n', String(rest.length))) as HTMLButtonElement
      m.type = 'button'
      m.setAttribute('aria-label', `${w.siblings} ${m.textContent}`)
      m.onclick = () => {
        for (const p of rest) add(p, m)
        m.remove()
      }
      line.appendChild(m)
    }
    root.appendChild(line)
  }
  // children, by the other parent when there are two groups or more
  if (v.groups.length) {
    root.appendChild(el('div', 'tv-lab', w.children))
    const many = v.groups.length > 1
    for (const g of v.groups) {
      if (many) {
        const label = g.with ? fill(w.withP, 'x', g.with.unnamed ? w.unnamed : g.with.name) : v.focus.g === 2 ? w.noFather : v.focus.g === 1 ? w.noMother : w.noParent ?? KT(v.ui).noParent
        root.appendChild(el('div', 'tv-head', `${label} (${g.kids.length})`))
      }
      list(root, g.kids, 1, v.focus.id)
    }
  }
  return root

  /** the rows of one generation of descendants */
  function list(host: HTMLElement, idxs: number[], gen: number, parentId: string) {
    const ul = el('div', 'tv-kids')
    for (const i of idxs) {
      const n = v.nodes[i]
      if (!n) continue
      const item = el('div', 'tv-item')
      const row = el('div', 'tv-row')
      item.appendChild(row)
      let kidsEl: HTMLElement | null = null
      if (n.n > 0 && n.kids?.length) {
        const tog = el('button', 'tv-tog') as HTMLButtonElement
        tog.type = 'button'
        const paint = (open: boolean) => {
          tog.textContent = `${open ? '▾' : OPEN} ${n.n}`
          tog.setAttribute('aria-expanded', String(open))
          tog.setAttribute('aria-label', fill(open ? w.hideKids : w.showKids, 'x', n.unnamed ? w.unnamed : n.name))
        }
        const show = (open: boolean) => {
          if (open && !kidsEl) {
            // the branch is built the first time it is opened
            kidsEl = el('div', 'tv-branch')
            list(kidsEl, n.kids!, gen + 1, n.id)
            item.appendChild(kidsEl)
          }
          if (kidsEl) kidsEl.hidden = !open
          paint(open)
        }
        tog.onclick = () => show(tog.getAttribute('aria-expanded') !== 'true')
        row.appendChild(tog)
        show(gen < v.open)
      } else if (n.n > 0 && !n.kids?.length && o.treeOf) {
        // at the cap: no children loaded; its button opens its own tree
        const t = o.button(o.treeOf(n.id))
        t.className = 'tv-tog cap'
        t.setAttribute('aria-label', t.textContent ?? '')
        t.textContent = `${OPEN} ${n.n}`
        row.appendChild(t)
      } else if (n.n > 0 && !n.kids?.length) {
        const t = el('span', 'tv-tog cap', `${OPEN} ${n.n}`)
        row.appendChild(t)
      }
      row.appendChild(name(n, () => row, parentId, '', true))
      ul.appendChild(item)
    }
    host.appendChild(ul)
  }

  function drawUp(host: HTMLElement, view: TreeView) {
    host.appendChild(focusBox(view.focus))
    let child: TP = view.focus
    let from: string | null = view.focus.id
    const rows = view.line ?? []
    rows.forEach((r, ri) => {
      const row = el('div', ri === rows.length - 1 ? 'tv-up last' : 'tv-up')
      // the open bar goes inside the row, after its last block, so the rail runs past it
      let tail: HTMLElement = row
      const at = () => tail
      if (r.gap) {
        row.appendChild(el('span', 'tv-un', fill(w.gap, 'n', String(r.gap))))
      } else {
        const main = el('div', 'tv-line')
        main.appendChild(withName(ofWord(child), name(r.p, at, from), 'tv-lab'))
        row.appendChild(main)
        tail = main
        if (r.mother) {
          const m = el('span', 'tv-small tv-mother')
          m.appendChild(withName(w.and, name(r.mother, at, from), 'tv-small'))
          main.appendChild(m)
        }
        if (r.others?.length) {
          const os = el('div', 'tv-small')
          const [a, b = ''] = w.alsoSays.split('{x}')
          if (a) os.append(a)
          r.others.forEach((z, k) => {
            if (k) os.append(rtl ? '، ' : ', ')
            os.appendChild(name(z, at, from))
          })
          if (b) os.append(b)
          row.appendChild(os)
          tail = os
        }
      }
      host.appendChild(row)
      child = r.p
      from = r.p.id
    })
    if (!view.cut) host.appendChild(el('p', 'tv-end', w.upEnd))
  }
}
