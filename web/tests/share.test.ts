import { test, expect } from 'bun:test'
import { plainText, trimAt, shareText, referenceOf, APP_LINK } from '../src/share'

const meta = 'model 5 ms\n{\n "intent": "passage",\n "ref": "rut 2:3"\n}'
test('markdown becomes plain words', () => {
  expect(plainText('### Title\n\n**GLT** Hola *mundo* [link](https://x.y) [[ta:translate/figs-metaphor]]\n* uno')).toBe('Title\n\nGLT Hola mundo link figs metaphor\n- uno')
})
test('short text stays; long text is cut at a sentence', () => {
  expect(trimAt('Hola.')).toBe('Hola.')
  const s = 'Una frase corta. '.repeat(100)
  const t = trimAt(s)
  expect(t.length).toBeLessThanOrEqual(1001)
  expect(t.endsWith('.…')).toBe(true)
})
test('cut at a paragraph when there is one late enough', () => {
  const s = 'a'.repeat(700) + '\n\n' + 'b'.repeat(600)
  expect(trimAt(s)).toBe('a'.repeat(700) + '…')
})
test('reference and source', () => {
  expect(referenceOf({ who: 'bot', info: '**GLT** (x, v1): texto', meta }, 'es')).toBe('Rut 2:3 (GLT)')
  expect(referenceOf({ who: 'bot', info: '# Redentor\ntexto' }, 'es')).toBe('Redentor')
})
test('the full text: question, answer, reference, link; online answer first', () => {
  const t = shareText({ who: 'bot', info: '**GLT** (x, v1): offline', ai: { text: 'online answer' }, meta }, 'en', '¿Qué dice?')!
  // marked as the online AI's, as its badge in the app
  expect(t).toBe(`¿Qué dice?\n\nOnline AI: online answer\n\nRuth 2:3 (GLT)\n\n${APP_LINK}`)
})
test('nothing to share', () => {
  expect(shareText({ who: 'bot', intro: 'hi' }, 'en')).toBeNull()
  expect(shareText({ who: 'bot', info: 'x', limits: true }, 'en')).toBeNull()
})
test('a bold note heading is not the source', () => {
  expect(referenceOf({ who: 'bot', info: '### Notes\n**YHWH**: the name of God', meta }, 'ar')).toBe('راعوث 2:3')
})
test('Hindi and Arabic full stops end a sentence', () => {
  const hi = 'यह एक वाक्य है। '.repeat(100)
  expect(trimAt(hi).endsWith('।…')).toBe(true)
  const ar = 'هذه جملة. '.repeat(120)
  expect(trimAt(ar).endsWith('.…')).toBe(true)
})
test('note links read as their label', () => {
  expect(plainText('see [[ta:translate/figs-metaphor]]')).toBe('see figs metaphor')
})
