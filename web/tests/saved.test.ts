// Saved items and personal notes (saved.ts, Fase 2d): each kind saved and opened again through the usual path, also after the
// packs change and with no internet; a note tied to a verse or an article comes back there; what is kept survives a reload;
// Erase and "Don't keep" leave nothing; the Saved view does not open under the PIN lock; bidi marks are stripped from what is
// typed; a full phone is said, not thrown. Nothing of it is counted, and a note is never part of what online AI is given.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import { ALL_PACKS, installPacks } from './fs-packs'
import { turn } from './harness'
import type { ConvState } from '../src/pipeline'
import {
  addSaved, allTags, editSaved, eraseSaved, groupSaved, isSaved, itemTitle, KINDS, MAX_ITEMS, NOTE_MAX, noteFor, noteShareText, notes,
  notesAbout, parseTags, personal, type Query, queryOfAnswer, removeNote, removeSaved, reopen, resetSaved, SAVED_KEY, SAVED_LANGS, savedItems,
  searchNotes, searchSaved, setNote, ST,
} from '../src/saved'
import { plainContext } from '../src/context'

// a phone's localStorage; `full` makes every write fail as a full phone does
const store = new Map<string, string>()
let full = false
const fake = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (full) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
    store.set(k, v)
  },
  removeItem: (k: string) => void store.delete(k),
  key: () => null, length: 0,
}
const before = (globalThis as any).localStorage
beforeAll(() => { (globalThis as any).localStorage = fake })
afterAll(() => {
  (globalThis as any).localStorage = before
  resetSaved()
})
beforeEach(() => {
  full = false
  store.clear()
  resetSaved()
})
/** as after the app is opened again: read from the phone */
const reload = () => resetSaved()

const RUTH: Query = { k: 'passage', ref: 'rut 1:16', lang: 'en', what: ['text', 'notes', 'questions', 'terms'] }
const METAPHOR: Query = { k: 'article', id: 'ta:translate/figs-metaphor', lang: 'en' }
const JONAH_Q: Query = { k: 'search', q: 'Where was Jonah swallowed by the fish?', lang: 'en' }

test('the query of an answer: a passage, an article, the typed question, a button\'s sheet', () => {
  const sheet = (o: object) => ({ id: 'x', intent: 'passage', ref: null, what: [], version: null, concept: null, term: null, phrase: null, candidates: null, lang: 'en', ...o })
  expect(queryOfAnswer({ sheet: sheet({ ref: 'rut 1:16', what: ['text', 'notes'] }), ref: 'rut 1:16', q: 'What does Ruth 1:16 say?' }))
    .toEqual({ k: 'passage', ref: 'rut 1:16', lang: 'en', what: ['text', 'notes'] })
  expect(queryOfAnswer({ sheet: sheet({ intent: 'article', concept: 'tw:kt/grace' }), concept: 'tw:kt/grace', q: 'What does grace mean?', lang: 'en' }))
    .toEqual({ k: 'article', id: 'tw:kt/grace', lang: 'en' })
  // a free question is asked again as typed (without the marks pasted text may carry)
  expect(queryOfAnswer({ sheet: sheet({ intent: 'search' }), ref: 'jon 1:17', q: '⁨Where was Jonah swallowed?⁩' }))
    .toEqual({ k: 'search', q: 'Where was Jonah swallowed?', lang: 'en' })
  // a button: its passage, else its sheet under its label
  expect(queryOfAnswer({ sheet: sheet({ intent: 'count' }), ref: 'rut 1', label: 'Ruth 1' })).toEqual({ k: 'passage', ref: 'rut 1', lang: 'en' })
  const s = queryOfAnswer({ sheet: sheet({ intent: 'choose', candidates: ['tw:kt/love'] }), label: 'love' })!
  expect(s.k === 'search' && s.sheet?.intent).toBe('choose')
  expect(queryOfAnswer({})).toBeNull()
})

