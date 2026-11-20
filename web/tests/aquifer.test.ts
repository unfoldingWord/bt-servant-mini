// Aquifer patches in the answers: the notice by review, the tag on every item, the attribution, the source line (a report), the menu
// switch and the AI's note. The rows are marked as the client marks them (language-pack-client patch.ts: `row.patch`).
import { afterAll, expect, test } from 'bun:test'
import { CANON } from '../src/canon'
import { FOLD, FOLD_END } from '../src/focus'
import { ALL_PACKS, installPacks } from './fs-packs'
import { aquiferAbout, aquiferMenu, yaapiAbout, yaapiMenu, licenseName, patchCite, patchForAI, patchNotice, patchTag, reviewOf, type PatchMark } from '../src/aquifer'
import { activePatches, aquiferOn, patchesOf, patchKind, setAquifer, setYaapi, yaapiOn, isPatch, PATCH_LANGS, updateLang } from '../src/packs'
import { settingsRows } from '../src/menu'
import { buildSheet } from '../src/sheet'
import { answerSheet, passageContext, resetLangs, setUiLang, studyOf, helpView } from '../src/answer'
import { openLang } from '../src/packs'

const mark = (review?: string): PatchMark => ({
  patch: 'es-419-x-aquifer', source: 'aquifer', ...(review ? { review } : {}), license: 'CC-BY-SA-4.0',
  rights: '© 2022 unfoldingWord; adapted by Mission Mutual',
  attribution: 'unfoldingWord® Translation Notes © 2022 unfoldingWord. Released under CC BY-SA 4.0 license.',
  release: 'UWTranslationNotes@603546c',
})

test('review: none, mixed and anything unknown read as unknown translation form', () => {
  expect(reviewOf(mark('none'))).toBe('none')
  expect(reviewOf(mark('mixed'))).toBe('none')
  expect(reviewOf(mark())).toBe('none')
  expect(reviewOf(mark('community'))).toBe('community')
  expect(reviewOf(mark('professional'))).toBe('professional')
})

test('the tag and the notice say what the review says, in every language, never "human" or "AI"', () => {
  for (const lang of ['en', 'es', 'fr', 'id', 'hi', 'ar', 'es-419', 'xx']) {
    for (const r of ['none', 'community', 'professional', 'mixed']) {
      const tag = patchTag(lang, mark(r))
      const n = patchNotice(lang, [mark(r)])
      expect(tag).toContain('Aquifer')
      expect(n).toContain('Aquifer')
      // the attribution and the adaptation notice of the row, with the license
      expect(n).toContain('Released under CC BY-SA 4.0 license')
      expect(n).toContain('Mission Mutual')
      expect(n).toContain('CC BY-SA 4.0')
    }
  }
  expect(patchTag('es', mark('none'))).toBe('Aquifer · forma de traducción desconocida')
  expect(patchTag('es', mark('community'))).toBe('Aquifer · revisión de la comunidad')
  expect(patchTag('es', mark('professional'))).toBe('Aquifer · revisión editorial')
  expect(patchNotice('es', [mark('none')])).toContain('Forma de traducción desconocida. Contenido de Aquifer; no es parte de las ayudas oficiales de este idioma.')
  expect(patchNotice('es', [mark('community')])).toContain('Revisión de la comunidad. Contenido de Aquifer;')
  expect(patchNotice('es', [mark('professional')])).toContain('Revisión editorial de Aquifer. Contenido de Aquifer;')
  expect(patchNotice('en', [mark('none')])).not.toMatch(/human|AI-|IA /i)
  expect(licenseName('CC-BY-SA-4.0')).toBe('CC BY-SA 4.0')
})

test('one notice per patch, review and release; none without a patch', () => {
  expect(patchNotice('es', [])).toBe('')
  const one = patchNotice('es', [mark('none'), mark('none'), mark('none')])
  expect(one.match(/Contenido de Aquifer/g)?.length).toBe(1)
  expect(patchNotice('es', [mark('none'), mark('community')]).match(/Contenido de Aquifer/g)?.length).toBe(2)
})

test('the report and the online AI learn where the notes came from', () => {
  expect(patchCite(mark('community'))).toContain('aquifer-patch es-419-x-aquifer:community')
  expect(patchCite(mark('mixed'))).toContain('es-419-x-aquifer:none')
  expect(patchForAI(mark('none'))).toMatch(/from Aquifer.*CC BY-SA 4\.0.*review: none.*say they come from Aquifer/s)
})

