// The "About" screen (also shown on first launch), and the menu's Model and Languages sections: download or load the
// model, add languages from the packs server or from a .tcpack file, share them with another phone.
import { appVersion, downloadModel, exportModel, isLite, MODEL, modelOff, modelState, pickModelFile, saveToDownloads, setModelOff } from './model'
import { availableLangs, downloadLang, exportPack, importPack, installedLangs, openLang, origin, removeLang } from './packs'

type S = {
  about: string; title: string; body: string[]; version: string; full: string; lite: string; start: string; close: string
  model: string; mReady: string; mMissing: string; mDown: string; mImport: string; mStart: string; mError: string; mOff: string; none: string
  download: string; loadFile: string; share: string; saved: string; langs: string; shipped: string; added: string; remove: string
  addLangs: string; online: string; offline: string; noneNew: string; loadPack: string; working: string; failed: string
  setup: string
}
const STR: Record<string, S> = {
  en: {
    about: 'About BT Servant Mini', title: 'BT Servant Mini',
    body: [
      "BT Servant Mini is BT Servant on your phone, **without internet**. It answers from the unfoldingWord translation helps kept on the phone: literal and simplified Bible texts, translation notes, comprehension questions, key terms (Translation Words) and Translation Academy. On the phone it works as a search assistant, not a chat: it finds what you need in the helps and shows it, rather than holding a conversation like BT Servant. With online AI turned on and internet, a larger model also writes an explanation from what it found, closer to BT Servant, though still one answer at a time.",
      "**What you can ask**\n• A verse or a chapter (Ruth 1:1, Jonah 1): the texts with their notes. Tap a word to see the notes and key terms about it.\n• A word or a name (grace, John the Baptist): its article and the verses that mention it.\n• A free question about a story (Where was Jonah swallowed by the fish?) or just a few words (Jonah fish): the verses that tell it.\n• For help translating (help me translate Jonah 1:3): the notes and the simpler version.",
      "**Short commands (they work even without the model)**\nJonah 1:3 · Jonah 1:3 notes · Jonah 1:3 questions · Jonah intro · Jonah 2 intro · grace · Jonah fish",
      "**Links and follow-ups.** Links in notes and articles open in a panel at the bottom; a Bible reference is asked in the chat. Buttons under each answer go on from there (notes, questions, next verse).",
      "**Languages.** The app speaks English, Spanish, French, Indonesian, Hindi and Arabic, and you can ask in any of them. The helps come from the language packs on the phone; add more from the menu (from the internet or from a file) and share them with others.",
      "**How it differs from BT Servant.** BT Servant (WhatsApp, Telegram, Signal, the web) needs internet and uses a large AI model that talks with you and writes its answers. BT Servant Mini works offline and uses a small model only to understand your question: what you read are the helps as they are, never text written by a model.",
      "This is an alpha version for testing.",
    ],
    version: 'Version', full: 'complete (model and base languages included)', lite: 'light (model and languages added on the phone)',
    start: 'Start', close: 'Close', setup: 'To start, this light version needs the model (once):',
    model: 'Model', mReady: 'Ready', mMissing: 'Not on this phone yet: only references and searches work', mDown: 'Downloading', mImport: 'Loading',
    mStart: 'Starting', mOff: 'Off: references and searches only', none: 'None (references and searches only)', mError: 'Problem', download: 'Download', loadFile: 'Load from a file (SD card, phone memory)', share: 'Share (save to Downloads)',
    saved: 'Saved in Downloads', langs: 'Languages on this phone', shipped: 'included', added: 'added', remove: 'Remove',
    addLangs: 'Add languages', online: 'Look on the server (internet)', offline: 'No internet, or the server did not answer.',
    noneNew: 'The server has no other languages yet.', loadPack: 'Load a .tcpack file', working: 'Working…', failed: 'It did not work:',
  },
  es: {
    about: 'Acerca de BT Servant Mini', title: 'BT Servant Mini',
    body: [
      "BT Servant Mini es BT Servant en tu teléfono, **sin internet**. Responde con las ayudas de traducción de unfoldingWord guardadas en el teléfono: textos bíblicos literal y simplificado, notas de traducción, preguntas de comprensión, palabras clave (Palabras de Traducción) y Translation Academy. En el teléfono funciona como un buscador asistido, no como un chat: encuentra en las ayudas lo que necesitas y te lo muestra, en lugar de conversar como BT Servant. Con la IA en línea activada y con internet, un modelo más grande además escribe una explicación a partir de lo encontrado, más parecido a BT Servant, aunque todavía una respuesta a la vez.",
      "**Qué puedes preguntar**\n• Un versículo o un capítulo (Rut 1:1, Jonás 1): los textos con sus notas. Toca una palabra para ver las notas y palabras clave que hablan de ella.\n• Una palabra o un nombre (gracia, Juan el Bautista): su artículo y los versículos que lo mencionan.\n• Una pregunta libre sobre una historia (¿Dónde fue tragado Jonás por un pez?) o solo unas palabras (Jonás pez): los versículos que la cuentan.\n• Ayuda para traducir (ayúdame a traducir Jonás 1:3): las notas y la versión más sencilla.",
      "**Comandos cortos (funcionan incluso sin el modelo)**\nJonás 1:3 · Jonás 1:3 notas · Jonás 1:3 preguntas · Jonás intro · Jonás 2 intro · gracia · Jonás pez",
      "**Enlaces y seguimiento.** Los enlaces de notas y artículos se abren en un panel abajo; una referencia bíblica se pregunta en el chat. Los botones bajo cada respuesta siguen desde ahí (notas, preguntas, versículo siguiente).",
      "**Idiomas.** La app habla inglés, español, francés, indonesio, hindi y árabe, y puedes preguntar en cualquiera de ellos. Las ayudas vienen de los paquetes de idioma del teléfono; agrega más desde el menú (de internet o de un archivo) y compártelos con otros.",
      "**En qué se diferencia de BT Servant.** BT Servant (WhatsApp, Telegram, Signal, la web) necesita internet y usa un modelo de IA grande que conversa contigo y escribe sus respuestas. BT Servant Mini funciona sin conexión y usa un modelo pequeño solo para entender tu pregunta: lo que lees son las ayudas tal como son, nunca texto escrito por un modelo.",
      "Esta es una versión alfa de prueba.",
    ],
    version: 'Versión', full: 'completa (con el modelo y los idiomas base)', lite: 'light (modelo e idiomas se agregan en el teléfono)',
    start: 'Empezar', close: 'Cerrar', setup: 'Para empezar, esta versión light necesita el modelo (una sola vez):',
    model: 'Modelo', mReady: 'Listo', mMissing: 'Aún no está en este teléfono: solo funcionan referencias y búsquedas', mDown: 'Descargando', mImport: 'Cargando',
    mStart: 'Iniciando', mOff: 'Apagado: solo referencias y búsquedas', none: 'Ninguno (solo referencias y búsquedas)', mError: 'Problema', download: 'Descargar', loadFile: 'Cargar desde un archivo (tarjeta SD, memoria)', share: 'Compartir (guardar en Descargas)',
    saved: 'Guardado en Descargas', langs: 'Idiomas en este teléfono', shipped: 'incluido', added: 'agregado', remove: 'Quitar',
    addLangs: 'Agregar idiomas', online: 'Buscar en el servidor (internet)', offline: 'Sin internet, o el servidor no respondió.',
    noneNew: 'El servidor todavía no tiene otros idiomas.', loadPack: 'Cargar un archivo .tcpack', working: 'Trabajando…', failed: 'No funcionó:',
  },
  fr: {
    about: 'À propos de BT Servant Mini', title: 'BT Servant Mini',
    body: [
      "BT Servant Mini, c'est BT Servant sur votre téléphone, **sans internet**. Il répond avec les aides à la traduction d'unfoldingWord gardées sur le téléphone : textes bibliques littéral et simplifié, notes de traduction, questions de compréhension, termes clés (Translation Words) et Translation Academy. Sur le téléphone, il fonctionne comme un assistant de recherche, pas comme une messagerie : il trouve dans les aides ce dont vous avez besoin et vous le montre, au lieu de converser comme BT Servant. Avec l'IA en ligne activée et internet, un modèle plus grand rédige aussi une explication à partir de ce qui a été trouvé, plus proche de BT Servant, mais toujours une réponse à la fois.",
      "**Ce que vous pouvez demander**\n• Un verset ou un chapitre (Ruth 1:1, Jonas 1) : les textes avec leurs notes. Touchez un mot pour voir les notes et les termes clés qui en parlent.\n• Un mot ou un nom (grâce, Jean-Baptiste) : son article et les versets qui le mentionnent.\n• Une question libre sur un récit (Où Jonas a-t-il été avalé par le poisson ?) ou quelques mots (Jonas poisson) : les versets qui le racontent.\n• De l'aide pour traduire (aide-moi à traduire Jonas 1:3) : les notes et la version simplifiée.",
      "**Commandes courtes (elles marchent même sans le modèle)**\nJonas 1:3 · Jonas 1:3 notes · Jonas 1:3 questions · Jonas intro · Jonas 2 intro · grâce · Jonas poisson",
      "**Liens et suite.** Les liens des notes et des articles s'ouvrent dans un panneau en bas ; une référence biblique est demandée dans le chat. Les boutons sous chaque réponse continuent à partir de là (notes, questions, verset suivant).",
      "**Langues.** L'application parle anglais, espagnol, français, indonésien, hindi et arabe, et vous pouvez demander dans chacune. Les aides viennent des paquets de langue du téléphone ; ajoutez-en depuis le menu (par internet ou depuis un fichier) et partagez-les.",
      "**Ce qui le distingue de BT Servant.** BT Servant (WhatsApp, Telegram, Signal, le web) a besoin d'internet et utilise un grand modèle d'IA qui converse et rédige ses réponses. BT Servant Mini fonctionne hors ligne et n'utilise un petit modèle que pour comprendre votre question : vous lisez les aides telles quelles, jamais un texte écrit par un modèle.",
      "Ceci est une version alpha de test.",
    ],
    version: 'Version', full: 'complète (modèle et langues de base inclus)', lite: 'légère (modèle et langues ajoutés sur le téléphone)',
    start: 'Commencer', close: 'Fermer', setup: 'Pour commencer, cette version légère a besoin du modèle (une seule fois) :',
    model: 'Modèle', mReady: 'Prêt', mMissing: 'Pas encore sur ce téléphone : seules les références et recherches fonctionnent', mDown: 'Téléchargement', mImport: 'Chargement',
    mStart: 'Démarrage', mOff: 'Éteint : références et recherches seulement', none: 'Aucun (références et recherches seulement)', mError: 'Problème', download: 'Télécharger', loadFile: 'Charger un fichier (carte SD, mémoire)', share: 'Partager (enregistrer dans Téléchargements)',
    saved: 'Enregistré dans Téléchargements', langs: 'Langues sur ce téléphone', shipped: 'incluse', added: 'ajoutée', remove: 'Retirer',
    addLangs: 'Ajouter des langues', online: 'Chercher sur le serveur (internet)', offline: "Pas d'internet, ou le serveur n'a pas répondu.",
    noneNew: "Le serveur n'a pas encore d'autres langues.", loadPack: 'Charger un fichier .tcpack', working: 'En cours…', failed: 'Échec :',
  },
  id: {
    about: 'Tentang BT Servant Mini', title: 'BT Servant Mini',
    body: [
      "BT Servant Mini adalah BT Servant di ponsel Anda, **tanpa internet**. Ia menjawab dari alat bantu penerjemahan unfoldingWord yang tersimpan di ponsel: teks Alkitab harfiah dan sederhana, catatan terjemahan, pertanyaan pemahaman, istilah kunci (Translation Words) dan Translation Academy. Di ponsel, aplikasi ini bekerja sebagai asisten pencari, bukan obrolan: ia menemukan apa yang Anda perlukan di bahan bantu dan menampilkannya, bukan bercakap-cakap seperti BT Servant. Dengan AI daring aktif dan ada internet, model yang lebih besar juga menulis penjelasan dari apa yang ditemukan, lebih mirip BT Servant, meski tetap satu jawaban setiap kali.",
      "**Yang bisa Anda tanyakan**\n• Sebuah ayat atau pasal (Rut 1:1, Yunus 1): teks-teksnya dengan catatannya. Ketuk sebuah kata untuk melihat catatan dan istilah kunci tentang kata itu.\n• Sebuah kata atau nama (anugerah, Yohanes Pembaptis): artikelnya dan ayat-ayat yang menyebutnya.\n• Pertanyaan bebas tentang sebuah kisah (Di mana Yunus ditelan ikan?) atau beberapa kata (Yunus ikan): ayat-ayat yang menceritakannya.\n• Bantuan menerjemahkan (bantu saya menerjemahkan Yunus 1:3): catatan dan versi yang lebih sederhana.",
      "**Perintah singkat (tetap bekerja tanpa model)**\nYunus 1:3 · Yunus 1:3 catatan · Yunus 1:3 pertanyaan · Yunus intro · Yunus 2 intro · kasih karunia · Yunus ikan",
      "**Tautan dan lanjutan.** Tautan di catatan dan artikel terbuka di panel bawah; rujukan Alkitab ditanyakan di obrolan. Tombol di bawah setiap jawaban melanjutkan dari sana (catatan, pertanyaan, ayat berikutnya).",
      "**Bahasa.** Aplikasi ini berbahasa Inggris, Spanyol, Prancis, Indonesia, Hindi dan Arab, dan Anda bisa bertanya dalam bahasa mana pun. Alat bantu berasal dari paket bahasa di ponsel; tambahkan lagi dari menu (dari internet atau dari berkas) dan bagikan kepada orang lain.",
      "**Bedanya dengan BT Servant.** BT Servant (WhatsApp, Telegram, Signal, web) memerlukan internet dan memakai model AI besar yang bercakap dan menulis jawabannya. BT Servant Mini bekerja tanpa koneksi dan memakai model kecil hanya untuk memahami pertanyaan Anda: yang Anda baca adalah alat bantu apa adanya, tidak pernah teks tulisan model.",
      "Ini versi alfa untuk uji coba.",
    ],
    version: 'Versi', full: 'lengkap (model dan bahasa dasar sudah ada)', lite: 'ringan (model dan bahasa ditambahkan di ponsel)',
    start: 'Mulai', close: 'Tutup', setup: 'Untuk mulai, versi ringan ini perlu modelnya (sekali saja):',
    model: 'Model', mReady: 'Siap', mMissing: 'Belum ada di ponsel ini: hanya rujukan dan pencarian yang bekerja', mDown: 'Mengunduh', mImport: 'Memuat',
    mStart: 'Memulai', mOff: 'Mati: hanya rujukan dan pencarian', none: 'Tidak ada (hanya rujukan dan pencarian)', mError: 'Masalah', download: 'Unduh', loadFile: 'Muat dari berkas (kartu SD, memori ponsel)', share: 'Bagikan (simpan ke Unduhan)',
    saved: 'Tersimpan di Unduhan', langs: 'Bahasa di ponsel ini', shipped: 'bawaan', added: 'ditambahkan', remove: 'Hapus',
    addLangs: 'Tambah bahasa', online: 'Cari di server (internet)', offline: 'Tidak ada internet, atau server tidak menjawab.',
    noneNew: 'Server belum punya bahasa lain.', loadPack: 'Muat berkas .tcpack', working: 'Sedang bekerja…', failed: 'Gagal:',
  },
  hi: {
    about: 'BT Servant Mini के बारे में', title: 'BT Servant Mini',
    body: [
      "BT Servant Mini आपके फ़ोन पर BT Servant है, **बिना इंटरनेट के**। यह फ़ोन में रखे unfoldingWord के अनुवाद सहायक संसाधनों से उत्तर देता है: शाब्दिक और सरल बाइबल पाठ, अनुवाद नोट्स, समझ के प्रश्न, मुख्य शब्द (Translation Words) और Translation Academy। फ़ोन पर यह एक खोज सहायक की तरह काम करता है, चैट की तरह नहीं: यह सहायताओं में से आपकी ज़रूरत की जानकारी ढूँढकर दिखाता है, BT Servant की तरह बातचीत नहीं करता। ऑनलाइन AI चालू हो और इंटरनेट हो, तो एक बड़ा मॉडल मिली हुई जानकारी से एक व्याख्या भी लिखता है, जो BT Servant के अधिक निकट है, फिर भी एक बार में एक उत्तर।",
      "**आप क्या पूछ सकते हैं**\n• कोई पद या अध्याय (रूत 1:1, योना 1): पाठ और उनके नोट्स। किसी शब्द को छूकर उसके नोट्स और मुख्य शब्द देखें।\n• कोई शब्द या नाम (अनुग्रह, यूहन्ना): उसका लेख और वे पद जिनमें उसका उल्लेख है।\n• किसी कहानी के बारे में खुला प्रश्न (योना को मछली ने कहाँ निगल लिया?): वे पद जो उसे बताते हैं, केवल कोई मुख्य शब्द या संदर्भ नहीं।\n• अनुवाद में सहायता (योना 1:3 का अनुवाद करने में मदद करें): नोट्स और सरल संस्करण।",
      "**छोटे आदेश (मॉडल के बिना भी चलते हैं)**\nयोना 1:3 · योना 1:3 नोट्स · योना 1:3 प्रश्न · योना intro · योना 2 intro · अनुग्रह · योना मछली",
      "**लिंक और आगे।** नोट्स और लेखों के लिंक नीचे एक पैनल में खुलते हैं; बाइबल संदर्भ चैट में पूछा जाता है। हर उत्तर के नीचे के बटन वहीं से आगे ले जाते हैं (नोट्स, प्रश्न, अगला पद)।",
      "**भाषाएँ।** ऐप अंग्रेज़ी, स्पेनिश, फ़्रेंच, इंडोनेशियाई, हिंदी और अरबी में है, और आप इनमें से किसी में भी पूछ सकते हैं। सहायक संसाधन फ़ोन के भाषा पैकों से आते हैं; मेनू से और जोड़ें (इंटरनेट से या फ़ाइल से) और दूसरों के साथ साझा करें।",
      "**BT Servant से अंतर।** BT Servant (WhatsApp, Telegram, Signal, वेब) को इंटरनेट चाहिए और वह एक बड़े AI मॉडल का उपयोग करता है जो बात करता है और उत्तर लिखता है। BT Servant Mini बिना इंटरनेट चलता है और छोटा मॉडल केवल आपका प्रश्न समझने के लिए उपयोग करता है: आप सहायक संसाधनों को जैसे हैं वैसे ही पढ़ते हैं, मॉडल का लिखा पाठ कभी नहीं।",
      "यह परीक्षण के लिए अल्फ़ा संस्करण है।",
    ],
    version: 'संस्करण', full: 'पूर्ण (मॉडल और मूल भाषाएँ शामिल)', lite: 'हल्का (मॉडल और भाषाएँ फ़ोन पर जोड़ी जाती हैं)',
    start: 'शुरू करें', close: 'बंद करें', setup: 'शुरू करने के लिए इस हल्के संस्करण को मॉडल चाहिए (एक बार):',
    model: 'मॉडल', mReady: 'तैयार', mMissing: 'अभी इस फ़ोन पर नहीं: केवल संदर्भ और खोज चलते हैं', mDown: 'डाउनलोड हो रहा है', mImport: 'लोड हो रहा है',
    mStart: 'शुरू हो रहा है', mOff: 'बंद: केवल संदर्भ और खोज', none: 'कोई नहीं (केवल संदर्भ और खोज)', mError: 'समस्या', download: 'डाउनलोड करें', loadFile: 'फ़ाइल से लोड करें (SD कार्ड, फ़ोन मेमोरी)', share: 'साझा करें (डाउनलोड में सहेजें)',
    saved: 'डाउनलोड में सहेजा गया', langs: 'इस फ़ोन पर भाषाएँ', shipped: 'शामिल', added: 'जोड़ी गई', remove: 'हटाएँ',
    addLangs: 'भाषाएँ जोड़ें', online: 'सर्वर पर खोजें (इंटरनेट)', offline: 'इंटरनेट नहीं है, या सर्वर ने उत्तर नहीं दिया।',
    noneNew: 'सर्वर पर अभी और भाषाएँ नहीं हैं।', loadPack: '.tcpack फ़ाइल लोड करें', working: 'काम हो रहा है…', failed: 'नहीं हुआ:',
  },
  ar: {
    about: 'حول BT Servant Mini', title: 'BT Servant Mini',
    body: [
      "BT Servant Mini هو BT Servant على هاتفك، **دون إنترنت**. يجيب من أدوات الترجمة المساعدة من unfoldingWord المحفوظة على الهاتف: نصوص الكتاب المقدس الحرفية والمبسّطة، وملاحظات الترجمة، وأسئلة الفهم، والكلمات الرئيسية (Translation Words) وTranslation Academy. يعمل على الهاتف كمساعد بحث، لا كمحادثة: يجد ما تحتاج إليه في المساعدات ويعرضه لك، بدلًا من أن يحاورك مثل BT Servant. وعند تفعيل الذكاء الاصطناعي عبر الإنترنت وتوفر الاتصال، يكتب نموذج أكبر أيضًا شرحًا مما وُجد، أقرب إلى BT Servant، لكنه لا يزال إجابة واحدة في كل مرة.",
      "**ماذا يمكنك أن تسأل**\n• آية أو أصحاح (راعوث 1: 1، يونان 1): النصوص مع ملاحظاتها. المس كلمة لترى الملاحظات والكلمات الرئيسية عنها.\n• كلمة أو اسم (نعمة، يوحنا): مقالته والآيات التي تذكره.\n• سؤال حرّ عن قصة (أين ابتلع الحوت يونان؟): الآيات التي ترويها، لا مجرد كلمة رئيسية أو شاهد.\n• مساعدة في الترجمة (ساعدني في ترجمة يونان 1: 3): الملاحظات والترجمة الأبسط.",
      "**أوامر قصيرة (تعمل حتى من دون النموذج)**\nيونان 1:3 · يونان 1:3 ملاحظات · يونان 1:3 أسئلة · يونان intro · يونان 2 intro · نعمة · يونان حوت",
      "**الروابط والمتابعة.** تُفتح روابط الملاحظات والمقالات في لوحة أسفل الشاشة؛ ويُسأل عن الشاهد الكتابي في المحادثة. والأزرار تحت كل إجابة تتابع من هناك (ملاحظات، أسئلة، الآية التالية).",
      "**اللغات.** التطبيق بالإنجليزية والإسبانية والفرنسية والإندونيسية والهندية والعربية، ويمكنك السؤال بأيّ منها. تأتي الأدوات المساعدة من حزم اللغات على الهاتف؛ أضف المزيد من القائمة (من الإنترنت أو من ملف) وشاركها مع الآخرين.",
      "**الفرق عن BT Servant.** يحتاج BT Servant (واتساب، تيليجرام، سيجنال، الويب) إلى الإنترنت ويستخدم نموذج ذكاء اصطناعي كبيرًا يحاورك ويكتب إجاباته. أما BT Servant Mini فيعمل دون اتصال ويستخدم نموذجًا صغيرًا لفهم سؤالك فقط: ما تقرؤه هو الأدوات المساعدة كما هي، وليس نصًا كتبه نموذج أبدًا.",
      "هذه نسخة ألفا للتجربة.",
    ],
    version: 'الإصدار', full: 'كاملة (النموذج واللغات الأساسية مضمّنة)', lite: 'خفيفة (يُضاف النموذج واللغات على الهاتف)',
    start: 'ابدأ', close: 'إغلاق', setup: 'لتبدأ، تحتاج هذه النسخة الخفيفة إلى النموذج (مرة واحدة):',
    model: 'النموذج', mReady: 'جاهز', mMissing: 'ليس على هذا الهاتف بعد: تعمل المراجع والبحث فقط', mDown: 'جارٍ التنزيل', mImport: 'جارٍ التحميل',
    mStart: 'جارٍ التشغيل', mOff: 'مُطفأ: الشواهد والبحث فقط', none: 'لا شيء (الشواهد والبحث فقط)', mError: 'مشكلة', download: 'تنزيل', loadFile: 'تحميل من ملف (بطاقة SD، ذاكرة الهاتف)', share: 'مشاركة (حفظ في التنزيلات)',
    saved: 'حُفظ في التنزيلات', langs: 'اللغات على هذا الهاتف', shipped: 'مضمّنة', added: 'مضافة', remove: 'إزالة',
    addLangs: 'إضافة لغات', online: 'البحث في الخادم (إنترنت)', offline: 'لا يوجد إنترنت، أو لم يُجب الخادم.',
    noneNew: 'لا توجد لغات أخرى على الخادم بعد.', loadPack: 'تحميل ملف ‎.tcpack', working: 'جارٍ العمل…', failed: 'لم ينجح:',
  },
}
export const PACK_NAMES: Record<string, string> = {
  en: 'English', 'es-419': 'Español (Latinoamérica)', id: 'Bahasa Indonesia', hi: 'हिन्दी', ar: 'العربية', fr: 'Français', bn: 'বাংলা',
  gu: 'ગુજરાતી', kn: 'ಕನ್ನಡ', mr: 'मराठी', ne: 'नेपाली', or: 'ଓଡ଼ିଆ', te: 'తెలుగు', fa: 'فارسی', ru: 'Русский', 'pt-br': 'Português', sw: 'Kiswahili',
}
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
  box.appendChild(el('p', 'packs', `${MODEL.label} · ${modelLine(lang)}`))
  const { state } = modelState()
  const row = el('div', 'langs')
  if (state === 'missing' || state === 'error') {
    row.append(btn(`${s.download} (${mb(MODEL.bytes)})`, () => { downloadModel(); setTimeout(refresh, 500) }, 'on'), btn(s.loadFile, () => pickModelFile()))
  } else if (state === 'ready') {
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
  box.querySelector('.note')?.remove()
  box.appendChild(el('p', 'note', text))
}

