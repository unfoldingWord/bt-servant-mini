// Shared by the map bench page (maps-bench.ts) and the headless script (maps-node.ts): the three scenes and the statistics. No DOM here.
// Dev bench only: nothing in src/ imports this folder, so no normal bundle has it (build.py bundles it only with --devapk).
import { BASEMAP_B64, PLACES, ROUTE } from './data'
import type { MapPoint } from '../src/mapview'

export type Scene = { id: string; title: string; points: MapPoint[] }

export const basemapBytes = (): Uint8Array => Uint8Array.from(atob(BASEMAP_B64), (c) => c.charCodeAt(0))

const all = (): MapPoint[] => PLACES.map(([id, label, lat, lon, sure, form]) => ({ id, label, lat, lon, sure, form, verses: 1 }))

/** a. A Bethel-like answer: one place and its five nearest neighbours (the 1-place answer that has a few others close by). */
function betel(): MapPoint[] {
  const pts = all()
  const b = pts.find((p) => p.label === 'Bethel')!
  const d = (p: MapPoint) => Math.hypot(p.lat - b.lat, (p.lon - b.lon) * Math.cos((b.lat * Math.PI) / 180))
  return [b, ...pts.filter((p) => p !== b).sort((x, y) => d(x) - d(y)).slice(0, 5)]
}
/** b. Paul's first journey: the 12 stops; a place visited twice (Lystra, Iconium...) is one point with every stop number as its badge. */
function journey(): MapPoint[] {
  const by = new Map<string, MapPoint & { stops: number[] }>()
  for (const [stop, id, label, lat, lon] of ROUTE) {
    const p = by.get(id) ?? { id, label, lat, lon, sure: 3 as const, form: 1 as const, verses: 1, stops: [] }
    p.stops.push(stop)
    by.set(id, p)
  }
  return [...by.values()].map(({ stops, ...p }) => ({ ...p, badge: stops.join(', ') }))
}

export const scenes = (): Scene[] => [
  { id: 'a-betel', title: 'a. Bethel-like answer (1 place + 5 near)', points: betel() },
  { id: 'b-journey', title: `b. Paul's first journey (${ROUTE.length} stops, ${journey().length} places)`, points: journey() },
  { id: 'c-cluster', title: `c. All places (${PLACES.length}, clustered)`, points: all() },
]

export type Stats = { n: number; min: number; median: number; p90: number; max: number }
export function stats(xs: number[]): Stats | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const at = (q: number) => v[Math.min(v.length - 1, Math.max(0, Math.ceil(q * v.length) - 1))]!
  const median = v.length % 2 ? v[(v.length - 1) / 2]! : (v[v.length / 2 - 1]! + v[v.length / 2]!) / 2
  const r = (x: number) => Math.round(x * 100) / 100
  return { n: v.length, min: r(v[0]!), median: r(median), p90: r(at(0.9)), max: r(v[v.length - 1]!) }
}
