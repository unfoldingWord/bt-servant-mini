// The words of the place answers (diseno-mapas.md 5.3, 5.5) that are not the location, distance and days sentences (those are in answer.ts):
// buttons, headings, tags of the list next to the map, the credit line. Whole phrases per language, never built word by word.
// hi, ar: pending native review

export type PlaceText = {
  choosePlace: string; choosePerson: string; otherPlace: string
  seeMap: string; appears: string; happenedHere: string; eventsHead: string; eventsNone: string; allEvents: string; together: string; card: string
  listHead: string; listPassage: string; passageNone: string
  tagUncertain: string; tagRegion: string; tagWater: string; tagUnknown: string; tagRef: string
  sumPlace: string; sumMany: string; sumPassage: string
  noGeo: string; named: string; named1: string
  /** the credit line: {src} the sources of the places; the map's own credit follows when a map is shown */
  credit: string; creditMap: string
  mapWord: string
}

export const PLACE_T: Record<'en' | 'es' | 'fr' | 'id' | 'hi' | 'ar', PlaceText> = {
  en: {
    choosePlace: 'Several places are called {x}. Which one?', choosePerson: 'Several people are called {x}. Which one?', otherPlace: 'Another {x}?',
    seeMap: 'See on the map', appears: 'Where it appears ({n})', happenedHere: 'It happened here:', eventsHead: 'What happened in {x} ({n}):',
    eventsNone: 'The data I have lists no events in {x}.', allEvents: 'See all ({n})', together: 'They appear together in:', card: 'Details of {x}',
    listHead: 'Places on the map:', listPassage: 'Places in {ref}:', passageNone: 'The data I have shows no places with a location in {ref}.',
    tagUncertain: 'uncertain location', tagRegion: 'region', tagWater: 'water', tagUnknown: 'location unknown', tagRef: 'for reference',
    sumPlace: 'Map: {x}', sumMany: 'Map: {x}', sumPassage: 'Map: {n} places in {ref}',
    noGeo: 'The data I have do not say where the places are.', named: 'Named in {n} verses.', named1: 'Named in 1 verse.',
    credit: 'Places: {src}.', creditMap: 'Places: {src} · map: Natural Earth.', mapWord: 'Map',
  },
  es: {
    choosePlace: 'Hay varios lugares llamados {x}. ¿Cuál?', choosePerson: 'Hay varias personas llamadas {x}. ¿Cuál?', otherPlace: '¿Otra {x}?',
    seeMap: 'Ver en el mapa', appears: 'Dónde aparece ({n})', happenedHere: 'Aquí pasó:', eventsHead: 'Qué pasó en {x} ({n}):',
    eventsNone: 'Los datos que tengo no listan eventos en {x}.', allEvents: 'Ver todos ({n})', together: 'Aparecen juntos en:', card: 'Ficha de {x}',
    listHead: 'Lugares del mapa:', listPassage: 'Lugares en {ref}:', passageNone: 'Los datos que tengo no muestran lugares con ubicación en {ref}.',
    tagUncertain: 'ubicación incierta', tagRegion: 'región', tagWater: 'agua', tagUnknown: 'ubicación desconocida', tagRef: 'de referencia',
    sumPlace: 'Mapa: {x}', sumMany: 'Mapa: {x}', sumPassage: 'Mapa: {n} lugares en {ref}',
    noGeo: 'Los datos que tengo no dicen dónde están los lugares.', named: 'Se nombra en {n} versículos.', named1: 'Se nombra en 1 versículo.',
    credit: 'Lugares: {src}.', creditMap: 'Lugares: {src} · mapa: Natural Earth.', mapWord: 'Mapa',
  },
  fr: {
    choosePlace: 'Plusieurs lieux s’appellent {x}. Lequel ?', choosePerson: 'Plusieurs personnes s’appellent {x}. Laquelle ?', otherPlace: 'Un autre lieu appelé {x} ?',
    seeMap: 'Voir sur la carte', appears: 'Où il apparaît ({n})', happenedHere: 'C’est ici que s’est passé :', eventsHead: 'Ce qui s’est passé à {x} ({n}) :',
    eventsNone: 'Les données que j’ai ne listent aucun événement à {x}.', allEvents: 'Voir tout ({n})', together: 'Ils apparaissent ensemble en :', card: 'Fiche de {x}',
    listHead: 'Lieux de la carte :', listPassage: 'Lieux dans {ref} :', passageNone: 'Les données que j’ai ne montrent aucun lieu localisé dans {ref}.',
    tagUncertain: 'emplacement incertain', tagRegion: 'région', tagWater: 'eau', tagUnknown: 'emplacement inconnu', tagRef: 'repère',
    sumPlace: 'Carte : {x}', sumMany: 'Carte : {x}', sumPassage: 'Carte : {n} lieux dans {ref}',
    noGeo: 'Les données que j’ai ne disent pas où sont les lieux.', named: 'Nommé dans {n} versets.', named1: 'Nommé dans 1 verset.',
    credit: 'Lieux : {src}.', creditMap: 'Lieux : {src} · carte : Natural Earth.', mapWord: 'Carte',
  },
  id: {
    choosePlace: 'Ada beberapa tempat bernama {x}. Yang mana?', choosePerson: 'Ada beberapa orang bernama {x}. Yang mana?', otherPlace: '{x} yang lain?',
    seeMap: 'Lihat di peta', appears: 'Di mana muncul ({n})', happenedHere: 'Terjadi di sini:', eventsHead: 'Apa yang terjadi di {x} ({n}):',
    eventsNone: 'Data yang saya punya tidak mendaftar peristiwa di {x}.', allEvents: 'Lihat semua ({n})', together: 'Keduanya muncul bersama di:', card: 'Kartu {x}',
    listHead: 'Tempat di peta:', listPassage: 'Tempat di {ref}:', passageNone: 'Data yang saya punya tidak menunjukkan tempat berlokasi di {ref}.',
    tagUncertain: 'lokasi tidak pasti', tagRegion: 'wilayah', tagWater: 'perairan', tagUnknown: 'lokasi tidak diketahui', tagRef: 'sebagai acuan',
    sumPlace: 'Peta: {x}', sumMany: 'Peta: {x}', sumPassage: 'Peta: {n} tempat di {ref}',
    noGeo: 'Data yang saya punya tidak menyebut di mana tempat-tempat itu.', named: 'Disebut dalam {n} ayat.', named1: 'Disebut dalam 1 ayat.',
    credit: 'Tempat: {src}.', creditMap: 'Tempat: {src} · peta: Natural Earth.', mapWord: 'Peta',
  },
  hi: {
    choosePlace: '{x} नाम के कई स्थान हैं। कौन सा?', choosePerson: '{x} नाम के कई लोग हैं। कौन से?', otherPlace: 'कोई और {x}?',
    seeMap: 'नक्शे पर देखें', appears: 'कहाँ आता है ({n})', happenedHere: 'यहाँ हुआ:', eventsHead: '{x} में क्या हुआ ({n}):',
    eventsNone: 'मेरे पास के आँकड़ों में {x} की कोई घटना नहीं है।', allEvents: 'सभी देखें ({n})', together: 'दोनों एक साथ यहाँ आते हैं:', card: '{x} का विवरण',
    listHead: 'नक्शे के स्थान:', listPassage: '{ref} के स्थान:', passageNone: 'मेरे पास के आँकड़े {ref} में कोई स्थान नहीं दिखाते जिसका ठिकाना मालूम हो।',
    tagUncertain: 'ठिकाना अनिश्चित', tagRegion: 'क्षेत्र', tagWater: 'जल', tagUnknown: 'ठिकाना अज्ञात', tagRef: 'संदर्भ के लिए',
    sumPlace: 'नक्शा: {x}', sumMany: 'नक्शा: {x}', sumPassage: 'नक्शा: {ref} में {n} स्थान',
    noGeo: 'मेरे पास के आँकड़े नहीं बताते कि स्थान कहाँ हैं।', named: '{n} पदों में नाम आता है।', named1: '1 पद में नाम आता है।',
    credit: 'स्थान: {src}।', creditMap: 'स्थान: {src} · नक्शा: Natural Earth।', mapWord: 'नक्शा',
  },
  ar: {
    choosePlace: 'هناك عدة أماكن اسمها {x}. أيّها؟', choosePerson: 'هناك عدة أشخاص اسمهم {x}. أيّهم؟', otherPlace: '{x} آخر؟',
    seeMap: 'عرض على الخريطة', appears: 'أين يظهر ({n})', happenedHere: 'حدث هنا:', eventsHead: 'ماذا حدث في {x} ({n}):',
    eventsNone: 'البيانات التي لدي لا تذكر أحداثًا في {x}.', allEvents: 'عرض الكل ({n})', together: 'يظهران معًا في:', card: 'بطاقة {x}',
    listHead: 'أماكن الخريطة:', listPassage: 'الأماكن في {ref}:', passageNone: 'البيانات التي لدي لا تُظهر أماكن لها موقع في {ref}.',
    tagUncertain: 'موقع غير مؤكد', tagRegion: 'منطقة', tagWater: 'ماء', tagUnknown: 'موقع غير معروف', tagRef: 'للمقارنة',
    sumPlace: 'خريطة: {x}', sumMany: 'خريطة: {x}', sumPassage: 'خريطة: {n} أماكن في {ref}',
    noGeo: 'البيانات التي لدي لا تقول أين تقع الأماكن.', named: 'يُذكر في {n} آية.', named1: 'يُذكر في آية واحدة.',
    credit: 'الأماكن: {src}.', creditMap: 'الأماكن: {src} · الخريطة: Natural Earth.', mapWord: 'خريطة',
  },
}
export const PLT = (ui: string): PlaceText => PLACE_T[((ui || '').slice(0, 2).toLowerCase() in PLACE_T ? (ui || '').slice(0, 2).toLowerCase() : 'en') as keyof typeof PLACE_T]

/** Whether a line is the credit of a place answer (any language): main.ts draws it small, as a source label. */
export function isPlaceCredit(t: string): boolean {
  const s = t.trim()
  return Object.values(PLACE_T).some((x) => s.startsWith(x.credit.split('{src}')[0]!.trim()))
}

/** The sources of a place answer as its credit line names them (the place data's own keys, plus TIPNR and ACAI that name the places). */
export const PLACE_SOURCES: Record<string, string> = {
  'openbibleinfo/Bible-Geocoding-Data': 'OpenBible.info', 'STEPBible/STEPBible-Data/TIPNR': 'TIPNR (STEPBible)',
  'BibleAquifer/ACAI': 'ACAI (BiblioNexus)', 'robertrouse/theographic-bible-metadata': 'Theographic',
}
