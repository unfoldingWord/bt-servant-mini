// kinShape (kin.ts): the shape of a family question in the six languages of the app, and the phrases that never are one
// (handoff/diseno-parentescos.md §4.1, §7; encargo-ms-kin.md T1). Syntax only: no packs.
import { describe, expect, test } from 'bun:test'
import { kinShape } from '../src/kin'

const shape = (q: string) => {
  const s = kinShape(q)
  return s ? [s.kind, s.name, s.lang] : null
}

describe('family questions in six languages', () => {
  const cases: [string, [string, string, string]][] = [
    // Spanish, with and without "¿quién(es) fue(ron)…?"
    ['¿Quiénes fueron los hijos de Isaac?', ['children', 'Isaac', 'es']],
    ['hijos de Isaac', ['children', 'Isaac', 'es']],
    ['¿Quién fue el padre de Isaac?', ['father', 'Isaac', 'es']],
    ['¿Quién fue la madre de Isaac?', ['mother', 'Isaac', 'es']],
    ['¿Quién era la esposa de Isaac?', ['wife', 'Isaac', 'es']],
    ['la mujer de Isaac', ['wife', 'Isaac', 'es']],
    ['¿Quiénes eran los hermanos de Esaú?', ['siblings', 'Esaú', 'es']],
    ['hermanas de Moisés', ['sisters', 'Moisés', 'es']],
    ['hija de Saúl', ['daughters', 'Saúl', 'es']],
    ['padres de Samuel', ['parents', 'Samuel', 'es']],
    ['¿Quién fue Cetura?', ['who', 'Cetura', 'es']],
    // English
    ['Who were the sons of Isaac?', ['sons', 'Isaac', 'en']],
    ['children of Isaac', ['children', 'Isaac', 'en']],
    ["Isaac's sons", ['sons', 'Isaac', 'en']],
    ['Who was the wife of Isaac?', ['wife', 'Isaac', 'en']],
    ['father of Ruth', ['father', 'Ruth', 'en']],
    ['Who was Keturah?', ['who', 'Keturah', 'en']],
    // French
    ['Qui étaient les fils d’Isaac ?', ['sons', 'Isaac', 'fr']],
    ["la mère d'Isaac", ['mother', 'Isaac', 'fr']],
    ['les frères de Joseph', ['siblings', 'Joseph', 'fr']],
    ['Qui était la femme d’Isaac ?', ['wife', 'Isaac', 'fr']],
    // Indonesian
    ['Siapa anak-anak Ishak?', ['children', 'Ishak', 'id']],
    ['anak Ishak', ['children', 'Ishak', 'id']],
    ['ayah Rut', ['father', 'Rut', 'id']],
    ['istri Ishak', ['wife', 'Ishak', 'id']],
    ['saudara laki-laki Yusuf', ['brothers', 'Yusuf', 'id']],
    ['Siapa Ketura?', ['who', 'Ketura', 'id']],
    // Hindi: the name first
    ['इसहाक के पुत्र', ['sons', 'इसहाक', 'hi']],
    ['इसहाक के पुत्र कौन थे?', ['sons', 'इसहाक', 'hi']],
    ['इसहाक की माता कौन थी?', ['mother', 'इसहाक', 'hi']],
    ['इसहाक की पत्नी', ['wife', 'इसहाक', 'hi']],
    ['इसहाक कौन था?', ['who', 'इसहाक', 'hi']],
    // Arabic: «ال» and a first «و» taken off the name
    ['من هم أبناء إسحاق؟', ['sons', 'إسحاق', 'ar']],
    ['أبناء إسحاق', ['sons', 'إسحاق', 'ar']],
    ['من هي زوجة إسحاق؟', ['wife', 'إسحاق', 'ar']],
    ['أم إسحاق', ['mother', 'إسحاق', 'ar']],
    ['إخوة يوسف', ['siblings', 'يوسف', 'ar']],
    ['من هو إسحاق؟', ['who', 'إسحاق', 'ar']],
  ]
  for (const [q, want] of cases) test(q, () => expect(shape(q)).toEqual(want))

  test('singular words are marked, and ask the same as the plural', () => {
    expect(kinShape('hijo de Isaac')).toMatchObject({ kind: 'sons', one: true })
    expect(kinShape('son of Isaac')).toMatchObject({ kind: 'sons', one: true })
  })
  test('Arabic «أبو X» is marked: a name or a father (kinQuestion decides)', () => {
    expect(kinShape('أبو إسحاق')).toMatchObject({ kind: 'father', name: 'إسحاق', abu: true })
    expect(kinShape('والد إسحاق')?.abu).toBeUndefined()
  })
  test('Arabic: the article and a first «و» of the name', () => {
    expect(kinShape('أبناء الملك')?.name).toBe('ملك')
    expect(kinShape('أبناء وإسحاق')).toMatchObject({ name: 'وإسحاق', alts: ['إسحاق'] })
  })
})

