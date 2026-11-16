// BT Servant Mini: a chat page. Question -> offline model (slots) -> call sheet -> recipe over the installed language packs ->
// a presenting sentence (converse.ts) + the information found + follow-ups. Up to three conversations, kept on the phone.
import { passageContext, resetLangs, type Sheet } from './answer'
import { backPanel, fillTitles, markCited, renderHelpCards, renderHelps, renderStudy, setHooks, setViewLang } from './view'
import { chooseCards, moreLabel, showsCards } from './helpcards'
import { bookExact, buildSheet, type Slots } from './sheet'
import { appVersion, downloadModel, followUps, isLite, LIMITED, MODEL, modelOff, modelOutdated, modelReady, modelState, PWA, slotsOf } from './model'
import { aboutLabel, whatYouCanAsk, languagesSection, modelLine, modelNotice, modelNewer, modelSection, modelTitle, PACK_NAMES, packsTitle, showAbout } from './setup'
import { installedLangs, onPacksChanged, openLang, updateLangs } from './packs'
import { buildContext, packReader, plainContext } from './context'
import { type Again, againStep, bookLabel, browseStep, type Followup } from './converse'
import { has } from './commands'
import { resetSearch } from './search'
import { md, mdDir } from './md'
import { bidiLabel, dirOf, rtlLang, strip } from './bidi'
import { askSafety, closeSafety, safetyAsked } from './safety'
import { autoCheckUpdate, checkForUpdate, updateRow, updateSupported } from './update'
import { hint as pwaHint } from './pwa'
import { askReport, closeReport, feedbackBar, FT, type ReportMsg, sendFeedback, submitReport } from './feedback'
import { applyBrand, discreetOn, keepHistory, lock, locked, protectSummary, protectView, PT, setDiscreet, watchAway } from './protect'
import { count, lastSent, pendingReport, sendUsage, setSnapshot, setUsageOn, todayCounts, usageOn, USAGE_T } from './usage'
import { answer, type ConvState, directRef, env, guessLang, type Made, MAX_CONVS, moveOut, NP, pathLabel, pathSheet, placeLabel, questionOf, readQuestion, type Reply, resetBooks, returnTo, roomForNew, stateLine } from './pipeline'
import { backLine, GD, GT, mapRows, nodeOf } from './graph'
import { isOnline, modelLabel, onlineAnswer, onlineAvailable, onlineOn, onlineProblem, onlineSession, onlineSlots, type OnlineAnswer, setOnline, signIn, signInAvailable, signOut } from './online'
import { shareButton } from './share'
import { examplesFor, FU, languagePicker, packFor } from './firstuse'
import { backExplore, closeExplore, openExplore, openExploreAt, resetExplore, setExploreHooks, XT } from './explore'
import { composerSwitch, mountComposer } from './composer'

