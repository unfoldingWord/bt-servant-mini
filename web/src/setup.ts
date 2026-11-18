// The "About" screen (also shown on first launch), and the menu's Model section: download or load the model. The languages
// (resources.ts) are drawn there; `languagesSection` is the old name main.ts still calls.
import { appVersion, downloadModel, exportModel, isLite, MODEL, modelOff, modelOutdated, modelState, LIMITED, pickModelFile, saveToDownloads, setModelOff } from './model'
import { rtlLang } from './bidi'
import { downloadImages, imagesInstalled, removeImages } from './obsimg'
import { availableLangs, exportPack, importPack, installedLangs, offers, openLang, origin, PACK_NAMES, removeLang } from './packs'
import { resourcesBox } from './resources'

type S = {
  about: string; title: string; body: string[]; version: string; full: string; lite: string; start: string; close: string
  model: string; mReady: string; mMissing: string; mDown: string; mImport: string; mStart: string; mError: string; mOff: string; none: string
  download: string; loadFile: string; share: string; saved: string; langs: string
  failed: string
  setup: string; newer: string; update: string
}
const STR: Record<string, S> = {
  en: {
    about: 'About BT Servant Mini', title: 'BT Servant Mini',
    body: [
      "BT Servant Mini is BT Servant on your phone, **without internet**. It answers from the unfoldingWord translation helps in the language packs on the phone: literal and simplified Bible texts, translation notes, comprehension questions, key terms (Translation Words) and the four Translation Academy manuals.",
      "**What you can ask**\n• A verse or a chapter (Ruth 1:1, Jonah 1): the texts with their notes. Tap a word to see the notes and key terms about it.\n• A word or a name (grace, John the Baptist): its article and the verses that mention it.\n• A free question about a story (Where was Jonah swallowed by the fish?) or just a few words (Jonah fish): the verses that tell it.\n• For help translating (help me translate Jonah 1:3): the notes and the simpler version.",
      "**Short commands (they work even without the model)**\nJonah 1:3 · Jonah 1:3 notes · Jonah 1:3 questions · Jonah intro · Jonah 2 intro · grace · Jonah fish",
      "**Ask or tap.** Write in your own words, or tap. **Browse** (the button next to the text box) opens the Bible by book, chapter and verse, and the Translation Academy manuals by section. While you type, suggestions appear above the box; ✓ sends what you wrote (turn them off in the menu: Typing suggestions). Under every answer, buttons offer the next step. Links in notes and articles open in a panel at the bottom.",
      "**A conversation that follows you.** Go on from the last answer: \"and the notes?\", \"and the next verse?\". The **Map** shows the whole conversation: tap any point to go back there and continue from it; a \"← Back to …\" button takes you back to where you were. Say what you are working on (\"I'm going to translate Ruth\") and the app offers a light path: introduction → sections → key terms → notes → questions. You can ask anything along the way. If the topic moves far away, it offers a new conversation.",
      "**Online AI (optional, on Android and the web).** Turn it on in the menu. With internet, a larger model on a server writes an explanation from the helps the app found. It is marked \"Online AI\", and the helps stay under it as cards, with the sources it cites, so you can check it.",
      "**Sharing and new versions.** The Share button under an answer sends it to another app (WhatsApp…). On Android, the app tells you when a new version is out. It only checks by itself if online AI or usage counts are on; otherwise tap \"Check for a new version\" in the menu.",
      "**Languages.** The app speaks English, Spanish, French, Indonesian, Hindi and Arabic, and you can ask in any of them. The helps come from the language packs on the phone; add more from the menu (from the internet or from a .tcpack file) and share them with others.",
      "**How it differs from BT Servant.** BT Servant (WhatsApp, Telegram, Signal, the web) needs internet and uses a large AI model that talks with you and writes its answers. BT Servant Mini works offline and uses a small model only to understand your question: without online AI, what you read are the helps as they are, never text written by a model. Only the online AI explanation is written by a model, and it is always marked.",
      "This is an alpha version for testing.",
    ],
    version: 'Version', full: 'complete (model and base languages included)', lite: 'light (model and languages added on the phone)',
    start: 'Start', close: 'Close', setup: 'To start, this light version needs the model (once):',
    newer: 'A newer model is available: it understands more questions, in more languages.', update: 'Update the model',
    model: 'Model', mReady: 'Ready', mMissing: 'Not on this phone yet: only references and searches work', mDown: 'Downloading', mImport: 'Loading',
    mStart: 'Starting', mOff: 'Off: references and searches only', none: 'None (references and searches only)', mError: 'Problem', download: 'Download', loadFile: 'Load from a file (SD card, phone memory)', share: 'Share (save to Downloads)',
    saved: 'Saved in Downloads', langs: 'Languages on this phone',
    failed: 'It did not work:',
  },
  es: {
    about: 'Acerca de BT Servant Mini', title: 'BT Servant Mini',
    body: [
      "BT Servant Mini es BT Servant en tu teléfono, **sin internet**. Responde con las ayudas de traducción de unfoldingWord que están en los paquetes de idioma del teléfono: textos bíblicos literal y simplificado, notas de traducción, preguntas de comprensión, palabras clave (Palabras de Traducción) y los cuatro manuales de Translation Academy.",
      "**Qué puedes preguntar**\n• Un versículo o un capítulo (Rut 1:1, Jonás 1): los textos con sus notas. Toca una palabra para ver las notas y palabras clave que hablan de ella.\n• Una palabra o un nombre (gracia, Juan el Bautista): su artículo y los versículos que lo mencionan.\n• Una pregunta libre sobre una historia (¿Dónde fue tragado Jonás por un pez?) o solo unas palabras (Jonás pez): los versículos que la cuentan.\n• Ayuda para traducir (ayúdame a traducir Jonás 1:3): las notas y la versión más sencilla.",
      "**Comandos cortos (funcionan incluso sin el modelo)**\nJonás 1:3 · Jonás 1:3 notas · Jonás 1:3 preguntas · Jonás intro · Jonás 2 intro · gracia · Jonás pez",
      "**Pregunta o toca.** Escribe con tus propias palabras, o toca. **Explorar** (el botón junto a la caja de texto) abre la Biblia por libro, capítulo y versículo, y los manuales de Translation Academy por sección. Mientras escribes, aparecen sugerencias sobre la caja; ✓ envía lo que escribiste (se apagan en el menú: Sugerencias al escribir). Bajo cada respuesta, unos botones proponen el paso siguiente. Los enlaces de notas y artículos se abren en un panel abajo.",
      "**Una conversación que te sigue.** Sigue desde la última respuesta: «¿y las notas?», «¿y el siguiente versículo?». El **Mapa** muestra toda la conversación: toca cualquier punto para volver ahí y seguir desde ese punto; un botón «← Volver a …» te lleva de vuelta adonde estabas. Si dices en qué trabajas («Voy a traducir Rut»), la app te propone un camino ligero: introducción → secciones → palabras clave → notas → preguntas. Puedes preguntar cualquier cosa en el camino. Si el tema se aleja mucho, te ofrece una conversación nueva.",
      "**IA en línea (opcional, en Android y en la web).** Actívala en el menú. Con internet, un modelo más grande en un servidor escribe una explicación a partir de las ayudas que encontró la app. Lleva la marca «IA en línea», y las ayudas quedan debajo como tarjetas, con las fuentes que cita, para que puedas comprobarla.",
      "**Compartir y versiones nuevas.** El botón Compartir bajo una respuesta la envía a otra app (WhatsApp…). En Android, la app te avisa cuando sale una versión nueva. Solo la busca por sí sola si la IA en línea o el conteo de uso están activados; si no, toca «Buscar versión nueva» en el menú.",
      "**Idiomas.** La app habla inglés, español, francés, indonesio, hindi y árabe, y puedes preguntar en cualquiera de ellos. Las ayudas vienen de los paquetes de idioma del teléfono; agrega más desde el menú (de internet o de un archivo .tcpack) y compártelos con otros.",
      "**En qué se diferencia de BT Servant.** BT Servant (WhatsApp, Telegram, Signal, la web) necesita internet y usa un modelo de IA grande que conversa contigo y escribe sus respuestas. BT Servant Mini funciona sin conexión y usa un modelo pequeño solo para entender tu pregunta: sin la IA en línea, lo que lees son las ayudas tal como son, nunca texto escrito por un modelo. Solo la explicación de la IA en línea la escribe un modelo, y siempre va marcada.",
      "Esta es una versión alfa de prueba.",
    ],
    version: 'Versión', full: 'completa (con el modelo y los idiomas base)', lite: 'light (modelo e idiomas se agregan en el teléfono)',
    start: 'Empezar', close: 'Cerrar', setup: 'Para empezar, esta versión light necesita el modelo (una sola vez):',
    newer: 'Hay un modelo más nuevo: entiende más preguntas, en más idiomas.', update: 'Actualizar el modelo',
    model: 'Modelo', mReady: 'Listo', mMissing: 'Aún no está en este teléfono: solo funcionan referencias y búsquedas', mDown: 'Descargando', mImport: 'Cargando',
    mStart: 'Iniciando', mOff: 'Apagado: solo referencias y búsquedas', none: 'Ninguno (solo referencias y búsquedas)', mError: 'Problema', download: 'Descargar', loadFile: 'Cargar desde un archivo (tarjeta SD, memoria)', share: 'Compartir (guardar en Descargas)',
    saved: 'Guardado en Descargas', langs: 'Idiomas en este teléfono',
    failed: 'No funcionó:',
  },
  fr: {
    about: 'À propos de BT Servant Mini', title: 'BT Servant Mini',
    body: [
      "BT Servant Mini, c'est BT Servant sur votre téléphone, **sans internet**. Il répond avec les aides à la traduction d'unfoldingWord contenues dans les paquets de langue du téléphone : textes bibliques littéral et simplifié, notes de traduction, questions de compréhension, termes clés (Translation Words) et les quatre manuels de Translation Academy.",
      "**Ce que vous pouvez demander**\n• Un verset ou un chapitre (Ruth 1:1, Jonas 1) : les textes avec leurs notes. Touchez un mot pour voir les notes et les termes clés qui en parlent.\n• Un mot ou un nom (grâce, Jean-Baptiste) : son article et les versets qui le mentionnent.\n• Une question libre sur un récit (Où Jonas a-t-il été avalé par le poisson ?) ou quelques mots (Jonas poisson) : les versets qui le racontent.\n• De l'aide pour traduire (aide-moi à traduire Jonas 1:3) : les notes et la version simplifiée.",
      "**Commandes courtes (elles marchent même sans le modèle)**\nJonas 1:3 · Jonas 1:3 notes · Jonas 1:3 questions · Jonas intro · Jonas 2 intro · grâce · Jonas poisson",
      "**Demander ou toucher.** Écrivez avec vos propres mots, ou touchez. **Parcourir** (le bouton à côté de la zone de saisie) ouvre la Bible par livre, chapitre et verset, et les manuels de Translation Academy par section. Pendant que vous écrivez, des suggestions apparaissent au-dessus de la zone ; ✓ envoie ce que vous avez écrit (on les désactive dans le menu : Suggestions pendant la saisie). Sous chaque réponse, des boutons proposent l'étape suivante. Les liens des notes et des articles s'ouvrent dans un panneau en bas.",
      "**Une conversation qui vous suit.** Continuez à partir de la dernière réponse : « et les notes ? », « et le verset suivant ? ». La **Carte** montre toute la conversation : touchez un point pour y revenir et continuer à partir de là ; un bouton « ← Revenir à … » vous ramène où vous étiez. Si vous dites sur quoi vous travaillez (« Je vais traduire Ruth »), l'application propose un parcours léger : introduction → sections → mots clés → notes → questions. Vous pouvez poser toute question en chemin. Si le sujet s'éloigne beaucoup, elle propose une nouvelle conversation.",
      "**IA en ligne (facultative, sur Android et sur le web).** Activez-la dans le menu. Avec internet, un modèle plus grand sur un serveur rédige une explication à partir des aides trouvées par l'application. Elle porte la mention « IA en ligne », et les aides restent en dessous sous forme de cartes, avec les sources qu'elle cite, pour que vous puissiez la vérifier.",
      "**Partage et nouvelles versions.** Le bouton Partager sous une réponse l'envoie vers une autre application (WhatsApp…). Sur Android, l'application vous prévient quand une nouvelle version sort. Elle ne vérifie d'elle-même que si l'IA en ligne ou les statistiques d'usage sont activées ; sinon, touchez « Chercher une nouvelle version » dans le menu.",
      "**Langues.** L'application parle anglais, espagnol, français, indonésien, hindi et arabe, et vous pouvez demander dans chacune. Les aides viennent des paquets de langue du téléphone ; ajoutez-en depuis le menu (par internet ou depuis un fichier .tcpack) et partagez-les.",
      "**Ce qui le distingue de BT Servant.** BT Servant (WhatsApp, Telegram, Signal, le web) a besoin d'internet et utilise un grand modèle d'IA qui converse et rédige ses réponses. BT Servant Mini fonctionne hors ligne et n'utilise un petit modèle que pour comprendre votre question : sans l'IA en ligne, vous lisez les aides telles quelles, jamais un texte écrit par un modèle. Seule l'explication de l'IA en ligne est écrite par un modèle, et elle est toujours signalée.",
      "Ceci est une version alpha de test.",
    ],
    version: 'Version', full: 'complète (modèle et langues de base inclus)', lite: 'légère (modèle et langues ajoutés sur le téléphone)',
    start: 'Commencer', close: 'Fermer', setup: 'Pour commencer, cette version légère a besoin du modèle (une seule fois) :',
    newer: 'Un modèle plus récent est disponible : il comprend plus de questions, dans plus de langues.', update: 'Mettre à jour le modèle',
    model: 'Modèle', mReady: 'Prêt', mMissing: 'Pas encore sur ce téléphone : seules les références et recherches fonctionnent', mDown: 'Téléchargement', mImport: 'Chargement',
    mStart: 'Démarrage', mOff: 'Éteint : références et recherches seulement', none: 'Aucun (références et recherches seulement)', mError: 'Problème', download: 'Télécharger', loadFile: 'Charger un fichier (carte SD, mémoire)', share: 'Partager (enregistrer dans Téléchargements)',
    saved: 'Enregistré dans Téléchargements', langs: 'Langues sur ce téléphone',
    failed: 'Échec :',
  },
  // the Indonesian pack has Colossians to Philemon, 2 Peter and 3 John (no Ruth, no Jonah): its examples are Titus and
  // Philemon, and each one finds something on a phone with only that pack (tests/examples-find.test.ts)
  id: {
    about: 'Tentang BT Servant Mini', title: 'BT Servant Mini',
    body: [
      "BT Servant Mini adalah BT Servant di ponsel Anda, **tanpa internet**. Ia menjawab dari alat bantu penerjemahan unfoldingWord yang ada di paket bahasa di ponsel: teks Alkitab harfiah dan sederhana, catatan terjemahan, pertanyaan pemahaman, istilah kunci (Translation Words) dan keempat buku panduan Translation Academy.",
      "**Yang bisa Anda tanyakan**\n• Sebuah ayat atau pasal (Titus 2:11, Filemon 1): teks-teksnya dengan catatannya. Ketuk sebuah kata untuk melihat catatan dan istilah kunci tentang kata itu.\n• Sebuah kata atau nama (anugerah, Yohanes Pembaptis): artikelnya dan ayat-ayat yang menyebutnya.\n• Pertanyaan bebas tentang sebuah kisah (Mengapa Paulus meninggalkan Titus di Kreta?) atau beberapa kata (Titus Kreta): ayat-ayat yang menceritakannya.\n• Bantuan menerjemahkan (bantu saya menerjemahkan Titus 2:11): catatan dan versi yang lebih sederhana.",
      "**Perintah singkat (tetap bekerja tanpa model)**\nTitus 2:11 · Titus 2:11 catatan · Titus 2:11 pertanyaan · Titus intro · Titus 2 intro · kasih karunia · Titus Kreta",
      "**Bertanya atau mengetuk.** Tulis dengan kata-kata Anda sendiri, atau ketuk. **Jelajahi** (tombol di samping kotak ketik) membuka Alkitab per kitab, pasal dan ayat, serta buku panduan Translation Academy per bagian. Saat Anda mengetik, saran muncul di atas kotak; ✓ mengirim apa yang Anda tulis (matikan di menu: Saran saat mengetik). Di bawah setiap jawaban, ada tombol untuk langkah berikutnya. Tautan di catatan dan artikel terbuka di panel bawah.",
      "**Percakapan yang mengikuti Anda.** Lanjutkan dari jawaban terakhir: «dan catatannya?», «dan ayat berikutnya?». **Peta** menampilkan seluruh percakapan: ketuk titik mana pun untuk kembali ke sana dan melanjutkan dari situ; tombol «← Kembali ke …» membawa Anda kembali ke tempat tadi. Jika Anda menyebut apa yang sedang Anda kerjakan («Saya akan menerjemahkan Titus»), aplikasi menawarkan jalur ringan: pengantar → bagian → istilah kunci → catatan → pertanyaan. Anda boleh bertanya apa saja di sepanjang jalan. Jika topiknya sudah jauh berubah, aplikasi menawarkan percakapan baru.",
      "**AI daring (pilihan, di Android dan web).** Aktifkan di menu. Saat ada internet, model yang lebih besar di server menulis penjelasan dari alat bantu yang ditemukan aplikasi. Penjelasan itu diberi tanda «AI daring», dan alat bantunya tetap ada di bawahnya sebagai kartu, dengan sumber yang dikutipnya, supaya Anda bisa memeriksanya.",
      "**Berbagi dan versi baru.** Tombol Bagikan di bawah jawaban mengirimnya ke aplikasi lain (WhatsApp…). Di Android, aplikasi memberi tahu Anda saat ada versi baru. Aplikasi hanya memeriksa sendiri jika AI daring atau hitungan penggunaan aktif; jika tidak, ketuk «Cari versi baru» di menu.",
      "**Bahasa.** Aplikasi ini berbahasa Inggris, Spanyol, Prancis, Indonesia, Hindi dan Arab, dan Anda bisa bertanya dalam bahasa mana pun. Alat bantu berasal dari paket bahasa di ponsel; tambahkan lagi dari menu (dari internet atau dari berkas .tcpack) dan bagikan kepada orang lain.",
      "**Bedanya dengan BT Servant.** BT Servant (WhatsApp, Telegram, Signal, web) memerlukan internet dan memakai model AI besar yang bercakap dan menulis jawabannya. BT Servant Mini bekerja tanpa koneksi dan memakai model kecil hanya untuk memahami pertanyaan Anda: tanpa AI daring, yang Anda baca adalah alat bantu apa adanya, tidak pernah teks tulisan model. Hanya penjelasan AI daring yang ditulis oleh model, dan selalu diberi tanda.",
      "Ini versi alfa untuk uji coba.",
    ],
    version: 'Versi', full: 'lengkap (model dan bahasa dasar sudah ada)', lite: 'ringan (model dan bahasa ditambahkan di ponsel)',
    start: 'Mulai', close: 'Tutup', setup: 'Untuk mulai, versi ringan ini perlu modelnya (sekali saja):',
    newer: 'Ada model yang lebih baru: memahami lebih banyak pertanyaan, dalam lebih banyak bahasa.', update: 'Perbarui model',
    model: 'Model', mReady: 'Siap', mMissing: 'Belum ada di ponsel ini: hanya rujukan dan pencarian yang bekerja', mDown: 'Mengunduh', mImport: 'Memuat',
    mStart: 'Memulai', mOff: 'Mati: hanya rujukan dan pencarian', none: 'Tidak ada (hanya rujukan dan pencarian)', mError: 'Masalah', download: 'Unduh', loadFile: 'Muat dari berkas (kartu SD, memori ponsel)', share: 'Bagikan (simpan ke Unduhan)',
    saved: 'Tersimpan di Unduhan', langs: 'Bahasa di ponsel ini',
    failed: 'Gagal:',
  },
  // the Hindi pack has translation notes only for Acts and no questions: its examples are Acts (not Jonah) and key terms, and
  // each one finds something (tests/examples-find.test.ts)
  hi: {
    about: 'BT Servant Mini के बारे में', title: 'BT Servant Mini',
    body: [
      "BT Servant Mini आपके फ़ोन पर BT Servant है, **बिना इंटरनेट के**। यह फ़ोन के भाषा पैकों में रखे unfoldingWord के अनुवाद सहायक संसाधनों से उत्तर देता है: शाब्दिक और सरल बाइबल पाठ, अनुवाद नोट्स, समझ के प्रश्न, मुख्य शब्द (Translation Words) और Translation Academy की चारों पुस्तिकाएँ।",
      "**आप क्या पूछ सकते हैं**\n• कोई पद या अध्याय (प्रेरितों 1:8, प्रेरितों 2): पाठ और उनके नोट्स। किसी शब्द को छूकर उसके नोट्स और मुख्य शब्द देखें।\n• कोई शब्द या नाम (अनुग्रह, यूहन्ना): उसका लेख और वे पद जिनमें उसका उल्लेख है।\n• किसी कहानी के बारे में खुला प्रश्न (योना को मछली ने कहाँ निगल लिया?): वे पद जो उसे बताते हैं, केवल कोई मुख्य शब्द या संदर्भ नहीं।\n• अनुवाद में सहायता (प्रेरितों 1:8 का अनुवाद करने में मदद करें): नोट्स और सरल संस्करण।",
      "**छोटे आदेश (मॉडल के बिना भी चलते हैं)**\nप्रेरितों 1:8 · प्रेरितों 1:8 नोट्स · प्रेरितों 1:8 मुख्य शब्द · प्रेरितों intro · प्रेरितों 2 intro · अनुग्रह · योना मछली",
      "**पूछें या टैप करें।** अपने शब्दों में लिखें, या टैप करें। **ब्राउज़ करें** (लिखने की जगह के पास वाला बटन) बाइबल को पुस्तक, अध्याय और पद के अनुसार, और Translation Academy की पुस्तिकाओं को खंड के अनुसार खोलता है। लिखते समय ऊपर सुझाव दिखते हैं; ✓ आपका लिखा हुआ भेज देता है (इन्हें मेनू में बंद कर सकते हैं: लिखते समय सुझाव)। हर उत्तर के नीचे के बटन अगला कदम सुझाते हैं। नोट्स और लेखों के लिंक नीचे एक पैनल में खुलते हैं।",
      "**बातचीत जो आपके साथ चलती है।** पिछले उत्तर से आगे पूछें: «और नोट्स?», «और अगला पद?»। **नक्शा** पूरी बातचीत दिखाता है: किसी भी बिंदु पर टैप करके वहाँ लौटें और वहीं से आगे बढ़ें; «← … पर लौटें» बटन आपको वहीं वापस ले जाता है जहाँ आप थे। अगर आप बताएँ कि आप किस पर काम कर रहे हैं («मैं प्रेरितों के काम का अनुवाद करने जा रहा हूँ»), तो ऐप एक हल्का मार्ग सुझाता है: परिचय → खंड → मुख्य शब्द → टिप्पणियाँ। रास्ते में आप कुछ भी पूछ सकते हैं। अगर विषय बहुत दूर चला जाए, तो ऐप नई बातचीत का सुझाव देता है।",
      "**ऑनलाइन AI (वैकल्पिक, Android और वेब पर)।** इसे मेनू में चालू करें। इंटरनेट होने पर, सर्वर पर एक बड़ा मॉडल ऐप को मिली सहायताओं से एक व्याख्या लिखता है। उस पर «ऑनलाइन AI» लिखा होता है, और सहायताएँ उसके नीचे कार्डों के रूप में, उसके बताए स्रोतों के साथ, बनी रहती हैं, ताकि आप उसे जाँच सकें।",
      "**साझा करना और नए संस्करण।** उत्तर के नीचे का «साझा करें» बटन उसे किसी दूसरे ऐप (WhatsApp…) में भेजता है। Android पर नया संस्करण आने पर ऐप आपको बताता है। वह अपने-आप तभी जाँचता है जब ऑनलाइन AI या उपयोग की गिनती चालू हो; नहीं तो मेनू में «नया संस्करण खोजें» पर टैप करें।",
      "**भाषाएँ।** ऐप अंग्रेज़ी, स्पेनिश, फ़्रेंच, इंडोनेशियाई, हिंदी और अरबी में है, और आप इनमें से किसी में भी पूछ सकते हैं। सहायक संसाधन फ़ोन के भाषा पैकों से आते हैं; मेनू से और जोड़ें (इंटरनेट से या .tcpack फ़ाइल से) और दूसरों के साथ साझा करें।",
      "**BT Servant से अंतर।** BT Servant (WhatsApp, Telegram, Signal, वेब) को इंटरनेट चाहिए और वह एक बड़े AI मॉडल का उपयोग करता है जो बात करता है और उत्तर लिखता है। BT Servant Mini बिना इंटरनेट चलता है और छोटा मॉडल केवल आपका प्रश्न समझने के लिए उपयोग करता है: ऑनलाइन AI के बिना आप सहायक संसाधनों को जैसे हैं वैसे ही पढ़ते हैं, मॉडल का लिखा पाठ कभी नहीं। केवल ऑनलाइन AI की व्याख्या मॉडल लिखता है, और उस पर हमेशा निशान होता है।",
      "यह परीक्षण के लिए अल्फ़ा संस्करण है।",
    ],
    version: 'संस्करण', full: 'पूर्ण (मॉडल और मूल भाषाएँ शामिल)', lite: 'हल्का (मॉडल और भाषाएँ फ़ोन पर जोड़ी जाती हैं)',
    start: 'शुरू करें', close: 'बंद करें', setup: 'शुरू करने के लिए इस हल्के संस्करण को मॉडल चाहिए (एक बार):',
    newer: 'एक नया मॉडल उपलब्ध है: यह ज़्यादा प्रश्न, ज़्यादा भाषाओं में समझता है।', update: 'मॉडल अपडेट करें',
    model: 'मॉडल', mReady: 'तैयार', mMissing: 'अभी इस फ़ोन पर नहीं: केवल संदर्भ और खोज चलते हैं', mDown: 'डाउनलोड हो रहा है', mImport: 'लोड हो रहा है',
    mStart: 'शुरू हो रहा है', mOff: 'बंद: केवल संदर्भ और खोज', none: 'कोई नहीं (केवल संदर्भ और खोज)', mError: 'समस्या', download: 'डाउनलोड करें', loadFile: 'फ़ाइल से लोड करें (SD कार्ड, फ़ोन मेमोरी)', share: 'साझा करें (डाउनलोड में सहेजें)',
    saved: 'डाउनलोड में सहेजा गया', langs: 'इस फ़ोन पर भाषाएँ',
    failed: 'नहीं हुआ:',
  },
  ar: {
    about: 'حول BT Servant Mini', title: 'BT Servant Mini',
    body: [
      "BT Servant Mini هو BT Servant على هاتفك، **دون إنترنت**. يجيب من أدوات الترجمة المساعدة من unfoldingWord الموجودة في حزم اللغات على الهاتف: نصوص الكتاب المقدس الحرفية والمبسّطة، وملاحظات الترجمة، وأسئلة الفهم، والكلمات الرئيسية (Translation Words)، وأدلة Translation Academy الأربعة.",
      "**ماذا يمكنك أن تسأل**\n• آية أو أصحاح (راعوث 1: 1، يونان 1): النصوص مع ملاحظاتها. المس كلمة لترى الملاحظات والكلمات الرئيسية عنها.\n• كلمة أو اسم (نعمة، يوحنا): مقالته والآيات التي تذكره.\n• سؤال حرّ عن قصة (أين ابتلع الحوت يونان؟): الآيات التي ترويها، لا مجرد كلمة رئيسية أو شاهد.\n• مساعدة في الترجمة (ساعدني في ترجمة يونان 1: 3): الملاحظات والترجمة الأبسط.",
      "**أوامر قصيرة (تعمل حتى من دون النموذج)**\nيونان 1:3 · يونان 1:3 ملاحظات · يونان 1:3 أسئلة · يونان intro · يونان 2 intro · نعمة · يونان حوت",
      "**اسأل بالكتابة أو باللمس.** اكتب بكلماتك، أو المس الأزرار. زر **تصفّح** (بجانب مربع الكتابة) يفتح الكتاب المقدس حسب السفر والأصحاح والآية، وأدلة Translation Academy حسب القسم. أثناء الكتابة تظهر اقتراحات فوق المربع، والعلامة ✓ ترسل ما كتبته (يمكنك إيقاف الاقتراحات من القائمة: اقتراحات أثناء الكتابة). وتحت كل إجابة أزرار تقترح الخطوة التالية. وتُفتح روابط الملاحظات والمقالات في لوحة أسفل الشاشة.",
      "**محادثة تتابعك.** تابع من آخر إجابة: «والملاحظات؟»، «والآية التالية؟». تعرض **الخريطة** المحادثة كلها: المس أي نقطة لتعود إليها وتتابع من هناك، وزر «→ العودة إلى …» يعيدك إلى حيث كنت. وإذا ذكرت ما تعمل عليه («سأترجم راعوث»)، يقترح عليك التطبيق مسارًا خفيفًا: المقدمة ← المقاطع ← الكلمات الرئيسية ← الملاحظات ← الأسئلة. ويمكنك أن تسأل عن أي شيء في الطريق. وإذا ابتعد الموضوع كثيرًا، يقترح عليك محادثة جديدة.",
      "**الذكاء الاصطناعي عبر الإنترنت (اختياري، على أندرويد والويب).** فعّله من القائمة. عند توفر الإنترنت، يكتب نموذج أكبر على خادم شرحًا من المساعدات التي وجدها التطبيق. ويحمل الشرح علامة «ذكاء اصطناعي عبر الإنترنت»، وتبقى المساعدات تحته على شكل بطاقات مع المصادر التي يستشهد بها، لتتمكن من التحقق منه.",
      "**المشاركة والإصدارات الجديدة.** زر «مشاركة» تحت الإجابة يرسلها إلى تطبيق آخر (واتساب…). وعلى أندرويد، يخبرك التطبيق عند صدور إصدار جديد. ولا يبحث عنه من تلقاء نفسه إلا إذا كان الذكاء الاصطناعي عبر الإنترنت أو إحصاءات الاستخدام مفعّلة؛ وإلا فالمس «البحث عن إصدار جديد» في القائمة.",
      "**اللغات.** التطبيق بالإنجليزية والإسبانية والفرنسية والإندونيسية والهندية والعربية، ويمكنك السؤال بأيّ منها. تأتي الأدوات المساعدة من حزم اللغات على الهاتف؛ أضف المزيد من القائمة (من الإنترنت أو من ملف ‎.tcpack) وشاركها مع الآخرين.",
      "**الفرق عن BT Servant.** يحتاج BT Servant (واتساب، تيليجرام، سيجنال، الويب) إلى الإنترنت ويستخدم نموذج ذكاء اصطناعي كبيرًا يحاورك ويكتب إجاباته. يعمل BT Servant Mini من دون اتصال ويستخدم نموذجًا صغيرًا فقط لفهم سؤالك: من دون الذكاء الاصطناعي عبر الإنترنت، ما تقرؤه هو المساعدات كما هي، وليس أبدًا نصًا كتبه نموذج. ولا يكتب النموذج إلا شرح الذكاء الاصطناعي عبر الإنترنت، وعليه علامة دائمًا.",
      "هذه نسخة ألفا للتجربة.",
    ],
    version: 'الإصدار', full: 'كاملة (النموذج واللغات الأساسية مضمّنة)', lite: 'خفيفة (يُضاف النموذج واللغات على الهاتف)',
    start: 'ابدأ', close: 'إغلاق', setup: 'لتبدأ، تحتاج هذه النسخة الخفيفة إلى النموذج (مرة واحدة):',
    newer: 'يتوفر نموذج أحدث: يفهم أسئلة أكثر بلغات أكثر.', update: 'تحديث النموذج',
    model: 'النموذج', mReady: 'جاهز', mMissing: 'ليس على هذا الهاتف بعد: تعمل المراجع والبحث فقط', mDown: 'جارٍ التنزيل', mImport: 'جارٍ التحميل',
    mStart: 'جارٍ التشغيل', mOff: 'مُطفأ: الشواهد والبحث فقط', none: 'لا شيء (الشواهد والبحث فقط)', mError: 'مشكلة', download: 'تنزيل', loadFile: 'تحميل من ملف (بطاقة SD، ذاكرة الهاتف)', share: 'مشاركة (حفظ في التنزيلات)',
    saved: 'حُفظ في التنزيلات', langs: 'اللغات على هذا الهاتف',
    failed: 'لم ينجح:',
  },
}
/** The packs' names (kept in packs.ts, so code without a page can use them). */
export { PACK_NAMES }
const str = (lang: string): S => STR[lang] ?? STR.en!

