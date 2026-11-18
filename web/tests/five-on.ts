// 5M in the tests: a source in place of the installed packs (story 1 of phase 0, as an English pack would give it), or none.
import { fixtureSource } from '../src/dev'
import { fixtureOf5, refresh5, setSource5 } from '../src/five'

/** 5M on (`prime`: story 1's tables read already)
 *  — 5M on (story 1 from the fixture) or off (no pack with the tables) */
export async function fiveOn(on = true, prime = true): Promise<void> {
  setSource5(on ? fixtureSource() : { coverage: async () => new Map(), session: async () => null })
  await refresh5()
  if (on && prime) await fixtureOf5(1) // (the tables read already, as after the first session turn)
}
