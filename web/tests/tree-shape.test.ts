// The phrases that ask for a family tree (diseno-arboles.md §4.1, piece A): syntax only, six languages. No packs.
import { describe, expect, test } from 'bun:test'
import { kinKnown, kinShape } from '../src/kin'

const shape = (q: string) => {
  const s = kinShape(q)
  return s ? [s.kind, s.name, s.lang] : null
}

describe('tree, up and down phrases in six languages', () => {
  const cases: [string, [string, string, string]][] = [
    ['árbol de Isaac', ['tree', 'Isaac', 'es']],
    ['el árbol genealógico de Isaac', ['tree', 'Isaac', 'es']],
    ['árbol familiar de David', ['tree', 'David', 'es']],
    ['genealogía de David', ['up', 'David', 'es']],
    ['los antepasados de Jesús', ['up', 'Jesús', 'es']],
    ['ancestros de Booz', ['up', 'Booz', 'es']],
    ['ascendientes de Booz', ['up', 'Booz', 'es']],
    ['la ascendencia de David', ['up', 'David', 'es']],
    ['les ascendants de Jacob', ['up', 'Jacob', 'fr']],
    ['linaje de David', ['up', 'David', 'es']],
    ['descendientes de Abraham', ['down', 'Abraham', 'es']],
    ['la descendencia de Abraham', ['down', 'Abraham', 'es']],
    ['family tree of Isaac', ['tree', 'Isaac', 'en']],
    ["Isaac's family tree", ['tree', 'Isaac', 'en']],
    ['tree of Isaac', ['tree', 'Isaac', 'en']],
    ['genealogy of David', ['up', 'David', 'en']],
    ['Who were the ancestors of David?', ['up', 'David', 'en']],
    ['ancestry of Ruth', ['up', 'Ruth', 'en']],
    ['lineage of Judah', ['up', 'Judah', 'en']],
    ['descendants of Abraham', ['down', 'Abraham', 'en']],
    ["Abraham's descendants", ['down', 'Abraham', 'en']],
    ['arbre généalogique de Jacob', ['tree', 'Jacob', 'fr']],
    ['arbre de Jacob', ['tree', 'Jacob', 'fr']],
    ['arbre d’Isaac', ['tree', 'Isaac', 'fr']],
    ['généalogie de David', ['up', 'David', 'fr']],
    ['les ancêtres de Jésus', ['up', 'Jésus', 'fr']],
    ['ascendance de Ruth', ['up', 'Ruth', 'fr']],
    ['descendants d’Abraham', ['down', 'Abraham', 'fr']],
    ['descendance de Jacob', ['down', 'Jacob', 'fr']],
    ['pohon keluarga Ishak', ['tree', 'Ishak', 'id']],
    ['silsilah keluarga Daud', ['tree', 'Daud', 'id']],
    ['silsilah Daud', ['up', 'Daud', 'id']],
    ['leluhur Daud', ['up', 'Daud', 'id']],
    ['nenek moyang Yesus', ['up', 'Yesus', 'id']],
    ['keturunan Abraham', ['down', 'Abraham', 'id']],
    ['इसहाक का वंशवृक्ष', ['tree', 'इसहाक', 'hi']],
    ['इसहाक का परिवार वृक्ष', ['tree', 'इसहाक', 'hi']],
    ['दाऊद की वंशावली', ['up', 'दाऊद', 'hi']],
    ['दाऊद के पूर्वज', ['up', 'दाऊद', 'hi']],
    ['अब्राहम के वंशज', ['down', 'अब्राहम', 'hi']],
    ['شجرة عائلة إسحاق', ['tree', 'إسحاق', 'ar']],
    ['شجرة نسب إسحاق', ['tree', 'إسحاق', 'ar']],
    ['نسب داود', ['up', 'داود', 'ar']],
    ['سلسلة نسب داود', ['up', 'داود', 'ar']],
    ['أسلاف داود', ['up', 'داود', 'ar']],
    ['أجداد داود', ['up', 'داود', 'ar']],
    ['نسل إبراهيم', ['down', 'إبراهيم', 'ar']],
    ['ذرية إبراهيم', ['down', 'إبراهيم', 'ar']],
  ]
  for (const [q, want] of cases) test(q, () => expect(shape(q)).toEqual(want))
})

describe('the peoples have a tree, not children', () => {
  test('«árbol de Israel / Judá / Leví» is the person', () => {
    expect(shape('árbol de Israel')).toEqual(['tree', 'Israel', 'es'])
    expect(shape('árbol de Judá')).toEqual(['tree', 'Judá', 'es'])
    expect(shape('family tree of Levi')).toEqual(['tree', 'Levi', 'en'])
    expect(shape('descendientes de Israel')).toEqual(['down', 'Israel', 'es'])
  })
  test('«hijos de Israel» and the like stay out', () => {
    expect(kinShape('hijos de Israel')).toBeNull()
    expect(kinShape('children of Israel')).toBeNull()
    expect(kinShape('familia de Israel')).toBeNull()
  })
})

describe('what does not change', () => {
  test('family phrases give the same kinds', () => {
    expect(shape('hijos de Isaac')).toEqual(['children', 'Isaac', 'es'])
    expect(shape('familia de Abraham')).toEqual(['family', 'Abraham', 'es'])
    expect(shape('Who was Ruth?')).toEqual(['who', 'Ruth', 'en'])
    expect(shape('¿Quién fue Cetura?')).toEqual(['who', 'Cetura', 'es'])
  })
  test('not a tree: no name, a pronoun, a sentence', () => {
    expect(kinShape('árbol de')).toBeNull()
    expect(kinShape('family tree of us')).toBeNull()
    expect(kinShape('ancestros de nosotros')).toBeNull()
    expect(kinShape('ascendientes de Dios')).toBeNull()
    expect(kinShape('árbol de la vida que da frutos cada mes del año')).toBeNull()
  })
  test('kinKnown has no index yet: false, and never throws on the new kinds', () => {
    expect(kinKnown('árbol de Isaac', 'es')).toBe(false)
  })
})
