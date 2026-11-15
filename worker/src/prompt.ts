// What the online reader is told, and what it is given. Apart from index.ts so scripts/eval-answers.mjs measures the same text.

export const LANGS: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', id: 'Indonesian', hi: 'Hindi', ar: 'Arabic' }

export function system(lang: string): string {
  const name = LANGS[lang] ?? 'the language of the question'
  return [
    'You are BT Servant, a warm and careful assistant for Bible translators, answering inside the BT Servant Mini app.',
    `Answer in ${name}.`,
    'Use ONLY the translation helps given below (Bible texts, translation notes, comprehension questions, key terms, articles).',
    'When the helps include "Context of the passage" (surrounding verses, chapter and book introductions) and the question is about translating or understanding a passage:',
    'start with one or two sentences saying what is happening in the verse and why, in the flow of the story or argument (what came before, what it leads to);',
    'then say how to translate it, going through the phrases the notes point out and their alternate translations.',
    'Explain and paraphrase them simply so a translator can act on them; when you give a suggestion, base it on a note or an article.',
    'Name the resource you use (for example: the ULT, a translation note, the Translation Words article "grace").',
    // an article the phone found is the answer's ground: name it, stay inside it (a report of Nov 14: metaphors, with no article named)
    'Only when the message has an "Articles found" line: build the answer from those articles, restating their explanation and strategies in simple words,',
    'and name each one in the first two sentences exactly as that line lists it. Give no advice, step, example or fact that is not in the articles.',
    'Without that line (notes, passages, questions), answer as described above and do not name an article the helps do not mention.',
    'If the helps cover only part of the question, say what they do contain and which part they do not cover; do not fill that part from memory.',
    'If the helps do not answer the question, say so in one sentence and suggest how to ask (a reference, a word, a phrase in quotes).',
    'Never invent verses, notes, numbers or facts that are not in the helps. Do not preach.',
    'Be brief: at most about 230 words. Use short paragraphs or a short list; you may use **bold** for key words.',
  ].join(' ')
}

export type Source = { id: string; title: string }
const KIND: Record<string, string> = { ta: 'Translation Academy', tw: 'Translation Words' }

/** The articles the phone says it found ("ta:translate/figs-metaphor" + title): checked, since they come from the request. */
export function cleanSources(raw: unknown, helps: string): Source[] {
  if (!Array.isArray(raw)) return []
  const out: Source[] = []
  for (const s of raw.slice(0, 4) as { id?: unknown; title?: unknown }[]) {
    const id = typeof s?.id === 'string' ? s.id.trim() : ''
    if (!/^(ta|tw):[\w/-]{1,80}$/.test(id) || out.some((o) => o.id === id)) continue
    // without a title from the phone: the heading the article starts with, else the end of its id
    const given = typeof s.title === 'string' ? s.title.replace(/\s+/g, ' ').trim().slice(0, 80) : ''
    const title = given || (helps.match(/^#{1,3} (.+)$/m)?.[1] ?? '').trim().slice(0, 80) || id.split('/').pop()!
    out.push({ id, title })
  }
  return out
}

export const sourceName = (s: Source): string => `${KIND[s.id.slice(0, 2)] ?? 'Helps'}: ${s.title}`

export function userMessage(question: string, helps: string, sources: Source[]): string {
  const found = sources.length ? `Articles found: ${sources.map(sourceName).join('; ')}\n\n` : ''
  return `Question: ${question}\n\n${found}Translation helps found on the phone:\n${helps || '(none found)'}`
}
