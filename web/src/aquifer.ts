// Aquifer patches in the answers (plan-aquifer.md, "Reglas de la app"). A row that came from a patch catalog (`hi-x-aquifer`) carries
// `patch`, the provenance of its resource entry (language-pack-client patch.ts). The app shows what the client's README asks for, by
// `patch.review` only (never as human or AI translation: Aquifer does not say how its adaptations were made):
//   none / mixed: translation form unknown · community: reviewed by the community · professional: reviewed by Aquifer's editors.
// Each item gets a short tag, the answer one notice with the attribution and the license, About says it once, and the source line
// (so a report) names the patch and its review.
import type { PatchMark } from '@bt-synergy/language-pack-client'

export type { PatchMark }
export type Review = 'none' | 'community' | 'professional'
export const reviewOf = (m: { review?: string } | undefined): Review => (m?.review === 'community' || m?.review === 'professional' ? m.review : 'none')

type Texts = {
  /** the short tag at the end of each note, question or introduction */
  tag: Record<Review, string>
  /** the notice of the answer: what the review says, and that it is not part of the language's official pack */
  notice: Record<Review, string>
  /** "Aquifer" as the heading of the notice */
  head: string
  /** the license line: {license} and {rights} */
  rights: string
  /** About */
  about: string
  /** the menu's switch */
  menu: string; on: string; off: string; hint: string
}
const TEXTS: Record<string, Texts> = {
  en: {
    tag: { none: 'Aquifer · translation form unknown', community: 'Aquifer · community review', professional: 'Aquifer · editorial review' },
    notice: {
      none: 'Translation form unknown. Content from Aquifer; it is not part of the official pack of this language.',
      community: 'Community review. Content from Aquifer; it is not part of the official pack of this language.',
      professional: "Aquifer's editorial review. Content from Aquifer; it is not part of the official pack of this language.",
    },
    head: 'Aquifer', rights: '{license}. {rights}',
    about: 'Some helps (translation notes, questions, book introductions) that the language pack from Door43 does not have come from Aquifer (aquifer.bible), adapted from unfoldingWord resources and released under CC BY-SA 4.0. Door43 always comes first: Aquifer is used only where Door43 has nothing, and each item says so.',
    menu: 'Use Aquifer complementary helps', on: 'On', off: 'Off',
    hint: 'Fills notes, questions and introductions that the language pack lacks. Door43 always comes first.',
  },
  es: {
    tag: { none: 'Aquifer · forma de traducción desconocida', community: 'Aquifer · revisión de la comunidad', professional: 'Aquifer · revisión editorial' },
    notice: {
      none: 'Forma de traducción desconocida. Contenido de Aquifer; no es parte del paquete oficial de este idioma.',
      community: 'Revisión de la comunidad. Contenido de Aquifer; no es parte del paquete oficial de este idioma.',
      professional: 'Revisión editorial de Aquifer. Contenido de Aquifer; no es parte del paquete oficial de este idioma.',
    },
    head: 'Aquifer', rights: '{license}. {rights}',
    about: 'Algunas ayudas (notas de traducción, preguntas, introducciones de libros) que el paquete del idioma de Door43 no tiene vienen de Aquifer (aquifer.bible), adaptadas de recursos de unfoldingWord y publicadas con CC BY-SA 4.0. Door43 va siempre primero: Aquifer se usa solo donde Door43 no tiene nada, y cada ayuda lo dice.',
    menu: 'Usar ayudas complementarias de Aquifer', on: 'Activado', off: 'Desactivado',
    hint: 'Llena notas, preguntas e introducciones que le faltan al paquete del idioma. Door43 va siempre primero.',
  },
  fr: {
    tag: { none: 'Aquifer · mode de traduction inconnu', community: 'Aquifer · relecture communautaire', professional: 'Aquifer · relecture éditoriale' },
    notice: {
      none: "Mode de traduction inconnu. Contenu d'Aquifer ; il ne fait pas partie du paquet officiel de cette langue.",
      community: "Relecture communautaire. Contenu d'Aquifer ; il ne fait pas partie du paquet officiel de cette langue.",
      professional: "Relecture éditoriale d'Aquifer. Contenu d'Aquifer ; il ne fait pas partie du paquet officiel de cette langue.",
    },
    head: 'Aquifer', rights: '{license}. {rights}',
    about: "Certaines aides (notes de traduction, questions, introductions des livres) que le paquet de langue de Door43 n'a pas viennent d'Aquifer (aquifer.bible), adaptées de ressources d'unfoldingWord et publiées sous CC BY-SA 4.0. Door43 passe toujours en premier : Aquifer n'est utilisé que là où Door43 n'a rien, et chaque aide le dit.",
    menu: 'Utiliser les aides complémentaires d\'Aquifer', on: 'Activé', off: 'Désactivé',
    hint: 'Complète les notes, questions et introductions qui manquent au paquet de la langue. Door43 passe toujours en premier.',
  },
  id: {
    tag: { none: 'Aquifer · bentuk terjemahan tidak diketahui', community: 'Aquifer · ditinjau komunitas', professional: 'Aquifer · tinjauan editorial' },
    notice: {
      none: 'Bentuk terjemahan tidak diketahui. Isi dari Aquifer; bukan bagian dari paket resmi bahasa ini.',
      community: 'Ditinjau komunitas. Isi dari Aquifer; bukan bagian dari paket resmi bahasa ini.',
      professional: 'Tinjauan editorial Aquifer. Isi dari Aquifer; bukan bagian dari paket resmi bahasa ini.',
    },
    head: 'Aquifer', rights: '{license}. {rights}',
    about: 'Beberapa bahan bantu (catatan terjemahan, pertanyaan, pengantar kitab) yang tidak ada di paket bahasa dari Door43 berasal dari Aquifer (aquifer.bible), diadaptasi dari sumber unfoldingWord dan dirilis dengan CC BY-SA 4.0. Door43 selalu didahulukan: Aquifer dipakai hanya jika Door43 tidak punya, dan setiap bahan bantu menyebutkannya.',
    menu: 'Gunakan bahan bantu pelengkap Aquifer', on: 'Aktif', off: 'Nonaktif',
    hint: 'Melengkapi catatan, pertanyaan, dan pengantar yang tidak ada di paket bahasa. Door43 selalu didahulukan.',
  },
  hi: {
    tag: { none: 'Aquifer · अनुवाद का रूप अज्ञात', community: 'Aquifer · समुदाय की समीक्षा', professional: 'Aquifer · संपादकीय समीक्षा' },
    notice: {
      none: 'अनुवाद का रूप अज्ञात है। यह सामग्री Aquifer से है; यह इस भाषा के आधिकारिक पैकेज का हिस्सा नहीं है।',
      community: 'समुदाय द्वारा समीक्षित। यह सामग्री Aquifer से है; यह इस भाषा के आधिकारिक पैकेज का हिस्सा नहीं है।',
      professional: 'Aquifer की संपादकीय समीक्षा। यह सामग्री Aquifer से है; यह इस भाषा के आधिकारिक पैकेज का हिस्सा नहीं है।',
    },
    head: 'Aquifer', rights: '{license}. {rights}',
    about: 'कुछ सहायताएँ (अनुवाद नोट्स, प्रश्न, पुस्तक परिचय) जो Door43 के भाषा पैकेज में नहीं हैं, Aquifer (aquifer.bible) से आती हैं; वे unfoldingWord के संसाधनों से अपनाई गई हैं और CC BY-SA 4.0 के अंतर्गत प्रकाशित हैं। Door43 हमेशा पहले आता है: Aquifer केवल वहीं उपयोग होता है जहाँ Door43 में कुछ नहीं है, और हर सहायता यह बताती है।',
    menu: 'Aquifer की पूरक सहायताएँ उपयोग करें', on: 'चालू', off: 'बंद',
    hint: 'भाषा पैकेज में जो नोट्स, प्रश्न और परिचय नहीं हैं, उन्हें भरता है। Door43 हमेशा पहले आता है।',
  },
  ar: {
    tag: { none: 'Aquifer · شكل الترجمة غير معروف', community: 'Aquifer · مراجعة المجتمع', professional: 'Aquifer · مراجعة تحريرية' },
    notice: {
      none: 'شكل الترجمة غير معروف. محتوى من Aquifer؛ وليس جزءًا من الحزمة الرسمية لهذه اللغة.',
      community: 'مراجعة المجتمع. محتوى من Aquifer؛ وليس جزءًا من الحزمة الرسمية لهذه اللغة.',
      professional: 'مراجعة Aquifer التحريرية. محتوى من Aquifer؛ وليس جزءًا من الحزمة الرسمية لهذه اللغة.',
    },
    head: 'Aquifer', rights: '{license}. {rights}',
    about: 'بعض المساعدات (ملاحظات الترجمة والأسئلة ومقدمات الأسفار) التي ليست في حزمة اللغة من Door43 تأتي من Aquifer (aquifer.bible)، وهي مقتبسة من موارد unfoldingWord ومنشورة برخصة CC BY-SA 4.0. تأتي Door43 دائمًا أولًا: لا يُستخدم Aquifer إلا حيث لا شيء في Door43، وكل مساعدة تذكر ذلك.',
    menu: 'استخدام مساعدات Aquifer المكمّلة', on: 'مفعّل', off: 'معطّل',
    hint: 'يملأ الملاحظات والأسئلة والمقدمات التي ينقصها حزمة اللغة. تأتي Door43 دائمًا أولًا.',
  },
}
const T = (lang: string): Texts => TEXTS[lang.split('-')[0]!] ?? TEXTS.en!

