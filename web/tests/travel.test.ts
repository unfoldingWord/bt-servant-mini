// Place, distance and travel-time sentences of answer.ts (encargo-ms-mapas.md T2; diseno-mapas.md 5.3 and 5.8): vectors of 5.8, the rounding,
// certainty, the eight directions in six languages. Trips come from the client's own `trip()` unless a test needs an exact km.
import { describe, expect, test } from 'bun:test'
import { trip, type PlaceRef, type Trip } from '@lpc/query/geo'
import { bornLine, daysLine, diedLine, distanceLine, refDaysLine, unknownPlaceLine, whereLine } from '../src/answer'

const LANGS = ['en', 'es', 'fr', 'id', 'hi', 'ar'] as const
const place = (id: string, name: string, lat: number | undefined, lon: number | undefined, over: Partial<PlaceRef> = {}): PlaceRef =>
  ({ id, name, lat, lon, sure: 3, form: 1, ...over })
const jerusalem = place('lug:jerusalem', 'Jerusalén', 31.78, 35.22)
const damascus = place('lug:damascus', 'Damasco', 33.51, 36.29)
const bethlehem = place('lug:bethlehem', 'Belén', 31.7, 35.2)
const bethel = place('lug:bethel', 'Betel', 31.915, 35.22)
const t = (a: PlaceRef, b: PlaceRef): Trip => trip(a, b)!
const fake = (km: number, over: Partial<Trip> = {}): Trip => ({ km, direction: 'N', bearing: 0, sure: 3, near: km < 3, ...over })
const clean = (s: string) => {
  expect(s.length).toBeGreaterThan(0)
  expect(s).not.toMatch(/[{}]/)
  expect(s).not.toContain('undefined')
}

describe('where', () => {
  test('Bethel is about 15 km north of Jerusalem (es), as the design has it', () => {
    expect(whereLine('es', bethel, jerusalem, t(bethel, jerusalem))).toBe('Betel estaba a unos 15 km al norte de Jerusalén.')
    expect(whereLine('en', bethel, jerusalem, t(bethel, jerusalem))).toBe('Betel was about 15 km north of Jerusalén.')
  })
  test('rounding: under 10 km to the km, up to 100 to 5, more to 10', () => {
    const f = (km: number) => whereLine('es', bethel, jerusalem, fake(km))
    expect(f(4.4)).toContain('unos 4 km')
    expect(f(9.6)).toContain('unos 10 km')
    expect(f(12.4)).toContain('unos 10 km')
    expect(f(12.6)).toContain('unos 15 km')
    expect(f(97)).toContain('unos 95 km')
    expect(f(100)).toContain('unos 100 km')
    expect(f(127)).toContain('unos 130 km')
    expect(f(217)).toContain('unos 220 km')
  })
  test('the direction names where the place is: the opposite of the bearing from it to the reference', () => {
    // fake() says "a to b is north", so a is south of b
    expect(whereLine('es', bethel, jerusalem, fake(40, { direction: 'N' }))).toContain('al sur de Jerusalén')
    expect(whereLine('es', bethel, jerusalem, fake(40, { direction: 'SW' }))).toContain('al noreste de Jerusalén')
  })
  test('under 3 km: next to', () => {
    const near = place('lug:x', 'Betania', 31.775, 35.225)
    expect(whereLine('es', near, jerusalem, t(near, jerusalem))).toBe('Betania estaba junto a Jerusalén.')
  })
  test('proposed location (certainty 2) says so first', () => {
    const cap = place('lug:cap', 'Cafarnaúm', 32.88, 35.57, { sure: 2 })
    const s = whereLine('es', cap, jerusalem, t(cap, jerusalem))
    expect(s.startsWith('Según la ubicación propuesta, Cafarnaúm estaba a unos ')).toBe(true)
    expect(s).toContain('al norte de Jerusalén')
  })
  test('certainty 1: no distance, the places are proposals', () => {
    const emmaus = place('lug:emmaus', 'Emaús', 31.8, 35.1, { sure: 1 })
    expect(whereLine('es', emmaus, jerusalem, t(emmaus, jerusalem))).toBe('No se sabe con certeza dónde estaba Emaús; se han propuesto varios sitios cerca de Jerusalén.')
    expect(whereLine('es', emmaus, null, undefined)).not.toMatch(/km|cerca de/)
  })
  test('certainty 0 and an unlocated place', () => {
    const lost = place('lug:lost', 'Tarsis', undefined, undefined, { sure: 0 })
    expect(whereLine('es', lost, jerusalem, undefined)).toBe('No se sabe dónde estaba Tarsis.')
    expect(unknownPlaceLine('es', lost)).toBe('No se sabe dónde estaba Tarsis.')
  })
  test('a region and a water have no km; the water says where it is', () => {
    const judah = place('lug:judah', 'Judá', 31.6, 35, { form: 2 })
    const jordan = place('lug:jordan', 'el Jordán', 32, 35.5, { form: 3 })
    expect(whereLine('es', judah, jerusalem, undefined)).toBe('Judá es una región; no tiene un punto exacto en el mapa.')
    expect(whereLine('es', jordan, place('lug:jericho', 'Jericó', 31.87, 35.44), undefined)).toBe('el Jordán, cerca de Jericó.')
    expect(whereLine('es', jordan, jerusalem, t(jordan, jerusalem))).not.toMatch(/km/)
  })
  test('a point with no trip or reference is still said', () => {
    expect(whereLine('es', bethel, null, undefined)).toBe('Betel aparece en el mapa.')
  })
})

