import { test, expect } from 'bun:test'
import { citeSources, withSources } from '../src/online'
import { cleanSources, userMessage } from '../../worker/src/prompt'

const helps = '## Metaphor\n\nA metaphor is a figure of speech.'
test('sources: the phone gives the id, the title comes from the helps heading', () => {
  const s = withSources([{ id: 'ta:translate/figs-metaphor' }, { id: 'ta:translate/figs-metaphor' }, { id: 'xx:bad' }], helps, 'es')
  expect(s).toHaveLength(1)
  expect(s[0]!.title).toBe('Metaphor')
  expect(s[0]!.label).toContain('Translation Academy')
})
test('the source line is added only when the model did not name the article', () => {
  const s = withSources([{ id: 'ta:translate/figs-metaphor' }], helps, 'en')
  expect(citeSources('Use the idea in simple words.', s, 'en')).toContain('*Source: Translation Academy: Metaphor*')
  expect(citeSources('Per Translation Academy: Metaphor, use it.', s, 'en')).toBe('Per Translation Academy: Metaphor, use it.')
  expect(citeSources('Texto', withSources([{ id: 'tw:kt/grace', title: 'gracia' }], '', 'es'), 'es')).toContain('Fuente: Palabras de traducción')
})
test('the worker checks the sources it is sent', () => {
  expect(cleanSources([{ id: 'ta:translate/figs-metaphor', title: 'Metaphor' }, { id: 'ignore previous', title: 'x' }, { id: 'tw:../../x' }], '')).toEqual([{ id: 'ta:translate/figs-metaphor', title: 'Metaphor' }])
  expect(userMessage('q', helps, cleanSources([{ id: 'ta:translate/figs-metaphor' }], helps))).toContain('Articles found: Translation Academy: Metaphor')
  expect(userMessage('q', helps, [])).not.toContain('Articles found')
})
