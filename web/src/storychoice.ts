// "La historia de Jesús": when more than one Bible story may be what is asked, the answer offers them instead of picking one
// (Abel, Nov 18: «si hay duda, presentar opciones al usuario, y que la regla sirva para ordenar las opciones; la primera sería OBS 23»).
// obs.ts namedStory answered one story when its frames named the topic far more than another's, so «historia de Jesús» could open
// OBS 26 while the typing row (obsindex.ts) put OBS 23 first. Here:
//   - one story has every word in its title ("la historia de Noé" in a pack with "Noah" in a title), or a common name (STORY_NAMES) names
//     exactly one story and no other story is a candidate: that story is answered, as before;
//   - otherwise, with two or more candidates (a title with the words, a common name, a story whose frames name the topic in 3 or more
//     frames), a short line and a button for each story, in the typing row's order: the titles that name the topic (the most words,
//     then the story's number), then the common names, then the frame counts (most first), the story's number within each group.
// Read the packs here (no index needed at send time): the same rules as the row, with the word forms of storyfind.ts findStories.
// Where the order can differ from the row's beyond the first stories: the row's frame group counts the frames that link the article the
// word names (tw ids, so a Spanish word finds an English pack's stories), the send counts the frames whose text holds the word (the
// pack's own language, 3 or more frames); the row's title group also takes a word's English forms from the word index, the send from
// storyfind's englishForms. Both start with the titles and the common names, so the first stories agree; the frame groups may not.
// The labels are drawn by main.ts followButton, which isolates their directions (bidiLabel): not wrapped twice here.
import type { Sheet } from './answer'
import type { Followup } from './converse'
import { keywords } from './search'
import { fold } from './sheet'
import { frameWords, NAMED, obsLabel, obsPack, obsRef, storiesNamed, storyList, wordsOf } from './obs'
import { findStories } from './storyfind'

export type Choice = { n: number; title: string }
export type Named = { one: { ref: string; what: string[] } } | { many: Choice[]; topic: string; lang: string }

/** The most stories a choice shows (a "All (n)" button takes the last place when there are more). */
export const MAX_CHOICES = 5

/** The stories a "story of …" question may mean, or null (then the question goes on as before: "la historia de Jonás" → Jonah's verses). */
export async function namedStories(q: string, lang: string): Promise<Named | null> {
  const t = q.replace(/[¿?!¡.,;:«»"“”؟،()]/g, ' ').replace(/\s+/g, ' ').trim()
  const hit = NAMED.map((re) => re.exec(t)).find((m) => m?.[1])
  if (!hit) return null
  const at = await obsPack(lang)
  if (!at) return null
  const words = keywords(hit[1]!)
  const folded = words.map((x) => fold(x))
  const want = folded.filter((x) => x.length >= 3)
  const one = (n: number): Named => ({ one: { ref: obsRef(n), what: ['text', 'notes'] } })
  const named = folded.length ? storiesNamed(folded) : []
  const list = await storyList(at.r).catch(() => [])
  const title = (n: number) => list.find((e) => e.n === n)?.title ?? ''
  const many = (ns: number[]): Named => ({ many: ns.map((n) => ({ n, title: title(n) })), topic: words.join(' '), lang: at.lang })
  if (!want.length) return named.length === 1 ? one(named[0]!) : named.length > 1 ? many(named) : null

  // 1. the titles that name the topic: every word (storyfind's forms of a word too: "Jesús" ~ Jesus), the strict ones first
  const has = (s: string) => { const toks = wordsOf(s); return want.filter((w) => toks.some((x) => x === w || (w.length >= 5 && x.startsWith(w.slice(0, w.length - 1))))).length }
  const strict = list.filter((e) => e.title && has(e.title) === want.length).map((e) => e.n)
  const loose = await findStories(words, at.lang).catch(() => [])
  const titles = [...new Map([...strict.map((n) => [n, want.length] as const), ...loose.map((e) => [e.n, e.matched.length] as const)]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])).keys()]
  // 2. the stories whose frames name the topic in three or more frames (the count of the old pick), most first; the words of each
  // frame are the ones obs.ts keeps for its search (read once per unit)
  const model = await at.r.obs().catch(() => undefined)
  const words2 = model ? frameWords(model) : null
  const counts = (model?.stories ?? []).map((s) => ({ n: s.n, c: s.frames.filter((fr) => {
    const toks = words2?.get(fr) ?? wordsOf(fr.text)
    return want.filter((w) => toks.some((x) => x === w || (w.length >= 5 && x.startsWith(w.slice(0, w.length - 1))))).length === want.length
  }).length })).filter((x) => x.c >= 3).sort((a, b) => b.c - a.c || a.n - b.n).map((x) => x.n)

  // one story answers directly only when the whole set of candidates (titles, common names, frame counts) is that story alone
  const all = [...new Set([...titles, ...named, ...counts])]
  if (!all.length) return null
  return all.length === 1 ? one(all[0]!) : many(all)
}

const T: Record<string, { line: string; all: string; list: string }> = {
  en: { line: 'Several stories are about {topic}. Which one do you want to see?', all: 'All ({n})', list: 'Stories with {topic}' },
  es: { line: 'Varias historias hablan de {topic}. ¿Cuál quieres ver?', all: 'Todas ({n})', list: 'Historias con {topic}' },
  fr: { line: 'Plusieurs histoires parlent de {topic}. Laquelle voulez-vous voir ?', all: 'Toutes ({n})', list: 'Histoires avec {topic}' },
  id: { line: 'Beberapa kisah membahas {topic}. Yang mana yang ingin kamu lihat?', all: 'Semua ({n})', list: 'Cerita tentang {topic}' },
  hi: { line: 'कई कहानियाँ {topic} के बारे में हैं। आप कौन-सी देखना चाहते हैं?', all: 'सभी ({n})', list: '{topic} वाली कहानियाँ' },
  ar: { line: 'هناك عدة قصص عن {topic}. أيّها تريد أن ترى؟', all: 'الكل ({n})', list: 'قصص عن {topic}' },
}
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')
const upFirst = (w: string) => w.charAt(0).toLocaleUpperCase() + w.slice(1)

/** The line and the buttons of a choice: a story's button asks the sheet the typing row's story button asks; "All (n)" opens the filtered list. */
export function choiceReply(m: Extract<Named, { many: Choice[] }>, ui: string): { intro: string; follow: Followup[] } {
  const t = T[ui] ?? T.en!
  const topic = upFirst(m.topic)
  const shown = m.many.length > MAX_CHOICES ? m.many.slice(0, MAX_CHOICES - 1) : m.many
  const follow: Followup[] = shown.map((e) => {
    const sheet: Sheet = { id: `c${e.n}-${Date.now()}`, intent: 'passage', ref: obsRef(e.n), what: ['text', 'notes'], version: null, concept: null, term: null, phrase: null, candidates: null, lang: m.lang }
    return { label: e.title ? `${obsLabel(e.n)} · ${e.title}` : obsLabel(e.n), sheet }
  })
  if (m.many.length > MAX_CHOICES)
    follow.push({ label: fill(t.all, { n: String(m.many.length) }), browse: { obs: true, lang: m.lang, only: m.many.map((e) => e.n), title: fill(t.list, { topic }) } })
  return { intro: fill(t.line, { topic }), follow }
}
