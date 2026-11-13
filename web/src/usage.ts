// Usage counts, only if the person turns them on (menu > Usage counts). The phone adds up a few numbers per day (how many
// questions, of what kind, in which language, how many found nothing) and, once a day has ended and there is internet,
// sends those totals to BT Servant Mini's online service, with the app version, the languages on the phone and its memory
// class. Never the text of a question, never an id of the phone or the person. Turning it off deletes what is waiting.
import { onlineKey, onlineUrl } from './online'

const ON = 'btsm.usage'
const DAYS = 'btsm.usage.days'
const SENT = 'btsm.usage.sent'
const KEEP = 45 // days kept while there is no internet; older ones are dropped
type Counts = Record<string, number>
type Days = Record<string, Counts>
export type Snapshot = { app: string; flavor: string; ui: string; packs: string[]; model: string; online: boolean; mem: number | null }

const pad = (n: number) => String(n).padStart(2, '0')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function usageOn(): boolean {
  try {
    return localStorage.getItem(ON) === '1'
  } catch {
    return false
  }
}
export function setUsageOn(on: boolean) {
  try {
    localStorage.setItem(ON, on ? '1' : '0')
    if (!on) localStorage.removeItem(DAYS)
  } catch {}
}
function read(): Days {
  try {
    return JSON.parse(localStorage.getItem(DAYS) ?? '{}') as Days
  } catch {
    return {}
  }
}
function write(d: Days) {
  try {
    localStorage.setItem(DAYS, JSON.stringify(d))
  } catch {}
}

/** Adds to today's total of `key` (a name like "asked", "kind.search", "lang.es"); nothing when the counts are off. */
export function count(key: string, n = 1) {
  if (!usageOn() || !n) return
  const d = read()
  const t = (d[today()] ??= {})
  t[key] = (t[key] ?? 0) + n
  for (const old of Object.keys(d).sort().slice(0, -KEEP)) delete d[old]
  write(d)
}

let snapshot: () => Snapshot = () => ({ app: 'desktop', flavor: 'desktop', ui: 'en', packs: [], model: 'none', online: false, mem: null })
/** How to describe the app when a report goes out (version, languages, model, memory). */
export function setSnapshot(f: () => Snapshot) {
  snapshot = f
}

/** The app's description as reports send it (version, languages, model, memory). */
export const appSnapshot = (): Snapshot => snapshot()

/** Exactly what the next report would send: the days that have ended, and the description of the app. */
export function pendingReport(): { days: { d: string; c: Counts }[] } & Snapshot {
  const d = read()
  const days = Object.keys(d).sort().filter((k) => k < today()).map((k) => ({ d: k, c: d[k]! }))
  return { ...snapshot(), days }
}
/** Today's totals so far (sent after today ends). */
export const todayCounts = (): Counts => read()[today()] ?? {}
export function lastSent(): string | null {
  try {
    return localStorage.getItem(SENT)
  } catch {
    return null
  }
}