type UiText = {
  ph: string; send: string; loading: string; ready: string; thinking: string; failed: string; details: string; hello: string; ex: string[]
  chats: string; newChat: string; max: string; del: string; confirmDel: string; untitled: string; appLang: string; packs: string; welcome: string; helps: string; auto: string
}
const UI: Record<string, UiText> = {
  en: {
    ph: 'Ask about a verse or a word…', send: 'Send', loading: 'Starting the offline model…', ready: 'Works without internet',
    thinking: 'Looking in the translation helps…', failed: 'Something went wrong:', details: 'details',
    hello: "Hello! On this phone I work as a search assistant, not a chat: I find what you need in the translation helps (Bible texts, notes, key terms, questions, Academy), without internet. Ask for a verse, a word or a topic. With online AI turned on and internet, a larger model also explains what I find.",
    ex: ['What does Jonah 3:9 say in the UST?', 'What does grace mean?', 'Where was Jonah swallowed by the fish?', 'What do the notes say about Ruth 1:16?'],
    chats: 'Conversations', newChat: 'New conversation', max: 'You can keep up to 3 conversations. Delete one to start another.',
    del: 'Delete', confirmDel: 'Delete this conversation?', untitled: 'New conversation',
    appLang: 'App language', packs: 'Installed language packs', welcome: 'How can I help with your translation?', helps: 'Language of the helps', auto: 'Same as my question',
  },
  es: {
    ph: 'Pregunta por un versículo o palabra…', send: 'Enviar', loading: 'Iniciando el modelo sin conexión…',
    ready: 'Funciona sin internet', thinking: 'Buscando en las ayudas de traducción…', failed: 'Algo salió mal:', details: 'detalles',
    hello: "¡Hola! En este teléfono funciono como un buscador asistido, no como un chat: encuentro lo que necesitas en las ayudas de traducción (textos bíblicos, notas, palabras clave, preguntas, Academia), sin internet. Pide un versículo, una palabra o un tema. Con la IA en línea activada y con internet, un modelo más grande además explica lo que encuentro.",
    ex: ['¿Qué notas hay para Tito 1:1?', '¿Qué significa gracia?', '¿Dónde fue tragado Jonás por un pez?', '¿Qué dice Jonás 3:9?'],
    chats: 'Conversaciones', newChat: 'Nueva conversación', max: 'Puedes tener hasta 3 conversaciones. Borra una para empezar otra.',
    del: 'Borrar', confirmDel: '¿Borrar esta conversación?', untitled: 'Conversación nueva',
    appLang: 'Idioma de la app', packs: 'Paquetes de idioma instalados', welcome: '¿En qué te ayudo con tu traducción?', helps: 'Idioma de las ayudas', auto: 'El de mi pregunta',
  },
  fr: {
    ph: 'Un verset, un mot…', send: 'Envoyer', loading: 'Démarrage du modèle hors ligne…', ready: 'Fonctionne sans internet',
    thinking: 'Je cherche dans les aides à la traduction…', failed: 'Une erreur est survenue :', details: 'détails',
    hello: "Bonjour ! Sur ce téléphone, je fonctionne comme un assistant de recherche, pas comme une messagerie : je trouve ce dont vous avez besoin dans les aides à la traduction (textes bibliques, notes, termes clés, questions, Academy), sans internet. Demandez un verset, un mot ou un sujet. Avec l'IA en ligne activée et internet, un modèle plus grand explique aussi ce que je trouve.",
    ex: ['Que dit Jonas 1:3 ?', 'Que signifie le mot grâce ?', 'Où Jonas a-t-il été avalé par le poisson ?'],
    chats: 'Conversations', newChat: 'Nouvelle conversation', max: "Vous pouvez garder 3 conversations. Supprimez-en une pour en commencer une autre.",
    del: 'Supprimer', confirmDel: 'Supprimer cette conversation ?', untitled: 'Nouvelle conversation',
    appLang: "Langue de l'application", packs: 'Paquets de langue installés', welcome: 'Comment puis-je aider votre traduction ?', helps: 'Langue des aides', auto: 'Celle de ma question',
  },
  id: {
    ph: 'Tanya tentang ayat atau kata…', send: 'Kirim', loading: 'Memulai model offline…', ready: 'Bisa tanpa internet',
    thinking: 'Mencari di bahan bantu penerjemahan…', failed: 'Terjadi kesalahan:', details: 'detail',
    hello: "Halo! Di ponsel ini saya bekerja sebagai asisten pencari, bukan obrolan: saya menemukan yang Anda perlukan di bahan bantu penerjemahan (teks Alkitab, catatan, istilah kunci, pertanyaan, Academy), tanpa internet. Mintalah sebuah ayat, kata, atau topik. Dengan AI daring aktif dan ada internet, model yang lebih besar juga menjelaskan apa yang saya temukan.",
    ex: ['Apa kata Yunus 3:9 dalam UST?', 'Apa arti kata kasih karunia?', 'Di mana Yunus ditelan ikan?'],
    chats: 'Percakapan', newChat: 'Percakapan baru', max: 'Anda bisa menyimpan 3 percakapan. Hapus satu untuk memulai yang lain.',
    del: 'Hapus', confirmDel: 'Hapus percakapan ini?', untitled: 'Percakapan baru',
    appLang: 'Bahasa aplikasi', packs: 'Paket bahasa terpasang', welcome: 'Apa yang bisa saya bantu untuk terjemahan Anda?', helps: 'Bahasa bahan bantu', auto: 'Sesuai pertanyaan saya',
  },
  hi: {
    ph: 'किसी पद या शब्द के बारे में पूछें…', send: 'भेजें', loading: 'ऑफ़लाइन मॉडल शुरू हो रहा है…', ready: 'बिना इंटरनेट चलता है',
    thinking: 'अनुवाद सहायता में खोज रहा हूँ…', failed: 'कुछ गलत हो गया:', details: 'विवरण',
    hello: "नमस्ते! इस फ़ोन पर मैं एक खोज सहायक की तरह काम करता हूँ, चैट की तरह नहीं: मैं अनुवाद सहायताओं (बाइबल पाठ, नोट्स, मुख्य शब्द, प्रश्न, Academy) में आपकी ज़रूरत की जानकारी ढूँढता हूँ, बिना इंटरनेट के। कोई पद, शब्द या विषय पूछें। ऑनलाइन AI चालू हो और इंटरनेट हो, तो एक बड़ा मॉडल मेरी ढूँढी हुई जानकारी को समझाता भी है।",
    ex: ['योना 3:9 क्या कहता है?', 'अनुग्रह का क्या अर्थ है?', 'योना को मछली ने कहाँ निगल लिया?'],
    chats: 'बातचीत', newChat: 'नई बातचीत', max: 'आप 3 बातचीत रख सकते हैं। नई शुरू करने के लिए एक हटाएँ।',
    del: 'हटाएँ', confirmDel: 'यह बातचीत हटाएँ?', untitled: 'नई बातचीत',
    appLang: 'ऐप की भाषा', packs: 'स्थापित भाषा पैकेज', welcome: 'आपके अनुवाद में मैं कैसे मदद करूँ?', helps: 'सहायता की भाषा', auto: 'मेरे प्रश्न वाली',
  },
  ar: {
    ph: 'اسأل عن آية أو كلمة…', send: 'إرسال', loading: 'جارٍ تشغيل النموذج دون اتصال…', ready: 'يعمل دون إنترنت',
    thinking: 'أبحث في مساعدات الترجمة…', failed: 'حدث خطأ:', details: 'التفاصيل',
    hello: "مرحبًا! أعمل على هذا الهاتف كمساعد بحث، لا كمحادثة: أجد ما تحتاج إليه في مساعدات الترجمة (نصوص الكتاب المقدس، الملاحظات، المصطلحات الرئيسية، الأسئلة، الأكاديمية)، دون إنترنت. اطلب آية أو كلمة أو موضوعًا. وعند تفعيل الذكاء الاصطناعي عبر الإنترنت وتوفر الاتصال، يشرح نموذج أكبر أيضًا ما أجده.",
    ex: ['ماذا يقول يونان ١:٣؟', 'ما معنى كلمة نعمة؟', 'أين ابتلع الحوت يونان؟', 'ساعدني في ترجمة يونان ١'],
    chats: 'المحادثات', newChat: 'محادثة جديدة', max: 'يمكنك الاحتفاظ بثلاث محادثات. احذف واحدة لتبدأ أخرى.',
    del: 'حذف', confirmDel: 'حذف هذه المحادثة؟', untitled: 'محادثة جديدة',
    appLang: 'لغة التطبيق', packs: 'حزم اللغات المثبتة', welcome: 'كيف أساعدك في ترجمتك؟', helps: 'لغة المساعدات', auto: 'لغة سؤالي',
  },
}
const ONLINE_T: Record<string, { label: string; writing: string; sources: string; toggle: string; note: string; signIn: string; signedIn: string; signOut: string; signInNote: string; relogin: string; limit: string }> = {
  en: { label: 'Online AI', writing: 'Writing with online AI…', sources: 'Helps found (sources)', toggle: 'Answers with online AI (when there is internet)', note: 'Your question and the helps found are sent to an online model. Without internet the app answers as usual.', signIn: "Sign in with Google", signedIn: "Signed in{n}", signOut: "Sign out", signInNote: "Online AI asks you to sign in with Google. The service keeps only a code for your account, to count your answers of the day.", relogin: "Your online AI session ended: sign in again in the menu.", limit: "Online AI has reached today's limit; the answer below is from the phone." },
  es: { label: 'IA en línea', writing: 'Escribiendo con IA en línea…', sources: 'Ayudas encontradas (fuentes)', toggle: 'Respuestas con IA en línea (cuando haya internet)', note: 'Tu pregunta y las ayudas encontradas se envían a un modelo en línea. Sin internet, la app responde como siempre.', signIn: "Iniciar sesión con Google", signedIn: "Sesión iniciada{n}", signOut: "Cerrar sesión", signInNote: "La IA en línea pide iniciar sesión con Google. El servicio solo guarda un código de tu cuenta, para contar tus respuestas del día.", relogin: "Tu sesión de IA en línea terminó: vuelve a iniciarla en el menú.", limit: "La IA en línea llegó al límite de hoy; la respuesta de abajo es la del teléfono." },
  fr: { label: 'IA en ligne', writing: "Rédaction avec l'IA en ligne…", sources: 'Aides trouvées (sources)', toggle: 'Réponses avec IA en ligne (quand il y a internet)', note: "Votre question et les aides trouvées sont envoyées à un modèle en ligne. Sans internet, l'application répond comme d'habitude.", signIn: "Se connecter avec Google", signedIn: "Connecté{n}", signOut: "Se déconnecter", signInNote: "L'IA en ligne demande de se connecter avec Google. Le service ne garde qu'un code de votre compte, pour compter vos réponses du jour.", relogin: "Votre session d'IA en ligne a pris fin : reconnectez-vous dans le menu.", limit: "L'IA en ligne a atteint la limite du jour ; la réponse ci-dessous vient du téléphone." },
  id: { label: 'AI daring', writing: 'Menulis dengan AI daring…', sources: 'Bahan bantu yang ditemukan (sumber)', toggle: 'Jawaban dengan AI daring (saat ada internet)', note: 'Pertanyaan Anda dan bahan bantu yang ditemukan dikirim ke model daring. Tanpa internet, aplikasi menjawab seperti biasa.', signIn: "Masuk dengan Google", signedIn: "Sudah masuk{n}", signOut: "Keluar", signInNote: "AI daring meminta Anda masuk dengan Google. Layanan hanya menyimpan sebuah kode akun Anda, untuk menghitung jawaban Anda hari ini.", relogin: "Sesi AI daring Anda berakhir: masuk lagi di menu.", limit: "AI daring sudah mencapai batas hari ini; jawaban di bawah berasal dari ponsel." },
  hi: { label: 'ऑनलाइन AI', writing: 'ऑनलाइन AI से लिखा जा रहा है…', sources: 'मिली सहायता (स्रोत)', toggle: 'ऑनलाइन AI से उत्तर (जब इंटरनेट हो)', note: 'आपका प्रश्न और मिली सहायता एक ऑनलाइन मॉडल को भेजी जाती है। इंटरनेट के बिना ऐप सामान्य रूप से उत्तर देता है।', signIn: "Google से साइन इन करें", signedIn: "साइन इन है{n}", signOut: "साइन आउट", signInNote: "ऑनलाइन AI के लिए Google से साइन इन करना होता है। सेवा आपके खाते का केवल एक कोड रखती है, आज के आपके उत्तर गिनने के लिए।", relogin: "आपका ऑनलाइन AI सत्र समाप्त हो गया: मेनू में फिर से साइन इन करें।", limit: "ऑनलाइन AI आज की सीमा तक पहुँच गया; नीचे का उत्तर फ़ोन से है।" },
  ar: { label: 'ذكاء اصطناعي عبر الإنترنت', writing: 'جارٍ الكتابة بالذكاء الاصطناعي عبر الإنترنت…', sources: 'المساعدات التي وُجدت (المصادر)', toggle: 'إجابات بالذكاء الاصطناعي عبر الإنترنت (عند توفر الإنترنت)', note: 'يُرسَل سؤالك والمساعدات التي وُجدت إلى نموذج عبر الإنترنت. دون إنترنت يجيب التطبيق كالمعتاد.', signIn: "تسجيل الدخول باستخدام Google", signedIn: "تم تسجيل الدخول{n}", signOut: "تسجيل الخروج", signInNote: "يطلب الذكاء الاصطناعي عبر الإنترنت تسجيل الدخول باستخدام Google. لا تحتفظ الخدمة إلا برمز لحسابك، لعدّ إجاباتك اليومية.", relogin: "انتهت جلسة الذكاء الاصطناعي عبر الإنترنت: سجّل الدخول مجددًا من القائمة.", limit: "بلغ الذكاء الاصطناعي عبر الإنترنت حدّ اليوم؛ الإجابة أدناه من الهاتف." },
}
const OT = () => ONLINE_T[nav] ?? ONLINE_T.en!
const UI_LANGS: [string, string][] = [['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['id', 'Bahasa Indonesia'], ['hi', 'हिन्दी'], ['ar', 'العربية']]
const UI_KEY = 'btsm.ui'
const PACK_KEY = 'btsm.helps'
let helpsLang: string | null = (() => {
  try {
    return localStorage.getItem(PACK_KEY) || null
  } catch {
    return null
  }
})()
let nav = (() => {
  try {
    const saved = localStorage.getItem(UI_KEY)
    if (saved && UI[saved]) return saved
  } catch {}
  const n = (navigator.language || 'en').slice(0, 2)
  return UI[n] ? n : 'en'
})()
let T = UI[nav]!
// the decisions (pipeline.ts) read the app's language and the helps language from here
Object.defineProperties(env, {
  nav: { get: () => nav }, helpsLang: { get: () => helpsLang }, details: { get: () => T.details },
  packName: { value: (l: string) => PACK_NAMES[l] ?? l },
})
const LOGO = document.querySelector('.brand svg')!.outerHTML

// ------------------------------------------------------------------------------------------------------------ conversations

/** A message: the person's question, or an answer (pipeline.ts) with what the page adds to it. */
type Msg = Reply & {
  who: 'me' | 'bot'
  /** the online answer, with the articles it was grounded in (older saved answers have no sources) */
  ai?: { text: string; model: string; sources?: OnlineAnswer['sources'] }
  /** the person's thumbs on this answer, and whether they sent a report about it */
  rating?: 'up' | 'down'; reported?: boolean
  /** asked with no language on the phone: the question waits, and is asked again (once) when a language has downloaded */
  waiting?: boolean
  /** an answer: its point in the conversation's graph (graph.ts); the person's: `mark`, where they went back to a point */
  node?: string; mark?: boolean
}
type Conv = ConvState & { id: string; title: string; updated: number; msgs: Msg[] }
const KEY = 'btsm.conversations.v1'
const MAX = MAX_CONVS
let convs: Conv[] = []
let current = ''
function load() {
  // conversations not kept (menu > Safety): nothing is read or written on the phone
  if (!keepHistory()) {
    try { localStorage.removeItem(KEY) } catch {}
    if (!convs.length) newConv()
    return
  }
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (d && Array.isArray(d.convs)) {
      convs = d.convs
      current = d.current
    }
  } catch {}
  if (!convs.length) newConv()
  if (!convs.some((c) => c.id === current)) current = convs[0]!.id
}
function save() {
  // the interactive passage is kept for the last messages of each conversation; older ones show their text answer
  for (const c of convs) c.msgs.slice(0, -8).forEach((m) => delete m.study)
  try {
    if (keepHistory()) localStorage.setItem(KEY, JSON.stringify({ convs, current }))
    else localStorage.removeItem(KEY)
  } catch {}
}
function newConv(): Conv | null {
  if (convs.length >= MAX) return null
  const c: Conv = { id: `c${Date.now()}`, title: '', updated: Date.now(), msgs: [], last: null }
  convs.unshift(c)
  current = c.id
  save()
  return c
}
const conv = (): Conv => convs.find((c) => c.id === current)!

// ------------------------------------------------------------------------------------------------------------------- view

const $ = <E extends HTMLElement>(s: string) => document.querySelector(s) as E
const log = $('#log'), form = $<HTMLFormElement>('#ask'), input = $<HTMLTextAreaElement>('#q'), btn = $<HTMLButtonElement>('#send')
const status = $('#status'), notice = $<HTMLButtonElement>('#notice'), panel = $('#panel'), menu = $<HTMLButtonElement>('#menu')
const browse = $<HTMLButtonElement>('#browse')
function applyUi() {
  document.documentElement.lang = nav
  document.documentElement.dir = nav === 'ar' ? 'rtl' : 'ltr'
  input.placeholder = T.ph
  btn.setAttribute('aria-label', T.send)
  menu.setAttribute('aria-label', T.chats)
  browse.setAttribute('aria-label', XT(nav).browseLong)
  browse.title = XT(nav).browse
  applyBrand(nav)
}
function setUi(l: string) {
  nav = l
  setViewLang(l)
  T = UI[l]!
  try {
    localStorage.setItem(UI_KEY, l)
  } catch {}
  applyUi()
  setReady()
  renderConv()
  renderPanel()
}
applyUi()

function el(tag: string, cls: string, text?: string): HTMLElement {
  const d = document.createElement(tag)
  d.className = cls
  // Arabic helps read right to left, English ones left to right, whatever the app's language (bidi.ts textDir)
  if (/^(info|plain|intro|msg)/.test(cls)) d.dir = text !== undefined ? dirOf(text) : 'auto'
  if (text !== undefined) d.textContent = text
  return d
}

const LIMITS: Record<string, string> = {
  en: 'What this app can and cannot do ›', es: 'Lo que esta app puede y no puede hacer ›', fr: 'Ce que cette application peut et ne peut pas faire ›',
  id: 'Apa yang bisa dan tidak bisa dilakukan aplikasi ini ›', hi: 'यह ऐप क्या कर सकता है और क्या नहीं ›', ar: 'ما يستطيع هذا التطبيق فعله وما لا يستطيع ›',
}
/** The online answer's text, with its badge ("Online AI · model"). */
function aiBlock(a: NonNullable<Msg['ai']>): HTMLElement {
  const ai = el('div', 'ai')
  ai.appendChild(el('span', 'ai-badge', bidiLabel(`${OT().label} · ${modelLabel(a.model)}`, nav)))
  const body = el('div', 'ai-text')
  body.dir = mdDir(a.text) // an Arabic answer reads right to left (its English paragraphs left to right: md.ts)
  body.innerHTML = md(a.text)
  ai.appendChild(body)
  return ai
}
/** The question an answer answers: the person's message just before it (not a "Back to …" divider). */
function askedFor(m: Msg): string | undefined {
  const cv = convs.find((x) => x.msgs.includes(m))
  const prev = cv?.msgs[cv.msgs.indexOf(m) - 1]
  return prev?.who === 'me' && !prev.mark ? prev.text : undefined
}
/**
 * The online answer arrived for a message drawn while it was written: its text in place of "Writing…", the cards untouched,
 * and the share button made again, so it sends the online answer (it was made before it existed, or not at all).
 */
function fillAi(node: HTMLElement, m: Msg) {
  if (!m.ai) return
  node.querySelector('.ai.pending')?.replaceWith(aiBlock(m.ai))
  markCited(node, (m.ai.sources ?? []).map((s) => s.id), m.ui ?? nav)
  const sh = shareButton(m, m.ui ?? nav, askedFor(m))
  const old = node.querySelector(':scope > .share')
  if (old) old.remove()
  const rate = node.querySelector(':scope > .rate')
  if (sh && rate) rate.before(sh)
  else if (sh) node.appendChild(sh)
}
/** `pending`: online AI is writing its answer to this message (the helps show as cards already). */
function renderMsg(m: Msg, pending = false): HTMLElement {
  // going back to an earlier point: a small divider ("Back to Ruth 2:3"), not a bubble
  if (m.who === 'me' && m.mark) {
    const d = el('div', 'msg mark')
    d.setAttribute('role', 'separator')
    d.dir = rtlLang(nav) ? 'rtl' : 'ltr' // built in the app's language: its direction, the other one's runs isolated
    d.appendChild(el('span', '', bidiLabel(m.text ?? '', nav)))
    return d
  }
  if (m.who === 'me') return el('div', 'msg me', m.text)
  const d = el('div', 'msg bot')
  d.dataset.lang = m.lang ?? 'en'
  // on a light path: where it is ("Ruth 1:6–18 · step 4 of 5: notes"), first
  if (m.pathMark) {
    const pm = el('div', 'path-mark', bidiLabel(m.pathMark, m.ui ?? nav))
    pm.dir = rtlLang(m.ui ?? nav) ? 'rtl' : 'ltr'
    d.appendChild(pm)
  }
  // the question this answers (the person's message before it): the passage shows the notes about its words first
  const cv = convs.find((x) => x.msgs.includes(m))
  const asked = askedFor(m)
  // with an online answer (or while it is written), it comes first, then the helps the phone found as cards in sight (the
  // articles it was grounded in first), then the whole phone's answer folded behind what it holds ("See all 66 notes…").
  // The cards are drawn already while the answer is written and stay where they are when it arrives (fillAi).
  let host: HTMLElement = d
  if (showsCards(m, pending)) {
    d.appendChild(m.ai ? aiBlock(m.ai) : el('p', 'ai pending', OT().writing))
    const ui = m.ui ?? nav
    const plan = chooseCards({
      study: m.study, info: m.info, intro: m.intro, ctx: m.ctx, lang: m.lang, helps: m.helps, question: asked,
      sources: m.ai?.sources?.length ? m.ai.sources : m.sources, cited: m.ai?.sources?.map((s) => s.id),
    })
    const src = document.createElement('details')
    src.className = 'sources fold'
    src.appendChild(el('summary', '', moreLabel(plan.more, ui)))
    const reveal = (what: 'text' | 'answer') => {
      src.open = true
      const at = (what === 'text' && src.querySelector<HTMLElement>('.study .tx')) || src
      at.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
    if (plan.cards.length) d.appendChild(renderHelpCards(plan.cards, { ui, lang: m.lang ?? 'en', study: m.study, helps: m.helps, reveal }))
    d.appendChild(src)
    host = src
  }
  if (m.intro) host.appendChild(el('p', 'intro', m.intro))
  if (m.study) host.appendChild(renderStudy(m.study, asked))
  else if (m.info) {
    const box = el('div', m.intro ? 'info' : 'plain md')
    box.innerHTML = md(m.info, m.ctx ?? '') // md() escapes everything first
    box.dir = mdDir(m.info)
    fillTitles(box, m.lang ?? 'en')
    host.appendChild(box)
  }
  if (m.helps?.length) host.appendChild(renderHelps(m.helps))
  if (m.text) d.appendChild(el('div', 'plain', m.text))
  // the way back to the passage this answer left (and to the path it left), on its own row, then the next steps
  const backs = [m.back, m.pathBack].filter((f): f is Followup => !!f)
  if (backs.length) d.appendChild(followRow(m, backs, 'follow back-row'))
  // a path starts: the line that proposes it, just above its first step
  if (m.pathLine) {
    const pl = el('p', 'path-line', bidiLabel(m.pathLine, m.ui ?? nav))
    pl.dir = rtlLang(m.ui ?? nav) ? 'rtl' : 'ltr'
    d.appendChild(pl)
  }
  if (m.follow?.length) d.appendChild(followRow(m, m.follow))
  // far from where the conversation started: "Shall we start a new conversation for this?", while it is the last answer
  if (m.drift && cv && cv.msgs[cv.msgs.length - 1] === m && nodeOf(cv.graph, m.node)?.drift === 'offered') d.appendChild(driftOffer(cv, m))
  // the language is missing: straight to where it is added
  if (m.packs) {
    const a = el('button', 'about-link', NP(m.ui ?? nav).add) as HTMLButtonElement
    a.type = 'button'
    a.onclick = () => {
      panelView = 'packs'
      panel.classList.add('show')
      renderPanel()
    }
    d.appendChild(a)
  }
  // could not answer: what the app can and cannot do is in About
  if (m.limits) {
    const a = el('button', 'about-link', LIMITS[m.ui ?? nav] ?? LIMITS.en!) as HTMLButtonElement
    a.type = 'button'
    a.onclick = () => showAbout(nav, () => setReady())
    d.appendChild(a)
  }
  // share the answer (WhatsApp or the phone's share sheet), with the question it answers when the message before is the person's
  const sh = m.waiting ? null : shareButton(m, m.ui ?? nav, asked)
  if (sh) d.appendChild(sh)
  // thumbs up or down, and with a thumbs down a report (feedback.ts)
  if (!m.waiting && (m.info || m.intro || m.ai || m.text || m.helps)) {
    let bar = el('div', 'rate')
    let said = ''
    const draw = () => {
      const fresh = feedbackBar(m.ui ?? nav, m.rating, !!m.reported, rate, report)
      if (said) fresh.appendChild(el('span', 'done', said))
      bar.replaceWith(fresh)
      bar = fresh
    }
    const rate = (r: 'up' | 'down' | null) => {
      m.rating = r ?? undefined
      if (r) count(`rate.${r}`)
      save()
      draw()
    }
    const report = () => {
      const c = convs.find((x) => x.msgs.includes(m))
      const upTo = c ? c.msgs.slice(0, c.msgs.indexOf(m) + 1) : [m]
      askReport(m.ui ?? nav, upTo.map(reportMsg), async (r) => {
        if (!r) return
        m.reported = true
        save()
        said = FT(m.ui ?? nav).queued
        draw()
        const res = await submitReport(r)
        said = res === 'sent' ? FT(m.ui ?? nav).sent : FT(m.ui ?? nav).queued
        draw()
      })
    }
    d.appendChild(bar)
    draw()
  }
  if (m.meta) {
    const det = document.createElement('details')
    det.appendChild(el('summary', '', bidiLabel(m.meta.split('\n')[0]!, m.ui ?? nav)))
    det.appendChild(el('pre', '', m.meta.split('\n').slice(1).join('\n')))
    d.appendChild(det)
  }
  return d
}
/** An answer that can be asked again (it failed): the same question, the same way. */
const retries = new WeakMap<Msg, () => void>()
/** The next steps under an answer: a ready sheet (no model call), Browse at a book or manual, or the question again. */
function followRow(m: Msg, follow: Followup[], cls = 'follow'): HTMLElement {
  const f = el('div', cls)
  // in the app's direction (not the answer's: an Arabic answer in an English app keeps English buttons left to right)
  const ui = m.ui ?? nav
  f.dir = rtlLang(ui) ? 'rtl' : 'ltr'
  for (const x of follow) {
    const b = el('button', '', bidiLabel(x.label, ui)) as HTMLButtonElement
    b.type = 'button'
    if (x.back || x.toPath) b.className = 'back'
    else if (x.pathNext) b.className = 'path-next'
    b.onclick = () => {
      if (x.back) goTo(x.back, 'back')
      else if (x.browse) {
        closePanel()
        openExploreAt(x.browse)
      } else if (x.again) {
        if (busy) return
        // the same question the same way: while the app is open, its own call; after a reload, the button's sheet again, or
        // the text the person typed (never a button's label as if typed)
        const again = retries.get(m)
        if (again) again()
        else if (x.again.sheet) runSheet(x.again.label ?? x.label, x.again.sheet, m.ui ?? nav)
        else if (x.again.q) {
          input.value = x.again.q
          form.requestSubmit()
        }
      } else if (x.sheet) runSheet(x.label, x.sheet, m.ui ?? nav)
    }
    f.appendChild(b)
  }
  return f
}
/**
 * The drift offer under an answer (pipeline.ts graphStep): [New conversation] moves this question and its answer to a new
 * conversation (the old one stays, in the conversations menu); [Continue here] puts it away. Offered once: either answer, or
 * a new question, and it is not asked again for this drift. With 3 conversations already, it says so and offers to continue.
 */
function driftOffer(c: Conv, m: Msg): HTMLElement {
  const w = GD(m.ui ?? nav)
  const box = el('div', 'drift')
  box.setAttribute('role', 'group')
  const say = el('p', '', w.drift)
  say.dir = 'auto'
  const row = el('div', 'follow')
  const btn = (label: string, go: () => void) => {
    const b = el('button', '', label) as HTMLButtonElement
    b.type = 'button'
    b.onclick = go
    row.appendChild(b)
    return b
  }
  const stay = () => {
    const n = nodeOf(c.graph, m.node)
    if (n) n.drift = 'stayed'
    count('guide.drift.stay')
    save()
    box.remove()
  }
  btn(w.newConv, () => {
    if (busy) return
    if (!roomForNew(convs.length)) {
      // no room for a fourth: say so, and continue here
      say.textContent = w.full
      row.innerHTML = ''
      btn(w.stay, stay).focus()
      return
    }
    count('guide.drift.new')
    moveToNew(c, m)
  })
  btn(w.stay, stay)
  box.append(say, row)
  return box
}
/**
 * This question and its answer go on in a new conversation: out of `c` (its point too; `c` goes back to the point before),
 * into a new one whose first point it is. The old conversation stays as it was before them.
 */
function moveToNew(c: Conv, m: Msg) {
  if (!roomForNew(convs.length)) return
  // (pipeline.ts moveOut: out of `c`, its point too; a path only when this answer started it)
  const out = moveOut(c, m, nav)
  if (!out) return
  c.updated = Date.now()
  const nc = newConv()
  if (!nc) return
  Object.assign(nc, out)
  // what is asked next goes on from this point (its passage, its search results)
  returnTo(nc, out.graph.cur!, nav)
  save()
  renderConv()
  if (panel.classList.contains('show')) renderPanel()
}
/** One message as a report carries it: the words shown, the online answer, and the details (what the model understood). */
const reportMsg = (m: Msg): ReportMsg => m.who === 'me'
  ? { who: 'me', text: m.text }
  : { who: 'bot', text: m.text, intro: m.intro ?? undefined, info: m.info, ai: m.ai?.text, details: m.meta }
// the languages on the phone: known once the first look at them is back (before that, the welcome shows neither picker nor examples)
let INSTALLED: string[] = []
let packsKnown = false
/** The pack the welcome's examples come from: the chosen helps language, the app's, or the first one on the phone. */
function examplesLang(): string | null {
  if (helpsLang && INSTALLED.includes(helpsLang)) return helpsLang
  const p = packFor(nav)
  return p && INSTALLED.includes(p) ? p : INSTALLED[0] ?? null
}
/** The language picker (firstuse.ts), for a phone with no language; `prefer`: the waiting question's language first. */
function pickerFor(prefer: string[]): HTMLElement {
  const phone = [...(navigator.languages ?? []), navigator.language ?? '']
  return languagePicker(nav, [...prefer, nav, ...phone], {
    // the download's end reaches refreshInstalled through onPacksChanged too: the waiting question is asked from there
    done: async () => { await refreshInstalled() },
    file: () => {
      panelView = 'packs'
      panel.classList.add('show')
      renderPanel()
    },
  })
}
/** The question that waited for a language: asked again once, in its conversation (the question and its note give way to the answer). */
let reaskLater = false
function reaskWaiting(): boolean {
  // an answer is on its way: the question keeps waiting, and is asked when that answer is done (respond)
  if (busy) {
    reaskLater = convs.some((c) => c.msgs[c.msgs.length - 1]?.waiting)
    return reaskLater
  }
  for (const c of convs) {
    const n = c.msgs.length
    const bot = c.msgs[n - 1], me = c.msgs[n - 2]
    if (!bot?.waiting || me?.who !== 'me' || !me.text) continue
    c.msgs.splice(n - 2, 2)
    current = c.id
    save()
    renderConv()
    const typed = input.value
    input.value = me.text
    form.requestSubmit()
    input.value = typed
    return true
  }
  return false
}
/** The language of the question that waits in the conversation, if any. */
function waitingLang(c: Conv): string[] {
  let i = c.msgs.length - 1
  while (i >= 0 && !c.msgs[i]!.waiting) i--
  const q = i > 0 ? c.msgs[i - 1] : undefined
  return q?.who === 'me' && q.text ? [guessLang(q.text)] : []
}
// The light build with no model, right after its first language: one optional line offers the reading model (no gate)
let offerModel = false
function modelOffer(): HTMLElement | null {
  if (!offerModel || !isLite() || modelState().state !== 'missing') return null
  const box = el('div', 'fu-model')
  box.appendChild(el('span', '', FU(nav).model.replace('{size}', `${Math.round(MODEL.bytes / 1048576)} MB`)))
  const go = el('button', '', FU(nav).modelGo) as HTMLButtonElement
  go.type = 'button'
  go.onclick = () => {
    offerModel = false
    downloadModel()
    box.remove()
    setReady()
  }
  box.appendChild(go)
  return box
}
/** Puts the model line (if it is offered) at the end of the conversation, after what was just answered. */
function placeModelOffer() {
  log.querySelectorAll('.fu-model').forEach((x) => x.remove())
  const line = modelOffer()
  if (line) log.appendChild(line)
}
function fillExamples(ex: HTMLElement) {
  const lang = examplesLang()
  if (!lang) return
  examplesFor(nav, lang).then((list) => {
    if (!ex.isConnected) return
    for (const e of list) {
      const b = el('button', '', bidiLabel(e.label, nav)) as HTMLButtonElement
      b.type = 'button'
      b.onclick = () => runSheet(e.label, { ...bare(e.lang), intent: e.intent, ref: e.ref ?? null, what: e.what ?? [], concept: e.concept ?? null }, nav)
      ex.appendChild(b)
    }
  }).catch(() => {})
}
function renderConv() {
  log.innerHTML = ''
  const c = conv()
  const noPacks = packsKnown && !INSTALLED.length
  if (!c.msgs.length) {
    updateMapBtn()
    const w = el('div', 'welcome')
    w.innerHTML = LOGO
    w.appendChild(el('h2', '', T.welcome))
    // no language yet: the first screen is the choice of one (the rest of the welcome comes with it)
    if (noPacks) w.appendChild(pickerFor([]))
    else {
      w.appendChild(el('p', '', T.hello))
      const ex = el('div', 'examples')
      w.appendChild(ex)
      fillExamples(ex)
      // without typing: the Bible book by book, and the Academy manual by manual (explore.ts)
      const go = el('button', 'browse-go', `${XT(nav).browseLong} ›`) as HTMLButtonElement
      go.type = 'button'
      go.onclick = () => openExplore('welcome')
      w.appendChild(go)
    }
    log.appendChild(w)
    placeModelOffer()
    return
  }
  for (const m of c.msgs) log.appendChild(renderMsg(m))
  if (noPacks) log.appendChild(pickerFor(waitingLang(c)))
  updateMapBtn()
  placeModelOffer()
  log.lastElementChild?.scrollIntoView({ block: 'end' })
}
type PanelView = 'main' | 'language' | 'online' | 'model' | 'packs' | 'usage' | 'safety'
let panelView: PanelView = 'main'
const MTS: Record<string, { language: string; on: string; off: string; none: string; installed: string; back: string }> = {
  en: { language: 'Language', on: 'On', off: 'Off', none: 'None', installed: 'installed', back: 'Back' },
  es: { language: 'Idioma', on: 'Activada', off: 'Apagada', none: 'Ninguno', installed: 'instalados', back: 'Atrás' },
  fr: { language: 'Langue', on: 'Activée', off: 'Désactivée', none: 'Aucun', installed: 'installées', back: 'Retour' },
  id: { language: 'Bahasa', on: 'Aktif', off: 'Mati', none: 'Tidak ada', installed: 'terpasang', back: 'Kembali' },
  hi: { language: 'भाषा', on: 'चालू', off: 'बंद', none: 'कोई नहीं', installed: 'इंस्टॉल', back: 'वापस' },
  ar: { language: 'اللغة', on: 'مفعّل', off: 'مُطفأ', none: 'لا شيء', installed: 'مثبّتة', back: 'رجوع' },
}
const MT = () => MTS[nav] ?? MTS.en!

function renderPanel() {
  panel.classList.remove('sub')
  if (panelView !== 'main') return renderSubPanel(panelView)
  panel.innerHTML = ''
  panel.appendChild(el('h2', '', T.chats))
  for (const c of convs) {
    const row = el('div', c.id === current ? 'row on' : 'row')
    const open = el('button', 'open', c.title || T.untitled) as HTMLButtonElement
    open.type = 'button'
    open.dir = dirOf(c.title || T.untitled) // a question in Arabic reads right to left in any app language
    open.onclick = () => {
      current = c.id
      save()
      closePanel()
      renderConv()
    }
    const del = el('button', 'del', T.del) as HTMLButtonElement
    del.type = 'button'
    // Two taps, inside the page: Android's WebView shows no confirm() dialog unless the app opts in
    let armed: ReturnType<typeof setTimeout> | null = null
    del.onclick = () => {
      if (!armed) {
        del.textContent = T.confirmDel
        del.classList.add('armed')
        armed = setTimeout(() => {
          armed = null
          del.textContent = T.del
          del.classList.remove('armed')
        }, 4000)
        return
      }
      clearTimeout(armed)
      convs = convs.filter((x) => x.id !== c.id)
      if (!convs.length) newConv()
      if (current === c.id) current = convs[0]!.id
      save()
      renderPanel()
      renderConv()
    }
    row.append(open, del)
    panel.appendChild(row)
  }
  const add = el('button', 'add', `+ ${T.newChat}`) as HTMLButtonElement
  add.type = 'button'
  add.disabled = convs.length >= MAX
  add.onclick = () => {
    if (newConv()) {
      closePanel()
      renderConv()
    }
  }
  panel.appendChild(add)
  if (convs.length >= MAX) panel.appendChild(el('p', 'note', T.max))
  // under the conversations, one row per setting: its name, what it is now, and a tap opens it
  const list = el('div', 'mrows')
  const row = (title: string, sub: string, open: () => void) => {
    const b = el('button', 'mrow') as HTMLButtonElement
    b.type = 'button'
    b.append(el('span', 'mrow-t', title), el('span', 'mrow-s', sub), el('span', 'mrow-c', '›'))
    b.onclick = open
    list.appendChild(b)
  }
  const go = (v: PanelView) => () => {
    panelView = v
    renderPanel()
  }
  row(XT(nav).browse, `${XT(nav).bible} · ${XT(nav).academy}`, () => {
    closePanel()
    openExplore('menu')
  })
  // the Map of the conversation open now: how many points, and where it is
  if (points() >= MAP_MIN) {
    const c = conv()
    const at = nodeOf(c.graph, c.graph?.cur)
    row(GT(nav).mapLong, [GT(nav).points.replace('{n}', String(points())), at?.label].filter(Boolean).join(' · '), () => {
      closePanel()
      openMap('menu')
    })
  }
  const uiName = UI_LANGS.find(([c]) => c === nav)?.[1] ?? nav
  row(MT().language, `${uiName} · ${helpsLang ? PACK_NAMES[helpsLang] ?? helpsLang : T.auto}`, go('language'))
  if (onlineAvailable()) row(OT().label, onlineOn() && (!signInAvailable() || onlineSession()) ? MT().on : MT().off, go('online'))
  row(modelTitle(nav), modelOff() ? MT().none : `FunctionGemma 270M · ${modelLine(nav)}`, go('model'))
  row(packsTitle(nav), `${INSTALLED.length} ${MT().installed}`, go('packs'))
  row(UT().title, usageOn() ? MT().on : MT().off, go('usage'))
  if (updateSupported()) {
    const u = updateRow(nav)
    row(u.title, u.sub, () => { checkForUpdate(nav, true, () => renderPanel()) })
  }
  list.appendChild(composerSwitch(nav, MT().on, MT().off))
  row(PT(nav).title, protectSummary(nav, MT().off), go('safety'))
  const aboutRow = el('button', 'mrow') as HTMLButtonElement
  aboutRow.type = 'button'
  aboutRow.append(el('span', 'mrow-t', aboutLabel(nav)), el('span', 'mrow-c', '›'))
  aboutRow.onclick = () => {
    closePanel()
    showAbout(nav, () => setReady())
  }
  list.appendChild(aboutRow)
  panel.appendChild(list)
}

/** One setting's own view in the panel, with a way back to the menu. */
function renderSubPanel(v: Exclude<PanelView, 'main'>) {
  panel.innerHTML = ''
  panel.classList.add('sub')
  const head = el('div', 'subhead')
  const back = el('button', 'back', '‹') as HTMLButtonElement
  back.type = 'button'
  back.setAttribute('aria-label', MT().back)
  back.onclick = () => {
    panelView = 'main'
    renderPanel()
  }
  const titles = { language: MT().language, online: OT().label, model: modelTitle(nav), packs: packsTitle(nav), usage: UT().title, safety: PT(nav).title }
  head.append(back, el('h2', '', titles[v]))
  panel.appendChild(head)
  if (v === 'language') renderLanguageView()
  else if (v === 'online') renderOnlineView()
  else if (v === 'usage') renderUsageView()
  else if (v === 'safety') panel.appendChild(protectView(nav, eraseAll, () => renderPanel()))
  else if (v === 'model') panel.appendChild(modelSection(nav, () => {
    setReady()
    renderPanel()
  }))
  else {
    const panelLang = nav
    languagesSection(nav, () => {
      refreshInstalled()
      renderPanel()
    }).then((box) => {
      if (panel.classList.contains('show') && panelView === 'packs' && panelLang === nav) panel.appendChild(box)
    })
  }
}

function renderLanguageView() {
  panel.appendChild(el('h3', '', T.appLang))
  const langs = el('div', 'langs')
  for (const [code, name] of UI_LANGS) {
    const b = el('button', code === nav ? 'on' : '', name) as HTMLButtonElement
    b.type = 'button'
    b.onclick = () => setUi(code)
    langs.appendChild(b)
  }
  panel.appendChild(langs)
  panel.appendChild(el('h3', '', T.helps))
  const hl = el('div', 'langs')
  for (const code of [null, ...INSTALLED]) {
    const b = el('button', code === helpsLang ? 'on' : '', code ? PACK_NAMES[code] ?? code : T.auto) as HTMLButtonElement
    b.type = 'button'
    b.onclick = () => {
      helpsLang = code
      try {
        if (code) localStorage.setItem(PACK_KEY, code)
        else localStorage.removeItem(PACK_KEY)
      } catch {}
      renderPanel()
    }
    hl.appendChild(b)
  }
  panel.appendChild(hl)
}

/** Online AI on, after a Google sign-in when this build requires one: '' when it is on, else why not. */
// ------------------------------------------------------------------------------------- online AI and the connection

const NET: Record<string, { off: string; back: string; unreachable: string; close: string }> = {
  en: {
    off: 'No internet: online AI is paused. Answers now come from the phone: the helps themselves (Bible texts, notes, key terms, questions), without a written explanation. Online AI comes back with the connection.',
    back: 'Internet is back: online AI is on again.', unreachable: 'Online AI did not answer this time; this answer is from the phone.', close: 'Close',
  },
  es: {
    off: 'Sin internet: la IA en línea está en pausa. Las respuestas ahora salen del teléfono: las ayudas tal cual (textos bíblicos, notas, palabras clave, preguntas), sin una explicación escrita. La IA en línea vuelve con la conexión.',
    back: 'Volvió internet: la IA en línea está activa otra vez.', unreachable: 'La IA en línea no respondió esta vez; esta respuesta es del teléfono.', close: 'Cerrar',
  },
  fr: {
    off: "Pas d'internet : l'IA en ligne est en pause. Les réponses viennent maintenant du téléphone : les aides elles-mêmes (textes bibliques, notes, termes clés, questions), sans explication rédigée. L'IA en ligne revient avec la connexion.",
    back: "Internet est revenu : l'IA en ligne est de nouveau active.", unreachable: "L'IA en ligne n'a pas répondu cette fois ; cette réponse vient du téléphone.", close: 'Fermer',
  },
  id: {
    off: 'Tidak ada internet: AI daring dijeda. Jawaban sekarang berasal dari ponsel: bahan bantu apa adanya (teks Alkitab, catatan, istilah kunci, pertanyaan), tanpa penjelasan tertulis. AI daring kembali saat koneksi kembali.',
    back: 'Internet kembali: AI daring aktif lagi.', unreachable: 'AI daring tidak menjawab kali ini; jawaban ini dari ponsel.', close: 'Tutup',
  },
  hi: {
    off: 'इंटरनेट नहीं है: ऑनलाइन AI रुका हुआ है। अब उत्तर फ़ोन से आते हैं: सहायताएँ जैसी हैं वैसी (बाइबल पाठ, नोट्स, मुख्य शब्द, प्रश्न), बिना लिखी हुई व्याख्या के। कनेक्शन लौटने पर ऑनलाइन AI लौट आएगा।',
    back: 'इंटरनेट लौट आया: ऑनलाइन AI फिर से चालू है।', unreachable: 'इस बार ऑनलाइन AI ने उत्तर नहीं दिया; यह उत्तर फ़ोन से है।', close: 'बंद करें',
  },
  ar: {
    off: 'لا يوجد إنترنت: الذكاء الاصطناعي عبر الإنترنت متوقف مؤقتًا. تأتي الإجابات الآن من الهاتف: المساعدات كما هي (نصوص الكتاب المقدس، الملاحظات، المصطلحات الرئيسية، الأسئلة)، دون شرح مكتوب. يعود الذكاء الاصطناعي عبر الإنترنت مع عودة الاتصال.',
    back: 'عاد الإنترنت: الذكاء الاصطناعي عبر الإنترنت يعمل من جديد.', unreachable: 'لم يُجب الذكاء الاصطناعي عبر الإنترنت هذه المرة؛ هذه الإجابة من الهاتف.', close: 'إغلاق',
  },
}
const NT = () => NET[nav] ?? NET.en!
let netTimer: ReturnType<typeof setTimeout> | null = null
/** The note under the bar about online AI and the connection: 'off' (lost: what answers are now), 'back', or none. */
function netNote(kind: 'off' | 'back' | null) {
  document.querySelector('#netnote')?.remove()
  if (netTimer) clearTimeout(netTimer)
  if (!kind || !onlineOn() || !onlineAvailable()) return
  const box = el('div', kind)
  box.id = 'netnote'
  box.setAttribute('role', 'status')
  const x = el('button', 'x', '×') as HTMLButtonElement
  x.type = 'button'
  x.setAttribute('aria-label', NT().close)
  x.onclick = () => box.remove()
  box.append(el('span', '', NT()[kind]), x)
  notice.after(box)
  if (kind === 'back') netTimer = setTimeout(() => box.remove(), 6000)
}
window.addEventListener('offline', () => netNote('off'))
window.addEventListener('online', () => { if (document.querySelector('#netnote.off')) netNote('back') })

async function turnOnline(): Promise<string> {
  if (signInAvailable() && !onlineSession()) {
    const r = await signIn()
    if (!r.ok) return r.error
  }
  setOnline(true)
  if (!isOnline()) netNote('off')
  return ''
}

function renderOnlineView() {
  {
    const lab = el('label', 'toggle') as HTMLLabelElement
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    // with sign-in (a build that has a Google client id), turning it on asks for a sign-in first
    const needsSignIn = signInAvailable()
    cb.checked = onlineOn() && (!needsSignIn || !!onlineSession())
    const status = el('p', 'note')
    cb.onchange = () => {
      if (!cb.checked) {
        setOnline(false)
        renderPanel()
        return
      }
      // turning it on asks first, with what it means for someone's safety
      cb.checked = false
      askSafety(nav, ['online'], async (a) => {
        if (!a?.online) return
        cb.disabled = true
        const r = await turnOnline()
        cb.disabled = false
        if (r) status.textContent = `${T.failed} ${r}`
        else renderPanel()
      })
    }
    lab.append(cb, el('span', '', OT().toggle))
    panel.appendChild(lab)
    panel.appendChild(el('p', 'note', needsSignIn ? `${OT().note} ${OT().signInNote}` : OT().note))
    const session = onlineSession()
    if (needsSignIn && session) {
      const row = el('div', 'langs')
      row.append(el('span', 'note', OT().signedIn.replace('{n}', session.name ? `: ${session.name}` : '')))
      const out = el('button', '', OT().signOut) as HTMLButtonElement
      out.type = 'button'
      out.onclick = () => { signOut(); setOnline(false); renderPanel() }
      row.append(out)
      panel.appendChild(row)
    }
    panel.appendChild(status)
  }
}
const UT = () => USAGE_T[nav] ?? USAGE_T.en!
/** Usage counts: the switch, what is sent, and the report itself as it will go out (nothing hidden). */
function renderUsageView() {
  const lab = el('label', 'toggle') as HTMLLabelElement
  const cb = document.createElement('input')
  cb.type = 'checkbox'
  cb.checked = usageOn()
  cb.onchange = () => {
    if (!cb.checked) {
      setUsageOn(false)
      renderPanel()
      return
    }
    cb.checked = false
    askSafety(nav, ['usage'], (a) => {
      if (!a?.usage) return
      setUsageOn(true)
      count('opens')
      renderPanel()
    })
  }
  lab.append(cb, el('span', '', UT().toggle))
  panel.appendChild(lab)
  panel.appendChild(el('p', 'note', UT().note))
  if (!usageOn()) return
  const report = pendingReport()
  panel.appendChild(el('h3', '', UT().next))
  if (!report.days.length) panel.appendChild(el('p', 'note', UT().empty))
  panel.appendChild(el('pre', 'usage', JSON.stringify(report, null, 1)))
  const t = todayCounts()
  if (Object.keys(t).length) {
    panel.appendChild(el('h3', '', UT().today))
    panel.appendChild(el('pre', 'usage', JSON.stringify(t, null, 1)))
  }
  const sent = lastSent()
  if (sent) panel.appendChild(el('p', 'note', UT().sent.replace('{d}', sent)))
}
/** Menu > Safety > Erase all conversations now. */
function eraseAll() {
  convs = []
  current = ''
  try { localStorage.removeItem(KEY) } catch {}
  newConv()
  renderConv()
}
const closePanel = () => panel.classList.remove('show')
// Android's back button (MainActivity.onBackPressed): the bottom panel, then the About page, then the menu; else it leaves
;(window as any).__back = (): boolean => {
  if (locked()) return false // the back button leaves the app; it never opens it
  if (closeSafety()) return true
  if (closeReport()) return true
  if (backPanel()) return true
  if (backExplore()) return true
  if (mapIsOpen()) { closeMap(); return true }
  const about = document.querySelector('#about')
  if (about) { about.remove(); return true }
  if (panel.classList.contains('show') && panelView !== 'main') { panelView = 'main'; renderPanel(); return true }
  if (panel.classList.contains('show')) { closePanel(); return true }
  return false
}
browse.onclick = () => {
  closePanel()
  closeMap(false)
  openExplore('bar')
}
menu.onclick = () => {
  closeExplore()
  closeMap(false)
  panelView = 'main'
  if (panel.classList.toggle('show')) renderPanel()
}

// -------------------------------------------------------------------------------------------------------------- answering

let busy = false
let polling = false
// the status explains itself: a tap opens About, which says what works without internet
status.style.cursor = 'pointer'
status.onclick = () => showAbout(nav, () => setReady())
// so does the logo and the name
{
  const brand = $('header .brand')
  brand.style.cursor = 'pointer'
  brand.setAttribute('role', 'button')
  brand.tabIndex = 0
  brand.setAttribute('aria-label', aboutLabel(nav))
  brand.onclick = () => showAbout(nav, () => setReady())
  brand.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); brand.click() } }
}
// the notice opens the menu, where the model can be downloaded or loaded
notice.onclick = () => { if (!panel.classList.contains('show')) menu.click() }

