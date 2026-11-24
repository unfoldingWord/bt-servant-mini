// How to ask (Abel, Nov 16 2026): a short optional guide for someone new, never a gate. Six to ten cards, one screen each (a
// passage; a word or a topic; the Bible Stories, when the phone has them; who is who, when it has a book; families and family trees,
// when it has the people data; places and maps, when it has the place data; following the conversation; saving and notes; without
// typing; more in the menu), each with a "Try it" where it has an example, that
// asks it the way typing it and pressing send does, with the packs on this phone. Every card says that writing in
// your own words works too: the short forms are the fastest way, not the only one.
//
// The examples come from what the installed packs have (the composer's own reading, suggest.ts `understood`, and the notes and
// questions the pack has for that verse), so none of them answers with nothing: the Hindi pack has no notes for Ruth or Jonah,
// so it gets a book it covers. The guide is one of the empty conversation's quick actions (main.ts) and the menu has it too (the
// old one-line invitation is gone; a phone that had it keeps `btsm.howto`, and the welcome is not shown there). Nothing here is counted in the usage counts (usage.ts): opening the guide is no one's business.
import { verseId } from '@bt-synergy/language-pack-v3'
import { CANON, openLang } from './packs'
import { booksOf, type Ctx, firstPack, fillName, helpsKnown, loadHelps, ST, understood } from './suggest'
import { termArticle } from './pipeline'
import { composerOn } from './composer'
import { hasPeople, KT } from './kin'
import { placePacks } from './places'
import { PLT } from './placetext'
import { followTitle, FOLLOW_TYPES } from './followtype'
import { onlineAvailable } from './online'
import { bidiLabel, rtlLang } from './bidi'
import { backLabel, GT } from './graph'
import { XT } from './explore'
import { bookLabel, type Followup } from './converse'
import { hasWho, macBook, MW } from './macula'
import { firstNotedFrame, hasObs, obsLabel } from './obs'
import { ST as SVT } from './saved'

const KEY = 'btsm.howto'

