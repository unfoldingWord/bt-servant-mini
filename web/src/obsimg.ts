// The Open Bible Stories images, without internet (handoff/mini-servant/plan-obs-imagenes-v3.md). The images are the same for
// every language: one format-3 catalog of their own, `zxx-obsimg` (zxx: no linguistic content; no language requires it), unit
// `obsimg`, 50 segments (one per story), signed with the key the app already trusts. It is downloaded from the packs server on
// a tap in the menu, or loaded from a .tcpack file (SD card, USB, Bluetooth), and shared as one; it is never downloaded by
// itself (20 MB): not with a language, not in the daily update.
//
// A frame's picture: the one on the phone when the catalog is there, else Door43's when online, else a quiet placeholder.
// The illustrations: © Sweet Publishing, CC BY-SA 3.0 (the catalog's own credit, NOTICE.md and the menu's line say so).
import { ClientError, type PackReader } from '@bt-synergy/language-pack-client'
import {
  addedClient, addedStore, catalogOffer, downloadCatalog, IMAGES_CATALOG, onPacksChanged, openAdded, PACK_NAMES, removeLang,
  type CatalogOffer, type Progress,
} from './packs'

// ------------------------------------------------------------------------------------------------------------ words

type Words = {
  /** the menu's section, what it says with and without the images, its buttons */
  title: string; have: string; none: string; credit: string; download: string; resume: string; downloading: string
  share: string; remove: string
  /** a download that did not end (part of it on the phone, nothing shown yet) */
  partial: string
  /** asked before a download over mobile data ({mb}: its size) */
  metered: string
  /** under a frame with no picture */
  missing: string
  /** the frame's buttons: get the pictures (their size), load them from a file, and the line under a picture that came from the internet */
  getPics: string; fromFile: string; net: string
}
const W: Record<string, Words> = {
  en: {
    title: 'Open Bible Stories pictures', have: '{n} pictures · {mb} ✓',
    none: 'Not on this phone. With internet they download here, or load a .tcpack file of pictures (SD card, USB, Bluetooth).',
    credit: 'Illustrations © Sweet Publishing, CC BY-SA 3.0.', download: 'Download', resume: 'Continue', downloading: 'Downloading…',
    share: 'Share', remove: 'Remove', metered: '{mb} over mobile data. Continue?',
    partial: 'Download not finished: no picture shows yet. With internet it continues here; or remove what arrived.',
    missing: 'Picture not on this phone',
    getPics: 'Download pictures (~20 MB)', fromFile: 'Load from a file', net: 'From the internet: download the pictures to see them without a connection.',
  },
  es: {
    title: 'Imágenes de Open Bible Stories', have: '{n} imágenes · {mb} ✓',
    none: 'No están en el teléfono. Con internet se bajan aquí, o carga un archivo .tcpack de imágenes (tarjeta SD, USB, Bluetooth).',
    credit: 'Ilustraciones © Sweet Publishing, CC BY-SA 3.0.', download: 'Bajar', resume: 'Seguir', downloading: 'Bajando…',
    share: 'Compartir', remove: 'Quitar', metered: '{mb} por datos móviles. ¿Seguir?',
    partial: 'Bajada sin terminar: aún no se ve ninguna imagen. Con internet sigue aquí; o quita lo que llegó.',
    missing: 'La imagen no está en el teléfono',
    getPics: 'Bajar las imágenes (~20 MB)', fromFile: 'Cargar desde un archivo', net: 'De internet: baja las imágenes para verlas sin conexión.',
  },
  pt: {
    title: 'Imagens das Open Bible Stories', have: '{n} imagens · {mb} ✓',
    none: 'Não estão no telefone. Com internet, baixe-as aqui, ou carregue um arquivo .tcpack de imagens (cartão SD, USB, Bluetooth).',
    credit: 'Ilustrações © Sweet Publishing, CC BY-SA 3.0.', download: 'Baixar', resume: 'Continuar', downloading: 'Baixando…',
    share: 'Compartilhar', remove: 'Remover', metered: '{mb} pelos dados móveis. Continuar?',
    partial: 'Download não terminado: nenhuma imagem aparece ainda. Com internet, continue aqui; ou remova o que chegou.',
    missing: 'A imagem não está no telefone',
    getPics: 'Baixar as imagens (~20 MB)', fromFile: 'Carregar de um arquivo', net: 'Da internet: baixe as imagens para vê-las sem conexão.',
  },
  fr: {
    title: 'Images des Open Bible Stories', have: '{n} images · {mb} ✓',
    none: 'Elles ne sont pas sur le téléphone. Avec internet, téléchargez-les ici, ou chargez un fichier .tcpack d’images (carte SD, USB, Bluetooth).',
    credit: 'Illustrations © Sweet Publishing, CC BY-SA 3.0.', download: 'Télécharger', resume: 'Continuer', downloading: 'Téléchargement…',
    share: 'Partager', remove: 'Retirer', metered: '{mb} par les données mobiles. Continuer ?',
    partial: 'Téléchargement inachevé : aucune image ne s’affiche encore. Avec internet, il continue ici ; ou retirez ce qui est arrivé.',
    missing: 'Image absente du téléphone',
    getPics: 'Télécharger les images (~20 Mo)', fromFile: 'Charger depuis un fichier', net: 'Depuis internet : téléchargez les images pour les voir sans connexion.',
  },
  id: {
    title: 'Gambar Open Bible Stories', have: '{n} gambar · {mb} ✓',
    none: 'Belum ada di ponsel. Dengan internet, unduh di sini, atau muat berkas .tcpack gambar (kartu SD, USB, Bluetooth).',
    credit: 'Ilustrasi © Sweet Publishing, CC BY-SA 3.0.', download: 'Unduh', resume: 'Lanjutkan', downloading: 'Mengunduh…',
    share: 'Bagikan', remove: 'Hapus', metered: '{mb} lewat data seluler. Lanjutkan?',
    partial: 'Unduhan belum selesai: belum ada gambar yang tampil. Dengan internet, lanjutkan di sini; atau hapus yang sudah masuk.',
    missing: 'Gambar tidak ada di ponsel',
    getPics: 'Unduh gambar (~20 MB)', fromFile: 'Muat dari berkas', net: 'Dari internet: unduh gambar agar bisa dilihat tanpa koneksi.',
  },
  hi: {
    title: 'ओपन बाइबल स्टोरीज़ के चित्र', have: '{n} चित्र · {mb} ✓',
    none: 'ये फ़ोन पर नहीं हैं। इंटरनेट हो तो इन्हें यहीं डाउनलोड करें, या चित्रों की .tcpack फ़ाइल (SD कार्ड, USB, Bluetooth) लोड करें।',
    credit: 'चित्र © Sweet Publishing, CC BY-SA 3.0.', download: 'डाउनलोड करें', resume: 'जारी रखें', downloading: 'डाउनलोड हो रहा है…',
    share: 'साझा करें', remove: 'हटाएँ', metered: 'मोबाइल डेटा से {mb}। जारी रखें?',
    partial: 'डाउनलोड पूरा नहीं हुआ: अभी कोई चित्र नहीं दिखता। इंटरनेट हो तो यहीं जारी रखें; या जो आया है उसे हटाएँ।',
    missing: 'चित्र फ़ोन पर नहीं है',
    getPics: 'चित्र डाउनलोड करें (~20 MB)', fromFile: 'फ़ाइल से लोड करें', net: 'इंटरनेट से: बिना कनेक्शन के देखने के लिए चित्र डाउनलोड करें।',
  },
  ar: {
    title: 'صور قصص الكتاب المقدس المفتوحة', have: '{n} صورة · {mb} ✓',
    none: 'ليست على الهاتف. مع الإنترنت نزّلها من هنا، أو حمّل ملف ‎.tcpack للصور (بطاقة SD أو USB أو Bluetooth).',
    credit: 'الرسوم © Sweet Publishing، بترخيص CC BY-SA 3.0.', download: 'تنزيل', resume: 'متابعة', downloading: 'جارٍ التنزيل…',
    share: 'مشاركة', remove: 'إزالة', metered: '{mb} عبر بيانات الجوال. متابعة؟',
    partial: 'لم يكتمل التنزيل: لا تظهر أي صورة بعد. مع الإنترنت يُتابَع من هنا؛ أو أزل ما وصل.',
    missing: 'الصورة ليست على الهاتف',
    getPics: 'تنزيل الصور (~20 MB)', fromFile: 'تحميل من ملف', net: 'من الإنترنت: نزّل الصور لتراها دون اتصال.',
  },
}
/** The words for a UI language (pt-br and es-419 by their base; any other in English). */
export const IW = (ui: string): Words => W[ui] ?? W[ui.split('-')[0]!] ?? W.en!
export const fill = (t: string, v: Record<string, string | number>): string => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))

