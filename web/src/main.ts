// BT Servant Mini: a chat page. Question -> offline model (slots) -> call sheet -> recipe over the installed language packs ->
// a presenting sentence (converse.ts) + the information found + follow-ups. Up to three conversations, kept on the phone.
import { isSourceLine, passageContext, resetLangs, type Sheet } from './answer'
import { backPanel, fillTitles, groupObsHelps, linkFrameWords, linkObsWords, markCited, renderHelpCards, renderHelps, renderStudy, setHooks, setViewLang } from './view'
import { cardsT, chooseCards, showsCards } from './helpcards'
import { bookExact, buildSheet, type Slots } from './sheet'
import { appVersion, downloadModel, followUps, isLite, LIMITED, MODEL, modelOff, modelOutdated, modelReady, modelState, PWA, slotsOf } from './model'
import { aboutLabel, whatYouCanAsk, modelLine, modelNotice, modelNewer, modelSection, modelTitle, PACK_NAMES, showAbout } from './setup'
import { anyOf, backOf, MNT, menuGroups, resourcesSub, settingsRows, type MenuState, type PanelView } from './menu'
import { disposeHost, onDownloads, renderResources, renderServer, RT, type ResCtx } from './resources'
import { resetMacula } from './macula'
import { addUnits, aquiferOn, installedLangs, onPacksChanged, openLang, patchedKinds, setAquifer, setPacksServers, setYaapi, updateLangs, yaapiOn, type PatchKind } from './packs'
import { aquiferMenu, yaapiMenu } from './aquifer'
import { PREVIEW_SERVER } from './shared'
import { isCreditLine, onKinReady, warmKin } from './kin'
import { buildContext, packReader, plainContext } from './context'
import { type Again, againStep, bookLabel, browseStep, type Followup, splitFollow } from './converse'
import { renderMacula } from './syntaxview'
import { buildTree, saveReplacer, type TreeView } from './tree'
import { renderTree } from './treeview'
import { has } from './commands'
import { resetSearch } from './search'
import { md, mdDir } from './md'
import { bidiLabel, dirOf, rtlLang, strip } from './bidi'
import { pageAnswer } from './pager'
import { askSafety, closeSafety, safetyAsked } from './safety'
import { autoCheckUpdate, checkForUpdate, updateRow, updateSupported } from './update'
import { hint as pwaHint } from './pwa'
import { askReport, closeReport, feedbackBar, FT, type ReportMsg, sendFeedback, submitReport } from './feedback'
import { applyBrand, discreetOn, keepHistory, lock, locked, protectSummary, protectView, PT, setDiscreet, watchAway } from './protect'
import { count, lastSent, pendingReport, sendUsage, setSnapshot, setUsageOn, todayCounts, usageOn, USAGE_T } from './usage'
import { answer, backNow, treeBar, treeBase, treeStep, treeWords, codeReads, loadFixture5, contextSheet, type ConvState, env, guessLang, type Made, MAX_CONVS, moveOut, NP, pathLabel, pathSheet, placeLabel, questionOf, readQuestion, type Reply, resetBooks, returnTo, roomForNew, stateLine } from './pipeline'
import { backLine, GD, GT, mapRows, newGraph, nodeOf, sessionNode } from './graph'
import { isOnline, modelLabel, onlineAnswer, onlineAvailable, onlineOn, onlineProblem, onlineSession, onlineSlots, type OnlineAnswer, setOnline, signIn, signInAvailable, signOut } from './online'
import { shareButton, shareSession, shareTextButton } from './share'
import { FU, languagePicker, packFor, emptyLine, quickSpec, quickTap } from './firstuse'
import { backExplore, closeExplore, exploreStale, kinReadyExplore, modesOn, openExplore, openExploreAt, redrawExplore, resetExplore, setExploreHooks, XT } from './explore'
import { composerSwitch, mountComposer } from './composer'
import { forgetFreeHint, foundNothing, type Shape, shapeRow, understoodFor, understoodLine } from './teach'
import { closeHowto, forgetHowto, howtoLabel, howtoStep, openHowTo, setHowtoHooks } from './howto'
import { helpLines } from './helplines'
import { closeWelcome, forgetWelcome, offerFirst, openWelcome, refreshWelcome5, setWelcomeHooks, welcomeLabel } from './welcome'
import type { Fixture } from './dev'
import { covered5, fixtureNow5, on5m, onFive, refresh5 } from './five'
import { fiveText, sendTyped } from './modes'
import { initToBottom } from './tobottom'
import { initKeepView, toEnd, toQuestion } from './keepview'
import { waiting } from './waiting'
import { type Code as Code5, jump as jump5, next as next5, prev as prev5, type Session, sheetOf as sheetOf5, stepPlace } from './obs5m'
import { drawBar, drawCard, drawOutline } from './obs5mview'
import { W5 } from './obs5mwords'
import { obsLabel, obsPack, obsServer, parseObsRef, pictureFrame } from './obs'
import { type ObsStudy, obsStudyOf } from './obswords'
import { addObsPictures, addVersePicture, imagesInstalled } from './obsimg'
import { endSession, forgetAllReveals, forgetCard, forgetReveals, forgetSessions, revealedIn, revealedOn, revealOn, resumeIn, resumeTarget, type Saved5, savedSessions, saveSession } from './obs5mstore'
import { learnLabel, learnSheet, resetLearn } from './learn'
import { eraseSaved, queryOfAnswer, type Query, savedSummary, ST as SVT } from './saved'
import { backSaved, closeSaved, keepButtons, openSaved, setSavedHooks, yourNotes } from './savedview'

