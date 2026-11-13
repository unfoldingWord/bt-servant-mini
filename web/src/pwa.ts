// The installable web app: a note on how to install it (iPhone: Share > Add to Home Screen; elsewhere, the browser's own
// install button when it offers one), shown in the browser only, until it is installed or dismissed.
const DISMISSED = 'btsm.pwa.hint'

const T: Record<string, { ios: string; other: string; install: string; close: string }> = {
  en: { ios: 'To use it like an app, also without internet: tap Share, then "Add to Home Screen".', other: 'Install it to use it like an app, also without internet.', install: 'Install', close: 'Close' },
  es: { ios: 'Para usarla como una app, también sin internet: toca Compartir y luego «Agregar a pantalla de inicio».', other: 'Instálala para usarla como una app, también sin internet.', install: 'Instalar', close: 'Cerrar' },
  fr: { ios: 'Pour l\'utiliser comme une application, même sans internet : touchez Partager, puis « Sur l\'écran d\'accueil ».', other: 'Installez-la pour l\'utiliser comme une application, même sans internet.', install: 'Installer', close: 'Fermer' },
  id: { ios: 'Agar dapat dipakai seperti aplikasi, juga tanpa internet: ketuk Bagikan, lalu "Tambah ke Layar Utama".', other: 'Pasang agar dapat dipakai seperti aplikasi, juga tanpa internet.', install: 'Pasang', close: 'Tutup' },
  hi: { ios: 'इसे ऐप की तरह, बिना इंटरनेट के भी, इस्तेमाल करने के लिए: शेयर पर टैप करें, फिर "होम स्क्रीन में जोड़ें"।', other: 'इसे ऐप की तरह, बिना इंटरनेट के भी, इस्तेमाल करने के लिए इंस्टॉल करें।', install: 'इंस्टॉल करें', close: 'बंद करें' },
  ar: { ios: 'لاستخدامه كتطبيق، حتى من دون إنترنت: المس «مشاركة» ثم «إضافة إلى الشاشة الرئيسية».', other: 'ثبّته لاستخدامه كتطبيق، حتى من دون إنترنت.', install: 'تثبيت', close: 'إغلاق' },
}

let deferred: any = null
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e
  document.querySelector('#pwahint')?.remove()
  hint(document.documentElement.lang || 'en')
})

const installed = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Shows the note under the bar, unless the app is installed or the note was closed. */
export function hint(lang: string) {
  try {
    if (installed() || localStorage.getItem(DISMISSED) === '1' || document.querySelector('#pwahint')) return
  } catch {}
  if (!ios() && !deferred) return // nothing the person can do here yet
  const s = T[lang] ?? T.en!
  const box = document.createElement('div')
  box.id = 'pwahint'
  const text = document.createElement('span')
  text.textContent = ios() ? s.ios : s.other
  box.appendChild(text)
  if (deferred) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'go'
    b.textContent = s.install
    b.onclick = async () => {
      deferred.prompt()
      await deferred.userChoice.catch(() => {})
      deferred = null
      box.remove()
    }
    box.appendChild(b)
  }
  const x = document.createElement('button')
  x.type = 'button'
  x.className = 'x'
  x.textContent = '×'
  x.setAttribute('aria-label', s.close)
  x.onclick = () => {
    try {
      localStorage.setItem(DISMISSED, '1')
    } catch {}
    box.remove()
  }
  box.appendChild(x)
  document.querySelector('#notice')?.after(box)
}
