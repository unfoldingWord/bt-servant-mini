// Every example the app shows finds something: the About's "What you can ask" and "Short commands" (also the answer to "what
// can you do?", setup.ts whatYouCanAsk) in every app language, on a phone
// with only that language's pack and on the full build. The Hindi pack has translation notes for Acts only and no questions,
// and the Indonesian one has no Ruth or Jonah, so examples about Jonah answered "nothing found" there (Nov 16).
// Each one goes through the app's own path (pipeline.ts, code only: no model).
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { ALL_PACKS, installPacks } from './fs-packs'
import { turn } from './harness'
import { packFor } from '../src/firstuse'

const UIS = ['en', 'es', 'fr', 'id', 'hi', 'ar']
// ANSWERS=fast (build.py's default): Hindi and Indonesian alone on their packs, the two with books missing (under a minute);
// every language alone and on the full build (about 10 min under load, it reads every pack) only in a full run
const FAST = process.env.ANSWERS === 'fast'
const QUICK = ['hi', 'id']

// The About's text, read in a process of its own: setup.ts reaches model.ts, which hooks window.__llm when it loads, and
// loading it here (with a stand-in window) would leave grammar.test.ts, later in the same run, without its own hook
const child = Bun.spawnSync([process.execPath, '-e',
  `globalThis.window = {}; const { whatYouCanAsk } = await import(${JSON.stringify(`${import.meta.dir}/../src/setup.ts`)}); ` +
  `console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(UIS)}.map((l) => [l, whatYouCanAsk(l)]))))`])
if (child.exitCode !== 0) throw new Error(`reading the About (setup.ts) failed, exit ${child.exitCode}:
${new TextDecoder().decode(child.stderr)}`)
const ABOUT: Record<string, string> = JSON.parse(new TextDecoder().decode(child.stdout))
const whatYouCanAsk = (ui: string) => ABOUT[ui]!

/** The questions the About offers: what is in brackets in "What you can ask", and each "Short command". */
function aboutExamples(ui: string): string[] {
  const [ask, short] = whatYouCanAsk(ui).split('\n\n')
  const out: string[] = []
  for (const line of ask!.split('\n').filter((l) => l.startsWith('•'))) {
    const m = /\(([^)]+)\)/.exec(line)
    if (m) out.push(...m[1]!.split(/[,،]\s*/))
  }
  out.push(...short!.split('\n')[1]!.split(' · '))
  return out.map((q) => q.trim()).filter(Boolean)
}

async function emptyAbout(ui: string): Promise<string[]> {
  const empty: string[] = []
  for (const q of aboutExamples(ui)) {
    const r = await turn({ last: null }, { q, slots: null }, ui)
    if (!(r.found > 0)) empty.push(`${q} → ${r.answered} ${r.ref ?? ''}`)
  }
  return empty
}
for (const ui of UIS) {
  const own = packFor(ui)
  const phones: [string, () => string[]][] = []
  if (own && ALL_PACKS.includes(own)) phones.push([`only the ${own} pack`, () => [own]])
  phones.push(['the full build', () => ALL_PACKS])
  for (const [name, packs] of phones) {
    test.skipIf(FAST && (name === 'the full build' || !QUICK.includes(ui)))(`${ui}: the About's examples find something (${name})`, async () => {
      await installPacks(packs())
      expect(aboutExamples(ui).length).toBeGreaterThanOrEqual(10)
      expect(await emptyAbout(ui)).toEqual([])
    }, 240_000)
  }
}

// the About's "if you say what you are working on" example starts a light path through a book the pack has (setup.ts; the
// sentence is checked against its text, so the two stay the same)
// (the steps of each path: the Hindi pack has no questions for Acts, so its path has four)
const PATHS: [string, string, string, string, number][] = [
  ['hi', 'hi', 'मैं प्रेरितों के काम का अनुवाद करने जा रहा हूँ', 'act', 4],
  ['id', 'id', 'Saya akan menerjemahkan Titus', 'tit', 5],
]
for (const [ui, pack, q, book, steps] of PATHS)
  test(`${ui}: «${q}» starts a light path with only the ${pack} pack`, async () => {
    expect(readFileSync(`${import.meta.dir}/../src/setup.ts`, 'utf-8')).toContain(`«${q}»`)
    await installPacks([pack])
    const r = await turn({ last: null }, { q, slots: null }, ui)
    expect(r.ref).toBe(`${book} front:intro`)
    expect(r.found).toBeGreaterThan(0)
    expect((r.reply as { pathMark?: string }).pathMark ?? '').toMatch(new RegExp(`^[^0-9]*1[^0-9]+${steps}:`))
  }, 120_000)
