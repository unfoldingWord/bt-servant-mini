// The Open Bible Stories images, without internet (handoff/mini-servant/plan-obs-imagenes.md). The images are the same for
// every language: one optional pack, `bt-servant-mini-obs-images.zip` (web/obs_images.py builds it from Door43's 360px zip),
// passed from phone to phone as a file (SD card, USB, Bluetooth). The app takes only a file whose SHA-256 it knows
// (data/obsimages.json): no key is needed, and anything else is turned down. It is kept whole, as one Blob, with the place of
// each image in it; sharing gives back the same bytes, which the next phone accepts the same way.
//
// A frame's picture: the one on the phone when the pack is there, else Door43's when online, else a quiet placeholder.
// The illustrations: © Sweet Publishing, CC BY-SA 3.0 (the pack's LICENSE.txt, NOTICE.md and the menu's line say so).
import known from './data/obsimages.json'

// ------------------------------------------------------------------------------------------------------------ words

type Words = {
  /** the menu's section, what it says with and without the pack, its buttons */
  title: string; have: string; none: string; credit: string; load: string; share: string; remove: string
  /** under a frame with no picture */
  missing: string
  /** a file that is not the pack this app knows */
  unknown: string
}
const W: Record<string, Words> = {
  en: {
    title: 'Open Bible Stories pictures', have: '{n} pictures · {mb} ✓',
    none: 'Not on this phone. With internet the pictures come from Door43; to see them without internet, load the file bt-servant-mini-obs-images.zip (SD card, USB, Bluetooth).',
    credit: 'Illustrations © Sweet Publishing, CC BY-SA 3.0.', load: 'Load the pictures file', share: 'Share', remove: 'Remove',
    missing: 'Picture not on this phone', unknown: 'This is not the Open Bible Stories pictures file this app knows.',
  },
  es: {
    title: 'Imágenes de Open Bible Stories', have: '{n} imágenes · {mb} ✓',
    none: 'No están en el teléfono. Con internet las imágenes vienen de Door43; para verlas sin internet, carga el archivo bt-servant-mini-obs-images.zip (tarjeta SD, USB, Bluetooth).',
    credit: 'Ilustraciones © Sweet Publishing, CC BY-SA 3.0.', load: 'Cargar el archivo de imágenes', share: 'Compartir', remove: 'Quitar',
    missing: 'La imagen no está en el teléfono', unknown: 'Este no es el archivo de imágenes de Open Bible Stories que conoce la app.',
  },
  pt: {
    title: 'Imagens das Open Bible Stories', have: '{n} imagens · {mb} ✓',
    none: 'Não estão no telefone. Com internet as imagens vêm do Door43; para vê-las sem internet, carregue o arquivo bt-servant-mini-obs-images.zip (cartão SD, USB, Bluetooth).',
    credit: 'Ilustrações © Sweet Publishing, CC BY-SA 3.0.', load: 'Carregar o arquivo de imagens', share: 'Compartilhar', remove: 'Remover',
    missing: 'A imagem não está no telefone', unknown: 'Este não é o arquivo de imagens das Open Bible Stories que o app conhece.',
  },
  fr: {
    title: 'Images des Open Bible Stories', have: '{n} images · {mb} ✓',
    none: 'Elles ne sont pas sur le téléphone. Avec internet, les images viennent de Door43 ; pour les voir sans internet, chargez le fichier bt-servant-mini-obs-images.zip (carte SD, USB, Bluetooth).',
    credit: 'Illustrations © Sweet Publishing, CC BY-SA 3.0.', load: 'Charger le fichier d’images', share: 'Partager', remove: 'Retirer',
    missing: 'Image absente du téléphone', unknown: "Ce n'est pas le fichier d'images des Open Bible Stories que l'application connaît.",
  },
  id: {
    title: 'Gambar Open Bible Stories', have: '{n} gambar · {mb} ✓',
    none: 'Belum ada di ponsel. Dengan internet gambar diambil dari Door43; agar bisa dilihat tanpa internet, muat berkas bt-servant-mini-obs-images.zip (kartu SD, USB, Bluetooth).',
    credit: 'Ilustrasi © Sweet Publishing, CC BY-SA 3.0.', load: 'Muat berkas gambar', share: 'Bagikan', remove: 'Hapus',
    missing: 'Gambar tidak ada di ponsel', unknown: 'Ini bukan berkas gambar Open Bible Stories yang dikenal aplikasi.',
  },
  hi: {
    title: 'ओपन बाइबल स्टोरीज़ के चित्र', have: '{n} चित्र · {mb} ✓',
    none: 'ये फ़ोन पर नहीं हैं। इंटरनेट होने पर चित्र Door43 से आते हैं; बिना इंटरनेट देखने के लिए bt-servant-mini-obs-images.zip फ़ाइल (SD कार्ड, USB, Bluetooth) लोड करें।',
    credit: 'चित्र © Sweet Publishing, CC BY-SA 3.0.', load: 'चित्रों की फ़ाइल लोड करें', share: 'साझा करें', remove: 'हटाएँ',
    missing: 'चित्र फ़ोन पर नहीं है', unknown: 'यह ओपन बाइबल स्टोरीज़ के चित्रों की वह फ़ाइल नहीं है जिसे ऐप जानता है।',
  },
  ar: {
    title: 'صور قصص الكتاب المقدس المفتوحة', have: '{n} صورة · {mb} ✓',
    none: 'ليست على الهاتف. مع الإنترنت تأتي الصور من Door43؛ ولرؤيتها بلا إنترنت حمّل الملف bt-servant-mini-obs-images.zip (بطاقة SD أو USB أو Bluetooth).',
    credit: 'الرسوم © Sweet Publishing، بترخيص CC BY-SA 3.0.', load: 'تحميل ملف الصور', share: 'مشاركة', remove: 'إزالة',
    missing: 'الصورة ليست على الهاتف', unknown: 'هذا ليس ملف صور قصص الكتاب المقدس المفتوحة الذي يعرفه التطبيق.',
  },
}
/** The words for a UI language (pt-br and es-419 by their base; any other in English). */
export const IW = (ui: string): Words => W[ui] ?? W[ui.split('-')[0]!] ?? W.en!
const fill = (t: string, v: Record<string, string | number>): string => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))

