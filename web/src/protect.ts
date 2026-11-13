// Protection for someone whose phone may be looked at (menu > Safety): a discreet mode (a neutral name and icon on the
// home screen, the screen hidden in recent apps, no screenshots), a PIN to open the app, and conversations that are not
// kept. None of this encrypts anything: it protects from a quick look, not from someone with time and the unlocked phone.

const DISCREET = 'btsm.discreet'
const PIN = 'btsm.pin'
const HISTORY = 'btsm.history' // 'keep' (default) | 'none'
const AWAY_MS = 60_000 // the PIN is asked again after a minute away from the app

type P = {
  name: string; title: string
  discreetH: string; discreetToggle: string; discreetNote: string; discreetP: string
  pinH: string; pinNote: string; setPin: string; newPin: string; repeat: string; save: string; mismatch: string; short: string
  removePin: string; current: string; wrong: string; wait: string; open: string; enter: string; forgot: string; pinOn: string
  histH: string; keep: string; dontKeep: string; histNote: string; erase: string; confirmErase: string
}
const T: Record<string, P> = {
  en: {
    name: 'Study notes', title: 'Safety',
    discreetH: 'Discreet mode', discreetToggle: 'Neutral name and icon («{name}»)',
    discreetNote: 'On the home screen the app shows as «{name}» with a plain notebook icon; in recent apps its screen is hidden, and screenshots are blocked. If the icon disappears from the home screen, add it again from the app list. It can still be found in Settings > Apps.',
    discreetP: 'The app shows as «{name}» with a plain icon, its screen is hidden in recent apps, and screenshots are blocked. Choose it if someone may look at your phone. In the menu you can also add a PIN.',
    pinH: 'PIN to open', pinNote: 'The app asks for it when it opens and after a minute away. It hides the app; it does not encrypt it.',
    setPin: 'Set a PIN', newPin: 'New PIN (4 to 8 digits)', repeat: 'Repeat the PIN', save: 'Save', mismatch: 'The two PINs are not the same.', short: 'Use 4 to 8 digits.',
    removePin: 'Remove the PIN', current: 'Current PIN', wrong: 'Wrong PIN.', wait: 'Too many tries. Wait {s} seconds.', open: 'Open', enter: 'Enter your PIN',
    forgot: 'Forgot it? Clear the app\'s data in Android settings (conversations and added languages are lost).', pinOn: 'PIN',
    histH: 'Conversations', keep: 'Keep them', dontKeep: 'Don\'t keep them',
    histNote: 'Not kept: nothing is written on the phone, and the conversations are gone when the app closes.',
    erase: 'Erase all conversations now', confirmErase: 'Tap again to erase everything',
  },
  es: {
    name: 'Notas de estudio', title: 'Seguridad',
    discreetH: 'Modo discreto', discreetToggle: 'Nombre e ícono neutros («{name}»)',
    discreetNote: 'En la pantalla de inicio la app aparece como «{name}» con un ícono de libreta; en las apps recientes su pantalla se oculta y no se pueden tomar capturas. Si el ícono desaparece de la pantalla de inicio, vuelve a ponerlo desde la lista de apps. En Ajustes > Aplicaciones todavía se puede encontrar.',
    discreetP: 'La app aparece como «{name}» con un ícono sencillo, su pantalla se oculta en las apps recientes y no se pueden tomar capturas. Elígelo si alguien podría revisar tu teléfono. En el menú también puedes poner un PIN.',
    pinH: 'PIN para abrir', pinNote: 'La app lo pide al abrirse y después de un minuto fuera. Oculta la app; no la cifra.',
    setPin: 'Poner un PIN', newPin: 'PIN nuevo (4 a 8 dígitos)', repeat: 'Repite el PIN', save: 'Guardar', mismatch: 'Los dos PIN no son iguales.', short: 'Usa de 4 a 8 dígitos.',
    removePin: 'Quitar el PIN', current: 'PIN actual', wrong: 'PIN incorrecto.', wait: 'Demasiados intentos. Espera {s} segundos.', open: 'Abrir', enter: 'Escribe tu PIN',
    forgot: '¿Lo olvidaste? Borra los datos de la app en los ajustes de Android (se pierden las conversaciones y los idiomas agregados).', pinOn: 'PIN',
    histH: 'Conversaciones', keep: 'Guardarlas', dontKeep: 'No guardarlas',
    histNote: 'Sin guardar: no se escribe nada en el teléfono y las conversaciones desaparecen al cerrar la app.',
    erase: 'Borrar todas las conversaciones ahora', confirmErase: 'Toca otra vez para borrar todo',
  },
  fr: {
    name: 'Notes d’étude', title: 'Sécurité',
    discreetH: 'Mode discret', discreetToggle: 'Nom et icône neutres (« {name} »)',
    discreetNote: 'Sur l\'écran d\'accueil, l\'application apparaît comme « {name} » avec une icône de carnet ; dans les applications récentes son écran est masqué, et les captures sont bloquées. Si l\'icône disparaît de l\'écran d\'accueil, remettez-la depuis la liste des applications. On peut encore la trouver dans Paramètres > Applications.',
    discreetP: 'L\'application apparaît comme « {name} » avec une icône simple, son écran est masqué dans les applications récentes et les captures sont bloquées. Choisissez-le si quelqu\'un peut regarder votre téléphone. Dans le menu vous pouvez aussi ajouter un code PIN.',
    pinH: 'Code PIN pour ouvrir', pinNote: 'L\'application le demande à l\'ouverture et après une minute d\'absence. Il cache l\'application ; il ne la chiffre pas.',
    setPin: 'Choisir un code PIN', newPin: 'Nouveau code (4 à 8 chiffres)', repeat: 'Répétez le code', save: 'Enregistrer', mismatch: 'Les deux codes ne sont pas identiques.', short: 'Utilisez 4 à 8 chiffres.',
    removePin: 'Retirer le code PIN', current: 'Code actuel', wrong: 'Code incorrect.', wait: 'Trop d\'essais. Attendez {s} secondes.', open: 'Ouvrir', enter: 'Entrez votre code PIN',
    forgot: 'Oublié ? Effacez les données de l\'application dans les paramètres d\'Android (les conversations et les langues ajoutées sont perdues).', pinOn: 'PIN',
    histH: 'Conversations', keep: 'Les garder', dontKeep: 'Ne pas les garder',
    histNote: 'Non gardées : rien n\'est écrit sur le téléphone, et les conversations disparaissent à la fermeture de l\'application.',
    erase: 'Effacer toutes les conversations maintenant', confirmErase: 'Touchez encore pour tout effacer',
  },
  id: {
    name: 'Catatan belajar', title: 'Keamanan',
    discreetH: 'Mode tersamar', discreetToggle: 'Nama dan ikon netral («{name}»)',
    discreetNote: 'Di layar utama aplikasi tampil sebagai «{name}» dengan ikon buku catatan; di daftar aplikasi terbaru layarnya disembunyikan, dan tangkapan layar diblokir. Jika ikon hilang dari layar utama, tambahkan lagi dari daftar aplikasi. Di Setelan > Aplikasi aplikasi ini masih dapat ditemukan.',
    discreetP: 'Aplikasi tampil sebagai «{name}» dengan ikon sederhana, layarnya disembunyikan di daftar aplikasi terbaru, dan tangkapan layar diblokir. Pilih ini jika seseorang mungkin memeriksa ponsel Anda. Di menu Anda juga dapat memasang PIN.',
    pinH: 'PIN untuk membuka', pinNote: 'Aplikasi memintanya saat dibuka dan setelah satu menit ditinggalkan. PIN menyembunyikan aplikasi; tidak mengenkripsinya.',
    setPin: 'Pasang PIN', newPin: 'PIN baru (4 sampai 8 angka)', repeat: 'Ulangi PIN', save: 'Simpan', mismatch: 'Kedua PIN tidak sama.', short: 'Gunakan 4 sampai 8 angka.',
    removePin: 'Hapus PIN', current: 'PIN saat ini', wrong: 'PIN salah.', wait: 'Terlalu banyak percobaan. Tunggu {s} detik.', open: 'Buka', enter: 'Masukkan PIN Anda',
    forgot: 'Lupa? Hapus data aplikasi di setelan Android (percakapan dan bahasa yang ditambahkan akan hilang).', pinOn: 'PIN',
    histH: 'Percakapan', keep: 'Simpan', dontKeep: 'Jangan simpan',
    histNote: 'Tidak disimpan: tidak ada yang ditulis di ponsel, dan percakapan hilang saat aplikasi ditutup.',
    erase: 'Hapus semua percakapan sekarang', confirmErase: 'Ketuk lagi untuk menghapus semua',
  },
  hi: {
    name: 'अध्ययन नोट्स', title: 'सुरक्षा',
    discreetH: 'गुप्त मोड', discreetToggle: 'सामान्य नाम और आइकन («{name}»)',
    discreetNote: 'होम स्क्रीन पर ऐप «{name}» नाम और नोटबुक आइकन के साथ दिखता है; हाल के ऐप्स में उसकी स्क्रीन छिपी रहती है, और स्क्रीनशॉट नहीं लिए जा सकते। अगर आइकन होम स्क्रीन से हट जाए, तो ऐप सूची से उसे फिर जोड़ें। सेटिंग्स > ऐप्स में यह अब भी मिल सकता है।',
    discreetP: 'ऐप «{name}» नाम और सादे आइकन के साथ दिखता है, हाल के ऐप्स में उसकी स्क्रीन छिपी रहती है, और स्क्रीनशॉट नहीं लिए जा सकते। इसे चुनें यदि कोई आपका फ़ोन देख सकता है। मेनू में आप PIN भी लगा सकते हैं।',
    pinH: 'खोलने के लिए PIN', pinNote: 'ऐप खुलते समय और एक मिनट बाहर रहने के बाद इसे माँगता है। यह ऐप को छिपाता है; उसे एन्क्रिप्ट नहीं करता।',
    setPin: 'PIN लगाएँ', newPin: 'नया PIN (4 से 8 अंक)', repeat: 'PIN दोबारा लिखें', save: 'सहेजें', mismatch: 'दोनों PIN एक जैसे नहीं हैं।', short: '4 से 8 अंक इस्तेमाल करें।',
    removePin: 'PIN हटाएँ', current: 'मौजूदा PIN', wrong: 'गलत PIN।', wait: 'बहुत अधिक प्रयास। {s} सेकंड रुकें।', open: 'खोलें', enter: 'अपना PIN लिखें',
    forgot: 'भूल गए? Android सेटिंग्स में ऐप का डेटा मिटाएँ (बातचीत और जोड़ी गई भाषाएँ मिट जाएँगी)।', pinOn: 'PIN',
    histH: 'बातचीत', keep: 'रखें', dontKeep: 'न रखें',
    histNote: 'न रखने पर: फ़ोन पर कुछ नहीं लिखा जाता, और ऐप बंद होने पर बातचीत मिट जाती है।',
    erase: 'सारी बातचीत अभी मिटाएँ', confirmErase: 'सब मिटाने के लिए फिर टैप करें',
  },
  ar: {
    name: 'ملاحظات دراسية', title: 'الأمان',
    discreetH: 'الوضع المتحفّظ', discreetToggle: 'اسم وأيقونة محايدان («{name}»)',
    discreetNote: 'يظهر التطبيق على الشاشة الرئيسية باسم «{name}» مع أيقونة دفتر؛ وتُخفى شاشته في التطبيقات الأخيرة، ويُمنع التقاط الشاشة. إذا اختفت الأيقونة من الشاشة الرئيسية فأضفها من قائمة التطبيقات. ما زال يمكن العثور عليه في الإعدادات > التطبيقات.',
    discreetP: 'يظهر التطبيق باسم «{name}» مع أيقونة بسيطة، وتُخفى شاشته في التطبيقات الأخيرة، ويُمنع التقاط الشاشة. اختره إذا كان أحد قد يفحص هاتفك. ويمكنك أيضًا إضافة رمز PIN من القائمة.',
    pinH: 'رمز PIN للفتح', pinNote: 'يطلبه التطبيق عند فتحه وبعد دقيقة من الخروج منه. يخفي التطبيق؛ ولا يشفّره.',
    setPin: 'تعيين رمز PIN', newPin: 'رمز جديد (من 4 إلى 8 أرقام)', repeat: 'كرّر الرمز', save: 'حفظ', mismatch: 'الرمزان غير متطابقين.', short: 'استخدم من 4 إلى 8 أرقام.',
    removePin: 'إزالة رمز PIN', current: 'الرمز الحالي', wrong: 'رمز خاطئ.', wait: 'محاولات كثيرة. انتظر {s} ثانية.', open: 'فتح', enter: 'أدخل رمز PIN',
    forgot: 'نسيته؟ امسح بيانات التطبيق من إعدادات Android (تضيع المحادثات واللغات المضافة).', pinOn: 'PIN',
    histH: 'المحادثات', keep: 'الاحتفاظ بها', dontKeep: 'عدم الاحتفاظ بها',
    histNote: 'من دون احتفاظ: لا يُكتب شيء على الهاتف، وتختفي المحادثات عند إغلاق التطبيق.',
    erase: 'حذف كل المحادثات الآن', confirmErase: 'المس مرة أخرى لحذف كل شيء',
  },
}
export const PT = (lang: string): P => T[lang] ?? T.en!
const fill = (s: string, lang: string) => s.replace('{name}', PT(lang).name)

