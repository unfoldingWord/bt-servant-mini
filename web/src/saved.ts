// Saved items (bookmarks) and personal notes (diseno-grafo.md, Fase 2d), DOM-free: what is kept, how it is found again, and
// how it opens again. A saved item keeps the QUERY (a passage, an article, a question), not the answer: it opens again
// through the usual path, offline, with the packs on the phone then. An online AI answer keeps its text too (it cannot be
// asked again without internet). A note is the person's own words about a verse, an article or a question, tied to it, and
// shown as "Your note" when that comes back. Everything stays on the phone (localStorage `btsm.saved.v1`), under the PIN and
// the "Don't keep" choice of menu > Safety like the conversations; "Erase" empties it. Nothing here is counted or sent: notes
// never go to online AI (context.ts reads the conversation's messages, and a note is never one).
import type { Sheet } from './answer'
import { articleView } from './answer'
import { installedLangs, openLang } from './packs'
import { strip } from './bidi'
import { bookShown } from './firstuse'
import { APP_LINK } from './share'

export const SAVED_KEY = 'btsm.saved.v1'
const HISTORY = 'btsm.history' // protect.ts: 'none' when nothing is kept on the phone
/** at most this many saved items and this many notes; a note, a name and an online answer at most this long */
export const MAX_ITEMS = 300
export const MAX_NOTES = 300
export const NOTE_MAX = 4000
const NAME_MAX = 80
const TAG_MAX = 30
const TAGS_MAX = 8
const AI_MAX = 12000
/** the whole store at most this many characters (localStorage holds about 5 MB, shared with the conversations) */
const STORE_MAX = 1_500_000

/** What opens again: a passage of a pack, an article, or a question (as typed, or the call sheet of a button). */
export type Query =
  | { k: 'passage'; ref: string; lang: string; what?: string[] }
  | { k: 'article'; id: string; lang: string }
  | { k: 'search'; q: string; lang?: string; sheet?: Sheet }
export type Kind = 'passage' | 'article' | 'search' | 'answer'
export const KINDS: Kind[] = ['passage', 'article', 'search', 'answer']
export type Saved = {
  id: string; kind: Kind; q: Query
  /** what it was called when saved (a passage is named again in the app's language when shown) */
  label: string
  /** the person's own name for it, and their groups ("Ruth", "Figures") */
  name?: string; tags: string[]
  at: number; ui: string
  /** an online answer: its text and model, and the question it answered */
  ai?: { text: string; model: string }; question?: string
}
export type Note = { id: string; key: string; q: Query; label: string; text: string; at: number; ui: string }
type Store = { v: 1; items: Saved[]; notes: Note[] }
/** 'full': the phone's storage refused it; 'many': the most there may be */
export type Result = 'ok' | 'full' | 'many'

// --------------------------------------------------------------------------------------------------------------- strings

