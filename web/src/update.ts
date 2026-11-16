// A new version of the Android app: while it is not in the Play Store, the app says when the landing site lists a newer
// release (site/latest.json, written with each release by site/make-latest.mjs) and opens that release's APK for this build
// (full or lite) in the browser, which downloads it; the person taps it to install. Never an automatic install.
// Privacy: the site is unfoldingWord's, so a network observer could see the phone talk to unfoldingWord. The daily check runs
// by itself only when the person already allows the internet (online AI or usage counts); otherwise only when they tap
// "Check for a new version" in the menu. The request is a plain GET of a fixed URL: no id, no version, no cookie.
// The web app updates itself and the iOS app is not there yet: neither gets any of this.
import { bidiLabel, rtlLang } from './bidi'

export const LATEST_URL = 'https://bt-servant-mini.unfoldingword.workers.dev/latest.json'
const RELEASES = '/unfoldingWord/bt-servant-mini/releases/' // the only links opened (the Android bridge checks the same)
const CHECKED = 'btsm.update.checked' // the day of the last automatic check (YYYY-MM-DD)
const LATEST = 'btsm.update.latest' // the last latest.json read, so the notice comes back without asking again
const DISMISSED = 'btsm.update.dismissed' // the versionCode whose notice was closed

export type Apk = { url: string; sha256: string; bytes: number }
export type Latest = { version: string; versionCode: number; notes_url?: string; full: Apk; lite: Apk }
export type Offer = { version: string; versionCode: number; url: string; bytes: number }

/** Only https links to this app's GitHub releases are opened (the Android bridge checks the same). */
export function safeUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && u.hostname === 'github.com' && u.pathname.startsWith(RELEASES) && !u.pathname.includes('..')
  } catch {
    return false
  }
}

const apk = (x: any): Apk | null =>
  x && safeUrl(x.url) && typeof x.sha256 === 'string' && /^[0-9a-f]{64}$/.test(x.sha256) && Number.isFinite(x.bytes) && x.bytes > 0
    ? { url: x.url, sha256: x.sha256, bytes: x.bytes }
    : null

/** latest.json checked: null when anything is missing or odd (then nothing is shown). */
export function parseLatest(x: unknown): Latest | null {
  const o = x as any
  if (!o || typeof o !== 'object') return null
  if (typeof o.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(o.version)) return null
  if (!Number.isInteger(o.versionCode) || o.versionCode <= 0) return null
  const full = apk(o.full), lite = apk(o.lite)
  if (!full || !lite) return null
  return { version: o.version, versionCode: o.versionCode, ...(safeUrl(o.notes_url) ? { notes_url: o.notes_url } : {}), full, lite }
}

/** What to offer this build: the release's APK of the same flavor, when it is newer than the app and was not dismissed. */
export function offerFor(l: Latest | null, current: number, flavor: string, dismissed = 0): Offer | null {
  if (!l || !(current > 0) || l.versionCode <= current || l.versionCode <= dismissed) return null
  const a = flavor === 'lite' ? l.lite : l.full
  return { version: l.version, versionCode: l.versionCode, url: a.url, bytes: a.bytes }
}

/** The automatic check: only when the person allows the internet, there is a connection, and not already today. */
export const autoCheckDue = (o: { allowed: boolean; online: boolean; last: string | null; today: string }): boolean =>
  o.allowed && o.online && o.last !== o.today

/** "18 MB", "375 MB" (the browser downloads this much). */
export const sizeText = (bytes: number): string => `${Math.max(1, Math.round(bytes / 1e6))} MB`