type UiText = {
  ph: string; send: string; loading: string; ready: string; thinking: string; failed: string; details: string
  chats: string; newChat: string; max: string; del: string; confirmDel: string; untitled: string; appLang: string; welcome: string; auto: string
}
const UI: Record<string, UiText> = {
  en: {
    ph: 'Ask about a verse or a word…', send: 'Send', loading: 'Starting the offline model…', ready: 'Works without internet',
    thinking: 'Looking in the translation helps…', failed: 'Something went wrong:', details: 'details',
    chats: 'Conversations', newChat: 'New conversation', max: 'You can keep up to 3 conversations. Delete one to start another.',
    del: 'Delete', confirmDel: 'Delete this conversation?', untitled: 'New conversation',
    appLang: 'App language', welcome: 'How can I help with your translation?', auto: 'Same as my question',
  },
  es: {
    ph: 'Pregunta por un versículo o palabra…', send: 'Enviar', loading: 'Iniciando el modelo sin conexión…',
    ready: 'Funciona sin internet', thinking: 'Buscando en las ayudas de traducción…', failed: 'Algo salió mal:', details: 'detalles',
    chats: 'Conversaciones', newChat: 'Nueva conversación', max: 'Puedes tener hasta 3 conversaciones. Borra una para empezar otra.',
    del: 'Borrar', confirmDel: '¿Borrar esta conversación?', untitled: 'Conversación nueva',
    appLang: 'Idioma de la app', welcome: '¿En qué te ayudo con tu traducción?', auto: 'El de mi pregunta',
  },
  fr: {
    ph: 'Un verset, un mot…', send: 'Envoyer', loading: 'Démarrage du modèle hors ligne…', ready: 'Fonctionne sans internet',
    thinking: 'Je cherche dans les aides à la traduction…', failed: 'Une erreur est survenue :', details: 'détails',
    chats: 'Conversations', newChat: 'Nouvelle conversation', max: "Vous pouvez garder 3 conversations. Supprimez-en une pour en commencer une autre.",
    del: 'Supprimer', confirmDel: 'Supprimer cette conversation ?', untitled: 'Nouvelle conversation',
    appLang: "Langue de l'application", welcome: 'Comment puis-je aider votre traduction ?', auto: 'Celle de ma question',
  },
  id: {
    ph: 'Tanya tentang ayat atau kata…', send: 'Kirim', loading: 'Memulai model offline…', ready: 'Bisa tanpa internet',
    thinking: 'Mencari di bahan bantu penerjemahan…', failed: 'Terjadi kesalahan:', details: 'detail',
    chats: 'Percakapan', newChat: 'Percakapan baru', max: 'Anda bisa menyimpan 3 percakapan. Hapus satu untuk memulai yang lain.',
    del: 'Hapus', confirmDel: 'Hapus percakapan ini?', untitled: 'Percakapan baru',
    appLang: 'Bahasa aplikasi', welcome: 'Apa yang bisa saya bantu untuk terjemahan Anda?', auto: 'Sesuai pertanyaan saya',
  },
  hi: {
    ph: 'किसी पद या शब्द के बारे में पूछें…', send: 'भेजें', loading: 'ऑफ़लाइन मॉडल शुरू हो रहा है…', ready: 'बिना इंटरनेट चलता है',
    thinking: 'अनुवाद सहायता में खोज रहा हूँ…', failed: 'कुछ गलत हो गया:', details: 'विवरण',
    chats: 'बातचीत', newChat: 'नई बातचीत', max: 'आप 3 बातचीत रख सकते हैं। नई शुरू करने के लिए एक हटाएँ।',
    del: 'हटाएँ', confirmDel: 'यह बातचीत हटाएँ?', untitled: 'नई बातचीत',
    appLang: 'ऐप की भाषा', welcome: 'आपके अनुवाद में मैं कैसे मदद करूँ?', auto: 'मेरे प्रश्न वाली',
  },
  ar: {
    ph: 'اسأل عن آية أو كلمة…', send: 'إرسال', loading: 'جارٍ تشغيل النموذج دون اتصال…', ready: 'يعمل دون إنترنت',
    thinking: 'أبحث في مساعدات الترجمة…', failed: 'حدث خطأ:', details: 'التفاصيل',
    chats: 'المحادثات', newChat: 'محادثة جديدة', max: 'يمكنك الاحتفاظ بثلاث محادثات. احذف واحدة لتبدأ أخرى.',
    del: 'حذف', confirmDel: 'حذف هذه المحادثة؟', untitled: 'محادثة جديدة',
    appLang: 'لغة التطبيق', welcome: 'كيف أساعدك في ترجمتك؟', auto: 'لغة سؤالي',
  },
}
const ONLINE_T: Record<string, { label: string; writing: string; sources: string; toggle: string; note: string; signIn: string; signedIn: string; signOut: string; signInNote: string; relogin: string; limit: string }> = {
  en: { label: 'Online AI', writing: 'Writing with online AI…', sources: 'Helps found (sources)', toggle: 'Answers with online AI (when there is internet)', note: 'Your question and the helps found are sent to an online model. Without internet the app answers as usual.', signIn: "Sign in with Google", signedIn: "Signed in{n}", signOut: "Sign out", signInNote: "Online AI asks you to sign in with Google. The service keeps only a code for your account, to count your answers of the day.", relogin: "Your online AI session ended: sign in again in Menu → Settings → Online AI.", limit: "Online AI has reached today's limit; the answer below is from the phone." },
  es: { label: 'IA en línea', writing: 'Escribiendo con IA en línea…', sources: 'Ayudas encontradas (fuentes)', toggle: 'Respuestas con IA en línea (cuando haya internet)', note: 'Tu pregunta y las ayudas encontradas se envían a un modelo en línea. Sin internet, la app responde como siempre.', signIn: "Iniciar sesión con Google", signedIn: "Sesión iniciada{n}", signOut: "Cerrar sesión", signInNote: "La IA en línea pide iniciar sesión con Google. El servicio solo guarda un código de tu cuenta, para contar tus respuestas del día.", relogin: "Tu sesión de IA en línea terminó: vuelve a iniciarla en Menú → Ajustes → IA en línea.", limit: "La IA en línea llegó al límite de hoy; la respuesta de abajo es la del teléfono." },
  fr: { label: 'IA en ligne', writing: "Rédaction avec l'IA en ligne…", sources: 'Aides trouvées (sources)', toggle: 'Réponses avec IA en ligne (quand il y a internet)', note: "Votre question et les aides trouvées sont envoyées à un modèle en ligne. Sans internet, l'application répond comme d'habitude.", signIn: "Se connecter avec Google", signedIn: "Connecté{n}", signOut: "Se déconnecter", signInNote: "L'IA en ligne demande de se connecter avec Google. Le service ne garde qu'un code de votre compte, pour compter vos réponses du jour.", relogin: "Votre session d'IA en ligne a pris fin : reconnectez-vous dans Menu → Réglages → IA en ligne.", limit: "L'IA en ligne a atteint la limite du jour ; la réponse ci-dessous vient du téléphone." },
  id: { label: 'AI daring', writing: 'Menulis dengan AI daring…', sources: 'Bahan bantu yang ditemukan (sumber)', toggle: 'Jawaban dengan AI daring (saat ada internet)', note: 'Pertanyaan Anda dan bahan bantu yang ditemukan dikirim ke model daring. Tanpa internet, aplikasi menjawab seperti biasa.', signIn: "Masuk dengan Google", signedIn: "Sudah masuk{n}", signOut: "Keluar", signInNote: "AI daring meminta Anda masuk dengan Google. Layanan hanya menyimpan sebuah kode akun Anda, untuk menghitung jawaban Anda hari ini.", relogin: "Sesi AI daring Anda berakhir: masuk lagi di Menu → Pengaturan → AI daring.", limit: "AI daring sudah mencapai batas hari ini; jawaban di bawah berasal dari ponsel." },
  hi: { label: 'ऑनलाइन AI', writing: 'ऑनलाइन AI से लिखा जा रहा है…', sources: 'मिली सहायता (स्रोत)', toggle: 'ऑनलाइन AI से उत्तर (जब इंटरनेट हो)', note: 'आपका प्रश्न और मिली सहायता एक ऑनलाइन मॉडल को भेजी जाती है। इंटरनेट के बिना ऐप सामान्य रूप से उत्तर देता है।', signIn: "Google से साइन इन करें", signedIn: "साइन इन है{n}", signOut: "साइन आउट", signInNote: "ऑनलाइन AI के लिए Google से साइन इन करना होता है। सेवा आपके खाते का केवल एक कोड रखती है, आज के आपके उत्तर गिनने के लिए।", relogin: "आपका ऑनलाइन AI सत्र समाप्त हो गया: मेनू → सेटिंग → ऑनलाइन AI में फिर से साइन इन करें।", limit: "ऑनलाइन AI आज की सीमा तक पहुँच गया; नीचे का उत्तर फ़ोन से है।" },
  ar: { label: 'ذكاء اصطناعي عبر الإنترنت', writing: 'جارٍ الكتابة بالذكاء الاصطناعي عبر الإنترنت…', sources: 'المساعدات التي وُجدت (المصادر)', toggle: 'إجابات بالذكاء الاصطناعي عبر الإنترنت (عند توفر الإنترنت)', note: 'يُرسَل سؤالك والمساعدات التي وُجدت إلى نموذج عبر الإنترنت. دون إنترنت يجيب التطبيق كالمعتاد.', signIn: "تسجيل الدخول باستخدام Google", signedIn: "تم تسجيل الدخول{n}", signOut: "تسجيل الخروج", signInNote: "يطلب الذكاء الاصطناعي عبر الإنترنت تسجيل الدخول باستخدام Google. لا تحتفظ الخدمة إلا برمز لحسابك، لعدّ إجاباتك اليومية.", relogin: "انتهت جلسة الذكاء الاصطناعي عبر الإنترنت: سجّل الدخول مجددًا من القائمة ← الإعدادات ← ذكاء اصطناعي عبر الإنترنت.", limit: "بلغ الذكاء الاصطناعي عبر الإنترنت حدّ اليوم؛ الإجابة أدناه من الهاتف." },
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
  /** the person's: a button's label (runSheet), not typed: its words do not choose the notes shown first */
  button?: boolean
  /** an answer: what ☆ Save keeps and where ✎ Note is tied (saved.ts: its passage, article or question) */
  saveQ?: Query
  /** an answer that found nothing for a typed question: the ways of asking code reads (teach.ts), each writing in the box */
  shapes?: Shape[]
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
  // (an OBS story's helps too: a whole story's are a few KB, a Bible chapter's study tens of KB)
  for (const c of convs) c.msgs.slice(0, -8).forEach((m) => { delete m.study; delete m.obs })
  try {
    if (keepHistory()) localStorage.setItem(KEY, JSON.stringify({ convs, current }, saveReplacer))
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
const toBottom = initToBottom(log, form) // the arrow back to the latest message (tobottom.ts)
const view = initKeepView(log) // the keyboard opening keeps the last message in view; a send follows the question (keepview.ts)
function applyUi() {
  document.documentElement.lang = nav
  document.documentElement.dir = nav === 'ar' ? 'rtl' : 'ltr'
  input.placeholder = T.ph
  btn.setAttribute('aria-label', T.send)
  menu.setAttribute('aria-label', T.chats)
  browse.setAttribute('aria-label', XT(nav).browseLong)
  browse.title = XT(nav).browse
  toBottom.setLang(nav)
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
/**
 * The online answer, last and folded ("Online AI · Llama 3.3 70B", Abel, Nov 17: "la explicación de la IA debería estar colapsada
 * también"): the phone's answer is read first, the AI's when the person opens it. Sharing and saving still take its text.
 */
function aiBlock(a: NonNullable<Msg['ai']>): HTMLElement {
  const ai = document.createElement('details')
  ai.className = 'ai sources'
  const sum = document.createElement('summary')
  sum.appendChild(el('span', 'ai-badge', bidiLabel(`${OT().label} · ${modelLabel(a.model)}`, nav)))
  ai.appendChild(sum)
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
/** The question whose words choose the notes shown first: what the person typed, not a button's label. */
function typedFor(m: Msg): string | undefined {
  const cv = convs.find((x) => x.msgs.includes(m))
  const prev = cv?.msgs[cv.msgs.indexOf(m) - 1]
  return prev?.who === 'me' && !prev.mark && !prev.button ? prev.text : undefined
}
/**
 * The online answer arrived for a message drawn while it was written: its text in place of "Writing…", the cards untouched,
 * and the share button made again, so it sends the online answer (it was made before it existed, or not at all); ☆ Save too,
 * so it keeps the online text (an item saved while it was written gets it: savedview.ts).
 */
function fillAi(node: HTMLElement, m: Msg) {
  if (!m.ai) return
  node.querySelector('.ai.pending')?.replaceWith(aiBlock(m.ai))
  markCited(node, (m.ai.sources ?? []).map((s) => s.id), m.ui ?? nav)
  const sh = shareButton(m, m.ui ?? nav, askedFor(m))
  node.querySelectorAll(':scope > .share, :scope > .keep').forEach((x) => x.remove())
  const rate = node.querySelector(':scope > .rate')
  for (const x of [sh, keepOf(m, true)]) if (x) rate ? rate.before(x) : node.appendChild(x)
}
/** What ☆ Save keeps and ✎ Note is tied to: the answer's query, or for an older answer the question it answers. */
const savedQOf = (m: Msg): Query | null => m.saveQ ?? (m.waiting || m.limits || m.packs ? null : queryOfAnswer({ q: askedFor(m) }))
/** ☆ Save and ✎ Note under an answer (savedview.ts); `arrived`: its online text has just come. */
const keepOf = (m: Msg, arrived = false) => !m.waiting && !m.limits && !m.packs && (m.info || m.study || m.helps?.length || m.ai)
  ? keepButtons({ q: savedQOf(m), label: askedFor(m) ?? m.text ?? '', ai: () => m.ai, question: askedFor(m), arrived, pending: pendingOf(m) }) : null
/** The item an answer's ☆ saved while its online answer was written (only that one gets the text when it comes). */
const savedWhilePending = new WeakMap<Msg, string>()
const pendingOf = (m: Msg) => ({
  get saved() { return savedWhilePending.get(m) },
  set: (id: string | undefined) => { if (id && !m.ai) savedWhilePending.set(m, id); else savedWhilePending.delete(m) },
})
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
  // how the app read the person's question, under it ("Understood: Ruth 2:3 · notes", teach.ts): a tap puts it back in the box
  const cv = convs.find((x) => x.msgs.includes(m))
  const got = cv ? understoodFor(cv.msgs, cv.graph, m, nav) : null
  if (got) d.appendChild(understoodLine(got, nav, () => cmp.restore(got.q)))
  // on a light path: where it is ("Ruth 1:6–18 · step 4 of 5: notes"), first
  if (m.pathMark) {
    const pm = el('div', 'path-mark', bidiLabel(m.pathMark, m.ui ?? nav))
    pm.dir = rtlLang(m.ui ?? nav) ? 'rtl' : 'ltr'
    d.appendChild(pm)
  }
  // a step of a 5M session: where it is ("Movement 1 · observation · frame 5/16"), first
  if (m.sessionMark && on5m()) {
    const sm = el('div', 'path-mark s5-mark', bidiLabel(m.sessionMark, m.ui ?? nav))
    sm.dir = rtlLang(m.ui ?? nav) ? 'rtl' : 'ltr'
    d.appendChild(sm)
  }
  // what the person wrote about this verse, article or question (saved.ts), above the answer
  d.appendChild(yourNotes(savedQOf(m)))
  // the question this answers (the person's message before it): the passage shows the notes about its words first
  const asked = askedFor(m)
  // a one-verse answer: the picture of the Open Bible Stories frame that tells the verse (obs-frames), above the answer and outside
  // any fold, when the phone can show it (obsimg.ts addVersePicture; an OBS answer has its own pictures, never this one)
  const picSlot = el('div', 'verse-pic-slot')
  d.appendChild(picSlot)
  void addVersePicture(picSlot, m.meta, m.ui ?? nav, (ref) => pictureFrame(ref, m.lang ?? 'en'))
  // the phone's answer first, open, as without online AI (the passage, its helps folded as always); with an online answer (or
  // while it is written), then the helps it was grounded in as cards behind one fold ("Helps of this answer (3)"), then the
  // online answer itself, last, with its badge (Abel, Nov 17: "primero es el contenido que viene de los datos"). It is drawn
  // the same while it is written ("Writing…" last) and when it arrives (fillAi puts it in that place).
  const host: HTMLElement = d
  let sourceLine = ''
  if (m.intro) host.appendChild(el('p', 'intro', m.intro))
  if (m.study) {
    const sb = host.appendChild(renderStudy(m.study, typedFor(m)))
    // a long answer in parts (pager.ts): only how it is drawn, the message keeps all of it
    pageAnswer(sb, m.ui ?? nav)
  }
  // who is who, the sentence's structure (macula.ts): drawn, its text kept for sharing and reports
  else if (m.macula) host.appendChild(renderMacula(m.macula))
  // a family tree (tree.ts): drawn in place of its text; a saved one is drawn from its text first and replaced when it is built again
  else if (m.tree) host.appendChild(treeBlock(m, m.tree))
  else if (m.info) {
    const box = el('div', m.intro ? 'info' : 'plain md')
    box.innerHTML = md(m.info, m.ctx ?? '') // md() escapes everything first
    box.dir = mdDir(m.info)
    fillTitles(box, m.lang ?? 'en')
    // the source line ("Fuente: es-419_gl/es-419/obs v2, …"), technical, goes into the "details" fold below (Abel, Nov 17)
    const last = box.lastElementChild
    if (last?.tagName === 'P' && last.children.length === 1 && last.firstElementChild?.tagName === 'EM' && isSourceLine(last.textContent ?? '')) {
      sourceLine = last.textContent?.trim() ?? ''
      last.remove()
    }
    // a family answer's sources ("Datos de familia: TIPNR (STEPBible), ACAI (BiblioNexus)", kin.ts): in sight, small and grey like an
    // article's source label (Abel, Nov 18: not big, not hidden in «detalles»)
    else if (last?.tagName === 'P' && last.children.length === 1 && last.firstElementChild?.tagName === 'EM' && isCreditLine(last.textContent ?? '')) last.className = 'credit'
    // an Open Bible Stories answer: each frame's picture above its text (obsimg.ts: the phone's, Door43's, or a placeholder)
    addObsPictures(box, m.meta, m.ui ?? nav)
    // an OBS story or frame: the words its notes and key terms quote, tappable as a passage's (obswords.ts)
    if (m.obs) linkObsWords(box, m.obs)
    // its helps in three levels: all the notes, a frame's, each note (view.ts)
    if (m.obs) groupObsHelps(box)
    host.appendChild(box)
    pageAnswer(box, m.ui ?? nav)
    if (m.treeOf) {
      const of = m.treeOf
      void buildTree(of.pack, of.id, of.mode, m.ui ?? nav, of.open, of.down).then((v) => {
        if (!v.focus.name || v.focus.name === v.focus.id) return
        m.tree = v
        if (box.isConnected) box.replaceWith(treeBlock(m, v))
      }).catch((e) => { console.warn('tree: kept as text', e) })
    }
  }
  if (m.helps?.length) host.appendChild(renderHelps(m.helps))
  if (showsCards(m, pending)) {
    const ui = m.ui ?? nav
    const plan = chooseCards({
      study: m.study, info: m.info, intro: m.intro, ctx: m.ctx, lang: m.lang, helps: m.helps, question: typedFor(m),
      sources: m.ai?.sources?.length ? m.ai.sources : m.sources, cited: m.ai?.sources?.map((s) => s.id),
    })
    // the cards of the text and of the phone's answer would repeat what is open above: the notes and articles only
    const cards = plan.cards.filter((c) => c.kind !== 'text' && c.kind !== 'answer')
    const reveal = () => {}
    if (cards.length) {
      const fold = document.createElement('details')
      fold.className = 'sources fold'
      fold.appendChild(el('summary', '', `${cardsT(ui).head} (${cards.length})`))
      const box = renderHelpCards(cards, { ui, lang: m.lang ?? 'en', study: m.study, helps: m.helps, reveal })
      box.querySelector('.hc-head')?.remove() // the fold says it
      fold.appendChild(box)
      d.appendChild(fold)
    }
    d.appendChild(m.ai ? aiBlock(m.ai) : waiting(OT().writing, 'p', 'ai'))
  }
  // a step of a 5M session: its card (obs5mview.ts; the manual's answers only behind [Show answer]), in place of its plain text
  // (with the 5M off, a saved step reads as before: its plain text, no way back to a session)
  const s5 = on5m()
  // (a card always draws hidden: what was revealed on it before is forgotten)
  if (m.card && s5 && cv && m.node) forgetCard(cv.id, m.node)
  if (m.card && s5) d.appendChild(drawCard(m.card, m.ui ?? nav, cardHooks(cv, m.ui ?? nav, m.node)))
  else if (m.text) d.appendChild(el('div', 'plain', m.text))
  // found nothing: the ways of asking code reads, with what it knew of the question written in (a tap writes in the box)
  if (m.shapes?.length) d.appendChild(shapeRow(m.shapes, m.ui ?? nav, (s) => cmp.offer(s)))
  // the way back to the 5M session, to the passage this answer left (and to the path it left), on its own row, then the next steps
  const backs = [s5 ? m.sessionBack : undefined, m.back, m.pathBack].filter((f): f is Followup => !!f)
  if (backs.length) d.appendChild(followRow(m, backs, 'follow back-row'))
  // a path starts: the line that proposes it, just above its first step
  if (m.pathLine) {
    const pl = el('p', 'path-line', bidiLabel(m.pathLine, m.ui ?? nav))
    pl.dir = rtlLang(m.ui ?? nav) ? 'rtl' : 'ltr'
    d.appendChild(pl)
  }
  if (m.follow?.length) d.appendChild(followRow(m, m.follow, 'follow', backs.length))
  // far from where the conversation started: "Shall we start a new conversation for this?", while it is the last answer
  if (m.drift && cv && cv.msgs[cv.msgs.length - 1] === m && nodeOf(cv.graph, m.node)?.drift === 'offered') d.appendChild(driftOffer(cv, m))
  // the language is missing: straight to where it is added
  if (m.packs) {
    const a = el('button', 'about-link', NP(m.ui ?? nav).add) as HTMLButtonElement
    a.type = 'button'
    a.onclick = () => {
      panelView = 'resources'
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
  // (the button is the app's: its words follow the app's language, not the answer's)
  const sh = m.waiting ? null : (s5 && m.card ? sessionShare(cv, nav) : null) ?? shareButton(m, m.ui ?? nav, asked, nav)
  if (sh) d.appendChild(sh)
  // ☆ Save and ✎ Note (savedview.ts); with an online answer, Save keeps its text too
  const keep = keepOf(m)
  if (keep) d.appendChild(keep)
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
  if (m.meta || sourceLine) {
    const det = document.createElement('details')
    det.appendChild(el('summary', '', bidiLabel(m.meta?.split('\n')[0] || T.details, m.ui ?? nav)))
    if (sourceLine) {
      const p = det.appendChild(el('p', 'src-line', sourceLine))
      p.dir = 'auto'
    }
    if (m.meta) det.appendChild(el('pre', '', m.meta.split('\n').slice(1).join('\n')))
    d.appendChild(det)
  }
  return d
}
/** An answer that can be asked again (it failed): the same question, the same way. */
const retries = new WeakMap<Msg, () => void>()
/** The next steps under an answer: a ready sheet (no model call), Browse at a book or manual, or the question again. */
/** "More ▸": the next steps that are not in sight (converse.ts splitFollow). */
const MORE: Record<string, string> = { en: 'More', es: 'Más', fr: 'Plus', id: 'Lainnya', hi: 'और', ar: 'المزيد' }
/**
 * A row of next steps. `backs`: how many ways back are drawn above it (the main row): it then shows only a few, the way back
 * counted, and the others behind "More ▸" (Abel, Nov 17: ten buttons under Genesis 3 were a wall); the back row shows all.
 */
function followRow(m: Msg, follow: Followup[], cls = 'follow', backs = -1): HTMLElement {
  const f = el('div', cls)
  // in the app's direction (not the answer's: an Arabic answer in an English app keeps English buttons left to right)
  const ui = m.ui ?? nav
  f.dir = rtlLang(ui) ? 'rtl' : 'ltr'
  const { shown, more } = backs < 0 ? { shown: follow, more: [] as Followup[] } : splitFollow(follow, backs)
  for (const x of shown) f.appendChild(followButton(m, x))
  if (more.length) {
    // (the app's words, not the answer's: an English question in a Spanish app does not turn "Más" into "More")
    const b = el('button', 'more', bidiLabel(`${MORE[nav.split('-')[0]!] ?? MORE.en} ${rtlLang(nav) ? '◂' : '▸'}`, nav)) as HTMLButtonElement
    b.type = 'button'
    b.onclick = () => {
      const bs = more.map((x) => followButton(m, x))
      b.replaceWith(...bs)
      bs[0]?.focus()
    }
    f.appendChild(b)
  }
  return f
}
/** A family tree as the bubble shows it (treeview.ts), with the credit line of its text under it. */
function treeBlock(m: Msg, v: TreeView): HTMLElement {
  const ui = m.ui ?? nav
  const base = treeBase(v.pack)
  const wrap = el('div', 'tree-block')
  wrap.appendChild(renderTree(v, {
    bar: (id, from) => treeBar(base, v.ui, id, from, v.mode, v.focus.id),
    button: (f) => followButton(m, f),
    words: treeWords(v.ui, v),
    ancestors: v.mode === 'tree' ? treeStep(base, v.ui, 'up', v.focus.id, v.focus.name) : undefined,
    treeOf: (id) => treeStep(base, v.ui, 'tree', id, v.nodes.find((n) => n.id === id)?.name ?? ''),
  }))
  const last = (m.info ?? '').split('\n\n').pop() ?? ''
  if (isCreditLine(last.replace(/^\*|\*$/g, ''))) {
    const c = el('p', 'credit', last.replace(/^\*|\*$/g, ''))
    c.dir = rtlLang(ui) ? 'rtl' : 'ltr'
    wrap.appendChild(c)
  }
  return wrap
}
/** One next step's button. */
function followButton(m: Msg, x: Followup): HTMLButtonElement {
  const ui = m.ui ?? nav
  // a way back reads as it is now, in the app's language (a message kept from before has the words and the place it was drawn with)
  const now = backNow(conv().graph, x, nav)
  const b = el('button', '', now ? bidiLabel(now, nav) : bidiLabel(x.label, ui)) as HTMLButtonElement
  b.type = 'button'
  if (x.back || x.toPath || x.toSession) b.className = 'back'
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
    } else if (x.howto) {
      closePanel()
      openHowTo(m.ui ?? nav)
    } else if (x.typed) {
      // sent as if typed (the 5M button under a story)
      if (busy) return
      sendTyped(input, form, x.typed)
    } else if (x.add) {
      // a unit added on a tap (Open Bible Stories), then the same question again; a failure says so on the button
      if (busy || b.disabled) return
      b.disabled = true
      addUnits(x.add.lang, [x.add.unit]).then(() => { if (x.sheet) runSheet(x.label, x.sheet, m.ui ?? nav) }, () => {
        b.disabled = false
        b.textContent = bidiLabel(`${T.failed} ${x.label}`, ui)
      })
    } else if (x.sheet) runSheet(x.label, x.sheet, m.ui ?? nav)
  }
  return b
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
      panelView = 'resources'
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
/**
 * The empty conversation's quick actions, one row of pills (RTL mirrors by the row's dir): a saved 5M session to continue, Browse,
 * a guided mode (only when the phone has one), and How to ask. The row is drawn once: the mode's slot is kept while it is read (the
 * last answer is remembered, so a later screen is exact at once), then shown or taken away in place, so the other pills stay put
 * and the focus is not lost.
 */
let quickModes: boolean | null = null
let quickKey = '' // what quickModes was read for: the packs and the 5M (a change reads it again)
function quickRow(): HTMLElement {
  const row = el('div', 'quick')
  row.dir = rtlLang(nav) ? 'rtl' : 'ltr'
  const key = `${INSTALLED.join()}|${on5m()}`
  if (quickKey !== key) { quickKey = key; quickModes = null }
  const saved = resumeEntries()
  const note = el('p', 'quick-note')
  note.setAttribute('role', 'status')
  const hooks = {
    explore: () => openExplore('welcome'),
    modes: () => openExploreAt({ mode: 'list', from: 'welcome' }),
    howto: () => openHowTo(nav),
    resume: (i: number) => (busy || locked() ? false : saved[i]?.go() ?? false),
  }
  const modeBtn: { b?: HTMLButtonElement } = {}
  for (const q of quickSpec(nav, { modes: quickModes, resume: saved.map((r) => r.label), explore: XT(nav).browse, howto: howtoLabel(nav) })) {
    const b = el('button', q.kind === 'resume' ? 'quick-resume' : '', bidiLabel(q.label, nav)) as HTMLButtonElement
    b.type = 'button'
    b.dataset.quick = q.kind
    if (q.hidden) { b.style.visibility = 'hidden'; b.disabled = true; b.setAttribute('aria-hidden', 'true') }
    if (q.kind === 'mode') modeBtn.b = b
    b.onclick = () => {
      note.textContent = ''
      // the same note Browse gives for a mode or a story asked while an answer is on its way
      if (!quickTap(q, hooks)) note.textContent = XT(nav).busy
    }
    row.appendChild(b)
  }
  if (quickModes === null) {
    modesOn(INSTALLED).then((m) => {
      if (quickKey === key) quickModes = m.length > 0 // (not kept if the packs changed while it was read)
      const b = modeBtn.b
      if (!b?.isConnected) return
      if (m.length) { b.style.visibility = ''; b.disabled = false; b.removeAttribute('aria-hidden') } else b.remove()
    }).catch(() => modeBtn.b?.remove()) // a failed read: no gap, and it is read again next time
  }
  const box = el('div', 'quick-box')
  box.append(row, note)
  return box
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
      w.appendChild(el('p', '', emptyLine(nav)))
      // someone new: the welcome "What would you like to do today?" once (welcome.ts); only once the languages are known (its
      // How to ask line is not drawn here: [How to ask] is always among the quick actions)
      if (INSTALLED.length) offerFirst(nav, !convs.some((x) => x.msgs.length))
      w.appendChild(quickRow())
    }
    log.appendChild(w)
    placeModelOffer()
    return
  }
  for (const m of c.msgs) log.appendChild(renderMsg(m))
  if (noPacks) log.appendChild(pickerFor(waitingLang(c)))
  updateMapBtn()
  placeModelOffer()
  view.release() // another conversation: a send's target in the one left is let go
  log.lastElementChild?.scrollIntoView({ block: 'end' })
}
let panelView: PanelView = 'main'
const MTS: Record<string, { language: string; on: string; off: string; none: string; back: string }> = {
  en: { language: 'Language', on: 'On', off: 'Off', none: 'None', back: 'Back' },
  es: { language: 'Idioma', on: 'Activada', off: 'Apagada', none: 'Ninguno', back: 'Atrás' },
  fr: { language: 'Langue', on: 'Activée', off: 'Désactivée', none: 'Aucun', back: 'Retour' },
  id: { language: 'Bahasa', on: 'Aktif', off: 'Mati', none: 'Tidak ada', back: 'Kembali' },
  hi: { language: 'भाषा', on: 'चालू', off: 'बंद', none: 'कोई नहीं', back: 'वापस' },
  ar: { language: 'اللغة', on: 'مفعّل', off: 'مُطفأ', none: 'لا شيء', back: 'رجوع' },
}
const MT = () => MTS[nav] ?? MTS.en!

function renderPanel() {
  disposeScreen()
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
  // under the conversations, three groups of rows: its name, what it is now, and a tap opens it
  readMenuFacts()
  const st = menuState()
  const titles: Record<string, string> = {
    explore: XT(nav).browse, saved: SVT(nav).title, map: GT(nav).mapLong, resources: MNT(nav).resources, language: MT().language, settings: MNT(nav).settingsRow,
  }
  const opens: Record<string, () => void> = {
    explore: () => { closePanel(); openExplore('menu') },
    saved: () => { closePanel(); openSaved() },
    map: () => { closePanel(); openMap('menu') },
    resources: () => go('resources')(),
    language: () => go('language')(),
    settings: () => go('settings')(),
  }
  resSubEl = null
  for (const g of menuGroups(st)) {
    panel.appendChild(el('h3', '', MNT(nav)[g.group]))
    const list = el('div', 'mrows')
    for (const r of g.rows) {
      const sub = mrow(list, titles[r.id]!, r.sub, opens[r.id]!)
      if (r.id === 'resources') resSubEl = sub
    }
    panel.appendChild(list)
  }
  const foot = el('div', 'foot')
  const link = (label: string, open: () => void) => {
    const b = el('button', 'about-link', label) as HTMLButtonElement
    b.type = 'button'
    b.onclick = open
    foot.appendChild(b)
  }
  link(howtoLabel(nav), () => { closePanel(); openHowTo(nav) })
  link(welcomeLabel(nav), () => { closePanel(); openWelcome(nav) })
  link(aboutLabel(nav), () => { closePanel(); showAbout(nav, () => setReady()) })
  panel.appendChild(foot)
}

/** One row of the menu or of Settings: title, line, arrow; returns the line's element (the menu keeps the downloads' line fresh). */
function mrow(list: HTMLElement, title: string, sub: string, open: () => void): HTMLElement {
  const b = el('button', 'mrow') as HTMLButtonElement
  b.type = 'button'
  const s = el('span', 'mrow-s', sub)
  b.append(el('span', 'mrow-t', title), s, el('span', 'mrow-c', '›'))
  b.onclick = open
  list.appendChild(b)
  return s
}
const go = (v: PanelView) => () => {
  panelView = v
  renderPanel()
}
// what Browse and Resources have on the phone, read between draws (the menu draws at once and again if these changed)
let facts = { stories: false, modes: false, images: false }
let resSubEl: HTMLElement | null = null
function readMenuFacts() {
  const langs = INSTALLED
  void Promise.all([
    anyOf(langs, (l) => obsPack(l).then((o) => !!o, () => false)),
    langs.length ? modesOn(langs).then((m) => m.length > 0, () => false) : false,
    imagesInstalled().then((i) => !!i && 'bytes' in i, () => false),
  ]).then(([stories, modes, images]) => {
    if (stories === facts.stories && modes === facts.modes && images === facts.images) return
    facts = { stories, modes, images }
    if (panel.classList.contains('show') && panelView === 'main') renderPanel()
  })
}
function menuState(): MenuState {
  const c = conv()
  const at = nodeOf(c.graph, c.graph?.cur)
  const uiName = UI_LANGS.find(([code]) => code === nav)?.[1] ?? nav
  return {
    ui: nav, hasLang: INSTALLED.length > 0, ...facts, savedSub: savedSummary(nav),
    map: points() >= MAP_MIN ? [GT(nav).points.replace('{n}', String(points())), at?.label].filter(Boolean).join(' · ') : null,
    langs: INSTALLED.length, uiName, answersName: helpsLang ? PACK_NAMES[helpsLang] ?? helpsLang : T.auto,
    online: onlineAvailable(), update: updateSupported(), safety: protectSummary(nav, '') || null,
  }
}
// a download moved: the Resources row's line says how far (only that line is written, so a half-armed delete is not lost)
onDownloads(() => {
  if (!resSubEl || !panel.contains(resSubEl) || panelView !== 'main') return
  const t = resourcesSub(menuState())
  if (resSubEl.textContent !== t) resSubEl.textContent = t
})

// the screen drawn by resources.ts in the panel: dropped when the view changes or the panel closes
let screenOff: (() => void) | null = null
let screenHost: HTMLElement | null = null
let screenTurn = 0
function disposeScreen() {
  screenTurn++
  screenOff?.()
  screenOff = null
  if (screenHost) disposeHost(screenHost)
  screenHost = null
}

/** One screen of the panel (Settings, Resources, the server, or one setting), with a way back one level up. */
function renderSubPanel(v: Exclude<PanelView, 'main'>) {
  panel.innerHTML = ''
  panel.classList.add('sub')
  const head = el('div', 'subhead')
  const back = el('button', 'back', '‹') as HTMLButtonElement
  back.type = 'button'
  back.setAttribute('aria-label', MT().back)
  back.onclick = () => {
    panelView = backOf(v) ?? 'main'
    renderPanel()
  }
  const titles: Record<Exclude<PanelView, 'main'>, string> = {
    language: MT().language, online: OT().label, model: modelTitle(nav), resources: MNT(nav).resources, server: RT(nav).serverTitle,
    settings: MNT(nav).settingsRow, usage: UT().title, safety: PT(nav).title,
  }
  head.append(back, el('h2', '', titles[v]))
  panel.appendChild(head)
  if (v === 'language') renderLanguageView()
  else if (v === 'settings') renderSettingsView()
  else if (v === 'online') renderOnlineView()
  else if (v === 'usage') renderUsageView()
  else if (v === 'safety') panel.appendChild(protectView(nav, eraseAll, () => renderPanel()))
  else if (v === 'model') panel.appendChild(modelSection(nav, () => {
    setReady()
    renderPanel()
  }))
  else {
    const host = el('div', 'setup')
    screenHost = host
    panel.appendChild(host)
    const mine = screenTurn
    const panelLang = nav
    const ctx: ResCtx = {
      ui: nav, refresh: () => { refreshInstalled(); renderPanel() }, openServer: go('server'), openLanguage: go('language'),
    }
    void (v === 'server' ? renderServer : renderResources)(host, ctx).then((off) => {
      // the person went elsewhere while it drew: let it go
      if (mine === screenTurn && panel.classList.contains('show') && panelView === v && panelLang === nav) screenOff = off
      else off()
    })
  }
}

/** "Use Aquifer complementary helps": on, Aquifer fills the notes, questions and introductions Door43 lacks (never replaces Door43's). */
function aquiferSwitch(): HTMLButtonElement {
  const q = aquiferMenu(nav)
  const b = el('button', 'mrow') as HTMLButtonElement
  b.type = 'button'
  b.setAttribute('role', 'switch')
  const sub = el('span', 'mrow-s')
  const paint = () => {
    b.setAttribute('aria-checked', String(aquiferOn()))
    sub.textContent = `${aquiferOn() ? q.on : q.off} · ${q.hint}`
  }
  b.append(el('span', 'mrow-t', q.title), sub)
  b.onclick = () => {
    setAquifer(!aquiferOn())
    paint()
  }
  paint()
  return b
}
/** "Use yaapi Bible texts": on, a published version's text fills the books Door43 has no Bible text for (unaligned, marked). */
function yaapiSwitch(): HTMLButtonElement {
  const q = yaapiMenu(nav)
  const b = el('button', 'mrow') as HTMLButtonElement
  b.type = 'button'
  b.setAttribute('role', 'switch')
  const sub = el('span', 'mrow-s')
  const paint = () => {
    b.setAttribute('aria-checked', String(yaapiOn()))
    sub.textContent = `${yaapiOn() ? q.on : q.off} · ${q.hint}`
  }
  b.append(el('span', 'mrow-t', q.title), sub)
  b.onclick = () => {
    setYaapi(!yaapiOn())
    paint()
  }
  paint()
  return b
}
/** Settings: the rows of the old menu that are about how the app works, each opening its own screen. */
function renderSettingsView() {
  const list = el('div', 'mrows')
  const onOff = (b: boolean) => (b ? MT().on : MT().off)
  for (const id of settingsRows({ online: onlineAvailable(), update: updateSupported(), aquifer: PATCHED.includes('aquifer'), yaapi: PATCHED.includes('yaapi') })) {
    if (id === 'online') mrow(list, OT().label, onOff(onlineOn() && (!signInAvailable() || !!onlineSession())), go('online'))
    else if (id === 'model') mrow(list, modelTitle(nav), modelOff() ? MT().none : `FunctionGemma 270M · ${modelLine(nav)}`, go('model'))
    else if (id === 'suggest') list.appendChild(composerSwitch(nav, MT().on, MT().off))
    else if (id === 'aquifer') list.appendChild(aquiferSwitch())
    else if (id === 'yaapi') list.appendChild(yaapiSwitch())
    else if (id === 'safety') mrow(list, PT(nav).title, protectSummary(nav, MT().off), go('safety'))
    else if (id === 'usage') mrow(list, UT().title, onOff(usageOn()), go('usage'))
    else if (id === 'update') {
      const u = updateRow(nav)
      mrow(list, u.title, u.sub, () => { checkForUpdate(nav, true, () => renderPanel()) })
    }
  }
  panel.appendChild(list)
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
  panel.appendChild(el('h3', '', MNT(nav).answersTitle))
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
  // the languages on the phone are the ones listed; more come from Resources
  panel.appendChild(el('p', 'note', MNT(nav).missing))
  const more = el('button', 'about-link', MNT(nav).toResources) as HTMLButtonElement
  more.type = 'button'
  more.onclick = go('resources')
  panel.appendChild(more)
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
  forgetHowto()
  forgetWelcome()
  forgetFreeHint() // the composer's grey line for a free question shows again the first three times
  eraseSaved() // and the saved items and notes
  forgetSessions() // and where 5M sessions were
  forgetAllReveals()
  newConv()
  renderConv()
}
const closePanel = () => {
  panel.classList.remove('show')
  disposeScreen()
}
// Android's back button (MainActivity.onBackPressed): the bottom panel, then the About page, then the menu; else it leaves
;(window as any).__back = (): boolean => {
  if (locked()) return false // the back button leaves the app; it never opens it
  if (closeSafety()) return true
  if (closeReport()) return true
  if (closeHowto()) return true
  if (closeWelcome()) return true
  if (backPanel()) return true
  if (backSaved()) return true
  if (backExplore()) return true
  if (mapIsOpen()) { closeMap(); return true }
  if (outIsOpen()) { closeOutline(); return true }
  const about = document.querySelector('#about')
  if (about) { about.remove(); return true }
  if (panel.classList.contains('show') && panelView !== 'main') { panelView = backOf(panelView) ?? 'main'; renderPanel(); return true }
  if (panel.classList.contains('show')) { closePanel(); return true }
  return false
}
browse.onclick = () => {
  closePanel()
  closeMap(false)
  closeSaved(false)
  openExplore('bar')
}
menu.onclick = () => {
  closeExplore()
  closeMap(false)
  panelView = 'main'
  if (panel.classList.contains('show')) closePanel() // the same path as every other close: the screen in it stops drawing
  else {
    panel.classList.add('show')
    renderPanel()
  }
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
  en: { intro: "BT Servant Mini finds what you need in the translation helps on this phone, without internet, and follows the conversation: ask follow-ups, tap the buttons under each answer, or go back to any point with the Map (on Android and the web, with online AI turned on, a larger model also explains what it finds). This is what you can ask:", notes: 'notes', terms: 'key terms', questions: 'questions' },
  es: { intro: "BT Servant Mini encuentra lo que necesitas en las ayudas de traducción de este teléfono, sin internet, y sigue la conversación: haz más preguntas, toca los botones bajo cada respuesta o vuelve a cualquier punto con el Mapa (en Android y en la web, con la IA en línea activada, un modelo más grande además explica lo que encuentra). Esto es lo que puedes preguntar:", notes: 'notas', terms: 'palabras clave', questions: 'preguntas' },
  fr: { intro: "BT Servant Mini trouve ce dont vous avez besoin dans les aides à la traduction de ce téléphone, sans internet, et suit la conversation : posez d'autres questions, touchez les boutons sous chaque réponse ou revenez à n'importe quel point avec la Carte (sur Android et sur le web, avec l'IA en ligne activée, un modèle plus grand explique aussi ce qu'il trouve). Voici ce que vous pouvez demander :", notes: 'notes', terms: 'termes clés', questions: 'questions' },
  id: { intro: "BT Servant Mini menemukan yang Anda perlukan di bahan bantu penerjemahan di ponsel ini, tanpa internet, dan mengikuti percakapan: ajukan pertanyaan lanjutan, ketuk tombol di bawah setiap jawaban, atau kembali ke titik mana pun lewat Peta (di Android dan web, dengan AI daring aktif, model yang lebih besar juga menjelaskan apa yang ditemukannya). Inilah yang dapat Anda tanyakan:", notes: 'catatan', terms: 'istilah kunci', questions: 'pertanyaan' },
  hi: { intro: "BT Servant Mini इस फ़ोन की अनुवाद सहायताओं में आपकी ज़रूरत की जानकारी ढूँढता है, बिना इंटरनेट के, और बातचीत को आगे बढ़ाता है: आगे के प्रश्न पूछें, हर उत्तर के नीचे के बटन टैप करें, या नक्शे से किसी भी बिंदु पर लौटें (Android और वेब पर, ऑनलाइन AI चालू हो तो एक बड़ा मॉडल ढूँढी गई जानकारी समझाता भी है)। आप यह पूछ सकते हैं:", notes: 'नोट्स', terms: 'मुख्य शब्द', questions: 'प्रश्न' },
  ar: { intro: "يجد BT Servant Mini ما تحتاج إليه في مساعدات الترجمة على هذا الهاتف، دون إنترنت، ويتابع المحادثة معك: اطرح أسئلة أخرى، أو المس الأزرار تحت كل إجابة، أو عُد إلى أي نقطة من الخريطة (وعلى أندرويد والويب، عند تفعيل الذكاء الاصطناعي عبر الإنترنت يشرح نموذج أكبر أيضًا ما يجده). هذا ما يمكنك أن تسأل عنه:", notes: 'ملاحظات', terms: 'المصطلحات الرئيسية', questions: 'أسئلة' },
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
  follow.push(browseStep(ui), howtoStep(ui))
  // what the phone has, named after About's text (helplines.ts)
  const lines = await helpLines(ui, INSTALLED).catch(() => '')
  return { who: 'bot', intro: t.intro, info: whatYouCanAsk(ui) + lines, ui, follow, limits: true, meta: `${T.details}
(help: what you can ask)` }
}

/** `again`: what "Try again" asks again (the typed question, or a button's sheet); none, no "Try again" */
async function respond(c: Conv, label: string, make: () => Promise<Made>, again?: Again, mark = false) {
  busy = true
  btn.disabled = true
  // a button's label is not a question: its words never choose the notes shown first (Abel, Nov 17: "Capítulo completo
  // (Éxodo 22)" showed the notes about «completo» first)
  const mine: Msg = { who: 'me', text: label, ...(mark ? { mark } : {}), ...(again?.sheet ? { button: true } : {}) }
  c.msgs.push(mine)
  if (!c.title) c.title = label.slice(0, 48)
  log.querySelector('.welcome')?.remove()
  const mineEl = renderMsg(mine)
  log.appendChild(mineEl)
  const wait = waiting(T.thinking, 'div', 'msg bot')
  log.appendChild(wait)
  // at once, not smooth: the keyboard closes now and the page grows under a smooth scroll (Abel, Nov 18: left far up). Kept at
  // the end while the keyboard closes (keepview.ts)
  view.follow(toEnd(log))
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
      throw { done: { who: 'bot', intro: FU(nav).kept, ui: nav, waiting: true, meta: `${T.details} · 0.0 s\nno language on this phone: the question waits for one` } }
    }
    const made = await make()
    qLang = made.sheet.lang ?? made.ui
    // what the answer is: pipeline.ts decides (and keeps the conversation's last passage and search results)
    const r = await answer(c, made, t0)
    answered = r.answered
    m = { who: 'bot', ...r.reply, saveQ: queryOfAnswer({ sheet: made.sheet, ref: r.ref, concept: r.concept, q: made.q, label, lang: r.reply.lang }) ?? undefined }
    point = r.node
    // a typed question that found nothing: the ways of asking that work, with the book or word it had (teach.ts, §2.3)
    if (made.q !== undefined && foundNothing(r)) {
      const shapes = await cmp.shapesFor(made.q).catch(() => [])
      if (shapes.length) m.shapes = shapes
    }
    const cs = contextSheet(c, r) // (a branch on a story of Open Bible Stories: the story)
    if (cs && onlineOn() && onlineAvailable()) onlineCtx = await passageContext(cs).catch(() => '')
  } catch (err: any) {
    // an error: the same question again, or Browse (no dead end)
    // the raw error only in the details (English, and it may name packs): the text says something went wrong
    m = err?.done ?? { who: 'bot', text: T.failed.replace(/\s*:$/, nav.startsWith('hi') ? '।' : '.'), meta: `${T.details}\nerror: ${err instanceof Error ? err.message : String(err)}`, ui: nav, follow: [...againStep(nav, again), browseStep(nav)] }
    if (!err?.done) answered = 'failed'
  }
  count('answers')
  count(`kind.${answered}`)
  if (qLang) count(`lang.${qLang}`)
  // (out of scope says what Mini helps with on purpose: counted as such, not as an empty answer; nor is a "which one?" with its buttons)
  if (answered === 'outofscope') count('oos')
  else if (answered !== 'failed' && answered !== 'choose' && !m.info && !m.study && !m.helps) count('empty')
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
  // a 5M session (5M in the pack): where it is now, to resume it from another conversation (only while conversations are kept)
  if (on5m() && c.graph?.session) saveSession(c.id, c.graph.session)
  // the row of suggestions shows where the conversation is now (and builds its word index at idle after the first answer)
  cmp.answered()
  // level 3 below: the online answer, if allowed and there is internet; the offline answer already stands
  // only from something found on the phone: with nothing found, the larger model would answer from memory (a report of Nov 13)
  // (not over an answer that offers to add something, Open Bible Stories: that button is the next step, a report of Nov 17)
  const asking = m.who === 'bot' && !m.macula && !!(m.info || m.helps?.length || m.study) && !m.follow?.some((f) => f.add) && onlineOn() && onlineAvailable() && isOnline()
  // while it is written, the phone's answer shows as it will under it (its helps as cards), so nothing moves when it arrives
  let node = renderMsg(m, asking)
  wait.replaceWith(node)
  if (m.waiting) {
    log.querySelectorAll('.fu').forEach((x) => x.remove())
    node.after(pickerFor(waitingLang(c)))
  }
  // the question at the top and its answer's start under it (the web scrolled to the answer's start, which hid the question);
  // kept there if the keyboard is still closing
  view.follow(toQuestion(log, mineEl))
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
      // a 5M session (5M in the pack): its step, and the answers revealed on that card only
      ...(on5m() && c.graph?.session && fixtureNow5(c.graph.session.story, c.graph.session.tfLang) ? { fx: fixtureNow5(c.graph.session.story, c.graph.session.tfLang)!, ui: m.ui ?? nav, revealed: revealedOn(c.id, sessionNode(c.graph)?.id ?? '') } : {}),
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
  run: (label, sheet) => {
    if (busy || locked()) return false
    runSheet(label, sheet, nav)
    return true
  },
  addLang: () => {
    panelView = 'resources'
    panel.classList.add('show')
    renderPanel()
  },
  saved: () => { closeExplore(false); openSaved() },
  // the guided modes (modes.ts): none opens while an answer is on its way or the app is locked; Browse then says so
  mode: (id) => {
    if (busy || locked()) return false
    // (the welcome opens first, and Browse closes once it has: if it does not open, Browse stays exactly as it was)
    if (!openWelcome(nav, { at: id })) return false
    closeExplore(false)
    return true
  },
  // a story's session starts as if "5M OBS n" were typed, the way How to ask's [Try it] sends: read by code, kept, counted
  ask5: (story) => {
    if (busy || locked()) return false
    return sendTyped(input, form, fiveText(story))
  },
  saved5: () => savedSessions(),
  resume5: (e) => {
    if (busy || locked()) return false
    // (a story no pack covers, or whose tables did not come, is not waited for)
    if (!on5m() || !covered5().includes(e.story) || failed5.has(k5(e.story, e.s.tfLang))) return 'failed'
    if (!fixture5(e.story, e.s.tfLang)) return failed5.has(k5(e.story, e.s.tfLang)) ? 'failed' : 'loading'
    return resume5(e) ? true : 'failed'
  },
})
// Saved items and notes (savedview.ts): what opening one asks the chat
setSavedHooks({
  ui: () => nav, busy: () => busy || locked(), packName: (l) => PACK_NAMES[l] ?? l,
  run: (label, sheet) => runSheet(label, sheet, nav),
  ask: (q) => { const typed = input.value; input.value = q; form.requestSubmit(); input.value = typed },
  addLang: () => { panelView = 'resources'; panel.classList.add('show'); renderPanel() },
  closeOthers: () => { closePanel(); closeExplore(false); closeMap(false) },
})