export type ST = {
  save: string; saved: string; saveTip: string; unsaveTip: string; note: string; noteTip: string; yourNote: string
  title: string; notesTab: string; menuSub: string; search: string; searchNotes: string; groups: Record<Kind, string>
  empty: string; emptyNotes: string; noMatch: string; notePh: string; saveNote: string; cancel: string; edit: string
  del: string; confirmDel: string; share: string; name: string; tags: string; allTags: string; askAgain: string
  missing: string; addLang: string; noLang: string; full: string; many: string; busy: string; notKept: string; private: string
  saveVerses: string; done: string; versesHint: string; online: string; close: string; back: string
  /** removing one with a name or groups asks a second tap */
  sure: string
  /** opened from another pack than the one it was saved from; the pack has no longer this book or article */
  fromPack: string; notHere: string
}
const STR: Record<string, ST> = {
  en: {
    save: 'Save', saved: 'Saved', saveTip: 'Save this to open it again later', unsaveTip: 'Remove from Saved', note: 'Note',
    noteTip: 'Write a note about this', yourNote: 'Your note', title: 'Saved', notesTab: 'Notes', menuSub: 'Items: {n} · Notes: {m}',
    search: 'Search saved items…', searchNotes: 'Search your notes…',
    groups: { passage: 'Passages', article: 'Articles', search: 'Searches', answer: 'Answers' },
    empty: 'Nothing saved yet. Tap ☆ Save under an answer, on an article, or on a verse in Browse.',
    emptyNotes: 'No notes yet. Tap ✎ Note under an answer to write what you learned in your own words.',
    noMatch: 'Nothing matches.', notePh: 'What did you learn? Write it in your own words.', saveNote: 'Save note', cancel: 'Cancel',
    edit: 'Edit', del: 'Delete', confirmDel: 'Delete?', share: 'Share', name: 'Name (optional)',
    tags: 'Groups, separated by commas (e.g. Ruth, Figures)', allTags: 'All', askAgain: 'Ask again',
    missing: 'This needs {lang}, which is no longer on this phone.', addLang: 'Add a language',
    noLang: 'There is no language on this phone yet.', full: 'There is no room left on the phone to save this.',
    many: 'You have reached {n}. Delete some to save more.', busy: 'An answer is on its way: tap again when it is here.',
    notKept: 'Conversations are not kept (menu > Safety): saved items and notes are gone when the app closes.',
    private: 'Saved items and notes stay on this phone only. They are never sent to online AI.',
    saveVerses: '☆ Save verses', done: 'Done', versesHint: 'Tap a verse to save it, or tap it again to remove it.',
    online: 'Online AI · {model}', close: 'Close', back: 'Back',
    sure: 'It has a name or groups: tap again to remove it from Saved.',
    fromPack: 'from the {pack} resources', notHere: 'The languages on this phone do not have this book or article.',
  },
  es: {
    save: 'Guardar', saved: 'Guardado', saveTip: 'Guardar esto para abrirlo después', unsaveTip: 'Quitar de Guardados', note: 'Nota',
    noteTip: 'Escribir una nota sobre esto', yourNote: 'Tu nota', title: 'Guardados', notesTab: 'Notas', menuSub: 'Elementos: {n} · Notas: {m}',
    search: 'Buscar en guardados…', searchNotes: 'Buscar en tus notas…',
    groups: { passage: 'Pasajes', article: 'Artículos', search: 'Búsquedas', answer: 'Respuestas' },
    empty: 'Todavía no hay nada guardado. Toca ☆ Guardar bajo una respuesta, en un artículo o en un versículo de Explorar.',
    emptyNotes: 'Todavía no hay notas. Toca ✎ Nota bajo una respuesta para escribir con tus palabras lo que aprendiste.',
    noMatch: 'Nada coincide.', notePh: '¿Qué aprendiste? Escríbelo con tus palabras.', saveNote: 'Guardar nota', cancel: 'Cancelar',
    edit: 'Editar', del: 'Borrar', confirmDel: '¿Borrar?', share: 'Compartir', name: 'Nombre (opcional)',
    tags: 'Grupos, separados por comas (p. ej. Rut, Figuras)', allTags: 'Todos', askAgain: 'Preguntar otra vez',
    missing: 'Esto necesita el idioma {lang}, que ya no está en este teléfono.', addLang: 'Agregar un idioma',
    noLang: 'Todavía no hay ningún idioma en este teléfono.', full: 'No queda espacio en el teléfono para guardar esto.',
    many: 'Llegaste a {n}. Borra algunos para guardar más.', busy: 'Ya viene una respuesta: toca de nuevo cuando llegue.',
    notKept: 'Las conversaciones no se guardan (menú > Seguridad): los guardados y las notas desaparecen al cerrar la app.',
    private: 'Los guardados y las notas quedan solo en este teléfono. Nunca se envían a la IA en línea.',
    saveVerses: '☆ Guardar versículos', done: 'Listo', versesHint: 'Toca un versículo para guardarlo, o tócalo otra vez para quitarlo.',
    online: 'IA en línea · {model}', close: 'Cerrar', back: 'Atrás',
    sure: 'Tiene nombre o grupos: toca otra vez para quitarlo de Guardados.',
    fromPack: 'de los recursos en {pack}', notHere: 'Los idiomas de este teléfono no tienen este libro ni este artículo.',
  },
  fr: {
    save: 'Enregistrer', saved: 'Enregistré', saveTip: 'Enregistrer pour le rouvrir plus tard', unsaveTip: 'Retirer des favoris', note: 'Note',
    noteTip: 'Écrire une note à ce sujet', yourNote: 'Votre note', title: 'Favoris', notesTab: 'Notes', menuSub: 'Éléments : {n} · Notes : {m}',
    search: 'Chercher dans les favoris…', searchNotes: 'Chercher dans vos notes…',
    groups: { passage: 'Passages', article: 'Articles', search: 'Recherches', answer: 'Réponses' },
    empty: "Rien d'enregistré pour l'instant. Touchez ☆ Enregistrer sous une réponse, sur un article ou sur un verset dans Parcourir.",
    emptyNotes: 'Pas encore de notes. Touchez ✎ Note sous une réponse pour écrire avec vos mots ce que vous avez appris.',
    noMatch: 'Aucun résultat.', notePh: "Qu'avez-vous appris ? Écrivez-le avec vos mots.", saveNote: 'Enregistrer la note', cancel: 'Annuler',
    edit: 'Modifier', del: 'Supprimer', confirmDel: 'Supprimer ?', share: 'Partager', name: 'Nom (facultatif)',
    tags: 'Groupes, séparés par des virgules (ex. Ruth, Figures de style)', allTags: 'Tous', askAgain: 'Redemander',
    missing: "Il faut la langue {lang}, qui n'est plus sur ce téléphone.", addLang: 'Ajouter une langue',
    noLang: "Il n'y a encore aucune langue sur ce téléphone.", full: "Il n'y a plus de place sur le téléphone pour enregistrer ceci.",
    many: 'Vous avez atteint {n}. Supprimez-en pour en enregistrer d’autres.', busy: 'Une réponse arrive : touchez à nouveau quand elle sera là.',
    notKept: "Les conversations ne sont pas gardées (menu > Sécurité) : les favoris et les notes disparaissent à la fermeture de l'application.",
    private: "Les favoris et les notes restent uniquement sur ce téléphone. Ils ne sont jamais envoyés à l'IA en ligne.",
    saveVerses: '☆ Enregistrer des versets', done: 'Terminé', versesHint: "Touchez un verset pour l'enregistrer, ou touchez-le encore pour le retirer.",
    online: 'IA en ligne · {model}', close: 'Fermer', back: 'Retour',
    sure: 'Il a un nom ou des groupes : touchez encore pour le retirer des favoris.',
    fromPack: 'des ressources en {pack}', notHere: "Les langues de ce téléphone n'ont pas ce livre ni cet article.",
  },
  id: {
    save: 'Simpan', saved: 'Tersimpan', saveTip: 'Simpan agar bisa dibuka lagi nanti', unsaveTip: 'Hapus dari Tersimpan', note: 'Catatan',
    noteTip: 'Tulis catatan tentang ini', yourNote: 'Catatan Anda', title: 'Tersimpan', notesTab: 'Catatan', menuSub: 'Item: {n} · Catatan: {m}',
    search: 'Cari yang tersimpan…', searchNotes: 'Cari catatan Anda…',
    groups: { passage: 'Bagian Alkitab', article: 'Artikel', search: 'Pencarian', answer: 'Jawaban' },
    empty: 'Belum ada yang disimpan. Ketuk ☆ Simpan di bawah jawaban, pada artikel, atau pada ayat di Jelajahi.',
    emptyNotes: 'Belum ada catatan. Ketuk ✎ Catatan di bawah jawaban untuk menulis apa yang Anda pelajari dengan kata-kata sendiri.',
    noMatch: 'Tidak ada yang cocok.', notePh: 'Apa yang Anda pelajari? Tulis dengan kata-kata Anda sendiri.', saveNote: 'Simpan catatan', cancel: 'Batal',
    edit: 'Ubah', del: 'Hapus', confirmDel: 'Hapus?', share: 'Bagikan', name: 'Nama (pilihan)',
    tags: 'Kelompok, pisahkan dengan koma (mis. Rut, Majas)', allTags: 'Semua', askAgain: 'Tanya lagi',
    missing: 'Ini memerlukan {lang}, yang sudah tidak ada di ponsel ini.', addLang: 'Tambah bahasa',
    noLang: 'Belum ada bahasa di ponsel ini.', full: 'Ruang di ponsel sudah penuh: ini tidak bisa disimpan.',
    many: 'Anda sudah mencapai {n}. Hapus beberapa untuk menyimpan lagi.', busy: 'Jawaban sedang datang: ketuk lagi setelah jawaban muncul.',
    notKept: 'Percakapan tidak disimpan (menu > Keamanan): yang tersimpan dan catatan hilang saat aplikasi ditutup.',
    private: 'Yang tersimpan dan catatan hanya ada di ponsel ini. Tidak pernah dikirim ke AI daring.',
    saveVerses: '☆ Simpan ayat', done: 'Selesai', versesHint: 'Ketuk ayat untuk menyimpannya, atau ketuk lagi untuk menghapusnya.',
    online: 'AI daring · {model}', close: 'Tutup', back: 'Kembali',
    sure: 'Ini punya nama atau kelompok: ketuk lagi untuk menghapusnya dari Tersimpan.',
    fromPack: 'dari sumber daya {pack}', notHere: 'Bahasa di ponsel ini tidak memuat kitab atau artikel ini.',
  },
  hi: {
    save: 'सहेजें', saved: 'सहेजा गया', saveTip: 'बाद में फिर खोलने के लिए सहेजें', unsaveTip: 'सहेजे गए से हटाएँ', note: 'नोट',
    noteTip: 'इसके बारे में नोट लिखें', yourNote: 'आपका नोट', title: 'सहेजे गए', notesTab: 'नोट', menuSub: 'चीज़ें: {n} · नोट: {m}',
    search: 'सहेजे गए में खोजें…', searchNotes: 'अपने नोट में खोजें…',
    groups: { passage: 'बाइबल अंश', article: 'लेख', search: 'खोज', answer: 'उत्तर' },
    empty: 'अभी कुछ सहेजा नहीं गया है। किसी उत्तर के नीचे, किसी लेख पर, या ब्राउज़ में किसी पद पर ☆ सहेजें टैप करें।',
    emptyNotes: 'अभी कोई नोट नहीं है। जो आपने सीखा उसे अपने शब्दों में लिखने के लिए किसी उत्तर के नीचे ✎ नोट टैप करें।',
    noMatch: 'कुछ नहीं मिला।', notePh: 'आपने क्या सीखा? उसे अपने शब्दों में लिखें।', saveNote: 'नोट सहेजें', cancel: 'रद्द करें',
    edit: 'बदलें', del: 'हटाएँ', confirmDel: 'हटाएँ?', share: 'साझा करें', name: 'नाम (वैकल्पिक)',
    tags: 'समूह, अल्पविराम से अलग करें (जैसे रूत, अलंकार)', allTags: 'सभी', askAgain: 'फिर से पूछें',
    missing: 'इसके लिए {lang} भाषा चाहिए, जो अब इस फ़ोन पर नहीं है।', addLang: 'भाषा जोड़ें',
    noLang: 'इस फ़ोन पर अभी कोई भाषा नहीं है।', full: 'फ़ोन में जगह नहीं बची: इसे सहेजा नहीं जा सका।',
    many: 'आप {n} तक पहुँच गए हैं। और सहेजने के लिए कुछ हटाएँ।', busy: 'एक उत्तर आ रहा है: उसके आने पर फिर से टैप करें।',
    notKept: 'बातचीत रखी नहीं जाती (मेनू > सुरक्षा): ऐप बंद होने पर सहेजी गई चीज़ें और नोट मिट जाते हैं।',
    private: 'सहेजी गई चीज़ें और नोट केवल इसी फ़ोन पर रहते हैं। वे ऑनलाइन AI को कभी नहीं भेजे जाते।',
    saveVerses: '☆ पद सहेजें', done: 'हो गया', versesHint: 'किसी पद को सहेजने के लिए टैप करें, या हटाने के लिए फिर से टैप करें।',
    online: 'ऑनलाइन AI · {model}', close: 'बंद करें', back: 'वापस',
    sure: 'इसका नाम या समूह है: सहेजे गए से हटाने के लिए फिर टैप करें।',
    fromPack: '{pack} संसाधनों से', notHere: 'इस फ़ोन की भाषाओं में यह पुस्तक या लेख नहीं है।',
  },
  ar: {
    save: 'حفظ', saved: 'محفوظ', saveTip: 'احفظ هذا لتفتحه لاحقًا', unsaveTip: 'إزالة من المحفوظات', note: 'ملاحظة',
    noteTip: 'اكتب ملاحظة عن هذا', yourNote: 'ملاحظتك', title: 'المحفوظات', notesTab: 'الملاحظات', menuSub: 'العناصر: {n} · الملاحظات: {m}',
    search: 'ابحث في المحفوظات…', searchNotes: 'ابحث في ملاحظاتك…',
    groups: { passage: 'المقاطع', article: 'المقالات', search: 'عمليات البحث', answer: 'الإجابات' },
    empty: 'لا يوجد شيء محفوظ بعد. المس ☆ حفظ تحت إجابة، أو على مقالة، أو على آية في «تصفّح».',
    emptyNotes: 'لا توجد ملاحظات بعد. المس ✎ ملاحظة تحت إجابة لتكتب بكلماتك ما تعلّمته.',
    noMatch: 'لا توجد نتائج مطابقة.', notePh: 'ماذا تعلّمت؟ اكتبه بكلماتك.', saveNote: 'حفظ الملاحظة', cancel: 'إلغاء',
    edit: 'تعديل', del: 'حذف', confirmDel: 'حذف؟', share: 'مشاركة', name: 'الاسم (اختياري)',
    tags: 'المجموعات، تفصل بينها فواصل (مثل: راعوث، الصور البلاغية)', allTags: 'الكل', askAgain: 'اسأل مرة أخرى',
    missing: 'يحتاج هذا إلى لغة {lang}، وهي لم تعد على هذا الهاتف.', addLang: 'إضافة لغة',
    noLang: 'لا توجد أي لغة على هذا الهاتف بعد.', full: 'لم تعد في الهاتف مساحة لحفظ هذا.',
    many: 'بلغت الحد ({n}). احذف بعضها لتحفظ المزيد.', busy: 'هناك إجابة في الطريق: المس مجددًا عندما تصل.',
    notKept: 'لا يُحتفظ بالمحادثات (القائمة > الأمان): تختفي المحفوظات والملاحظات عند إغلاق التطبيق.',
    private: 'تبقى المحفوظات والملاحظات على هذا الهاتف فقط، ولا تُرسَل أبدًا إلى الذكاء الاصطناعي عبر الإنترنت.',
    saveVerses: '☆ حفظ آيات', done: 'تم', versesHint: 'المس آية لحفظها، أو المسها مرة أخرى لإزالتها.',
    online: 'ذكاء اصطناعي عبر الإنترنت · {model}', close: 'إغلاق', back: 'رجوع',
    sure: 'له اسم أو مجموعات: المس مرة أخرى لإزالته من المحفوظات.',
    fromPack: 'من موارد {pack}', notHere: 'لا تحتوي اللغات على هذا الهاتف على هذا السفر أو هذه المقالة.',
  },
}
export const SAVED_LANGS = Object.keys(STR)
export const ST = (ui: string): ST => STR[ui] ?? STR[ui.split('-')[0]!] ?? STR.en!
export const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))
/** "Items: 3 · Notes: 1": the line of the menu row and of Browse. */
export const savedSummary = (ui: string): string => fill(ST(ui).menuSub, { n: savedItems().length, m: notes().length })

