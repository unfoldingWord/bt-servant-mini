// Place questions (handoff/diseno-mapas.md §5.1, §5.2, §5.5 and §9b; encargo-ms-mapas.md task 1): "¿Dónde queda Betel?",
// "what happened in Jerusalem?", "¿dónde nació Pablo?", "distancia entre Belén y Jerusalén", "días de viaje de X a Y", "mapa de X"
// in the six languages, answered by code with no model from the places the language-pack client reads (`xtopics`: `geo`,
// `born-in`, `place` relations, the verses of each topic; the language's `places` names). Built like kin.ts:
//   - placeShape: the syntax only, and the phrases that are never a place question ("¿dónde está escrito…?", "¿dónde está Dios?").
//   - placeQuestion: resolves the names. The route is taken only if every name is what the question asks (a place; for born / died,
//     a person). Homonyms: the passage read, region against city, the ten-times rule, else a choice.
//   - placesAt (verse → places), placeVerses, personVerses, placeData, referenceFor: the data of an answer, for pipeline.ts.
// Nothing new is stored: the index of all places and the birth / death place of a person are built here, in memory. E1 of tc-study
// gives the client no index of places and no person → place query; they may move there later (decided in E2, see the encargo).

import { BOOKS, personName, twOfPlaces, type TopicsCore, type XtopicsCore, type XtopicsPart } from '@bt-synergy/language-pack-v3'
import { distance, passagePlaces, placeQuery, type PackReader, type PlaceAt, type PlaceData, type PlaceRef } from '@bt-synergy/language-pack-client'
import { foldName } from './kin'
import { installedLangs, onPacksChanged, openLang } from './packs'

export type PlaceKind = 'where' | 'happened' | 'born' | 'died' | 'distance' | 'days' | 'map'
export type PlaceLang = 'en' | 'es' | 'fr' | 'id' | 'hi' | 'ar'
/** `names`: the names as written (1; 2 in distance and days). */
export type PlaceShape = { kind: PlaceKind; names: string[]; lang: PlaceLang }
export type PlaceAsk = {
  kind: PlaceKind; ui: PlaceLang; pack: string
  /** the places resolved, in the order of the question (born / died: the place, if the data has one); [] when `choose` is set */
  places: PlaceRef[]
  person?: { id: string; name: string }
  /** a name with several places (or, for born / died, several people: their `id` is then `per:…`, with a point-less ref) and no winner: ask */
  choose?: { name: string; options: PlaceRef[] }
  /** the other places of a name that had a winner ("¿Otra Betel?") */
  other?: PlaceRef[]
}
export type PlaceReader = PackReader

// ------------------------------------------------------------------------------------------------------------------- the shapes
/** A name as the indexes key it: folded as kin.ts folds, and without Arabic vowel marks (the packs write them, readers do not). */
const placeFold = (s: string): string => foldName(s).replace(/[ً-ٰٟ]/g, '')

/** The question without its marks and spaces as typed. */
const tidy = (q: string): string => q.replace(/[¿?!¡؟।]+/g, ' ').replace(/[.,;:،]+\s*$/g, ' ').replace(/\s+/g, ' ').trim()

/** Latin text compared without case or accents, letter by letter so the positions of the original stay (a name is cut from the original). */
function skeleton(t: string): string {
  let out = ''
  for (const c of t) {
    if (!/\p{Script=Latin}/u.test(c)) { out += c === '’' || c === '`' ? "'" : c; continue }
    const p = c.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
    out += p.length === c.length ? p : c.toLowerCase()
  }
  return out
}
/** Arabic as the patterns are written: no vowel marks or tatweel, one alef, «ى» as «ي». */
const arabic = (t: string): string => t.replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')