const pad = (n: number) => String(n).padStart(2, '0')
export const dayOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Reads latest.json: a plain GET, nothing sent with it. Null on any problem (no internet, timeout, a bad file). */
export async function fetchLatest(get: typeof fetch = fetch, ms = 10000): Promise<Latest | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await get(LATEST_URL, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctrl.signal })
    if (!r.ok) return null
    return parseLatest(await r.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export const UPDATE_T: Record<string, { found: string; install: string; close: string; check: string; checking: string; latest: string; failed: string; discreet: string }> = {
  en: { found: 'There is a new version: {v} · {size}', install: 'Install', close: 'Close', check: 'Check for a new version', checking: 'Checking…', latest: 'You have the latest version ({v})', failed: 'Could not check (is there internet?)', discreet: "Discreet mode: the APK will be saved in Downloads and the browser's history will show a GitHub page. Tap Install again to go on." },
  es: { found: 'Hay una versión nueva: {v} · {size}', install: 'Instalar', close: 'Cerrar', check: 'Buscar versión nueva', checking: 'Buscando…', latest: 'Tienes la última versión ({v})', failed: 'No se pudo buscar (¿hay internet?)', discreet: 'Modo discreto: el APK quedará en Descargas y el historial del navegador mostrará una página de GitHub. Toca Instalar otra vez para seguir.' },
  fr: { found: 'Une nouvelle version est disponible : {v} · {size}', install: 'Installer', close: 'Fermer', check: 'Chercher une nouvelle version', checking: 'Recherche…', latest: 'Vous avez la dernière version ({v})', failed: 'Impossible de vérifier (y a-t-il internet ?)', discreet: "Mode discret : l'APK sera enregistré dans Téléchargements et l'historique du navigateur montrera une page GitHub. Touchez Installer à nouveau pour continuer." },
  id: { found: 'Ada versi baru: {v} · {size}', install: 'Pasang', close: 'Tutup', check: 'Cari versi baru', checking: 'Mencari…', latest: 'Anda memakai versi terbaru ({v})', failed: 'Tidak dapat memeriksa (ada internet?)', discreet: 'Mode tersamar: APK akan disimpan di Unduhan dan riwayat browser akan menampilkan halaman GitHub. Ketuk Pasang lagi untuk melanjutkan.' },
  hi: { found: 'नया संस्करण उपलब्ध है: {v} · {size}', install: 'इंस्टॉल करें', close: 'बंद करें', check: 'नया संस्करण खोजें', checking: 'खोज रहे हैं…', latest: 'आपके पास नवीनतम संस्करण है ({v})', failed: 'जाँच नहीं हो सकी (क्या इंटरनेट है?)', discreet: 'गुप्त मोड: APK डाउनलोड में सहेजा जाएगा और ब्राउज़र के इतिहास में GitHub का एक पेज दिखेगा। जारी रखने के लिए फिर से इंस्टॉल करें पर टैप करें।' },
  ar: { found: 'يتوفر إصدار جديد: {v} · {size}', install: 'تثبيت', close: 'إغلاق', check: 'البحث عن إصدار جديد', checking: 'جارٍ البحث…', latest: 'لديك أحدث إصدار ({v})', failed: 'تعذّر التحقق (هل يوجد إنترنت؟)', discreet: 'الوضع المتحفّظ: سيُحفظ ملف APK في التنزيلات وسيظهر في سجل المتصفح صفحة من GitHub. المس «تثبيت» مرة أخرى للمتابعة.' },
}
const UT = (lang: string) => UPDATE_T[lang] ?? UPDATE_T.en!

// --- the app: the Android bridge, localStorage and the notice under the bar ---

const bridge = (): any => (typeof window !== 'undefined' ? (window as any).Android : undefined)
/** Only the Android app (not the iOS app, not the web app) with a bridge that knows its versionCode and can open a link. */
export function updateSupported(): boolean {
  try {
    const b = bridge()
    return !!b && b.platform?.() !== 'ios' && typeof b.versionCode === 'function' && typeof b.openUrl === 'function'
  } catch {
    return false
  }
}
const currentCode = (): number => {
  try {
    return Number(bridge()?.versionCode?.()) || 0
  } catch {
    return 0
  }
}
const flavor = (): string => {
  try {
    return bridge()?.flavor?.() ?? 'full'
  } catch {
    return 'full'
  }
}
const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {}
}
const stored = (): Latest | null => {
  try {
    return parseLatest(JSON.parse(get(LATEST) ?? 'null'))
  } catch {
    return null
  }
}

