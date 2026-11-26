// The page must never grow wider than the phone: one long unbroken string (a path in an error) once made the layout viewport 511 px on a 384 px screen.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(import.meta.dir, '..', 'index.html'), 'utf8')
const rule = (sel: string) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => m[1]!.split(',').some((x) => x.trim() === sel)).map((m) => m[2]).join(';')

describe('index.html layout viewport', () => {
  test('#notice wraps a long unbroken error text', () => {
    expect(rule('#notice')).toMatch(/overflow-wrap:\s*anywhere/)
    expect(rule('#notice')).toMatch(/min-width:\s*0/)
  })
  test('the page never scrolls sideways', () => {
    expect(rule('html')).toMatch(/overflow-x:\s*clip/)
    expect(rule('#log')).toMatch(/min-width:\s*0/)
  })
})
