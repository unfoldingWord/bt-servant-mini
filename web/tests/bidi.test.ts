// Right-to-left next to left-to-right (bidi.ts): the labels built in Arabic isolate their Latin runs, the English ones get no
// marks, a block of text reads in the direction of its words, and nothing shared carries the marks.
import { describe, expect, test } from 'bun:test'
import { bidiLabel, dirOf, FSI, hasRtl, isolate, isolateRef, LRI, PDI, rtlLang, splitNumbers, strip, textDir } from '../src/bidi'
import { followups, nextWords } from '../src/converse'
import { buildReport } from '../src/feedback'
import { md, mdDir } from '../src/md'
import { directRef, env } from '../src/pipeline'
import { shareText } from '../src/share'
import type { Sheet } from '../src/answer'

const I = (s: string) => FSI + s + PDI
const MARKS = /[\u2066-\u2069\u200E\u200F\u202A-\u202E]/

describe('bidiLabel', () => {
  test('Arabic app: Latin runs isolated, Arabic references left as they are', () => {
    expect(bidiLabel('Translation Academy: الاستعارة', 'ar')).toBe(`${I('Translation Academy')}: الاستعارة`)
    expect(bidiLabel('تصفّح Translation Academy ›', 'ar')).toBe(`تصفّح ${I('Translation Academy')} ›`)
    // "1:16" is kept whole by the algorithm itself (UAX #9 W4): an Arabic reference in an Arabic label needs nothing
    expect(bidiLabel('راعوث 1:16', 'ar')).toBe('راعوث 1:16')
    expect(bidiLabel('ماذا تقول الملاحظات عن يونان 1:3؟', 'ar')).toBe('ماذا تقول الملاحظات عن يونان 1:3؟')
    expect(bidiLabel('الآية السابقة (راعوث 1:15)', 'ar')).toBe('الآية السابقة (راعوث 1:15)')
  })
  test('a Latin reference keeps its digits and range; a bracket it opened closes inside', () => {
    expect(bidiLabel('الآية السابقة (Ruth 1:1-5)', 'ar')).toBe(`الآية السابقة (${I('Ruth 1:1-5')})`)
    expect(bidiLabel('الأكاديمية: Metaphor (figs-metaphor)', 'ar')).toBe(`الأكاديمية: ${I('Metaphor (figs-metaphor)')}`)
    expect(bidiLabel('Translation Notes v6.1 · AVD v6.9 · NAV v2 — راعوث 1:16', 'ar')).toBe(`${I('Translation Notes v6.1 · AVD v6.9 · NAV v2')} — راعوث 1:16`)
  })
  test('a number before a Latin unit goes with it, not a number after an Arabic word', () => {
    expect(bidiLabel('التفاصيل · 5.4 s', 'ar')).toBe(`التفاصيل · ${I('5.4 s')}`)
    expect(bidiLabel('راعوث 1 Ruth', 'ar')).toBe(`راعوث 1 ${I('Ruth')}`)
  })
  test('other apps: Arabic runs isolated with their digits and Arabic punctuation', () => {
    expect(bidiLabel('Previous verse (يونان 1:2)', 'en')).toBe(`Previous verse (${I('يونان 1:2')})`)
    expect(bidiLabel('Back to: ماذا عن يونان 1:3؟', 'es')).toBe(`Back to: ${I('ماذا عن يونان 1:3؟')}`)
  })
  test('no marks where nothing differs (English, Spanish, Hindi labels; Arabic only labels in Arabic)', () => {
    for (const [s, ui] of [['Previous verse (Ruth 1:15)', 'en'], ['Notas de Rut 2:3 · ayuda', 'es'], ['रूत 1:16 के लिए', 'hi'], ['الكلمات الرئيسية', 'ar'], ['', 'ar']]) {
      expect(bidiLabel(s!, ui!)).toBe(s!)
    }
  })
  test('isolated once', () => {
    const once = bidiLabel('Translation Academy: الاستعارة', 'ar')
    expect(bidiLabel(once, 'ar')).toBe(once)
    expect(isolate(isolate('x'))).toBe(I('x'))
    expect(strip(once)).toBe('Translation Academy: الاستعارة')
  })
})

