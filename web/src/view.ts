// The interactive answer: a passage drawn in the bubble with its words tied to the notes and key terms that quote them,
// and a bottom panel that opens what is tapped (the notes of a word, a note, an article) and follows the links inside it.
// The panel keeps a stack, so "back" returns to where the reader was; "Open in chat" turns an article into a message.
import { articleView, helpView, type Study, titleFor } from './answer'
import { focusOrder, focusWords, SHOWN, wordsOf } from './focus'
import { type Card, cardsT, firstLine } from './helpcards'
import { linkTarget } from './links'
import { type ObsStudy, wordSpans } from './obswords'
import { md, mdDir } from './md'
import { bidiLabel, dirOf } from './bidi'
import { count } from './usage'
import { saveButton, yourNotes } from './savedview'

type Ui = { back: string; close: string; inChat: string; notes: string; terms: string; noHelps: string; loading: string; missing: string; texts: string; failed: string; retry: string }
const UI: Record<string, Ui> = {
  en: { back: 'Back', close: 'Close', inChat: 'Open in chat', notes: 'Translation notes', terms: 'Key terms', noHelps: 'No note or key term quotes this word.', loading: 'Opening…', missing: 'This article is not in the installed packs.', texts: 'Other versions', failed: 'Could not open this.', retry: 'Try again' },
  es: { back: 'Atrás', close: 'Cerrar', inChat: 'Abrir en el chat', notes: 'Notas de traducción', terms: 'Palabras clave', noHelps: 'Ninguna nota ni palabra clave cita esta palabra.', loading: 'Abriendo…', missing: 'Este artículo no está en los paquetes instalados.', texts: 'Otras versiones', failed: 'No se pudo abrir.', retry: 'Reintentar' },
  fr: { back: 'Retour', close: 'Fermer', inChat: 'Ouvrir dans le chat', notes: 'Notes de traduction', terms: 'Termes clés', noHelps: 'Aucune note ni terme clé ne cite ce mot.', loading: 'Ouverture…', missing: "Cet article n'est pas dans les paquets installés.", texts: 'Autres versions', failed: "Impossible d'ouvrir ceci.", retry: 'Réessayer' },
  id: { back: 'Kembali', close: 'Tutup', inChat: 'Buka di obrolan', notes: 'Catatan terjemahan', terms: 'Istilah kunci', noHelps: 'Tidak ada catatan atau istilah kunci untuk kata ini.', loading: 'Membuka…', missing: 'Artikel ini tidak ada di paket yang terpasang.', texts: 'Versi lain', failed: 'Tidak bisa dibuka.', retry: 'Coba lagi' },
  hi: { back: 'वापस', close: 'बंद करें', inChat: 'चैट में खोलें', notes: 'अनुवाद नोट्स', terms: 'मुख्य शब्द', noHelps: 'कोई नोट या मुख्य शब्द इस शब्द को उद्धृत नहीं करता।', loading: 'खुल रहा है…', missing: 'यह लेख इंस्टॉल किए गए पैकों में नहीं है।', texts: 'अन्य संस्करण', failed: 'इसे खोला नहीं जा सका।', retry: 'फिर से कोशिश करें' },
  ar: { back: 'رجوع', close: 'إغلاق', inChat: 'افتح في المحادثة', notes: 'ملاحظات الترجمة', terms: 'الكلمات الرئيسية', noHelps: 'لا توجد ملاحظة أو كلمة رئيسية لهذه الكلمة.', loading: 'جارٍ الفتح…', missing: 'هذه المقالة ليست في الحزم المثبّتة.', texts: 'ترجمات أخرى', failed: 'تعذّر فتح هذا.', retry: 'حاول مرة أخرى' },
}
let ui: Ui = UI.en!
/** The app's language (its direction decides which runs of a label are isolated, bidi.ts). */
let uiLang = 'en'
export function setViewLang(lang: string) {
  ui = UI[lang.split('-')[0]!] ?? UI.en!
  uiLang = lang
}
/** A label built in the app's language, the runs of the other direction isolated (bidi.ts). */
const lbl = (s: string) => bidiLabel(s, uiLang)

