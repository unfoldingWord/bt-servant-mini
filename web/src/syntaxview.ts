/**
 * Draws a MACULA answer (macula.ts): who is who in a verse, and a verse's sentence as nested clause boxes with role chips
 * (S, V, O… in the app's language, with a short legend). Words are in the gateway language; a tap shows the original word
 * (and "Show the original words" shows them all). Deep subclauses fold. Right to left in the Arabic app, logical CSS
 * properties throughout, the original's runs isolated (Hebrew right to left, Greek left to right). No innerHTML: every text
 * goes in with textContent.
 */
import { MW, roleName, type MacView, type TNode, type TWord, type WhoItem } from './macula'

const CSS = `
.mac { --mac-s: var(--accent); --mac-v: var(--ok); --mac-o: #3a6ea5; --mac-p: #8a5aa8; margin: 4px 0 8px; }
@media (prefers-color-scheme: dark) { .mac { --mac-o: #86afe0; --mac-p: #c7a3e0; } }
.mac .orig { font-size: 13px; color: var(--muted); unicode-bidi: isolate; }
.mac .orig[lang=hbo] { font-size: 15px; }
.mac-src { font-size: 12px; color: var(--faint); margin: 8px 0 0; }
.mac-note { font-size: 13px; color: var(--muted); margin: 6px 0; }
.who-v { font-weight: 600; margin: 10px 0 4px; }
.who { list-style: none; margin: 0; padding: 0; }
.who li { padding: 8px 0; border-bottom: 1px solid var(--line); line-height: 1.5; }
.who li:last-child { border-bottom: 0; }
.who .said { font-weight: 600; unicode-bidi: isolate; }
.who .role { font-size: 12px; color: var(--muted); border: 1px solid var(--line); border-radius: 10px; padding: 0 6px; white-space: nowrap; }
.who .arrow { color: var(--muted); padding: 0 4px; }
.who .to { font-weight: 600; color: var(--accent); unicode-bidi: isolate; }
.who .none { font-size: 12px; color: var(--muted); font-style: italic; }
.mac-legend { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 12px; color: var(--muted); margin: 4px 0 8px; align-items: center; }
.mac-legend span { white-space: nowrap; }
.mac-tools { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.mac-tools button { font: 13px/1.3 system-ui, sans-serif; color: var(--fg); background: transparent; border: 1px solid var(--line); border-radius: 14px; padding: 6px 10px; min-height: 36px; }
.syn-clause { border: 1px solid var(--line); border-radius: 8px; padding: 4px 6px; margin: 4px 0; background: var(--card); }
.syn-clause.emb { border-style: dashed; }
.syn-clause > summary { font-size: 12px; color: var(--muted); cursor: pointer; padding: 2px 0; list-style-position: inside; }
.syn-row { display: flex; gap: 6px; align-items: flex-start; padding: 3px 0; }
.syn-row + .syn-row { border-top: 1px dotted var(--line); }
.syn-chip { flex: none; min-width: 28px; text-align: center; font: 600 11px/1.2 system-ui, sans-serif; border-radius: 6px; padding: 4px 4px; margin-top: 3px;
  color: var(--muted); border: 1px solid var(--line); white-space: nowrap; }
.syn-chip.r-s { color: var(--mac-s); border-color: var(--mac-s); }
.syn-chip.r-v, .syn-chip.r-vc, .syn-chip.r-aux { color: var(--mac-v); border-color: var(--mac-v); }
.syn-chip.r-o, .syn-chip.r-o2, .syn-chip.r-io { color: var(--mac-o); border-color: var(--mac-o); }
.syn-chip.r-p { color: var(--mac-p); border-color: var(--mac-p); }
.syn-chip.r-amp { border-style: dashed; font-weight: 400; }
.syn-body { flex: 1; min-width: 0; }
.syn-words { display: flex; flex-wrap: wrap; gap: 4px; }
.syn-w { font: 14px/1.25 system-ui, sans-serif; color: var(--fg); background: transparent; border: 1px solid transparent; border-radius: 6px;
  padding: 3px 5px; min-height: 32px; text-align: start; display: inline-flex; flex-direction: column; align-items: flex-start; }
.syn-w:active, .syn-w.show { border-color: var(--line); background: var(--accent-soft); }
.syn-w .gl { unicode-bidi: isolate; }
.syn-w .orig.only { display: block; font-size: 17px; line-height: 1.2; }
.syn-w .orig { display: none; }
.syn-w.show .orig, .mac.all .syn-w .orig { display: block; }
.syn-amp .syn-w { font-size: 13px; color: var(--muted); }
.syn-more { font-size: 12px; color: var(--muted); font-style: italic; margin: 4px 0; }
`
function css() {
  if (document.getElementById('mac-css')) return
  const st = document.createElement('style')
  st.id = 'mac-css'
  st.textContent = CSS
  document.head.appendChild(st)
}
function el(tag: string, cls: string, text?: string): HTMLElement {
  const d = document.createElement(tag)
  if (cls) d.className = cls
  if (text !== undefined) d.textContent = text
  return d
}
const rtl = (ui: string) => ui === 'ar'
/** The original word, isolated in its own direction: Hebrew right to left, Greek left to right. */
function orig(text: string, greek: boolean): HTMLElement {
  const s = el('span', 'orig', text)
  s.lang = greek ? 'grc' : 'hbo'
  s.dir = greek ? 'ltr' : 'rtl'
  return s
}
/** A text in the gateway language, in its own direction (an Arabic word in the English app reads right to left). */
function gate(cls: string, text: string): HTMLElement {
  const s = el('span', cls, text)
  s.dir = 'auto'
  return s
}

