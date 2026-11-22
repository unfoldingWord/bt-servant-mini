// A heading deeper than ### (the 5M session's text has `####`) is a heading, not the literal marks.
import { describe, expect, test } from 'bun:test'
import { md } from '../src/md'

describe('headings', () => {
  test('# ## ### keep their levels; #### and deeper are the smallest heading, never literal #', () => {
    expect(md('# A')).toContain('<h3')
    expect(md('## A')).toContain('<h4')
    expect(md('### A')).toContain('<h5')
    for (const hs of ['####', '#####', '######']) {
      const html = md(`${hs} Team Check
*Read the passage aloud.*`)
      expect(html).toContain('<h5')
      expect(html).toContain('Team Check</h5>')
      expect(html).not.toContain('#')
    }
  })
  test('seven marks or no space are text', () => {
    expect(md('####### A')).not.toContain('<h')
    expect(md('#A')).not.toContain('<h')
  })
})
