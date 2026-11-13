// Where a link in a note or an article goes. The packs write links three ways: their own ids (`[[tw:kt/faith]]`,
// `[[ta:translate/figs-metaphor]]`, `[1:2](ref:rut 1:2)`), and, inside articles, the files of the source repositories
// (`../kt/faith.md`, `rc://en/ta/man/translate/figs-metaphor`, `rc://en/tn/help/gen/01/01`). All become an article id
// or a Bible reference; anything else is not a link here.

export type Target = { kind: 'article'; id: string } | { kind: 'ref'; ref: string }

const TW = '(kt|names|other)'
const TA = '(translate|checking|process|intro)'

/** `ctx` is the id of the article the link is in, for links relative to it (`./faith.md`). */
export function linkTarget(href: string, ctx = ''): Target | null {
  const h = href.trim()
  let m: RegExpExecArray | null
  if ((m = /^(tw|ta):[a-z0-9_/-]+$/i.exec(h))) return { kind: 'article', id: h }
  if ((m = /^ref:\s*([a-z0-9]{3})\s+(\d+(?::\d+(?:[-–]\d+)?)?)/i.exec(h))) return { kind: 'ref', ref: `${m[1]!.toLowerCase()} ${m[2]!.replace('–', '-')}` }
  if ((m = new RegExp(`^rc://[^/]*/tw/dict/bible/${TW}/([a-z0-9_-]+)`, 'i').exec(h))) return { kind: 'article', id: `tw:${m[1]}/${m[2]}` }
  if ((m = new RegExp(`^rc://[^/]*/ta/man/${TA}/([a-z0-9_-]+)`, 'i').exec(h))) return { kind: 'article', id: `ta:${m[1]}/${m[2]}` }
  if ((m = /^rc:\/\/[^/]*\/(?:tn|ult|ust|bible)\/(?:help\/)?([a-z0-9]{3})\/(\d+)\/(\d+)/i.exec(h)))
    return { kind: 'ref', ref: `${m[1]!.toLowerCase()} ${Number(m[2])}:${Number(m[3])}` }
  // Translation Words files: ../kt/faith.md, ./faith.md, faith.md
  if ((m = new RegExp(`^(?:\\.\\.?/)*${TW}/([a-z0-9_-]+)\\.md$`, 'i').exec(h))) return { kind: 'article', id: `tw:${m[1]}/${m[2]}` }
  const twCtx = /^tw:([a-z]+)\//.exec(ctx)
  if (twCtx && (m = /^(?:\.\/)?([a-z0-9_-]+)\.md$/i.exec(h))) return { kind: 'article', id: `tw:${twCtx[1]}/${m[1]}` }
  // Translation Academy files: ../../translate/figs-metaphor/01.md, ../figs-metaphor/01.md
  if ((m = new RegExp(`^(?:\\.\\./)+${TA}/([a-z0-9_-]+)/01\\.md$`, 'i').exec(h))) return { kind: 'article', id: `ta:${m[1]}/${m[2]}` }
  const taCtx = /^ta:([a-z]+)\//.exec(ctx)
  if (taCtx && (m = /^\.\.\/([a-z0-9_-]+)\/01\.md$/i.exec(h))) return { kind: 'article', id: `ta:${taCtx[1]}/${m[1]}` }
  // Bible files in Translation Words references: ../../../bible/... are rare; tN files: ../gen/01/01.md
  if ((m = /^(?:\.\.\/)+([a-z0-9]{3})\/(\d+)\/(\d+)\.md$/i.exec(h))) return { kind: 'ref', ref: `${m[1]!.toLowerCase()} ${Number(m[2])}:${Number(m[3])}` }
  return null
}

/** A readable label for an id before its title is known: `ta:translate/figs-metaphor` -> `figs metaphor`. */
export const slugLabel = (id: string): string => id.split('/').pop()!.replace(/[-_]/g, ' ')
