// The composer, phase 2 (propuesta-composer-sugerencias.md §5 "Fase 2"): state A (the empty box: where the conversation is, then
// the ways of asking), state C (the word index: only articles the pack carries, also with the older packs; under 300 KB per
// pack; not built before the first answer; dropped when the packs change), the "✓" of a follow-up ("notas", "5", "siguiente")
// as the send reads it, and no false drift from the row's buttons.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { booksOf, type Ctx, ready, resetSuggest, startRow, suggest, type Row, type Suggestion } from '../src/suggest'
import { Composer } from '../src/composer'
import { buildTermIndex, indexedIds, indexSizes, kindOf, lookup, resetTermIndex, termIndexState, unitOf } from '../src/termindex'
import { answer, codeReads, type ConvState, env, followUpPreview, readQuestion } from '../src/pipeline'
import { buildSheet } from '../src/sheet'
import { namesOf } from '../src/search'
import { openLang } from '../src/packs'
import { ALL_PACKS, installPacks, OLD_PACKS_DIR, usePacksDir } from './fs-packs'
import { fullPhone, loadCases, turn } from './harness'
import { existsSync } from 'node:fs'
import { heapSize } from 'bun:jsc'
import glossary from '../src/data/kt-glossary.json'

// a phone's localStorage, for the switch
const store = new Map<string, string>()
;(globalThis as any).localStorage ??= { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k), key: () => null, length: 0 }

let all: Ctx['books'] = null
const ctx = (ui: string, conv: ConvState = { last: null }, packs = ALL_PACKS, books = all): Ctx => ({ ui, conv, helpsLang: null, packs, books })
beforeAll(async () => {
  await fullPhone()
  all = await booksOf(ALL_PACKS)
})
afterAll(async () => {
  usePacksDir()
  await installPacks(ALL_PACKS)
})
const show = (r: Row) => [...r.items.map((i) => `${i.kind}:${i.label}`), ...(r.pick ? [`pick:${r.pick.length}`] : [])]
const kinds = async (ui: string, t: string, c = ctx(ui)) => {
  env.nav = ui
  return show(await ready(t, c))
}
const until = async (ok: () => boolean, ms = 20_000) => {
  for (const t0 = Date.now(); !ok() && Date.now() - t0 < ms;) await new Promise((r) => setTimeout(r, 50))
  return ok()
}
const hooks = (log: string[], ui = 'es', conv: () => ConvState = () => ({ last: null })) => ({
  ui: () => ui, conv, packs: () => ALL_PACKS, busy: () => false,
  send: () => { log.push('send') }, ask: (l: string, s: any) => { log.push(`ask ${l} ${s.concept ?? s.ref}`) }, browse: () => { log.push('browse') },
})
/** A button pressed: its sheet answered with no question (as main.ts runSheet does). */
async function press(c: ConvState, sheet: any, ui: string) {
  env.nav = ui
  return answer(c, { sheet: { ...sheet, id: `b${Date.now()}` }, ui, meta: '(button)' }, performance.now())
}