// ------------------------------------------------------------------------------------------------------------ the catalog

/** The images' catalog and its one unit. */
export const IMAGES = IMAGES_CATALOG
export const UNIT = 'obsimg'
const WANT = { units: [UNIT], defaults: false as const }
/**
 * How many pictures the unit holds: the 598 frames of the 50 stories (bt-synergy's OBS_FRAMES_PER_STORY). The format makes a
 * built unit always that whole shape, and the client activates it only with all its segments, so an installed unit has them all.
 */
export const IMAGES_COUNT = 598
/** The file sharing saves. */
export const PACK_FILE = 'bt-servant-mini-obs-images.tcpack'

const pad = (x: number) => String(x).padStart(2, '0')
/** "01-03": the key of story 1, frame 3 */
export const frameKey = (n: number, f: number): string => `${pad(n)}-${pad(f)}`
/** Door43's picture of a frame (360 px high), the same for every language. */
export const cdnUrl = (n: number, f: number): string => `https://cdn.door43.org/obs/jpg/360px/obs-en-${frameKey(n, f)}.jpg`

function kv(): Storage | null {
  try {
    return (globalThis as any).localStorage ?? null
  } catch {
    return null
  }
}
/**
 * The segments of the download that started (saved before its first byte): the reader names no segment ids, and without
 * internet there is no offer, so this is how a cut download is told from none. Cleared when the images are whole or removed.
 */
