// What a free search says when it is not a plain list of verses (pipeline.ts, route `search`): the verse of a "where does it
// happen?" question first, the words a partial search found and did not find, and, when nothing fits well, what was searched
// and other ways to ask. In the six languages of the app (en, es, fr, id, hi, ar).

type T = {
  /** "Where was Jonah swallowed?": the sentence before the verse */
  where: string
  /** the heading of the other verses after it */
  others: string
  /** verses that hold some of the words only */
  partial: string
  /** nothing that fits: what was searched */
  none: string
  /** nothing to search: no word left once the question's own words are dropped */
  empty: string
  /** the ways to ask again, each with an example */
  ways: string; ref: string; word: string; phrase: string
}
const TS: Record<string, T> = {
  en: {
    where: 'It is in {ref}:', others: 'Other verses', partial: 'No verse has all of «{all}». These have «{some}»:',
    none: "I didn't find anything that fits «{all}» well in the verses, notes and articles.", empty: 'I could not tell what to search for.',
    ways: 'You can ask again in one of these ways:', ref: 'a reference, like **{x}**', word: 'one word, like **{x}**', phrase: 'a phrase in quotes, like **"{x}"**',
  },
  es: {
    where: 'Está en {ref}:', others: 'Otros versículos', partial: 'Ningún versículo tiene todo «{all}». Estos tienen «{some}»:',
    none: 'No encontré nada que encaje bien con «{all}» en los versículos, las notas y los artículos.', empty: 'No supe qué buscar.',
    ways: 'Puedes preguntar de nuevo de una de estas formas:', ref: 'con una referencia, como **{x}**', word: 'con una sola palabra, como **{x}**', phrase: 'con una frase entre comillas, como **"{x}"**',
  },
  fr: {
    where: "C'est dans {ref} :", others: 'Autres versets', partial: "Aucun verset n'a tout « {all} ». Ceux-ci ont « {some} » :",
    none: "Je n'ai rien trouvé qui corresponde bien à « {all} » dans les versets, les notes et les articles.", empty: 'Je ne sais pas quoi chercher.',
    ways: "Vous pouvez redemander d'une de ces façons :", ref: 'avec une référence, comme **{x}**', word: 'avec un seul mot, comme **{x}**', phrase: 'avec une expression entre guillemets, comme **"{x}"**',
  },
  id: {
    where: 'Ada di {ref}:', others: 'Ayat lain', partial: 'Tidak ada ayat yang memuat semua «{all}». Ayat-ayat ini memuat «{some}»:',
    none: 'Saya tidak menemukan yang cocok dengan «{all}» di ayat, catatan, dan artikel.', empty: 'Saya tidak tahu apa yang harus dicari.',
    ways: 'Anda dapat bertanya lagi dengan salah satu cara ini:', ref: 'dengan referensi, misalnya **{x}**', word: 'dengan satu kata, misalnya **{x}**', phrase: 'dengan frasa dalam tanda kutip, misalnya **"{x}"**',
  },
  hi: {
    where: 'यह {ref} में है:', others: 'अन्य पद', partial: 'किसी पद में पूरा «{all}» नहीं है। इन पदों में «{some}» है:',
    none: 'मुझे पदों, नोट्स और लेखों में «{all}» से ठीक मेल खाता कुछ नहीं मिला।', empty: 'मुझे समझ नहीं आया कि क्या खोजूँ।',
    ways: 'आप इनमें से किसी एक तरीके से फिर पूछ सकते हैं:', ref: 'संदर्भ के साथ, जैसे **{x}**', word: 'एक शब्द के साथ, जैसे **{x}**', phrase: 'उद्धरण चिह्नों में वाक्यांश के साथ, जैसे **"{x}"**',
  },
  ar: {
    where: 'إنه في {ref}:', others: 'آيات أخرى', partial: 'لا توجد آية فيها كل «{all}». هذه فيها «{some}»:',
    none: 'لم أجد ما يناسب «{all}» جيدًا في الآيات والملاحظات والمقالات.', empty: 'لم أعرف عمّا أبحث.',
    ways: 'يمكنك أن تسأل مرة أخرى بإحدى هذه الطرق:', ref: 'بمرجع، مثل **{x}**', word: 'بكلمة واحدة، مثل **{x}**', phrase: 'بعبارة بين علامتي تنصيص، مثل **"{x}"**',
  },
}
/**
 * "Where does X happen?" in any of the six languages: the commands' `where` words (commands.json) and the forms they miss
 * ("Où Jonas a-t-il…", "Ayat mana…", "على أي آية"). Such a question gets the verse it happens in first.
 */
const WHERE = /(?<!\p{L})(?:where|which verse|what verse|in which|d[óo]nde|en qu[eé] vers[íi]culo|où|quel verset|di ?mana|ayat (?:mana|berapa))(?!\p{L})|कहाँ|कहां|किस पद|أين|أي آية/iu
export const asksWhere = (q: string): boolean => WHERE.test(q)
export const FT = (ui: string): T => TS[ui.split('-')[0]!] ?? TS.en!

/**
 * Nothing fits well: what was searched, and two or three ways to ask (a reference, the rarest word alone, the words as a phrase
 * in quotes), with examples made of the question's own words. `ref`: an example reference (a book the question names, else one
 * the reader knows).
 */
export function noFit(ui: string, words: string[], rarest: string | null, ref: string): { intro: string; info: string } {
  const t = FT(ui)
  if (!words.length) return { intro: t.empty, info: `${t.ways}\n\n- ${t.ref.replace('{x}', ref)}` }
  const ways = [t.ref.replace('{x}', ref)]
  if (rarest) ways.push(t.word.replace('{x}', rarest))
  if (words.length > 1) ways.push(t.phrase.replace('{x}', words.slice(0, 3).join(' ')))
  return { intro: t.none.replace('{all}', words.join(' ')), info: `${t.ways}\n\n${ways.map((w) => `- ${w}`).join('\n')}` }
}
