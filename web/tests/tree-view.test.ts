// The family tree view (treeview.ts) on a small stand-in for the page (bun has none): rows, folding (a closed branch is not in
// the DOM until opened), group headers only with two groups or more, «+N» siblings, the selection bar, the «up» line.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Followup } from '../src/converse'
import type { TP, TreeView } from '../src/tree'
import { renderTree, type TreeWords } from '../src/treeview'

class FakeEl {
  tagName: string; className = ''; id = ''; children: FakeEl[] = []; parentElement: FakeEl | null = null
  attrs = new Map<string, string>(); dir = ''; hidden = false; type = ''; text = ''; onclick: ((e?: unknown) => void) | null = null
  constructor(tag: string) { this.tagName = tag.toUpperCase() }
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join('') }
  set textContent(v: string) { for (const c of this.children) c.parentElement = null; this.children = []; this.text = v }
  setAttribute(k: string, v: string) { this.attrs.set(k, String(v)) }
  getAttribute(k: string) { return this.attrs.get(k) ?? null }
  appendChild(c: FakeEl) { c.remove(); c.parentElement = this; this.children.push(c); return c }
  append(...cs: (FakeEl | string)[]) { for (const c of cs) { if (typeof c === 'string') { const t = new FakeEl('#text'); t.text = c; this.appendChild(t) } else this.appendChild(c) } }
  remove() { const p = this.parentElement; if (p) { p.children = p.children.filter((x) => x !== this); this.parentElement = null } }
  private put(c: FakeEl, off: number) { const p = this.parentElement!; c.remove(); c.parentElement = p; p.children.splice(p.children.indexOf(this) + off, 0, c) }
  before(c: FakeEl) { this.put(c, 0) }
  after(c: FakeEl) { this.put(c, 1) }
  click() { this.onclick?.({ target: this }) }
  get classList() {
    const self = this
    return {
      add(c: string) { if (!self.has(c)) self.className = `${self.className} ${c}`.trim() },
      remove(c: string) { self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(' ') },
    }
  }
  has(cls: string) { return this.className.split(/\s+/).includes(cls) }
  all(f: (e: FakeEl) => boolean): FakeEl[] { return this.children.flatMap((c) => [...(f(c) ? [c] : []), ...c.all(f)]) }
  byClass(cls: string) { return this.all((e) => e.has(cls)) }
  byTag(tag: string) { return this.all((e) => e.tagName === tag.toUpperCase()) }
}
const saved = (globalThis as any).document
beforeAll(() => {
  ;(globalThis as any).document = { createElement: (t: string) => new FakeEl(t), getElementById: () => null, head: new FakeEl('head') }
})
afterAll(() => { (globalThis as any).document = saved })

const W: TreeWords = {
  title: 'Tree of Jacob', note: 'According to TIPNR.', parents: 'Parents:', wife: 'Wife:', wives: 'Wives:', husband: 'Husband:', spouses: 'Spouses:',
  siblings: 'Siblings:', children: 'Children:', withP: 'With {x}', noMother: 'Mother not named', noFather: 'Father not named', unnamed: '(unnamed)',
  gap: '{n} unnamed generations', upEnd: 'The data ends here.', alsoSays: '(the data also says: {x})', childOf: 'son of {x}', daughterOf: 'daughter of {x}',
  and: 'and {x}', showKids: 'Show the children of {x}', hideKids: 'Hide the children of {x}', sonL: 'son', daughterL: 'daughter', more: '+{n}', half: '(half-brother)',
}
const tp = (id: string, name: string, g?: 1 | 2, n = 0, x: Partial<TP> = {}): TP => ({ id, name, ...(g ? { g } : {}), n, ...x })
const btn = (f: Followup) => { const b = new FakeEl('button'); b.textContent = f.label; return b as unknown as HTMLButtonElement }

// Jacob: 4 groups (Leah: Reuben, Judah; Rachel: Joseph; Bilhah: Dan; none: Dinah); Reuben has Hanoch; Judah's kids are at the cap
const nodes: TreeView['nodes'] = [
  { ...tp('per:reuben', 'Reuben', 1, 1), kids: [5] },
  tp('per:judah', 'Judah', 1, 3),
  tp('per:joseph', 'Joseph', 1),
  tp('per:dan', 'Dan', 1),
  tp('per:dinah', 'Dinah', 2),
  tp('per:hanoch', 'Hanoch', 1),
]
const view = (x: Partial<TreeView> = {}): TreeView => ({
  mode: 'tree', open: 1, ui: 'en', pack: 'en', focus: tp('per:jacob', 'Jacob', 1, 5),
  parents: [{ ...tp('per:isaac', 'Isaac', 1), up: [tp('per:abraham', 'Abraham', 1)] }, { ...tp('per:rebekah', 'Rebekah', 2), up: [] }],
  partners: [tp('per:leah', 'Leah', 2), tp('per:rachel', 'Rachel', 2)],
  siblings: [tp('a', 'Esau', 1), tp('b', 'B', 1), tp('c', 'C', 1), tp('d', 'D', 1), tp('e', 'E', 1, 0, { half: true }), tp('f', 'F', 2)],
  groups: [
    { with: tp('per:leah', 'Leah', 2), kids: [0, 1] }, { with: tp('per:rachel', 'Rachel', 2), kids: [2] },
    { with: tp('per:bilhah', 'Bilhah', 2), kids: [3] }, { kids: [4] },
  ],
  nodes, cut: true, ...x,
})
const draw = (v: TreeView, o: Partial<Parameters<typeof renderTree>[1]> = {}) =>
  renderTree(v, { bar: async () => [], button: btn, words: W, treeOf: (id) => ({ label: `tree ${id}` } as Followup), ...o }) as unknown as FakeEl
