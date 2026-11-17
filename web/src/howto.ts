// How to ask (Abel, Nov 16 2026): a short optional guide for someone new, never a gate. Five cards, one screen each (a passage;
// a word or a topic; following the conversation; without typing; online AI where the app has it), each with a "Try it" that
// asks its example the way typing it and pressing send does, with the packs on this phone. Every card says that writing in
// your own words works too: the short forms are the fastest way, not the only one.
//
// The examples come from what the installed packs have (the composer's own reading, suggest.ts `understood`, and the notes and
// questions the pack has for that verse), so none of them answers with nothing: the Hindi pack has no notes for Ruth or Jonah,
// so it gets a book it covers. A one-line invitation shows in the welcome on at most 3 occasions (empty conversations
// or app starts), and never again once tapped or dismissed (`btsm.howto`: how many times it showed, or "done"); the menu has the
// guide for good. Nothing here is counted in the usage counts (usage.ts): opening the guide is no one's business.
import { verseId } from '@bt-synergy/language-pack-v3'
import { openLang } from './packs'
import { booksOf, type Ctx, firstPack, fillName, helpsKnown, loadHelps, ST, understood } from './suggest'
import { termArticle } from './pipeline'
import { composerOn } from './composer'
import { onlineAvailable } from './online'
import { bidiLabel, rtlLang } from './bidi'
import { backLabel, GT } from './graph'
import { XT } from './explore'

const KEY = 'btsm.howto'