describe('A: the empty box', () => {
  test('the ways of asking each language reads (shapes.test.ts), in the order of use', () => {
    const got = Object.fromEntries(['en', 'es', 'fr', 'id', 'hi', 'ar'].map((ui) => [ui, show(startRow(ctx(ui)))]))
    expect(got).toEqual({
      en: ['shape:Passage', 'shape:Notes on…', 'shape:How to translate…?'],
      es: ['shape:Pasaje', 'shape:Notas de…'],
      fr: ['shape:Passage', 'shape:Notes sur…', 'shape:Que signifie… ?', 'shape:Comment traduire… ?'],
      id: ['shape:Perikop', 'shape:Catatan…', 'shape:Apa arti…?', 'shape:Bagaimana menerjemahkan…?'],
      hi: ['shape:अंश', 'shape:…की टिप्पणियाँ'],
      ar: ['shape:مقطع', 'shape:ملاحظات…'],
    })
  })
  test('on a passage, its place first; a tap writes it, and the row then says "✓" for it', async () => {
    for (const [ui, q, want, fill] of [['es', 'Rut 2:3', 'place:Rut 2:3 ▸', 'Rut 2:3'], ['en', 'Jonah 2 intro', 'place:Introduction to Jonah 2 ▸', 'Introduction to Jonah 2'],
      ['ar', 'راعوث 2:3', 'place:راعوث 2:3 ◂', 'راعوث 2:3'], ['hi', 'योना 1:3', 'place:योना 1:3 ▸', 'योना 1:3']] as const) {
      const c: ConvState = { last: null }
      await turn(c, { q }, ui)
      env.nav = ui
      const r = startRow(ctx(ui, c))
      expect(show(r)[0]).toBe(want)
      expect(r.items[0]!.fill).toBe(fill)
      expect((await kinds(ui, fill, ctx(ui, c)))[0]).toMatch(/^ok:✓ /)
    }
  }, 120_000)
  test('on a light path, its next step first: the very button under the answer; off the path, the way back to it', async () => {
    const c: ConvState = { last: null }
    const r = await turn(c, { q: 'Voy a traducir Rut' }, 'es')
    env.nav = 'es'
    const a = startRow(ctx('es', c)).items[0]!
    const under = r.reply.follow![0]!
    expect([a.kind, a.label, a.sheet?.ref, a.sheet?.what]).toEqual(['next', under.label, under.sheet!.ref, under.sheet!.what])
    expect(startRow(ctx('es', c)).items.filter((x) => x.kind === 'place')).toEqual([]) // one button, not both
    const aside = await turn(c, { q: 'Muéstrame Juan 3:16' }, 'es')
    expect(startRow(ctx('es', c)).items[0]!.label).toBe(aside.reply.back?.label ?? aside.reply.pathBack!.label)
  }, 120_000)
  test('Passage lists the books there are; a book writes its name and the chapters follow', async () => {
    const log: string[] = []
    const box = { value: '', focus() {} }
    const k = new Composer(box, hooks(log))
    k.books = all
    k.focusChanged(true)
    expect(show(k.row)).toEqual(['shape:Pasaje', 'shape:Notas de…'])
    await k.tap(k.row.items[0]!)
    expect(k.row.pick!.length).toBeGreaterThan(5)
    await k.tap(k.row.pick!.find((b) => b.book === 'rut')!)
    expect(box.value).toBe('Rut ')
    expect(k.row.strip).toMatchObject({ unit: 'chapter', max: 4 })
    // "Notas de…" writes its start, then the books, each after it
    box.value = ''
    k.refresh()
    await k.tap(k.row.items[1]!)
    expect(box.value).toBe('Notas de ')
    expect(k.row.pick!.find((b) => b.book === 'rut')!.fill).toBe('Notas de Rut ')
    // without the focus (the keyboard closed), nothing
    box.value = ''
    k.focusChanged(false)
    expect(k.row.items).toEqual([])
  })
})

