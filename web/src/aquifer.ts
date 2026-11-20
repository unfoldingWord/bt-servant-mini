// Aquifer patches in the answers (plan-aquifer.md, "Reglas de la app"). A row that came from a patch catalog (`hi-x-aquifer`) carries
// `patch`, the provenance of its resource entry (language-pack-client patch.ts). The app shows what the client's README asks for, by
// `patch.review` only (never as human or AI translation: Aquifer does not say how its adaptations were made):
//   none / mixed: translation form unknown · community: reviewed by the community · professional: reviewed by Aquifer's editors.
// Each item gets a short tag, the answer one notice with the attribution and the license, About says it once, and the source line
// (so a report) names the patch and its review.
import type { PatchMark } from '@bt-synergy/language-pack-client'

export type { PatchMark }
export type Review = 'none' | 'community' | 'professional'
/** Where a patch's content comes from: `aquifer` (notes) or `yaapi` (an unaligned Bible text). */
export type Source = 'aquifer' | 'yaapi'
export const sourceOf = (m: { source?: string; patch?: string }): Source => (m.source === 'yaapi' || m.patch?.endsWith('-x-yaapi') ? 'yaapi' : 'aquifer')
/** The names of the versions, from the patch catalogs' resource entries (`title`), as the packs have them: key -> title. */
const TITLES = new Map<string, string>()
/** A version's name as a person says it: without the publisher in parentheses or a leading brand ("Biblica® Open Nueva Biblia Viva (Biblica, Inc.)" -> "Nueva Biblia Viva"). */
export const shortName = (title: string): string => {
  const s = title.replace(/\s*\([^)]*\)\s*$/, '').replace(/^Biblica[®™]?\s+(Open\s+)?/i, '').trim()
  return s || title
}
export const noteTitles = (list: readonly { key: string; title?: string }[]) => { for (const r of list) if (r.title) TITLES.set(r.key, shortName(r.title)) }
/** The key of a yaapi text's resource (`yaapi/es-419/SPAPDDPT`) from its mark. */
const yaapiKey = (m: { patch: string; release: string }): string => `yaapi/${m.patch.split('-x-')[0]}/${m.release.split('@')[0]}`
/** The readable name of a yaapi version (its catalog title), or its code when the catalog was not read. */
export const versionName = (m: { patch: string; release: string }): string => TITLES.get(yaapiKey(m)) ?? m.release.split('@')[0]!
/** The version of a yaapi text (`SPAPDDPT@sha256:…` -> SPAPDDPT). */
export const versionOf = (m: { release: string }): string => m.release.split('@')[0]!
export const reviewOf = (m: { review?: string } | undefined): Review => (m?.review === 'community' || m?.review === 'professional' ? m.review : 'none')

