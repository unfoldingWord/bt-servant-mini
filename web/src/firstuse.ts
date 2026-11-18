// First use: with no language on the phone (light build, iOS app, web app), the chat offers the languages to download right
// there, each with its size, the phone's language picked; a progress bar, cancel and retry. And the welcome's examples, made
// from what the installed pack has, so none names a book the pack lacks.
import { CANDIDATES, downloadLang, offers, PACK_NAMES, type Offer, type Progress } from './packs'
import { bookLabel } from './converse'
import books from './data/books.json'
import { rtlLang } from './bidi'

type F = {
  title: string; lead: string; looking: string; download: string; cancel: string; retry: string; offline: string
  stopped: string; canceled: string; of: string; file: string; kept: string; books: string
  resume: string; model: string; modelGo: string
}
const STR: Record<string, F> = {
  en: {
    title: 'Choose a language for the helps', lead: 'Download it once (internet needed). After that, everything works without internet.',
    looking: 'Looking for languages…', download: 'Download', cancel: 'Cancel', retry: 'Try again',
    offline: 'No internet, or the server did not answer.',
    stopped: 'The download stopped:', canceled: 'Download canceled. What already arrived stays on the phone.', of: '{a} of {b}',
    file: 'Or load a .tcpack file', kept: 'I kept your question. Choose a language below: I will answer it as soon as the language is on the phone.',
    books: '{n} books',
    resume: 'Continue', model: 'Also download the reading model ({size}) to ask free questions without internet.', modelGo: 'Download the model',
  },
  es: {
    title: 'Elige un idioma para las ayudas', lead: 'Descárgalo una vez (necesita internet). Después, todo funciona sin internet.',
    looking: 'Buscando idiomas…', download: 'Descargar', cancel: 'Cancelar', retry: 'Reintentar',
    offline: 'Sin internet, o el servidor no respondió.',
    stopped: 'La descarga se detuvo:', canceled: 'Descarga cancelada. Lo que ya llegó se queda en el teléfono.', of: '{a} de {b}',
    file: 'O carga un archivo .tcpack', kept: 'Guardé tu pregunta. Elige un idioma aquí abajo: la responderé en cuanto el idioma esté en el teléfono.',
    books: '{n} libros',
    resume: 'Continuar', model: 'Descarga también el modelo de lectura ({size}) para hacer preguntas libres sin internet.', modelGo: 'Descargar el modelo',
  },
  fr: {
    title: 'Choisissez une langue pour les aides', lead: 'Téléchargez-la une fois (internet nécessaire). Ensuite, tout fonctionne sans internet.',
    looking: 'Recherche des langues…', download: 'Télécharger', cancel: 'Annuler', retry: 'Réessayer',
    offline: "Pas d'internet, ou le serveur n'a pas répondu.",
    stopped: "Le téléchargement s'est arrêté :", canceled: 'Téléchargement annulé. Ce qui est déjà arrivé reste sur le téléphone.', of: '{a} sur {b}',
    file: 'Ou chargez un fichier .tcpack', kept: "J'ai gardé votre question. Choisissez une langue ci-dessous : j'y répondrai dès que la langue sera sur le téléphone.",
    books: '{n} livres',
    resume: 'Continuer', model: 'Téléchargez aussi le modèle de lecture ({size}) pour poser des questions libres sans internet.', modelGo: 'Télécharger le modèle',
  },
  id: {
    title: 'Pilih bahasa untuk bahan bantu', lead: 'Unduh sekali (perlu internet). Setelah itu, semuanya bekerja tanpa internet.',
    looking: 'Mencari bahasa…', download: 'Unduh', cancel: 'Batal', retry: 'Coba lagi',
    offline: 'Tidak ada internet, atau server tidak menjawab.',
    stopped: 'Unduhan berhenti:', canceled: 'Unduhan dibatalkan. Yang sudah masuk tetap ada di ponsel.', of: '{a} dari {b}',
    file: 'Atau muat berkas .tcpack', kept: 'Pertanyaan Anda saya simpan. Pilih bahasa di bawah: saya akan menjawabnya begitu bahasa itu ada di ponsel.',
    books: '{n} kitab',
    resume: 'Lanjutkan', model: 'Unduh juga model pembaca ({size}) untuk mengajukan pertanyaan bebas tanpa internet.', modelGo: 'Unduh model',
  },
  hi: {
    title: 'सहायता की भाषा चुनें', lead: 'इसे एक बार डाउनलोड करें (इंटरनेट चाहिए)। उसके बाद सब कुछ बिना इंटरनेट चलता है।',
    looking: 'भाषाएँ खोजी जा रही हैं…', download: 'डाउनलोड करें', cancel: 'रद्द करें', retry: 'फिर कोशिश करें',
    offline: 'इंटरनेट नहीं है, या सर्वर ने उत्तर नहीं दिया।',
    stopped: 'डाउनलोड रुक गया:', canceled: 'डाउनलोड रद्द हुआ। जो आ चुका है वह फ़ोन पर रहेगा।', of: '{b} में से {a}',
    file: 'या .tcpack फ़ाइल लोड करें', kept: 'मैंने आपका प्रश्न रख लिया है। नीचे एक भाषा चुनें: भाषा फ़ोन पर आते ही मैं उत्तर दूँगा।',
    books: '{n} पुस्तकें',
    resume: 'जारी रखें', model: 'बिना इंटरनेट के खुले प्रश्न पूछने के लिए पढ़ने वाला मॉडल ({size}) भी डाउनलोड करें।', modelGo: 'मॉडल डाउनलोड करें',
  },
  ar: {
    title: 'اختر لغة المساعدات', lead: 'نزّلها مرة واحدة (يلزم الإنترنت). بعد ذلك يعمل كل شيء دون إنترنت.',
    looking: 'جارٍ البحث عن اللغات…', download: 'تنزيل', cancel: 'إلغاء', retry: 'إعادة المحاولة',
    offline: 'لا يوجد إنترنت، أو لم يُجب الخادم.',
    stopped: 'توقف التنزيل:', canceled: 'أُلغي التنزيل. ما وصل يبقى على الهاتف.', of: '{a} من {b}',
    file: 'أو حمّل ملف ‎.tcpack', kept: 'احتفظت بسؤالك. اختر لغة من الأسفل: سأجيب عنه حالما تصبح اللغة على الهاتف.',
    books: 'الأسفار: {n}',
    resume: 'متابعة', model: 'نزّل أيضًا نموذج القراءة ({size}) لتطرح أسئلة حرة دون إنترنت.', modelGo: 'تنزيل النموذج',
  },
}
export const FU = (ui: string): F => STR[ui] ?? STR.en!

