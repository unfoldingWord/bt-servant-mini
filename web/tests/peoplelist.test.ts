// The people list and search of Browse (peoplelist.ts; plan-explorar-personas-lugares.md §3 "Lista y búsqueda"). No page: the lists
// come from hand-made readers (setKinReader), the hand-made family fixture, and, when they are on this machine, the real packs.
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PersonEntry } from '@bt-synergy/language-pack-client'
import { kinFixture } from './fixtures/kin/family'
import { peoplePacks, setKinReader, warmKin, type KinReader } from '../src/kin'
import { findPeople, LIST_MAX, peopleList, rawName, tieLine } from '../src/peoplelist'

type P = Partial<PersonEntry> & { id: string; name: string }
const entry = (p: P): PersonEntry => ({ names: [p.name], verses: 1, ...p }) as PersonEntry
/** A reader that only knows its people (what the list reads). */
const reader = (people: P[] | null): KinReader => ({ people: async () => ({ data: people ? people.map(entry) : null }) }) as unknown as KinReader
const use = (by: Record<string, P[] | null>) => setKinReader(async (l) => reader(by[l] ?? null))
const names = async (packs: string[], q: string) => (await findPeople(packs, q)).rows.map((r) => r.name)

afterAll(() => setKinReader())
beforeEach(() => setKinReader())

describe('the list of a pack', () => {
  test('raw names are not in it ("Unnamed#9", a name with "_"), the most named first, ties by id', async () => {
    use({ en: [
      { id: 'per:b', name: 'Bela', verses: 5 }, { id: 'per:a', name: 'Abel', verses: 5 }, { id: 'per:c', name: 'Caleb', verses: 90 },
      { id: 'per:u9', name: 'Unnamed#9', verses: 400 }, { id: 'per:u1', name: 'Unnamed_person_1', verses: 300 }, { id: 'per:x', name: 'Seth_2', verses: 200 },
    ] })
    expect((await peopleList('en')).map((e) => e.id)).toEqual(['per:c', 'per:a', 'per:b'])
    expect(rawName('Unnamed#9')).toBe(true)
    expect(rawName('Abraham')).toBe(false)
  })

  test('a person whose own name is real keeps it when another name is raw; a pack without people has an empty list', async () => {
    use({ en: [{ id: 'per:j', name: 'Jacob', names: ['Jacob', 'Unnamed#4', 'Israel'], verses: 3 }], es: null })
    const l = await peopleList('en')
    expect(l[0]!.folded).toEqual(['jacob', 'israel'])
    expect(await peopleList('es')).toEqual([])
  })

  test('as the tree decides: only «Unnamed#…» or an underscore is raw; a raw own name takes the first real alias as its name, with none the person is out', async () => {
    use({ en: [
      { id: 'per:w', name: 'a_wife_of_Lot', names: ['a_wife_of_Lot', 'Edith'], verses: 2 },
      { id: 'per:n', name: 'Unnamed#3', names: ['Unnamed#3'], verses: 9 },
      { id: 'per:g', name: 'Unnamed', verses: 1 }, // not raw: only «Unnamed#» is
      { id: 'per:h', name: 'C#', verses: 1 },
    ] })
    const l = await peopleList('en')
    expect(l.map((e) => [e.id, e.name])).toEqual([['per:w', 'Edith'], ['per:g', 'Unnamed'], ['per:h', 'C#']])
    expect(await names(['en'], 'edi')).toEqual(['Edith'])
    expect(rawName('Unnamed')).toBe(false)
    expect(rawName('C#')).toBe(false)
  })

  test('it is made once per index, and again when kin.ts forgets the index (a change of packs)', async () => {
    use({ en: [{ id: 'per:a', name: 'Abel' }] })
    const a = await peopleList('en')
    expect(await peopleList('en')).toBe(a)
    use({ en: [{ id: 'per:a', name: 'Abel' }, { id: 'per:b', name: 'Bela' }] })
    expect((await peopleList('en')).length).toBe(2)
  })
})

describe('without a search', () => {
  const many: P[] = Array.from({ length: 80 }, (_, i) => ({ id: `per:p${String(i).padStart(2, '0')}`, name: `Name${i}`, verses: i + 1 }))

  test('the 30 most named of the first pack, and more is said; never the whole list', async () => {
    use({ en: many })
    const f = await findPeople(['en'], '')
    expect(LIST_MAX).toBe(30)
    expect(f.rows.length).toBe(30)
    expect(f.more).toBe(true)
    expect(f.rows[0]!.name).toBe('Name79')
    expect(f.rows[29]!.name).toBe('Name50')
    expect(f.rows.every((r) => r.pack === 'en' && !r.inLang)).toBe(true)
  })

  test('the first pack that has people (a pack without them is passed over); a short list says nothing more', async () => {
    use({ es: null, en: many.slice(0, 3) })
    const f = await findPeople(['es', 'en'], '')
    expect(f.rows.map((r) => r.pack)).toEqual(['en', 'en', 'en'])
    expect(f.more).toBe(false)
    expect((await findPeople([], '')).rows).toEqual([])
  })
})

