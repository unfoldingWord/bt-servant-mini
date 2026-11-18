// Open Bible Stories in Mini (Fase 2c, obs.ts): questions that name a story or a frame in the six languages, the button under a
// passage to the story it is told in, a story's buttons to its Bible passages, Browse's list, a phone without the unit, the
// search, the graph and the online context. The English pack gets the stories of Mini's packs server (obs-fixture.ts); the
// other packs on disk have none, as on the server today, so their questions are answered from English and say so.
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { ALL_PACKS, installPacks } from './fs-packs'
import { fullPhone, nextSteps, stepTarget, turn } from './harness'
import { OBS_BYTES, obsBytes, withObs } from './obs-fixture'
import { answer, type ConvState, contextSheet, type Made } from '../src/pipeline'
import { newGraph, nodeOf } from '../src/graph'
import { passageContext, type Sheet } from '../src/answer'
import { namedStory, obsAnswer, obsAsked, obsPack, storyByName, obsSteps, OW, rangeOfRef, searchObs, storyAt, storyList, type ObsFacts } from '../src/obs'
import { openLang } from '../src/packs'
import { strip } from '../src/bidi'
import { unfold } from '../src/focus'

afterAll(async () => { await installPacks(ALL_PACKS) })

const buttons = (r: any) => nextSteps({ reply: r.reply } as any).map((f: any) => `${f.label} => ${stepTarget(f)}`)
const targets = (r: any) => nextSteps({ reply: r.reply } as any).map((f: any) => stepTarget(f))
const ask = async (q: string, ui: string, c: ConvState = { last: null }) => turn(c, { q }, ui)
/** A button pressed (no question): the sheet as main.ts runSheet sends it. */
const press = async (c: ConvState, f: { sheet?: Sheet }, ui: string) => answer(c, { sheet: { ...f.sheet!, id: `t${Date.now()}` }, ui, meta: '(button)' } as Made, performance.now())

