// The Resources screen (what the phone can read without internet, and what it can still download) and the server screen
// (handoff/mini-servant/diseno-menu-recursos.md §2–§3). The downloads live here, outside the screens, in memory only: they
// survive leaving the screen, and nothing about them is stored (what is on the phone is read from the packs when a screen opens).
// The words on screen are never "module", "package", "unit" or "catalog": each part is called by its name.
import { bidiLabel, rtlLang } from './bidi'
import { fiveLine, partsOfReader, partsOfUnits, type PartId, type PartLine } from './modules'
import { covered5, on5m } from './five'
import { sizeText } from './obs'
import {
  downloadImages, exportImages, fill, IMAGES_COUNT, imagesCredit, imagesInstalled, imagesOffer, importedLine, IW, PACK_FILE, removeImages,
  type ImagesState,
} from './obsimg'
import {
  downloadLang, exportPack, importPack, installedLangs, installedUnits, meteredNow, offerCandidates, offerOf, offers, openLang, origin,
  PACK_NAMES, partialLangs, partialMark, removeLang, serverSource, serverUnitSize, addUnits, type Offer,
} from './packs'
import type { CatalogOffer } from './packs'

// ---------------------------------------------------------------------------------------------------- the downloads

export type DownloadKey = `lang:${string}` | `part:${string}:${PartId}` | 'images'
export type Download = { key: DownloadKey; a: number; b: number; error?: string; done?: boolean }
type Run = (signal: AbortSignal, progress: (a: number, b: number) => void) => Promise<void>
type Entry = Download & { ctl: AbortController; run: Run; net?: boolean }

const dl = new Map<DownloadKey, Entry>()
const watchers = new Set<() => void>()
// Counts the downloads that ended (well, canceled or failed): a screen reads the packs again when it moves
let settled = 0
const notify = () => { for (const f of [...watchers]) try { f() } catch { /* a screen that fails to draw must not stop the rest */ } }

/** What is downloading, failed or just finished (in memory only). */
export const downloads = (): Download[] => [...dl.values()].map(({ key, a, b, error, done }) => ({ key, a, b, ...(error ? { error } : {}), ...(done ? { done } : {}) }))
/** For the menu's line: the bytes so far and in all of what is downloading now; null when nothing is. */
export function downloadsSummary(): { a: number; b: number } | null {
  const on = [...dl.values()].filter((d) => !d.error && !d.done)
  return on.length ? { a: on.reduce((n, d) => n + d.a, 0), b: on.reduce((n, d) => n + d.b, 0) } : null
}
/** Called on every change of the downloads (progress included); returns how to stop hearing. */
export function onDownloads(f: () => void): () => void {
  watchers.add(f)
  return () => void watchers.delete(f)
}
/** Starts a download (a key already downloading is left alone). A failure stays in the entry, for [Try again]; a cancel leaves nothing. */
export function startDownload(key: DownloadKey, run: Run): void {
  if (dl.get(key) && !dl.get(key)!.error) return
  const ctl = new AbortController()
  const e: Entry = { key, a: 0, b: 0, ctl, run }
  dl.set(key, e)
  notify()
  void run(ctl.signal, (a, b) => { e.a = a; e.b = b; notify() }).then(
    () => {
      e.done = true
      settled++
      notify()
      if (dl.get(key) === e) dl.delete(key)
    },
    (err) => {
      settled++
      if (ctl.signal.aborted) { if (dl.get(key) === e) dl.delete(key) } else { console.warn(`download ${key} failed:`, err); e.error = err instanceof Error ? err.message : String(err); e.net = isNetError(err) }
      notify()
    },
  )
}
export function cancelDownload(key: DownloadKey): void {
  dl.get(key)?.ctl.abort(new Error('canceled'))
}
/** How many screens follow the downloads now (tests: none may be left after a screen is disposed). */
export const watching = (): number => watchers.size
/** Tests: forget every download. */
export function resetDownloads(): void {
  for (const e of dl.values()) e.ctl.abort()
  dl.clear()
  watchers.clear()
  scan = null
  fresh.clear()
}

// What the screen reaches (tests put their own here)
export const deps = {
  installedLangs, origin, openLang, installedUnits, partialLangs, partialMark, offers, offerCandidates, offerOf, downloadLang, addUnits,
  removeLang, exportPack, importPack,
  // model.ts sets handlers on `window` when loaded: only the share button needs it
  saveToDownloads: async (...a: Parameters<typeof import('./model').saveToDownloads>) => (await import('./model')).saveToDownloads(...a),
  imagesInstalled, imagesOffer, downloadImages, exportImages, removeImages, imagesCredit,
  meteredNow, serverUnitSize, serverSource,
  online: (): boolean => (globalThis as any).navigator?.onLine !== false,
}

// ---------------------------------------------------------------------------------------------------- words