/** A MACULA answer as the bubble shows it. */
export function renderMacula(v: MacView): HTMLElement {
  css()
  const root = el('div', 'mac')
  root.dir = rtl(v.ui) ? 'rtl' : 'ltr'
  if (v.kind === 'who') renderWho(root, v)
  else renderTree(root, v)
  root.appendChild(el('p', 'mac-src', v.source))
  return root
}

function renderWho(root: HTMLElement, v: Extract<MacView, { kind: 'who' }>) {
  for (const x of v.verses) {
    if (v.verses.length > 1) root.appendChild(el('div', 'who-v', x.label))
    const ul = el('ul', 'who')
    for (const it of x.items) ul.appendChild(whoLine(it, v.greek, v.ui))
    root.appendChild(ul)
  }
}
function whoLine(it: WhoItem, greek: boolean, ui: string): HTMLElement {
  const w = MW(ui)
  const li = el('li', '')
  li.appendChild(gate('said', it.gl || it.orig))
  li.append(' ')
  li.appendChild(orig(it.orig, greek))
  li.append(' ')
  li.appendChild(el('span', 'role', w.roles[it.role]))
  li.appendChild(el('span', 'arrow', rtl(ui) ? ' ← ' : ' → '))
  if (it.to.gl) {
    li.appendChild(gate('to', it.to.gl))
    li.append(' ')
    li.appendChild(orig(it.to.orig, greek))
  } else {
    // the entity has no word in this Bible text: said plainly, with the original
    li.appendChild(orig(it.to.orig, greek))
    li.append(' ')
    li.appendChild(el('span', 'none', `(${w.unmapped})`))
  }
  return li
}

