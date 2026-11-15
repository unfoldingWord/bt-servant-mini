// Explore without typing: the helps in a few taps. Bible: book → chapter → verse (then the usual answer for that verse: its
// text, notes, questions and key terms), with the book's and the chapter's introductions when the notes have them.
// Translation Academy: the four manuals → their articles → the article. Only what the installed packs hold is offered (no
// dead ends), books in canonical order and grouped by testament. Nothing here uses the network.
import { CANON, openLang } from './packs'
import { bookShown } from './firstuse'
import { count } from './usage'

// ------------------------------------------------------------------------------------------------------------------ data

export type BookEntry = { code: string; lang: string }
/** The books the packs have, in canonical order, each from the first pack in `packs` that has it installed. */
export async function bibleBooks(packs: string[]): Promise<BookEntry[]> {
  const readers = await Promise.all(packs.map((l) => openLang(l).then((r) => ({ l, r })).catch(() => null)))
  const out: BookEntry[] = []
  for (const code of CANON) {
    const hit = readers.find((x) => x?.r.installed(`book:${code}`))
    if (hit) out.push({ code, lang: hit.l })
  }
  return out
}

export type ChapterEntry = { ch: number; verses: number[]; intro: boolean }
export type BookPlan = { intro: boolean; chapters: ChapterEntry[] }
const plans = new Map<string, Promise<BookPlan | null>>()
/**
 * A book's chapters and verses as its texts publish them (a bridge "4-5" gives 4 and 5), and which introductions its notes
 * have (as answer.ts finds them: the first intro row is the book's, another one starting at chapter:1 is that chapter's).
 */
export function bookPlan(lang: string, code: string): Promise<BookPlan | null> {
  const key = `${lang}:${code}`
  if (!plans.has(key))
    plans.set(key, (async () => {
      const r = await openLang(lang)
      if (!r.installed(`book:${code}`)) return null
      const model = await r.book(code)
      if (!model) return null
      const byCh = new Map<number, Set<number>>()
      for (const t of model.texts) {
        let ch = 0
        for (const [, kind, arg] of t.events) {
          if (kind === 'chapter') {
            ch = parseInt(arg, 10) || 0
            if (ch && !byCh.has(ch)) byCh.set(ch, new Set())
          } else if (kind === 'verse' && ch) {
            const [a, b] = arg.split('-').map((x) => parseInt(x, 10))
            if (!a) continue
            for (let v = a; v <= (b && b >= a && b - a < 200 ? b : a); v++) byCh.get(ch)!.add(v)
          }
        }
      }
      const intros = (model.notes?.rows ?? []).filter((x) => x.cols.isIntro === true || x.cols.isIntro === 'true')
      const chIntro = new Set(intros.slice(1).filter((x) => x.from % 1000 === 1).map((x) => Math.floor(x.from / 1000) % 1000))
      const chapters = [...byCh.entries()].filter(([, vs]) => vs.size).sort((a, b) => a[0] - b[0])
        .map(([ch, vs]) => ({ ch, verses: [...vs].sort((a, b) => a - b), intro: chIntro.has(ch) }))
      return chapters.length ? { intro: intros.length > 0, chapters } : null
    })().catch(() => null))
  return plans.get(key)!
}

export const MANUALS = ['intro', 'process', 'translate', 'checking'] as const
export type Manual = (typeof MANUALS)[number]
/** The Translation Academy manuals the packs have, each from the first pack in `packs` that has it installed. */
export async function academyManuals(packs: string[]): Promise<{ m: Manual; lang: string }[]> {
  const readers = await Promise.all(packs.map((l) => openLang(l).then((r) => ({ l, r })).catch(() => null)))
  const out: { m: Manual; lang: string }[] = []
  for (const m of MANUALS) {
    const hit = readers.find((x) => x?.r.installed(`art:ta:${m}`))
    if (hit) out.push({ m, lang: hit.l })
  }
  return out
}