type Pat = { lang: PlaceLang; kind: PlaceKind; re: RegExp }
const P = (lang: PlaceLang, kind: PlaceKind, src: string): Pat => ({ lang, kind, re: new RegExp(src, 'd') })
// (longer alternatives first: the first that lets the pattern match wins)
const PATTERNS: Pat[] = [
  // ---- es
  P('es', 'born', "^donde (?:nacio|nacieron)\\s+(.+)$"),
  P('es', 'died', "^donde (?:murio|fallecio|murieron)\\s+(.+)$"),
  P('es', 'days', "^cuantos dias (?:(?:de viaje|de camino|a pie|hay|se tarda|se tardaba|se tardo|tarda|tardaba|toma|tomaba|se demora|se demoraba|dura el viaje|dura) )*(?:de|desde)\\s+(.+?)\\s+(?:a|hasta)\\s+(.+)$"),
  P('es', 'days', "^cuanto (?:tiempo )?(?:se )?(?:tarda|tardaba|tardo|demora|demoraba|toma|tomaba|lleva|llevaba)(?: en (?:llegar|viajar|ir|caminar))? (?:de|desde)\\s+(.+?)\\s+(?:a|hasta)\\s+(.+)$"),
  P('es', 'distance', "^(?:que |cual es la )?distancia (?:hay |habia |existe )?(?:entre|de)\\s+(.+?)\\s+(?:y|a|hasta|con)\\s+(.+)$"),
  P('es', 'distance', "^a cuanto (?:esta|queda|estaba|quedaba|se encuentra|dista)\\s+(.+?)\\s+de\\s+(.+)$"),
  P('es', 'distance', "^(?:cuanto dista|cuan lejos (?:esta|queda|estaba|quedaba))\\s+(.+?)\\s+de\\s+(.+)$"),
  P('es', 'happened', "^que (?:paso|sucedio|ocurrio|acontecio|pasa|sucede|ocurre) en\\s+(.+)$"),
  P('es', 'where', "^donde (?:se encuentra|se encontraba|se ubicaba|se ubica|se localizaba|se localiza|queda|quedaba|quedan|estaba|estaban|esta|estan|era|fue)\\s+(.+)$"),
  P('es', 'map', "^mapa (?:de|del)\\s+(.+)$"),
  P('es', 'map', "^(?:muestrame|muestra|mostrar|mostrame|ensename|quiero ver|ver)\\s+(.+?)\\s+en el mapa$"),
  // ---- en
  P('en', 'born', "^where (?:was|were|is|are)\\s+(.+?)\\s+born$"),
  P('en', 'died', "^where did\\s+(.+?)\\s+die$"),
  P('en', 'days', "^how (?:long|many days)\\b.*?\\b(?:from|between)\\s+(.+?)\\s+(?:to|and)\\s+(.+)$"),
  P('en', 'distance', "^how far (?:is|was)\\s+(.+?)\\s+from\\s+(.+)$"),
  P('en', 'distance', "^how far (?:is it |was it )?from\\s+(.+?)\\s+to\\s+(.+)$"),
  P('en', 'distance', "^(?:what(?:'s| is| was) )?(?:the )?distance between\\s+(.+?)\\s+and\\s+(.+)$"),
  P('en', 'distance', "^(?:what(?:'s| is| was) )?(?:the )?distance from\\s+(.+?)\\s+to\\s+(.+)$"),
  P('en', 'happened', "^what (?:happened|took place|occurred|went on)\\s+(?:in|at)\\s+(.+)$"),
  P('en', 'where', "^where(?:'s| is| was| are| were)\\s+(.+?)(?:\\s+located)?$"),
  P('en', 'map', "^(?:a |the )?map of\\s+(.+)$"),
  P('en', 'map', "^show (?:me )?(.+?)\\s+on (?:the )?map$"),
  // ---- fr
  P('fr', 'born', "^ou est (?:ne|nee)\\s+(.+)$"),
  P('fr', 'born', "^ou naquit\\s+(.+)$"),
  P('fr', 'died', "^ou est (?:mort|morte|decede|decedee)\\s+(.+)$"),
  P('fr', 'died', "^ou mourut\\s+(.+)$"),
  P('fr', 'days', "^combien de jours (?:(?:de voyage|de marche|y a[- ]t[- ]il|faut[- ]il|fallait[- ]il|fallait|met[- ]on|mettait[- ]on|pour aller|pour se rendre|pour voyager) )*(?:de|depuis)\\s+(.+?)\\s+(?:a|jusqu'a|jusqu')\\s*(.+)$"),
  P('fr', 'days', "^combien de temps (?:faut[- ]il|fallait[- ]il|met[- ]on|mettait[- ]on|prenait[- ]il|prend[- ]il)(?: pour (?:aller|voyager|se rendre|marcher))? (?:de|depuis)\\s+(.+?)\\s+(?:a|jusqu'a|jusqu')\\s*(.+)$"),
  P('fr', 'distance', "^(?:quelle (?:est la )?distance|distance) (?:y a[- ]t[- ]il |separe |separait )?entre\\s+(.+?)\\s+et\\s+(.+)$"),
  P('fr', 'distance', "^a quelle distance (?:est|se trouve|se situe|etait|se trouvait)\\s+(.+?)\\s+de\\s+(.+)$"),
  P('fr', 'happened', "^(?:que s'est[- ]il (?:passe|produit)|qu'est[- ]ce qui s'est (?:passe|produit)|qu'est[- ]il arrive)\\s+(?:a la |a l'|au |aux |a |en |dans la |dans le |dans l'|dans |sur )(.+)$"),
  P('fr', 'where', "^ou (?:se trouvaient|se trouvait|se trouvent|se trouve|se situait|se situe|etaient|etait|sont|est)\\s+(.+)$"),
  P('fr', 'map', "^carte (?:de la |du |des |de l'|d'|de )(.+)$"),
  P('fr', 'map', "^(?:montre[- ]moi|montrez[- ]moi|affiche)\\s+(.+?)\\s+sur la carte$"),
  // ---- id
  P('id', 'born', "^di ?mana\\s+(.+?)\\s+(?:dilahirkan|lahir)$"),
  P('id', 'died', "^di ?mana\\s+(.+?)\\s+(?:meninggal|mati|wafat)$"),
  P('id', 'days', "^berapa (?:hari|lama)\\b.*?\\bdari\\s+(.+?)\\s+(?:ke|sampai|hingga|menuju)\\s+(.+)$"),
  P('id', 'distance', "^berapa jauh (?:jarak )?(?:dari )?(.+?)\\s+(?:dari|ke|sampai|dengan)\\s+(.+)$"),
  P('id', 'distance', "^(?:berapa )?jarak (?:antara )?(.+?)\\s+(?:dan|ke|dengan)\\s+(.+)$"),
  P('id', 'happened', "^apa yang (?:terjadi|berlangsung|dulu terjadi|pernah terjadi) (?:di|pada|dalam)\\s+(.+)$"),
  P('id', 'where', "^di ?mana\\s+(?:letak |letaknya |lokasi |posisi )?(.+?)(?:\\s+(?:terletak|berada|letaknya|dulu|dahulu|sekarang|ada))*$"),
  P('id', 'map', "^peta (?:dari |tentang )?(.+)$"),
  P('id', 'map', "^(?:tunjukkan|perlihatkan|tampilkan)\\s+(.+?)\\s+(?:di|pada) peta$"),
  // ---- hi (the name first; «कहाँ» and «कहां»)
  P('hi', 'born', "^(.+?)\\s+(?:का|की)\\s+जन्म\\s+(?:कहाँ|कहां)\\s+(?:हुआ|हुई)(?:\\s+(?:था|थी))?$"),
  P('hi', 'born', "^(.+?)\\s+(?:कहाँ|कहां)\\s+पैदा\\s+(?:हुआ|हुई)(?:\\s+(?:था|थी))?$"),
  P('hi', 'died', "^(.+?)\\s+(?:की|का)\\s+मृत्यु\\s+(?:कहाँ|कहां)\\s+(?:हुई|हुआ)(?:\\s+(?:थी|था))?$"),
  P('hi', 'died', "^(.+?)\\s+(?:कहाँ|कहां)\\s+(?:मरा|मरी|मर गया|मर गई)$"),
  P('hi', 'days', "^(.+?)\\s+से\\s+(.+?)\\s+तक\\s+(?:.+\\s+)?कितने\\s+दिन(?:\\s.*)?$"),
  P('hi', 'distance', "^(.+?)\\s+से\\s+(.+?)\\s+(?:कितनी|कितना)\\s+दूर(?:ी)?(?:\\s+(?:है|थी|था))?$"),
  P('hi', 'distance', "^(.+?)\\s+और\\s+(.+?)\\s+के\\s+बीच\\s+(?:की\\s+दूरी\\s+)?कितनी(?:\\s+दूरी)?(?:\\s+है)?$"),
  P('hi', 'happened', "^(.+?)\\s+में\\s+क्या\\s+(?:हुआ|हुई|हुए|घटा|घटित\\s+हुआ)(?:\\s+था)?$"),
  P('hi', 'where', "^(.+?)\\s+(?:कहाँ|कहां)\\s+(?:स्थित\\s+)?(?:है|था|थी|हैं|थे|पर\\s+है|पर\\s+था)$"),
  P('hi', 'map', "^(.+?)\\s+का\\s+(?:नक्शा|नक़्शा|मानचित्र)(?:\\s+(?:दिखाओ|दिखाइए))?$"),
  // ---- ar (written as `arabic()` leaves the text)
  P('ar', 'born', "^اين (?:ولد|ولدت)\\s+(.+)$"),
  P('ar', 'died', "^اين (?:مات|ماتت|توفي|توفيت)\\s+(.+)$"),
  P('ar', 'days', "^كم (?:يوما|يوم)\\s+(?:\\S+\\s+){0,3}?من\\s+(.+?)\\s+(?:الي|حتي)\\s+(.+)$"),
  P('ar', 'distance', "^كم (?:تبعد|يبعد)\\s+(.+?)\\s+عن\\s+(.+)$"),
  P('ar', 'distance', "^(?:كم|ما)\\s+(?:هي\\s+)?المسافة بين\\s+(.+?)\\s+و\\s*(.+)$"),
  P('ar', 'happened', "^ماذا (?:حدث|جري|حصل|وقع)\\s+(?:في|ب)\\s*(.+)$"),
  P('ar', 'where', "^اين\\s+(?:تقع|يقع|توجد|يوجد|كانت|كان)\\s+(.+)$"),
  P('ar', 'map', "^(?:خريطة|خارطة|خريطه|خارطه)\\s+(.+)$"),
]

