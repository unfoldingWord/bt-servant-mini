// The welcome "What would you like to do today?" (Fase 2e, Abel, Nov 16: "Sí, agrégala"). One screen once a language is on the
// phone, in the slot where How to ask offered its invitation (howto.ts offerAfterFirstUse): this screen takes that slot, so
// someone new never gets two welcomes in a row. Four doors: translating a book (its light path, graph.ts), learning to translate
// (learn.ts: Translation Academy in the manuals' order), looking up a passage or a word (the chat, with How to ask), or just
// exploring (Browse). It never blocks: Skip is always there, and the menu's "Start over" brings it back.
//
// What is kept (`btsm.welcome.v1`, only on the phone, erased with "Erase everything"): that it showed, the door chosen and the two
// answers about experience. Nothing is counted in the usage counts.
import { bidiLabel, rtlLang } from './bidi'
import { CANON, openLang } from './packs'
import { booksOf, fillName } from './suggest'
import { bookShown } from './firstuse'
import { XT } from './explore'
import { inviteUsed, offerAfterFirstUse, openHowTo } from './howto'
import { type Answer, type Learn, type LearnKind, levelOf, partName, START, startOf } from './learn'
import type { Sheet } from './answer'
import { type ConvState, type Made, pathStart, readQuestion } from './pipeline'
import type { Slots } from './sheet'

const KEY = 'btsm.welcome.v1'

