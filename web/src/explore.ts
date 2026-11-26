// Explore without typing: the helps in a few taps. Bible: book → chapter → verse (then the usual answer for that verse: its
// text, notes, questions and key terms), with the book's and the chapter's introductions when the notes have them.
// Translation Academy: the four manuals → their articles → the article. Only what the installed packs hold is offered (no
// dead ends), books in canonical order and grouped by testament. Nothing here uses the network.
import { bookView } from '@bt-synergy/language-pack-v3'
import { CANON, openLang } from './packs'
import { bookShown } from './firstuse'
import { count } from './usage'
import taSections from './data/ta-sections.json'
import { addSaved, findSaved, MAX_ITEMS, personal, removeSaved, savedSummary, ST as SVT } from './saved'
import { bibleLabel, obsLabel, obsPack, OW, type StoryEntry, storyList } from './obs'
import { bidiLabel, rtlLang } from './bidi'
import { type Five, fiveOffered, fiveStories, fiveViewTitle, type ModeId, modeCount, modesFor, modeSub, modeTitle, MT, dataOf, noFive } from './modes'
import { langName, loadFixture5 } from './pipeline'
import { peoplePacks, warmKin } from './kin'
import { renderPeopleTab, renderPerson, resetPeopleTab, stopPeopleTab, updatePeoplePacks } from './explorepeople'
import { placePacks } from './places'
import { sweepMaps } from './placeview'
import { lugaresBusy, renderLugaresTab, renderPlace, resetLugaresTab, stopLugaresTab } from './explorelugares'
import type { TreeMode } from './tree'
import type { Sheet } from './answer'
import { type Saved5 } from './obs5mstore'
import { stepPlace } from './obs5m'
import { W5 } from './obs5mwords'

// ------------------------------------------------------------------------------------------------------------------ data

export type BookEntry = { code: string; lang: string }
/** The books the packs have, in canonical order, each from the first pack in `packs` that has it installed. */
export async function bibleBooks(packs: string[]): Promise<BookEntry[]> {
  const readers = await Promise.all(packs.map((l) => openLang(l).then((r) => ({ l, r })).catch(() => null)))
  const out: BookEntry[] = []
  for (const code of CANON) {
    const hit = readers.find((x) => x?.r.installed(`book:${code}`))
    if (hit) out.push({ code, lang: hit.l })
  }
  return out
}

export type ChapterEntry = { ch: number; verses: number[]; intro: boolean }
export type BookPlan = { intro: boolean; chapters: ChapterEntry[] }
const plans = new Map<string, Promise<BookPlan | null>>()
const planned = new Set<string>() // the plans already read: no wait to show for them
/**
 * A book's chapters and verses as its texts publish them (a bridge "4-5" gives 4 and 5), and which introductions its notes
 * have (as answer.ts finds them: the first intro row is the book's, another one starting at chapter:1 is that chapter's).
 */
export function bookPlan(lang: string, code: string): Promise<BookPlan | null> {
  const key = `${lang}:${code}`
  if (!plans.has(key))
    plans.set(key, (async () => {
      const r = await openLang(lang)
      if (!r.installed(`book:${code}`)) return null
      // decoded here and dropped after: r.book() would keep the whole book in the reader (Psalms, Genesis, Isaiah and
      // Jeremiah are over 100 MB decoded); only the small plan is kept
      const seg = (await r.segments(`book:${code}`))?.[0]
      if (!seg) return null
      const model = bookView(seg)
      const byCh = new Map<number, Set<number>>()
      for (const t of model.texts) {
        let ch = 0
        for (const [, kind, arg] of t.events) {
          if (kind === 'chapter') {
            ch = parseInt(arg, 10) || 0
            if (ch && !byCh.has(ch)) byCh.set(ch, new Set())
          } else if (kind === 'verse' && ch) {
            const [a, b] = arg.split('-').map((x) => parseInt(x, 10))
            if (!a) continue
            for (let v = a; v <= (b && b >= a && b - a < 200 ? b : a); v++) byCh.get(ch)!.add(v)
          }
        }
      }
      const intros = (model.notes?.rows ?? []).filter((x) => x.cols.isIntro === true || x.cols.isIntro === 'true')
      const chIntro = new Set(intros.slice(1).filter((x) => x.from % 1000 === 1).map((x) => Math.floor(x.from / 1000) % 1000))
      const chapters = [...byCh.entries()].filter(([, vs]) => vs.size).sort((a, b) => a[0] - b[0])
        .map(([ch, vs]) => ({ ch, verses: [...vs].sort((a, b) => a - b), intro: chIntro.has(ch) }))
      return chapters.length ? { intro: intros.length > 0, chapters } : null
    })().catch(() => null).then((p) => {
      // a book that did not read is tried again next time
      if (p) planned.add(key)
      else plans.delete(key)
      return p
    }))
  return plans.get(key)!
}

export const MANUALS = ['intro', 'process', 'translate', 'checking'] as const
export type Manual = (typeof MANUALS)[number]
/** The Translation Academy manuals the packs have, each from the first pack in `packs` that has it installed. */
export async function academyManuals(packs: string[]): Promise<{ m: Manual; lang: string }[]> {
  const readers = await Promise.all(packs.map((l) => openLang(l).then((r) => ({ l, r })).catch(() => null)))
  const out: { m: Manual; lang: string }[] = []
  for (const m of MANUALS) {
    const hit = readers.find((x) => x?.r.installed(`art:ta:${m}`))
    if (hit) out.push({ m, lang: hit.l })
  }
  return out
}

export type ArticleEntry = { id: string; title: string; sub: string }
/** The articles of a manual, by title in the pack's language: the names and questions the pack's maps give them (no article read). */
export async function manualArticles(lang: string, m: Manual): Promise<ArticleEntry[]> {
  const r = await openLang(lang)
  if (!r.installed(`art:ta:${m}`)) return []
  const core = ((await r.maps()) as any).map?.core ?? {}
  const names = (core.names ?? {}) as Record<string, string[]>
  const subs = (core.subtitles ?? {}) as Record<string, string>
  const pre = `ta:${m}/`
  const base = lang.split('-')[0]!
  return Object.keys(names).filter((id) => id.startsWith(pre) && names[id]?.length)
    .map((id) => ({ id, title: String(names[id]![0]).trim(), sub: String(subs[id] ?? '').trim() }))
    .sort((a, b) => a.title.localeCompare(b.title, base, { sensitivity: 'base', numeric: true }))
}

export type ArticleGroup = { title: string; items: ArticleEntry[] }
type SectionMap = { sections: Record<string, string>[]; other: Record<string, string>; ids: Record<string, [number, number]>; prefixes?: Record<string, number> }
/**
 * A manual's articles in the sections of the English Translation Academy's table of contents (data/ta-sections.json, the same
 * ids in every language), in its order; articles it does not list go last, by title. A manual with no such map: one group
 * with no title.
 */
export async function manualSections(lang: string, m: Manual, ui: string): Promise<ArticleGroup[]> {
  const list = await manualArticles(lang, m)
  const map = (taSections as unknown as Record<string, SectionMap>)[m]
  if (!map || !list.length) return list.length ? [{ title: '', items: list }] : []
  const name = (t: Record<string, string>) => t[ui] ?? t.en!
  const groups: ArticleGroup[] = map.sections.map((t) => ({ title: name(t), items: [] }))
  const other: ArticleGroup = { title: name(map.other), items: [] }
  const at = (a: ArticleEntry): [number, number] | undefined => {
    const key = a.id.slice(`ta:${m}/`.length)
    if (map.ids[key]) return map.ids[key]
    // an article newer than the map: by the start of its id (writing-, grammar-), after the ones the map orders
    const pre = Object.entries(map.prefixes ?? {}).find(([p]) => key.startsWith(p))
    return pre ? [pre[1], 9999] : undefined
  }
  for (const a of list) (at(a) ? groups[at(a)![0]]! : other).items.push(a)
  for (const g of groups) g.items.sort((a, b) => at(a)![1] - at(b)![1] || a.title.localeCompare(b.title))
  return [...groups, other].filter((g) => g.items.length)
}

