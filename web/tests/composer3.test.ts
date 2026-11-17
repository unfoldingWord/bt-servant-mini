// The composer, phase 3 (propuesta-composer-sugerencias.md §5 "Fase 3. Enseñar y corregir", §2.3): "Understood: …" under the
// person's message (every answer with a point in the graph; none for help or errors; a tap puts the question back in the box),
// the ways of asking under an answer that found nothing, the grey line of a free question with no model (the first three times
// only), and the seven usage counts approved on Nov 16 (only when usage counts are on, never any text).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { booksOf, type Ctx, loadHelps, ready, shapesFor, type Suggestion } from '../src/suggest'
import { Composer, setComposerOn } from '../src/composer'
import { forgetFreeHint, freeHintDue, freeLine, foundNothing, shapeRow, TT, understoodFor, understoodLine } from '../src/teach'
import { buildTermIndex, resetTermIndex } from '../src/termindex'
import { type ConvState, directSheet, env } from '../src/pipeline'
import { bookCode } from '../src/sheet'
import { bidiLabel } from '../src/bidi'
import { setUsageOn, todayCounts } from '../src/usage'
import { ALL_PACKS } from './fs-packs'
import { fullPhone, loadCases, offersNext, runCase, turn } from './harness'

// a phone's localStorage (the switch, the counts, the grey line's times)
const store = new Map<string, string>()
;(globalThis as any).localStorage ??= { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k), key: () => null, length: 0 }

let all: Ctx['books'] = null
beforeAll(async () => {
  await fullPhone()
  all = await booksOf(ALL_PACKS)
})
afterAll(() => {
  setUsageOn(false)
  forgetFreeHint()
  setComposerOn(true)
})
const ctx = (ui: string, packs = ALL_PACKS, books = all): Ctx => ({ ui, conv: { last: null }, helpsLang: null, packs, books })
type Log = string[]
const hooksOf = (log: Log, ui = 'es', more: Partial<ConstructorParameters<typeof Composer>[1]> = {}) => ({
  ui: () => ui, conv: (): ConvState => ({ last: null }), packs: () => ALL_PACKS, busy: () => false,
  send: () => { log.push('send') }, ask: (l: string) => { log.push(`ask ${l}`) }, browse: () => { log.push('browse') }, ...more,
})
const boxOf = (value = '') => {
  const b = { value, focused: 0, focus() { b.focused++ }, setSelectionRange() {} }
  return b
}
async function settle(k: Composer) {
  for (let i = 0; i < 8 && k.row.needs?.length; i++) {
    await Promise.all(k.row.needs.map(([p, c]) => loadHelps(p, c)))
    k.refresh()
  }
}
/** One question answered as main.ts answers it, and its «Understood» as the chat shows it under the person's message. */
async function asked(q: string, ui: string) {
  const c: ConvState = { last: null }
  const r = await turn(c, { q }, ui)
  const me = { who: 'me', text: q }, bot = { who: 'bot', node: r.node ?? undefined }
  return { r, got: understoodFor([me, bot], c.graph, bot, ui) }
}

