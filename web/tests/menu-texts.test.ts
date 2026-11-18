// The texts that name the menu (About, the online AI sign-in notice) use the names the rows show: "Menu → Settings",
// "Menu → Resources", with the arrow that reads right in Arabic; and About names no "language pack". The names come from
// the real tables, so renaming a row fails here.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { MNT } from '../src/menu'
import { ST } from '../src/suggest'
import { UPDATE_T } from '../src/update'

const src = (f: string) => readFileSync(`${import.meta.dir}/../src/${f}`, 'utf8')
const setup = src('setup.ts')
const main = src('main.ts')
const LANGS = ['en', 'es', 'fr', 'id', 'hi', 'ar']
const MENU: Record<string, string> = { en: 'Menu', es: 'Menú', fr: 'Menu', id: 'Menu', hi: 'मेनू', ar: 'القائمة' }
const arrow = (l: string) => (l === 'ar' ? ' ← ' : ' → ')
// main.ts has side effects, so its ONLINE_T row label is read from the source
const onlineLabel = (l: string) => new RegExp(`^  ${l}: \{ label: '([^']*)'`, 'm').exec(main)![1]!
/** the line of the About body (or relogin) that starts a given sentence of `l` is found by its path text */
const path = (l: string, ...rows: string[]) => [MENU[l]!, ...rows].join(arrow(l))

describe('About and relogin name the menu rows', () => {
  test('relogin: Menu → Settings → Online AI, with the row labels', () => {
    for (const l of LANGS) expect(main).toContain(path(l, MNT(l).settingsRow, onlineLabel(l)))
  })
  test('About: Settings (typing, online AI, update) and Resources', () => {
    for (const l of LANGS) {
      expect(setup).toContain(path(l, MNT(l).settingsRow))
      expect(setup).toContain(ST(l).toggle)
      expect(setup).toContain(path(l, MNT(l).settingsRow, onlineLabel(l)))
      expect(setup).toContain(UPDATE_T[l]!.check)
      expect(setup).toContain(path(l, MNT(l).resources))
    }
  })
  test('About: no "in the menu" and no packs', () => {
    // the body paragraphs only (code and comments may say pack), without the .tcpack file extension
    const body = setup.split('
').filter((x) => /^\s+"/.test(x)).join('
').replace(/\.tcpack/g, '').toLowerCase()
    for (const bad of ['in the menu', 'en el menú', 'dans le menu', 'मेनू में', 'pack', 'paquete', 'paquet', 'paket', 'पैक', 'حزم'])
      expect(body).not.toContain(bad)
    expect(body).not.toMatch(/di menu(?! →)/)
  })
})