export type ArticleEntry = { id: string; title: string; sub: string }
/** The articles of a manual, by title in the pack's language: the names and questions the pack's maps give them (no article read). */
export async function manualArticles(lang: string, m: Manual): Promise<ArticleEntry[]> {
  const r = await openLang(lang)
  if (!r.installed(`art:ta:${m}`)) return []
  const core = ((await r.maps()) as any).map?.core ?? {}
  const names = (core.names ?? {}) as Record<string, string[]>
  const subs = (core.subtitles ?? {}) as Record<string, string>
  const pre = `ta:${m}/`
  const base = lang.split('-')[0]!
  return Object.keys(names).filter((id) => id.startsWith(pre) && names[id]?.length)
    .map((id) => ({ id, title: String(names[id]![0]).trim(), sub: String(subs[id] ?? '').trim() }))
    .sort((a, b) => a.title.localeCompare(b.title, base, { sensitivity: 'base', numeric: true }))
}

/** Tests and a change of packs: forget what was read. */
export function resetExplore() {
  plans.clear()
  stack.length = 0
}

// ---------------------------------------------------------------------------------------------------------------- strings

type S = {
  browse: string; browseLong: string; bible: string; academy: string; ot: string; nt: string; chapters: string; verses: string
  bookIntro: string; chapter: string; chIntro: string; loading: string; none: string; addLang: string; back: string; close: string
  manuals: Record<Manual, [name: string, about: string]>; inLang: string
}
const STR: Record<string, S> = {
  en: {
    browse: 'Browse', browseLong: 'Browse the Bible and Translation Academy', bible: 'Bible', academy: 'Translation Academy',
    ot: 'Old Testament', nt: 'New Testament', chapters: 'Chapters', verses: 'Verses', bookIntro: 'Introduction to the book',
    chapter: 'Whole chapter {ch}', chIntro: 'Introduction to chapter {ch}', loading: 'Opening…', none: 'There is no language on this phone yet.',
    addLang: 'Add a language', back: 'Back', close: 'Close', inLang: 'in {lang}',
    manuals: {
      intro: ['Introduction', 'What Translation Academy is and how to use it'],
      process: ['Process', 'How a translation project goes, step by step'],
      translate: ['Translate', 'Meaning, figures of speech, names, grammar…'],
      checking: ['Checking', 'How to check a translation'],
    },
  },
  es: {
    browse: 'Explorar', browseLong: 'Explora la Biblia y Translation Academy', bible: 'Biblia', academy: 'Translation Academy',
    ot: 'Antiguo Testamento', nt: 'Nuevo Testamento', chapters: 'Capítulos', verses: 'Versículos', bookIntro: 'Introducción al libro',
    chapter: 'Todo el capítulo {ch}', chIntro: 'Introducción al capítulo {ch}', loading: 'Abriendo…', none: 'Todavía no hay ningún idioma en este teléfono.',
    addLang: 'Agregar un idioma', back: 'Atrás', close: 'Cerrar', inLang: 'en {lang}',
    manuals: {
      intro: ['Introducción', 'Qué es Translation Academy y cómo usarla'],
      process: ['Proceso', 'Cómo avanza un proyecto de traducción, paso a paso'],
      translate: ['Traducir', 'Significado, figuras retóricas, nombres, gramática…'],
      checking: ['Revisión', 'Cómo revisar una traducción'],
    },
  },
  fr: {
    browse: 'Parcourir', browseLong: 'Parcourir la Bible et Translation Academy', bible: 'Bible', academy: 'Translation Academy',
    ot: 'Ancien Testament', nt: 'Nouveau Testament', chapters: 'Chapitres', verses: 'Versets', bookIntro: 'Introduction au livre',
    chapter: 'Tout le chapitre {ch}', chIntro: 'Introduction au chapitre {ch}', loading: 'Ouverture…', none: "Il n'y a encore aucune langue sur ce téléphone.",
    addLang: 'Ajouter une langue', back: 'Retour', close: 'Fermer', inLang: 'en {lang}',
    manuals: {
      intro: ['Introduction', "Ce qu'est Translation Academy et comment l'utiliser"],
      process: ['Processus', "Comment se déroule un projet de traduction, étape par étape"],
      translate: ['Traduire', 'Sens, figures de style, noms, grammaire…'],
      checking: ['Vérification', 'Comment vérifier une traduction'],
    },
  },
  id: {
    browse: 'Jelajahi', browseLong: 'Jelajahi Alkitab dan Translation Academy', bible: 'Alkitab', academy: 'Translation Academy',
    ot: 'Perjanjian Lama', nt: 'Perjanjian Baru', chapters: 'Pasal', verses: 'Ayat', bookIntro: 'Pengantar kitab',
    chapter: 'Seluruh pasal {ch}', chIntro: 'Pengantar pasal {ch}', loading: 'Membuka…', none: 'Belum ada bahasa di ponsel ini.',
    addLang: 'Tambah bahasa', back: 'Kembali', close: 'Tutup', inLang: 'dalam {lang}',
    manuals: {
      intro: ['Pengantar', 'Apa itu Translation Academy dan cara memakainya'],
      process: ['Proses', 'Jalannya proyek penerjemahan, langkah demi langkah'],
      translate: ['Menerjemahkan', 'Makna, majas, nama, tata bahasa…'],
      checking: ['Pemeriksaan', 'Cara memeriksa terjemahan'],
    },
  },
  hi: {
    browse: 'ब्राउज़ करें', browseLong: 'बाइबल और Translation Academy ब्राउज़ करें', bible: 'बाइबल', academy: 'Translation Academy',
    ot: 'पुराना नियम', nt: 'नया नियम', chapters: 'अध्याय', verses: 'पद', bookIntro: 'पुस्तक का परिचय',
    chapter: 'पूरा अध्याय {ch}', chIntro: 'अध्याय {ch} का परिचय', loading: 'खुल रहा है…', none: 'इस फ़ोन पर अभी कोई भाषा नहीं है।',
    addLang: 'भाषा जोड़ें', back: 'वापस', close: 'बंद करें', inLang: '{lang} में',
    manuals: {
      intro: ['परिचय', 'Translation Academy क्या है और इसका उपयोग कैसे करें'],
      process: ['प्रक्रिया', 'अनुवाद परियोजना कैसे चलती है, कदम दर कदम'],
      translate: ['अनुवाद करना', 'अर्थ, अलंकार, नाम, व्याकरण…'],
      checking: ['जाँच', 'अनुवाद की जाँच कैसे करें'],
    },
  },
  ar: {
    browse: 'تصفّح', browseLong: 'تصفّح الكتاب المقدس وTranslation Academy', bible: 'الكتاب المقدس', academy: 'Translation Academy',
    ot: 'العهد القديم', nt: 'العهد الجديد', chapters: 'الأصحاحات', verses: 'الآيات', bookIntro: 'مقدمة السفر',
    chapter: 'الأصحاح {ch} كاملًا', chIntro: 'مقدمة الأصحاح {ch}', loading: 'جارٍ الفتح…', none: 'لا توجد أي لغة على هذا الهاتف بعد.',
    addLang: 'إضافة لغة', back: 'رجوع', close: 'إغلاق', inLang: 'بـ{lang}',
    manuals: {
      intro: ['مقدمة', 'ما هي Translation Academy وكيف تستخدمها'],
      process: ['العملية', 'كيف يسير مشروع الترجمة خطوة بخطوة'],
      translate: ['الترجمة', 'المعنى، الصور البلاغية، الأسماء، القواعد…'],
      checking: ['التدقيق', 'كيف تدقّق الترجمة'],
    },
  },
}
export const XT = (ui: string): S => STR[ui] ?? STR.en!