test('hi, es-419 and id have a patch; the patch is not a language; ru and fr wait', () => {
  expect([...PATCH_LANGS]).toEqual(['hi', 'es-419', 'id'])
  expect(patchesOf('hi')).toEqual(['hi-x-aquifer'])
  expect(patchesOf('es-419')).toEqual(['es-419-x-aquifer', 'es-419-x-yaapi'])
  expect(patchesOf('ru')).toEqual([])
  expect(patchesOf('fr')).toEqual([])
  expect(patchKind('es-419-x-yaapi')).toBe('yaapi')
  expect(patchKind('hi-x-aquifer')).toBe('aquifer')
  expect(isPatch('hi-x-aquifer')).toBe(true)
  expect(isPatch('es-419')).toBe(false)
  expect(isPatch('zxx-obsimg')).toBe(false)
})

test('the switch: on unless turned off; its row is in Settings only with a patch language', () => {
  const store: Record<string, string> = {}
  const had = (globalThis as any).localStorage
  ;(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } }
  try {
  expect(aquiferOn()).toBe(true)
  setAquifer(false)
  expect(aquiferOn()).toBe(false)
  setAquifer(true)
  expect(aquiferOn()).toBe(true)
  } finally {
    // (the other test files share this process: put their localStorage back)
    if (had === undefined) delete (globalThis as any).localStorage
    else (globalThis as any).localStorage = had
  }
  expect(settingsRows({ online: true, update: true })).not.toContain('aquifer')
  expect(settingsRows({ online: true, update: true, aquifer: true })).toEqual(['online', 'model', 'suggest', 'aquifer', 'safety', 'usage', 'update'])
  expect(aquiferMenu('es').title).toBe('Usar ayudas complementarias de Aquifer')
  for (const l of ['en', 'es', 'fr', 'id', 'hi', 'ar']) expect(aquiferAbout(l)).toContain('Aquifer')
})

// -------------------------------------------------------------------------------------- the answers, over a real pack

/** Marks every row of the notes and questions of every book the reader gives as the client marks a patch's rows. */
async function markedReader(lang: string, m: PatchMark) {
  const r: any = await openLang(lang)
  const book = r.book.bind(r)
  const was = r.book
  r.book = async (code: string) => {
    const b = await book(code)
    if (!b) return b
    const pm = (t: any) => (t ? { ...t, rows: t.rows.map((x: any) => ({ ...x, patch: m })) } : t)
    // (a patch's release is a commit, as in the real catalogs)
    const res = b.res.map(([k, v]: [string, string]) => [k, /\/(tn|tq)$/.test(k) ? 'UWTranslationNotes@603546cd949d694d42d2b85dc0e37fdacb20407f' : v])
    return { ...b, res, notes: pm(b.notes), questions: pm(b.questions) }
  }
  return () => { r.book = was }
}

const HAS = ALL_PACKS.includes('es-419')
afterAll(() => resetLangs())

async function ask(ui: string, slots: Record<string, unknown>) {
  setUiLang(ui)
  const { sheet } = await buildSheet('t', { lang: ui, ...slots } as any, null)
  return { sheet, r: await answerSheet(sheet) }
}

