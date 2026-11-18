// The menu's rows and lines (menu.ts): three groups, 5 or 6 rows, the Resources line, the Settings screen and Back by levels.
// menu.ts has no page, so this does not load main.ts.
import { afterEach, describe, expect, test } from 'bun:test'
import { backOf, languageSub, menuGroups, MNT, resourcesSub, settingsRows, type MenuState, type PanelView } from '../src/menu'
import { resetDownloads, startDownload } from '../src/resources'

const base: MenuState = {
  ui: 'es', hasLang: true, stories: true, modes: true, savedSub: 'Elementos: 3 · Notas: 1', map: '5 puntos · Rut 2:4', langs: 3, images: true,
  uiName: 'Español', answersName: 'El de mi pregunta', online: true, update: true, safety: null,
}
const ids = (s: MenuState) => menuGroups(s).flatMap((g) => g.rows.map((r) => r.id))
const sub = (s: MenuState, id: string) => menuGroups(s).flatMap((g) => g.rows).find((r) => r.id === id)!.sub
afterEach(() => resetDownloads())

describe('the groups and rows', () => {
  test('three groups in order, six rows with the Map', () => {
    const g = menuGroups(base)
    expect(g.map((x) => x.group)).toEqual(['study', 'phone', 'settings'])
    expect(ids(base)).toEqual(['explore', 'saved', 'map', 'resources', 'language', 'settings'])
  })
  test('five rows without the Map (fewer than 3 points)', () => {
    expect(ids({ ...base, map: null })).toEqual(['explore', 'saved', 'resources', 'language', 'settings'])
  })
  test('the rows do not depend on online AI or the update check: those are in Settings', () => {
    expect(ids({ ...base, online: false, update: false })).toEqual(ids(base))
  })
  test('Browse names only what is on the phone', () => {
    expect(sub(base, 'explore')).toBe('Biblia · Historias · Academia · Modos guiados')
    expect(sub({ ...base, stories: false }, 'explore')).toBe('Biblia · Academia · Modos guiados')
    expect(sub({ ...base, modes: false }, 'explore')).toBe('Biblia · Historias · Academia')
    expect(sub({ ...base, hasLang: false, stories: false, modes: false }, 'explore')).toBe('')
  })
  test('Saved and Map keep their own lines', () => {
    expect(sub(base, 'saved')).toBe('Elementos: 3 · Notas: 1')
    expect(sub(base, 'map')).toBe('5 puntos · Rut 2:4')
  })
  test('the language row says the app and the answers', () => {
    expect(languageSub(base)).toBe('App: Español · Respuestas: El de mi pregunta')
    expect(sub(base, 'language')).toBe('App: Español · Respuestas: El de mi pregunta')
  })
})

describe('the Resources line', () => {
  test('languages, with the pictures when they are there', () => {
    expect(resourcesSub(base)).toBe('3 idiomas · Imágenes de las Historias')
    expect(resourcesSub({ ...base, images: false })).toBe('3 idiomas')
    expect(resourcesSub({ ...base, langs: 1, images: false })).toBe('1 idioma')
  })
  test('no language yet', () => {
    expect(resourcesSub({ ...base, langs: 0, images: false })).toBe('Ningún idioma todavía')
  })
  test('while something downloads, the bytes so far and in all, like the Resources screen', () => {
    startDownload('images', (_s, p) => { p(3_250_000, 10_276_044); return new Promise<void>(() => {}) })
    expect(resourcesSub(base)).toBe('Descargando… 3.1 / 9.8 MB')
    expect(sub(base, 'resources')).toBe('Descargando… 3.1 / 9.8 MB')
  })
  test('the other languages', () => {
    expect(resourcesSub({ ...base, ui: 'en' })).toBe('3 languages · Bible Stories pictures')
    expect(resourcesSub({ ...base, ui: 'fr', langs: 2, images: false })).toBe('2 langues')
    expect(resourcesSub({ ...base, ui: 'id', langs: 0, images: false })).toBe('Belum ada bahasa')
    expect(resourcesSub({ ...base, ui: 'hi', langs: 3, images: false })).toBe('3 भाषाएँ')
  })
  test('Arabic: dual, plural, singular forms and isolated numbers', () => {
    const ar = { ...base, ui: 'ar', images: false }
    expect(resourcesSub({ ...ar, langs: 1 })).toBe('لغة واحدة')
    expect(resourcesSub({ ...ar, langs: 2 })).toBe('لغتان')
    expect(resourcesSub({ ...ar, langs: 3 })).toBe('3 لغات')
    expect(resourcesSub({ ...ar, langs: 11 })).toBe('11 لغة')
    startDownload('images', (_s, p) => { p(1_048_576, 2_097_152); return new Promise<void>(() => {}) })
    expect(resourcesSub(ar)).toMatch(/1\.0 \/ ⁨?2\.0 MB/)
    expect(resourcesSub(ar)).toContain('جارٍ التنزيل')
  })
})