/** Tests and a change of packs: forget what was read. */
export function resetExplore() {
  plans.clear()
  planned.clear()
  stack.length = 0
  target = false
  resetPeopleTab()
  resetLugaresTab()
  peopleShown = false
  placesShown = false
  placesGen++
  pendingTabs = false
  placesKey = ''
  placesNow = []
}

// ---------------------------------------------------------------------------------------------------------------- strings

type S = {
  browse: string; browseLong: string; bible: string; academy: string; ot: string; nt: string; chapters: string; verses: string
  bookIntro: string; chapter: string; chIntro: string; loading: string; none: string; addLang: string; back: string; close: string
  manuals: Record<Manual, [name: string, about: string]>; inLang: string
  busy: string; failed: string; inPack: string; inOther: string
  /** the people tab's name, and its provisional text (X1 step 4 draws the list) */
  people: string; pEmpty: string; pTreeFail: string
  /** the people tab: the search box, nobody found, more than the rows shown */
  pSearch: string; pNone: string; pMore: string; pFail: string
  /** the places tab alone ("Places"), and with the people ("People and places": its subtabs are `people` and `places`) */
  places: string; peoplePlaces: string
  /** the places tab: the search box, no place found, more than the rows shown, all books, the book filter's label, the places could not be read, the map's text ({n} places) */
  lSearch: string; lNone: string; lMore: string; lAll: string; lBook: string; lFail: string; lMap: string
  /** the place view: the card could not be read; the data is sure of where the place is */
  lCardFail: string; lSure: string
  /** said to the screen reader after a search or a filter ({n} places) */
  lCount: string
}
const STR: Record<string, S> = {
  en: {
    browse: 'Browse', browseLong: 'Browse the Bible and Translation Academy', bible: 'Bible', academy: 'Translation Academy',
    ot: 'Old Testament', nt: 'New Testament', chapters: 'Chapters', verses: 'Verses', bookIntro: 'Introduction to the book',
    chapter: 'Whole chapter {ch}', chIntro: 'Introduction to chapter {ch}', loading: 'Opening…', none: 'There is no language on this phone yet.',
    addLang: 'Add a language', back: 'Back', close: 'Close', inLang: 'in {lang}',
    busy: 'An answer is on its way: tap again when it is here.', failed: 'This book could not be read on this phone.',
    inPack: 'In {lang}', inOther: 'In {lang} (no {first} helps for these books yet)',
    people: 'People', pEmpty: 'The data has no family for this person.', pTreeFail: 'The family tree could not be read on this phone.',
    pSearch: 'Search a name', pNone: 'Nobody with that name.', pMore: 'Keep typing to narrow it down.', pFail: 'The people could not be read on this phone.',
    places: 'Places', peoplePlaces: 'People and places', lSearch: 'Search a place', lNone: 'No place with that name.', lMore: 'Keep typing to narrow it down.',
    lAll: 'All books', lBook: 'Book', lFail: 'The places could not be read on this phone.', lMap: 'Map of places ({n})',
    lCardFail: 'This place could not be read on this phone.', lSure: 'Known location', lCount: 'Places found: {n}',
    manuals: {
      intro: ['Introduction', 'What Translation Academy is and how to use it'],
      process: ['Process', 'How a translation project goes, step by step'],
      translate: ['Translate', 'Meaning, figures of speech, names, grammar…'],
      checking: ['Checking', 'How to check a translation'],
    },
  },
  es: {
    browse: 'Explorar', browseLong: 'Explora la Biblia y Translation Academy', bible: 'Biblia', academy: 'Translation Academy',
    ot: 'Antiguo Testamento', nt: 'Nuevo Testamento', chapters: 'Capítulos', verses: 'Versículos', bookIntro: 'Introducción al libro',
    chapter: 'Todo el capítulo {ch}', chIntro: 'Introducción al capítulo {ch}', loading: 'Abriendo…', none: 'Todavía no hay ningún idioma en este teléfono.',
    addLang: 'Agregar un idioma', back: 'Atrás', close: 'Cerrar', inLang: 'en {lang}',
    busy: 'Ya viene una respuesta: toca de nuevo cuando llegue.', failed: 'Este libro no se pudo leer en este teléfono.',
    inPack: 'En {lang}', inOther: 'En {lang} (todavía no hay ayudas en {first} para estos libros)',
    people: 'Personas', pEmpty: 'Los datos no tienen familia de esta persona.', pTreeFail: 'No se pudo leer el árbol de familia en este teléfono.',
    pSearch: 'Buscar un nombre', pNone: 'Nadie con ese nombre.', pMore: 'Sigue escribiendo para afinar.', pFail: 'No se pudo leer a las personas en este teléfono.',
    places: 'Lugares', peoplePlaces: 'Personas y lugares', lSearch: 'Buscar un lugar', lNone: 'Ningún lugar con ese nombre.', lMore: 'Sigue escribiendo para afinar.',
    lAll: 'Todos los libros', lBook: 'Libro', lFail: 'No se pudieron leer los lugares en este teléfono.', lMap: 'Mapa de lugares ({n})',
    lCardFail: 'No se pudo leer este lugar en este teléfono.', lSure: 'Ubicación conocida', lCount: 'Lugares encontrados: {n}',
    manuals: {
      intro: ['Introducción', 'Qué es Translation Academy y cómo usarla'],
      process: ['Proceso', 'Cómo avanza un proyecto de traducción, paso a paso'],
      translate: ['Traducir', 'Significado, figuras retóricas, nombres, gramática…'],
      checking: ['Revisión', 'Cómo revisar una traducción'],
    },
  },
  fr: {
    browse: 'Parcourir', browseLong: 'Parcourir la Bible et Translation Academy', bible: 'Bible', academy: 'Translation Academy',
    ot: 'Ancien Testament', nt: 'Nouveau Testament', chapters: 'Chapitres', verses: 'Versets', bookIntro: 'Introduction au livre',
    chapter: 'Tout le chapitre {ch}', chIntro: 'Introduction au chapitre {ch}', loading: 'Ouverture…', none: "Il n'y a encore aucune langue sur ce téléphone.",
    addLang: 'Ajouter une langue', back: 'Retour', close: 'Fermer', inLang: 'en {lang}',
    busy: 'Une réponse arrive : touchez à nouveau quand elle sera là.', failed: "Ce livre n'a pas pu être lu sur ce téléphone.",
    inPack: 'En {lang}', inOther: "En {lang} (pas encore d'aides en {first} pour ces livres)",
    people: 'Personnes', pEmpty: "Les données n'ont pas de famille pour cette personne.", pTreeFail: "L'arbre généalogique n'a pas pu être lu sur ce téléphone.",
    pSearch: 'Chercher un nom', pNone: 'Personne ne porte ce nom.', pMore: 'Continuez à écrire pour affiner.', pFail: "Les personnes n'ont pas pu être lues sur ce téléphone.",
    places: 'Lieux', peoplePlaces: 'Personnes et lieux', lSearch: 'Chercher un lieu', lNone: 'Aucun lieu ne porte ce nom.', lMore: 'Continuez à écrire pour affiner.',
    lAll: 'Tous les livres', lBook: 'Livre', lFail: "Les lieux n'ont pas pu être lus sur ce téléphone.", lMap: 'Carte des lieux ({n})',
    lCardFail: "Ce lieu n'a pas pu être lu sur ce téléphone.", lSure: 'Emplacement connu', lCount: 'Lieux trouvés : {n}',
    manuals: {
      intro: ['Introduction', "Ce qu'est Translation Academy et comment l'utiliser"],
      process: ['Processus', "Comment se déroule un projet de traduction, étape par étape"],
      translate: ['Traduire', 'Sens, figures de style, noms, grammaire…'],
      checking: ['Vérification', 'Comment vérifier une traduction'],
    },
  },
  id: {
    browse: 'Jelajahi', browseLong: 'Jelajahi Alkitab dan Translation Academy', bible: 'Alkitab', academy: 'Translation Academy',
    ot: 'Perjanjian Lama', nt: 'Perjanjian Baru', chapters: 'Pasal', verses: 'Ayat', bookIntro: 'Pengantar kitab',
    chapter: 'Seluruh pasal {ch}', chIntro: 'Pengantar pasal {ch}', loading: 'Membuka…', none: 'Belum ada bahasa di ponsel ini.',
    addLang: 'Tambah bahasa', back: 'Kembali', close: 'Tutup', inLang: 'dalam {lang}',
    busy: 'Jawaban sedang datang: ketuk lagi setelah jawaban muncul.', failed: 'Kitab ini tidak dapat dibaca di ponsel ini.',
    inPack: 'Dalam {lang}', inOther: 'Dalam {lang} (belum ada bahan bantu {first} untuk kitab-kitab ini)',
    people: 'Orang', pEmpty: 'Data tidak memiliki keluarga untuk orang ini.', pTreeFail: 'Pohon keluarga tidak dapat dibaca di ponsel ini.',
    pSearch: 'Cari nama', pNone: 'Tidak ada yang bernama itu.', pMore: 'Teruslah mengetik untuk mempersempit.', pFail: 'Daftar orang tidak dapat dibaca di ponsel ini.',
    places: 'Tempat', peoplePlaces: 'Orang dan tempat', lSearch: 'Cari tempat', lNone: 'Tidak ada tempat dengan nama itu.', lMore: 'Teruslah mengetik untuk mempersempit.',
    lAll: 'Semua kitab', lBook: 'Kitab', lFail: 'Daftar tempat tidak dapat dibaca di ponsel ini.', lMap: 'Peta tempat ({n})',
    lCardFail: 'Tempat ini tidak dapat dibaca di ponsel ini.', lSure: 'Lokasi diketahui', lCount: 'Tempat ditemukan: {n}',
    manuals: {
      intro: ['Pengantar', 'Apa itu Translation Academy dan cara memakainya'],
      process: ['Proses', 'Jalannya proyek penerjemahan, langkah demi langkah'],
      translate: ['Menerjemahkan', 'Makna, majas, nama, tata bahasa…'],
      checking: ['Pemeriksaan', 'Cara memeriksa terjemahan'],
    },
  },
  hi: {
    browse: 'ब्राउज़ करें', browseLong: 'बाइबल और Translation Academy ब्राउज़ करें', bible: 'बाइबल', academy: 'Translation Academy',
    ot: 'पुराना नियम', nt: 'नया नियम', chapters: 'अध्याय', verses: 'पद', bookIntro: 'पुस्तक का परिचय',
    chapter: 'पूरा अध्याय {ch}', chIntro: 'अध्याय {ch} का परिचय', loading: 'खुल रहा है…', none: 'इस फ़ोन पर अभी कोई भाषा नहीं है।',
    addLang: 'भाषा जोड़ें', back: 'वापस', close: 'बंद करें', inLang: '{lang} में',
    busy: 'एक उत्तर आ रहा है: उसके आने पर फिर से टैप करें।', failed: 'यह पुस्तक इस फ़ोन पर पढ़ी नहीं जा सकी।',
    inPack: '{lang} में', inOther: '{lang} में (इन पुस्तकों के लिए अभी {first} सहायता नहीं है)',
    people: 'लोग', pEmpty: 'इस व्यक्ति के लिए डेटा में परिवार नहीं है।', pTreeFail: 'इस फ़ोन पर वंश-वृक्ष पढ़ा नहीं जा सका।', // pending native review
    pSearch: 'नाम खोजें', pNone: 'इस नाम का कोई व्यक्ति नहीं मिला।', pMore: 'सीमित करने के लिए लिखते रहें।', pFail: 'इस फ़ोन पर लोगों की सूची पढ़ी नहीं जा सकी।', // pending native review
    places: 'स्थान', peoplePlaces: 'लोग और स्थान', lSearch: 'स्थान खोजें', lNone: 'इस नाम का कोई स्थान नहीं मिला।', lMore: 'सीमित करने के लिए लिखते रहें।', // pending native review
    lAll: 'सभी पुस्तकें', lBook: 'पुस्तक', lFail: 'इस फ़ोन पर स्थानों की सूची पढ़ी नहीं जा सकी।', lMap: 'स्थानों का नक्शा ({n})', // pending native review
    lCardFail: 'इस फ़ोन पर यह स्थान पढ़ा नहीं जा सका।', lSure: 'ठिकाना ज्ञात', lCount: 'मिले स्थान: {n}', // pending native review
    manuals: {
      intro: ['परिचय', 'Translation Academy क्या है और इसका उपयोग कैसे करें'],
      process: ['प्रक्रिया', 'अनुवाद परियोजना कैसे चलती है, कदम दर कदम'],
      translate: ['अनुवाद करना', 'अर्थ, अलंकार, नाम, व्याकरण…'],
      checking: ['जाँच', 'अनुवाद की जाँच कैसे करें'],
    },
  },
  ar: {
    browse: 'تصفّح', browseLong: 'تصفّح الكتاب المقدس وTranslation Academy', bible: 'الكتاب المقدس', academy: 'Translation Academy',
    ot: 'العهد القديم', nt: 'العهد الجديد', chapters: 'الأصحاحات', verses: 'الآيات', bookIntro: 'مقدمة السفر',
    chapter: 'الأصحاح {ch} كاملًا', chIntro: 'مقدمة الأصحاح {ch}', loading: 'جارٍ الفتح…', none: 'لا توجد أي لغة على هذا الهاتف بعد.',
    addLang: 'إضافة لغة', back: 'رجوع', close: 'إغلاق', inLang: 'بـ{lang}',
    busy: 'هناك إجابة في الطريق: انقر مجددًا عندما تصل.', failed: 'تعذّرت قراءة هذا السفر على هذا الهاتف.',
    inPack: 'بـ{lang}', inOther: 'بـ{lang} (لا توجد بعد مساعدات بـ{first} لهذه الأسفار)',
    people: 'أشخاص', pEmpty: 'لا تتضمن البيانات عائلة لهذا الشخص.', pTreeFail: 'تعذّرت قراءة شجرة العائلة على هذا الهاتف.', // pending native review
    pSearch: 'ابحث عن اسم', pNone: 'لا أحد بهذا الاسم.', pMore: 'تابع الكتابة لتضييق النتائج.', pFail: 'تعذّرت قراءة قائمة الأشخاص على هذا الهاتف.', // pending native review
    places: 'أماكن', peoplePlaces: 'أشخاص وأماكن', lSearch: 'ابحث عن مكان', lNone: 'لا مكان بهذا الاسم.', lMore: 'تابع الكتابة لتضييق النتائج.', // pending native review
    lAll: 'كل الأسفار', lBook: 'السفر', lFail: 'تعذّرت قراءة قائمة الأماكن على هذا الهاتف.', lMap: 'خريطة الأماكن ({n})', // pending native review
    lCardFail: 'تعذّرت قراءة هذا المكان على هذا الهاتف.', lSure: 'موقع معروف', lCount: 'عدد الأماكن: {n}', // pending native review
    manuals: {
      intro: ['مقدمة', 'ما هي Translation Academy وكيف تستخدمها'],
      process: ['العملية', 'كيف يسير مشروع الترجمة خطوة بخطوة'],
      translate: ['الترجمة', 'المعنى، الصور البلاغية، الأسماء، القواعد…'],
      checking: ['التدقيق', 'كيف تدقّق الترجمة'],
    },
  },
}
export const XT = (ui: string): S => STR[ui] ?? STR.en!