// ------------------------------------------------------------------------------------------------------------------- view

export type Ask = { lang: string; intent: 'passage' | 'article'; ref?: string; what?: string[]; concept?: string }
export type ExploreHooks = {
  /** the app's language */
  ui: () => string
  /** the installed packs, the one to read first at the start (the helps language, else the app's) */
  packs: () => string[]
  /** the name of a pack's language */
  packName: (lang: string) => string
  /** ask the chat for this (no typing, no model); false when it cannot now (an answer is on its way) */
  ask: (label: string, q: Ask) => boolean
  /** no language on the phone: to where one is added */
  addLang: () => void
}
let hooks: ExploreHooks | null = null
export function setExploreHooks(h: ExploreHooks) {
  hooks = h
}

type View =
  | { k: 'home'; tab: 'bible' | 'academy' }
  | { k: 'book'; code: string; lang: string }
  | { k: 'chapter'; code: string; lang: string; ch: number }
  | { k: 'manual'; m: Manual; lang: string }
// kept while the app is open: Browse opens again where the person left it (the next verse is one tap away)
const stack: View[] = []
let box: { root: HTMLElement; title: HTMLElement; body: HTMLElement; back: HTMLButtonElement; close: HTMLButtonElement } | null = null
let reached = false // whether this opening of the app has reached a help through Browse (counted once)

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
function button(cls: string, text: string, on: () => void): HTMLButtonElement {
  const b = el('button', cls, text)
  b.type = 'button'
  b.onclick = on
  return b
}
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))

