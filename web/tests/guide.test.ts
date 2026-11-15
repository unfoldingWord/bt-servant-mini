// Guiding without blocking (Abel, Nov 15; handoff/mini-servant/diseno-grafo.md, Fase 2): out of scope (one line of what Mini
// helps with, and ways back), drift (a new conversation offered once, far from the topic, never on `line` or `deeper`), light
// paths (a task announced on a book: introduction → sections → key terms → notes → questions, the next step first, a marker,
// one tap back). The cases of tests/cases/guide.jsonl run in answers.test.ts; these are the decisions and whole conversations.
import { beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, loadCases, turn } from './harness'
import { addNode, drifts, type Graph, newGraph, nextStep, type NodeSheet, type Path, stepOf, stepTarget } from '../src/graph'
import { answer, type ConvState, env, type Follow, offTopic, pathStart, returnTo } from '../src/pipeline'
import { bookCode } from '../src/sheet'

const sh = (ref: string | null, concept: string | null = null): NodeSheet =>
  ({ intent: concept && !ref ? 'article' : 'passage', ref, concept, what: ['text'], term: null, lang: 'en' })
const add = (g: Graph, kind: string, ref: string | null, concept: string | null = null) => addNode(g, { kind, sheet: sh(ref, concept), label: ref ?? concept ?? '' })
/** A button pressed: its sheet answered with no question (as main.ts runSheet does). */
async function press(c: ConvState, f: Follow, lang: string) {
  env.nav = lang
  return answer(c, { sheet: { ...f.sheet!, id: `b${Date.now()}` }, ui: lang, meta: '(button)' }, performance.now())
}
const edgeOf = (c: ConvState, id: string | null) => c.graph?.nodes.find((n) => n.id === id)?.edge

describe('drift, by code', () => {
  test('never in the first 4 points, never on line or deeper', () => {
    const g = newGraph()
    add(g, 'passage', 'rut 2:3')
    add(g, 'passage', 'rut 2:4')
    add(g, 'passage', 'rut 2:5')
    const m = add(g, 'passage', 'mrk 1:1')
    expect([m.edge, drifts(g, m)]).toEqual(['branch', false]) // the 4th point
    const h = newGraph()
    for (let v = 1; v <= 6; v++) add(h, 'passage', `rut 1:${v}`)
    const d = add(h, 'article', null, 'tw:kt/grace')
    expect(d.edge).toBe('branch')
    for (const n of h.nodes.filter((x) => x.edge === 'line' || x.edge === 'start')) expect(drifts(h, n)).toBe(false)
  })
  test('a passage of another book after a long line; three new topics in a row', () => {
    const g = newGraph()
    for (const v of [3, 4, 5, 6]) add(g, 'passage', `rut 2:${v}`)
    const m = add(g, 'passage', 'mrk 1:1')
    expect(drifts(g, m)).toBe(true)
    // after a short line, an article: no drift; three new topics from the start: a drift
    const h = newGraph()
    add(h, 'passage', 'rut 2:3')
    add(h, 'passage', 'rut 2:4')
    const a = add(h, 'article', null, 'tw:kt/love')
    const b = add(h, 'passage', 'jhn 3:16')
    expect([a.edge, b.edge, drifts(h, a), drifts(h, b)]).toEqual(['branch', 'branch', false, false])
    const x = add(h, 'passage', 'gen 1:1')
    expect([x.edge, drifts(h, x)]).toEqual(['branch', true])
  })
  test('the same drift is not offered twice: measured again from where it was offered (or the person stayed)', () => {
    const g = newGraph()
    for (const v of [3, 4, 5, 6]) add(g, 'passage', `rut 2:${v}`)
    const m = add(g, 'passage', 'mrk 1:1')
    expect(drifts(g, m)).toBe(true)
    m.drift = 'offered'
    const j = add(g, 'passage', 'jhn 3:16')
    expect(drifts(g, j)).toBe(false)
    const k = add(g, 'passage', 'gen 1:1')
    expect(drifts(g, k)).toBe(false)
    // three new topics after it: a new drift
    const l = add(g, 'passage', 'exo 3:14')
    expect(drifts(g, l)).toBe(true)
  })
})

