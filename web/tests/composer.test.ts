// The composer, phase 1 (propuesta-composer-sugerencias.md §5): suggest() by table in the six app languages; the "✓" asks
// exactly what the answer then reads (compared over every question of the test sets); a book that is not here never sends;
// the time per keystroke; the box is not rewritten while the keyboard composes; switched off, nothing is offered.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { booksOf, type Ctx, suggest, understood } from '../src/suggest'
import { Composer, composerOn, setComposerOn } from '../src/composer'
import { buildSheet } from '../src/sheet'
import { type ConvState, directRef, directSheet, env, readQuestion } from '../src/pipeline'
import { has } from '../src/commands'
import { openLang } from '../src/packs'
import { installPacks, ALL_PACKS } from './fs-packs'
import { fullPhone, loadCases, turn } from './harness'

// a phone's localStorage, for the switch
const store = new Map<string, string>()
;(globalThis as any).localStorage ??= { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k), key: () => null, length: 0 }

let all: Ctx['books'] = null
const ctx = (ui: string, conv: ConvState = { last: null }, packs = ALL_PACKS, books = all): Ctx => ({ ui, conv, helpsLang: null, packs, books })
beforeAll(async () => {
  await fullPhone()
  all = await booksOf(ALL_PACKS)
})
afterAll(() => store.clear())

const kinds = (ui: string, t: string, c = ctx(ui)) => {
  env.nav = ui
  const r = suggest(t, c)
  return [...r.items.map((i) => `${i.kind}:${i.label}`), ...(r.strip ? [`${r.strip.unit}:1-${r.strip.max}`] : [])]
}

describe('suggest() by table', () => {
  const table: [string, string, string[]][] = [
    // B: a book being typed
    ['es', 'ro', ['book:Romanos · en inglés']],
    ['es', 'Rut ', ['intro:Introducción a Rut', 'chapter:1-4']],
    ['en', 'Mathew ', ['book:Matthew']],
    ['en', 'Matthew ', ['intro:Introduction to Matthew', 'chapter:1-28']],
    ['fr', 'Jonas ', ['intro:Introduction à Jonas', 'chapter:1-4']],
    ['id', 'Yunus ', ['intro:Pengantar Yunus · dalam bahasa Inggris', 'chapter:1-4']],
    ['hi', 'योना ', ['intro:योना का परिचय', 'chapter:1-4']],
    ['ar', 'يونان ', ['intro:مقدمة يونان', 'chapter:1-4']],
    ['es', 'notas de ro', ['book:Romanos · en inglés']],
    // D: understood; the verse strip after a chapter, the helps after a verse
    ['es', 'Rut 2', ['ok:✓ Rut 2', 'help:Introducción', 'verse:1-23']],
    ['es', 'Rut 2:3', ['ok:✓ Rut 2:3', 'help:Notas', 'help:Preguntas', 'help:Palabras clave', 'help:Texto']],
    ['es', 'notas de rut 2:3', ['ok:✓ Rut 2:3 · notas']],
    ['es', 'Rut 2:3 notas', ['ok:✓ Rut 2:3 · notas']],
    ['en', 'Ruth 2:3 notes', ['ok:✓ Ruth 2:3 · notes']],
    ['en', 'Jonah 2 intro', ['ok:✓ Introduction to Jonah 2']],
    ['hi', 'योना १:३', ['ok:✓ योना 1:3', 'help:टिप्पणियाँ', 'help:प्रश्न', 'help:मुख्य शब्द', 'help:पाठ']],
    ['ar', 'يونان ١:٣ ملاحظات', ['ok:✓ يونان 1:3 · الملاحظات']],
    ['id', 'Yunus 1:3 catatan', ['ok:✓ Yunus 1:3 · catatan · dalam bahasa Inggris']],
    ['fr', 'Notes sur Ruth 2:3', ['ok:✓ Ruth 2:3 · notes']],
    // E: free text, nothing
    ['es', 'por qué Noemí se cambió el nombre', []],
    ['en', 'Why Ruth 2:3?', []],
    ['en', 'What can you do?', []],
    ['es', 'Rut 2:3 en indonesio', []],
    ['es', '', []],
  ]
  for (const [ui, t, want] of table) test(`${ui} "${t}"`, () => expect(kinds(ui, t)).toEqual(want))

  test('a filled book reads: the button writes a name code reads back', () => {
    env.nav = 'ar'
    const r = suggest('صموئيل', ctx('ar'))
    for (const i of r.items.filter((x) => x.fill)) expect(directSheet(`${i.fill}1:1`), i.fill).not.toBeNull()
  })
  test('numbers: the strip writes Latin digits, typing accepts all three', () => {
    env.nav = 'hi'
    const r = suggest('योना ', ctx('hi'))
    expect(`${r.strip!.base}${r.strip!.sep}2`).toBe('योना 2')
    expect(kinds('hi', 'योना २')[0]).toBe('ok:✓ योना 2')
    expect(kinds('ar', 'يونان ٢')[0]).toBe('ok:✓ يونان 2')
  })
})