const names = (d: FakeEl) => d.byClass('tv-name')
const nameOf = (d: FakeEl, s: string) => names(d).find((b) => b.textContent.startsWith(s))!
const rowOf = (b: FakeEl) => b.parentElement!

describe('the tree', () => {
  test('title and note first; parents with their own parents; spouses with a word label', () => {
    const d = draw(view(), { ancestors: { label: 'Ancestors of Jacob' } as Followup })
    expect(d.children[0]!.textContent).toBe('Tree of Jacob')
    expect(d.children[1]!.textContent).toBe('According to TIPNR.')
    expect(d.children[2]!.textContent).toBe('Ancestors of Jacob')
    expect(d.textContent).toContain('son of Abraham')
    expect(d.textContent).toContain('Wives:')
    expect(d.byClass('tv-box').length).toBe(3)
    expect(d.byClass('focus')[0]!.textContent).toContain('Jacob')
    expect(d.byClass('tv-box').every((b) => b.getAttribute('aria-pressed') === null)).toBe(true)
  })
  test('group headers only with two groups or more', () => {
    const d = draw(view())
    expect(d.byClass('tv-head').map((h) => h.textContent)).toEqual(['With Leah (2)', 'With Rachel (1)', 'With Bilhah (1)', 'Mother not named (1)'])
    const one = draw(view({ groups: [{ with: tp('per:leah', 'Leah', 2), kids: [0, 1] }] }))
    expect(one.byClass('tv-head').length).toBe(0)
  })
  test('gender mark in a bdi, and the accessible label has the word', () => {
    const d = draw(view())
    const r = nameOf(d, 'Reuben')
    expect(r.byTag('bdi')[0]!.textContent).toBe('♂')
    expect(r.getAttribute('aria-label')).toBe('Reuben, son')
    expect(nameOf(d, 'Dinah').getAttribute('aria-label')).toBe('Dinah, daughter')
  })
  test('siblings: 4 shown, +N reveals the rest in the same line', () => {
    const d = draw(view())
    const more = d.byClass('tv-more')[0]!
    expect(more.textContent).toBe('+2')
    const line = more.parentElement!
    expect(line.byClass('tv-name').length).toBe(4)
    more.click()
    expect(line.byClass('tv-name').length).toBe(6)
    expect(d.byClass('tv-more').length).toBe(0)
    expect(line.textContent).toContain('(half-brother)')
  })
  test('a branch is built only when opened; toggle opens and closes', () => {
    const d = draw(view())
    expect(names(d).some((b) => b.textContent.startsWith('Hanoch'))).toBe(false)
    const tog = rowOf(nameOf(d, 'Reuben')).byClass('tv-tog')[0]!
    expect(tog.textContent).toBe('▸ 1')
    expect(tog.getAttribute('aria-expanded')).toBe('false')
    expect(tog.getAttribute('aria-label')).toBe('Show the children of Reuben')
    tog.click()
    expect(tog.getAttribute('aria-expanded')).toBe('true')
    expect(nameOf(d, 'Hanoch')).toBeTruthy()
    tog.click()
    expect(tog.getAttribute('aria-expanded')).toBe('false')
    expect(d.byClass('tv-branch')[0]!.hidden).toBe(true)
    tog.click()
    expect(d.byClass('tv-branch')[0]!.hidden).toBe(false)
  })
  test('open = 2 draws the grandchildren at once', () => {
    const d = draw(view({ open: 2 }))
    expect(nameOf(d, 'Hanoch')).toBeTruthy()
  })
  test('a node at the cap: its button is the tree of that person, no unfolding', () => {
    const d = draw(view())
    const t = rowOf(nameOf(d, 'Judah')).byClass('tv-tog')[0]!
    expect(t.textContent).toBe('▸ 3')
    expect(t.getAttribute('aria-label')).toBe('tree per:judah')
    expect(t.getAttribute('aria-expanded')).toBeNull()
  })
  test('Arabic: right to left, the arrow turns', () => {
    const d = draw(view({ ui: 'ar' }))
    expect(d.dir).toBe('rtl')
    expect(rowOf(nameOf(d, 'Reuben')).byClass('tv-tog')[0]!.textContent).toBe('◂ 1')
  })
})