// ------------------------------------------------------------------------------------------------------------- the empty screen

/** The empty conversation's one line, and its quick action for a guided mode (Browse's and How to ask's own names are theirs). */
const EMPTY: Record<string, { line: string; mode: string }> = {
  en: { line: 'Ask about a verse, a word or a story. Works without internet.', mode: 'Start a guided mode' },
  es: { line: 'Pregunta por un versículo, una palabra o una historia. Funciona sin internet.', mode: 'Empezar un modo' },
  fr: { line: 'Posez une question sur un verset, un mot ou une histoire. Fonctionne sans internet.', mode: 'Lancer un mode guidé' },
  id: { line: 'Tanyakan tentang sebuah ayat, kata, atau kisah. Bekerja tanpa internet.', mode: 'Mulai mode terpandu' },
  hi: { line: 'किसी पद, शब्द या कहानी के बारे में पूछें। बिना इंटरनेट के काम करता है।', mode: 'निर्देशित तरीका शुरू करें' },
  ar: { line: 'اسأل عن آية أو كلمة أو قصة. يعمل دون إنترنت.', mode: 'ابدأ مسارًا موجّهًا' },
}
export const emptyLine = (ui: string): string => (EMPTY[ui] ?? EMPTY.en!).line
export const emptyModeLabel = (ui: string): string => (EMPTY[ui] ?? EMPTY.en!).mode
/** The pills of the empty conversation, in order: Resume (a saved 5M session, each), Browse, Start a mode (only when a mode is there), How to ask. */
export type Quick = { kind: 'resume' | 'explore' | 'mode' | 'howto'; label: string }
export function quickSpec(ui: string, o: { modes: boolean; resume: string[]; explore: string; howto: string }): Quick[] {
  return [
    ...o.resume.map((label): Quick => ({ kind: 'resume', label })),
    { kind: 'explore', label: o.explore },
    ...(o.modes ? [{ kind: 'mode' as const, label: emptyModeLabel(ui) }] : []),
    { kind: 'howto', label: o.howto },
  ]
}

