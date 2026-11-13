// The interactive answer: a passage drawn in the bubble with its words tied to the notes and key terms that quote them,
// and a bottom panel that opens what is tapped (the notes of a word, a note, an article) and follows the links inside it.
// The panel keeps a stack, so "back" returns to where the reader was; "Open in chat" turns an article into a message.
import { articleView, helpView, type Study, titleFor } from './answer'
import { linkTarget } from './links'
import { md } from './md'
import { count } from './usage'

type Ui = { back: string; close: string; inChat: string; notes: string; terms: string; noHelps: string; loading: string; missing: string; texts: string }
const UI: Record<string, Ui> = {
  en: { back: 'Back', close: 'Close', inChat: 'Open in chat', notes: 'Translation notes', terms: 'Key terms', noHelps: 'No note or key term quotes this word.', loading: 'Opening…', missing: 'This article is not in the installed packs.', texts: 'Other versions' },
  es: { back: 'Atrás', close: 'Cerrar', inChat: 'Abrir en el chat', notes: 'Notas de traducción', terms: 'Palabras clave', noHelps: 'Ninguna nota ni palabra clave cita esta palabra.', loading: 'Abriendo…', missing: 'Este artículo no está en los paquetes instalados.', texts: 'Otras versiones' },
  fr: { back: 'Retour', close: 'Fermer', inChat: 'Ouvrir dans le chat', notes: 'Notes de traduction', terms: 'Termes clés', noHelps: 'Aucune note ni terme clé ne cite ce mot.', loading: 'Ouverture…', missing: "Cet article n'est pas dans les paquets installés.", texts: 'Autres versions' },
  id: { back: 'Kembali', close: 'Tutup', inChat: 'Buka di obrolan', notes: 'Catatan terjemahan', terms: 'Istilah kunci', noHelps: 'Tidak ada catatan atau istilah kunci untuk kata ini.', loading: 'Membuka…', missing: 'Artikel ini tidak ada di paket yang terpasang.', texts: 'Versi lain' },
  hi: { back: 'वापस', close: 'बंद करें', inChat: 'चैट में खोलें', notes: 'अनुवाद नोट्स', terms: 'मुख्य शब्द', noHelps: 'कोई नोट या मुख्य शब्द इस शब्द को उद्धृत नहीं करता।', loading: 'खुल रहा है…', missing: 'यह लेख इंस्टॉल किए गए पैकों में नहीं है।', texts: 'अन्य संस्करण' },
  ar: { back: 'رجوع', close: 'إغلاق', inChat: 'افتح في المحادثة', notes: 'ملاحظات الترجمة', terms: 'الكلمات الرئيسية', noHelps: 'لا توجد ملاحظة أو كلمة رئيسية لهذه الكلمة.', loading: 'جارٍ الفتح…', missing: 'هذه المقالة ليست في الحزم المثبّتة.', texts: 'ترجمات أخرى' },
}
let ui: Ui = UI.en!
export function setViewLang(lang: string) {
  ui = UI[lang.split('-')[0]!] ?? UI.en!
}

