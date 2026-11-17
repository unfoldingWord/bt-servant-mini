// The words of the 5M study session, in the six app languages. Words only: no routes, no views (obs5m.ts is the model).
// Placeholders ({part} {kind} {n} {of} {story} {title} {place} {lang}) are the same in every language; tests/obs5m-words.test.ts
// checks that. The Arabic and Hindi lines are `// model-written, unreviewed`, like the other tables.
import type { Code, StepKind } from './obs5m'

type L = 'en' | 'es' | 'fr' | 'id' | 'hi' | 'ar'

export type Words5 = {
  /** the parts of a session, by code (what the manual calls them) */
  parts: Record<Code, string>
  /** what a step is, by kind */
  kinds: Record<StepKind, string>
  /** where the learner is: a frame step; a step with no frame; a numbered question ("question 2/7") */
  place: string; placeNoFrame: string; placeQuestion: string
  /** the bar over the session: "OBS 1 · Creation"; the way on, the way back, the resume line (the place filled in) */
  bar: string; next: string; back: string; resume: string
  show: string; hide: string
  /** the review offered at the end of M1's observation frames, and its skip */
  reviewOffer: string; reviewSkip: string
  /** the learner's own marks on a frame or a question */
  knew: string; revisit: string; understood: string; confusing: string
  outline: string; how: string; end: string
  /** "in Indonesian"; when the story has no session in that language */
  inLang: string; noSession: string
  /** the button under an Open Bible Story that has a session; the one under "no session" that opens the list of the stories that have one */
  startStory: string; seeStories: string
  /** the manual's time for each part; '' where it gives none (intro, frames, community, drafting, checking, m5, conclusion) */
  durations: Record<Code, string>
  /** the names of the helps a frame can open */
  helps: { tn: string; tq: string; twl: string; sn: string; sq: string; passage: string; academy: string }
  start: string
  /** the composer's "✓" for a frame's number typed in a part that goes frame by frame ("✓ frame 7") */
  frameN: string
  /** the session's view (obs5mview.ts): the M1 handout button, the folded instruction, the bar's ◀ ▶ and the outline's ✕ */
  view: { allList: string; instruction: string; prevStep: string; nextStep: string; close: string }
}

