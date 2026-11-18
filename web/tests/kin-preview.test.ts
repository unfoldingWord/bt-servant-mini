// The family answers against the packs published on the staging preview (common rev 6 with ACAI; encargo-ms-kin.md T5). Slow
// and on the network: skipped unless KIN_PREVIEW=1 (no build runs it). KIN_PREVIEW_DIR=<dir>: packs already fetched there with
// `bun tests/preview-packs.ts <dir>`, else they are fetched into a temporary folder first (about 2 minutes, 22 MB).
//   KIN_PREVIEW=1 KIN_PREVIEW_DIR=<dir> bun test tests/kin-preview.test.ts --timeout 600000
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installPacks, usePacksDir } from './fs-packs'
import { previewPacks } from './preview-packs'
import { turn } from './harness'
import { openLang } from '../src/packs'
import { resetKin } from '../src/kin'
import type { ConvState } from '../src/pipeline'

const ON = process.env.KIN_PREVIEW === '1'
const LANGS = ['es-419', 'en', 'ar', 'hi', 'id']
const ask = (q: string, ui: string) => turn({ last: null } as ConvState, { q, slots: null }, ui)
const labels = (r: { reply: { follow?: { label: string }[] } }) => (r.reply.follow ?? []).map((f) => f.label)

describe.skipIf(!ON)('family answers on the preview packs', () => {
  beforeAll(async () => {
    let dir = process.env.KIN_PREVIEW_DIR ?? ''
    if (!dir || !existsSync(join(dir, 'es-419', 'state.json'))) {
      dir ||= mkdtempSync(join(tmpdir(), 'kin-preview-'))
      await previewPacks(dir, LANGS)
    }
    usePacksDir(dir)
    await installPacks(LANGS)
    resetKin()
  }, 600_000)
  afterAll(async () => {
    usePacksDir()
    await installPacks([])
  })

  test('how long family takes (desktop, first in the file): cold, then warm; written for the hand-over', async () => {
    const r = await openLang('es-419')
    const t0 = performance.now()
    await r.family('per:isaac')
    const cold = performance.now() - t0
    const times: number[] = []
    for (const id of ['per:isaac', 'per:david', 'per:israel', 'per:abraham']) {
      const t = performance.now()
      await r.family(id)
      times.push(performance.now() - t)
    }
    console.log(`family: cold ${cold.toFixed(0)} ms; then ${times.map((t) => t.toFixed(1)).join(', ')} ms (Isaac, David, Jacob, Abraham)`)
    expect(cold).toBeGreaterThan(0)
  })
  test('the hijos de Isaac in es, en, id, hi and ar: Esaú and Jacob/Israel, Genesis 25:26', async () => {
    const cases: [string, string, RegExp][] = [
      ['¿Quiénes fueron los hijos de Isaac?', 'es', /^\*\*Hijos de Isaac:\*\* Esaú y (Jacob|Israel)/],
      ['Who were the sons of Isaac?', 'en', /^\*\*Sons of Isaac:\*\* Esau and (Jacob|Israel)/],
      ['Siapa anak-anak Ishak?', 'id', /^\*\*Anak-anak Ishak:\*\* \S+ dan \S+/],
      ['इसहाक के पुत्र कौन थे?', 'hi', /^\*\*इसहाक के पुत्र:\*\* \S+ और \S+/],
      ['من هم أبناء إسحاق؟', 'ar', /^\*\*أبناء إِسْحَاق:\*\* عِيسُو و/],
    ]
    for (const [q, ui, re] of cases) {
      const r = await ask(q, ui)
      expect(r.answered).toBe('family')
      expect(r.reply.info).toMatch(re)
      expect(r.reply.info).toMatch(/ACAI \(BiblioNexus\)/)
      expect((r.reply.follow ?? []).some((f) => f.sheet?.ref === 'gen 25:26')).toBe(true)
    }
  })
  test('French (no pack): the reply in French, the names from another pack (§8.4)', async () => {
    const r = await ask('Qui étaient les fils d’Isaac ?', 'fr')
    expect(r.answered).toBe('family')
    expect(r.reply.info).toMatch(/^\*\*Fils d’Isaac :?\*\*/)
  })
  test('«hijos de Jacob»: the patriarch, with «¿Otro Jacob?»', async () => {
    const r = await ask('hijos de Jacob', 'es')
    expect(r.concept).toBe('per:israel')
    expect(labels(r)).toContain('¿Otro Jacob?')
  })
  test('the mother and the wife of Isaac (gender from ACAI); his half brothers', async () => {
    expect((await ask('¿Quién fue la madre de Isaac?', 'es')).reply.info).toMatch(/^\*\*Madre de Isaac:\*\* Sara\./)
    expect((await ask('¿Quién fue la esposa de Isaac?', 'es')).reply.info).toMatch(/^\*\*Esposa de Isaac:\*\* Rebeca\./)
    expect((await ask('hermanos de Isaac', 'es')).reply.info).toMatch(/Ismael \(medio hermano\)/)
  })
  test('in Arabic, «والد يهوذا»: Judah, far more named (decision 5), and «يهوذا آخر؟» to the others (the Judases)', async () => {
    const c = { last: null } as ConvState
    const r = await turn(c, { q: 'من هو والد يهوذا؟', slots: null }, 'ar')
    expect(r.answered).toBe('family')
    const other = r.reply.follow!.find((f) => f.label === 'يهوذا آخر؟')
    expect(other).toBeDefined()
    const pick = await turn(c, { q: '', sheet: other!.sheet! }, 'ar')
    expect(pick.answered).toBe('choose')
    expect(labels(pick).length).toBeGreaterThanOrEqual(3)
  })
  test('a name alone (Abel, Nov 18): «Abraham» is his article; minor people by the nearest known person', async () => {
    const ab = await ask('Abraham', 'es')
    expect(ab.answered).toBe('article')
    expect((ab.reply.info ?? '').split('\n')[0]).toMatch(/^## /)
    expect((await ask('Fares', 'es')).reply.info).toMatch(/^\*\*Fares\*\* — hijo de Judá y Tamar/)
    expect((await ask('Salmón', 'es')).reply.info).toMatch(/^\*\*Salmón\*\* — padre de Booz, esposo de Rahab/)
    expect((await ask('Hamul', 'es')).reply.info).toMatch(/^\*\*Hamul\*\* — descendiente de Judá/)
    expect((await ask('hijos de Abraham', 'es')).reply.follow![0]!.sheet?.concept).toBe('tw:names/abraham')
  })
  test('verse and frame → people: Genesis 25:26 and an OBS frame that tells it', async () => {
    const v = await turn({ last: null } as ConvState, { q: '', sheet: { id: 's', intent: 'kin', what: ['here'], ref: 'gen 25:26', version: null, concept: null, term: null, phrase: null, candidates: null, lang: 'en' } }, 'en')
    expect(labels(v)).toEqual(expect.arrayContaining(['Isaac']))
    const core = ((await (await openLang('en')).mapsOf(['xtopics'], { coreOnly: true })) as any).xtopics.core
    const frame = Object.entries(core.obsFrames as Record<string, [number, number][]>).find(([, rs]) => rs.some(([a, z]) => a <= 1025026 && 1025026 <= z))?.[0]
    expect(frame).toBeDefined()
    const f = await turn({ last: null } as ConvState, { q: '', sheet: { id: 's', intent: 'kin', what: ['here'], ref: `obs ${frame}`, version: null, concept: null, term: null, phrase: null, candidates: null, lang: 'en' } }, 'en')
    expect(labels(f)).toEqual(expect.arrayContaining(['Isaac']))
  })

})
