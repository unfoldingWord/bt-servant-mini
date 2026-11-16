// Open Bible Stories for the tests. The packs on disk (../lp3-ta-packs) have no obs unit, so a reader is given the stories of
// Mini's packs server instead, as `reader.obs()` decodes them, kept small (fixtures/packs-2026-11-16/):
//   obs-en.json: the en unit (revision 6): every story's title and source line, every frame of stories 1, 3, 24, 26 and 34 and
//     the first frame of the others, the notes, questions and word links of 1, 3 and 34;
//   obs-hi.json: the hi unit: every story's title and source line, every frame of stories 3 and 34 and the first frame of the
//     others, the notes and questions of story 3 (the hi unit has no word links).
// The ranges and titles come from the packs' own maps, as on a phone; `reader.story` and `reader.stories` are the client's,
// reading this unit through the patched reader.
//   await withObs('en')              // the English pack has OBS installed (the harness's full phone has it so)
//   await withObs('en', 'listed')    // the pack lists the unit and does not have it (installed before OBS came)
//   await withObs('en', 'none')      // the pack does not list it
//   await withObs('hi')              // the Hindi pack has its own OBS
// Call it after installPacks: a new reader is patched again (storyList keeps one list per reader).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PackReader } from '@bt-synergy/language-pack-client'
import { openLang } from '../src/packs'

const fixtures = new Map<string, any>()
const fixture = (lang: string) => {
  if (!fixtures.has(lang)) fixtures.set(lang, JSON.parse(readFileSync(resolve(import.meta.dir, `fixtures/packs-2026-11-16/obs-${lang}.json`), 'utf8')))
  return fixtures.get(lang)!
}
/** The size of a language's obs unit on Mini's packs server (Nov 16), as its catalog lists it. */
export const obsBytes = (lang = 'en'): number => fixture(lang).bytes
/** The en unit's size (223,292 bytes). */
export const OBS_BYTES: number = obsBytes('en')

export type ObsMode = 'installed' | 'listed' | 'none'
type Orig = Pick<PackReader, 'installed' | 'listed' | 'size' | 'obs'>
const patched = new WeakMap<PackReader, { orig: Orig; mode: ObsMode }>()

export async function withObs(lang = 'en', mode: ObsMode = 'installed'): Promise<PackReader> {
  const r = await openLang(lang)
  const had = patched.get(r)
  if (had?.mode === mode) return r
  const orig: Orig = had?.orig ?? { installed: r.installed, listed: r.listed, size: r.size, obs: r.obs }
  patched.set(r, { orig, mode })
  const FX = fixture(lang)
  const model = { lang: FX.lang, res: FX.res, stories: FX.stories, ...Object.fromEntries(['notes', 'questions', 'links'].filter((k) => FX[k]).map((k) => [k, FX[k]])) }
  r.installed = (u) => (u === 'obs' ? mode === 'installed' : orig.installed(u))
  r.listed = (u) => (u === 'obs' ? mode !== 'none' : orig.listed(u))
  r.size = (u) => (u === 'obs' ? (mode === 'none' ? 0 : FX.bytes) : orig.size(u))
  r.obs = async () => (mode === 'installed' ? (model as any) : undefined)
  return r
}
