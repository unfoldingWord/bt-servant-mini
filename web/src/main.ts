// BT Servant Mini: a chat page. Question -> offline model (slots) -> call sheet -> recipe over the installed language packs ->
// a presenting sentence (converse.ts) + the information found + follow-ups. Up to three conversations, kept on the phone.
import { answerSheet, facts, setUiLang, type Sheet } from './answer'
import { bookCode, buildSheet, type Slots } from './sheet'
import { modelReady, modelStatus, slotsOf } from './model'
import { installedLangs } from './packs'
import { bookLabel, followups, intro, searchIntro } from './converse'
import { keywords, searchVerses } from './search'

type UiText = {
  ph: string; send: string; loading: string; ready: string; thinking: string; failed: string; details: string; hello: string; ex: string[]
  chats: string; newChat: string; max: string; del: string; confirmDel: string; untitled: string
}
const UI: Record<string, UiText> = {
  en: {
    ph: 'Ask about a verse or a word…', send: 'Send', loading: 'Starting the offline model…', ready: 'Offline · ready',
    thinking: 'Looking in the translation helps…', failed: 'Something went wrong:', details: 'details',
    hello: 'Hello! I answer from the translation helps installed on this phone (notes, words, questions, Academy), without internet. Ask in English, Spanish, French, Indonesian or Hindi.',
    ex: ['What does Jonah 3:9 say in the UST?', 'What does grace mean?', 'What do the notes say about Ruth 1:16?'],
    chats: 'Conversations', newChat: 'New conversation', max: 'You can keep up to 3 conversations. Delete one to start another.',
    del: 'Delete', confirmDel: 'Delete this conversation?', untitled: 'New conversation',
  },
  es: {
    ph: 'Pregunta por un versículo o palabra…', send: 'Enviar', loading: 'Iniciando el modelo sin conexión…',
    ready: 'Sin conexión · listo', thinking: 'Buscando en las ayudas de traducción…', failed: 'Algo salió mal:', details: 'detalles',
    hello: '¡Hola! Respondo con las ayudas de traducción instaladas en este teléfono (notas, palabras, preguntas, Academia), sin internet. Pregunta en español, inglés, francés, indonesio o hindi.',
    ex: ['¿Qué notas hay para Tito 1:1?', '¿Qué significa gracia?', '¿Qué dice Jonás 3:9?'],
    chats: 'Conversaciones', newChat: 'Nueva conversación', max: 'Puedes tener hasta 3 conversaciones. Borra una para empezar otra.',
    del: 'Borrar', confirmDel: '¿Borrar esta conversación?', untitled: 'Conversación nueva',
  },
  fr: {
    ph: 'Un verset, un mot…', send: 'Envoyer', loading: 'Démarrage du modèle hors ligne…', ready: 'Hors ligne · prêt',
    thinking: 'Je cherche dans les aides à la traduction…', failed: 'Une erreur est survenue :', details: 'détails',
    hello: 'Bonjour ! Je réponds à partir des aides à la traduction installées sur ce téléphone, sans internet.',
    ex: ['Que dit Jonas 1:3 ?', 'Que signifie le mot grâce ?'],
    chats: 'Conversations', newChat: 'Nouvelle conversation', max: "Vous pouvez garder 3 conversations. Supprimez-en une pour en commencer une autre.",
    del: 'Supprimer', confirmDel: 'Supprimer cette conversation ?', untitled: 'Nouvelle conversation',
  },
  id: {
    ph: 'Tanya tentang ayat atau kata…', send: 'Kirim', loading: 'Memulai model offline…', ready: 'Offline · siap',
    thinking: 'Mencari di bahan bantu penerjemahan…', failed: 'Terjadi kesalahan:', details: 'detail',
    hello: 'Halo! Saya menjawab dari bahan bantu penerjemahan yang terpasang di ponsel ini, tanpa internet.',
    ex: ['Apa kata Yunus 3:9 dalam UST?', 'Apa arti kata kasih karunia?'],
    chats: 'Percakapan', newChat: 'Percakapan baru', max: 'Anda bisa menyimpan 3 percakapan. Hapus satu untuk memulai yang lain.',
    del: 'Hapus', confirmDel: 'Hapus percakapan ini?', untitled: 'Percakapan baru',
  },
  hi: {
    ph: 'किसी पद या शब्द के बारे में पूछें…', send: 'भेजें', loading: 'ऑफ़लाइन मॉडल शुरू हो रहा है…', ready: 'ऑफ़लाइन · तैयार',
    thinking: 'अनुवाद सहायता में खोज रहा हूँ…', failed: 'कुछ गलत हो गया:', details: 'विवरण',
    hello: 'नमस्ते! मैं इस फ़ोन पर स्थापित अनुवाद सहायता से, बिना इंटरनेट के, उत्तर देता हूँ।',
    ex: ['योना 3:9 क्या कहता है?', 'अनुग्रह का क्या अर्थ है?'],
    chats: 'बातचीत', newChat: 'नई बातचीत', max: 'आप 3 बातचीत रख सकते हैं। नई शुरू करने के लिए एक हटाएँ।',
    del: 'हटाएँ', confirmDel: 'यह बातचीत हटाएँ?', untitled: 'नई बातचीत',
  },
}
const nav = (navigator.language || 'en').slice(0, 2)
const T = UI[nav] ?? UI.en!

// ------------------------------------------------------------------------------------------------------------ conversations

type Msg = { who: 'me' | 'bot'; text?: string; intro?: string | null; info?: string; follow?: { label: string; sheet: Sheet }[]; meta?: string; ui?: string }
type Conv = { id: string; title: string; updated: number; msgs: Msg[]; last: Sheet | null }
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
input.placeholder = T.ph
btn.textContent = T.send
menu.setAttribute('aria-label', T.chats)