describe('"✓" of a follow-up (followUpPreview)', () => {
  test('after Rut 2:3: "notas", "5", "siguiente", "el capítulo siguiente"; past the chapter, none', async () => {
    const c: ConvState = { last: null }
    await turn(c, { q: 'Rut 2:3' }, 'es')
    expect(await kinds('es', 'notas', ctx('es', c))).toEqual(['ok:✓ Rut 2:3 · notas'])
    expect(await kinds('es', '¿y las preguntas?', ctx('es', c))).toEqual(['ok:✓ Rut 2:3 · preguntas'])
    expect(await kinds('es', '5', ctx('es', c))).toEqual(['ok:✓ Rut 2:5'])
    expect(await kinds('es', 'siguiente', ctx('es', c))).toEqual(['ok:✓ Rut 2:4'])
    expect(await kinds('es', 'el capítulo siguiente', ctx('es', c))).toEqual(['ok:✓ Rut 3'])
    const end: ConvState = { last: null }
    await turn(end, { q: 'Rut 1:22' }, 'es')
    // (the next verse is Ruth 2:1: readQuestion moves it there, the row does not guess)
    expect(await kinds('es', 'siguiente', ctx('es', end))).toEqual([])
    const en: ConvState = { last: null }
    await turn(en, { q: 'Ruth 2:3 notes' }, 'en')
    expect(await kinds('en', 'next verse', ctx('en', en))).toEqual(['ok:✓ Ruth 2:4 · notes'])
    // with no conversation, nothing
    expect(await kinds('es', 'notas')).toEqual([])
  }, 120_000)
  test('each follow-up "✓" asks what the send reads (codeReads, readQuestion with no reader), over the follow-up cases', async () => {
    let shown = 0, cases = 0
    for (const k of loadCases('followup.jsonl')) {
      const c: ConvState = { last: null }
      for (const b of k.before ?? []) await turn(c, b, k.lang).catch(() => null)
      env.nav = k.lang
      cases++
      await ready(k.q, ctx(k.lang, c))
      const r = suggest(k.q, ctx(k.lang, c))
      const u = r.understood
      if (!u?.fu || !u.has) continue
      shown++
      expect(codeReads(k.q, c), k.q).toBe(true)
      expect(followUpPreview(k.q, c)?.slots, k.q).toEqual(u.slots)
      const fromRow = (await buildSheet('row', u.slots, env.helpsLang)).sheet
      const sent = await readQuestion(k.q.trim(), { slots: null, raw: '', ms: 0 }, c, null)
      expect(sent.note, k.q).toBeUndefined()
      const pick = (s: typeof fromRow) => ({ intent: s.intent, ref: s.ref, what: s.what, lang: s.lang })
      expect(pick(sent.sheet), k.q).toEqual(pick(fromRow))
    }
    console.log(`follow-up "✓" for ${shown} of ${cases} follow-up cases; each one compared`)
    expect(shown).toBeGreaterThan(10)
  }, 600_000)
})