describe('questions that name a story or a frame', () => {
  beforeEach(async () => { await fullPhone() })

  test('read by code in the six languages', () => {
    const cases: [string, string][] = [
      ['What does OBS 3:5 say?', 'obs 3:5'], ['¿qué dice OBS 3:5?', 'obs 3:5'], ['Que dit OBS 3:5 ?', 'obs 3:5'], ['Apa kata OBS 3:5?', 'obs 3:5'],
      ['OBS 3:5 क्या कहता है?', 'obs 3:5'], ['ماذا تقول OBS 3:5؟', 'obs 3:5'], ['OBS ٣:٥', 'obs 3:5'],
      ['story 34', 'obs 34'], ['historia 34', 'obs 34'], ['histoire 34', 'obs 34'], ['cerita 34', 'obs 34'], ['कहानी 34', 'obs 34'], ['القصة 34', 'obs 34'],
      ['OBS 34', 'obs 34'], ['Open Bible Stories 3', 'obs 3'], ['Historias de la Biblia 3:5', 'obs 3:5'], ['story 3, frame 4', 'obs 3:4'],
    ]
    for (const [q, ref] of cases) expect(obsAsked(q)?.ref, q).toBe(ref)
    // not a story: a book's story, a chapter, a number that is no story
    for (const q of ['la historia de Rut 2', 'Ruth 3:4', 'the story of Jonah', 'story 75', 'historia de José']) expect(obsAsked(q), q).toBeNull()
    // a numbered book after the word is the book, not a story; a number of four digits is no story number
    for (const q of ['cerita Alkitab 1 Samuel 17', 'histoire biblique 2 Rois 5', 'historias de la Biblia 1 Reyes 18', 'la historia 1 Samuel 17',
      'story 2 Kings 5', 'story 1 John 3', 'historia 1 Corintios 13', 'कहानी 1 शमूएल 17', 'obs 2000', 'story 2000',
      // abbreviations, as the passage reader knows them
      'story 1 Cor 13', 'story 1 jn 3', 'story 1Jn 3', 'story 1 Thess 4', 'historia 2 Re 5'])
      expect(obsAsked(q), q).toBeNull()
    // (a story of 1 to 3 that a book does not follow is still a story)
    expect(obsAsked('story 2 frame 3')?.ref).toBe('obs 2:3')
    expect(obsAsked('historia 3, ¿qué dice?')?.ref).toBe('obs 3')
    expect(obsAsked('What do the Open Bible Stories translation notes say for story 3, frame 4?')).toEqual({ ref: 'obs 3:4', what: ['notes'] })
  })

  test('OBS 3:5: the frame, its key terms, the next frame, the whole story, its Bible passage (en)', async () => {
    const r: any = await ask('What does OBS 3:5 say?', 'en')
    expect(r.answered).toBe('passage')
    expect(r.ref).toBe('obs 3:5')
    expect(r.reply.intro).toBe('Here is OBS 3:5 of Open Bible Stories (The Flood).')
    expect(r.reply.info).toContain('**3:5** God also commanded Noah')
    expect(r.reply.info).toContain('eight people')
    expect(r.reply.info).toContain('[Noah](tw:names/noah)')
    expect(r.reply.info).toMatch(/Source: unfoldingWord\/en\/obs v9/)
    // the sources once (at the end); at the top, the story's own line
    expect(r.reply.info.match(/unfoldingWord\/en\/obs v9|Open Bible Stories v9/g)).toHaveLength(1)
    expect(r.reply.info.split('\n')[1]).toBe('*A Bible story from: Genesis 6-8*')
    expect(buttons(r)).toEqual([
      // (its key terms, God and Noah, are linked in the answer: no button asks for them again, Abel, Nov 17)
      'Next: OBS 3:6 => obs 3:6 text,notes,questions,terms', 'The whole story: OBS 3 => obs 3 text,notes',
      'Bible: Genesis 6:1–8:22 => gen 6:1-8:22 text,notes', 'Bible stories (OBS) => browse',
    ])
    expect(r.reply.info).toContain('(tw:kt/god)')
  })

  test('a frame\'s notes and questions (story 3, frame 4), as the q36 case asks them', async () => {
    const r: any = await ask('What do the Open Bible Stories translation notes say for story 3, frame 4?', 'en')
    expect(r.ref).toBe('obs 3:4')
    expect(r.reply.info).toContain('### Translation notes for OBS 3:4')
    expect(r.reply.info).toContain('**«Noah warned the people»**')
    expect(r.reply.info).toContain('**«to turn to God»**')
    // the question was not asked for: one tap away
    expect(r.reply.info).toContain('▸ Questions (1)')
  })

  test('a frame with all its helps: each one folded with its count, as under a passage (Abel, Nov 17)', async () => {
    const r: any = await ask('obs 3:4', 'en')
    const info: string = r.reply.info
    expect(info).not.toContain('### ')
    const folds = info.split('\n\n').filter((b) => b.startsWith('▸ ')).map((b) => b.split('\n')[0])
    expect(folds).toEqual([expect.stringMatching(/^▸ Notes for OBS 3:4 \(\d+\)$/), '▸ Questions (1)', expect.stringMatching(/^▸ Key terms \(\d+\)$/)])
    // all of it is still in the answer (sharing, online AI): the notes, the question, the terms' links
    expect(info).toContain('**«Noah warned the people»**')
    expect(info).toMatch(/\[Noah\]\(tw:names\/noah\)/)
    // the frame's text before the folds; "no notes" said before them, not inside the last one
    expect(info.indexOf('**3:4**')).toBeLessThan(info.indexOf('▸ '))
    const r5: any = await ask('obs 3:5', 'en')
    // only the helps there are: no "There are no questions" line between the frame and its folds (Abel, Nov 17)
    expect(r5.reply.info).not.toContain('There are no')
    // asked alone, "none" is the answer
    const q5 = await obsAnswer({ ref: 'obs 3:5', what: ['notes'], lang: 'en' }, 'en')
    expect(q5.answer).toContain('There are no translation notes for OBS 3:5')
    // shared or sent to the online AI without the fold marks: every note and the question still there
    const plain = unfold(info)
    expect(plain).not.toContain('▸')
    expect(plain).toContain('**«Noah warned the people»**')
    expect(plain).toMatch(/^- \*\*/m)
  })

  test('the one help a frame question asks for stays open; the text and the others folded', async () => {
    const o = await obsAnswer({ ref: 'obs 3:4', what: ['text', 'notes'], lang: 'en' }, 'en')
    expect(o.answer).toContain('### Translation notes for OBS 3:4')
    expect(o.answer).toContain('▸ Questions (1)')
    const q = await obsAnswer({ ref: 'obs 3:4', what: ['questions'], lang: 'en' }, 'en')
    expect(q.answer).toContain('### Comprehension questions for OBS 3:4')
    expect(q.answer).toMatch(/▸ Notes for OBS 3:4 \(\d+\)/)
  })

  test('a whole story in five languages, from the English pack (said so), with its Bible passages', async () => {
    const say: Record<string, [string, RegExp]> = {
      es: ['historia 34', /^Aquí está la historia OBS 34: Jesus Teaches Other Stories\. De los recursos en English/],
      // (no French pack on this phone: the question is answered from English, which has them, so nothing to say)
      fr: ['histoire 34', /^Voici l’histoire OBS 34 : Jesus Teaches Other Stories\.$/],
      id: ['cerita 34', /^Ini cerita OBS 34: Jesus Teaches Other Stories\. Dari sumber daya English/],
      hi: ['कहानी 34', /^यह कहानी OBS 34 है: Jesus Teaches Other Stories। English संसाधनों से/],
      ar: ['القصة 34', /^هذه القصة OBS 34: Jesus Teaches Other Stories\. من موارد English/],
    }
    for (const [ui, [q, intro]] of Object.entries(say)) {
      const r: any = await ask(q, ui)
      expect(r.ref, ui).toBe('obs 34')
      expect(strip(r.reply.intro), ui).toMatch(intro)
      expect(r.reply.info, ui).toContain('**34:1** Jesus told many other stories')
      expect(r.reply.info, ui).toContain('**34:10**')
      expect(targets(r), ui).toEqual(expect.arrayContaining(['obs 34:1 text,notes,questions,terms', 'mat 13:31-46 text,notes', 'mrk 4:26-34 text,notes', 'luk 13:18-21 text,notes', 'obs 35 text,notes', 'browse']))
    }
    // Arabic buttons in Arabic, the books by their Arabic names
    const ar: any = await ask('القصة 34', 'ar')
    expect(buttons(ar)).toContain('الكتاب المقدس: متى 13:31–46 => mat 13:31-46 text,notes')
    expect(buttons(ar)[0]).toBe('ابدأ القصة: OBS 34:1 => obs 34:1 text,notes,questions,terms')
  })

  test('"OBS 34", "Open Bible Stories 3" (read as obs N by the router) and a story named by what it is about', async () => {
    expect((await ask('OBS 34', 'en')).ref).toBe('obs 34')
    const r: any = await ask('Open Bible Stories 3', 'en')
    expect(r.ref).toBe('obs 3')
    expect(r.reply.info).toContain('A Bible story from: Genesis 6-8')
    // "the story of Noah": OBS 3, whose frames name him; "the story of Jonah": no story is his, the verses as before
    expect((await ask('the story of Noah', 'en')).ref).toBe('obs 3')
    const jonah: any = await ask('la historia de Jonás', 'es')
    expect(jonah.answered).toBe('search')
    expect(jonah.ref).toMatch(/^jon /)
  })

  test('no such story, no such frame: said plainly, with ways on', async () => {
    const r: any = await ask('OBS 60', 'en')
    expect(r.reply.info).toBe('Open Bible Stories has 50 stories, numbered 1 to 50: there is no story 60.')
    // a number too long for a story (the router reads «obs 2000» as obs 2000): said with its number
    expect((await ask('obs 2000', 'en')).reply.info).toBe('Open Bible Stories has 50 stories, numbered 1 to 50: there is no story 2000.')
    expect(targets(r)).toEqual(['browse'])
    const f: any = await ask('historia 3:40', 'es')
    expect(f.reply.info).toBe('La historia 3 tiene los cuadros 1 a 16: no hay cuadro 40.')
    expect(targets(f)).toContain('obs 3 text,notes')
  })
})