// Typing suggestions above the box (composer.ts, menu > Typing suggestions): its "✓" sends the box's text, which the submit
// below reads by code (codeReads → readQuestion with no reader: the reading the "✓" showed)
const cmp = mountComposer(form, input, {
  ui: () => nav, conv: () => conv(), packs: () => INSTALLED, busy: () => busy || locked(),
  send: () => form.requestSubmit(), ask: (label, sheet, ui) => runSheet(label, sheet, ui), browse: () => openExplore('bar'),
  // (a free question is read by the phone's model or online; with neither, the row's grey line says it is searched)
  reader: () => (modelReady() && !modelOff()) || (onlineOn() && onlineAvailable() && isOnline() && (!signInAvailable() || !!onlineSession())),
  backShown: () => { const l = conv().msgs[conv().msgs.length - 1]; return on5m() && !!l?.sessionBack },
  resume: (story) => { const e = savedSessions().find((x) => x.story === story); if (e) resume5(e) },
  stories: (lang, ids, title) => openExploreAt({ obs: true, lang, only: ids, title }),
})

function runSheet(label: string, sheet: Sheet, ui: string) {
  if (busy) return
  respond(conv(), label, async () => ({ sheet: { ...sheet, id: `f${Date.now()}` }, ui, meta: '(follow-up: no model call)' }), { sheet, label })
}

