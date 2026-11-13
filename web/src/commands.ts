// The short commands understood without a model (data/commands.json): one vocabulary, the same categories in all six app
// languages. A question may mix languages ("Jonah 2 intro" in a Spanish app), so each category matches the words of every
// language. A word or phrase matches whole: no letter or vowel sign right before or after it.
import data from './data/commands.json'

export type Command = 'intro' | 'overview' | 'about' | 'tell' | 'chapter' | 'notes' | 'questions' | 'text' | 'where' | 'whole' | 'that'

const VOCAB = data as unknown as Record<Command, Record<string, string[]>>
const cache = new Map<Command, RegExp>()

/** The pattern of a category: any of its words in any language. */
export function pattern(c: Command): RegExp {
  let re = cache.get(c)
  if (!re) {
    const alts = Object.values(VOCAB[c]).flat()
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
  return has('notes', q) ? ['notes'] : has('questions', q) ? ['questions'] : has('text', q) ? ['text'] : null
}

/** An introduction asked for: "Jonás 2 intro", "resumen de Jonás", "¿de qué trata Jonás 2?", "háblame del capítulo 2 de Jonás". */
export const asksIntro = (q: string): boolean => has('intro', q) || has('overview', q) || has('about', q) || (has('tell', q) && has('chapter', q))