export type Door = 'book' | 'learn' | 'look' | 'explore'
type W = {
  title: string; sub: string; doors: Record<Door, [string, string]>; skip: string; back: string; close: string
  whichBook: string; bookNote: string
  q1: string; a1: [string, string, string]; q2: string; a2: [string, string, string]; qStep: string
  suggestT: string; kinds: Record<LearnKind, string>; firstIs: string; start: string; other: string; withBook: string
  menu: string; none: string; change: string
  /** what door 1 sends, as if typed: a task announced on a book, which starts its light path (pipeline.ts pathStart) */
  translating: string
}
// {browse}: Browse's name in the app (explore.ts)
const STR: Record<string, W> = {
  en: {
    title: 'What would you like to do today?', sub: 'Choose one, or skip. You can come back here from the menu: “Start over”.',
    doors: {
      book: ['I’m translating a book', 'A path through it: introduction, sections, key terms, notes, questions'],
      learn: ['I want to learn to translate', 'Short Translation Academy lessons, one at a time'],
      look: ['I want to look up a passage or a word', 'Ask in the chat, and see how to ask'],
      explore: ['Just explore', 'The Bible book by book, and the Translation Academy manuals'],
    },
    skip: 'Skip', back: 'Back', close: 'Close',
    whichBook: 'Which book are you translating?', bookNote: 'I will start with its introduction, then go section by section. You can ask anything along the way.',
    q1: 'Have you translated before?', a1: ['Never', 'A little', 'Yes'], q2: 'Have you studied translation?', a2: ['No', 'A little', 'Yes'], qStep: 'Question {n} of 2',
    suggestT: 'A place to start',
    kinds: {
      intro: 'The Introduction manual of Translation Academy, in order: what it is, why we translate, and how to find answers.',
      trips: 'The topics that trip people up most: metaphor, names, implicit information and key terms. Then the rest of the Translate manual.',
      checking: 'The Checking manual, in order: how a translation is checked, by whom, and what to check.',
      translate: 'The Translate manual, in order.',
    },
    firstIs: 'First: {title}', start: 'Start', other: 'Or start somewhere else:', withBook: 'Translate a book with its notes',
    menu: 'Start over', none: 'There are no Translation Academy articles on this phone yet.',
    change: 'You can change this at any time: ask anything, or open {browse}.', translating: 'I’m translating {book}',
  },
  es: {
    title: '¿Qué quieres hacer hoy?', sub: 'Elige una opción o sáltala. Puedes volver aquí desde el menú: «Empezar de nuevo».',
    doors: {
      book: ['Estoy traduciendo un libro', 'Un camino por el libro: introducción, secciones, palabras clave, notas, preguntas'],
      learn: ['Quiero aprender a traducir', 'Lecciones cortas de Translation Academy, una a la vez'],
      look: ['Quiero consultar un pasaje o una palabra', 'Pregunta en el chat y mira cómo preguntar'],
      explore: ['Solo explorar', 'La Biblia libro por libro y los manuales de Translation Academy'],
    },
    skip: 'Saltar', back: 'Atrás', close: 'Cerrar',
    whichBook: '¿Qué libro estás traduciendo?', bookNote: 'Empiezo por su introducción y luego sigo sección por sección. Puedes preguntar cualquier cosa en el camino.',
    q1: '¿Has traducido antes?', a1: ['Nunca', 'Un poco', 'Sí'], q2: '¿Has estudiado traducción?', a2: ['No', 'Un poco', 'Sí'], qStep: 'Pregunta {n} de 2',
    suggestT: 'Un punto de partida',
    kinds: {
      intro: 'El manual de Introducción de Translation Academy, en orden: qué es, por qué traducimos y cómo encontrar respuestas.',
      trips: 'Los temas en los que más se tropieza: metáfora, nombres, información implícita y palabras clave. Después, el resto del manual de Traducción.',
      checking: 'El manual de Revisión, en orden: cómo se revisa una traducción, quién lo hace y qué revisar.',
      translate: 'El manual de Traducción, en orden.',
    },
    firstIs: 'Primero: {title}', start: 'Empezar', other: 'O empieza en otro lugar:', withBook: 'Traducir un libro con sus notas',
    menu: 'Empezar de nuevo', none: 'Todavía no hay artículos de Translation Academy en este teléfono.',
    change: 'Puedes cambiarlo cuando quieras: pregunta lo que sea o abre {browse}.', translating: 'Voy a traducir {book}',
  },
  fr: {
    title: 'Que voulez-vous faire aujourd’hui ?', sub: 'Choisissez, ou passez. Vous pouvez revenir ici depuis le menu : « Recommencer ».',
    doors: {
      book: ['Je traduis un livre', 'Un parcours du livre : introduction, sections, mots clés, notes, questions'],
      learn: ['Je veux apprendre à traduire', 'De courtes leçons de Translation Academy, une à la fois'],
      look: ['Je veux consulter un passage ou un mot', 'Posez votre question dans la conversation, et voyez comment la poser'],
      explore: ['Simplement explorer', 'La Bible livre par livre, et les manuels de Translation Academy'],
    },
    skip: 'Passer', back: 'Retour', close: 'Fermer',
    whichBook: 'Quel livre traduisez-vous ?', bookNote: 'Je commence par son introduction, puis section par section. Posez toute question en chemin.',
    q1: 'Avez-vous déjà traduit ?', a1: ['Jamais', 'Un peu', 'Oui'], q2: 'Avez-vous étudié la traduction ?', a2: ['Non', 'Un peu', 'Oui'], qStep: 'Question {n} sur 2',
    suggestT: 'Un point de départ',
    kinds: {
      intro: 'Le manuel d’introduction de Translation Academy, dans l’ordre : ce que c’est, pourquoi nous traduisons, et comment trouver des réponses.',
      trips: 'Les sujets où l’on trébuche le plus : la métaphore, les noms, l’information implicite et les mots clés. Puis le reste du manuel de traduction.',
      checking: 'Le manuel de vérification, dans l’ordre : comment une traduction est vérifiée, par qui, et quoi vérifier.',
      translate: 'Le manuel de traduction, dans l’ordre.',
    },
    firstIs: 'D’abord : {title}', start: 'Commencer', other: 'Ou commencez ailleurs :', withBook: 'Traduire un livre avec ses notes',
    menu: 'Recommencer', none: 'Il n’y a pas encore d’articles de Translation Academy sur ce téléphone.',
    change: 'Vous pouvez changer à tout moment : posez une question, ou ouvrez {browse}.', translating: 'Je traduis {book}',
  },
  id: {
    title: 'Apa yang ingin Anda lakukan hari ini?', sub: 'Pilih salah satu, atau lewati. Anda bisa kembali ke sini dari menu: «Mulai dari awal».',
    doors: {
      book: ['Saya sedang menerjemahkan sebuah kitab', 'Jalur melalui kitab itu: pengantar, bagian, istilah kunci, catatan, pertanyaan'],
      learn: ['Saya ingin belajar menerjemahkan', 'Pelajaran singkat Translation Academy, satu per satu'],
      look: ['Saya ingin mencari perikop atau kata', 'Tanyakan di percakapan, dan lihat cara bertanya'],
      explore: ['Jelajahi saja', 'Alkitab kitab demi kitab, dan buku panduan Translation Academy'],
    },
    skip: 'Lewati', back: 'Kembali', close: 'Tutup',
    whichBook: 'Kitab apa yang sedang Anda terjemahkan?', bookNote: 'Saya mulai dari pengantarnya, lalu bagian demi bagian. Tanyakan apa saja di sepanjang jalan.',
    q1: 'Pernahkah Anda menerjemahkan sebelumnya?', a1: ['Belum pernah', 'Sedikit', 'Ya'], q2: 'Pernahkah Anda belajar penerjemahan?', a2: ['Belum', 'Sedikit', 'Ya'],
    qStep: 'Pertanyaan {n} dari 2',
    suggestT: 'Titik awal',
    kinds: {
      intro: 'Buku panduan Pengantar Translation Academy, berurutan: apa itu, mengapa kita menerjemahkan, dan cara menemukan jawaban.',
      trips: 'Topik yang paling sering menyulitkan: metafora, nama, informasi tersirat, dan istilah kunci. Lalu sisa buku panduan Penerjemahan.',
      checking: 'Buku panduan Pemeriksaan, berurutan: bagaimana terjemahan diperiksa, oleh siapa, dan apa yang diperiksa.',
      translate: 'Buku panduan Penerjemahan, berurutan.',
    },
    firstIs: 'Pertama: {title}', start: 'Mulai', other: 'Atau mulai di tempat lain:', withBook: 'Menerjemahkan kitab dengan catatannya',
    menu: 'Mulai dari awal', none: 'Belum ada artikel Translation Academy di ponsel ini.',
    change: 'Anda bisa mengubahnya kapan saja: tanyakan apa saja, atau buka {browse}.', translating: 'Saya menerjemahkan {book}',
  },
  hi: {
    title: 'आज आप क्या करना चाहेंगे?', sub: 'एक चुनें, या छोड़ दें। आप मेनू से यहाँ लौट सकते हैं: «फिर से शुरू करें»।',
    doors: {
      book: ['किसी पुस्तक का अनुवाद', 'उसका मार्ग: परिचय, खंड, मुख्य शब्द, टिप्पणियाँ, प्रश्न'],
      learn: ['अनुवाद करना सीखना', 'Translation Academy के छोटे पाठ, एक बार में एक'],
      look: ['कोई अंश या शब्द देखना', 'बातचीत में पूछें, और देखें कैसे पूछें'],
      explore: ['बस घूमकर देखना', 'बाइबल पुस्तक-दर-पुस्तक, और Translation Academy की पुस्तिकाएँ'],
    },
    skip: 'छोड़ें', back: 'पीछे', close: 'बंद करें',
    whichBook: 'आप किस पुस्तक का अनुवाद कर रहे हैं?', bookNote: 'मैं उसके परिचय से शुरू करूँगा, फिर खंड-दर-खंड आगे बढ़ूँगा। रास्ते में कुछ भी पूछें।',
    q1: 'क्या आपने पहले अनुवाद किया है?', a1: ['कभी नहीं', 'थोड़ा', 'हाँ'], q2: 'क्या आपने अनुवाद की पढ़ाई की है?', a2: ['नहीं', 'थोड़ी', 'हाँ'], qStep: 'प्रश्न {n}/2',
    suggestT: 'शुरुआत का एक बिंदु',
    kinds: {
      intro: 'Translation Academy की परिचय पुस्तिका, क्रम से: यह क्या है, हम अनुवाद क्यों करते हैं, और उत्तर कैसे ढूँढें।',
      trips: 'वे विषय जिनमें लोग सबसे अधिक अटकते हैं: रूपक, नाम, निहित जानकारी और मुख्य शब्द। फिर अनुवाद पुस्तिका का बाकी भाग।',
      checking: 'जाँच पुस्तिका, क्रम से: अनुवाद की जाँच कैसे होती है, कौन करता है, और क्या जाँचना है।',
      translate: 'अनुवाद पुस्तिका, क्रम से।',
    },
    firstIs: 'पहले: {title}', start: 'शुरू करें', other: 'या कहीं और से शुरू करें:', withBook: 'किसी पुस्तक का उसकी टिप्पणियों के साथ अनुवाद',
    menu: 'फिर से शुरू करें', none: 'इस फ़ोन पर अभी Translation Academy के लेख नहीं हैं।',
    change: 'आप इसे कभी भी बदल सकते हैं: कुछ भी पूछें, या «{browse}» खोलें।', translating: 'हम {book} का अनुवाद कर रहे हैं',
  },
  ar: {
    title: 'ماذا تريد أن تفعل اليوم؟', sub: 'اختر واحدًا، أو تخطَّ. يمكنك العودة إلى هنا من القائمة: «البدء من جديد».',
    doors: {
      book: ['أترجم سفرًا', 'مسار عبره: المقدمة، المقاطع، الكلمات الرئيسية، الملاحظات، الأسئلة'],
      learn: ['أريد أن أتعلّم الترجمة', 'دروس قصيرة من Translation Academy، درسًا بعد درس'],
      look: ['أريد البحث عن مقطع أو كلمة', 'اسأل في المحادثة، وتعرّف على طريقة السؤال'],
      explore: ['أتصفّح فقط', 'الكتاب المقدس سفرًا سفرًا، وأدلة Translation Academy'],
    },
    skip: 'تخطَّ', back: 'السابق', close: 'إغلاق',
    whichBook: 'أيّ سفر تترجم؟', bookNote: 'أبدأ بمقدمته، ثم مقطعًا بعد مقطع. اسأل عن أي شيء في الطريق.',
    q1: 'هل ترجمت من قبل؟', a1: ['أبدًا', 'قليلًا', 'نعم'], q2: 'هل درست الترجمة؟', a2: ['لا', 'قليلًا', 'نعم'], qStep: 'السؤال {n} من 2',
    suggestT: 'نقطة للبدء',
    kinds: {
      intro: 'دليل المقدمة في Translation Academy بالترتيب: ما هو، ولماذا نترجم، وكيف تجد الإجابات.',
      trips: 'الموضوعات التي يتعثّر فيها الناس أكثر: الاستعارة، والأسماء، والمعلومات الضمنية، والكلمات الرئيسية. ثم بقية دليل الترجمة.',
      checking: 'دليل التدقيق بالترتيب: كيف تُدقَّق الترجمة، ومن يدقّقها، وماذا يُدقَّق.',
      translate: 'دليل الترجمة بالترتيب.',
    },
    firstIs: 'أولًا: {title}', start: 'ابدأ', other: 'أو ابدأ من مكان آخر:', withBook: 'ترجمة سفر مع ملاحظاته',
    menu: 'البدء من جديد', none: 'لا توجد مقالات من Translation Academy على هذا الهاتف بعد.',
    change: 'يمكنك تغيير ذلك في أي وقت: اسأل عن أي شيء، أو افتح «{browse}».', translating: 'أترجم {book}',
  },
}
export const WT = (ui: string): W => STR[ui] ?? STR.en!
/** The menu's row that brings the welcome back. */
export const welcomeLabel = (ui: string) => WT(ui).menu
/**
 * What door 1 sends for a book, as typed ("Voy a traducir Rut"): read by code, it starts the book's light path. The book as the
 * composer writes it, else as the app shows it ("प्रेरितों के काम": the short "प्रेरितों" is not read as only a book).
 */