/** The menu row's state: what the last tap found. */
let rowState: 'idle' | 'checking' | 'latest' | 'found' | 'failed' = 'idle'
/** The menu row: its title, and what the last check found (empty before one). */
export function updateRow(lang: string): { title: string; sub: string } {
  const s = UT(lang)
  const l = stored()
  const sub = rowState === 'checking' ? s.checking : rowState === 'failed' ? s.failed
    : rowState === 'found' && l ? s.found.replace('{v}', l.version).replace(' · {size}', '')
    : rowState === 'latest' ? s.latest.replace('{v}', String(bridge()?.version?.() ?? '').replace(/-mini.*$/, '')) : ''
  return { title: s.check, sub }
}

/** The notice under the bar, when the last latest.json read lists a newer version that was not dismissed. */
export function showUpdateNote(lang: string, ignoreDismissed = false) {
  document.querySelector('#updnote')?.remove()
  if (!updateSupported()) return
  const o = offerFor(stored(), currentCode(), flavor(), ignoreDismissed ? 0 : Number(get(DISMISSED)) || 0)
  if (!o) return
  style()
  const s = UT(lang)
  const box = document.createElement('div')
  box.id = 'updnote'
  box.setAttribute('role', 'status')
  box.dir = rtlLang(lang) ? 'rtl' : 'auto' // a Latin name first must not turn an Arabic notice left to right
  const text = document.createElement('span')
  // "18 MB" and a "0.12.0-beta" kept whole in Arabic (bidi.ts)
  text.textContent = bidiLabel(s.found.replace('{v}', o.version).replace('{size}', sizeText(o.bytes)), lang)
  const go = document.createElement('button')
  go.type = 'button'
  go.className = 'go'
  go.textContent = s.install
  // in discreet mode, what the download leaves on the phone is said first; the second tap goes on
  let warned = false
  go.onclick = () => {
    try {
      if (!warned && bridge()?.discreet?.()) {
        warned = true
        text.textContent = s.discreet
        return
      }
      bridge()?.openUrl?.(o.url)
    } catch {}
  }
  const x = document.createElement('button')
  x.type = 'button'
  x.className = 'x'
  x.textContent = '×'
  x.setAttribute('aria-label', s.close)
  x.onclick = () => {
    set(DISMISSED, String(o.versionCode))
    box.remove()
  }
  box.append(text, go, x)
  document.querySelector('#notice')?.after(box)
}

/** Reads latest.json now and keeps it; shows the notice if it lists a newer version. A tap shows it even if it was closed. */
export async function checkForUpdate(lang: string, manual = false, changed: () => void = () => {}): Promise<void> {
  if (!updateSupported()) return
  if (manual) {
    rowState = 'checking'
    changed()
  }
  const l = await fetchLatest()
  if (l) set(LATEST, JSON.stringify(l))
  if (manual) rowState = !l ? 'failed' : offerFor(l, currentCode(), flavor()) ? 'found' : 'latest'
  showUpdateNote(lang, manual)
  if (manual) changed()
}

/**
 * At launch and when the connection comes back: the notice from the last read, and a new read once a day, only when the
 * person allows the internet (`allowed`: online AI or usage counts on) and there is a connection.
 */
export function autoCheckUpdate(lang: string, allowed: boolean, online: boolean) {
  if (!updateSupported()) return
  showUpdateNote(lang)
  const today = dayOf(new Date())
  if (!autoCheckDue({ allowed, online, last: get(CHECKED), today })) return
  set(CHECKED, today)
  checkForUpdate(lang).catch(() => {})
}

// the notice's look, as #pwahint and #netnote in index.html (kept here so this file is all there is to it)
function style() {
  if (document.querySelector('#updstyle')) return
  const st = document.createElement('style')
  st.id = 'updstyle'
  st.textContent = `#updnote { display: flex; gap: 8px; align-items: center; margin: 0 14px 8px; padding: 10px 12px; border-radius: 12px; background: var(--card); border-inline-start: 3px solid var(--accent); font: 13.5px/1.45 system-ui, sans-serif; color: var(--fg); }
#updnote span { flex: 1; }
#updnote .go { border: 0; border-radius: 999px; background: var(--accent); color: #fff; padding: 6px 12px; font: inherit; font-weight: 600; cursor: pointer; }
#updnote .x { border: 0; background: transparent; color: var(--muted); font-size: 18px; line-height: 1; padding: 0 2px; cursor: pointer; }`
  document.head.appendChild(st)
}
