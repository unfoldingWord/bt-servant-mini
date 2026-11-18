// The waiting line (waiting.ts): an aria-hidden orb first, then the text, under a role="status" wrapper that sets its direction.
import { beforeAll, describe, expect, test } from 'bun:test'
import { waiting } from '../src/waiting'

class Fake {
  tagName: string; className = ''; dir = ''; children: Fake[] = []; attrs = new Map<string, string>(); textContent = ''
  constructor(t: string) { this.tagName = t.toUpperCase() }
  setAttribute(k: string, v: string) { this.attrs.set(k, v) }
  getAttribute(k: string) { return this.attrs.get(k) ?? null }
  append(...c: Fake[]) { this.children.push(...c) }
}
beforeAll(() => { (globalThis as any).document = { createElement: (t: string) => new Fake(t) } })

describe('waiting', () => {
  test('structure and aria', () => {
    const w = waiting('Looking in the translation helps…', 'div', 'msg bot') as any
    expect(w.tagName).toBe('DIV')
    expect(w.className).toBe('wait pending msg bot')
    expect(w.getAttribute('role')).toBe('status')
    const [orb, text] = w.children
    expect(orb.className).toBe('orb')
    expect(orb.getAttribute('aria-hidden')).toBe('true')
    expect(text.className).toBe('wt')
    expect(text.textContent).toBe('Looking in the translation helps…')
    expect(w.dir).toBe('ltr')
  })
  test('paragraph variant and Arabic direction', () => {
    const w = waiting('أبحث في مساعدات الترجمة…', 'p', 'ai') as any
    expect(w.tagName).toBe('P')
    expect(w.className).toBe('wait pending ai')
    expect(w.dir).toBe('rtl')
  })
})
