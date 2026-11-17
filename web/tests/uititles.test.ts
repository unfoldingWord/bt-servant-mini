// The titles of the buttons in the app's language (Abel, Nov 17): under Genesis 3 in a Spanish app, the passage read from the
// English pack (the Spanish one has no Genesis notes), "Academia: Introduction of New and Old Participants" and "Esta parte se
// cuenta en OBS 2:11: Sin Enters the World" were in English. The Spanish pack has both titles: they are used; English only
// when no pack in the app's language has them.
import { beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import type { ConvState } from '../src/pipeline'
import { storyList } from '../src/obs'
import { openLang } from '../src/packs'

beforeAll(fullPhone)

describe("titles in the app's language", () => {
  test('Genesis 3 from the English pack in a Spanish app: the Academy article and the OBS story in Spanish', async () => {
    const r = await turn({ last: null } as ConvState, { q: 'Génesis 3', slots: { intent: 'passage', book: 'gen', chapter: 3, what: ['text', 'notes'], lang: 'en' } }, 'es')
    const labels = (r.reply.follow ?? []).map((x) => x.label)
    const ta = labels.find((l) => l.startsWith('Academia: '))
    const obs = labels.find((l) => l.startsWith('Esta parte se cuenta en'))
    expect(ta).toBe('Academia: Presentación de los nuevos y antiguos participantes')
    // the story's title from the Spanish pack when it has one (the packs these tests read may have none: then the English one)
    const es = (await storyList(await openLang('es-419'))).find((e) => e.n === 2)?.title
    expect(obs).toMatch(new RegExp(`^Esta parte se cuenta en OBS 2:[0-9]+: ${es || 'Sin Enters the World'}$`))
    // and it opens there, in Spanish: the button says what it opens
    expect((r.reply.follow ?? []).find((x) => x.label === ta)?.sheet?.lang).toBe('es-419')
  })
  test('in English, the English titles', async () => {
    const r = await turn({ last: null } as ConvState, { q: 'Genesis 3', slots: { intent: 'passage', book: 'gen', chapter: 3, what: ['text', 'notes'], lang: 'en' } }, 'en')
    const labels = (r.reply.follow ?? []).map((x) => x.label)
    expect(labels).toContain('Academy: Introduction of New and Old Participants')
    expect(labels.some((l) => /^This part is told in OBS 2:\d+: Sin Enters the World$/.test(l))).toBe(true)
  })
})
