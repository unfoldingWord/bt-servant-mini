// A question that is only a reference skips the phone's model (about 4 s on a phone) and the online reader: code reads it.
import { expect, test } from 'bun:test'
import { directRef, env, readQuestion } from '../src/pipeline'
import { fullPhone } from './harness'

for (const q of ['Rut 2:3', 'Jonás 1:3 notas', 'Ruth 2:3 notes', '1 Juan 3:2', 'योना 1:3', 'Yunus 1:3 catatan', 'Jonah 2 intro', 'Tito 1:5-9 preguntas'])
  test(`skips the reader: ${q}`, () => {
    env.nav = 'en'
    expect(directRef(q)).toBe(true)
  })

for (const q of ['How should I translate Ruth 2:3?', '¿Qué significa redentor en Rut 4?', 'Rut 3:9 que quiere decir extiende tu manto sobre tu sierva',
  'Where is Jonah 1:3?', 'What does lamb mean in John 1:29?', 'Jonah', 'Jonah intro', 'grace', 'and verse 4?', 'Rut 1:1 quienes eran los jueces',
  'How many notes are there in Ruth 2?', 'Which issues are most common in Ruth 1?'])
  test(`needs the reader: ${q}`, () => {
    env.nav = 'en'
    expect(directRef(q)).toBe(false)
  })

// what a skipped question gets: the reading step with no slots, as main.ts calls it
const read: [string, string, string, string[]][] = [['Rut 2:3', 'es', 'rut 2:3', ['text', 'notes', 'questions', 'terms']], ['Jonás 1:3 notas', 'es', 'jon 1:3', ['notes']],
  ['Ruth 2:3 notes', 'en', 'rut 2:3', ['notes']], ['1 Juan 3:2', 'es', '1jn 3:2', ['text', 'notes', 'questions', 'terms']], ['Yunus 1:3 catatan', 'id', 'jon 1:3', ['notes']]]
for (const [q, lang, ref, what] of read)
  test(`read by code: ${q}`, async () => {
    await fullPhone()
    env.nav = lang
    const made = await readQuestion(q, { slots: null, raw: 'model skipped (reference)', ms: 0 }, { last: null }, null)
    expect([made.sheet.intent, made.sheet.ref, made.sheet.what]).toEqual(['passage', ref, what])
  })