function el(tag: string, cls = '', text?: string): HTMLElement {
  const d = document.createElement(tag)
  if (cls) d.className = cls
  if (text !== undefined) d.textContent = text
  return d
}
function btn(text: string, on: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', cls, text) as HTMLButtonElement
  b.type = 'button'
  b.onclick = on
  return b
}
const mb = (n: number) => `${Math.max(1, Math.round(n / 1048576))} MB`

/** The model's state in words. */
export function modelLine(lang: string): string {
  const s = str(lang)
  const { state, detail } = modelState()
  switch (state) {
    case 'ready': return modelOff() ? s.mOff : s.mReady
    case 'missing': return s.mMissing
    case 'downloading': return `${s.mDown} ${detail}%`
    case 'importing': case 'copying': return `${s.mImport}${detail ? ` ${detail}%` : ''}`
    case 'starting': return s.mStart
    default: return `${s.mError}: ${detail}`
  }
}

/** The line under the bar when the model needs attention: "Model: not on this phone yet…". */
export const modelNotice = (lang: string): string => `${str(lang).model}: ${modelLine(lang)}`

/** The model section: its state, and download / load / share. */
export function modelSection(lang: string, refresh: () => void): HTMLElement {
  const s = str(lang)
  const box = el('div', 'setup')
  box.appendChild(el('h2', '', s.model))
  const line = box.appendChild(el('p', 'packs', `${MODEL.label} · ${modelLine(lang)}`))
  const { state } = modelState()
  const row = el('div', 'langs')
  // while it downloads or starts, the line follows it; when it ends, the section is drawn again (and the page refreshed)
  const busy = (st: string) => st === 'downloading' || st === 'starting' || st === 'importing' || st === 'copying'
  const follow = () => {
    let ticks = 0
    const t = setInterval(() => {
      if (!box.isConnected) return clearInterval(t)
      line.textContent = `${MODEL.label} · ${modelLine(lang)}`
      const now = modelState().state
      // the phone may take a moment to report the download: "missing" right after the tap is not the end
      if (busy(now) || (now === 'missing' && ++ticks < 6)) return void row.replaceChildren()
      clearInterval(t)
      box.replaceWith(modelSection(lang, refresh))
      refresh()
    }, 500)
  }
  if (busy(state)) follow()
  // the phone has another model than the one the app now expects (the lite build after an update): offer the new one
  if (state === 'ready' && modelOutdated()) {
    box.appendChild(el('p', 'note', s.newer))
    row.append(btn(`${s.update} (${mb(MODEL.bytes)})`, () => { downloadModel(); refresh(); follow() }, 'on'))
  }
  if (state === 'missing' || state === 'error') {
    row.append(btn(`${s.download} (${mb(MODEL.bytes)})`, () => { downloadModel(); refresh(); follow() }, 'on'))
    if (!LIMITED) row.append(btn(s.loadFile, () => pickModelFile()))
  } else if (state === 'ready' && !LIMITED) {
    row.append(btn(s.share, () => { const err = exportModel(); alertish(box, err ? `${s.failed} ${err}` : s.saved) }))
  }
  box.appendChild(row)
  // which model answers: none (references and searches only) or one on the phone; the choice is kept
  if (state === 'ready') {
    const pick = el('div', 'langs')
    const choose = (off: boolean) => () => { setModelOff(off); refresh() }
    pick.append(btn(s.none, choose(true), modelOff() ? 'on' : ''), btn(MODEL.label, choose(false), modelOff() ? '' : 'on'))
    box.insertBefore(pick, row)
  }
  return box
}
function alertish(box: HTMLElement, text: string) {
  // the last message goes; the pictures' credit (a note too) stays
  box.querySelector('.note:not(.credit)')?.remove()
  box.appendChild(el('p', 'note', text))
}

