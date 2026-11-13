// The short commands understood without a model (data/commands.json): one vocabulary, the same categories in all six app
// languages. A question may mix languages ("Jonah 2 intro" in a Spanish app), so each category matches the words of every
// language. A word or phrase matches whole: no letter or vowel sign right before or after it.
import data from './data/commands.json'

export type Command = 'intro' | 'overview' | 'about' | 'tell' | 'chapter' | 'notes' | 'questions' | 'text' | 'where' | 'whole' | 'that'
  | 'terms' | 'again' | 'help' | 'replyVerb'

const VOCAB = data as unknown as Record<Command, Record<string, string[]>>
const cache = new Map<Command, RegExp>()

/** The pattern of a category: any of its words in any language. */
export function pattern(c: Command): RegExp {
  let re = cache.get(c)
  if (!re) {
    const alts = Object.values(VOCAB[c]).filter(Array.isArray).flat()
    re = new RegExp(`(?<![\\p{L}\\p{M}])(?:${alts.join('|')})(?![\\p{L}\\p{M}])`, 'iu')
    cache.set(c, re)
  }
  return re
}
export const has = (c: Command, q: string): boolean => pattern(c).test(q)

/** "capítulo 2 de Jonás", "chapter 2 of Jonah", "الأصحاح 2": the number right after a chapter word. */
export function chapterNumber(q: string): number | null {
  const m = new RegExp(`${pattern('chapter').source}\\s*(\\d+)`, 'iu').exec(q)
  return m ? Number(m[1]) : null
}

/** What the person wants to see of a verse, when the question says it ("Jonás 1:3 notas"). */
export function kindOf(q: string): string[] | null {
  return has('terms', q) ? ['terms'] : has('notes', q) ? ['notes'] : has('questions', q) ? ['questions'] : has('text', q) ? ['text'] : null
}

// "Reply in Indonesian", "en español", "dalam bahasa Inggris", "हिंदी में"...: the language the person wants the answer in.
const REPLY = (data as any).replyIn as Record<string, string[] | string>
const replyRe = new Map<string, RegExp>()
for (const [lang, alts] of Object.entries(REPLY))
  if (Array.isArray(alts)) replyRe.set(lang, new RegExp(`(?<![\\p{L}\\p{M}])(?:(?:${(VOCAB.replyVerb ? Object.values(VOCAB.replyVerb).flat() : []).join('|')})\\s+)?(?:${alts.join('|')})(?![\\p{L}\\p{M}])`, 'iu'))
/** The app language a question asks the answer to be in, or null. */
export function replyLang(q: string): string | null {
  for (const [lang, re] of replyRe) if (re.test(q)) return lang
  return null
}
/** The question without its "reply in …" part, so the rest is read as usual. */
export function withoutReply(q: string): string {
  let t = q
  for (const re of replyRe.values()) t = t.replace(new RegExp(re.source, 'giu'), ' ')
  return t.replace(/\s+([.,;:?!؟])/g, '$1').replace(/^[\s.,;:]+|[\s.,;:]+$/g, '').replace(/\s{2,}/g, ' ')
}

/** An introduction asked for: "Jonás 2 intro", "resumen de Jonás", "¿de qué trata Jonás 2?", "háblame del capítulo 2 de Jonás". */
// (not when it names what to show: "explain the key terms of Titus 1" wants the key terms)
export const asksIntro = (q: string): boolean => !kindOf(q) && (has('intro', q) || has('overview', q) || has('about', q) || (has('tell', q) && has('chapter', q)))
