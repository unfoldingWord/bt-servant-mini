// Story choices on the real packs with Open Bible Stories (../../../../mini-obs-packs: es-419, ar, en, hi, id with the obs unit), not
// the English fixture of storychoice.test.ts. Skipped where that folder is not on the machine.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ALL_PACKS, installPacks, usePacksDir } from './fs-packs'
import { nextSteps, stepTarget, turn } from './harness'
import { answer, type ConvState, type Made } from '../src/pipeline'
import type { Sheet } from '../src/answer'
import { bidiLabel } from '../src/bidi'
import { namedStories } from '../src/storychoice'

const DIR = resolve(import.meta.dir, '../../../../mini-obs-packs')
const here = existsSync(DIR)
const d = here ? describe : describe.skip

beforeAll(async () => {
  if (!here) return
  usePacksDir(DIR)
  await installPacks(ALL_PACKS)
})
afterAll(async () => {
  usePacksDir()
  await installPacks(ALL_PACKS)
})
const ask = (q: string, ui: string, c: ConvState = { last: null }) => turn(c, { q }, ui)
const steps = (r: any) => nextSteps({ reply: r.reply } as any)
const press = (c: ConvState, f: { sheet?: Sheet }, ui: string) => answer(c, { sheet: { ...f.sheet!, id: `t${Date.now()}` }, ui, meta: '(button)' } as Made, performance.now())
const nums = async (q: string, lang: string) => {
  const m = await namedStories(q, lang)
  return m ? ('one' in m ? [Number(/\d+/.exec(m.one.ref)![0])] : m.many.map((e) => e.n)) : null
}

d('real packs (es-419, ar, en with the obs unit)', () => {
  test('«Noé y el diluvio»: one story, answered directly', async () => {
    const r: any = await ask('la historia de Noé y el diluvio', 'es')
    expect(r.answered).toBe('passage')
    expect(r.ref).toBe('obs 3')
  })
  test('«historia de Isaac» (OBS 5 and 6 by name): choices (a title with Isaac first, then the other)', async () => {
    const r: any = await ask('historia de Isaac', 'es')
    expect(r.answered).toBe('choose')
    expect(steps(r).map((f: any) => stepTarget(f)).slice(0, 2).sort()).toEqual(['obs 5 text,notes', 'obs 6 text,notes'])
  })
  test('«Abraham e Isaac»: the stories of both names, as choices', async () => {
    const got = await nums('la historia de Abraham e Isaac', 'es')
    console.log('Abraham e Isaac (es-419):', JSON.stringify(got))
    expect(got!.length).toBeGreaterThan(1)
    const r: any = await ask('la historia de Abraham e Isaac', 'es')
    expect(r.answered).toBe('choose')
  })
  test('Moisés in the real Spanish pack: says what it gives', async () => {
    const got = await nums('la historia de Moisés', 'es')
    console.log('historia de Moisés (es-419):', JSON.stringify(got))
    const r: any = await ask('la historia de Moisés', 'es')
    console.log('  answered:', r.answered, r.ref, steps(r).map((f: any) => f.label).slice(0, 5))
    expect(['passage', 'choose']).toContain(r.answered)
    expect(got).toContain(9)
  })
  test('a number and a name: the number decides', async () => {
    for (const q of ['OBS 3 Noé', 'historia 3 de Noé']) {
      const r: any = await ask(q, 'es')
      expect(r.answered, q).toBe('passage')
      expect(r.ref, q).toBe('obs 3')
    }
  })
  test('«¿quién es Jesús?» and «Jesús en Juan 3» are no story choices', async () => {
    for (const q of ['¿quién es Jesús?', 'Jesús en Juan 3']) expect(((await ask(q, 'es')) as any).answered, q).not.toBe('choose')
  })
  test('Jesus in es and ar: choices, OBS 23 first, labels isolated when drawn (RTL)', async () => {
    const es: any = await ask('historia de Jesús', 'es')
    expect(es.answered).toBe('choose')
    expect(steps(es)[0].sheet.ref).toBe('obs 23')
    const ar: any = await ask('قصة يسوع', 'ar')
    expect(ar.answered).toBe('choose')
    const f = steps(ar)
    expect(f[0].sheet.ref).toBe('obs 23')
    // each button has its own sheet id
    expect(new Set(f.filter((x: any) => x.sheet).map((x: any) => x.sheet.id)).size).toBe(f.filter((x: any) => x.sheet).length)
    // main.ts followButton draws every label through bidiLabel: the Latin «OBS 23» run is isolated inside an Arabic label
    const drawn = bidiLabel(f[0].label, 'ar')
    expect(drawn).toContain('⁨')
    expect(drawn.replace(/[⁦-⁩]/g, '')).toBe(f[0].label)
  })
  test('after picking OBS 23 from the choices, «siguiente» goes on as after the row\'s story chip', async () => {
    const viaChoice: ConvState = { last: null }
    const r: any = await ask('historia de Jesús', 'es', viaChoice)
    await press(viaChoice, steps(r)[0], 'es')
    const next1: any = await ask('siguiente', 'es', viaChoice)
    // the row's chip asks the same sheet with nothing before it
    const viaChip: ConvState = { last: null }
    await press(viaChip, { sheet: { id: 'x', intent: 'passage', ref: 'obs 23', what: ['text', 'notes'], version: null, concept: null, term: null, phrase: null, candidates: null, lang: steps(r)[0].sheet.lang } as Sheet }, 'es')
    const next2: any = await ask('siguiente', 'es', viaChip)
    expect([next1.answered, next1.ref]).toEqual([next2.answered, next2.ref])
  })
})
