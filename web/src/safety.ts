// The two things that use the internet, asked before they are on: online AI and usage counts. Asked once at first launch
// (and once after the update that brought this question), and again whenever one of them is turned on from the menu, with
// what it means for someone in a place where Bible translation work is risky. Turning either off needs no question.

export type Choice = 'online' | 'usage'
const DONE = 'btsm.safety'

type S = {
  title: string; intro: string; confirm: string
  onlineH: string; onlineP: string; usageH: string; usageP: string
  yes: string; no: string; go: string; on: string; cancel: string; later: string
}
const T: Record<string, S> = {
  en: {
    title: 'Before you start: your safety',
    intro: 'BT Servant Mini works without internet. Two things can use the internet, only if you allow them. You can change both later in the menu.',
    confirm: 'Before turning it on',
    onlineH: 'Answers with online AI (when there is internet)',
    onlineP: 'Your question and the helps found are sent to a server of unfoldingWord, and a larger AI writes the answer. Whoever watches the network (the internet provider, the owner of the Wi‑Fi, a government) cannot read them, but can see that this phone talks to unfoldingWord. Do not turn this on if, where you are, it is risky for people to know that you work on Bible translation.',
    usageH: 'Share usage counts',
    usageP: 'Once a day, totals of how the app is used (how many questions, of what kind, how many found nothing), never what you asked. They go to the same server, so the same caution applies.',
    yes: 'Yes, turn on', no: 'No', go: 'Continue', on: 'Turn on', cancel: 'Cancel', later: 'You can change this later in the menu.',
  },
  es: {
    title: 'Antes de empezar: tu seguridad',
    intro: 'BT Servant Mini funciona sin internet. Dos cosas pueden usar internet, solo si tú lo permites. Puedes cambiar las dos después en el menú.',
    confirm: 'Antes de activarlo',
    onlineH: 'Respuestas con IA en línea (cuando hay internet)',
    onlineP: 'Tu pregunta y las ayudas encontradas se envían a un servidor de unfoldingWord, y una IA más grande escribe la respuesta. Quien vigile la red (el proveedor de internet, el dueño del wifi, un gobierno) no puede leerlas, pero sí puede ver que este teléfono se comunica con unfoldingWord. No lo actives si en tu lugar es riesgoso que se sepa que trabajas en traducción bíblica.',
    usageH: 'Compartir el conteo de uso',
    usageP: 'Una vez al día, totales de cómo se usa la app (cuántas preguntas, de qué tipo, cuántas no encontraron nada), nunca lo que preguntaste. Va al mismo servidor, así que vale la misma precaución.',
    yes: 'Sí, activar', no: 'No', go: 'Continuar', on: 'Activar', cancel: 'Cancelar', later: 'Puedes cambiarlo después en el menú.',
  },
  fr: {
    title: 'Avant de commencer : votre sécurité',
    intro: 'BT Servant Mini fonctionne sans internet. Deux choses peuvent utiliser internet, seulement si vous le permettez. Vous pourrez changer les deux plus tard dans le menu.',
    confirm: 'Avant de l\'activer',
    onlineH: 'Réponses avec l\'IA en ligne (quand il y a internet)',
    onlineP: 'Votre question et les aides trouvées sont envoyées à un serveur d\'unfoldingWord, et une IA plus grande rédige la réponse. Quiconque surveille le réseau (le fournisseur d\'accès, le propriétaire du wifi, un gouvernement) ne peut pas les lire, mais peut voir que ce téléphone communique avec unfoldingWord. Ne l\'activez pas si, là où vous êtes, il est risqué que l\'on sache que vous travaillez à la traduction de la Bible.',
    usageH: 'Partager les statistiques d\'usage',
    usageP: 'Une fois par jour, des totaux sur l\'usage de l\'application (combien de questions, de quel type, combien n\'ont rien trouvé), jamais ce que vous avez demandé. Elles vont au même serveur, la même prudence s\'applique donc.',
    yes: 'Oui, activer', no: 'Non', go: 'Continuer', on: 'Activer', cancel: 'Annuler', later: 'Vous pourrez le changer plus tard dans le menu.',
  },
  id: {
    title: 'Sebelum mulai: keamanan Anda',
    intro: 'BT Servant Mini bekerja tanpa internet. Ada dua hal yang dapat memakai internet, hanya jika Anda mengizinkannya. Keduanya bisa Anda ubah nanti di menu.',
    confirm: 'Sebelum mengaktifkannya',
    onlineH: 'Jawaban dengan AI daring (saat ada internet)',
    onlineP: 'Pertanyaan Anda dan bantuan yang ditemukan dikirim ke server unfoldingWord, lalu AI yang lebih besar menulis jawabannya. Siapa pun yang mengawasi jaringan (penyedia internet, pemilik wifi, pemerintah) tidak dapat membacanya, tetapi dapat melihat bahwa ponsel ini berhubungan dengan unfoldingWord. Jangan aktifkan jika di tempat Anda berisiko bila orang tahu Anda bekerja dalam penerjemahan Alkitab.',
    usageH: 'Bagikan hitungan penggunaan',
    usageP: 'Sekali sehari, jumlah total cara aplikasi dipakai (berapa pertanyaan, jenisnya, berapa yang tidak menemukan apa pun), tidak pernah isi pertanyaan Anda. Dikirim ke server yang sama, jadi kehati-hatian yang sama berlaku.',
    yes: 'Ya, aktifkan', no: 'Tidak', go: 'Lanjut', on: 'Aktifkan', cancel: 'Batal', later: 'Anda bisa mengubahnya nanti di menu.',
  },
  hi: {
    title: 'शुरू करने से पहले: आपकी सुरक्षा',
    intro: 'BT Servant Mini बिना इंटरनेट के चलता है। दो चीज़ें इंटरनेट का उपयोग कर सकती हैं, केवल तब जब आप अनुमति दें। आप दोनों को बाद में मेनू में बदल सकते हैं।',
    confirm: 'चालू करने से पहले',
    onlineH: 'ऑनलाइन AI से उत्तर (जब इंटरनेट हो)',
    onlineP: 'आपका प्रश्न और मिली हुई सहायताएँ unfoldingWord के एक सर्वर पर भेजी जाती हैं, और एक बड़ा AI उत्तर लिखता है। नेटवर्क पर नज़र रखने वाला कोई भी (इंटरनेट प्रदाता, वाई‑फ़ाई का मालिक, कोई सरकार) उन्हें पढ़ नहीं सकता, पर यह देख सकता है कि यह फ़ोन unfoldingWord से बात करता है। इसे चालू न करें यदि आपकी जगह पर लोगों का यह जानना जोखिम भरा है कि आप बाइबल अनुवाद का काम करते हैं।',
    usageH: 'उपयोग की गिनती साझा करें',
    usageP: 'दिन में एक बार, ऐप के उपयोग की कुल संख्याएँ (कितने प्रश्न, किस प्रकार के, कितनों में कुछ नहीं मिला), आपने क्या पूछा यह कभी नहीं। यह उसी सर्वर पर जाती है, इसलिए वही सावधानी लागू होती है।',
    yes: 'हाँ, चालू करें', no: 'नहीं', go: 'आगे', on: 'चालू करें', cancel: 'रद्द करें', later: 'आप इसे बाद में मेनू में बदल सकते हैं।',
  },
  ar: {
    title: 'قبل أن تبدأ: سلامتك',
    intro: 'يعمل BT Servant Mini من دون إنترنت. هناك أمران يمكن أن يستخدما الإنترنت، فقط إذا سمحت بذلك. يمكنك تغيير الاثنين لاحقًا من القائمة.',
    confirm: 'قبل التفعيل',
    onlineH: 'إجابات بالذكاء الاصطناعي عبر الإنترنت (عند توفر الإنترنت)',
    onlineP: 'يُرسل سؤالك والمساعدات التي وُجدت إلى خادم تابع لـ unfoldingWord، ويكتب ذكاء اصطناعي أكبر الإجابة. من يراقب الشبكة (مزوّد الإنترنت، صاحب شبكة الواي فاي، حكومة) لا يستطيع قراءتها، لكنه يستطيع أن يرى أن هذا الهاتف يتصل بـ unfoldingWord. لا تفعّله إذا كان من الخطر في مكانك أن يُعرف أنك تعمل في ترجمة الكتاب المقدس.',
    usageH: 'مشاركة إحصاءات الاستخدام',
    usageP: 'مرة في اليوم، مجاميع عن استخدام التطبيق (كم سؤالًا، ومن أي نوع، وكم منها لم يجد شيئًا)، ولا يُرسل أبدًا ما سألته. تذهب إلى الخادم نفسه، فالحذر نفسه ينطبق.',
    yes: 'نعم، فعّل', no: 'لا', go: 'متابعة', on: 'تفعيل', cancel: 'إلغاء', later: 'يمكنك تغيير ذلك لاحقًا من القائمة.',
  },
}
const str = (lang: string) => T[lang] ?? T.en!

