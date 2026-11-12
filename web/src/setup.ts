// The "About" screen (also shown on first launch), and the menu's Model and Languages sections: download or load the
// model, add languages from the packs server or from a .tcpack file, share them with another phone.
import { appVersion, downloadModel, exportModel, isLite, MODEL, modelState, pickModelFile, saveToDownloads } from './model'
import { availableLangs, downloadLang, exportPack, importPack, installedLangs, origin, removeLang } from './packs'

type S = {
  about: string; title: string; body: string[]; version: string; full: string; lite: string; start: string; close: string
  model: string; mReady: string; mMissing: string; mDown: string; mImport: string; mStart: string; mError: string
  download: string; loadFile: string; share: string; saved: string; langs: string; shipped: string; added: string; remove: string
  addLangs: string; online: string; offline: string; noneNew: string; loadPack: string; working: string; failed: string
  setup: string
}
const STR: Record<string, S> = {
  en: {
    about: 'About BT Servant Mini', title: 'BT Servant Mini',
    body: [
      'BT Servant Mini is BT Servant on your phone, without internet. It answers from the unfoldingWord translation helps kept on the phone: the literal and simplified texts, translation notes, comprehension questions, key terms and Translation Academy.',
      '**How it differs from BT Servant.** BT Servant works through WhatsApp, Telegram, Signal or the web, needs internet, and uses a large AI model that talks with you and writes its answers. BT Servant Mini works offline and uses a small model only to understand your question: what you read are the helps as they are, never text written by a model.',
      'So it understands fewer free questions. It works best with a reference (John 3:16), a word (grace), a phrase in quotes, or the names in a story (where is Jonah swallowed by the fish?).',
      'This is an alpha version for testing.',
    ],
    version: 'Version', full: 'complete (model and base languages included)', lite: 'light (model and languages added on the phone)',
    start: 'Start', close: 'Close', setup: 'To start, this light version needs the model (once):',
    model: 'Model', mReady: 'Ready', mMissing: 'Not on this phone yet: only references and searches work', mDown: 'Downloading', mImport: 'Loading',
    mStart: 'Starting', mError: 'Problem', download: 'Download', loadFile: 'Load from a file (SD card, phone memory)', share: 'Share (save to Downloads)',
    saved: 'Saved in Downloads', langs: 'Languages on this phone', shipped: 'included', added: 'added', remove: 'Remove',
    addLangs: 'Add languages', online: 'Look on the server (internet)', offline: 'No internet, or the server did not answer.',
    noneNew: 'The server has no other languages yet.', loadPack: 'Load a .tcpack file', working: 'Working…', failed: 'It did not work:',
  },
  es: {
    about: 'Acerca de BT Servant Mini', title: 'BT Servant Mini',
    body: [
      'BT Servant Mini es BT Servant en tu teléfono, sin internet. Responde con las ayudas de traducción de unfoldingWord guardadas en el teléfono: los textos literal y simplificado, las notas de traducción, las preguntas de comprensión, las palabras clave y la Academia de Traducción.',
      '**En qué se diferencia de BT Servant.** BT Servant funciona por WhatsApp, Telegram, Signal o la web, necesita internet y usa un modelo de IA grande que conversa contigo y redacta sus respuestas. BT Servant Mini funciona sin conexión y usa un modelo pequeño solo para entender tu pregunta: lo que lees son las ayudas tal cual, nunca un texto escrito por un modelo.',
      'Por eso entiende menos preguntas libres. Funciona mejor con una referencia (Juan 3:16), una palabra (gracia), una frase entre comillas o los nombres de una historia (¿dónde se traga el pez a Jonás?).',
      'Es una versión alfa para pruebas.',
    ],
    version: 'Versión', full: 'completa (con el modelo y los idiomas base)', lite: 'light (modelo e idiomas se agregan en el teléfono)',
    start: 'Empezar', close: 'Cerrar', setup: 'Para empezar, esta versión light necesita el modelo (una sola vez):',
    model: 'Modelo', mReady: 'Listo', mMissing: 'Aún no está en este teléfono: solo funcionan referencias y búsquedas', mDown: 'Descargando', mImport: 'Cargando',
    mStart: 'Iniciando', mError: 'Problema', download: 'Descargar', loadFile: 'Cargar desde un archivo (tarjeta SD, memoria)', share: 'Compartir (guardar en Descargas)',
    saved: 'Guardado en Descargas', langs: 'Idiomas en este teléfono', shipped: 'incluido', added: 'agregado', remove: 'Quitar',
    addLangs: 'Agregar idiomas', online: 'Buscar en el servidor (internet)', offline: 'Sin internet, o el servidor no respondió.',
    noneNew: 'El servidor todavía no tiene otros idiomas.', loadPack: 'Cargar un archivo .tcpack', working: 'Trabajando…', failed: 'No funcionó:',
  },
  fr: {
    about: 'À propos de BT Servant Mini', title: 'BT Servant Mini',
    body: [
      "BT Servant Mini, c'est BT Servant sur votre téléphone, sans internet. Il répond avec les aides à la traduction d'unfoldingWord enregistrées sur le téléphone : textes littéral et simplifié, notes de traduction, questions de compréhension, mots clés et Translation Academy.",
      "**La différence avec BT Servant.** BT Servant fonctionne par WhatsApp, Telegram, Signal ou le web, demande internet et utilise un grand modèle d'IA qui converse et rédige ses réponses. BT Servant Mini fonctionne hors ligne et n'utilise un petit modèle que pour comprendre votre question : vous lisez les aides telles quelles, jamais un texte écrit par un modèle.",
      'Il comprend donc moins de questions libres. Il marche mieux avec une référence (Jean 3:16), un mot (grâce), une phrase entre guillemets ou les noms d’un récit.',
      'Version alpha pour les tests.',
    ],
    version: 'Version', full: 'complète (modèle et langues de base inclus)', lite: 'légère (modèle et langues ajoutés sur le téléphone)',
    start: 'Commencer', close: 'Fermer', setup: 'Pour commencer, cette version légère a besoin du modèle (une seule fois) :',
    model: 'Modèle', mReady: 'Prêt', mMissing: 'Pas encore sur ce téléphone : seules les références et recherches fonctionnent', mDown: 'Téléchargement', mImport: 'Chargement',
    mStart: 'Démarrage', mError: 'Problème', download: 'Télécharger', loadFile: 'Charger un fichier (carte SD, mémoire)', share: 'Partager (enregistrer dans Téléchargements)',
    saved: 'Enregistré dans Téléchargements', langs: 'Langues sur ce téléphone', shipped: 'incluse', added: 'ajoutée', remove: 'Retirer',
    addLangs: 'Ajouter des langues', online: 'Chercher sur le serveur (internet)', offline: "Pas d'internet, ou le serveur n'a pas répondu.",
    noneNew: "Le serveur n'a pas encore d'autres langues.", loadPack: 'Charger un fichier .tcpack', working: 'En cours…', failed: 'Échec :',
  },
  id: {
    about: 'Tentang BT Servant Mini', title: 'BT Servant Mini',
    body: [
      'BT Servant Mini adalah BT Servant di ponsel Anda, tanpa internet. Ia menjawab dari bahan bantu penerjemahan unfoldingWord yang tersimpan di ponsel: teks harfiah dan sederhana, catatan terjemahan, pertanyaan pemahaman, istilah kunci, dan Translation Academy.',
      '**Bedanya dengan BT Servant.** BT Servant bekerja lewat WhatsApp, Telegram, Signal atau web, butuh internet, dan memakai model AI besar yang bercakap dan menulis jawabannya. BT Servant Mini bekerja offline dan memakai model kecil hanya untuk memahami pertanyaan Anda: yang Anda baca adalah bahan bantu apa adanya, bukan teks yang ditulis model.',
      'Karena itu ia memahami lebih sedikit pertanyaan bebas. Paling baik dengan rujukan (Yohanes 3:16), kata (kasih karunia), frasa dalam tanda kutip, atau nama-nama dalam cerita.',
      'Ini versi alfa untuk uji coba.',
    ],
    version: 'Versi', full: 'lengkap (model dan bahasa dasar sudah ada)', lite: 'ringan (model dan bahasa ditambahkan di ponsel)',
    start: 'Mulai', close: 'Tutup', setup: 'Untuk mulai, versi ringan ini perlu modelnya (sekali saja):',
    model: 'Model', mReady: 'Siap', mMissing: 'Belum ada di ponsel ini: hanya rujukan dan pencarian yang bekerja', mDown: 'Mengunduh', mImport: 'Memuat',
    mStart: 'Memulai', mError: 'Masalah', download: 'Unduh', loadFile: 'Muat dari berkas (kartu SD, memori ponsel)', share: 'Bagikan (simpan ke Unduhan)',
    saved: 'Tersimpan di Unduhan', langs: 'Bahasa di ponsel ini', shipped: 'bawaan', added: 'ditambahkan', remove: 'Hapus',
    addLangs: 'Tambah bahasa', online: 'Cari di server (internet)', offline: 'Tidak ada internet, atau server tidak menjawab.',
    noneNew: 'Server belum punya bahasa lain.', loadPack: 'Muat berkas .tcpack', working: 'Sedang bekerja…', failed: 'Gagal:',
  },
  hi: {
    about: 'BT Servant Mini के बारे में', title: 'BT Servant Mini',
    body: [
      'BT Servant Mini आपके फ़ोन पर, बिना इंटरनेट के, BT Servant है। यह फ़ोन में रखी unfoldingWord अनुवाद सहायता से उत्तर देता है: शाब्दिक और सरल पाठ, अनुवाद टिप्पणियाँ, समझ के प्रश्न, मुख्य शब्द और Translation Academy।',
      '**BT Servant से अंतर।** BT Servant WhatsApp, Telegram, Signal या वेब से चलता है, इंटरनेट चाहिए, और एक बड़ा AI मॉडल बात करता है और उत्तर लिखता है। BT Servant Mini बिना इंटरनेट चलता है और छोटा मॉडल केवल आपका प्रश्न समझने के लिए है: आप सहायता को जैसी है वैसी पढ़ते हैं, मॉडल का लिखा पाठ कभी नहीं।',
      'इसलिए यह कम खुले प्रश्न समझता है। संदर्भ (यूहन्ना 3:16), शब्द (अनुग्रह), उद्धरण में वाक्यांश, या कहानी के नामों के साथ सबसे अच्छा काम करता है।',
      'यह परीक्षण के लिए अल्फ़ा संस्करण है।',
    ],
    version: 'संस्करण', full: 'पूर्ण (मॉडल और मूल भाषाएँ शामिल)', lite: 'हल्का (मॉडल और भाषाएँ फ़ोन पर जोड़ी जाती हैं)',
    start: 'शुरू करें', close: 'बंद करें', setup: 'शुरू करने के लिए इस हल्के संस्करण को मॉडल चाहिए (एक बार):',
    model: 'मॉडल', mReady: 'तैयार', mMissing: 'अभी इस फ़ोन पर नहीं: केवल संदर्भ और खोज चलते हैं', mDown: 'डाउनलोड हो रहा है', mImport: 'लोड हो रहा है',
    mStart: 'शुरू हो रहा है', mError: 'समस्या', download: 'डाउनलोड करें', loadFile: 'फ़ाइल से लोड करें (SD कार्ड, फ़ोन मेमोरी)', share: 'साझा करें (डाउनलोड में सहेजें)',
    saved: 'डाउनलोड में सहेजा गया', langs: 'इस फ़ोन पर भाषाएँ', shipped: 'शामिल', added: 'जोड़ी गई', remove: 'हटाएँ',
    addLangs: 'भाषाएँ जोड़ें', online: 'सर्वर पर खोजें (इंटरनेट)', offline: 'इंटरनेट नहीं है, या सर्वर ने उत्तर नहीं दिया।',
    noneNew: 'सर्वर पर अभी और भाषाएँ नहीं हैं।', loadPack: '.tcpack फ़ाइल लोड करें', working: 'काम हो रहा है…', failed: 'नहीं हुआ:',
  },
  ar: {
    about: 'حول BT Servant Mini', title: 'BT Servant Mini',
    body: [
      'BT Servant Mini هو BT Servant على هاتفك، دون إنترنت. يجيب من مساعدات الترجمة من unfoldingWord المحفوظة على الهاتف: النص الحرفي والنص المبسّط وملاحظات الترجمة وأسئلة الفهم والكلمات الرئيسية وأكاديمية الترجمة.',
      '**الفرق عن BT Servant.** يعمل BT Servant عبر واتساب أو تيليجرام أو سيجنال أو الويب، ويحتاج إلى الإنترنت، ويستخدم نموذج ذكاء اصطناعي كبيرًا يحاورك ويكتب إجاباته. أما BT Servant Mini فيعمل دون اتصال ويستخدم نموذجًا صغيرًا لفهم سؤالك فقط: ما تقرؤه هو المساعدات كما هي، وليس نصًا كتبه نموذج.',
      'لذلك يفهم أسئلة حرّة أقل. يعمل أفضل مع مرجع (يوحنا ٣:١٦) أو كلمة (نعمة) أو عبارة بين علامتي اقتباس أو أسماء من قصة.',
      'هذه نسخة ألفا للتجربة.',
    ],
    version: 'الإصدار', full: 'كاملة (النموذج واللغات الأساسية مضمّنة)', lite: 'خفيفة (يُضاف النموذج واللغات على الهاتف)',
    start: 'ابدأ', close: 'إغلاق', setup: 'لتبدأ، تحتاج هذه النسخة الخفيفة إلى النموذج (مرة واحدة):',
    model: 'النموذج', mReady: 'جاهز', mMissing: 'ليس على هذا الهاتف بعد: تعمل المراجع والبحث فقط', mDown: 'جارٍ التنزيل', mImport: 'جارٍ التحميل',
    mStart: 'جارٍ التشغيل', mError: 'مشكلة', download: 'تنزيل', loadFile: 'تحميل من ملف (بطاقة SD، ذاكرة الهاتف)', share: 'مشاركة (حفظ في التنزيلات)',
    saved: 'حُفظ في التنزيلات', langs: 'اللغات على هذا الهاتف', shipped: 'مضمّنة', added: 'مضافة', remove: 'إزالة',
    addLangs: 'إضافة لغات', online: 'البحث في الخادم (إنترنت)', offline: 'لا يوجد إنترنت، أو لم يُجب الخادم.',
    noneNew: 'لا توجد لغات أخرى على الخادم بعد.', loadPack: 'تحميل ملف ‎.tcpack', working: 'جارٍ العمل…', failed: 'لم ينجح:',
  },
}
export const PACK_NAMES: Record<string, string> = {
  en: 'English', 'es-419': 'Español (Latinoamérica)', id: 'Bahasa Indonesia', hi: 'हिन्दी', ar: 'العربية', fr: 'Français', bn: 'বাংলা',
  gu: 'ગુજરાતી', kn: 'ಕನ್ನಡ', mr: 'मराठी', ne: 'नेपाली', or: 'ଓଡ଼ିଆ', te: 'తెలుగు', fa: 'فارسی', ru: 'Русский', 'pt-br': 'Português', sw: 'Kiswahili',
}
const str = (lang: string): S => STR[lang] ?? STR.en!

