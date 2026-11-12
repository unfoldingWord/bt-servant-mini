// Slots written by the fine-tuned model -> the call sheet the recipes read (port of build_sheet in fase0 py/fill_model.py).
import books from './data/books.json'
import figs from './data/figs.json'
import glossary from './data/kt-glossary.json'
import type { Sheet } from './answer'
import { hasLang, openLang } from './packs'

export type Slots = {
  intent?: string; book?: string | null; chapter?: number | null; verse_start?: number | null; verse_end?: number | null
  what?: string[]; version?: string | null; term?: string | null; phrase?: string | null; lang?: string; other_language?: string | null
}
const UI_LANGS = ['en', 'es', 'fr', 'id', 'hi']
const DEV = '०१२३४५६७८९'
const isDeva = (s: string) => /[ऀ-ॿ]/.test(s)

export function fold(s: string): string {
  s = s.normalize('NFC').toLowerCase().replace(/’/g, "'").replace(/[०-९]/g, (d) => String(DEV.indexOf(d)))
  if (!isDeva(s)) s = s.normalize('NFD').replace(/\p{Mn}/gu, '').normalize('NFC')
  return s
}
function normBook(s: string): string {
  s = fold(s).replace(/[.\-–]/g, ' ').trim()
  s = s.replace(/^(iii|ii|i) /, (_, r: string) => `${r.length} `).replace(/^([123])(?=\D)/, '$1 ')
  s = s.replace(/\s+/g, ' ').trim().replace(/^(kitab |injil |le livre de |livre de |l'evangile selon |l'evangile de |evangile selon |evangile de )/, '')
  return s.replace(/\s+/g, ' ').trim()
}
export function bookCode(lang: string, name: string | null | undefined): string | null {
  if (!name) return null
  const k = normBook(name)
  const tables = books as Record<string, Record<string, string>>
  for (const l of [lang, ...Object.keys(tables).filter((x) => x !== lang)]) {
    const c = tables[l]?.[k]
    if (c) return c
  }
  // a known prefix ("matt", "jona")
  for (const l of [lang, 'en', 'es']) {
    const t = tables[l] ?? {}
    const hit = Object.keys(t).find((n) => n.length >= 3 && k.length >= 3 && n.startsWith(k))
    if (hit) return t[hit]!
  }
  // a misspelled name ("Mathew", "Genesys", "Jonas"): the closest name, one edit away (two for long names)
  if (k.length >= 4 && !/\d/.test(k)) {
    let bestD = k.length >= 7 ? 2 : 1
    let codes = new Set<string>()
    for (const l of [lang, 'en', 'es']) {
      for (const [n, c] of Object.entries(tables[l] ?? {})) {
        if (Math.abs(n.length - k.length) > bestD) continue
        const d = edits(k, n)
        if (d < bestD) {
          bestD = d
          codes = new Set([c])
        } else if (d === bestD) codes.add(c)
      }
    }
    if (codes.size === 1) return [...codes][0]!
  }
  return null
}
function edits(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = cur
    }
  }
  return row[b.length]!
}

const clean = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return ['', 'null', 'none', 'n/a'].includes(t.toLowerCase()) ? null : t
}
const int = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null

/** Key terms written in French, Indonesian or Hindi -> their article id (no packs exist in those languages yet). */
const GLOSS = new Map<string, string[]>()
for (const [id, byLang] of Object.entries(glossary as Record<string, Record<string, string[]>>))
  for (const names of Object.values(byLang)) for (const n of names) {
    const k = fold(n).trim()
    if (!GLOSS.get(k)?.includes(id)) GLOSS.set(k, [...(GLOSS.get(k) ?? []), id])
  }