type H = {
  menu: string; invite: string; dismiss: string; step: string; back: string; next: string; done: string; close: string; tryIt: string
  free: string; online: string
  cards: Record<CardId, [string, string]>
  /** the "without typing" card's second half: the typing suggestions, or how to turn them on ({toggle}: its name in the menu) */
  typing: string; typingOff: string
  /** how a verse's notes and a chapter's questions are asked for, the reference where {ref} is */
  notes: string; questions: string
  /** follow-ups: "next verse", "and the notes?" */
  follow: [string, string]
  /** a free question about the passage, for the online AI card */
  freeQ: string
  /** a word's meaning (each with the article it names, tried in order until the pack has one), and a translation topic */
  terms: [string, string][]; topics: [string, string][]
}
export type CardId = 'passage' | 'word' | 'follow' | 'browse' | 'online'
// {map}, {back} (with its arrow, → in Arabic), {browse}: the names the app shows for them (graph.ts, explore.ts), so the card says what the screen says
const STR: Record<string, H> = {
  en: {
    menu: 'How to ask', invite: 'New here? See how to ask (1 min)', dismiss: 'Dismiss', step: '{n} of {m}', back: 'Back', next: 'Next',
    done: 'Done', close: 'Close', tryIt: 'Try it',
    free: 'You can also write freely, in your own words: that works too. These short forms are just the fastest way.',
    online: 'Online AI settings',
    cards: {
      passage: ['A passage', 'Write the book, the chapter and the verse. Add a word like “notes” or “questions” to see only that.'],
      word: ['A word or a topic', 'Ask what a word means, or how to translate something. The answer comes from Translation Words and Translation Academy.'],
      follow: ['Follow the conversation', 'After an answer, go on in a few words: I remember the passage. The buttons under every answer take you further, and the {map} or “{back}” takes you back to any earlier point.'],
      browse: ['Without typing', '{browse} shows the Bible book by book, and the Translation Academy manuals.'],
      online: ['Online AI (optional)', 'Turn on online AI in the menu. With internet, a larger model also explains what I find, and longer questions in your own words work better. Without internet, the phone answers as usual.'],
    },
    typing: 'Or start writing a book’s name: the row above the box offers its chapters and verses, and ✓ shows what I understood. Tap it to send.',
    typingOff: 'Typing suggestions are off: turn them on in the menu (“{toggle}”), and the row above the box will offer chapters and verses as you write.',
    notes: 'notes {ref}', questions: 'questions {ref}', follow: ['next verse', 'and the notes?'], freeQ: 'Explain {ref} in simple words',
    terms: [['What is grace?', 'tw:kt/grace'], ['What is love?', 'tw:kt/love'], ['What is faith?', 'tw:kt/faith']],
    topics: [['How do I translate a metaphor?', 'ta:translate/figs-metaphor'], ['How do I translate an idiom?', 'ta:translate/figs-idiom']],
  },
  es: {
    menu: 'Cómo preguntar', invite: '¿Primera vez aquí? Mira cómo preguntar (1 min)', dismiss: 'Descartar', step: '{n} de {m}', back: 'Atrás',
    next: 'Siguiente', done: 'Listo', close: 'Cerrar', tryIt: 'Pruébalo',
    free: 'También puedes escribir libremente, con tus palabras: funciona igual. Estas formas cortas son solo el camino más rápido.',
    online: 'Ajustes de la IA en línea',
    cards: {
      passage: ['Un pasaje', 'Escribe el libro, el capítulo y el versículo. Añade una palabra como «notas» o «preguntas» para ver solo eso.'],
      word: ['Una palabra o un tema', 'Pregunta qué significa una palabra o cómo traducir algo. La respuesta viene de Translation Words y Translation Academy.'],
      follow: ['Sigue la conversación', 'Después de una respuesta, sigue con pocas palabras: recuerdo el pasaje. Los botones bajo cada respuesta te llevan más lejos, y el {map} o «{back}» te devuelve a cualquier punto anterior.'],
      browse: ['Sin escribir', '{browse} muestra la Biblia libro por libro y los manuales de Translation Academy.'],
      online: ['IA en línea (opcional)', 'Activa la IA en línea en el menú. Con internet, un modelo más grande además explica lo que encuentro, y las preguntas largas con tus palabras funcionan mejor. Sin internet, el teléfono responde como siempre.'],
    },
    typing: 'O empieza a escribir el nombre de un libro: la fila sobre el cuadro ofrece sus capítulos y versículos, y ✓ muestra lo que entendí. Tócalo para enviar.',
    typingOff: 'Las sugerencias al escribir están apagadas: actívalas en el menú («{toggle}») y la fila sobre el cuadro te ofrecerá capítulos y versículos mientras escribes.',
    notes: 'notas {ref}', questions: 'preguntas {ref}', follow: ['versículo siguiente', '¿y las notas?'], freeQ: 'Explícame {ref} con palabras sencillas',
    terms: [['¿Qué significa gracia?', 'tw:kt/grace'], ['¿Qué significa amor?', 'tw:kt/love'], ['¿Qué significa fe?', 'tw:kt/faith']],
    topics: [['¿Cómo traduzco una metáfora?', 'ta:translate/figs-metaphor'], ['¿Cómo traduzco una expresión idiomática?', 'ta:translate/figs-idiom']],
  },
  fr: {
    menu: 'Comment poser une question', invite: 'Nouveau ici ? Voyez comment poser une question (1 min)', dismiss: 'Ignorer', step: '{n} sur {m}',
    back: 'Retour', next: 'Suivant', done: 'Terminé', close: 'Fermer', tryIt: 'Essayer',
    free: 'Vous pouvez aussi écrire librement, avec vos mots : cela marche aussi. Ces formes courtes sont seulement le chemin le plus rapide.',
    online: "Réglages de l'IA en ligne",
    cards: {
      passage: ['Un passage', 'Écrivez le livre, le chapitre et le verset. Ajoutez un mot comme « notes » ou « questions » pour ne voir que cela.'],
      word: ['Un mot ou un sujet', 'Demandez ce que signifie un mot, ou comment traduire quelque chose. La réponse vient de Translation Words et de Translation Academy.'],
      follow: ['Suivre la conversation', 'Après une réponse, continuez en quelques mots : je me souviens du passage. Les boutons sous chaque réponse vous mènent plus loin, et la {map} ou « {back} » vous ramène à un point précédent.'],
      browse: ['Sans écrire', '{browse} montre la Bible livre par livre, et les manuels de Translation Academy.'],
      online: ['IA en ligne (facultative)', "Activez l'IA en ligne dans le menu. Avec internet, un modèle plus grand explique aussi ce que je trouve, et les longues questions avec vos mots marchent mieux. Sans internet, le téléphone répond comme d'habitude."],
    },
    typing: "Ou commencez à écrire le nom d'un livre : la ligne au-dessus de la zone propose ses chapitres et versets, et ✓ montre ce que j'ai compris. Touchez-le pour envoyer.",
    typingOff: 'Les suggestions pendant la saisie sont désactivées : activez-les dans le menu (« {toggle} »), et la ligne au-dessus de la zone proposera chapitres et versets pendant que vous écrivez.',
    notes: 'notes {ref}', questions: 'questions {ref}', follow: ['verset suivant', 'et les notes ?'], freeQ: 'Explique {ref} avec des mots simples',
    terms: [['Que signifie grâce ?', 'tw:kt/grace'], ['Que signifie amour ?', 'tw:kt/love'], ['Que signifie foi ?', 'tw:kt/faith']],
    topics: [['Comment traduire une métaphore ?', 'ta:translate/figs-metaphor'], ['Comment traduire une expression idiomatique ?', 'ta:translate/figs-idiom']],
  },
  id: {
    menu: 'Cara bertanya', invite: 'Baru di sini? Lihat cara bertanya (1 menit)', dismiss: 'Abaikan', step: '{n} dari {m}', back: 'Kembali',
    next: 'Berikutnya', done: 'Selesai', close: 'Tutup', tryIt: 'Coba',
    free: 'Anda juga bisa menulis bebas dengan kata-kata Anda sendiri: itu juga berhasil. Bentuk singkat ini hanya cara yang paling cepat.',
    online: 'Pengaturan AI daring',
    cards: {
      passage: ['Sebuah perikop', 'Tulis kitab, pasal, dan ayatnya. Tambahkan kata seperti «catatan» atau «pertanyaan» untuk melihat itu saja.'],
      word: ['Kata atau topik', 'Tanyakan arti sebuah kata, atau cara menerjemahkan sesuatu. Jawabannya dari Translation Words dan Translation Academy.'],
      follow: ['Ikuti percakapan', 'Setelah jawaban, lanjutkan dengan beberapa kata: saya ingat perikopnya. Tombol di bawah setiap jawaban membawa Anda lebih jauh, dan {map} atau «{back}» membawa Anda kembali ke titik mana pun sebelumnya.'],
      browse: ['Tanpa mengetik', '{browse} menampilkan Alkitab kitab demi kitab, dan buku panduan Translation Academy.'],
      online: ['AI daring (pilihan)', 'Aktifkan AI daring di menu. Dengan internet, model yang lebih besar juga menjelaskan apa yang saya temukan, dan pertanyaan panjang dengan kata-kata Anda bekerja lebih baik. Tanpa internet, ponsel menjawab seperti biasa.'],
    },
    typing: 'Atau mulai tulis nama kitab: baris di atas kotak menawarkan pasal dan ayatnya, dan ✓ menunjukkan apa yang saya pahami. Ketuk untuk mengirim.',
    typingOff: 'Saran saat mengetik sedang mati: aktifkan di menu («{toggle}»), lalu baris di atas kotak akan menawarkan pasal dan ayat saat Anda menulis.',
    notes: 'catatan {ref}', questions: 'pertanyaan {ref}', follow: ['ayat berikutnya', 'dan catatannya?'], freeQ: 'Jelaskan {ref} dengan kata-kata sederhana',
    terms: [['Apa arti kasih karunia?', 'tw:kt/grace'], ['Apa arti iman?', 'tw:kt/faith'], ['Apa arti kasih?', 'tw:kt/love']],
    topics: [['Bagaimana menerjemahkan metafora?', 'ta:translate/figs-metaphor'], ['Bagaimana menerjemahkan ungkapan?', 'ta:translate/figs-idiom']],
  },
  hi: {
    menu: 'कैसे पूछें', invite: 'नए हैं? देखें कैसे पूछें (1 मिनट)', dismiss: 'हटाएँ', step: '{m} में से {n}', back: 'पीछे', next: 'आगे',
    done: 'हो गया', close: 'बंद करें', tryIt: 'आज़माएँ',
    free: 'आप अपने शब्दों में खुलकर भी लिख सकते हैं: वह भी काम करता है। ये छोटे रूप बस सबसे तेज़ तरीका हैं।',
    online: 'ऑनलाइन AI सेटिंग',
    cards: {
      passage: ['कोई अंश', 'पुस्तक, अध्याय और पद लिखें। केवल वही देखने के लिए «नोट्स» या «प्रश्न» जैसा शब्द जोड़ें।'],
      word: ['कोई शब्द या विषय', 'पूछें कि किसी शब्द का क्या अर्थ है, या किसी बात का अनुवाद कैसे करें। उत्तर Translation Words और Translation Academy से आता है।'],
      follow: ['बातचीत जारी रखें', 'उत्तर के बाद कुछ शब्दों में आगे बढ़ें: मुझे अंश याद रहता है। हर उत्तर के नीचे के बटन आपको आगे ले जाते हैं, और {map} या «{back}» आपको किसी भी पिछले बिंदु पर लौटा देता है।'],
      browse: ['बिना लिखे', '«{browse}» बाइबल को पुस्तक-दर-पुस्तक, और Translation Academy की पुस्तिकाएँ दिखाता है।'],
      online: ['ऑनलाइन AI (वैकल्पिक)', 'मेनू में ऑनलाइन AI चालू करें। इंटरनेट हो तो एक बड़ा मॉडल मेरी ढूँढी जानकारी समझाता भी है, और अपने शब्दों में लंबे प्रश्न बेहतर चलते हैं। बिना इंटरनेट के फ़ोन सामान्य रूप से उत्तर देता है।'],
    },
    typing: 'या किसी पुस्तक का नाम लिखना शुरू करें: बॉक्स के ऊपर की पंक्ति उसके अध्याय और पद देती है, और ✓ दिखाता है कि मैंने क्या समझा। भेजने के लिए उसे टैप करें।',
    typingOff: 'लिखते समय सुझाव बंद हैं: उन्हें मेनू में («{toggle}») चालू करें, फिर लिखते समय बॉक्स के ऊपर की पंक्ति अध्याय और पद देगी।',
    notes: '{ref} नोट्स', questions: '{ref} प्रश्न', follow: ['अगला पद', 'और नोट्स?'], freeQ: '{ref} को सरल शब्दों में समझाइए',
    terms: [['प्रेम क्या है?', 'tw:kt/love'], ['पाप क्या है?', 'tw:kt/sin'], ['वाचा क्या है?', 'tw:kt/covenant']],
    topics: [['रूपक का अनुवाद कैसे करें?', 'ta:translate/figs-metaphor'], ['मुहावरे का अनुवाद कैसे करें?', 'ta:translate/figs-idiom']],
  },
  ar: {
    menu: 'كيف تسأل', invite: 'جديد هنا؟ تعرّف على طريقة السؤال (دقيقة واحدة)', dismiss: 'تجاهل', step: '{n} من {m}', back: 'السابق', next: 'التالي',
    done: 'تم', close: 'إغلاق', tryIt: 'جرّبه',
    free: 'يمكنك أيضًا أن تكتب بحرية وبكلماتك: هذا ينجح أيضًا. هذه الصيغ القصيرة هي أسرع طريق فقط.',
    online: 'إعدادات الذكاء الاصطناعي عبر الإنترنت',
    cards: {
      passage: ['مقطع', 'اكتب السفر والأصحاح والآية. أضف كلمة مثل «ملاحظات» أو «أسئلة» لترى ذلك وحده.'],
      word: ['كلمة أو موضوع', 'اسأل عن معنى كلمة، أو كيف تترجم شيئًا. تأتي الإجابة من Translation Words وTranslation Academy.'],
      follow: ['تابع المحادثة', 'بعد الإجابة، تابع ببضع كلمات: أتذكّر المقطع. الأزرار تحت كل إجابة تأخذك أبعد، و{map} أو «{back}» تعيدك إلى أي نقطة سابقة.'],
      browse: ['دون كتابة', '«{browse}» يعرض الكتاب المقدس سفرًا سفرًا، وأدلة Translation Academy.'],
      online: ['الذكاء الاصطناعي عبر الإنترنت (اختياري)', 'فعّل الذكاء الاصطناعي عبر الإنترنت من القائمة. مع الإنترنت يشرح نموذج أكبر أيضًا ما أجده، وتنجح الأسئلة الطويلة بكلماتك على نحو أفضل. دون إنترنت يجيب الهاتف كالمعتاد.'],
    },
    typing: 'أو ابدأ بكتابة اسم سفر: يقترح الصف فوق المربع أصحاحاته وآياته، وتُظهر ✓ ما فهمته. المسها للإرسال.',
    typingOff: 'الاقتراحات أثناء الكتابة مطفأة: فعّلها من القائمة («{toggle}»)، فيقترح الصف فوق المربع الأصحاحات والآيات أثناء كتابتك.',
    notes: 'ملاحظات {ref}', questions: 'أسئلة {ref}', follow: ['الآية التالية', 'والملاحظات؟'], freeQ: 'اشرح {ref} بكلمات بسيطة',
    terms: [['ما هي المحبة؟', 'tw:kt/love'], ['ما هي الخطيئة؟', 'tw:kt/sin'], ['ما هي النعمة؟', 'tw:kt/grace']],
    topics: [['كيف أترجم الاستعارة؟', 'ta:translate/figs-metaphor'], ['كيف أترجم التعبير الاصطلاحي؟', 'ta:translate/figs-idiom']],
  },
}
export const HT = (ui: string): H => STR[ui] ?? STR.en!
export const howtoLabel = (ui: string) => HT(ui).menu

