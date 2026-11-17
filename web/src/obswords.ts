// The words of an Open Bible Stories frame tied to the notes and key terms that quote them, as the Bible's are (view.ts
// renderStudy): `obsStudyOf` reads a story's helps once, when the answer is made, and keeps only their quotes; `wordSpans`
// finds those quotes in the frame's text as it is drawn. The rule is tc-study's (bt-synergy apps/tc-study-next/src/lib/obs/
// enrichObsFrameQuotes.ts): the text in words, a quote in parts at "&" or "…", the Nth match of the first part and the next
// match of each following part; a quote not found marks nothing (no search inside words: it marks wrong words across
// languages). DOM-free: view.ts `linkObsWords` draws them.
import type { StudyNote, StudyTerm } from './answer'
import { titleFor } from './answer'
import { cleanTitle, obsPack, parseObsRef } from './obs'

/** A quote of a frame: its words, which match (`occurrence`, -1 every one) and the help it marks (`n3`, `t0`). */
export type ObsQuote = [quote: string, occurrence: number, key: string]
/** A story's helps for its words: the notes and terms the panel opens, and per frame the quotes that mark its words. */
export type ObsStudy = { lang: string; n: number; notes: StudyNote[]; terms: StudyTerm[]; frames: Record<string, ObsQuote[]> }

// an apostrophe or a hyphen only between letters: «‘Peace’» is the word «Peace», «God’s» one word
const WORD = /\p{L}[\p{L}\p{M}\p{N}]*(?:['’-][\p{L}\p{M}\p{N}]+)*|\p{N}+/gu
/**
 * Compared without case, Latin accents or Arabic vowel marks (only to compare: what is drawn keeps them). Not every mark, as
 * tc-study does: a Devanagari vowel sign is part of the word (बुरी and बुरा are two words).
 */
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f\u0640\u064b-\u065f\u0670]/g, '').normalize('NFC').toLowerCase()
type Tok = { n: string; start: number; end: number }
const words = (s: string): Tok[] => [...s.matchAll(WORD)].map((m) => ({ n: norm(m[0]), start: m.index!, end: m.index! + m[0].length })).filter((t) => t.n)

/** Every left-to-right match of a part (word indexes, inclusive), not overlapping. */
function matches(toks: Tok[], part: string[]): [number, number][] {
  const out: [number, number][] = []
  if (!part.length) return out
  for (let i = 0; i <= toks.length - part.length;) {
    if (part.every((w, k) => toks[i + k]!.n === w)) {
      out.push([i, i + part.length - 1])
      i += part.length
    } else i++
  }
  return out
}

/** The word ranges a quote marks in a text: [] when a part is not there. */
function rangesOf(toks: Tok[], quote: string, occurrence: number): [number, number][] {
  const parts = quote.split(/\s*(?:&|…|\.{3})\s*/u).map((p) => words(p).map((t) => t.n)).filter((p) => p.length)
  if (!parts.length) return []
  if (occurrence === -1) return parts.flatMap((p) => matches(toks, p))
  if (!(occurrence >= 1)) return []
  const out: [number, number][] = []
  for (const [i, p] of parts.entries()) {
    const all = matches(toks, p)
    const m = i === 0 ? all[occurrence - 1] : all.find((x) => x[0] > out[out.length - 1]![1])
    if (!m) return []
    out.push(m)
  }
  return out
}

/**
 * The pieces of a text the quotes mark: [start, end, keys] in character offsets, in order, not overlapping. Two helps on the
 * same words share a piece (its keys joined by a space); where they only overlap, the text is cut where each begins and ends.
 */
export function wordSpans(text: string, quotes: ObsQuote[]): [number, number, string][] {
  const toks = words(text)
  if (!toks.length) return []
  const per: string[][] = toks.map(() => [])
  for (const [q, occ, key] of quotes) {
    for (const [a, b] of rangesOf(toks, String(q ?? ''), occ)) for (let i = a; i <= b; i++) if (!per[i]!.includes(key)) per[i]!.push(key)
  }
  // runs of words with the same keys, the spaces between them inside the run
  const out: [number, number, string][] = []
  for (let i = 0; i < toks.length; i++) {
    if (!per[i]!.length) continue
    const keys = per[i]!.join(' ')
    let j = i
    while (j + 1 < toks.length && per[j + 1]!.join(' ') === keys) j++
    out.push([toks[i]!.start, toks[j]!.end, keys])
    i = j
  }
  return out
}

/** A note as plain text (as obsAnswer writes it): no headings, no "(See: rc://…)". */
const tidy = (s: unknown) => String(s ?? '').replace(/^#+\s*/gm, '').replace(/\((?:ver|see):\s*rc:\/\/[^)\s]+\)/gi, '').replace(/\s+/g, ' ').trim()
const occ = (v: unknown): number => {
  const n = Number(String(v ?? '').trim() || 1)
  return Number.isFinite(n) ? n : 1
}

/**
 * The helps of an OBS answer's words ("obs 3" or "obs 3:5"), from the pack `obsAnswer` reads (the question's, else English,
 * else another): null when no pack has the story. The whole story's helps, for a frame too (the panel needs only its own).
 */
export async function obsStudyOf(s: { ref: string | null; lang: string }): Promise<ObsStudy | null> {
  const p = parseObsRef(s.ref)
  if (!p || p.n < 1 || p.n > 50) return null
  const at = await obsPack(s.lang)
  if (!at) return null
  const data = (await at.r.story(p.n)).data
  const frames = (data?.frames ?? []).filter((x) => x.text.trim() && (!p.f || +x.ref.split(':')[1]! === p.f))
  if (!frames.length) return null
  const notes: StudyNote[] = []
  const terms: StudyTerm[] = []
  const out: Record<string, ObsQuote[]> = {}
  for (const fr of frames) {
    const f = String(+fr.ref.split(':')[1]!)
    const qs: ObsQuote[] = (out[f] = [])
    for (const x of fr.notes) {
      const note = tidy(x.cols.note)
      if (!note) continue
      const quote = String(x.cols.quote ?? '').trim()
      const i = notes.push({ said: quote, orig: '', note, concept: x.concept, ref: `${p.n}:${f}` }) - 1
      if (quote) qs.push([quote, occ(x.cols.occurrence), `n${i}`])
    }
    for (const x of fr.links) {
      const words = String(x.cols.origWords ?? '').trim()
      if (!x.concept || !words) continue
      let i = terms.findIndex((t) => t.id === x.concept)
      if (i < 0) i = terms.push({ id: x.concept, title: '', said: words, orig: '' }) - 1
      qs.push([words, occ(x.cols.occurrence), `t${i}`])
    }
  }
  await Promise.all(terms.map(async (t) => { t.title = (await titleFor(at.lang, t.id).catch(() => '')) || cleanTitle(t.id.split('/').pop()!.replace(/[-_]/g, ' ')) }))
  return { lang: at.lang, n: p.n, notes, terms, frames: out }
}