// --------------------------------------------------------------------------------------------------------------- storage

let mem: Store | null = null
const keep = (): boolean => {
  try {
    return localStorage.getItem(HISTORY) !== 'none'
  } catch {
    return true
  }
}
const str = (x: unknown, max: number): string => (typeof x === 'string' ? strip(x).slice(0, max) : '')
const isKind = (k: unknown): k is Kind => KINDS.includes(k as Kind)
const sOrNull = (x: unknown): string | null => (typeof x === 'string' ? x : null)
/** A button's call sheet as read from the phone: only the fields a sheet has, of their types (else none). */
export function cleanSheet(x: any): Sheet | undefined {
  if (!x || typeof x !== 'object' || typeof x.intent !== 'string' || typeof x.lang !== 'string') return undefined
  const strs = (a: unknown): string[] => (Array.isArray(a) ? a.filter((w): w is string => typeof w === 'string') : [])
  return sheetOf(x.lang, {
    intent: x.intent, ref: sOrNull(x.ref), what: strs(x.what), version: sOrNull(x.version), concept: sOrNull(x.concept),
    term: sOrNull(x.term), phrase: sOrNull(x.phrase), candidates: Array.isArray(x.candidates) ? strs(x.candidates) : null,
  })
}
function cleanQuery(q: any): Query | null {
  if (!q || typeof q !== 'object') return null
  if (q.k === 'passage' && typeof q.ref === 'string' && /^[0-9a-z]{3}( |$)/.test(q.ref) && typeof q.lang === 'string')
    return { k: 'passage', ref: q.ref, lang: q.lang, ...(Array.isArray(q.what) ? { what: q.what.filter((w: unknown) => typeof w === 'string') } : {}) }
  if (q.k === 'article' && typeof q.id === 'string' && /^t[aw]:/.test(q.id) && typeof q.lang === 'string') return { k: 'article', id: q.id, lang: q.lang }
  if (q.k === 'search' && typeof q.q === 'string' && q.q.trim()) {
    const s = cleanSheet(q.sheet)
    return { k: 'search', q: strip(q.q), ...(typeof q.lang === 'string' ? { lang: q.lang } : {}), ...(s ? { sheet: s } : {}) }
  }
  return null
}
/** What was read from the phone, checked: anything that does not have the shape of an item or a note is left out. */
function clean(d: any): Store {
  const out: Store = { v: 1, items: [], notes: [] }
  if (!d || typeof d !== 'object') return out
  for (const x of Array.isArray(d.items) ? d.items : []) {
    const q = cleanQuery(x?.q)
    if (!q || !isKind(x.kind) || typeof x.id !== 'string') continue
    out.items.push({
      id: x.id, kind: x.kind, q, label: str(x.label, 200), tags: Array.isArray(x.tags) ? x.tags.map((t: unknown) => str(t, TAG_MAX)).filter(Boolean).slice(0, TAGS_MAX) : [],
      at: Number(x.at) || 0, ui: typeof x.ui === 'string' ? x.ui : 'en',
      ...(x.name ? { name: str(x.name, NAME_MAX) } : {}),
      ...(x.ai && typeof x.ai.text === 'string' ? { ai: { text: x.ai.text.slice(0, AI_MAX), model: str(x.ai.model, 80) } } : {}),
      ...(x.question ? { question: str(x.question, 500) } : {}),
    })
  }
  for (const n of Array.isArray(d.notes) ? d.notes : []) {
    const q = cleanQuery(n?.q)
    if (!q || typeof n.id !== 'string' || typeof n.text !== 'string' || !n.text.trim()) continue
    out.notes.push({ id: n.id, key: keyOf(q), q, label: str(n.label, 200), text: str(n.text, NOTE_MAX), at: Number(n.at) || 0, ui: typeof n.ui === 'string' ? n.ui : 'en' })
  }
  out.items = out.items.slice(0, MAX_ITEMS)
  out.notes = out.notes.slice(0, MAX_NOTES)
  return out
}
function store(): Store {
  if (mem) return mem
  mem = { v: 1, items: [], notes: [] }
  if (!keep()) return mem
  try {
    mem = clean(JSON.parse(localStorage.getItem(SAVED_KEY) ?? 'null'))
  } catch {}
  return mem
}
/** Writes the store (or, when nothing is kept on the phone, removes it): false when the phone refused or it is too big. */
function persist(): boolean {
  try {
    if (!keep()) {
      localStorage.removeItem(SAVED_KEY)
      return true
    }
    const s = JSON.stringify(mem)
    if (s.length > STORE_MAX) return false
    localStorage.setItem(SAVED_KEY, s)
    return true
  } catch {
    return false
  }
}
/** A change, undone when it could not be written (the phone is full): what is shown stays what is kept. */
function change(f: (s: Store) => Result | void): Result {
  const s = store()
  const before = JSON.stringify(s)
  const r = f(s)
  if (r && r !== 'ok') return r
  if (persist()) return 'ok'
  mem = JSON.parse(before)
  return 'full'
}
const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Tests, and a new reading of the phone (another tab): forget what was read. */
export function resetSaved() {
  mem = null
}
/** Menu > Safety > Erase: every saved item and note, here and on the phone. */
export function eraseSaved() {
  mem = { v: 1, items: [], notes: [] }
  try {
    localStorage.removeItem(SAVED_KEY)
  } catch {}
}

