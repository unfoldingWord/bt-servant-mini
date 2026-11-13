// Reporting an answer: a thumbs up or down under each answer, and with the thumbs down a short report (what went wrong, a
// comment, and, if the person leaves it checked, the conversation up to that answer). The report shows exactly what will be
// sent, waits on the phone until there is internet, and goes to BT Servant Mini's online service (POST /v1/feedback).
// Nothing identifies the person or the phone. A thumb alone stays on the phone (it only adds to the usage counts, if on).
import { isOnline, onlineKey, onlineUrl } from './online'
import { appSnapshot } from './usage'

const QUEUE = 'btsm.feedback.queue'
const MAX_FIELD = 4000 // characters per piece of the conversation
const MAX_MSGS = 12 // the last messages up to the reported answer

export const REASONS = ['understood', 'wrong', 'missing', 'language', 'error', 'slow', 'other'] as const
export type Reason = (typeof REASONS)[number]
/** One message of the conversation as it goes in a report. */
export type ReportMsg = { who: 'me' | 'bot'; text?: string; intro?: string; info?: string; ai?: string; details?: string }
export type Report = ReturnType<typeof appSnapshot> & {
  v: 1; at: string; reasons: Reason[]; comment: string; conversation: ReportMsg[]; reported: number
}

type F = {
  good: string; bad: string; title: string; reasons: Record<Reason, string>; comment: string; include: string; preview: string
  note: string; send: string; cancel: string; sent: string; queued: string; reported: string; failed: string
}
const T: Record<string, F> = {
  en: {
    good: 'Good answer', bad: 'Not what I expected', title: 'Report this answer',
    reasons: { understood: 'It did not understand my question', wrong: 'Wrong passage, word or article', missing: 'Something is missing', language: 'Wrong language', error: 'An error, or nothing came', slow: 'Too slow', other: 'Something else' },
    comment: 'What did you expect? (optional)', include: 'Include the conversation up to this answer', preview: 'What will be sent',
    note: 'The report goes to the BT Servant Mini team, on a server of unfoldingWord, with the app version and its languages; nothing that identifies you or this phone. It helps fix the app and may be used to train its model; questions are reviewed and cleaned of anything personal first. Do not send it if, where you are, it is risky to be known as a Bible translator, or if the conversation has something private.',
    send: 'Send', cancel: 'Cancel', sent: 'Report sent. Thank you.', queued: 'Saved: it will be sent when there is internet.', reported: 'Reported', failed: 'It could not be sent; it will be tried again.',
  },
  es: {
    good: 'Buena respuesta', bad: 'No es lo que esperaba', title: 'Reportar esta respuesta',
    reasons: { understood: 'No entendió mi pregunta', wrong: 'Pasaje, palabra o artículo equivocado', missing: 'Falta algo', language: 'Idioma equivocado', error: 'Un error, o no llegó nada', slow: 'Demasiado lento', other: 'Otra cosa' },
    comment: '¿Qué esperabas? (opcional)', include: 'Incluir la conversación hasta esta respuesta', preview: 'Lo que se enviará',
    note: 'El reporte va al equipo de BT Servant Mini, a un servidor de unfoldingWord, con la versión de la app y sus idiomas; nada que te identifique a ti o a este teléfono. Sirve para corregir la app y puede usarse para entrenar su modelo; antes se revisan las preguntas y se les quita cualquier dato personal. No lo envíes si en tu lugar es riesgoso que se sepa que traduces la Biblia, o si la conversación tiene algo privado.',
    send: 'Enviar', cancel: 'Cancelar', sent: 'Reporte enviado. Gracias.', queued: 'Guardado: se enviará cuando haya internet.', reported: 'Reportada', failed: 'No se pudo enviar; se intentará de nuevo.',
  },
  fr: {
    good: 'Bonne réponse', bad: 'Pas ce que j\'attendais', title: 'Signaler cette réponse',
    reasons: { understood: 'Il n\'a pas compris ma question', wrong: 'Mauvais passage, mot ou article', missing: 'Il manque quelque chose', language: 'Mauvaise langue', error: 'Une erreur, ou rien n\'est venu', slow: 'Trop lent', other: 'Autre chose' },
    comment: 'Qu\'attendiez-vous ? (facultatif)', include: 'Inclure la conversation jusqu\'à cette réponse', preview: 'Ce qui sera envoyé',
    note: 'Le signalement va à l\'équipe de BT Servant Mini, sur un serveur d\'unfoldingWord, avec la version de l\'application et ses langues ; rien qui vous identifie, vous ou ce téléphone. Il sert à corriger l\'application et peut servir à entraîner son modèle ; les questions sont d\'abord relues et débarrassées de tout élément personnel. Ne l\'envoyez pas si, là où vous êtes, il est risqué d\'être connu comme traducteur de la Bible, ou si la conversation contient quelque chose de privé.',
    send: 'Envoyer', cancel: 'Annuler', sent: 'Signalement envoyé. Merci.', queued: 'Enregistré : il sera envoyé quand il y aura internet.', reported: 'Signalée', failed: 'L\'envoi a échoué ; il sera réessayé.',
  },
  id: {
    good: 'Jawaban yang baik', bad: 'Bukan yang saya harapkan', title: 'Laporkan jawaban ini',
    reasons: { understood: 'Tidak memahami pertanyaan saya', wrong: 'Bagian, kata, atau artikel yang salah', missing: 'Ada yang kurang', language: 'Bahasa yang salah', error: 'Ada galat, atau tidak ada yang muncul', slow: 'Terlalu lambat', other: 'Hal lain' },
    comment: 'Apa yang Anda harapkan? (opsional)', include: 'Sertakan percakapan sampai jawaban ini', preview: 'Yang akan dikirim',
    note: 'Laporan dikirim ke tim BT Servant Mini, ke server unfoldingWord, bersama versi aplikasi dan bahasanya; tidak ada yang mengenali Anda atau ponsel ini. Laporan membantu memperbaiki aplikasi dan dapat dipakai untuk melatih modelnya; pertanyaan diperiksa dulu dan dibersihkan dari hal pribadi. Jangan kirim jika di tempat Anda berisiko diketahui sebagai penerjemah Alkitab, atau jika percakapan berisi hal pribadi.',
    send: 'Kirim', cancel: 'Batal', sent: 'Laporan terkirim. Terima kasih.', queued: 'Disimpan: akan dikirim saat ada internet.', reported: 'Dilaporkan', failed: 'Tidak dapat dikirim; akan dicoba lagi.',
  },
  hi: {
    good: 'अच्छा उत्तर', bad: 'जैसा मैंने सोचा था वैसा नहीं', title: 'इस उत्तर की रिपोर्ट करें',
    reasons: { understood: 'मेरा प्रश्न नहीं समझा', wrong: 'गलत अंश, शब्द या लेख', missing: 'कुछ छूट गया है', language: 'गलत भाषा', error: 'कोई त्रुटि, या कुछ नहीं आया', slow: 'बहुत धीमा', other: 'कुछ और' },
    comment: 'आप क्या चाहते थे? (वैकल्पिक)', include: 'इस उत्तर तक की बातचीत शामिल करें', preview: 'क्या भेजा जाएगा',
    note: 'रिपोर्ट BT Servant Mini की टीम को, unfoldingWord के एक सर्वर पर, ऐप के संस्करण और उसकी भाषाओं के साथ जाती है; ऐसा कुछ नहीं जिससे आपकी या इस फ़ोन की पहचान हो। इससे ऐप ठीक करने में मदद मिलती है और इसका उपयोग ऐप के मॉडल को प्रशिक्षित करने में हो सकता है; पहले प्रश्नों की जाँच करके उनसे कोई भी निजी जानकारी हटा दी जाती है। इसे न भेजें यदि आपकी जगह पर बाइबल अनुवादक के रूप में जाना जाना जोखिम भरा है, या बातचीत में कुछ निजी है।',
    send: 'भेजें', cancel: 'रद्द करें', sent: 'रिपोर्ट भेज दी गई। धन्यवाद।', queued: 'सहेजी गई: इंटरनेट होने पर भेजी जाएगी।', reported: 'रिपोर्ट की गई', failed: 'भेजी नहीं जा सकी; फिर कोशिश की जाएगी।',
  },
  ar: {
    good: 'إجابة جيدة', bad: 'ليست ما توقعته', title: 'الإبلاغ عن هذه الإجابة',
    reasons: { understood: 'لم يفهم سؤالي', wrong: 'مقطع أو كلمة أو مقالة خاطئة', missing: 'ينقص شيء', language: 'لغة خاطئة', error: 'خطأ، أو لم يصل شيء', slow: 'بطيء جدًا', other: 'شيء آخر' },
    comment: 'ماذا كنت تتوقع؟ (اختياري)', include: 'تضمين المحادثة حتى هذه الإجابة', preview: 'ما سيُرسل',
    note: 'يذهب البلاغ إلى فريق BT Servant Mini، إلى خادم تابع لـ unfoldingWord، مع إصدار التطبيق ولغاته؛ ولا شيء يدل عليك أو على هذا الهاتف. يساعد على إصلاح التطبيق وقد يُستخدم لتدريب نموذجه؛ وتُراجع الأسئلة أولًا ويُحذف منها أي شيء شخصي. لا ترسله إذا كان من الخطر في مكانك أن تُعرف كمترجم للكتاب المقدس، أو إذا كانت المحادثة تحتوي على شيء خاص.',
    send: 'إرسال', cancel: 'إلغاء', sent: 'أُرسل البلاغ. شكرًا.', queued: 'حُفظ: سيُرسل عند توفر الإنترنت.', reported: 'تم الإبلاغ', failed: 'تعذّر الإرسال؛ ستُعاد المحاولة.',
  },
}
export const FT = (lang: string): F => T[lang] ?? T.en!