describe('the "✓" asks what the answer reads', () => {
  // every question of the test sets (with the turns before it), the real BT Servant questions, and what the row writes
  const files = readdirSync(join(import.meta.dir, 'cases')).filter((f) => f.endsWith('.jsonl')).map((f) => f.replace('.jsonl', ''))
  const real = 'C:/Users/LENOVO/Git/Github/bt-servant-workspace/handoff/mini-servant/investigacion/preguntas-bt-servant/candidatas.jsonl'
  const qs: { q: string; lang: string; before: string[] }[] = files.flatMap((f) => loadCases(`${f}.jsonl`).map((k) => ({ q: k.q, lang: k.lang, before: (k.before ?? []).map((b) => b.q) })))
  if (existsSync(real)) for (const l of readFileSync(real, 'utf-8').split('\n').filter((x) => x.trim())) { const x = JSON.parse(l); qs.push({ q: x.question, lang: x.lang, before: [] }) }
  for (const [ui, t] of [['es', 'Rut 2:3'], ['es', 'Rut 2:3 notas'], ['en', 'Jonah 2 intro'], ['hi', 'योना 1:3'], ['ar', 'يونان 1:3 ملاحظات'], ['es', 'Introducción a Rut 2'],
    ['es', 'Isaías 53:3'], ['es', '1 Juan 3:2 notas'], ['fr', 'Notes sur Ruth 2:3'], ['id', 'Yunus 1:3'], ['en', '3 John 1:4']] as const)
    for (const before of [[], ['Rut 1:1'], ['Daniel lion']]) qs.push({ q: t, lang: ui, before })
  test(`over ${qs.length} questions: the same sheet, and the same pack as the label says`, async () => {
    let shown = 0
    for (const k of qs) {
      if (has('help', k.q)) continue
      const c: ConvState = { last: null }
      for (const b of k.before) await turn(c, { q: b, slots: null }, k.lang)
      env.nav = k.lang
      const u = understood(k.q, ctx(k.lang, c))
      const direct = directRef(k.q)
      if (!u) continue
      shown++
      // the send goes the direct way (main.ts: directRef), so it is read as the "✓" read it
      expect(direct, k.q).toBe(true)
      const before = JSON.stringify(c)
      const fromRow = (await buildSheet('row', u.slots, env.helpsLang)).sheet
      expect(JSON.stringify(c), 'the row changed nothing in the conversation').toBe(before)
      const sent = (await readQuestion(k.q.trim(), { slots: null, raw: '', ms: 0 }, c, null)).sheet
      const pick = (s: typeof sent) => ({ intent: s.intent, ref: s.ref, what: s.what, lang: s.lang, term: s.term, concept: s.concept })
      expect(pick(fromRow), k.q).toEqual(pick(sent))
      if (u.has) expect(u.pack, `${k.q}: the label's pack`).toBe(sent.lang)
    }
    console.log(`"✓" offered for ${shown} of ${qs.length} questions; each one compared`)
    expect(shown).toBeGreaterThan(20)
  }, 600_000)
})