describe('«Understood: …» under the person\'s message', () => {
  test('every answer with a point in the graph carries it; none without one', async () => {
    let withPoint = 0, without = 0
    for (const set of ['q36', 'new18', 'followup']) {
      for (const k of loadCases(`${set}.jsonl`)) {
        const c: ConvState = { last: null }
        for (const b of k.before ?? []) await turn(c, b, k.lang)
        const r = await turn(c, k, k.lang)
        const me = { who: 'me', text: k.q }, bot = { who: 'bot', node: r.node ?? undefined }
        const got = understoodFor([me, bot], c.graph, bot, k.lang)
        if (r.node) {
          withPoint++
          expect(got, `${k.id}: ${k.q} (${r.answered}) has a point and no «Understood»`).not.toBeNull()
          const what = got!.label.slice(TT(k.lang).got.indexOf('{what}'))
          expect(what.trim().length, `${k.id}: an empty «Understood»`).toBeGreaterThan(0)
          expect(got!.q).toBe(k.q)
        } else {
          without++
          expect(got, `${k.id}: ${k.q} (${r.answered}) has no point but an «Understood»`).toBeNull()
        }
      }
    }
    console.log(`«Understood»: ${withPoint} answers with a point carry it, ${without} without a point carry none`)
    expect(withPoint).toBeGreaterThan(40)
  }, 600_000)

  test('it says how the app read the question, in the app\'s language (the book as the composer writes it)', async () => {
    const cases: [string, string, string][] = [
      ['es', 'Rut 2:3 notas', 'Entendí: Rut 2:3 · notas'],
      // "rut 2 3" is chapter and verse since ms/refcomma (it used to be read as chapter 2)
      ['es', 'notas de rut 2 3', 'Entendí: Rut 2:3 · notas'],
      ['en', 'Ruth 2:3', 'Understood: Ruth 2:3'],
      ['en', 'Introduction to Jonah', 'Understood: Introduction to Jonah'],
      ['en', 'What does grace mean?', 'Understood: grace'],
      ['es', 'por qué Noemí se cambió el nombre', 'Entendí: una búsqueda en las ayudas'],
      ['hi', 'योना 1:3', 'समझा: योना 1:3'],
      ['ar', 'يونان ١:٣', 'فهمت: يونان 1:3'],
    ]
    for (const [ui, q, want] of cases) expect(`${q} → ${(await asked(q, ui)).got?.label}`).toBe(`${q} → ${want}`)
  }, 300_000)

  test('help answers, errors and "Back to …" dividers carry none', async () => {
    const { r } = await asked('Ruth 2:3', 'en')
    const c: ConvState = { last: null }
    const r2 = await turn(c, { q: 'Ruth 2:3' }, 'en')
    // the help answer and an error are made in main.ts with no point (helpAnswer is thrown as done; an error is caught)
    const help = { who: 'bot', intro: 'BT Servant Mini finds…', info: '…' }
    const error = { who: 'bot', text: 'Something went wrong. timeout' }
    for (const m of [help, error]) expect(understoodFor([{ who: 'me', text: 'What can you do?' }, m], c.graph, m, 'en')).toBeNull()
    // going back to a point: the divider is not the person's own message
    const again = { who: 'bot', node: r2.node! }
    expect(understoodFor([{ who: 'me', text: 'Back to Ruth 2:3', mark: true }, again], c.graph, again, 'en')).toBeNull()
    // the same answer under the person's own message has it
    expect(understoodFor([{ who: 'me', text: 'Ruth 2:3' }, again], c.graph, again, 'en')?.label).toBe('Understood: Ruth 2:3')
    expect(r.node).toBeTruthy()
  }, 120_000)

  test('tapping it puts the question back in the box (the row made for it, the keyboard open), and counts nothing', async () => {
    store.clear()
    setUsageOn(true)
    const log: Log = []
    const box = boxOf()
    const k = new Composer(box, hooksOf(log), () => {}, 0)
    k.books = all
    env.nav = 'es'
    k.restore('Rut 2:3 notas')
    await settle(k)
    expect(box.value).toBe('Rut 2:3 notas')
    expect(box.focused).toBeGreaterThan(0)
    expect(k.current).toBe(true)
    expect(k.row.items[0]?.label).toBe('✓ Rut 2:3 · notas')
    expect(log).toEqual([])
    expect(todayCounts()).toEqual({})
    setUsageOn(false)
  }, 120_000)

  test('the line: the app\'s direction (never auto), the other runs isolated, text only; a tap restores', () => {
    const before = (globalThis as any).document
    const made: any[] = []
    ;(globalThis as any).document = { createElement: (tag: string) => {
      const e: any = { tagName: tag, children: [] as any[], attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { e.attrs[k] = v }, appendChild(c: any) { e.children.push(c); return c } }
      made.push(e)
      return e
    } }
    try {
      let restored = 0
      const ar = understoodLine({ label: 'فهمت: Ruth 2:3' }, 'ar', () => { restored++ }) as any
      expect(ar.dir).toBe('rtl')
      expect(ar.textContent).toBe(bidiLabel('فهمت: Ruth 2:3', 'ar'))
      expect(ar.textContent).not.toBe('فهمت: Ruth 2:3') // (the English run is isolated)
      ar.onclick()
      expect(restored).toBe(1)
      const en = understoodLine({ label: 'Understood: يونان 1:3' }, 'en', () => {}) as any
      expect(en.dir).toBe('ltr')
      const row = shapeRow([{ label: 'ملاحظات راعوث …', fill: 'ملاحظات راعوث ' }], 'ar', () => { restored++ }) as any
      expect(row.dir).toBe('rtl')
      const b = row.children[1].children[0]
      expect(b.textContent).toBe(bidiLabel('ملاحظات راعوث …', 'ar'))
      b.onclick()
      expect(restored).toBe(2)
      for (const e of made) expect(e.dir === 'auto' || 'innerHTML' in e).toBe(false)
    } finally {
      ;(globalThis as any).document = before
    }
    // and in the source: no innerHTML, no dir "auto"
    for (const f of ['teach.ts']) {
      const src = readFileSync(join(import.meta.dir, '..', 'src', f), 'utf-8')
      expect(src).not.toMatch(/innerHTML/)
      expect(src).not.toMatch(/dir\s*=\s*['"]auto/)
    }
  })
})

describe('«didn\'t find»: the ways of asking that work', () => {
  beforeAll(async () => { await buildTermIndex(ALL_PACKS) })
  afterAll(() => resetTermIndex())
  test('a free question that found nothing gets the shapes of state A, and still its next steps', async () => {
    env.nav = 'en'
    const { r } = await asked('zorblax quindle fremp', 'en')
    expect(foundNothing(r)).toBe(true)
    expect(r.reply.follow?.length).toBeGreaterThan(0)
    const s = shapesFor('zorblax quindle fremp', ctx('en'))
    expect(s.map((x) => `${x.label}|${x.fill ?? (x.choose ? 'choose' : '')}`)).toEqual([
      'Passage|choose', 'Notes on…|Notes on ', 'What does … mean?|What does ', 'How to translate…?|How to translate ',
    ])
    // Typing suggestions off: no Passage (its books are listed in the row)
    expect(shapesFor('zorblax quindle fremp', ctx('en'), false).some((x) => x.choose)).toBe(false)
  }, 120_000)
  test('with what it did know written in: a book of this phone, a word that names an article; each one reads back', async () => {
    env.nav = 'en'
    const { r } = await asked('Ruth fremp zorblax', 'en')
    expect(foundNothing(r)).toBe(true)
    const s = shapesFor('Ruth fremp zorblax', ctx('en'))
    expect(s.map((x) => x.fill)).toEqual(['Ruth ', 'Notes on Ruth ', 'What does Ruth mean?', 'How to translate Ruth?'])
    // the book's fills read as that book once a verse is written
    for (const x of s.slice(0, 2)) {
      const sh = directSheet(`${x.fill}1:1`)
      expect(sh && bookCode(sh.lang ?? 'en', sh.book!)).toBe('rut')
    }
    env.nav = 'es'
    expect(shapesFor('gracia zzq qqx', ctx('es')).map((x) => x.fill)).toEqual(['¿Qué significa gracia?'])
    // a book that is not on this phone is not offered
    const es = { 'es-419': all!['es-419']! }
    expect(shapesFor('Isaías zzq qqx', ctx('es', ['es-419'], es)).some((x) => /^(Notas de )?Isaías $/.test(x.fill ?? ''))).toBe(false)
  }, 120_000)
  test('the book the question names, not a short word that abbreviates another book in some language', () => {
    // (review of 6c7fd54: "why" is Wahyu in Indonesian, "est" Esther in English; and the Hindi and Arabic stops)
    const books = (ui: string, q: string) => {
      env.nav = ui
      return shapesFor(q, ctx(ui)).map((x) => x.fill).filter((f) => f && !/[?؟]/.test(f))
    }
    expect(books('en', 'why did Naomi change her name in Ruth')).toEqual(['Ruth ', 'Notes on Ruth '])
    expect(books('fr', 'quelle est la grâce de Dieu dans Jean')).toEqual(['Jean ', 'Notes sur Jean '])
    expect(books('hi', 'नाओमी ने रूत में अपना नाम क्यों बदला।')).toEqual(['रूत '])
    expect(books('ar', 'لماذا غيرت نعمي اسمها في راعوث؟')).toEqual(['راعوث ', 'ملاحظات راعوث '])
    expect(books('es', 'por qué Noemí cambió su nombre en Rut')).toEqual(['Rut ', 'Notas de Rut '])
    expect(books('en', 'what does 1 John say about love')).toEqual(['1 John ', 'Notes on 1 John '])
    // only short words: no book (the start shapes); an abbreviation of the app's own language when nothing else matched
    expect(books('en', 'why is the sky blue').some((f) => /Revelation/.test(f!))).toBe(false)
    expect(books('id', 'why zorblax')).toEqual(['Wahyu ', 'Catatan Wahyu '])
  })
  test('answers that found something, or say why, get none', async () => {
    for (const [q, ui] of [['Ruth 2:3', 'en'], ['what is the weather', 'en'], ['por qué Noemí se cambió el nombre', 'es']] as const)
      expect(`${q} ${foundNothing((await asked(q, ui)).r)}`).toBe(`${q} false`)
  }, 120_000)
  test('next-step coverage stays complete: every answer of the q36 set still offers one', async () => {
    for (const k of loadCases('q36.jsonl')) expect(`${k.id} ${offersNext(await runCase(k))}`).toBe(`${k.id} true`)
  }, 600_000)
  test('a shape tapped writes in the box (or lists the books), never sends', async () => {
    const log: Log = []
    const box = boxOf()
    const k = new Composer(box, hooksOf(log, 'en'), () => {}, 0)
    k.books = all
    env.nav = 'en'
    k.offer({ label: 'Notes on Ruth …', fill: 'Notes on Ruth ' })
    expect(box.value).toBe('Notes on Ruth ')
    await settle(k)
    expect(k.row.strip?.unit).toBe('chapter')
    k.clear()
    k.offer({ label: 'Passage', choose: true })
    expect(k.choosing).toBe(true)
    expect(k.row.pick?.length).toBeGreaterThan(10)
    expect(log).toEqual([])
  })
})

describe('the grey line of a free question with no model', () => {
  beforeEach(() => { forgetFreeHint(); env.nav = 'es' })
  const conv: ConvState = { last: null }
  test('only without a model or an online reader, only for free text', () => {
    const free = 'por qué Noemí se cambió el nombre'
    expect(freeLine(free, 'es', conv, true)).toBeNull()
    expect(freeLine(free, 'es', conv, false)).toBe('Pregunta libre: buscaré estas palabras en las ayudas')
    expect(freeLine(free, 'ar', conv, false)).toBe(TT('ar').free)
    for (const t of ['Rut 2:3', 'notas de Rut 2:3', 'qué puedes hacer', 'R', 'gra', 'historia 34']) expect(`${t}: ${freeLine(t, 'es', conv, false)}`).toBe(`${t}: null`)
  })
  test('in the row: with a model none; without one, the first three free questions sent, then never; Erase shows it again', async () => {
    const log: Log = []
    let reader = true
    const box = boxOf('por qué Noemí se cambió el nombre')
    const k = new Composer(box, hooksOf(log, 'es', { reader: () => reader }), () => {}, 0)
    k.books = all
    k.refresh()
    expect(k.hint).toBeNull()
    reader = false
    for (let i = 0; i < 3; i++) {
      box.value = 'por qué Noemí se cambió el nombre'
      k.refresh()
      expect(k.hint, `time ${i + 1}`).toBe(TT('es').free)
      // a reference sent meanwhile does not count
      k.via = 'typed'
      k.sent(true)
      box.value = 'por qué Noemí se cambió el nombre'
      k.refresh()
      k.via = 'typed'
      k.sent(false)
    }
    box.value = 'por qué Noemí se cambió el nombre'
    k.refresh()
    expect(k.hint).toBeNull()
    expect(freeHintDue()).toBe(false)
    forgetFreeHint()
    k.refresh()
    expect(k.hint).toBe(TT('es').free)
    // Typing suggestions off: no row, no line
    setComposerOn(false)
    expect(k.hint).toBeNull()
    setComposerOn(true)
  })
})

describe('usage counts: sent.typed, sent.chip, sent.code, sent.free, cmp.fill, cmp.undo, cmp.missing', () => {
  const SEVEN = ['sent.typed', 'sent.chip', 'sent.code', 'sent.free', 'cmp.fill', 'cmp.undo', 'cmp.missing']
  beforeEach(() => {
    store.delete('btsm.usage.days')
    env.nav = 'es'
  })
  /** What a few events counted, from nothing. */
  async function counted(on: boolean, run: (k: Composer, box: ReturnType<typeof boxOf>, log: Log) => Promise<void> | void, packs = ALL_PACKS, books = all, ui = 'es') {
    setUsageOn(on)
    store.delete('btsm.usage.days')
    const log: Log = []
    const box = boxOf()
    let k: Composer
    // the "✓" sends through the form, whose submit calls `sent` with what code read (main.ts)
    k = new Composer(box, hooksOf(log, ui, { packs: () => packs, send: () => { log.push('send'); k.sent(true) } }), () => {}, 0)
    k.books = books
    await run(k, box, log)
    const c = { ...todayCounts() }
    setUsageOn(false)
    return c
  }
  const typeIn = async (k: Composer, box: { value: string }, t: string) => {
    box.value = t
    k.onInput()
    k.refresh()
    await settle(k)
  }
  test('a question typed and sent: sent.typed, and sent.code or sent.free by what code read', async () => {
    expect(await counted(true, (k) => { k.via = 'typed'; k.sent(true) })).toEqual({ 'sent.typed': 1, 'sent.code': 1 })
    expect(await counted(true, (k) => { k.via = 'typed'; k.sent(false) })).toEqual({ 'sent.typed': 1, 'sent.free': 1 })
    // sent another way (How to ask's "Try it", a saved item, "Try again"): nothing
    expect(await counted(true, (k) => { k.sent(false) })).toEqual({})
  })
  test('the "✓" tapped: sent.chip and sent.code, once', async () => {
    const c = await counted(true, async (k, box, log) => {
      await typeIn(k, box, 'Rut 2:3')
      const ok = k.row.items.find((x) => x.kind === 'ok')!
      await k.tap(ok)
      expect(log).toEqual(['send'])
    })
    expect(c).toEqual({ 'sent.chip': 1, 'sent.code': 1 })
  }, 60_000)
  test('a word, an introduction, the path\'s step asked by the row: sent.chip and sent.code', async () => {
    const c = await counted(true, async (k, _box, log) => {
      const word: Suggestion = { kind: 'term', label: 'gracia · palabra clave', sheet: { id: 'x', intent: 'article', ref: null, what: [], version: null, concept: 'tw:bible/kt/grace', term: null, phrase: null, candidates: null, lang: 'es-419' } }
      await k.tap(word)
      const intro: Suggestion = { kind: 'intro', label: 'Introducción a Rut', slots: { intent: 'passage', book: 'rut', chapter: null, verse_start: null, verse_end: null, what: ['intro'], lang: 'es' } }
      await k.tap(intro)
      expect(log.length).toBe(2)
    })
    expect(c).toEqual({ 'sent.chip': 2, 'sent.code': 2 })
  }, 60_000)
  test('a button that writes in the box: cmp.fill; deleting into it right after: cmp.undo; going on: none', async () => {
    const c = await counted(true, async (k, box) => {
      await typeIn(k, box, 'ro')
      await k.tap(k.row.items.find((x) => x.kind === 'book')!) // "Romanos "
      expect(box.value).toBe('Romanos ')
      await typeIn(k, box, 'Romano') // a wrong book: deleted
      await typeIn(k, box, 'ru')
      await k.tap(k.row.items.find((x) => x.kind === 'book' && /Rut/.test(x.label))!) // "Rut "
      await typeIn(k, box, 'Rut') // only the space: not an undo
      await typeIn(k, box, 'Rut ')
      k.tapNumber(k.row.strip!, 2) // "Rut 2"
      await typeIn(k, box, 'Rut 2:') // going on
      await typeIn(k, box, 'Rut 2') // (a later edit: not right after the button)
    })
    expect(c).toEqual({ 'cmp.fill': 3, 'cmp.undo': 1 })
  }, 60_000)
  test('an introduction tapped while a question is being answered: not asked, not counted', async () => {
    setUsageOn(true)
    store.delete('btsm.usage.days')
    const log: Log = []
    let busy = false
    const k = new Composer(boxOf(), hooksOf(log, 'es', { busy: () => busy }), () => {}, 0)
    k.books = all
    const intro: Suggestion = { kind: 'intro', label: 'Introducción a Rut', slots: { intent: 'passage', book: 'rut', chapter: null, verse_start: null, verse_end: null, what: ['intro'], lang: 'es' } }
    const tap = k.tap(intro)
    busy = true // (the send arrow, while the sheet is built)
    await tap
    expect(log).toEqual([])
    expect(todayCounts()).toEqual({})
    setUsageOn(false)
  }, 60_000)
  test('cmp.undo deleting one character at a time: the trailing space first, then into the name (once)', async () => {
    const c = await counted(true, async (k, box) => {
      await typeIn(k, box, 'ro')
      await k.tap(k.row.items.find((x) => x.kind === 'book')!) // "Romanos "
      for (const v of ['Romanos', 'Romano', 'Roman', 'Roma', 'Rom']) await typeIn(k, box, v)
      // a fill, a space typed after it, then a letter: going on, never an undo
      await typeIn(k, box, 'ru')
      await k.tap(k.row.items.find((x) => x.kind === 'book' && /Rut/.test(x.label))!) // "Rut "
      for (const v of ['Rut', 'Rut ', 'Rut 2', 'Rut ', 'Rut']) await typeIn(k, box, v)
    })
    expect(c).toEqual({ 'cmp.fill': 2, 'cmp.undo': 1 })
  }, 60_000)
  test('a book that is not on this phone, tapped: cmp.missing; a help a book lacks is not counted so', async () => {
    const es = { 'es-419': all!['es-419']! }
    const c = await counted(true, async (k, box) => {
      await typeIn(k, box, 'Isaías 53:3')
      await k.tap(k.row.items[0]!)
      expect(k.missing).toBe('isa')
    }, ['es-419'], es)
    expect(c).toEqual({ 'cmp.missing': 1 })
    const h = await counted(true, async (k, box) => {
      env.nav = 'hi'
      await typeIn(k, box, 'योना 1:3 टिप्पणियाँ')
      const it = k.row.items[0]!
      expect(it.kind).toBe('missing')
      await k.tap(it)
    }, ALL_PACKS, all, 'hi')
    expect(h).toEqual({})
  }, 60_000)
  test('off: none of them is counted', async () => {
    const c = await counted(false, async (k, box) => {
      k.via = 'typed'
      k.sent(false)
      await typeIn(k, box, 'Rut 2:3')
      await k.tap(k.row.items.find((x) => x.kind === 'ok')!)
      await typeIn(k, box, 'ro')
      await k.tap(k.row.items.find((x) => x.kind === 'book')!)
      await typeIn(k, box, 'Rom')
    })
    expect(c).toEqual({})
  }, 60_000)
  test('only these seven names, numbers only: no text of a question', async () => {
    let raw = ''
    const c = await counted(true, async (k, box) => {
      await typeIn(k, box, 'por qué Noemí se cambió el nombre')
      k.via = 'typed'
      k.sent(false)
      await typeIn(k, box, 'Rut 2:3')
      await k.tap(k.row.items.find((x) => x.kind === 'ok')!)
      await typeIn(k, box, 'ro')
      await k.tap(k.row.items.find((x) => x.kind === 'book')!)
      await typeIn(k, box, 'R')
      // what the phone keeps for the report: the day and the counts
      raw = (globalThis as any).localStorage.getItem('btsm.usage.days') ?? ''
    })
    expect(Object.keys(c).sort()).toEqual(['cmp.fill', 'cmp.undo', 'sent.chip', 'sent.code', 'sent.free', 'sent.typed'])
    for (const [key, v] of Object.entries(c)) {
      expect(SEVEN).toContain(key)
      expect(typeof v).toBe('number')
    }
    for (const w of ['Noemí', 'nombre', 'Rut', 'Romanos', '2:3']) expect(raw).not.toContain(w)
    // sent.typed + sent.chip = sent.code + sent.free
    expect((c['sent.typed'] ?? 0) + (c['sent.chip'] ?? 0)).toBe((c['sent.code'] ?? 0) + (c['sent.free'] ?? 0))
  }, 60_000)
})
