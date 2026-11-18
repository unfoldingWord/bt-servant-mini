// The texts that name the menu (About, the online AI sign-in notice) point at the real rows: "Menu → Settings",
// "Menu → Resources", with the arrow that reads right in Arabic; and About names no "language pack".
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const src = (f: string) => readFileSync(`${import.meta.dir}/../src/${f}`, 'utf8')
const setup = src('setup.ts')
const main = src('main.ts')

describe('About and relogin name the menu rows', () => {
  test('About: the rows of the settings screen and of Resources', () => {
    for (const row of ['Menu → Settings', 'Menu → Resources', 'Menú → Ajustes', 'Menú → Recursos', 'Menu → Réglages', 'Menu → Ressources',
      'Menu → Pengaturan', 'Menu → Sumber daya', 'मेनू → सेटिंग', 'मेनू → संसाधन', 'القائمة ← الإعدادات', 'القائمة ← الموارد']) {
      expect(setup).toContain(row)
    }
  })
  test('About: no "in the menu" and no packs', () => {
    for (const bad of ['in the menu', 'en el menú', 'dans le menu', 'di menu', 'language pack', 'paquetes de idioma', 'paquets de langue', 'paket bahasa', 'भाषा पैकों', 'حزم اللغات'])
      expect(setup).not.toContain(bad)
  })
  test('relogin points at Menu → Settings → Online AI in each language', () => {
    for (const t of ['Menu → Settings → Online AI', 'Menú → Ajustes → IA en línea', 'Menu → Réglages → IA en ligne', 'Menu → Pengaturan → AI daring',
      'मेनू → सेटिंग → ऑनलाइन AI', 'القائمة ← الإعدادات ← الذكاء الاصطناعي عبر الإنترنت'])
      expect(main).toContain(t)
  })
})
