// What "What can you do?" adds after About's text: a few lines naming what this phone has (the Bible Stories, who is who, the guided
// modes), each only when the phone has it, so the answer never names what is not there.
import { bookLabel } from './converse'
import { academyManuals, bibleBooks, XT } from './explore'
import { dataOf, fiveStories, modesFor, noFive } from './modes'
import { phoneHas } from './howto'

// {ref}: a verse, {browse}: Browse's name, {list}: the guided modes this phone has
const HELP_LINES: Record<string, { obs: string; who: string; modes: string; list: [string, string, string]; sep: string }> = {
  en: { obs: 'OBS 3 or OBS 3:5: a Bible story, or a frame, with its picture and its notes', who: 'Who is “he” in {ref}, or the sentence structure', modes: 'Guided modes (in {browse}): {list}', list: ['translate a book', 'learn to translate', 'a 5M session with your team'], sep: ', ' },
  es: { obs: 'OBS 3 o OBS 3:5: una historia de la Biblia, o un cuadro, con su imagen y sus notas', who: 'Quién es «él» en {ref}, o la estructura de la oración', modes: 'Modos guiados (en {browse}): {list}', list: ['traducir un libro', 'aprender a traducir', 'una sesión 5M con tu equipo'], sep: ', ' },
  fr: { obs: 'OBS 3 ou OBS 3:5 : une histoire de la Bible, ou une image, avec son illustration et ses notes', who: 'Qui est « il » dans {ref}, ou la structure de la phrase', modes: 'Modes guidés (dans {browse}) : {list}', list: ['traduire un livre', 'apprendre à traduire', 'une séance 5M avec votre équipe'], sep: ', ' },
  id: { obs: 'OBS 3 atau OBS 3:5: sebuah kisah Alkitab, atau sebuah bingkai, dengan gambar dan catatannya', who: 'Siapa «dia» dalam {ref}, atau struktur kalimatnya', modes: 'Mode terpandu (di {browse}): {list}', list: ['menerjemahkan sebuah kitab', 'belajar menerjemahkan', 'sesi 5M bersama tim Anda'], sep: ', ' },
  hi: { obs: 'OBS 3 या OBS 3:5: बाइबल की एक कहानी, या एक फ़्रेम, उसके चित्र और नोट्स के साथ', who: '{ref} में «वह» कौन है, या वाक्य की संरचना', modes: 'निर्देशित तरीके («{browse}» में): {list}', list: ['पुस्तक का अनुवाद', 'अनुवाद सीखना', 'अपनी टीम के साथ 5M सत्र'], sep: ', ' },
  ar: { obs: 'OBS 3 أو OBS 3:5: قصة من قصص الكتاب المقدس، أو إطار، مع صورته وملاحظاته', who: 'من هو «هو» في {ref}، أو بنية الجملة', modes: 'المسارات الموجّهة (في {browse}): {list}', list: ['ترجمة سفر', 'تعلّم الترجمة', 'جلسة 5M مع فريقك'], sep: '، ' },
}

/** The lines to add after About's text, as a Markdown list ('' when the phone has none of what they name). `packs`: the installed packs. */
export async function helpLines(ui: string, packs: string[]): Promise<string> {
  const t = HELP_LINES[ui] ?? HELP_LINES.en!
  const [has, books, manuals, five] = await Promise.all([phoneHas(packs), bibleBooks(packs), academyManuals(packs), fiveStories(packs).catch(noFive)])
  const lines: string[] = []
  if (has.obs) lines.push(t.obs)
  if (has.books) lines.push(t.who.replace('{ref}', `${bookLabel(ui, 'rut')} 2:4`))
  const list = modesFor(dataOf(books.length, manuals.length, five)).map((id) => t.list[id === 'book' ? 0 : id === 'learn' ? 1 : 2])
  if (list.length) lines.push(t.modes.replace('{browse}', XT(ui).browse).replace('{list}', list.join(t.sep)))
  return lines.length ? `\n\n${lines.map((x) => `- ${x}`).join('\n')}` : ''
}