// ------------------------------------------------------------------------------------------------------------------- view

export type Ask = { lang: string; intent: 'passage' | 'article'; ref?: string; what?: string[]; concept?: string }
export type ExploreHooks = {
  /** the app's language */
  ui: () => string
  /** the installed packs, the one to read first at the start (the helps language, else the app's) */
  packs: () => string[]
  /** the name of a pack's language */
  packName: (lang: string) => string
  /** ask the chat for this (no typing, no model); false when it cannot now (an answer is on its way, the app is locked) */
  ask: (label: string, q: Ask) => boolean
  /** run a sheet in the current conversation as a tap would (`runSheet`); false when it cannot now (an answer is on its way, the app is locked) and Browse stays open */
  run: (label: string, sheet: Sheet) => boolean
  /** no language on the phone: to where one is added */
  addLang: () => void
  /** the Saved view (savedview.ts), over Browse */
  saved?: () => void
  /** a guided mode that is a screen of the welcome (the books, the two questions; welcome.ts `at`); false when it cannot now (an answer is on its way, the app is locked), true once it has closed Browse and opened it */
  mode: (id: 'book' | 'learn') => boolean
  /** the 5M session of a story starts as if "5M OBS n" were typed (`fiveText`); false when it cannot now. It does not close Browse */
  ask5: (story: number) => boolean
  /** the 5M sessions saved (the ones used last), and [Resume] one (the same as the welcome's); false when it cannot now */
  saved5: () => Saved5[]
  /** 'loading': the story's tables are not read yet (Browse says "Opening…" and tries again); false: it cannot now (an answer is on its way, the app is locked) */
  /** 'failed': it did not start for another reason (no room for a new conversation); nothing is said then */
  resume5: (e: Saved5) => boolean | 'loading' | 'failed'
}
let hooks: ExploreHooks | null = null
export function setExploreHooks(h: ExploreHooks) {
  hooks = h
}