describe('textDir', () => {
  test('by the words, not the first letter', () => {
    expect(textDir('«وحيثما بتّ» This means where you live.')).toBe('ltr')
    expect(textDir('GLT فقالت راعوث لا تلحي علي أن أتركك')).toBe('rtl')
    expect(textDir('Translation Academy: الاستعارة')).toBe('ltr')
    expect(textDir('1:16')).toBe('')
    expect(dirOf('1:16')).toBe('auto')
    expect(rtlLang('ar')).toBe(true)
    expect(rtlLang('es-419')).toBe(false)
    expect(hasRtl('Ruth')).toBe(false)
  })
})

describe('labels built in Arabic', () => {
  const sheet = { id: 'x', intent: 'passage', ref: 'rut 1:16', what: ['text', 'notes'], lang: 'ar' } as unknown as Sheet
  test('follow-ups: the Arabic references need no marks; drawn, they read whole', () => {
    const f = followups(sheet, { kind: 'passage', next: '1:17' }, 'ar', [{ label: 'الأكاديمية: Metaphor' }])
    const drawn = f.map((x) => bidiLabel(x.label, 'ar'))
    expect(drawn).toContain('الآية السابقة (راعوث 1:15)')
    expect(drawn).toContain(`الأكاديمية: ${I('Metaphor')}`)
    // the labels themselves (what is asked, saved and shown in the Map) never carry marks
    for (const x of f) expect(x.label).not.toMatch(MARKS)
  })
  test('the same in English: no marks at all', () => {
    const f = followups(sheet, { kind: 'passage', next: '1:17' }, 'en')
    for (const x of f) expect(bidiLabel(x.label, 'en')).toBe(x.label)
    expect(bidiLabel(nextWords('ar').browseAcademy, 'ar')).toBe(`تصفّح ${I('Translation Academy')}`)
  })
})

describe('md: each block in the direction of its words', () => {
  test('an English note in an Arabic answer reads left to right; Arabic right to left', () => {
    const h = md('## راعوث 1:16\n\nفقالت راعوث: لا تلحي علي\n\n- «Wherever you live» Alternate translation: "and where you live"')
    expect(h).toContain('<h4 dir="rtl">')
    expect(h).toContain('<p dir="rtl">')
    expect(h).toContain('<li dir="ltr">')
  })
  test('no right-to-left letters: the output is as before (no dir)', () => {
    const src = '## Ruth 2:3 (es-419)\n\nText here.\n\n- one\n- two\n\n1. a\n2. b'
    expect(md(src)).not.toContain('dir=')
  })
  test('one list, not one per item, also with dir', () => {
    expect(md('- يونان\n\n- راعوث').match(/<ul/g)?.length).toBe(1)
  })
})

describe('share: no marks', () => {
  test('the shared text has no isolate characters even when the answer had some', () => {
    const t = shareText({ who: 'bot', info: `${I('Translation Academy')}: الاستعارة` }, 'ar', `ما معنى ${I('GLT')}؟`)!
    expect(t).not.toMatch(MARKS)
    expect(t).toContain('Translation Academy: الاستعارة')
  })
})

const C = (n: number) => String.fromCodePoint(n)

