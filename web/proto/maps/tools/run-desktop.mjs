// node tools/run-desktop.mjs <playwright-core dir> <base url> <out results.jsonl> <shots dir> [throttle list e.g. 1,6]
// Drives installed Chrome at 375x812 (DPR 2), optional CDP CPU throttle, runs ?bench and takes screenshots.
import { createRequire } from 'node:module'
import { appendFileSync, mkdirSync } from 'node:fs'
const [pw, base, out, shots, th = '1,6'] = process.argv.slice(2)
const { chromium } = createRequire(pw + '/package.json')('playwright-core')
mkdirSync(shots, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-precise-memory-info'] })
const variants = (process.env.VARIANTS || 'svg,three,maplibre').split(','), scenes = ['bethel', 'paul', 'cluster']
async function run(url, rate, shot) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: false })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate })
  const errs = []; page.on('pageerror', e => errs.push(String(e)))
  const reqs = []; page.on('request', r => reqs.push(r.url()))
  await page.goto(url)
  const bench = url.includes('bench')
  await page.waitForFunction(bench ? 'window.__res && (window.__res.pan || window.__res.error)' : 'window.__res', null, { timeout: 120000 }).catch(() => errs.push('timeout'))
  const res = await page.evaluate('window.__res || null')
  if (shot) { await page.waitForTimeout(500); await page.screenshot({ path: shot }) }
  await ctx.close()
  return { res, errs, external: reqs.filter(u => !u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) }
}
for (const rate of process.env.NOBENCH ? [] : th.split(',').map(Number)) for (const v of variants) for (const s of scenes) {
  const r = await run(`${base}/${v}.html?scene=${s}&bench=1`, rate)
  const o = { ...(r.res || {}), run: +(process.env.RUN || 1), throttle: rate, errs: r.errs, external: r.external }
  appendFileSync(out, JSON.stringify(o) + '\n'); console.log(v, s, rate, JSON.stringify(o).slice(0, 300))
}
if (!process.env.NOSHOTS) for (const v of variants) for (const s of scenes) for (const lang of ['es', 'ar']) await run(`${base}/${v}.html?scene=${s}&lang=${lang}`, 1, `${shots}/${v}-${s}-${lang}.png`)
if (!process.env.NOSHOTS) for (const v of variants) await run(`${base}/${v}.html?scene=paul&lang=es&dark=1`, 1, `${shots}/${v}-paul-es-dark.png`)
await browser.close()