describe('OBS questions the obs set missed (Nov 17): fixed in code, no retraining', () => {
  beforeEach(async () => { await fullPhone() })
  const slotsTurn = async (c: ConvState, q: string, lang: string, slots: any) => turn(c, { q, slots: { lang, ...slots } }, lang)

  test('Arabic: a letter joined before the story or the frame ("للقصة 1", "والإطار 4", "بالقصة 3")', () => {
    expect(obsAsked('ابدأ جلسة الحركات الخمس للقصة 1')?.ref).toBe('obs 1')
    expect(obsAsked('ماذا في القصة 3 والإطار 4؟')?.ref).toBe('obs 3:4')
    expect(obsAsked('ملاحظات بالقصة 3')).toEqual({ ref: 'obs 3', what: ['notes'] })
    expect(obsAsked('وقصة 34')?.ref).toBe('obs 34')
    // a word that only ends in the letters is no story
    expect(obsAsked('مرقصة 3')).toBeNull()
  })

  test('a story by its common name in any language, whatever pack is on the phone', async () => {
    for (const [q, lang, ref] of [['la historia de Noé', 'es', 'obs 3'], ['l’histoire de Noé', 'fr', 'obs 3'], ['قصة نوح', 'ar', 'obs 3'],
      ['नूह की कहानी', 'hi', 'obs 3'], ['la historia de Moisés', 'es', 'obs 9'], ['l’histoire de Lazare', 'fr', 'obs 37'], ['قصة داود', 'ar', 'obs 17'],
      ['cerita Nuh', 'id', 'obs 3'], ['the story of the prodigal son', 'en', 'obs 35']] as const)
      expect((await namedStory(q, lang))?.ref, q).toBe(ref)
    // no story of Jonah; two names of different stories: neither
    expect(await namedStory('la historia de Jonás', 'es')).toBeNull()
    expect(storyByName(['moises', 'david'])).toBeNull()
    expect(storyByName(['noe', 'diluvio'])).toBe(3)
    expect(storyByName(['والطوفان'])).toBe(3)
    expect(storyByName(['jonas'])).toBeNull()
    expect(storyByName(['ونوح'])).toBe(3)
    expect(storyByName(['لعازر'])).toBe(37)
    expect(storyByName(['isaac'])).toBeNull()
    // another word, or a name in two stories: not a story (the review of Nov 17)
    for (const q of ['the story of Paul shipwreck', 'la historia de Lázaro y el rico', 'l’histoire de José et Marie', 'la historia de Abraham e Isaac'])
      expect(await namedStory(q, 'en'), q).toBeNull()
    // the answer itself: Noah's story, not Genesis verses
    expect((await ask('la historia de Noé', 'es')).ref).toBe('obs 3')
    expect((await ask('قصة نوح', 'ar')).ref).toBe('obs 3')
  })

  test('"next frame" in five languages goes to the next frame, with or without a reader', async () => {
    for (const [q, lang] of [['next frame', 'en'], ['¿y el cuadro siguiente?', 'es'], ['et l’image suivante ?', 'fr'], ['والإطار التالي؟', 'ar'], ['अगला फ़्रेम', 'hi']] as const) {
      const c: ConvState = { last: null }
      await ask('OBS 3:5', lang, c)
      expect((await ask(q, lang, c)).ref, q).toBe('obs 3:6')
      // the small model reads it as nothing, or as a book of its own («أمثال»): the follow-up still wins
      const c2: ConvState = { last: null }
      await ask('OBS 3:5', lang, c2)
      expect((await slotsTurn(c2, q, lang, { intent: 'passage', book: 'أمثال', what: ['intro'] })).ref, q).toBe('obs 3:6')
    }
    const c: ConvState = { last: null }
    await ask('OBS 3:5', 'en', c)
    expect((await ask('previous frame', 'en', c)).ref).toBe('obs 3:4')
  })

  test("a follow-up code reads is not overridden by a reader's junk; a book the question names stays the reader's", async () => {
    const junk: [string, string, any, string][] = [
      ['what are the key terms?', 'en', { intent: 'passage', book: 'article', what: ['terms'] }, 'obs 3:5'],
      ['¿y las notas?', 'es', { intent: 'search', term: 'notes' }, 'obs 3:5'],
      ['والملاحظات؟', 'ar', { intent: 'passage', book: 'unknown', what: ['notes'] }, 'obs 3:5'],
      ['और टिप्पणियाँ?', 'hi', { intent: 'count', what: ['notes'] }, 'obs 3:5'],
    ]
    for (const [q, lang, slots, ref] of junk) {
      const c: ConvState = { last: null }
      await ask('OBS 3:5', lang, c)
      const r: any = await slotsTurn(c, q, lang, slots)
      expect(r.ref, q).toBe(ref)
      expect(r.answered, q).toBe('passage')
    }
    // in a Bible book too
    const c: ConvState = { last: null }
    await ask('Rut 2:3', 'es', c)
    expect((await slotsTurn(c, '¿y las notas?', 'es', { intent: 'search', term: 'notes' })).ref).toBe('rut 2:3')
    // "والعدد 5" after Ruth 2:3: the reader that reads the book of Numbers keeps it
    const c3: ConvState = { last: null }
    await ask('راعوث 2:3', 'ar', c3)
    expect((await slotsTurn(c3, 'والعدد 5', 'ar', { intent: 'passage', book: 'العدد', chapter: 5, what: ['text'] })).ref).toMatch(/^num 5/)
  })
})