describe('a book that is not on this phone', () => {
  afterAll(async () => { await installPacks(ALL_PACKS) })
  test('only Spanish (6 books): "Isaías" says it is not here, never a "✓"; Rut is', async () => {
    await installPacks(['es-419'])
    const b = await booksOf(['es-419'])
    const c = ctx('es', { last: null }, ['es-419'], b)
    env.nav = 'es'
    expect(kinds('es', 'Isaías 53:3', c)).toEqual(['missing:Isaías 53:3 · no está en este teléfono'])
    expect(kinds('es', 'Isaías ', c)).toEqual(['missing:Isaías · no está en este teléfono'])
    expect(kinds('es', 'Rut 2:3', c)[0]).toBe('ok:✓ Rut 2:3')
    // a tap on it sends nothing
    let sent = 0
    const box = { value: 'Isaías 53:3', focus() {} }
    const k = new Composer(box, { ui: () => 'es', conv: () => ({ last: null }), packs: () => ['es-419'], busy: () => false, send: () => { sent++ }, ask: () => { sent++ }, browse: () => {} })
    k.books = b
    k.refresh()
    await k.tap(k.row.items[0]!)
    expect(sent).toBe(0)
    expect(k.missing).toBe('isa')
  })
  test('Spanish and English: the book from the English pack, said on the "✓", as the answer reads it', async () => {
    await installPacks(['es-419', 'en'])
    const packs = ['es-419', 'en']
    const b = await booksOf(packs)
    const c = ctx('es', { last: null }, packs, b)
    env.nav = 'es'
    expect(kinds('es', 'Isaías 53:3', c)[0]).toBe('ok:✓ Isaías 53:3 · en inglés')
    const u = understood('Isaías 53:3', c)!
    const sent = (await readQuestion('Isaías 53:3', { slots: null, raw: '', ms: 0 }, { last: null }, null)).sheet
    expect([u.pack, sent.lang]).toEqual(['en', 'en'])
    expect(understood('Rut 2:3', c)!.pack).toBe('es-419')
  })
  test("the row's book test agrees with the answer's (installed, and the book reads)", async () => {
    await installPacks(ALL_PACKS)
    for (const l of ALL_PACKS) {
      const r = await openLang(l)
      for (const code of ['rut', 'jon', 'tit', '3jn', 'oba', 'phm', 'isa'])
        expect(`${l} ${code} ${all![l]!.has(code)}`).toBe(`${l} ${code} ${r.installed(`book:${code}`) && !!(await r.book(code))}`)
    }
  }, 600_000)
})

describe('time per keystroke (budget: 8 ms on the A56; a desktop under load must keep the median under 3 ms, the slowest 5 % under 8)', () => {
  test('suggest() over typed prefixes in six languages', () => {
    const texts = ['R', 'Ro', 'Rom', 'Roma', 'Romanos', 'Romanos ', 'Romanos 3', 'Romanos 3:', 'Romanos 3:23', 'notas de rut 2 3', 'Mathew 5', 'por qué Noemí se cambió el nombre',
      'योना', 'योना 1:3', 'يونان ١:٣', 'صموئيل الأول', 'Yunus 1:3 catatan', 'Notes sur Ruth 2:3', 'Phillipians', 'Introducción a Rut 2']
    const uis = ['es', 'es', 'es', 'es', 'es', 'es', 'es', 'es', 'es', 'es', 'en', 'es', 'hi', 'hi', 'ar', 'ar', 'id', 'fr', 'en', 'es']
    for (let i = 0; i < texts.length; i++) suggest(texts[i]!, ctx(uis[i]!)) // warm (regexes, name caches)
    const times: number[] = []
    for (let r = 0; r < 20; r++)
      for (let i = 0; i < texts.length; i++) {
        const t = performance.now()
        env.nav = uis[i]!
        suggest(texts[i]!, ctx(uis[i]!))
        times.push(performance.now() - t)
      }
    times.sort((a, b) => a - b)
    const p50 = times[times.length >> 1]!, p95 = times[Math.floor(times.length * 0.95)]!, max = times[times.length - 1]!
    console.log(`suggest(): median ${p50.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, max ${max.toFixed(2)} ms over ${times.length} calls`)
    expect(p50).toBeLessThan(3)
    expect(p95).toBeLessThan(8)
  })
})