let sending = false
/** Sends the days that have ended, when the counts are on and there is internet; they are deleted once the service has them. */
export async function sendUsage(): Promise<boolean> {
  if (sending || !usageOn() || !navigator.onLine || !onlineUrl()) return false
  const report = pendingReport()
  if (!report.days.length) return false
  sending = true
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const r = await fetch(`${onlineUrl()}/v1/usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-BTSM-Key': onlineKey() },
      body: JSON.stringify(report),
      signal: ctrl.signal,
    })
    if (!r.ok) return false
    const d = read()
    for (const x of report.days) delete d[x.d]
    write(d)
    try {
      localStorage.setItem(SENT, today())
    } catch {}
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    sending = false
  }
}

export const USAGE_T: Record<string, { title: string; toggle: string; note: string; next: string; empty: string; today: string; sent: string }> = {
  en: {
    title: 'Usage counts',
    toggle: 'Share usage counts (when there is internet)',
    note: 'They help the team see how the app is used and where it fails. Once a day, when there is internet, the app sends totals: how many questions, of what kind, in which language, how many found nothing; with the app version, its languages and the phone\'s memory. Never what you asked, and nothing that identifies you or this phone. Turning it off deletes what has not been sent.',
    next: 'What the next report sends', empty: 'Nothing to send yet: a day\'s totals go out after that day ends.', today: 'Today so far', sent: 'Last sent: {d}',
  },
  es: {
    title: 'Conteo de uso',
    toggle: 'Compartir el conteo de uso (cuando hay internet)',
    note: 'Ayuda al equipo a ver cómo se usa la app y dónde falla. Una vez al día, cuando hay internet, la app envía totales: cuántas preguntas, de qué tipo, en qué idioma, cuántas no encontraron nada; con la versión de la app, sus idiomas y la memoria del teléfono. Nunca lo que preguntaste, ni nada que te identifique a ti o a este teléfono. Al apagarlo se borra lo que no se ha enviado.',
    next: 'Lo que envía el próximo informe', empty: 'Nada que enviar todavía: los totales de un día salen cuando ese día termina.', today: 'Hoy hasta ahora', sent: 'Último envío: {d}',
  },
  fr: {
    title: 'Statistiques d\'usage',
    toggle: 'Partager les statistiques d\'usage (quand il y a internet)',
    note: 'Elles aident l\'équipe à voir comment l\'application est utilisée et où elle échoue. Une fois par jour, quand il y a internet, l\'application envoie des totaux : combien de questions, de quel type, dans quelle langue, combien n\'ont rien trouvé ; avec la version de l\'application, ses langues et la mémoire du téléphone. Jamais ce que vous avez demandé, ni rien qui vous identifie, vous ou ce téléphone. Les désactiver efface ce qui n\'a pas été envoyé.',
    next: 'Ce que le prochain rapport envoie', empty: 'Rien à envoyer pour l\'instant : les totaux d\'un jour partent une fois ce jour terminé.', today: 'Aujourd\'hui jusqu\'ici', sent: 'Dernier envoi : {d}',
  },
  id: {
    title: 'Hitungan penggunaan',
    toggle: 'Bagikan hitungan penggunaan (saat ada internet)',
    note: 'Ini membantu tim melihat bagaimana aplikasi dipakai dan di mana gagal. Sekali sehari, saat ada internet, aplikasi mengirim jumlah total: berapa pertanyaan, jenisnya, bahasanya, berapa yang tidak menemukan apa pun; beserta versi aplikasi, bahasanya, dan memori ponsel. Tidak pernah isi pertanyaan Anda, dan tidak ada yang mengenali Anda atau ponsel ini. Mematikannya menghapus yang belum terkirim.',
    next: 'Yang dikirim laporan berikutnya', empty: 'Belum ada yang dikirim: total satu hari dikirim setelah hari itu berakhir.', today: 'Hari ini sejauh ini', sent: 'Terakhir dikirim: {d}',
  },
  hi: {
    title: 'उपयोग की गिनती',
    toggle: 'उपयोग की गिनती साझा करें (जब इंटरनेट हो)',
    note: 'इससे टीम देख पाती है कि ऐप कैसे इस्तेमाल होता है और कहाँ विफल होता है। दिन में एक बार, इंटरनेट होने पर, ऐप कुल संख्याएँ भेजता है: कितने प्रश्न, किस प्रकार के, किस भाषा में, कितनों में कुछ नहीं मिला; साथ में ऐप का संस्करण, उसकी भाषाएँ और फ़ोन की मेमोरी। आपने क्या पूछा, यह कभी नहीं, और ऐसा कुछ नहीं जिससे आपकी या इस फ़ोन की पहचान हो। इसे बंद करने पर जो नहीं भेजा गया वह मिट जाता है।',
    next: 'अगली रिपोर्ट में क्या जाएगा', empty: 'अभी भेजने को कुछ नहीं: किसी दिन की गिनती उस दिन के ख़त्म होने के बाद जाती है।', today: 'आज अब तक', sent: 'पिछली बार भेजा: {d}',
  },
  ar: {
    title: 'إحصاءات الاستخدام',
    toggle: 'مشاركة إحصاءات الاستخدام (عند توفر الإنترنت)',
    note: 'تساعد الفريق على معرفة كيف يُستخدم التطبيق وأين يخفق. مرة في اليوم، عند توفر الإنترنت، يرسل التطبيق مجاميع: كم سؤالًا، ومن أي نوع، وبأي لغة، وكم منها لم يجد شيئًا؛ مع إصدار التطبيق ولغاته وذاكرة الهاتف. لا يُرسل أبدًا ما سألته، ولا أي شيء يدل عليك أو على هذا الهاتف. إيقافها يحذف ما لم يُرسل بعد.',
    next: 'ما يرسله التقرير التالي', empty: 'لا شيء للإرسال بعد: تُرسل مجاميع اليوم بعد انتهائه.', today: 'اليوم حتى الآن', sent: 'آخر إرسال: {d}',
  },
}
