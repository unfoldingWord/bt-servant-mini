import { test, expect } from 'bun:test'
import { autoCheckDue, fetchLatest, LATEST_URL, offerFor, parseLatest, safeUrl, sizeText, UPDATE_T } from '../src/update'
import site from '../../site/latest.json'

const sha = 'a'.repeat(64)
const rel = (v = '0.12.0', code = 29) => ({
  version: v, versionCode: code, notes_url: `https://github.com/unfoldingWord/bt-servant-mini/releases/tag/v${v}-alpha`,
  full: { url: `https://github.com/unfoldingWord/bt-servant-mini/releases/download/v${v}-alpha/bt-servant-mini-${v}-alpha.apk`, sha256: sha, bytes: 374826820 },
  lite: { url: `https://github.com/unfoldingWord/bt-servant-mini/releases/download/v${v}-alpha/bt-servant-mini-${v}-alpha-lite.apk`, sha256: sha, bytes: 18089229 },
})

test('the published latest.json is valid and names both APKs', () => {
  const l = parseLatest(site)
  expect(l).not.toBeNull()
  expect(l!.full.url).toEndWith('.apk')
  expect(l!.lite.url).toEndWith('-lite.apk')
})
test('parse: a bad file gives null, never a half offer', () => {
  expect(parseLatest(rel())).not.toBeNull()
  expect(parseLatest(null)).toBeNull()
  expect(parseLatest({ ...rel(), versionCode: '29' })).toBeNull()
  expect(parseLatest({ ...rel(), version: 'latest' })).toBeNull()
  expect(parseLatest({ ...rel(), lite: undefined })).toBeNull()
  expect(parseLatest({ ...rel(), full: { ...rel().full, url: 'http://github.com/x.apk' } })).toBeNull()
  expect(parseLatest({ ...rel(), full: { ...rel().full, url: 'https://evil.example/x.apk' } })).toBeNull()
  expect(parseLatest({ ...rel(), full: { ...rel().full, sha256: 'xyz' } })).toBeNull()
  expect(parseLatest({ ...rel(), full: { ...rel().full, bytes: 0 } })).toBeNull()
  expect(parseLatest({ ...rel(), notes_url: 'javascript:alert(1)' })!.notes_url).toBeUndefined()
})
test('only https links to GitHub or the landing site', () => {
  expect(safeUrl('https://github.com/unfoldingWord/bt-servant-mini/releases')).toBe(true)
  expect(safeUrl('https://bt-servant-mini.unfoldingword.workers.dev/')).toBe(true)
  expect(safeUrl('https://github.com.evil.example/x')).toBe(false)
  expect(safeUrl('https://user@github.com/x')).toBe(false)
  expect(safeUrl('https://github.com:8443/x')).toBe(false)
  expect(safeUrl('intent://github.com/x')).toBe(false)
  expect(safeUrl(42)).toBe(false)
})
test('offer: newer versionCode only, the APK of the same flavor, and not a dismissed version', () => {
  const l = parseLatest(rel())!
  expect(offerFor(l, 28, 'full')).toEqual({ version: '0.12.0', versionCode: 29, url: l.full.url, bytes: l.full.bytes })
  expect(offerFor(l, 28, 'lite')!.url).toEndWith('-lite.apk')
  expect(offerFor(l, 29, 'full')).toBeNull() // the same version
  expect(offerFor(l, 30, 'full')).toBeNull() // a newer build on the phone (a test build)
  expect(offerFor(l, 0, 'full')).toBeNull() // an app that cannot say its version
  expect(offerFor(l, 28, 'full', 29)).toBeNull() // closed for this version
  expect(offerFor(parseLatest(rel('0.13.0', 30)), 28, 'full', 29)!.version).toBe('0.13.0') // but a later one shows again
  expect(offerFor(null, 28, 'full')).toBeNull()
})
test('the automatic check: only with internet allowed, a connection, and once a day', () => {
  const day = '2026-11-15'
  expect(autoCheckDue({ allowed: true, online: true, last: null, today: day })).toBe(true)
  expect(autoCheckDue({ allowed: true, online: true, last: '2026-11-14', today: day })).toBe(true)
  expect(autoCheckDue({ allowed: true, online: true, last: day, today: day })).toBe(false)
  expect(autoCheckDue({ allowed: false, online: true, last: null, today: day })).toBe(false)
  expect(autoCheckDue({ allowed: true, online: false, last: null, today: day })).toBe(false)
})
test('the request is a plain GET of the fixed URL, with nothing added', async () => {
  let seen: { url: string; init: RequestInit } | null = null
  const fake = (async (url: string, init: RequestInit) => {
    seen = { url, init }
    return new Response(JSON.stringify(rel()))
  }) as unknown as typeof fetch
  expect((await fetchLatest(fake))!.versionCode).toBe(29)
  expect(seen!.url).toBe(LATEST_URL)
  expect(seen!.init.method ?? 'GET').toBe('GET')
  expect(seen!.init.body).toBeUndefined()
  expect(seen!.init.headers).toBeUndefined()
  expect(seen!.init.credentials).toBe('omit')
  expect(seen!.init.referrerPolicy).toBe('no-referrer')
})
test('fetch problems give null', async () => {
  expect(await fetchLatest((async () => new Response('nope', { status: 404 })) as unknown as typeof fetch)).toBeNull()
  expect(await fetchLatest((async () => new Response('{bad json')) as unknown as typeof fetch)).toBeNull()
  expect(await fetchLatest((async () => { throw new Error('offline') }) as unknown as typeof fetch)).toBeNull()
  const slow = ((_: string, init: RequestInit) => new Promise((_r, no) => init.signal!.addEventListener('abort', () => no(new Error('abort'))))) as unknown as typeof fetch
  expect(await fetchLatest(slow, 20)).toBeNull()
})
test('sizes and texts in the six languages', () => {
  expect(sizeText(18089229)).toBe('18 MB')
  expect(sizeText(374826820)).toBe('375 MB')
  for (const lang of ['en', 'es', 'fr', 'id', 'hi', 'ar']) {
    const t = UPDATE_T[lang]!
    expect(t.found).toContain('{v}')
    expect(t.found).toContain('{size}')
    expect(t.latest).toContain('{v}')
    for (const v of Object.values(t)) expect(v.length).toBeGreaterThan(0)
  }
})