describe('C: the word index', () => {
  test('not built before the first answer; built at idle after it; then words and topics', async () => {
    resetSuggest()
    const log: string[] = []
    const box = { value: '', focus() {} }
    const k = new Composer(box, hooks(log), () => {}, 0)
    k.books = all
    k.focusChanged(true)
    for (const t of ['gra', '¿Qué significa gra', 'metáf']) {
      box.value = t
      k.refresh()
      expect(k.row.items.filter((x) => x.kind === 'term')).toEqual([])
    }
    expect([termIndexState(), indexSizes()]).toEqual(['none', {}])
    box.value = 'gra'
    k.refresh()
    k.answered()
    expect(termIndexState()).toBe('building')
    expect(await until(() => termIndexState() === 'ready')).toBe(true)
    // the row is made again once the index is ready, with no other key
    expect(await until(() => k.row.items.length > 0)).toBe(true)
    expect(k.row.items[0]!.label).toBe('gracia · palabra clave')
    // a tap asks that article, as a button under an answer does
    await k.tap(k.row.items[0]!)
    expect(log).toEqual(['ask gracia tw:kt/grace'])
    expect(box.value).toBe('')
  }, 60_000)
  test('by table, in six languages (alone or after a meaning question); free text, numbers and one letter: nothing', async () => {
    await buildTermIndex(ALL_PACKS)
    const first = async (ui: string, t: string) => (await kinds(ui, t)).filter((x) => x.startsWith('term:'))[0] ?? null
    const table: [string, string, string | null][] = [
      ['es', 'gra', 'term:gracia · palabra clave'],
      ['es', '¿Qué significa gra', 'term:gracia · palabra clave'],
      ['es', 'metáf', 'term:Metáfora · Academia'],
      ['en', 'What does gra', 'term:grace · key term'],
      ['en', 'metaph', 'term:Metaphor · Academy'],
      ['id', 'anuge', 'term:anugerah · istilah kunci'],
      ['hi', 'अनुग्', 'term:अनुग्रह · मुख्य शब्द'],
      ['ar', 'ما معنى نع', 'term:نعمة · كلمة رئيسية'],
      // French with no French pack: the glossary's names, the article from the English pack (said on the button)
      ['fr', 'Que signifie arch', 'term:arche · mot clé · en anglais'],
      ['es', 'g', null],
      ['hi', 'अ', null],
      ['es', 'por qué Noemí se cambió el nombre', null],
      ['es', '¿Qué significa gracia en Rut 2:3?', null],
    ]
    for (const [ui, t, want] of table) expect(`${ui} ${t}: ${await first(ui, t)}`).toBe(`${ui} ${t}: ${want}`)
    // a book and a person of that name: both
    expect(await kinds('es', 'Rut')).toEqual(['book:Rut', 'term:Rut · nombre'])
  }, 60_000)

  const dirs: [string, string | undefined][] = [['current', undefined], ['older', OLD_PACKS_DIR]]
  for (const [which, dir] of dirs)
    test.skipIf(!!dir && !existsSync(dir))(`the index equals the pack's names, only articles it carries (${which} packs)`, async () => {
      usePacksDir(dir)
      await installPacks(ALL_PACKS)
      expect(termIndexState()).toBe('none') // (installing cleared it)
      await buildTermIndex(ALL_PACKS)
      let left = 0
      for (const l of ALL_PACKS) {
        const r = await openLang(l)
        const names = await namesOf(r as any)
        const script = ({ ar: /[؀-ۿ]/, hi: /[ऀ-ॿ]/ } as Record<string, RegExp>)[l.split('-')[0]!]
        // (a name in the pack's script, or one the key-term glossary gives in its language)
        const own = (id: string) => [...names[id]!, ...((glossary as Record<string, Record<string, string[]>>)[id]?.[l.split('-')[0]!] ?? [])]
        const want = Object.keys(names).filter((id) => kindOf(id) && r.installed(unitOf(id)) && (!script || own(id).some((n) => script.test(String(n))))).sort()
        const got = indexedIds(l).sort()
        expect(got, l).toEqual(want)
        left += Object.keys(names).length - want.length
        // no button to an article the pack does not show
        for (const id of got) expect(`${l} ${id} ${!!(await r.article(id, 'all')).data?.sections?.length}`).toBe(`${l} ${id} true`)
        if (dir) expect(got.some((id) => !r.installed(unitOf(id)))).toBe(false)
      }
      console.log(`${which} packs: ${JSON.stringify(indexSizes())} names; ${left} named articles left out (not carried, or no name in the pack's script)`)
      // the older packs carry only some Translation Academy manuals: their other titles are not offered
      if (dir) expect(left).toBeGreaterThan(0)
    }, 600_000)

  test('memory: under 300 KB per pack', async () => {
    usePacksDir()
    await installPacks(ALL_PACKS)
    // what the build reads (each pack's names) read once before, as answering does: only the index is measured
    for (const l of ALL_PACKS) await namesOf((await openLang(l)) as any)
    // the engine's heap after a full collection (bun:jsc heapSize; process heapUsed moves by megabytes between collections)
    const heap = () => {
      for (let i = 0; i < 3; i++) Bun.gc(true)
      return heapSize()
    }
    const per: number[] = []
    let before = 0, after = 0
    for (let k = 0; k < 3; k++) {
      resetTermIndex()
      before = heap()
      await buildTermIndex(ALL_PACKS)
      after = heap()
      per.push((after - before) / ALL_PACKS.length)
    }
    per.sort((a, b) => a - b)
    const mid = per[1]!
    console.log(`word index: heap ${(before / 1048576).toFixed(2)} MB before, ${(after / 1048576).toFixed(2)} MB after; ${(mid / 1024).toFixed(0)} KB per pack (median of 3 builds: ${per.map((x) => (x / 1024).toFixed(0)).join(', ')} KB; ${ALL_PACKS.length} packs, ${JSON.stringify(indexSizes())} names)`)
    expect(mid).toBeLessThan(300 * 1024)
    // and dropped with the packs
    resetSuggest()
    const gone = heap()
    console.log(`after resetSuggest: ${(gone / 1048576).toFixed(2)} MB (${((after - gone) / 1024).toFixed(0)} KB freed)`)
    expect(termIndexState()).toBe('none')
    expect(after - gone).toBeGreaterThan(0)
  }, 120_000)

  test('changing the packs clears it (onPacksChanged → resetSuggest); a build still running does not come back', async () => {
    await buildTermIndex(ALL_PACKS)
    expect(lookup('es-419', 'gracia').length).toBeGreaterThan(0)
    await installPacks(['es-419'])
    expect([termIndexState(), lookup('es-419', 'gracia')]).toEqual(['none', []])
    const p = buildTermIndex(['es-419'])
    resetSuggest()
    await p
    expect(termIndexState()).toBe('none')
    await installPacks(ALL_PACKS)
  }, 120_000)

  test('time per keystroke with the index (median under 3 ms, the slowest 5 % under 8)', async () => {
    await buildTermIndex(ALL_PACKS)
    const texts: [string, string][] = [['es', 'g'], ['es', 'gr'], ['es', 'gra'], ['es', 'grac'], ['es', '¿Qué significa gra'], ['en', 'What does gr'], ['en', 'metaph'],
      ['hi', 'अनुग्'], ['ar', 'ما معنى نع'], ['fr', 'Que signifie arch'], ['id', 'anuge'], ['es', 'por qué Noemí se cambió']]
    for (const [ui, t] of texts) { env.nav = ui; await ready(t, ctx(ui)) }
    const times: number[] = []
    for (let r = 0; r < 20; r++)
      for (const [ui, t] of texts) {
        env.nav = ui
        const t0 = performance.now()
        suggest(t, ctx(ui))
        times.push(performance.now() - t0)
      }
    times.sort((a, b) => a - b)
    const p50 = times[times.length >> 1]!, p95 = times[Math.floor(times.length * 0.95)]!
    console.log(`suggest() with the word index: median ${p50.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms over ${times.length} calls`)
    expect(p50).toBeLessThan(3)
    expect(p95).toBeLessThan(8)
  })
})

