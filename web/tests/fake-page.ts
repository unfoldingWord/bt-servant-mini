// A small stand-in for the page (bun has none), shared by the tests of Browse: explore.ts keeps its box (made from the first
// `document` it sees) for the whole process, and `bun test` (build.py) runs every file in one process, so they must all use this one.
// A file sets the globals in beforeAll with `installPage()` and puts them back in afterAll with `restorePage()`.

type Sel = { tag?: string; id?: string; cls: string[]; attr?: [string, string] }
const parse = (s: string): Sel[][] => s.split(',').map((g) => g.trim().split(/\s+/).map((c) => {
  const m = /^([a-z0-9]+)?(?:#([\w-]+))?((?:\.[\w-]+)*)(?:\[([\w-]+)="([^"]*)"\])?$/i.exec(c)
  if (!m) throw new Error(`selector not supported here: ${c}`)
  return { tag: m[1], id: m[2], cls: (m[3] ?? '').split('.').filter(Boolean), attr: m[4] ? [m[4], m[5]!] : undefined }
}))
export class FakeEl {
  tagName: string; id = ''; className = ''; children: FakeEl[] = []; parentElement: FakeEl | null = null
  dataset: Record<string, string> = {}; attrs = new Map<string, string>(); dir = ''; inert = false; disabled = false; tabIndex = 0
  type = ''; onclick: ((e: unknown) => void) | null = null; style: Record<string, string> = {}; text = ''; scrollTop = 0
  constructor(tag: string) { this.tagName = tag.toUpperCase() }
  get classList() {
    const set = () => new Set(this.className.split(/\s+/).filter(Boolean))
    const put = (s: Set<string>) => { this.className = [...s].join(' ') }
    return {
      add: (...c: string[]) => { const s = set(); c.forEach((x) => s.add(x)); put(s) },
      remove: (...c: string[]) => { const s = set(); c.forEach((x) => s.delete(x)); put(s) },
      contains: (c: string) => set().has(c),
      toggle: (c: string) => { const s = set(); const on = !s.has(c); if (on) s.add(c); else s.delete(c); put(s); return on },
    }
  }
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join('') }
  set textContent(v: string) { this.replaceChildren(); this.text = v }
  set innerHTML(_v: string) { this.replaceChildren() }
  appendChild(c: FakeEl) { c.remove(); c.parentElement = this; this.children.push(c); return c }
  append(...cs: (FakeEl | string)[]) { for (const c of cs) this.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c) }
  after(n: FakeEl) { const p = this.parentElement; if (!p) return; n.remove(); n.parentElement = p; p.children.splice(p.children.indexOf(this) + 1, 0, n) }
  before(n: FakeEl) { const p = this.parentElement; if (!p) return; n.remove(); n.parentElement = p; p.children.splice(p.children.indexOf(this), 0, n) }
  hidden = false
  prepend(c: FakeEl) { c.remove(); c.parentElement = this; this.children.unshift(c) }
  replaceChildren(...cs: FakeEl[]) { for (const c of this.children) c.parentElement = null; this.children = []; this.text = ''; this.append(...cs) }
  remove() { const p = this.parentElement; if (p) { p.children = p.children.filter((x) => x !== this); this.parentElement = null } }
  contains(o: unknown): boolean { let x = o as FakeEl | null; while (x) { if (x === this) return true; x = x.parentElement } return false }
  get childElementCount() { return this.children.length }
  setAttribute(k: string, v: string) { this.attrs.set(k, String(v)) }
  getAttribute(k: string) { return this.attrs.get(k) ?? null }
  focus() { doc.activeElement = this }
  click() { this.onclick?.({ target: this }) }
  private is(s: Sel): boolean {
    if (s.tag && this.tagName !== s.tag.toUpperCase()) return false
    if (s.id && this.id !== s.id) return false
    if (s.cls.some((c) => !this.classList.contains(c))) return false
    if (s.attr && (s.attr[0].startsWith('data-') ? this.dataset[s.attr[0].slice(5)] : this.getAttribute(s.attr[0])) !== s.attr[1]) return false
    return true
  }
  matches(sel: string) {
    return parse(sel).some((chain) => {
      if (!this.is(chain[chain.length - 1]!)) return false
      let i = chain.length - 2
      for (let a = this.parentElement; a && i >= 0; a = a.parentElement) if (a.is(chain[i]!)) i--
      return i < 0
    })
  }
  querySelectorAll(sel: string): FakeEl[] {
    const out: FakeEl[] = []
    const walk = (e: FakeEl) => { for (const c of e.children) { if (c.matches(sel)) out.push(c); walk(c) } }
    walk(this)
    return out
  }
  querySelector(sel: string) { return this.querySelectorAll(sel)[0] ?? null }
}
export const listeners = new Set<(e: unknown) => void>()
export const doc = {
  body: new FakeEl('body'), head: new FakeEl('head'), activeElement: null as FakeEl | null,
  createElement: (t: string) => new FakeEl(t),
  createTextNode: (t: string) => Object.assign(new FakeEl('#text'), { text: t }),
  querySelector: (s: string) => doc.body.querySelector(s),
  getElementById: (id: string): FakeEl | null => doc.head.querySelectorAll(`#${id}`)[0] ?? doc.body.querySelectorAll(`#${id}`)[0] ?? null,
  addEventListener: (_t: string, f: (e: unknown) => void) => listeners.add(f),
  removeEventListener: (_t: string, f: (e: unknown) => void) => listeners.delete(f),
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const $ = (s: string) => doc.querySelector(s)
export const $$ = (s: string) => doc.body.querySelectorAll(s)
export async function until(s: string, ms = 8000): Promise<FakeEl> {
  for (let t = 0; t < ms; t += 20) { const e = $(s); if (e) return e; await sleep(20) }
  throw new Error(`never showed: ${s}`)
}
export const store = new Map<string, string>()
export const fake = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k), key: () => null, length: 0,
}
export const saved = { localStorage: (globalThis as any).localStorage, document: (globalThis as any).document, MutationObserver: (globalThis as any).MutationObserver, HTMLElement: (globalThis as any).HTMLElement }


export function installPage() {
  ;(globalThis as any).localStorage = fake
  ;(globalThis as any).document = doc
  ;(globalThis as any).HTMLElement = FakeEl
  ;(globalThis as any).MutationObserver = class { observe() {} }
}
export function restorePage() {
  ;(globalThis as any).localStorage = saved.localStorage
  ;(globalThis as any).document = saved.document
  ;(globalThis as any).MutationObserver = saved.MutationObserver
  ;(globalThis as any).HTMLElement = saved.HTMLElement
}