test('a verse with notes from a patch: each note and question is tagged, one notice with the attribution, the source line names the patch', async () => {
  if (!HAS) return
  await installPacks(['es-419'])
  const undo = await markedReader('es-419', mark('community'))
  try {
    resetLangs()
    const n = await ask('es', { intent: 'passage', book: 'Tito', chapter: 2, verse_start: 3, what: ['notes', 'questions'] })
    expect(n.sheet.lang).toBe('es-419')
    const tag = patchTag('es', mark('community'))
    const lines = n.r.answer.split('\n').filter((x) => /^\d+\. /.test(x))
    expect(lines.length).toBeGreaterThan(0)
    for (const l of lines) expect(l).toContain(tag)
    // one notice, with the attribution and the license
    expect(n.r.answer.match(/Contenido de Aquifer; no es parte de las ayudas oficiales/g)?.length).toBe(1)
    // the source line (and the answer) never show the patch's commit as if it were a version
    expect(n.r.answer).not.toContain('603546cd')
    expect(n.r.cites.filter((c) => !c.startsWith('aquifer-patch')).join(' ')).not.toContain('603546cd')
    expect(n.r.answer).toContain('Released under CC BY-SA 4.0 license')
    // outside the last fold: a fold's button would hide the attribution
    const blocks = n.r.answer.split(/\n\n/)
    const at = blocks.findIndex((b) => b.includes('Contenido de Aquifer'))
    const lastFold = blocks.reduce((m, b, i) => (b.startsWith(FOLD) && i < at ? i : m), -1)
    if (lastFold >= 0) expect(blocks.slice(lastFold + 1, at)).toContain(FOLD_END)
    expect(n.r.answer).toContain('Mission Mutual')
    expect(n.r.cites.some((c) => c.startsWith('aquifer-patch es-419-x-aquifer:community'))).toBe(true)
    // the study view and the opened note carry it too
    const st = await studyOf(n.sheet)
    if (st) {
      // the study's source line names the notes readably, not by the patch's commit
      expect(st.source).toContain('Translation Notes (Aquifer)')
      expect(st.source).not.toContain('@')
      expect(st.notes.length).toBeGreaterThan(0)
      for (const x of st.notes) expect(x.patch).toBe(tag)
      expect(st.aquifer).toContain('Contenido de Aquifer')
    }
    const note = (await (await openLang('es-419')).book('tit'))!.notes!.rows.find((x: any) => !x.cols.isIntro)!
    const hv = await helpView('es-419', 'tit', note.id, 'note')
    expect(hv?.md).toContain(tag)
    expect(hv?.md).toContain('Mission Mutual')
    // the online AI is told, in the passage's context
    const ctx = await passageContext(n.sheet)
    expect(ctx).toContain('say they come from Aquifer')
  } finally {
    undo()
    resetLangs()
  }
})

test('a verse with Door43 notes only (no patch rows): no tag, no notice, no patch in the source line', async () => {
  if (!HAS) return
  await installPacks(['es-419'])
  resetLangs()
  const n = await ask('es', { intent: 'passage', book: 'Tito', chapter: 2, verse_start: 3, what: ['notes', 'questions'] })
  expect(n.r.answer).not.toContain('Aquifer')
  expect(n.r.cites.some((c) => c.includes('aquifer-patch'))).toBe(false)
  expect((await passageContext(n.sheet))).not.toContain('Aquifer')
})

test('the daily update brings a patch of a language: its newer revision and the books the phone lacks; a missing patch fails nothing', async () => {
  const calls: string[] = []
  const client = (patchBooks: string[], installed: string[], failPatch = false) => ({
    refresh: async (l: string) => { calls.push(`refresh ${l}`); if (failPatch && l.includes('-x-')) throw new Error('no catalog') },
    open: async (l: string) => ({
      listed: (u: string) => (l.includes('-x-') ? patchBooks.includes(u) : true),
      installed: (u: string) => (l.includes('-x-') ? installed.includes(u) : true), size: () => 0,
    }),
    install: async (l: string, w: { units: string[] }) => { calls.push(`install ${l} ${w.units.join(',')}`) },
  })
  await updateLang(client(['book:mat', 'book:jhn'], ['book:mat']), 'es-419', [], undefined, false)
  expect(calls).toEqual(['refresh es-419', 'refresh es-419-x-aquifer', 'install es-419-x-aquifer book:jhn', 'refresh es-419-x-yaapi', 'install es-419-x-yaapi book:jhn'])
  calls.length = 0
  // metered: nothing of the patch
  await updateLang(client(['book:jhn'], []), 'hi', [], undefined, true)
  expect(calls).toEqual(['refresh hi'])
  calls.length = 0
  // no patch on any server: the language's update is fine
  await updateLang(client([], [], true), 'id', [], undefined, false)
  expect(calls).toEqual(['refresh id', 'refresh id-x-aquifer'])
  calls.length = 0
  // a language with no patch (ru, fr: paused) asks for none
  await updateLang(client(['book:jhn'], []), 'fr', [], undefined, false)
  expect(calls).toEqual(['refresh fr'])
  expect(CANON.length).toBeGreaterThan(60)
})