describe('distance', () => {
  test('Bethlehem to Jerusalem: about 9 km, Bethlehem is south', () => {
    expect(distanceLine('es', bethlehem, jerusalem, t(bethlehem, jerusalem))).toBe('Unos 9 km en línea recta; Belén está al sur de Jerusalén.')
    expect(distanceLine('en', bethlehem, jerusalem, t(bethlehem, jerusalem))).toBe('About 9 km in a straight line; Belén is south of Jerusalén.')
  })
  test('Jerusalem to Damascus is about 220 km (the vector of 5.8: 217 km)', () => {
    const tr = t(jerusalem, damascus)
    expect(Math.round(tr.km)).toBe(217)
    expect(distanceLine('es', jerusalem, damascus, tr)).toBe('Unos 220 km en línea recta; Jerusalén está al suroeste de Damasco.')
  })
  test('certainty 2 with the proposal first; below 3 km, next to', () => {
    const cap = place('lug:cap', 'Cafarnaúm', 32.88, 35.57, { sure: 2 })
    expect(distanceLine('es', cap, jerusalem, t(cap, jerusalem)).startsWith('Según la ubicación propuesta, unos ')).toBe(true)
    const near = place('lug:x', 'Betania', 31.775, 35.225)
    expect(distanceLine('es', near, jerusalem, t(near, jerusalem))).toBe('Betania estaba junto a Jerusalén (a menos de 3 km).')
  })
  test('a region or a water has no point to measure; an uncertain place gives no number', () => {
    const judah = place('lug:judah', 'Judá', 31.6, 35, { form: 2 })
    const jordan = place('lug:jordan', 'el Jordán', 32, 35.5, { form: 3 })
    expect(distanceLine('es', judah, jerusalem, undefined)).toBe('Judá es una región; no tiene un punto para medir.')
    expect(distanceLine('es', jerusalem, jordan, undefined)).toContain('el Jordán es un río u otra agua; no tiene un punto para medir.')
    const emmaus = place('lug:emmaus', 'Emaús', 31.8, 35.1, { sure: 1 })
    const s = distanceLine('es', jerusalem, emmaus, t(jerusalem, emmaus))
    expect(s).toContain('Emaús')
    expect(s).not.toMatch(/\d/)
    expect(distanceLine('es', jerusalem, place('lug:l', 'Tarsis', undefined, undefined, { sure: 0 }), undefined)).toBe('No se sabe dónde estaba Tarsis.')
  })
})