// ------------------------------------------------------------------------------------------------------------ the pack

export const PACK_FILE = 'bt-servant-mini-obs-images.zip'
type Known = { sha256: string; bytes: number; count: number }
let KNOWN: Known[] = [known as Known]
/** Tests: the packs this app accepts (no argument puts the app's back). */
export function setKnown(list?: Known[]) {
  KNOWN = list ?? [known as Known]
}
const pad = (x: number) => String(x).padStart(2, '0')
/** "01-03": the key of story 1, frame 3 */
export const frameKey = (n: number, f: number): string => `${pad(n)}-${pad(f)}`
/** Door43's picture of a frame (360 px high), the same for every language. */
export const cdnUrl = (n: number, f: number): string => `https://cdn.door43.org/obs/jpg/360px/obs-en-${frameKey(n, f)}.jpg`

/** Where each image is in the file: `{ "01-03": [start, length] }`. */
export type ImageIndex = Record<string, [number, number]>
/** Whether the bytes start like a zip (the pack) rather than a .tcpack. */
export const isZip = (b: Uint8Array): boolean => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04

/**
 * Reads a zip's central directory: every `obs-images/SS-FF.webp` with where its bytes are. Only stored entries (the pack has
 * nothing else); a compressed, cut or odd file throws.
 */
export function readIndex(b: Uint8Array): ImageIndex {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let end = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('not a zip file')
  const count = v.getUint16(end + 10, true)
  let p = v.getUint32(end + 16, true)
  const out: ImageIndex = {}
  const dec = new TextDecoder()
  for (let k = 0; k < count; k++) {
    if (p + 46 > b.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('broken zip directory')
    const method = v.getUint16(p + 10, true)
    const size = v.getUint32(p + 20, true)
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen))
    p += 46 + nlen + xlen + clen
    const m = /^obs-images\/(\d\d-\d\d)\.webp$/.exec(name)
    if (!m) continue
    if (method !== 0) throw new Error(`${name} is compressed`)
    if (local + 30 > b.length || v.getUint32(local, true) !== 0x04034b50) throw new Error(`${name}: broken zip entry`)
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    if (start + size > b.length) throw new Error(`${name} is cut`)
    out[m[1]!] = [start, size]
  }
  return out
}

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('')

/** What the phone keeps: the file whole, its hash, where each image is. */
export type ImagePack = { sha256: string; bytes: number; blob: Blob; index: ImageIndex }
export type ImageStore = { get(): Promise<ImagePack | null>; put(p: ImagePack): Promise<void>; del(): Promise<void> }