const get = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const put = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {}
}
const bridge = () => (window as any).Android as { discreet?(): boolean; setDiscreet?(on: boolean): void } | undefined

// ------------------------------------------------------------------------------------------------------------ discreet

export function discreetOn(): boolean {
  try {
    const b = bridge()
    if (b?.discreet) return b.discreet()
  } catch {}
  return get(DISCREET) === '1'
}
/** The header and the page title: the neutral name in discreet mode. */
export function applyBrand(lang: string) {
  const on = discreetOn()
  const h1 = document.querySelector('header .brand h1')
  if (h1) h1.textContent = on ? PT(lang).name : 'BT Servant'
  // (an <svg> has no `hidden` property: display it is)
  for (const e of document.querySelectorAll<HTMLElement | SVGElement>('header .brand svg, header .brand .badge')) e.style.display = on ? 'none' : ''
  document.title = on ? PT(lang).name : 'BT Servant Mini'
}
export function setDiscreet(on: boolean, lang: string) {
  put(DISCREET, on ? '1' : '0')
  try {
    bridge()?.setDiscreet?.(on)
  } catch {}
  applyBrand(lang)
}

// ------------------------------------------------------------------------------------------------------------- history

export const keepHistory = (): boolean => get(HISTORY) !== 'none'
export function setKeepHistory(keep: boolean) {
  put(HISTORY, keep ? 'keep' : 'none')
  if (!keep) put('btsm.conversations.v1', null) // what was kept goes now (main.ts KEY)
}

