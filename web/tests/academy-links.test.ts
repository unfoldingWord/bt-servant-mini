// "[Academy: title]" in a note is a button that opens the Translation Academy article, when the pack has it.
import { test, expect } from 'bun:test'
import { installPacks } from './fs-packs'
import { buildSheet } from '../src/sheet'
import { answerSheet, setUiLang } from '../src/answer'
import { md } from '../src/md'
import { linkTarget } from '../src/links'

async function notes(ui: string, pack: string, book: string) {
  await installPacks([pack])
  setUiLang(ui)
  const { sheet } = await buildSheet('t', { lang: ui, intent: 'passage', book, chapter: 2, verse_start: null, what: ['notes'] } as any)
  return (await answerSheet(sheet)).answer
}
const cases: [string, string, string, RegExp][] = [['en', 'en', 'Titus', /Academy: /], ['es', 'es-419', 'Tito', /Academia: /]]
for (const [ui, pack, book, word] of cases) {
  test(`Academy mention in a note, ${ui}`, async () => {
    const answer = await notes(ui, pack, book)
    expect(answer).toMatch(word)
    const html = md(answer)
    const links = [...html.matchAll(/<a class="lk" data-href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].filter((m) => word.test(m[2]!))
    expect(links.length).toBeGreaterThan(0)
    for (const [, href] of links) {
      const t = linkTarget(href!)
      expect(t?.kind).toBe('article')
      expect(t && t.kind === 'article' && t.id).toMatch(/^ta:/)
    }
    // the link's id is the one the note carries
    expect(answer).toMatch(new RegExp(word.source + String.raw`[^\]]+\]\(ta:[a-z]+/[a-z0-9-]+\)`))
  })
}