describe('the search', () => {
  test('by the start of a name, folded: case and marks do not matter, the other names of a person count', async () => {
    use({ es: [
      { id: 'per:esau', name: 'Esaú', names: ['Esaú', 'Edom'], verses: 9 }, { id: 'per:esdras', name: 'Esdras', verses: 20 }, { id: 'per:jose', name: 'José', verses: 50 },
    ] })
    expect(await names(['es'], 'esa')).toEqual(['Esaú'])
    expect(await names(['es'], 'ESAU')).toEqual(['Esaú'])
    expect(await names(['es'], 'jose')).toEqual(['José'])
    expect(await names(['es'], 'josé')).toEqual(['José'])
    expect(await names(['es'], 'es')).toEqual(['Esdras', 'Esaú']) // the most named first
    expect(await names(['es'], 'edom')).toEqual(['Esaú']) // shown by its own name
    expect(await names(['es'], 'saú')).toEqual([]) // the start, not the middle
    expect(await names(['es'], 'zzz')).toEqual([])
  })

  test('up to 30 rows, and more is said', async () => {
    use({ en: Array.from({ length: 45 }, (_, i) => ({ id: `per:m${i}`, name: `Mar${i}`, verses: i })) })
    const f = await findPeople(['en'], 'mar')
    expect(f.rows.length).toBe(30)
    expect(f.more).toBe(true)
    expect((await findPeople(['en'], 'mar4')).more).toBe(false)
  })

  test('packs are joined by id: a person is shown in the first pack that has it, in the others only who it lacks, with the language said', async () => {
    use({
      'es-419': [{ id: 'per:abraham', name: 'Abrahán', verses: 200 }, { id: 'per:isaac', name: 'Isaac', verses: 100 }],
      en: [{ id: 'per:abraham', name: 'Abraham', verses: 200 }, { id: 'per:abner', name: 'Abner', verses: 60 }, { id: 'per:isaac', name: 'Isaac', verses: 100 }],
    })
    const f = await findPeople(['es-419', 'en'], 'ab')
    expect(f.rows.map((r) => [r.name, r.pack, r.inLang])).toEqual([['Abrahán', 'es-419', undefined], ['Abner', 'en', 'en']])
    // a name only the second pack writes that way finds the same person once
    expect((await findPeople(['es-419', 'en'], 'abraham')).rows.map((r) => r.name)).toEqual(['Abraham']) // «Abrahán» does not begin with it: the English row is the one that has it
    expect((await findPeople(['es-419', 'en'], 'isa')).rows.map((r) => [r.name, r.inLang])).toEqual([['Isaac', undefined]])
  })

  test('a language whose ids do not match is not joined: both rows are there, the second with its language', async () => {
    use({ en: [{ id: 'per:john1', name: 'John' }], fr: [{ id: 'fr:jean', name: 'Jean' }] })
    const f = await findPeople(['en', 'fr'], 'j')
    expect(f.rows.map((r) => [r.name, r.inLang])).toEqual([['John', undefined], ['Jean', 'fr']])
  })

  test('only the packs given are searched (the ones with an index built)', async () => {
    use({ en: [{ id: 'per:a', name: 'Abel' }], es: [{ id: 'per:b', name: 'Abdías' }] })
    expect(await names(['en'], 'ab')).toEqual(['Abel'])
  })
})

describe('the same name twice', () => {
  test('the rows with a name another row has are marked, the others are not; their line says who they are', async () => {
    use({ es: [{ id: 'per:j1', name: 'Judas', verses: 3 }, { id: 'per:j2', name: 'Judas', verses: 9 }, { id: 'per:t', name: 'Timoteo', verses: 20 }] })
    const rows = (await findPeople(['es'], '')).rows
    expect(rows.map((r) => [r.name, r.dup])).toEqual([['Timoteo', false], ['Judas', true], ['Judas', true]])
  })

  test('with the family data: the line of each person (ties, else the verses)', async () => {
    setKinReader(async () => kinFixture())
    const f = await findPeople(['en'], 'judas')
    expect(f.rows.map((r) => r.id).sort()).toEqual(['per:judas-iscariot', 'per:judas-son-of-james'])
    for (const r of f.rows) {
      const line = await tieLine('es', r)
      expect(line.length).toBeGreaterThan(0)
    }
    // Isaac has ties: «hijo de Abraham y Sara…»
    const isaac = (await findPeople(['en'], 'isaac')).rows[0]!
    expect(await tieLine('es', isaac)).toMatch(/^(hijo|padre) de /)
    // a person the data has no relation for: the verses
    const line = await tieLine('en', { pack: 'en', id: 'per:nobody', verses: 4 })
    expect(line).toMatch(/4/)
  })
})