type View =
  /** `sub`: the subtab of the people tab (with people and places both there is "People and places" with its two subtabs; with one of them there are none) */
  | { k: 'home'; tab: 'bible' | 'academy' | 'people'; sub?: 'people' | 'places'; scroll?: number }
  /** a person's tree, inside Browse (explorepeople.ts) */
  /** `name`: the name the row showed (a person whose own name is raw is shown by an alias: the title until the tree says it) */
  | { k: 'person'; pack: string; id: string; mode: TreeMode; name?: string }
  /** a place's card, inside Browse (explorelugares.ts); `name`: the name the row (or the map point) showed */
  | { k: 'place'; pack: string; id: string; name?: string }
  | { k: 'book'; code: string; lang: string }
  | { k: 'chapter'; code: string; lang: string; ch: number }
  | { k: 'manual'; m: Manual; lang: string }
  /** `only`: just these stories (the typing row's "All (n)"), under `title` */
  | { k: 'obs'; lang: string; only?: number[]; title?: string }
  | { k: 'obs5m' }
  | { k: 'modes' }
// kept while the app is open: Browse opens again where the person left it (the next verse is one tap away)
const stack: View[] = []
let target = false // the views on the stack were set by openExploreAt for the modes list or the 5M view: closing from them forgets them
let box: { root: HTMLElement; title: HTMLElement; body: HTMLElement; back: HTMLButtonElement; close: HTMLButtonElement } | null = null
let reached = false // whether this opening of the app has reached a help through Browse (counted once)
let opener: HTMLElement | null = null // where the focus goes back to
let picking = false // a chapter's verses saved with a tap (☆ Save verses) instead of opened

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
function button(cls: string, text: string, on: () => void): HTMLButtonElement {
  const b = el('button', cls, text)
  b.type = 'button'
  b.onclick = on
  return b
}
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))
/** A chevron drawn, not a character: "‹" and "›" mirror themselves in right-to-left text, the CSS turns the drawing instead. */
function chevron(cls: string, back = false): HTMLElement {
  const s = el('span', cls)
  s.setAttribute('aria-hidden', 'true')
  s.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${back ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`
  return s
}

/** The mark before a mode's name, drawn (not "▶": a character does not turn in right-to-left text, the drawing is turned by the CSS). */
function playMark(): HTMLElement {
  const s = el('span', 'ex-mode-m')
  s.setAttribute('aria-hidden', 'true')
  s.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>'
  return s
}

function ensure() {
  if (box) return box
  const root = el('div')
  root.id = 'explore'
  root.tabIndex = -1
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  const head = el('div', 'ex-head')
  const back = button('ex-btn ex-back', '', () => {
    stack.pop()
    draw()
  })
  back.appendChild(chevron('', true))
  const title = el('h2', 'ex-title')
  title.id = 'ex-title'
  root.setAttribute('aria-labelledby', 'ex-title')
  const close = button('ex-btn', '✕', () => closeExplore())
  head.append(back, title, close)
  const body = el('div', 'ex-body')
  root.append(head, body)
  document.body.appendChild(root)
  // Escape closes, wherever the focus is (a redraw drops the focused button)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && exploreOpen()) {
      e.preventDefault()
      closeExplore()
    }
  })
  // the PIN lock (menu > Safety) covers Browse: Browse closes under it, so nothing is asked behind the lock
  new MutationObserver(() => { if (exploreOpen() && document.querySelector('#lock')) closeExplore(false) }).observe(document.body, { childList: true })
  box = { root, title, body, back, close }
  return box
}

/** Opens Browse (where it was left, else its first view). `from`: the entry point, for the usage counts. */
export function openExplore(from: 'bar' | 'menu' | 'welcome' | 'answer'): boolean {
  if (!hooks || document.querySelector('#lock')) return false
  count('explore.open')
  count(`explore.from.${from}`)
  const b = ensure()
  opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
  if (!stack.length) stack.push({ k: 'home', tab: 'bible' })
  prunePeople() // closeExplore keeps the stack: a pack may have gone since
  peopleShown = false // (a new opening counts the tab again; Back from a person does not)
  placesShown = false
  warmFamily()
  b.root.classList.add('open')
  b.root.focus({ preventScroll: true })
  draw()
  return true
}
/** Opens Browse at a book or a Translation Academy manual (a next step under an answer), its first view behind it. */
export function openExploreAt(at: { book?: string; manual?: string; lang?: string; obs?: boolean; only?: number[]; title?: string; mode?: ModeId | 'list'; from?: 'welcome' }) {
  target = at.mode === 'list' || at.mode === 'obs5m'
  if (at.mode === 'list') {
    // the guided modes alone (the empty conversation's [Start a mode]), Browse's home behind it
    const home = stack.find((x): x is Extract<View, { k: 'home' }> => x.k === 'home')
    stack.length = 0
    stack.push({ k: 'home', tab: home?.tab ?? 'bible' }, { k: 'modes' })
  } else if (at.mode === 'obs5m') {
    // a guided mode's own view, Browse's home behind it (Back goes there)
    stack.length = 0
    stack.push({ k: 'home', tab: 'bible' }, { k: 'obs5m' })
  } else if (at.lang && at.obs) {
    stack.length = 0
    stack.push({ k: 'home', tab: 'bible' }, { k: 'obs', lang: at.lang, ...(at.only?.length ? { only: at.only, title: at.title } : {}) })
  } else if (at.lang && (at.book || (MANUALS as readonly string[]).includes(at.manual ?? ''))) {
    stack.length = 0
    stack.push({ k: 'home', tab: at.book ? 'bible' : 'academy' })
    stack.push(at.book ? { k: 'book', code: at.book, lang: at.lang } : { k: 'manual', m: at.manual as Manual, lang: at.lang })
  }
  // the mode is counted once, when Browse really opened (not under the PIN lock)
  const opened = openExplore(at.from ?? 'answer')
  if (opened && at.mode === 'obs5m') count(modeCount('obs5m'))
  // refused (the PIN lock): a modes or 5M target is not left on the stack for the next plain opening
  if (!opened && target) {
    stack.length = 0
    target = false
  }
}
/** Closes Browse; the focus goes back to what opened it (not under the lock: `refocus` false). */
export function closeExplore(refocus = true) {
  if (!box?.root.classList.contains('open')) return
  // opened as a target (the modes list, the 5M view) and closed from it: the next plain opening is Browse's home, not that view
  const top = stack[stack.length - 1]
  if (target && (top?.k === 'modes' || top?.k === 'obs5m')) stack.length = 0
  target = false
  box.root.classList.remove('open')
  drawing++ // a drawing still waiting for its reads does not paint, mount or time anything on a closed Browse
  pendingTabs = false // (opening draws the home again with what is known)
  // nothing of the people or places tab or of a card's small map stays alive behind a closed Browse (its maps, its debounce, its resize); opening draws again
  stopPeopleTab()
  stopLugaresTab()
  box.body.replaceChildren()
  sweepMaps()
  const to = opener
  opener = null
  if (refocus && to?.isConnected) to.focus({ preventScroll: true })
}
/** Browse is open with nothing on its stack (a change of packs emptied it, resetExplore): the screen is the old one until it is drawn again. */
export const exploreStale = (): boolean => exploreOpen() && !stack.length
/** 5M came or went: Browse's home, its list of modes and the 5M view on screen are drawn again (the 5M view pops itself when the stories are gone); a person's view is not (only its pack going takes it off the stack). */
export function redrawExplore(): void {
  if (!exploreOpen()) return
  if (!stack.length) stack.push({ k: 'home', tab: 'bible' }) // a change of packs empties it (resetExplore)
  warmFamily()
  const was = stack[stack.length - 1]
  prunePeople()
  const v = stack[stack.length - 1]
  // (a person's or a place's view is drawn again only when what was on top of it went: its pack was removed)
  if (v && (v.k === 'home' || v.k === 'modes' || v.k === 'obs5m' || ((v.k === 'person' || v.k === 'place') && v !== was))) void draw()
}
let peopleShown = false // the people tab is on screen (counted once when it opens, not at each redraw)
let placesShown = false // the places subtab (or tab) is on screen (counted once when it opens)
let drawnPlaces = '' // the packs with places the home was last drawn with (placePacks; read at each drawing of the home, kept per set of packs by places.ts)
let drawnPeople = '' // the packs with people the home was last drawn with
let drawnTab = '' // the tab it shows
let drawnSub = '' // and, on the people tab, its subtab
// The first pack with places (placePacks reads one pack at a time and stops at the first that has any), found in the background: the home is drawn
// with what is known (nothing, for packs not read yet) and drawn again when the answer changes what the tab shows. Kept for the list of packs it
// was read for; a new reading starts at each opening and at each change of packs, and the old answer is shown meanwhile.
/**
 * A box or a select of the home has the focus, or its places tab has a search going. A background answer that only adds or renames a tab (the
 * places read, the people indexed) does not draw the home again then (that would empty the box, take its focus away and drop the map): it is
 * left in `pendingTabs` and the next drawing of the home, which reads what is known, shows it. (A page that is only scrolled is drawn again.)
 */
function homeBlocked(): boolean {
  const body = box?.body
  if (!body) return false
  if (drawnTab === 'people' && drawnSub === 'places' && lugaresBusy()) return true
  const a = document.activeElement as HTMLElement | null
  return !!a && body.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT')
}
let pendingTabs = false // a change of tabs was held back by homeBlocked: the next drawing has it (no timer, nothing to retry on its own)
/** The home drawn again by a background answer: the page keeps the place it was scrolled to (the bar of tabs that joins it adds height above). */
function redrawHome() {
  const body = box?.body
  const top = body?.scrollTop ?? 0
  const p = draw()
  const mine = drawing // (draw counts itself before its first wait)
  void p.then(() => { if (top > 0 && body && exploreOpen() && drawing === mine && stack[stack.length - 1]?.k === 'home') body.scrollTop = top })
}
/** A background answer changed what the tabs show: drawn again now, or held until the next drawing when the home is being used. */
function tabsChanged() {
  if (homeBlocked()) pendingTabs = true
  else redrawHome()
}
let placesKey = ''
let placesNow: string[] = []
let placesGen = 0
/** The packs with places for this list of packs: the answer when it has come, else (a change of packs, being read) the last one for the packs still there. */
const placesOf = (packs: string[]): string[] => (placesKey === packs.join() ? placesNow : placesNow.filter((p) => packs.includes(p)))
/** The reading of the places for this list of packs has come (a tab or subtab chosen is not moved away while it is pending). */
const placesKnown = (packs: string[]): boolean => placesKey === packs.join()
function warmPlaces() {
  const packs = hooks?.packs() ?? []
  if (!packs.length) return
  const key = packs.join()
  const mine = ++placesGen
  const run = async () => {
    let found: string[] = []
    for (const p of packs) {
      found = await placePacks([p]).catch(() => [] as string[])
      if (found.length) break
    }
    if (mine !== placesGen) return
    placesKey = key
    placesNow = found
    if (!exploreOpen() || stack[stack.length - 1]?.k !== 'home' || found.join() === drawnPlaces) return
    tabsChanged() // (drawnPlaces is the home's own: it changes only when the home is drawn)
  }
  const idle = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback
  if (typeof idle === 'function') idle(() => void run(), { timeout: 1500 })
  else setTimeout(() => void run(), 0)
}
/**
 * An index of people was built (kin.ts onKinReady). Nothing on screen changes unless the packs with people are not the ones the home
 * was drawn with (a null index, or one built under another view, draws nothing: no scroll lost). Then: on the people tab, the packs
 * are added to the list in place (the box, its text and its focus stay); on Bible or Academy, the home is drawn again only when the
 * people tab appears or goes (some packs with people, or none).
 */
export function kinReadyExplore(): void {
  if (!exploreOpen() || !hooks) return
  const v = stack[stack.length - 1]
  if (v?.k !== 'home') return
  const now = peoplePacks(hooks.packs())
  if (now.join() === drawnPeople) return
  const toggled = !drawnPeople !== !now.length
  // (drawnPeople is the home's own: a drawing sets it; held back, it stays as it was so the next answer finds the change still to show)
  if (toggled) return tabsChanged()
  drawnPeople = now.join()
  if (drawnTab === 'people') updatePeoplePacks(now)
}
/** The people index of the packs on the phone, at idle (kin.ts; built ones are kept, so repeating it costs nothing): the people tab shows when one is built (onKinReady → kinReadyExplore). */
function warmFamily() {
  const p = hooks?.packs() ?? []
  if (p.length) warmKin(p)
  warmPlaces()
}
/** The views of a person or a place whose pack is no longer on the phone leave the stack (as the 5M view does); the home stays. True when something left. */
function prunePeople(): boolean {
  const have = hooks?.packs() ?? []
  const keep = stack.filter((x) => (x.k !== 'person' && x.k !== 'place') || have.includes(x.pack))
  if (keep.length === stack.length) return false
  stack.length = 0
  stack.push(...keep)
  if (!stack.length) stack.push({ k: 'home', tab: 'bible' })
  return true
}
export const exploreOpen = () => !!box?.root.classList.contains('open')
/** Android's back: one step back in Browse, or closes it. False when it is not open. */
export function backExplore(): boolean {
  if (!exploreOpen()) return false
  if (stack.length > 1) {
    stack.pop()
    draw()
  } else closeExplore()
  return true
}

/** An answer is still coming: said where the person is looking, instead of a tap that does nothing. */
function busyNote() {
  const b = ensure()
  b.body.querySelector('.ex-busy')?.remove()
  const note = el('p', 'ex-note ex-busy', XT(hooks?.ui() ?? 'en').busy)
  note.setAttribute('role', 'status')
  b.body.prepend(note)
  b.body.scrollTop = 0
}
/** A help reached through Browse (counted once per opening of the app as a session). */
function reachedHelp() {
  count('explore.answer')
  if (!reached) {
    reached = true
    count('explore.session')
  }
}
/** Opens a person's view on top of Browse (the people tab's rows call it, X1 step 4); the stack keeps it, Back takes it off. */
export function openPerson(pack: string, id: string, mode: TreeMode = 'tree', name?: string) {
  count('explore.people.person')
  stack.push({ k: 'person', pack, id, mode, ...(name ? { name } : {}) })
  void draw()
}
/** Tests: the maps of the places tab and of a place's card are drawn by this (the page's own drawing when none). */
let mapMount: Parameters<typeof renderLugaresTab>[1]['mount']
export function setExploreMapMount(f?: typeof mapMount) {
  mapMount = f
}
/** Opens a place's card on top of Browse (a row or a point of the places tab); the stack keeps it, Back takes it off. */
export function openPlace(pack: string, id: string, name?: string) {
  count('explore.places.place')
  const top = stack[stack.length - 1]
  if (top?.k === 'home') top.scroll = ensure().body.scrollTop // Back finds the list where it was
  stack.push({ k: 'place', pack, id, ...(name ? { name } : {}) })
  void draw()
}
/** A sheet run in the current conversation (the person and place views' buttons that leave Browse): as `ask`, the hook says when it cannot now. `from`: whose view counts it. */
export function runInChat(label: string, sheet: Sheet, from: 'people' | 'places' = 'people') {
  if (!hooks?.run(label, sheet)) return busyNote()
  count(`explore.${from}.toChat`)
  reachedHelp()
  closeExplore()
}
function ask(label: string, q: Ask) {
  if (!hooks?.ask(label, q)) return busyNote()
  reachedHelp()
  closeExplore()
}
/** A guided mode that is a screen of the welcome: the hook closes Browse and opens it; refused, the busy note and nothing else. */
/** The guided modes as rows (Browse's home, and the modes view); a tap opens the mode. */
function modeRows(ui: string, modes: ModeId[], five: Five): HTMLElement {
  const rows = el('div', 'ex-rows ex-modes')
  rows.dir = rtlLang(ui) ? 'rtl' : 'ltr'
  for (const id of modes) {
    const row = button('ex-row', '', () => {
      if (id !== 'obs5m') return openMode(id)
      stack.push({ k: 'obs5m' })
      count(modeCount('obs5m'))
      draw()
    })
    row.dataset.mode = id
    const t = el('span', 'ex-row-t')
    t.append(playMark(), document.createTextNode(bidiLabel(modeTitle(ui, id), ui)))
    row.append(t, el('span', 'ex-row-s', bidiLabel(modeSub(ui, id), ui)), chevron('ex-row-c'))
    rows.appendChild(row)
  }
  return rows
}
/** The guided modes this phone can run (modes.ts), read the way Browse's home reads them; [] with no pack. */
export async function modesOn(packs: string[]): Promise<ModeId[]> {
  if (!packs.length) return []
  const [books, manuals, five] = await Promise.all([bibleBooks(packs), academyManuals(packs), fiveStories(packs).catch(noFive)])
  return modesFor(dataOf(books.length, manuals.length, five))
}

function openMode(id: 'book' | 'learn') {
  if (!hooks?.mode(id)) return busyNote()
  count(modeCount(id))
  closeExplore(false)
}
/** A story's 5M session: asked as if typed. */
function openFive(story: number) {
  // (not counted again: the mode was counted when its view opened; and not a help reached, it is a session)
  if (!hooks?.ask5(story)) return busyNote()
  closeExplore(false)
}
/** [Resume] a saved session; its tables not read yet: "Opening…", then again. */
let resuming = false
async function resumeFive(e: Saved5) {
  if (resuming) return // one try at a time (a second tap while "Opening…")
  resuming = true
  try {
    await resumeFiveNow(e)
  } finally {
    resuming = false
  }
}
async function resumeFiveNow(e: Saved5) {
  let r: boolean | 'loading' | 'failed' | undefined = hooks?.resume5(e)
  for (let i = 0; r === 'loading' && i < 20; i++) {
    const b = ensure()
    if (!b.body.querySelector('.ex-opening')) b.body.prepend(el('p', 'ex-note ex-opening', XT(hooks?.ui() ?? 'en').loading))
    await loadFixture5(e.story, e.s.tfLang).catch(() => null)
    await new Promise((res) => setTimeout(res, 50))
    if (!exploreOpen()) return
    r = hooks?.resume5(e)
  }
  ensure().body.querySelector('.ex-opening')?.remove()
  // (still 'loading' after the tries counts as failed: no more waiting, nothing said)
  if (r === true) closeExplore(false)
  else if (r === false || r === undefined) busyNote()
}

let drawing = 0
async function draw() {
  const b = ensure()
  const v = stack[stack.length - 1]
  if (!v || !hooks) return closeExplore()
  const ui = hooks.ui()
  const s = XT(ui)
  const mine = ++drawing
  b.back.style.visibility = stack.length > 1 ? 'visible' : 'hidden'
  b.back.setAttribute('aria-label', s.back)
  b.close.setAttribute('aria-label', s.close)
  b.body.innerHTML = ''
  b.body.scrollTop = 0
  if (!b.root.contains(document.activeElement)) b.root.focus({ preventScroll: true })
  const wait = el('p', 'ex-note', s.loading)
  const later = setTimeout(() => { if (mine === drawing) b.body.appendChild(wait) }, 150)
  const done = () => {
    clearTimeout(later)
    wait.remove()
    return mine === drawing // the person moved on while this was read
  }
  const packs = hooks.packs()
  const name = (lang: string) => hooks!.packName(lang)

  if (v.k !== 'chapter') picking = false
  pendingTabs = false // (this drawing reads everything known: a change held back shows now)
  stopPeopleTab() // the people tab's debounce and late lines are void with any new drawing
  stopLugaresTab() // and the places tab's (its map is destroyed)
  if (v.k === 'home') {
    b.title.textContent = s.browse
    // saved items and notes, one tap away (savedview.ts)
    if (hooks.saved) {
      const sv = el('div', 'ex-rows ex-saved')
      const row = button('ex-row', '', () => hooks?.saved?.())
      row.append(el('span', 'ex-row-t', `☆ ${SVT(ui).title}`), el('span', 'ex-row-s', savedSummary(ui)), chevron('ex-row-c'))
      sv.appendChild(row)
      b.body.appendChild(sv)
    }
    if (!packs.length) {
      if (!done()) return
      drawnPeople = ''
      drawnPlaces = ''
      drawnTab = ''
      b.body.appendChild(el('p', 'ex-note', s.none))
      b.body.appendChild(button('ex-pill', s.addLang, () => { closeExplore(); hooks?.addLang() }))
      return
    }
    const [books, manuals, stories, five] = await Promise.all([bibleBooks(packs), academyManuals(packs), obsPack(packs[0]!).catch(() => null), fiveStories(packs).catch(noFive)])
    const withPlaces = placesOf(packs)
    if (!done()) return
    // the guided modes the phone can run, before the tabs so they show with either tab (modes.ts: a mode that lacks what it needs is not there)
    const modes = modesFor(dataOf(books.length, manuals.length, five))
    if (modes.length) {
      b.body.appendChild(el('h4', 'ex-sub', MT(ui).section))
      b.body.appendChild(modeRows(ui, modes, five))
    }
    // the tabs the phone has data for (people: only when a pack's people index is built already, kin.ts); one alone needs no bar.
    // (X2: with places too, the people tab is "People and places" and gets its subtabs; with only the people it is "People" alone)
    const avail: ('bible' | 'academy' | 'people')[] = []
    if (books.length) avail.push('bible')
    if (manuals.length) avail.push('academy')
    drawnPeople = peoplePacks(packs).join()
    drawnPlaces = withPlaces.join()
    const peopleOn = !!drawnPeople, placesOn = !!drawnPlaces
    if (peopleOn || placesOn) avail.push('people')
    // the one chosen, else the first there is (the chosen one went: its pack was removed)
    const tab = avail.includes(v.tab) ? v.tab : avail[0] ?? 'bible'
    if (avail.length && tab !== v.tab && placesKnown(packs)) v.tab = tab // it stays there (it does not jump back to a tab that reappears alone)
    drawnTab = tab
    if (avail.length > 1) {
      const tabs = el('div', 'ex-tabs')
      tabs.setAttribute('role', 'tablist')
      const names = { bible: s.bible, academy: s.academy, people: peopleOn && placesOn ? s.peoplePlaces : placesOn ? s.places : s.people }
      for (const k of avail) {
        const t = button(tab === k ? 'on' : '', names[k], () => { v.tab = k; draw() })
        t.setAttribute('role', 'tab')
        t.setAttribute('aria-selected', String(tab === k))
        tabs.appendChild(t)
      }
      b.body.appendChild(tabs)
    }
    // the people tab's subtab: with both there are two (the one chosen, else People); with one of them, that one and no bar
    const both = peopleOn && placesOn
    const sub: 'people' | 'places' = both ? (v.sub === 'places' ? 'places' : 'people') : placesOn ? 'places' : 'people'
    drawnSub = tab === 'people' ? sub : ''
    if (v.sub && !both && v.sub !== sub && placesKnown(packs)) v.sub = sub // (the one chosen went: it stays on what is there, as the tab does)
    if (tab === 'people' && both) {
      const bar = el('div', 'ex-subtabs')
      bar.setAttribute('role', 'tablist')
      for (const k of ['people', 'places'] as const) {
        const t = button(sub === k ? 'on' : '', k === 'people' ? s.people : s.places, () => { v.sub = k; draw() })
        t.setAttribute('role', 'tab')
        t.setAttribute('aria-selected', String(sub === k))
        bar.appendChild(t)
      }
      b.body.appendChild(bar)
    }
    if (tab !== 'people' || sub !== 'people') peopleShown = false
    if (tab !== 'people' || sub !== 'places') placesShown = false
    if (tab === 'people') {
      if (sub === 'places') {
        if (!placesShown) {
          placesShown = true
          count('explore.places.open')
        }
        const scroll = v.scroll
        v.scroll = undefined
        renderLugaresTab(b.body, {
          scroll, ui, packs: withPlaces, chevron: () => chevron('ex-row-c'), onOpen: (pack, id, name) => openPlace(pack, id, name), mount: mapMount,
          text: { search: s.lSearch, none: s.lNone, more: s.lMore, fail: s.lFail, loading: s.loading, book: s.lBook, allBooks: s.lAll, mapSum: s.lMap, count: s.lCount },
        })
        return
      }
      if (!peopleShown) {
        peopleShown = true
        count('explore.people.open')
      }
      renderPeopleTab(b.body, {
        ui, packs: peoplePacks(packs), name, chevron: () => chevron('ex-row-c'), onOpen: (pack, id, name) => openPerson(pack, id, 'tree', name),
        text: { search: s.pSearch, none: s.pNone, more: s.pMore, fail: s.pFail, loading: s.loading, inLang: s.inLang },
      })
      return
    }
    if (tab === 'bible') {
      // Open Bible Stories, when a pack on the phone has them: the 50 stories, one tap each (obs.ts)
      if (stories) {
        const rows = el('div', 'ex-rows ex-obs')
        const row = button('ex-row', '', () => { stack.push({ k: 'obs', lang: stories.lang }); draw() })
        row.append(el('span', 'ex-row-t', OW(ui).browse), el('span', 'ex-row-s', OW(ui).browseSub), chevron('ex-row-c'))
        rows.appendChild(row)
        b.body.appendChild(rows)
      }
      // books from more than one pack: those in the first pack's language first, then the others by pack, each said
      const langs = [...new Set(books.map((x) => x.lang))].sort((a, c) => packs.indexOf(a) - packs.indexOf(c))
      for (const lang of langs) {
        const mineBooks = books.filter((x) => x.lang === lang)
        if (langs.length > 1) {
          const h = el('h3', 'ex-pack', lang === langs[0] ? fill(s.inPack, { lang: name(lang) }) : fill(s.inOther, { lang: name(lang), first: name(langs[0]!) }))
          b.body.appendChild(h)
        }
        for (const [head, part] of [[s.ot, mineBooks.filter((x) => CANON.indexOf(x.code) < 39)], [s.nt, mineBooks.filter((x) => CANON.indexOf(x.code) >= 39)]] as const) {
          if (!part.length) continue
          b.body.appendChild(el('h4', 'ex-sub', head))
          const grid = el('div', 'ex-books')
          for (const x of part) grid.appendChild(button('', bookShown(ui, x.code), () => { stack.push({ k: 'book', code: x.code, lang: x.lang }); draw() }))
          b.body.appendChild(grid)
        }
      }
    } else {
      const list = el('div', 'ex-rows')
      for (const x of manuals) {
        const [title, about] = s.manuals[x.m]
        const row = button('ex-row', '', () => { stack.push({ k: 'manual', m: x.m, lang: x.lang }); draw() })
        const other = packs[0] && x.lang !== packs[0] ? ` · ${fill(s.inLang, { lang: name(x.lang) })}` : ''
        row.append(el('span', 'ex-row-t', title), el('span', 'ex-row-s', about + other), chevron('ex-row-c'))
        list.appendChild(row)
      }
      b.body.appendChild(list)
    }
    return
  }

  if (v.k === 'person') {
    done() // (nothing here waits: no "Opening…" of this drawing comes after the view is painted)
    // its pack went with this view still in the stack: back to what is behind it
    if (!packs.includes(v.pack)) {
      if (!prunePeople()) stack.pop()
      return draw()
    }
    b.title.textContent = s.people
    renderPerson(b.body, v, {
      ui,
      text: { loading: s.loading, fail: s.pTreeFail, empty: s.pEmpty },
      hint: v.name,
      setTitle: (n) => { if (mine === drawing) b.title.textContent = n },
      onOpen: (pack, id, mode) => openPerson(pack, id, mode),
      onChat: (label, sheet) => runInChat(label, sheet),
    })
    return
  }

  if (v.k === 'place') {
    done() // (as the person's view)
    // its pack went with this view still in the stack: back to what is behind it
    if (!packs.includes(v.pack)) {
      if (!prunePeople()) stack.pop()
      return draw()
    }
    b.title.textContent = s.places
    renderPlace(b.body, v, {
      ui,
      text: { loading: s.loading, fail: s.lCardFail, sure: s.lSure },
      hint: v.name,
      setTitle: (n) => { if (mine === drawing) b.title.textContent = n },
      onChat: (label, sheet) => runInChat(label, sheet, 'places'), mount: mapMount,
    })
    return
  }

  if (v.k === 'modes') {
    b.title.textContent = MT(ui).section
    const [five, modes] = await Promise.all([fiveStories(packs).catch(noFive), modesOn(packs)])
    if (!done()) return
    b.body.appendChild(modes.length ? modeRows(ui, modes, five) : el('p', 'ex-note', MT(ui).noModes))
    return
  }

  if (v.k === 'obs5m') {
    b.title.textContent = fiveViewTitle(ui)
    const t = MT(ui)
    const w = W5(ui)
    const dir = rtlLang(ui) ? 'rtl' : 'ltr'
    const five = await fiveStories(packs).catch(noFive)
    if (!done()) return
    // 5M went away with this view still in the stack (the pack was removed): back to what is behind it
    if (!five.stories.length) {
      if (stack.length > 1) stack.pop()
      else stack[0] = { k: 'home', tab: 'bible' }
      return draw()
    }
    b.body.appendChild(el('p', 'ex-note ex-five-intro', t.intro))
    // [Resume]: the sessions used last (up to 3), as the welcome has them; the same call
    const rows = el('div', 'ex-rows ex-five')
    rows.dir = dir
    const have = new Set(five.stories.map((x) => x.story))
    const saved = hooks.saved5().filter((x) => have.has(x.story)).slice(0, 3)
    // (the tables of the saved ones only; the rest of the stories are read when one is opened)
    const fxs = await Promise.all(saved.map((e) => loadFixture5(e.story, e.s.tfLang).catch(() => null)))
    if (!done()) return
    for (const [i, e] of saved.entries()) {
      const fx = fxs[i]
      if (!fx) continue
      const row = button('ex-row', '', () => void resumeFive(e))
      row.dataset.resume = String(e.story)
      row.append(el('span', 'ex-row-t', `↻ ${bidiLabel(w.resume.replace('{story}', `OBS ${e.story}`).replace('{place}', stepPlace(fx, e.s, ui)), ui)}`), chevron('ex-row-c'))
      rows.appendChild(row)
    }
    if (rows.childElementCount) b.body.appendChild(rows)
    b.body.appendChild(el('h4', 'ex-sub', t.stories))
    const list = el('div', 'ex-rows ex-five')
    list.dir = dir
    for (const st of five.stories) {
      const row = button('ex-row', '', () => openFive(st.story))
      row.dataset.story = String(st.story)
      // (in the app's direction; a title in another script is isolated, so "OBS 1:" stays beside it)
      row.appendChild(el('span', 'ex-row-t', bidiLabel(st.title ? `OBS ${st.story}: ${st.title}` : `OBS ${st.story}`, ui)))
      // the line under it, when the story's tables were read already: the Bible passage it is told from, and the language of the
      // session when it is not the app's
      const lang = st.tfLang && st.tfLang.split('-')[0] !== ui ? fill(w.inLang, { lang: langName(ui, st.tfLang) }) : ''
      const sub = [(st.reference ?? '').replace(/^[^:]*:\s*/, ''), lang].filter(Boolean).join(' · ')
      if (sub) row.appendChild(el('span', 'ex-row-s', bidiLabel(sub, ui)))
      row.appendChild(chevron('ex-row-c'))
      list.appendChild(row)
    }
    b.body.appendChild(list)
    // what is missing, said in a line: without Bible Stories on the phone, no helps beside the cards
    if (!five.obs) b.body.appendChild(el('p', 'ex-note', t.noObs))
    return
  }

  if (v.k === 'obs') {
    // the stories in order: the title in the pack's language (its own direction), the Bible passages it is told from
    b.title.textContent = v.only?.length && v.title ? v.title : OW(ui).browse
    let list: StoryEntry[] = []
    try {
      list = await storyList(await openLang(v.lang))
      if (v.only?.length) list = list.filter((e) => v.only!.includes(e.n))
    } catch { /* drawn as not readable below */ }
    if (!done()) return
    if (!list.length) {
      b.body.appendChild(el('p', 'ex-note', s.failed))
      return
    }
    const rows = el('div', 'ex-rows')
    rows.dataset.lang = v.lang
    for (const e of list) {
      const label = e.title ? `${obsLabel(e.n)}: ${e.title}` : obsLabel(e.n)
      const row = button('ex-row', '', () => ask(label, { lang: v.lang, intent: 'passage', ref: `obs ${e.n}`, what: ['text', 'notes'] }))
      const t = row.appendChild(el('span', 'ex-row-t', label))
      t.dir = rtlLang(v.lang) ? 'rtl' : 'ltr'
      if (e.refs.length) row.appendChild(el('span', 'ex-row-s', e.refs.slice(0, 3).map((r) => bibleLabel(ui, r)).join(' · ') + (e.refs.length > 3 ? ' …' : ''))).dir = rtlLang(ui) ? 'rtl' : 'ltr'
      row.appendChild(chevron('ex-row-c'))
      rows.appendChild(row)
    }
    b.body.appendChild(rows)
    return
  }

  if (v.k === 'book' || v.k === 'chapter') {
    const book = bookShown(ui, v.code)
    b.title.textContent = v.k === 'book' ? book : `${book} ${v.ch}`
    // reading a long book (Psalms, Genesis) holds the page for a moment, longer on a small phone: "Opening…" is drawn first
    if (!planned.has(`${v.lang}:${v.code}`)) {
      clearTimeout(later)
      b.body.appendChild(wait)
      // after the next paint; a page out of sight paints nothing, so not longer than a moment
      await new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 80) })
      if (mine !== drawing) return
    }
    const plan = await bookPlan(v.lang, v.code)
    if (!done()) return
    if (!plan) {
      b.body.appendChild(el('p', 'ex-note', s.failed))
      return
    }
    const passage = (label: string, ref: string, what: string[]) => ask(label, { lang: v.lang, intent: 'passage', ref, what })
    if (v.k === 'book') {
      if (plan.intro) {
        const pills = el('div', 'ex-pills')
        pills.appendChild(button('ex-pill', s.bookIntro, () => passage(`${book}: ${s.bookIntro}`, `${v.code} front:intro`, ['intro'])))
        b.body.appendChild(pills)
      }
      b.body.appendChild(el('h3', '', s.chapters))
      const grid = el('div', 'ex-grid')
      for (const c of plan.chapters) grid.appendChild(button('', String(c.ch), () => { stack.push({ k: 'chapter', code: v.code, lang: v.lang, ch: c.ch }); draw() }))
      b.body.appendChild(grid)
      return
    }
    const c = plan.chapters.find((x) => x.ch === v.ch)
    if (!c) {
      stack.pop()
      return draw()
    }
    const pills = el('div', 'ex-pills')
    pills.appendChild(button('ex-pill', fill(s.chapter, { ch: c.ch }), () => passage(`${book} ${c.ch}`, `${v.code} ${c.ch}`, ['text', 'notes'])))
    if (c.intro) pills.appendChild(button('ex-pill', fill(s.chIntro, { ch: c.ch }), () => passage(`${book} ${c.ch}: ${fill(s.chIntro, { ch: c.ch })}`, `${v.code} ${c.ch}:intro`, ['intro'])))
    // ☆ Save verses: a tap on a verse saves it (or takes it out) instead of opening it, until Done (saved.ts)
    const pick = button(picking ? 'ex-pill on' : 'ex-pill', picking ? SVT(ui).done : SVT(ui).saveVerses, () => { picking = !picking; draw() })
    pick.setAttribute('aria-pressed', String(picking))
    pills.appendChild(pick)
    b.body.appendChild(pills)
    if (picking) b.body.appendChild(el('p', 'ex-note', SVT(ui).versesHint)).setAttribute('role', 'status')
    b.body.appendChild(el('h3', '', s.verses))
    const grid = el('div', picking ? 'ex-grid picking' : 'ex-grid')
    let sure = '' // the verse whose removal waits for a second tap
    for (const n of c.verses) {
      const q = { k: 'passage' as const, ref: `${v.code} ${c.ch}:${n}`, lang: v.lang, what: ['text', 'notes'] }
      const vb = button('', String(n), () => {
        if (!picking) return passage(`${book} ${c.ch}:${n}`, q.ref, q.what)
        const say = (t: string) => {
          b.body.querySelector('.ex-busy')?.remove()
          const note = el('p', 'ex-note ex-busy', t)
          note.setAttribute('role', 'status')
          grid.before(note)
        }
        const had = findSaved(q)
        if (had) {
          // one the person named or grouped goes with a second tap
          if (personal(had) && sure !== q.ref) {
            sure = q.ref
            return say(SVT(ui).sure)
          }
          sure = ''
          b.body.querySelector('.ex-busy')?.remove()
          removeSaved(had.id)
        } else {
          const r = addSaved({ q, label: `${book} ${c.ch}:${n}`, ui }).res
          if (r !== 'ok') say(r === 'full' ? SVT(ui).full : fill(SVT(ui).many, { n: MAX_ITEMS }))
        }
        const on = !!findSaved(q)
        vb.classList.toggle('saved', on)
        vb.setAttribute('aria-pressed', String(on))
      })
      // a saved verse is marked (★), in both modes
      if (findSaved(q)) vb.classList.add('saved')
      if (picking) vb.setAttribute('aria-pressed', String(vb.classList.contains('saved')))
      grid.appendChild(vb)
    }
    b.body.appendChild(grid)
    return
  }

  // a manual: its articles, by section when there are many; one opens as the chat's answer (with its related articles)
  b.title.textContent = s.manuals[v.m][0]
  const groups = await manualSections(v.lang, v.m, ui)
  if (!done()) return
  if (!groups.length) {
    b.body.appendChild(el('p', 'ex-note', s.failed))
    return
  }
  const rows = (items: ArticleEntry[]) => {
    const list = el('div', 'ex-rows')
    list.dataset.lang = v.lang
    for (const a of items) {
      const row = button('ex-row', '', () => ask(a.title, { lang: v.lang, intent: 'article', concept: a.id }))
      const t = row.appendChild(el('span', 'ex-row-t', a.title))
      t.dir = 'auto' // a title in another script than the app's keeps its own direction; the chevron follows the app
      if (a.sub) row.appendChild(el('span', 'ex-row-s', a.sub)).dir = 'auto'
      row.appendChild(chevron('ex-row-c'))
      list.appendChild(row)
    }
    return list
  }
  if (groups.length === 1 && !groups[0]!.title) {
    b.body.appendChild(rows(groups[0]!.items))
    return
  }
  for (const g of groups) {
    const d = el('details', 'ex-sec')
    const sum = el('summary')
    sum.append(el('span', '', g.title), el('span', 'ex-count', String(g.items.length)))
    d.append(sum, rows(g.items))
    b.body.appendChild(d)
  }
}