describe('strip: what is typed, pasted or copied back', () => {
  test('every bidi mark goes: isolates, LRM, RLM, ALM, embeddings and overrides', () => {
    for (const n of [0x200e, 0x200f, 0x061c, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) expect(strip(`a${C(n)}b`)).toBe('ab')
  })
  test('a reference copied from the app or pasted from WhatsApp is read as a reference once stripped', () => {
    env.nav = 'en'
    const copied = I('Ruth 2:3')
    expect(directRef(copied)).toBe(false) // why the box is stripped at submit (main.ts) and in the composer (suggest.ts)
    expect(directRef(strip(copied))).toBe(true)
    const pasted = C(0x200f) + 'يونان 1:3' + C(0x200e) + ' ' + C(0x202b) + 'ملاحظات' + C(0x202c) + C(0x061c)
    expect(strip(pasted)).toBe('يونان 1:3 ملاحظات')
    expect(directRef(strip(pasted))).toBe(true)
  })
  test('a report\'s comment is sent without marks (feedback.ts buildReport)', () => {
    const r = buildReport([{ who: 'bot', text: 'x' }], ['wrong'], ` ${C(0x200f)}كنت أتوقع ${I('Ruth 1:16')}${C(0x202b)} هنا${C(0x202c)} `, false)
    expect(r.comment).toBe('كنت أتوقع Ruth 1:16 هنا')
    expect(MARKS.test(r.comment) || r.comment.includes(C(0x061c))).toBe(false)
  })
})

describe('numbers', () => {
  test('a version with "-beta" and a size stay whole in Arabic', () => {
    expect(bidiLabel('يتوفر إصدار جديد: 0.12.0-beta · 18 MB', 'ar')).toBe(`يتوفر إصدار جديد: ${I('0.12.0-beta · 18 MB')}`)
    expect(bidiLabel('يتوفر إصدار جديد: 0.12.0 · 18 MB', 'ar')).toBe(`يتوفر إصدار جديد: 0.12.0 · ${I('18 MB')}`)
  })
  test('Arabic-Indic digits are numbers, not right-to-left letters', () => {
    expect(textDir('٣:١٦')).toBe('')
    expect(bidiLabel('Notes ٣:١٦', 'en')).toBe('Notes ٣:١٦')
    expect(bidiLabel('Notes (يوحنا ٣:١٦)', 'en')).toBe(`Notes (${I('يوحنا ٣:١٦')})`)
  })
})

describe('link addresses do not decide a direction', () => {
  test('an Arabic line with rc:// links and [[id]] targets reads right to left', () => {
    const src = 'انظر [الاستعارة](rc://*/ta/man/translate/figs-metaphor) و [[rc://*/ta/man/translate/figs-simile]] هنا في النص'
    expect(mdDir(src)).toBe('rtl')
    expect(md(['## راعوث', '', src].join(String.fromCodePoint(10)))).toContain('<p dir="rtl">')
  })
})

describe('a reference after an Arabic book name (isolateRef, splitNumbers)', () => {
  test('a range is one number: digits joined by : . , - –', () => {
    expect(splitNumbers('التكوين 12:1-13:3')).toEqual([{ text: 'التكوين ', num: false }, { text: '12:1-13:3', num: true }])
    expect(splitNumbers('التكوين 12:1-9')).toEqual([{ text: 'التكوين ', num: false }, { text: '12:1-9', num: true }])
    expect(splitNumbers('OBS 5:9').map((p) => p.text)).toEqual(['OBS ', '5:9'])
    expect(splitNumbers('بدون')).toEqual([{ text: 'بدون', num: false }])
  })
  test('the label is one isolate and each number a left-to-right run inside it; text without a number only gets the isolate; no double wrap', () => {
    expect(isolateRef('التكوين 12:1-13:3')).toBe(`${FSI}التكوين ${LRI}12:1-\u206013:3${PDI}${PDI}`) // a word joiner after the hyphen: no break there
    expect(isolateRef('التكوين')).toBe(`${FSI}التكوين${PDI}`)
    expect(isolateRef(isolateRef('التكوين 12:1'))).toBe(isolateRef('التكوين 12:1'))
    expect(strip(isolateRef('التكوين 12:1-9'))).toBe('التكوين 12:1-9')
    expect(isolateRef('')).toBe('')
    expect(strip(isolateRef('التكوين 12:1-13:3'))).toBe('التكوين 12:1-13:3') // the joiner never reaches what is shared, saved or sent
    expect(strip('a\u2060b')).toBe('ab')
  })
})