const W: Record<L, Words5> = {
  en: {
    parts: { intro: 'Introduction', frames: 'Frames', community: 'Community', m1: 'Movement 1', m2: 'Movement 2', drafting: 'Drafting', m3: 'Movement 3', checking: 'Checking', m4: 'Movement 4', m5: 'Movement 5', conclusion: 'Conclusion' },
    kinds: { block: 'text', frame: 'frame', 'm1-open': 'opening', observation: 'observation', review: 'review', translation: 'translation', question: 'question', draft: 'draft', check: 'check', 'story-level': 'whole story' },
    place: '{part} · {kind} · frame {n}/{of}', placeNoFrame: '{part} · {kind}', placeQuestion: '{part} · {kind} {n}/{of}',
    bar: '{story} · {title}', next: 'Next: {place}', back: 'Back to the session: {place}', resume: 'Resume {story} · {place}',
    show: 'Show answer', hide: 'Hide answer', reviewOffer: 'We’re done: quick review (optional)', reviewSkip: 'Skip to translation questions',
    knew: 'We knew this', revisit: 'Review this frame', understood: 'Understood', confusing: 'Confusing: revisit frame',
    outline: 'Outline', how: 'How it works', end: 'End session', inLang: 'in {lang}', noSession: 'This story has no 5M session in {lang} yet',
    startStory: '5M session for this story', seeStories: 'See the stories with a session',
    durations: { intro: '', frames: '', community: '', m1: 'about 150 min', m2: '3–4 h', drafting: '', m3: 'about 60 min', checking: '', m4: '60–90 min', m5: '', conclusion: '' },
    helps: { tn: 'Translation notes', tq: 'Translation questions', twl: 'Key terms', sn: 'Study notes', sq: 'Study questions', passage: 'Passage', academy: 'Translation Academy' },
    start: 'Start a 5M session', frameN: 'frame {n}',
    view: { allList: 'All questions in one list', instruction: 'The manual’s instruction', prevStep: 'Previous step', nextStep: 'Next step', close: 'Close' },
  },
  es: {
    parts: { intro: 'Introducción', frames: 'Cuadros', community: 'Comunidad', m1: 'Movimiento 1', m2: 'Movimiento 2', drafting: 'Borrador', m3: 'Movimiento 3', checking: 'Revisión', m4: 'Movimiento 4', m5: 'Movimiento 5', conclusion: 'Conclusión' },
    kinds: { block: 'texto', frame: 'cuadro', 'm1-open': 'apertura', observation: 'observación', review: 'repaso', translation: 'traducción', question: 'pregunta', draft: 'borrador', check: 'revisión', 'story-level': 'historia completa' },
    place: '{part} · {kind} · cuadro {n}/{of}', placeNoFrame: '{part} · {kind}', placeQuestion: '{part} · {kind} {n}/{of}',
    bar: '{story} · {title}', next: 'Siguiente: {place}', back: 'Volver a la sesión: {place}', resume: 'Retomar {story} · {place}',
    show: 'Ver respuesta', hide: 'Ocultar respuesta', reviewOffer: 'Terminamos: repaso rápido (opcional)', reviewSkip: 'Pasar a las preguntas de traducción',
    knew: 'Lo sabíamos', revisit: 'Repasar este cuadro', understood: 'Entendido', confusing: 'Confuso: volver al cuadro',
    outline: 'Esquema', how: 'Cómo funciona', end: 'Terminar la sesión', inLang: 'en {lang}', noSession: 'Esta historia aún no tiene sesión 5M en {lang}',
    startStory: 'Sesión 5M de esta historia', seeStories: 'Ver las historias con sesión',
    durations: { intro: '', frames: '', community: '', m1: 'unos 150 min', m2: '3–4 h', drafting: '', m3: 'unos 60 min', checking: '', m4: '60–90 min', m5: '', conclusion: '' },
    helps: { tn: 'Notas de traducción', tq: 'Preguntas de traducción', twl: 'Palabras clave', sn: 'Notas de estudio', sq: 'Preguntas de estudio', passage: 'Pasaje', academy: 'Translation Academy' },
    start: 'Empezar una sesión 5M', frameN: 'cuadro {n}',
    view: { allList: 'Todas las preguntas en una lista', instruction: 'La instrucción del manual', prevStep: 'Paso anterior', nextStep: 'Paso siguiente', close: 'Cerrar' },
  },
  fr: {
    parts: { intro: 'Introduction', frames: 'Images', community: 'Communauté', m1: 'Mouvement 1', m2: 'Mouvement 2', drafting: 'Brouillon', m3: 'Mouvement 3', checking: 'Vérification', m4: 'Mouvement 4', m5: 'Mouvement 5', conclusion: 'Conclusion' },
    kinds: { block: 'texte', frame: 'image', 'm1-open': 'ouverture', observation: 'observation', review: 'révision', translation: 'traduction', question: 'question', draft: 'brouillon', check: 'vérification', 'story-level': 'histoire entière' },
    place: '{part} · {kind} · image {n}/{of}', placeNoFrame: '{part} · {kind}', placeQuestion: '{part} · {kind} {n}/{of}',
    bar: '{story} · {title}', next: 'Suite : {place}', back: 'Retour à la session : {place}', resume: 'Reprendre {story} · {place}',
    show: 'Voir la réponse', hide: 'Masquer la réponse', reviewOffer: 'Nous avons fini : révision rapide (facultative)', reviewSkip: 'Passer aux questions de traduction',
    knew: 'On le savait', revisit: 'Revoir cette image', understood: 'Compris', confusing: 'Pas clair : revoir l’image',
    outline: 'Plan', how: 'Comment ça marche', end: 'Terminer la session', inLang: 'en {lang}', noSession: 'Cette histoire n’a pas encore de session 5M en {lang}',
    startStory: 'Séance 5M de cette histoire', seeStories: 'Voir les histoires avec séance',
    durations: { intro: '', frames: '', community: '', m1: 'environ 150 min', m2: '3–4 h', drafting: '', m3: 'environ 60 min', checking: '', m4: '60–90 min', m5: '', conclusion: '' },
    helps: { tn: 'Notes de traduction', tq: 'Questions de traduction', twl: 'Mots clés', sn: 'Notes d’étude', sq: 'Questions d’étude', passage: 'Passage', academy: 'Translation Academy' },
    start: 'Commencer une session 5M', frameN: 'image {n}',
    view: { allList: 'Toutes les questions en une liste', instruction: 'La consigne du manuel', prevStep: 'Étape précédente', nextStep: 'Étape suivante', close: 'Fermer' },
  },
  id: {
    parts: { intro: 'Pengantar', frames: 'Bingkai', community: 'Komunitas', m1: 'Gerakan 1', m2: 'Gerakan 2', drafting: 'Draf', m3: 'Gerakan 3', checking: 'Pemeriksaan', m4: 'Gerakan 4', m5: 'Gerakan 5', conclusion: 'Penutup' },
    kinds: { block: 'teks', frame: 'bingkai', 'm1-open': 'pembukaan', observation: 'pengamatan', review: 'tinjauan', translation: 'terjemahan', question: 'pertanyaan', draft: 'draf', check: 'pemeriksaan', 'story-level': 'seluruh cerita' },
    place: '{part} · {kind} · bingkai {n}/{of}', placeNoFrame: '{part} · {kind}', placeQuestion: '{part} · {kind} {n}/{of}',
    bar: '{story} · {title}', next: 'Berikutnya: {place}', back: 'Kembali ke sesi: {place}', resume: 'Lanjutkan {story} · {place}',
    show: 'Lihat jawaban', hide: 'Sembunyikan jawaban', reviewOffer: 'Kami selesai: tinjauan singkat (opsional)', reviewSkip: 'Lanjut ke pertanyaan terjemahan',
    knew: 'Kami sudah tahu', revisit: 'Tinjau bingkai ini', understood: 'Mengerti', confusing: 'Membingungkan: tinjau bingkai',
    outline: 'Garis besar', how: 'Cara kerjanya', end: 'Akhiri sesi', inLang: 'dalam {lang}', noSession: 'Cerita ini belum punya sesi 5M dalam {lang}',
    startStory: 'Sesi 5M untuk kisah ini', seeStories: 'Lihat kisah yang punya sesi',
    durations: { intro: '', frames: '', community: '', m1: 'sekitar 150 menit', m2: '3–4 jam', drafting: '', m3: 'sekitar 60 menit', checking: '', m4: '60–90 menit', m5: '', conclusion: '' },
    helps: { tn: 'Catatan terjemahan', tq: 'Pertanyaan terjemahan', twl: 'Istilah kunci', sn: 'Catatan studi', sq: 'Pertanyaan studi', passage: 'Perikop', academy: 'Translation Academy' },
    start: 'Mulai sesi 5M', frameN: 'bingkai {n}',
    view: { allList: 'Semua pertanyaan dalam satu daftar', instruction: 'Petunjuk dari manual', prevStep: 'Langkah sebelumnya', nextStep: 'Langkah berikutnya', close: 'Tutup' },
  },
  hi: { // model-written, unreviewed
    parts: { intro: 'परिचय', frames: 'फ़्रेम', community: 'समुदाय', m1: 'आंदोलन 1', m2: 'आंदोलन 2', drafting: 'प्रारूप', m3: 'आंदोलन 3', checking: 'जाँच', m4: 'आंदोलन 4', m5: 'आंदोलन 5', conclusion: 'समापन' },
    kinds: { block: 'पाठ', frame: 'फ़्रेम', 'm1-open': 'आरंभ', observation: 'अवलोकन', review: 'दोहराव', translation: 'अनुवाद', question: 'प्रश्न', draft: 'प्रारूप', check: 'जाँच', 'story-level': 'पूरी कहानी' },
    place: '{part} · {kind} · फ़्रेम {n}/{of}', placeNoFrame: '{part} · {kind}', placeQuestion: '{part} · {kind} {n}/{of}',
    bar: '{story} · {title}', next: 'आगे: {place}', back: 'सत्र पर लौटें: {place}', resume: '{story} · {place} जारी रखें',
    show: 'उत्तर दिखाएँ', hide: 'उत्तर छिपाएँ', reviewOffer: 'हो गया: छोटा दोहराव (वैकल्पिक)', reviewSkip: 'अनुवाद के प्रश्नों पर जाएँ',
    knew: 'हमें पता था', revisit: 'इस फ़्रेम को दोहराएँ', understood: 'समझ गया', confusing: 'उलझन: फ़्रेम फिर देखें',
    outline: 'रूपरेखा', how: 'यह कैसे काम करता है', end: 'सत्र समाप्त करें', inLang: '{lang} में', noSession: 'इस कहानी का {lang} में अभी कोई 5M सत्र नहीं है',
    startStory: 'इस कहानी का 5M सत्र', seeStories: 'सत्र वाली कहानियाँ देखें',
    durations: { intro: '', frames: '', community: '', m1: 'लगभग 150 मिनट', m2: '3–4 घंटे', drafting: '', m3: 'लगभग 60 मिनट', checking: '', m4: '60–90 मिनट', m5: '', conclusion: '' },
    helps: { tn: 'अनुवाद टिप्पणियाँ', tq: 'अनुवाद प्रश्न', twl: 'मुख्य शब्द', sn: 'अध्ययन टिप्पणियाँ', sq: 'अध्ययन प्रश्न', passage: 'अंश', academy: 'Translation Academy' },
    start: '5M सत्र शुरू करें', frameN: 'फ़्रेम {n}',
    view: { allList: 'सभी प्रश्न एक सूची में', instruction: 'मैनुअल का निर्देश', prevStep: 'पिछला चरण', nextStep: 'अगला चरण', close: 'बंद करें' },
  },
  ar: { // model-written, unreviewed
    parts: { intro: 'مقدمة', frames: 'الإطارات', community: 'المجتمع', m1: 'الحركة 1', m2: 'الحركة 2', drafting: 'المسودة', m3: 'الحركة 3', checking: 'التدقيق', m4: 'الحركة 4', m5: 'الحركة 5', conclusion: 'الخاتمة' },
    kinds: { block: 'نص', frame: 'إطار', 'm1-open': 'افتتاح', observation: 'ملاحظة', review: 'مراجعة', translation: 'ترجمة', question: 'سؤال', draft: 'مسودة', check: 'تدقيق', 'story-level': 'القصة كاملة' },
    place: '{part} · {kind} · الإطار {n}/{of}', placeNoFrame: '{part} · {kind}', placeQuestion: '{part} · {kind} {n}/{of}',
    bar: '{story} · {title}', next: 'التالي: {place}', back: 'العودة إلى الجلسة: {place}', resume: 'متابعة {story} · {place}',
    show: 'إظهار الإجابة', hide: 'إخفاء الإجابة', reviewOffer: 'انتهينا: مراجعة سريعة (اختيارية)', reviewSkip: 'الانتقال إلى أسئلة الترجمة',
    knew: 'كنا نعرف هذا', revisit: 'مراجعة هذا الإطار', understood: 'فهمت', confusing: 'غير واضح: العودة إلى الإطار',
    outline: 'المخطط', how: 'طريقة عمل الحركات الخمس', end: 'إنهاء الجلسة', inLang: 'بـ{lang}', noSession: 'ليس لهذه القصة جلسة 5M بـ{lang} بعد',
    startStory: 'جلسة 5M لهذه القصة', seeStories: 'عرض القصص التي لها جلسة',
    durations: { intro: '', frames: '', community: '', m1: 'حوالي 150 دقيقة', m2: '3–4 ساعات', drafting: '', m3: 'حوالي 60 دقيقة', checking: '', m4: '60–90 دقيقة', m5: '', conclusion: '' },
    helps: { tn: 'ملاحظات الترجمة', tq: 'أسئلة الترجمة', twl: 'الكلمات الرئيسية', sn: 'ملاحظات الدراسة', sq: 'أسئلة الدراسة', passage: 'المقطع', academy: 'Translation Academy' },
    start: 'ابدأ جلسة 5M', frameN: 'الإطار {n}',
    view: { allList: 'كل الأسئلة في قائمة واحدة', instruction: 'تعليمات الدليل', prevStep: 'الخطوة السابقة', nextStep: 'الخطوة التالية', close: 'إغلاق' },
  },
}

/** The words of the 5M session in the app's language (English for any other) */
export const W5 = (ui: string): Words5 => W[(Object.hasOwn(W, ui) ? ui : 'en') as L]