const cut = (s: string | undefined | null) => (s ? (s.length > MAX_FIELD ? `${s.slice(0, MAX_FIELD)} …` : s) : undefined)

/** The report as it will be sent. `msgs` is the conversation up to and including the reported answer. */
export function buildReport(msgs: ReportMsg[], reasons: Reason[], comment: string, include: boolean): Report {
  const last = msgs.slice(-MAX_MSGS).map((m) => ({ who: m.who, text: cut(m.text), intro: cut(m.intro), info: cut(m.info), ai: cut(m.ai), details: cut(m.details) }))
  const conversation = include ? last : last.slice(-1) // without the conversation, only the answer itself
  for (const m of conversation) for (const k of Object.keys(m) as (keyof ReportMsg)[]) if (m[k] === undefined) delete m[k]
  return { ...appSnapshot(), v: 1, at: new Date().toISOString(), reasons, comment: comment.trim().slice(0, 2000), conversation, reported: conversation.length - 1 }
}

function queue(): Report[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE) ?? '[]') as Report[]
  } catch {
    return []
  }
}
function setQueue(q: Report[]) {
  try {
    if (q.length) localStorage.setItem(QUEUE, JSON.stringify(q.slice(-20)))
    else localStorage.removeItem(QUEUE)
  } catch {}
}

