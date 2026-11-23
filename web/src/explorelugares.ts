// The places tab and the place view of Browse (explore.ts). The tab: a search box, a book filter, a full-screen map of the places that match
// and, under it, the list that is the map's accessible alternative; one tap on a point or a row opens the place's card. The card: its name and
// how sure the place is, a small map, the verses and events that name it, and buttons that answer in the chat (the same ones the chat's place
// answer gives, made by pipeline.ts placeCard). Like explorepeople.ts it takes its words and what it needs from Browse as arguments, so it
// never imports explore.ts (no cycle). All text goes in as text, never as markup.
import { bidiLabel, rtlLang } from './bidi'
import { count } from './usage'
import { bookShown } from './firstuse'
import { booksWithPlaces, placeData, searchPlaces } from './places'
import { mapPoint, placeCard, tagOf } from './pipeline'
import { PLT } from './placetext'
import { mountMap, type MapOpts } from './mapview'
import { placeBlock, refNode } from './placeview'
import type { Sheet } from './answer'
import type { PlaceRef } from '@bt-synergy/language-pack-client'

type Mount = (el: HTMLElement, o: MapOpts) => Promise<{ redraw(): void; destroy(): void }>

export type PlacesText = {
  /** the search box's label and placeholder */
  search: string
  /** a search that found no place */
  none: string
  /** there are more than the rows shown */
  more: string
  /** the places could not be read */
  fail: string
  loading: string
  /** the book filter: its label and the option for no filter */
  book: string
  allBooks: string
  /** what the screen reader says of the map; {n} the places on it */
  mapSum: string
  /** what the screen reader is told after a search or a filter; {n} the places found */
  count: string
}
export type PlacesCtx = {
  ui: string
  /** the packs with places, in Browse's order (placePacks): the first one is read */
  packs: string[]
  text: PlacesText
  /** Browse's drawn chevron */
  chevron: () => HTMLElement
  /** a point or a row was tapped (`name`: the name it showed) */
  onOpen: (pack: string, id: string, name: string) => void
  /** the map's drawing (tests give their own) */
  mount?: Mount
  /** where Browse's body was scrolled to when a card was opened from this tab: restored once the list is drawn */
  scroll?: number
}

