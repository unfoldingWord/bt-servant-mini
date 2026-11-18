// Kinship questions (handoff/diseno-parentescos.md §4, §8 over it; encargo-ms-kin.md): "¿Quiénes fueron los hijos de Isaac?",
// "father of Ruth", "इसहाक के पुत्र", "من هو أبو إسحاق؟", "¿Quién fue Cetura?", answered by code with no model, from the family the
// language-pack client gives (`reader.family`: TIPNR relations, ACAI gender and names, the verses of each relation from the parts
// of `xtopics`) and the names it finds people by (`reader.people`). Nothing new is stored: every link is built here, in memory.
//   - kinShape: the syntax only (six languages), and the phrases that are never a family question ("hijos de Israel").
//   - kinQuestion: who X is (the people index, homonyms: the passage in the conversation, then the ten-times rule, else a choice).
//   - the links of a person (its OBS stories) and of a verse or frame (who is in it), for pipeline.ts.

import { BOOKS, type XtopicsCore, type XtopicsPart } from '@bt-synergy/language-pack-v3'
import type { FamilyData, PackReader, PersonEntry } from '@bt-synergy/language-pack-client'
import { installedLangs, onPacksChanged, openLang } from './packs'
import { articleForQuestion, keywords } from './search'
import { bookExact } from './sheet'

export type KinKind = 'children' | 'sons' | 'daughters' | 'father' | 'mother' | 'parents' | 'partners' | 'wife' | 'husband'
  | 'siblings' | 'brothers' | 'sisters' | 'who'
export type KinLang = 'en' | 'es' | 'fr' | 'id' | 'hi' | 'ar'
/**
 * A question shaped like a family question. `name`: the person as written (without an article); `alts`: other ways to read it
 * (Arabic without a first «و»). `one`: a singular word ("hijo de", "son of"). `abu`: Arabic «أبو X», which may be a name (أبو شالوم).
 */
export type KinShape = { kind: KinKind; name: string; alts: string[]; lang: KinLang; one?: true; abu?: true; bare?: true }

// ------------------------------------------------------------------------------------------------- the words of each language
type Word = { kind: KinKind; one?: true }
const W = (kind: KinKind, one?: true): Word => (one ? { kind, one } : { kind })
/** Each language's family words (lower case, as typed), to the kind they ask. */
const WORDS: Record<KinLang, Record<string, Word>> = {
  en: {
    son: W('sons', true), sons: W('sons'), child: W('children', true), children: W('children'), kids: W('children'),
    daughter: W('daughters', true), daughters: W('daughters'), father: W('father'), dad: W('father'), mother: W('mother'), mom: W('mother'),
    parents: W('parents'), wife: W('wife'), wives: W('partners'), husband: W('husband'), spouse: W('partners'), spouses: W('partners'),
    brother: W('brothers', true), brothers: W('brothers'), sister: W('sisters', true), sisters: W('sisters'), siblings: W('siblings'),
  },
  es: {
    hijo: W('sons', true), hijos: W('children'), hija: W('daughters', true), hijas: W('daughters'), padre: W('father'), papa: W('father'),
    madre: W('mother'), mama: W('mother'), padres: W('parents'), esposa: W('wife'), esposas: W('partners'), mujer: W('wife'), mujeres: W('partners'),
    esposo: W('husband'), marido: W('husband'), hermano: W('brothers', true), hermanos: W('siblings'), hermana: W('sisters', true), hermanas: W('sisters'),
  },
  fr: {
    fils: W('sons', true), enfant: W('children', true), enfants: W('children'), fille: W('daughters', true), filles: W('daughters'), pere: W('father'),
    mere: W('mother'), parents: W('parents'), femme: W('wife'), femmes: W('partners'), epouse: W('wife'), epouses: W('partners'), mari: W('husband'),
    epoux: W('husband'), frere: W('brothers', true), freres: W('siblings'), soeur: W('sisters', true), soeurs: W('sisters'),
  },
  id: {
    // («anak» is one son or many: «anak Daud» is the title of Jesus, so it counts as singular there)
    anak: W('children', true), 'anak-anak': W('children'), 'anak laki-laki': W('sons'), 'anak-anak laki-laki': W('sons'), putra: W('sons', true),
    'anak perempuan': W('daughters'), 'anak-anak perempuan': W('daughters'), putri: W('daughters'), ayah: W('father'), bapa: W('father'),
    bapak: W('father'), ibu: W('mother'), 'orang tua': W('parents'), 'orangtua': W('parents'), istri: W('wife'), isteri: W('wife'),
    suami: W('husband'), saudara: W('siblings'), 'saudara-saudara': W('siblings'), 'saudara laki-laki': W('brothers'),
    'saudara perempuan': W('sisters'),
  },
  hi: {
    'पुत्र': W('sons'), 'पुत्रों': W('sons'), 'बेटा': W('sons', true), 'बेटे': W('sons'), 'बेटों': W('sons'), 'बच्चे': W('children'),
    'बच्चों': W('children'), 'संतान': W('children'), 'सन्तान': W('children'), 'पुत्री': W('daughters'), 'पुत्रियाँ': W('daughters'),
    'पुत्रियों': W('daughters'), 'बेटी': W('daughters', true), 'बेटियाँ': W('daughters'), 'बेटियों': W('daughters'), 'पिता': W('father'),
    'माता': W('mother'), 'माँ': W('mother'), 'माता-पिता': W('parents'), 'पत्नी': W('wife'), 'पत्नियाँ': W('partners'), 'पति': W('husband'),
    'भाई': W('brothers'), 'भाइयों': W('brothers'), 'बहन': W('sisters'), 'बहनें': W('sisters'), 'बहनों': W('sisters'),
  },
  ar: {
    'أبناء': W('sons'), 'ابناء': W('sons'), 'بنو': W('sons'), 'بني': W('sons'), 'ابن': W('sons', true), 'أولاد': W('children'),
    'اولاد': W('children'), 'بنات': W('daughters'), 'ابنة': W('daughters', true), 'بنت': W('daughters', true), 'والد': W('father'),
    'أبو': W('father'), 'ابو': W('father'), 'أب': W('father'), 'اب': W('father'), 'أم': W('mother'), 'ام': W('mother'), 'والدة': W('mother'),
    'والدا': W('parents'), 'والدي': W('parents'), 'أبوا': W('parents'), 'ابوا': W('parents'), 'زوجة': W('wife'), 'زوجات': W('partners'),
    'زوج': W('husband'), 'إخوة': W('siblings'), 'اخوة': W('siblings'), 'إخوان': W('siblings'), 'اخوان': W('siblings'), 'أخ': W('brothers', true),
    'اخ': W('brothers', true), 'أخو': W('brothers', true), 'اخو': W('brothers', true), 'أخوات': W('sisters'), 'اخوات': W('sisters'),
    'أخت': W('sisters', true), 'اخت': W('sisters', true),
  },
}
/** Latin family words compared without accents ("père" = "pere", "papá" = "papa", "sœurs" = "soeurs"). */
const plain = (s: string): string => s.toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/\p{Mn}/gu, '').normalize('NFC')
const alt = (list: string[]) => list.sort((a, b) => b.length - a.length).map((w) => w.replace(/[-.]/g, (c) => `\\${c}`)).join('|')
const LATIN_WORDS = (l: 'en' | 'es' | 'fr' | 'id') => alt(Object.keys(WORDS[l]))

