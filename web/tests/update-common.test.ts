// The daily update (packs.ts updateLang) also brings a newer common `xtopics` / `xmap` when the refresh lists one: that is how
// a phone that added its languages before the packs had the section map gets it (common r2 -> r3: the xtopics core, 257 KB).
// Never on a metered connection (Abel: no automatic downloads over mobile data); when the app cannot tell, as if not.
import { afterEach, expect, test } from 'bun:test'
import { COMMON_UPDATE_MAX, meteredNow, OBS_MAX, updateLang } from '../src/packs'

const ARTICLES = ['art:tw:kt', 'art:ta:intro']
/** A client whose refresh lists `updates`, with every article installed unless `lacks` says otherwise. */
function fake(updates: { key: string; bytes: number; from?: number; to?: number }[] | undefined, lacks: string[] = []) {
  const calls: string[] = []
  const signals: (AbortSignal | undefined)[] = []
  const client = {
    refresh: async (lang: string) => {
      calls.push(`refresh ${lang}`)
      return updates === undefined ? undefined : { updates: updates.map((u) => ({ from: 2, to: 3, ...u })) }
    },
    open: async () => ({ listed: () => true, installed: (u: string) => !lacks.includes(u) }),
    install: async (lang: string, want: { units: string[]; defaults: false }, o?: { signal?: AbortSignal; concurrency?: number }) => {
      calls.push(`install ${lang} ${want.units.join(',')} defaults=${want.defaults} concurrency=${o?.concurrency}`)
      signals.push(o?.signal)
    },
  }
  return { client, calls, signals }
}

test('a newer common xtopics is installed by itself, one request at a time, with the update\'s abort', async () => {
  const { client, calls, signals } = fake([{ key: 'common/xtopics', bytes: 263159 }, { key: 'en/book:rut', bytes: 900000 }])
  const c = new AbortController()
  expect(await updateLang(client, 'en', ARTICLES, c.signal, false)).toEqual(['common/xtopics'])
  expect(calls).toEqual(['refresh en', 'install en common/xtopics defaults=false concurrency=1'])
  expect(signals[0]).toBe(c.signal)
})

test('xtopics and xmap together, after the missing articles', async () => {
  const { client, calls } = fake([{ key: 'common/xmap', bytes: 400000 }, { key: 'common/xtopics', bytes: 263159 }], ['art:ta:intro'])
  expect(await updateLang(client, 'es-419', ARTICLES, undefined, false)).toEqual(['art:ta:intro', 'common/xtopics', 'common/xmap'])
  expect(calls).toEqual([
    'refresh es-419',
    'install es-419 art:ta:intro defaults=false concurrency=1',
    'install es-419 common/xtopics,common/xmap defaults=false concurrency=1',
  ])
})

test('no more than COMMON_UPDATE_MAX: a large xmap waits, the xtopics comes', async () => {
  const { client, calls } = fake([{ key: 'common/xtopics', bytes: 263159 }, { key: 'common/xmap', bytes: COMMON_UPDATE_MAX }])
  expect(await updateLang(client, 'hi', ARTICLES, undefined, false)).toEqual(['common/xtopics'])
  expect(calls.at(-1)).toBe('install hi common/xtopics defaults=false concurrency=1')
})

test('on a metered connection the common units wait; the missing articles come as before', async () => {
  const { client, calls } = fake([{ key: 'common/xtopics', bytes: 263159 }], ['art:ta:intro'])
  expect(await updateLang(client, 'en', ARTICLES, undefined, true)).toEqual(['art:ta:intro'])
  expect(calls).toEqual(['refresh en', 'install en art:ta:intro defaults=false concurrency=1'])
})

test('when the app cannot tell the connection, it updates as if not metered', async () => {
  const { client, calls } = fake([{ key: 'common/xtopics', bytes: 263159 }])
  expect(await updateLang(client, 'en', ARTICLES, undefined, null)).toEqual(['common/xtopics'])
  expect(calls.at(-1)).toBe('install en common/xtopics defaults=false concurrency=1')
})

test('nothing newer, or a refresh with no report: nothing is installed', async () => {
  for (const updates of [[], undefined, [{ key: 'en/topics', bytes: 1000 }]]) {
    const { client, calls } = fake(updates)
    expect(await updateLang(client, 'en', ARTICLES, undefined, false)).toEqual([])
    expect(calls).toEqual(['refresh en'])
  }
})