function el(tag: string, cls: string, text?: string): HTMLElement {
  const d = document.createElement(tag)
  d.className = cls
  if (text !== undefined) d.textContent = text
  return d
}
const tidy = (s: string) => s.replace(/\*\*?([^*\n]+)\*\*?/g, '$1')

function renderMsg(m: Msg): HTMLElement {
  if (m.who === 'me') return el('div', 'msg me', m.text)
  const d = el('div', 'msg bot')
  if (m.intro) d.appendChild(el('p', 'intro', m.intro))
  if (m.info) d.appendChild(el('div', m.intro ? 'info' : 'plain', tidy(m.info)))
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
  log.appendChild(renderMsg({ who: 'bot', text: T.hello }))
  const c = conv()
  if (!c.msgs.length) {
    const w = el('div', 'examples')
    for (const e of T.ex) {
      const b = el('button', '', e) as HTMLButtonElement
      b.type = 'button'
      b.onclick = () => {
        input.value = e
        form.requestSubmit()
      }
      w.appendChild(b)
    }
    log.appendChild(w)
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
    del.onclick = () => {
      if (!confirm(T.confirmDel)) return
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
  const nums = /(\d+)\s*[:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?|(\d+)(?:\s*[-–]\s*(\d+))?/.exec(q.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d))))
  if (words <= 8 && nums) {
    const isChap = /cap[ií]tulo|chapter|chapitre|pasal|अध्याय/i.test(q)
    const asked = /not[ae]s?|catatan|टिप्पणि/i.test(q) ? ['notes'] : /question|pregunta|pertanyaan|प्रश्न/i.test(q) ? ['questions']
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
  const t = q.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d)))
  const m = /((?:[123]\s*)?[\p{L}][\p{L}\p{M}.]+(?:\s+(?:de|of|des|du)\s+[\p{L}]+)?)\s+(\d+)\s*[:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?/u.exec(t)
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
  return { ...slots, intent: slots.intent === 'advice' ? 'advice' : 'passage', book: name, chapter: +m[2]!, verse_start: +m[3]!, verse_end: m[4] ? +m[4] : null, what }
}

/** An open question: the model said search, or there is no reference and the question names things ("where does Abraham…"). */
const WHERE = /(en )?qu[ée] vers[íi]culo|d[óo]nde|which verse|what verse|where (does|is|do)|in which|quel verset|o[ùu] (est|parle)|ayat (mana|berapa)|di mana|किस पद|कहाँ/i
function isOpen(q: string, sheet: Sheet): boolean {
  if (sheet.intent === 'search') return true
  if (sheet.ref) return false
  if (WHERE.test(q)) return keywords(q).length >= 1
  return ['unknown', 'advice', 'passage'].includes(sheet.intent) && keywords(q).length >= 2
}

async function respond(c: Conv, label: string, make: () => Promise<{ sheet: Sheet; ui: string; meta: string; q?: string }>) {
  busy = true
  btn.disabled = true
  const mine: Msg = { who: 'me', text: label }
  c.msgs.push(mine)
  if (!c.title) c.title = label.slice(0, 48)
  log.querySelector('.examples')?.remove()
  log.appendChild(renderMsg(mine))
  const wait = el('div', 'msg bot pending', T.thinking)
  log.appendChild(wait)
  wait.scrollIntoView({ block: 'end', behavior: 'smooth' })
  const t0 = performance.now()
  let m: Msg
  try {
    const { sheet, ui, meta, q } = await make()
    setUiLang(ui)
    if (q !== undefined && isOpen(q, sheet)) {
      const res = await searchVerses(q, sheet.term, sheet.lang)
      const total = ((performance.now() - t0) / 1000).toFixed(1)
      const used = res.how === 'concepts' ? res.concepts : res.how === 'text' ? (res.hits[0]?.why.slice(5).split(' ') ?? res.keywords) : res.keywords
      m = { who: 'bot', intro: searchIntro(res.how, used, ui), ui,
        info: res.hits.map((h) => `${bookLabel(ui, h.book)} ${h.ch}:${h.v} — ${h.text.replace(/\s+/g, ' ').trim()}`).join('\n\n') || undefined,
        follow: res.hits.slice(0, 4).map((h) => ({ label: `${bookLabel(ui, h.book)} ${h.ch}:${h.v}`,
          sheet: { ...sheet, intent: 'passage', ref: `${h.book} ${h.ch}:${h.v}`, what: ['text', 'notes'], term: null } })),
        meta: `${T.details} · ${total} s
${meta}
search: ${res.how} ${JSON.stringify(res.keywords)} concepts ${JSON.stringify(res.concepts)}` }
      c.msgs.push(m)
      c.updated = Date.now()
      save()
      wait.replaceWith(renderMsg(m))
      log.lastElementChild?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      busy = false
      setReady()
      return
    }
    const r = await answerSheet(sheet)
    const total = ((performance.now() - t0) / 1000).toFixed(1)
    m = { who: 'bot', intro: intro(sheet, facts, ui), info: r.answer, follow: followups(sheet, facts, ui), ui,
      meta: `${T.details} · ${total} s\n${meta}\n${JSON.stringify(sheet, null, 1)}` }
    if (sheet.ref && sheet.intent === 'passage') c.last = sheet
  } catch (err) {
    m = { who: 'bot', text: `${T.failed} ${err instanceof Error ? err.message : String(err)}` }
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
    const s = withContext(refInText(slots ?? { intent: 'unknown', lang: nav }, q), c.last, q)
    const { sheet, ui } = await buildSheet(`q${Date.now()}`, s)
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
installedLangs().then((ls) => ($('#packs').textContent = ls.join(' · '))).catch(() => {})
setReady()
