// Right-to-left and left-to-right text side by side (Arabic UI with English notes, "Translation Academy", references with
// digits). The Unicode Bidirectional Algorithm (UAX #9) already keeps "1:16" and "1:1-5" whole (W4: one ":" or "-" between
// two digits joins them) and puts neutrals (":", "?", "·", spaces) by the paragraph's direction. What goes wrong is
//   1. a paragraph drawn in the wrong direction: an English note inside an Arabic bubble ("forsake you." shows ".forsake you"),
//      so a block of text gets the direction of its own words (`textDir`), not the app's;
//   2. a piece inserted into a label built in the app's language, whose direction differs ("Previous verse (يونان 1:2)" in an
//      English app, "التفاصيل · 5.4 s"): it is wrapped in FSI … PDI (first-strong isolate), which `bidiLabel` does for every
//      such run, at the point the label is drawn. The label's text itself never changes, so what is asked, saved, shared or
//      sent to the online AI has no marks; `strip` removes any that come in.
// W3C, "Inline markup and bidirectional text in HTML" (isolate inserted text: <bdi>, dir, or FSI/PDI where no markup is
// possible); Android BidiFormatter.unicodeWrap (wrap every inserted string); Closure's goog.i18n.bidi.estimateDirection (a
// text is right to left when over 40% of its words are).

export const LRI = '⁦', RLI = '⁧', FSI = '⁨', PDI = '⁩'
const ISOLATES = /[⁦-⁩]/g

// strong right-to-left: Hebrew, Arabic (with its punctuation ، ؛ ؟), Syriac, Thaana, NKo, Samaritan, Mandaic, and the Hebrew
// and Arabic presentation forms
const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/
const LETTER = /\p{L}/u
const MARK = /\p{M}/u
const DIGIT = /[0-9٠-٩۰-۹]/

type Side = 'R' | 'L' | null
const side = (ch: string): Side => (RTL_CHAR.test(ch) ? 'R' : LETTER.test(ch) ? 'L' : null)

/** A language written right to left (the app's languages: only Arabic; the others for packs and what people type). */
export const rtlLang = (lang: string | null | undefined): boolean => /^(ar|he|fa|ur|ps|sd|ug|yi|dv|ckb)(-|$)/i.test(lang ?? '')

/** Has right-to-left letters. */
export const hasRtl = (s: string): boolean => RTL_CHAR.test(s)

/** The text without isolate marks (for what is shared, compared, searched or sent). */
export const strip = (s: string): string => s.replace(ISOLATES, '')

/** `s` isolated from the text around it, in the direction of its first strong letter (like <bdi>). */
export const isolate = (s: string): string => (s && !(s.startsWith(FSI) && s.endsWith(PDI)) ? FSI + s + PDI : s)

/**
 * The direction of a block of text by its words, not by its first letter: "rtl" when over 40% of the words with letters are
 * right to left, "ltr" when there are such words, '' when none (only digits and signs). An English note that quotes «Arabic»
 * first is "ltr"; an Arabic verse that starts with "GLT" is "rtl".
 */
export function textDir(s: string): 'rtl' | 'ltr' | '' {
  let r = 0
  let l = 0
  for (const w of strip(s).split(/\s+/)) {
    for (const ch of w) {
      const d = side(ch)
      if (!d) continue
      if (d === 'R') r++
      else l++
      break
    }
  }
  if (!r && !l) return ''
  return r / (r + l) > 0.4 ? 'rtl' : 'ltr'
}
/** For an element's `dir`: the text's own direction, or "auto" when it has no letters. */
export const dirOf = (s: string): 'rtl' | 'ltr' | 'auto' => textDir(s) || 'auto'

const OPEN = '([{«“', CLOSE = ')]}»”'
/**
 * A label built in the app's language (`ui`) with every run of the other direction isolated: in Arabic, "Translation Academy",
 * "GLT", "5.4 s", "Ruth 1:16"; in the other languages, "يونان 1:3" (Arabic words with their digits). A run starts at a letter
 * of the other direction, takes in the digits and signs between its letters (so "Ruth 1:16" and "NAV v2" stay whole), ends
 * at its last letter or digit (a bracket it opened, too), and starts at a number just before it ("5.4 s") when that number
 * is not tied to a word of the label's own direction. Unchanged when there is no such run (an English label in an English
 * app gets no marks), or when it is isolated already.
 */
export function bidiLabel(s: string, ui: string): string {
  if (!s || /[⁦-⁩]/.test(s)) return s
  const own: Side = rtlLang(ui) ? 'R' : 'L'
  const other: Side = own === 'R' ? 'L' : 'R'
  // nothing of the other direction: nothing to do (the common case, checked cheaply)
  if (own === 'L' ? !hasRtl(s) : ![...s].some((ch) => side(ch) === 'L')) return s
  const cs = [...s]
  let out = ''
  let i = 0
  while (i < cs.length) {
    if (side(cs[i]!) !== other) { out += cs[i]; i++; continue }
    // the run: up to the next letter of the label's direction
    let j = i
    while (j < cs.length && side(cs[j]!) !== own) j++
    // back to its last letter, mark or digit
    let end = j
    while (end > i && !(side(cs[end - 1]!) === other || MARK.test(cs[end - 1]!) || DIGIT.test(cs[end - 1]!))) end--
    // a bracket opened in the run and closed just after it belongs to it
    let run = cs.slice(i, end).join('')
    for (let k = 0; k < OPEN.length; k++) {
      const opened = run.split(OPEN[k]!).length - run.split(CLOSE[k]!).length
      if (opened > 0 && cs[end] === CLOSE[k]) { end++; run += CLOSE[k] }
    }
    // a number just before it ("5.4 s"), unless it follows a word of the label's direction ("راعوث 1 Ruth")
    const m = /(\d[\d.,:]*\s+)$/.exec(out)
    if (m) {
      const before = [...out.slice(0, out.length - m[1]!.length).trimEnd()].pop()
      if (!before || side(before) !== own) {
        out = out.slice(0, out.length - m[1]!.length)
        run = m[1]! + run
      }
    }
    out += isolate(run)
    i = end
  }
  return out
}
