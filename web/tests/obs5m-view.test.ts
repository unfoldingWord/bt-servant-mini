// The 5M session's view (obs5mview.ts): the step cards keep the manual's answers hidden (each behind its own [Show answer], never
// remembered across draws), the review and the checking cards, the drafting instruction folded after the first frame, no text
// field anywhere, the bar (RTL, 44 px) and the outline. The view runs on a small stand-in for the page (bun has none).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadFixture, type Fixture } from '../src/dev'
import { cardOf, ORDER, type Session, stepId, steps } from '../src/obs5m'
import { barModel, drawBar, drawCard, drawOutline, outlineModel, reviewPick } from '../src/obs5mview'
import { W5 } from '../src/obs5mwords'
import { KEY5, savedSessions, saveSession } from '../src/obs5mstore'
import type { Sheet } from '../src/answer'

// ---------------------------------------------------------------------------------------------------- a stand-in page

class FakeEl {
  tagName: string; className = ''; id = ''; children: FakeEl[] = []; parentElement: FakeEl | null = null
  dataset: Record<string, string> = {}; attrs = new Map<string, string>(); dir = ''; hidden = false; disabled = false
  type = ''; title = ''; src = ''; alt = ''; loading = ''; text = ''; html = ''; onclick: ((e?: unknown) => void) | null = null
  constructor(tag: string) { this.tagName = tag.toUpperCase() }
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join('') }
  set textContent(v: string) { this.children = []; this.text = v }
  set innerHTML(v: string) { this.children = []; this.html = v }
  get innerHTML() { return this.html }
  /** everything a reader could see: the text and the HTML md() wrote */
  get seen(): string { return this.text + this.html + this.children.map((c) => c.seen).join('') }
  get childElementCount() { return this.children.length }
  setAttribute(k: string, v: string) { this.attrs.set(k, String(v)) }
  getAttribute(k: string) { return this.attrs.get(k) ?? null }
  appendChild(c: FakeEl) { c.remove(); c.parentElement = this; this.children.push(c); return c }
  append(...cs: FakeEl[]) { for (const c of cs) this.appendChild(c) }
  remove() { const p = this.parentElement; if (p) { p.children = p.children.filter((x) => x !== this); this.parentElement = null } }
  private put(c: FakeEl, off: number) { const p = this.parentElement!; c.remove(); c.parentElement = p; p.children.splice(p.children.indexOf(this) + off, 0, c) }
  before(c: FakeEl) { this.put(c, 0) }
  after(c: FakeEl) { this.put(c, 1) }
  click() { this.onclick?.({ target: this }) }
  has(cls: string) { return this.className.split(/\s+/).includes(cls) }
  all(f: (e: FakeEl) => boolean): FakeEl[] { return this.children.flatMap((c) => [...(f(c) ? [c] : []), ...c.all(f)]) }
  byClass(cls: string) { return this.all((e) => e.has(cls)) }
  byTag(tag: string) { return this.all((e) => e.tagName === tag.toUpperCase()) }
}
const saved = { document: (globalThis as any).document, localStorage: (globalThis as any).localStorage }
const store = new Map<string, string>()
beforeAll(() => {
  ;(globalThis as any).document = { createElement: (t: string) => new FakeEl(t) }
  ;(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
})
afterAll(() => {
  ;(globalThis as any).document = saved.document
  ;(globalThis as any).localStorage = saved.localStorage
})

let fx: Fixture
beforeAll(async () => { fx = await loadFixture() })
const session = (part: Session['part'], at: number, extra: Partial<Session> = {}): Session =>
  ({ story: 1, part, at, lang: 'en', tfLang: 'en', started: 424242, done: [], ...extra })
const atFrame = (part: Session['part'], kind: string, f: string) => steps(fx, part).find((x) => x.kind === kind && x.frame === f)!.at
const runs: [string, Sheet][] = []
const hooks = (s: Session) => ({ fx, s, run: (l: string, sh: Sheet) => void runs.push([l, sh]) })
const draw = (s: Session, helps: Parameters<typeof cardOf>[2] = null, ui = 'en') => drawCard(cardOf(fx, s, helps, ui)!, ui, hooks(s)) as unknown as FakeEl
const answersOf = (qs: { a: string | null }[]) => qs.map((q) => q.a).filter((a): a is string => !!a)

describe('a step card', () => {
  test('M1 frame 5: every question verbatim, no answer; [Show answer] reveals only its own; a fresh draw hides it again', () => {
    const s = session('m1', atFrame('m1', 'observation', '1:5'))
    const card = cardOf(fx, s, null, 'en')!
    expect(card.questions.length).toBeGreaterThan(1)
    const d = draw(s)
    for (const q of card.questions) expect(d.textContent).toContain(q.q)
    const answers = answersOf(card.questions)
    expect(answers.length).toBe(card.questions.length)
    for (const a of answers) expect(d.seen).not.toContain(a)
    expect(d.textContent).toContain(card.frame!.text)
    const shows = d.byClass('s5-show')
    expect(shows.length).toBe(card.questions.length)
    expect(shows.every((b) => b.textContent === W5('en').show)).toBe(true)
    shows[1]!.click()
    expect(d.textContent).toContain(answers[1]!)
    for (const [i, a] of answers.entries()) if (i !== 1) expect(d.seen).not.toContain(a)
    expect(shows[1]!.textContent).toBe(W5('en').hide)
    expect(shows[1]!.getAttribute('aria-expanded')).toBe('true')
    shows[1]!.click()
    expect(d.seen).not.toContain(answers[1]!)
    shows[0]!.click()
    const again = draw(s)
    for (const a of answers) expect(again.seen).not.toContain(a)
  })

  test('m1-open: [All questions in one list] opens one card with every observation question, answers hidden', () => {
    const d = draw(session('m1', 0))
    const b = d.byClass('s5-allbtn')[0]!
    expect(b.textContent).toBe(W5('en').view.allList)
    expect(d.byClass('s5-all').length).toBe(0)
    b.click()
    const all = d.byClass('s5-all')
    expect(all.length).toBe(1)
    const obs = fx.questions.filter((q) => q.part === 'm1' && q.list === 'observation')
    expect(all[0]!.byClass('s5-q').length).toBe(obs.length)
    for (const q of obs) expect(all[0]!.textContent).toContain(q.q)
    for (const a of answersOf(obs)) expect(d.seen).not.toContain(a)
  })

  test('the review: 3 large cards, [We knew it] and [Revisit this frame]; revisiting shows the frame again (its OBS answer, R14)', () => {
    const s = session('m1', steps(fx, 'm1').find((x) => x.kind === 'review')!.at)
    const d = draw(s)
    const qs = d.byClass('s5-review')
    expect(qs.length).toBe(3)
    const ids = reviewPick(fx, s, s.started)
    expect(qs.map((q) => q.dataset.id)).toEqual(ids)
    const picked = ids.map((id) => fx.questions.find((q) => q.id === id)!)
    for (const a of answersOf(picked)) expect(d.seen).not.toContain(a)
    for (const q of qs) {
      const labels = q.byClass('s5-mark').map((b) => b.textContent)
      expect(labels).toEqual([W5('en').knew, W5('en').revisit])
    }
    runs.length = 0
    qs[0]!.byClass('s5-mark')[1]!.click()
    expect(runs.length).toBe(1)
    const f = picked[0]!.frames[0]!
    expect(runs[0]![1]).toMatchObject({ intent: 'passage', ref: `obs 1:${f.split(':')[1]}`, what: ['text'], concept: null })
    // [We knew it] is the team's own sign: nothing is stored
    qs[0]!.byClass('s5-mark')[0]!.click()
    expect(store.size).toBe(0)
  })

  test('reviewPick: the same seed gives the same 3 ids, all from the frames covered', () => {
    const at5 = session('m1', atFrame('m1', 'observation', '1:5'))
    const a = reviewPick(fx, at5, 7), b = reviewPick(fx, at5, 7)
    expect(a).toEqual(b)
    expect(a.length).toBe(3)
    for (const id of a) {
      const q = fx.questions.find((x) => x.id === id)!
      expect(q.list).toBe('observation')
      expect(+q.frames[0]!.split(':')[1]!).toBeLessThanOrEqual(5)
    }
    // a pool smaller than 3: all of it, nothing made up
    const two = { ...fx, questions: fx.questions.filter((q) => q.part === 'm1' && q.list === 'observation' && q.frames[0] === '1:1').slice(0, 2) }
    expect(two.questions.length).toBe(2)
    expect(reviewPick(two, at5, 7).sort()).toEqual(two.questions.map((q) => q.id).sort())
    expect(reviewPick(fx, session('m1', 0), 7)).toEqual([]) // the opening card: no frame covered yet
    const end = session('m1', steps(fx, 'm1').find((x) => x.kind === 'review')!.at)
    for (const seed of [1, 2, 3, 99]) {
      const ids = reviewPick(fx, end, seed)
      expect(ids.length).toBe(3)
      expect(new Set(ids).size).toBe(3)
    }
  })

  test('drafting: the manual\'s instruction is open on frame 1, folded behind a button on frame 2', () => {
    const one = draw(session('drafting', 0))
    expect(one.byClass('s5-fold').length).toBe(0)
    expect(one.byClass('s5-md')[0]!.innerHTML).toContain('Translation Draft')
    const two = draw(session('drafting', 1))
    expect(two.byClass('s5-md').length).toBe(0)
    const b = two.byClass('s5-fold')[0]!
    expect(b.textContent).toBe(W5('en').view.instruction)
    expect(b.getAttribute('aria-expanded')).toBe('false')
    b.click()
    expect(two.byClass('s5-md')[0]!.innerHTML).toContain('Translation Draft')
    expect(two.textContent).toContain(fx.frames[1]!.text)
  })

  test('no card has a text field (every step of the story)', () => {
    for (const p of ORDER) for (const st of steps(fx, p)) {
      const d = draw(session(p, st.at))
      expect(d.byTag('input').length + d.byTag('textarea').length + d.all((e) => e.getAttribute('contenteditable') !== null).length).toBe(0)
    }
  })

  test('checking: the frame\'s OBS tQ as cards with [Understood] / [Confusing: revisit frame], kept in the session copy only, no count', () => {
    const tq = [{ id: 'tq1', q: 'What did God create on the third day?', a: 'Dry land and plants.' }, { id: 'tq2', q: 'What did God say about it?', a: 'That it was good.' }]
    const helps = { facts: { kind: 'obs' as const, n: 1, f: 5, title: '', refs: [], state: 'ok' as const, pack: 'en', frames: 16, terms: [] }, academy: [], tq }
    const s = session('checking', atFrame('checking', 'check', '1:5'))
    const d = draw(s, helps)
    const qs = d.byClass('s5-check')
    expect(qs.length).toBe(2)
    for (const q of tq) expect(d.textContent).toContain(q.q)
    for (const q of tq) expect(d.seen).not.toContain(q.a)
    expect(qs[0]!.byClass('s5-mark').map((b) => b.textContent)).toEqual([W5('en').understood, W5('en').confusing])
    const before = d.textContent
    runs.length = 0
    qs[0]!.byClass('s5-mark')[0]!.click()
    qs[1]!.byClass('s5-mark')[1]!.click()
    expect(s.checked).toEqual({ '1:5': { tq1: 'understood', tq2: 'confusing' } })
    expect(store.size).toBe(0)
    expect(d.textContent).toBe(before) // no count, no score: only the buttons' pressed state changes
    expect(qs[0]!.byClass('s5-mark')[0]!.getAttribute('aria-pressed')).toBe('true')
    // "Confusing: revisit frame" shows the frame again (its OBS answer, R14), and keeps its own mark
    expect(runs.length).toBe(1)
    expect(runs[0]![1]).toMatchObject({ intent: 'passage', ref: 'obs 1:5', what: ['text'] })
    expect(s.checked!['1:5']!.tq2).toBe('confusing')
    // the marks show again on a new draw (the answers do not)
    const again = draw(s, helps)
    expect(again.byClass('s5-check')[1]!.byClass('s5-mark')[1]!.getAttribute('aria-pressed')).toBe('true')
    for (const q of tq) expect(again.seen).not.toContain(q.a)
  })
})

describe('a checking mark is kept', () => {
  test('mark, then a fresh load from storage still has it; with conversations not kept, nothing is written', () => {
    store.clear()
    const tq = [{ id: 'tq1', q: 'What did God create?', a: 'Dry land.' }]
    const helps = { facts: { kind: 'obs' as const, n: 1, f: 5, title: '', refs: [], state: 'ok' as const, pack: 'en', frames: 16, terms: [] }, academy: [], tq }
    const s = session('checking', atFrame('checking', 'check', '1:5'))
    const h = { ...hooks(s), marked: () => saveSession('c1', s) }
    const d = drawCard(cardOf(fx, s, helps, 'en')!, 'en', h) as unknown as FakeEl
    d.byClass('s5-check')[0]!.byClass('s5-mark')[0]!.click()
    expect(savedSessions()[0]!.s.checked).toEqual({ '1:5': { tq1: 'understood' } })
    expect(store.get(KEY5)).not.toContain('Dry land')
    store.clear()
    store.set('btsm.history', 'none')
    d.byClass('s5-check')[0]!.byClass('s5-mark')[1]!.click()
    expect(store.has(KEY5)).toBe(false)
    // main.ts hands the card this hook
    const main = readFileSync(join(import.meta.dir, '../src/main.ts'), 'utf8')
    expect(main.includes('marked: () => { save(); if (g.session) saveSession(cv.id, g.session) }')).toBe(true)
  })
})

describe('the bar and the outline', () => {
  const on = { prev() {}, next() {}, outline() {}, back() {} }
  test('the bar: two lines, ◀ ▶ [≡]; under ar it is rtl (never auto) and mirrored; every button is a 44 px target', () => {
    const s = session('m1', atFrame('m1', 'observation', '1:5'))
    const en = drawBar(s, fx, 'en', on, false) as unknown as FakeEl
    expect(en.dir).toBe('ltr')
    expect(barModel(s, fx, 'en')).toMatchObject({ title: `OBS 1 · ${fx.title}`, place: 'M1 · observation · frame 5/16' })
    expect(en.byClass('s5-nav').map((b) => b.textContent)).toEqual(['◀', '▶', '≡'])
    const ar = drawBar(s, fx, 'ar', on, true) as unknown as FakeEl
    expect(ar.dir).toBe('rtl')
    expect(ar.has('dimmed')).toBe(true)
    expect(ar.byClass('s5-nav').map((b) => b.textContent)).toEqual(['▶', '◀', '≡'])
    const buttons = ar.byTag('button')
    expect(buttons.length).toBe(4)
    for (const b of buttons) expect(b.has('s5-where') || b.has('s5-nav')).toBe(true)
    const css = readFileSync(join(import.meta.dir, '..', 'index.html'), 'utf8')
    const rule = (sel: string) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => m[1]!.split(',').some((x) => x.trim() === sel)).map((m) => m[2]).join(';')
    expect(rule('.s5-bar button')).toMatch(/min-height:\s*44px/)
    expect(rule('.s5-bar button')).toMatch(/min-width:\s*44px/)
    // the cards' and the outline's buttons too: every card button sits in .s5-card, every outline button has one of its classes
    for (const sel of ['.s5-card button', '.s5-part-btn', '.s5-how', '.s5-end']) expect(rule(sel), sel).toMatch(/min-height:\s*44px/)
    for (const p of ORDER) for (const st of steps(fx, p)) {
      const c = draw(session(p, st.at))
      if (c.byTag('button').length) expect(c.has('s5-card')).toBe(true)
    }
    const out = drawOutline(s, fx, 'en', { jump() {}, how() {}, end() {} }) as unknown as FakeEl
    for (const b of out.byTag('button')) expect(b.has('s5-part-btn') || b.has('s5-how') || b.has('s5-end')).toBe(true)
    // the first step has no ◀
    const first = drawBar(session('intro', 0), fx, 'en', on, false) as unknown as FakeEl
    expect(first.byClass('s5-nav')[0]!.disabled).toBe(true)
  })
  test('dimmed, tapping the lines is the way back; else they open the outline', () => {
    const did: string[] = []
    const h = { prev: () => did.push('prev'), next: () => did.push('next'), outline: () => did.push('outline'), back: () => did.push('back') }
    const s = session('m1', 3)
    ;(drawBar(s, fx, 'en', h, true) as unknown as FakeEl).byClass('s5-where')[0]!.click()
    ;(drawBar(s, fx, 'en', h, false) as unknown as FakeEl).byClass('s5-where')[0]!.click()
    const b = drawBar(s, fx, 'en', h, false) as unknown as FakeEl
    for (const n of b.byClass('s5-nav')) n.click()
    expect(did).toEqual(['back', 'outline', 'prev', 'next', 'outline'])
  })
  test('the outline: ✓ done, ● current, the manual\'s durations; "How it works" hidden in the mock; [End session]', () => {
    const s = session('m1', atFrame('m1', 'observation', '1:5'), { done: ['intro', 'frames', 'community'] })
    const m = outlineModel(s, fx, 'en')
    expect(m.rows.map((r) => r.part)).toEqual([...ORDER])
    expect(m.rows.map((r) => r.mark).join('')).toBe('✓✓✓●○○○○○○○')
    expect(m.rows.find((r) => r.part === 'm1')!.place).toBe('M1 · observation · frame 5/16')
    const jumped: string[] = []
    const d = drawOutline(s, fx, 'en', { jump: (p) => jumped.push(p), how() {}, end: () => jumped.push('end') }) as unknown as FakeEl
    for (const t of ['✓', '●', '○', 'about 150 min', '3–4 h', 'about 60 min', '60–90 min']) expect(d.textContent).toContain(t)
    expect(d.byClass('s5-how')[0]!.hidden).toBe(true)
    d.byClass('s5-part-btn')[4]!.click()
    d.byClass('s5-end')[0]!.click()
    expect(jumped).toEqual(['m2', 'end'])
    expect((drawOutline(s, fx, 'ar', { jump() {}, how() {}, end() {} }) as unknown as FakeEl).dir).toBe('rtl')
  })
})