describe('the six languages (small indexes: folding and joining only)', () => {
  test('French: marks and case ("Élie", "Jérémie")', async () => {
    use({ fr: [{ id: 'per:elijah', name: 'Élie', verses: 70 }, { id: 'per:jer', name: 'Jérémie', verses: 130 }] })
    expect(await names(['fr'], 'elie')).toEqual(['Élie'])
    expect(await names(['fr'], 'ÉLI')).toEqual(['Élie'])
    expect(await names(['fr'], 'jere')).toEqual(['Jérémie'])
  })
  test('Indonesian: plain', async () => {
    use({ id: [{ id: 'per:john', name: 'Yohanes', verses: 130 }, { id: 'per:jacob', name: 'Yakub', verses: 300 }] })
    expect(await names(['id'], 'yo')).toEqual(['Yohanes'])
    expect(await names(['id'], 'Y')).toEqual(['Yakub', 'Yohanes'])
  })
  test('Hindi: the marks of the script are kept (they are letters), case does not apply', async () => {
    use({ hi: [{ id: 'per:abraham', name: 'अब्राहम', verses: 200 }, { id: 'per:isaac', name: 'इसहाक', verses: 100 }] })
    expect(await names(['hi'], 'अब्र')).toEqual(['अब्राहम'])
    expect(await names(['hi'], 'इस')).toEqual(['इसहाक'])
    expect(await names(['hi'], 'अब्रा')).toEqual(['अब्राहम'])
    expect(await names(['hi'], 'इसा')).toEqual([]) // a different letter: not folded together
  })
  test('Arabic: with or without tashkeel, alef forms and the article', async () => {
    use({ ar: [{ id: 'per:abraham', name: 'إِبْرَاهِيم', verses: 200 }, { id: 'per:elijah', name: 'إِلْيَاس', verses: 70 }, { id: 'per:jon', name: 'يُونَان', verses: 20 }] })
    expect(await names(['ar'], 'ابراهيم')).toEqual(['إِبْرَاهِيم'])
    expect(await names(['ar'], 'إبراهيم')).toEqual(['إِبْرَاهِيم'])
    expect(await names(['ar'], 'الياس')).toEqual(['إِلْيَاس'])
    expect(await names(['ar'], 'يونان')).toEqual(['يُونَان'])
    // no transliteration: Latin letters do not find an Arabic name
    expect(await names(['ar'], 'abraham')).toEqual([])
  })
  test('English and Spanish joined by id with Arabic names left out: no transliteration, the Arabic one is not found by «Abraham»', async () => {
    use({ en: [{ id: 'per:abraham', name: 'Abraham', verses: 200 }], ar: [{ id: 'per:abraham', name: 'إبراهيم', verses: 200 }] })
    expect((await findPeople(['en', 'ar'], 'ابر')).rows.map((r) => [r.name, r.inLang])).toEqual([['إبراهيم', 'ar']])
    expect((await findPeople(['ar', 'en'], 'abr')).rows.map((r) => [r.name, r.inLang])).toEqual([['Abraham', 'en']])
  })
})

// the real packs of the APK build, when they are here (en, es-419): the search for real, and what building the list costs
const REAL = resolve(import.meta.dir, '../../../apk-packs-r7')
describe.skipIf(!existsSync(REAL))('the real packs (apk-packs-r7)', () => {
  test('Abraham and Abrahán in en and es-419; the time the lists take to build', async () => {
    const { installPacks, usePacksDir } = await import('./fs-packs')
    usePacksDir(REAL)
    try {
      await installPacks(['en', 'es-419'])
      setKinReader()
      const packs = ['es-419', 'en']
      warmKin(packs)
      for (let t = 0; t < 20000 && peoplePacks(packs).length < 2; t += 100) await new Promise((r) => setTimeout(r, 100))
      expect(peoplePacks(packs)).toEqual(['es-419', 'en'])
      const t0 = performance.now()
      const nEn = (await peopleList('en')).length
      const nEs = (await peopleList('es-419')).length
      const ms = performance.now() - t0
      console.log(`peoplelist: en ${nEn} people, es-419 ${nEs} people; both lists built in ${ms.toFixed(0)} ms (index already built)`)
      expect(nEn).toBeGreaterThan(500)
      const en = (await findPeople(['en'], 'abraham')).rows
      expect(en[0]!.id).toBe('per:abraham')
      const es = (await findPeople(['es-419', 'en'], 'abra')).rows
      expect(es.some((r) => r.id === 'per:abraham' && r.pack === 'es-419')).toBe(true)
      const top = (await findPeople(['es-419', 'en'], '')).rows
      expect(top.length).toBe(30)
      console.log(`top of es-419: ${top.slice(0, 8).map((r) => r.name).join(', ')}`)
      // Abraham, Isaac and Jacob come out of one search each, and the tie line of Isaac names his father
      const isaac = (await findPeople(['en'], 'isaac')).rows[0]!
      expect(await tieLine('en', isaac)).toMatch(/Abraham/)
    } finally {
      usePacksDir()
    }
  })
})