/** The languages section: what is here, add from the server or a file, share or remove. */
export async function languagesSection(lang: string, after: () => void): Promise<HTMLElement> {
  const s = str(lang)
  const box = el('div', 'setup')
  box.appendChild(el('h2', '', s.langs))
  for (const l of await installedLangs()) {
    const row = el('div', 'row')
    const o = await origin(l)
    row.appendChild(el('span', 'grow', `${PACK_NAMES[l] ?? l} · ${o === 'added' ? s.added : s.shipped}`))
    row.appendChild(btn(s.share.split(' (')[0]!, async () => {
      alertish(box, s.working)
      try {
        const bytes = await exportPack(l)
        const err = await saveToDownloads(`bt-servant-mini-${l}.tcpack`, bytes)
        alertish(box, err ? `${s.failed} ${err}` : `${s.saved} (${mb(bytes.length)})`)
      } catch (e) {
        alertish(box, `${s.failed} ${e instanceof Error ? e.message : e}`)
      }
    }, 'small'))
    if (o === 'added') row.appendChild(btn(s.remove, async () => { await removeLang(l); after() }, 'small del'))
    box.appendChild(row)
  }
  box.appendChild(el('h2', '', s.addLangs))
  const add = el('div', 'langs')
  const list = el('div', '')
  add.appendChild(btn(s.online, async () => {
    list.textContent = s.working
    const avail = await availableLangs()
    list.textContent = ''
    if (!avail.length) {
      list.appendChild(el('p', 'note', navigator.onLine ? s.noneNew : s.offline))
      return
    }
    for (const l of avail) {
      const row = el('div', 'row')
      const label = el('span', 'grow', PACK_NAMES[l] ?? l)
      row.append(label, btn(s.download, async () => {
        try {
          label.textContent = `${PACK_NAMES[l] ?? l} · ${s.working}`
          const r = await downloadLang(l, (p) => (label.textContent = `${PACK_NAMES[l] ?? l} · ${p.done}/${p.total} · ${mb(p.bytes)}`))
          label.textContent = `${PACK_NAMES[l] ?? l} · ${r.books} · ${mb(r.bytes)} ✓`
          after()
        } catch (e) {
          label.textContent = `${PACK_NAMES[l] ?? l} · ${s.failed} ${e instanceof Error ? e.message : e}`
        }
      }, 'small'))
      list.appendChild(row)
    }
  }))
  const file = document.createElement('input')
  file.type = 'file'
  file.accept = '.tcpack,application/octet-stream'
  file.hidden = true
  file.onchange = async () => {
    const f = file.files?.[0]
    if (!f) return
    alertish(box, s.working)
    try {
      const r = await importPack(new Uint8Array(await f.arrayBuffer()))
      alertish(box, r.langs.length ? r.langs.map((l) => PACK_NAMES[l] ?? l).join(', ') + ' ✓' : `${s.failed} ${r.rejected}`)
      after()
    } catch (e) {
      alertish(box, `${s.failed} ${e instanceof Error ? e.message : e}`)
    }
  }
  add.append(btn(s.loadPack, () => file.click()), file)
  box.append(add, list)
  return box
}

/** About (and first launch): what BT Servant Mini is, how it differs from BT Servant, the version; the setup of the light build. */
export function showAbout(lang: string, refresh: () => void) {
  const s = str(lang)
  document.querySelector('#about')?.remove()
  const wrap = el('div', '')
  wrap.id = 'about'
  const card = el('div', 'card')
  card.dir = 'auto'
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
export const packsTitle = (lang: string) => str(lang).langs

// desktop testing only (no Android bridge): reach the pack functions from the console
if (!(window as any).Android) (window as any).__packs = { exportPack, importPack, removeLang, origin, installedLangs, availableLangs, openLang }
