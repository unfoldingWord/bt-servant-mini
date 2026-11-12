// BT Servant Mini: a chat page. Question -> offline model (slots) -> call sheet -> recipe over the installed language packs ->
// a presenting sentence (converse.ts) + the information found + follow-ups. Up to three conversations, kept on the phone.
import { answerSheet, facts, setUiLang, type Sheet } from './answer'
import { bookCode, buildSheet, fold, type Slots } from './sheet'
import { modelReady, modelStatus, slotsOf } from './model'
import { installedLangs } from './packs'
import { bookLabel, followups, intro, searchIntro } from './converse'
import { keywords, searchVerses } from './search'
import { md } from './md'

type UiText = {
  ph: string; send: string; loading: string; ready: string; thinking: string; failed: string; details: string; hello: string; ex: string[]
  chats: string; newChat: string; max: string; del: string; confirmDel: string; untitled: string; appLang: string; packs: string; welcome: string; helps: string; auto: string
}
const UI: Record<string, UiText> = {
  en: {
    ph: 'Ask about a verse or a word…', send: 'Send', loading: 'Starting the offline model…', ready: 'Offline · ready',
    thinking: 'Looking in the translation helps…', failed: 'Something went wrong:', details: 'details',
    hello: 'Hello! I answer from the translation helps installed on this phone (notes, words, questions, Academy), without internet. Ask in English, Spanish, French, Indonesian or Hindi.',
    ex: ['What does Jonah 3:9 say in the UST?', 'What does grace mean?', 'What do the notes say about Ruth 1:16?'],
    chats: 'Conversations', newChat: 'New conversation', max: 'You can keep up to 3 conversations. Delete one to start another.',
    del: 'Delete', confirmDel: 'Delete this conversation?', untitled: 'New conversation',
    appLang: 'App language', packs: 'Installed language packs', welcome: 'How can I help with your translation?', helps: 'Language of the helps', auto: 'Same as my question',
  },
  es: {
    ph: 'Pregunta por un versículo o palabra…', send: 'Enviar', loading: 'Iniciando el modelo sin conexión…',
    ready: 'Sin conexión · listo', thinking: 'Buscando en las ayudas de traducción…', failed: 'Algo salió mal:', details: 'detalles',
    hello: '¡Hola! Respondo con las ayudas de traducción instaladas en este teléfono (notas, palabras, preguntas, Academia), sin internet. Pregunta en español, inglés, francés, indonesio o hindi.',
    ex: ['¿Qué notas hay para Tito 1:1?', '¿Qué significa gracia?', '¿Qué dice Jonás 3:9?'],
    chats: 'Conversaciones', newChat: 'Nueva conversación', max: 'Puedes tener hasta 3 conversaciones. Borra una para empezar otra.',
    del: 'Borrar', confirmDel: '¿Borrar esta conversación?', untitled: 'Conversación nueva',
    appLang: 'Idioma de la app', packs: 'Paquetes de idioma instalados', welcome: '¿En qué te ayudo con tu traducción?', helps: 'Idioma de las ayudas', auto: 'El de mi pregunta',
  },
  fr: {
    ph: 'Un verset, un mot…', send: 'Envoyer', loading: 'Démarrage du modèle hors ligne…', ready: 'Hors ligne · prêt',
    thinking: 'Je cherche dans les aides à la traduction…', failed: 'Une erreur est survenue :', details: 'détails',
    hello: 'Bonjour ! Je réponds à partir des aides à la traduction installées sur ce téléphone, sans internet.',
    ex: ['Que dit Jonas 1:3 ?', 'Que signifie le mot grâce ?'],
    chats: 'Conversations', newChat: 'Nouvelle conversation', max: "Vous pouvez garder 3 conversations. Supprimez-en une pour en commencer une autre.",
    del: 'Supprimer', confirmDel: 'Supprimer cette conversation ?', untitled: 'Nouvelle conversation',
    appLang: "Langue de l'application", packs: 'Paquets de langue installés', welcome: 'Comment puis-je aider votre traduction ?', helps: 'Langue des aides', auto: 'Celle de ma question',
  },
  id: {
    ph: 'Tanya tentang ayat atau kata…', send: 'Kirim', loading: 'Memulai model offline…', ready: 'Offline · siap',
    thinking: 'Mencari di bahan bantu penerjemahan…', failed: 'Terjadi kesalahan:', details: 'detail',
    hello: 'Halo! Saya menjawab dari bahan bantu penerjemahan yang terpasang di ponsel ini, tanpa internet.',
    ex: ['Apa kata Yunus 3:9 dalam UST?', 'Apa arti kata kasih karunia?'],
    chats: 'Percakapan', newChat: 'Percakapan baru', max: 'Anda bisa menyimpan 3 percakapan. Hapus satu untuk memulai yang lain.',
    del: 'Hapus', confirmDel: 'Hapus percakapan ini?', untitled: 'Percakapan baru',
    appLang: 'Bahasa aplikasi', packs: 'Paket bahasa terpasang', welcome: 'Apa yang bisa saya bantu untuk terjemahan Anda?', helps: 'Bahasa bahan bantu', auto: 'Sesuai pertanyaan saya',
  },
  hi: {
    ph: 'किसी पद या शब्द के बारे में पूछें…', send: 'भेजें', loading: 'ऑफ़लाइन मॉडल शुरू हो रहा है…', ready: 'ऑफ़लाइन · तैयार',
    thinking: 'अनुवाद सहायता में खोज रहा हूँ…', failed: 'कुछ गलत हो गया:', details: 'विवरण',
    hello: 'नमस्ते! मैं इस फ़ोन पर स्थापित अनुवाद सहायता से, बिना इंटरनेट के, उत्तर देता हूँ।',
    ex: ['योना 3:9 क्या कहता है?', 'अनुग्रह का क्या अर्थ है?'],
    chats: 'बातचीत', newChat: 'नई बातचीत', max: 'आप 3 बातचीत रख सकते हैं। नई शुरू करने के लिए एक हटाएँ।',
    del: 'हटाएँ', confirmDel: 'यह बातचीत हटाएँ?', untitled: 'नई बातचीत',
    appLang: 'ऐप की भाषा', packs: 'स्थापित भाषा पैकेज', welcome: 'आपके अनुवाद में मैं कैसे मदद करूँ?', helps: 'सहायता की भाषा', auto: 'मेरे प्रश्न वाली',
  },
  ar: {
    ph: 'اسأل عن آية أو كلمة…', send: 'إرسال', loading: 'جارٍ تشغيل النموذج دون اتصال…', ready: 'دون اتصال · جاهز',
    thinking: 'أبحث في مساعدات الترجمة…', failed: 'حدث خطأ:', details: 'التفاصيل',
    hello: 'مرحبًا! أجيب من مساعدات الترجمة المثبتة على هذا الهاتف (الملاحظات والكلمات والأسئلة والأكاديمية)، دون إنترنت.',
    ex: ['ماذا يقول يونان ١:٣؟', 'ما معنى كلمة نعمة؟', 'ساعدني في ترجمة يونان ١'],
    chats: 'المحادثات', newChat: 'محادثة جديدة', max: 'يمكنك الاحتفاظ بثلاث محادثات. احذف واحدة لتبدأ أخرى.',
    del: 'حذف', confirmDel: 'حذف هذه المحادثة؟', untitled: 'محادثة جديدة',
    appLang: 'لغة التطبيق', packs: 'حزم اللغات المثبتة', welcome: 'كيف أساعدك في ترجمتك؟', helps: 'لغة المساعدات', auto: 'لغة سؤالي',
  },
}
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
const LOGO = document.querySelector('.brand svg')!.outerHTML

