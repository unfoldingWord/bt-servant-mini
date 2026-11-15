// Guiding without blocking (Abel, Nov 15; handoff/mini-servant/diseno-grafo.md, Fase 2): out of scope (one line of what Mini
// helps with, and ways back), drift (a new conversation offered once, far from the topic, never on `line` or `deeper`), light
// paths (a task announced on a book: introduction → sections → key terms → notes → questions, the next step first, a marker,
// one tap back). The cases of tests/cases/guide.jsonl run in answers.test.ts; these are the decisions and whole conversations.
import { beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, loadCases, turn } from './harness'
import { addNode, drifts, type Graph, newGraph, nextStep, type NodeSheet, type Path, stepOf, stepTarget } from '../src/graph'
import { answer, type ConvState, env, type Follow, MAX_CONVS, moveOut, offTopic, outOfScopeQ, pathStart, readQuestion, returnTo, roomForNew } from '../src/pipeline'
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

// the same conversation in each language: four turns along Ruth 2, then another book (a drift), then a third
const DRIFTS: Record<string, string[]> = {
  en: ['Show me Ruth 2:3', 'And the notes?', 'And the next verse?', 'Ruth 2:5', 'Show me Mark 1:1', 'John 3:16'],
  es: ['Muéstrame Rut 2:3', '¿Y las notas?', '¿Y el versículo siguiente?', 'Rut 2:5', 'Muéstrame Marcos 1:1', 'Juan 3:16'],
  fr: ['Montre-moi Ruth 2:3', 'Et les notes ?', 'Et le verset suivant ?', 'Ruth 2:5', 'Montre-moi Marc 1:1', 'Jean 3:16'],
  id: ['Tunjukkan Rut 2:3', 'Dan catatannya?', 'Dan ayat berikutnya?', 'Rut 2:5', 'Tunjukkan Markus 1:1', 'Yohanes 3:16'],
  hi: ['रूत 2:3 दिखाइए', 'और टिप्पणियाँ?', 'और अगला पद?', 'रूत 2:5', 'मरकुस 1:1 दिखाइए', 'यूहन्ना 3:16'],
  ar: ['أرني راعوث 2:3', 'والملاحظات؟', 'والآية التالية؟', 'راعوث 2:5', 'أرني مرقس 1:1', 'يوحنا 3:16'],
}

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
  const P: Path = { book: 'rut', ch: null, step: 1, sec: null, lang: 'en', task: 'translate' }
  const secs: [number, number][] = [[1, 5], [6, 18], [19, 22]]
  test("the steps in order: introduction, the first section's text, its key terms, its notes, its questions, the next section", () => {
    const seq: string[] = []
    let p: Path | null = P
    for (let i = 0; i < 7 && p; i++) {
      const t = stepTarget(p)!
      seq.push(`${p.step} ${t.ref} ${t.what.join(',')}`)
      p = nextStep(p, secs, [[1, 7]])
    }
    expect(seq).toEqual(['1 rut front:intro intro', '2 rut 1:1-5 text', '3 rut 1:1-5 terms', '4 rut 1:1-5 notes', '5 rut 1:1-5 questions',
      '2 rut 1:6-18 text', '3 rut 1:6-18 terms'])
    // the last section of a chapter: the first of the next one; the last of the book: none
    expect(nextStep({ ...P, ch: 1, step: 5, sec: [19, 22] }, secs, [[1, 7]])).toMatchObject({ step: 2, ch: 2, sec: [1, 7] })
    expect(nextStep({ ...P, ch: 4, step: 5, sec: [13, 22] }, [[13, 22]], [])).toBeNull()
  })
  test('an answer is the step it shows; anything else is no step', () => {
    const on = { ...P, ch: 1, step: 2, sec: [1, 5] as [number, number] }
    expect(stepOf(on, 'rut 1:6-18', ['text', 'notes'], secs)).toMatchObject({ step: 2, sec: [6, 18] })
    expect(stepOf(on, 'rut 1:6-18', ['notes'], secs)).toMatchObject({ step: 4, sec: [6, 18] })
    expect(stepOf(on, 'rut 1:6-18', ['terms'], secs)).toMatchObject({ step: 3, sec: [6, 18] })
    expect(stepOf(on, 'rut 1:1-5', ['questions'], secs)).toMatchObject({ step: 5 })
    expect(stepOf(on, 'rut 2:intro', ['intro'], [])).toMatchObject({ step: 1, ch: 2 })
    // the book's introduction once in a chapter, a whole chapter, one verse's text, another book: no step
    expect(stepOf(on, 'rut front:intro', ['intro'], [])).toBeNull()
    expect(stepOf(on, 'rut 1', ['text'], secs)).toBeNull()
    expect(stepOf(on, 'rut 1:3', ['text'], secs)).toBeNull()
    expect(stepOf(on, 'rut 1:7', ['notes'], secs)).toBeNull()
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

  const DRIFT = DRIFTS
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
    for (let i = 0; i < 5; i++) {
      r = await press(c, r.reply.follow![0]!, 'es')
      marks.push(r.reply.pathMark)
    }
    expect(marks).toEqual(['Rut · paso 1 de 5: introducción', 'Rut 1:1–5 · paso 2 de 5: secciones', 'Rut 1:1–5 · paso 3 de 5: palabras clave',
      'Rut 1:1–5 · paso 4 de 5: notas', 'Rut 1:1–5 · paso 5 de 5: preguntas', 'Rut 1:6–18 · paso 2 de 5: secciones'])
    expect(c.graph!.path).toMatchObject({ step: 2, sec: [6, 18] })
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

  test('out of scope on the path: no point, the way back to the path (on its passage, and after an article)', async () => {
    const c: ConvState = { last: null }
    const r1 = await turn(c, { q: 'Voy a traducir Rut' }, 'es')
    await press(c, r1.reply.follow![0]!, 'es')
    // on the passage: its first button goes back to it, named as the way back to the path
    const on = await turn(c, { q: '¿Qué tiempo hace mañana?' }, 'es')
    expect(on.answered).toBe('outofscope')
    expect(on.reply.follow![0]!.label).toBe('← Volver al camino: Rut 1:1–5 · secciones')
    await turn(c, { q: '¿Qué significa amor?' }, 'es')
    const n = c.graph!.nodes.length
    const o = await turn(c, { q: '¿Qué tiempo hace mañana?' }, 'es')
    expect(o.answered).toBe('outofscope')
    expect(o.node).toBeNull()
    expect(c.graph!.nodes.length).toBe(n)
    // one button back to the path
    const backs = [...(o.reply.follow ?? []), ...(o.reply.pathBack ? [o.reply.pathBack] : [])].filter((f) => f.toPath)
    expect(backs.map((f) => f.label)).toEqual(['← Volver al camino: Rut 1:1–5 · secciones'])
  }, 120_000)

  test("the app in English, the question in Spanish, French or Indonesian: the reply and its buttons in the question's language", async () => {
    const es = await turn({ last: null }, { q: '¿Qué tiempo hará mañana?' }, 'en')
    expect([es.answered, es.reply.ui, es.reply.intro]).toEqual(['outofscope', 'es', expect.stringContaining('traducción de la Biblia')])
    const labels = (es.reply.follow ?? []).map((f) => f.label)
    expect(labels).toEqual([expect.stringMatching(/^Leer /), expect.stringMatching(/^Palabra clave: gracia/), expect.stringMatching(/^Academia: /)])
    const fr = await turn({ last: null }, { q: 'Quel temps fera-t-il demain ?' }, 'en')
    expect(fr.reply.intro).toMatch(/traduire la Bible/)
    expect((fr.reply.follow ?? []).map((f) => f.label)[1]).toMatch(/^Mot clé : /)
    const id = await turn({ last: null }, { q: 'Bagaimana cuaca besok?' }, 'en')
    expect((id.reply.follow ?? []).map((f) => f.label)[1]).toMatch(/^Istilah kunci: /)
    // on a path started in English, the way back to it in Spanish too
    const c: ConvState = { last: null }
    await turn(c, { q: 'I am translating Ruth' }, 'en')
    await turn(c, { q: 'What does love mean?' }, 'en')
    const o = await turn(c, { q: '¿Qué tiempo hará mañana?' }, 'en')
    const back = [...(o.reply.follow ?? []), ...(o.reply.pathBack ? [o.reply.pathBack] : [])].find((f) => f.toPath)
    expect(back?.label).toBe('← Volver al camino: Rut · introducción')
  }, 120_000)

  test('weak words (greetings, thanks, "how much") alone are out of scope; with anything else, never', async () => {
    for (const q of ['Hello, how are you?', 'Thanks!', 'What time is it?', 'Hola, ¿cómo estás?', 'Halo, apa kabar?', 'नमस्ते, आप कैसे हैं?', 'مرحبا، كيف حالك؟'])
      expect([q, await outOfScopeQ(q, 'en')]).toEqual([q, true])
    for (const q of ['hello, who is Naomi?', 'How much is a denarius?', 'How much is a talent worth?', '¿Cuánto vale un denario?', 'berapa harga dua burung pipit?',
      'مرحبا، ما معنى النعمة؟', 'شكرا، من هو بوعز؟', 'Bonjour, qui est Noémi ?', 'नमस्ते, नाओमी कौन है?'])
      expect([q, await outOfScopeQ(q, 'en')]).toEqual([q, false])
  }, 120_000)

  test('never over a reading of the question, nor over a follow-up of the conversation', async () => {
    const c: ConvState = { last: null }
    env.nav = 'en'
    const read = await readQuestion('What is the weather?', { slots: { intent: 'article', term: 'weather', lang: 'en' } as any, raw: '', ms: 0 }, c, null)
    expect(read.inScope).toBe('read by the reader')
    const unread = await readQuestion('What is the weather?', { slots: { intent: 'unknown', lang: 'en' } as any, raw: '', ms: 0 }, c, null)
    expect(unread.inScope).toBeUndefined()
    await turn(c, { q: 'Ruth 2:3' }, 'en')
    expect((await readQuestion('thanks, and the next verse?', { slots: null, raw: '', ms: 0 }, c, null)).inScope).toBe('a follow-up of the conversation')
    // on a passage, a question about something else is weighed as anywhere else
    expect((await readQuestion('how much is an ephah?', { slots: null, raw: '', ms: 0 }, c, null)).inScope).toBeUndefined()
    expect(await outOfScopeQ('how much is an ephah?', 'en')).toBe(false)
  }, 120_000)
})

