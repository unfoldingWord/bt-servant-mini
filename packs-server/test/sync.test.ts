// The order sync.mjs writes catalogs in: the required ones first, and none whose required catalog is missing from the target.
import { describe, expect, test } from 'bun:test'
// @ts-ignore: a plain .mjs script
import { catalogOrder, missingRequires } from '../sync.mjs'

const idOf = (n: number) => new Uint8Array(32).fill(n)
const hexOf = (n: number) => Array.from(idOf(n), (x) => x.toString(16).padStart(2, '0')).join('')
const cat = (id: number, requires: [string, number, Uint8Array][] = []) => ({ bytes: new Uint8Array(), verified: { id: hexOf(id), catalog: { requires } } })

describe('catalog order', () => {
  test('the common catalog before the languages that require it, whatever order they were found in', () => {
    const catalogs = new Map<string, any>([
      ['en', cat(1, [['common', 2, idOf(9)]])],
      ['id', cat(2, [['common', 2, idOf(9)]])],
      ['common', cat(9)],
    ])
    expect(catalogOrder(catalogs)).toEqual(['common', 'en', 'id'])
  })
  test('a language whose required catalog is not in the target, or is there at another id, is not written', () => {
    const catalogs = new Map<string, any>([['en', cat(1, [['common', 2, idOf(9)]])], ['common', cat(9)]])
    expect(missingRequires('en', catalogs, new Set())).toEqual(['common revision 2'])
    expect(missingRequires('en', catalogs, new Set(['common']))).toEqual([])
    const behind = new Map<string, any>([['en', cat(1, [['common', 3, idOf(8)]])], ['common', cat(9)]])
    expect(missingRequires('en', behind, new Set(['common']))).toEqual(['common revision 3'])
    expect(missingRequires('common', catalogs, new Set())).toEqual([])
  })
})