type H = {
  menu: string; step: string; back: string; next: string; done: string; close: string; tryIt: string
  free: string; online: string
  /** the "Open Saved" and "Open the menu" buttons; the "without typing" card without the Bible Stories; the menu card without online AI */
  openSaved: string; openMenu: string; browsePlain: string; menuPlain: string
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
  /**
   * What the people card shows ({k1}..{k4} in its body): the sons of Isaac, his family tree, his ancestors, his descendants. Each is a
   * phrase the kin reader (kin.ts) understands in this language; the first one is what "Try it" sends.
   */
  kinQ: [string, string, string, string]
  /** What the places card shows ({p1}..{p3}): where Jerusalem is, a map of it, what happened there (places.ts reads each). The first is "Try it". */
  placeQ: [string, string, string]
  /** the places card's last sentence when the phone has the Bible Stories ("See on the map" is under their frames too) */
  mapObs: string
  /** the "without typing" card's sentence about the tab of people and places in Browse ({tab}: its name, as Browse shows it) */
  tab: string
}
export type CardId = 'passage' | 'word' | 'obs' | 'who' | 'people' | 'places' | 'follow' | 'save' | 'browse' | 'menu'
// {map} (the button of the conversation map, graph.ts: not a map of places), {back} (with its arrow, → in Arabic), {browse}, {saved}, {treeBtn}
// (the family tree button, kin.ts), {seeMap} (placetext.ts), {structure} (macula.ts), {types} (the follow-up types, followtype.ts), {tab}:
// the names the app shows for them, so the card says what the screen says
const STR: Record<string, H> = {
  en: {
    menu: 'How to ask', step: '{n} of {m}', back: 'Back', next: 'Next',
    done: 'Done', close: 'Close', tryIt: 'Try it',
    free: 'You can also write freely, in your own words: that works too. These short forms are just the fastest way.',
    online: 'Online AI settings',
    openSaved: 'Open Saved', openMenu: 'Open the menu',
    browsePlain: '{browse} shows the Bible book by book, the Translation Academy manuals and the guided modes, which take you step by step.',
    menuPlain: 'In the menu: the pictures of the Bible Stories to keep without internet; in Settings, Safety: a discreet mode and a PIN, if someone might check your phone.',
    cards: {
      passage: ['A passage', 'Write the book, the chapter and the verse. Add a word like “notes” or “questions” to see only that.'],
      word: ['A word or a topic', 'Ask what a word means, or how to translate something. The answer comes from Translation Words and Translation Academy.'],
      obs: ['Bible Stories', 'Write OBS and the number of the story, or of the story and the frame. Each frame comes with its picture and its notes. Tap an underlined word to see its note or its key term, and open the Bible passage the story tells. You can also write "story of" and a name: I suggest the stories.'],
      who: ['Who is who', 'Ask who “he” or “she” is in a verse, or ask for the sentence structure. The answer comes from the original text (Hebrew or Greek) and shows you the words that translate it. Under it, “{structure}” shows how the sentence is built.'],
      people: ['Families and family trees', 'Ask for someone’s family: “{k1}”. For the whole family tree write “{k2}”, or tap “{treeBtn}” under a family answer or under a Translation Words article about a person. “{k3}” and “{k4}” show one direction only. In a tree, tap a name to go to that person.'],
      places: ['Places and maps', 'Ask where a place is: “{p1}”. See it on a map: “{p2}”. Or ask what happened there: “{p3}”. Under a passage, tap “{seeMap}” to see the places it names.'],
      save: ['Save and annotate', 'Tap ☆ to save a verse, an article or an answer, and ✎ to write your note. Everything stays on this phone, in Browse → ☆ {saved}. To send an answer by WhatsApp, use its share button.'],
      follow: ['Follow the conversation', 'After an answer, go on in a few words: I remember the passage. The buttons under every answer take you further. Each has a small icon for its kind, and they are grouped by kind: “More” shows the rest under their titles ({types}). The “{map}” button next to {browse} opens the conversation map (not a map of places): it, or “{back}”, takes you back to any earlier point of the conversation. A long answer comes in parts: move through them with ◀ ▶.'],
      browse: ['Without typing', '{browse} shows the Bible book by book, the Bible Stories, the Translation Academy manuals and the guided modes, which take you step by step.'],
      menu: ['More in the menu', 'In the menu: the pictures of the Bible Stories to keep without internet. In Settings: online AI (optional: with internet, a larger model explains what I find) and Safety: a discreet mode and a PIN, if someone might check your phone.'],
    },
    typing: 'Or start writing a book’s name: the row above the box offers its chapters and verses, and ✓ shows what I understood. Tap it to send.',
    typingOff: 'Typing suggestions are off: turn them on in Menu → Settings (“{toggle}”), and the row above the box will offer chapters and verses as you write.',
    notes: 'notes {ref}', questions: 'questions {ref}', follow: ['next verse', 'and the notes?'], freeQ: 'Explain {ref} in simple words',
    terms: [['What is grace?', 'tw:kt/grace'], ['What is love?', 'tw:kt/love'], ['What is faith?', 'tw:kt/faith']],
    topics: [['How do I translate a metaphor?', 'ta:translate/figs-metaphor'], ['How do I translate an idiom?', 'ta:translate/figs-idiom']],
    kinQ: ['sons of Isaac', 'family tree of Isaac', 'ancestors of Isaac', 'descendants of Isaac'],
    placeQ: ['Where is Jerusalem?', 'map of Jerusalem', 'what happened in Jerusalem'],
    mapObs: ' The same under a frame of the Bible Stories.',
    tab: 'In {browse} there is also a “{tab}” tab: search a name or a place and open its card.',
  },
  es: {
    menu: 'Cómo preguntar', step: '{n} de {m}', back: 'Atrás',
    next: 'Siguiente', done: 'Listo', close: 'Cerrar', tryIt: 'Pruébalo',
    free: 'También puedes escribir libremente, con tus palabras: funciona igual. Estas formas cortas son solo el camino más rápido.',
    online: 'Ajustes de la IA en línea',
    openSaved: 'Abrir Guardados', openMenu: 'Abrir el menú',
    browsePlain: '{browse} muestra la Biblia libro por libro, los manuales de Translation Academy y los modos guiados, que te llevan paso a paso.',
    menuPlain: 'En el menú: las imágenes de las Historias de la Biblia para tenerlas sin internet; en Ajustes, Seguridad: un modo discreto y un PIN, si alguien puede revisar tu teléfono.',
    cards: {
      passage: ['Un pasaje', 'Escribe el libro, el capítulo y el versículo. Añade una palabra como «notas» o «preguntas» para ver solo eso.'],
      word: ['Una palabra o un tema', 'Pregunta qué significa una palabra o cómo traducir algo. La respuesta viene de Translation Words y Translation Academy.'],
      obs: ['Historias de la Biblia', 'Escribe OBS y el número de la historia, o de la historia y el cuadro. Cada cuadro trae su imagen y sus notas. Toca una palabra subrayada para ver su nota o su palabra clave, y abre el pasaje de la Biblia que cuenta la historia. También puedes escribir "historia de" y un nombre: te sugiero las historias.'],
      who: ['Quién es quién', 'Pregunta quién es «él» o «ella» en un versículo, o pide la estructura de la oración. La respuesta sale del texto original (hebreo o griego) y te muestra las palabras que lo traducen. Debajo, «{structure}» muestra cómo está armada la oración.'],
      people: ['Familias y árboles', 'Pregunta por la familia de alguien: «{k1}». Para el árbol de toda la familia escribe «{k2}», o toca «{treeBtn}» bajo una respuesta de familia o bajo un artículo de Translation Words sobre una persona. «{k3}» y «{k4}» muestran un solo sentido. En un árbol, toca un nombre para ir a esa persona.'],
      places: ['Lugares y mapas', 'Pregunta dónde está un lugar: «{p1}». Míralo en un mapa: «{p2}». O pregunta qué pasó allí: «{p3}». Bajo un pasaje, toca «{seeMap}» para ver los lugares que nombra.'],
      save: ['Guarda y anota', 'Toca ☆ para guardar un versículo, un artículo o una respuesta, y ✎ para escribir tu nota. Todo queda en este teléfono, en Explorar → ☆ {saved}. Para mandar una respuesta por WhatsApp, usa su botón de compartir.'],
      follow: ['Sigue la conversación', 'Después de una respuesta, sigue con pocas palabras: recuerdo el pasaje. Los botones bajo cada respuesta te llevan más lejos. Cada uno tiene un icono pequeño de su tipo, y van agrupados por tipo: «Más» muestra el resto bajo sus títulos ({types}). El botón «{map}» junto a {browse} abre el mapa de la conversación (no un mapa de lugares): él, o «{back}», te devuelve a cualquier punto anterior de la conversación. Una respuesta larga viene en partes: pasa con ◀ ▶.'],
      browse: ['Sin escribir', '{browse} muestra la Biblia libro por libro, las Historias de la Biblia, los manuales de Translation Academy y los modos guiados, que te llevan paso a paso.'],
      menu: ['Más en el menú', 'En el menú: las imágenes de las Historias de la Biblia para tenerlas sin internet. En Ajustes: la IA en línea (opcional: con internet, un modelo más grande explica lo que encuentro) y Seguridad: un modo discreto y un PIN, si alguien puede revisar tu teléfono.'],
    },
    typing: 'O empieza a escribir el nombre de un libro: la fila sobre el cuadro ofrece sus capítulos y versículos, y ✓ muestra lo que entendí. Tócalo para enviar.',
    typingOff: 'Las sugerencias al escribir están apagadas: actívalas en Menú → Ajustes («{toggle}») y la fila sobre el cuadro te ofrecerá capítulos y versículos mientras escribes.',
    notes: 'notas {ref}', questions: 'preguntas {ref}', follow: ['versículo siguiente', '¿y las notas?'], freeQ: 'Explícame {ref} con palabras sencillas',
    terms: [['¿Qué significa gracia?', 'tw:kt/grace'], ['¿Qué significa amor?', 'tw:kt/love'], ['¿Qué significa fe?', 'tw:kt/faith']],
    topics: [['¿Cómo traduzco una metáfora?', 'ta:translate/figs-metaphor'], ['¿Cómo traduzco una expresión idiomática?', 'ta:translate/figs-idiom']],
    kinQ: ['hijos de Isaac', 'árbol de Isaac', 'antepasados de Isaac', 'descendientes de Isaac'],
    placeQ: ['¿Dónde está Jerusalén?', 'mapa de Jerusalén', '¿Qué pasó en Jerusalén?'],
    mapObs: ' Lo mismo bajo un cuadro de las Historias de la Biblia.',
    tab: 'En {browse} hay además una pestaña «{tab}»: busca un nombre o un lugar y abre su ficha.',
  },
  fr: {
    menu: 'Comment poser une question', step: '{n} sur {m}',
    back: 'Retour', next: 'Suivant', done: 'Terminé', close: 'Fermer', tryIt: 'Essayer',
    free: 'Vous pouvez aussi écrire librement, avec vos mots : cela marche aussi. Ces formes courtes sont seulement le chemin le plus rapide.',
    online: "Réglages de l'IA en ligne",
    openSaved: 'Ouvrir Favoris', openMenu: 'Ouvrir le menu',
    browsePlain: '{browse} montre la Bible livre par livre, les manuels de Translation Academy et les modes guidés, qui vous mènent pas à pas.',
    menuPlain: "Dans le menu : les images des Histoires de la Bible pour les avoir sans internet ; dans Réglages, Sécurité : un mode discret et un code PIN, si quelqu'un peut consulter votre téléphone.",
    cards: {
      passage: ['Un passage', 'Écrivez le livre, le chapitre et le verset. Ajoutez un mot comme « notes » ou « questions » pour ne voir que cela.'],
      word: ['Un mot ou un sujet', 'Demandez ce que signifie un mot, ou comment traduire quelque chose. La réponse vient de Translation Words et de Translation Academy.'],
      obs: ['Histoires de la Bible', "Écrivez OBS et le numéro de l'histoire, ou de l'histoire et de l'image. Chaque image vient avec son illustration et ses notes. Touchez un mot souligné pour voir sa note ou son mot clé, et ouvrez le passage de la Bible que raconte l'histoire. Vous pouvez aussi écrire « histoire de » et un nom : je vous suggère les histoires."],
      who: ['Qui est qui', 'Demandez qui est « il » ou « elle » dans un verset, ou la structure de la phrase. La réponse vient du texte original (hébreu ou grec) et vous montre les mots qui le traduisent. Dessous, « {structure} » montre comment la phrase est construite.'],
      people: ['Familles et arbres', 'Demandez la famille de quelqu’un : « {k1} ». Pour l’arbre de toute la famille, écrivez « {k2} », ou touchez « {treeBtn} » sous une réponse sur une famille ou sous un article de Translation Words sur une personne. « {k3} » et « {k4} » ne montrent qu’un sens. Dans un arbre, touchez un nom pour aller à cette personne.'],
      places: ['Lieux et cartes', 'Demandez où se trouve un lieu : « {p1} ». Voyez-le sur une carte : « {p2} ». Ou demandez ce qui s’y est passé : « {p3} ». Sous un passage, touchez « {seeMap} » pour voir les lieux qu’il nomme.'],
      save: ['Enregistrer et annoter', 'Touchez ☆ pour enregistrer un verset, un article ou une réponse, et ✎ pour écrire votre note. Tout reste sur ce téléphone, dans Parcourir → ☆ {saved}. Pour envoyer une réponse par WhatsApp, utilisez son bouton de partage.'],
      follow: ['Suivre la conversation', 'Après une réponse, continuez en quelques mots : je me souviens du passage. Les boutons sous chaque réponse vous mènent plus loin. Chacun a une petite icône de son genre, et ils sont groupés par genre : « Plus » montre le reste sous leurs titres ({types}). Le bouton « {map} » à côté de {browse} ouvre la carte de la conversation (pas une carte de lieux) : lui, ou « {back} », vous ramène à un point précédent de la conversation. Une longue réponse vient en parties : passez de l’une à l’autre avec ◀ ▶.'],
      browse: ['Sans écrire', '{browse} montre la Bible livre par livre, les Histoires de la Bible, les manuels de Translation Academy et les modes guidés, qui vous mènent pas à pas.'],
      menu: ['Plus dans le menu', "Dans le menu : les images des Histoires de la Bible pour les avoir sans internet. Dans Réglages : l'IA en ligne (facultative : avec internet, un modèle plus grand explique ce que je trouve) et Sécurité : un mode discret et un code PIN, si quelqu'un peut consulter votre téléphone."],
    },
    typing: "Ou commencez à écrire le nom d'un livre : la ligne au-dessus de la zone propose ses chapitres et versets, et ✓ montre ce que j'ai compris. Touchez-le pour envoyer.",
    typingOff: 'Les suggestions pendant la saisie sont désactivées : activez-les dans Menu → Réglages (« {toggle} »), et la ligne au-dessus de la zone proposera chapitres et versets pendant que vous écrivez.',
    notes: 'notes {ref}', questions: 'questions {ref}', follow: ['verset suivant', 'et les notes ?'], freeQ: 'Explique {ref} avec des mots simples',
    terms: [['Que signifie grâce ?', 'tw:kt/grace'], ['Que signifie amour ?', 'tw:kt/love'], ['Que signifie foi ?', 'tw:kt/faith']],
    topics: [['Comment traduire une métaphore ?', 'ta:translate/figs-metaphor'], ['Comment traduire une expression idiomatique ?', 'ta:translate/figs-idiom']],
    kinQ: ['fils d’Isaac', 'arbre généalogique d’Isaac', 'ancêtres d’Isaac', 'descendants d’Isaac'],
    placeQ: ['Où est Jérusalem ?', 'carte de Jérusalem', 'que s’est-il passé à Jérusalem ?'],
    mapObs: ' De même sous une image des Histoires de la Bible.',
    tab: 'Dans {browse}, il y a aussi un onglet « {tab} » : cherchez un nom ou un lieu et ouvrez sa fiche.',
  },
  id: {
    menu: 'Cara bertanya', step: '{n} dari {m}', back: 'Kembali',
    next: 'Berikutnya', done: 'Selesai', close: 'Tutup', tryIt: 'Coba',
    free: 'Anda juga bisa menulis bebas dengan kata-kata Anda sendiri: itu juga berhasil. Bentuk singkat ini hanya cara yang paling cepat.',
    online: 'Pengaturan AI daring',
    openSaved: 'Buka Tersimpan', openMenu: 'Buka menu',
    browsePlain: '{browse} menampilkan Alkitab kitab demi kitab, buku panduan Translation Academy, dan mode terpandu yang menuntun Anda selangkah demi selangkah.',
    menuPlain: 'Di menu: gambar Kisah-kisah Alkitab agar tersedia tanpa internet; di Pengaturan, Keamanan: mode diam-diam dan PIN, jika ada yang mungkin memeriksa ponsel Anda.',
    cards: {
      passage: ['Sebuah perikop', 'Tulis kitab, pasal, dan ayatnya. Tambahkan kata seperti «catatan» atau «pertanyaan» untuk melihat itu saja.'],
      word: ['Kata atau topik', 'Tanyakan arti sebuah kata, atau cara menerjemahkan sesuatu. Jawabannya dari Translation Words dan Translation Academy.'],
      obs: ['Kisah-kisah Alkitab', 'Tulis OBS dan nomor kisahnya, atau nomor kisah dan bingkainya. Setiap bingkai disertai gambar dan catatannya. Ketuk kata bergaris bawah untuk melihat catatan atau istilah kuncinya, dan buka perikop Alkitab yang dikisahkan kisah itu. Kamu juga bisa menulis "cerita tentang" dan sebuah nama: aku menyarankan kisah-kisahnya.'],
      who: ['Siapa adalah siapa', 'Tanyakan siapa «dia» dalam sebuah ayat, atau minta struktur kalimatnya. Jawabannya berasal dari teks asli (Ibrani atau Yunani) dan menunjukkan kata-kata yang menerjemahkannya. Di bawahnya, «{structure}» menunjukkan bagaimana kalimat itu tersusun.'],
      people: ['Keluarga dan silsilah', 'Tanyakan keluarga seseorang: «{k1}». Untuk pohon seluruh keluarga, tulis «{k2}», atau ketuk «{treeBtn}» di bawah jawaban tentang keluarga atau di bawah artikel Translation Words tentang seseorang. «{k3}» dan «{k4}» hanya menunjukkan satu arah. Di dalam pohon, ketuk sebuah nama untuk menuju orang itu.'],
      places: ['Tempat dan peta', 'Tanyakan di mana sebuah tempat: «{p1}». Lihat di peta: «{p2}». Atau tanyakan apa yang terjadi di sana: «{p3}». Di bawah sebuah perikop, ketuk «{seeMap}» untuk melihat tempat yang disebutnya.'],
      save: ['Simpan dan beri catatan', 'Ketuk ☆ untuk menyimpan ayat, artikel, atau jawaban, dan ✎ untuk menulis catatan Anda. Semuanya tetap di ponsel ini, di Jelajahi → ☆ {saved}. Untuk mengirim jawaban lewat WhatsApp, pakai tombol bagikannya.'],
      follow: ['Ikuti percakapan', 'Setelah jawaban, lanjutkan dengan beberapa kata: saya ingat perikopnya. Tombol di bawah setiap jawaban membawa Anda lebih jauh. Masing-masing punya ikon kecil menurut jenisnya, dan dikelompokkan menurut jenis: «Lainnya» menampilkan sisanya di bawah judulnya ({types}). Tombol «{map}» di samping {browse} membuka peta percakapan (bukan peta tempat): tombol itu, atau «{back}», membawa Anda kembali ke titik mana pun sebelumnya dalam percakapan. Jawaban yang panjang datang dalam beberapa bagian: berpindahlah dengan ◀ ▶.'],
      browse: ['Tanpa mengetik', '{browse} menampilkan Alkitab kitab demi kitab, Kisah-kisah Alkitab, buku panduan Translation Academy, dan mode terpandu yang menuntun Anda selangkah demi selangkah.'],
      menu: ['Lebih banyak di menu', 'Di menu: gambar Kisah-kisah Alkitab agar tersedia tanpa internet. Di Pengaturan: AI daring (pilihan: dengan internet, model yang lebih besar menjelaskan apa yang saya temukan) dan Keamanan: mode diam-diam dan PIN, jika ada yang mungkin memeriksa ponsel Anda.'],
    },
    typing: 'Atau mulai tulis nama kitab: baris di atas kotak menawarkan pasal dan ayatnya, dan ✓ menunjukkan apa yang saya pahami. Ketuk untuk mengirim.',
    typingOff: 'Saran saat mengetik sedang mati: aktifkan di Menu → Pengaturan («{toggle}»), lalu baris di atas kotak akan menawarkan pasal dan ayat saat Anda menulis.',
    notes: 'catatan {ref}', questions: 'pertanyaan {ref}', follow: ['ayat berikutnya', 'dan catatannya?'], freeQ: 'Jelaskan {ref} dengan kata-kata sederhana',
    terms: [['Apa arti kasih karunia?', 'tw:kt/grace'], ['Apa arti iman?', 'tw:kt/faith'], ['Apa arti kasih?', 'tw:kt/love']],
    topics: [['Bagaimana menerjemahkan metafora?', 'ta:translate/figs-metaphor'], ['Bagaimana menerjemahkan ungkapan?', 'ta:translate/figs-idiom']],
    kinQ: ['putra Ishak', 'pohon keluarga Ishak', 'leluhur Ishak', 'keturunan Ishak'],
    placeQ: ['Di mana Yerusalem?', 'peta Yerusalem', 'Apa yang terjadi di Yerusalem?'],
    mapObs: ' Sama di bawah bingkai Kisah-kisah Alkitab.',
    tab: 'Di {browse} ada juga tab «{tab}»: cari sebuah nama atau tempat dan buka kartunya.',
  },
  hi: {
    menu: 'कैसे पूछें', step: '{m} में से {n}', back: 'पीछे', next: 'आगे',
    done: 'हो गया', close: 'बंद करें', tryIt: 'आज़माएँ',
    free: 'आप अपने शब्दों में खुलकर भी लिख सकते हैं: वह भी काम करता है। ये छोटे रूप बस सबसे तेज़ तरीका हैं।',
    online: 'ऑनलाइन AI सेटिंग',
    openSaved: 'सहेजे गए खोलें', openMenu: 'मेनू खोलें',
    browsePlain: '«{browse}» बाइबल को पुस्तक-दर-पुस्तक, Translation Academy की पुस्तिकाएँ और निर्देशित तरीके दिखाता है, जो आपको कदम-दर-कदम ले चलते हैं।',
    menuPlain: 'मेनू में: बाइबल की कहानियों के चित्र जो बिना इंटरनेट रहें; सेटिंग में, सुरक्षा: एक गुप्त मोड और PIN, यदि कोई आपका फ़ोन देख सकता है।',
    cards: {
      passage: ['कोई अंश', 'पुस्तक, अध्याय और पद लिखें। केवल वही देखने के लिए «नोट्स» या «प्रश्न» जैसा शब्द जोड़ें।'],
      word: ['कोई शब्द या विषय', 'पूछें कि किसी शब्द का क्या अर्थ है, या किसी बात का अनुवाद कैसे करें। उत्तर Translation Words और Translation Academy से आता है।'],
      obs: ['बाइबल की कहानियाँ', 'OBS और कहानी का नंबर लिखें, या कहानी और फ़्रेम का नंबर। हर फ़्रेम के साथ उसका चित्र और उसके नोट्स आते हैं। रेखांकित शब्द पर टैप करके उसका नोट या मुख्य शब्द देखें, और वह बाइबल अंश खोलें जिसे कहानी सुनाती है। आप "[नाम] की कहानी" भी लिख सकते हैं: मैं कहानियाँ सुझाऊँगा।'],
      who: ['कौन किसको दर्शाता है', 'पूछें कि किसी पद में «वह» कौन है, या वाक्य की संरचना माँगें। उत्तर मूल पाठ (इब्रानी या यूनानी) से आता है और उसका अनुवाद करने वाले शब्द दिखाता है। उसके नीचे «{structure}» दिखाता है कि वाक्य कैसे बना है।'],
      people: ['परिवार और वंशवृक्ष', 'किसी के परिवार के बारे में पूछें: “{k1}”। पूरे परिवार के वंशवृक्ष के लिए “{k2}” लिखें, या परिवार वाले उत्तर के नीचे, या किसी व्यक्ति के बारे में Translation Words के लेख के नीचे, «{treeBtn}» टैप करें। “{k3}” और “{k4}” केवल एक दिशा दिखाते हैं। वृक्ष में किसी नाम पर टैप करके उस व्यक्ति के पास जाएँ।'],
      places: ['स्थान और नक्शे', 'पूछें कि कोई स्थान कहाँ है: “{p1}”। उसे नक्शे पर देखें: “{p2}”। या पूछें कि वहाँ क्या हुआ: “{p3}”। किसी अंश के नीचे «{seeMap}» टैप करके उसमें आए स्थान देखें।'],
      save: ['सहेजें और नोट लिखें', 'किसी पद, लेख या उत्तर को सहेजने के लिए ☆ टैप करें, और अपना नोट लिखने के लिए ✎। सब कुछ इसी फ़ोन पर रहता है, «{browse}» → ☆ {saved} में। उत्तर को WhatsApp से भेजने के लिए उसका शेयर बटन इस्तेमाल करें।'],
      follow: ['बातचीत जारी रखें', 'उत्तर के बाद कुछ शब्दों में आगे बढ़ें: मुझे अंश याद रहता है। हर उत्तर के नीचे के बटन आपको आगे ले जाते हैं। हर एक पर उसके प्रकार का छोटा चिह्न होता है, और वे प्रकार के अनुसार समूहों में आते हैं: «और» बाकी को उनके शीर्षकों के नीचे दिखाता है ({types})। «{browse}» के पास का «{map}» बटन बातचीत का नक्शा खोलता है (स्थानों का नक्शा नहीं): वह, या «{back}», आपको बातचीत के किसी भी पिछले बिंदु पर लौटा देता है। लंबा उत्तर भागों में आता है: ◀ ▶ से आगे-पीछे जाएँ।'],
      browse: ['बिना लिखे', '«{browse}» बाइबल को पुस्तक-दर-पुस्तक, बाइबल की कहानियाँ, Translation Academy की पुस्तिकाएँ और निर्देशित तरीके दिखाता है, जो आपको कदम-दर-कदम ले चलते हैं।'],
      menu: ['मेनू में और भी', 'मेनू में: बाइबल की कहानियों के चित्र जो बिना इंटरनेट रहें। सेटिंग में: ऑनलाइन AI (वैकल्पिक: इंटरनेट हो तो एक बड़ा मॉडल मेरी ढूँढी जानकारी समझाता है) और सुरक्षा: एक गुप्त मोड और PIN, यदि कोई आपका फ़ोन देख सकता है।'],
    },
    typing: 'या किसी पुस्तक का नाम लिखना शुरू करें: बॉक्स के ऊपर की पंक्ति उसके अध्याय और पद देती है, और ✓ दिखाता है कि मैंने क्या समझा। भेजने के लिए उसे टैप करें।',
    typingOff: 'लिखते समय सुझाव बंद हैं: उन्हें मेनू → सेटिंग («{toggle}») में चालू करें, फिर लिखते समय बॉक्स के ऊपर की पंक्ति अध्याय और पद देगी।',
    notes: '{ref} नोट्स', questions: '{ref} प्रश्न', follow: ['अगला पद', 'और नोट्स?'], freeQ: '{ref} को सरल शब्दों में समझाइए',
    terms: [['प्रेम क्या है?', 'tw:kt/love'], ['पाप क्या है?', 'tw:kt/sin'], ['वाचा क्या है?', 'tw:kt/covenant']],
    topics: [['रूपक का अनुवाद कैसे करें?', 'ta:translate/figs-metaphor'], ['मुहावरे का अनुवाद कैसे करें?', 'ta:translate/figs-idiom']],
    kinQ: ['इसहाक के पुत्र', 'इसहाक का वंशवृक्ष', 'इसहाक के पूर्वज', 'इसहाक के वंशज'],
    placeQ: ['यरूशलेम कहाँ है?', 'यरूशलेम का नक्शा', 'यरूशलेम में क्या हुआ?'],
    mapObs: ' बाइबल की कहानियों के फ़्रेम के नीचे भी यही है।',
    tab: '«{browse}» में एक «{tab}» टैब भी है: कोई नाम या स्थान खोजें और उसका कार्ड खोलें।',
  },
  ar: {
    menu: 'كيف تسأل', step: '{n} من {m}', back: 'السابق', next: 'التالي',
    done: 'تم', close: 'إغلاق', tryIt: 'جرّبه',
    free: 'يمكنك أيضًا أن تكتب بحرية وبكلماتك: هذا ينجح أيضًا. هذه الصيغ القصيرة هي أسرع طريق فقط.',
    online: 'إعدادات الذكاء الاصطناعي عبر الإنترنت',
    openSaved: 'افتح المحفوظات', openMenu: 'افتح القائمة',
    browsePlain: '«{browse}» يعرض الكتاب المقدس سفرًا سفرًا، وأدلة Translation Academy، والمسارات الموجّهة التي تقودك خطوة بخطوة.',
    menuPlain: 'في القائمة: صور قصص الكتاب المقدس لتبقى دون إنترنت؛ وفي الإعدادات، الأمان: وضع متخفٍّ ورمز PIN، إن كان أحد قد يفتّش هاتفك.',
    cards: {
      passage: ['مقطع', 'اكتب السفر والأصحاح والآية. أضف كلمة مثل «ملاحظات» أو «أسئلة» لترى ذلك وحده.'],
      word: ['كلمة أو موضوع', 'اسأل عن معنى كلمة، أو كيف تترجم شيئًا. تأتي الإجابة من Translation Words وTranslation Academy.'],
      obs: ['قصص الكتاب المقدس', 'اكتب OBS ورقم القصة، أو رقم القصة والإطار. لكل إطار صورته وملاحظاته. المس كلمة تحتها خط لترى ملاحظتها أو كلمتها الرئيسية، وافتح مقطع الكتاب المقدس الذي ترويه القصة. يمكنك أيضًا أن تكتب "قصة" واسمًا: أقترح عليك القصص.'],
      who: ['من هو مَن', 'اسأل من هو «هو» أو «هي» في آية، أو اطلب بنية الجملة. تأتي الإجابة من النص الأصلي (العبري أو اليوناني) وتُظهر لك الكلمات التي تترجمه. وتحتها يُظهر «{structure}» كيف بُنيت الجملة.'],
      people: ['العائلات والأشجار', 'اسأل عن عائلة شخص: «{k1}». ولشجرة العائلة كلها اكتب «{k2}»، أو المس «{treeBtn}» تحت إجابة عن عائلة أو تحت مقالة في Translation Words عن شخص. «{k3}» و«{k4}» يعرضان اتجاهًا واحدًا فقط. في الشجرة، المس اسمًا لتنتقل إلى ذلك الشخص.'],
      places: ['الأماكن والخرائط', 'اسأل أين يقع مكان: «{p1}». وشاهده على خريطة: «{p2}». أو اسأل ماذا حدث هناك: «{p3}». تحت مقطع، المس «{seeMap}» لترى الأماكن التي يذكرها.'],
      save: ['احفظ ودوّن', 'المس ☆ لتحفظ آية أو مقالة أو إجابة، و✎ لتكتب ملاحظتك. يبقى كل شيء على هذا الهاتف، في تصفّح ← ☆ {saved}. لإرسال إجابة عبر واتساب، استخدم زر المشاركة.'],
      follow: ['تابع المحادثة', 'بعد الإجابة، تابع ببضع كلمات: أتذكّر المقطع. الأزرار تحت كل إجابة تأخذك أبعد. لكل زر أيقونة صغيرة لنوعه، وهي مجمّعة حسب النوع: «المزيد» يعرض الباقي تحت عناوينها ({types}). زر «{map}» بجانب «{browse}» يفتح خريطة المحادثة (وليست خريطة أماكن): هو، أو «{back}»، يعيدك إلى أي نقطة سابقة من المحادثة. تأتي الإجابة الطويلة على أجزاء: تنقّل بينها بـ ◀ ▶.'],
      browse: ['دون كتابة', '«{browse}» يعرض الكتاب المقدس سفرًا سفرًا، وقصص الكتاب المقدس، وأدلة Translation Academy، والمسارات الموجّهة التي تقودك خطوة بخطوة.'],
      menu: ['المزيد في القائمة', 'في القائمة: صور قصص الكتاب المقدس لتبقى دون إنترنت. وفي الإعدادات: الذكاء الاصطناعي عبر الإنترنت (اختياري) والأمان: وضع متخفٍّ ورمز PIN، إن كان أحد قد يفتّش هاتفك.'],
    },
    typing: 'أو ابدأ بكتابة اسم سفر: يقترح الصف فوق المربع أصحاحاته وآياته، وتُظهر ✓ ما فهمته. المسها للإرسال.',
    typingOff: 'الاقتراحات أثناء الكتابة مطفأة: فعّلها من القائمة ← الإعدادات («{toggle}»)، فيقترح الصف فوق المربع الأصحاحات والآيات أثناء كتابتك.',
    notes: 'ملاحظات {ref}', questions: 'أسئلة {ref}', follow: ['الآية التالية', 'والملاحظات؟'], freeQ: 'اشرح {ref} بكلمات بسيطة',
    terms: [['ما هي المحبة؟', 'tw:kt/love'], ['ما هي الخطيئة؟', 'tw:kt/sin'], ['ما هي النعمة؟', 'tw:kt/grace']],
    topics: [['كيف أترجم الاستعارة؟', 'ta:translate/figs-metaphor'], ['كيف أترجم التعبير الاصطلاحي؟', 'ta:translate/figs-idiom']],
    kinQ: ['أبناء إسحاق', 'شجرة عائلة إسحاق', 'أسلاف إسحاق', 'نسل إسحاق'],
    placeQ: ['أين تقع أورشليم؟', 'خريطة أورشليم', 'ماذا حدث في أورشليم؟'],
    mapObs: ' وكذلك تحت إطار من قصص الكتاب المقدس.',
    tab: 'في «{browse}» توجد أيضًا علامة تبويب «{tab}»: ابحث عن اسم أو مكان وافتح بطاقته.',
  },
}
export const HT = (ui: string): H => STR[ui] ?? STR.en!
export const howtoLabel = (ui: string) => HT(ui).menu
/** The button next to Browse under "what can you do?": opens the guide (main.ts followRow). */
export const howtoStep = (ui: string): Followup => ({ label: HT(ui).menu, howto: true })