const DEBOUNCE = 160
const ROWS = 30
const ALL = Number.MAX_SAFE_INTEGER // every place that matches goes on the map: the drawing groups the points, not this list
let gen = 0 // each drawing of the tab is one; a later drawing (or any other view) makes the earlier one's timer and answers void
let pending: ReturnType<typeof setTimeout> | undefined
let liveMap: { destroy(): void } | null = null
let mapGen = 0
let rerun: (() => void) | null = null
let resizing: ReturnType<typeof setTimeout> | undefined
let listening = false
/** Browse draws something else (or the tab again): what the tab was waiting for is let go (its debounce, its late answers) and its map is destroyed. */
export function stopLugaresTab() {
  gen++
  mapGen++
  clearTimeout(pending)
  clearTimeout(resizing)
  rerun = null
  liveInput = null
  try { liveMap?.destroy() } catch (e) { console.warn('map: destroy failed', e) }
  liveMap = null
}
let liveInput: HTMLInputElement | null = null
/** The tab is on screen and is being used: its box has the focus or text in it. Browse then does not draw itself again for what only changes a name. */
export function lugaresBusy(): boolean {
  return !!liveInput && (document.activeElement === liveInput || liveInput.value.trim() !== '')
}
let lastQuery = '' // kept while the app is open: Back from a place finds the search and the book as they were
let lastBook = ''
/** Tests and a change of packs: forget the search. */
export function resetLugaresTab() {
  lastQuery = ''
  lastBook = ''
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
/** The height of the full-screen map: over half the window, between 260 and 520 px. */
export const lugaresHeight = (): number => {
  const h = typeof globalThis.innerHeight === 'number' && globalThis.innerHeight > 0 ? globalThis.innerHeight : 800
  return Math.round(Math.max(260, Math.min(h * 0.55, 520)))
}
const listen = () => {
  if (listening || typeof globalThis.addEventListener !== 'function') return
  globalThis.addEventListener('resize', () => {
    clearTimeout(resizing)
    resizing = setTimeout(() => rerun?.(), 250)
  })
  listening = true
}

/** The places tab: the search box and the book, the map, then the list (made the first time with "Opening…"). */
export function renderLugaresTab(body: HTMLElement, c: PlacesCtx): void {
  const dir = rtlLang(c.ui) ? 'rtl' : 'ltr'
  const pack = c.packs[0]!
  const mount = c.mount ?? mountMap
  const wrap = el('div', 'ex-places')
  const input = el('input', 'ex-lsearch')
  input.type = 'search'
  input.value = lastQuery
  input.placeholder = c.text.search
  input.setAttribute('aria-label', c.text.search)
  input.setAttribute('autocomplete', 'off')
  input.setAttribute('autocapitalize', 'off')
  input.setAttribute('spellcheck', 'false')
  input.setAttribute('enterkeyhint', 'search')
  input.dir = 'auto' // what is typed goes in its own direction
  const bookRow = el('label', 'ex-lbookrow')
  const bookSel = el('select', 'ex-lbook')
  bookSel.setAttribute('aria-label', c.text.book)
  const all = el('option', '', c.text.allBooks)
  all.value = ''
  bookSel.appendChild(all)
  bookRow.append(el('span', 'ex-lbooklabel', c.text.book), bookSel)
  const host = el('div', 'ex-lmap')
  host.dir = 'ltr' // (the map keeps its own direction)
  const out = el('div', 'ex-llist')
  wrap.dir = dir
  // what the screen reader hears after a search or a filter (the list itself is not announced)
  const status = el('p', 'ex-lstatus')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  wrap.append(input, bookRow, status, host, out)
  body.appendChild(wrap)
  listen()

  stopLugaresTab()
  liveInput = input
  const my = gen
  let shownH = 0 // the height the map was drawn at
  let lastPlaces: PlaceRef[] = []
  let token = 0
  let started = lastQuery.trim() !== '' // a search is counted once, when the box goes from empty to something, not by key
  host.style.display = 'none'

  const drawMap = (places: PlaceRef[]) => {
    const mine = ++mapGen
    lastPlaces = places
    try { liveMap?.destroy() } catch (e) { console.warn('map: destroy failed', e) }
    liveMap = null
    const points = places.map(mapPoint).filter((p): p is NonNullable<typeof p> => !!p)
    if (!points.length) {
      host.style.display = 'none'
      return
    }
    const names = new Map(places.map((p) => [p.id, p.name]))
    const height = lugaresHeight()
    shownH = height
    host.style.display = ''
    host.style.height = `${height}px`
    const opts: MapOpts = {
      pack, points, ui: c.ui, dir, height, gestures: 'full', summary: c.text.mapSum.replace('{n}', String(points.length)),
      onPick: (id) => c.onOpen(pack, id, names.get(id) ?? ''),
    }
    mount(host, opts).then((api) => {
      if (mine !== mapGen || my !== gen) api.destroy() // another search (or another view) came while it was drawn
      else liveMap = api
    }).catch((e) => {
      // (a map that cannot be drawn is hidden: the list stays, the whole alternative)
      if (mine === mapGen) host.style.display = 'none'
      console.warn('map: kept as its list', e)
    })
  }

  const show = async (first = false) => {
    const mine = ++token
    if (first) out.replaceChildren(el('p', 'ex-note ex-opening', c.text.loading))
    const found = await searchPlaces(pack, input.value, ALL, bookSel.value || undefined).catch(() => null)
    if (mine !== token || my !== gen) return // typed again meanwhile, or Browse moved on
    out.replaceChildren()
    if (!found) {
      drawMap([])
      out.appendChild(el('p', 'ex-note ex-lfail', c.text.fail))
      return
    }
    drawMap(found.places)
    if (!first) status.textContent = found.places.length ? c.text.count.replace('{n}', String(found.places.length)) : c.text.none
    if (!found.places.length) {
      out.appendChild(el('p', 'ex-note ex-lnone', c.text.none))
      return
    }
    const t = PLT(c.ui)
    const rows = el('div', 'ex-rows ex-lrows')
    rows.dir = dir
    const subs: [PlaceRef, HTMLElement][] = []
    for (const p of found.places.slice(0, ROWS)) {
      const row = el('button', 'ex-row')
      row.type = 'button'
      row.dataset.pack = pack
      row.dataset.id = p.id
      row.onclick = () => c.onOpen(pack, p.id, p.name)
      const title = el('span', 'ex-row-t', bidiLabel(p.note ? `${p.name} (${p.note})` : p.name, c.ui))
      title.dir = rtlLang(pack) ? 'rtl' : 'ltr'
      const sub = el('span', 'ex-row-s', bidiLabel(tagOf(t, p, true), c.ui))
      row.append(title, sub, c.chevron())
      rows.appendChild(row)
      subs.push([p, sub])
    }
    out.appendChild(rows)
    if (found.places.length > ROWS) out.appendChild(el('p', 'ex-note ex-lmore', c.text.more))
    // how many verses name each place, after the list is drawn (nothing waits for it)
    for (const [p, sub] of subs) {
      void placeData(pack, p.id).then((d) => {
        if (mine !== token || my !== gen || !d?.verses) return
        const n = d.verses === 1 ? t.named1 : t.named.replace('{n}', String(d.verses))
        sub.textContent = bidiLabel([tagOf(t, p, true), n].filter(Boolean).join(' · '), c.ui)
      }).catch(() => {})
    }
    if (first && c.scroll) body.scrollTop = c.scroll // Back from a card: the list where it was
  }

  input.oninput = () => {
    const q = input.value
    lastQuery = q
    if (q.trim() === '') started = false
    else if (!started) {
      started = true
      count('explore.places.search')
    }
    if (my !== gen) return
    clearTimeout(pending)
    pending = setTimeout(() => { if (my === gen) void show() }, DEBOUNCE)
  }
  bookSel.onchange = () => {
    lastBook = bookSel.value
    if (my !== gen) return
    clearTimeout(pending)
    void show()
  }
  // The window changed size: the map is drawn again at its new height, from the same places (no new search). Not while the box has the
  // focus: on Android the keyboard changes the window's height and would throw away the map's zoom and place while one types.
  rerun = () => {
    if (my !== gen || document.activeElement === input || lugaresHeight() === shownH) return
    drawMap(lastPlaces)
  }
  if (lastBook) {
    // (Back from a place: the book it was in is the filter again, before the first list is read)
    const o = el('option', '', bookShown(c.ui, lastBook))
    o.value = lastBook
    bookSel.appendChild(o)
    bookSel.value = lastBook
  }
  // the books that name a place (the list is already on screen: the filter only joins it)
  void booksWithPlaces(pack).then((books) => {
    if (my !== gen) return
    bookSel.replaceChildren(all)
    for (const b of books) {
      const o = el('option', '', bookShown(c.ui, b.code))
      o.value = b.code
      bookSel.appendChild(o)
    }
    bookSel.value = lastBook && books.some((b) => b.code === lastBook) ? lastBook : ''
  }).catch(() => {})
  void show(true)
}

export type PlaceText = {
  loading: string
  /** the place could not be read */
  fail: string
  /** the place has a point and the data is sure of it */
  sure: string
}
export type PlaceViewCtx = {
  ui: string
  text: PlaceText
  /** the name the row showed: the title until the card says it */
  hint?: string
  /** the view's title, once the name is known */
  setTitle: (name: string) => void
  /** a button that answers in the chat (the card, what happened, where it appears, the article, a verse): `runInChat` of Browse */
  onChat: (label: string, sheet: Sheet) => void
  /** the small map's drawing (tests give their own) */
  mount?: Mount
}

/** The card of one place, inside Browse. Back is the stack's. */
export function renderPlace(body: HTMLElement, v: { pack: string; id: string }, c: PlaceViewCtx): void {
  const dir = rtlLang(c.ui) ? 'rtl' : 'ltr'
  const wrap = el('div', 'ex-place')
  wrap.dir = dir
  wrap.dataset.pack = v.pack
  wrap.dataset.id = v.id
  wrap.appendChild(el('p', 'ex-note ex-opening', c.text.loading))
  body.appendChild(wrap)
  if (c.hint) c.setTitle(c.hint)
  void (async () => {
    try {
      const card = await placeCard(v.pack, c.ui, v.id)
      if (!body.contains(wrap)) return // Back was pressed (or another view drawn) before the card came: nothing is painted or mounted
      if (!card) throw new Error(`no place ${v.id}`)
      const t = PLT(c.ui)
      c.setTitle(card.title)
      const block = el('div', 'ex-place-card')
      // how sure the place is, in words (a color alone never says it)
      block.appendChild(el('p', 'ex-ptag', bidiLabel(card.tag || (card.map ? c.text.sure : t.tagUnknown), c.ui)))
      if (card.map) block.appendChild(placeBlock({ map: card.map }, c.ui, c.mount))
      if (card.verses.length) {
        block.appendChild(el('h4', 'ex-sub', bidiLabel(t.appears.replace('{n}', String(card.count)), c.ui)))
        const list = el('div', 'ex-rows ex-pverses')
        for (const x of card.verses) {
          const sheet = x.sheet
          if (sheet) {
            const b = el('button', 'ex-row')
            b.type = 'button'
            b.onclick = () => c.onChat(x.label, sheet)
            const s = el('span', 'ex-row-t')
            s.appendChild(refNode(x.label))
            b.appendChild(s)
            list.appendChild(b)
          } else {
            // (no pack on the phone has this book: the verse is named, not offered)
            const p = el('p', 'ex-row ex-row-plain')
            p.appendChild(refNode(x.label))
            list.appendChild(p)
          }
        }
        block.appendChild(list)
      }
      if (card.events.length) {
        block.appendChild(el('h4', 'ex-sub', bidiLabel(t.happenedHere, c.ui)))
        const list = el('div', 'ex-pevents')
        for (const e of card.events) {
          const row = el('div', 'ex-pevent')
          row.appendChild(el('bdi', 'place-name', e.title))
          if (e.label) {
            row.appendChild(document.createTextNode(' — '))
            const sheet = e.sheet
            if (sheet) {
              const b = el('button', 'ex-plink')
              b.type = 'button'
              b.onclick = () => c.onChat(e.label!, sheet)
              b.appendChild(refNode(e.label))
              row.appendChild(b)
            } else row.appendChild(refNode(e.label))
          }
          list.appendChild(row)
        }
        block.appendChild(list)
      }
      const bar = el('div', 'ex-pbar')
      for (const b of card.buttons) {
        const x = el('button', 'ex-pill', bidiLabel(b.label, c.ui))
        x.type = 'button'
        x.dataset.kind = b.kind
        x.onclick = () => c.onChat(b.label, b.sheet)
        bar.appendChild(x)
      }
      block.appendChild(bar)
      if (card.credit) block.appendChild(el('p', 'credit', card.credit))
      wrap.replaceChildren(block)
    } catch {
      // (anything that went wrong, the reading or the drawing: said, with Back there; never «Opening…» for good)
      wrap.replaceChildren(el('p', 'ex-note ex-pfail', c.text.fail))
    }
  })()
}
