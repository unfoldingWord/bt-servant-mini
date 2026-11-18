// Kinship questions (handoff/diseno-parentescos.md §4, §8 over it; encargo-ms-kin.md): "¿Quiénes fueron los hijos de Isaac?",
// "father of Ruth", "इसहाक के पुत्र", "من هو أبو إسحاق؟", "¿Quién fue Cetura?", answered by code with no model, from the family the
// language-pack client gives (`reader.family`: TIPNR relations, ACAI gender and names, the verses of each relation from the parts
// of `xtopics`) and the names it finds people by (`reader.people`). Nothing new is stored: every link is built here, in memory.
//   - kinShape: the syntax only (six languages), and the phrases that are never a family question ("hijos de Israel").
//   - kinQuestion: who X is (the people index, homonyms: the passage in the conversation, then the ten-times rule, else a choice).
//   - the links of a person (its OBS stories) and of a verse or frame (who is in it), for pipeline.ts.

export type KinKind = 'children' | 'sons' | 'daughters' | 'father' | 'mother' | 'parents' | 'partners' | 'wife' | 'husband'
  | 'siblings' | 'brothers' | 'sisters' | 'who'
export type KinLang = 'en' | 'es' | 'fr' | 'id' | 'hi' | 'ar'
/**
 * A question shaped like a family question. `name`: the person as written (without an article); `alts`: other ways to read it
 * (Arabic without a first «و»). `one`: a singular word ("hijo de", "son of"). `abu`: Arabic «أبو X», which may be a name (أبو شالوم).
 */
export type KinShape = { kind: KinKind; name: string; alts: string[]; lang: KinLang; one?: true; abu?: true }