// ------------------------------------------------------------------------------------------------------------ remembered

/** The occasions the invitation shows on, at most (decided Nov 16): then it goes by itself. */
export const INVITE_MAX = 3
// tapped or dismissed in this run: kept here too, so a storage that cannot be written does not bring the line back
let ended = false
// the occasions counted in this run (a conversation drawn again is the same occasion)
const counted = new Set<string>()
// (the occasions of this run count too: a storage that reads but does not write still stops it after INVITE_MAX)
const shownTimes = (): number => {
  const v = localStorage.getItem(KEY)
  return v === 'done' ? Infinity : Math.max(Number(v) || 0, counted.size)
}
/** Whether the welcome shows the invitation on this occasion (a conversation's id; a new run counts it again). */
export function inviteDue(occasion = ''): boolean {
  if (ended) return false
  try {
    const n = shownTimes()
    return n < INVITE_MAX || (n === INVITE_MAX && counted.has(occasion)) // the third one stays while it is on screen
  } catch {
    return false // no storage: better never than every time
  }
}
/** The invitation showed on this occasion: counted once per occasion and run. */
export function inviteShown(occasion: string) {
  if (counted.has(occasion)) return
  let n = 0
  try {
    n = shownTimes()
  } catch {}
  counted.add(occasion)
  try {
    localStorage.setItem(KEY, String(Math.max(n + 1, counted.size)))
  } catch {}
}
/** Whether the invitation ever showed, or was ended, on this phone (welcome.ts: the welcome takes its slot only before); true when the storage cannot be read. */
export function inviteUsed(): boolean {
  if (ended || counted.size) return true
  try {
    return localStorage.getItem(KEY) !== null
  } catch {
    return true
  }
}
/** Tapped, dismissed, or the guide opened from the menu: never again. */
export function endInvite() {
  ended = true
  try {
    localStorage.setItem(KEY, 'done')
  } catch {}
}
/** "Erase everything" (menu > Safety): a phone handed to someone new shows the invitation again. */
export function forgetHowto() {
  ended = false
  counted.clear()
  try {
    localStorage.removeItem(KEY)
  } catch {}
}