export function translatingText(ui: string, code: string): string {
  const say = (name: string) => WT(ui).translating.replace('{book}', name)
  return [fillName(ui, code), bookShown(ui, code)].map(say).find((t) => pathStart(t)?.book === code) ?? say(bookShown(ui, code))
}
/**
 * Door 1's question for a book: its words read by code alone (no model), which start the book's path at its introduction; a
 * name code does not read back as only a book ("Song of Songs"), the same from the book's code.
 */
export async function bookStart(ui: string, code: string, c: ConvState): Promise<Made> {
  const text = translatingText(ui, code)
  const read = (slots: Slots | null) => readQuestion(text, { slots, raw: '(welcome: a book chosen)', ms: 0 }, c, null)
  const made = await read(null)
  if (made.path?.book === code) return made
  const again = await read({ intent: 'passage', book: code, chapter: null, verse_start: null, verse_end: null, what: ['intro'], lang: ui } as Slots)
  return { ...again, path: { book: code, ch: null, task: 'translate' } }
}

// ------------------------------------------------------------------------------------------------------------ remembered

type Saved = { door?: Door | 'skip'; before?: Answer; studied?: Answer }
// shown in this run: kept here too, so a storage that cannot be written does not bring it back
let shownRun = false
/** Whether the welcome showed on this phone (or in this run); true when the storage cannot be read: better never than every time. */
export function welcomeShown(): boolean {
  if (shownRun) return true
  try {
    return localStorage.getItem(KEY) !== null
  } catch {
    return true
  }
}
/**
 * Whether the welcome is due on this occasion: never shown, nothing asked yet on this phone (`fresh`: no conversation has a
 * message), and How to ask's invitation never shown (a phone that had it before this version keeps it, never both).
 */