function ensure() {
  if (box) return box
  const root = el('div')
  root.id = 'explore'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  const head = el('div', 'ex-head')
  const back = button('ex-btn ex-back', '‹', () => {
    stack.pop()
    draw()
  })
  const title = el('h2', 'ex-title')
  const close = button('ex-btn', '✕', () => closeExplore())
  head.append(back, title, close)
  const body = el('div', 'ex-body')
  root.append(head, body)
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeExplore() })
  document.body.appendChild(root)
  box = { root, title, body, back, close }
  return box
}

/** Opens Browse (where it was left, else its first view). `from`: the entry point, for the usage counts. */
export function openExplore(from: 'bar' | 'menu' | 'welcome') {
  if (!hooks) return
  count('explore.open')
  count(`explore.from.${from}`)
  const b = ensure()
  if (!stack.length) stack.push({ k: 'home', tab: 'bible' })
  b.root.classList.add('open')
  draw()
}
export function closeExplore() {
  box?.root.classList.remove('open')
}
export const exploreOpen = () => !!box?.root.classList.contains('open')
/** Android's back: one step back in Browse, or closes it. False when it is not open. */
export function backExplore(): boolean {
  if (!exploreOpen()) return false
  if (stack.length > 1) {
    stack.pop()
    draw()
  } else closeExplore()
  return true
}

function ask(label: string, q: Ask) {
  if (!hooks?.ask(label, q)) return
  count('explore.answer')
  if (!reached) {
    reached = true
    count('explore.session')
  }
  closeExplore()
}