// ------------------------------------------------------------------------------------------------- the words of each language
type Word = { kind: KinKind; one?: true }
const W = (kind: KinKind, one?: true): Word => (one ? { kind, one } : { kind })
/** Each language's family words (lower case, as typed), to the kind they ask. */
const WORDS: Record<KinLang, Record<string, Word>> = {
  en: {
    son: W('sons', true), sons: W('sons'), child: W('children', true), children: W('children'), kids: W('children'),
    daughter: W('daughters', true), daughters: W('daughters'), father: W('father'), dad: W('father'), mother: W('mother'), mom: W('mother'),
    parents: W('parents'), wife: W('wife'), wives: W('wife'), husband: W('husband'), spouse: W('partners'), spouses: W('partners'),
    brother: W('brothers', true), brothers: W('brothers'), sister: W('sisters', true), sisters: W('sisters'), siblings: W('siblings'),
  },
  es: {
    hijo: W('sons', true), hijos: W('children'), hija: W('daughters', true), hijas: W('daughters'), padre: W('father'), papa: W('father'),
    madre: W('mother'), mama: W('mother'), padres: W('parents'), esposa: W('wife'), esposas: W('wife'), mujer: W('wife'), mujeres: W('wife'),
    esposo: W('husband'), marido: W('husband'), hermano: W('brothers', true), hermanos: W('siblings'), hermana: W('sisters', true), hermanas: W('sisters'),
  },
  fr: {
    fils: W('sons'), enfant: W('children', true), enfants: W('children'), fille: W('daughters', true), filles: W('daughters'), pere: W('father'),
    mere: W('mother'), parents: W('parents'), femme: W('wife'), femmes: W('wife'), epouse: W('wife'), epouses: W('wife'), mari: W('husband'),
    epoux: W('husband'), frere: W('brothers', true), freres: W('siblings'), soeur: W('sisters', true), soeurs: W('sisters'),
  },
  id: {
    // («anak» is one son or many: «anak Daud» is the title of Jesus, so it counts as singular there)
    anak: W('children', true), 'anak-anak': W('children'), 'anak laki-laki': W('sons'), 'anak-anak laki-laki': W('sons'), putra: W('sons'),
    'anak perempuan': W('daughters'), 'anak-anak perempuan': W('daughters'), putri: W('daughters'), ayah: W('father'), bapa: W('father'),
    bapak: W('father'), ibu: W('mother'), 'orang tua': W('parents'), 'orangtua': W('parents'), istri: W('wife'), isteri: W('wife'),
    suami: W('husband'), saudara: W('siblings'), 'saudara-saudara': W('siblings'), 'saudara laki-laki': W('brothers'),
    'saudara perempuan': W('sisters'),
  },
  hi: {
    'पुत्र': W('sons'), 'पुत्रों': W('sons'), 'बेटा': W('sons', true), 'बेटे': W('sons'), 'बेटों': W('sons'), 'बच्चे': W('children'),
    'बच्चों': W('children'), 'संतान': W('children'), 'सन्तान': W('children'), 'पुत्री': W('daughters'), 'पुत्रियाँ': W('daughters'),
    'पुत्रियों': W('daughters'), 'बेटी': W('daughters', true), 'बेटियाँ': W('daughters'), 'बेटियों': W('daughters'), 'पिता': W('father'),
    'माता': W('mother'), 'माँ': W('mother'), 'माता-पिता': W('parents'), 'पत्नी': W('wife'), 'पत्नियाँ': W('wife'), 'पति': W('husband'),
    'भाई': W('brothers'), 'भाइयों': W('brothers'), 'बहन': W('sisters'), 'बहनें': W('sisters'), 'बहनों': W('sisters'),
  },
  ar: {
    'أبناء': W('sons'), 'ابناء': W('sons'), 'بنو': W('sons'), 'بني': W('sons'), 'ابن': W('sons', true), 'أولاد': W('children'),
    'اولاد': W('children'), 'بنات': W('daughters'), 'ابنة': W('daughters', true), 'بنت': W('daughters', true), 'والد': W('father'),
    'أبو': W('father'), 'ابو': W('father'), 'أب': W('father'), 'اب': W('father'), 'أم': W('mother'), 'ام': W('mother'), 'والدة': W('mother'),
    'والدا': W('parents'), 'والدي': W('parents'), 'أبوا': W('parents'), 'ابوا': W('parents'), 'زوجة': W('wife'), 'زوجات': W('wife'),
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
const WRAP: [KinLang, RegExp][] = [
  ['en', /^(?:who|what)\s+(?:was|were|is|are)\s+(.+)$/i],
  ['en', /^who['’]s\s+(.+)$/i],
  ['en', /^(?:tell me about|who is called)\s+(.+)$/i],
  ['es', /^qui[eé]n(?:es)?\s+(?:fue|fueron|era|eran|es|son)\s+(.+)$/i],
  ['es', /^(?:c[oó]mo se llamaba(?:n)?|h[aá]blame de)\s+(.+)$/i],
  ['fr', /^qui\s+(?:était|etait|étaient|etaient|est|sont|fut|furent)\s+(.+)$/i],
  ['fr', /^qui\s+(?:est-ce que|etait-ce)\s+(.+)$/i],
  ['id', /^siapa(?:kah)?\s+(?:saja\s+|itu\s+|nama\s+)?(.+?)(?:\s+itu)?$/i],
  ['hi', /^(.+?)\s+कौन(?:-कौन)?\s+(?:था|थे|थी|थीं|है|हैं)$/],
  ['ar', /^(?:من|مَن|مَنْ)\s+(?:هو|هي|هم|هما|كان|كانت|كانوا|كانا)?\s*(.+)$/],
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
  for (const [lang, re] of WRAP) {
    const m = re.exec(t)
    if (m?.[1]) {
      rest = m[1].trim()
      wrapped = lang
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
    if ((w.kind === 'children' || w.kind === 'sons') && PEOPLES.has(f)) return null
    if ((w.kind === 'sons' || w.kind === 'children') && (w.one || / का /.test(rest)) && DAVID.has(f)) return null
    const out: KinShape = { kind: w.kind, name, alts, lang: s.lang }
    if (w.one) out.one = true
    if (s.lang === 'ar' && (key === 'أبو' || key === 'ابو')) out.abu = true
    return out
  }
  if (!wrapped) return null
  const { name, alts } = cleanName(rest, wrapped)
  if (!nameLike(name) || PRONOUNS.has(foldName(name))) return null
  return { kind: 'who', name, alts, lang: wrapped }
}