export function welcomeDue(fresh: boolean): boolean {
  return fresh && !welcomeShown() && !inviteUsed()
}
/** What was chosen, read back (null: nothing, or no storage). */
export function welcomeSaved(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}
function remember(patch: Saved = {}) {
  shownRun = true
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...(welcomeSaved() ?? {}), ...patch }))
  } catch {}
}
/** "Erase everything" (menu > Safety): a phone handed to someone new shows the welcome again. */
export function forgetWelcome() {
  shownRun = false
  pending = false
  try {
    localStorage.removeItem(KEY)
  } catch {}
}

// ------------------------------------------------------------------------------------------------------------ the page

export type WelcomeHooks = {
  /** the installed packs, the helps language first (as Browse reads them) */
  packs: () => string[]
  /** a question shown as asked (`label`), answered from what `make` reads (door 1: "Voy a traducir Rut", bookStart) */
  start: (label: string, make: (c: ConvState) => Promise<Made>) => void
  /** a learning path starts in the conversation, at its first article (`label`: what the chat shows as asked) */
  learn: (l: Learn, label: string, sheet: Sheet) => void
  browse: () => void
  /** an answer is being written: a door that asks waits */
  busy: () => boolean
}
let hooks: WelcomeHooks | null = null
/** main.ts gives the welcome its ways into the chat once. */
export function setWelcomeHooks(h: WelcomeHooks) {
  hooks = h
}