// ----------------------------------------------------------------------------------------------------------------- PIN

export const hasPin = (): boolean => !!get(PIN)
async function digest(salt: string, pin: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100_000, hash: 'SHA-256' }, key, 256)
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
export async function setPin(pin: string) {
  const salt = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('')
  put(PIN, JSON.stringify({ salt, hash: await digest(salt, pin) }))
}
export const clearPin = () => put(PIN, null)
export async function checkPin(pin: string): Promise<boolean> {
  try {
    const { salt, hash } = JSON.parse(get(PIN) ?? '')
    return (await digest(salt, pin)) === hash
  } catch {
    return false
  }
}
export const validPin = (pin: string) => /^\d{4,8}$/.test(pin)

const el = (tag: string, cls = '', text?: string) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
export const pinInput = (placeholder: string) => {
  const i = el('input', 'pin') as HTMLInputElement
  i.type = 'password'
  i.inputMode = 'numeric'
  i.autocomplete = 'off'
  i.maxLength = 8
  i.placeholder = placeholder
  return i
}

let fails = 0
let blockedUntil = 0
/** The lock screen: an opaque cover over the whole app until the right PIN. */
export function lock(lang: string) {
  if (!hasPin() || document.querySelector('#lock')) return
  const s = PT(lang)
  const wrap = el('div', '')
  wrap.id = 'lock'
  const box = el('form', 'card') as HTMLFormElement
  box.dir = 'auto'
  box.appendChild(el('h2', '', discreetOn() ? s.name : 'BT Servant Mini'))
  const i = pinInput(s.enter)
  const msg = el('p', 'note', '')
  const go = el('button', 'primary', s.open) as HTMLButtonElement
  go.type = 'submit'
  box.onsubmit = async (e) => {
    e.preventDefault()
    const left = Math.ceil((blockedUntil - Date.now()) / 1000)
    if (left > 0) {
      msg.textContent = s.wait.replace('{s}', String(left))
      return
    }
    go.disabled = true
    const ok = await checkPin(i.value)
    go.disabled = false
    if (ok) {
      fails = 0
      wrap.remove()
      return
    }
    i.value = ''
    fails++
    if (fails >= 5) {
      blockedUntil = Date.now() + 30_000 * 2 ** Math.min(fails - 5, 5)
      msg.textContent = s.wait.replace('{s}', String(Math.ceil((blockedUntil - Date.now()) / 1000)))
    } else msg.textContent = s.wrong
  }
  box.append(i, go, msg, el('p', 'meta', s.forgot))
  wrap.appendChild(box)
  document.body.appendChild(wrap)
  setTimeout(() => i.focus(), 50)
}
export const locked = () => !!document.querySelector('#lock')
/** Asks for the PIN again when the app comes back after a minute away. */
export function watchAway(lang: () => string) {
  let away = 0
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) away = Date.now()
    else if (away && Date.now() - away > AWAY_MS) lock(lang())
  })
}