// Drift, [New conversation] (main.ts moveToNew, pipeline.ts moveOut): the question and its answer leave the conversation, which
// goes on from the point before; the new conversation starts at that point; a path goes with it only when the answer started it.
describe('a new conversation for a drift', () => {
  beforeAll(fullPhone)
  type M = { who: 'me' | 'bot'; text?: string; node?: string; pathLine?: string; pathMark?: string; back?: Follow; pathBack?: Follow; drift?: boolean; follow?: Follow[] }
  type C = ConvState & { msgs: M[] }
  async function say(c: C, q: string, lang: string) {
    const r = await turn(c, { q }, lang)
    c.msgs.push({ who: 'me', text: q }, { who: 'bot', ...r.reply, node: r.node ?? undefined } as M)
    const n = c.graph?.nodes.find((x) => x.id === r.node)
    if (n) n.msg = c.msgs.length - 1
    return r
  }
  /** A conversation as main.ts keeps it: its state and its messages. */
  async function talk(qs: string[], lang = 'en'): Promise<C> {
    const c: C = { last: null, msgs: [] }
    for (const q of qs) await say(c, q, lang)
    return c
  }
  test('the drifting answer moves; the old conversation goes on from the point before', async () => {
    const c = await talk(DRIFTS.en!.slice(0, 5))
    const m = c.msgs[c.msgs.length - 1]!
    expect(m.drift).toBe(true)
    const before = c.graph!.nodes.length
    const out = moveOut(c, m, 'en')!
    expect(c.msgs.length).toBe(8)
    expect(c.graph!.nodes.length).toBe(before - 1)
    expect(c.graph!.nodes.find((n) => n.id === c.graph!.cur)!.sheet.ref).toBe('rut 2:5')
    expect(c.last?.ref).toBe('rut 2:5')
    expect(out.title).toBe('Show me Mark 1:1')
    expect(out.msgs.map((x) => x.who)).toEqual(['me', 'bot'])
    expect(out.msgs[1]!.back).toBeUndefined() // its way back led into the old conversation
    expect(out.graph.nodes).toHaveLength(1)
    expect(out.graph.nodes[0]).toMatchObject({ edge: 'start', parent: null, drift: 'moved', msg: 1, sheet: { ref: 'mrk 1:1' } })
    // the new conversation goes on from Mark 1:1
    const nc: ConvState = { last: null, graph: out.graph }
    returnTo(nc, out.graph.cur!, 'en')
    expect((await turn(nc, { q: 'And the next verse?' }, 'en')).ref).toBe('mrk 1:2')
  }, 120_000)
  test('a path moves only with the answer that started it; the path it replaced comes back', async () => {
    const c = await talk(['Voy a traducir Rut'], 'es')
    const r2 = await press(c, c.msgs[1]!.follow![0]!, 'es')
    c.msgs.push({ who: 'me', text: 'x' }, { who: 'bot', ...r2.reply, node: r2.node ?? undefined } as M)
    for (const q of ['Rut 1:2', 'Rut 1:3', 'Rut 1:4']) await say(c, q, 'es')
    const ruth = c.graph!.path!
    const r = await say(c, 'Estoy revisando Jonás 2', 'es')
    expect([r.reply.drift, !!r.reply.pathLine]).toEqual([true, true])
    expect(c.graph!.pathBefore).toEqual(ruth)
    const out = moveOut(c, c.msgs[c.msgs.length - 1]!, 'es')!
    expect(out.graph.path).toMatchObject({ book: 'jon', ch: 2, step: 1 })
    expect(c.graph!.path).toEqual(ruth)
    expect(c.graph!.pathBefore).toBeUndefined()
    // an answer that is only a step of a path (no pathLine): the path stays
    const d = await talk(DRIFTS.en!.slice(0, 5))
    d.graph!.path = { book: 'mrk', ch: 1, step: 2, sec: [1, 8], lang: 'en', task: 'translate' }
    const last = d.msgs[d.msgs.length - 1]!
    last.pathMark = 'Mark 1:1–8 · step 2 of 5: sections'
    const moved = moveOut(d, last, 'en')!
    expect(moved.graph.path).toBeUndefined()
    expect(d.graph!.path).toMatchObject({ book: 'mrk' })
  }, 180_000)
  test('3 conversations: no room for a new one (main.ts says so and offers to continue here)', () => {
    expect([roomForNew(0), roomForNew(2), roomForNew(MAX_CONVS)]).toEqual([true, true, false])
  })
})