describe('grandparents and the cap', () => {
  test('grandparents are small name buttons that hang from their parent', async () => {
    const calls: [string, string | null][] = []
    const d = draw(view(), { bar: async (id, from) => (calls.push([id, from]), []) })
    const g = nameOf(d, 'Abraham')
    expect(g.has('sm')).toBe(true)
    expect(g.parentElement!.textContent.replace(/[♂♀]/g, '')).toBe('son of Abraham')
    g.click()
    expect(calls).toEqual([['per:abraham', 'per:isaac']])
    expect(g.getAttribute('aria-pressed')).toBe('true')
  })
  test('an up line cut at the cap does not say the data ends', () => {
    const v: TreeView = { mode: 'up', open: 1, ui: 'en', pack: 'en', focus: tp('x', 'X', 1), parents: [], partners: [], siblings: [], groups: [], nodes: [], cut: true, line: [{ p: tp('y', 'Y', 1) }] }
    expect(draw(v).byClass('tv-end').length).toBe(0)
    expect(draw({ ...v, cut: false }).byClass('tv-end').length).toBe(1)
  })
})

describe('selection', () => {
  test('a tap marks the name, puts a bar with … under its row, then the buttons; the same tap closes; another moves it', async () => {
    const calls: [string, string | null][] = []
    let release!: (f: Followup[]) => void
    const d = draw(view(), {
      bar: (id, from) => { calls.push([id, from]); return new Promise((r) => { release = r }) },
    })
    const reuben = nameOf(d, 'Reuben')
    reuben.click()
    expect(calls).toEqual([['per:reuben', 'per:jacob']])
    expect(reuben.getAttribute('aria-pressed')).toBe('true')
    expect(reuben.has('sel')).toBe(true)
    const row = rowOf(reuben)
    const bar = row.parentElement!.children[1]!
    expect(bar.has('tv-bar')).toBe(true)
    expect(bar.textContent).toBe('…')
    release([{ label: 'Article: Reuben' } as Followup, { label: 'Tree of Reuben' } as Followup])
    await Promise.resolve()
    await Promise.resolve()
    expect(bar.textContent).toBe('Article: ReubenTree of Reuben')
    expect(bar.byTag('button').length).toBe(2)
    // another name moves it
    nameOf(d, 'Dan').click()
    expect(reuben.getAttribute('aria-pressed')).toBe('false')
    expect(d.byClass('tv-bar').length).toBe(1)
    // the same name again closes
    nameOf(d, 'Dan').click()
    expect(d.byClass('tv-bar').length).toBe(0)
    expect(nameOf(d, 'Dan').getAttribute('aria-pressed')).toBe('false')
  })
  test('a late answer does not land in a closed bar', async () => {
    let release!: (f: Followup[]) => void
    const d = draw(view(), { bar: () => new Promise((r) => { release = r }) })
    const b = nameOf(d, 'Esau')
    b.click()
    const bar = d.byClass('tv-bar')[0]!
    b.click()
    release([{ label: 'X' } as Followup])
    await Promise.resolve()
    expect(bar.textContent).toBe('…')
  })
})

describe('the line of ancestors', () => {
  const up = (): TreeView => ({
    mode: 'up', open: 1, ui: 'en', pack: 'en', focus: tp('per:david', 'David', 1), parents: [], partners: [], siblings: [], groups: [], nodes: [], cut: false,
    line: [
      { p: tp('per:jesse', 'Jesse', 1), mother: tp('per:ruth', 'Ruth', 2) },
      { p: tp('per:ahlai', 'Ahlai', 1), others: [tp('per:jarha', 'Jarha', 1)] },
      { p: tp('per:u9', 'Unnamed#9', 1, 0, { unnamed: true }), gap: 9 },
      { p: tp('per:eve', 'Eve', 2) },
    ],
  })
  test('rows by the child gender, mother small, others as a button, gap row, the end line', () => {
    const d = draw(up(), { ancestors: { label: 'ANC' } as Followup })
    const t = d.textContent.replace(/[♂♀]/g, '')
    expect(t).toContain('son of Jesse')
    expect(t).toContain('and Ruth')
    expect(t).toContain('(the data also says: Jarha)')
    expect(t).toContain('9 unnamed generations')
    expect(d.byClass('tv-un').length).toBe(1)
    expect(d.byClass('tv-end')[0]!.textContent).toBe('The data ends here.')
    // no ancestors button in this mode
    expect(t).not.toContain('ANC')
    // the row after the gap is «son of» the gap's person (male); Eve is a button; the gap's person is male so «son of»
    expect(names(d).map((b) => b.textContent.replace(/[♂♀]/g, ''))).toEqual(['Jesse', 'Ruth', 'Ahlai', 'Jarha', 'Eve'])
  })
  test('Jarha is a button that opens a bar from Ahlai', async () => {
    const calls: [string, string | null][] = []
    const d = draw(up(), { bar: async (id, from) => (calls.push([id, from]), []) })
    nameOf(d, 'Jarha').click()
    expect(calls).toEqual([['per:jarha', 'per:jesse']])
  })
  test('a daughter row says «daughter of»', () => {
    const v = up()
    v.focus = tp('per:ruth', 'Ruth', 2)
    expect(draw(v).textContent).toContain('daughter of Jesse')
  })
})
