// The menu's rows and their lines (handoff/mini-servant/diseno-menu-recursos.md §1), with no page: main.ts draws what this
// decides, and the tests can run it without loading main.ts (it has side effects when imported).
import { bidiLabel } from './bidi'
import { downloadsSummary, pair, RT } from './resources'

export type PanelView = 'main' | 'language' | 'resources' | 'server' | 'settings' | 'online' | 'model' | 'usage' | 'safety'
export type Group = 'study' | 'phone' | 'settings'

/** What the menu needs to know, read by main.ts when it draws. */
export type MenuState = {
  ui: string
  /** a language is on the phone: Browse then has the Bible and Translation Academy */
  hasLang: boolean
  stories: boolean
  modes: boolean
  savedSub: string
  /** the Map row's line; null with fewer than 3 points (the row is not there) */
  map: string | null
  langs: number
  images: boolean
  uiName: string
  /** the language of the answers, or the words for "the one of my question" */
  answersName: string
  online: boolean
  update: boolean
  /** Security's own summary when discreet mode or a PIN is on; null otherwise */
  safety: string | null
}

type T = {
  study: string; phone: string; settings: string; resources: string; settingsRow: string
  bible: string; stories: string; academy: string; modes: string
  one: string; many: string; zero: string; img: string; setSub: string; setSubOff: string
  app: string; answers: string
  answersTitle: string; missing: string; toResources: string
}
const TX: Record<string, T> = {
  en: {
    study: 'STUDY', phone: 'ON THIS PHONE', settings: 'SETTINGS', resources: 'Resources', settingsRow: 'Settings',
    bible: 'Bible', stories: 'Stories', academy: 'Translation Academy', modes: 'Guided modes',
    one: '1 language', many: '{n} languages', zero: 'No language yet', img: ' · Bible Stories pictures', setSub: 'Online AI, model, security…', setSubOff: 'Model, security…',
    app: 'App', answers: 'Answers', answersTitle: 'Language of the answers', missing: 'Missing a language? Download it in Resources', toResources: 'Resources',
  },
  es: {
    study: 'ESTUDIAR', phone: 'EN ESTE TELÉFONO', settings: 'AJUSTES', resources: 'Recursos', settingsRow: 'Ajustes',
    bible: 'Biblia', stories: 'Historias', academy: 'Academia', modes: 'Modos guiados',
    one: '1 idioma', many: '{n} idiomas', zero: 'Ningún idioma todavía', img: ' · Imágenes de las Historias', setSub: 'IA en línea, modelo, seguridad…', setSubOff: 'Modelo, seguridad…',
    app: 'App', answers: 'Respuestas', answersTitle: 'Idioma de las respuestas', missing: '¿Falta un idioma? Descárgalo en Recursos', toResources: 'Recursos',
  },
  fr: {
    study: 'ÉTUDIER', phone: 'SUR CE TÉLÉPHONE', settings: 'RÉGLAGES', resources: 'Ressources', settingsRow: 'Réglages',
    bible: 'Bible', stories: 'Histoires', academy: 'Translation Academy', modes: 'Modes guidés',
    one: '1 langue', many: '{n} langues', zero: 'Aucune langue pour le moment', img: ' · Images des Histoires', setSub: 'IA en ligne, modèle, sécurité…', setSubOff: 'Modèle, sécurité…',
    app: 'Appli', answers: 'Réponses', answersTitle: 'Langue des réponses', missing: 'Il manque une langue ? Téléchargez-la dans Ressources', toResources: 'Ressources',
  },
  id: {
    study: 'BELAJAR', phone: 'DI PONSEL INI', settings: 'PENGATURAN', resources: 'Sumber daya', settingsRow: 'Pengaturan',
    bible: 'Alkitab', stories: 'Kisah', academy: 'Translation Academy', modes: 'Mode terpandu',
    one: '1 bahasa', many: '{n} bahasa', zero: 'Belum ada bahasa', img: ' · Gambar Kisah Alkitab', setSub: 'AI daring, model, keamanan…', setSubOff: 'Model, keamanan…',
    app: 'Aplikasi', answers: 'Jawaban', answersTitle: 'Bahasa jawaban', missing: 'Bahasa belum ada? Unduh di Sumber daya', toResources: 'Sumber daya',
  },
  hi: {
    study: 'अध्ययन', phone: 'इस फ़ोन पर', settings: 'सेटिंग', resources: 'संसाधन', settingsRow: 'सेटिंग',
    bible: 'बाइबल', stories: 'कहानियाँ', academy: 'Translation Academy', modes: 'निर्देशित मोड',
    one: '1 भाषा', many: '{n} भाषाएँ', zero: 'अभी कोई भाषा नहीं', img: ' · बाइबल कहानियों के चित्र', setSub: 'ऑनलाइन AI, मॉडल, सुरक्षा…', setSubOff: 'मॉडल, सुरक्षा…',
    app: 'ऐप', answers: 'उत्तर', answersTitle: 'उत्तरों की भाषा', missing: 'कोई भाषा नहीं है? संसाधन में डाउनलोड करें', toResources: 'संसाधन',
  },
  ar: {
    study: 'الدراسة', phone: 'على هذا الهاتف', settings: 'الإعدادات', resources: 'الموارد', settingsRow: 'الإعدادات',
    bible: 'الكتاب المقدس', stories: 'القصص', academy: 'Translation Academy', modes: 'الأوضاع الموجّهة',
    one: 'لغة واحدة', many: '{n} لغات', zero: 'لا توجد لغة بعد', img: ' · صور قصص الكتاب المقدس', setSub: 'الذكاء الاصطناعي عبر الإنترنت، النموذج، الأمان…', setSubOff: 'النموذج، الأمان…',
    app: 'التطبيق', answers: 'الإجابات', answersTitle: 'لغة الإجابات', missing: 'ينقصك لغة؟ نزّلها من الموارد', toResources: 'الموارد',
  },
}
export const MNT = (ui: string): T => TX[ui] ?? TX[ui.split('-')[0]!] ?? TX.en!

