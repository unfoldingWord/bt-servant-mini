// The family answer (encargo-ms-kin.md T3; diseno-parentescos.md §4.3, §4.5, §4.6 with §8): a question as the app runs it
// (harness turn: reading, routes, graph), answered by code with no model.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { fullPhone, turn } from './harness'
import { kinFixture } from './fixtures/kin/family'
import { setKinReader } from '../src/kin'
import { codeReads, type ConvState } from '../src/pipeline'

const ask = async (q: string, ui = 'es', c: ConvState = { last: null }) => turn(c, { q, slots: null }, ui)
const labels = (r: { reply: { follow?: { label: string }[] } }) => (r.reply.follow ?? []).map((f) => f.label)
const tap = async (c: ConvState, r: Awaited<ReturnType<typeof ask>>, label: RegExp, ui = 'es') => {
  const f = (r.reply.follow ?? []).find((x) => label.test(x.label))
  if (!f?.sheet) throw new Error(`no button ${label} in ${labels(r).join(' | ')}`)
  return turn(c, { q: '', sheet: f.sheet }, ui)
}

describe('with the packs on disk (TIPNR relations, Genesis)', () => {
  beforeAll(fullPhone)
  test('¿Quiénes fueron los hijos de Isaac?: Esau and his brother, Genesis 25:26 as a button, the credit line', async () => {
    const r = await ask('¿Quiénes fueron los hijos de Isaac?')
    expect(r.route).toBe('kin')
    expect(r.answered).toBe('family')
    expect(r.concept).toBe('per:isaac')
    expect(r.reply.info).toMatch(/^\*\*Hijos de Isaac:\*\* Esau y /)
    expect(r.reply.info).toMatch(/Datos de familia: TIPNR \(STEPBible\)/)
    expect(labels(r)).toContain('Génesis 25:26')
    expect(r.reply.meta).toMatch(/read by code/)
  })
  test('the same in English, Indonesian, Hindi and Arabic (the words of the reply in the question’s language)', async () => {
    expect((await ask('Who were the sons of Isaac?', 'en')).reply.info).toMatch(/^\*\*Sons of Isaac:\*\* Esau and /)
    expect((await ask('Siapa anak-anak Ishak?', 'en')).reply.info).toMatch(/^\*\*Anak-anak Ishak:\*\* Esau dan /)
    expect((await ask('इसहाक के पुत्र कौन थे?', 'en')).reply.info).toMatch(/^\*\*इसहाक के पुत्र:\*\* Esau और /)
    expect((await ask('من هم أبناء إسحاق؟', 'en')).reply.info).toMatch(/^\*\*أبناء إسحاق:\*\* Esau و/)
  })
  test('Isaac’s brothers: the seven half brothers (Abraham with Hagar and Keturah)', async () => {
    const r = await ask('hermanos de Isaac')
    expect(r.reply.info!.match(/medio hermano/g)?.length).toBe(7)
  })
  test('code reads it alone (no model) once the index is built', async () => {
    await ask('hijos de Isaac')
    expect(codeReads('¿Quiénes fueron los hijos de Isaac?', { last: null })).toBe(true)
  })
  test('a person’s button opens the card; the card’s relatives are buttons again; the graph names the points', async () => {
    const c: ConvState = { last: null }
    const r = await ask('hijos de Isaac', 'es', c)
    const card = await tap(c, r, /^Esau$/)
    expect(card.answered).toBe('family')
    expect(card.reply.info).toMatch(/^\*\*Esau\*\*/)
    expect(card.reply.info).toMatch(/\*\*Padres:\*\* .*Isaac/)
    expect(labels(card)).toContain('Isaac')
    const g = c.graph!
    const pts = g.nodes.map((n) => n.label)
    expect(pts).toEqual(expect.arrayContaining(['Hijos de Isaac', 'Esau']))
    expect(g.nodes.find((n) => n.label === 'Esau')!.edge).toBe('deeper')
  })
  test('never a family answer: the peoples, God, the title of Jesus, a place', async () => {
    for (const q of ['¿Quiénes fueron los hijos de Israel?', 'hijos de Dios', 'hijo de David', 'mujer de Samaria', 'padre de la mentira'])
      expect((await ask(q)).route).not.toBe('kin')
  })
  test('«¿Quiénes fueron los hijos de Isaac?» no longer searches the verses (kinship.test.ts asked that of the search)', async () => {
    expect((await ask('¿Quiénes fueron los hijos de Isaac?')).answered).not.toBe('search')
  })
})