/** Article ids whose name is the term, in the pack of `lang` and then English (tW first, then tA). */
async function idsOf(term: string | null, packLangs: string[]): Promise<string[] | null> {
  if (!term) return null
  const f = fold(term).replace(/[«»"“”'?¿!¡.]/g, '').replace(/\s+/g, ' ').trim()
  const fig = (figs as Record<string, string>)[f]
  if (fig) return [`ta:translate/figs-${fig}`]
  const g = GLOSS.get(f)
  if (g) return g
  for (const pl of packLangs) {
    let m: any
    try {
      m = await (await openLang(pl)).maps()
    } catch {
      continue
    }
    const names: Record<string, string[]> = m.map?.core?.names ?? {}
    const exact: string[] = []
    for (const [id, ns] of Object.entries(names)) {
      if (!(id.startsWith('tw:') || id.startsWith('ta:translate/'))) continue
      if (ns.some((n) => fold(String(n).replace(/\(.*?\)/g, ' ')).replace(/\s+/g, ' ').trim() === f)) exact.push(id)
    }
    if (exact.length) return exact.sort((a, b) => (a.startsWith('tw:') ? 0 : 1) - (b.startsWith('tw:') ? 0 : 1))
  }
  return null
}

const LANG_NAMES: Record<string, string> = {
  indonesian: 'id', indonesio: 'id', bahasa: 'id', indonesia: 'id', spanish: 'es-419', espanol: 'es-419', english: 'en', ingles: 'en',
  anglais: 'en', espagnol: 'es-419', inggris: 'en', spanyol: 'es-419', french: 'fr', frances: 'fr', francais: 'fr', hindi: 'hi',
  portuguese: 'pt-br', portugues: 'pt-br', swahili: 'sw', arabic: 'ar', russian: 'ru', chinese: 'zh', german: 'de',
}

/** The pack of each language the person can write in, when the app has it. */
const UI_PACK: Record<string, string> = { es: 'es-419', id: 'id', hi: 'hi', ar: 'ar', fr: 'fr' }

/** `prefer`: the helps language chosen in the app (null: the pack of the language the person wrote in, else English). */
export async function buildSheet(qid: string, d: Slots, prefer: string | null = null): Promise<{ sheet: Sheet; ui: string }> {
  const ui = UI_LANGS.includes(d.lang ?? '') ? d.lang! : 'en'
  const want = prefer ?? UI_PACK[ui] ?? null
  const lang = want && (await hasLang(want)) ? want : 'en'
  const packLangs = lang === 'en' ? ['en'] : [lang, 'en']
  const sheet: Sheet = {
    id: qid, intent: d.intent ?? 'unknown', ref: null, what: [], version: null, concept: null, term: null, phrase: null, candidates: null, lang,
  }
  const book = clean(d.book), ch = int(d.chapter), v1 = int(d.verse_start), v2 = int(d.verse_end)
  const term = clean(d.term), phrase = clean(d.phrase)
  const refOf = (): string | null => {
    const code = bookCode(ui, book)
    if (!code) return null
    if (!ch) return code
    if (!v1) return `${code} ${ch}`
    return `${code} ${ch}:${v1}` + (v2 && v2 > v1 ? `-${v2}` : '')
  }
  const what = (d.what ?? []).filter((w) => ['text', 'notes', 'questions', 'terms', 'intro'].includes(w))
  const version = d.version === 'ult' || d.version === 'ust' ? d.version : null
  const first = what.length ? what.slice(0, 1) : ['notes']
  switch (sheet.intent) {
    case 'passage': {
      let ref = refOf()
      if (what.length === 1 && what[0] === 'intro' && ref) {
        const [code, chv] = ref.split(' ')
        ref = chv ? `${code} ${chv.split(':')[0]}:intro` : `${code} front:intro`
      }
      Object.assign(sheet, { ref, what: what.length ? what : ['text', 'notes', 'questions', 'terms'], version })
      if (!ref) sheet.intent = 'unknown'
      break
    }
    case 'article': {
      const ids = await idsOf(term, packLangs)
      if (ids?.length === 1) sheet.concept = ids[0]!
      else if (ids?.length) Object.assign(sheet, { intent: 'choose', candidates: ids, term })
      else sheet.term = term
      break
    }
    case 'count': {
      const ids = await idsOf(term, packLangs)
      const strong = /^[GH]\d{1,5}$/.test((term ?? '').toUpperCase().replace(/ /g, ''))
      Object.assign(sheet, {
        ref: refOf(), what: first, concept: ids?.length === 1 ? ids[0] : null,
        candidates: ids && ids.length > 1 ? ids : null, term: strong ? term!.toUpperCase() : null,
      })
      break
    }
    case 'rank':
      Object.assign(sheet, { ref: refOf(), what: first })
      break
    case 'resources': {
      const named = clean(d.other_language)
      sheet.lang = (named && LANG_NAMES[fold(named).replace(/[^a-z]/g, '')]) || lang
      const ids = await idsOf(term, packLangs)
      if (ids?.length === 1) sheet.concept = ids[0]!
      break
    }
    case 'advice': {
      const ids = await idsOf(term, packLangs)
      const ref = refOf()
      // "Help me translate Jonah 1" names no phrase: that is a passage with its helps, not advice on one figure
      const phraseIsBook = !!phrase && !!book && fold(phrase).trim() === fold(book).trim()
      if (ref && (!phrase || phraseIsBook || !/:\d/.test(ref))) {
        Object.assign(sheet, { intent: 'passage', ref, what: /:\d/.test(ref) ? ['text', 'notes', 'questions', 'terms'] : ['text', 'notes'] })
        break
      }
      Object.assign(sheet, { ref, phrase, concept: ids?.length === 1 && ids[0]!.startsWith('ta:translate/figs-') ? ids[0] : null })
      if (!ref) sheet.term = term
      break
    }
    default:
      sheet.term = term
  }
  // The Spanish pack holds few books: for a book it lacks, answer from the English pack (the answer's words stay in Spanish).
  if (sheet.lang !== 'en' && sheet.ref && /^[0-9a-z]{3}( |$)/.test(sheet.ref) && !sheet.ref.startsWith('obs')) {
    const code = sheet.ref.slice(0, 3)
    // installed() is optimistic (a listed unit counts): read the book to know.
    const has = async (l: string) => {
      try {
        const r = await openLang(l)
        return r.installed(`book:${code}`) && !!(await r.book(code))
      } catch {
        return false
      }
    }
    if (!(await has(sheet.lang)) && (await has('en'))) sheet.lang = 'en'
  }
  return { sheet, ui }
}