test('save and open again each kind, through the usual path, with no internet', async () => {
  await installPacks(['en'])
  // (fs-packs serves the packs only: any other fetch fails, as on a phone with no internet)
  await expect(fetch('https://example.org/')).rejects.toThrow()
  const c: ConvState = { last: null }
  // a passage
  expect(addSaved({ q: RUTH, label: 'What does Ruth 1:16 say?', ui: 'en' }).res).toBe('ok')
  expect(isSaved(RUTH)).toBe(true)
  const p = await reopen(RUTH, 'Ruth 1:16')
  expect(p.k).toBe('sheet')
  if (p.k !== 'sheet') return
  expect(p.sheet).toMatchObject({ intent: 'passage', ref: 'rut 1:16', lang: 'en' })
  const a1 = await turn(c, { q: 'Ruth 1:16', sheet: p.sheet }, 'en')
  expect(a1.ref).toBe('rut 1:16')
  expect(a1.reply.study ?? a1.reply.info).toBeTruthy()
  // an article
  expect(addSaved({ q: METAPHOR, label: 'Metaphor', ui: 'en' }).res).toBe('ok')
  const a = await reopen(METAPHOR, 'Metaphor')
  expect(a.k === 'sheet' && a.sheet.intent === 'article' && a.sheet.concept).toBe(METAPHOR.id)
  if (a.k === 'sheet') expect((await turn(c, { q: 'Metaphor', sheet: a.sheet }, 'en')).concept).toBe(METAPHOR.id)
  // a question: asked again as typed
  expect(addSaved({ q: JONAH_Q, label: JONAH_Q.q, ui: 'en' }).res).toBe('ok')
  const s = await reopen(JONAH_Q, JONAH_Q.q)
  expect(s).toEqual({ k: 'ask', q: JONAH_Q.q })
  const a3 = await turn({ last: null }, { q: JONAH_Q.q, slots: null }, 'en')
  expect(a3.reply).toBeTruthy()
  // an online answer: its text kept (it cannot be asked again offline), and its question can be
  const r = addSaved({ q: RUTH, label: 'What does Ruth 1:16 mean?', ui: 'en', ai: { text: 'Ruth **commits** to Naomi.', model: 'gpt-x' }, question: 'What does Ruth 1:16 mean?' })
  expect(r.res).toBe('ok')
  expect(r.item!.kind).toBe('answer')
  expect(isSaved(RUTH, true)).toBe(true)
  // saving the same again keeps one
  addSaved({ q: RUTH, label: 'again', ui: 'en' })
  expect(savedItems().length).toBe(4)
  reload()
  const ans = savedItems().find((x) => x.kind === 'answer')!
  expect(ans.ai).toEqual({ text: 'Ruth **commits** to Naomi.', model: 'gpt-x' })
  expect(ans.question).toBe('What does Ruth 1:16 mean?')
  expect((await reopen(ans.q, ans.label)).k).toBe('sheet')
  // by kind, in order
  expect(groupSaved(savedItems()).map((g) => g.kind)).toEqual(KINDS)
})

test('after the packs change: another pack that has the book, else said plainly', async () => {
  const gen: Query = { k: 'passage', ref: 'gen 1:1', lang: 'en', what: ['text', 'notes'] }
  addSaved({ q: gen, label: 'Genesis 1:1', ui: 'en' })
  if (ALL_PACKS.includes('id')) {
    // the Indonesian pack has no Genesis (explore.test.ts): English was removed, so it cannot open, and says which pack it needs
    await installPacks(['id'])
    expect(await reopen(gen, 'Genesis 1:1')).toEqual({ k: 'missing', lang: 'en' })
    // a book Indonesian has opens from it
    const jon: Query = { k: 'passage', ref: 'jon 1:3', lang: 'en' }
    const p = await reopen(jon, 'Jonah 1:3')
    if (p.k === 'sheet') expect(p.sheet.lang).toBe('id')
  }
  if (ALL_PACKS.includes('es-419')) {
    // saved from the Spanish pack, which is gone: English has the verse
    await installPacks(['en'])
    const p = await reopen({ k: 'passage', ref: 'rut 1:16', lang: 'es-419' }, 'Rut 1:16')
    expect(p.k === 'sheet' && p.sheet.lang).toBe('en')
  }
  await installPacks(['en'])
  expect((await reopen({ k: 'article', id: 'ta:translate/no-such-article', lang: 'en' }, 'x')).k).toBe('missing')
  // no language at all: missing, never a throw
  await installPacks([])
  expect(await reopen(gen, 'Genesis 1:1')).toEqual({ k: 'missing', lang: 'en' })
  expect(await reopen(JONAH_Q, 'x')).toEqual({ k: 'missing', lang: null })
  await installPacks(['en'])
})