describe('from a passage to its story, and back', () => {
  beforeEach(async () => { await fullPhone() })

  test('Genesis 7:1-5: "This part is told in OBS 3:6: The Flood", the frame whose words are the passage\'s', async () => {
    const r: any = await ask('Genesis 7:1-5', 'en')
    expect(buttons(r)).toContain('This part is told in OBS 3:6: The Flood => obs 3:6 text,notes,questions,terms')
    // after the first steps (the next section and the verses around stay first)
    expect(targets(r).indexOf('obs 3:6 text,notes,questions,terms')).toBe(3)
  })

  test('Matthew 13:31 is OBS 34:1, in Spanish and Arabic too (the Arabic pack has Matthew)', async () => {
    expect(buttons(await ask('Matthew 13:31', 'en'))).toContain('This part is told in OBS 34:1: Jesus Teaches Other Stories => obs 34:1 text,notes,questions,terms')
    const ar: any = await ask('متى 13:31', 'ar')
    expect(buttons(ar)).toContain('هذا الجزء مروي في OBS 34:1: Jesus Teaches Other Stories => obs 34:1 text,notes,questions,terms')
  })

  test('the story most about a passage: Genesis 3 is "Sin Enters the World", not the summaries that run over it', async () => {
    const t = await storyAt('gen 3:6', 'en')
    expect(t?.n).toBe(2)
    expect(t?.title).toBe('Sin Enters the World')
    // (the fixture has only story 2's first frame: that one)
    expect(t?.f).toBe(1)
    // where the passage sits in the story when its words do not say: Genesis 8:20, near the end of The Flood
    expect((await storyAt('gen 8:20', 'en'))!.f).toBeGreaterThanOrEqual(13)
  })

  test('near ties go to the story whose words the passage has: Mark 1:21-28 is OBS 26, not 24', async () => {
    const r: any = await ask('Mark 1:21-28', 'en')
    const b = buttons(r).find((x) => x.includes('OBS 2'))
    expect(b).toMatch(/^This part is told in OBS 26:\d+: Jesus Starts His Ministry/)
    // a chapter range ("Genesis 6-8") has its story too
    expect(rangeOfRef('gen 6-8')).toEqual([1006000, 1008999])
    expect((await storyAt('gen 6-8', 'en'))?.n).toBe(3)
  })

  test('a passage no story tells (Ruth 1:1, Titus 1:1): no button', async () => {
    for (const q of ['Ruth 1:1', 'Titus 1:1']) expect(targets(await ask(q, 'en')).some((t) => t.startsWith('obs '))).toBe(false)
  })

  test('a story\'s buttons go to the passages it is told from', async () => {
    const r: any = await ask('OBS 3', 'en')
    expect(targets(r)).toContain('gen 6:1-8:22 text,notes')
    expect(buttons(r)).toContain('Next story: OBS 4: God’s Covenant with Abraham => obs 4 text,notes')
    expect(rangeOfRef('gen 6:1-8:22')).toEqual([1006001, 1008022])
  })
})