function el(tag: string, cls = '', text?: string): HTMLElement {
  const d = document.createElement(tag)
  if (cls) d.className = cls
  if (text !== undefined) d.textContent = text
  return d
}
function button(text: string, on: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', cls, text) as HTMLButtonElement
  b.type = 'button'
  b.onclick = on
  return b
}

let opener: HTMLElement | null = null
let quiet: HTMLElement[] = []
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && document.querySelector('#welcome')) {
    e.preventDefault()
    closeWelcome()
  }
}
/** Closes the welcome (Skip, ×, Escape, Android's back button); false when it was not open. Closing it is skipping it. */
export function closeWelcome(): boolean {
  const g = document.querySelector('#welcome')
  if (!g) return false
  g.remove()
  for (const q of quiet) q.inert = false
  quiet = []
  document.removeEventListener('keydown', onKey)
  if (opener?.isConnected) opener.focus({ preventScroll: true })
  opener = null
  return true
}
/** Waits until the answer being written is done (at most a minute), then runs `go`. */
async function whenIdle(go: () => void) {
  for (let t = 0; hooks?.busy() && t < 400; t++) await new Promise((r) => setTimeout(r, 150))
  if (!hooks?.busy()) go()
}

type View = { k: 'home' } | { k: 'book' } | { k: 'q1' } | { k: 'q2'; before: Answer } | { k: 'suggest'; before: Answer; studied: Answer }

