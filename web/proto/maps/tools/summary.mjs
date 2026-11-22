// node tools/summary.mjs results/desktop.jsonl  -> median over runs per variant/scene/throttle
import { readFileSync } from 'node:fs'
const g = new Map()
for (const l of readFileSync(process.argv[2], 'utf8').trim().split('\n')) {
  const r = JSON.parse(l); const k = [r.variant, r.scene, 'x' + (r.throttle ?? 1)].join(' ')
  ;(g.get(k) || g.set(k, []).get(k)).push(r)
}
const med = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : '-' }
console.log('variant scene cpu | runs | boot data draw | fps p95 jsAvg | zoomAvg | heapMB | ext errs')
for (const [k, rs] of g) console.log(k, '|', rs.length, '|', med(rs.map(r => r.t_boot)), med(rs.map(r => r.t_data)), med(rs.map(r => r.t_draw)), '|',
  med(rs.map(r => r.pan?.fps)), med(rs.map(r => r.pan?.p95)), med(rs.map(r => r.pan?.jsAvg)), '|', med(rs.map(r => r.zoomAvg)), '|', med(rs.map(r => r.heapMB)), '|',
  rs.reduce((a, r) => a + (r.external?.length || 0), 0), rs.reduce((a, r) => a + (r.errs?.length || 0), 0))