function setReady() {
  const ok = modelReady() && !modelOff()
  const { state } = modelState()
  const line = ok ? T.ready : modelLine(nav)
  status.textContent = ''
  status.title = line
  status.setAttribute('aria-label', line)
  status.dataset.ok = String(ok)
  status.dataset.state = state
  // the message itself goes under the bar, only when something needs attention (no model, downloading, a problem)
  notice.hidden = ok || (state === 'ready' && modelOff()) // a model turned off on purpose needs no warning
  notice.textContent = ok ? '' : modelNotice(nav)
  // a newer model on the server than the one on the phone (lite build after an update): say so, the menu has the button
  if (ok && modelOutdated()) {
    notice.hidden = false
    notice.textContent = `${modelTitle(nav)}: ${modelNewer(nav)}`
  }
  // without a model the app still answers references and searches
  btn.disabled = busy || ['copying', 'starting', 'importing'].includes(state)
  if (!['ready', 'missing', 'error'].includes(state) && !polling) {
    polling = true
    setTimeout(() => {
      polling = false
      setReady()
      if (panel.classList.contains('show')) renderPanel()
    }, 1000)
  }
}

/** The book a question names, by its code ("Titus", "Yunus", "योना"), or null. */
function bookIn(q: string, lang: string): string | null {
  const words = q.replace(/[¿?!¡.,;:«»"“”؟]/g, ' ').split(/\s+/).filter(Boolean)
  for (let i = 0; i < words.length; i++)
    for (let k = 3; k >= 1; k--) {
      const code = bookExact(words.slice(i, i + k).join(' '))
      if (code) return code
    }
  return null
}
const HELP_T: Record<string, { intro: string; notes: string; terms: string; questions: string }> = {
  en: { intro: "On this phone BT Servant Mini works as a search assistant, not a chat: it finds things in the translation helps instead of holding a conversation like BT Servant online (with online AI turned on, a larger model also explains them). This is what you can ask:", notes: 'notes', terms: 'key terms', questions: 'questions' },
  es: { intro: "En este teléfono, BT Servant Mini funciona como un buscador asistido, no como un chat: encuentra cosas en las ayudas de traducción en lugar de conversar como BT Servant en línea (con la IA en línea activada, un modelo más grande además las explica). Esto es lo que puedes preguntar:", notes: 'notas', terms: 'palabras clave', questions: 'preguntas' },
  fr: { intro: "Sur ce téléphone, BT Servant Mini fonctionne comme un assistant de recherche, pas comme une messagerie : il trouve des choses dans les aides à la traduction au lieu de converser comme BT Servant en ligne (avec l'IA en ligne activée, un modèle plus grand les explique aussi). Voici ce que vous pouvez demander :", notes: 'notes', terms: 'termes clés', questions: 'questions' },
  id: { intro: "Di ponsel ini, BT Servant Mini bekerja sebagai asisten pencari, bukan obrolan: ia menemukan hal-hal di bahan bantu penerjemahan, bukan bercakap-cakap seperti BT Servant daring (dengan AI daring aktif, model yang lebih besar juga menjelaskannya). Inilah yang dapat Anda tanyakan:", notes: 'catatan', terms: 'istilah kunci', questions: 'pertanyaan' },
  hi: { intro: "इस फ़ोन पर BT Servant Mini एक खोज सहायक की तरह काम करता है, चैट की तरह नहीं: यह अनुवाद सहायताओं में चीज़ें ढूँढता है, ऑनलाइन BT Servant की तरह बातचीत नहीं करता (ऑनलाइन AI चालू हो तो एक बड़ा मॉडल उन्हें समझाता भी है)। आप यह पूछ सकते हैं:", notes: 'नोट्स', terms: 'मुख्य शब्द', questions: 'प्रश्न' },
  ar: { intro: "يعمل BT Servant Mini على هذا الهاتف كمساعد بحث، لا كمحادثة: يجد الأشياء في مساعدات الترجمة بدلًا من أن يحاورك مثل BT Servant عبر الإنترنت (وعند تفعيل الذكاء الاصطناعي عبر الإنترنت يشرحها نموذج أكبر أيضًا). هذا ما يمكنك أن تسأل عنه:", notes: 'ملاحظات', terms: 'المصطلحات الرئيسية', questions: 'أسئلة' },
}
/** "What can you do?": what to ask (from About), and for a book it names, buttons to its introduction, chapter 1, notes, key terms. */
async function helpAnswer(q: string, ui: string): Promise<Msg> {
  const t = HELP_T[ui] ?? HELP_T.en!
  const follow: Followup[] = []
  const code = bookIn(q, ui)
  if (code) {
    const { sheet: probe } = await buildSheet('probe', { intent: 'unknown', lang: ui } as Slots, helpsLang)
    const B = bookLabel(ui, code)
    const go = (label: string, ref: string, what: string[]) => follow.push({ label, sheet: { ...bare(probe.lang), intent: 'passage', ref, what } })
    go(`${B} intro`, `${code} front:intro`, ['intro'])
    go(`${B} 1`, `${code} 1`, ['text', 'notes'])
    go(`${B} 1:1 ${t.notes}`, `${code} 1:1`, ['notes'])
    go(`${B} 1 ${t.terms}`, `${code} 1`, ['terms'])
    go(`${B} 1 ${t.questions}`, `${code} 1`, ['questions'])
  }
  follow.push(browseStep(ui))
  return { who: 'bot', intro: t.intro, info: whatYouCanAsk(ui), ui, follow, limits: true, meta: `${T.details}
(help: what you can ask)` }
}

/** `again`: what "Try again" asks again (the typed question, or a button's sheet); none, no "Try again" */
async function respond(c: Conv, label: string, make: () => Promise<Made>, again?: Again, mark = false) {
  busy = true
  btn.disabled = true
  const mine: Msg = { who: 'me', text: label, ...(mark ? { mark } : {}) }
  c.msgs.push(mine)
  if (!c.title) c.title = label.slice(0, 48)
  log.querySelector('.welcome')?.remove()
  log.appendChild(renderMsg(mine))
  const wait = el('div', 'msg bot pending', T.thinking)
  log.appendChild(wait)
  wait.scrollIntoView({ block: 'end', behavior: 'smooth' })
  const t0 = performance.now()
  if (!isOnline() && !document.querySelector('#netnote')) netNote('off')
  let answered = 'other'
  let qLang = ''
  let onlineCtx = '' // the passage's context for online AI (surrounding verses, introductions)
  let m: Msg
  let point: string | null = null
  try {
    // no language on this phone (the light build before its first download): nothing to search yet. The question waits; the
    // picker comes under it, and the question is asked again when the download ends (reaskWaiting)
    if (!(await installedLangs()).length) {
      answered = 'nopacks'
      throw { done: { who: 'bot', intro: FU(nav).kept, ui: nav, waiting: true, meta: `${T.details} · 0.0 s\nno language packs on this phone: the question waits for one` } }
    }
    const made = await make()
    qLang = made.sheet.lang ?? made.ui
    // what the answer is: pipeline.ts decides (and keeps the conversation's last passage and search results)
    const r = await answer(c, made, t0)
    answered = r.answered
    m = { who: 'bot', ...r.reply }
    point = r.node
    if (r.sheet && onlineOn() && onlineAvailable()) onlineCtx = await passageContext(r.sheet).catch(() => '')
  } catch (err: any) {
    // an error: the same question again, or Browse (no dead end)
    m = err?.done ?? { who: 'bot', text: `${T.failed} ${err instanceof Error ? err.message : String(err)}`, ui: nav, follow: [...againStep(nav, again), browseStep(nav)] }
    if (!err?.done) answered = 'failed'
  }
  count('answers')
  count(`kind.${answered}`)
  if (qLang) count(`lang.${qLang}`)
  // (out of scope says what Mini helps with on purpose: counted as such, not as an empty answer)
  if (answered === 'outofscope') count('oos')
  else if (answered !== 'failed' && !m.info && !m.study && !m.helps) count('empty')
  if (!m.packs && !m.waiting && (answered === 'failed' || (!m.info && !m.study && !m.helps && !m.follow?.length))) m.limits = true
  count('secs', Math.round((performance.now() - t0) / 1000))
  retries.set(m, () => respond(conv(), label, make, again, mark))
  c.msgs.push(m)
  // its point in the graph shows its latest answer
  const pt = nodeOf(c.graph, point)
  if (pt) {
    m.node = pt.id
    pt.msg = c.msgs.length - 1
  }
  updateMapBtn()
  c.updated = Date.now()
  save()
  // level 3 below: the online answer, if allowed and there is internet; the offline answer already stands
  // only from something found on the phone: with nothing found, the larger model would answer from memory (a report of Nov 13)
  const asking = m.who === 'bot' && !!(m.info || m.helps?.length || m.study) && onlineOn() && onlineAvailable() && isOnline()
  // while it is written, the phone's answer shows as it will under it (its helps as cards), so nothing moves when it arrives
  let node = renderMsg(m, asking)
  wait.replaceWith(node)
  if (m.waiting) {
    log.querySelectorAll('.fu').forEach((x) => x.remove())
    node.after(pickerFor(waitingLang(c)))
  }
  log.lastElementChild?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  busy = false
  setReady()
  if (log.contains(node)) placeModelOffer()
  // a language arrived while this was answered: the question that waited for it is asked now
  if (reaskLater) {
    reaskLater = false
    setTimeout(() => reaskWaiting(), 0)
  }
  if (asking) {
    // what the model is given, chosen with the conversation's graph (context.ts): the history of this answer's branch; the
    // helps the phone found (of an article, the sections the question needs) with the passage's context; the articles one
    // link away and the earlier points that share a word with the question; the path to this point. The articles the phone
    // found go as sources, so the answer is grounded in them and names them.
    // (on any error there, the phone's answer and the passage's context as before, so "writing…" never stays)
    const { helps, history, sources } = await buildContext({
      question: label, m, msgs: c.msgs, graph: c.graph, node: pt?.id ?? null, passage: onlineCtx, lang: m.lang || qLang || nav, read: packReader(openLang),
    }).catch(() => plainContext({ m, msgs: c.msgs, passage: onlineCtx }))
    const res = await onlineAnswer(label, m.ui ?? nav, helps, history, sources)
    count(res ? 'online.ok' : onlineProblem === 'limit' ? 'online.limit' : 'online.failed')
    if (res) {
      m.ai = res
      save()
      fillAi(node, m)
      return
    }
    // no online answer: the phone's answer as it is without online AI, with why above it
    const fresh = renderMsg(m)
    node.replaceWith(fresh)
    node = fresh
    const writing = el('p', 'ai', '')
    if (onlineProblem) {
      node.prepend(writing)
      // say why there is no online answer this time; the phone's answer stands
      writing.textContent = onlineProblem === 'signin' ? OT().relogin : onlineProblem === 'limit' ? OT().limit : NT().unreachable
      if (onlineProblem === 'network' && !isOnline()) netNote('off')
      // online AI did not answer: the question again (when there is a connection), or Browse; the phone's answer stands
      if (onlineProblem === 'network') writing.after(followRow(m, [...(isOnline() ? againStep(m.ui ?? nav, again) : []), browseStep(m.ui ?? nav)], 'follow ai-retry'))
    }
  }
}

// what the panel and the links ask the chat for: a Bible reference, or an article ("Open in chat")
const bare = (lang: string): Omit<Sheet, 'intent'> =>
  ({ id: `f${Date.now()}`, ref: null, what: [], version: null, concept: null, term: null, phrase: null, candidates: null, lang })
setHooks({
  ref: (ref, _label, lang) => {
    const [code, chv] = ref.split(' ')
    runSheet(`${bookLabel(nav, code!)} ${chv ?? ''}`.trim(), { ...bare(lang), intent: 'passage', ref, what: ['text', 'notes'] }, nav)
  },
  article: (id, title, lang) => runSheet(title, { ...bare(lang), intent: 'article', concept: id }, nav),
})
setViewLang(nav)
// Browse (explore.ts): the packs to read, the helps language first, and what a tap asks the chat for
setExploreHooks({
  ui: () => nav,
  packs: () => {
    // the helps language (else the app's), then English (as the answers fall back to it), then the others
    const first = examplesLang()
    return [...new Set([first, 'en', ...INSTALLED].filter((l): l is string => !!l && INSTALLED.includes(l)))]
  },
  packName: (l) => PACK_NAMES[l] ?? l,
  ask: (label, q) => {
    if (busy || locked()) return false
    runSheet(label, { ...bare(q.lang), intent: q.intent, ref: q.ref ?? null, what: q.what ?? [], concept: q.concept ?? null }, nav)
    return true
  },
  addLang: () => {
    panelView = 'packs'
    panel.classList.add('show')
    renderPanel()
  },
})

// Typing suggestions above the box (composer.ts, menu > Typing suggestions): its "✓" sends the box's text, which the submit
// below reads as a direct question (directRef → readQuestion with no reader: the reading the "✓" showed)
const cmp = mountComposer(form, input, {
  ui: () => nav, conv: () => conv(), packs: () => INSTALLED, busy: () => busy || locked(),
  send: () => form.requestSubmit(), ask: (label, sheet, ui) => runSheet(label, sheet, ui), browse: () => openExplore('bar'),
})

function runSheet(label: string, sheet: Sheet, ui: string) {
  if (busy) return
  respond(conv(), label, async () => ({ sheet: { ...sheet, id: `f${Date.now()}` }, ui, meta: '(follow-up: no model call)' }), { sheet, label })
}

/**
 * Back to a point of the conversation (the "← Back to …" button, a tap in the Map): a divider in the chat, the conversation's
 * state from that point, and its answer again, attached to it (its sheet asked again by code, or its message shown again when
 * it needed the typed question). What is asked next goes on from there; nothing is deleted.
 */
function goTo(id: string, from: 'back' | 'map') {
  if (busy) return
  const c = conv()
  const n = nodeOf(c.graph, id)
  if (!n) return
  count(from === 'map' ? 'graph.return' : 'graph.back')
  const label = backLine(nav, placeLabel(n, nav))
  const made = returnTo(c, id, nav)
  if (made) return respond(c, label, async () => made, { sheet: made.sheet, label }, true)
  const was = c.msgs[n.msg]
  if (was?.who !== 'bot') return
  const mine: Msg = { who: 'me', text: label, mark: true }
  const again: Msg = { ...was, node: id, rating: undefined, reported: undefined }
  c.msgs.push(mine, again)
  n.msg = c.msgs.length - 1
  c.updated = Date.now()
  save()
  log.querySelector('.welcome')?.remove()
  log.appendChild(renderMsg(mine))
  log.appendChild(renderMsg(again))
  log.lastElementChild?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  updateMapBtn()
}

// ------------------------------------------------------------------------------------------------------------ the map
// The conversation's graph as a list, full screen like Browse (and under the PIN lock like it): each point its name and a small
// mark for how it joined the one above (same passage, from it, new topic), indented when it went deeper or branched; the
// current point marked. A tap goes back there. From the menu and from the bar (next to Browse), once there are 3 points.
const MAP_MIN = 3
const ICONS: Record<string, string> = {
  start: '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
  line: '<path d="M12 3v18"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  deeper: '<path d="M6 4v8a4 4 0 0 0 4 4h9"/><path d="M15 12l4 4-4 4"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10"/><path d="M18 9c0 5-12 3-12 8"/>',
}
const svg = (inner: string, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`
const mapBtn = el('button', '') as HTMLButtonElement
mapBtn.id = 'mapbtn'
mapBtn.type = 'button'
mapBtn.hidden = true
mapBtn.innerHTML = svg(ICONS.branch!, 21)
browse.after(mapBtn)
mapBtn.onclick = () => {
  closePanel()
  openMap('bar')
}
const points = () => conv().graph?.nodes.length ?? 0
function updateMapBtn() {
  mapBtn.hidden = points() < MAP_MIN
  mapBtn.setAttribute('aria-label', GT(nav).mapLong)
  mapBtn.title = GT(nav).map
  if (mapIsOpen()) drawMap()
}
/** the long lines the person opened in the Map (by their first point) */
const mapOpened = new Set<string>()
let gmap: { root: HTMLElement; title: HTMLElement; body: HTMLElement; close: HTMLButtonElement } | null = null
let mapOpener: HTMLElement | null = null
const mapIsOpen = () => !!gmap?.root.classList.contains('open')
function ensureMap() {
  if (gmap) return gmap
  const root = el('div', '')
  root.id = 'gmap'
  root.tabIndex = -1
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'gm-title')
  const head = el('div', 'ex-head')
  const title = el('h2', 'ex-title')
  title.id = 'gm-title'
  const close = el('button', 'ex-btn', '✕') as HTMLButtonElement
  close.type = 'button'
  close.onclick = () => closeMap()
  head.append(title, close)
  const body = el('div', 'ex-body')
  root.append(head, body)
  document.body.appendChild(root)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mapIsOpen()) {
      e.preventDefault()
      closeMap()
    }
  })
  // the PIN lock covers the Map: it closes under the lock, so nothing is shown behind it
  new MutationObserver(() => { if (mapIsOpen() && document.querySelector('#lock')) closeMap(false) }).observe(document.body, { childList: true })
  gmap = { root, title, body, close }
  return gmap
}
function openMap(from: 'bar' | 'menu') {
  if (locked() || document.querySelector('#lock') || points() < 1) return
  count('graph.open')
  closeExplore(false)
  const b = ensureMap()
  mapOpener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
  b.root.classList.add('open')
  b.root.focus({ preventScroll: true })
  drawMap()
}
function closeMap(refocus = true) {
  if (!mapIsOpen()) return
  gmap!.root.classList.remove('open')
  const to = mapOpener
  mapOpener = null
  if (refocus && to?.isConnected) to.focus({ preventScroll: true })
}
function drawMap() {
  const b = ensureMap()
  const t = GT(nav)
  const g = conv().graph
  b.title.textContent = t.mapLong
  b.close.setAttribute('aria-label', t.close)
  b.body.innerHTML = ''
  b.body.appendChild(el('p', 'ex-note', t.hint))
  // a light path in this conversation: where it was, one tap to go on with it
  const path = g?.path
  const ps = path ? pathSheet(path) : null
  if (path && ps) {
    const label = pathLabel(nav, path, 'resume')
    const row = el('button', 'ex-row gm-row gm-path') as HTMLButtonElement
    row.type = 'button'
    const ic = el('span', 'gm-ic gm-line')
    ic.innerHTML = svg('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>')
    const txt = el('span', 'gm-txt')
    const name = el('span', 'ex-row-t', bidiLabel(label, nav))
    name.dir = rtlLang(nav) ? 'rtl' : 'ltr'
    txt.appendChild(name)
    row.append(ic, txt)
    row.onclick = () => {
      if (busy) return
      closeMap(false)
      count('guide.path.resume')
      runSheet(label, ps, nav)
    }
    b.body.appendChild(row)
  }
  const list = el('div', 'ex-rows gm-rows')
  let here: HTMLElement | null = null
  for (const r of g ? mapRows(g, mapOpened) : []) {
    const row = el('button', r.k === 'node' && r.cur ? 'ex-row gm-row on' : 'ex-row gm-row') as HTMLButtonElement
    row.type = 'button'
    // indented by depth (at most 6 steps: a small phone keeps room for the name)
    row.style.paddingInlineStart = `${6 + Math.min(r.depth, 6) * 18}px`
    if (r.k === 'more') {
      row.classList.add('gm-more')
      row.appendChild(el('span', 'ex-row-t', t.more.replace('{n}', String(r.n))))
      row.onclick = () => {
        mapOpened.add(r.key)
        drawMap()
      }
    } else {
      const ic = el('span', `gm-ic gm-${r.node.edge}`)
      ic.innerHTML = svg(ICONS[r.node.edge] ?? ICONS.start!)
      const txt = el('span', 'gm-txt')
      const name = el('span', 'ex-row-t', r.node.label)
      name.dir = dirOf(r.node.label) // what the person asked, or a button's label: its own direction
      txt.appendChild(name)
      txt.appendChild(el('span', 'ex-row-s', r.cur ? `${t.here} · ${t.edge[r.node.edge]}` : t.edge[r.node.edge]))
      row.append(ic, txt)
      if (r.cur) {
        row.setAttribute('aria-current', 'true')
        here = row
      }
      const id = r.node.id
      row.onclick = () => {
        if (busy) return
        closeMap(false)
        goTo(id, 'map')
      }
    }
    list.appendChild(row)
  }
  b.body.appendChild(list)
  b.body.scrollTop = 0
  if (here) (here as HTMLElement).scrollIntoView({ block: 'center' })
}

form.addEventListener('submit', (e) => {
  e.preventDefault()
  // without bidi marks: text copied from the app or pasted from WhatsApp may carry them (an isolated Ruth 2:3 is not read as a reference)
  const q0 = strip(input.value).trim()
  if (!q0 || busy) return
  // "Reply in Indonesian", "Repeat your last answer in Indonesian"
  const { q, target } = questionOf(q0, conv())
  input.value = ''
  cmp.clear()
  const c = conv()
  // only a reference ("Rut 2:3", "Jonás 1:3 notas"): code reads it, so neither reader runs (saves about 4 s on a phone)
  const direct = !has('help', q) && directRef(q)
  count('asked')
  count(direct ? 'model.skipped' : modelReady() && !modelOff() ? 'model.used' : 'model.none')
  respond(c, q0, async () => {
    // "What can you do?", "What questions can you answer about Titus?": what to ask, and for a book, a few ways in
    if (has('help', q)) throw { done: await helpAnswer(q, target ?? guessLang(q) ?? nav) }
    if (direct) return readQuestion(q, { slots: null, raw: 'model skipped (reference)', ms: 0 }, c, target)
    // with the online helper on and a connection, the online model reads the question; otherwise (or if it fails) the phone's
    // a follow-up ("and the notes?", "and verse 5?") is read with the previous question's compact state; the phone model
    // gets it only when trained for it (followUps)
    const st = stateLine(c)
    const on = await onlineSlots(q, st)
    if (on) count('read.online')
    const local = followUps() ? st : ''
    const { slots, raw, ms } = on ? { slots: on.slots, raw: `${st ? `${st}\n` : ''}(read online by ${modelLabel(on.model)})
${JSON.stringify(on.slots)}`, ms: on.ms } : await slotsOf(q, local).then((r) => ({ ...r, raw: local ? `${local}\n${r.raw}` : r.raw }))
    return readQuestion(q, { slots, raw, ms }, c, target)
  }, { q: q0 })
})
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    form.requestSubmit()
  }
})

// a PIN (menu > Safety) covers the app before anything shows, and again after a minute away
lock(nav)
watchAway(() => nav)
load()
renderConv()
function refreshInstalled() {
  return installedLangs().then((ls) => {
    const had = packsKnown ? INSTALLED.length > 0 : null
    INSTALLED = ls
    packsKnown = true
    $('#packs').textContent = ls.map((l) => PACK_NAMES[l] ?? l).join(' · ')
    // from no language to one (a download here or in the menu, a .tcpack file): the light build without a model offers it once
    if (had === false && ls.length && isLite() && modelState().state === 'missing') offerModel = true
    // the welcome (picker or examples) and a picker under a waiting question follow what is installed
    if (had !== ls.length > 0 && (!conv().msgs.length || !ls.length || had === false)) renderConv()
    // and a question that waited for a language is asked now (also at the start, if the app closed before it was)
    if (had !== true && ls.length) reaskWaiting()
  }).catch(() => {})
}
refreshInstalled()
onPacksChanged(() => {
  resetLangs()
  resetBooks()
  resetExplore()
  resetSearch()
  refreshInstalled().then(() => cmp.reset())
})
setReady()
// usage counts (only if turned on): this opening, and the days that ended go out when there is internet
setSnapshot(() => ({
  app: appVersion(), flavor: (window as any).Android ? (isLite() ? 'lite' : 'full') : 'desktop', ui: nav, packs: INSTALLED,
  model: modelOff() ? 'none' : modelReady() ? 'ready' : modelState().state, online: onlineOn(),
  mem: (navigator as any).deviceMemory ?? null,
}))
count('opens')
setTimeout(() => sendUsage(), 5000)
// once a day with internet, the added languages get the shared articles they lack (packs.ts updateLangs); silent
setTimeout(() => { if (isOnline()) updateLangs().catch(() => {}) }, 8000)
window.addEventListener('online', () => { sendUsage(); sendFeedback() })
setTimeout(() => sendFeedback(), 6000)
// a new version of the Android app (update.ts): the notice from the last check; a new check once a day, only if the internet is allowed
setTimeout(() => autoCheckUpdate(nav, (onlineOn() && onlineAvailable() && (!signInAvailable() || !!onlineSession())) || usageOn(), isOnline()), 10000)
window.addEventListener('online', () => autoCheckUpdate(nav, (onlineOn() && onlineAvailable() && (!signInAvailable() || !!onlineSession())) || usageOn(), true))
if (!isOnline()) netNote('off')
// the installable web app, in the browser: how to install it
if (PWA) pwaHint(nav)
// first launch: what BT Servant Mini is (and, in the light build, getting the model), then what may use the internet. An
// install from before this question gets the question once, with its current settings marked.
function firstSafety() {
  if (safetyAsked() || document.querySelector('#safety, #about')) return
  const stored = (k: string): boolean | null => {
    const v = localStorage.getItem(k)
    return v === '1' ? true : v === '0' ? false : null
  }
  const ask: ('online' | 'usage' | 'discreet')[] = [...(onlineAvailable() ? ['online' as const] : []), 'usage', ...(LIMITED ? [] : ['discreet' as const])]
  askSafety(nav, ask, async (a) => {
    if (!a) return
    if (a.discreet !== undefined) setDiscreet(a.discreet, nav)
    if (a.usage !== undefined) {
      setUsageOn(a.usage)
      if (a.usage) count('opens')
    }
    if (a.online === false) setOnline(false)
    if (a.online) await turnOnline()
    setReady()
  }, { online: stored('btsm.online'), usage: stored('btsm.usage'), discreet: discreetOn() || stored('btsm.discreet') }, true)
}
// The first launch goes straight to the quick questions and then the chat (where a phone with no language picks one): About is
// guidance, one tap away on the logo, the status and the menu.
try {
  if (!localStorage.getItem('btsm.onboarded')) localStorage.setItem('btsm.onboarded', '1')
} catch {}
firstSafety()