// ---------------------------------------------------------------------------------------------------------------- queries

const fold = (s: string): string => strip(s).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[¿?!¡.,;:«»"“”؟]/g, ' ').replace(/\s+/g, ' ').trim()
/** Where a note is tied and how a saved item is known: "p:rut 1:16", "a:ta:translate/figs-metaphor", "s:where was jonah". */
export function keyOf(q: Query): string {
  if (q.k === 'passage') return `p:${q.ref.toLowerCase()}`
  if (q.k === 'article') return `a:${q.id}`
  return `s:${fold(q.q)}`
}
const savedKey = (q: Query, ai: boolean) => (ai ? `ai:${keyOf(q)}` : keyOf(q))
export const kindOf = (q: Query, ai = false): Kind => (ai ? 'answer' : q.k)

/**
 * The query of an answer (main.ts respond), from what pipeline.ts answered: a passage or an article when the question asked
 * for one, else the question as typed (it is read again), else the button's call sheet. Null when there is nothing to open.
 */
export function queryOfAnswer(a: { sheet?: Sheet | null; ref?: string | null; concept?: string | null; q?: string; label?: string; lang?: string }): Query | null {
  const lang = a.lang || a.sheet?.lang || 'en'
  const passage = (): Query | null => (a.ref && /^[0-9a-z]{3}( |$)/.test(a.ref) ? { k: 'passage', ref: a.ref, lang, ...(a.sheet?.intent === 'passage' && a.sheet.what?.length ? { what: [...a.sheet.what] } : {}) } : null)
  const article = (): Query | null => (a.concept && /^t[aw]:/.test(a.concept) ? { k: 'article', id: a.concept, lang } : null)
  const intent = a.sheet?.intent
  if (intent === 'passage') { const p = passage(); if (p) return p }
  if (intent === 'article') { const x = article(); if (x) return x }
  const typed = strip(a.q ?? '').trim()
  if (typed) return { k: 'search', q: typed, lang }
  const label = strip(a.label ?? '').trim()
  // a button of another kind (advice, count, choose…): its own call sheet, so it opens as the same answer, not as a plain passage
  const sheet = cleanSheet(a.sheet)
  if (sheet && intent !== 'passage' && intent !== 'article' && label) return { k: 'search', q: label, lang, sheet }
  const p = passage() ?? article()
  if (p) return p
  return label ? { k: 'search', q: label, lang, ...(sheet ? { sheet } : {}) } : null
}

/** "Ruth 1:16", "Ruth: introduction" kept short: a passage named in the app's language. */
export function refLabel(ui: string, ref: string): string {
  const [code, rest] = ref.split(' ')
  return `${bookShown(ui, code!)}${rest ? ' ' + rest.replace(/^front:intro$/, '') : ''}`.trim()
}
/** What an item is called: the person's name, else a passage in the app's language, else what it was called when saved. */
export const itemTitle = (x: Saved, ui: string): string => x.name || named(x.q, x.label, ui)
export const noteTitle = (n: Note, ui: string): string => named(n.q, n.label, ui)
// (an introduction keeps the words it was saved with, "Ruth: Introduction to the book"; a verse is named in the app's language)
const named = (q: Query, label: string, ui: string): string =>
  (q.k === 'passage' && !(/intro$/.test(q.ref) && label) ? refLabel(ui, q.ref) : label || (q.k === 'search' ? q.q : q.k === 'passage' ? q.ref : q.id))

// ------------------------------------------------------------------------------------------------------------ saved items

export const savedItems = (): Saved[] => [...store().items].sort((a, b) => b.at - a.at)
/**
 * The saved item for a query: without `ai`, the query itself (a passage, an article, a question); with an online answer's
 * text, that answer (another answer to the same question is another item); `true`, any answer to it.
 */
export const findSaved = (q: Query, ai: { text: string } | boolean = false): Saved | undefined => {
  const key = keyOf(q)
  return store().items.find((x) => keyOf(x.q) === key && (ai ? x.kind === 'answer' && (ai === true || x.ai?.text === ai.text) : x.kind !== 'answer'))
}
export const isSaved = (q: Query, ai: { text: string } | boolean = false): boolean => !!findSaved(q, ai)

/** Saves a query (with an online answer's text when `ai`); saved already: that one, unchanged. */
export function addSaved(o: { q: Query; label: string; ui: string; ai?: { text: string; model: string }; question?: string }): { res: Result; item?: Saved } {
  const had = findSaved(o.q, o.ai ?? false)
  if (had) return { res: 'ok', item: had }
  let item: Saved | undefined
  const res = change((s) => {
    if (s.items.length >= MAX_ITEMS) return 'many'
    item = {
      id: newId('s'), kind: kindOf(o.q, !!o.ai), q: o.q, label: strip(o.label).trim().slice(0, 200), tags: [], at: Date.now(), ui: o.ui,
      ...(o.ai ? { ai: { text: o.ai.text.slice(0, AI_MAX), model: strip(o.ai.model).slice(0, 80) } } : {}),
      ...(o.question ? { question: strip(o.question).trim().slice(0, 500) } : {}),
    }
    s.items.push(item)
  })
  return res === 'ok' ? { res, item } : { res }
}
/**
 * The online answer arrived after its button saved it (while it was written): that item, `id`, keeps the answer's text too, as
 * one saved with it would, instead of a second item. Only that one: a verse saved before (in Browse, say) stays a passage.
 * Nothing to do when the item is gone (taken out meanwhile) or has an answer already.
 */
export function upgradeSaved(id: string, ai: { text: string; model: string }, question?: string): Result {
  const had = store().items.find((i) => i.id === id)
  if (!had || had.kind === 'answer') return 'ok'
  return change((s) => {
    const x = s.items.find((i) => i.id === id)
    if (!x) return
    x.kind = 'answer'
    x.ai = { text: ai.text.slice(0, AI_MAX), model: strip(ai.model).slice(0, 80) }
    if (question) x.question = strip(question).trim().slice(0, 500)
  })
}
export function removeSaved(id: string): Result {
  return change((s) => { s.items = s.items.filter((x) => x.id !== id) })
}
/** Groups typed as "Ruth, Figures" (or with Arabic commas), each kept once. */
export const parseTags = (t: string): string[] =>
  [...new Set(strip(t).split(/[,،;؛\n]/).map((x) => x.replace(/\s+/g, ' ').trim().slice(0, TAG_MAX)).filter(Boolean))].slice(0, TAGS_MAX)
/** An item the person named or grouped: taking it out of Saved asks a second tap (a ☆ or a verse in Browse is easy to tap). */
export const personal = (x: Saved | undefined): boolean => !!x && (!!x.name || x.tags.length > 0)
/** The person's name for an item ('' removes it) and its groups. */
export function editSaved(id: string, name: string, tags: string[]): Result {
  return change((s) => {
    const x = s.items.find((i) => i.id === id)
    if (!x) return
    const n = strip(name).replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
    if (n) x.name = n
    else delete x.name
    x.tags = parseTags(tags.join(','))
  })
}
/** Every group in use, by name. */
export const allTags = (): string[] => [...new Set(store().items.flatMap((x) => x.tags))].sort((a, b) => a.localeCompare(b))

/** The items that match what is typed (in a title, name, group, question or online answer) and the group chosen. */
export function searchSaved(text: string, tag: string | null = null, ui = 'en'): Saved[] {
  const words = fold(text).split(' ').filter(Boolean)
  return savedItems().filter((x) => {
    if (tag && !x.tags.includes(tag)) return false
    if (!words.length) return true
    const hay = fold([itemTitle(x, ui), x.label, x.name ?? '', x.tags.join(' '), x.question ?? '', x.ai?.text ?? '', x.q.k === 'search' ? x.q.q : x.q.k === 'passage' ? x.q.ref : x.q.id].join(' '))
    return words.every((w) => hay.includes(w))
  })
}
/** By kind, in the order passages, articles, searches, answers; newest first in each. */
export function groupSaved(items: Saved[]): { kind: Kind; items: Saved[] }[] {
  return KINDS.map((kind) => ({ kind, items: items.filter((x) => x.kind === kind) })).filter((g) => g.items.length)
}

// ------------------------------------------------------------------------------------------------------------------ notes

export const notes = (): Note[] => [...store().notes].sort((a, b) => b.at - a.at)
export const noteFor = (q: Query): Note | undefined => store().notes.find((n) => n.key === keyOf(q))

/** A passage as verse numbers (chapter × 1000 + verse), first to last; null for an introduction or what cannot be read. */
function span(ref: string): { code: string; a: number; b: number } | null {
  const m = /^([0-9a-z]{3})(?: (\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?)?$/.exec(ref.toLowerCase())
  if (!m) return null
  const code = m[1]!
  if (!m[2]) return { code, a: 0, b: 999_999 }
  const c1 = +m[2], v1 = m[3] ? +m[3] : null
  let c2 = c1, v2: number | null = v1
  if (m[4] && m[5]) { c2 = +m[4]; v2 = +m[5] } // 1:20-2:3
  else if (m[4]) { if (v1 === null) { c2 = +m[4]; v2 = null } else v2 = +m[4] } // 1-2, 1:6-18
  return { code, a: c1 * 1000 + (v1 ?? 0), b: c2 * 1000 + (v2 ?? 999) }
}
/**
 * The notes to show above an answer: the one tied to it, and for a passage, those tied to a verse or passage it shares a verse
 * with (a note on Ruth 1:16 shows on Ruth 1 and Ruth 1:16-18). Newest first.
 */
export function notesAbout(q: Query | null | undefined): Note[] {
  if (!q) return []
  const key = keyOf(q)
  const here = q.k === 'passage' ? span(q.ref) : null
  return notes().filter((n) => {
    if (n.key === key) return true
    if (!here || n.q.k !== 'passage') return false
    const s = span(n.q.ref)
    return !!s && s.code === here.code && s.a <= here.b && here.a <= s.b
  })
}
/** Writes the note tied to `q` (the person's words, without bidi marks); an empty text deletes it. */
export function setNote(q: Query, label: string, text: string, ui: string): Result {
  const t = strip(text).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim().slice(0, NOTE_MAX)
  const key = keyOf(q)
  return change((s) => {
    const had = s.notes.find((n) => n.key === key)
    if (!t) {
      s.notes = s.notes.filter((n) => n.key !== key)
      return
    }
    if (had) {
      had.text = t
      had.at = Date.now()
      had.ui = ui
      return
    }
    if (s.notes.length >= MAX_NOTES) return 'many'
    s.notes.push({ id: newId('n'), key, q, label: strip(label).trim().slice(0, 200), text: t, at: Date.now(), ui })
  })
}
export function removeNote(id: string): Result {
  return change((s) => { s.notes = s.notes.filter((n) => n.id !== id) })
}
export function searchNotes(text: string, ui = 'en'): Note[] {
  const words = fold(text).split(' ').filter(Boolean)
  return notes().filter((n) => {
    if (!words.length) return true
    const hay = fold(`${noteTitle(n, ui)} ${n.label} ${n.text} ${n.q.k === 'passage' ? n.q.ref : ''}`)
    return words.every((w) => hay.includes(w))
  })
}
/** A note as it is shared (WhatsApp or the phone's share sheet): what it is about, the person's words, the app's link. */
export const noteShareText = (n: Note, ui: string): string => strip([noteTitle(n, ui), n.text, APP_LINK].filter(Boolean).join('\n\n'))

// ---------------------------------------------------------------------------------------------------------- opening again

export type Plan =
  /** `from`: the pack it opens from, when not the one it was saved from */
  | { k: 'sheet'; label: string; sheet: Sheet; from?: string }
  | { k: 'ask'; q: string }
  /**
   * it cannot open: 'pack', the pack it was saved from is no longer on the phone (and no other has it); 'content', that pack is
   * here but has not this book or article (nor does another); 'none', there is no language on the phone
   */
  | { k: 'missing'; lang: string | null; why: 'pack' | 'content' | 'none' }
function sheetOf(lang: string, o: Partial<Sheet>): Sheet {
  return { id: `v${Date.now()}`, intent: 'passage', ref: null, what: [], version: null, concept: null, term: null, phrase: null, candidates: null, lang, ...o }
}

/**
 * How a saved query opens again with the packs on the phone now: a passage from its pack, else from another pack that has the
 * book; an article from any pack that has it; a question asked again as typed (a button's sheet run again). Never throws.
 */
export async function reopen(q: Query, label: string): Promise<Plan> {
  try {
    const langs = await installedLangs().catch(() => [] as string[])
    if (!langs.length) return { k: 'missing', lang: q.k === 'search' ? null : q.lang, why: 'none' }
    const from = (l: string, saved: string) => (l !== saved ? { from: l } : {})
    // what cannot open says why: its pack is gone, or its pack is here without it
    const missing = (lang: string): Plan => ({ k: 'missing', lang, why: langs.includes(lang) ? 'content' : 'pack' })
    if (q.k === 'passage') {
      const code = q.ref.split(' ')[0]!
      for (const l of [q.lang, ...langs.filter((x) => x !== q.lang)]) {
        if (!langs.includes(l)) continue
        try {
          if ((await openLang(l)).installed(`book:${code}`))
            return { k: 'sheet', label, sheet: sheetOf(l, { intent: 'passage', ref: q.ref, what: q.what?.length ? [...q.what] : ['text', 'notes'] }), ...from(l, q.lang) }
        } catch {}
      }
      return missing(q.lang)
    }
    if (q.k === 'article') {
      // (articleView reads its pack, then English, then every other pack on the phone: answer.ts packsFor)
      const a = await articleView(langs.includes(q.lang) ? q.lang : langs[0]!, q.id).catch(() => null)
      return a ? { k: 'sheet', label, sheet: sheetOf(a.lang, { intent: 'article', concept: q.id }), ...from(a.lang, q.lang) } : missing(q.lang)
    }
    if (q.sheet) {
      const s = cleanSheet(q.sheet)!
      const l = langs.includes(s.lang) ? s.lang : langs.includes('en') ? 'en' : langs[0]!
      return { k: 'sheet', label: q.q, sheet: { ...s, lang: l }, ...from(l, s.lang) }
    }
    return { k: 'ask', q: q.q }
  } catch {
    return { k: 'missing', lang: null, why: 'none' }
  }
}

/** The chat's words for an item opened again: from another pack than its own, it says which ("Ruth 1:16 · from the English pack"). */
export const planLabel = (p: Extract<Plan, { k: 'sheet' }>, ui: string, packName: (l: string) => string): string =>
  p.from ? `${p.label} · ${fill(ST(ui).fromPack, { pack: packName(p.from) })}` : p.label
/** Why an item cannot open: its pack is gone, its pack has not this book or article, or there is no language at all. */
export const missingText = (p: Extract<Plan, { k: 'missing' }>, ui: string, packName: (l: string) => string): string =>
  p.why === 'content' ? ST(ui).notHere : p.why === 'pack' && p.lang ? fill(ST(ui).missing, { lang: packName(p.lang) }) : ST(ui).noLang