// Never a place question: where something is written or said ("¿dónde está escrito…?", "where is it written", "où est-il écrit"
// has no space after «est»; "di mana tertulis"), and what is asked of a pronoun or of God ("¿dónde estás?", "¿dónde está Dios?").
const WRITTEN = /\b(?:escrit[oa]s?|dice|dicen|dijo|written|says?|said|ecrit[es]*|dit|tertulis|dikatakan|berkata|firman)\b|(?<![ऀ-ॿ])(?:लिखा|कहा)(?![ऀ-ॿ])|(?<![ء-ي])[وفب]?(?:ال)?(?:مكتوب|يقول|قال|يقال)(?![ء-ي])/
const NOT_PLACE = new Set(['it', 'he', 'she', 'him', 'her', 'they', 'them', 'you', 'we', 'i', 'me', 'god', 'el', 'ella', 'ello', 'ti', 'usted', 'yo', 'dios', 'il', 'elle', 'ils',
  'tu', 'vous', 'toi', 'moi', 'dieu', 'dia', 'ia', 'anda', 'kamu', 'engkau', 'mereka', 'kita', 'kami', 'saya', 'aku', 'tuhan', 'allah', 'वह', 'यह', 'तुम', 'आप', 'परमेश्वर', 'ईश्वर',
  'هو', 'هي', 'انت', 'الله', 'ربنا'].map((n) => placeFold(n)))
