// No text the user sees says "pack" or "paquete" (or its word in fr, id, hi, ar): the design of the menu
// (diseno-menu-recursos.md) calls each thing by its name (a language, Resources, the Bible…). This reads every string
// literal of src/*.ts and every value of the answer templates (src/data/tpl-*.json) and fails on those words; code
// identifiers and comments are not text (strings inside `${…}` are). The few technical strings that say "pack" (store names,
// URLs, the client's module, errors no screen shows) are listed by hand below: a new one has to be added here on purpose.
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'

const SRC = `${import.meta.dir}/../src`
export const BANNED = /\bpacks?\b|paquetes?|paquets?|\bpaket|पैक|حزم|حزمة/i

/** What a string shows: without `{placeholders}` (their names are code) and the `.tcpack` file extension. */
const text = (s: string) => s.replace(/\{\w+\}/g, '').replace(/\.tcpack/g, '')
/** Module specifiers (`import … from './packs'`). */
const MODULE = /^(\.\/packs|@bt-synergy\/language-pack-[\w-]+)$/

/** Technical strings no screen shows (file → exact literal). */
const ALLOWED: Record<string, string[]> = {
  'packs.ts': ['@bt-synergy/language-pack-client', './packs', 'no packs server', 'read-only pack store', 'btsm-packs', 'btsm.packs.checked', 'no pack for ${} on the server'],
  'obsimg.ts': ['./packs'],
  'resources.ts': ['./packs'],
  'webmodel.ts': ['no packs server'],
  'shared.ts': ['https://bt-servant-mini-packs.unfoldingword.workers.dev'],
  'modes.ts': ['pack'], // Five.source, a tag
  'saved.ts': ['pack'], // Plan.why, a tag
  'explore.ts': ['ex-pack'], // a CSS class
  'main.ts': ['#packs'], // an element id
  'setup.ts': ['packs'], // a CSS class
}

/** A `/` that starts a regex literal (after an operator, a bracket or `return`), not a division. */
function regexCanStart(code: string, i: number): boolean {
  let k = i - 1
  while (k >= 0 && (code[k] === ' ' || code[k] === '\t')) k--
  if (k < 0 || code[k] === '\n' || code[k] === '\r') return true
  if ('(,=:[!&|?{;+-*%<>~^'.includes(code[k]!)) return true
  return /\b(return|typeof|case|of|in)$/.test(code.slice(Math.max(0, k - 6), k + 1))
}

/** The index after a regex literal that starts at `i` (its flags too). */
function regexEnd(code: string, i: number): number {
  let j = i + 1
  let cls = false
  while (j < code.length && code[j] !== '\n') {
    const c = code[j]!
    if (c === '\\') { j += 2; continue }
    if (c === '[') cls = true
    else if (c === ']') cls = false
    else if (c === '/' && !cls) break
    j++
  }
  j++
  while (j < code.length && /[a-z]/.test(code[j]!)) j++
  return j
}

/** The index after the string literal that starts at `i` (a template's `${…}` skipped whole). */
function stringEnd(code: string, i: number): number {
  const q = code[i]!
  let j = i + 1
  while (j < code.length && code[j] !== q) {
    if (code[j] === '\\') { j += 2; continue }
    if (q === '`' && code[j] === '$' && code[j + 1] === '{') {
      let depth = 1
      j += 2
      while (j < code.length && depth) {
        const d = code[j]!
        if (d === "'" || d === '"' || d === '`') { j = stringEnd(code, j); continue }
        if (d === '{') depth++
        else if (d === '}') depth--
        j++
      }
      continue
    }
    if (q !== '`' && code[j] === '\n') return j
    j++
  }
  return j + 1
}

/** The string literals of a TypeScript source, without comments; a template's `${…}` parts become `${}`, and the strings
 * inside them are listed on their own. */
export function literals(code: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < code.length) {
    const c = code[i]!
    if (c === '/' && code[i + 1] === '/') { i = code.indexOf('\n', i); if (i < 0) break; continue }
    if (c === '/' && code[i + 1] === '*') { i = code.indexOf('*/', i + 2); if (i < 0) break; i += 2; continue }
    if (c === '/' && regexCanStart(code, i)) { i = regexEnd(code, i); continue }
    if (c === "'" || c === '"' || c === '`') {
      let s = ''
      let j = i + 1
      while (j < code.length && code[j] !== c) {
        if (code[j] === '\\') { s += code[j + 1]; j += 2; continue }
        if (c === '`' && code[j] === '$' && code[j + 1] === '{') {
          // the expression's own strings are read too (`${x ? 'a' : 'b'}`); its end is where its braces close
          let depth = 1
          const from = j + 2
          j = from
          while (j < code.length && depth) {
            const d = code[j]!
            if (d === "'" || d === '"' || d === '`') { j = stringEnd(code, j); continue }
            if (d === '{') depth++
            else if (d === '}') depth--
            j++
          }
          out.push(...literals(code.slice(from, j - 1)))
          s += '${}'
          continue
        }
        if (c !== '`' && code[j] === '\n') break // not a string (a regex or a lone quote): stop at the line
        s += code[j]
        j++
      }
      out.push(s)
      i = j + 1
      continue
    }
    i++
  }
  return out
}

describe('no "pack" in what the user sees', () => {
  test('the literal reader: comments skipped, strings inside ${…} read, a division is not a regex', () => {
    expect(literals("// the pack\nconst a = 'Hola' /* pack */ + `x ${packs.join(',')} y`")).toEqual(['Hola', ',', 'x ${} y'])
    expect(literals("`x ${y ? 'the pack' : ''} z`")).toEqual(['the pack', '', 'x ${} z'])
    expect(literals("const a = {x:1}/2; const c = 'pack'")).toEqual(['pack'])
    expect(literals("const a = (b)/2; const c = 'pack' // x/y")).toEqual(['pack'])
    expect(literals("if (s.test(/it's/)) x = 'pack'")).toEqual(['pack'])
  })

  test('every string of src/*.ts', () => {
    const found: string[] = []
    for (const f of readdirSync(SRC).filter((x) => x.endsWith('.ts'))) {
      const ok = new Set(ALLOWED[f] ?? [])
      for (const s of literals(readFileSync(`${SRC}/${f}`, 'utf8')))
        if (BANNED.test(text(s)) && !ok.has(s) && !MODULE.test(s)) found.push(`${f}: ${s}`)
    }
    expect(found).toEqual([])
  })

  test('every answer template (tpl-*.json)', () => {
    for (const f of readdirSync(`${SRC}/data`).filter((x) => /^tpl-.*\.json$/.test(x))) {
      const t = JSON.parse(readFileSync(`${SRC}/data/${f}`, 'utf8')) as Record<string, unknown>
      const bad = Object.entries(t).filter(([, v]) => typeof v === 'string' && BANNED.test(text(v))).map(([k]) => `${f}: ${k}`)
      expect(bad).toEqual([])
    }
  })

  test('the words the tables use instead', async () => {
    const { ST } = await import('../src/saved')
    expect(ST('es').fromPack).toBe('de los recursos en {pack}')
    expect(ST('ar').notHere).not.toMatch(BANNED)
  })
})
