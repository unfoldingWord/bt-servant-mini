// Guided modes: a path Mini leads step by step, so the person need not know what to ask next. Browse shows them in one section
// ("Guided modes", explore.ts); the welcome's doors lead to the same places. A mode that lacks what it needs is not offered (no
// grey rows). This file has no page: the list, what decides each mode, the words, and `fiveStories`, the one question the 5M
// mode asks ("which stories have a session, and in which language?"). Today the answer comes from the test file behind the dev
// switch `obs5m`; when a pack carries the 5M tables only `fiveStories` changes (handoff/obs-5m-packs/plan.md).
import { devOn } from './dev'
import { loadFixture5 } from './pipeline'
import { obsLabel, obsPack, storyList } from './obs'

export type ModeId = 'book' | 'learn' | 'obs5m'
/** A story with a 5M session; `title` is in `titleLang`, `tfLang` is the language of the session's tables, `reference` the test file's own line */
export type FiveStory = { story: number; title: string; titleLang: string; reference: string; tfLang: string }
export type Five =
  | { stories: FiveStory[]; source: 'test' | 'pack'; /** whether a pack on the phone has Open Bible Stories (the cards' notes and key terms need it) */ obs: boolean }
  | 'unreadable'
/** What decides which modes show: whether the phone has books, Translation Academy manuals, and the 5M's stories. */
export type ModeData = { books: boolean; manuals: boolean; five: Five }

/**
 * The stories that have a 5M session. Dev switch off and no pack with the tables: none (the mode is hidden). Switch on: story 1
 * from the test file, its title from the phone's Open Bible Stories when installed; 'unreadable' when the file is not in this
 * build (the mode is offered and says so, never an empty screen). `packs`: the installed packs, the helps language first.
 */
export async function fiveStories(packs: string[]): Promise<Five> {
  if (!devOn('obs5m')) return { stories: [], source: 'test', obs: false }
  let fx
  try {
    fx = await loadFixture5()
  } catch {
    return 'unreadable'
  }
  const at = packs[0] ? await obsPack(packs[0]).catch(() => null) : null
  let title = fx.title
  let titleLang = fx.tfLang as string
  if (at) {
    const own = (await storyList(at.r).catch(() => [])).find((e) => e.n === fx.story)?.title
    if (own) { title = own; titleLang = at.lang }
  }
  return { stories: [{ story: fx.story, title, titleLang, reference: fx.reference, tfLang: fx.tfLang }], source: 'test', obs: !!at }
}

/** Whether a 5M session is on offer at all (the welcome's fifth door). */
export const fiveOffered = (f: Five): boolean => f === 'unreadable' || f.stories.length > 0

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
export const fiveText = (story: number): string => `5M ${obsLabel(story)}`