describe('days', () => {
  test('Jerusalem to Damascus: 8 to 11 days on foot, 4 to 6 on horseback', () => {
    expect(daysLine('es', t(jerusalem, damascus))).toBe('A pie, en burro o en camello: unos 8 a 11 días; a caballo: unos 4 a 6 días (aprox.).')
    expect(daysLine('en', t(jerusalem, damascus))).toBe('On foot, by donkey or by camel: about 8 to 11 days; on horseback: about 4 to 6 days (approx.).')
  })
  test('127 km by land: 4 to 6 days on foot, 2 to 4 on horseback', () => {
    const d = fake(127, { days: { foot: { low: 4, high: 6 }, horse: { low: 2, high: 4 } } })
    expect(daysLine('es', d)).toBe('A pie, en burro o en camello: unos 4 a 6 días; a caballo: unos 2 a 4 días (aprox.).')
  })
  test('Bethlehem to Jerusalem: less than a day', () => {
    expect(daysLine('es', t(bethlehem, jerusalem))).toBe('Menos de un día a pie, en burro o en camello (aprox.).')
  })
  test('a ship only between two Mediterranean ports, with its season', () => {
    const caesarea = place('lug:caesarea', 'Cesarea', 32.5, 34.9, { form: 5 })
    const rome = place('lug:rome', 'Roma', 41.9, 12.5, { form: 5 })
    const withShip = daysLine('es', t(caesarea, rome))
    expect(withShip).toContain('en barco, en la temporada de navegación (primavera a otoño)')
    expect(withShip).toContain('más de dos meses')
    // a port of the Red Sea, an inland city: no ship
    const aqaba = place('lug:aqaba', 'Ezión-geber', 29.5, 35, { form: 5 })
    expect(daysLine('es', t(caesarea, aqaba))).not.toContain('barco')
    expect(daysLine('es', t(jerusalem, rome))).not.toContain('barco')
  })
  test('more than two months replaces the range', () => {
    const d = fake(2600, { days: { foot: { low: 99, high: 120 }, horse: { low: 53, high: 65 } } })
    expect(daysLine('es', d)).toBe('A pie, en burro o en camello: más de dos meses; a caballo: unos 53 a 65 días (aprox.).')
  })
  test('certainty 2 says so first; certainty 1 and near give nothing', () => {
    const cap = place('lug:cap', 'Cafarnaúm', 32.88, 35.57, { sure: 2 })
    expect(daysLine('es', t(cap, jerusalem)).startsWith('Según la ubicación propuesta, a pie, en burro o en camello: ')).toBe(true)
    const emmaus = place('lug:emmaus', 'Emaús', 31.8, 35.1, { sure: 1 })
    expect(daysLine('es', t(emmaus, jerusalem))).toBe('')
    expect(daysLine('es', fake(2))).toBe('')
    expect(daysLine('es', undefined)).toBe('')
  })
  test('one day and a single figure', () => {
    expect(daysLine('es', fake(30, { days: { foot: { low: 1, high: 1 }, horse: { low: 1, high: 1 } } }))).toContain('un día')
    expect(daysLine('en', fake(80, { days: { foot: { low: 3, high: 3 }, horse: { low: 2, high: 2 } } }))).toContain('about 3 days')
  })
  test('the place card line: days on foot from the reference place', () => {
    expect(refDaysLine('es', bethel, jerusalem, t(bethel, jerusalem))).toBe('De Jerusalén a Betel, a pie, en burro o en camello: menos de un día (aprox.).')
    expect(refDaysLine('es', bethel, jerusalem, undefined)).toBe('')
    expect(refDaysLine('es', jerusalem, damascus, t(jerusalem, damascus))).toContain('unos 8 a 11 días')
  })
})

describe('born and died', () => {
  const tarsus = place('lug:tarsus', 'Tarso', 36.9, 34.9)
  test('according to Theographic, and without data', () => {
    expect(bornLine('es', 'Pablo', tarsus)).toBe('Según Theographic, Pablo nació en Tarso.')
    expect(diedLine('es', 'Pablo', tarsus)).toBe('Según Theographic, Pablo murió en Tarso.')
    expect(bornLine('es', 'Samuel', null)).toBe('Los datos que tengo no dicen dónde nació Samuel.')
    expect(diedLine('es', 'Samuel', null)).toBe('Los datos que tengo no dicen dónde murió Samuel.')
  })
  test('gender in fr and ar', () => {
    expect(bornLine('fr', 'Paul', tarsus)).toContain('est né à')
    expect(bornLine('fr', 'Marie', tarsus, true)).toContain('est née à')
    expect(diedLine('ar', 'مريم', tarsus, true)).toContain('ماتت')
  })
})

