// node tools/summary.mjs results.jsonl  -> markdown-ish table (last run per variant/scene/throttle)
import { readFileSync } from 'node:fs'
const rows = new Map()
for (const l of readFileSync(process.argv[2], 'utf8').trim().split('\n')) { const r = JSON.parse(l); rows.set([r.variant, r.scene, r.throttle ?? 1, r.data, r.relief].join('|'), r) }
console.log('variant scene cpu data rel | boot data draw | fps p95 max jsAvg | zoomAvg | heapMB | extReq errs')
for (const r of rows.values()) console.log([r.variant, r.scene, 'x' + (r.throttle ?? 1), r.data, r.relief ? 'relief' : 'norelief', '|', r.t_boot, r.t_data, r.t_draw, '|', r.pan?.fps, r.pan?.p95, r.pan?.max, r.pan?.jsAvg, '|', r.zoomAvg, '|', r.heapMB, '|', r.external?.length, r.errs?.length].join(' '))