// ------------------------------------------------------------------------------------------------------- the menu view

/** Menu > Safety: discreet mode, the PIN, and whether conversations are kept. `eraseAll` empties them; `changed` redraws. */
export function protectView(lang: string, eraseAll: () => void, changed: () => void): HTMLElement {
  const s = PT(lang)
  const box = el('div', 'protect')
  // discreet mode
  box.appendChild(el('h3', '', s.discreetH))
  const lab = el('label', 'toggle') as HTMLLabelElement
  const cb = el('input') as HTMLInputElement
  cb.type = 'checkbox'
  cb.checked = discreetOn()
  cb.onchange = () => {
    setDiscreet(cb.checked, lang)
    changed()
  }
  lab.append(cb, el('span', '', fill(s.discreetToggle, lang)))
  box.append(lab, el('p', 'note', fill(s.discreetNote, lang)))
  // PIN
  box.appendChild(el('h3', '', s.pinH))
  box.appendChild(el('p', 'note', s.pinNote))
  const pinBox = el('div', 'pinbox')
  const msg = el('p', 'note', '')
  const row = (...xs: HTMLElement[]) => { const r = el('div', 'langs'); r.append(...xs); return r }
  const button = (t: string, on: () => void) => { const b = el('button', '', t) as HTMLButtonElement; b.type = 'button'; b.onclick = on; return b }
  if (!hasPin()) {
    pinBox.appendChild(row(button(s.setPin, () => {
      pinBox.innerHTML = ''
      const a = pinInput(s.newPin), b = pinInput(s.repeat)
      pinBox.append(a, b, row(button(s.save, async () => {
        if (!validPin(a.value)) return void (msg.textContent = s.short)
        if (a.value !== b.value) return void (msg.textContent = s.mismatch)
        await setPin(a.value)
        changed()
      })), msg)
      a.focus()
    })))
  } else {
    pinBox.appendChild(row(button(s.removePin, () => {
      pinBox.innerHTML = ''
      const a = pinInput(s.current)
      pinBox.append(a, row(button(s.removePin, async () => {
        if (!(await checkPin(a.value))) return void (msg.textContent = s.wrong)
        clearPin()
        changed()
      })), msg)
      a.focus()
    })))
  }
  box.appendChild(pinBox)
  // conversations
  box.appendChild(el('h3', '', s.histH))
  const keep = keepHistory()
  box.appendChild(row(
    Object.assign(button(s.keep, () => { setKeepHistory(true); changed() }), { className: keep ? 'on' : '' }),
    Object.assign(button(s.dontKeep, () => { setKeepHistory(false); changed() }), { className: keep ? '' : 'on' }),
  ))
  box.appendChild(el('p', 'note', s.histNote))
  const erase = button(s.erase, () => {})
  erase.className = 'danger'
  let armed: ReturnType<typeof setTimeout> | null = null
  erase.onclick = () => {
    if (!armed) {
      erase.textContent = s.confirmErase
      armed = setTimeout(() => { armed = null; erase.textContent = s.erase }, 4000)
      return
    }
    clearTimeout(armed)
    armed = null
    eraseAll()
    changed()
  }
  box.appendChild(erase)
  return box
}
export const protectSummary = (lang: string, off: string): string => {
  const s = PT(lang)
  const parts = [discreetOn() ? s.discreetH : '', hasPin() ? s.pinOn : ''].filter(Boolean)
  return parts.length ? parts.join(' · ') : off
}