// ------------------------------------------------------------------------------------------------------------- examples

/** The cards' questions, as typed: each one read by the router to what its card says, with the packs on this phone. */
export type Examples = {
  /** the verse and the chapter they are about ("rut 2:3", "jon 1") */
  ref: string; chapter: string | null
  passage: string; notes: string; questions: string | null; follow: [string, string]; free: string
  term: string | null; topic: string | null
  /** the book's name as the composer writes it, for "start writing a book's name" */
  book: string
}
/** Verses with notes in most packs, in the order they are tried (Ruth 2:3 first, as Abel wrote the guide). */
const VERSES = ['rut 2:3', 'jon 1:3', 'tit 1:1', 'mrk 1:1', 'jhn 3:16', 'mat 5:3', 'act 1:8', 'rom 1:1', 'eph 2:8', 'gen 1:1', 'psa 23:1', '3jn 1:4']
const CHAPTERS = ['jon 1', 'rut 1', 'tit 1', 'mrk 1', 'jhn 1', 'mat 5', 'act 1', 'rom 1', 'eph 2', 'gen 1', '3jn 1']
const fill = (t: string, ref: string) => t.replace('{ref}', ref)

/** Whether a pack has `kind` rows (not introductions) for a verse, or for any verse of a chapter (`v` null). */
async function rowsAt(pack: string, code: string, ch: number, v: number | null, kind: 'notes' | 'questions'): Promise<boolean> {
  try {
    const m: any = await (await openLang(pack)).book(code)
    const from = verseId(code, ch, v ?? 0), to = verseId(code, ch, v ?? 999)
    return ((m?.[kind]?.rows ?? []) as any[]).some((x) => !(x.cols?.isIntro === true || x.cols?.isIntro === 'true') && x.from <= to && x.to >= from)
  } catch {
    return false
  }
}
/** The composer's reading of a question (the "✓"), once the books it needs are read: the pack it is answered from. */
async function readAs(text: string, ctx: Ctx) {
  let u = understood(text, ctx)
  for (let i = 0; u?.needs && i < 4; i++) {
    for (const [p, c] of u.needs) await loadHelps(p, c)
    u = understood(text, ctx)
  }
  return u?.has && !u.needs ? u : null
}