/** "2.6 MB", "0.4 MB". */
export const size = (n: number) => `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`

/** The pack for a language code of the app or the phone ("es" → es-419, "pt-BR" → pt-br), or null. */
export function packFor(code: string): string | null {
  const c = code.toLowerCase()
  if (CANDIDATES.includes(c)) return c
  const base = c.split('-')[0]!
  if (base === 'es') return 'es-419'
  if (base === 'pt') return 'pt-br'
  return CANDIDATES.includes(base) ? base : null
}
/** Which offered pack to pick first: the question's language, then the app's, then the phone's; else the first offered. */
export function preferred(list: string[], codes: string[]): string | null {
  for (const c of codes) {
    const p = c ? packFor(c) : null
    if (p && list.includes(p)) return p
  }
  return list[0] ?? null
}

// ------------------------------------------------------------------------------------------------------------- the picker

type Phase = 'idle' | 'looking' | 'list' | 'offline' | 'downloading' | 'failed'
const st: {
  phase: Phase; offers: Offer[]; sel: string | null; chosen: boolean; p: Progress | null; error: string; abort: AbortController | null
  mounted: HTMLElement | null; ui: string; prefer: string[]
} = { phase: 'idle', offers: [], sel: null, chosen: false, p: null, error: '', abort: null, mounted: null, ui: 'en', prefer: [] }
let hooks: { done: (lang: string) => void | Promise<void>; file: () => void } = { done: () => {}, file: () => {} }

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
const nameOf = (l: string) => PACK_NAMES[l] ?? l

function redraw() {
  if (st.mounted?.isConnected) {
    const fresh = build()
    st.mounted.replaceWith(fresh)
    st.mounted = fresh
  }
}

/** The language picked for the person: a download that did not end ("Continue"), else the preferred languages' pack. */
function pick() {
  st.sel = st.offers.find((o) => o.partial)?.lang ?? preferred(st.offers.map((o) => o.lang), st.prefer)
}
async function look() {
  st.phase = 'looking'
  redraw()
  const list = await offers().catch(() => [] as Offer[])
  st.offers = list
  // nothing back: most likely the connection or the server (a phone in a light build has candidates on the server); a retry
  st.phase = list.length ? 'list' : 'offline'
  if (!st.chosen || !list.some((o) => o.lang === st.sel)) pick()
  redraw()
}

async function start() {
  const offer = st.offers.find((o) => o.lang === st.sel)
  if (!offer) return
  st.phase = 'downloading'
  st.p = { done: 0, total: offer.segments.length, bytes: 0, totalBytes: offer.bytes }
  st.abort = new AbortController()
  redraw()
  try {
    await downloadLang(offer.lang, (p) => {
      st.p = p
      paint()
    }, { offer, signal: st.abort.signal })
    st.phase = 'idle'
    st.abort = null
    await hooks.done(offer.lang)
  } catch (e) {
    offer.partial = true // what arrived stays: the next try goes on from there
    const canceled = st.abort?.signal.aborted
    st.abort = null
    st.phase = 'failed'
    st.error = canceled ? FU(st.ui).canceled : `${FU(st.ui).stopped} ${e instanceof Error ? e.message : String(e)}`
    redraw()
  }
}

/** Updates the bar in place (a redraw per segment would rebuild the card 160 times). */
function paint() {
  const box = st.mounted
  if (!box?.isConnected || !st.p) return
  const bar = box.querySelector<HTMLElement>('.fu-bar > i')
  const line = box.querySelector<HTMLElement>('.fu-progress')
  const total = st.p.totalBytes || 1
  const pct = Math.min(100, Math.round((st.p.bytes / total) * 100))
  if (bar) bar.style.width = `${pct}%`
  box.querySelector('.fu-bar')?.setAttribute('aria-valuenow', String(pct))
  if (line) line.textContent = FU(st.ui).of.replace('{a}', size(st.p.bytes)).replace('{b}', size(st.p.totalBytes))
}