// ------------------------------------------------------------------------------------------------------------ remembered

/**
 * Whether How to ask's old invitation line ever showed on this phone (a phone that had it before the welcome and the quick actions
 * keeps `btsm.howto`): the welcome (welcome.ts) is not shown there. The line itself is gone; true when the storage cannot be read.
 */
export function inviteUsed(): boolean {
  try {
    return localStorage.getItem(KEY) !== null
  } catch {
    return true
  }
}
/** "Erase everything" (menu > Safety): the old invitation's mark goes, so a phone handed to someone new is new. */
export function forgetHowto() {
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
  /** the first Open Bible Stories frame with notes ("OBS 1:2"), when the phone has the stories */
  obs: string | null
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
  // an Open Bible Stories frame that has notes, asked as "OBS 1:2" (the app reads it in every language)
  // (the same pack phoneHas asks: the first one on the phone, then English, then the others, so the card and its example agree)
  const fr = await firstNotedFrame(packs[0]!).catch(() => null)
  return {
    ref, chapter, passage: named(ref), notes: fill(s.notes, named(ref)), questions: chapter ? fill(s.questions, named(chapter)) : null,
    follow: s.follow, free: fill(s.freeQ, named(ref)), term, topic, obs: fr ? obsLabel(fr.n, fr.f) : null, book: fillName(ui, ref.split(' ')[0]!),
  }
}