describe('the Settings row and screen', () => {
  test('the row names what is inside, or says what Security has on', () => {
    expect(sub(base, 'settings')).toBe('IA en línea, modelo, seguridad…')
    expect(sub({ ...base, online: false }, 'settings')).toBe('Modelo, seguridad…')
    expect(sub({ ...base, safety: 'Modo discreto · PIN activado' }, 'settings')).toBe('Modo discreto · PIN activado')
    expect(sub({ ...base, safety: 'PIN activado' }, 'settings')).toBe('PIN activado')
  })
  test('the rows, in order, with and without online AI and the update check', () => {
    expect(settingsRows(base)).toEqual(['online', 'model', 'suggest', 'safety', 'usage', 'update'])
    expect(settingsRows({ online: false, update: true })).toEqual(['model', 'suggest', 'safety', 'usage', 'update'])
    expect(settingsRows({ online: true, update: false })).toEqual(['online', 'model', 'suggest', 'safety', 'usage'])
    expect(settingsRows({ online: false, update: false })).toEqual(['model', 'suggest', 'safety', 'usage'])
  })
})

describe('Back by levels', () => {
  test('one level up; the menu has none', () => {
    const up: Record<PanelView, PanelView | null> = {
      main: null, language: 'main', resources: 'main', settings: 'main', server: 'resources',
      online: 'settings', model: 'settings', usage: 'settings', safety: 'settings',
    }
    for (const [v, to] of Object.entries(up)) expect(backOf(v as PanelView)).toBe(to)
  })
  test('a chain of Back reaches the menu from the deepest screen', () => {
    let v: PanelView | null = 'safety'
    const seen: PanelView[] = []
    while (v) { seen.push(v); v = backOf(v) }
    expect(seen).toEqual(['safety', 'settings', 'main'])
  })
})

describe('the words', () => {
  test('every language has every text, and none says module, package, unit or catalog', () => {
    const bad = /módulo|paquete|unidad|catálogo|module|package|catalog|paket|मॉड्यूल|وحدة|حزمة/i
    for (const ui of ['en', 'es', 'fr', 'id', 'hi', 'ar']) {
      const t = MNT(ui)
      for (const [k, v] of Object.entries(t)) {
        expect(v, `${ui}.${k}`).toBeTruthy()
        expect(bad.test(v), `${ui}.${k}`).toBe(false)
      }
    }
    expect(MNT('es').study).toBe('ESTUDIAR')
    expect(MNT('ar').phone).toBe('على هذا الهاتف')
    expect(MNT('es').answersTitle).toBe('Idioma de las respuestas')
    expect(MNT('es').missing).toBe('¿Falta un idioma? Descárgalo en Recursos')
  })
  test('the Arabic menu has the design\'s group names', () => {
    expect([MNT('ar').study, MNT('ar').phone, MNT('ar').settings]).toEqual(['الدراسة', 'على هذا الهاتف', 'الإعدادات'])
  })
})
