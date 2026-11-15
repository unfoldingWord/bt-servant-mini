// The grammar of the model's reply (src/data/slots.gbnf): it reads as llama.cpp's GBNF, it takes every call sheet the model
// was trained to write and nothing JSON.parse would refuse, and every way of asking the model sends it. No model, no network:
// the grammar is turned into a regular expression here (it has no recursion), and the servers are fakes.
import { afterAll, describe, expect, mock, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const hadWindow = 'window' in globalThis
if (!hadWindow) (globalThis as any).window = {}
const asked: object[] = []
let failWithGrammar = false
class FakeWllama {
  modelManager = { getModelOrDownload: async () => ({ open: async () => [new Blob([new Uint8Array(4)])] }) }
  cacheManager = { delete: async () => {}, open: async () => null }
  async loadModel() {}
  async exit() {}
  async createCompletion(o: { grammar?: string }) {
    asked.push(o)
    if (failWithGrammar && o.grammar) throw new Error('failed to parse grammar')
    return { choices: [{ text: SHEET }] }
  }
}
mock.module('@wllama/wllama', () => ({ Wllama: FakeWllama, LoggerWithoutDebug: {} }))
;(globalThis as any).location ??= { href: 'http://localhost/' }
const { GRAMMAR, slotsOf } = await import('../src/model')
const web = await import('../src/webmodel')
const { setPacksServers } = await import('../src/packs')
const { createHash } = await import('node:crypto')

const FILE = readFileSync(join(import.meta.dir, '..', 'src', 'data', 'slots.gbnf'), 'utf8')
const SHEET =
  '{"intent":"passage","book":"Ruth","chapter":1,"verse_start":16,"verse_end":null,"what":["text"],"version":null,"term":null,"phrase":null,"lang":"en","other_language":null}'

// ------------------------------------------------------------------------------------------- GBNF, the part llama.cpp reads
type Node =
  | { k: 'lit'; s: string } | { k: 'cls'; neg: boolean; r: [number, number][] } | { k: 'ref'; n: string }
  | { k: 'alt'; a: Node[][] } | { k: 'rep'; n: Node; min: number; max: number }

/** Parses GBNF as llama.cpp's grammar-parser does (the subset: literals, classes, refs, groups, ? * + {m,n}); throws on errors. */
function parseGbnf(src: string): Map<string, Node> {
  const rules = new Map<string, Node>()
  let i = 0
  const ws = (nl: boolean) => {
    for (;;) {
      if (src[i] === '#') while (i < src.length && src[i] !== '\n') i++
      else if (src[i] === ' ' || src[i] === '\t' || src[i] === '\r' || (nl && src[i] === '\n')) i++
      else return
    }
  }
  const name = () => {
    const m = /^[a-zA-Z0-9-]+/.exec(src.slice(i))
    if (!m) throw new Error(`a rule name expected at ${i}: ${src.slice(i, i + 20)}`)
    i += m[0].length
    return m[0]
  }
  const esc = (): number => {
    const c = src[i++]
    const hex = (n: number) => {
      const h = src.slice(i, i + n)
      if (!/^[0-9a-fA-F]+$/.test(h) || h.length !== n) throw new Error(`bad escape at ${i}`)
      i += n
      return parseInt(h, 16)
    }
    if (c === 'x') return hex(2)
    if (c === 'u') return hex(4)
    if (c === 'U') return hex(8)
    const m: Record<string, number> = { n: 10, r: 13, t: 9, '\\': 92, '"': 34, '[': 91, ']': 93 }
    if (c === undefined || !(c in m)) throw new Error(`unknown escape \\${c} at ${i}`)
    return m[c]!
  }
  const ch = (): number => {
    if (src[i] === '\\') return i++, esc()
    const cp = src.codePointAt(i)!
    i += cp > 0xffff ? 2 : 1
    return cp
  }
  const alt = (nested: boolean): Node => {
    const a: Node[][] = [seq(nested)]
    while (src[i] === '|') {
      i++
      ws(true)
      a.push(seq(nested))
    }
    return { k: 'alt', a }
  }
  const seq = (nested: boolean): Node[] => {
    const out: Node[] = []
    while (i < src.length) {
      let n: Node
      if (src[i] === '"') {
        i++
        let s = ''
        while (src[i] !== '"') {
          if (i >= src.length) throw new Error('an unclosed literal')
          s += String.fromCodePoint(ch())
        }
        i++
        n = { k: 'lit', s }
      } else if (src[i] === '[') {
        i++
        const neg = src[i] === '^'
        if (neg) i++
        const r: [number, number][] = []
        while (src[i] !== ']') {
          if (i >= src.length) throw new Error('an unclosed class')
          const a = ch()
          if (src[i] === '-' && src[i + 1] !== ']') {
            i++
            const b = ch()
            if (b < a) throw new Error(`an empty range at ${i}`)
            r.push([a, b])
          } else r.push([a, a])
        }
        i++
        n = { k: 'cls', neg, r }
      } else if (src[i] === '(') {
        i++
        ws(true)
        n = alt(true)
        ws(true)
        if (src[i] !== ')') throw new Error(`")" expected at ${i}`)
        i++
      } else if (/[a-zA-Z0-9-]/.test(src[i]!)) {
        // a rule name followed by ::= starts the next rule
        const save = i
        const nm = name()
        const after = i
        ws(false)
        if (src.startsWith('::=', i)) {
          i = save
          break
        }
        i = after
        n = { k: 'ref', n: nm }
      } else break
      ws(nested)
      for (;;) {
        if (src[i] === '?' || src[i] === '*' || src[i] === '+') {
          const c = src[i++]
          n = { k: 'rep', n, min: c === '+' ? 1 : 0, max: c === '?' ? 1 : Infinity }
        } else if (src[i] === '{') {
          const m = /^\{(\d+)(,(\d*))?\}/.exec(src.slice(i))
          if (!m) throw new Error(`a bad repetition at ${i}`)
          i += m[0].length
          n = { k: 'rep', n, min: +m[1]!, max: m[2] ? (m[3] ? +m[3] : Infinity) : +m[1]! }
        } else break
        ws(nested)
      }
      out.push(n)
      if (!nested && src[i] === '\n') {
        // a newline ends the rule unless the next line goes on with an alternative
        let j = i
        while (j < src.length && /\s/.test(src[j]!)) j++
        if (src[j] !== '|') break
        i = j
      }
    }
    return out
  }
  ws(true)
  while (i < src.length) {
    const n = name()
    ws(false)
    if (!src.startsWith('::=', i)) throw new Error(`"::=" expected after ${n}`)
    i += 3
    ws(false)
    if (rules.has(n)) throw new Error(`rule ${n} defined twice`)
    rules.set(n, alt(false))
    ws(true)
  }
  if (!rules.has('root')) throw new Error('no root rule')
  const refs = (x: Node): string[] =>
    x.k === 'ref' ? [x.n] : x.k === 'alt' ? x.a.flat().flatMap(refs) : x.k === 'rep' ? refs(x.n) : []
  for (const [n, body] of rules) for (const r of refs(body)) if (!rules.has(r)) throw new Error(`rule ${n} uses ${r}, which is not defined`)
  return rules
}

/** The grammar as a regular expression for the whole reply (a grammar without recursion). */
function toRegex(rules: Map<string, Node>): RegExp {
  const cp = (c: number) => `\\u{${c.toString(16)}}`
  const re = (x: Node, seen: string[]): string => {
    switch (x.k) {
      case 'lit':
        return [...x.s].map((c) => cp(c.codePointAt(0)!)).join('')
      case 'cls':
        return `[${x.neg ? '^' : ''}${x.r.map(([a, b]) => (a === b ? cp(a) : `${cp(a)}-${cp(b)}`)).join('')}]`
      case 'ref':
        if (seen.includes(x.n)) throw new Error(`recursion through ${x.n}`)
        return `(?:${re(rules.get(x.n)!, [...seen, x.n])})`
      case 'alt':
        return `(?:${x.a.map((s) => s.map((n) => re(n, seen)).join('')).join('|')})`
      case 'rep':
        return `(?:${re(x.n, seen)}){${x.min},${x.max === Infinity ? '' : x.max}}`
    }
  }
  return new RegExp(`^(?:${re(rules.get('root')!, ['root'])})$`, 'u')
}

const RULES = parseGbnf(FILE)
const FITS = toRegex(RULES)
const sheet = (o: Record<string, unknown>) =>
  JSON.stringify({
    intent: 'passage', book: null, chapter: null, verse_start: null, verse_end: null, what: [], version: null, term: null, phrase: null,
    lang: 'en', other_language: null, ...o,
  })

describe('the grammar', () => {
  test('reads as GBNF: one root, every rule it uses defined, no recursion', () => {
    expect([...RULES.keys()]).toContain('root')
    expect(FITS).toBeInstanceOf(RegExp)
  })

  test('takes the call sheets the model writes, in every language and intent', () => {
    for (const s of [
      SHEET,
      sheet({ intent: 'advice', book: 'Psalm', chapter: 91, verse_start: 4, term: 'metaphor', phrase: 'he will cover you with his feathers' }),
      sheet({ intent: 'article', term: 'métaphore', lang: 'fr' }),
      sheet({ intent: 'count', book: 'प्रेरितों के काम', chapter: 2, what: ['notes'], lang: 'hi' }),
      sheet({ intent: 'resources', other_language: 'Swahili', lang: 'ar', term: 'الرحمة' }),
      sheet({ book: '2 s', chapter: 10, verse_start: 20, verse_end: 25, what: ['text', 'notes'], version: 'ult', lang: 'es' }),
      sheet({ intent: 'unknown', term: 'a "quoted" word\\ and a tab\t' }),
      sheet({ intent: 'search', what: ['text', 'notes', 'questions', 'terms', 'intro'] }),
      sheet({ intent: 'rank', book: '', chapter: 150, verse_start: 176 }),
    ])
      expect(s).toMatch(FITS)
  })

  test('refuses what the parser or the call sheet would not take', () => {
    const bad = [
      '{"book":null}', // keys missing (v3 sometimes leaves out the intent)
      SHEET.replace('"passage"', '"verse"'), // an intent the app does not know
      SHEET.replace('"chapter":1', '"chapter":01'), // not JSON
      SHEET.replace('"chapter":1', '"chapter":"1"'),
      SHEET.replace('"chapter":1', '"chapter":1.5'),
      SHEET.replace('"version":null', '"version":"niv"'),
      SHEET.replace('"lang":"en"', '"lang":"pt"'),
      SHEET.replace('["text"]', '["verse"]'),
      SHEET.replace('","', '", "'), // spaces: the model was trained on compact JSON
      SHEET.replace('Ruth', 'R'.repeat(61)),
      SHEET.replace('"Ruth"', '"a\nb"'),
      SHEET + ' ',
      SHEET.slice(0, -1),
    ]
    for (const s of bad) expect(s).not.toMatch(FITS)
    // and what it takes, JSON.parse reads
    expect(JSON.parse(sheet({ term: 'a "quoted" word\\ and \\u00e9' })).term).toBe('a "quoted" word\\ and \\u00e9')
  })

  // The training targets of the model (the experiments repo, next to this one): every one fits. Skipped where it is not.
  const TRAIN = join(import.meta.dir, '..', '..', '..', 'fase0-mini-servant', 'data', 'train-ft.jsonl')
  test.skipIf(!existsSync(TRAIN))('takes every call sheet in the training data', () => {
    const misfits: string[] = []
    const lines = readFileSync(TRAIN, 'utf8').split('\n').filter(Boolean)
    for (const l of lines) {
      const out = JSON.parse(l).output_json as string
      if (!FITS.test(out)) misfits.push(out)
    }
    expect(misfits).toEqual([])
    expect(lines.length).toBeGreaterThan(1000)
  })
})

// --------------------------------------------------------------------------------------------- every way of asking sends it
describe('the request', () => {
  test('is the file, sent as is', () => {
    expect(GRAMMAR).toBe(FILE)
  })

  test('to llama-server (desktop) carries the grammar', async () => {
    const bodies: any[] = []
    const was = globalThis.fetch
    globalThis.fetch = (async (_u: string, o: RequestInit) => {
      bodies.push(JSON.parse(String(o.body)))
      return new Response(JSON.stringify({ content: SHEET }))
    }) as any
    try {
      const r = await slotsOf('Ruth 1:16')
      expect(r.slots?.book).toBe('Ruth')
      expect(bodies.length).toBe(1)
      expect(bodies[0].grammar).toBe(GRAMMAR)
      expect(bodies[0]).toMatchObject({ temperature: 0, seed: 0, n_predict: 200, stop: ['<end_of_turn>'] })
    } finally {
      globalThis.fetch = was
    }
  })

  test('a server that cannot read the grammar is asked once more without it', async () => {
    const bodies: any[] = []
    const was = globalThis.fetch
    globalThis.fetch = (async (_u: string, o: RequestInit) => {
      const b = JSON.parse(String(o.body))
      bodies.push(b)
      return b.grammar
        ? new Response(JSON.stringify({ error: { code: 400, message: 'Failed to parse grammar', type: 'invalid_request_error' } }), { status: 400 })
        : new Response(JSON.stringify({ content: SHEET }))
    }) as any
    try {
      const r = await slotsOf('Ruth 1:16')
      expect(r.slots?.chapter).toBe(1)
      expect(bodies.map((b) => 'grammar' in b)).toEqual([true, false])
    } finally {
      globalThis.fetch = was
    }
  })

  test('through the Android bridge carries the grammar', async () => {
    const sent: any[] = []
    const w = globalThis.window as any
    w.Android = {
      ready: () => true,
      status: () => 'ready',
      complete: (id: string, body: string) => {
        sent.push(JSON.parse(body))
        queueMicrotask(() => w.__llm(id, JSON.stringify({ content: SHEET })))
      },
    }
    try {
      const r = await slotsOf('Ruth 1:16')
      expect(r.slots?.verse_start).toBe(16)
      expect(sent[0].grammar).toBe(GRAMMAR)
    } finally {
      delete w.Android
    }
  })

  test('to wllama (the web app) carries the grammar, and goes on without it when it fails there', async () => {
    const good = new Uint8Array(4)
    web.EXPECTED.bytes = good.length
    web.EXPECTED.sha256 = createHash('sha256').update(good).digest('hex')
    setPacksServers(['https://a.test'])
    try {
      await web.webForget()
      await web.webLoad()
      expect(web.webState().state).toBe('ready')
      asked.length = 0
      expect(await web.webComplete('p', 200, ['<end_of_turn>'], GRAMMAR)).toBe(SHEET)
      expect(asked).toEqual([{ prompt: 'p', max_tokens: 200, temperature: 0, seed: 0, stop: ['<end_of_turn>'], grammar: GRAMMAR }])
      asked.length = 0
      failWithGrammar = true
      expect(await web.webComplete('p', 200, ['<end_of_turn>'], GRAMMAR)).toBe(SHEET)
      expect(asked.map((o) => 'grammar' in o)).toEqual([true, false])
    } finally {
      failWithGrammar = false
      setPacksServers()
      await web.webForget()
    }
  })
})

afterAll(() => {
  if (!hadWindow) delete (globalThis as any).window
})