describe('the box and the keyboard', () => {
  // (main.ts keeps env.nav on the app's language)
  beforeEach(() => { env.nav = 'es' })
  const hooks = (log: string[]) => ({ ui: () => 'es', conv: () => ({ last: null }), packs: () => ALL_PACKS, busy: () => false,
    send: () => { log.push('send') }, ask: (l: string) => { log.push(`ask ${l}`) }, browse: () => { log.push('browse') } })
  test('a tap while the keyboard composes waits for it to end', async () => {
    const log: string[] = []
    const box = { value: 'ro', focus() {} }
    const k = new Composer(box, hooks(log))
    k.books = all
    k.refresh()
    const book = k.row.items[0]!
    k.compositionStart()
    box.value = 'rom' // the keyboard writes
    await k.tap(book)
    expect(box.value).toBe('rom')
    k.compositionEnd()
    expect(box.value).toBe('Romanos ')
  })
  test('typing while composing does not remake the row; the "✓" counts only for the text it was made for', async () => {
    const log: string[] = []
    const box = { value: 'Rut 2:3', focus() {} }
    const k = new Composer(box, hooks(log), () => {}, 0)
    k.books = all
    k.refresh()
    const ok = k.row.items[0]!
    expect(ok.send).toBe(true)
    k.compositionStart()
    box.value = 'Rut 2:3 n'
    k.onInput()
    expect(k.row.items[0]).toBe(ok)
    await k.tap(ok) // made for "Rut 2:3", not for what is in the box now
    expect(log).toEqual([])
    k.compositionEnd()
    box.value = 'Rut 2:3'
    k.refresh()
    await k.tap(k.row.items[0]!)
    expect(log).toEqual(['send'])
  })
  test('the chapter and verse strip, then the "✓", then a book introduction asked as a ready sheet', async () => {
    const log: string[] = []
    const box = { value: 'Rut ', focus() {} }
    const k = new Composer(box, hooks(log))
    k.books = all
    k.refresh()
    k.tapNumber(k.row.strip!, 2)
    expect(box.value).toBe('Rut 2')
    k.tapNumber(k.row.strip!, 3)
    expect(box.value).toBe('Rut 2:3')
    expect(k.row.items[0]!.label).toBe('✓ Rut 2:3')
    box.value = 'Rut '
    k.refresh()
    await k.tap(k.row.items.find((i) => i.kind === 'intro')!)
    expect(log).toEqual(['ask Introducción a Rut'])
    expect(box.value).toBe('')
  })
  test('switched off: no row, and a tap does nothing (the app as before)', async () => {
    const log: string[] = []
    const box = { value: 'Rut 2:3', focus() {} }
    const k = new Composer(box, hooks(log))
    k.books = all
    k.refresh()
    const ok = k.row.items[0]!
    setComposerOn(false)
    expect(composerOn()).toBe(false)
    expect(k.row.items).toEqual([])
    await k.tap(ok)
    k.tapNumber({ unit: 'verse', max: 3, base: 'Rut 2', sep: ':' }, 1)
    expect([log, box.value]).toEqual([[], 'Rut 2:3'])
    setComposerOn(true)
    expect(k.row.items[0]!.label).toBe('✓ Rut 2:3')
  })
})