describe('Browse: the 50 stories', () => {
  beforeEach(async () => { await fullPhone() })

  test('every story in order, with its title and passages; from the English pack for a phone in Spanish', async () => {
    const at = await obsPack('es-419')
    expect(at?.lang).toBe('en')
    const list = await storyList(at!.r)
    expect(list.length).toBe(50)
    expect(list.map((e) => e.n)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
    expect(list[0]).toEqual({ n: 1, title: 'The Creation', refs: ['gen 1:1-2:25'] })
    expect(list[2]!.title).toBe('The Flood')
    expect(list[49]!.title).toBe('Jesus Returns')
    expect(list.every((e) => e.title && e.refs.length)).toBe(true)
  })

  test('the button under an OBS answer opens that list', async () => {
    const r: any = await ask('OBS 3:5', 'en')
    const b = r.reply.follow.find((f: any) => f.browse)
    expect(b).toEqual({ label: 'Bible stories (OBS)', browse: { obs: true, lang: 'en' } })
  })
})

describe('a phone without the unit', () => {
  test('a pack that lists it: said plainly with its size, the passages still offered, never an error', async () => {
    await installPacks(ALL_PACKS)
    await withObs('en', 'listed')
    const r: any = await ask('What does OBS 3:5 say?', 'en')
    expect(r.answered).toBe('passage')
    // the packs on disk came with the app: the unit comes with its next version (a downloaded pack offers to add it)
    expect(r.reply.info).toMatch(/^Open Bible Stories are not on this phone yet \(English, 218 KB\)\. They will come with the next update of this language\./)
    expect(r.reply.info).toContain('Genesis 6:1–8:22')
    expect(targets(r)).toContain('gen 6:1-8:22 text,notes')
    expect(r.reply.fallback).toBeUndefined()
    // a passage offers no story it cannot show here
    expect(targets(await ask('Genesis 7:1-5', 'en')).some((t) => t.startsWith('obs '))).toBe(false)
  })

  test('a downloaded pack that lists it: a button adds it (its size), then the question again', async () => {
    const f: ObsFacts = { kind: 'obs', n: 3, f: 5, title: 'The Flood', refs: ['gen 6:1-8:22'], state: 'missing', pack: 'en', frames: 0, add: { lang: 'en', bytes: OBS_BYTES }, terms: [] }
    const steps = await obsSteps(f, 'en', 'es')
    expect(steps[0]).toEqual({ k: 'add', label: 'Agregar Historias de la Biblia (218 KB)', lang: 'en' })
    expect(steps).toContainEqual({ k: 'bible', label: 'Biblia: Génesis 6:1–8:22', ref: 'gen 6:1-8:22' })
  })

  test('the Arabic words name Open Bible Stories once, as the other Arabic strings do', () => {
    expect(OW('ar').missing).toBe('Open Bible Stories ليست على هذا الهاتف بعد ({pack}، {size}).')
    expect(OW('ar').none).toContain('لا تحتوي بعد على Open Bible Stories (OBS)')
  })

  test('no pack lists it: "no Open Bible Stories yet", in the question\'s language', async () => {
    await installPacks(ALL_PACKS)
    await withObs('en', 'none')
    const r: any = await ask('historia 34', 'es')
    expect(r.reply.info).toMatch(/^Los idiomas de este teléfono todavía no traen Historias de la Biblia \(OBS\), así que no puedo mostrar OBS 34\./)
    // the story's passages are known without the unit (the common topics)
    expect(targets(r)).toContain('mat 13:31-46 text,notes')
    expect(await searchObs('Noah boat', 'en')).toEqual([])
  })
})

describe('the search', () => {
  test('finds titles and frames, and leaves the verses as they were', async () => {
    await installPacks(ALL_PACKS)
    await withObs('en', 'none')
    const before: any = await ask('Noah flood boat', 'en')
    await fullPhone()
    const hits = await searchObs('Noah flood boat', 'en')
    expect(hits.map((h) => h.ref)).toEqual(['obs 3:2', 'obs 3:3', 'obs 3:4'])
    expect((await searchObs('The Flood', 'en'))[0]).toMatchObject({ ref: 'obs 3', label: 'OBS 3: The Flood' })
    const r: any = await ask('Noah flood boat', 'en')
    expect(r.ref).toBe(before.ref)
    expect(r.reply.info.startsWith(before.reply.info)).toBe(true)
    expect(r.reply.info).toContain('### In Open Bible Stories')
    expect(r.reply.info).toContain('**OBS 3:2: The Flood** — But God was pleased with Noah.')
    // the verses' buttons as before, and the first story after them
    expect(targets(r).slice(0, targets(before).length)).toEqual(targets(before))
    expect(targets(r)).toContain('obs 3:2 text,notes,questions,terms')
  })
})

describe('Hindi: its own Open Bible Stories (Mini\'s server, Nov 16)', () => {
  beforeEach(async () => {
    await fullPhone()
    await withObs('hi')
  })
  afterAll(async () => { await installPacks(ALL_PACKS) })

  test('a story from the Hindi pack, in Hindi, with its notes', async () => {
    const r: any = await ask('कहानी 3', 'hi')
    expect(r.ref).toBe('obs 3')
    expect(strip(r.reply.intro)).toBe('यह कहानी OBS 3 है: बाढ़।')
    expect(r.reply.info).toContain('**3:2** परन्तु परमेश्वर नूह से प्रसन्न था।')
    expect(r.reply.info).toContain('उत्पत्ति अध्याय 6-8 से एक बाइबल की कहानी')
    expect(r.reply.info).toContain('Door43-Catalog/hi/obs v8.3')
  })

  test('Hindi words stay whole (vowel signs are marks): search, a story by what it is about, the frame of a passage', async () => {
    // प्रसन्न ("pleased") and नाव ("boat"): only whole words match
    expect((await searchObs('नूह प्रसन्न', 'hi')).map((h) => h.ref)).toEqual(['obs 3:2', 'obs 3:14'])
    expect((await searchObs('नूह नाव', 'hi'))[0]?.ref).toBe('obs 3:2')
    expect(await namedStory('नूह की कहानी', 'hi')).toEqual({ ref: 'obs 3', what: ['text', 'notes'] })
    // Matthew 13:31 in Hindi: the mustard seed (राई) is OBS 34:1, found by the Hindi words of the passage
    const r: any = await ask('मत्ती 13:31', 'hi')
    expect(targets(r)).toContain('obs 34:1 text,notes,questions,terms')
    expect(buttons(r).find((b) => b.includes('OBS 34:1'))).toMatch(/^यह भाग OBS 34:1 में बताया गया है: यीशु दूसरी कहानियों की शिक्षा देता है/)
  })

  test('its size, as Mini\'s server lists it', () => {
    expect(obsBytes('hi')).toBe(287_929)
  })
})

describe('the graph and online AI', () => {
  beforeEach(async () => { await fullPhone() })

  test('the story from a passage goes deeper; from the story, its passage goes deeper too', async () => {
    const c: ConvState = { last: null, graph: newGraph() }
    const p: any = await ask('Genesis 7:1-5', 'en', c)
    const story = p.reply.follow.find((f: any) => f.sheet?.ref === 'obs 3:6')
    const s = await press(c, story, 'en')
    const n = nodeOf(c.graph, s.node)!
    expect(n.edge).toBe('deeper')
    expect(n.parent).toBe(p.node)
    expect(n.label).toBe('OBS 3:6')
    // under it, the way back to Genesis 7:1-5
    expect(s.reply.back?.sheet?.ref).toBe('gen 7:1-5')

    const c2: ConvState = { last: null, graph: newGraph() }
    const o: any = await ask('OBS 3', 'en', c2)
    const bible = o.reply.follow.find((f: any) => f.sheet?.ref === 'gen 6:1-8:22')
    const b = await press(c2, bible, 'en')
    expect(nodeOf(c2.graph, b.node)!.edge).toBe('deeper')
    expect(nodeOf(c2.graph, b.node)!.parent).toBe(o.node)

    // a passage typed after a story, within the story's chapters (Genesis 7 in Genesis 6–8): deeper too, back to the story
    const c3: ConvState = { last: null, graph: newGraph() }
    const f: any = await ask('OBS 3:4', 'en', c3)
    const g: any = await ask('Genesis 7:1-5', 'en', c3)
    expect(nodeOf(c3.graph, g.node)).toMatchObject({ edge: 'deeper', parent: f.node })
    // another book is a new topic
    const h: any = await ask('Ruth 1:1', 'en', c3)
    expect(nodeOf(c3.graph, h.node)!.edge).toBe('branch')
  })

  test('online AI is given the story as plain text, also under an article tapped from it', async () => {
    const c: ConvState = { last: null, graph: newGraph() }
    const o: any = await ask('OBS 3:5', 'en', c)
    const ctx = await passageContext(contextSheet(c, o)!)
    expect(ctx).toMatch(/^## Open Bible Stories 3: The Flood \(A Bible story from: Genesis 6-8\)\n3:1 After a long time/)
    expect(ctx).toContain('3:16 ')
    // Noah's article, tapped in the answer (its link; the button is gone, the answer shows it)
    const noah = { sheet: { ...o.reply.follow[0].sheet, intent: 'article', concept: 'tw:names/noah', ref: null, what: [], lang: 'en' } }
    const a = await press(c, noah, 'en')
    expect(contextSheet(c, a)?.ref).toBe('obs 3:5')
  })
})

test('the fixture is the reader\'s: the client reads the stories through it', async () => {
  await fullPhone()
  const r = await openLang('en')
  expect(r.installed('obs')).toBe(true)
  const s = await r.story(34)
  expect(s.data?.frames?.length).toBe(10)
  expect(s.data?.helps).toEqual({ notes: 'count', questions: 'count', links: 'count' })
})
