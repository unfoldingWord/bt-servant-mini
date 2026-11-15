// Builds the "helps" text the app sends to the online reader for some questions, from the packs on disk (no browser):
//   bun web/tests/gen-helps.ts <out.json>
// Used by worker/scripts/eval-answers.mjs to measure the online answer before and after a prompt change.
import { writeFileSync } from 'node:fs'
import { installPacks } from './fs-packs'
import { buildSheet } from '../src/sheet'
import { answerSheet } from '../src/answer'

const ART: [string, string, string][] = [
  ['How to translate metaphors?', 'en', 'ta:translate/figs-metaphor'], ['How do I translate idioms?', 'en', 'ta:translate/figs-idiom'],
  ['How do I translate a simile?', 'en', 'ta:translate/figs-simile'], ['How do I translate hyperbole?', 'en', 'ta:translate/figs-hyperbole'],
  ['What do I do when something does not exist in my culture?', 'en', 'ta:translate/translate-unknown'],
  ['How do I translate personification?', 'en', 'ta:translate/figs-personification'],
  ['How do I translate rhetorical questions?', 'en', 'ta:translate/figs-rquestion'],
  ['How do I translate "snow" if we have no snow?', 'en', 'ta:translate/translate-unknown'],
  ['How do I translate names?', 'en', 'ta:translate/translate-names'],
  ['¿Cómo traduzco las metáforas?', 'es', 'ta:translate/figs-metaphor'], ['¿Cómo traduzco los modismos?', 'es', 'ta:translate/figs-idiom'],
  ['Bagaimana menerjemahkan metafora?', 'id', 'ta:translate/figs-metaphor'],
  ['What is grace?', 'en', 'tw:kt/grace'], ['What does redeemer mean?', 'en', 'tw:kt/redeem'],
]
const PASS: [string, any][] = [
  ['Notes on Ruth 2:3', { ref: 'rut 2:3', what: ['notes'] }], ['Ruth 3:9 notes', { ref: 'rut 3:9', what: ['notes'] }],
  ['Notes on John 1:1', { ref: 'jhn 1:1', what: ['notes'] }], ['Titus 2:1-3', { ref: 'tit 2:1-3', what: ['text', 'notes'] }],
  ['Notes on Genesis 1:2', { ref: 'gen 1:2', what: ['notes'] }], ['Notes on Psalm 23:1', { ref: 'psa 23:1', what: ['notes'] }],
  ['Notes on Romans 8:1', { ref: 'rom 8:1', what: ['notes'] }], ['Key terms in Ruth 1:16', { ref: 'rut 1:16', what: ['terms'] }],
]
const out: any[] = []
await installPacks(['en', 'es-419', 'id'])
for (const [q, lang, id] of ART) {
  const base = { id: 't', intent: 'article', ref: null, what: [], version: null, concept: id, term: null, phrase: null, candidates: null, lang: lang === 'es' ? 'es-419' : lang }
  const r = await answerSheet(base as any).catch(() => null)
  out.push({ q, lang, kind: 'article', ids: [id], helps: r?.answer ?? '', cites: r?.cites })
}
for (const [q, p] of PASS) {
  const [bk, cv] = p.ref.split(' '); const [ch, vs] = cv.split(':'); const [v1, v2] = vs.split('-')
  const { sheet } = await buildSheet('t', { intent: 'passage', book: bk, chapter: +ch, verse_start: +v1, verse_end: v2 ? +v2 : null, what: p.what, lang: 'en' } as any)
  const r = await answerSheet(sheet).catch(() => null)
  out.push({ q, lang: 'en', kind: 'passage', ids: [], helps: r?.answer ?? '', cites: r?.cites })
}
writeFileSync(process.argv[2] ?? 'helps.json', JSON.stringify(out, null, 1))
console.log(out.map((o) => `${o.kind} ${o.ids.join(',')} ${o.helps.length} ${o.q}`).join('\n'))