function el(tag: string, cls = '', text?: string): HTMLElement {
  const d = document.createElement(tag)
  if (cls) d.className = cls
  if (text !== undefined) d.textContent = text
  return d
}
function btn(text: string, on: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', cls, text) as HTMLButtonElement
  b.type = 'button'
  b.onclick = on
  return b
}
const mb = (n: number) => `${Math.max(1, Math.round(n / 1048576))} MB`

/** The model's state in words. */
export function modelLine(lang: string): string {
  const s = str(lang)
  const { state, detail } = modelState()
  switch (state) {
    case 'ready': return s.mReady
    case 'missing': return s.mMissing
    case 'downloading': return `${s.mDown} ${detail}%`
    case 'importing': case 'copying': return `${s.mImport}${detail ? ` ${detail}%` : ''}`
    case 'starting': return s.mStart
    default: return `${s.mError}: ${detail}`
  }
}

/** The model section: its state, and download / load / share. */
export function modelSection(lang: string, refresh: () => void): HTMLElement {
  const s = str(lang)
  const box = el('div', 'setup')
  box.appendChild(el('h2', '', s.model))
  box.appendChild(el('p', 'packs', `${MODEL.label} · ${modelLine(lang)}`))
  const { state } = modelState()
  const row = el('div', 'langs')
  if (state === 'missing' || state === 'error') {
    row.append(btn(`${s.download} (${mb(MODEL.bytes)})`, () => { downloadModel(); setTimeout(refresh, 500) }, 'on'), btn(s.loadFile, () => pickModelFile()))
  } else if (state === 'ready') {
    row.append(btn(s.share, () => { const err = exportModel(); alertish(box, err ? `${s.failed} ${err}` : s.saved) }))
  }
  box.appendChild(row)
  return box
}
function alertish(box: HTMLElement, text: string) {
  box.querySelector('.note')?.remove()
  box.appendChild(el('p', 'note', text))
}