/** The old name main.ts calls for the Resources screen (resources.ts draws it, and the server screen with a way back). */
export const languagesSection = (lang: string, after: () => void): Promise<HTMLElement> => resourcesBox(lang, after)

/** About (and first launch): what BT Servant Mini is, how it differs from BT Servant, the version; the setup of the light build. */
export function showAbout(lang: string, refresh: () => void) {
  const s = str(lang)
  document.querySelector('#about')?.remove()
  const wrap = el('div', '')
  wrap.id = 'about'
  const card = el('div', 'card')
  card.dir = rtlLang(lang) ? 'rtl' : 'auto' // the Latin name in the title must not turn an Arabic card left to right
  card.appendChild(el('h2', '', s.title))
  for (const p of s.body) {
    const para = el('p', '')
    para.innerHTML = p.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')
    card.appendChild(para)
  }
  card.appendChild(el('p', 'meta', `${s.version} ${appVersion()} · ${isLite() ? s.lite : s.full}`))
  if (isLite() && modelState().state !== 'ready') {
    card.appendChild(el('p', 'meta', s.setup))
    card.appendChild(modelSection(lang, refresh))
  }
  card.appendChild(btn(localStorage.getItem('btsm.onboarded') ? s.close : s.start, () => {
    try {
      localStorage.setItem('btsm.onboarded', '1')
    } catch {}
    wrap.remove()
    refresh()
  }, 'primary'))
  wrap.appendChild(card)
  document.body.appendChild(wrap)
}
export const aboutLabel = (lang: string) => str(lang).about
/** About's "What you can ask" and "Short commands", for an answer to "what can you do?". */
export const whatYouCanAsk = (lang: string): string => str(lang).body.slice(1, 3).join('\n\n')
/** The names of the model and languages views of the menu. */
export const modelTitle = (lang: string) => str(lang).model
export const modelNewer = (lang: string) => str(lang).newer
export const packsTitle = (lang: string) => str(lang).langs

// desktop testing only (no Android bridge): reach the pack functions from the console
if (!(window as any).Android) (window as any).__packs = { exportPack, importPack, removeLang, origin, installedLangs, availableLangs, offers, openLang, downloadImages, removeImages, imagesInstalled }