test('installPatch: a language with no patch (ru, fr: paused) asks nothing of any server', async () => {
  const { installPatch } = await import('../src/packs')
  expect(await installPatch('fr')).toBeNull()
  expect(await installPatch('ru')).toBeNull()
  expect(await installPatch('en')).toBeNull()
})

// ------------------------------------------------------------------------------------------------------- yaapi (Bible text)

const ymark = (): PatchMark => ({
  patch: 'es-419-x-yaapi', source: 'yaapi', license: 'CC-BY-SA-4.0', rights: 'Palabra de Dios para ti, (c) Sociedad Biblica',
  attribution: 'Texto de Palabra de Dios para ti, via yaapi.bible. Texto sin modificar, redistribuido bajo CC BY-SA 4.0.',
  release: 'SPAPDDPT@sha256:0123456789ab', audience: 'readers', style: 'literal',
} as PatchMark)

test('yaapi: tag, notice and source line go by source, not by review; the version and the style are named', () => {
  const m = ymark()
  expect(patchTag('es', m)).toBe('yaapi · SPAPDDPT · texto sin alinear')
  expect(patchTag('en', m)).toBe('yaapi · SPAPDDPT · unaligned text')
  const n = patchNotice('es', [m])
  expect(n).toContain('Texto bíblico de yaapi.bible: SPAPDDPT (literal)')
  expect(n).toContain('No es el texto literal alineado de Door43')
  expect(n).toContain('CC BY-SA 4.0')
  expect(n).toContain('Palabra de Dios para ti')
  expect(n).not.toContain('Revisión')
  expect(patchCite(m)).toContain('yaapi-patch es-419-x-yaapi:SPAPDDPT')
  for (const l of ['en', 'es', 'fr', 'id', 'hi', 'ar']) {
    expect(patchTag(l, m)).toContain('SPAPDDPT')
    expect(patchNotice(l, [m])).toContain('yaapi.bible')
    expect(yaapiAbout(l)).toContain('yaapi')
    expect(yaapiMenu(l).title).toContain('yaapi')
  }
  // an Aquifer mark and a yaapi mark in one answer: two notices
  expect(patchNotice('es', [mark('none'), m]).match(/\*\*(Aquifer|yaapi)\.\*\*/g)).toEqual(['**Aquifer.**', '**yaapi.**'])
})

/** Gives the texts of a book the mark and the key of a yaapi version, as the client does for a patch book with no base text. */
async function yaapiTexts(lang: string, m: PatchMark) {
  const r: any = await openLang(lang)
  const book = r.book.bind(r)
  const was = r.book
  r.book = async (code: string) => {
    const b = await book(code)
    if (!b) return b
    const key = 'yaapi/es-419/SPAPDDPT'
    return { ...b, texts: b.texts.slice(0, 1).map((t: any) => ({ ...t, res: key, patch: m })), res: [...b.res, [key, m.release]] }
  }
  return () => { r.book = was }
}

test('a verse whose text comes from yaapi: the text says its version, that it is unaligned, one notice; no hash shown', async () => {
  if (!HAS) return
  await installPacks(['es-419'])
  const undo = await yaapiTexts('es-419', ymark())
  try {
    resetLangs()
    const n = await ask('es', { intent: 'passage', book: 'Tito', chapter: 2, verse_start: 3, what: ['text'] })
    expect(n.r.answer).toContain('SPAPDDPT')
    expect(n.r.answer).toContain('texto sin alinear')
    expect(n.r.answer.match(/No es el texto literal alineado de Door43/g)?.length).toBe(1)
    expect(n.r.answer).toContain('CC BY-SA 4.0')
    expect(n.r.answer).not.toContain('sha256')
    expect(n.r.cites.some((c) => c.startsWith('yaapi-patch es-419-x-yaapi:SPAPDDPT'))).toBe(true)
    expect(n.r.cites.filter((c) => !c.startsWith('yaapi-patch')).join(' ')).not.toContain('sha256')
    const st = await studyOf(n.sheet)
    if (st) {
      expect(st.texts[0]!.tag).toBe('yaapi · SPAPDDPT · texto sin alinear')
      expect(st.aquifer).toContain('yaapi.bible')
      expect(st.source).not.toContain('sha256')
    }
  } finally {
    undo()
    resetLangs()
  }
})