/** The languages section: what is here, add from the server or a file, share or remove. */
export async function languagesSection(lang: string, after: () => void): Promise<HTMLElement> {
  const s = str(lang)
  const box = el('div', 'setup')
  box.appendChild(el('h2', '', s.langs))
  for (const l of await installedLangs()) {
    const row = el('div', 'row')
    const o = await origin(l)
    row.appendChild(el('span', 'grow', `${PACK_NAMES[l] ?? l} · ${o === 'added' ? s.added : s.shipped}`))
    row.appendChild(btn(s.share.split(' (')[0]!, async () => {
      alertish(box, s.working)
      try {
        const bytes = await exportPack(l)
        const err = await saveToDownloads(`bt-servant-mini-${l}.tcpack`, bytes)
        alertish(box, err ? `${s.failed} ${err}` : `${s.saved} (${mb(bytes.length)})`)
      } catch (e) {
        alertish(box, `${s.failed} ${e instanceof Error ? e.message : e}`)
      }
    }, 'small'))
    if (o === 'added') row.appendChild(btn(s.remove, async () => { await removeLang(l); after() }, 'small del'))
    box.appendChild(row)
  }
  box.appendChild(el('h2', '', s.addLangs))
  const add = el('div', 'langs')
  const list = el('div', '')
  add.appendChild(btn(s.online, async () => {
    list.textContent = s.working
    const avail = await availableLangs()
    list.textContent = ''
    if (!avail.length) {
      list.appendChild(el('p', 'note', navigator.onLine ? s.noneNew : s.offline))
      return
    }
    for (const l of avail) {
      const row = el('div', 'row')
      const label = el('span', 'grow', PACK_NAMES[l] ?? l)
      row.append(label, btn(s.download, async () => {
        try {
          label.textContent = `${PACK_NAMES[l] ?? l} · ${s.working}`
          const r = await downloadLang(l, (p) => (label.textContent = `${PACK_NAMES[l] ?? l} · ${p.done}/${p.total} · ${mb(p.bytes)}`))
          label.textContent = `${PACK_NAMES[l] ?? l} · ${r.books} · ${mb(r.bytes)} ✓`
          after()
        } catch (e) {
          label.textContent = `${PACK_NAMES[l] ?? l} · ${s.failed} ${e instanceof Error ? e.message : e}`
        }
      }, 'small'))
      list.appendChild(row)
    }
  }))
  const file = document.createElement('input')
  file.type = 'file'
  file.accept = '.tcpack,application/octet-stream'
  file.hidden = true
  file.onchange = async () => {
    const f = file.files?.[0]
    if (!f) return
    alertish(box, s.working)
    try {
      const r = await importPack(new Uint8Array(await f.arrayBuffer()))
      alertish(box, r.langs.length ? r.langs.map((l) => PACK_NAMES[l] ?? l).join(', ') + ' ✓' : `${s.failed} ${r.rejected}`)
      after()
    } catch (e) {
      alertish(box, `${s.failed} ${e instanceof Error ? e.message : e}`)
    }
  }
  add.append(btn(s.loadPack, () => file.click()), file)
  box.append(add, list)
  return box
}

