// The way to get the Open Bible Stories pictures from the frame itself (issue #8): in the placeholder (no picture, no internet or
// the picture failed) [Download] and [Load from a file]; under a picture that came from the internet, a quiet line and [Download].
// The download is Resources' own (`requestImages`: the same questions before mobile data and no internet, the same progress), so
// both screens show it; when the pictures arrive every frame still waiting redraws with the phone's picture.
// Loaded by obsimg.ts only when a frame needs it (it reaches resources.ts, which reaches obsimg.ts).
import { importedLine, IW } from './obsimg'
import { onPacksChanged } from './packs'
import { deps, downloads, forgetImagesQuestion, imagesHint, isNetError, onDownloads, pair, requestImages, RT } from './resources'

const rtl = (ui: string) => ui.split('-')[0] === 'ar'
/** The frames waiting for the pictures: redrawn when they are on the phone. */
const waiting = new Set<{ host: HTMLElement; redo: () => void }>()
let wired = false
function wire() {
  if (wired) return
  wired = true
  onPacksChanged(() => {
    if (!waiting.size) return
    void deps.imagesInstalled().then((i) => {
      if (!i || !('bytes' in i)) return
      for (const w of [...waiting]) {
        waiting.delete(w)
        if (w.host.isConnected !== false) w.redo()
      }
    }, () => {})
  })
}

function el(tag: string, cls: string, txt?: string): HTMLElement {
  const e = document.createElement(tag)
  e.className = cls
  if (txt !== undefined) e.textContent = txt
  return e
}
function button(txt: string, on: () => void): HTMLButtonElement {
  const b = el('button', 'small obs-pic-btn', txt) as HTMLButtonElement
  b.type = 'button'
  b.onclick = on
  return b
}

/**
 * Fills `host` (the placeholder, or the line under a picture) with what the person can do: `kind` 'none' (no picture: Download
 * and Load from a file) or 'cdn' (the picture came from the internet: a line and Download). A download in progress shows its
 * bytes; one that failed, a retry; with the pictures on the phone the host is removed. `redo` draws the frame again.
 */
export function addAsk(host: HTMLElement, ui: string, kind: 'none' | 'cdn', redo: () => void): void {
  wire()
  const t = IW(ui)
  const r = RT(ui)
  const me = { host, redo }
  waiting.add(me)
  let partial = false
  // nothing is drawn until the phone has said whether the pictures are there (no flash of buttons, no wrong word)
  let ready = false
  let said = ''
  // the button's new words after a tap (the mobile-data question, no internet): this frame's own, not what an older tap left
  let hint: string | undefined
  const out = el('div', 'obs-pic-ask')
  out.lang = ui
  out.dir = rtl(ui) ? 'rtl' : 'ltr'
  host.append(out)

  const file = document.createElement('input')
  file.type = 'file'
  file.accept = '.tcpack,application/octet-stream'
  file.hidden = true
  file.onchange = async () => {
    const f = file.files?.[0]
    if (!f) return
    said = r.working
    paint()
    try {
      // the pictures (zxx-obsimg), languages, or both: one kind of file
      const res = await deps.importPack(new Uint8Array(await f.arrayBuffer()))
      const have = res.images ? await deps.imagesInstalled().catch(() => null) : null
      said = have && 'bytes' in have ? '' : importedLine(ui, res, have, r.failed)
    } catch (e) {
      console.warn('loading the file failed:', e)
      said = r.failedGen
    }
    paint()
  }

  const start = () => { said = ''; if (!hint) forgetImagesQuestion(); void requestImages(ui, () => { hint = imagesHint(); paint() }) }
  function paint() {
    if (host.isConnected === false) { off(); waiting.delete(me); return }
    if (!ready) return
    const d = downloads().find((x) => x.key === 'images')
    const parts: HTMLElement[] = []
    if (kind === 'cdn') parts.push(el('span', 'obs-pic-line', t.net))
    if (d && !d.error && !d.done) {
      hint = undefined
      parts.push(el('span', 'obs-pic-line', `${r.downloading} ${pair(d.a, d.b)}`))
    } else {
      if (d?.error) parts.push(el('span', 'obs-pic-line', isNetError(new Error(d.error)) ? r.needNet : r.failedGen))
      else if (said) parts.push(el('span', 'obs-pic-line', said))
      const label = hint ?? (d?.error || partial ? t.resume : kind === 'none' ? t.getPics : t.download)
      parts.push(button(label, start))
      if (kind === 'none') parts.push(button(t.fromFile, () => file.click()))
    }
    out.replaceChildren(...parts, file)
  }
  const off = onDownloads(paint)
  // the pictures are there already: nothing to ask (a frame the pack lacks is not drawn again: that would ask again). A cut download says Continue.
  void deps.imagesInstalled().then((i) => {
    if (i && 'bytes' in i) { off(); waiting.delete(me); out.remove(); return }
    partial = !!i
    ready = true
    paint()
  }, () => { ready = true; paint() })
}