let drawing = 0
async function draw() {
  const b = ensure()
  const v = stack[stack.length - 1]
  if (!v || !hooks) return closeExplore()
  const ui = hooks.ui()
  const s = XT(ui)
  const mine = ++drawing
  b.back.style.visibility = stack.length > 1 ? 'visible' : 'hidden'
  b.back.setAttribute('aria-label', s.back)
  b.close.setAttribute('aria-label', s.close)
  b.body.innerHTML = ''
  b.body.scrollTop = 0
  const wait = el('p', 'ex-note', s.loading)
  const later = setTimeout(() => { if (mine === drawing) b.body.appendChild(wait) }, 150)
  const done = () => {
    clearTimeout(later)
    wait.remove()
    return mine === drawing // the person moved on while this was read
  }
  const packs = hooks.packs()
  const tag = (lang: string) => (packs[0] && lang !== packs[0] ? fill(s.inLang, { lang: hooks!.packName(lang) }) : '')

  if (v.k === 'home') {
    b.title.textContent = s.browse
    if (!packs.length) {
      if (!done()) return
      b.body.appendChild(el('p', 'ex-note', s.none))
      b.body.appendChild(button('ex-pill', s.addLang, () => { closeExplore(); hooks?.addLang() }))
      return
    }
    const [books, manuals] = await Promise.all([bibleBooks(packs), academyManuals(packs)])
    if (!done()) return
    // the two halves as tabs; one alone needs none
    if (books.length && manuals.length) {
      const tabs = el('div', 'ex-tabs')
      tabs.setAttribute('role', 'tablist')
      for (const [k, name] of [['bible', s.bible], ['academy', s.academy]] as const) {
        const t = button(v.tab === k ? 'on' : '', name, () => { v.tab = k; draw() })
        t.setAttribute('role', 'tab')
        t.setAttribute('aria-selected', String(v.tab === k))
        tabs.appendChild(t)
      }
      b.body.appendChild(tabs)
    }
    const tab = !manuals.length ? 'bible' : !books.length ? 'academy' : v.tab
    if (tab === 'bible') {
      for (const [head, part] of [[s.ot, books.filter((x) => CANON.indexOf(x.code) < 39)], [s.nt, books.filter((x) => CANON.indexOf(x.code) >= 39)]] as const) {
        if (!part.length) continue
        b.body.appendChild(el('h3', '', head))
        const grid = el('div', 'ex-books')
        for (const x of part) {
          const bt = button('', '', () => { stack.push({ k: 'book', code: x.code, lang: x.lang }); draw() })
          bt.appendChild(el('span', 'ex-name', bookShown(ui, x.code)))
          const t = tag(x.lang)
          if (t) bt.appendChild(el('span', 'ex-tag', t))
          grid.appendChild(bt)
        }
        b.body.appendChild(grid)
      }
    } else {
      const list = el('div', 'ex-rows')
      for (const x of manuals) {
        const [name, about] = s.manuals[x.m]
        const row = button('ex-row', '', () => { stack.push({ k: 'manual', m: x.m, lang: x.lang }); draw() })
        const t = tag(x.lang)
        row.append(el('span', 'ex-row-t', name), el('span', 'ex-row-s', t ? `${about} · ${t}` : about), el('span', 'ex-row-c', '›'))
        list.appendChild(row)
      }
      b.body.appendChild(list)
    }
    return
  }

  if (v.k === 'book' || v.k === 'chapter') {
    const name = bookShown(ui, v.code)
    b.title.textContent = v.k === 'book' ? name : `${name} ${v.ch}`
    const plan = await bookPlan(v.lang, v.code)
    if (!done()) return
    if (!plan) {
      b.body.appendChild(el('p', 'ex-note', s.none))
      return
    }
    const passage = (label: string, ref: string, what: string[]) => ask(label, { lang: v.lang, intent: 'passage', ref, what })
    if (v.k === 'book') {
      if (plan.intro) {
        const pills = el('div', 'ex-pills')
        pills.appendChild(button('ex-pill', s.bookIntro, () => passage(`${name}: ${s.bookIntro}`, `${v.code} front:intro`, ['intro'])))
        b.body.appendChild(pills)
      }
      b.body.appendChild(el('h3', '', s.chapters))
      const grid = el('div', 'ex-grid')
      for (const c of plan.chapters) grid.appendChild(button('', String(c.ch), () => { stack.push({ k: 'chapter', code: v.code, lang: v.lang, ch: c.ch }); draw() }))
      b.body.appendChild(grid)
      return
    }
    const c = plan.chapters.find((x) => x.ch === v.ch)
    if (!c) {
      stack.pop()
      return draw()
    }
    const pills = el('div', 'ex-pills')
    pills.appendChild(button('ex-pill', fill(s.chapter, { ch: c.ch }), () => passage(`${name} ${c.ch}`, `${v.code} ${c.ch}`, ['text', 'notes'])))
    if (c.intro) pills.appendChild(button('ex-pill', fill(s.chIntro, { ch: c.ch }), () => passage(`${name} ${c.ch}: ${fill(s.chIntro, { ch: c.ch })}`, `${v.code} ${c.ch}:intro`, ['intro'])))
    b.body.appendChild(pills)
    b.body.appendChild(el('h3', '', s.verses))
    const grid = el('div', 'ex-grid')
    for (const n of c.verses) grid.appendChild(button('', String(n), () => passage(`${name} ${c.ch}:${n}`, `${v.code} ${c.ch}:${n}`, ['text', 'notes'])))
    b.body.appendChild(grid)
    return
  }

  // a manual: its articles; one opens as the chat's answer (the article, and its related articles as buttons)
  b.title.textContent = s.manuals[v.m][0]
  const list = await manualArticles(v.lang, v.m)
  if (!done()) return
  if (!list.length) {
    b.body.appendChild(el('p', 'ex-note', s.none))
    return
  }
  const rows = el('div', 'ex-rows')
  rows.dataset.lang = v.lang
  for (const a of list) {
    const row = button('ex-row', '', () => ask(a.title, { lang: v.lang, intent: 'article', concept: a.id }))
    row.dir = 'auto'
    row.appendChild(el('span', 'ex-row-t', a.title))
    if (a.sub) row.appendChild(el('span', 'ex-row-s', a.sub))
    row.appendChild(el('span', 'ex-row-c', '›'))
    rows.appendChild(row)
  }
  b.body.appendChild(rows)
}