export type Hooks = {
  /** A Bible reference was tapped: ask for it in the chat. */
  ref: (ref: string, label: string, lang: string) => void
  /** "Open in chat" on an article. */
  article: (id: string, title: string, lang: string) => void
}
let hooks: Hooks | null = null
export function setHooks(h: Hooks) {
  hooks = h
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
const first = (t: string, n = 140): string => {
  const x = t.replace(/\[\[[^\]]+\]\]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_#]/g, '').replace(/\s+/g, ' ').trim()
  const m = /^.{20,}?[.!?。।؟](?=\s|$)/.exec(x)
  const s = m ? m[0] : x
  return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + ' …' : s
}

/** Markdown with its links made tappable and the titles of `[[id]]` links filled in. */
export function richText(src: string, lang: string, ctx = ''): HTMLElement {
  const box = el('div', 'rich')
  box.innerHTML = md(src, ctx) // md() escapes everything first
  fillTitles(box, lang)
  return box
}
export function fillTitles(root: HTMLElement, lang: string) {
  for (const a of root.querySelectorAll<HTMLAnchorElement>('a.lk[data-fill]')) {
    const t = linkTarget(a.dataset.href ?? '')
    a.removeAttribute('data-fill')
    if (t?.kind === 'article') titleFor(lang, t.id).then((title) => { if (title) a.textContent = title }).catch(() => {})
  }
}

// ---------------------------------------------------------------------------------------------------------------- bubble

const ORDER = (label: string) => (/^(ULT|GLT)$/.test(label) ? 0 : /^(UST|GST)$/.test(label) ? 1 : 2)

/** The passage in the bubble. */
export type HelpItem = { kind: 'note' | 'question'; book: string; ch: number; v: number; snippet: string; id: string; lang: string; ref: string }
/** The notes and questions a free search found, each a row that opens the whole note or question in the panel. */
export function renderHelps(groups: { head: string; items: HelpItem[] }[]): HTMLElement {
  const box = el('div', 'info helps')
  for (const g of groups) {
    if (!g.items.length) continue
    box.appendChild(el('h4', '', g.head))
    const list = el('ol', 'nl')
    for (const h of g.items) {
      const li = el('li')
      const b = el('button', 'nrow')
      b.type = 'button'
      b.appendChild(el('strong', '', `${h.ref} `))
      b.appendChild(document.createTextNode(h.snippet))
      b.onclick = () => openPanel({ kind: 'help', lang: h.lang, book: h.book, id: h.id, which: h.kind, label: h.ref })
      li.appendChild(b)
      list.appendChild(li)
    }
    box.appendChild(list)
  }
  return box
}

export function renderStudy(s: Study): HTMLElement {
  const box = el('div', 'info study')
  box.appendChild(el('h3', '', s.head))
  const texts = [...s.texts].sort((a, b) => ORDER(a.label) - ORDER(b.label))
  const shown = texts.slice(0, 2)
  const rest = texts.slice(2)
  const many = s.texts[0]!.verses.length > 1
  const drawText = (t: Study['texts'][number], host: HTMLElement) => {
    const wrap = el('div', 'tx')
    wrap.appendChild(el('div', 'tx-label', t.label))
    const p = el('p', 'vv')
    for (const v of t.verses) {
      if (many) p.appendChild(el('sup', '', v.v))
      for (const [text, keys] of v.p) {
        if (!keys) { p.appendChild(document.createTextNode(text)); continue }
        const w = el('span', /(^| )n/.test(keys) ? 'w n' : 'w t', text)
        w.dataset.k = keys
        w.onclick = (e) => {
          e.stopPropagation()
          mark(box, w, keys.split(' '))
          openPanel({ kind: 'word', study: s, word: text, keys: keys.split(' '), root: box })
        }
        p.appendChild(w)
      }
      p.appendChild(document.createTextNode(' '))
    }
    wrap.appendChild(p)
    host.appendChild(wrap)
  }
  for (const t of shown) drawText(t, box)
  if (rest.length) {
    const d = el('details', 'more-tx')
    d.appendChild(el('summary', '', `${ui.texts} (${rest.map((t) => t.label).join(', ')})`))
    for (const t of rest) drawText(t, d)
    box.appendChild(d)
  }
  if (s.terms.length) {
    box.appendChild(el('h4', '', s.heads.terms))
    const chips = el('div', 'chips')
    for (const t of s.terms) {
      const b = el('button', 'chip', t.title)
      b.type = 'button'
      b.onclick = () => {
        mark(box, null, [`t${s.terms.indexOf(t)}`])
        openPanel({ kind: 'article', id: t.id, lang: s.lang })
      }
      chips.appendChild(b)
    }
    box.appendChild(chips)
  }
  if (s.notes.length) {
    box.appendChild(el('h4', '', s.heads.notes))
    const list = el('ol', 'nl')
    s.notes.forEach((n, i) => {
      const li = el('li')
      const b = el('button', 'nrow')
      b.type = 'button'
      if (n.said) b.appendChild(el('strong', '', `«${n.said}» `))
      b.appendChild(document.createTextNode(first(n.note)))
      b.onclick = () => {
        mark(box, null, [`n${i}`])
        openPanel({ kind: 'note', study: s, i, root: box })
      }
      li.appendChild(b)
      list.appendChild(li)
    })
    box.appendChild(list)
  }
  if (s.questions.length) {
    const d = el('details', 'qs')
    d.appendChild(el('summary', '', `${s.heads.questions} (${s.questions.length})`))
    for (const q of s.questions) {
      const p = el('p')
      p.appendChild(el('strong', '', q.q))
      p.appendChild(el('br'))
      p.appendChild(document.createTextNode(q.a))
      d.appendChild(p)
    }
    box.appendChild(d)
  }
  return box
}

/** Marks the words of some helps (and the tapped word) in one passage. */
function mark(root: HTMLElement, word: HTMLElement | null, keys: string[]) {
  for (const w of root.querySelectorAll<HTMLElement>('.w.on, .w.rel')) w.classList.remove('on', 'rel')
  for (const w of root.querySelectorAll<HTMLElement>('.w[data-k]')) {
    if ((w.dataset.k ?? '').split(' ').some((k) => keys.includes(k))) w.classList.add('rel')
  }
  word?.classList.add('on')
}

// ----------------------------------------------------------------------------------------------------------------- panel

type View =
  | { kind: 'word'; study: Study; word: string; keys: string[]; root: HTMLElement }
  | { kind: 'note'; study: Study; i: number; root: HTMLElement }
  | { kind: 'article'; id: string; lang: string }
  | { kind: 'help'; lang: string; book: string; id: string; which: 'note' | 'question'; label: string }

const stack: View[] = []
let sheet: { bg: HTMLElement; box: HTMLElement; title: HTMLElement; body: HTMLElement; back: HTMLButtonElement; foot: HTMLElement } | null = null

function ensureSheet() {
  if (sheet) return sheet
  const bg = el('div', 'sheet-bg')
  const box = el('div', 'sheet')
  box.setAttribute('role', 'dialog')
  const head = el('div', 'sheet-head')
  const back = el('button', 'sheet-btn', '‹') as HTMLButtonElement
  back.type = 'button'
  const title = el('div', 'sheet-title')
  const close = el('button', 'sheet-btn', '✕') as HTMLButtonElement
  close.type = 'button'
  head.append(back, title, close)
  const body = el('div', 'sheet-body')
  const foot = el('div', 'sheet-foot')
  box.append(el('div', 'sheet-grip'), head, body, foot)
  document.body.append(bg, box)
  back.onclick = () => {
    stack.pop()
    draw()
  }
  close.onclick = closePanel
  bg.onclick = closePanel
  // swipe down on the header to close
  let y0 = 0
  head.addEventListener('touchstart', (e) => { y0 = e.touches[0]!.clientY }, { passive: true })
  head.addEventListener('touchend', (e) => { if (e.changedTouches[0]!.clientY - y0 > 60) closePanel() })
  sheet = { bg, box, title, body, back, foot }
  return sheet
}

export function closePanel() {
  stack.length = 0
  if (!sheet) return
  sheet.box.classList.remove('open')
  sheet.bg.classList.remove('open')
  for (const w of document.querySelectorAll<HTMLElement>('.w.on, .w.rel')) w.classList.remove('on', 'rel')
}

/** Android's back: one step back in the panel, or closes it. False when the panel is not open. */
export function backPanel(): boolean {
  if (!stack.length) return false
  stack.pop()
  if (stack.length) draw()
  else closePanel()
  return true
}

export function openPanel(v: View) {
  ensureSheet()
  count(`panel.${v.kind}`)
  stack.push(v)
  draw()
}

function noteBlock(s: Study, i: number): HTMLElement {
  const n = s.notes[i]!
  const d = el('div', 'pnote')
  const head = [n.said ? `«${n.said}»` : '', n.orig && n.orig !== n.said ? `(${n.orig})` : ''].filter(Boolean).join(' ')
  if (head) d.appendChild(el('div', 'pnote-head', head))
  d.appendChild(richText(n.note, s.lang))
  if (n.concept && !n.note.includes(n.concept)) {
    const a = el('a', 'lk chip-link', n.concept.split('/').pop()!.replace(/-/g, ' '))
    a.dataset.href = n.concept
    a.dataset.fill = '1'
    d.appendChild(a)
    fillTitles(d, s.lang)
  }
  return d
}

async function draw() {
  const sh = ensureSheet()
  const v = stack[stack.length - 1]
  if (!v) return closePanel()
  sh.back.style.visibility = stack.length > 1 ? 'visible' : 'hidden'
  sh.back.setAttribute('aria-label', ui.back)
  sh.body.innerHTML = ''
  sh.foot.innerHTML = ''
  sh.box.classList.add('open')
  sh.bg.classList.add('open')
  sh.body.scrollTop = 0
  sh.body.dataset.lang = v.kind === 'article' || v.kind === 'help' ? v.lang : v.study.lang
  if (v.kind === 'word') {
    sh.title.textContent = `«${v.word}»`
    const notes = v.keys.filter((k) => k[0] === 'n').map((k) => Number(k.slice(1)))
    const terms = v.keys.filter((k) => k[0] === 't').map((k) => v.study.terms[Number(k.slice(1))]!).filter(Boolean)
    if (terms.length) {
      sh.body.appendChild(el('h4', '', ui.terms))
      const chips = el('div', 'chips')
      for (const t of terms) {
        const b = el('button', 'chip', t.title + (t.orig ? ` · ${t.orig}` : ''))
        b.type = 'button'
        b.onclick = () => openPanel({ kind: 'article', id: t.id, lang: v.study.lang })
        chips.appendChild(b)
      }
      sh.body.appendChild(chips)
    }
    if (notes.length) {
      sh.body.appendChild(el('h4', '', ui.notes))
      for (const i of notes) sh.body.appendChild(noteBlock(v.study, i))
    }
    if (!terms.length && !notes.length) sh.body.appendChild(el('p', 'muted', ui.noHelps))
    return
  }
  if (v.kind === 'help') {
    sh.title.textContent = v.label
    const h = await helpView(v.lang, v.book, v.id, v.which)
    if (stack[stack.length - 1] !== v) return
    if (!h) {
      sh.body.appendChild(el('p', 'muted', ui.missing))
      return
    }
    sh.title.textContent = h.title
    sh.body.appendChild(richText(h.md, v.lang))
    const b = el('button', 'sheet-chat', ui.inChat)
    b.type = 'button'
    b.onclick = () => {
      closePanel()
      hooks?.ref(`${v.book} ${h.ref}`, h.title, v.lang)
    }
    sh.foot.appendChild(b)
    return
  }
  if (v.kind === 'note') {
    const n = v.study.notes[v.i]!
    sh.title.textContent = n.said ? `«${n.said}»` : ui.notes
    sh.body.appendChild(noteBlock(v.study, v.i))
    return
  }
  sh.title.textContent = ui.loading
  const a = await articleView(v.lang, v.id)
  if (stack[stack.length - 1] !== v) return // the reader moved on
  if (!a) {
    sh.title.textContent = v.id.split('/').pop()!
    sh.body.appendChild(el('p', 'muted', ui.missing))
    return
  }
  sh.title.textContent = a.title
  sh.body.appendChild(richText(a.md, a.lang, v.id))
  const b = el('button', 'sheet-chat', ui.inChat)
  b.type = 'button'
  b.onclick = () => {
    closePanel()
    hooks?.article(v.id, a.title, a.lang)
  }
  sh.foot.appendChild(b)
}

// Links anywhere (a bubble or the panel): an article opens in the panel, a reference is asked in the chat.
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement | null)?.closest?.('a.lk') as HTMLAnchorElement | null
  if (!a) return
  e.preventDefault()
  const t = linkTarget(a.dataset.href ?? '', a.dataset.ctx ?? '', a.textContent ?? '')
  if (!t) return
  const lang = (a.closest('[data-lang]') as HTMLElement | null)?.dataset.lang ?? 'en'
  if (t.kind === 'article') openPanel({ kind: 'article', id: t.id, lang })
  else {
    closePanel()
    hooks?.ref(t.ref, a.textContent ?? t.ref, lang)
  }
})