type T = {
  intro: string; langs: string; shipped: string; added: string; unfinished: string
  bible: string; bibleS: string; tw: string; ta: string; orig: string; obs: string; five: string; lack: string; lack1: string; incomplete: string
  noFor: string; noLangs: string; all: string; more: string; search: string; openFile: string
  failedGen: string; back: string; download: string; resume: string; remove: string; share: string; cancel: string; retry: string; downloading: string; failed: string
  needNet: string; metered: string; differs: string; saved: string; working: string
  images: string; imagesHave: string; imagesNone: string; imagesPartial: string; there: string
  serverTitle: string; looking: string; offline: string; noneNew: string; fixed: string
}
const TX: Record<string, T> = {
  en: {
    intro: 'What the app can read without internet. Each language brings the Bible and its helps; the pictures serve all of them. The language of the answers is chosen in Settings → Language.',
    langs: 'Languages', shipped: 'comes with the app', added: 'you downloaded it', unfinished: 'download not finished',
    bible: 'Bible: {c}, with notes and questions', bibleS: 'Bible: {c}', tw: 'Key Words', ta: 'Translation Academy: {c}',
    orig: 'Original text (Hebrew and Greek)', obs: 'Bible Stories', five: '5M session: {c}', lack: '{name}: {c} missing', lack1: '{name}: {c} missing', incomplete: '{name} (not whole)',
    noFor: 'Not available for this language: {parts}', noLangs: 'There is no language on this phone yet.',
    all: 'For all languages', more: 'Download more', search: 'Look for more languages on the server', openFile: 'Open a file you received',
    download: 'Download', resume: 'Continue', remove: 'Remove', share: 'Save to share', cancel: 'Cancel', retry: 'Try again',
    downloading: 'Downloading…', failed: 'It could not be downloaded:', failedGen: 'It could not be downloaded.', back: 'Resources', needNet: 'Internet is needed to download.',
    metered: '{mb} over mobile data. Continue?', differs: 'It is {mb}. Continue?', saved: 'Saved in Downloads', working: 'Working…',
    images: 'Bible Stories pictures', imagesHave: '{c} · {mb} ✓', imagesNone: 'Not on this phone.',
    imagesPartial: 'Download not finished: no picture shows yet.', there: 'already on the phone',
    serverTitle: 'On the server', looking: 'Looking… ({n} of {total})', offline: 'No internet, or the server did not answer.',
    noneNew: 'The server has no other languages yet.', fixed: 'The app looks in a fixed list of languages.',
  },
  es: {
    intro: 'Lo que la app puede leer sin internet. Cada idioma trae la Biblia y sus ayudas; las imágenes sirven para todos. El idioma de las respuestas se elige en Ajustes → Idioma.',
    langs: 'Idiomas', shipped: 'viene con la app', added: 'lo descargaste', unfinished: 'descarga sin terminar',
    bible: 'Biblia: {c}, con notas y preguntas', bibleS: 'Biblia: {c}', tw: 'Palabras clave', ta: 'Translation Academy: {c}',
    orig: 'Texto original (hebreo y griego)', obs: 'Historias de la Biblia', five: 'Sesión 5M: {c}', lack: '{name}: faltan {c}', lack1: '{name}: falta {c}', incomplete: '{name} (incompleto)',
    noFor: 'No viene para este idioma: {parts}', noLangs: 'Todavía no hay ningún idioma en este teléfono.',
    all: 'Para todos los idiomas', more: 'Descargar más', search: 'Buscar más idiomas en el servidor', openFile: 'Abrir un archivo recibido',
    download: 'Descargar', resume: 'Seguir', remove: 'Quitar', share: 'Guardar para compartir', cancel: 'Cancelar', retry: 'Reintentar',
    downloading: 'Descargando…', failed: 'No se pudo descargar:', failedGen: 'No se pudo descargar.', back: 'Recursos', needNet: 'Hace falta internet para descargar.',
    metered: '{mb} por datos móviles. ¿Seguir?', differs: 'Son {mb}. ¿Seguir?', saved: 'Guardado en Descargas', working: 'Trabajando…',
    images: 'Imágenes de las Historias de la Biblia', imagesHave: '{c} · {mb} ✓', imagesNone: 'No están en el teléfono.',
    imagesPartial: 'Descarga sin terminar: aún no se ve ninguna imagen.', there: 'ya están en el teléfono',
    serverTitle: 'En el servidor', looking: 'Buscando… ({n} de {total})', offline: 'Sin internet, o el servidor no respondió.',
    noneNew: 'El servidor todavía no tiene otros idiomas.', fixed: 'La app busca en una lista fija de idiomas.',
  },
  fr: {
    intro: "Ce que l'application peut lire sans internet. Chaque langue apporte la Bible et ses aides ; les images servent à toutes. La langue des réponses se choisit dans Réglages → Langue.",
    langs: 'Langues', shipped: "vient avec l'application", added: 'vous l’avez téléchargée', unfinished: 'téléchargement inachevé',
    bible: 'Bible : {c}, avec notes et questions', bibleS: 'Bible : {c}', tw: 'Mots clés', ta: 'Translation Academy : {c}',
    orig: 'Texte original (hébreu et grec)', obs: 'Histoires de la Bible', five: 'Séance 5M : {c}', lack: '{name} : il en manque {c}', lack1: '{name} : il en manque {c}', incomplete: '{name} (incomplet)',
    noFor: "Non disponible pour cette langue : {parts}", noLangs: "Il n'y a encore aucune langue sur ce téléphone.",
    all: 'Pour toutes les langues', more: 'Télécharger plus', search: 'Chercher d’autres langues sur le serveur', openFile: 'Ouvrir un fichier reçu',
    download: 'Télécharger', resume: 'Continuer', remove: 'Retirer', share: 'Enregistrer pour partager', cancel: 'Annuler', retry: 'Réessayer',
    downloading: 'Téléchargement…', failed: 'Le téléchargement a échoué :', failedGen: 'Le téléchargement a échoué.', back: 'Ressources', needNet: 'Il faut internet pour télécharger.',
    metered: '{mb} par les données mobiles. Continuer ?', differs: 'Cela fait {mb}. Continuer ?', saved: 'Enregistré dans Téléchargements', working: 'En cours…',
    images: 'Images des Histoires de la Bible', imagesHave: '{c} · {mb} ✓', imagesNone: 'Pas sur ce téléphone.',
    imagesPartial: "Téléchargement inachevé : aucune image ne s'affiche encore.", there: 'déjà sur le téléphone',
    serverTitle: 'Sur le serveur', looking: 'Recherche… ({n} sur {total})', offline: "Pas d'internet, ou le serveur n'a pas répondu.",
    noneNew: "Le serveur n'a pas encore d'autres langues.", fixed: "L'application cherche dans une liste fixe de langues.",
  },
  id: {
    intro: 'Apa yang bisa dibaca aplikasi tanpa internet. Setiap bahasa membawa Alkitab dan bantuannya; gambar berlaku untuk semua. Bahasa jawaban dipilih di Pengaturan → Bahasa.',
    langs: 'Bahasa', shipped: 'bawaan aplikasi', added: 'kamu unduh', unfinished: 'unduhan belum selesai',
    bible: 'Alkitab: {c}, dengan catatan dan pertanyaan', bibleS: 'Alkitab: {c}', tw: 'Kata kunci', ta: 'Translation Academy: {c}',
    orig: 'Teks asli (Ibrani dan Yunani)', obs: 'Kisah-kisah Alkitab', five: 'Sesi 5M: {c}', lack: '{name}: kurang {c}', lack1: '{name}: kurang {c}', incomplete: '{name} (belum lengkap)',
    noFor: 'Tidak tersedia untuk bahasa ini: {parts}', noLangs: 'Belum ada bahasa di ponsel ini.',
    all: 'Untuk semua bahasa', more: 'Unduh lebih banyak', search: 'Cari bahasa lain di server', openFile: 'Buka berkas yang diterima',
    download: 'Unduh', resume: 'Lanjutkan', remove: 'Hapus', share: 'Simpan untuk dibagikan', cancel: 'Batal', retry: 'Coba lagi',
    downloading: 'Mengunduh…', failed: 'Tidak bisa diunduh:', failedGen: 'Tidak bisa diunduh.', back: 'Sumber daya', needNet: 'Perlu internet untuk mengunduh.',
    metered: '{mb} lewat data seluler. Lanjutkan?', differs: 'Ukurannya {mb}. Lanjutkan?', saved: 'Tersimpan di Unduhan', working: 'Sedang bekerja…',
    images: 'Gambar Kisah-kisah Alkitab', imagesHave: '{c} · {mb} ✓', imagesNone: 'Belum ada di ponsel ini.',
    imagesPartial: 'Unduhan belum selesai: belum ada gambar yang tampil.', there: 'sudah ada di ponsel',
    serverTitle: 'Di server', looking: 'Mencari… ({n} dari {total})', offline: 'Tidak ada internet, atau server tidak menjawab.',
    noneNew: 'Server belum punya bahasa lain.', fixed: 'Aplikasi mencari di daftar bahasa yang tetap.',
  },
  hi: {
    intro: 'ऐप बिना इंटरनेट के क्या पढ़ सकता है। हर भाषा बाइबल और उसकी सहायता लाती है; चित्र सभी भाषाओं के काम आते हैं। उत्तरों की भाषा सेटिंग → भाषा में चुनी जाती है।',
    langs: 'भाषाएँ', shipped: 'ऐप के साथ आती है', added: 'आपने डाउनलोड की', unfinished: 'डाउनलोड अधूरा',
    bible: 'बाइबल: {c}, नोट्स और प्रश्नों के साथ', bibleS: 'बाइबल: {c}', tw: 'मुख्य शब्द', ta: 'Translation Academy: {c}',
    orig: 'मूल पाठ (इब्रानी और यूनानी)', obs: 'बाइबल की कहानियाँ', five: '5M सत्र: {c}', lack: '{name}: {c} कम', lack1: '{name}: {c} कम', incomplete: '{name} (अधूरा)',
    noFor: 'इस भाषा के लिए उपलब्ध नहीं: {parts}', noLangs: 'इस फ़ोन पर अभी कोई भाषा नहीं है।',
    all: 'सभी भाषाओं के लिए', more: 'और डाउनलोड करें', search: 'सर्वर पर और भाषाएँ खोजें', openFile: 'मिली हुई फ़ाइल खोलें',
    download: 'डाउनलोड करें', resume: 'जारी रखें', remove: 'हटाएँ', share: 'साझा करने के लिए सहेजें', cancel: 'रद्द करें', retry: 'फिर कोशिश करें',
    downloading: 'डाउनलोड हो रहा है…', failed: 'डाउनलोड नहीं हो सका:', failedGen: 'डाउनलोड नहीं हो सका।', back: 'संसाधन', needNet: 'डाउनलोड के लिए इंटरनेट चाहिए।',
    metered: 'मोबाइल डेटा से {mb}। जारी रखें?', differs: 'यह {mb} है। जारी रखें?', saved: 'डाउनलोड में सहेजा गया', working: 'काम हो रहा है…',
    images: 'बाइबल की कहानियों के चित्र', imagesHave: '{c} · {mb} ✓', imagesNone: 'फ़ोन पर नहीं हैं।',
    imagesPartial: 'डाउनलोड अधूरा: अभी कोई चित्र नहीं दिखता।', there: 'फ़ोन पर पहले से हैं',
    serverTitle: 'सर्वर पर', looking: 'खोज रहे हैं… ({total} में से {n})', offline: 'इंटरनेट नहीं है, या सर्वर ने उत्तर नहीं दिया।',
    noneNew: 'सर्वर पर अभी और भाषाएँ नहीं हैं।', fixed: 'ऐप भाषाओं की एक तय सूची में खोजता है।',
  },
  ar: {
    intro: 'ما يستطيع التطبيق قراءته دون إنترنت. كل لغة تجلب الكتاب المقدس ومساعداته؛ والصور تفيد كل اللغات. لغة الإجابات تُختار في الإعدادات ← اللغة.',
    langs: 'اللغات', shipped: 'تأتي مع التطبيق', added: 'نزّلتها', unfinished: 'تنزيل لم يكتمل',
    bible: 'الكتاب المقدس: {c}، مع الملاحظات والأسئلة', bibleS: 'الكتاب المقدس: {c}', tw: 'الكلمات الرئيسية', ta: '⁨Translation Academy⁩: {c}',
    orig: 'النص الأصلي (العبري واليوناني)', obs: 'قصص الكتاب المقدس', five: 'جلسة ⁨5M⁩: {c}', lack: '{name}: ينقص {c}', lack1: '{name}: ينقص {c}', incomplete: '{name} (غير كامل)',
    noFor: 'لا تأتي لهذه اللغة: {parts}', noLangs: 'لا توجد أي لغة على هذا الهاتف بعد.',
    all: 'لكل اللغات', more: 'تنزيل المزيد', search: 'البحث عن لغات أخرى في الخادم', openFile: 'فتح ملف مستلَم',
    download: 'تنزيل', resume: 'متابعة', remove: 'إزالة', share: 'حفظ للمشاركة', cancel: 'إلغاء', retry: 'إعادة المحاولة',
    downloading: 'جارٍ التنزيل…', failed: 'تعذّر التنزيل:', failedGen: 'تعذّر التنزيل.', back: 'الموارد', needNet: 'يلزم الاتصال بالإنترنت للتنزيل.',
    metered: '{mb} عبر بيانات الجوال. هل تتابع؟', differs: 'الحجم {mb}. هل تتابع؟', saved: 'حُفظ في التنزيلات', working: 'جارٍ العمل…',
    images: 'صور قصص الكتاب المقدس', imagesHave: '{c} · {mb} ✓', imagesNone: 'ليست على الهاتف.',
    imagesPartial: 'لم يكتمل التنزيل: لا تظهر أي صورة بعد.', there: 'موجودة على الهاتف',
    serverTitle: 'على الخادم', looking: 'جارٍ البحث… ({n} من {total})', offline: 'لا يوجد إنترنت، أو لم يُجب الخادم.',
    noneNew: 'لا توجد لغات أخرى على الخادم بعد.', fixed: 'يبحث التطبيق في قائمة ثابتة من اللغات.',
  },
}
export const RT = (ui: string): T => TX[ui] ?? TX[ui.split('-')[0]!] ?? TX.en!