type Texts = {
  /** the short tag at the end of each note, question or introduction */
  tag: Record<Review, string>
  /** the notice of the answer: what the review says, and that it is not part of the language's official helps */
  notice: Record<Review, string>
  /** "Aquifer" as the heading of the notice */
  head: string
  /** the license line: {license} and {rights} */
  rights: string
  /** About */
  about: string
  /** the menu's switch */
  menu: string; on: string; off: string; hint: string
  /** yaapi Bible texts: the label, the notice ({version} {style}), the styles, the switch, About */
  yaapi: { unaligned: string; notice: string; styles: Record<string, string>; menu: string; hint: string; about: string }
}
const TEXTS: Record<string, Texts> = {
  en: {
    tag: { none: 'Aquifer · translation form unknown', community: 'Aquifer · community review', professional: 'Aquifer · editorial review' },
    notice: {
      none: 'Translation form unknown. Content from Aquifer; it is not part of the official helps of this language.',
      community: 'Community review. Content from Aquifer; it is not part of the official helps of this language.',
      professional: "Aquifer's editorial review. Content from Aquifer; it is not part of the official helps of this language.",
    },
    head: 'Aquifer', rights: '{license}. {rights}',
    about: 'Some helps (translation notes, questions, book introductions) that Door43 does not have in this language come from Aquifer (aquifer.bible), adapted from unfoldingWord resources and released under CC BY-SA 4.0. Door43 always comes first: Aquifer is used only where Door43 has nothing, and each item says so.',
    menu: 'Use Aquifer complementary helps', on: 'On', off: 'Off',
    hint: 'Fills notes, questions and introductions that Door43 lacks in this language. Door43 always comes first.',
    yaapi: { unaligned: "unaligned text", notice: "Bible text from yaapi.bible: {version}{style}. It is not Door43's literal aligned text: its words cannot be tapped and no note is tied to its words. It is not part of the official helps of this language.", styles: {"literal": "literal", "simple": "simple", "dynamic": "dynamic"}, menu: "Use yaapi Bible texts", hint: "Fills the Bible text of books Door43 has no text for. Door43 always comes first.", about: "Where Door43 has no Bible text of a book, the text of a published version from yaapi.bible fills it, unaligned and marked as such; its license is named with it." },
  },
  es: {
    tag: { none: 'Aquifer · forma de traducción desconocida', community: 'Aquifer · revisión de la comunidad', professional: 'Aquifer · revisión editorial' },
    notice: {
      none: 'Forma de traducción desconocida. Contenido de Aquifer; no es parte de las ayudas oficiales de este idioma.',
      community: 'Revisión de la comunidad. Contenido de Aquifer; no es parte de las ayudas oficiales de este idioma.',
      professional: 'Revisión editorial de Aquifer. Contenido de Aquifer; no es parte de las ayudas oficiales de este idioma.',
    },
    head: 'Aquifer', rights: '{license}. {rights}',
    about: 'Algunas ayudas (notas de traducción, preguntas, introducciones de libros) que Door43 no tiene en este idioma vienen de Aquifer (aquifer.bible), adaptadas de recursos de unfoldingWord y publicadas con CC BY-SA 4.0. Door43 va siempre primero: Aquifer se usa solo donde Door43 no tiene nada, y cada ayuda lo dice.',
    menu: 'Usar ayudas complementarias de Aquifer', on: 'Activado', off: 'Desactivado',
    hint: 'Llena notas, preguntas e introducciones que Door43 no tiene en este idioma. Door43 va siempre primero.',
    yaapi: { unaligned: "texto sin alinear", notice: "Texto bíblico de yaapi.bible: {version}{style}. No es el texto literal alineado de Door43: sus palabras no se pueden tocar y ninguna nota está ligada a sus palabras. No es parte de las ayudas oficiales de este idioma.", styles: {"literal": "literal", "simple": "simple", "dynamic": "dinámica"}, menu: "Usar textos bíblicos de yaapi", hint: "Llena el texto bíblico de los libros que Door43 no tiene. Door43 va siempre primero.", about: "Donde Door43 no tiene el texto bíblico de un libro, lo llena el texto de una versión publicada de yaapi.bible, sin alinear y marcado así; se nombra su licencia." },
  },
  fr: {
    tag: { none: 'Aquifer · mode de traduction inconnu', community: 'Aquifer · relecture communautaire', professional: 'Aquifer · relecture éditoriale' },
    notice: {
      none: "Mode de traduction inconnu. Contenu d'Aquifer ; il ne fait pas partie des aides officielles de cette langue.",
      community: "Relecture communautaire. Contenu d'Aquifer ; il ne fait pas partie des aides officielles de cette langue.",
      professional: "Relecture éditoriale d'Aquifer. Contenu d'Aquifer ; il ne fait pas partie des aides officielles de cette langue.",
    },
    head: 'Aquifer', rights: '{license}. {rights}',
    about: "Certaines aides (notes de traduction, questions, introductions des livres) que Door43 n'a pas dans cette langue viennent d'Aquifer (aquifer.bible), adaptées de ressources d'unfoldingWord et publiées sous CC BY-SA 4.0. Door43 passe toujours en premier : Aquifer n'est utilisé que là où Door43 n'a rien, et chaque aide le dit.",
    menu: 'Utiliser les aides complémentaires d\'Aquifer', on: 'Activé', off: 'Désactivé',
    hint: "Complète les notes, questions et introductions que Door43 n'a pas dans cette langue. Door43 passe toujours en premier.",
    yaapi: { unaligned: "texte non aligné", notice: "Texte biblique de yaapi.bible : {version}{style}. Ce n'est pas le texte littéral aligné de Door43 : ses mots ne se touchent pas et aucune note n'y est liée. Il ne fait pas partie des aides officielles de cette langue.", styles: {"literal": "littérale", "simple": "simple", "dynamic": "dynamique"}, menu: "Utiliser les textes bibliques de yaapi", hint: "Complète le texte biblique des livres que Door43 n'a pas. Door43 passe toujours en premier.", about: "Quand Door43 n'a pas le texte biblique d'un livre, celui d'une version publiée de yaapi.bible le remplace, non aligné et marqué comme tel ; sa licence est indiquée." },
  },
  id: {
    tag: { none: 'Aquifer · bentuk terjemahan tidak diketahui', community: 'Aquifer · ditinjau komunitas', professional: 'Aquifer · tinjauan editorial' },
    notice: {
      none: 'Bentuk terjemahan tidak diketahui. Isi dari Aquifer; bukan bagian dari bahan bantu resmi bahasa ini.',
      community: 'Ditinjau komunitas. Isi dari Aquifer; bukan bagian dari bahan bantu resmi bahasa ini.',
      professional: 'Tinjauan editorial Aquifer. Isi dari Aquifer; bukan bagian dari bahan bantu resmi bahasa ini.',
    },
    head: 'Aquifer', rights: '{license}. {rights}',
    about: 'Beberapa bahan bantu (catatan terjemahan, pertanyaan, pengantar kitab) yang tidak ada di Door43 untuk bahasa ini berasal dari Aquifer (aquifer.bible), diadaptasi dari sumber unfoldingWord dan dirilis dengan CC BY-SA 4.0. Door43 selalu didahulukan: Aquifer dipakai hanya jika Door43 tidak punya, dan setiap bahan bantu menyebutkannya.',
    menu: 'Gunakan bahan bantu pelengkap Aquifer', on: 'Aktif', off: 'Nonaktif',
    hint: 'Melengkapi catatan, pertanyaan, dan pengantar yang tidak ada di Door43 untuk bahasa ini. Door43 selalu didahulukan.',
    yaapi: { unaligned: "teks tanpa perataan", notice: "Teks Alkitab dari yaapi.bible: {version}{style}. Ini bukan teks literal yang diratakan dari Door43: katanya tidak bisa diketuk dan tidak ada catatan yang terkait dengan katanya. Bukan bagian dari bahan bantu resmi bahasa ini.", styles: {"literal": "literal", "simple": "sederhana", "dynamic": "dinamis"}, menu: "Gunakan teks Alkitab yaapi", hint: "Melengkapi teks Alkitab kitab yang tidak ada di Door43. Door43 selalu didahulukan.", about: "Jika Door43 tidak punya teks Alkitab sebuah kitab, teks versi terbitan dari yaapi.bible mengisinya, tanpa perataan dan diberi tanda; lisensinya disebutkan." },
  },
  hi: {
    tag: { none: 'Aquifer · अनुवाद का रूप अज्ञात', community: 'Aquifer · समुदाय की समीक्षा', professional: 'Aquifer · संपादकीय समीक्षा' },
    notice: {
      none: 'अनुवाद का रूप अज्ञात है। यह सामग्री Aquifer से है; यह इस भाषा की आधिकारिक सहायताओं का हिस्सा नहीं है।',
      community: 'समुदाय द्वारा समीक्षित। यह सामग्री Aquifer से है; यह इस भाषा की आधिकारिक सहायताओं का हिस्सा नहीं है।',
      professional: 'Aquifer की संपादकीय समीक्षा। यह सामग्री Aquifer से है; यह इस भाषा की आधिकारिक सहायताओं का हिस्सा नहीं है।',
    },
    head: 'Aquifer', rights: '{license}. {rights}',
    about: 'कुछ सहायताएँ (अनुवाद नोट्स, प्रश्न, पुस्तक परिचय) जो इस भाषा में Door43 में नहीं हैं, Aquifer (aquifer.bible) से आती हैं; वे unfoldingWord के संसाधनों से अपनाई गई हैं और CC BY-SA 4.0 के अंतर्गत प्रकाशित हैं। Door43 हमेशा पहले आता है: Aquifer केवल वहीं उपयोग होता है जहाँ Door43 में कुछ नहीं है, और हर सहायता यह बताती है।',
    menu: 'Aquifer की पूरक सहायताएँ उपयोग करें', on: 'चालू', off: 'बंद',
    hint: 'इस भाषा में Door43 में जो नोट्स, प्रश्न और परिचय नहीं हैं, उन्हें भरता है। Door43 हमेशा पहले आता है।',
    yaapi: { unaligned: "अलाइन नहीं किया गया पाठ", notice: "yaapi.bible से बाइबल पाठ: {version}{style}। यह Door43 का शाब्दिक अलाइन किया गया पाठ नहीं है: इसके शब्द छुए नहीं जा सकते और कोई नोट इसके शब्दों से जुड़ा नहीं है। यह इस भाषा की आधिकारिक सहायताओं का हिस्सा नहीं है।", styles: {"literal": "शाब्दिक", "simple": "सरल", "dynamic": "भावानुवाद"}, menu: "yaapi के बाइबल पाठ उपयोग करें", hint: "उन पुस्तकों का बाइबल पाठ भरता है जो Door43 में नहीं हैं। Door43 हमेशा पहले आता है।", about: "जहाँ Door43 में किसी पुस्तक का बाइबल पाठ नहीं है, वहाँ yaapi.bible के प्रकाशित संस्करण का पाठ उसे भरता है, बिना अलाइन किए और वैसा चिह्नित; उसका लाइसेंस बताया जाता है।" },
  },
  ar: {
    tag: { none: 'Aquifer · شكل الترجمة غير معروف', community: 'Aquifer · مراجعة المجتمع', professional: 'Aquifer · مراجعة تحريرية' },
    notice: {
      none: 'شكل الترجمة غير معروف. محتوى من Aquifer؛ وليس جزءًا من المساعدات الرسمية لهذه اللغة.',
      community: 'مراجعة المجتمع. محتوى من Aquifer؛ وليس جزءًا من المساعدات الرسمية لهذه اللغة.',
      professional: 'مراجعة Aquifer التحريرية. محتوى من Aquifer؛ وليس جزءًا من المساعدات الرسمية لهذه اللغة.',
    },
    head: 'Aquifer', rights: '{license}. {rights}',
    about: 'بعض المساعدات (ملاحظات الترجمة والأسئلة ومقدمات الأسفار) التي ليست في Door43 لهذه اللغة تأتي من Aquifer (aquifer.bible)، وهي مقتبسة من موارد unfoldingWord ومنشورة برخصة CC BY-SA 4.0. تأتي Door43 دائمًا أولًا: لا يُستخدم Aquifer إلا حيث لا شيء في Door43، وكل مساعدة تذكر ذلك.',
    menu: 'استخدام مساعدات Aquifer المكمّلة', on: 'مفعّل', off: 'معطّل',
    hint: 'يملأ الملاحظات والأسئلة والمقدمات التي ليست في Door43 لهذه اللغة. تأتي Door43 دائمًا أولًا.',
    yaapi: { unaligned: "نص غير محاذى", notice: "نص الكتاب المقدس من yaapi.bible: {version}{style}. ليس النص الحرفي المحاذى من Door43: لا يمكن النقر على كلماته ولا توجد ملاحظة مرتبطة بكلماته. وليس جزءًا من المساعدات الرسمية لهذه اللغة.", styles: {"literal": "حرفية", "simple": "مبسطة", "dynamic": "بالمعنى"}, menu: "استخدام نصوص yaapi الكتابية", hint: "يملأ النص الكتابي للأسفار التي ليست في Door43. تأتي Door43 دائمًا أولًا.", about: "حيث لا يملك Door43 النص الكتابي لسفر، يملؤه نص نسخة منشورة من yaapi.bible، غير محاذى ومعلَّم بذلك؛ وتُذكر رخصته." },
  },
}
const T = (lang: string): Texts => TEXTS[lang.split('-')[0]!] ?? TEXTS.en!