/**
 * The examples for the app's language with these packs: a verse the answering pack has notes for, a chapter it has questions
 * for, and a word and a topic whose articles it has. Null when nothing is installed.
 */
export function examplesOf(ui: string, packs: string[], helpsLang: string | null): Promise<Examples | null> {
  // read once per app language, packs and helps language (a phone with only Hindi reads several books to find one with notes)
  const key = `${ui}|${packs.join(',')}|${helpsLang ?? ''}`
  let p = EXAMPLES.get(key)
  if (!p) {
    // nothing found (no pack yet, one still installing, a failed read) is not kept: the next opening looks again
    const found = findExamples(ui, packs, helpsLang).catch(() => null)
    found.then((ex) => { if (!ex && EXAMPLES.get(key) === found) EXAMPLES.delete(key) })
    EXAMPLES.set(key, found)
    p = found
  }
  return p
}
const EXAMPLES = new Map<string, Promise<Examples | null>>()
async function findExamples(ui: string, packs: string[], helpsLang: string | null): Promise<Examples | null> {
  if (!packs.length) return null
  const s = HT(ui)
  const ctx: Ctx = { ui, conv: { last: null }, helpsLang, packs, books: await booksOf(packs) }
  const named = (ref: string) => {
    const [code, cv] = ref.split(' ')
    return `${fillName(ui, code!)} ${cv}`
  }
  // a verse whose notes the answer will show: read as the composer reads it, from the pack it will come from
  let ref: string | null = null
  let from = ''
  const tried = [...VERSES]
  // a pack with none of them: the first verse with notes of its first books
  for (const [, set] of Object.entries(ctx.books ?? {})) for (const b of [...set].slice(0, 6)) tried.push(`${b} 1:1`, `${b} 1:2`, `${b} 1:3`)
  for (const r of tried) {
    const u = await readAs(fill(s.notes, named(r)), ctx)
    const [ch, v] = r.split(' ')[1]!.split(':').map(Number)
    if (u && u.code === r.split(' ')[0] && (await rowsAt(u.pack, u.code, ch!, v!, 'notes'))) {
      ref = r
      from = u.pack
      break
    }
  }
  if (!ref) return null
  // a chapter with questions (the Hindi pack has none: then the card shows no questions example); a book already read without
  // questions is not read again
  let chapter: string | null = null
  for (const c of [ref.split(':')[0]!, ...CHAPTERS]) {
    if (helpsKnown(from, c.split(' ')[0]!)?.questions === false) continue
    const u = await readAs(fill(s.questions, named(c)), ctx)
    if (u && u.code === c.split(' ')[0] && (await rowsAt(u.pack, u.code, Number(c.split(' ')[1]), null, 'questions'))) {
      chapter = c
      break
    }
  }
  // the word and the topic: the first whose article the pack that answers in this language has, and that names that one
  // article only (never "which one do you mean?": "ما هي النعمة؟" names grace and favor)
  const pack = firstPack({ intent: 'unknown', lang: ui } as any, ctx)
  const r = await openLang(pack).catch(() => null)
  const first = async (list: [string, string][], names?: (q: string) => Promise<string | null>) => {
    for (const [q, id] of list) {
      try {
        if ((await r?.article(id))?.data && (!names || (await names(q)) === id)) return q
      } catch { /* the next one */ }
    }
    return null
  }
  const term = await first(s.terms, (q) => termArticle(q, ui))
  // (the topic is not read through academyFor here: it loads every Academy article, over 3 s on a desktop; the tests check
  // that each topic routes to its article)
  const topic = await first(s.topics)
  return {
    ref, chapter, passage: named(ref), notes: fill(s.notes, named(ref)), questions: chapter ? fill(s.questions, named(chapter)) : null,
    follow: s.follow, free: fill(s.freeQ, named(ref)), term, topic, book: fillName(ui, ref.split(' ')[0]!),
  }
}