type Kind = 'book' | 'manual' | 'story' | 'picture'
const FORMS: Record<string, Record<Kind, [string, string]>> = {
  en: { book: ['book', 'books'], manual: ['manual', 'manuals'], story: ['story', 'stories'], picture: ['picture', 'pictures'] },
  es: { book: ['libro', 'libros'], manual: ['manual', 'manuales'], story: ['historia', 'historias'], picture: ['imagen', 'imágenes'] },
  fr: { book: ['livre', 'livres'], manual: ['manuel', 'manuels'], story: ['histoire', 'histoires'], picture: ['image', 'images'] },
  id: { book: ['kitab', 'kitab'], manual: ['manual', 'manual'], story: ['kisah', 'kisah'], picture: ['gambar', 'gambar'] },
  hi: { book: ['पुस्तक', 'पुस्तकें'], manual: ['मैनुअल', 'मैनुअल'], story: ['कहानी', 'कहानियाँ'], picture: ['चित्र', 'चित्र'] },
}
// Arabic: one, two, three to ten (plural), eleven and more (singular, accusative)
const AR: Record<Kind, [string, string, string, string]> = {
  book: ['سفر واحد', 'سفران', 'أسفار', 'سفرًا'], manual: ['دليل واحد', 'دليلان', 'أدلة', 'دليلًا'],
  story: ['قصة واحدة', 'قصتان', 'قصص', 'قصة'], picture: ['صورة واحدة', 'صورتان', 'صور', 'صورة'],
}
/** "6 books", "2 manuals", "3 stories" in each language (Arabic has its own forms for one, two, three to ten, and more). */
export function count(ui: string, kind: Kind, n: number): string {
  const l = ui.split('-')[0]!
  if (l === 'ar') {
    const f = AR[kind]
    return n === 1 ? f[0] : n === 2 ? f[1] : n <= 10 ? `${n} ${f[2]}` : `${n} ${f[3]}` // zero takes the plural
  }
  const f = (FORMS[l] ?? FORMS.en!)[kind]
  return `${n} ${n === 1 ? f[0] : f[1]}`
}
/** A list of names with the language's own separator. */
const list = (ui: string, xs: string[]) => xs.join(rtlLang(ui) ? '، ' : ', ')
const name = (ui: string, id: PartId): string => {
  const t = RT(ui)
  const s = id === 'bible' ? t.bibleS.replace(/[:：]\s*\{c\}$/, '') : id === 'ta' ? t.ta.replace(/[:：]\s*\{c\}$/, '') : t[id]
  return s
}
/** The line of a part that is there ("Bible: 6 books…"), or its plain name. */
function haveText(ui: string, p: PartLine, short: boolean): string {
  const t = RT(ui)
  if (p.id === 'bible') return (short ? t.bibleS : t.bible).replace('{c}', count(ui, 'book', p.n ?? 0))
  if (p.id === 'ta') return t.ta.replace('{c}', count(ui, 'manual', p.n ?? 0))
  return t[p.id]
}
const text = (s: string, ui: string) => bidiLabel(s, ui)
const mbOf = (n: number) => sizeText(n)
/** "3.1 / 9.8 MB": both in one unit (KB under a megabyte), the app's decimal point. */
export function pair(a: number, b: number): string {
  if (b >= 1048576) return `${(a / 1048576).toFixed(1)} / ${(b / 1048576).toFixed(1)} MB`
  if (b > 0) return `${Math.round(a / 1024)} / ${Math.max(1, Math.round(b / 1024))} KB`
  return mbOf(a)
}
const prog = (ui: string, a: number, b: number) => `${RT(ui).downloading} ${pair(a, b)}`
/** Whether a failure is about the connection: by its type (fetch fails with a TypeError, a timeout is an AbortError or TimeoutError), then by our own words. */
export function isNetError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name
  if (err instanceof TypeError || name === 'AbortError' || name === 'TimeoutError' || name === 'NetworkError') return true
  const m = err instanceof Error ? err.message : String(err)
  return /^(offline|timeout)$/i.test(m) || /offline|network|timeout|failed to fetch|stalled|unreachable|no answer/i.test(m)
}
/** What a failure says on screen: never the raw message (English, and it names packs); that goes to the console only. */
function failText(ui: string, net: boolean | undefined): string {
  return net ? RT(ui).needNet : RT(ui).failedGen
}