describe('never a family question (§4.1, §7)', () => {
  for (const q of [
    // the peoples
    'hijos de Israel', 'los hijos de Israel', 'children of Israel', 'sons of Israel', "enfants d'Israël", 'les fils d’Israël',
    'anak-anak Israel', 'بني إسرائيل', 'أبناء إسرائيل', 'बनी इस्राएल', 'इस्राएल की सन्तान', 'hijos de Judá', 'sons of Levi',
    // the title of Jesus
    'hijo de David', 'son of David', 'anak Daud', 'ابن داود',
    // the first person, God, man
    'Padre nuestro', 'our father', 'bapa kami', 'hijos de Dios', 'hijo del hombre', 'son of man',
    // not this shape at all
    'Rut 2:3', 'notas de Rut 2', '¿Qué significa gracia?', 'hello',
  ]) test(q, () => expect(kinShape(q)?.kind === 'who' ? null : kinShape(q)).toBeNull())
  test('the brothers of Joseph are asked (only the children, daughters and women of the peoples are not)', () => {
    expect(shape('إخوة يوسف')).toEqual(['siblings', 'يوسف', 'ar'])
    expect(kinShape('daughters of Israel')).toBeNull()
    expect(kinShape('las mujeres de Israel')).toBeNull()
    expect(shape('hijas de Saúl')).toEqual(['daughters', 'Saúl', 'es'])
  })
  test('a sentence after "of" is no name', () => {
    expect(kinShape('the father of the boy who was healed in the temple yesterday')).toBeNull()
  })
})
test('«दाऊद का पुत्र» (singular, the title) is not asked; «anak Ishak» is', () => {
  expect(kinShape('दाऊद का पुत्र')).toBeNull()
  expect(kinShape('anak Ishak')?.kind).toBe('children')
})

describe('review fixes (Nov 18)', () => {
  test('«fils de David», «putra Daud» are the title; «les fils de David» are his sons', () => {
    expect(kinShape('Fils de David')).toBeNull()
    expect(kinShape('le fils de David')).toBeNull()
    expect(kinShape('putra Daud')).toBeNull()
    expect(kinShape('les fils de David')).toMatchObject({ kind: 'sons', name: 'David' })
  })
  test('only "who" asks for a card: "what is Grace", «من يعقوب» (also "from Jacob") do not', () => {
    expect(kinShape('what is Grace')).toBeNull()
    expect(kinShape('من يعقوب')).toBeNull()
    expect(kinShape('من هو يعقوب؟')).toMatchObject({ kind: 'who' })
    expect(kinShape('what are the sons of Isaac')).toMatchObject({ kind: 'sons' })
  })
  test('plural wives ask for the spouses', () => {
    expect(kinShape('esposas de Jacob')?.kind).toBe('partners')
    expect(kinShape('wives of Jacob')?.kind).toBe('partners')
  })
})