/** The short tag of one item that came from a patch. */
export const patchTag = (lang: string, m: PatchMark): string =>
  sourceOf(m) === 'yaapi' ? `yaapi · ${T(lang).yaapi.unaligned}` : T(lang).tag[reviewOf(m)]
/** "CC-BY-SA-4.0" -> "CC BY-SA 4.0" */
export const licenseName = (id: string): string => id.replace(/^CC-/, 'CC ').replace(/-(\d)/, ' $1')

/**
 * The notice that ends an answer with items from patches: what the review of each patch says, with the attribution the
 * license asks for and the adaptation notice (`rights`, `attribution` of the row). One paragraph per patch and review; ''
 * when no item came from a patch.
 */
export function patchNotice(lang: string, marks: readonly PatchMark[]): string {
  const t = T(lang)
  const seen = new Map<string, PatchMark>()
  for (const m of marks) seen.set(`${m.patch}|${reviewOf(m)}|${m.release}`, m)
  return [...seen.values()].map((m) => {
    const y = sourceOf(m) === 'yaapi'
    const style = m.style ? ` (${t.yaapi.styles[m.style] ?? m.style})` : ''
    const lines = [y ? `**yaapi.** ${t.yaapi.notice.replace('{version}', versionName(m) === versionOf(m) ? versionOf(m) : `${versionName(m)} (${versionOf(m)})`).replace('{style}', style)}` : `**${t.head}.** ${t.notice[reviewOf(m)]}`]
    if (m.attribution) lines.push(m.attribution)
    lines.push(t.rights.replace('{license}', licenseName(m.license)).replace('{rights}', m.rights ?? '').trim().replace(/\.\s*$/, '.'))
    return lines.join('\n')
  }).join('\n\n')
}
/** The source-line entry of a patch (a report carries the source line): the patch and its review. */
export const patchCite = (m: PatchMark): string =>
  sourceOf(m) === 'yaapi' ? `yaapi-patch ${m.patch}:${versionOf(m)} (${m.license}, ${m.release})` : `aquifer-patch ${m.patch}:${reviewOf(m)} (${m.license}, ${m.release})`