// ---------------------------------------------------------------------------------------------------- small DOM helpers

function el(tag: string, cls = '', txt?: string): HTMLElement {
  const d = document.createElement(tag)
  if (cls) d.className = cls
  if (txt !== undefined) d.textContent = txt
  return d
}
function btn(txt: string, on: () => void, cls = 'small'): HTMLButtonElement {
  const b = el('button', cls, txt) as HTMLButtonElement
  b.type = 'button'
  b.onclick = on
  return b
}
// What a button said last and which taps wait for a second one (reset when a screen opens)
const hints = new Map<string, string>()
const confirmed = new Set<string>()
let imgOffer: CatalogOffer | null | undefined // undefined: not asked yet
/**
 * The questions before a download, for every kind (a language, a part, the pictures) and for a retry: no internet (also on the
 * confirming tap), mobile data, and a size that is not the one shown. The first tap may only change the button's words; true when
 * the download can start.
 */
async function gate(ui: string, key: string, shown: number, real: () => Promise<number | null>, again: () => void): Promise<boolean> {
  const t = RT(ui)
  const second = confirmed.delete(key)
  if (!deps.online()) { hints.set(key, t.needNet); again(); return false }
  if (second) { hints.delete(key); return true }
  const r = (await real().catch(() => null)) ?? shown
  const metered = deps.meteredNow() === true
  // a size more than 20 % off the one shown is said before the download
  const differs = shown > 0 && Math.abs(r - shown) > 0.2 * shown
  if (metered || differs) {
    hints.set(key, fill(metered ? t.metered : t.differs, { mb: mbOf(r) }))
    confirmed.add(key)
    again()
    return false
  }
  hints.delete(key)
  return true
}