const SEGMENTS = 'btsm.obsimg.segments'
function savedSegments(): string[] {
  try {
    const v = JSON.parse(kv()?.getItem(SEGMENTS) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
function saveSegments(ids: string[] | null) {
  try {
    if (ids) kv()?.setItem(SEGMENTS, JSON.stringify(ids))
    else kv()?.removeItem(SEGMENTS)
  } catch {}
}

/**
 * The old stop-gap zip (ms/obsimg: its own IndexedDB `btsm-obsimg`, on test phones only; no release had it) is deleted the first
 * time the images' state is read. A delete that is blocked (another tab holds it open) or fails leaves no mark: it is tried again.
 */
const ZIP_GONE = 'btsm.obsimg.zipGone'
const OLD_DB = 'btsm-obsimg'
function dropOldZip(): Promise<void> {
  const s = kv()
  const idb: IDBFactory | undefined = (globalThis as any).indexedDB
  try {
    if (!s || !idb || s.getItem(ZIP_GONE)) return Promise.resolve()
  } catch {
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    try {
      const r = idb.deleteDatabase(OLD_DB)
      r.onsuccess = () => {
        try {
          s.setItem(ZIP_GONE, '1')
        } catch {}
        resolve()
      }
      r.onerror = () => resolve()
      // blocked: no mark now (a success that comes later, once the other holder lets go, still sets it)
      r.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}

// The reader of the images' catalog, its own (never openLang: zxx-* is not a language), opened once and read again after every
// change. The blob: URLs made from it are kept while the images stay on the phone (a language downloaded meanwhile must not
// break a lazy picture drawn before and not loaded yet; a new revision comes only by removing them first) and let go when a
// read finds them gone.
let reader: Promise<PackReader | null> | null = null
/** The blob: URLs made, per frame */
let urls = new Map<string, Promise<string | null>>()
onPacksChanged(() => {
  reader = null
})
function dropUrls() {
  for (const u of urls.values()) void u.then((x) => { try { if (x) URL.revokeObjectURL(x) } catch {} }, () => {})
  urls = new Map()
}
/** The images' reader when the unit is installed, else null. "Not installed" is kept until a change; a failed read is not. */
function imagesReader(): Promise<PackReader | null> {
  if (!reader) {
    const p: Promise<PackReader | null> = openAdded(IMAGES)
      .then((r) => (r.installed(UNIT) ? r : null))
      .catch((e) => {
        if (!(e instanceof ClientError && e.code === 'E_NOT_INSTALLED')) {
          if (reader === p) reader = null // a failed read: tried again next time, and the URLs stay
          throw e
        }
        return null
      })
      .then((r) => {
        if (!r) dropUrls() // not on the phone (removed): their URLs are let go
        return r
      }, () => null)
    reader = p
  }
  return reader
}

export type ImagesState = { bytes: number } | { partial: true } | null
/**
 * What the phone has: the size of the installed unit; `partial` when a download started and did not end (some of its segments
 * are in the store, the catalog not active yet), so the menu says "Continue"; null otherwise. Works without internet; never throws.
 */
export async function imagesInstalled(): Promise<ImagesState> {
  await dropOldZip().catch(() => {})
  try {
    const r = await imagesReader()
    if (r) {
      saveSegments(null)
      return { bytes: r.size(UNIT) }
    }
    const want = savedSegments()
    if (want.length) {
      const have = new Set(await (await addedStore()).ids())
      if (want.some((id) => have.has(id))) return { partial: true }
    }
  } catch {}
  return null
}

/** What the server offers for the images: the size of the unit and its segments (a few KB read, needs internet), or null. */
export const imagesOffer = (): Promise<CatalogOffer | null> => catalogOffer(IMAGES, WANT)

/**
 * Downloads the images into the phone's store, as a language is: one request at a time with a prefetch, the segments already
 * there counted from the start and not fetched again, `signal` cancels (what arrived stays; nothing shows until all 50 are in,
 * the client activates the unit whole).
 */
export async function downloadImages(onProgress?: (p: Progress) => void, signal?: AbortSignal, offer?: CatalogOffer | null): Promise<{ bytes: number }> {
  const o = offer ?? (await imagesOffer())
  if (!o) throw new Error(`no ${IMAGES} on the server`)
  saveSegments(o.segments)
  const got = await downloadCatalog(IMAGES, WANT, o, onProgress, signal ? { signal } : {})
  saveSegments(null)
  return got
}

/** A .tcpack with the images, to pass to another phone (not exportPack: no books, no shared articles). */
export async function exportImages(): Promise<Uint8Array> {
  return (await addedClient()).exportTransfer({ lang: IMAGES, mode: 'full' })
}
/** Removes the images: only the `zxx-obsimg/…` units, then the store's prune; languages and common stay. */
export async function removeImages(): Promise<void> {
  try {
    await removeLang(IMAGES)
  } finally {
    saveSegments(null)
  }
}
/** The credit the catalog itself carries, as one line ("Illustrations … · CC BY-SA 3.0"), or null without the images. */
export async function imagesCredit(): Promise<string | null> {
  try {
    const m = await (await imagesReader())?.obsImageCredit()
    return m ? [m.credit, m.license].filter(Boolean).join(' · ') : null
  } catch {
    return null
  }
}

/** The picture of a frame on the phone (a blob: URL, made once per reader), or null when the images or that frame are not there. */
export async function localUrl(n: number, f: number): Promise<string | null> {
  const r = await imagesReader()
  if (!r) return null
  const key = frameKey(n, f)
  // one URL per frame, even when two pictures of it ask at once
  let u = urls.get(key)
  if (!u) {
    const p: Promise<string | null> = r.obsImage(n, f).then((img) =>
      img ? URL.createObjectURL(new Blob([img.bytes as Uint8Array<ArrayBuffer>], { type: img.media })) : null)
    p.catch(() => { if (urls.get(key) === p) urls.delete(key) })
    urls.set(key, (u = p))
  }
  return u
}

/** Where a frame's picture comes from: the phone, Door43 (online), or nowhere (the placeholder). */
export function pickSource(local: string | null, online: boolean, n: number, f: number): { kind: 'local' | 'cdn' | 'none'; src: string } {
  if (local) return { kind: 'local', src: local }
  if (online) return { kind: 'cdn', src: cdnUrl(n, f) }
  return { kind: 'none', src: '' }
}
const isOnline = (): boolean => (globalThis as any).navigator?.onLine !== false

// ------------------------------------------------------------------------------------------------------------ drawing

/** The quiet placeholder, in place of a picture there is no way to show, with the buttons that get the pictures (obsimgask.ts). */
function placeholder(fig: HTMLElement, ui: string, redo: () => void) {
  fig.querySelector('img')?.remove()
  if (fig.querySelector('.obs-pic-none')) return
  const box = document.createElement('div')
  box.className = 'obs-pic-none'
  const say = document.createElement('div')
  say.textContent = IW(ui).missing
  box.append(say)
  box.lang = ui
  box.dir = ui.split('-')[0] === 'ar' ? 'rtl' : 'ltr'
  fig.prepend(box)
  ask(box, ui, 'none', redo)
}

/** The buttons that get the pictures, drawn in `host` (obsimgask.ts, loaded when first needed: it reaches Resources' downloads). */
function ask(host: HTMLElement, ui: string, kind: 'none' | 'cdn', redo: () => void) {
  void import('./obsimgask').then((m) => m.addAsk(host, ui, kind, redo)).catch(() => {})
}

/**
 * The quiet line under a picture that came from the internet, with [Download]: on the first picture of a conversation only (the
 * page has one such line at a time: a new conversation clears the page), and never once the pictures are on the phone.
 */
function netNote(img: HTMLElement, ui: string, redo: () => void) {
  const g: any = globalThis
  if (g.document?.querySelector?.('.obs-pic-note')) return
  const note = document.createElement('div')
  note.className = 'obs-pic-note'
  note.lang = ui
  note.dir = ui.split('-')[0] === 'ar' ? 'rtl' : 'ltr'
  img.after(note)
  ask(note, ui, 'cdn', redo)
}

/** Draws a frame again after the pictures arrived: what was there (picture, placeholder, line) goes, the phone's picture comes. */
function redraw(fig: HTMLElement, n: number, f: number, label: string, ui: string, cls: string) {
  for (const q of ['img', '.obs-pic-none', '.obs-pic-note']) fig.querySelector(q)?.remove()
  fillPicture(fig, n, f, label, ui, cls)
}

/** A frame's picture in its own `<figure class="obs-pic">`, drawn at once and filled when the pack has been read. */
export function framePicture(n: number, f: number, label: string, ui: string): HTMLElement {
  const fig = document.createElement('figure')
  fig.className = 'obs-pic'
  fillPicture(fig, n, f, label, ui)
  return fig
}

/**
 * Puts a frame's picture (or the placeholder) first in `fig`, a box drawn already (the 5M card's figure): the phone's, else
 * Door43's, else the placeholder; a picture that does not load becomes the placeholder too. `cls`: the image's class.
 */
export function fillPicture(fig: HTMLElement, n: number, f: number, label: string, ui: string, cls = ''): void {
  void localUrl(n, f).catch(() => null).then((local) => {
    const s = pickSource(local, isOnline(), n, f)
    const redo = () => redraw(fig, n, f, label, ui, cls)
    if (s.kind === 'none') return placeholder(fig, ui, redo)
    const img = document.createElement('img')
    if (cls) img.className = cls
    img.alt = label
    img.width = 640
    img.height = 360
    img.loading = 'lazy'
    img.onerror = () => { fig.querySelector('.obs-pic-note')?.remove(); placeholder(fig, ui, redo) }
    img.src = s.src
    fig.prepend(img)
    if (s.kind === 'cdn') netNote(img, ui, redo)
  }).catch(() => { /* a picture that cannot be drawn leaves the frame's text as it is */ })
}

/**
 * The story an answer is about, from its call sheet (`"ref": "obs 1:3"`, the last `"ref"` in its details: pipeline.ts writes the
 * sheet at their end), in parseObsRef's strict shape: its number, or null.
 */
export function obsStoryOf(meta: string | undefined): number | null {
  const last = [...(meta ?? '').matchAll(/"ref":\s*"([^"]*)"/g)].pop()?.[1] ?? ''
  const m = /^obs (\d{1,2})(?::\d{1,3})?$/.exec(last)
  const n = m ? +m[1]! : 0
  return n >= 1 && n <= 50 ? n : null
}
/** The frame a paragraph of an OBS answer tells ("**1:3** text", as obsAnswer writes it), when it is of story `n`. */
export function frameOfLine(lead: string, n: number): number | null {
  const m = /^(\d{1,2}):(\d{1,3})$/.exec(lead.trim())
  return m && +m[1]! === n ? +m[2]! : null
}

/**
 * An OBS answer drawn (main.ts): each paragraph that starts with a frame's number gets the frame's picture just before it. Any
 * other answer is left as it is. The answer's text does not change (sharing, saving and online AI read the same words).
 */
export function addObsPictures(box: HTMLElement, meta: string | undefined, ui: string): number {
  const n = obsStoryOf(meta)
  if (!n) return 0
  let added = 0
  for (const p of Array.from(box.querySelectorAll('p'))) {
    const lead = p.firstElementChild
    if (!lead || lead.tagName !== 'STRONG' || p.firstChild !== lead) continue
    const f = frameOfLine(lead.textContent ?? '', n)
    if (!f) continue
    p.before(framePicture(n, f, `OBS ${n}:${f}`, ui))
    added++
  }
  return added
}

/** The passage an answer is about, from its call sheet (the last `"ref"` in its details), when it is one verse of a book ("gen 1:7"). */
export function verseOf(meta: string | undefined): string | null {
  const last = [...(meta ?? '').matchAll(/"ref":\s*"([^"]*)"/g)].pop()?.[1] ?? ''
  return /^[1-3]?[a-z]{2,3} \d{1,3}:\d{1,3}$/.test(last) && !last.startsWith('obs ') ? last : null
}

/**
 * A one-verse answer drawn (main.ts): the picture of the Open Bible Stories frame that tells the verse (obs-frames, the most
 * specific frame), first in the answer, with "OBS n:f" and the credit under it. Only when the picture can be shown (the phone's
 * pictures, or Door43's online): no placeholder for a verse. `frameOf` finds the frame (obs.ts pictureFrame). The answer's text
 * does not change.
 */
export async function addVersePicture(
  box: HTMLElement,
  meta: string | undefined,
  ui: string,
  frameOf: (ref: string) => Promise<{ n: number; f: number } | null>,
): Promise<{ n: number; f: number } | null> {
  const ref = verseOf(meta)
  if (!ref) return null
  const at = await frameOf(ref).catch(() => null)
  if (!at) return null
  const local = await localUrl(at.n, at.f).catch(() => null)
  const s = pickSource(local, isOnline(), at.n, at.f)
  if (s.kind === 'none') return null
  const fig = document.createElement('figure')
  fig.className = 'obs-pic verse-pic'
  const img = document.createElement('img')
  img.alt = `OBS ${at.n}:${at.f}`
  img.width = 640
  img.height = 360
  img.loading = 'lazy'
  img.onerror = () => fig.remove()
  img.src = s.src
  const cap = document.createElement('figcaption')
  cap.className = 'obs-pic-cap'
  cap.textContent = `OBS ${at.n}:${at.f} · ${IW(ui).credit}`
  cap.lang = ui
  cap.dir = ui.split('-')[0] === 'ar' ? 'rtl' : 'ltr'
  fig.append(img, cap)
  box.prepend(fig)
  return at
}

/** The menu's line: how many pictures and their size, a download not ended, or how to get them. */
export const imagesLine = (ui: string, have: ImagesState): string =>
  !have ? IW(ui).none : 'bytes' in have ? fill(IW(ui).have, { n: IMAGES_COUNT, mb: `${(have.bytes / 1048576).toFixed(1)} MB` }) : IW(ui).partial

/**
 * What the menu says after a .tcpack was loaded: its languages, the pictures' line when it brought them and they are on the phone
 * now (`have`), or `failed` with the number of entries turned down when it brought neither.
 */
export function importedLine(ui: string, r: { langs: string[]; rejected: number; images?: boolean }, have: ImagesState, failed: string): string {
  const parts: string[] = []
  if (r.langs.length) parts.push(r.langs.map((l) => PACK_NAMES[l] ?? l).join(', ') + ' ✓')
  if (r.images && have && 'bytes' in have) parts.push(imagesLine(ui, have))
  return parts.length ? parts.join(' · ') : `${failed} ${r.rejected}`
}