let sending = false
/** Sends the reports waiting on the phone; true when the queue is empty afterwards. */
export async function sendFeedback(): Promise<boolean> {
  if (sending) return false
  const q = queue()
  if (!q.length) return true
  if (!isOnline() || !onlineUrl()) return false
  sending = true
  try {
    while (q.length) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 20000)
      try {
        const r = await fetch(`${onlineUrl()}/v1/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-BTSM-Key': onlineKey() },
          body: JSON.stringify(q[0]),
          signal: ctrl.signal,
        })
        // a report the service refuses as malformed would never go: drop it rather than retry forever
        if (!r.ok && r.status !== 400) return false
      } finally {
        clearTimeout(timer)
      }
      q.shift()
      setQueue(q)
    }
    return true
  } catch {
    return false
  } finally {
    sending = false
  }
}
/** Keeps the report on the phone and tries to send it now: 'sent', or 'queued' (no internet yet, or it failed). */
export async function submitReport(r: Report): Promise<'sent' | 'queued'> {
  setQueue([...queue(), r])
  return (await sendFeedback()) ? 'sent' : 'queued'
}

const el = (tag: string, cls = '', text?: string) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
const THUMB = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3zm0 0 4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 21H7"/></svg>'

/**
 * The thumbs under an answer. `rating` is what is set now; `rate` records a change (null: taken back); `report` opens the
 * report for this answer (after a thumbs down).
 */
export function feedbackBar(lang: string, rating: 'up' | 'down' | undefined, reported: boolean, rate: (r: 'up' | 'down' | null) => void, report: () => void): HTMLElement {
  const s = FT(lang)
  const bar = el('div', 'rate')
  const up = el('button', rating === 'up' ? 'on' : '') as HTMLButtonElement
  const down = el('button', rating === 'down' ? 'on down' : 'down') as HTMLButtonElement
  up.type = down.type = 'button'
  up.innerHTML = THUMB
  down.innerHTML = THUMB
  up.title = up.ariaLabel = s.good
  down.title = down.ariaLabel = s.bad
  up.onclick = () => rate(rating === 'up' ? null : 'up')
  down.onclick = () => {
    if (rating !== 'down') rate('down')
    report()
  }
  bar.append(up, down)
  if (reported) bar.appendChild(el('span', 'done', `✓ ${s.reported}`))
  return bar
}

/** The report sheet: what went wrong, a comment, the conversation (checked), exactly what will be sent; then send or cancel. */
export function askReport(lang: string, msgs: ReportMsg[], done: (r: Report | null) => void) {
  const s = FT(lang)
  document.querySelector('#report')?.remove()
  const wrap = el('div', '')
  wrap.id = 'report'
  const card = el('div', 'card')
  card.dir = 'auto'
  card.appendChild(el('h2', '', s.title))
  const picked = new Set<Reason>()
  const chips = el('div', 'langs')
  for (const r of REASONS) {
    const b = el('button', '', s.reasons[r]) as HTMLButtonElement
    b.type = 'button'
    b.onclick = () => {
      if (picked.has(r)) picked.delete(r)
      else picked.add(r)
      b.classList.toggle('on', picked.has(r))
      show()
    }
    chips.appendChild(b)
  }
  const comment = el('textarea', 'comment') as HTMLTextAreaElement
  comment.rows = 3
  comment.placeholder = s.comment
  comment.oninput = () => show()
  const lab = el('label', 'toggle') as HTMLLabelElement
  const inc = el('input') as HTMLInputElement
  inc.type = 'checkbox'
  inc.checked = true
  inc.onchange = () => show()
  lab.append(inc, el('span', '', s.include))
  const det = el('details', 'preview') as HTMLDetailsElement
  det.appendChild(el('summary', '', s.preview))
  const pre = el('pre', 'usage')
  det.appendChild(pre)
  const current = () => buildReport(msgs, [...picked], comment.value, inc.checked)
  const show = () => { pre.textContent = JSON.stringify(current(), null, 1) }
  const send = el('button', 'primary', s.send) as HTMLButtonElement
  send.type = 'button'
  send.onclick = () => {
    const r = current()
    wrap.remove()
    done(r)
  }
  const cancel = el('button', 'secondary', s.cancel) as HTMLButtonElement
  cancel.type = 'button'
  cancel.onclick = () => {
    wrap.remove()
    done(null)
  }
  card.append(chips, comment, lab, det, el('p', 'meta', s.note), send, cancel)
  show()
  wrap.appendChild(card)
  document.body.appendChild(wrap)
}
export function closeReport(): boolean {
  const w = document.querySelector('#report')
  if (!w) return false
  w.remove()
  return true
}