/** The note for the online AI's context: say where these notes come from when you use them. */
export const patchForAI = (m: PatchMark): string =>
  `(These translation notes are from Aquifer, ${m.rights ?? 'adapted from unfoldingWord'}, ${licenseName(m.license)}; review: ${reviewOf(m)}. They are not part of the official helps of this language. When you use them, say they come from Aquifer.)`

/** The note for the online AI's context when the surrounding verses are a yaapi text. */
export const patchTextForAI = (m: PatchMark): string =>
  `(These verses are the unaligned Bible text ${versionOf(m)} from yaapi.bible, ${licenseName(m.license)}${m.rights ? `, ${m.rights}` : ''}. It is not Door43's literal text. When you quote it, say it comes from yaapi.bible.)`
export const aquiferAbout = (lang: string): string => T(lang).about
export const yaapiAbout = (lang: string): string => T(lang).yaapi.about
export const yaapiMenu = (lang: string): { title: string; on: string; off: string; hint: string } => {
  const t = T(lang)
  return { title: t.yaapi.menu, on: t.on, off: t.off, hint: t.yaapi.hint }
}
export const aquiferMenu = (lang: string): { title: string; on: string; off: string; hint: string } => {
  const t = T(lang)
  return { title: t.menu, on: t.on, off: t.off, hint: t.hint }
}