// ---------------------------------------------------------------------------------------------------------- who is who

/** The "who is who" card's example: a verse whose book MACULA has referents for, asked as a sheet (no sentence to be understood in each language). */
export type WhoExample = { label: string; ref: string; what: string[]; lang: string }
/** Verses with pronouns in the MACULA data, in the order they are tried (the first whose book is on the phone and has referents there). */
const WHO = ['rut 2:4', 'jon 1:6', 'mrk 1:7', 'gen 3:6', 'jhn 1:7', 'tit 1:3']
const WHO_MS = 8000
const WHOS = new Map<string, Promise<WhoExample | null>>()
/**
 * The example for "who is who", found when the card is reached and never when the guide opens (reading a big book takes seconds):
 * the answer's own reading (macula.ts macBook, hasWho), here with a longer wait than the answer buttons give it. Null: no verse of
 * the list works with these packs, and the card has no "Try it". Read once per app language and packs.
 */
export function whoExampleOf(ui: string, packs: string[]): Promise<WhoExample | null> {
  const key = `${ui}|${packs.join(',')}`
  let p = WHOS.get(key)
  if (!p) {
    p = findWho(ui, packs).catch(() => null)
    WHOS.set(key, p)
    // (not kept when nothing was found: a pack may be installing)
    p.then((w) => { if (!w && WHOS.get(key) === p) WHOS.delete(key) })
  }
  return p
}
async function findWho(ui: string, packs: string[]): Promise<WhoExample | null> {
  for (const ref of WHO) {
    const [code, cv] = ref.split(' ')
    const [c, v] = cv!.split(':').map(Number)
    for (const l of packs) {
      let mb = null
      try {
        if (!(await openLang(l)).installed(`book:${code}`)) continue
        let timer: ReturnType<typeof setTimeout> | undefined
        const late = new Promise<null>((ok) => { timer = setTimeout(() => ok(null), WHO_MS) })
        mb = await Promise.race([macBook(code!, l), late]).finally(() => clearTimeout(timer))
      } catch { /* the next pack */ }
      if (mb && hasWho(mb, c!, v!)) return { label: MW(ui).whoIn.replace('{ref}', `${bookLabel(ui, code!)} ${c}:${v}`), ref, what: ['who'], lang: l }
      break // the book's data is the same in every pack: the next verse
    }
  }
  return null
}

