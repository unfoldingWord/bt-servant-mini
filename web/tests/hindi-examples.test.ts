// Every example the app shows a Hindi user finds something: the About's "What you can ask" and "Short commands" (also the
// answer to "what can you do?", setup.ts whatYouCanAsk) and the welcome's buttons (firstuse.ts examplesFor). The Hindi pack has
// translation notes for Acts only and no questions, so an example about Jonah's notes answered "nothing found" (Nov 16).
// Each one goes through the app's own path (pipeline.ts, code only: no model), on a phone with only Hindi and on the full build.
import { afterAll, expect, test } from 'bun:test'
import { ALL_PACKS, installPacks } from './fs-packs'
import { turn } from './harness'
import { examplesFor } from '../src/firstuse'
import type { Sheet } from '../src/answer'

const hadWindow = 'window' in globalThis
if (!hadWindow) (globalThis as any).window = {} // setup.ts reaches model.ts, which hooks window.__llm
const { whatYouCanAsk } = await import('../src/setup')
afterAll(() => {
  if (!hadWindow) delete (globalThis as any).window
})

/** The questions the About offers in Hindi: what is in brackets in "What you can ask", and each "Short command". */
function aboutExamples(): string[] {
  const [ask, short] = whatYouCanAsk('hi').split('\n\n')
  const out: string[] = []
  for (const line of ask!.split('\n').filter((l) => l.startsWith('•'))) {
    const m = /\(([^)]+)\)/.exec(line)
    if (m) out.push(...m[1]!.split(/,\s*/))
  }
  out.push(...short!.split('\n')[1]!.split(' · '))
  return out.map((q) => q.trim()).filter(Boolean)
}

const phones: [string, string[]][] = [['only Hindi', ['hi']], ['the full build', ALL_PACKS]]
for (const [name, packs] of phones) {
  test(`Hindi About examples find something (${name})`, async () => {
    if (!ALL_PACKS.includes('hi')) return
    await installPacks(packs)
    const qs = aboutExamples()
    expect(qs.length).toBeGreaterThanOrEqual(10)
    const empty: string[] = []
    for (const q of qs) {
      const r = await turn({ last: null }, { q, slots: null }, 'hi')
      if (!(r.found > 0)) empty.push(`${q} → ${r.answered} ${r.ref ?? ''}`)
    }
    expect(empty).toEqual([])
  }, 60_000)

  test(`Hindi welcome examples find something (${name})`, async () => {
    if (!ALL_PACKS.includes('hi')) return
    await installPacks(packs)
    const ex = await examplesFor('hi', 'hi')
    expect(ex.length).toBeGreaterThanOrEqual(2)
    expect(ex[1]!.what).toEqual(['notes'])
    const empty: string[] = []
    for (const e of ex) {
      // as main.ts runSheet sends a welcome button
      const sheet: Sheet = {
        id: 'ex', intent: e.intent, ref: e.ref ?? null, what: e.what ?? [], version: null, concept: e.concept ?? null, term: null,
        phrase: null, candidates: null, lang: e.lang,
      } as Sheet
      const r = await turn({ last: null }, { q: e.label, sheet }, 'hi')
      if (!(r.found > 0)) empty.push(`${e.label} → ${r.answered} ${r.ref ?? ''}`)
    }
    expect(empty).toEqual([])
  }, 60_000)
}