// How to ask (howto.ts): its "Try it" sends through the form, as if typed; its example for the composer is typed in the box
setHowtoHooks({
  ask: (q) => !busy && !locked() && sendTyped(input, form, q), // (what the person was writing stays in the box)
  busy: () => busy,
  locked: () => locked(),
  conv: () => conv().id,
  type: (text) => {
    input.value = text
    input.focus()
    input.dispatchEvent(new Event('input'))
  },
  browse: () => openExplore('menu'),
  // opens Online AI directly; Back goes to Settings (backOf: one level up), as the design says
  onlineSettings: () => {
    panelView = 'online'
    panel.classList.add('show')
    renderPanel()
  },
  saved: () => { openSaved() },
  menu: () => {
    panelView = 'main'
    panel.classList.add('show')
    renderPanel()
  },
  askSheet: (label, s) => {
    if (busy || locked()) return false
    runSheet(label, { ...bare(s.lang), intent: 'passage', ref: s.ref, what: s.what }, nav)
    return true
  },
  packs: () => INSTALLED,
  helpsLang: () => helpsLang,
})
// The welcome (welcome.ts): a book's path starts as if "Voy a traducir Rut" were typed (read by code, no model); a learning path
// starts in this conversation at its first article (in place of a book's path). Its answers are counted like any answer; the
// welcome adds no counters of its own
setWelcomeHooks({
  packs: () => [...new Set([examplesLang(), 'en', ...INSTALLED].filter((l): l is string => !!l && INSTALLED.includes(l)))],
  start: (label, make) => {
    if (busy || locked()) return
    const c = conv()
    respond(c, label, () => make(c), { q: label })
  },
  learn: (l, label, sheet) => {
    if (busy || locked()) return
    const g = (conv().graph ??= newGraph())
    g.learn = l
    // (the lessons replace a book's path: their articles are not "away from the path")
    delete g.path
    delete g.pathNext
    delete g.pathBefore
    runSheet(label, sheet, nav)
  },
  browse: () => openExplore('welcome'),
  openFive: () => openExploreAt({ mode: 'obs5m', from: 'welcome' }),
  busy: () => busy,
})

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
  const mineEl = renderMsg(mine)
  log.appendChild(mineEl)
  log.appendChild(renderMsg(again))
  view.follow(toQuestion(log, mineEl)) // the mark and the answer under it, as after a send (keepview.ts)
  updateMapBtn()
}

