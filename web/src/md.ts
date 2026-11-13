// A small Markdown renderer for answers: headings (#, ##, ###), paragraphs, line breaks, lists (-, *, •, 1.), **bold**,
// *italic* and _italic_. Everything is escaped first, so text from the packs can never become HTML.
import { linkTarget, slugLabel } from './links'

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

/** `ctx`: the article id the text belongs to, for its relative links. */
export function md(src: string, ctx = ''): string {
  CTX = ctx
  const out: string[] = []
  for (const block of src.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '')
    if (!lines.length) continue
    const h = /^(#{1,3})\s+(.*)$/.exec(lines[0]!)
    if (h) {
      const level = h[1]!.length + 2 // # -> h3, ## -> h4, ### -> h5
      out.push(`<h${level}>${inline(h[2]!)}</h${level}>`)
      lines.shift()
      if (!lines.length) continue
    }
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
      out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('')}</ul>`)
    } else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      const start = Number(/^\s*(\d+)/.exec(lines[0]!)![1])
      out.push(`<ol start="${start}">${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`)
    } else {
      out.push(`<p>${lines.map(inline).join('<br>')}</p>`)
    }
  }
  // one list, not one list per item, when the items were separated by blank lines
  return out.join('').replace(/<\/ul><ul>/g, '').replace(/<\/ol><ol start="\d+">/g, '')
}