describe('paths, by code', () => {
  const P: Path = { book: 'rut', ch: null, step: 1, sec: null, v: null, lang: 'en', task: 'translate' }
  const secs: [number, number][] = [[1, 5], [6, 18], [19, 22]]
  test('the steps in order: introduction, the first section, its key terms, its notes verse by verse, its questions, the next section', () => {
    const seq: string[] = []
    let p: Path | null = P
    for (let i = 0; i < 11 && p; i++) {
      const t = stepTarget(p)!
      seq.push(`${p.step} ${t.ref} ${t.what.join(',')}`)
      p = nextStep(p, secs, [[1, 7]])
    }
    expect(seq).toEqual(['1 rut front:intro intro', '2 rut 1:1-5 text,notes', '3 rut 1:1-5 terms', '4 rut 1:1 notes', '4 rut 1:2 notes', '4 rut 1:3 notes',
      '4 rut 1:4 notes', '4 rut 1:5 notes', '5 rut 1:1-5 questions', '2 rut 1:6-18 text,notes', '3 rut 1:6-18 terms'])
    // the last section of a chapter: the first of the next one; the last of the book: none
    expect(nextStep({ ...P, ch: 1, step: 5, sec: [19, 22] }, secs, [[1, 7]])).toMatchObject({ step: 2, ch: 2, sec: [1, 7] })
    expect(nextStep({ ...P, ch: 4, step: 5, sec: [13, 22] }, [[13, 22]], [])).toBeNull()
  })
  test('an answer is the step it shows; anything else is no step', () => {
    const on = { ...P, ch: 1, step: 2, sec: [1, 5] as [number, number] }
    expect(stepOf(on, 'rut 1:6-18', ['text', 'notes'], secs)).toMatchObject({ step: 2, sec: [6, 18] })
    expect(stepOf(on, 'rut 1:7', ['notes'], secs)).toMatchObject({ step: 4, sec: [6, 18], v: 7 })
    expect(stepOf(on, 'rut 1:1-5', ['questions'], secs)).toMatchObject({ step: 5 })
    expect(stepOf(on, 'rut 2:intro', ['intro'], [])).toMatchObject({ step: 1, ch: 2 })
    // the book's introduction once in a chapter, a whole chapter, one verse's text, another book: no step
    expect(stepOf(on, 'rut front:intro', ['intro'], [])).toBeNull()
    expect(stepOf(on, 'rut 1', ['text'], secs)).toBeNull()
    expect(stepOf(on, 'rut 1:3', ['text'], secs)).toBeNull()
    expect(stepOf(on, 'jon 1:1-3', ['text', 'notes'], secs)).toBeNull()
  })
  test('a task announced on a book, in 6 languages; anything more is no task', () => {
    const yes: [string, string, number | null, 'translate' | 'review'][] = [
      ["I'm translating Titus 1", 'tit', 1, 'translate'], ['I am reviewing Jonah 2', 'jon', 2, 'review'], ['I want to translate Ruth', 'rut', null, 'translate'],
      ['Voy a traducir Rut', 'rut', null, 'translate'], ['Estoy revisando Jonás 2', 'jon', 2, 'review'], ['Estamos traduciendo el libro de Rut', 'rut', null, 'translate'],
      ['Je vais traduire Ruth', 'rut', null, 'translate'], ['Je révise Jonas 2', 'jon', 2, 'review'],
      ['Saya sedang menerjemahkan Rut 1', 'rut', 1, 'translate'], ['Kami sedang memeriksa Yunus 2', 'jon', 2, 'review'],
      ['मैं रूत का अनुवाद कर रहा हूँ', 'rut', null, 'translate'], ['मैं योना 2 की जाँच कर रहा हूँ', 'jon', 2, 'review'],
      ['سأترجم راعوث', 'rut', null, 'translate'], ['أراجع يونان 2', 'jon', 2, 'review'],
    ]
    for (const [q, book, ch, task] of yes) expect([q, pathStart(q)]).toEqual([q, { book, ch, task }])
    for (const q of ["I want to translate Jonah's prayer", 'Quiero traducir Jonás 1:3','Estoy revisando Jonás 2:3, ¿qué significa calamidad?', 'Show me Ruth 2:3', 'Vamos a traducir la Biblia',
      'I am translating the word grace', 'How do I translate idioms?'])
      expect([q, pathStart(q)]).toEqual([q, null])
  })
  test('off-topic words, in 6 languages (the gate; the Bible check comes after)', () => {
    for (const q of ['What is the weather tomorrow?', '¿Quién ganó el partido?', 'Quel temps fera-t-il ?', 'Bagaimana cuaca besok?', 'कल मौसम कैसा रहेगा?', 'كيف الطقس غدا؟'])
      expect([q, offTopic(q)]).toEqual([q, true])
    for (const q of ['Show me Ruth 2:3', 'What does rain mean in Ruth?', 'The price of the field', 'Where is the good news?', 'هل يذكر المطر؟'])
      expect([q, offTopic(q)]).toEqual([q, false])
  })
})

