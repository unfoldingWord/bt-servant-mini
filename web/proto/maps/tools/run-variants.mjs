import { createRequire } from 'node:module'
const { chromium } = createRequire(process.argv[2] + '/package.json')('playwright-core')
const b = await chromium.launch({ channel: 'chrome', headless: false })
for (const q of JSON.parse((await import('node:fs')).readFileSync(process.argv[3],'utf8'))) {
  const [u, shot] = q.split('@')
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 }); const p = await ctx.newPage()
  const cd = await ctx.newCDPSession(p); if (u.includes('x6')) await cd.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  await p.goto(u.replace('x6','')); if (u.includes('bench')) await p.waitForFunction('window.__res&&window.__res.pan', null, { timeout: 90000 }); else await p.waitForTimeout(1500)
  const r = await p.evaluate('window.__res'); if (process.argv[4]) (await import('node:fs')).appendFileSync(process.argv[4], JSON.stringify({ url: u, ...r }) + String.fromCharCode(10)); console.log(u, r.t_data, r.t_draw, r.pan && r.pan.jsAvg, r.zoomAvg, r.heapMB)
  if (shot) await p.screenshot({ path: shot }); await ctx.close()
}
await b.close()