// ---------------------------------------------------------------------------------------------------------------- cards

export type Card = {
  id: CardId; title: string; body: string
  /** the questions shown as examples */
  examples: string[]
  /** what "Try it" sends, one after the other (each when the answer before it is done); none: no "Try it" */
  ask: string[]
  /** "Try it" writes this in the box instead (the typing suggestions show), and does not send */
  fill?: string
  /** "Try it" opens Browse (the typing suggestions are off) */
  tryBrowse?: true
  /** a second button: Browse, or the online AI settings */
  extra?: 'browse' | 'online'
}
/** Online AI where the app has it (not in the iOS app); never when the page cannot tell (tests, no window). */
export function onlineHere(): boolean {
  try {
    return onlineAvailable()
  } catch {
    return false
  }
}
/** Whether the typing suggestions are on (menu > Typing suggestions); on when the page cannot tell. */
const typingOn = (): boolean => {
  try {
    return composerOn()
  } catch {
    return true
  }
}
/**
 * The guide's cards in the app's language: the online AI card only where online AI is available; with the typing suggestions
 * off, the "without typing" card says how to turn them on, and its "Try it" opens Browse.
 */
export function cardsFor(ui: string, ex: Examples | null, online = onlineHere(), typing = typingOn()): Card[] {
  const s = HT(ui)
  const words = (t: string) => t.replace('{map}', GT(ui).map).replace('{back}', backLabel(ui, '…')).replace('{browse}', XT(ui).browse)
    .replace('{toggle}', ST(ui).toggle)
  const card = (id: CardId, rest: Omit<Card, 'id' | 'title' | 'body'>): Card => ({ id, title: s.cards[id][0], body: words(s.cards[id][1]), ...rest })
  const out: Card[] = [
    card('passage', ex ? { examples: [ex.passage, ex.notes, ex.questions].filter((x): x is string => !!x), ask: [ex.passage] } : { examples: [], ask: [] }),
    card('word', { examples: ex ? [ex.term, ex.topic].filter((x): x is string => !!x) : [], ask: ex?.term ? [ex.term] : ex?.topic ? [ex.topic] : [] }),
    // a follow-up needs a passage before it: "Try it" asks the passage, then the next verse
    card('follow', ex ? { examples: [...ex.follow], ask: [ex.passage, ex.follow[0]] } : { examples: [], ask: [] }),
    typing ? card('browse', { examples: [], ask: [], ...(ex ? { fill: `${ex.book} ` } : {}), extra: 'browse' }) : card('browse', { examples: [], ask: [], tryBrowse: true }),
  ]
  out[3]!.body = `${out[3]!.body} ${words(typing ? s.typing : s.typingOff)}`
  if (online) out.push(card('online', { examples: ex ? [ex.free] : [], ask: ex ? [ex.free] : [], extra: 'online' }))
  return out
}