/** The welcome over the chat (the first time, and from the menu's "Start over"). Needs setWelcomeHooks first. */
export function openWelcome(ui: string) {
  const h = hooks
  if (!h || document.querySelector('#lock')) return
  remember()
  closeWelcome()
  opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
  const s = WT(ui)
  const dir = rtlLang(ui) ? 'rtl' : 'ltr'
  const wrap = el('div')
  wrap.id = 'welcome'
  const box = el('div', 'card')
  box.dir = dir
  box.setAttribute('role', 'dialog')
  box.setAttribute('aria-modal', 'true')
  box.setAttribute('aria-labelledby', 'welcome-t')
  box.tabIndex = -1
  wrap.appendChild(box)
  // (no closing on a tap outside: on a phone that is too easy to do by mistake on the first screen; × and Skip are there)
  quiet = ([...document.body.children] as HTMLElement[]).filter((x) => !x.inert && x.id !== 'lock')
  for (const q of quiet) q.inert = true
  document.body.appendChild(wrap)
  document.addEventListener('keydown', onKey)
  const stack: View[] = [{ k: 'home' }]
  const done = (door: Door | 'skip', patch: Saved = {}) => {
    remember({ door, ...patch })
    closeWelcome()
  }
  const go = (v: View) => { stack.push(v); draw() }
  const back = () => { if (stack.length > 1) stack.pop(); draw() }

  const draw = () => {
    const v = stack[stack.length - 1]!
    box.replaceChildren()
    const head = el('div', 'wl-head')
    head.appendChild(el('span', 'wl-step', v.k === 'q1' ? s.qStep.replace('{n}', '1') : v.k === 'q2' ? s.qStep.replace('{n}', '2') : ''))
    const x = button('×', () => done('skip'), 'wl-x')
    x.setAttribute('aria-label', s.close)
    head.appendChild(x)
    box.appendChild(head)
    const title = (t: string) => {
      const h2 = el('h2', '', t)
      h2.id = 'welcome-t'
      h2.tabIndex = -1
      box.appendChild(h2)
      return h2
    }
    const nav = (withBack: boolean) => {
      const n = el('div', 'wl-nav')
      if (withBack) n.appendChild(button(s.back, back, 'secondary'))
      n.appendChild(button(s.skip, () => done('skip'), 'secondary'))
      box.appendChild(n)
    }
    let t: HTMLElement
    if (v.k === 'home') {
      t = title(s.title)
      box.appendChild(el('p', 'wl-sub', s.sub))
      const list = el('div', 'wl-doors')
      const door = (d: Door, on: () => void) => {
        const b = button('', on, 'wl-door')
        b.dataset.door = d
        b.append(el('span', 'wl-door-t', s.doors[d][0]), el('span', 'wl-door-s', s.doors[d][1]))
        list.appendChild(b)
      }
      door('book', () => go({ k: 'book' }))
      door('learn', () => go({ k: 'q1' }))
      door('look', () => { done('look'); openHowTo(ui) })
      door('explore', () => { done('explore'); h.browse() })
      box.appendChild(list)
      nav(false)
    } else if (v.k === 'book') {
      t = title(s.whichBook)
      box.appendChild(el('p', 'wl-sub', s.bookNote))
      const list = el('div', 'wl-books')
      list.appendChild(el('p', 'wl-sub', XT(ui).loading))
      box.appendChild(list)
      nav(true)
      // the books the packs on the phone have, in Bible order, Old Testament and New
      booksOf(h.packs()).then((by) => {
        if (!list.isConnected) return
        const have = new Set(Object.values(by).flatMap((x) => [...x]))
        const codes = CANON.filter((c) => have.has(c))
        list.replaceChildren()
        if (!codes.length) { list.appendChild(el('p', 'wl-sub', XT(ui).none)); return }
        for (const [name, part] of [[XT(ui).ot, codes.filter((c) => CANON.indexOf(c) < 39)], [XT(ui).nt, codes.filter((c) => CANON.indexOf(c) >= 39)]] as const) {
          if (!part.length) continue
          list.appendChild(el('h3', 'wl-books-h', name))
          const grid = el('div', 'wl-grid')
          for (const c of part) {
            const b = button(bidiLabel(bookShown(ui, c), ui), () => {
              done('book')
              void whenIdle(() => h.start(translatingText(ui, c), (cs) => bookStart(ui, c, cs)))
            }, 'wl-book')
            b.dataset.book = c
            grid.appendChild(b)
          }
          list.appendChild(grid)
        }
      }).catch(() => {})
    } else if (v.k === 'q1' || v.k === 'q2') {
      t = title(v.k === 'q1' ? s.q1 : s.q2)
      const list = el('div', 'wl-opts')
      ;(v.k === 'q1' ? s.a1 : s.a2).forEach((label, i) => {
        const b = button(label, () => (v.k === 'q1' ? go({ k: 'q2', before: i as Answer }) : go({ k: 'suggest', before: v.before, studied: i as Answer })), 'wl-opt')
        b.dataset.a = String(i)
        list.appendChild(b)
      })
      box.appendChild(list)
      nav(true)
    } else {
      t = title(s.suggestT)
      const level = levelOf(v.before, v.studied)
      const body = el('div', 'wl-suggest')
      body.appendChild(el('p', 'wl-sub', XT(ui).loading))
      box.appendChild(body)
      nav(true)
      void drawSuggest(ui, body, START[level], level === 'experienced', v, done, () => go({ k: 'book' }))
    }
    t.focus({ preventScroll: true })
  }
  draw()
}