// ------------------------------------------------------------------------------------------- helps in three levels
// (Abel, Nov 17: "listas muy largas de notas… pueden agruparse en un solo grupo de todas las notas y luego dentro el grupo de
// notas de cada frame. Incluso cada nota podría estar plegada"): a group per kind ("Translation notes (101)"), in it one
// fold per verse or frame ("3:1 · notes: 6", with `data-at` "3:1" and `data-n` 6: pager.ts shows only the page's and counts
// them), in it each help folded (its quote, opening to all of it).

/** A group of helps: its name and its count, the count in its own span (pager.ts writes the page's there). */
export function groupFold(label: string, n: number, cls = ''): HTMLElement {
  const d = el('details', `fold hgroup ${cls}`.trim())
  const sm = el('summary', '')
  sm.append(lbl(label), ' ', el('span', 'hcount', `(${n})`))
  d.appendChild(sm)
  return d
}
/** A verse's or a frame's helps in a group: "3:1" (or "1:3" of a story) and how many. */
function atFold(summary: string, at: string, n: number): HTMLElement {
  const d = el('details', 'fold verse')
  d.dataset.at = at
  d.dataset.n = String(n)
  d.appendChild(el('summary', '', lbl(summary)))
  return d
}
/** One help folded: `head` (its quote, a question) as the button, `body` (the note, the answer) inside. */
function itemFold(head: Node, body: Node, dir: string): HTMLElement {
  const d = el('details', 'fold item')
  const sm = el('summary', '')
  sm.dir = dir
  sm.appendChild(head)
  const b = el('div', 'item-body')
  b.dir = dir
  b.appendChild(body)
  d.append(sm, b)
  return d
}
/** A note's button: its quote, else its first words. */
const noteHead = (said: string, note: string): Node => {
  if (said) {
    const q = el('strong', '', `«${said}»`)
    q.dir = 'auto'
    return q
  }
  const t = note.replace(/\s+/g, ' ').trim()
  return document.createTextNode(t.length > 70 ? `${t.slice(0, 70).replace(/\s+\S*$/, '')}…` : t)
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
/** A note's words as plain text: no link targets, no Markdown marks. */
const plainNote = (t: string): string => t.replace(/\[\[[^\]]+\]\]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_#]/g, '').replace(/\s+/g, ' ').trim()
const first = (t: string, n = 140): string => {
  const x = plainNote(t)
  const m = /^.{20,}?[.!?。।؟](?=\s|$)/.exec(x)
  const s = m ? m[0] : x
  return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + ' …' : s
}

/** Markdown with its links made tappable and the titles of `[[id]]` links filled in. */
export function richText(src: string, lang: string, ctx = ''): HTMLElement {
  const box = el('div', 'rich')
  box.dir = mdDir(src) // an English article in an Arabic app reads left to right (and the other way round)
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

export type HelpItem = { kind: 'note' | 'question'; book: string; ch: number; v: number; snippet: string; id: string; lang: string; ref: string }
/** The notes and questions a free search found, each a row that opens the whole note or question in the panel. */
export function renderHelps(groups: { head: string; items: HelpItem[] }[]): HTMLElement {
  const box = el('div', 'info helps')
  for (const g of groups) {
    if (!g.items.length) continue
    box.appendChild(el('h4', '', lbl(g.head)))
    const list = el('ol', 'nl')
    for (const h of g.items) {
      const li = el('li')
      const b = el('button', 'nrow')
      b.type = 'button'
      b.dir = dirOf(h.snippet) // the snippet's own direction; the reference isolated in it
      b.appendChild(el('strong', '', h.ref)).dir = 'auto'
      b.append(' ', h.snippet)
      b.onclick = () => openPanel({ kind: 'help', lang: h.lang, book: h.book, id: h.id, which: h.kind, label: h.ref })
      li.appendChild(b)
      list.appendChild(li)
    }
    box.appendChild(list)
  }
  return box
}

/**
 * The helps under an online answer, as cards in sight (helpcards.ts chooses them): a kind, a title and a first line, each a
 * button that opens what the phone's answer opens (a note or an article in the panel; the text and the answer itself in the
 * fold below, through `reveal`). An article's first line is read when drawn, in a line kept for it, so nothing moves.
 */
export function renderHelpCards(cards: Card[], o: {
  ui: string; lang: string; study?: Study; helps?: { head: string; items: HelpItem[] }[]; reveal: (what: 'text' | 'answer') => void
}): HTMLElement {
  const L = cardsT(o.ui)
  const box = el('section', 'hcards')
  box.setAttribute('aria-label', L.head)
  box.appendChild(el('h4', 'hc-head', L.head))
  const list = el('div', 'hc-list')
  for (const c of cards) {
    const b = el('button', `hc hc-${c.kind}`)
    b.type = 'button'
    const meta = el('span', 'hc-meta')
    const title = el('span', 'hc-title', c.title)
    const line = el('span', 'hc-line', c.line)
    title.dir = dirOf(c.title) // a title or line in Arabic reads right to left in any app language, English left to right
    line.dir = dirOf(c.line)
    b.append(meta, title, line)
    if (c.kind === 'article') {
      const lang = o.study?.terms.some((t) => t.id === c.id) ? o.study.lang : o.lang
      b.dataset.id = c.id
      b.dataset.kind = c.id.startsWith('ta:') ? L.ta : L.tw
      setCited(b, c.cited, L)
      // (drawn as the app starts, the packs may not be open yet: tried again later, a few times)
      const waits = [1500, 4000, 10000, 20000]
      const read = (n: number) => articleView(lang, c.id).then((a) => {
        if (!a) throw 0
        if (title.textContent === c.id.split('/').pop()!.replace(/[-_]/g, ' ')) { title.textContent = a.title; title.dir = dirOf(a.title) }
        line.textContent = firstLine(a.md)
        line.dir = dirOf(line.textContent)
      }).catch(() => { if (n < waits.length && b.isConnected) setTimeout(() => read(n + 1), waits[n]) })
      if (!c.line) setTimeout(() => read(0), 0)
      b.onclick = () => openPanel({ kind: 'article', id: c.id, lang })
    } else if (c.kind === 'note' && o.study) {
      meta.textContent = o.study.long ? lbl(`${L.note} · ${c.ref}`) : L.note
      b.onclick = () => openPanel({ kind: 'note', study: o.study!, i: c.i, root: box })
    } else if (c.kind === 'help') {
      meta.textContent = c.head
      const h = o.helps?.[c.g]?.items[c.i]
      if (h) b.onclick = () => openPanel({ kind: 'help', lang: h.lang, book: h.book, id: h.id, which: h.kind, label: h.ref })
    } else if (c.kind === 'text') {
      meta.textContent = lbl(`${L.text} · ${c.label}`)
      b.onclick = () => o.reveal('text')
    } else b.onclick = () => o.reveal('answer')
    list.appendChild(b)
  }
  box.appendChild(list)
  return box
}
function setCited(b: HTMLElement, cited: boolean, L: ReturnType<typeof cardsT>) {
  b.classList.toggle('cited', cited)
  const meta = b.querySelector('.hc-meta')
  if (meta) meta.textContent = lbl(cited ? `${L.cited} · ${b.dataset.kind}` : b.dataset.kind ?? '')
}
/** The online answer arrived: its articles' cards say so, where they stand (no card moves). */
export function markCited(root: HTMLElement, ids: string[], ui: string) {
  for (const b of root.querySelectorAll<HTMLElement>('.hc[data-id]')) setCited(b, ids.includes(b.dataset.id ?? ''), cardsT(ui))
}

/**
 * The passage in the bubble, in the order of the Markdown answer (answer.ts): what the question names first. `question`: what
 * the person asked, when the study itself does not say what it is about (focus.ts finds the notes about its words).
 */
export function renderStudy(s: Study, question?: string): HTMLElement {
  const box = el('div', 'info study')
  box.appendChild(el('h3', '', lbl(s.head)))
  // Latin resource names in an Arabic bubble keep their order, isolated: the line reads in the app's direction
  if (s.source) box.appendChild(el('p', 'src', lbl(s.source)))
  if (s.summary) box.appendChild(el('p', 'summary', s.summary)).dir = dirOf(s.summary)
  const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))
  const heads = {
    focus: s.heads.focus ?? `${ui.notes}: {words}`, more: s.heads.more ?? `${ui.notes} (+{n})`, verse: s.heads.verse ?? '{ref} · {n}',
    termsN: s.heads.termsN ?? `${ui.terms} ({n})`, questionsN: s.heads.questionsN ?? `${s.heads.questions} ({n})`,
  }
  const asked = s.focus?.length ? s.focus.join(' ') : question
  // the study's words were chosen already (focus.ts): they count as they are; else the question's
  const stems = s.focus?.length ? focusWords(null, s.focus) : focusWords(question)
  const order = focusOrder(s.notes.map((n) => ({ quote: n.quotes ?? n.said, titles: n.about ?? '' })), stems)

  const texts = [...s.texts].sort((a, b) => ORDER(a.label) - ORDER(b.label))
  const shown = texts.slice(0, 2)
  const rest = texts.slice(2)
  const many = s.texts[0]!.verses.length > 1
  const drawText = (t: Study['texts'][number], host: HTMLElement) => {
    const wrap = el('div', 'tx')
    wrap.appendChild(el('div', 'tx-label', t.label))
    const p = el('p', 'vv')
    p.dir = dirOf(t.verses.map((v) => v.p.map((x) => x[0]).join('')).join(' ')) // the version's own direction
    for (const v of t.verses) {
      // each verse in its own span (pager.ts shows a chapter in parts, the same verses in every version)
      const vs = el('span', 'vs')
      vs.dataset.v = v.v
      p.appendChild(vs)
      if (many) vs.appendChild(el('sup', '', v.v))
      for (const [text, keys] of v.p) {
        if (!keys) { vs.appendChild(document.createTextNode(text)); continue }
        const w = el('span', /(^| )n/.test(keys) ? 'w n' : 'w t', text)
        w.dataset.k = keys
        w.onclick = (e) => {
          e.stopPropagation()
          mark(box, w, keys.split(' '))
          openPanel({ kind: 'word', study: s, word: text, keys: keys.split(' '), root: box })
        }
        vs.appendChild(w)
      }
      vs.appendChild(document.createTextNode(' '))
    }
    wrap.appendChild(p)
    host.appendChild(wrap)
  }
  const drawTexts = () => {
    for (const t of shown) drawText(t, box)
    if (rest.length) {
      const d = el('details', 'more-tx fold')
      d.appendChild(el('summary', '', lbl(`${ui.texts} (${rest.map((t) => t.label).join(', ')})`)))
      for (const t of rest) drawText(t, d)
      box.appendChild(d)
    }
  }
  const drawTerms = (host: HTMLElement) => {
    const chips = el('div', 'chips')
    for (const t of s.terms) {
      const b = el('button', 'chip', t.title)
      b.type = 'button'
      b.dir = 'auto' // an English key term in an Arabic app keeps its own order
      b.onclick = () => {
        mark(box, null, [`t${s.terms.indexOf(t)}`])
        openPanel({ kind: 'article', id: t.id, lang: s.lang })
      }
      chips.appendChild(b)
    }
    host.appendChild(chips)
  }
  const terms = () => {
    if (!s.terms.length) return
    // behind a button, a chapter's and a verse's (Abel, Nov 17: Genesis 43:29's key terms were open too); in sight only when
    // they are what was asked
    if (s.first !== 'terms') {
      const d = el('details', 'fold')
      d.appendChild(el('summary', '', lbl(fill(heads.termsN, { n: s.terms.length }))))
      drawTerms(d)
      box.appendChild(d)
    } else {
      box.appendChild(el('h4', '', lbl(s.heads.terms)))
      drawTerms(box)
    }
  }
  /** A list of notes (by their index in the study, which the words of the text point to). */
  const noteList = (idx: number[], host: HTMLElement, withRef: boolean) => {
    const list = el('ol', 'nl')
    for (const i of idx) {
      const n = s.notes[i]!
      const li = el('li')
      const b = el('button', 'nrow')
      b.type = 'button'
      // the row reads in the note's own direction (English notes in an Arabic pack); the reference and the quote isolated
      const text = first(n.note)
      b.dir = dirOf(text || n.said || '')
      if (withRef) { b.appendChild(el('span', 'nref', n.ref)).dir = 'auto'; b.append(' ') }
      if (n.said) { b.appendChild(el('strong', '', `«${n.said}»`)).dir = 'auto'; b.append(' ') }
      b.appendChild(document.createTextNode(text))
      b.onclick = () => {
        mark(box, null, [`n${i}`])
        openPanel({ kind: 'note', study: s, i, root: box })
      }
      li.appendChild(b)
      list.appendChild(li)
    }
    host.appendChild(list)
  }
  /** One note folded: its quote as the button; inside, the note, a tap opens it in the panel as before (its words marked in the
   *  passage, its key term, its links). */
  const noteFold = (i: number): HTMLElement => {
    const n = s.notes[i]!
    const body = el('button', 'nrow')
    body.type = 'button'
    body.textContent = plainNote(n.note)
    body.onclick = () => {
      mark(box, null, [`n${i}`])
      openPanel({ kind: 'note', study: s, i, root: box })
    }
    return itemFold(noteHead(n.said, first(n.note)), body, dirOf(n.note || n.said || ''))
  }
  /** The notes not about the question: for a chapter per verse, for a verse in one group, each folded; asked for alone, the
   *  first few in sight and a button for the others. */
  const notes = (idx: number[], focused: boolean) => {
    if (!idx.length) return
    if (s.long) {
      // a chapter's notes in three levels: all of them, a verse's, each note
      const host = groupFold(ui.notes, idx.length)
      box.appendChild(host)
      const byRef = new Map<string, number[]>()
      for (const i of idx) {
        const v = s.notes[i]!.ref.split('-')[0]!
        byRef.set(v, [...(byRef.get(v) ?? []), i])
      }
      for (const [ref, list] of byRef) {
        const d = atFold(fill(heads.verse, { ref, n: list.length }), ref, list.length)
        for (const i of list) d.appendChild(noteFold(i))
        host.appendChild(d)
      }
      return
    }
    // a verse's notes not asked for alone: in a group, each note folded (Abel, Nov 17: Genesis 43:29 listed its 7 notes open)
    if (s.first !== 'notes' || focused) {
      const host = groupFold(ui.notes, idx.length)
      for (const i of idx) host.appendChild(noteFold(i))
      box.appendChild(host)
      return
    }
    const few = focused ? 0 : idx.length > SHOWN + 2 ? SHOWN : idx.length
    if (!focused) box.appendChild(el('h4', '', lbl(s.heads.notes)))
    if (few) noteList(idx.slice(0, few), box, false)
    if (idx.length > few) {
      const d = el('details', 'fold')
      d.appendChild(el('summary', '', lbl(fill(heads.more, { n: idx.length - few }))))
      noteList(idx.slice(few), d, false)
      box.appendChild(d)
    }
  }

  if (order.first.length) {
    // the question names a word: its notes first, then the passage, then the rest behind buttons
    const words = wordsOf(order.used, asked).map((w) => `«${w}»`).join(', ')
    box.appendChild(el('h4', 'focus', lbl(fill(heads.focus, { words, n: order.first.length, all: s.notes.length }))))
    noteList(order.first, box, !!s.long)
    drawTexts()
    notes(order.rest, true)
    terms()
  } else if (s.first === 'notes') {
    notes(order.rest, false)
    drawTexts()
    terms()
  } else if (s.first === 'terms') {
    terms()
    drawTexts()
    notes(order.rest, false)
  } else {
    drawTexts()
    terms()
    notes(order.rest, false)
  }
  if (s.questions.length) {
    const d = el('details', 'qs fold')
    d.appendChild(el('summary', '', lbl(fill(heads.questionsN, { n: s.questions.length }))))
    // each question folded, its answer inside (an English question in an Arabic app: its "?" at its end)
    for (const q of s.questions) d.appendChild(itemFold(el('strong', '', q.q), document.createTextNode(q.a), dirOf(`${q.q} ${q.a}`)))
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

// ------------------------------------------------------------------------------------------------------ OBS frame words

/**
 * The words of an OBS answer's frames made tappable, as a passage's are (renderStudy): each frame's paragraph (its first node
 * the "**3:5**" obsAnswer writes) gets the class `obs-fr`, and the words its notes and key terms quote (obswords.ts) the
 * same `.w.n` / `.w.t` and the same panel. The answer's text is not changed: only how it is drawn.
 */
export function linkObsWords(box: HTMLElement, o: ObsStudy) {
  for (const p of box.querySelectorAll<HTMLParagraphElement>('p')) {
    const head = p.firstElementChild
    const m = head?.tagName === 'STRONG' && p.firstChild === head ? /^(\d{1,2}):(\d{1,2})$/.exec(head.textContent?.trim() ?? '') : null
    if (!m || +m[1]! !== o.n) continue
    linkFrameWords(p, o, +m[2]!, box, head)
  }
}
/**
 * One frame's text made tappable (`p`: its words, after `head` when the frame's number is inside it; `box`: where the marks
 * are cleared). Also the frame of a 5M session's card (obs5mview.ts): the same words, the same panel, the session untouched.
 */
export function linkFrameWords(p: HTMLElement, o: ObsStudy, f: number, box: HTMLElement, head: Element | null = null) {
  p.classList.add('obs-fr')
  const quotes = o.frames[String(f)]
  if (!quotes?.length) return
  // the text after the frame's number, in order (an emphasis or a link inside it counts too)
  const nodes: Text[] = []
  const walk = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (!head?.contains(n) && !n.parentElement?.closest('a')) nodes.push(n as Text)
  const text = nodes.map((n) => n.data).join('')
  const spans = wordSpans(text, quotes)
  if (!spans.length) return
  let at = 0
  for (const node of nodes) {
    const from = at
    const to = (at += node.data.length)
    const here = spans.filter(([a, b]) => a < to && b > from)
    if (!here.length) continue
    const frag = document.createDocumentFragment()
    let k = from
    for (const [a0, b0, keys] of here) {
      const a = Math.max(a0, from), b = Math.min(b0, to)
      if (a > k) frag.appendChild(document.createTextNode(text.slice(k, a)))
      const word = text.slice(a, b)
      const w = el('span', /(^| )n/.test(keys) ? 'w n' : 'w t', word)
      w.dataset.k = keys
      w.onclick = (e) => {
        e.stopPropagation()
        mark(box, w, keys.split(' '))
        openPanel({ kind: 'word', study: o, word: text.slice(a0, b0), keys: keys.split(' '), root: box })
      }
      frag.appendChild(w)
      k = b
    }
    if (k < to) frag.appendChild(document.createTextNode(text.slice(k, to)))
    node.replaceWith(frag)
  }
}

// ----------------------------------------------------------------------------------------------------------------- panel

/** What the panel reads of a passage's helps (a Bible passage's Study, an OBS story's helps). */
type Helps = Pick<Study, 'lang' | 'notes' | 'terms'>

type View =
  | { kind: 'word'; study: Helps; word: string; keys: string[]; root: HTMLElement }
  | { kind: 'note'; study: Helps; i: number; root: HTMLElement }
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
  // the PIN lock covers the app: the panel (a note, an article, the person's own note on it) closes under it
  new MutationObserver(() => { if (stack.length && document.querySelector('#lock')) closePanel() }).observe(document.body, { childList: true })
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

function noteBlock(s: Helps, i: number): HTMLElement {
  const n = s.notes[i]!
  const d = el('div', 'pnote')
  const head = [n.said ? `«${n.said}»` : '', n.orig && n.orig !== n.said ? `(${n.orig})` : ''].filter(Boolean).join(' ')
  if (head) d.appendChild(el('div', 'pnote-head', head)).dir = dirOf(head)
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

/** The panel's title, in its own direction (an English quote or title in an Arabic app reads left to right). */
function title(sh: NonNullable<typeof sheet>, text: string) {
  sh.title.textContent = text
  sh.title.dir = dirOf(text)
}

/** The pack could not be read (it failed to open, say): say so, with a button that tries again, never "Opening…" for good. */
function failed(sh: NonNullable<typeof sheet>) {
  sh.body.appendChild(el('p', 'muted', ui.failed))
  const b = el('button', 'sheet-chat', ui.retry)
  b.type = 'button'
  b.onclick = () => void draw()
  sh.foot.appendChild(b)
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
    title(sh, `«${v.word}»`)
    const notes = v.keys.filter((k) => k[0] === 'n').map((k) => Number(k.slice(1)))
    const terms = v.keys.filter((k) => k[0] === 't').map((k) => v.study.terms[Number(k.slice(1))]!).filter(Boolean)
    if (terms.length) {
      sh.body.appendChild(el('h4', '', ui.terms))
      const chips = el('div', 'chips')
      for (const t of terms) {
        const b = el('button', 'chip', lbl(t.title + (t.orig ? ` · ${t.orig}` : '')))
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
    title(sh, v.label)
    const h = await helpView(v.lang, v.book, v.id, v.which).catch(() => undefined)
    if (stack[stack.length - 1] !== v) return
    if (h === undefined) return failed(sh)
    if (!h) {
      sh.body.appendChild(el('p', 'muted', ui.missing))
      return
    }
    title(sh, h.title)
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
    title(sh, n.said ? `«${n.said}»` : ui.notes)
    sh.body.appendChild(noteBlock(v.study, v.i))
    return
  }
  title(sh, ui.loading)
  const a = await articleView(v.lang, v.id).catch(() => undefined)
  if (stack[stack.length - 1] !== v) return // the reader moved on
  if (a === undefined) {
    title(sh, v.id.split('/').pop()!.replace(/[-_]/g, ' '))
    return failed(sh)
  }
  if (!a) {
    title(sh, v.id.split('/').pop()!)
    sh.body.appendChild(el('p', 'muted', ui.missing))
    return
  }
  title(sh, a.title)
  // the person's note about this article, above it; ☆ Save next to "Open in chat" (savedview.ts)
  const q = { k: 'article' as const, id: v.id, lang: a.lang }
  sh.body.append(yourNotes(q), richText(a.md, a.lang, v.id))
  const b = el('button', 'sheet-chat', ui.inChat)
  b.type = 'button'
  b.onclick = () => {
    closePanel()
    hooks?.article(v.id, a.title, a.lang)
  }
  sh.foot.append(saveButton({ q, label: a.title, cls: 'sheet-save' }), b)
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

/**
 * An OBS answer's helps (the folds md.ts draws from obsAnswer) in the same three levels: the frames' notes ("Notes for OBS 1:3
 * (6)") in one group "Translation notes (101)" when there are several, each note folded; the questions ("Questions (22)",
 * "1:3 **q** a" in a story) per frame, each folded with its answer inside. Only how it is drawn.
 */
export function groupObsHelps(box: HTMLElement) {
  const folds = [...box.querySelectorAll<HTMLElement>(':scope > details.fold')]
  const sum = (d: HTMLElement) => d.querySelector(':scope > summary')?.textContent ?? ''
  const notes = folds.filter((d) => d.querySelector(':scope > ol') && /\d+:\d+/.test(sum(d)))
  /** A list item as a fold: its first bold words (a quote, a question) the button, the rest inside. */
  const asItem = (li: HTMLElement, drop: RegExp) => {
    // a story's question opens with its frame ("1:3 "): gone first (the fold it goes in says it)
    const lead = li.firstChild
    if (lead?.nodeType === Node.TEXT_NODE && drop.test(lead.textContent ?? '')) {
      lead.textContent = (lead.textContent ?? '').replace(drop, '')
      if (!lead.textContent.trim()) lead.remove()
    }
    // (the bold words are the quote only when they open the item: a note without one may have bold words inside)
    const strong = li.firstChild === li.firstElementChild && li.firstElementChild?.tagName === 'STRONG' ? li.firstElementChild : null
    const head = strong ? strong.cloneNode(true) : noteHead('', li.textContent ?? '')
    strong?.remove()
    const body = el('div', '')
    body.append(...li.childNodes)
    const t = body.firstChild
    if (t?.nodeType === Node.TEXT_NODE) t.textContent = (t.textContent ?? '').replace(drop, '')
    return itemFold(head, body, li.dir || dirOf(li.textContent ?? ''))
  }
  for (const d of notes) {
    const lis = [...d.querySelectorAll<HTMLElement>(':scope > ol > li')]
    d.dataset.at = /(\d+:\d+)/.exec(sum(d))![1]!
    d.dataset.n = String(lis.length)
    d.classList.add('verse')
    for (const ol of d.querySelectorAll(':scope > ol')) ol.replaceWith(...[...ol.querySelectorAll<HTMLElement>(':scope > li')].map((li) => asItem(li, /^\s*:\s*/)))
  }
  if (notes.length > 1) {
    const g = groupFold(ui.notes, notes.reduce((a, d) => a + +(d.dataset.n ?? 0), 0))
    notes[0]!.before(g)
    g.append(...notes)
  }
  // the questions: the fold whose lists hold them (one list per question, md.ts)
  const qs = folds.find((d) => !notes.includes(d) && d.querySelector(':scope > ul'))
  if (!qs) return
  const lis = [...qs.querySelectorAll<HTMLElement>(':scope > ul > li')]
  const frameOf = (li: HTMLElement) => /^\s*(\d+:\d+)\s/.exec(li.textContent ?? '')?.[1]
  const sm = qs.querySelector<HTMLElement>(':scope > summary')!
  const label = sm.textContent!.replace(/\s*\(\d+\)\s*$/, '')
  sm.replaceChildren(label, ' ', el('span', 'hcount', `(${lis.length})`))
  qs.classList.add('hgroup')
  const items = lis.map((li) => ({ at: frameOf(li), item: asItem(li, /^\s*\d+:\d+\s+/) }))
  for (const ul of qs.querySelectorAll(':scope > ul')) ul.remove()
  if (!items.some((x) => x.at)) { qs.append(...items.map((x) => x.item)); return }
  const byAt = new Map<string, HTMLElement[]>()
  for (const x of items) byAt.set(x.at ?? '', [...(byAt.get(x.at ?? '') ?? []), x.item])
  for (const [at, list] of byAt) {
    const d = atFold(`${at} · ${list.length}`, at, list.length)
    d.append(...list)
    qs.appendChild(d)
  }
}