function renderTree(root: HTMLElement, v: Extract<MacView, { kind: 'tree' }>) {
  const w = MW(v.ui)
  // the roles this diagram uses, each with its name (the legend), in a fixed order
  const used = new Set<string>()
  const collect = (n: TNode) => { if (!hidden(n)) used.add(n.role); n.kids.forEach((k) => k.k === 'n' && collect(k)) }
  v.tree.sentences.forEach((s) => collect(s.root))
  const legend = el('div', 'mac-legend')
  legend.appendChild(el('strong', '', `${w.legend}:`))
  for (const r of ['s', 'v', 'vc', 'aux', 'o', 'o2', 'io', 'p', 'adv', 'pp', '&']) {
    if (!used.has(r)) continue
    const [short, name] = roleName(v.ui, r)
    legend.appendChild(el('span', '', short === name ? name : `${short} = ${name}`))
  }
  root.appendChild(legend)
  const tools = el('div', 'mac-tools')
  const all = el('button', '', w.showOrig) as HTMLButtonElement
  all.type = 'button'
  all.setAttribute('aria-pressed', 'false')
  all.onclick = () => {
    const on = root.classList.toggle('all')
    all.textContent = on ? w.hideOrig : w.showOrig
    all.setAttribute('aria-pressed', String(on))
  }
  tools.appendChild(all)
  root.appendChild(tools)
  // small verses open whole; in longer ones, clauses inside clauses fold
  const words = v.tree.sentences.reduce((n, s) => n + s.words, 0)
  const foldAt = words <= 12 ? 99 : 3
  for (const s of v.tree.sentences) {
    if (s.before && v.from) root.appendChild(el('p', 'syn-more', `… ${v.from}`))
    root.appendChild(node(s.root, 0, foldAt, v))
    if (s.after && v.next) root.appendChild(el('p', 'syn-more', `${v.next} …`))
  }
}
/** A connector that is only a prefix of the next word (Hebrew וַ): not drawn, its "and" is in that word ("And he said"). */
const hidden = (n: TNode): boolean => n.role === '&' && n.kids.every((x) => x.k === 'w' && x.part && !x.gl)
const count = (n: TNode): number => n.kids.reduce((k, x) => k + (x.k === 'w' ? 1 : count(x)), 0)
const firstWords = (n: TNode, max = 3): string => {
  const out: string[] = []
  const walk = (x: TNode) => { for (const k of x.kids) { if (out.length >= max) return; if (k.k === 'w') { if (k.gl || k.orig) out.push(k.gl || k.orig) } else walk(k) } }
  walk(n)
  return out.join(' ')
}
/** A clause (a box, folded when deep) or a role (a row: its chip, its words, the clauses inside it). */
function node(n: TNode, depth: number, foldAt: number, v: Extract<MacView, { kind: 'tree' }>): HTMLElement {
  const w = MW(v.ui)
  if (!n.role) {
    // a clause with no role of its own: a box; deep ones fold, saying how many words they hold
    const deep = depth >= foldAt && count(n) >= 4
    const box = el(deep ? 'details' : 'div', 'syn-clause')
    if (deep) {
      const sum = el('summary', '', `${w.clause.replace('{n}', String(count(n)))}: ${firstWords(n)}…`)
      sum.dir = 'auto'
      box.appendChild(sum)
    }
    for (const k of n.kids) {
      if (k.k === 'n' && hidden(k)) continue
      box.appendChild(k.k === 'w' ? row('', [k], v) : node(k, depth + 1, foldAt, v))
    }
    return box
  }
  const words = n.kids.filter((k): k is TWord => k.k === 'w')
  const subs = n.kids.filter((k): k is TNode => k.k === 'n')
  const r = row(n.role, words, v)
  const body = r.querySelector('.syn-body')!
  if (subs.length) {
    // a role filled by a clause (`adv*`, `p*`): its parts in a dashed box
    const inner = el('div', n.clause ? 'syn-clause emb' : '')
    for (const k of subs) inner.appendChild(node(k, depth + 1, foldAt, v))
    body.appendChild(inner)
  }
  return r
}
function row(role: string, words: TWord[], v: Extract<MacView, { kind: 'tree' }>): HTMLElement {
  const r = el('div', `syn-row${role === '&' ? ' syn-amp' : ''}`)
  if (role) {
    const [short, name] = roleName(v.ui, role)
    const chip = el('span', `syn-chip r-${role === '&' ? 'amp' : role}`, short)
    chip.title = name
    chip.setAttribute('aria-label', name)
    r.appendChild(chip)
  }
  const body = el('div', 'syn-body')
  if (words.length) {
    const ws = el('div', 'syn-words')
    for (const x of words) ws.appendChild(word(x, v))
    body.appendChild(ws)
  }
  r.appendChild(body)
  return r
}
function word(x: TWord, v: Extract<MacView, { kind: 'tree' }>): HTMLElement {
  const b = el('button', 'syn-w') as HTMLButtonElement
  b.type = 'button'
  b.setAttribute('aria-expanded', 'false')
  // a part of a word whose words are shown at its other part (the "and" of a Hebrew verb): the original alone
  if (x.gl) {
    b.appendChild(gate('gl', x.gl))
    b.appendChild(orig(x.orig, v.greek))
  } else {
    // no words of its own in the text: the original, always shown
    const o = orig(x.orig, v.greek)
    o.classList.add('only')
    b.appendChild(o)
  }
  b.onclick = () => {
    const on = b.classList.toggle('show')
    b.setAttribute('aria-expanded', String(on))
  }
  return b
}