/** The page's IndexedDB `btsm-obsimg`, one record. */
export function idbStore(): ImageStore {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('btsm-obsimg', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('pack')
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
  const run = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> => {
    const db = await open()
    try {
      return await new Promise<T>((resolve, reject) => {
        const t = db.transaction('pack', mode)
        const req = f(t.objectStore('pack'))
        t.oncomplete = () => resolve(req.result as T)
        t.onerror = t.onabort = () => reject(t.error ?? req.error)
      })
    } finally {
      db.close()
    }
  }
  return {
    get: async () => (await run<ImagePack | undefined>('readonly', (s) => s.get('obs'))) ?? null,
    put: (p) => run('readwrite', (s) => s.put(p, 'obs')),
    del: () => run('readwrite', (s) => s.delete('obs')),
  }
}

let store: ImageStore | null = null
let pack: Promise<ImagePack | null> | null = null
/** The blob: URLs made, per frame, for the pack with this hash (a picture drawn and not loaded yet keeps working) */
let urls = new Map<string, Promise<string | null>>()
let urlsOf = ''
/** Tests: another store (no argument: the page's IndexedDB again). Forgets what was read. */
export function setImageStore(s?: ImageStore) {
  store = s ?? null
  forget(true)
}
const theStore = (): ImageStore => (store ??= idbStore())
/**
 * Reads the pack again on the next request. `revoke`: the pack is gone (removed), so its URLs are let go; an install keeps
 * them (the only pack the app accepts is the same bytes), so a lazy picture drawn before still loads.
 */
function forget(revoke = false) {
  pack = null
  if (revoke) dropUrls()
}
function dropUrls() {
  for (const u of urls.values()) void u.then((x) => { try { if (x) URL.revokeObjectURL(x) } catch {} })
  urls = new Map()
  urlsOf = ''
}
/** The pack on the phone, or null (read once; an install or a removal reads it again; a failed read is tried again next time). */
export function imagePack(): Promise<ImagePack | null> {
  if (!pack) {
    const p: Promise<ImagePack | null> = theStore().get().catch(() => {
      if (pack === p) pack = null
      return null
    })
    pack = p
  }
  return pack
}
/** How many pictures the pack on the phone has, and its size; null without it. */
export async function imagesInstalled(): Promise<{ count: number; bytes: number } | null> {
  const p = await imagePack()
  return p ? { count: Object.keys(p.index).length, bytes: p.bytes } : null
}

/**
 * Puts the pack on the phone: only a file whose SHA-256 this app knows, with the number of images it says. Throws (with the
 * words for `ui`) for any other file.
 */
export async function installImages(bytes: Uint8Array, ui = 'en'): Promise<{ count: number; bytes: number }> {
  const sha = hex(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
  const k = KNOWN.find((x) => x.sha256 === sha)
  if (!k || k.bytes !== bytes.length) throw new Error(IW(ui).unknown)
  const index = readIndex(bytes)
  if (Object.keys(index).length !== k.count) throw new Error(IW(ui).unknown)
  await theStore().put({ sha256: sha, bytes: bytes.length, blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), index })
  forget()
  return { count: k.count, bytes: bytes.length }
}
/** The file to share: the same bytes as the one installed (the next phone checks the same hash). */
export async function exportImages(): Promise<Uint8Array | null> {
  const p = await imagePack()
  return p ? new Uint8Array(await p.blob.arrayBuffer()) : null
}
export async function removeImages(): Promise<void> {
  await theStore().del()
  forget(true)
}

/** The picture of a frame on the phone (a blob: URL, made once), or null when the pack or that frame is not there. */
export async function localUrl(n: number, f: number): Promise<string | null> {
  const key = frameKey(n, f)
  const p = await imagePack()
  const at = p?.index[key]
  if (!p || !at) return null
  if (urlsOf !== p.sha256) {
    dropUrls()
    urlsOf = p.sha256
  }
  // one URL per frame, even when two pictures of it ask at once
  let u = urls.get(key)
  if (!u) urls.set(key, (u = Promise.resolve(URL.createObjectURL(p.blob.slice(at[0], at[0] + at[1], 'image/webp')))))
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

/** The quiet placeholder, in place of a picture there is no way to show. */
function placeholder(fig: HTMLElement, ui: string) {
  fig.querySelector('img')?.remove()
  if (fig.querySelector('.obs-pic-none')) return
  const box = document.createElement('div')
  box.className = 'obs-pic-none'
  box.textContent = IW(ui).missing
  box.lang = ui
  box.dir = ui === 'ar' ? 'rtl' : 'ltr'
  fig.prepend(box)
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
    if (s.kind === 'none') return placeholder(fig, ui)
    const img = document.createElement('img')
    if (cls) img.className = cls
    img.alt = label
    img.width = 640
    img.height = 360
    img.loading = 'lazy'
    img.onerror = () => placeholder(fig, ui)
    img.src = s.src
    fig.prepend(img)
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
  cap.dir = ui === 'ar' ? 'rtl' : 'ltr'
  fig.append(img, cap)
  box.prepend(fig)
  return at
}

/** The menu's line under the section, and the size as the menu writes it. */
export const imagesLine = (ui: string, have: { count: number; bytes: number } | null): string =>
  have ? fill(IW(ui).have, { n: have.count, mb: `${(have.bytes / 1048576).toFixed(1)} MB` }) : IW(ui).none