// ------------------------------------------------------------------------------------------------------------ the page

export type HowtoHooks = {
  /** the box's text sent as if typed (main.ts: the form's submit) */
  ask: (q: string) => void
  /** an answer is being written: the next question waits */
  busy: () => boolean
  /** writes in the box, without sending (the typing suggestions follow it) */
  type: (text: string) => void
  browse: () => void
  onlineSettings: () => void
  packs: () => string[]
  helpsLang: () => string | null
}
let at = 0 // the card shown: the guide opens again where it was left (until the app is closed)
let opener: HTMLElement | null = null
// while the guide is open: the rest of the app is inert (Tab stays in the card), and Escape closes it wherever the focus is
let quiet: HTMLElement[] = []
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && document.querySelector('#howto')) {
    e.preventDefault()
    closeHowto()
  }
}
let hooks: HowtoHooks | null = null
/** main.ts gives the guide its ways into the chat once; then anything may open it (the menu, the welcome). */
export function setHowtoHooks(h: HowtoHooks) {
  hooks = h
}

function el(tag: string, cls = '', text?: string): HTMLElement {
  const d = document.createElement(tag)
  if (cls) d.className = cls
  if (text !== undefined) d.textContent = text
  return d
}
function button(text: string, on: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', cls, text) as HTMLButtonElement
  b.type = 'button'
  b.onclick = on
  return b
}

/** Asks the questions one after the other, each when the answer before it is done (at most a minute each). */
async function askAll(qs: string[], h: HowtoHooks) {
  for (const q of qs) {
    for (let t = 0; h.busy() && t < 400; t++) await new Promise((r) => setTimeout(r, 150))
    if (h.busy()) return
    h.ask(q)
  }
}

/** Closes the guide (Android's back button, Escape, ×); false when it was not open. */
export function closeHowto(): boolean {
  const g = document.querySelector('#howto')
  if (!g) return false
  g.remove()
  for (const q of quiet) q.inert = false
  quiet = []
  document.removeEventListener('keydown', onKey)
  opener?.focus?.({ preventScroll: true })
  opener = null
  return true
}

/**
 * The guide over the chat, at `start` (a card's id), else where it was left. Opening it counts as seeing it: the invitation
 * goes. Needs setHowtoHooks first.
 */
