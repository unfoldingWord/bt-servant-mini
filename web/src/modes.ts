// Guided modes: a path Mini leads step by step, so the person need not know what to ask next. Browse shows them in one section
// ("Guided modes", explore.ts); the welcome's doors lead to the same places. A mode that lacks what it needs is not offered (no
// grey rows). This file has no page: the list, what decides each mode, the words, and `fiveStories`, the one question the 5M
// mode asks ("which stories have a session?"). The answer comes from the installed packs that carry the 5M tables (five.ts).
import { covered5, fixtureNow5, on5m } from './five'
import { fiveAsk, obsPack, storyList } from './obs'

export type ModeId = 'book' | 'learn' | 'obs5m'
/**
 * A story with a 5M session; `title` is in `titleLang` (empty when no pack names it yet). `tfLang` and `reference` (the language
 * of the session's tables, the passage the story is told from) are there when the story's tables were read already; they are
 * not read here for all the stories (`fixtureOf5` reads one story at a time).
 */
export type FiveStory = { story: number; title: string; titleLang: string; reference?: string; tfLang?: string }
export type Five = { stories: FiveStory[]; source: 'pack'; /** whether a pack on the phone has Open Bible Stories (the cards' notes and key terms need it) */ obs: boolean }
/** What decides which modes show: whether the phone has books, Translation Academy manuals, and the 5M's stories. */
export type ModeData = { books: boolean; manuals: boolean; five: Five }

/**
 * The stories that have a 5M session: the ones the installed packs cover (five.ts), their titles from the phone's Open Bible
 * Stories when installed. No pack with the tables: none (the mode is hidden). `packs`: the installed packs, the helps language first.
 */
export async function fiveStories(packs: string[]): Promise<Five> {
  if (!on5m()) return { stories: [], source: 'pack', obs: false }
  const at = packs[0] ? await obsPack(packs[0]).catch(() => null) : null
  const names = at ? await storyList(at.r).catch(() => []) : []
  const stories = covered5().map((n): FiveStory => {
    const fx = fixtureNow5(n)
    const own = names.find((e) => e.n === n)?.title
    return { story: n, title: own ?? fx?.title ?? '', titleLang: own ? at!.lang : fx?.tfLang ?? '', reference: fx?.reference, tfLang: fx?.tfLang }
  })
  return { stories, source: 'pack', obs: !!at }
}

/** No 5M stories (what a failed read counts as) */
export const noFive = (): Five => ({ stories: [], source: 'pack', obs: false })

/** Whether a 5M session is on offer at all (the welcome's fifth door). */
export const fiveOffered = (f: Five): boolean => f.stories.length > 0

/** The modes the phone can run, in the order Browse lists them. */
export function modesFor(d: ModeData): ModeId[] {
  const out: ModeId[] = []
  if (d.books) out.push('book')
  if (d.manuals) out.push('learn')
  if (fiveOffered(d.five)) out.push('obs5m')
  return out
}

/**
 * Sends `text` through the page's form as if typed, leaving what was being written as it was. True when the form took it (a
 * submit with nothing to do, an answer on its way, leaves the text in the box).
 */
export function sendTyped(input: { value: string }, form: { requestSubmit(): void }, text: string): boolean {
  const typed = input.value
  input.value = text
  form.requestSubmit()
  const sent = input.value !== text
  input.value = typed
  return sent
}

/** The text "5M OBS 1": what a tap on a story sends, as if typed (it is read like the typed words, in every app language). */
export const fiveText = fiveAsk