describe("a card's frame words (Abel, Nov 17: tappable as in an OBS answer)", () => {
  test('the frame text goes to the `words` hook with its ref and the card; drawing runs no turn and shows no answer', () => {
    const s = session('m1', atFrame('m1', 'observation', '1:5'))
    const card = cardOf(fx, s, null, 'en')!
    const got: [FakeEl, string, FakeEl][] = []
    runs.length = 0
    const d = drawCard(card, 'en', { ...hooks(s), words: (t: any, ref: string, root: any) => void got.push([t, ref, root]) }) as unknown as FakeEl
    expect(got.length).toBe(1)
    const [text, ref, root] = got[0]!
    expect(ref).toBe('obs 1:5')
    expect(text.textContent).toBe(card.frame!.text) // only the frame's words (not its "OBS 1:5" label)
    expect(root).toBe(d)
    expect(runs.length).toBe(0)
    for (const a of answersOf(card.questions)) expect(d.seen).not.toContain(a)
    // without the hook (tests, no session): drawn as before
    expect(() => drawCard(card, 'en', hooks(s))).not.toThrow()
  })
  test('main.ts gives the hook: the story\'s helps in the session\'s language, the same linking as an OBS answer (the panel, no turn)', () => {
    const m = readFileSync(join(import.meta.dir, '..', 'src', 'main.ts'), 'utf8')
    const hooks = m.slice(m.indexOf('function cardHooks('), m.indexOf('function runStep('))
    expect(hooks).toContain('obsStudyOf({ ref, lang: g.session!.lang })')
    expect(hooks).toContain('linkFrameWords(text, o, f, root)')
    expect(hooks.slice(hooks.indexOf('words:'))).not.toContain('run')
  })
})