describe('no false drift from the row', () => {
  const edge = (c: ConvState, id: string | null) => c.graph?.nodes.find((n) => n.id === id)?.edge
  test('after a long line on Ruth 2: the place, a key term of the passage and a follow-up "✓" go on along or into it', async () => {
    await buildTermIndex(ALL_PACKS)
    const c: ConvState = { last: null }
    for (const q of ['Muéstrame Rut 2:3', '¿Y las notas?', '¿Y el versículo siguiente?', 'Rut 2:5']) await turn(c, { q }, 'es')
    env.nav = 'es'
    const got: string[] = []
    // the place, written in the box and sent
    const place = startRow(ctx('es', c)).items[0]!
    expect(place.kind).toBe('place')
    let r = await turn(c, { q: place.fill! }, 'es')
    got.push(`${edge(c, r.node)}${r.reply.drift ? ' drift' : ''}`)
    // a key term the passage holds, typed and tapped
    const cur = c.graph!.nodes.find((n) => n.id === c.graph!.cur)!
    const names = await namesOf((await openLang('es-419')) as any)
    let chip: Suggestion | undefined
    for (const id of (cur.links ?? []).filter((x) => x.startsWith('tw:'))) {
      const n = names[id]?.[0]
      if (!n) continue
      chip = suggest(String(n), ctx('es', c)).items.find((x) => x.sheet?.concept === id)
      if (chip) break
    }
    expect(chip).toBeTruthy()
    r = await press(c, chip!.sheet, 'es')
    got.push(`${edge(c, r.node)}${r.reply.drift ? ' drift' : ''}`)
    // back on the passage: a follow-up's "✓" (its text sent)
    await turn(c, { q: 'Rut 2:5' }, 'es')
    const ok = (await ready('notas', ctx('es', c))).items[0]!
    expect(ok.label).toBe('✓ Rut 2:5 · notas')
    r = await turn(c, { q: 'notas' }, 'es')
    got.push(`${edge(c, r.node)}${r.reply.drift ? ' drift' : ''}`)
    expect(got).toEqual(['line', 'deeper', 'line'])
  }, 300_000)
  test("a light path followed by the row's first button: every step on the line, no drift", async () => {
    const c: ConvState = { last: null }
    await turn(c, { q: 'Voy a traducir Rut' }, 'es')
    const got: string[] = []
    for (let i = 0; i < 6; i++) {
      env.nav = 'es'
      const b = startRow(ctx('es', c)).items[0]!
      expect(b.kind).toBe('next')
      const r = await press(c, b.sheet, 'es')
      got.push(`${edge(c, r.node)}${r.reply.drift ? ' drift' : ''} ${r.reply.pathMark}`)
    }
    expect(got.filter((x) => x.includes('drift') || x.startsWith('branch'))).toEqual([])
    expect(got.at(-1)).toMatch(/Rut 1:6–18 · paso 3 de 5/)
  }, 300_000)
})