/** One screen drawn into a host: a new one disposes the one before (their watchers would repaint each other). */
const disposers = new WeakMap<HTMLElement, () => void>()
function mount(host: HTMLElement) {
  disposers.get(host)?.()
  const st = { dead: false, seen: host.isConnected === true, off: null as (() => void) | null }
  const dispose = () => {
    st.dead = true
    st.off?.()
    st.off = null
    if (disposers.get(host) === dispose) disposers.delete(host)
  }
  disposers.set(host, dispose)
  // a host that was never on the page (a box still being built) is not "gone": only one that was and left
  const gone = () => {
    if (host.isConnected === true) st.seen = true
    return st.dead || (st.seen && host.isConnected === false)
  }
  /** Follow the downloads until disposed, or until the host leaves the page. */
  const watch = (f: () => void) => {
    if (st.dead) return
    st.off = onDownloads(() => {
      if (gone()) return dispose()
      f()
    })
  }
  return { st, dispose, watch, gone }
}
/** Stops the screen drawn into `host` right away (its render may still be waiting for the packs or the server). */
export const disposeHost = (host: HTMLElement): void => disposers.get(host)?.()

// ---------------------------------------------------------------------------------------------------- Resources

type LangCard = { lang: string; from: 'added' | 'shipped'; parts: PartLine[] }
type Partial = { lang: string; b: number | null }
type Model = { langs: LangCard[]; partial: Partial[]; images: ImagesState }
export type ResCtx = { ui: string; refresh: () => void; openServer: () => void; openLanguage: () => void }

async function load(): Promise<Model> {
  const have = await deps.installedLangs()
  const langs: LangCard[] = []
  for (const l of have) {
    const from = (await deps.origin(l)) ?? 'shipped'
    // a downloaded language is told from its stored catalog; one that comes with the app only from what its files hold
    const parts = from === 'added' ? partsOfReader(await deps.openLang(l, true)) : partsOfUnits(await deps.installedUnits(l))
    langs.push({ lang: l, from, parts })
  }
  const partial = deps.partialLangs().filter((l) => !have.includes(l)).map((l) => ({ lang: l, b: deps.partialMark(l)?.b ?? null }))
  return { langs, partial, images: await deps.imagesInstalled().catch(() => null) }
}

/** A download's line: its progress and [Cancel], or its failure (in words, never the raw message) and [Try again]; null when it is not there. */
function activeLine(ui: string, key: DownloadKey, retry: () => void): HTMLElement | null {
  const d = dl.get(key)
  if (!d) return null
  const t = RT(ui)
  const row = el('div', 'row res-dl')
  if (d.error) row.append(el('span', 'grow', text(failText(ui, d.net), ui)), btn(text(hints.get(key) ?? t.retry, ui), retry))
  else row.append(el('span', 'grow', text(prog(ui, d.a, d.b), ui)), btn(t.cancel, () => cancelDownload(key)))
  return row
}

type Paint = { ctx: ResCtx; host: HTMLElement; say: (s: string) => void; repaint: () => void; dead: () => boolean }

function shareButton(p: Paint, make: () => Promise<{ bytes: Uint8Array; file: string; mime?: string }>): HTMLButtonElement {
  const t = RT(p.ctx.ui)
  return btn(t.share, async () => {
    p.say(t.working)
    try {
      const { bytes, file, mime } = await make()
      const err = await deps.saveToDownloads(file, bytes, ...(mime ? [mime] : []) as [string?])
      if (err) console.warn('saving the file failed:', err)
      p.say(err ? t.failedGen : `${t.saved} (${mbOf(bytes.length)})`)
    } catch (e) {
      console.warn('sharing failed:', e)
      p.say(t.failedGen)
    }
  })
}

