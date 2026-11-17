// First use: the welcome's examples come from the installed pack (never a book it lacks), the picker picks the pack of the
// question's / app's / phone's language, and the download fetches a few segments at a time without changing what the client sees.
import { afterAll, test, expect } from 'bun:test'
import { installPacks, ALL_PACKS } from './fs-packs'
import { examplesFor, helloLine, packFor, preferred } from '../src/firstuse'
import { withObs } from './obs-fixture'
import { frameHelps } from '../src/obs'
import { exportPack, installedLangs, markPartial, missingUnits, openLang, partialLangs, prefetching, updateLang } from '../src/packs'

afterAll(async () => { await installPacks(ALL_PACKS) }) // (the stories patched in above go with the readers)
const UIS = ['en', 'es', 'fr', 'id', 'hi', 'ar']

for (const pack of ALL_PACKS) {
  test(`examples from ${pack} name only what it has`, async () => {
    await installPacks([pack])
    const r = await openLang(pack)
    for (const ui of UIS) {
      const ex = await examplesFor(ui, pack)
      expect(ex.length).toBeGreaterThanOrEqual(2)
      for (const e of ex) {
        expect(e.lang).toBe(pack)
        if (e.ref && !e.ref.startsWith('obs ')) expect(r.installed(`book:${e.ref.split(' ')[0]}`)).toBe(true)
        if (e.concept) expect((await r.article(e.concept)).data).toBeTruthy()
      }
      // a verse, then the notes of one
      expect(ex[0]!.intent).toBe('passage')
      expect(ex[1]!.what).toEqual(['notes'])
    }
  })
}

test('Indonesian has no Ruth: its examples do not offer it', async () => {
  if (!ALL_PACKS.includes('id')) return
  await installPacks(['id'])
  const ex = await examplesFor('id', 'id')
  expect(ex.some((e) => e.ref?.startsWith('rut '))).toBe(false)
  expect(ex.map((e) => e.label).join(' ')).not.toMatch(/\bRut\b/)
})

test('the pack of a language code', () => {
  expect(packFor('es')).toBe('es-419')
  expect(packFor('es-MX')).toBe('es-419')
  expect(packFor('pt-BR')).toBe('pt-br')
  expect(packFor('id-ID')).toBe('id')
  expect(packFor('fr')).toBe('fr')
  expect(packFor('xx')).toBeNull()
  expect(preferred(['en', 'es-419', 'id'], ['es', 'en'])).toBe('es-419')
  expect(preferred(['en', 'id'], ['es', 'id-ID'])).toBe('id')
  expect(preferred(['en', 'id'], ['qu'])).toBe('en')
  expect(preferred([], ['en'])).toBeNull()
})

test('prefetching: same bytes in the order asked, at most `ahead` requests at once, a failure where it belongs', async () => {
  const order = Array.from({ length: 20 }, (_, i) => `s${i}`)
  let now = 0, most = 0, calls = 0
  const source = {
    catalog: async () => 'not-modified' as const,
    segment: async (id: string) => {
      calls++
      now++
      most = Math.max(most, now)
      await new Promise((r) => setTimeout(r, 5))
      now--
      if (id === 's13') throw new Error('HTTP 500')
      return new TextEncoder().encode(id)
    },
  }
  const src = prefetching(source, order, 6)
  const got: string[] = []
  let failed = ''
  for (const id of order) {
    try {
      got.push(new TextDecoder().decode(await src.segment(id)))
    } catch (e) {
      failed = id
      break
    }
  }
  expect(got).toEqual(order.slice(0, 13))
  expect(failed).toBe('s13')
  expect(most).toBeLessThanOrEqual(6)
  expect(most).toBeGreaterThan(1)
  // never more than the window past the last segment asked for
  expect(calls).toBeLessThanOrEqual(13 + 6)
  // a segment outside the plan goes straight to the source
  expect(new TextDecoder().decode(await src.segment('other'))).toBe('other')
})

test('a download that did not end is marked per language, and the mark goes when it ends', () => {
  const mem = new Map<string, string>()
  const fake = {
    get length() { return mem.size },
    key: (i: number) => [...mem.keys()][i] ?? null,
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  }
  const before = (globalThis as any).localStorage
  ;(globalThis as any).localStorage = fake
  try {
    mem.set('btsm.ui', 'es') // other keys are not languages
    expect(partialLangs()).toEqual([])
    markPartial('es-419', true)
    markPartial('hi', true)
    expect(partialLangs().sort()).toEqual(['es-419', 'hi'])
    markPartial('es-419', false)
    expect(partialLangs()).toEqual(['hi'])
    markPartial('hi', false)
    expect(partialLangs()).toEqual([])
    expect(mem.get('btsm.ui')).toBe('es')
  } finally {
    ;(globalThis as any).localStorage = before
  }
  // no storage at all (a private window, a WebView without it): nothing is marked, nothing breaks
  ;(globalThis as any).localStorage = undefined
  try {
    markPartial('id', true)
    expect(partialLangs()).toEqual([])
  } finally {
    ;(globalThis as any).localStorage = before
  }
})

test('a reset while the language list is being read is not undone by the old read', async () => {
  await installPacks(['en'])
  const old = installedLangs() // on its way when the packs change
  await installPacks([ALL_PACKS.find((l) => l !== 'en')!])
  await old
  expect(await installedLangs()).toEqual([ALL_PACKS.find((l) => l !== 'en')!])
})

