// A small Markdown renderer for answers: headings (#, ##, ###), paragraphs, line breaks, lists (-, *, •, 1.), **bold**,
// *italic* and _italic_. Everything is escaped first, so text from the packs can never become HTML.
// A paragraph that starts with "▸ " is a fold (focus.ts): a button, with what follows inside it, up to the next fold or a
// paragraph that is only "◂" (FOLD_END, which is not shown).
import { FOLD, FOLD_END } from './focus'
import { linkTarget, slugLabel } from './links'
import { dirOf, hasRtl } from './bidi'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Links the app can open become <a class="lk" data-href>: an article (opened in the panel) or a Bible reference. `[[id]]`
// gets a provisional label (data-fill asks for its title); a link the app cannot follow stays as its text.
let CTX = ''
function links(s: string): string {
  return s
    .replace(/\[\[([^\]\n]+)\]\]/g, (all, href: string) =>
      linkTarget(href.replace(/&amp;/g, '&'), CTX) ? `<a class="lk" data-href="${href}" data-fill="1">${slugLabel(href)}</a>` : all)
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (all, text: string, href: string) =>
      linkTarget(href.replace(/&amp;/g, '&'), CTX) ? `<a class="lk" data-href="${href}" data-ctx="${CTX}">${text}</a>` : text)
}
function inline(s: string): string {
  return links(esc(s))
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(«“])\*([^*\s][^*\n]*?)\*(?=[\s).,;:!?»”]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(«“])_([^_\n]+?)_(?=[\s).,;:!?»”]|$)/g, '$1<em>$2</em>')
}

/** The words a reader sees, for its direction: no [[id]] targets, a link's text without its address ("rc://…" made Arabic lines
 *  left to right). */
const seen = (s: string): string => s.replace(/\[\[[^\]\n]+\]\]/g, '').replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, '$1')
/** The direction of Markdown text by the words it shows (bidi.ts dirOf), for the element it is drawn in. */
export const mdDir = (src: string): 'rtl' | 'ltr' | 'auto' => dirOf(seen(src))

/** `ctx`: the article id the text belongs to, for its relative links. */
export function md(src: string, ctx = ''): string {
  CTX = ctx
  // with right-to-left letters anywhere, each block gets the direction of its own words (bidi.ts textDir): an English note
  // in an Arabic answer reads left to right, an Arabic verse in an English one right to left. Without, nothing changes.
  const mixed = hasRtl(src)
  const D = (t: string | string[]) => (mixed ? ` dir="${mdDir(Array.isArray(t) ? t.join(' ') : t)}"` : '')
  const out: string[] = []
  let folded = false
  const close = () => {
    if (folded) out.push('</details>')
    folded = false
  }
  for (const block of src.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '')
    if (!lines.length) continue
    if (lines[0]!.startsWith(FOLD)) {
      close()
      const sum = lines.shift()!.slice(FOLD.length).trim()
      out.push(`<details class="fold"><summary${D(sum)}>${inline(sum)}</summary>`)
      folded = true
      if (!lines.length) continue
    } else if (lines.length === 1 && lines[0]!.trim() === FOLD_END) {
      close()
      continue
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(lines[0]!)
    if (h) {
      const level = Math.min(h[1]!.length + 2, 5) // # -> h3, ## -> h4, ### and deeper -> h5
      out.push(`<h${level}${D(h[2]!)}>${inline(h[2]!)}</h${level}>`)
      lines.shift()
      if (!lines.length) continue
    }
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
      const items = lines.map((l) => l.replace(/^\s*[-*•]\s+/, ''))
      out.push(`<ul${D(items)}>${items.map((l) => `<li${D(l)}>${inline(l)}</li>`).join('')}</ul>`)
    } else if (lines.every((l) => /^\s*(\d+[.)]|[-*•])\s+/.test(l)) && /^\s*\d+[.)]\s+/.test(lines[0]!)) {
      // a numbered list with bullets under its items (a book's outline): the bullets nest in the item above them
      const start = Number(/^\s*(\d+)/.exec(lines[0]!)![1])
      let html = ''
      let open = false
      for (const l of lines) {
        if (/^\s*\d+[.)]\s+/.test(l)) {
          if (open) html += '</ul>'
          open = false
          const t = l.replace(/^\s*\d+[.)]\s+/, '')
          html += (html ? '</li>' : '') + `<li${D(t)}>${inline(t)}`
        } else {
          if (!open) html += '<ul>'
          open = true
          const t = l.replace(/^\s*[-*•]\s+/, '')
          html += `<li${D(t)}>${inline(t)}</li>`
        }
      }
      out.push(`<ol start="${start}"${D(lines)}>${html}${open ? '</ul>' : ''}</li></ol>`)
    } else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      const start = Number(/^\s*(\d+)/.exec(lines[0]!)![1])
      const items = lines.map((l) => l.replace(/^\s*\d+[.)]\s+/, ''))
      out.push(`<ol start="${start}"${D(items)}>${items.map((l) => `<li${D(l)}>${inline(l)}</li>`).join('')}</ol>`)
    } else {
      // text with a list inside it (an online answer often writes "To translate:" and then "- …" lines): each run of list
      // lines becomes a list, the rest stays paragraphs
      let para: string[] = []
      let items: string[] = []
      const flush = () => {
        if (para.length) out.push(`<p${D(para)}>${para.map(inline).join('<br>')}</p>`)
        if (items.length) out.push(`<ul${D(items)}>${items.map((l) => `<li${D(l)}>${inline(l)}</li>`).join('')}</ul>`)
        para = []
        items = []
      }
      for (const l of lines) {
        const item = /^\s*[-*•]\s+(.*)$/.exec(l)
        if (item) {
          if (para.length) { out.push(`<p${D(para)}>${para.map(inline).join('<br>')}</p>`); para = [] }
          items.push(item[1]!)
        } else {
          if (items.length) { out.push(`<ul${D(items)}>${items.map((x) => `<li${D(x)}>${inline(x)}</li>`).join('')}</ul>`); items = [] }
          para.push(l)
        }
      }
      flush()
    }
  }
  close()
  // one list, not one list per item, when the items were separated by blank lines
  return out.join('').replace(/<\/ul><ul(?: dir="\w+")?>/g, '').replace(/<\/ol><ol start="\d+"(?: dir="\w+")?>/g, '')
}