/**
 * The suggested start (`kind`, the next one the packs have when they lack it) with its first article, [Start], and the other
 * places to start that the packs have (and, for someone experienced first, translating a book with its notes).
 */
async function drawSuggest(ui: string, body: HTMLElement, kind: LearnKind, withBook: boolean, v: { before: Answer; studied: Answer },
  done: (door: Door | 'skip', patch?: Saved) => void, toBook: () => void) {
  const h = hooks
  if (!h) return
  const s = WT(ui)
  const packs = h.packs()
  const st = await startOf(kind, packs).catch(() => null)
  // the other starts the packs have a manual for (whether a pack has it is known without reading it)
  const readers = await Promise.all(packs.map((l) => openLang(l).catch(() => null)))
  const others = (['intro', 'trips', 'checking'] as LearnKind[])
    .filter((k) => k !== st?.learn.kind && readers.some((r) => r?.installed(`art:ta:${k === 'trips' ? 'translate' : k}`)))
  if (!body.isConnected) return
  body.replaceChildren()
  const begin = (at: Awaited<ReturnType<typeof startOf>>) => {
    if (!at) return
    done('learn', { before: v.before, studied: v.studied })
    void whenIdle(() => h.learn(at.learn, at.first.title, { id: `f${Date.now()}`, intent: 'article', concept: at.first.id, lang: at.learn.lang,
      ref: null, what: [], version: null, term: null, phrase: null, candidates: null }))
  }
  if (!st) body.appendChild(el('p', 'wl-sub', s.none))
  else {
    const card = el('div', 'wl-pick')
    card.append(el('h3', '', partName(ui, st.learn.kind)), el('p', '', s.kinds[st.learn.kind]))
    card.appendChild(el('p', 'wl-first', bidiLabel(s.firstIs.replace('{title}', st.first.title), ui)))
    const go = button(s.start, () => begin(st), 'primary')
    go.dataset.k = 'start'
    card.appendChild(go)
    body.appendChild(card)
  }
  const alt: [string, () => void][] = []
  if (withBook) alt.push([s.withBook, toBook])
  for (const k of others) alt.push([partName(ui, k), () => { void startOf(k, packs).then(begin) }])
  if (!withBook && st) alt.push([s.withBook, toBook])
  if (alt.length) {
    body.appendChild(el('p', 'wl-other', s.other))
    const row = el('div', 'wl-alts')
    for (const [label, on] of alt) row.appendChild(button(label, on, 'secondary'))
    body.appendChild(row)
  }
  body.appendChild(el('p', 'wl-note', s.change.replace('{browse}', XT(ui).browse)))
}

// ----------------------------------------------------------------------------------------------------- the welcome's slot

let pending = false
/** The other screens the welcome waits for: the PIN, the first questions, About, a report, How to ask, Browse, the Map, Saved, the menu. */
const BUSY = '#lock, #safety, #about, #report, #howto, #welcome, #explore.open, #gmap.open, #saved.open, #panel.show'
/**
 * What the welcome offers once a language is on the phone, in the one slot main.ts renderConv has for it (`occasion`: the empty
 * conversation it shows in; `fresh`: nothing asked yet on this phone): the first time, this screen, opened over the empty
 * conversation as soon as nothing else is on screen; after it showed, nothing (it replaced How to ask's invitation, still in the
 * menu); on a phone that had the invitation before this screen existed, the invitation as before.
 */
export function offerFirst(ui: string, occasion: string, fresh: boolean): HTMLElement | null {
  if (welcomeDue(fresh) && hooks) {
    if (!pending) {
      pending = true
      // (the first screens, the PIN, may be on top: it opens when they are gone, if the conversation is still empty)
      const tick = (n: number) => {
        if (!pending) return
        if (!document.querySelector('#log .welcome')) { pending = false; return }
        if (document.querySelector(BUSY) || hooks?.busy()) { if (n < 2000) setTimeout(() => tick(n + 1), 300); else pending = false; return }
        pending = false
        openWelcome(ui)
      }
      setTimeout(() => tick(0), 0)
    }
    return null
  }
  if (welcomeShown() || pending) return null
  return offerAfterFirstUse(ui, occasion)
}