function langCard(p: Paint, c: LangCard): HTMLElement {
  const ui = p.ctx.ui
  const t = RT(ui)
  const card = el('div', 'res-card')
  card.dataset.lang = c.lang
  card.appendChild(el('div', 'res-name', text(`${PACK_NAMES[c.lang] ?? c.lang} · ${c.from === 'added' ? t.added : t.shipped}`, ui)))
  const absent: string[] = []
  for (const part of c.parts) {
    if (part.state === 'absent') {
      // the original text is never offered: it comes with each book
      if (part.id !== 'orig' && c.from === 'added') absent.push(name(ui, part.id))
      continue
    }
    if (part.state === 'have') {
      const line = el('div', 'res-line', text(`✓ ${haveText(ui, part, false)}`, ui))
      line.dataset.part = part.id
      card.appendChild(line)
      continue
    }
    // missing: only a part that can be added
    const key: DownloadKey = `part:${c.lang}:${part.id}`
    const n = part.n ?? 0
    const label = !n ? name(ui, part.id) : part.id === 'bible' ? (part.missing.length === 1 ? t.lack1 : t.lack).replace('{name}', name(ui, part.id)).replace('{c}', count(ui, 'book', part.missing.length))
      : part.id === 'ta' ? (part.missing.length === 1 ? t.lack1 : t.lack).replace('{name}', name(ui, part.id)).replace('{c}', count(ui, 'manual', part.missing.length))
        : t.incomplete.replace('{name}', name(ui, part.id))
    const line = el('div', 'res-line', text(`＋ ${label}`, ui))
    line.dataset.part = part.id
    card.appendChild(line)
    card.appendChild(activeLine(ui, key, () => void startPart(p, c.lang, part, key)) ?? (() => {
      const row = el('div', 'row')
      const base = part.bytes ? `${t.download} · ≈${mbOf(part.bytes)}` : t.download
      row.appendChild(btn(text(hints.get(key) ?? base, ui), () => void startPart(p, c.lang, part, key)))
      return row
    })())
  }
  // the 5M session rides with the Stories (no unit of its own)
  const f = fiveLine(on5m(), covered5().length)
  if (f && c.parts.some((x) => x.id === 'obs' && x.state === 'have')) card.appendChild(el('div', 'res-line note', text(t.five.replace('{c}', count(ui, 'story', f.n)), ui)))
  if (absent.length) card.appendChild(el('div', 'res-line note', text(t.noFor.replace('{parts}', list(ui, absent)), ui)))
  const row = el('div', 'row res-btns')
  row.appendChild(shareButton(p, async () => ({ bytes: await deps.exportPack(c.lang), file: `bt-servant-mini-${c.lang}.tcpack` })))
  if (c.from === 'added') row.appendChild(btn(t.remove, async () => { await deps.removeLang(c.lang); p.ctx.refresh() }, 'small del'))
  card.appendChild(row)
  return card
}

/** A part from its card (and its retry): the gate, then `addUnits` of what is missing. */
async function startPart(p: Paint, lang: string, part: PartLine, key: DownloadKey) {
  const ui = p.ctx.ui
  // the real size: the sum of what the server lists for those parts now (a catalog read once for all)
  const real = async () => {
    const src = deps.serverSource()
    const memo: Record<string, Promise<any>> = {}
    const cached = { ...src, catalog: (n: string, o?: any) => (memo[n] ??= (src as any).catalog(n, o)) } as typeof src
    let sum = 0
    for (const u of part.missing) sum += (await deps.serverUnitSize(lang, u, cached)) ?? 0
    return sum || null
  }
  if (!(await gate(ui, key, part.bytes, real, p.repaint))) return void p.repaint()
  startDownload(key, async (signal, progress) => {
    await deps.addUnits(lang, part.missing, { signal, onProgress: (x) => progress(x.bytes, x.totalBytes) })
    if (!p.dead()) p.ctx.refresh()
  })
}

/**
 * A whole language (a half download's [Continue], the server's [Download], and their retries): the offer is asked again at each tap, so
 * the size is today's and a retry never reuses an old plan. `shown` is the size the button showed (0: none known).
 */
// the offer of the first tap, kept for the confirming one: the size the person agreed to is the size that downloads
const fresh = new Map<string, Offer>()
async function startLang(p: Paint, lang: string, shown: number, first: Offer | null) {
  const ui = p.ctx.ui
  const key: DownloadKey = `lang:${lang}`
  // a first tap starts from nothing: an offer kept from an earlier tap is never used
  if (!confirmed.has(key)) fresh.delete(key)
  const real = async () => {
    const o = await deps.offerOf(lang)
    if (o) fresh.set(key, o)
    return o?.bytes ?? null
  }
  if (!(await gate(ui, key, shown, real, p.repaint))) {
    if (!confirmed.has(key)) fresh.delete(key) // (offline, or nothing to confirm: nothing is kept)
    return void p.repaint()
  }
  const offer = fresh.get(key) ?? null
  fresh.delete(key)
  startDownload(key, async (signal, progress) => {
    const o = offer ?? first ?? (await deps.offerOf(lang))
    if (!o) throw new Error('offline')
    await deps.downloadLang(lang, (x) => progress(x.bytes, x.totalBytes), { offer: o, signal })
    if (!p.dead()) p.ctx.refresh()
  })
}