// ------------------------------------------------------------------------------------------------------------ the 5M session
// (5M from the packs; obs5mview.ts draws, obs5m.ts knows the steps). The bar sits under the header while the open conversation
// has a session: dimmed while the conversation is away from it (on a help or a branch), and then tapping it is the way back.
// [≡] opens the outline, full screen like the Map (under the PIN lock like it). With no pack that has the 5M tables none of this exists.
const loading5 = new Set<string>() // `story|language` (a story read in one language does not answer for another)
const failed5 = new Set<string>() // covered stories whose tables did not come in that language: not asked again until the packs change
const k5 = (story: number, lang?: string | null) => `${story}|${lang ?? ''}`
/** A story's tables (read once from the packs): null until they arrive; then the bar and the cards are drawn again */
function fixture5(story: number, lang?: string | null): Fixture | null {
  const f = fixtureNow5(story, lang)
  const k = k5(story, lang)
  if (f || !on5m() || !covered5().includes(story) || loading5.has(k) || failed5.has(k)) return f
  loading5.add(k)
  // (pipeline.ts's loader: the composer's session buttons read the same tables)
  loadFixture5(story, lang).then((t) => { loading5.delete(k); if (t) fiveReady(); else failed5.add(k) }, () => { loading5.delete(k); failed5.add(k) })
  return null
}
/** Tables arrived (or 5M turned on or off): what shows 5M is drawn again */
function fiveReady() {
  if (conv()?.msgs.some((m) => m.card) || !conv()?.msgs.length) renderConv()
  else updateBar()
  cmp.answered() // the composer's row asks again: [Resume] and the step's buttons need the tables
}
/** The share button of a session's card (5M in the pack): the session as it is when tapped, with the answers revealed so far */
function sessionShare(cv: Conv | undefined, ui: string): HTMLElement | null {
  const g = cv?.graph
  const fx = g?.session ? fixtureNow5(g.session.story, g.session.tfLang) : null
  if (!cv || !g?.session || !fx) return null
  return shareTextButton(() => shareSession(fx, g.session!, revealedIn(cv.id), ui), ui)
}
/** What a step's card can do: run a step or an article as a turn, and mark the checking cards in the session copy */
function cardHooks(cv: Conv | undefined, ui: string, node?: string) {
  const fx = cv?.graph?.session ? fixture5(cv.graph.session.story, cv.graph.session.tfLang) : null
  if (!fx || !cv?.graph?.session) return undefined
  const g = cv.graph
  // the session as it is when tapped (each step replaces g.session; the marks go to the current copy)
  return { fx, get s() { return g.session! }, run: (label: string, sheet: Sheet) => runSheet(label, sheet, ui),
    // an answer shown on a card is remembered here, in memory only, for share and the online context (never saved, never counted)
    reveal: (id: string, shown: boolean) => { if (node) revealOn(cv.id, node, id, shown) },
    // (a mark is kept with the conversation and the saved place, as any answer is; saveSession asks keepHistory and never throws)
    marked: () => { save(); if (g.session) saveSession(cv.id, g.session) },
    // the frame's words: its notes and key terms in the language of the card's text (its quotes must be in it; obswords.ts)
    words: (text: HTMLElement, ref: string, root: HTMLElement, lang: string) => {
      const f = parseObsRef(ref)?.f
      if (f) void frameStudy(ref, lang).then((o) => { if (o) linkFrameWords(text, o, f, root) }).catch(() => {})
    } }
}
/** A frame's helps for its words, read once (a card is drawn again at each turn) */
const frameStudies = new Map<string, Promise<ObsStudy | null>>()
function frameStudy(ref: string, lang: string): Promise<ObsStudy | null> {
  const k = `${ref}|${lang}`
  // only quotes in the text's language (obsPack falls back to another pack: its quotes would mark wrong words, or none);
  // nothing found is not kept (a pack added later links the words)
  if (!frameStudies.has(k)) frameStudies.set(k, obsStudyOf({ ref, lang }).catch(() => null).then((o) => {
    if (o?.lang.split('-')[0] === lang.split('-')[0]) return o
    frameStudies.delete(k)
    return null
  }))
  return frameStudies.get(k)!
}
/** A step of the session as a turn of the chat */
function runStep(label: string, s: Session) {
  const fx = fixtureNow5(s.story, s.tfLang)
  if (!fx) return
  runSheet(label, sheetOf5(fx, s, s.lang), nav)
}
function updateBar() {
  const g = conv()?.graph
  const s = on5m() ? g?.session : undefined
  const fx = s ? fixture5(s.story, s.tfLang) : null
  const old = document.querySelector('#s5bar')
  if (!g || !s || !fx) {
    old?.remove()
    return
  }
  const dimmed = nodeOf(g, g.cur)?.kind !== 'obs5m'
  const bar = drawBar(s, fx, nav, {
    prev: () => { const p = prev5(fx, s); if (p) runStep(stepPlace(fx, p, nav), p) },
    next: () => { const n = next5(fx, s); if (n) runStep(W5(nav).next.replace('{place}', stepPlace(fx, n, nav)), n) },
    outline: () => openOutline(),
    back: () => { const n = sessionNode(g); if (n) goTo(n.id, 'back') },
  }, dimmed)
  if (old) old.replaceWith(bar)
  else document.querySelector('#notice')!.before(bar)
  if (outIsOpen()) drawOutlineNow()
}
let s5out: { root: HTMLElement; title: HTMLElement; body: HTMLElement; close: HTMLButtonElement } | null = null
const outIsOpen = () => !!s5out?.root.classList.contains('open')
function ensureOutline() {
  if (s5out) return s5out
  const root = el('div', '')
  root.id = 's5out'
  root.tabIndex = -1
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 's5-out-h')
  const head = el('div', 'ex-head')
  const title = el('h2', 'ex-title')
  title.id = 's5-out-h'
  const close = el('button', 'ex-btn', '✕') as HTMLButtonElement
  close.type = 'button'
  close.onclick = () => closeOutline()
  head.append(title, close)
  const body = el('div', 'ex-body')
  root.append(head, body)
  document.body.appendChild(root)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && outIsOpen()) {
      e.preventDefault()
      closeOutline()
    }
  })
  // the PIN lock covers the outline: it closes under the lock
  new MutationObserver(() => { if (outIsOpen() && document.querySelector('#lock')) closeOutline() }).observe(document.body, { childList: true })
  s5out = { root, title, body, close }
  return s5out
}
function drawOutlineNow() {
  const o = ensureOutline()
  const s = conv()?.graph?.session
  const fx = s ? fixtureNow5(s.story, s.tfLang) : null
  if (!s || !fx) return closeOutline()
  o.root.dir = rtlLang(nav) ? 'rtl' : 'ltr'
  o.title.textContent = W5(nav).outline
  o.close.setAttribute('aria-label', W5(nav).view.close)
  o.body.replaceChildren(drawOutline(s, fx, nav, {
    jump: (p: Code5) => {
      closeOutline()
      const to = jump5(fx, s, p, p === s.part ? s.at : 0)
      runStep(stepPlace(fx, to, nav), to)
    },
    how: () => {}, // "How the five movements work" ships after the licence check (decision 5): hidden in the mock
    end: () => end5(),
  }))
}
/** [End session]: the conversation leaves the session (its light path back); its notes stay, and so does [Resume] */
function end5() {
  closeOutline()
  if (busy) return
  count('5m.end')
  forgetReveals(conv().id)
  endSession(conv())
  save()
  // (the cards drawn before keep no live buttons into the ended session)
  renderConv()
  updateBar()
  cmp.answered()
}
/** The resume buttons of the welcome: the sessions used last (up to 3) */
function resumeEntries(): { label: string; go: () => boolean }[] {
  if (!on5m()) return []
  return savedSessions().filter((e) => covered5().includes(e.story)).slice(0, 3).filter((e) => fixture5(e.story, e.s.tfLang))
    .map((e) => ({ label: W5(nav).resume.replace('{story}', obsLabel(e.story)).replace('{place}', stepPlace(fixtureNow5(e.story, e.s.tfLang)!, e.s, nav)), go: () => resume5(e) }))
}
/**
 * [Resume]: the conversation the session was in, if it is still there; else an empty one, a new one, or (no room left) this
 * one, where the saved place is put back and its step asked again. Its earlier consultations may be gone; its place is not.
 */