const el = (tag: string, cls = '', text?: string) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
const button = (text: string, cls: string, on: () => void) => {
  const b = el('button', cls, text) as HTMLButtonElement
  b.type = 'button'
  b.onclick = on
  return b
}

/** Whether the first-launch question was answered (on this install). */
export function safetyAsked(): boolean {
  try {
    return localStorage.getItem(DONE) === '1'
  } catch {
    return true
  }
}

/**
 * Shows the question for `which` and calls `done` with the answers (true = turn on), or null when cancelled.
 * Several (first launch): a Yes / No for each, and Continue once each has an answer; `current` marks what is set now.
 * One (from the menu): what it means, then Turn on / Cancel.
 */
export function askSafety(lang: string, which: Choice[], done: (a: Partial<Record<Choice, boolean>> | null) => void,
  current: Partial<Record<Choice, boolean | null>> = {}) {
  const s = str(lang)
  document.querySelector('#safety')?.remove()
  const wrap = el('div', '')
  wrap.id = 'safety'
  const card = el('div', 'card')
  card.dir = 'auto'
  const first = which.length > 1
  card.appendChild(el('h2', '', first ? s.title : s.confirm))
  if (first) card.appendChild(el('p', '', s.intro))
  const answers: Partial<Record<Choice, boolean>> = {}
  const go = button(first ? s.go : s.on, 'primary', () => {
    if (first) {
      try {
        localStorage.setItem(DONE, '1')
      } catch {}
    }
    wrap.remove()
    done(first ? answers : { [which[0]!]: true })
  })
  const ready = () => { go.disabled = which.some((w) => answers[w] === undefined) }
  for (const w of which) {
    const sec = el('section', 'choice')
    sec.append(el('h3', '', w === 'online' ? s.onlineH : s.usageH), el('p', '', w === 'online' ? s.onlineP : s.usageP))
    if (first) {
      const row = el('div', 'langs')
      const yes = button(s.yes, '', () => pick(true))
      const no = button(s.no, '', () => pick(false))
      const pick = (v: boolean) => {
        answers[w] = v
        yes.classList.toggle('on', v)
        no.classList.toggle('on', !v)
        ready()
      }
      if (typeof current[w] === 'boolean') pick(current[w] as boolean)
      row.append(yes, no)
      sec.appendChild(row)
    } else answers[w] = true
    card.appendChild(sec)
  }
  card.appendChild(el('p', 'meta', s.later))
  card.appendChild(go)
  if (!first) card.appendChild(button(s.cancel, 'secondary', () => { wrap.remove(); done(null) }))
  ready()
  wrap.appendChild(card)
  document.body.appendChild(wrap)
  go.scrollIntoView?.({ block: 'nearest' })
  card.scrollTop = 0
}
/** Closes the question if it is open (Android's back button): false when it was not. */
export function closeSafety(): boolean {
  const w = document.querySelector('#safety')
  if (!w) return false
  w.remove()
  return true
}
