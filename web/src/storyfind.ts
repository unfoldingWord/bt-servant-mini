// Event and story questions ("Salomón construye el templo", "Daniel en el foso de los leones"): the section headings of the
// installed Bibles (BSB's "Daniel in the Lions’ Den", "Temple Construction Begins") and the titles of Open Bible Stories,
// matched by the question's words in the forms an English heading has them (search.ts englishForms: story words, the names
// of Translation Words articles) or by a shared beginning (templo ~ temple, construye ~ construction). pipeline.ts (route
// `search`) answers with the best section's passage before searching the verses (reports of Nov 15 and 17: a book with no
// chapter was answered with the whole book).
import { obsPack, storyList } from './obs'
import { installedLangs, openLang } from './packs'
import { englishForms } from './search'
import { fold } from './sheet'

/** A section of a book: from its heading's first verse to the verse before the next heading (within the chapter). */
export type Section = { book: string; ch: number; v: number; end: number; title: string; lang: string }
export type SectionHit = Section & { matched: string[]; extra: number }

export const tokens = (t: string): string[] => fold(t).split(/[^\p{L}\p{M}\p{N}]+/u).filter((w) => w.length >= 2)
/** Words of a heading that say nothing of its story. */
export const SMALL = new Set('the of in to an and for from at on by with into against before after over his her their its is are be who as about'.split(' '))

const cache = new Map<string, Promise<Section[]>>()
/** After the packs change. */
export function resetSections() {
  cache.clear()
}
/** A text's headings (`para:s`, `s1`, `s2`…) with their verses: the next verse after each heading, to the verse before the next one. */
export function headingsOfText(book: string, t: { pieces?: unknown[]; events?: [number, string, string][] }, lang: string): Section[] {
  const ev = t.events ?? []
  const pieces = t.pieces ?? []
  const text = (p: unknown) => (Array.isArray(p) ? String(p[0] ?? '') : typeof p === 'string' ? p : String((p as any)?.text ?? ''))
  const heads: { ch: number; v: number; title: string }[] = []
  const last = new Map<number, number>()
  let ch = 0
  let open: { at: number; title: string } | null = null
  let pending: string | null = null
  for (const [i, kind, arg] of ev) {
    if (kind === 'chapter') ch = parseInt(String(arg), 10) || ch
    else if (kind === 'open' && /^para:s\d?$/.test(String(arg))) open = { at: i, title: '' }
    else if (kind === 'close' && open) {
      const title = pieces.slice(open.at, i).map(text).join('').replace(/\s+/g, ' ').trim()
      if (title) pending = title
      open = null
    } else if (kind === 'verse' && ch) {
      const v = parseInt(String(arg), 10)
      if (!v) continue
      last.set(ch, Math.max(last.get(ch) ?? 0, parseInt(String(arg).split('-').pop()!, 10) || v))
      if (pending) heads.push({ ch, v, title: pending })
      pending = null
    }
  }
  return heads.map((h, k) => {
    const next = heads[k + 1]
    const end = next && next.ch === h.ch ? next.v - 1 : last.get(h.ch) ?? h.v
    return { book, ch: h.ch, v: h.v, end: Math.max(h.v, end), title: h.title, lang }
  })
}
/** A book's sections, from the first installed pack whose text has headings (English first: BSB has them); kept until the packs change. */
export function sectionsIn(book: string): Promise<Section[]> {
  if (!cache.has(book)) {
    const p = (async () => {
      const have = await installedLangs()
      for (const l of [...new Set(['en', ...have])].filter((x) => have.includes(x))) {
        try {
          const r = await openLang(l)
          if (!r.installed(`book:${book}`)) continue
          for (const t of (((await r.book(book)) as any)?.texts ?? []) as { pieces?: unknown[]; events?: [number, string, string][] }[]) {
            const s = headingsOfText(book, t, l)
            if (s.length) return s
          }
        } catch {}
      }
      return []
    })().catch(() => [] as Section[])
    cache.set(book, p)
  }
  return cache.get(book)!
}

/** Two words alike enough: the same, one the start of the other (lion ~ lions), or one root (templo ~ temple, construye ~ construction). */
export function alike(a: string, b: string): boolean {
  if (a === b) return true
  // (a start a few letters short: lion ~ lions, build ~ builds; not rest ~ restoration)
  if (a.length >= 4 && b.startsWith(a) && b.length - a.length <= 3) return true
  if (b.length >= 4 && a.startsWith(b) && a.length - b.length <= 3) return true
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i >= 4 && i >= Math.min(a.length, b.length) - 2 && i >= Math.max(a.length, b.length) / 2
}

/**
 * The sections of these books whose heading has the question's words: every word, or all but one of three or more (not with
 * `every`). Best
 * first (more words, then fewer other words in the heading). `words`: the question's content words, in `lang`.
 */
export async function findSections(words: string[], lang: string, books: string[], every = false): Promise<SectionHit[]> {
  const ws = [...new Set(words.filter((w) => w.length >= 2))]
  if (!ws.length || !books.length) return []
  const forms = await Promise.all(ws.map(async (w) => (await englishForms(w, lang).catch(() => [fold(w)])).map(fold)))
  const need = ws.length >= 3 && !every ? ws.length - 1 : ws.length
  const out: SectionHit[] = []
  for (const book of books) {
    for (const s of await sectionsIn(book)) {
      const toks = tokens(s.title).filter((t) => !SMALL.has(t))
      const matched = ws.filter((_, i) => forms[i]!.some((f) => toks.some((t) => alike(f, t))))
      if (matched.length < need) continue
      const used = toks.filter((t) => forms.some((fs) => fs.some((f) => alike(f, t)))).length
      out.push({ ...s, matched, extra: toks.length - used })
    }
  }
  return out.sort((a, b) => b.matched.length - a.matched.length || a.extra - b.extra)
}
/** A section as a reference ("dan 6:10-24") and as a label ("Daniel 6:10–24"). */
export const sectionRef = (s: Section): string => `${s.book} ${s.ch}:${s.v}${s.end > s.v ? `-${s.end}` : ''}`

/** The Open Bible Stories whose titles have every word of the question (all but one of three or more), best first. */
export async function findStories(words: string[], lang: string): Promise<{ n: number; title: string; lang: string; matched: string[] }[]> {
  const ws = [...new Set(words.filter((w) => w.length >= 2))]
  const at = ws.length ? await obsPack(lang).catch(() => null) : null
  if (!at) return []
  const forms = await Promise.all(ws.map(async (w) => [...new Set([fold(w), ...(await englishForms(w, lang).catch(() => [])).map(fold)])]))
  const need = ws.length >= 3 ? ws.length - 1 : ws.length
  const out: { n: number; title: string; lang: string; matched: string[]; extra: number }[] = []
  for (const e of await storyList(at.r).catch(() => [])) {
    const toks = tokens(e.title).filter((t) => !SMALL.has(t))
    const matched = ws.filter((_, i) => forms[i]!.some((f) => toks.some((t) => alike(f, t))))
    const used = toks.filter((t) => forms.some((fs) => fs.some((f) => alike(f, t)))).length
    if (e.title && matched.length >= need) out.push({ n: e.n, title: e.title, lang: at.lang, matched, extra: toks.length - used })
  }
  return out.sort((a, b) => b.matched.length - a.matched.length || a.extra - b.extra).map(({ extra: _, ...e }) => e)
}