describe('with the hand-made reader (gender, Spanish names, homonyms)', () => {
  beforeAll(async () => {
    await fullPhone()
    setKinReader(async () => kinFixture())
  })
  afterAll(() => setKinReader())
  test('mother, father, wife (gender from ACAI)', async () => {
    expect((await ask('¿Quién fue la madre de Isaac?')).reply.info).toMatch(/^\*\*Madre de Isaac:\*\* Sara\./)
    expect((await ask('¿Quién fue el padre de Isaac?')).reply.info).toMatch(/^\*\*Padre de Isaac:\*\* Abraham\./)
    expect((await ask('¿Quién fue la esposa de Isaac?')).reply.info).toMatch(/^\*\*Esposa de Isaac:\*\* Rebeca\./)
  })
  test('half brothers only when the data proves it: Isaac’s (Ismael, Zimrán) are; Esaú’s brother is not', async () => {
    expect((await ask('hermanos de Isaac')).reply.info).toMatch(/Ismael \(medio hermano\) y Zimrán \(medio hermano\)/)
    const esau = (await ask('hermanos de Esaú')).reply.info!
    expect(esau).toMatch(/^\*\*Hermanos de Esaú:\*\* Jacob\./)
    expect(esau).not.toMatch(/medio/)
  })
  test('«Jacob»: the patriarch, named as written with his name, and «¿Otro Jacob?» to the one of Matthew 1:16', async () => {
    const c: ConvState = { last: null }
    const r = await ask('hijos de Jacob', 'es', c)
    expect(r.concept).toBe('per:israel')
    expect(labels(r)).toContain('¿Otro Jacob?')
    const other = await tap(c, r, /Otro Jacob/)
    expect(other.answered).toBe('choose')
    expect(labels(other)).toEqual(['Jacob — padre de José'])
  })
  test('two Judases named as often: buttons with their notes', async () => {
    const r = await ask('padre de Judas')
    expect(r.answered).toBe('choose')
    expect(r.reply.intro).toBe('Hay varias personas llamadas Judas. ¿Cuál?')
    expect(labels(r).sort()).toEqual(['Judas Iscariote — uno de los doce', 'Judas — hijo de Jacobo'])
  })
  test('a person with no children in the data: never "had no children"', async () => {
    const r = await ask('hijos de Shuah')
    expect(r.reply.info).toMatch(/^Hijos de Shuah: los datos que tengo no nombran a nadie\./)
    expect(labels(r)).toContain('Shuah')
  })
  test('¿Quién fue Cetura? (no tW article): her card', async () => {
    const r = await ask('¿Quién fue Cetura?')
    expect(r.route).toBe('kin')
    expect(r.reply.info).toMatch(/^\*\*Cetura\*\*/)
    expect(r.reply.info).toMatch(/Datos de familia: TIPNR \(STEPBible\), ACAI \(BiblioNexus\)/)
  })
  test('without the parts: the same people, no verse buttons', async () => {
    setKinReader(async () => kinFixture({ parts: false }))
    const r = await ask('hijos de Isaac')
    expect(r.reply.info).toMatch(/^\*\*Hijos de Isaac:\*\* Esaú y Jacob\./)
    expect(labels(r).some((l) => /Génesis/.test(l))).toBe(false)
    setKinReader(async () => kinFixture())
  })
})
