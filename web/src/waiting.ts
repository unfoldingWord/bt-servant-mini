// The waiting line of a conversation ("Looking in the translation helps…", "Writing with online AI…"): a small orb of Mini's own
// accent colour that breathes next to a short text that shimmers softly (index.html, .wait). One builder, so every wait looks the same.
// The orb is only decoration (aria-hidden); the wrapper is the status a screen reader reads. The text sets its own direction and the
// orb sits at the line's start (CSS margin-inline-end), so it is on the right in Arabic.
import { dirOf } from './bidi'

export function waiting(text: string, tag: 'div' | 'p' = 'div', cls = ''): HTMLElement {
  const box = document.createElement(tag)
  box.className = `wait pending${cls ? ' ' + cls : ''}`
  box.setAttribute('role', 'status')
  box.dir = dirOf(text)
  const orb = document.createElement('i')
  orb.className = 'orb'
  orb.setAttribute('aria-hidden', 'true')
  const label = document.createElement('span')
  label.className = 'wt'
  label.textContent = text
  box.append(orb, label)
  return box
}