export function openHowTo(ui: string, start?: CardId) {
  const h = hooks
  if (!h) return
  endInvite()
  document.querySelector('.howto-invite')?.remove()
  closeHowto()
  opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
  const s = HT(ui)
  const wrap = el('div', '')
  wrap.id = 'howto'
  wrap.onclick = (e) => { if (e.target === wrap) closeHowto() }
  const box = el('div', 'card')
  box.dir = rtlLang(ui) ? 'rtl' : 'ltr'
  box.setAttribute('role', 'dialog')
  box.setAttribute('aria-modal', 'true')
  box.setAttribute('aria-labelledby', 'howto-t')
  box.tabIndex = -1
  wrap.appendChild(box)
  quiet = ([...document.body.children] as HTMLElement[]).filter((x) => !x.inert && x.id !== 'lock')
  for (const q of quiet) q.inert = true
  document.body.appendChild(wrap)
  document.addEventListener('keydown', onKey)
  let cards = cardsFor(ui, null)
  if (start) at = Math.max(0, cards.findIndex((c) => c.id === start))
  const btn = (k: string, text: string, on: () => void, cls: string) => {
    const b = button(text, on, cls)
    b.dataset.k = k
    return b
  }
  /** `toTitle`: the card changed (Next, Back): the focus goes to its title, so a screen reader reads the new card. */
  const draw = (toTitle = false) => {
    at = Math.min(at, cards.length - 1)
    const c = cards[at]!
    // a redraw drops the focus to the page: it goes back to the same button, or to the title
    const was = document.activeElement instanceof HTMLElement && box.contains(document.activeElement) ? document.activeElement : null
    const key = was?.dataset.k
    box.replaceChildren()
    const head = el('div', 'howto-head')
    head.append(el('span', 'howto-step', s.step.replace('{n}', String(at + 1)).replace('{m}', String(cards.length))))
    const x = btn('x', '×', () => closeHowto(), 'howto-x')
    x.setAttribute('aria-label', s.close)
    head.appendChild(x)
    const t = el('h2', '', c.title)
    t.id = 'howto-t'
    t.tabIndex = -1
    box.append(head, t, el('p', '', bidiLabel(c.body, ui)))
    if (c.examples.length) {
      const ul = el('ul', 'howto-ex')
      for (const q of c.examples) ul.appendChild(el('li', '', bidiLabel(q, ui)))
      box.appendChild(ul)
    }
    const acts = el('div', 'howto-try')
    if (c.ask.length || c.fill || c.tryBrowse) acts.appendChild(btn('try', s.tryIt, () => {
      closeHowto()
      if (c.fill) h.type(c.fill)
      else if (c.tryBrowse) h.browse()
      else void askAll(c.ask, h)
    }, 'primary'))
    if (c.extra === 'browse') acts.appendChild(btn('extra', XT(ui).browse, () => { closeHowto(); h.browse() }, 'secondary'))
    if (c.extra === 'online') acts.appendChild(btn('extra', s.online, () => { closeHowto(); h.onlineSettings() }, 'secondary'))
    if (acts.childElementCount) box.appendChild(acts)
    box.appendChild(el('p', 'howto-free', s.free))
    const nav = el('div', 'howto-nav')
    const prev = btn('back', s.back, () => { at--; draw(true) }, 'secondary')
    prev.disabled = at === 0
    const last = at === cards.length - 1
    nav.append(prev, btn('next', last ? s.done : s.next, () => {
      if (last) { at = 0; closeHowto() } else { at++; draw(true) }
    }, 'primary'))
    box.appendChild(nav)
    const again = !toTitle && key ? box.querySelector<HTMLElement>(`[data-k="${key}"]:not(:disabled)`) : null
    if (toTitle || was) (again ?? t).focus({ preventScroll: true })
  }
  draw()
  box.focus({ preventScroll: true })
  // the examples come from the packs (a book is read): the cards show at once, their examples a moment later
  examplesOf(ui, h.packs(), h.helpsLang()).then((ex) => {
    if (!wrap.isConnected || !ex) return
    cards = cardsFor(ui, ex)
    draw()
  }).catch(() => {})
}

/**
 * What the welcome offers someone new once a language is on the phone: today one line to the guide, on at most INVITE_MAX
 * occasions (`occasion`: the empty conversation it shows in), until it is tapped or dismissed; null after that. One function, called from one place (main.ts renderConv), so a later welcome screen
 * can take this slot whole.
 */
export function offerAfterFirstUse(ui: string, occasion: string): HTMLElement | null {
  if (!inviteDue(occasion) || !hooks) return null
  inviteShown(occasion)
  const s = HT(ui)
  const line = el('div', 'howto-invite')
  line.dir = rtlLang(ui) ? 'rtl' : 'ltr'
  line.appendChild(button(s.invite, () => openHowTo(ui), 'howto-go'))
  const x = button('×', () => {
    endInvite()
    line.remove()
  }, 'howto-x')
  x.setAttribute('aria-label', s.dismiss)
  line.appendChild(x)
  return line
}