type L = {
  section: string; book: string; learn: string; five: string; fiveSub: string
  /** the 5M view */
  intro: string; stories: string; noObs: string
  /** the modes list when no mode is there */
  noModes: string
  /** the first two modes' lines are the welcome's doors' (welcome.ts) */
  bookSub: string; learnSub: string
}
const STR: Record<string, L> = {
  en: {
    section: 'Guided modes', book: 'Translate a book', learn: 'Learn to translate', five: 'OBS 5M session',
    fiveSub: 'One story with your team, in five movements: read, observe, discuss, draft, check',
    intro: 'An Open Bible Story with your team, in five movements. The answers of the 5M guide stay hidden until you tap “Show answer”.',
    stories: 'Stories with a session',
    noObs: 'To see the helps for each frame, add Bible Stories: Menu → Resources',
    noModes: 'There are no guided modes with what is on this phone.',
    bookSub: 'Its introduction, then section by section with its helps', learnSub: 'Short Translation Academy lessons, one at a time',
  },
  es: {
    section: 'Modos guiados', book: 'Traducir un libro', learn: 'Aprender a traducir', five: 'Sesión OBS 5M',
    fiveSub: 'Una historia con tu equipo, en cinco movimientos: leer, observar, conversar, hacer el borrador y revisar',
    intro: 'Una historia de Open Bible Stories con tu equipo, en cinco movimientos. Las respuestas de la guía 5M quedan ocultas hasta que toques «Ver respuesta».',
    stories: 'Historias con sesión',
    noObs: 'Para ver las ayudas de cada cuadro, agrega Historias de la Biblia: Menú → Recursos',
    noModes: 'No hay modos guiados con lo que tiene este teléfono.',
    bookSub: 'Su introducción y luego sección por sección, con sus ayudas', learnSub: 'Lecciones cortas de Translation Academy, una a la vez',
  },
  fr: {
    section: 'Modes guidés', book: 'Traduire un livre', learn: 'Apprendre à traduire', five: 'Séance OBS 5M',
    fiveSub: 'Une histoire avec votre équipe, en cinq mouvements : lire, observer, discuter, rédiger le brouillon et vérifier',
    intro: 'Une histoire d’Open Bible Stories avec votre équipe, en cinq mouvements. Les réponses du guide 5M restent masquées jusqu’à ce que vous touchiez « Voir la réponse ».',
    stories: 'Histoires avec séance',
    noObs: 'Pour voir les aides de chaque image, ajoutez les Histoires de la Bible : Menu → Ressources',
    noModes: 'Il n’y a aucun mode guidé avec ce qu’il y a sur ce téléphone.',
    bookSub: 'Son introduction, puis section par section avec ses aides', learnSub: 'De courtes leçons de Translation Academy, une à la fois',
  },
  id: {
    section: 'Mode terpandu', book: 'Menerjemahkan kitab', learn: 'Belajar menerjemahkan', five: 'Sesi OBS 5M',
    fiveSub: 'Satu kisah bersama tim Anda, dalam lima gerakan: membaca, mengamati, berdiskusi, menyusun draf, dan memeriksa',
    intro: 'Satu kisah Open Bible Stories bersama tim Anda, dalam lima gerakan. Jawaban panduan 5M tetap tersembunyi sampai Anda mengetuk «Lihat jawaban».',
    stories: 'Kisah yang punya sesi',
    noObs: 'Untuk melihat bahan bantu tiap bingkai, tambahkan Kisah-kisah Alkitab: Menu → Sumber daya',
    noModes: 'Tidak ada mode terpandu dengan isi ponsel ini.',
    bookSub: 'Pengantarnya, lalu bagian demi bagian dengan bahan bantunya', learnSub: 'Pelajaran singkat Translation Academy, satu per satu',
  },
  hi: {
    section: 'निर्देशित तरीके', book: 'पुस्तक का अनुवाद', learn: 'अनुवाद सीखें', five: 'OBS 5M सत्र',
    fiveSub: 'अपनी टीम के साथ एक कहानी, पाँच चरणों में: पढ़ना, देखना, चर्चा, मसौदा और जाँच',
    intro: 'अपनी टीम के साथ Open Bible Stories की एक कहानी, पाँच चरणों में। 5M मार्गदर्शिका के उत्तर तब तक छिपे रहते हैं जब तक आप «उत्तर दिखाएँ» न दबाएँ।',
    stories: 'सत्र वाली कहानियाँ',
    noObs: 'हर चित्र की सहायता देखने के लिए बाइबल की कहानियाँ जोड़ें: मेनू → संसाधन',
    noModes: 'इस फ़ोन पर जो है उसके साथ कोई निर्देशित तरीका उपलब्ध नहीं है।',
    bookSub: 'उसका परिचय, फिर खंड-दर-खंड उसकी सहायताओं के साथ', learnSub: 'Translation Academy के छोटे पाठ, एक बार में एक',
  },
  ar: {
    section: 'المسارات الموجّهة', book: 'ترجمة سفر', learn: 'تعلّم الترجمة', five: 'جلسة OBS 5M',
    fiveSub: 'قصة واحدة مع فريقك، في خمس حركات: القراءة والملاحظة والحوار والمسودة والتدقيق',
    intro: 'قصة من Open Bible Stories مع فريقك، في خمس حركات. تبقى إجابات دليل 5M مخفية حتى تلمس «عرض الإجابة».',
    stories: 'قصص لها جلسة',
    noObs: 'لرؤية مساعدات كل إطار، أضف قصص الكتاب المقدس: القائمة ← الموارد',
    noModes: 'لا توجد مسارات موجّهة بما هو متوفر على هذا الهاتف.',
    bookSub: 'مقدمته، ثم مقطعًا بعد مقطع مع مساعداته', learnSub: 'دروس قصيرة من Translation Academy، درسًا بعد درس',
  },
}
export const MT = (ui: string): L => STR[ui] ?? STR.en!

/** A mode's name in Browse */
export function modeTitle(ui: string, id: ModeId): string {
  const t = MT(ui)
  return id === 'book' ? t.book : id === 'learn' ? t.learn : t.five
}
export const modeSub = (ui: string, id: ModeId): string => (id === 'book' ? MT(ui).bookSub : id === 'learn' ? MT(ui).learnSub : MT(ui).fiveSub)
/** The 5M view's own title */
export const fiveViewTitle = (ui: string): string => MT(ui).five

/** What the phone has, for `modesFor`: the books and manuals as Browse reads them, and the 5M's stories. */
export const dataOf = (books: number, manuals: number, five: Five): ModeData => ({ books: books > 0, manuals: manuals > 0, five })

/** Where each mode starts, for the usage count: `explore.mode.<id>` (a number, never what was done). */
export const modeCount = (id: ModeId): string => `explore.mode.${id}`