// ------------------------------------------------------------------------------------------------------------ conversations

type Msg = { who: 'me' | 'bot'; text?: string; intro?: string | null; info?: string; follow?: { label: string; sheet: Sheet }[]; meta?: string; ui?: string }
type Hit = { book: string; ch: number; v: number }
type Conv = { id: string; title: string; updated: number; msgs: Msg[]; last: Sheet | null; found?: Hit[] }
const KEY = 'btsm.conversations.v1'
const MAX = 3
let convs: Conv[] = []
let current = ''
function load() {
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
  try {
    localStorage.setItem(KEY, JSON.stringify({ convs, current }))
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
const status = $('#status'), panel = $('#panel'), menu = $<HTMLButtonElement>('#menu')
function applyUi() {
  document.documentElement.lang = nav
  document.documentElement.dir = nav === 'ar' ? 'rtl' : 'ltr'
  input.placeholder = T.ph
  btn.setAttribute('aria-label', T.send)
  menu.setAttribute('aria-label', T.chats)
}
function setUi(l: string) {
  nav = l
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
  if (/^(info|plain|intro|msg)/.test(cls)) d.dir = 'auto' // Arabic helps read right to left
  if (text !== undefined) d.textContent = text
  return d
}

function renderMsg(m: Msg): HTMLElement {
  if (m.who === 'me') return el('div', 'msg me', m.text)
  const d = el('div', 'msg bot')
  if (m.intro) d.appendChild(el('p', 'intro', m.intro))
  if (m.info) {
    const box = el('div', m.intro ? 'info' : 'plain md')
    box.innerHTML = md(m.info) // md() escapes everything first
    d.appendChild(box)
  }
  if (m.text) d.appendChild(el('div', 'plain', m.text))
  if (m.follow?.length) {
    const f = el('div', 'follow')
    for (const x of m.follow) {
      const b = el('button', '', x.label) as HTMLButtonElement
      b.type = 'button'
      b.onclick = () => runSheet(x.label, x.sheet, m.ui ?? nav)
      f.appendChild(b)
    }
    d.appendChild(f)
  }
  if (m.meta) {
    const det = document.createElement('details')
    det.appendChild(el('summary', '', m.meta.split('\n')[0]))
    det.appendChild(el('pre', '', m.meta.split('\n').slice(1).join('\n')))
    d.appendChild(det)
  }
  return d
}
function renderConv() {
  log.innerHTML = ''
  const c = conv()
  if (!c.msgs.length) {
    const w = el('div', 'welcome')
    w.innerHTML = LOGO
    w.appendChild(el('h2', '', T.welcome))
    w.appendChild(el('p', '', T.hello))
    const ex = el('div', 'examples')
    for (const e of T.ex) {
      const b = el('button', '', e) as HTMLButtonElement
      b.type = 'button'
      b.onclick = () => {
        input.value = e
        form.requestSubmit()
      }
      ex.appendChild(b)
    }
    w.appendChild(ex)
    log.appendChild(w)
    return
  }
  for (const m of c.msgs) log.appendChild(renderMsg(m))
  log.lastElementChild?.scrollIntoView({ block: 'end' })
}
function renderPanel() {
  panel.innerHTML = ''
  panel.appendChild(el('h2', '', T.chats))
  for (const c of convs) {
    const row = el('div', c.id === current ? 'row on' : 'row')
    const open = el('button', 'open', c.title || T.untitled) as HTMLButtonElement
    open.type = 'button'
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
  panel.appendChild(el('h2', '', T.appLang))
  const langs = el('div', 'langs')
  for (const [code, name] of UI_LANGS) {
    const b = el('button', code === nav ? 'on' : '', name) as HTMLButtonElement
    b.type = 'button'
    b.onclick = () => setUi(code)
    langs.appendChild(b)
  }
  panel.appendChild(langs)
  panel.appendChild(el('h2', '', T.helps))
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
const closePanel = () => panel.classList.remove('show')
menu.onclick = () => {
  if (panel.classList.toggle('show')) renderPanel()
}

// -------------------------------------------------------------------------------------------------------------- answering

let busy = false
function setReady() {
  const ok = modelReady()
  status.textContent = ok ? T.ready : `${T.loading} ${modelStatus()}`
  status.dataset.ok = String(ok)
  btn.disabled = !ok || busy
  if (!ok) setTimeout(setReady, 1000)
}

/** A follow-up ("and verse 4?") names no book: take the book (and chapter) of the last passage of this conversation. */
function withContext(slots: Slots, last: Sheet | null, q: string): Slots {
  const m = /^([0-9a-z]{3}) (\d+)/.exec(last?.ref ?? '')
  if (!m) return slots
  const [, code, ch] = m
  const named = bookCode(slots.lang ?? nav, slots.book ?? null)
  if (named) return slots
  // short question with a number and no book: verse (or chapter) of the same passage
  const words = q.trim().split(/\s+/).length
  const nums = /(\d+)\s*[:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?|(\d+)(?:\s*[-–]\s*(\d+))?/.exec(q.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))))
  // only when the words around the number are not a name ("Mathew 3" names a book, "and verse 4?" does not)
  if (words <= 8 && nums && keywords(q).filter((w) => !/^\d/.test(w)).length === 0) {
    const isChap = /cap[ií]tulo|chapter|chapitre|pasal|अध्याय|أصحاح/i.test(q)
    const asked = /not[ae]s?|catatan|टिप्पणि/i.test(q) ? ['notes'] : /question|pregunta|pertanyaan|प्रश्न|أسئلة/i.test(q) ? ['questions']
      : /text|texto|teks|पाठ|dice|say|dit/i.test(q) ? ['text'] : null
    const base = { ...slots, intent: 'passage', book: code, what: asked ?? last!.what }
    if (nums[1]) return { ...base, chapter: +nums[1], verse_start: +nums[2]!, verse_end: nums[3] ? +nums[3] : null }
    if (isChap) return { ...base, chapter: +nums[4]!, verse_start: null, verse_end: null }
    return { ...base, chapter: Number(ch), verse_start: +nums[4]!, verse_end: nums[5] ? +nums[5] : null }
  }
  if (['passage', 'advice'].includes(slots.intent ?? '') && (slots.chapter || slots.verse_start))
    return { ...slots, book: code, chapter: slots.chapter ?? Number(ch) }
  return slots
}

/** A reference written in the question ("Rut 1:16", "1 Juan 3:2") that the model missed: read it by code. */
function refInText(slots: Slots, q: string): Slots {
  if (slots.book && bookCode(slots.lang ?? nav, slots.book) && slots.chapter) return slots
  const t = q.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  const m = /((?:[123]\s*)?[\p{L}][\p{L}\p{M}.]+(?:\s+(?:de|of|des|du)\s+[\p{L}]+)?)\s+(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?/u.exec(t)
  if (!m) return slots
  const words = m[1]!.trim().split(/\s+/)
  let code: string | null = null
  let name = ''
  for (let k = Math.min(3, words.length); k >= 1 && !code; k--) {
    name = words.slice(-k).join(' ')
    code = bookCode(slots.lang ?? nav, name)
  }
  if (!code) return slots
  const what = /not[ae]s?|catatan|टिप्पणि/i.test(q) ? ['notes'] : /question|pregunta|pertanyaan|प्रश्न/i.test(q) ? ['questions'] : slots.what ?? []
  return { ...slots, intent: slots.intent === 'advice' ? 'advice' : 'passage', book: name, chapter: +m[2]!, verse_start: m[3] ? +m[3] : null, verse_end: m[4] ? +m[4] : null, what }
}

/** An open question: the model said search, or there is no reference and the question names things ("where does Abraham…"). */
const WHERE = /(en )?qu[ée] vers[íi]culo|d[óo]nde|which verse|what verse|where (does|is|do)|in which|quel verset|o[ùu] (est|parle)|ayat (mana|berapa)|di mana|किस पद|कहाँ|أين|في أي آية/i
function isOpen(q: string, sheet: Sheet): boolean {
  if (sheet.intent === 'search') return true
  if (sheet.ref) return false
  if (WHERE.test(q)) return keywords(q).length >= 1
  if (kindOf(q) && keywords(q).length >= 2) return true // "notes about Abraham sacrificing Isaac"
  return ['unknown', 'advice', 'passage'].includes(sheet.intent) && keywords(q).length >= 2
}

/** What the person wants to see of a verse, when the question says it. */
function kindOf(q: string): string[] | null {
  return /not[ae]s?\b|catatan|टिप्पणि|ملاحظات/i.test(q) ? ['notes'] : /question|pregunta|pertanyaan|प्रश्न/i.test(q) ? ['questions']
    : /\b(text|texto|teks|texte)\b|पाठ|النص/i.test(q) ? ['text'] : null
}
const ORDINALS: [RegExp, number][] = [
  [/\b(first|primer[oa]?|premier|première|pertama)\b|पहल|الأول/i, 0], [/\b(second|segund[oa]|deuxième|kedua)\b|दूसर|الثاني/i, 1],
  [/\b(third|tercer[oa]?|troisième|ketiga)\b|तीसर|الثالث/i, 2], [/\b(fourth|cuart[oa]|quatrième|keempat)\b|चौथ/i, 3],
]
/** "The whole chapter": the chapter of the last passage. */
const WHOLE = /(whole|entire|full|all the) chapter|chapter (in full|complete)|cap[íi]tulo (completo|entero)|todo el cap[íi]tulo|(tout le|le chapitre) (chapitre|entier|complet)|(seluruh|semua) pasal|pasal (lengkap|seluruhnya)|पूरा अध्याय|सारा अध्याय|الأصحاح (كله|كاملا)|كل الأصحاح/i
const THAT = /\b(that|this) (verse|one|passage)|\b(ese|este|aquel) (vers[íi]culo|pasaje)|\b(ce|cet) (verset|passage)|\bayat (itu|ini)\b|(उस|इस) पद|(تلك|هذه) الآية/i
/** A follow-up with no book of its own: "the second one" (a search result), "that verse" or "and the questions?" (the last verse shown). */
function pickFound(q: string, slots: Slots, c: Conv): { hit: Hit; what: string[] } | null {
  const named = !THAT.test(q) && slots.book && fold(q).includes(fold(slots.book)) && bookCode(slots.lang ?? nav, slots.book)
  if (named) return null
  const ord = ORDINALS.find(([re]) => re.test(q))?.[1]
  const kind = kindOf(q)
  const lastM = /^([0-9a-z]{3}) (\d+)/.exec(c.last?.ref ?? '')
  if (WHOLE.test(q) && lastM) return { hit: { book: lastM[1]!, ch: +lastM[2]!, v: 0 }, what: kind ?? ['text'] }
  if (ord !== undefined && c.found?.length) return { hit: c.found[Math.min(ord, c.found.length - 1)]!, what: kind ?? ['text', 'notes'] }
  const m = /^([0-9a-z]{3}) (\d+):(\d+)/.exec(c.last?.ref ?? '')
  if (!m) return null
  if (THAT.test(q) || (kind && keywords(q).length === 0))
    return { hit: { book: m[1]!, ch: +m[2]!, v: +m[3]! }, what: kind ?? ['text', 'notes'] }
  return null
}
const passageOf = (h: Hit, what: string[], lang: string): Slots =>
  ({ intent: 'passage', book: h.book, chapter: h.ch, verse_start: h.v, verse_end: null, what, lang })

async function respond(c: Conv, label: string, make: () => Promise<{ sheet: Sheet; ui: string; meta: string; q?: string }>) {
  busy = true
  btn.disabled = true
  const mine: Msg = { who: 'me', text: label }
  c.msgs.push(mine)
  if (!c.title) c.title = label.slice(0, 48)
  log.querySelector('.welcome')?.remove()
  log.appendChild(renderMsg(mine))
  const wait = el('div', 'msg bot pending', T.thinking)
  log.appendChild(wait)
  wait.scrollIntoView({ block: 'end', behavior: 'smooth' })
  const t0 = performance.now()
  let m: Msg
  try {
    let { sheet, ui, meta, q } = await make()
    setUiLang(ui)
    let others: { label: string; sheet: Sheet }[] = []
    let searched = ''
    if (q !== undefined && isOpen(q, sheet)) {
      const res = await searchVerses(q, sheet.term, sheet.lang)
      const hitSheet = async (h: Hit, what: string[]) => (await buildSheet(`h${Date.now()}`, passageOf(h, what, ui), helpsLang)).sheet
      c.found = res.hits.map((h) => ({ book: h.book, ch: h.ch, v: h.v }))
      searched = `\nsearch: ${res.how} ${JSON.stringify(res.keywords)} concepts ${JSON.stringify(res.concepts)}`
      const kind = kindOf(q)
      if (res.hits.length) c.last = await hitSheet(res.hits[0]!, ['text'])
      if (!kind || !res.hits.length) {
        const total = ((performance.now() - t0) / 1000).toFixed(1)
        const used = res.how === 'concepts' ? res.concepts : res.how === 'text' ? (res.hits[0]?.why.slice(5).split(' ') ?? res.keywords) : res.keywords
        const follow: { label: string; sheet: Sheet }[] = []
        for (const h of res.hits.slice(0, 4)) follow.push({ label: `${bookLabel(ui, h.book)} ${h.ch}:${h.v}`, sheet: await hitSheet(h, ['text', 'notes']) })
        m = { who: 'bot', intro: searchIntro(res.how, used, ui), ui, follow,
          info: res.hits.map((h) => `**${bookLabel(ui, h.book)} ${h.ch}:${h.v}** — ${h.text.replace(/\s+/g, ' ').trim()}`).join('\n\n') || undefined,
          meta: `${T.details} · ${total} s\n${meta}${searched}` }
        throw { done: m }
      }
      // "notes about Jonah swallowed by the fish": straight to the notes of the best verse; the other verses as buttons
      sheet = await hitSheet(res.hits[0]!, kind)
      for (const h of res.hits.slice(1, 4)) others.push({ label: `${bookLabel(ui, h.book)} ${h.ch}:${h.v}`, sheet: await hitSheet(h, kind) })
    }
    const r = await answerSheet(sheet)
    const total = ((performance.now() - t0) / 1000).toFixed(1)
    m = { who: 'bot', intro: intro(sheet, facts, ui), info: r.answer, follow: [...followups(sheet, facts, ui), ...others], ui,
      meta: `${T.details} · ${total} s\n${meta}${searched}\n${JSON.stringify(sheet, null, 1)}` }
    if (sheet.ref && sheet.intent === 'passage') c.last = sheet
  } catch (err: any) {
    m = err?.done ?? { who: 'bot', text: `${T.failed} ${err instanceof Error ? err.message : String(err)}` }
  }
  c.msgs.push(m)
  c.updated = Date.now()
  save()
  wait.replaceWith(renderMsg(m))
  log.lastElementChild?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  busy = false
  setReady()
}

function runSheet(label: string, sheet: Sheet, ui: string) {
  if (busy) return
  respond(conv(), label, async () => ({ sheet: { ...sheet, id: `f${Date.now()}` }, ui, meta: '(follow-up: no model call)' }))
}

form.addEventListener('submit', (e) => {
  e.preventDefault()
  const q = input.value.trim()
  if (!q || busy || !modelReady()) return
  input.value = ''
  const c = conv()
  respond(c, q, async () => {
    const { slots, raw, ms } = await slotsOf(q)
    const s0 = refInText(slots ?? { intent: 'unknown', lang: nav }, q)
    // the script says the language even when the model does not know it: Arabic letters, Devanagari
    if (/[؀-ۿ]/.test(q)) s0.lang = 'ar'
    else if (/[ऀ-ॿ]/.test(q)) s0.lang = 'hi'
    const picked = pickFound(q, s0, c)
    if (picked) {
      const { sheet, ui } = await buildSheet(`q${Date.now()}`, passageOf(picked.hit, picked.what, s0.lang ?? nav), helpsLang)
      return { sheet, ui, meta: `model ${ms} ms\n${raw}\n(follow-up on the search results)` }
    }
    const s = withContext(s0, c.last, q)
    const { sheet, ui } = await buildSheet(`q${Date.now()}`, s, helpsLang)
    return { sheet, ui, meta: `model ${ms} ms\n${raw}`, q }
  })
})
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    form.requestSubmit()
  }
})

load()
renderConv()
const PACK_NAMES: Record<string, string> = { en: 'English', 'es-419': 'Español (Latinoamérica)', id: 'Bahasa Indonesia', hi: 'हिन्दी', ar: 'العربية', fr: 'Français' }
let INSTALLED: string[] = []
installedLangs().then((ls) => {
  INSTALLED = ls
  $('#packs').textContent = ls.map((l) => PACK_NAMES[l] ?? l).join(' · ')
}).catch(() => {})
setReady()
