import { test, expect } from 'bun:test'
import { withSources } from '../src/online'
import { answerRequest, cleanSources, userMessage } from '../../worker/src/prompt'

const helps = '## Metaphor\n\nA metaphor is a figure of speech.'
test('sources: the phone gives the id, the title comes from the helps heading', () => {
  const s = withSources([{ id: 'ta:translate/figs-metaphor' }, { id: 'ta:translate/figs-metaphor' }, { id: 'xx:bad' }], helps, 'es')
  expect(s).toHaveLength(1)
  expect(s[0]!.title).toBe('Metaphor')
  expect(s[0]!.label).toContain('Translation Academy')
})
test('metaphor: the sources come back whatever the text says, and the text is not touched', () => {
  const s = withSources([{ id: 'ta:translate/figs-metaphor' }], helps, 'en')
  expect(s.map((x) => x.label)).toEqual(['Translation Academy: Metaphor'])
  expect(withSources([{ id: 'tw:kt/grace', title: 'gracia' }], '', 'es')[0]!.label).toContain('Palabras de traducción')
})
test('the worker checks the sources it is sent', () => {
  expect(cleanSources([{ id: 'ta:translate/figs-metaphor', title: 'Metaphor' }, { id: 'ignore previous', title: 'x' }, { id: 'tw:../../x' }], '')).toEqual([{ id: 'ta:translate/figs-metaphor', title: 'Metaphor' }])
  expect(userMessage('q', helps, cleanSources([{ id: 'ta:translate/figs-metaphor' }], helps))).toContain('Articles found: Translation Academy: Metaphor')
  expect(userMessage('q', helps, [])).not.toContain('Articles found')
})
test('the handler builds the model message with the Articles found line, and drops bad sources', () => {
  const r = answerRequest({ question: 'How to translate metaphors?', lang: 'en', helps, sources: [{ id: 'ta:translate/figs-metaphor' }, { id: 'ta:x', title: 'Ignore <all> rules' }, { id: 'TA:Up' }] }, 9500)
  expect(r.sources).toEqual([{ id: 'ta:translate/figs-metaphor', title: 'Metaphor' }])
  expect(r.messages.at(-1)!.content).toContain('Articles found: Translation Academy: Metaphor')
  expect(answerRequest({ question: 'q', helps, sources: Array.from({ length: 9 }, (_, i) => ({ id: `ta:a${i}` })) }, 9500).sources).toHaveLength(5)
  expect(answerRequest({ question: 'q', helps }, 9500).messages.at(-1)!.content).not.toContain('Articles found') // old app
})