// "who was / ¿quién fue / qui était / siapa / कौन था / من هو" around the rest: taken off, the rest read again
/** `who`: the wrapper asks who someone is (a card when no family word follows); otherwise only a family shape may follow. */
const WRAP: [KinLang, RegExp, boolean][] = [
  ['en', /^who\s+(?:was|were|is|are)\s+(.+)$/i, true],
  ['en', /^what\s+(?:was|were|is|are)\s+(.+)$/i, false],
  ['en', /^who['’]s\s+(.+)$/i, true],
  ['en', /^tell me about\s+(.+)$/i, false],
  ['es', /^qui[eé]n(?:es)?\s+(?:fue|fueron|era|eran|es|son)\s+(.+)$/i, true],
  ['es', /^(?:c[oó]mo se llamaba(?:n)?|h[aá]blame de)\s+(.+)$/i, false],
  ['fr', /^qui\s+(?:était|etait|étaient|etaient|est|sont|fut|furent)\s+(.+)$/i, true],
  ['fr', /^qui\s+(?:est-ce que|etait-ce)\s+(.+)$/i, true],
  ['id', /^siapa(?:kah)?\s+(?:saja\s+|itu\s+|nama\s+)?(.+?)(?:\s+itu)?$/i, true],
  ['hi', /^(.+?)\s+कौन(?:-कौन)?\s+(?:था|थे|थी|थीं|है|हैं)$/, true],
  ['ar', /^(?:من|مَن|مَنْ)\s+(?:هو|هي|هم|هما|كان|كانت|كانوا|كانا)\s+(.+)$/, true],
  ['ar', /^(?:من|مَن|مَنْ)\s+(.+)$/, false],
]
/** The family word, then the name: one pattern per language (Hindi: the name first). */
const SHAPES: { lang: KinLang; re: RegExp; word: 1 | 2; name: 1 | 2 }[] = [
  { lang: 'en', re: new RegExp(`^(?:the\\s+)?(${LATIN_WORDS('en')})\\s+of\\s+(.+)$`, 'i'), word: 1, name: 2 },
  { lang: 'en', re: new RegExp(`^(.+?)['’]s?\\s+(${LATIN_WORDS('en')})$`, 'i'), word: 2, name: 1 },
  { lang: 'es', re: new RegExp(`^(?:el\\s+|la\\s+|los\\s+|las\\s+)?(${alt(Object.keys(WORDS.es).flatMap((w) => [w, ...accented(w)]))})\\s+de\\s+(.+)$`, 'i'), word: 1, name: 2 },
  { lang: 'fr', re: new RegExp(`^(?:le\\s+|la\\s+|les\\s+)?(${alt(Object.keys(WORDS.fr).flatMap((w) => [w, ...accented(w)]))})\\s+(?:de\\s+|d['’]\\s*)(.+)$`, 'i'), word: 1, name: 2 },
  { lang: 'id', re: new RegExp(`^(${LATIN_WORDS('id')})\\s+(?:dari\\s+)?(.+)$`, 'i'), word: 1, name: 2 },
  { lang: 'hi', re: new RegExp(`^(.+?)\\s+(?:के|की|का)\\s+(${alt(Object.keys(WORDS.hi))})$`), word: 2, name: 1 },
  { lang: 'ar', re: new RegExp(`^(${alt(Object.keys(WORDS.ar))})\\s+(.+)$`), word: 1, name: 2 },
]
/** The accented spellings of a family word ("pere" → "père", "papa" → "papá"): the patterns take both. */
function accented(w: string): string[] {
  const out: Record<string, string[]> = {
    pere: ['père'], mere: ['mère'], epouse: ['épouse'], epouses: ['épouses'], epoux: ['époux'], frere: ['frère'], freres: ['frères'],
    soeur: ['sœur'], soeurs: ['sœurs'], papa: ['papá'], mama: ['mamá'],
  }
  return out[w] ?? []
}

// ------------------------------------------------------------------------------------------------------- never a family question
// The peoples ("hijos de Israel", "بني إسرائيل", "इस्राएल की सन्तान"), and the same with Judah and Levi: asked for the children
// or sons, they are the tribe, not the man (§4.1). Folded as kinShape folds the name.
const PEOPLES = new Set(['israel', 'israël', 'judah', 'juda', 'judá', 'yehuda', 'levi', 'lévi', 'lewi', 'اسرائيل', 'إسرائيل', 'يهوذا', 'لاوي',
  'इस्राएल', 'इस्राएलियों', 'यहूदा', 'लेवी'].map((n) => foldName(n)))
// «hijo de David» and its pairs: the title of Jesus (asked in the singular)
const DAVID = new Set(['david', 'daud', 'داود', 'दाऊद'].map((n) => foldName(n)))
// the first person ("bapa kami", "our father" has no "of"; "padre nuestro" no "de"): never a person's name
const PRONOUNS = new Set(['kami', 'kita', 'saya', 'aku', 'kamu', 'engkau', 'dia', 'ia', 'mereka', 'nuestro', 'nuestra', 'nosotros', 'us', 'me', 'you',
  'him', 'her', 'them', 'god', 'dios', 'dieu', 'allah', 'tuhan', 'الله', 'परमेश्वर', 'man', 'hombre', 'homme', 'manusia', 'الانسان', 'मनुष्य'].map((n) => foldName(n)))

/** A name as the people index keys it: folded as Mini folds (sheet.ts fold), without marks or an Arabic article. */
export function foldName(s: string): string {
  let t = s.normalize('NFC').toLowerCase().replace(/[’`]/g, "'").replace(/[«»"“”]/g, '').replace(/\s+/g, ' ').trim()
  if (!/[ऀ-ॿ]/.test(t)) t = t.normalize('NFD').replace(/\p{Mn}/gu, '').normalize('NFC')
  if (/[ء-ي]/.test(t)) t = t.replace(/ـ/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/^ال(?=\S{2,})/, '')
  return t
}

/** The question without its marks and spaces as typed ("¿Quiénes fueron los hijos de Isaac?" → "Quiénes fueron los hijos de Isaac"). */
const tidy = (q: string): string => q.replace(/[¿?!¡؟।]+/g, ' ').replace(/[.,;:]+\s*$/g, ' ').replace(/\s+/g, ' ').trim()
/** A name as written, without what may stand before it (an article, Arabic «ال», «و»). */
function cleanName(name: string, lang: KinLang): { name: string; alts: string[] } {
  let n = name.replace(/[«»"“”]/g, '').trim()
  if (lang === 'es') n = n.replace(/^(?:el|la|los|las)\s+/i, '')
  if (lang === 'en') n = n.replace(/^the\s+/i, '')
  if (lang === 'fr') n = n.replace(/^(?:le|la|les)\s+|^l['’]\s*/i, '')
  const alts: string[] = []
  if (lang === 'ar') {
    if (/^و\S{2,}/.test(n)) alts.push(n.slice(1))
    n = n.replace(/^ال(?=\S{2,})/, '')
  }
  return { name: n, alts }
}
/** A name of a few words at most, with a letter in it: what follows "of" is a name, not a sentence. */
const nameLike = (n: string): boolean => n.split(/\s+/).length <= 4 && /\p{L}/u.test(n)

/**
 * Whether a question is shaped like a family question, and of whom (§4.1): the syntax only, any of the six languages (the one whose
 * words fit is the reply's). Not whether the name is a person's: kinQuestion decides that. `null`: not this shape, or one of the
 * phrases that never are (the peoples, the son of David, the first person).
 */
export function kinShape(q: string): KinShape | null {
  const t = tidy(q)
  if (!t) return null
  let rest = t
  let wrapped: KinLang | null = null
  for (const [lang, re, who] of WRAP) {
    const m = re.exec(t)
    if (m?.[1]) {
      rest = m[1].trim()
      wrapped = who ? lang : null
      break
    }
  }
  for (const s of SHAPES) {
    const m = s.re.exec(rest)
    if (!m) continue
    const said = m[s.word]!
    const key = s.lang === 'hi' || s.lang === 'ar' ? said : plain(said)
    const w = WORDS[s.lang][key] ?? WORDS[s.lang][said.toLowerCase()]
    if (!w) continue
    const { name, alts } = cleanName(m[s.name]!, s.lang)
    if (!nameLike(name)) continue
    const f = foldName(name)
    if (PRONOUNS.has(f)) return null
    // («hijas de Israel», «las mujeres de Israel» are the people too)
    if ((w.kind === 'children' || w.kind === 'sons' || w.kind === 'daughters' || w.kind === 'partners') && PEOPLES.has(f)) return null
    // («les fils de David» is plural: David's sons; «fils de David», «putra Daud», «दाऊद का पुत्र» the title)
    const plural = /^les\s/i.test(rest)
    if ((w.kind === 'sons' || w.kind === 'children') && (w.one || / का /.test(rest)) && !plural && DAVID.has(f)) return null
    // Indonesian «Bapa Abraham», «Ibu Maria», «Saudara Petrus» are how people are called, not «the father of»: only asked («siapa…»,
    // «…dari X»)
    if (s.lang === 'id' && /^(?:bapa|bapak|ibu|saudara)$/.test(key) && !wrapped && !/^\S+\s+dari\s/i.test(rest)) return null
    const out: KinShape = { kind: w.kind, name, alts, lang: s.lang }
    if (w.one && !plural) out.one = true
    if (s.lang === 'ar' && (key === 'أبو' || key === 'ابو')) out.abu = true
    return out
  }
  if (!wrapped) return null
  const { name, alts } = cleanName(rest, wrapped)
  if (!nameLike(name) || PRONOUNS.has(foldName(name))) return null
  return { kind: 'who', name, alts, lang: wrapped }
}

// ------------------------------------------------------------------------------------------------------------ who X is
/** What kin.ts reads of a language (a pack reader; the tests give a hand-made one: setKinReader). */
export type KinReader = Pick<PackReader, 'family' | 'people' | 'xtopicsParts' | 'mapsOf' | 'installed'>
let readerOf: (lang: string) => Promise<KinReader> = openLang
/** Tests: read family data from this reader instead of the packs (no argument: the packs again). */
export function setKinReader(f?: (lang: string) => Promise<KinReader>) {
  readerOf = f ?? openLang
  resetKin()
}

type PeopleIx = { byName: Map<string, string[]>; byId: Map<string, PersonEntry> }
const ixs = new Map<string, Promise<PeopleIx | null>>()
/** The indexes already built, for the synchronous kinKnown. */
const ready = new Map<string, PeopleIx | null>()
export function resetKin() {
  ixs.clear()
  ready.clear()
  parted = new WeakMap()
}
onPacksChanged(resetKin)

/** Every person of a language by each name it is found by (`reader.people`, folded here: the pack does not fold); null without xtopics. */
function peopleIx(lang: string): Promise<PeopleIx | null> {
  let p = ixs.get(lang)
  if (!p) {
    const made: Promise<PeopleIx | null> = (async () => {
      const list = (await (await readerOf(lang)).people()).data
      if (!list) return null
      const byName = new Map<string, string[]>()
      const byId = new Map<string, PersonEntry>()
      for (const e of list) {
        byId.set(e.id, e)
        for (const n of e.names) {
          const k = foldName(n)
          if (!k) continue
          const ids = byName.get(k)
          if (!ids) byName.set(k, [e.id])
          else if (!ids.includes(e.id)) ids.push(e.id)
        }
      }
      return { byName, byId }
    })().catch(() => {
      // (a failed read is not kept: tried again next time, not null for the whole session)
      if (ixs.get(lang) === made) ixs.delete(lang)
      return null
    })
    ixs.set(lang, made)
    void made.then((ix) => { if (ixs.get(lang) === made) ready.set(lang, ix) })
    p = made
  }
  return p
}

/** The pack of a language code the app uses ("es" → "es-419"). */
const packOf = (l: string) => (l.startsWith('es') ? 'es-419' : l)
/** The packs to read a person in, in order: the question's language, the app's, English, the others on the phone. */
async function packsFor(lang: string, nav: string): Promise<string[]> {
  const have = await installedLangs().catch(() => [] as string[])
  return [...new Set([packOf(lang), packOf(nav), 'en', ...have])].filter((l) => have.includes(l))
}
const lookup = (ix: PeopleIx, names: string[]): string[] => {
  for (const k of new Set(names.map(foldName))) {
    const ids = k ? ix.byName.get(k) : undefined
    if (ids?.length) return ids
  }
  return []
}

/** How the person was chosen among those of that name: the only one, the one of the passage read, the one far more named, or ask. */
export type KinPick = 'one' | 'context' | 'dominant' | 'choose'
/** A family question resolved to people: the kind, the name as written, the reply's language, the pack, the person(s), best first. */
export type KinAsk = { kind: KinKind; name: string; ui: KinLang; pack: string; ids: string[]; pick: KinPick }

const bookOfVerse = (v: number): string => BOOKS[Math.floor(v / 1_000_000) - 1] ?? ''
const chapterOfVerse = (v: number): number => Math.floor(v / 1000) % 1000

/**
 * A family question, resolved (§4.4): null when it has not the shape, or X is no person (the question goes on as today), or it is
 * "who was X?" and X has a Translation Words article (the article answers, as today; pipeline.ts adds the family under it). `last`:
 * the passage the conversation is on ("gen 25:26"), for a name several people have.
 */
export async function kinQuestion(q: string, nav: string, last: string | null): Promise<KinAsk | null> {
  const s = kinShape(q) ?? bareName(q, nav)
  if (!s) return null
  let pack: string | null = null
  let ids: string[] = []
  let kind = s.kind
  let name = s.name
  for (const l of await packsFor(s.lang, nav)) {
    const ix = await peopleIx(l)
    if (!ix) continue
    pack ??= l
    // «أبو شالوم» is a name: then "who is" that person, not the father of «شالوم»
    if (s.abu) {
      const whole = lookup(ix, [`أبو ${s.name}`, `ابو ${s.name}`])
      if (whole.length) {
        ids = whole
        kind = 'who'
        name = `أبو ${s.name}`
        break
      }
    }
    ids = lookup(ix, [s.name, ...s.alts])
    if (ids.length) break
  }
  if (!pack || !ids.length) return null
  if (kind === 'who' && (await articleForQuestion(q).catch(() => null))?.length) return null
  // a name alone ("Hamul"): only a person with no Translation Words article (one with an article is answered by it, as before)
  if (s.bare && (await Promise.all(ids.map((id) => hasArticle(pack!, id)))).some(Boolean)) return null
  const ix = (await peopleIx(pack))!
  const count = (id: string) => ix.byId.get(id)?.verses ?? 0
  const sorted = [...ids].sort((a, b) => count(b) - count(a) || (a < b ? -1 : 1))
  const out = (pick: KinPick, list: string[]): KinAsk => ({ kind, name, ui: s.lang, pack: pack!, ids: list, pick })
  if (sorted.length === 1) return out('one', sorted)
  // the passage read: exactly one of them is in that chapter (§4.4.5), before the ten-times rule
  const m = /^([0-9a-z]{3}) (\d+)/.exec(last ?? '')
  if (m && m[1] !== 'obs') {
    const part = (await partsOf(pack, [m[1]!])).get(m[1]!)
    if (part) {
      const here = sorted.filter((id) => (part.occurrences.get(id) ?? []).some((v) => chapterOfVerse(v) === +m[2]!))
      if (here.length === 1) return out('context', [here[0]!, ...sorted.filter((id) => id !== here[0])])
    }
  }
  const [a, b] = [count(sorted[0]!), count(sorted[1]!)]
  if (a > 0 && a >= 10 * b) return out('dominant', sorted)
  return out('choose', sorted)
}

/**
 * A name alone, as a reader types it to ask who that is ("Hamul", "Fares", "حامول"): one to four words of letters, not a book's name,
 * with words to look for (not only small words). The language: the script's, else the app's. kinQuestion takes it only when it is a
 * person with no Translation Words article.
 */
function bareName(q: string, nav: string): KinShape | null {
  const t = tidy(q)
  if (!t || t.split(/\s+/).length > 4 || !/^[\p{L}\p{M}][\p{L}\p{M}'’\s-]*$/u.test(t) || bookExact(t) || !keywords(t).length) return null
  const lang: KinLang = /[؀-ۿ]/.test(t) ? 'ar' : /[ऀ-ॿ]/.test(t) ? 'hi' : (['en', 'es', 'fr', 'id'].includes(nav.split('-')[0]!) ? nav.split('-')[0] : 'en') as KinLang
  const { name, alts } = cleanName(t, lang)
  return { kind: 'who', name, alts, lang, bare: true }
}

/** Whether code alone answers a family question now (codeReads: no reader runs): its shape, and X a person in an index already built. */
export function kinKnown(q: string, nav: string): boolean {
  const s = kinShape(q)
  if (!s || s.kind === 'who') return false
  const order = [packOf(s.lang), packOf(nav), 'en', ...ready.keys()]
  return order.some((l) => { const ix = ready.get(l); return !!ix && lookup(ix, [s.name, ...s.alts]).length > 0 })
}

/** Whether the people index of a pack is built already (a button that names people waits for it rather than build it during an answer). */
export const kinReady = (pack: string): boolean => !!ready.get(pack)
/** Builds the people index of these packs at idle (the app's start, after a change of packs): a family question then skips the readers. */
export function warmKin(langs: string[]) {
  const ric = (globalThis as any).requestIdleCallback as ((f: () => void, o?: { timeout: number }) => void) | undefined
  const run = () => { void (async () => { for (const l of langs) await peopleIx(l) })() }
  if (ric) ric(run, { timeout: 5000 })
  else setTimeout(run, 1500)
}

// ---------------------------------------------------------------------------------------------------- the data of an answer
/** The family of a person, from this pack (`reader.family`). */
export async function familyOf(pack: string, id: string) {
  return (await readerOf(pack)).family(id)
}
/** A person of the people index (names, note, how many verses). */
export async function personOf(pack: string, id: string): Promise<PersonEntry | null> {
  return (await peopleIx(pack))?.byId.get(id) ?? null
}
async function coreOf(pack: string): Promise<XtopicsCore | null> {
  const m = (await (await readerOf(pack)).mapsOf(['xtopics'], { coreOnly: true })) as { xtopics?: { core: XtopicsCore } }
  return m.xtopics?.core ?? null
}
/** The parts of `xtopics` of these books (only those: `xtopicsParts`); a book whose part is not there is missing from the map. */
async function partsOf(pack: string, books: string[]): Promise<Map<string, XtopicsPart>> {
  const r = await readerOf(pack)
  return (await r.xtopicsParts?.(books).catch(() => undefined)) ?? new Map()
}

/**
 * How a relative is shown: its name, and first the name of its Translation Words article when that is another one ("Jacob (Israel)":
 * the patriarch is `per:israel`, named Israel, and his article is «Jacob»; §4.4.4). The article's name in the pack's language.
 */
export async function shownAs(pack: string, id: string, name: string): Promise<string> {
  const r = await readerOf(pack)
  const m = (await r.mapsOf(['map', 'xtopics'], { coreOnly: true })) as { map?: { core: { names: Record<string, string[]> } }; xtopics?: { core: XtopicsCore } }
  const tw = (m.xtopics?.core.relations ?? []).find((x) => x.type === 'same-as' && x.to === id && x.from.startsWith('tw:names/'))?.from
  const twName = tw ? m.map?.core.names[tw]?.[0] : undefined
  // (only two different names: «José (Antiguo Testamento)» already says José, and «levita» is not another name of Leví)
  const [a, b] = [foldName(twName ?? ''), foldName(name)]
  // (and in the same script: the Arabic pack's articles are in English, «Esau (عِيسُو)» would mix them)
  const latin = (t: string) => /\p{Script=Latin}/u.test(t)
  return twName && !a.includes(b) && !b.includes(a) && latin(twName) === latin(name) ? `${twName} (${name})` : name
}
/** The `per:` ids joined to a Translation Words article (`same-as`, read the other way). */
export async function peopleOfArticle(pack: string, tw: string): Promise<string[]> {
  const core = await coreOf(pack)
  return [...new Set((core?.relations ?? []).filter((r) => r.type === 'same-as' && r.from === tw && r.to.startsWith('per:')).map((r) => r.to))]
}

/** The first verses a person is named in (canonical order), from the parts of the first books it is in; `missing`: a part not there. */
export async function firstVerses(pack: string, id: string, n = 3): Promise<{ verses: number[]; missing: string[] }> {
  const core = await coreOf(pack)
  const books = [...(core?.occurrences.get(id)?.keys() ?? [])].sort((a, b) => BOOKS.indexOf(a) - BOOKS.indexOf(b))
  const verses: number[] = []
  const missing: string[] = []
  for (const b of books) {
    if (verses.length >= n) break
    const part = (await partsOf(pack, [b])).get(b)
    if (!part) {
      missing.push(b)
      continue
    }
    verses.push(...[...(part.occurrences.get(id) ?? [])].sort((x, y) => x - y).slice(0, n - verses.length))
  }
  return { verses, missing }
}

/** The stories of Open Bible Stories a person is in: an event the person takes part in (`participant`) that a story tells (`occurs-in`). */
export async function storiesOf(pack: string, id: string): Promise<number[]> {
  const rel = (await coreOf(pack))?.relations ?? []
  const events = new Set(rel.filter((r) => r.type === 'participant' && r.to === id).map((r) => r.from))
  const out = new Set<number>()
  for (const r of rel) {
    const m = /^obs:(\d+)$/.exec(r.from)
    if (r.type === 'occurs-in' && m && events.has(r.to)) out.add(+m[1]!)
  }
  return [...out].sort((a, b) => a - b)
}

// verse → people of a part, built once per part read
let parted = new WeakMap<XtopicsPart, Map<number, string[]>>()
function byVerse(part: XtopicsPart): Map<number, string[]> {
  let m = parted.get(part)
  if (!m) {
    m = new Map()
    for (const [id, list] of part.occurrences) {
      if (!id.startsWith('per:')) continue
      for (const v of list) {
        const at = m.get(v)
        if (!at) m.set(v, [id])
        else if (!at.includes(id)) at.push(id)
      }
    }
    parted.set(part, m)
  }
  return m
}
/**
 * The people named in a passage: a verse or verses of one chapter ("gen 25:26", "gen 25:24-26"), or a frame of Open Bible Stories
 * ("obs 3:4": the verses it tells, `obsFrames`). Most named first (in these verses), then by id. [] when a part is not there.
 */
export async function peopleAt(pack: string, ref: string): Promise<string[]> {
  let ranges: [number, number][] = []
  const o = /^obs (\d+):(\d+)$/.exec(ref)
  if (o) ranges = (await coreOf(pack))?.obsFrames?.[`${+o[1]!}:${+o[2]!}`] ?? []
  else {
    const m = /^([0-9a-z]{3}) (\d+):(\d+)(?:-(\d+))?$/.exec(ref)
    const at = m ? BOOKS.indexOf(m[1]!) : -1
    if (!m || at < 0) return []
    const base = (at + 1) * 1_000_000 + +m[2]! * 1000
    ranges = [[base + +m[3]!, base + +(m[4] ?? m[3])!]]
  }
  const count = new Map<string, number>()
  const parts = await partsOf(pack, [...new Set(ranges.map(([a]) => bookOfVerse(a)))].filter(Boolean))
  for (const [a, z] of ranges) {
    const part = parts.get(bookOfVerse(a))
    if (!part) continue
    const ix = byVerse(part)
    for (let v = a; v <= z; v++) for (const id of ix.get(v) ?? []) count.set(id, (count.get(id) ?? 0) + 1)
  }
  return [...count.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).map(([id]) => id)
}
export type { FamilyData }

// ------------------------------------------------------------------------------------------------------------ the words
type KinText = {
  /** the head of a family answer, per kind ("Hijos de {x}") */
  head: Record<Exclude<KinKind, 'who'>, string>
  /** a card's lines */
  parents: string; partners: string; children: string; siblings: string
  half: [man: string, woman: string]
  named: string
  none: string
  choose: string
  other: string
  versesN: string
  credit: string
  family: string
  here: string
  hereHead: string
  hereNone: string
  getPeople: string
  getBook: string
  and: string
  /** the button to the whole family of a person, and to the verses a person is named in */
  moreFamily: string
  whereNamed: string
}
export const KIN_T: Record<KinLang, KinText> = {
  en: {
    head: { children: 'Children of {x}', sons: 'Sons of {x}', daughters: 'Daughters of {x}', father: 'Father of {x}', mother: 'Mother of {x}', parents: 'Parents of {x}',
      partners: 'Spouses of {x}', wife: 'Wife of {x}', husband: 'Husband of {x}', siblings: 'Brothers and sisters of {x}', brothers: 'Brothers of {x}', sisters: 'Sisters of {x}' },
    parents: 'Parents', partners: 'Spouses', children: 'Children', siblings: 'Brothers and sisters', half: ['half brother', 'half sister'],
    named: 'Named in {n} verses.', none: '{head}: the data I have names no one.', choose: 'Several people are called {x}. Which one?',
    other: 'Another {x}?', versesN: '{n} verses', credit: 'Family data: {src}.', family: 'Family of {x}', here: 'People here: {names}',
    hereHead: 'People named in {ref}:', hereNone: 'The data I have names no one in {ref}.', getPeople: 'Download the verses of people and places', getBook: 'Download {book}', and: 'and', moreFamily: 'More family', whereNamed: 'Where {x} is named',
  },
  es: {
    head: { children: 'Hijos de {x}', sons: 'Hijos de {x}', daughters: 'Hijas de {x}', father: 'Padre de {x}', mother: 'Madre de {x}', parents: 'Padres de {x}',
      partners: 'Cónyuges de {x}', wife: 'Esposa de {x}', husband: 'Esposo de {x}', siblings: 'Hermanos de {x}', brothers: 'Hermanos de {x}', sisters: 'Hermanas de {x}' },
    parents: 'Padres', partners: 'Cónyuges', children: 'Hijos', siblings: 'Hermanos', half: ['medio hermano', 'media hermana'],
    named: 'Se nombra en {n} versículos.', none: '{head}: los datos que tengo no nombran a nadie.', choose: 'Hay varias personas llamadas {x}. ¿Cuál?',
    other: '¿Otro {x}?', versesN: '{n} versículos', credit: 'Datos de familia: {src}.', family: 'Familia de {x}', here: 'Personas aquí: {names}',
    hereHead: 'Personas nombradas en {ref}:', hereNone: 'Los datos que tengo no nombran a nadie en {ref}.', getPeople: 'Descargar los versículos de personas y lugares', getBook: 'Descargar {book}', and: 'y', moreFamily: 'Más familia', whereNamed: 'Dónde se nombra a {x}',
  },
  fr: {
    head: { children: 'Enfants de {x}', sons: 'Fils de {x}', daughters: 'Filles de {x}', father: 'Père de {x}', mother: 'Mère de {x}', parents: 'Parents de {x}',
      partners: 'Conjoints de {x}', wife: 'Femme de {x}', husband: 'Mari de {x}', siblings: 'Frères et sœurs de {x}', brothers: 'Frères de {x}', sisters: 'Sœurs de {x}' },
    parents: 'Parents', partners: 'Conjoints', children: 'Enfants', siblings: 'Frères et sœurs', half: ['demi-frère', 'demi-sœur'],
    named: 'Nommé dans {n} versets.', none: '{head} : les données que j’ai ne nomment personne.', choose: 'Plusieurs personnes s’appellent {x}. Laquelle ?',
    other: 'Un autre {x} ?', versesN: '{n} versets', credit: 'Données familiales : {src}.', family: 'Famille de {x}', here: 'Personnes ici : {names}',
    hereHead: 'Personnes nommées dans {ref} :', hereNone: 'Les données que j’ai ne nomment personne dans {ref}.', getPeople: 'Télécharger les versets des personnes et des lieux', getBook: 'Télécharger {book}', and: 'et', moreFamily: 'Plus de famille', whereNamed: 'Où {x} est nommé',
  },
  id: {
    head: { children: 'Anak-anak {x}', sons: 'Anak-anak laki-laki {x}', daughters: 'Anak-anak perempuan {x}', father: 'Ayah {x}', mother: 'Ibu {x}', parents: 'Orang tua {x}',
      partners: 'Pasangan {x}', wife: 'Istri {x}', husband: 'Suami {x}', siblings: 'Saudara-saudara {x}', brothers: 'Saudara laki-laki {x}', sisters: 'Saudara perempuan {x}' },
    parents: 'Orang tua', partners: 'Pasangan', children: 'Anak-anak', siblings: 'Saudara-saudara', half: ['saudara tiri', 'saudara tiri'],
    named: 'Disebut dalam {n} ayat.', none: '{head}: data yang saya punya tidak menyebut siapa pun.', choose: 'Ada beberapa orang bernama {x}. Yang mana?',
    other: '{x} yang lain?', versesN: '{n} ayat', credit: 'Data keluarga: {src}.', family: 'Keluarga {x}', here: 'Tokoh di sini: {names}',
    hereHead: 'Tokoh yang disebut dalam {ref}:', hereNone: 'Data yang saya punya tidak menyebut siapa pun dalam {ref}.', getPeople: 'Unduh ayat-ayat tokoh dan tempat', getBook: 'Unduh {book}', and: 'dan', moreFamily: 'Keluarga lainnya', whereNamed: 'Di mana {x} disebut',
  },
  hi: {
    head: { children: '{x} की संतान', sons: '{x} के पुत्र', daughters: '{x} की पुत्रियाँ', father: '{x} के पिता', mother: '{x} की माता', parents: '{x} के माता-पिता',
      partners: '{x} के जीवनसाथी', wife: '{x} की पत्नी', husband: '{x} के पति', siblings: '{x} के भाई-बहन', brothers: '{x} के भाई', sisters: '{x} की बहनें' },
    parents: 'माता-पिता', partners: 'जीवनसाथी', children: 'संतान', siblings: 'भाई-बहन', half: ['सौतेला भाई', 'सौतेली बहन'],
    named: '{n} पदों में नाम आता है।', none: '{head}: मेरे पास के आँकड़ों में किसी का नाम नहीं है।', choose: '{x} नाम के कई लोग हैं। कौन-सा?',
    other: 'कोई दूसरा {x}?', versesN: '{n} पद', credit: 'परिवार के आँकड़े: {src}।', family: '{x} का परिवार', here: 'यहाँ के लोग: {names}',
    hereHead: '{ref} में जिनका नाम है:', hereNone: 'मेरे पास के आँकड़ों में {ref} में किसी का नाम नहीं है।', getPeople: 'लोगों और स्थानों के पद डाउनलोड करें', getBook: '{book} डाउनलोड करें', and: 'और', moreFamily: 'और परिवार', whereNamed: '{x} का नाम कहाँ आता है',
  },
  ar: {
    head: { children: 'أولاد {x}', sons: 'أبناء {x}', daughters: 'بنات {x}', father: 'والد {x}', mother: 'أم {x}', parents: 'والدا {x}',
      partners: 'أزواج {x}', wife: 'زوجة {x}', husband: 'زوج {x}', siblings: 'إخوة {x}', brothers: 'إخوة {x}', sisters: 'أخوات {x}' },
    parents: 'الوالدان', partners: 'الأزواج', children: 'الأولاد', siblings: 'الإخوة والأخوات', half: ['أخ غير شقيق', 'أخت غير شقيقة'],
    named: 'يُذكر في {n} آية.', none: '{head}: البيانات التي لدي لا تذكر أحدًا.', choose: 'هناك عدة أشخاص اسمهم {x}. أيهم تقصد؟',
    other: '{x} آخر؟', versesN: '{n} آية', credit: 'بيانات العائلة: {src}.', family: 'عائلة {x}', here: 'الأشخاص هنا: {names}',
    hereHead: 'الأشخاص المذكورون في {ref}:', hereNone: 'البيانات التي لدي لا تذكر أحدًا في {ref}.', getPeople: 'تنزيل آيات الأشخاص والأماكن', getBook: 'تنزيل {book}', and: 'و', moreFamily: 'المزيد من العائلة', whereNamed: 'أين يُذكر {x}',
  },
}
export const KT = (ui: string): KinText => KIN_T[ui as KinLang] ?? KIN_T.en
/** "Hijos de Isaac:" and French "Fils d’Isaac :" (a space before the colon). */
export const colon = (ui: string, head: string): string => (ui === 'fr' ? `${head} :` : `${head}:`)
/** A text with the person's name in it: French «de» before a vowel or h is «d’» («Enfants d’Isaac»). */
export const withName = (ui: string, text: string, x: string): string =>
  (ui === 'fr' && /^[aeiouyhâàäéèêëîïôöûüœ]/i.test(x) ? text.replace(/\bde \{x\}/, 'd’{x}') : text).replace('{x}', x)
/** "Esaú y Jacob", "Abraham, Sara y Agar" ("A, B و C": the Arabic «و» joins the next word). */
export function joinNames(ui: string, names: string[]): string {
  if (names.length < 2) return names[0] ?? ''
  const and = KT(ui).and
  const last = ui === 'ar' ? `${and}${names.at(-1)}` : `${and} ${names.at(-1)}`
  return `${names.slice(0, -1).join(ui === 'ar' ? '، ' : ', ')} ${last}`
}
/** The sources of family data as the credit line names them. */
export const SOURCE_NAMES: Record<string, string> = { 'STEPBible/STEPBible-Data/TIPNR': 'TIPNR (STEPBible)', 'BibleAquifer/ACAI': 'ACAI (BiblioNexus)', 'robertrouse/theographic-bible-metadata': 'Theographic' }

/** The relatives a kind asks for, by gender when the data has it (a relative with no gender stays in both). */
export function relativesOf(kind: Exclude<KinKind, 'who'>, f: FamilyData): FamilyData['children'] {
  const not = (g: 1 | 2) => (r: { gender?: 1 | 2 }) => r.gender !== g
  switch (kind) {
    case 'children': return f.children
    case 'sons': return f.children.filter(not(2))
    case 'daughters': return f.children.filter(not(1))
    case 'father': return f.parents.filter(not(2))
    case 'mother': return f.parents.filter(not(1))
    case 'parents': return f.parents
    case 'partners': return f.partners
    case 'wife': return f.partners.filter(not(1))
    case 'husband': return f.partners.filter(not(2))
    case 'siblings': return f.siblings
    case 'brothers': return f.siblings.filter(not(2))
    case 'sisters': return f.siblings.filter(not(1))
  }
}
/** The kind said in the head: a father or mother asked with relatives of no gender is "parents" (§4.6). */
export function headKind(kind: Exclude<KinKind, 'who'>, shown: { gender?: 1 | 2 }[]): Exclude<KinKind, 'who'> {
  if ((kind === 'father' || kind === 'mother') && shown.some((r) => r.gender === undefined)) return 'parents'
  return kind
}
/** The name shown for the person asked: as written when that is not its name ("Jacob (Israel)"), else its name. */
export const askedName = (written: string | null | undefined, name: string): string =>
  written && foldName(written) !== foldName(name) ? `${written} (${name})` : name

// ------------------------------------------------------------------------------------- who this person is, in one line
// Abel (Nov 18): a person with no Translation Words article is answered by how they are tied to someone known ("hijo de Isaí,
// padre de David", "descendiente de Judá"), not by every relation. From the core of `xtopics` only (relations, verse counts,
// same-as): nothing stored, no parts read.

/** Known: a person a reader can place, with a Translation Words article (`same-as`) or named in this many verses at least. */
export const KNOWN_VERSES = 40
/** How a person is tied to someone known: child of, parent of, spouse of, sibling of, descendant of (an ancestor), of the tribe of. */
export type TieKind = 'childOf' | 'parentOf' | 'spouseOf' | 'siblingOf' | 'descendantOf' | 'tribe'
export type Tie = { kind: TieKind; ids: string[] }
/** At most this many ties in the line. */
const TIES = 2
/** How far up the parents to look for a known ancestor. */
const UP = 6

/** The relations of the core, by person, built once per core. */
const tiesByCore = new WeakMap<XtopicsCore, { parents: Map<string, string[]>; children: Map<string, string[]>; partners: Map<string, string[]>; siblings: Map<string, string[]>; tribe: Map<string, string[]>; tw: Set<string> }>()
function tiesOf(core: XtopicsCore) {
  let t = tiesByCore.get(core)
  if (!t) {
    const add = (m: Map<string, string[]>, k: string, v: string) => { const l = m.get(k); if (!l) m.set(k, [v]); else if (!l.includes(v)) l.push(v) }
    t = { parents: new Map(), children: new Map(), partners: new Map(), siblings: new Map(), tribe: new Map(), tw: new Set() }
    for (const r of core.relations ?? []) {
      if (r.from === r.to) continue
      if (r.type === 'parent-of') { add(t.parents, r.to, r.from); add(t.children, r.from, r.to) }
      else if (r.type === 'partner-of') { add(t.partners, r.from, r.to); add(t.partners, r.to, r.from) }
      else if (r.type === 'sibling-of') { add(t.siblings, r.from, r.to); add(t.siblings, r.to, r.from) }
      else if (r.type === 'tribe') add(t.tribe, r.from, r.to)
      else if (r.type === 'same-as' && r.from.startsWith('tw:names/') && r.to.startsWith('per:')) t.tw.add(r.to)
    }
    tiesByCore.set(core, t)
  }
  return t
}
const versesIn = (core: XtopicsCore, id: string): number => [...(core.occurrences.get(id)?.values() ?? [])].reduce((n, [, v]) => n + v, 0)

/**
 * Who a person is, in at most two ties to known people (KNOWN_VERSES, a tW article), the nearest first: child of, parent of,
 * spouse of, sibling of; with none known, the nearest known ancestor (descendant of), else the tribe, else the relatives named in
 * most verses. [] when the data has no relation for the person.
 */
export async function tiesOfPerson(pack: string, id: string): Promise<Tie[]> {
  const core = await coreOf(pack)
  if (!core) return []
  const t = tiesOf(core)
  const known = (p: string) => p !== id && (t.tw.has(p) || versesIn(core, p) >= KNOWN_VERSES)
  const byFame = (l: string[]) => [...l].sort((a, b) => versesIn(core, b) - versesIn(core, a) || (a < b ? -1 : 1))
  const out: Tie[] = []
  const kinds: [TieKind, Map<string, string[]>][] = [['childOf', t.parents], ['parentOf', t.children], ['spouseOf', t.partners], ['siblingOf', t.siblings]]
  for (const [kind, m] of kinds) {
    const ids = byFame((m.get(id) ?? []).filter(known)).slice(0, 2)
    if (ids.length && out.length < TIES) out.push({ kind, ids })
  }
  if (out.length) return out
  // the nearest known ancestor, a generation at a time (the first generation was looked at above)
  let gen = t.parents.get(id) ?? []
  const seen = new Set<string>([id, ...gen])
  for (let up = 2; up <= UP && gen.length; up++) {
    const next = gen.flatMap((p) => t.parents.get(p) ?? []).filter((p) => !seen.has(p))
    next.forEach((p) => seen.add(p))
    const hit = byFame(next.filter(known))
    if (hit.length) return [{ kind: 'descendantOf', ids: hit.slice(0, 1) }]
    gen = next
  }
  const tribe = t.tribe.get(id) ?? []
  if (tribe.length) return [{ kind: 'tribe', ids: tribe.slice(0, 1) }]
  // nobody known near: the relatives named in most verses
  for (const [kind, m] of kinds) {
    const ids = byFame(m.get(id) ?? []).slice(0, 2)
    if (ids.length && out.length < TIES) out.push({ kind, ids })
  }
  return out
}

/** Whether a person has a Translation Words article (`same-as`). */
export async function hasArticle(pack: string, id: string): Promise<boolean> {
  const core = await coreOf(pack)
  return !!core && tiesOf(core).tw.has(id)
}

/** The ties in words: [man, woman] per kind ({x}: the names), and a name with no gender as the man's (the data's usual default). */
export const TIE_T: Record<KinLang, Record<TieKind, [string, string]>> = {
  en: { childOf: ['son of {x}', 'daughter of {x}'], parentOf: ['father of {x}', 'mother of {x}'], spouseOf: ['husband of {x}', 'wife of {x}'], siblingOf: ['brother of {x}', 'sister of {x}'], descendantOf: ['descendant of {x}', 'descendant of {x}'], tribe: ['of the tribe of {x}', 'of the tribe of {x}'] },
  es: { childOf: ['hijo de {x}', 'hija de {x}'], parentOf: ['padre de {x}', 'madre de {x}'], spouseOf: ['esposo de {x}', 'esposa de {x}'], siblingOf: ['hermano de {x}', 'hermana de {x}'], descendantOf: ['descendiente de {x}', 'descendiente de {x}'], tribe: ['de la tribu de {x}', 'de la tribu de {x}'] },
  fr: { childOf: ['fils de {x}', 'fille de {x}'], parentOf: ['père de {x}', 'mère de {x}'], spouseOf: ['mari de {x}', 'femme de {x}'], siblingOf: ['frère de {x}', 'sœur de {x}'], descendantOf: ['descendant de {x}', 'descendante de {x}'], tribe: ['de la tribu de {x}', 'de la tribu de {x}'] },
  id: { childOf: ['anak {x}', 'anak perempuan {x}'], parentOf: ['ayah {x}', 'ibu {x}'], spouseOf: ['suami {x}', 'istri {x}'], siblingOf: ['saudara {x}', 'saudara perempuan {x}'], descendantOf: ['keturunan {x}', 'keturunan {x}'], tribe: ['dari suku {x}', 'dari suku {x}'] },
  hi: { childOf: ['{x} का पुत्र', '{x} की पुत्री'], parentOf: ['{x} का पिता', '{x} की माता'], spouseOf: ['{x} का पति', '{x} की पत्नी'], siblingOf: ['{x} का भाई', '{x} की बहन'], descendantOf: ['{x} का वंशज', '{x} की वंशज'], tribe: ['{x} के गोत्र का', '{x} के गोत्र की'] },
  ar: { childOf: ['ابن {x}', 'ابنة {x}'], parentOf: ['أبو {x}', 'أم {x}'], spouseOf: ['زوج {x}', 'زوجة {x}'], siblingOf: ['أخو {x}', 'أخت {x}'], descendantOf: ['من نسل {x}', 'من نسل {x}'], tribe: ['من سبط {x}', 'من سبط {x}'] },
}
/** "hijo de Isaí, padre de David" (each tie's names joined; French elision as in the heads). */
export function tiesLine(ui: string, gender: 1 | 2 | undefined, ties: Tie[], nameOf: (id: string) => string): string {
  const words = TIE_T[ui as KinLang] ?? TIE_T.en
  return ties.map((t) => withName(ui, words[t.kind][gender === 2 ? 1 : 0], joinNames(ui, t.ids.map(nameOf)))).join(ui === 'ar' ? '، ' : ', ')
}