test('a downgrade the refresh lists (a language built against an older common) is no update', async () => {
  // es-419's catalog requires common r2 while the phone has common/xtopics r3 (from another language): the client lists it
  // as from 3 to 2, which activate would refuse after downloading it
  const { client, calls } = fake([{ key: 'common/xtopics', bytes: 220000, from: 3, to: 2 }, { key: 'common/xmap', bytes: 1000, from: 3, to: 3 }])
  expect(await updateLang(client, 'es-419', ARTICLES, undefined, false)).toEqual([])
  expect(calls).toEqual(['refresh es-419'])
})

// ---------------------------------------------------------------------------------------------------- Open Bible Stories
// A phone that installed a language before OBS came with it gets the unit from the daily update: when the catalog lists it, the
// phone lacks it, it is OBS_MAX (3 MB) or less, and the connection is not metered (Abel, Nov 16).
function withObsUnit(o: { listed?: boolean; installed?: boolean; bytes?: number; lacks?: string[] } = {}) {
  const calls: string[] = []
  const client = {
    refresh: async (lang: string) => { calls.push(`refresh ${lang}`) },
    open: async () => ({
      listed: (u: string) => (u === 'obs' ? o.listed ?? true : true),
      installed: (u: string) => (u === 'obs' ? o.installed ?? false : !(o.lacks ?? []).includes(u)),
      size: (u: string) => (u === 'obs' ? o.bytes ?? 287_929 : 50_000),
    }),
    install: async (lang: string, want: { units: string[]; defaults: false }) => { calls.push(`install ${lang} ${want.units.join(',')}`) },
  }
  return { client, calls }
}

test('obs: a language that lacks it gets it, after its missing articles', async () => {
  const { client, calls } = withObsUnit({ lacks: ['art:ta:intro'] })
  expect(await updateLang(client, 'hi', ARTICLES, undefined, false)).toEqual(['art:ta:intro', 'obs'])
  expect(calls).toEqual(['refresh hi', 'install hi art:ta:intro', 'install hi obs'])
  // a connection the app cannot tell: as if not metered
  expect(await updateLang(withObsUnit().client, 'hi', ARTICLES, undefined, null)).toEqual(['obs'])
})

test('obs: not on a metered connection, not over 3 MB, not when installed or not listed', async () => {
  for (const [o, metered] of [[{}, true], [{ bytes: OBS_MAX + 1 }, false], [{ installed: true }, false], [{ listed: false }, false]] as const) {
    const { client, calls } = withObsUnit(o)
    expect(await updateLang(client, 'es-419', ARTICLES, undefined, metered)).toEqual([])
    expect(calls).toEqual(['refresh es-419'])
  }
  // exactly 3 MB still comes
  expect(await updateLang(withObsUnit({ bytes: OBS_MAX }).client, 'id', ARTICLES, undefined, false)).toEqual(['obs'])
})

// ---------------------------------------------------------------------------------------------------- meteredNow
const g = globalThis as any
const nav = g.navigator
const had = Object.getOwnPropertyDescriptor(nav, 'connection')
const setConnection = (c: unknown) => Object.defineProperty(nav, 'connection', { value: c, configurable: true })
afterEach(() => {
  delete g.Android
  if (had) Object.defineProperty(nav, 'connection', had)
  else delete nav.connection
})

test('metered: from the Android app, from the Network Information API, else unknown', () => {
  setConnection(undefined)
  expect(meteredNow()).toBeNull()
  g.Android = { metered: () => true }
  expect(meteredNow()).toBe(true)
  g.Android = { metered: () => false }
  expect(meteredNow()).toBe(false)
  // the iOS app's own answer (from NWPathMonitor); an older iOS app without metered(): unknown
  g.Android = { platform: () => 'ios', metered: () => true }
  expect(meteredNow()).toBe(true)
  g.Android = { platform: () => 'ios' }
  expect(meteredNow()).toBeNull()
  delete g.Android
  setConnection({ type: 'cellular' })
  expect(meteredNow()).toBe(true)
  setConnection({ type: 'wifi' })
  expect(meteredNow()).toBe(false)
  setConnection({ type: 'unknown' })
  expect(meteredNow()).toBeNull()
  // data saving on: metered, whatever the rest says
  setConnection({ type: 'wifi', saveData: true })
  g.Android = { metered: () => false }
  expect(meteredNow()).toBe(true)
  // a bridge that throws: the browser's word, else unknown
  g.Android = { metered: () => { throw new Error('gone') } }
  setConnection({ type: 'wifi' })
  expect(meteredNow()).toBe(false)
})