/**
 * What the phone has that decides the cards: some Open Bible Stories, some book of the Bible (every book brings its MACULA data), people
 * (a pack with the family data: the same index Browse's people tab and the family answers read, kin.ts) and places (a pack with the
 * `geo` table and a place with a point: what Browse's places tab and "See on the map" need, places.ts).
 */
export type PhoneHas = { obs: boolean; books: boolean; people: boolean; places: boolean }
// (until it is read: the conservative set, so a card is added when it arrives and never taken away)
let lastHas: PhoneHas = { obs: false, books: false, people: false, places: false }
export async function phoneHas(packs: string[]): Promise<PhoneHas> {
  const books = (await Promise.all(packs.map(async (l) => {
    try {
      const r = await openLang(l)
      return CANON.some((b) => r.installed(`book:${b}`))
    } catch {
      return false
    }
  }))).some(Boolean)
  const obs = packs[0] ? await hasObs(packs[0]).catch(() => false) : false
  // (each pack alone, the first that has any is enough: a family or a map is asked in whatever pack answers it)
  let people = false, places = false
  for (const l of packs) if (await hasPeople(l).catch(() => false)) { people = true; break }
  for (const l of packs) if ((await placePacks([l]).catch(() => [] as string[])).length) { places = true; break }
  return (lastHas = { obs, books, people, places })
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
  /** "Try it" sends this ready sheet (who is who): no sentence to be understood in each language */
  sheet?: WhoExample
  /** a second button: Browse, the online AI settings, Saved, or the menu */
  extra?: 'browse' | 'online' | 'saved' | 'menu'
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
 * The guide's cards in the app's language, six to ten: always a passage, a word or a topic, following the conversation, saving,
 * without typing and the menu; the Bible Stories card when the phone has them, "who is who" when it has a book (`has`; `who`: its
 * example, found when the card is reached), families and trees when it has the people data, places and maps when it has the place data. The menu card has the online AI settings and its "Try it" only where online AI is available;
 * with the typing suggestions off, the "without typing" card says how to turn them on, and its "Try it" opens Browse.
 */
export function cardsFor(ui: string, ex: Examples | null, online = onlineHere(), typing = typingOn(), has: PhoneHas = lastHas, who: WhoExample | null = null): Card[] {
  const s = HT(ui)
  const words = (t: string) => t.replace('{map}', GT(ui).map).replace('{back}', backLabel(ui, '…')).replace('{browse}', XT(ui).browse)
    .replace('{toggle}', ST(ui).toggle).replace('{saved}', SVT(ui).title).replace('{treeBtn}', KT(ui).treeBtn).replace('{seeMap}', PLT(ui).seeMap)
    .replace('{structure}', MW(ui).tree).replace('{types}', FOLLOW_TYPES.map((t) => followTitle(ui, t)).join(', '))
    .replace(/\{k([1-4])\}/g, (_, i) => s.kinQ[Number(i) - 1]!).replace(/\{p([1-3])\}/g, (_, i) => s.placeQ[Number(i) - 1]!)
  const card = (id: CardId, rest: Omit<Card, 'id' | 'title' | 'body'>, body = s.cards[id][1]): Card => ({ id, title: s.cards[id][0], body: words(body), ...rest })
  const none = { examples: [], ask: [] }
  const out: Card[] = [
    card('passage', ex ? { examples: [ex.passage, ex.notes, ex.questions].filter((x): x is string => !!x), ask: [ex.passage] } : none),
    card('word', { examples: ex ? [ex.term, ex.topic].filter((x): x is string => !!x) : [], ask: ex?.term ? [ex.term] : ex?.topic ? [ex.topic] : [] }),
  ]
  // (a "Try it" only with an example found, so none answers with nothing)
  if (has.obs) out.push(card('obs', ex?.obs ? { examples: [ex.obs], ask: [ex.obs] } : none))
  if (has.books) out.push(card('who', who ? { examples: [who.label], ask: [], sheet: who } : none))
  // families and places: a "Try it" is a real question (the first phrase of each card), answered by the data these cards need
  if (has.people) out.push(card('people', { examples: [...s.kinQ], ask: [s.kinQ[0]] }))
  if (has.places) out.push(card('places', { examples: [...s.placeQ], ask: [s.placeQ[0]] }, s.cards.places[1] + (has.obs ? s.mapObs : '')))
  out.push(
    // a follow-up needs a passage before it: "Try it" asks the passage, then the next verse
    card('follow', ex ? { examples: [...ex.follow], ask: [ex.passage, ex.follow[0]] } : none),
    card('save', { ...none, extra: 'saved' }),
    typing
      ? card('browse', { ...none, ...(ex ? { fill: `${ex.book} ` } : {}), extra: 'browse' }, has.obs ? s.cards.browse[1] : s.browsePlain)
      : card('browse', { ...none, tryBrowse: true }, has.obs ? s.cards.browse[1] : s.browsePlain),
    online ? card('menu', { examples: ex ? [ex.free] : [], ask: ex ? [ex.free] : [], extra: 'online' }) : card('menu', { ...none, extra: 'menu' }, s.menuPlain),
  )
  const b = out.find((c) => c.id === 'browse')!
  // the people and places tab of Browse (its name as Browse shows it: both, one or the other, explore.ts), before the typing sentence
  const tab = has.people && has.places ? XT(ui).peoplePlaces : has.places ? XT(ui).places : XT(ui).people
  const tabs = has.people || has.places ? ` ${words(s.tab).replace('{tab}', tab)}` : ''
  b.body = `${b.body}${tabs} ${words(typing ? s.typing : s.typingOff)}`
  return out
}

// ------------------------------------------------------------------------------------------------------------ the page

export type HowtoHooks = {
  /** the box's text sent as if typed (main.ts: the form's submit); false when it was not taken (an answer on its way, the PIN lock) */
  ask: (q: string) => boolean
  /** an answer is being written: the next question waits */
  busy: () => boolean
  /** the PIN lock is on: nothing is asked */
  locked: () => boolean
  /** the open conversation's id: a second question is not asked in another conversation */
  conv: () => string
  /** writes in the box, without sending (the typing suggestions follow it) */
  type: (text: string) => void
  browse: () => void
  onlineSettings: () => void
  /** Explorar > Guardados, and the menu */
  saved: () => void
  menu: () => void
  /** a ready sheet asked (who is who): `s.lang` is the pack that has the book */
  askSheet: (label: string, s: { ref: string; what: string[]; lang: string }) => boolean
  packs: () => string[]
  helpsLang: () => string | null
}
let atId: CardId | null = null // the card shown: the guide opens again where it was left (until the app is closed)
let poll: ReturnType<typeof setInterval> | null = null
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Whether "Try it" cannot send now: an answer is on its way, or the PIN lock is on. */
const unavailable = (h: HowtoHooks) => h.busy() || h.locked()
/**
 * Asks the questions one after the other, each when the answer before it is done (at most a minute each). Nothing is asked while
 * an answer is on its way or the lock is on, and the next question is dropped if the lock came on or the conversation changed in
 * between (a question belongs to the conversation it started in). False when not all were asked.
 */
export async function askAll(qs: string[], h: HowtoHooks, step = 150): Promise<boolean> {
  if (unavailable(h)) return false
  const id = h.conv()
  for (let i = 0; i < qs.length; i++) {
    if (i > 0) {
      for (let t = 0; h.busy() && t < 400; t++) await sleep(step)
      if (unavailable(h) || h.conv() !== id) return false
    }
    if (!h.ask(qs[i]!)) return false
  }
  return true
}

/** The same, for a ready sheet. */
export async function askSheet(sh: WhoExample, h: HowtoHooks): Promise<boolean> {
  if (unavailable(h)) return false
  return h.askSheet(sh.label, { ref: sh.ref, what: sh.what, lang: sh.lang })
}

/** Closes the guide (Android's back button, Escape, ×); false when it was not open. */
export function closeHowto(): boolean {
  const g = document.querySelector('#howto')
  if (!g) return false
  g.remove()
  for (const q of quiet) q.inert = false
  quiet = []
  document.removeEventListener('keydown', onKey)
  if (poll) clearInterval(poll)
  poll = null
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
  // what the phone has, the examples, and the "who is who" example come after the cards show (the last one only at its card)
  let has = lastHas
  let found: Examples | null = null
  let who: WhoExample | null | undefined
  let whoAsked = false
  const make = () => cardsFor(ui, found, onlineHere(), typingOn(), has, who ?? null)
  let cards = make()
  let at = Math.max(0, cards.findIndex((c) => c.id === (start ?? atId)))
  // a requested card the phone has not added yet (the Bible Stories, who is who): the guide jumps to it when it does, unless the person moved
  let want: CardId | null = start && !cards.some((c) => c.id === start) ? start : null
  /** The cards again with what arrived; the card on screen stays. */
  const refresh = () => {
    const id = cards[at]?.id
    cards = make()
    const w = want ? cards.findIndex((c) => c.id === want) : -1
    const i = w >= 0 ? w : cards.findIndex((c) => c.id === id)
    if (w >= 0) want = null
    if (i >= 0) at = i
    draw()
  }
  const btn = (k: string, text: string, on: () => void, cls: string) => {
    const b = button(text, on, cls)
    b.dataset.k = k
    return b
  }
  /** `toTitle`: the card changed (Next, Back): the focus goes to its title, so a screen reader reads the new card. */
  const draw = (toTitle = false) => {
    at = Math.min(at, cards.length - 1)
    const c = cards[at]!
    atId = c.id
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
    if (c.ask.length || c.fill || c.tryBrowse || c.sheet) {
      const go = btn('try', s.tryIt, () => {
        // (what sends waits for no one: while an answer is on its way or the lock is on the button is off)
        if ((c.ask.length || c.sheet) && unavailable(h)) return
        closeHowto()
        if (c.fill) h.type(c.fill)
        else if (c.tryBrowse) h.browse()
        else if (c.sheet) void askSheet(c.sheet, h)
        else void askAll(c.ask, h)
      }, 'primary')
      go.disabled = !!(c.ask.length || c.sheet) && unavailable(h)
      acts.appendChild(go)
    }
    if (c.extra === 'saved') acts.appendChild(btn('extra', s.openSaved, () => { closeHowto(); h.saved() }, 'secondary'))
    if (c.extra === 'menu') acts.appendChild(btn('extra', s.openMenu, () => { closeHowto(); h.menu() }, 'secondary'))
    if (c.extra === 'browse') acts.appendChild(btn('extra', XT(ui).browse, () => { closeHowto(); h.browse() }, 'secondary'))
    if (c.extra === 'online') acts.appendChild(btn('extra', s.online, () => { closeHowto(); h.onlineSettings() }, 'secondary'))
    if (acts.childElementCount) box.appendChild(acts)
    box.appendChild(el('p', 'howto-free', s.free))
    const nav = el('div', 'howto-nav')
    const prev = btn('back', s.back, () => { want = null; at--; draw(true) }, 'secondary')
    prev.disabled = at === 0
    const last = at === cards.length - 1
    nav.append(prev, btn('next', last ? s.done : s.next, () => {
      if (last) { atId = null; closeHowto() } else { want = null; at++; draw(true) }
    }, 'primary'))
    box.appendChild(nav)
    const again = !toTitle && key ? box.querySelector<HTMLElement>(`[data-k="${key}"]:not(:disabled)`) : null
    if (toTitle || was) (again ?? t).focus({ preventScroll: true })
    // "who is who" reads a book: its example is looked for when its card is reached, never when the guide opens
    if (c.id === 'who' && !whoAsked) {
      whoAsked = true
      whoExampleOf(ui, h.packs()).then((w) => {
        who = w
        if (wrap.isConnected && w) refresh()
      }).catch(() => {})
    }
  }
  draw()
  box.focus({ preventScroll: true })
  // the buttons that send follow the chat: off while an answer is on its way or the lock is on, on again when it is done
  poll = setInterval(() => {
    const go = box.querySelector<HTMLButtonElement>('[data-k="try"]')
    const sends = !!(cards[at]?.ask.length || cards[at]?.sheet)
    if (go && sends) go.disabled = unavailable(h)
  }, 400)
  // what the phone has decides which cards there are (a moment, no book is read); the examples come from the packs (a book is
  // read): the cards show at once, their examples a moment later
  phoneHas(h.packs()).then((x) => {
    has = x
    if (wrap.isConnected) refresh()
  }).catch(() => {})
  examplesOf(ui, h.packs(), h.helpsLang()).then((ex) => {
    if (!wrap.isConnected || !ex) return
    found = ex
    refresh()
  }).catch(() => {})
}