test('an installed language gets only the shared units the server lists and it lacks', async () => {
  const units = ['art:tw:kt', 'art:tw:names', 'art:tw:other', 'art:ta:translate', 'art:ta:checking', 'art:ta:intro', 'art:ta:process']
  // es-419 installed before the other Academy manuals; the server has intro and process, not checking for it
  const have = new Set(['art:tw:kt', 'art:tw:names', 'art:tw:other', 'art:ta:translate'])
  const listed = new Set([...have, 'art:ta:intro', 'art:ta:process'])
  const calls: string[] = []
  const client = {
    refresh: async (lang: string) => void calls.push(`refresh ${lang}`),
    open: async () => ({ listed: (u: string) => listed.has(u), installed: (u: string) => have.has(u) }),
    install: async (lang: string, want: { units: string[]; defaults: false }) => {
      calls.push(`install ${lang} ${want.units.join(',')} defaults=${want.defaults}`)
      for (const u of want.units) have.add(u)
    },
  }
  expect(missingUnits(await client.open(), units)).toEqual(['art:ta:intro', 'art:ta:process'])
  expect(await updateLang(client, 'es-419', units)).toEqual(['art:ta:intro', 'art:ta:process'])
  expect(calls).toEqual(['refresh es-419', 'install es-419 art:ta:intro,art:ta:process defaults=false'])
  // up to date: the catalog is read, nothing is installed
  calls.length = 0
  expect(await updateLang(client, 'es-419', units)).toEqual([])
  expect(calls).toEqual(['refresh es-419'])
})

test('a .tcpack of a shipped language exports what it has', async () => {
  const lang = ALL_PACKS.includes('es-419') ? 'es-419' : ALL_PACKS[0]!
  await installPacks([lang])
  const bytes = await exportPack(lang)
  expect(bytes.length).toBeGreaterThan(100_000)
})

test('the greeting has two whole texts per language: with the Bible Stories, and without', () => {
  const names: Record<string, string> = {
    en: 'Bible Stories', es: 'Historias de la Biblia', fr: 'Histoires de la Bible', id: 'Kisah-kisah Alkitab', hi: 'बाइबल की कहानियाँ', ar: 'قصص الكتاب المقدس',
  }
  for (const ui of UIS) {
    const without = helloLine(ui, false), withObs = helloLine(ui, true)
    expect(withObs, ui).not.toBe(without)
    expect(withObs, ui).toContain(names[ui]!)
    expect(without, ui).not.toContain(names[ui]!)
    // both name Translation Academy and send to Browse; neither carries the Map or the online AI (How to ask has them)
    for (const t of [without, withObs]) {
      expect(t, ui).toContain('Translation Academy')
      expect(t, ui).not.toMatch(/Map|Mapa|Carte|Peta|नक्शे|الخريطة|AI|IA|الذكاء/)
    }
  }
  expect(helloLine('es', false)).toBe('¡Hola! Encuentro lo que necesitas en las ayudas de traducción de este teléfono, sin internet: la Biblia con sus notas, palabras clave y preguntas, y Translation Academy. Pregunta con tus palabras o toca Explorar.')
  expect(helloLine('es', true)).toContain('las Historias de la Biblia y Translation Academy.')
  expect(helloLine('xx', true)).toBe(helloLine('en', true)) // a language the app lacks: English
})

test('an Open Bible Stories frame with notes among the examples, when the phone has the stories', async () => {
  if (!ALL_PACKS.includes('en')) return
  await installPacks(['en'])
  await withObs('en')
  for (const ui of UIS) {
    const ex = await examplesFor(ui, 'en')
    const o = ex.find((e) => e.ref?.startsWith('obs '))!
    expect(o, ui).toBeDefined()
    // "OBS 1:2": the text of the reference, no title, a passage asked as the Browse row asks a story
    expect(o.label, ui).toMatch(/^OBS \d+:\d+$/)
    expect(o.ref).toBe(o.label.toLowerCase())
    expect([o.intent, o.lang, o.what]).toEqual(['passage', 'en', ['text', 'notes']])
    // the frame has notes in the pack (the first one from 1:1)
    const h = await frameHelps(o.ref!, o.lang, ui)
    expect(h?.notes, o.label).toBeGreaterThan(0)
    // at most 4 examples: the verse and its notes stay, the last word or topic example gave its place
    expect(ex.length).toBeLessThanOrEqual(4)
    expect(ex[0]!.intent).toBe('passage')
    expect(ex[1]!.what).toEqual(['notes'])
    expect(ex[ex.length - 1]).toBe(o)
  }
})

test('the first frame with notes counts from OBS 1:1: Hindi has notes for story 3 only (in the test unit), so that is the example', async () => {
  if (!ALL_PACKS.includes('hi')) return
  await installPacks(['hi'])
  await withObs('hi')
  const o = (await examplesFor('hi', 'hi')).find((e) => e.ref?.startsWith('obs '))
  expect(o?.ref).toMatch(/^obs 3:\d+$/)
  expect(o?.lang).toBe('hi')
})

test('without the stories on the phone there is no OBS example', async () => {
  if (!ALL_PACKS.includes('en')) return
  await installPacks(['en'])
  await withObs('en', 'none')
  const ex = await examplesFor('en', 'en')
  expect(ex.some((e) => e.ref?.startsWith('obs '))).toBe(false)
  await withObs('en')
})