/** About (and first launch): what BT Servant Mini is, how it differs from BT Servant, the version; the setup of the light build. */
export function showAbout(lang: string, refresh: () => void) {
  const s = str(lang)
  document.querySelector('#about')?.remove()
  const wrap = el('div', '')
  wrap.id = 'about'
  const card = el('div', 'card')
  card.dir = 'auto'
  card.appendChild(el('h2', '', s.title))
  for (const p of s.body) {
    const para = el('p', '')
    para.innerHTML = p.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    card.appendChild(para)
  }
  card.appendChild(el('p', 'meta', `${s.version} ${appVersion()} · ${isLite() ? s.lite : s.full}`))
  if (isLite() && modelState().state !== 'ready') {
    card.appendChild(el('p', 'meta', s.setup))
    card.appendChild(modelSection(lang, refresh))
  }
  card.appendChild(btn(localStorage.getItem('btsm.onboarded') ? s.close : s.start, () => {
    try {
      localStorage.setItem('btsm.onboarded', '1')
    } catch {}
    wrap.remove()
    refresh()
  }, 'primary'))
  wrap.appendChild(card)
  document.body.appendChild(wrap)
}
export const aboutLabel = (lang: string) => str(lang).about

// desktop testing only (no Android bridge): reach the pack functions from the console
if (!(window as any).Android) (window as any).__packs = { exportPack, importPack, removeLang, origin, installedLangs, availableLangs }