test('a note tied to a verse comes back on it (and on a passage that holds it); one on an article, on the article', () => {
  expect(setNote({ k: 'passage', ref: 'rut 1:16', lang: 'en' }, 'Ruth 1:16', 'Ruth chooses Naomi’s God.', 'en')).toBe('ok')
  expect(setNote(METAPHOR, 'Metaphor', 'Say it as a comparison.', 'en')).toBe('ok')
  reload()
  const on = (ref: string) => notesAbout({ k: 'passage', ref, lang: 'es-419' }).map((n) => n.text)
  expect(on('rut 1:16')).toEqual(['Ruth chooses Naomi’s God.'])
  expect(on('rut 1')).toEqual(['Ruth chooses Naomi’s God.'])
  expect(on('rut 1:16-18')).toEqual(['Ruth chooses Naomi’s God.'])
  expect(on('rut 1:1-2:3')).toEqual(['Ruth chooses Naomi’s God.'])
  expect(on('rut')).toEqual(['Ruth chooses Naomi’s God.'])
  expect(on('rut 1:17')).toEqual([])
  expect(on('rut 2')).toEqual([])
  expect(on('jon 1:16')).toEqual([])
  expect(on('rut front:intro')).toEqual([])
  expect(notesAbout({ ...METAPHOR, lang: 'fr' }).map((n) => n.text)).toEqual(['Say it as a comparison.'])
  expect(notesAbout({ k: 'article', id: 'ta:translate/figs-simile', lang: 'en' })).toEqual([])
  // a question's note: the same question (any case, marks or punctuation)
  setNote(JONAH_Q, JONAH_Q.q, 'Inside the fish, in the sea.', 'en')
  expect(notesAbout({ k: 'search', q: 'where was JONAH swallowed by the fish' }).length).toBe(1)
  // one note per place: writing again changes it; an empty note deletes it
  setNote(METAPHOR, 'Metaphor', 'Use a simile.', 'en')
  expect(noteFor(METAPHOR)!.text).toBe('Use a simile.')
  expect(notes().length).toBe(3)
  setNote(METAPHOR, 'Metaphor', '   ', 'en')
  expect(noteFor(METAPHOR)).toBeUndefined()
  expect(searchNotes('naomi').map((n) => n.label)).toEqual(['Ruth 1:16'])
  removeNote(notes()[0]!.id)
  expect(notes().length).toBe(1)
})

test('kept on the phone: names, groups and notes come back; what is not an item is left out', () => {
  const r = addSaved({ q: RUTH, label: 'Ruth 1:16', ui: 'en' }).item!
  addSaved({ q: METAPHOR, label: 'Metaphor', ui: 'en' })
  expect(editSaved(r.id, 'Ruth’s promise', ['Ruth, Promises', 'ruth'])).toBe('ok')
  setNote(RUTH, 'Ruth 1:16', 'Your people shall be my people.', 'en')
  const raw = store.get(SAVED_KEY)!
  reload()
  expect(JSON.parse(store.get(SAVED_KEY)!)).toEqual(JSON.parse(raw))
  const x = savedItems().find((i) => i.id === r.id)!
  expect(x.name).toBe('Ruth’s promise')
  expect(x.tags).toEqual(['Ruth', 'Promises', 'ruth'])
  expect(itemTitle(x, 'en')).toBe('Ruth’s promise')
  // named or grouped: taking it out of Saved asks a second tap (savedview.ts, explore.ts)
  expect(personal(x)).toBe(true)
  expect(personal(savedItems().find((i) => i.q.k === 'article'))).toBe(false)
  expect(itemTitle({ ...x, name: undefined }, 'es')).toBe('Rut 1:16')
  expect(allTags()).toContain('Promises')
  expect(searchSaved('promise').map((i) => i.id)).toEqual([r.id])
  expect(searchSaved('', 'Promises').map((i) => i.id)).toEqual([r.id])
  expect(searchSaved('metafora').length + searchSaved('metaphor').length).toBe(1)
  expect(noteFor(RUTH)!.text).toBe('Your people shall be my people.')
  // what was on the phone is read with care: junk and broken text give an empty list, never an error
  store.set(SAVED_KEY, JSON.stringify({ v: 1, items: [{ id: 'a', kind: 'passage', q: { k: 'passage', ref: '<img>', lang: 'en' } }, { id: 'b', kind: 'weird', q: RUTH }, null, 5], notes: [{ id: 'n', text: '', q: RUTH }] }))
  reload()
  expect(savedItems()).toEqual([])
  expect(notes()).toEqual([])
  store.set(SAVED_KEY, '{not json')
  reload()
  expect(savedItems()).toEqual([])
  removeSaved('nothing')
})

test('Erase leaves nothing; "Don\'t keep" writes nothing on the phone', () => {
  addSaved({ q: RUTH, label: 'Ruth 1:16', ui: 'en' })
  setNote(RUTH, 'Ruth 1:16', 'a note', 'en')
  expect(store.has(SAVED_KEY)).toBe(true)
  eraseSaved()
  expect(store.has(SAVED_KEY)).toBe(false)
  expect(savedItems()).toEqual([])
  expect(notes()).toEqual([])
  reload()
  expect(savedItems()).toEqual([])
  // conversations not kept (menu > Safety): only while the app is open
  store.set('btsm.history', 'none')
  reload()
  expect(addSaved({ q: RUTH, label: 'Ruth 1:16', ui: 'en' }).res).toBe('ok')
  expect(setNote(RUTH, 'Ruth 1:16', 'only for now', 'en')).toBe('ok')
  expect(savedItems().length).toBe(1)
  expect(store.has(SAVED_KEY)).toBe(false)
  reload()
  expect(savedItems()).toEqual([])
  store.delete('btsm.history')
})