/** Arabic counts: two is a dual, 3 to 10 a plural, 11 and up the singular. */
function langsText(ui: string, n: number): string {
  const t = MNT(ui)
  if (n === 1) return t.one
  if (ui.split('-')[0] === 'ar') return n === 2 ? 'لغتان' : n <= 10 ? t.many.replace('{n}', String(n)) : `${n} لغة`
  return t.many.replace('{n}', String(n))
}

/** The Resources row's line: what is downloading, else how many languages (and the pictures), else that there is none. */
export function resourcesSub(s: MenuState): string {
  const t = MNT(s.ui)
  const d = downloadsSummary()
  // the same words and numbers as the Resources screen
  if (d) return bidiLabel(`${RT(s.ui).downloading} ${pair(d.a, d.b)}`, s.ui)
  return (s.langs ? langsText(s.ui, s.langs) : t.zero) + (s.images ? t.img : '')
}

/** Browse's line: only what is on the phone. */
function exploreSub(s: MenuState): string {
  const t = MNT(s.ui)
  const academy = bidiLabel(t.academy, s.ui)
  return [s.hasLang && t.bible, s.stories && t.stories, s.hasLang && academy, s.modes && t.modes].filter(Boolean).join(' · ')
}

/** The Settings row's line: Security's summary when discreet mode or a PIN is on, else the names of what is inside. */
function settingsSub(s: MenuState): string {
  const t = MNT(s.ui)
  return s.safety ?? (s.online ? t.setSub : t.setSubOff)
}

/** The language row's line. */
export function languageSub(s: MenuState): string {
  const t = MNT(s.ui)
  return `${t.app}: ${s.uiName} · ${t.answers}: ${s.answersName}`
}

/** The menu under the conversations: its three groups, each row with its id and its line. */
export function menuGroups(s: MenuState): { group: Group; rows: { id: string; sub: string }[] }[] {
  const study = [{ id: 'explore', sub: exploreSub(s) }, { id: 'saved', sub: s.savedSub }]
  if (s.map != null) study.push({ id: 'map', sub: s.map })
  return [
    { group: 'study', rows: study },
    { group: 'phone', rows: [{ id: 'resources', sub: resourcesSub(s) }] },
    { group: 'settings', rows: [{ id: 'language', sub: languageSub(s) }, { id: 'settings', sub: settingsSub(s) }] },
  ]
}

/** The rows of the Settings screen, in order: Online AI and Look for a new version only where they exist. */
export function settingsRows(s: Pick<MenuState, 'online' | 'update'>): string[] {
  return [...(s.online ? ['online'] : []), 'model', 'suggest', 'safety', 'usage', ...(s.update ? ['update'] : [])]
}

/** Where Back goes from a screen: one level up; null from the menu itself (the panel closes). */
export function backOf(v: PanelView): PanelView | null {
  if (v === 'main') return null
  if (v === 'online' || v === 'model' || v === 'usage' || v === 'safety') return 'settings'
  if (v === 'server') return 'resources'
  return 'main'
}