/** The short tag of one item that came from a patch. */
export const patchTag = (lang: string, m: PatchMark): string => T(lang).tag[reviewOf(m)]
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
    const lines = [`**${t.head}.** ${t.notice[reviewOf(m)]}`]
    if (m.attribution) lines.push(m.attribution)
    lines.push(t.rights.replace('{license}', licenseName(m.license)).replace('{rights}', m.rights ?? '').trim().replace(/\.\s*$/, '.'))
    return lines.join('\n')
  }).join('\n\n')
}
/** The source-line entry of a patch (a report carries the source line): the patch and its review. */
export const patchCite = (m: PatchMark): string => `aquifer-patch ${m.patch}:${reviewOf(m)} (${m.license}, ${m.release})`
/** The note for the online AI's context: say where these notes come from when you use them. */
export const patchForAI = (m: PatchMark): string =>
  `(These translation notes are from Aquifer, ${m.rights ?? 'adapted from unfoldingWord'}, ${licenseName(m.license)}; review: ${reviewOf(m)}. They are not part of the language's official pack. When you use them, say they come from Aquifer.)`

export const aquiferAbout = (lang: string): string => T(lang).about
export const aquiferMenu = (lang: string): { title: string; on: string; off: string; hint: string } => {
  const t = T(lang)
  return { title: t.menu, on: t.on, off: t.off, hint: t.hint }
}