function resume5(e: Saved5): boolean {
  const fx = fixture5(e.story, e.s.tfLang)
  if (busy || locked() || !fx) return false
  const t = resumeTarget(e.conv, convs.map((c) => ({ id: c.id, empty: !c.msgs.length })), current, MAX)
  if (t.k === 'open' || t.k === 'empty') current = t.id
  else if (t.k === 'new' && !newConv()) return false
  const c = conv()
  closePanel()
  // its conversation, still at the session: shown as it was
  const s = c.graph?.session
  count('5m.resume')
  if (t.k === 'open' && s && s.story === e.s.story) {
    save()
    renderConv()
    return true
  }
  resumeIn(c, e.s)
  save()
  renderConv()
  runStep(W5(nav).resume.replace('{story}', obsLabel(e.story)).replace('{place}', stepPlace(fx, e.s, nav)), e.s)
  return true
}
function openOutline() {
  if (locked() || document.querySelector('#lock')) return
  closeMap(false)
  closeExplore(false)
  drawOutlineNow()
  s5out?.root.classList.add('open')
  s5out?.root.focus({ preventScroll: true })
}
function closeOutline() {
  s5out?.root.classList.remove('open')
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
  updateBar()
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
  // a learning path (learn.ts): the article it was on, one tap to go on with it
  if (g?.learn) {
    const label = learnLabel(nav, g.learn, 'resume')
    const row = el('button', 'ex-row gm-row gm-path') as HTMLButtonElement
    row.type = 'button'
    const ic = el('span', 'gm-ic gm-line')
    ic.innerHTML = svg('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>')
    const txt = el('span', 'gm-txt')
    const name = el('span', 'ex-row-t', bidiLabel(label, nav))
    name.dir = rtlLang(nav) ? 'rtl' : 'ltr'
    txt.appendChild(name)
    row.append(ic, txt)
    const sheet = learnSheet(g.learn)
    row.onclick = () => {
      if (busy) return
      closeMap(false)
      runSheet(g.learn!.title, sheet, nav)
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
    } else if (r.k === 'group') {
      // a 5M session (5M in the pack): its name over its steps; the steps themselves are the points to go back to
      row.classList.add('gm-group')
      row.disabled = true
      const name = el('span', 'ex-row-t', r.label)
      name.dir = 'ltr'
      row.appendChild(name)
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
  const c = conv()
  // only a reference ("Rut 2:3", "Jonás 1:3 notas") or a follow-up code reads ("¿y las notas?" after one): neither reader runs
  // (saves about 4 s on a phone), and the answer is what the composer's "✓" showed
  const direct = !has('help', q) && codeReads(q, c)
  // (the row emptied; typed or its "✓", counted as such: sent.typed, sent.chip, sent.code, sent.free)
  cmp.sent(direct)
  count('asked')
  count(direct ? 'model.skipped' : modelReady() && !modelOff() ? 'model.used' : 'model.none')
  respond(c, q0, async () => {
    // "What can you do?", "What questions can you answer about Titus?": what to ask, and for a book, a few ways in
    if (has('help', q)) throw { done: await helpAnswer(q, target ?? guessLang(q) ?? nav) }
    if (direct) return readQuestion(q, { slots: null, raw: 'read by code (no reader)', ms: 0 }, c, target)
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
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    form.requestSubmit()
  }
})

// ?dev=preview (a list: ?dev=a,b): the packs from the staging preview server instead of Mini's, to try packs published there and not
// yet copied to Mini's server (handoff/relevo-parentescos.md). Only where dev/preview.json is: build.py --dev and --devapk put it
// there, the normal and debug APKs never; elsewhere the parameter does nothing
if ((new URLSearchParams(location.search).get('dev') ?? '').split(',').includes('preview'))
  fetch('dev/preview.json').then((r) => { if (r.ok) setPacksServers([PREVIEW_SERVER]) }).catch(() => {})
// a PIN (menu > Safety) covers the app before anything shows, and again after a minute away
lock(nav)
watchAway(() => nav)
load()
renderConv()
let PATCHED: PatchKind[] = []
function refreshInstalled() {
  void patchedKinds().then((p) => { PATCHED = p })
  return installedLangs().then((ls) => {
    const had = packsKnown ? INSTALLED.length > 0 : null
    const same = ls.join() === INSTALLED.join()
    INSTALLED = ls
    // Browse follows a new list; the same list draws nothing (the scroll stays), unless a change of packs emptied its stack (resetExplore): then its home
    if (!same || exploreStale()) redrawExplore()
    packsKnown = true
    $('#packs').textContent = ls.map((l) => PACK_NAMES[l] ?? l).join(' · ')
    // from no language to one (a download here or in the menu, a .tcpack file): the light build without a model offers it once
    if (had === false && ls.length && isLite() && modelState().state === 'missing') offerModel = true
    // the welcome (picker or examples) and a picker under a waiting question follow what is installed
    if (had !== ls.length > 0 && (!conv().msgs.length || !ls.length || had === false)) renderConv()
    // and a question that waited for a language is asked now (also at the start, if the app closed before it was)
    if (had !== true && ls.length) reaskWaiting()
    // the people index of each language, at idle (kin.ts): a family question then skips the readers (the app's language first)
    const mine = ls.filter((l) => l.split('-')[0] === nav.split('-')[0])
    // (only the app's language at idle: another one is built when a question needs it, on a phone with many packs too)
    warmKin(mine.length ? mine : ls.slice(0, 1))
  }).catch(() => {})
}
refreshInstalled()
onPacksChanged(() => {
  resetLangs()
  resetBooks()
  resetExplore()
  resetLearn()
  resetSearch()
  resetMacula()
  refreshInstalled().then(() => cmp.reset())
})
// Browse's people tab: drawn again when the packs with people change (kin.ts tells when an index is built). The packs changing is drawn again from refreshInstalled, once INSTALLED is the new list (resetExplore above emptied the stack)
onKinReady(kinReadyExplore)
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
// an OBS answer may ask the packs server whether it has the stories for this language, where the person allows the internet
obsServer.allowed = () => (onlineOn() || usageOn()) && isOnline()
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
// 5M: the installed packs asked at the start (and after each change) for the tables; the saved sessions' stories read early so
// their cards and bar are drawn whole
const looked5 = () => { failed5.clear(); for (const e of savedSessions().filter((x) => covered5().includes(x.story)).slice(0, 3)) fixture5(e.story, e.s.tfLang); fiveReady(); redrawExplore(); refreshWelcome5() }
onFive(looked5)
void refresh5().then(looked5)
firstSafety()