function build(): HTMLElement {
  const s = FU(st.ui)
  const box = el('div', 'fu')
  box.dir = rtlLang(st.ui) ? 'rtl' : 'auto' // in the app's direction (a Latin pack name first must not turn it)
  box.appendChild(el('h3', '', s.title))
  box.appendChild(el('p', 'fu-lead', s.lead))
  const sel = st.offers.find((o) => o.lang === st.sel)
  if (st.phase === 'looking' || st.phase === 'idle') {
    box.appendChild(el('p', 'fu-note', s.looking))
  } else if (st.phase === 'offline') {
    box.appendChild(el('p', 'fu-note', s.offline))
    box.appendChild(button(s.retry, () => void look(), 'fu-go'))
  } else if (st.phase === 'downloading' && sel) {
    box.appendChild(el('p', 'fu-name', `${nameOf(sel.lang)} · ${size(sel.bytes)}`))
    const bar = el('div', 'fu-bar')
    bar.setAttribute('role', 'progressbar')
    bar.setAttribute('aria-valuemin', '0')
    bar.setAttribute('aria-valuemax', '100')
    bar.appendChild(el('i'))
    box.append(bar, el('p', 'fu-progress', s.of.replace('{a}', size(0)).replace('{b}', size(sel.bytes))))
    box.appendChild(button(s.cancel, () => st.abort?.abort(), 'fu-alt'))
    queueMicrotask(paint)
  } else {
    // the list (and after a failure, the same list with the reason and a retry: what arrived stays, the retry goes on from there)
    const list = el('div', 'fu-list')
    list.setAttribute('role', 'radiogroup')
    for (const o of st.offers) {
      const b = button('', () => {
        st.sel = o.lang
        st.chosen = true
        redraw()
      }, o.lang === st.sel ? 'on' : '')
      b.setAttribute('role', 'radio')
      b.setAttribute('aria-checked', String(o.lang === st.sel))
      b.append(el('span', 'fu-l', nameOf(o.lang)), el('span', 'fu-s', `${size(o.bytes)} · ${s.books.replace('{n}', String(o.books.length))}`))
      list.appendChild(b)
    }
    box.appendChild(list)
    if (st.phase === 'failed') box.appendChild(el('p', 'fu-note fu-err', st.error))
    // a download that did not end (cancelled, or the app was closed in the middle) goes on: "Continue"
    const verb = st.phase === 'failed' ? s.retry : sel?.partial ? s.resume : s.download
    if (sel) box.appendChild(button(`${verb} · ${nameOf(sel.lang)} · ${size(sel.bytes)}`, () => void start(), 'fu-go'))
  }
  if (st.phase !== 'downloading') box.appendChild(button(s.file, () => hooks.file(), 'fu-file'))
  return box
}

/**
 * The language picker for a phone with no language: a card that keeps its state across redraws of the chat (a download goes
 * on while the conversation is drawn again). `prefer`: language codes to pick first (the question's, the app's, the phone's).
 */
export function languagePicker(ui: string, prefer: string[], h: typeof hooks): HTMLElement {
  st.ui = ui
  st.prefer = prefer
  hooks = h
  // a question asked in another language than the one picked for the person: its language comes first, unless they chose
  if (!st.chosen && st.phase === 'list') pick()
  const box = build()
  st.mounted = box
  if (st.phase === 'idle') void look()
  return box
}
/** Whether a download started from the picker is running. */
export const downloading = () => st.phase === 'downloading'

// ------------------------------------------------------------------------------------------------------------- book names

const FR_ACCENTS: Record<string, string> = { gen: 'Genèse', eph: 'Éphésiens', act: 'Actes', deu: 'Deutéronome', lev: 'Lévitique', ecc: 'Ecclésiaste', hab: 'Habacuc' }
/** A book's name in the app's language: the names the app writes (en, es, ar), else the first name the app reads for it (fr, id, hi). */
export function bookShown(ui: string, code: string): string {
  if (ui === 'en' || ui === 'es' || ui === 'ar') return bookLabel(ui, code)
  if (ui === 'fr' && FR_ACCENTS[code]) return FR_ACCENTS[code]!
  const name = Object.entries((books as Record<string, Record<string, string>>)[ui] ?? {}).find(([, c]) => c === code)?.[0]
  if (!name) return bookLabel('en', code)
  return ui === 'hi' ? name : name.replace(/(^|\s)(\p{L})/gu, (_, sp, ch) => sp + ch.toUpperCase())
}