describe('six languages, eight directions', () => {
  test('no placeholder or empty text anywhere, and the eight directions all differ', () => {
    const dirs: Trip['direction'][] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    for (const l of LANGS) {
      const seen = new Set<string>()
      for (const d of dirs) {
        const w = whereLine(l, bethel, jerusalem, fake(40, { direction: d }))
        const x = whereLine(l, bethel, jerusalem, fake(40, { direction: d, sure: 2 }))
        const y = distanceLine(l, bethel, jerusalem, fake(40, { direction: d }))
        const z = distanceLine(l, bethel, jerusalem, fake(40, { direction: d, sure: 2 }))
        for (const s of [w, x, y, z]) clean(s)
        expect(w).toContain('Betel')
        expect(w).toContain('Jerusalén')
        expect(w).toContain('40')
        seen.add(w)
      }
      expect(seen.size).toBe(8)
    }
  })
  test('every other sentence is filled in every language', () => {
    const days = { foot: { low: 8, high: 11 }, horse: { low: 4, high: 6 }, ship: { low: 2, high: 3 } }
    const judah = place('lug:judah', 'Judá', 31.6, 35, { form: 2 })
    const jordan = place('lug:jordan', 'el Jordán', 32, 35.5, { form: 3 })
    const emmaus = place('lug:emmaus', 'Emaús', 31.8, 35.1, { sure: 1 })
    const lost = place('lug:lost', 'Tarsis', undefined, undefined, { sure: 0 })
    for (const l of LANGS) {
      for (const sure of [3, 2] as const) {
        clean(daysLine(l, fake(220, { sure, days })))
        clean(daysLine(l, fake(220, { sure, days: { foot: { low: 0, high: 1 }, horse: { low: 0, high: 1 } } })))
        clean(daysLine(l, fake(2600, { sure, days: { foot: { low: 90, high: 100 }, horse: { low: 1, high: 1 }, ship: { low: 12, high: 20 } } })))
        clean(refDaysLine(l, bethel, jerusalem, fake(220, { sure, days })))
        clean(whereLine(l, bethel, jerusalem, fake(1, { sure, near: true })))
        clean(distanceLine(l, bethel, jerusalem, fake(1, { sure, near: true })))
      }
      for (const p of [judah, jordan, emmaus, lost]) {
        clean(whereLine(l, p, jerusalem, undefined))
        clean(whereLine(l, p, null, undefined))
        clean(distanceLine(l, p, jerusalem, undefined))
      }
      clean(whereLine(l, bethel, null, undefined))
      clean(unknownPlaceLine(l, lost))
      for (const f of [false, true]) {
        clean(bornLine(l, 'Pablo', jerusalem, f)); clean(bornLine(l, 'Pablo', null, f))
        clean(diedLine(l, 'Pablo', jerusalem, f)); clean(diedLine(l, 'Pablo', null, f))
      }
    }
  })
  test('hindi and arabic end their sentences in their own way, and a regional ui code works', () => {
    expect(daysLine('hi', t(jerusalem, damascus)).endsWith('।')).toBe(true)
    expect(daysLine('ar', t(jerusalem, damascus))).toContain('؛')
    expect(whereLine('es-419', bethel, jerusalem, t(bethel, jerusalem))).toContain('al norte de')
    expect(whereLine('xx', bethel, jerusalem, t(bethel, jerusalem))).toContain('north of')
  })
  test('Arabic number agreement: 2, 3 to 10 and 11 or more', () => {
    const f = (low: number, high: number) => daysLine('ar', fake(100, { days: { foot: { low, high }, horse: { low: 1, high: 1 } } }))
    expect(f(2, 2)).toContain('نحو يومان')
    expect(f(4, 6)).toContain('نحو 4 إلى 6 أيام')
    expect(f(8, 11)).toContain('نحو 8 إلى 11 يومًا')
  })
  test('a name with $ or braces is kept as is', () => {
    const odd = place('lug:odd', '$& {n} <b>', 31.9, 35.2)
    expect(whereLine('es', odd, jerusalem, fake(40))).toContain('$& {n} <b>')
  })
})
