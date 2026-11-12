// BT Servant Mini: a chat page. Question -> offline model (slots) -> call sheet -> recipe over the installed language packs -> answer.
import { answerSheet, setUiLang } from './answer'
import { buildSheet } from './sheet'
import { modelReady, modelStatus, slotsOf } from './model'
import { installedLangs } from './packs'

type UiText = { ph: string; send: string; loading: string; ready: string; thinking: string; failed: string; details: string; hello: string; ex: string[] }
const UI: Record<string, UiText> = {
  en: {
    ph: 'Ask about a verse or a word…', send: 'Send', loading: 'Starting the offline model…', ready: 'Offline · ready',
    thinking: 'Thinking…', failed: 'Something went wrong:', details: 'details',
    hello: 'Hello! I answer from the translation helps installed on this phone (notes, words, questions, Academy), without internet. Ask in English, Spanish, French, Indonesian or Hindi.',
    ex: ['What does Jonah 3:9 say in the UST?', 'What does grace mean?', 'How do I translate "the heart of the seas" in Jonah 2:3?'],
  },
  es: {
    ph: 'Pregunta por un versículo o palabra…', send: 'Enviar', loading: 'Iniciando el modelo sin conexión…',
    ready: 'Sin conexión · listo', thinking: 'Pensando…', failed: 'Algo salió mal:', details: 'detalles',
    hello: '¡Hola! Respondo con las ayudas de traducción instaladas en este teléfono (notas, palabras, preguntas, Academia), sin internet. Pregunta en español, inglés, francés, indonesio o hindi.',
    ex: ['¿Qué dicen las notas de Tito 1:1?', '¿Qué significa gracia?', '¿Cómo traduzco «alzaron su voz» en Rut 1:14?'],
  },
  fr: {
    ph: 'Un verset, un mot…', send: 'Envoyer', loading: 'Démarrage du modèle hors ligne…',
    ready: 'Hors ligne · prêt', thinking: 'Je réfléchis…', failed: 'Une erreur est survenue :', details: 'détails',
    hello: 'Bonjour ! Je réponds à partir des aides à la traduction installées sur ce téléphone, sans internet.',
    ex: ['Que dit Jonas 1:3 ?', 'Que signifie le mot grâce ?'],
  },
  id: {
    ph: 'Tanya tentang ayat atau kata…', send: 'Kirim', loading: 'Memulai model offline…', ready: 'Offline · siap',
    thinking: 'Sedang berpikir…', failed: 'Terjadi kesalahan:', details: 'detail',
    hello: 'Halo! Saya menjawab dari bahan bantu penerjemahan yang terpasang di ponsel ini, tanpa internet.',
    ex: ['Apa kata Yunus 3:9 dalam UST?', 'Apa arti kata kasih karunia?'],
  },
  hi: {
    ph: 'किसी पद या शब्द के बारे में पूछें…', send: 'भेजें', loading: 'ऑफ़लाइन मॉडल शुरू हो रहा है…', ready: 'ऑफ़लाइन · तैयार',
    thinking: 'सोच रहा हूँ…', failed: 'कुछ गलत हो गया:', details: 'विवरण',
    hello: 'नमस्ते! मैं इस फ़ोन पर स्थापित अनुवाद सहायता से, बिना इंटरनेट के, उत्तर देता हूँ।',
    ex: ['योना 3:9 क्या कहता है?', 'अनुग्रह का क्या अर्थ है?'],
  },
}
const nav = (navigator.language || 'en').slice(0, 2)
const T = UI[nav] ?? UI.en!

const $ = <E extends HTMLElement>(s: string) => document.querySelector(s) as E
const log = $('#log'), form = $<HTMLFormElement>('#ask'), input = $<HTMLTextAreaElement>('#q'), btn = $<HTMLButtonElement>('#send'), status = $('#status')
input.placeholder = T.ph
btn.textContent = T.send

function bubble(cls: string, text: string): HTMLElement {
  const d = document.createElement('div')
  d.className = `msg ${cls}`
  d.textContent = text
  log.appendChild(d)
  d.scrollIntoView({ block: 'end', behavior: 'smooth' })
  return d
}
function examples() {
  const w = document.createElement('div')
  w.className = 'examples'
  for (const e of T.ex) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = e
    b.onclick = () => {
      input.value = e
      form.requestSubmit()
    }
    w.appendChild(b)
  }
  log.appendChild(w)
}

let busy = false
function setReady() {
  const ok = modelReady()
  status.textContent = ok ? T.ready : `${T.loading} ${modelStatus()}`
  status.dataset.ok = String(ok)
  btn.disabled = !ok || busy
  if (!ok) setTimeout(setReady, 1000)
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const q = input.value.trim()
  if (!q || busy || !modelReady()) return
  busy = true
  btn.disabled = true
  input.value = ''
  bubble('me', q)
  const wait = bubble('bot pending', T.thinking)
  const t0 = performance.now()
  try {
    const { slots, raw, ms } = await slotsOf(q)
    const { sheet, ui } = await buildSheet(`q${Date.now()}`, slots ?? { intent: 'unknown', lang: nav })
    setUiLang(ui)
    const r = await answerSheet(sheet)
    wait.classList.remove('pending')
    wait.textContent = r.answer.replace(/\*\*?([^*\n]+)\*\*?/g, '$1')
    const det = document.createElement('details')
    const total = Math.round(performance.now() - t0)
    det.innerHTML = `<summary>${T.details} · ${(total / 1000).toFixed(1)} s</summary>`
    const pre = document.createElement('pre')
    pre.textContent = `model ${ms} ms\n${raw}\n\n${JSON.stringify(sheet, null, 1)}`
    det.appendChild(pre)
    wait.appendChild(det)
  } catch (err) {
    wait.classList.remove('pending')
    wait.textContent = `${T.failed} ${err instanceof Error ? err.message : String(err)}`
  } finally {
    busy = false
    setReady()
    wait.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }
})
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    form.requestSubmit()
  }
})

bubble('bot', T.hello)
installedLangs().then((ls) => ($('#packs').textContent = ls.join(' · '))).catch(() => {})
examples()
setReady()