describe('in a conversation', () => {
  beforeAll(fullPhone)

  // the same conversation in each language: four turns along Ruth 2, then another book (a drift), then a third
  const DRIFT: Record<string, string[]> = {
    en: ['Show me Ruth 2:3', 'And the notes?', 'And the next verse?', 'Ruth 2:5', 'Show me Mark 1:1', 'John 3:16'],
    es: ['Muéstrame Rut 2:3', '¿Y las notas?', '¿Y el versículo siguiente?', 'Rut 2:5', 'Muéstrame Marcos 1:1', 'Juan 3:16'],
    fr: ['Montre-moi Ruth 2:3', 'Et les notes ?', 'Et le verset suivant ?', 'Ruth 2:5', 'Montre-moi Marc 1:1', 'Jean 3:16'],
    id: ['Tunjukkan Rut 2:3', 'Dan catatannya?', 'Dan ayat berikutnya?', 'Rut 2:5', 'Tunjukkan Markus 1:1', 'Yohanes 3:16'],
    hi: ['रूत 2:3 दिखाइए', 'और टिप्पणियाँ?', 'और अगला पद?', 'रूत 2:5', 'मरकुस 1:1 दिखाइए', 'यूहन्ना 3:16'],
    ar: ['أرني راعوث 2:3', 'والملاحظات؟', 'والآية التالية؟', 'راعوث 2:5', 'أرني مرقس 1:1', 'يوحنا 3:16'],
  }
  for (const [lang, qs] of Object.entries(DRIFT))
    test(`drift (${lang}): offered once, on the other book after a long line; not on the line, not again`, async () => {
      const c: ConvState = { last: null }
      const got: string[] = []
      for (const q of qs) {
        const r = await turn(c, { q }, lang)
        got.push(`${edgeOf(c, r.node)}${r.reply.drift ? ' drift' : ''}`)
      }
      expect(got).toEqual(['start', 'line', 'line', 'line', 'branch drift', 'branch'])
      // offered on the point itself, so a later question in this drift is not asked again
      expect(c.graph!.nodes.filter((n) => n.drift === 'offered').map((n) => n.sheet.ref)).toEqual(['mrk 1:1'])
    }, 120_000)

  test('Continue here: the topic is measured again from there; three new topics later it may be offered again', async () => {
    const c: ConvState = { last: null }
    for (const q of DRIFT.en!.slice(0, 5)) await turn(c, { q }, 'en')
    c.graph!.nodes.find((n) => n.drift === 'offered')!.drift = 'stayed'
    const got: boolean[] = []
    for (const q of ['John 3:16', 'Genesis 1:1', 'Exodus 3:14']) got.push(!!(await turn(c, { q }, 'en')).reply.drift)
    expect(got).toEqual([false, false, true])
  }, 120_000)

  test('no false drift: every follow-up case after a long line on its passage offers none on a line or deeper turn', async () => {
    let turns = 0, onBranch = 0
    const wrong: string[] = []
    for (const k of loadCases('followup.jsonl')) {
      const c: ConvState = { last: null, graph: newGraph() }
      // four earlier points on the case's first passage: past the first turns, a long line already
      const s = k.before?.[0]?.slots
      const code = s?.book ? bookCode(s.lang ?? k.lang, s.book) : null
      const ref = code && s?.chapter ? `${code} ${s.chapter}${s.verse_start ? `:${s.verse_start}` : ''}` : 'rut 2:3'
      for (let i = 0; i < 4; i++) add(c.graph!, 'passage', ref)
      for (const t of [...(k.before ?? []), k]) {
        const r = await turn(c, t, k.lang).catch(() => null)
        if (!r) continue
        turns++
        const e = edgeOf(c, r.node)
        if (r.reply.drift && e !== 'branch') wrong.push(`${k.id}: "${t.q}" (${e})`)
        if (r.reply.drift) onBranch++
      }
    }
    console.log(`no false drift: ${turns} turns of ${loadCases('followup.jsonl').length} follow-up cases after a long line, ${onBranch} drift offers (all on a new topic)`)
    expect(wrong).toEqual([])
  }, 1_200_000)

  // a light path, followed by its first button each time: the marker says where it is, the next step is always first
  const PATH: Record<string, [string, RegExp]> = {
    en: ['I am translating Ruth', /^Ruth 1:1–5 · step 2 of 5: sections$/],
    es: ['Voy a traducir Rut', /^Rut 1:1–5 · paso 2 de 5: secciones$/],
    fr: ['Je vais traduire Ruth', /^Ruth 1:1–5 · étape 2 sur 5 : sections$/],
    id: ['Saya akan menerjemahkan Rut', /^Ruth 1:1–5 · langkah 2 dari 5: bagian$/],
    hi: ['मैं रूत का अनुवाद करने जा रहा हूँ', /^Ruth 1:1–5 · चरण 2\/5: खंड$/],
    ar: ['سأترجم راعوث', /^راعوث 1:1–5 · الخطوة 2 من 5: المقاطع$/],
  }
  for (const [lang, [q, step2]] of Object.entries(PATH))
    test(`a path (${lang}): introduction, then its first section with the marker`, async () => {
      const c: ConvState = { last: null }
      const r1 = await turn(c, { q }, lang)
      expect(r1.ref).toBe('rut front:intro')
      expect(r1.reply.pathMark).toMatch(/1/)
      expect(r1.reply.pathLine).toBeTruthy()
      const r2 = await press(c, r1.reply.follow![0]!, lang)
      expect([r2.ref, r2.reply.pathMark]).toEqual(['rut 1:1-5', expect.stringMatching(step2)])
      expect(c.graph!.path).toMatchObject({ book: 'rut', step: 2, ch: 1, sec: [1, 5] })
    }, 120_000)

  test('a whole section on the path, one tap at a time (es), an aside, and one tap back', async () => {
    const c: ConvState = { last: null }
    let r = await turn(c, { q: 'Voy a traducir Rut' }, 'es')
    const marks = [r.reply.pathMark]
    for (let i = 0; i < 9; i++) {
      r = await press(c, r.reply.follow![0]!, 'es')
      marks.push(r.reply.pathMark)
    }
    expect(marks).toEqual(['Rut · paso 1 de 5: introducción', 'Rut 1:1–5 · paso 2 de 5: secciones', 'Rut 1:1–5 · paso 3 de 5: palabras clave',
      'Rut 1:1 · paso 4 de 5: notas', 'Rut 1:2 · paso 4 de 5: notas', 'Rut 1:3 · paso 4 de 5: notas', 'Rut 1:4 · paso 4 de 5: notas', 'Rut 1:5 · paso 4 de 5: notas',
      'Rut 1:1–5 · paso 5 de 5: preguntas', 'Rut 1:6–18 · paso 2 de 5: secciones'])
    // an aside about another book: no marker, and the way back is the way back to the path
    const aside = await turn(c, { q: 'Muéstrame Juan 3:16' }, 'es')
    expect(aside.reply.pathMark).toBeUndefined()
    expect(aside.reply.back?.label).toBe('← Volver al camino: Rut 1:6–18 · secciones')
    // a question on the side ("what is love?" from John): the way back to the path on its own button
    const love = await turn(c, { q: '¿Qué significa amor?' }, 'es')
    expect(love.reply.pathBack?.label ?? love.reply.back?.label).toBe('← Volver al camino: Rut 1:6–18 · secciones')
    const back = love.reply.pathBack ? await press(c, love.reply.pathBack, 'es') : await answer(c, returnTo(c, love.reply.back!.back!, 'es')!, performance.now())
    expect([back.ref, back.reply.pathMark]).toEqual(['rut 1:6-18', 'Rut 1:6–18 · paso 2 de 5: secciones'])
    expect(back.reply.follow![0]!.label).toBe('Siguiente: Rut 1:6–18 · palabras clave')
    // kept with the conversation (saved as JSON) and taken up again
    const saved: ConvState = JSON.parse(JSON.stringify(c))
    expect(saved.graph!.path).toMatchObject({ book: 'rut', step: 2, ch: 1, sec: [6, 18] })
  }, 300_000)

  test('a typed question that is a step moves the path there ("and the questions?")', async () => {
    const c: ConvState = { last: null }
    const r1 = await turn(c, { q: "I'm translating Titus 1" }, 'en')
    expect(r1.reply.pathMark).toBe('Titus 1 · step 1 of 5: introduction')
    const r2 = await press(c, r1.reply.follow![0]!, 'en')
    expect(r2.reply.pathMark).toMatch(/^Titus 1:1–\d+ · step 2 of 5: sections$/)
    const r3 = await turn(c, { q: 'And the questions?' }, 'en')
    expect(r3.reply.pathMark).toMatch(/^Titus 1:1–\d+ · step 5 of 5: questions$/)
    expect(r3.reply.follow![0]!.label).toMatch(/^Next: Titus 1:\d+–\d+ · sections$/)
  }, 120_000)

  test('out of scope in a conversation: no point, the passage it is on first, and the way back to the path', async () => {
    const c: ConvState = { last: null }
    const r1 = await turn(c, { q: 'Voy a traducir Rut' }, 'es')
    await press(c, r1.reply.follow![0]!, 'es')
    const n = c.graph!.nodes.length
    const o = await turn(c, { q: '¿Qué tiempo hace mañana?' }, 'es')
    expect(o.answered).toBe('outofscope')
    expect(o.node).toBeNull()
    expect(c.graph!.nodes.length).toBe(n)
    // (that passage is the path's step: the way back to it is the way back to the path, once)
    expect(o.reply.follow![0]!).toMatchObject({ label: '← Volver al camino: Rut 1:1–5 · secciones', back: c.graph!.cur })
    expect(o.reply.pathBack).toBeUndefined()
  }, 120_000)
})