type L = {
  section: string; book: string; learn: string; five: string; fiveTest: string; fiveSub: string
  /** the 5M view */
  intro: string; stories: string; onlyOne: string; noObs: string; unreadable: string
  /** the first two modes' lines are the welcome's doors' (welcome.ts) */
  bookSub: string; learnSub: string
}
const STR: Record<string, L> = {
  en: {
    section: 'Guided modes', book: 'Translate a book', learn: 'Learn to translate', five: 'OBS 5M session', fiveTest: 'OBS 5M session (test)',
    fiveSub: 'One story with your team, in five movements: read, observe, discuss, draft, check',
    intro: 'An Open Bible Story with your team, in five movements. The answers of the 5M guide stay hidden until you tap “Show answer”.',
    stories: 'Stories with a session', onlyOne: 'For now only story 1, in English (test version). The others come with the packs.',
    noObs: 'To see the helps for each frame, add Bible Stories: Menu → Languages',
    unreadable: 'The test session is not in this version of the app. It is in the BT Servant DEV app.',
    bookSub: 'Its introduction, then section by section with its helps', learnSub: 'Short Translation Academy lessons, one at a time',
  },
  es: {
    section: 'Modos guiados', book: 'Traducir un libro', learn: 'Aprender a traducir', five: 'Sesión OBS 5M', fiveTest: 'Sesión OBS 5M (prueba)',
    fiveSub: 'Una historia con tu equipo, en cinco movimientos: leer, observar, conversar, hacer el borrador y revisar',
    intro: 'Una historia de Open Bible Stories con tu equipo, en cinco movimientos. Las respuestas de la guía 5M quedan ocultas hasta que toques «Ver respuesta».',
    stories: 'Historias con sesión', onlyOne: 'Por ahora solo la historia 1, en inglés (versión de prueba). Las demás llegan con los paquetes.',
    noObs: 'Para ver las ayudas de cada cuadro, agrega Historias de la Biblia: Menú → Idiomas',
    unreadable: 'La sesión de prueba no está en esta versión de la app. Está en la app BT Servant DEV.',
    bookSub: 'Su introducción y luego sección por sección, con sus ayudas', learnSub: 'Lecciones cortas de Translation Academy, una a la vez',
  },
  fr: {
    section: 'Modes guidés', book: 'Traduire un livre', learn: 'Apprendre à traduire', five: 'Séance OBS 5M', fiveTest: 'Séance OBS 5M (essai)',
    fiveSub: 'Une histoire avec votre équipe, en cinq mouvements : lire, observer, discuter, rédiger le brouillon et vérifier',
    intro: 'Une histoire d’Open Bible Stories avec votre équipe, en cinq mouvements. Les réponses du guide 5M restent masquées jusqu’à ce que vous touchiez « Voir la réponse ».',
    stories: 'Histoires avec séance', onlyOne: 'Pour l’instant, seulement l’histoire 1, en anglais (version d’essai). Les autres arrivent avec les paquets.',
    noObs: 'Pour voir les aides de chaque image, ajoutez les Histoires de la Bible : Menu → Langues',
    unreadable: 'La séance d’essai n’est pas dans cette version de l’application. Elle est dans l’application BT Servant DEV.',
    bookSub: 'Son introduction, puis section par section avec ses aides', learnSub: 'De courtes leçons de Translation Academy, une à la fois',
  },
  id: {
    section: 'Mode terpandu', book: 'Menerjemahkan kitab', learn: 'Belajar menerjemahkan', five: 'Sesi OBS 5M', fiveTest: 'Sesi OBS 5M (uji coba)',
    fiveSub: 'Satu kisah bersama tim Anda, dalam lima gerakan: membaca, mengamati, berdiskusi, menyusun draf, dan memeriksa',
    intro: 'Satu kisah Open Bible Stories bersama tim Anda, dalam lima gerakan. Jawaban panduan 5M tetap tersembunyi sampai Anda mengetuk «Lihat jawaban».',
    stories: 'Kisah yang punya sesi', onlyOne: 'Untuk sekarang hanya kisah 1, dalam bahasa Inggris (versi uji coba). Yang lain datang bersama paket.',
    noObs: 'Untuk melihat bahan bantu tiap bingkai, tambahkan Kisah-kisah Alkitab: Menu → Bahasa',
    unreadable: 'Sesi uji coba tidak ada di versi aplikasi ini. Sesi itu ada di aplikasi BT Servant DEV.',
    bookSub: 'Pengantarnya, lalu bagian demi bagian dengan bahan bantunya', learnSub: 'Pelajaran singkat Translation Academy, satu per satu',
  },
  hi: {
    section: 'निर्देशित तरीके', book: 'पुस्तक का अनुवाद', learn: 'अनुवाद सीखें', five: 'OBS 5M सत्र', fiveTest: 'OBS 5M सत्र (परीक्षण)',
    fiveSub: 'अपनी टीम के साथ एक कहानी, पाँच चरणों में: पढ़ना, देखना, चर्चा, मसौदा और जाँच',
    intro: 'अपनी टीम के साथ Open Bible Stories की एक कहानी, पाँच चरणों में। 5M मार्गदर्शिका के उत्तर तब तक छिपे रहते हैं जब तक आप «उत्तर दिखाएँ» न दबाएँ।',
    stories: 'सत्र वाली कहानियाँ', onlyOne: 'अभी केवल कहानी 1, अंग्रेज़ी में (परीक्षण संस्करण)। बाकी पैकेजों के साथ आएँगी।',
    noObs: 'हर चित्र की सहायता देखने के लिए बाइबल की कहानियाँ जोड़ें: मेनू → भाषाएँ',
    unreadable: 'परीक्षण सत्र ऐप के इस संस्करण में नहीं है। यह BT Servant DEV ऐप में है।',
    bookSub: 'उसका परिचय, फिर खंड-दर-खंड उसकी सहायताओं के साथ', learnSub: 'Translation Academy के छोटे पाठ, एक बार में एक',
  },
  ar: {
    section: 'المسارات الموجّهة', book: 'ترجمة سفر', learn: 'تعلّم الترجمة', five: 'جلسة OBS 5M', fiveTest: 'جلسة OBS 5M (تجريبية)',
    fiveSub: 'قصة واحدة مع فريقك، في خمس حركات: القراءة والملاحظة والحوار والمسودة والتدقيق',
    intro: 'قصة من Open Bible Stories مع فريقك، في خمس حركات. تبقى إجابات دليل 5M مخفية حتى تلمس «عرض الإجابة».',
    stories: 'قصص لها جلسة', onlyOne: 'حاليًا القصة 1 فقط، بالإنجليزية (نسخة تجريبية). تصل القصص الأخرى مع الحزم.',
    noObs: 'لرؤية مساعدات كل إطار، أضف قصص الكتاب المقدس: القائمة ← اللغات',
    unreadable: 'جلسة الاختبار غير موجودة في هذه النسخة من التطبيق. وهي في تطبيق BT Servant DEV.',
    bookSub: 'مقدمته، ثم مقطعًا بعد مقطع مع مساعداته', learnSub: 'دروس قصيرة من Translation Academy، درسًا بعد درس',
  },
}
export const MT = (ui: string): L => STR[ui] ?? STR.en!

/** A mode's name in Browse; `source` tells the 5M's two names apart ("(test)" while its stories come from the test file). */
export function modeTitle(ui: string, id: ModeId, five?: Five): string {
  const t = MT(ui)
  return id === 'book' ? t.book : id === 'learn' ? t.learn : five !== 'unreadable' && five?.source === 'pack' ? t.five : t.fiveTest
}
export const modeSub = (ui: string, id: ModeId): string => (id === 'book' ? MT(ui).bookSub : id === 'learn' ? MT(ui).learnSub : MT(ui).fiveSub)
/** The 5M view's own title (no "(test)": the note below says it) */
export const fiveViewTitle = (ui: string): string => MT(ui).five

/** What the phone has, for `modesFor`: the books and manuals as Browse reads them, and the 5M's stories. */
export const dataOf = (books: number, manuals: number, five: Five): ModeData => ({ books: books > 0, manuals: manuals > 0, five })

/** Where each mode starts, for the usage count: `explore.mode.<id>` (a number, never what was done). */
export const modeCount = (id: ModeId): string => `explore.mode.${id}`