function partialCard(p: Paint, c: Partial): HTMLElement {
  const ui = p.ctx.ui
  const t = RT(ui)
  const key: DownloadKey = `lang:${c.lang}`
  const d = dl.get(key)
  const card = el('div', 'res-card')
  card.dataset.lang = c.lang
  const b = d?.b || c.b
  const sz = d && d.a ? ` (${pair(d.a, b ?? 0)})` : b ? ` (${mbOf(b)})` : ''
  card.appendChild(el('div', 'res-name', text(`${PACK_NAMES[c.lang] ?? c.lang} · ${t.unfinished}${sz}`, ui)))
  const active = activeLine(ui, key, () => void startLang(p, c.lang, c.b ?? 0, null))
  const row = el('div', 'row res-btns')
  if (active) card.appendChild(active)
  else row.appendChild(btn(text(hints.get(key) ?? t.resume, ui), () => void startLang(p, c.lang, c.b ?? 0, null)))
  if (!d || d.error) row.appendChild(btn(t.remove, async () => { dl.delete(key); await deps.removeLang(c.lang); p.ctx.refresh(); p.repaint() }, 'small del'))
  if (row.children.length) card.appendChild(row)
  return card
}

/** The pictures: a card on Resources, a row on the server screen. */
function imagesBlock(p: Paint, have: ImagesState, row: boolean): HTMLElement {
  const ui = p.ctx.ui
  const t = RT(ui)
  const w = IW(ui)
  const box = el('div', row ? 'res-line' : 'res-card')
  box.dataset.part = 'images'
  const whole = !!(have && 'bytes' in have)
  const partial = !!(have && 'partial' in have)
  const size = imgOffer ? mbOf(imgOffer.bytes) : ''
  const had = whole ? mbOf((have as { bytes: number }).bytes) : ''
  const head = whole ? fill(t.imagesHave, { c: count(ui, 'picture', IMAGES_COUNT), mb: had }) : `${t.images}${size ? ` · ${size}` : ''}`
  if (row && whole) box.appendChild(el('div', 'res-name', text(`${t.images} · ${had} ✓ (${t.there})`, ui)))
  else {
    box.appendChild(el('div', 'res-name', text(row || !whole ? head : `${t.images} · ${head}`, ui)))
    if (!whole) box.appendChild(el('div', 'res-line note', text(partial ? t.imagesPartial : t.imagesNone, ui)))
  }
  const key: DownloadKey = 'images'
  if (!whole) {
    const act = activeLine(ui, key, () => void startImages(p))
    if (act) box.appendChild(act)
    else {
      const r = el('div', 'row')
      const base = size ? `${partial ? t.resume : t.download} · ${size}` : partial ? t.resume : t.download
      r.appendChild(btn(text(hints.get(key) ?? base, ui), () => void startImages(p)))
      if (partial && !row) r.appendChild(btn(t.remove, async () => { await deps.removeImages(); p.ctx.refresh(); p.repaint() }, 'small del'))
      box.appendChild(r)
    }
    // the size, from the catalog (a few KB): asked once, while the screen is already drawn
    if (imgOffer === undefined && deps.online()) {
      imgOffer = null
      void deps.imagesOffer().then((o) => { imgOffer = o ?? null; if (o && !p.dead()) p.repaint() }, () => {})
    }
  }
  if (!row) {
    const credit = el('p', 'note credit', w.credit)
    if (whole) void deps.imagesCredit().then((c) => { if (c) credit.textContent = c })
    box.appendChild(credit)
    if (whole) {
      const r = el('div', 'row res-btns')
      r.appendChild(shareButton(p, async () => ({ bytes: await deps.exportImages(), file: PACK_FILE, mime: 'application/octet-stream' })))
      r.appendChild(btn(t.remove, async () => { await deps.removeImages(); p.ctx.refresh() }, 'small del'))
      box.appendChild(r)
    }
  }
  return box
}
async function startImages(p: Paint) {
  const ui = p.ctx.ui
  let offer = imgOffer ?? null
  const real = async () => {
    offer = await deps.imagesOffer()
    imgOffer = offer
    return offer?.bytes ?? null
  }
  if (!(await gate(ui, 'images', imgOffer?.bytes ?? 0, real, p.repaint))) return void p.repaint()
  startDownload('images', async (signal, progress) => {
    const o = offer ?? (await deps.imagesOffer())
    if (!o) throw new Error('offline')
    await deps.downloadImages((x) => progress(x.bytes, x.totalBytes), signal, o)
    if (!p.dead()) p.ctx.refresh()
  })
}

/**
 * Draws the Resources screen into `host`; it follows the downloads while it is on the page. Returns how to stop it (a later render
 * into the same host does that by itself).
 */
export async function renderResources(host: HTMLElement, ctx: ResCtx): Promise<() => void> {
  hints.clear(); confirmed.clear(); fresh.clear()
  const m = mount(host)
  const ui = ctx.ui
  const t = RT(ui)
  host.dir = rtlLang(ui) ? 'rtl' : 'auto'
  let model = await load()
  if (m.gone()) return m.dispose
  let said = ''
  const p: Paint = { ctx, host, say: (s) => { said = s; paint() }, repaint: () => paint(), dead: () => m.gone() }
  const searchBtn = (cls: string) => btn(t.search, () => ctx.openServer(), cls)
  function paint() {
    if (m.gone()) return
    const out: HTMLElement[] = [el('p', 'note res-intro', text(t.intro, ui))]
    const langs = [...model.langs.map((c) => langCard(p, c))]
    // a download that is going (or failed) shows even before the language is marked partial
    const shown = new Set(model.partial.map((x) => x.lang))
    const extra = [...dl.keys()].filter((k): k is `lang:${string}` => k.startsWith('lang:')).map((k) => k.slice(5))
      .filter((l) => !shown.has(l) && !model.langs.some((c) => c.lang === l))
    const partials = [...model.partial, ...extra.map((l) => ({ lang: l, b: null }))].map((x) => partialCard(p, x))
    if (!langs.length && !partials.length) {
      out.push(el('p', 'res-none', text(t.noLangs, ui)), searchBtn('small on'))
    } else {
      out.push(el('h3', 'res-h', t.langs), ...langs, ...partials)
    }
    out.push(el('h3', 'res-h', t.all), imagesBlock(p, model.images, false))
    out.push(el('h3', 'res-h', t.more))
    const more = el('div', 'langs')
    if (langs.length || partials.length) more.appendChild(searchBtn('small'))
    const file = document.createElement('input')
    file.type = 'file'
    file.accept = '.tcpack,application/octet-stream'
    file.hidden = true
    file.onchange = async () => {
      const f = file.files?.[0]
      if (!f) return
      p.say(t.working)
      try {
        // languages, the Stories pictures (zxx-obsimg), or both: one kind of file
        const r = await deps.importPack(new Uint8Array(await f.arrayBuffer()))
        p.say(importedLine(ui, r, r.images ? await deps.imagesInstalled().catch(() => null) : null, t.failed))
        ctx.refresh()
      } catch (e) {
        console.warn('loading the file failed:', e)
        p.say(t.failedGen)
      }
    }
    more.append(btn(t.openFile, () => file.click()), file)
    out.push(more)
    if (said) out.push(el('p', 'note res-say', text(said, ui)))
    host.replaceChildren(...out)
  }
  paint()
  let seen = settled
  m.watch(() => {
    // a download ended: read the packs again (a language or a part is there now, or the mark is gone)
    if (seen !== settled) {
      seen = settled
      void load().then((x) => { model = x; paint() }, () => paint())
    } else paint()
  })
  return m.dispose
}

