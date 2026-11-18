// kinQuestion (kin.ts): who X is (encargo-ms-kin.md T2; diseno-parentescos.md §4.4 with §8.5): the people index from
// `reader.people`, the passage read before the ten-times rule, then a choice. Three sources of data (decision 8): the packs on disk
// (real TIPNR relations and Genesis), a hand-made reader (gender, Spanish names, homonyms), the signed ACAI sample.
import { afterAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fullPhone } from './harness'
import { installPacks, usePacksDir } from './fs-packs'
import { kinFixture } from './fixtures/kin/family'
import { kinKnown, kinQuestion, peopleAt, setKinReader, storiesOf, warmKin } from '../src/kin'
import { openLang, setTrustedKeys } from '../src/packs'

describe('with the packs on disk', () => {
  test('Isaac is per:isaac, in the language asked', async () => {
    await fullPhone()
    expect(await kinQuestion('¿Quiénes fueron los hijos de Isaac?', 'es', null)).toMatchObject({ kind: 'children', ids: ['per:isaac'], pick: 'one', pack: 'es-419', ui: 'es' })
    expect(await kinQuestion('इसहाक के पुत्र', 'en', null)).toMatchObject({ kind: 'sons', ids: ['per:isaac'], pack: 'hi', ui: 'hi' })
  })
  test('a family word with no person after it goes on as today', async () => {
    await fullPhone()
    expect(await kinQuestion('hijos de Dios', 'es', null)).toBeNull()
    expect(await kinQuestion('padre de la mentira', 'es', null)).toBeNull()
    expect(await kinQuestion('mujer de Samaria', 'es', null)).toBeNull()
  })
  test('"who was X?" with an article is left to the article (the family goes under it)', async () => {
    await fullPhone()
    expect(await kinQuestion('¿Quién fue Isaac?', 'es', null)).toBeNull()
  })
  test('code reads it alone once the index is built', async () => {
    await fullPhone()
    await kinQuestion('hijos de Isaac', 'es', null)
    expect(kinKnown('¿Quiénes fueron los hijos de Isaac?', 'es')).toBe(true)
    expect(kinKnown('hijos de Dios', 'es')).toBe(false)
    expect(kinKnown('¿Quién fue Isaac?', 'es')).toBe(false)
  })
  test('the people of Genesis 25:26 (verse → people)', async () => {
    await fullPhone()
    const at = await peopleAt('en', 'gen 25:26')
    expect(at).toEqual(expect.arrayContaining(['per:isaac', 'per:esau']))
  })
})

describe('with the hand-made reader', () => {
  afterAll(() => setKinReader())
  test('«Jacob»: the patriarch (per:israel) by the ten-times rule; per:jacob offered after him', async () => {
    await fullPhone()
    setKinReader(async () => kinFixture())
    expect(await kinQuestion('hijos de Jacob', 'es', null)).toMatchObject({ ids: ['per:israel', 'per:jacob'], pick: 'dominant' })
  })
  test('two Judases named as often: ask which, unless the passage read is one of theirs', async () => {
    await fullPhone()
    setKinReader(async () => kinFixture())
    expect(await kinQuestion('padre de Judas', 'es', null)).toMatchObject({ pick: 'choose' })
    expect((await kinQuestion('padre de Judas', 'es', null))!.ids.sort()).toEqual(['per:judas-iscariot', 'per:judas-son-of-james'])
    expect(await kinQuestion('padre de Judas', 'es', 'luk 6:16')).toMatchObject({ pick: 'context', ids: ['per:judas-son-of-james', 'per:judas-iscariot'] })
    expect(await kinQuestion('padre de Judas', 'es', 'mat 10')).toMatchObject({ pick: 'context', ids: ['per:judas-iscariot', 'per:judas-son-of-james'] })
  })
  test('the passage read beats the ten-times rule: Matthew 1 is the Jacob of Matthew 1:16', async () => {
    await fullPhone()
    setKinReader(async () => kinFixture())
    expect(await kinQuestion('hijos de Jacob', 'es', 'mat 1:16')).toMatchObject({ ids: ['per:jacob', 'per:israel'], pick: 'context' })
  })
  test('a person without a tW article: "who was X?" is a family question', async () => {
    await fullPhone()
    setKinReader(async () => kinFixture())
    expect(await kinQuestion('¿Quién fue Cetura?', 'es', null)).toMatchObject({ kind: 'who', ids: ['per:keturah'] })
  })
  test('frame → people, person → stories (the links of OBS)', async () => {
    await fullPhone()
    setKinReader(async () => kinFixture())
    expect(await peopleAt('es-419', 'obs 5:9')).toEqual(expect.arrayContaining(['per:isaac', 'per:esau', 'per:israel']))
    expect(await storiesOf('es-419', 'per:isaac')).toEqual([5])
    expect(await storiesOf('es-419', 'per:esau')).toEqual([])
  })
  test('the index is built at idle and kinKnown then says yes', async () => {
    await fullPhone()
    setKinReader(async () => kinFixture())
    warmKin(['es-419'])
    await new Promise((r) => setTimeout(r, 2000))
    expect(kinKnown('hijos de Cetura', 'es')).toBe(true)
  })
})

describe('the signed ACAI sample, through the app’s own reader', () => {
  afterAll(async () => {
    usePacksDir()
    setTrustedKeys()
    await installPacks([])
  })
  test('openLang reads family and people of a signed pack with ACAI', async () => {
    const dir = join(import.meta.dir, 'fixtures', 'kin')
    const k = JSON.parse(readFileSync(join(dir, 'key.json'), 'utf8'))
    setTrustedKeys({ [k.keyId]: Uint8Array.from(k.publicKey.match(/../g), (p: string) => parseInt(p, 16)) })
    usePacksDir(dir)
    await installPacks(['es-419'])
    const r = await openLang('es-419')
    const f = (await r.family('per:isaac')).data!
    expect(f.parents.map((p) => [p.name, p.gender])).toEqual([['Abraham', 1], ['Sara', 2]])
    expect(f.sources).toContain('BibleAquifer/ACAI')
    expect((await r.people()).data!.some((p) => p.id === 'per:sarah')).toBe(true)
  })
})