test('the Saved view does not open under the PIN lock', async () => {
  const had = (globalThis as any).document
  // a page with the lock on it, and nothing else: opening the view would have to make elements, and cannot
  ;(globalThis as any).document = { querySelector: (s: string) => (s === '#lock' ? {} : null) }
  try {
    const { openSaved, savedOpen } = await import('../src/savedview')
    expect(openSaved()).toBe(false)
    expect(savedOpen()).toBe(false)
  } finally {
    ;(globalThis as any).document = had
  }
})

test('bidi marks are stripped from what is typed; groups split on Latin and Arabic commas', () => {
  const marked = '⁧راعوث⁩ ‏يختار‎ ⁨Naomi⁩'
  setNote(RUTH, '⁨Ruth 1:16⁩', marked, 'ar')
  const n = noteFor(RUTH)!
  expect(n.text).toBe('راعوث يختار Naomi')
  expect(n.label).toBe('Ruth 1:16')
  const x = addSaved({ q: METAPHOR, label: '⁨Metaphor⁩', ui: 'ar' }).item!
  expect(x.label).toBe('Metaphor')
  editSaved(x.id, '‫استعارة‬', [' ⁨راعوث⁩، صور بلاغية ; Ruth'])
  const y = savedItems().find((i) => i.id === x.id)!
  expect(y.name).toBe('استعارة')
  expect(y.tags).toEqual(['راعوث', 'صور بلاغية', 'Ruth'])
  expect(parseTags('a, b,,a ،c؛ d')).toEqual(['a', 'b', 'c', 'd'])
  // shared as plain words, with the app's link
  const t = noteShareText(n, 'ar')
  expect(t).not.toMatch(/[⁦-⁩‎‏‪-‮]/)
  expect(t).toContain('راعوث يختار Naomi')
  expect(t).toContain('https://')
})

test('a full phone is said, not thrown, and nothing half-saved stays', () => {
  addSaved({ q: RUTH, label: 'Ruth 1:16', ui: 'en' })
  full = true
  expect(addSaved({ q: METAPHOR, label: 'Metaphor', ui: 'en' }).res).toBe('full')
  expect(savedItems().length).toBe(1)
  expect(setNote(RUTH, 'Ruth 1:16', 'a note', 'en')).toBe('full')
  expect(noteFor(RUTH)).toBeUndefined()
  expect(editSaved(savedItems()[0]!.id, 'name', [])).toBe('full')
  expect(savedItems()[0]!.name).toBeUndefined()
  full = false
  // bounded: a long note is cut, and there is a most
  setNote(RUTH, 'Ruth 1:16', 'x'.repeat(NOTE_MAX + 500), 'en')
  expect(noteFor(RUTH)!.text.length).toBe(NOTE_MAX)
  for (let i = savedItems().length; i < MAX_ITEMS; i++) addSaved({ q: { k: 'search', q: `question ${i}` }, label: `q${i}`, ui: 'en' })
  expect(savedItems().length).toBe(MAX_ITEMS)
  expect(addSaved({ q: METAPHOR, label: 'Metaphor', ui: 'en' }).res).toBe('many')
})

test('a note is never part of what online AI is given', () => {
  setNote(RUTH, 'Ruth 1:16', 'ZEBRA private thought', 'en')
  const m = { who: 'bot' as const, intro: 'Ruth 1:16', info: '## Ruth 1:16\n\nWhere you go I will go.', saveQ: RUTH }
  const b = plainContext({ m, msgs: [{ who: 'me', text: 'What does Ruth 1:16 say?' }, m], passage: '' })
  expect(JSON.stringify(b)).not.toContain('ZEBRA')
})

test('the words in the six languages', () => {
  expect(SAVED_LANGS.sort()).toEqual(['ar', 'en', 'es', 'fr', 'hi', 'id'])
  const keys = Object.keys(ST('en')).sort()
  for (const l of SAVED_LANGS) {
    const s = ST(l)
    expect(Object.keys(s).sort()).toEqual(keys)
    for (const k of keys) if (k !== 'groups') expect((s as any)[k].trim().length).toBeGreaterThan(0)
    expect(Object.keys(s.groups).sort()).toEqual([...KINDS].sort())
    // the placeholders survive translation
    expect(s.menuSub).toContain('{n}')
    expect(s.menuSub).toContain('{m}')
    expect(s.missing).toContain('{lang}')
    expect(s.online).toContain('{model}')
  }
  expect(ST('es-419').save).toBe('Guardar')
  expect(ST('xx').save).toBe('Save')
})