/** A name of a few words at most, with a letter in it. */
const nameLike = (n: string): boolean => n.split(/\s+/).length <= 4 && /\p{L}/u.test(n)

/**
 * Whether a question is shaped like a place question (§5.1): the syntax only, any of the six languages (the one whose words fit is the
 * reply's). Not whether the names are places: placeQuestion decides that. "Journeys of X", "where did X go", "first journey" and
 * "map of a person" are E3 and have no shape here.
 */
export function placeShape(q: string): PlaceShape | null {
  const t = tidy(q.normalize('NFC'))
  if (!t) return null
  const forms: { latin: string; ar: string } = { latin: skeleton(t), ar: arabic(t) }
  if (WRITTEN.test(forms.latin) || WRITTEN.test(forms.ar)) return null
  for (const p of PATTERNS) {
    const text = p.lang === 'ar' ? forms.ar : p.lang === 'hi' ? t : forms.latin
    const m = p.re.exec(text)
    if (!m) continue
    const names: string[] = []
    // (a Latin name is cut from the original so its accents stay; the others are the text the pattern read)
    for (let g = 1; m.indices![g]; g++) {
      const [a, b] = m.indices![g]!
      names.push((p.lang === 'ar' || p.lang === 'hi' ? text : t).slice(a, b).replace(/[«»"“”]/g, '').trim())
    }
    if (!names.length || names.some((n) => !nameLike(n) || NOT_PLACE.has(placeFold(n)))) continue
    return { kind: p.kind, names, lang: p.lang }
  }
  return null
}

/** The ways a written name may be read: as is, without what stands before it (an article, a preposition, "la ciudad de"), without an Arabic «و». Folded. */
const LEAD: Record<PlaceLang, RegExp[]> = {
  en: [/^(?:the|in|at|to)\s+/, /^(?:city|town|region|land|province|village|mount|mountain|river|sea|valley|island|port|desert)\s+of\s+/],
  es: [/^(?:el|la|los|las|del|de la|de los|de las|de|en|a)\s+/, /^(?:ciudad|region|pueblo|monte|tierra|provincia|aldea|villa|rio|valle|isla|puerto|desierto)(?:\s+(?:de la|de los|de las|del|de))?\s+/],
  fr: [/^(?:le|la|les|du|des|de la|de|a la|au|aux|a|en)\s+/, /^(?:l|d)'\s*/, /^(?:ville|region|village|mont|montagne|pays|fleuve|riviere|mer|vallee|ile|port|desert|province)(?:\s+(?:de la|du|des|de)\s+|\s+d'\s*|\s+|$)/],
  id: [/^(?:di|ke|dari)\s+/, /^(?:kota|negeri|tanah|daerah|wilayah|provinsi|desa|gunung|bukit|sungai|laut|danau|lembah|pulau|pelabuhan)\s+/],
  hi: [/\s+(?:शहर|नगर|नदी|पर्वत|देश)$/],
  ar: [/^و(?=\S{2,})/, /^(?:مدينة|مدينه|منطقة|منطقه|جبل|نهر|بحر|بلدة|ارض)\s+/],
}
function variants(name: string, lang: PlaceLang): string[] {
  const out: string[] = []
  const add = (s: string) => { const k = placeFold(lang === 'ar' ? arabic(s) : s); if (k && !out.includes(k)) out.push(k) }
  add(name)
  for (let i = 0; i < out.length && out.length < 10; i++) {
    for (const re of LEAD[lang]) add(out[i]!.replace(re, ''))
    // (the Arabic «و» and «ال» go in either order: «والقدس»)
    if (lang === 'ar') add(out[i]!.replace(/^و/, '').replace(/^ال(?=\S{2,})/, ''))
  }
  return out
}

// -------------------------------------------------------------------------------------------------------------------- the reader
let readerOf: (lang: string) => Promise<PlaceReader> = openLang
/** Tests: read the places from this reader instead of the packs (no argument: the packs again). */
export function setPlaceReader(f?: (lang: string) => Promise<PlaceReader>) {
  readerOf = f ?? openLang
  resetPlaces()
}

/** The data of a language that the questions need, read once: the core of `xtopics`, the language's names, the index of places by name. */
type Entry = { ref: PlaceRef; verses: number }
type PlaceIx = {
  reader: PlaceReader
  core: XtopicsCore
  tw: Map<string, string[]>
  mapNames: Record<string, string[]>
  topics?: TopicsCore
  byName: Map<string, string[]>
  byId: Map<string, Entry>
}
type PersonIx = { byName: Map<string, string[]>; byId: Map<string, { name: string; verses: number; note?: string }> }
const ixs = new Map<string, Promise<PlaceIx | null>>()
const pixs = new Map<string, Promise<PersonIx | null>>()
export function resetPlaces() {
  haveCache = null
  ixs.clear()
  pixs.clear()
}
onPacksChanged(resetPlaces)

// (copied from `cores()`, `ref()` and `countOf` of src/query/geo.ts of the client, which keeps them private: the PlaceRef is made the same way)
function refOf(ix: Pick<PlaceIx, 'core' | 'tw' | 'mapNames' | 'topics'>, id: string): PlaceRef {
  const g = ix.core.geo?.[id]
  const out: PlaceRef = { id, name: personName(id, ix.core, ix.tw, ix.mapNames, ix.topics?.places), sure: g?.sure ?? 0, form: g?.form ?? 1 }
  if (g !== undefined && g.sure > 0) {
    out.lat = g.lat / 100
    out.lon = g.lon / 100
  }
  const note = ix.topics?.places?.notes[id]
  if (note !== undefined) out.note = note
  return out
}
const countOf = (core: XtopicsCore, id: string): number => [...(core.occurrences.get(id)?.values() ?? [])].reduce((n, [, verses]) => n + verses, 0)
const twCache = new WeakMap<XtopicsCore, Map<string, string[]>>()

function placeIx(lang: string): Promise<PlaceIx | null> {
  let p = ixs.get(lang)
  if (!p) {
    const made: Promise<PlaceIx | null> = (async () => {
      const reader = await readerOf(lang)
      const x = (await reader.mapsOf(['xtopics'], { coreOnly: true })).xtopics
      if (!x) return null
      const l = (await reader.mapsOf(['map', 'topics'], { coreOnly: true })) as { map?: { core: { names: Record<string, string[]> } }; topics?: { core: TopicsCore } }
      let tw = twCache.get(x.core)
      if (!tw) twCache.set(x.core, (tw = twOfPlaces(x.core)))
      const ix: PlaceIx = { reader, core: x.core, tw, mapNames: l.map?.core.names ?? {}, topics: l.topics?.core, byName: new Map(), byId: new Map() }
      const aliasesOf = new Map<string, string[]>()
      for (const [name, ids] of Object.entries(ix.topics?.places?.aliases ?? {})) for (const id of ids) aliasesOf.set(id, [...(aliasesOf.get(id) ?? []), name])
      for (const [id, t] of x.core.topics) {
        if (t.kind !== 'place' || !id.startsWith('lug:')) continue
        const ref = refOf(ix, id)
        ix.byId.set(id, { ref, verses: countOf(x.core, id) })
        // the names it is found by: its own, ACAI aliases, the titles of the Translation Words articles joined to it, the alignment's, the English title
        const names = [ref.name, ...(aliasesOf.get(id) ?? []), ...(tw.get(id) ?? []).map((c) => ix.mapNames[c]?.[0] ?? ''), ix.topics?.names[id]?.[0]?.[0] ?? '', t.title]
        for (const n of names) {
          const k = placeFold(n)
          if (!k) continue
          const ids = ix.byName.get(k)
          if (!ids) ix.byName.set(k, [id])
          else if (!ids.includes(id)) ids.push(id)
        }
      }
      return ix
    })().catch(() => {
      // (a failed read is not kept: tried again next time)
      if (ixs.get(lang) === made) ixs.delete(lang)
      return null
    })
    ixs.set(lang, made)
    p = made
  }
  return p
}

function personIx(lang: string): Promise<PersonIx | null> {
  let p = pixs.get(lang)
  if (!p) {
    const made: Promise<PersonIx | null> = (async () => {
      const reader = await readerOf(lang)
      const list = (await reader.people()).data
      if (!list) return null
      const topics = ((await reader.mapsOf(['topics'], { coreOnly: true })) as { topics?: { core: TopicsCore } }).topics?.core
      const ix: PersonIx = { byName: new Map(), byId: new Map() }
      for (const e of list) {
        ix.byId.set(e.id, { name: e.name, verses: e.verses, ...(topics?.people?.notes[e.id] ? { note: topics.people.notes[e.id] } : {}) })
        for (const n of e.names) {
          const k = placeFold(n)
          if (!k) continue
          const ids = ix.byName.get(k)
          if (!ids) ix.byName.set(k, [e.id])
          else if (!ids.includes(e.id)) ids.push(e.id)
        }
      }
      return ix
    })().catch(() => {
      if (pixs.get(lang) === made) pixs.delete(lang)
      return null
    })
    pixs.set(lang, made)
    p = made
  }
  return p
}

/** The pack of a language code the app uses ("es" → "es-419"). */
const packOf = (l: string) => (l.startsWith('es') ? 'es-419' : l)
/** The packs to read in, in order: the question's language, the app's, English, the others on the phone. */
let haveCache: Promise<string[]> | null = null
async function packsFor(lang: string, nav: string): Promise<string[]> {
  // (only a success is kept: a failed read is tried again)
  let have: string[]
  try { have = await (haveCache ??= installedLangs()) } catch { haveCache = null; have = [] }
  return [...new Set([packOf(lang), packOf(nav), 'en', ...have])].filter((l) => have.includes(l))
}

const chapterOfVerse = (v: number): number => Math.floor(v / 1000) % 1000
/** The parts of `xtopics` of these books (only those); a book whose part is not there is missing from the map. */
async function partsOf(reader: PlaceReader, books: string[]): Promise<Map<string, XtopicsPart>> {
  if (!books.length) return new Map()
  return (await reader.xtopicsParts?.(books).catch(() => undefined)) ?? new Map()
}

// -------------------------------------------------------------------------------------------------------------- resolving names
const byFame = (ix: PlaceIx, ids: string[]): string[] => [...ids].sort((a, b) => (ix.byId.get(b)?.verses ?? 0) - (ix.byId.get(a)?.verses ?? 0) || (a < b ? -1 : 1))

/** The places a written name may be, best known first; [] when it is none. */
function lookupPlaces(ix: PlaceIx, name: string, lang: PlaceLang): string[] {
  for (const k of variants(name, lang)) {
    const ids = ix.byName.get(k)
    if (ids?.length) return byFame(ix, ids)
  }
  return []
}

type Picked = { win: PlaceRef; others: PlaceRef[] } | { choose: PlaceRef[] }
/**
 * One name with its candidates, to one place: the only one; the one of the passage read (exactly one is in that chapter); in «where» and
 * «distance» a city or port against regions (§5.2: the question asks for a point); the one named in ten times the verses of the next;
 * else ask (the options, best known first).
 */
async function pickPlace(ix: PlaceIx, ids: string[], kind: PlaceKind, last: string | null): Promise<Picked> {
  const out = (id: string): Picked => ({ win: ix.byId.get(id)!.ref, others: ids.filter((x) => x !== id).map((x) => ix.byId.get(x)!.ref) })
  if (ids.length === 1) return out(ids[0]!)
  const m = /^([0-9a-z]{3}) (\d+)/.exec(last ?? '')
  if (m && m[1] !== 'obs') {
    const part = (await partsOf(ix.reader, [m[1]!])).get(m[1]!)
    if (part) {
      const here = ids.filter((id) => (part.occurrences.get(id) ?? []).some((v) => chapterOfVerse(v) === +m[2]!))
      if (here.length === 1) return out(here[0]!)
    }
  }
  if (kind === 'where' || kind === 'distance' || kind === 'days') {
    const point = ids.filter((id) => [1, 5].includes(ix.byId.get(id)!.ref.form))
    if (point.length === 1 && ids.some((id) => ix.byId.get(id)!.ref.form === 2)) return out(point[0]!)
  }
  const [a, b] = [ix.byId.get(ids[0]!)!.verses, ix.byId.get(ids[1]!)!.verses]
  if (a > 0 && a >= 10 * b) return out(ids[0]!)
  return { choose: ids.map((id) => ix.byId.get(id)!.ref) }
}

/** Where a person was born or died (`born-in` / `died-in` of Theographic): the place's id, the first by the order of the core. */
function placeOfPerson(core: XtopicsCore, person: string, type: 'born-in' | 'died-in'): string | undefined {
  return (core.relations ?? []).find((r) => r.type === type && r.from === person && r.to.startsWith('lug:'))?.to
}

/**
 * A place question, resolved (§5.2): null when it has not the shape, or a name is no place (for born / died: no person), or there is
 * no `xtopics` (§5.5): the question goes on as today. `last`: the passage the conversation is on ("gen 25:26"), for a name several
 * places have. Without `geo` the route is taken just the same (the places have `sure` 0).
 */
export async function placeQuestion(q: string, nav: string, last: string | null): Promise<PlaceAsk | null> {
  const s = placeShape(q)
  if (!s) return null
  const people = s.kind === 'born' || s.kind === 'died'
  for (const pack of await packsFor(s.lang, nav)) {
    const ix = await placeIx(pack)
    if (!ix) continue
    const ask: PlaceAsk = { kind: s.kind, ui: s.lang, pack, places: [] }
    if (people) {
      const pix = await personIx(pack)
      if (!pix) continue
      let ids: string[] = []
      for (const k of variants(s.names[0]!, s.lang)) if ((ids = pix.byName.get(k) ?? []).length) break
      if (!ids.length) continue
      const sorted = [...ids].sort((a, b) => pix.byId.get(b)!.verses - pix.byId.get(a)!.verses || (a < b ? -1 : 1))
      const [a, b] = [pix.byId.get(sorted[0]!)!.verses, pix.byId.get(sorted[1] ?? '')?.verses ?? 0]
      if (sorted.length > 1 && !(a > 0 && a >= 10 * b)) {
        // (several people of the name, none far more named: ask; their refs carry no point)
        ask.choose = { name: s.names[0]!, options: sorted.map((id) => ({ id, name: pix.byId.get(id)!.name, ...(pix.byId.get(id)!.note ? { note: pix.byId.get(id)!.note } : {}), sure: 0 as const, form: 1 as const })) }
        return ask
      }
      const id = sorted[0]!
      ask.person = { id, name: pix.byId.get(id)!.name }
      const at = placeOfPerson(ix.core, id, s.kind === 'born' ? 'born-in' : 'died-in')
      const entry = at ? ix.byId.get(at) : undefined
      if (entry) ask.places = [entry.ref]
      return ask
    }
    // every name is resolved first: a name that is no place fails this pack before any choice is asked
    const found: string[][] = []
    let failed = false
    for (const name of s.names) {
      const ids = lookupPlaces(ix, name, s.lang)
      if (!ids.length) { failed = true; break }
      found.push(ids)
    }
    for (let i = 0; !failed && i < found.length; i++) {
      const r = await pickPlace(ix, found[i]!, s.kind, last)
      if ('choose' in r) {
        ask.choose = { name: s.names[i]!, options: r.choose }
        ask.places = []
        return ask
      }
      ask.places.push(r.win)
      if (r.others.length) ask.other = [...(ask.other ?? []), ...r.others]
    }
    if (!failed) return ask
  }
  return null
}

// ---------------------------------------------------------------------------------------------------------------- the data of an answer
/**
 * The places named in a passage, in the order of the text: one verse or a range of one book or across chapters ("gen 12:8", "gen 12:8-9",
 * "act 13:1-14:28"), a whole chapter ("gen 12"), or a frame of Open Bible Stories ("obs 3:4": the verses it tells). Cities, ports, waters and
 * heights (not regions: `passagePlaces` of the client); each carries `verse`, its first verse in the passage. [] when the part of a
 * book is not there, or without `xtopics`.
 */
export async function placesAt(pack: string, ref: string): Promise<PlaceAt[]> {
  const ix = await placeIx(pack)
  if (!ix) return []
  let ranges: [number, number][] = []
  const o = /^obs (\d+):(\d+)$/.exec(ref)
  if (o) ranges = ix.core.obsFrames?.[`${+o[1]!}:${+o[2]!}`] ?? []
  else {
    const m = /^([0-9a-z]{3}) (\d+)(?::(\d+))?(?:-(?:(\d+):)?(\d+))?$/.exec(ref)
    const at = m ? BOOKS.indexOf(m[1]!) : -1
    if (!m || at < 0) return []
    const base = (at + 1) * 1_000_000
    if (m[3] === undefined) ranges = [[base + +m[2]! * 1000 + 1, base + +m[2]! * 1000 + 999]]
    else {
      const first = base + +m[2]! * 1000 + +m[3]
      const last = m[5] === undefined ? first : base + +(m[4] ?? m[2])! * 1000 + +m[5]
      ranges = [[first, last]]
    }
  }
  const seen = new Set<string>()
  const out: PlaceAt[] = []
  for (const [a, z] of ranges) {
    const got = (await passagePlaces(ix.reader, a, z).catch(() => null))?.data ?? []
    for (const p of got) if (!seen.has(p.id)) { seen.add(p.id); out.push(p) }
  }
  return out
}

/** One place: its data as the client gives it (`placeQuery`: name, note, point, certainty, form, tW articles, verses, who was born / died here, events, sources); null when it is not one. */
export async function placeData(pack: string, id: string): Promise<PlaceData | null> {
  try {
    return (await placeQuery(await readerOf(pack), id)).data
  } catch {
    return null
  }
}

/** The verses of a topic in the books installed, in canonical order: the verses in the parts of `xtopics` (all of them, not the count of the core). */
async function topicVerses(pack: string, id: string): Promise<number[]> {
  const ix = await placeIx(pack)
  if (!ix) return []
  const books = [...(ix.core.occurrences.get(id)?.keys() ?? [])].sort((a, b) => BOOKS.indexOf(a) - BOOKS.indexOf(b))
  const parts = await partsOf(ix.reader, books)
  const out = new Set<number>()
  for (const b of books) for (const v of parts.get(b)?.occurrences.get(id) ?? []) out.add(v)
  return [...out].sort((a, b) => a - b)
}
/** The verses that name a place, in the books installed, in order (the parts of `xtopics`). */
export const placeVerses = (pack: string, id: string): Promise<number[]> => topicVerses(pack, id)
/** The verses that name a person (for «aparecen juntos en», with `kinVerses`). */
export const personVerses = (pack: string, id: string): Promise<number[]> => topicVerses(pack, id)

/**
 * The places a distance is told from (§5.3): all measured with high certainty on the real common (a test of the app checks it). A new common
 * may add to the list, never silently: the ids are fixed here.
 */
export const REFERENCE_PLACES = ['lug:jerusalem', 'lug:samaria', 'lug:nazareth', 'lug:damascus', 'lug:tyre', 'lug:gaza', 'lug:hebron', 'lug:babylon',
  'lug:nineveh', 'lug:susa', 'lug:memphis', 'lug:alexandria', 'lug:antioch-act-6-5', 'lug:tarsus', 'lug:ephesus', 'lug:athens', 'lug:corinth', 'lug:rome'] as const

/**
 * The reference place of a place: the nearest of REFERENCE_PLACES by distance, skipping the place itself (a reference's own reference is the next
 * one). Only a reference with a point and certainty 2 or 3 in this common (a common with less leaves the list shorter). null: the place has no
 * point, or no reference has one (no `geo`).
 */
export async function referenceFor(pack: string, place: PlaceRef): Promise<PlaceRef | null> {
  const ix = await placeIx(pack)
  if (!ix || place.lat === undefined || place.lon === undefined) return null
  let best: { ref: PlaceRef; km: number } | null = null
  for (const id of REFERENCE_PLACES) {
    if (id === place.id) continue
    const g = ix.core.geo?.[id]
    if (!g || g.sure < 2) continue
    const ref = ix.byId.get(id)?.ref ?? refOf(ix, id)
    const km = distance({ lat: place.lat, lon: place.lon }, { lat: ref.lat!, lon: ref.lon! }).km
    if (!best || km < best.km) best = { ref, km }
  }
  return best?.ref ?? null
}