// ---------------------------------------------------------------------------------------------------- the server

// The server scan is one request per language and cannot be canceled: a screen opened while one runs joins it (it gets what already
// answered, then the rest) instead of asking everything again.
type Scan = { res: [Offer | null, string][]; subs: Set<(o: Offer | null, l: string) => void>; done: Promise<void> }
let scan: Scan | null = null
function joinScan(on: (o: Offer | null, l: string) => void): { done: Promise<void>; leave: () => void } {
  if (!scan) {
    const sc: Scan = { res: [], subs: new Set(), done: null as unknown as Promise<void> }
    scan = sc
    sc.done = Promise.resolve().then(() => deps.offers((o, l) => { sc.res.push([o, l]); for (const f of [...sc.subs]) f(o, l) })).then(() => {}).finally(() => { if (scan === sc) scan = null })
    sc.done.catch(() => {}) // the screens that wait for it hear of the failure; none left: nobody
  }
  const sc = scan
  for (const [o, l] of sc.res) on(o, l)
  sc.subs.add(on)
  return { done: sc.done, leave: () => void sc.subs.delete(on) }
}

/** Draws the server screen into `host`: each language as it answers, with its parts and one [Download]. Returns how to stop it. */
export async function renderServer(host: HTMLElement, ctx: ResCtx): Promise<() => void> {
  hints.clear(); confirmed.clear(); fresh.clear()
  const m = mount(host)
  const ui = ctx.ui
  const t = RT(ui)
  host.dir = rtlLang(ui) ? 'rtl' : 'auto'
  let found: Offer[] = []
  let answered = 0
  let total = (await deps.offerCandidates().catch(() => [] as string[])).length
  let over = false
  let failed = false
  let have: string[] = await deps.installedLangs().catch(() => [] as string[])
  let images: ImagesState = await deps.imagesInstalled().catch(() => null)
  if (m.gone()) return m.dispose
  const p: Paint = { ctx, host, say: () => {}, repaint: () => paint(), dead: () => m.gone() }
  function paint() {
    if (m.gone()) return
    const out: HTMLElement[] = []
    if (!over) out.push(el('p', 'note res-looking', text(t.looking.replace('{n}', String(answered)).replace('{total}', String(total)), ui)))
    const visible = found.filter((o) => !have.includes(o.lang))
    for (const o of visible) {
      const key: DownloadKey = `lang:${o.lang}`
      const card = el('div', 'res-card')
      card.dataset.lang = o.lang
      card.appendChild(el('div', 'res-name', text(`${PACK_NAMES[o.lang] ?? o.lang} · ${mbOf(o.bytes)}`, ui)))
      card.appendChild(el('div', 'res-line', text(o.parts.filter((x) => x.state === 'have').map((x) => haveText(ui, x, true)).join(' · '), ui)))
      // the size shown is the one the language was found with: a plan that moved more than 20 % is said at the tap
      const again = () => void startLang(p, o.lang, o.bytes, o)
      card.appendChild(activeLine(ui, key, again) ?? (() => {
        const row = el('div', 'row')
        const base = `${o.partial ? t.resume : t.download} · ${mbOf(o.bytes)}`
        row.appendChild(btn(text(hints.get(key) ?? base, ui), again))
        return row
      })())
      out.push(card)
    }
    if (over && !visible.length) out.push(el('p', 'note res-empty', text(deps.online() && !failed ? t.noneNew : t.offline, ui)))
    out.push(el('h3', 'res-h', t.all), imagesBlock(p, images, true))
    out.push(el('p', 'note res-fixed', text(t.fixed, ui)))
    host.replaceChildren(...out)
  }
  paint()
  let seen = settled
  m.watch(() => {
    if (seen === settled) return paint()
    seen = settled
    // a download ended: a language that is on the phone now leaves the list, and the pictures may be there
    void Promise.all([deps.installedLangs().catch(() => [] as string[]), deps.imagesInstalled().catch(() => null)]).then(([h, i]) => {
      have = h
      images = i
      paint()
    })
  })
  const join = joinScan((o) => {
    if (m.gone()) return
    answered++
    if (o) found.push(o)
    paint()
  })
  try {
    await join.done
  } catch (e) {
    // no answer: the same message as no connection
    console.warn('asking the server failed:', e)
    failed = true
  }
  join.leave()
  if (m.gone()) return m.dispose
  // the candidates are languages the server is expected to have: none answering means no answer (offerOf hides the cause)
  if (total > 0 && !found.length) failed = true
  total = Math.max(total, answered)
  over = true
  paint()
  return m.dispose
}
