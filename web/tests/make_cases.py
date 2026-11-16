"""Writes the answer-test cases in web/tests/cases/*.jsonl from the experiments repo (../fase0-mini-servant/data) plus the
user reports and the Quechua translator's questions written here. Run it again after changing the data or a `KNOWN` entry:
   python -I -X utf8 web/tests/make_cases.py
Each case: the question, what a reader gives (gold slots, or a gold call sheet, or none = code only), the turns before it,
what the answer must be (route, ref, article, regexes, found something), and `known` when it is expected to fail today."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent.parent.parent / 'fase0-mini-servant' / 'data'
OUT = HERE / 'cases'
UI = {'es-419': 'es'}


def jl(p):
    return [json.loads(l) for l in p.read_text(encoding='utf-8').splitlines() if l.strip()]


def ref_of(book, ch=None, v1=None, v2=None, what=()):
    if list(what) == ['intro']:
        return f'{book} {ch}:intro' if ch else f'{book} front:intro'
    if not ch:
        return book
    if not v1:
        return f'{book} {ch}'
    return f'{book} {ch}:{v1}' + (f'-{v2}' if v2 and v2 > v1 else '')


R_OBS = 'no Open Bible Stories in the packs on disk'
R_TU = 'translate-unknown route takes a "how do I translate" question about a quoted phrase: a word of the verse names an article'
R_OPEN = 'isOpen: a kind word ("question", "notes") plus 2+ keywords turns it into a free search, over the reader intent'
R_HI = 'hi pack has the book but not its notes/intro/questions, and the answer does not fall back to English helps'
R_TERM = 'the term in this language names no article (glossary / pack names)'
R_BOOKS = 'the whichBooks vocabulary misses this wording'
R_MEANING = 'the meaning route is not taken for this wording or language'
R_ISA = 'Isaiah is not in the packs on disk'
# Expected to fail today, by case id: why. Reported apart, never fail the build; flagged when they start passing.
KNOWN = {
    'obs-3-5-text': R_OBS, 'obs-notes-3-4': R_OBS, 'ta-rhetorical-question': R_OPEN,
    **{i: R_TU for i in ['advice-rut-1-13-hand-of-yahweh', 'advice-jon-2-10-vomited-nonote', 'advice-tit-3-5-lavamiento',
                         'advice-rut-1-14-alzaron-voces', 'advice-tit-1-12-malas-bestias', 'evl-id-04', 'evl-hi-04', 'evl-hi-27',
                         'evl-hi-28', 'evl-fr-04', 'evl-fr-10', 'evl-fr-27', 'evl-fr-28', 'evl-ar-04']},
    **{i: R_HI for i in ['evl-hi-05', 'evl-hi-14', 'evl-hi-15', 'evl-hi-22', 'fu-hi-what', 'fu-hi-count_ch',
                         'fu-hi-what-code', 'fu-hi-count_ch-code', 'fu-hi-new_passage-code']},
    **{i: R_OPEN for i in ['evl-hi-26', 'evl-ar-26']},
    **{i: R_TERM for i in ['evl-hi-21', 'evl-ar-19', 'evl-ar-20', 'evl-ar-21', 'new-id-unknown', 'new-ar-unknown', 'fu-hi-new_topic',
                           'fu-ar-new_topic', 'fu-hi-new_topic-code', 'fu-ar-new_topic-code']},
    'new-en-unknown': 'the howTranslate vocabulary has no "render"',
    'new-fr-unknown': '"olivier" names no article, and there is no fr pack: "no pack" answer',
    **{i: R_BOOKS for i in ['new-es-books', 'new-id-books']},
    **{i: R_MEANING for i in ['new-ar-meaning', 'quechua-05']},
    **{i: R_ISA for i in ['fu-en-term_book', 'fu-es-term_book', 'fu-fr-term_book', 'fu-id-term_book', 'fu-hi-term_book']},
    'quechua-16': 'a question in Quechua: should answer in the app language and suggest asking in Spanish',
    'quechua-16-code': 'a question in Quechua: should answer in the app language and suggest asking in Spanish',
    'quechua-05-code': R_MEANING,
    **{i: 'with no reader, "Rut 3:9 que quiere decir <phrase>" reads as a passage, so the meaning route answers instead of the notes on the phrase'
       for i in ['quechua-06-code', 'quechua-11-code', 'quechua-14-code']},
    'quechua-20-code': 'with no reader, "que figuras de lenguaje hay en Jonas 2" reads as a passage, not a rank of the figures',
}


# The fast part (build.py's default, ANSWERS=fast): the reports, and cases that need no free search (each a few ms), so
# every route but the slow searches runs on every build. The full run (bun test, build.py --full) has all.
FAST = set('''tw-sheol count-jonah-metaphor text-ruth-1-16-ult ta-metonymy notes-john-3-16 resources-indonesian tw-covenant index-ruth1-issues ta-abstract-nouns words-ruth-1-1 text-isaiah-ult-missing intro-jonah tw-pacto-es questions-jonah-1 tw-son-of-god count-jonah-1-3 tw-call-senses text-jonah-1-17-ust resources-tw-languages advice-jon-2-3-heart-of-seas advice-rut-2-12-under-wings advice-jon-1-4-ship-thinking advice-rut-1-21-why-call-naomi advice-rut-1-20-bitter-nonote advice-jon-1-3-face-of-yahweh advice-tit-2-11-gracia-manifestada quechua-01 quechua-02 quechua-03 quechua-04 quechua-06 quechua-07 quechua-09 quechua-10 quechua-11 quechua-12 quechua-13 quechua-14 quechua-15 quechua-17 quechua-18 quechua-19 quechua-20 fu-en-what fu-en-verse fu-en-next fu-en-term_here fu-en-count_ch fu-en-new_topic fu-en-new_ref fu-es-what fu-es-verse fu-es-next fu-es-term_here fu-es-count_ch fu-es-new_topic fu-es-new_ref'''.split())


def q36():
    gold = {g['id']: g for g in jl(DATA / 'gold-sheets.jsonl')}
    out = []
    for q in jl(DATA / 'questions-all.jsonl'):
        g = {k: v for k, v in gold[q['id']].items() if k not in ('by', 'note')}
        route = {'passage': ['intro'] if 'intro' in (g['ref'] or '') else ['passage'], 'article': ['article', 'translate-unknown']}.get(g['intent'], [g['intent']])
        e = {'route': route}
        if g['ref']:
            e['ref'] = g['ref']
        if g['concept'] and g['intent'] != 'resources':
            e['concept'] = g['concept']
        if q['type'] == 'unavailable':
            e['useful'] = False
            if g['intent'] == 'article':
                e['route'] = ['article', 'search', 'nopack']
        out.append({'id': q['id'], 'set': 'q36', 'lang': UI.get(q['lang'], q['lang']), 'q': q['ask'], 'sheet': g, 'expect': e,
                    'must': q['must'], 'from': 'fase0/data/questions-all.jsonl + gold-sheets.jsonl'})
    return out


def langs():
    out = []
    for r in jl(DATA / 'eval-langs.jsonl'):
        g = dict(r['gold'])
        slots = {k: v for k, v in g.items() if v is not None and v != []}
        if r.get('book_written'):
            slots['book'] = r['book_written']  # a reader writes the book as the question does
        slots['lang'] = r['lang']
        i = g['intent']
        e = {}
        if i in ('passage', 'count', 'rank', 'advice'):
            e['ref'] = ref_of(g['book'], g['chapter'], g['verse_start'], g['verse_end'], g['what'] if i == 'passage' else ())
            e['route'] = ['intro'] if g['what'] == ['intro'] else [i] if i != 'passage' else ['passage']
        elif i == 'article':
            e['route'] = ['article', 'choose', 'translate-unknown']
        elif i == 'resources':
            e['route'] = ['resources']
        if i == 'unknown' or (i == 'article' and r['id'].endswith('-12')):  # the weather; a bicycle has no article
            e['useful'] = False
        if i == 'unknown' and r['id'].endswith('-30'):  # the weather: out of scope (Nov 15, guiding without blocking)
            e['oos'] = True
        if i == 'article' and r['id'].endswith('-12'):
            e['route'] = ['article', 'search', 'nopack']
        if i == 'resources' and g['other_language'] == 'French':  # no fr pack: "French is not on this device" is right
            e['useful'] = False
        out.append({'id': r['id'], 'set': 'langs', 'lang': r['lang'], 'q': r['ask'], 'slots': slots, 'expect': e, 'from': 'fase0/data/eval-langs.jsonl'})
    return out


# compare_v1_v2.py NEW: (lang, question, intent, term, book code, chapter)
NEW = [
    ('en', 'My people have never seen snow, how should I render snow?', 'article', 'snow', None, None),
    ('en', 'What is the meaning of redeemer in Ruth 3?', 'passage', 'redeemer', 'rut', 3),
    ('en', 'Which books of the Bible talk about mercy?', 'count', 'mercy', None, None),
    ('es', 'Aquí no conocemos los camellos, ¿cómo traduzco camello?', 'article', 'camello', None, None),
    ('es', '¿Qué quiere decir anciano en Tito 1?', 'passage', 'anciano', 'tit', 1),
    ('es', '¿Qué libros hablan de la misericordia?', 'count', 'misericordia', None, None),
    ('fr', "Chez nous il n'y a pas d'oliviers, comment traduire l'olivier ?", 'article', 'olivier', None, None),
    ('fr', 'Que veut dire la grâce dans Tite 2 ?', 'passage', 'grâce', 'tit', 2),
    ('fr', 'Quels livres parlent de la foi ?', 'count', 'foi', None, None),
    ('id', 'Orang di kampung kami tidak tahu salju, bagaimana menerjemahkan salju?', 'article', 'salju', None, None),
    ('id', 'Apa maksud penatua di Titus 1?', 'passage', 'penatua', 'tit', 1),
    ('id', 'Kitab mana saja yang membahas iman?', 'count', 'iman', None, None),
    ('hi', 'हमारे यहाँ ऊँट नहीं होते, ऊँट का अनुवाद कैसे करें?', 'article', 'ऊँट', None, None),
    ('hi', 'तीतुस 1 में प्राचीन का क्या मतलब है?', 'passage', 'प्राचीन', 'tit', 1),
    ('hi', 'किन पुस्तकों में दया का उल्लेख है?', 'count', 'दया', None, None),
    ('ar', 'لا يوجد ثلج في بلادنا، كيف أترجم الثلج؟', 'article', 'ثلج', None, None),
    ('ar', 'ما معنى الشيخ في تيطس 1؟', 'passage', 'شيخ', 'tit', 1),
    ('ar', 'أي الأسفار تتحدث عن الرحمة؟', 'count', 'رحمة', None, None),
]


def new18():
    out = []
    for n, (lang, q, intent, term, code, ch) in enumerate(NEW):
        slots = {'intent': intent, 'term': term, 'lang': lang}
        if code:
            slots.update(book=code, chapter=ch, what=['terms'])
        e = {'article': {'route': 'translate-unknown'}, 'passage': {'route': 'meaning', 'ref': f'{code} {ch}'}, 'count': {'route': 'books'}}[intent]
        kind = {'article': 'unknown', 'passage': 'meaning', 'count': 'books'}[intent]
        out.append({'id': f'new-{lang}-{kind}', 'set': 'new18', 'lang': lang, 'q': q, 'slots': slots, 'expect': e, 'from': 'fase0/py/compare_v1_v2.py NEW'})
    return out


def followup(code_only):
    out = []
    for r in jl(DATA / 'eval-followup.jsonl'):
        g = r['gold']
        prev = dict(r['prev'])
        slots = {k: v for k, v in g.items() if v is not None and v != []}
        e = {}
        if r['kind'] == 'new_topic':
            e = {'route': ['article', 'choose'], 'ref': None, 'concept': '/^tw:kt\\/grace$/'}
        elif g['intent'] == 'count':
            e = {'route': 'count', 'ref': ref_of(g['book'], g['chapter'])}
        else:
            e = {'route': ['passage', 'meaning'] if g['term'] else ['passage'], 'ref': ref_of(g['book'], g['chapter'], g['verse_start'], g['verse_end'])}
        out.append({'id': r['id'] + ('-code' if code_only else ''), 'set': 'followup-code' if code_only else 'followup', 'lang': r['lang'],
                    'before': [{'q': r['prev_q'], 'slots': prev}], 'q': r['q'], 'slots': None if code_only else slots, 'expect': e,
                    'from': 'fase0/data/eval-followup.jsonl' + (' (turn 2 read by code alone, no reader)' if code_only else '')})
    return out


# More follow-ups read by code alone (Nov 15): the kinds the 48 do not have, and new topics that must not take the state.
# Each: kind -> the first turn (a kind of eval-followup.jsonl whose first turn it reuses, or a question with its slots), the
# second question per language, and what the answer must be.
FU_MORE = {
    'prev': ('what', {'en': 'And the previous verse?', 'es': '¿Y el versículo anterior?', 'fr': 'Et le verset précédent ?', 'id': 'Dan ayat sebelumnya?',
                      'hi': 'और पिछला पद?', 'ar': 'والعدد السابق؟'}, {'route': ['passage'], 'ref': 'rut 2:2'}),
    # the verse after the last of a chapter is the first of the next one (as the answer found it)
    'next_ch': ({'en': 'Show me Ruth 1:22', 'es': 'Muéstrame Rut 1:22', 'fr': 'Montre-moi Ruth 1:22', 'id': 'Tunjukkan Rut 1:22', 'hi': 'रूत 1:22 दिखाइए',
                 'ar': 'اعرض راعوث 1:22'}, {'en': 'And the next verse?', 'es': '¿Y el siguiente versículo?', 'fr': 'Et le verset suivant ?',
                 'id': 'Dan ayat berikutnya?', 'hi': 'और अगला पद?', 'ar': 'والعدد التالي؟'}, {'route': ['passage'], 'ref': 'rut 2:1'}),
    'whole': ('what', {'en': 'Show me the whole chapter', 'es': 'Muéstrame todo el capítulo', 'fr': 'Montre-moi tout le chapitre', 'id': 'Tunjukkan seluruh pasal',
                       'hi': 'पूरा अध्याय दिखाइए', 'ar': 'اعرض الأصحاح كله'}, {'route': ['passage'], 'ref': 'rut 2'}),
    'terms': ('what', {'en': 'And the key words?', 'es': '¿Y las palabras clave?', 'fr': 'Et les mots clés ?', 'id': 'Dan kata kuncinya?',
                       'hi': 'और मुख्य शब्द?', 'ar': 'والكلمات الرئيسية؟'}, {'route': ['passage'], 'ref': 'rut 2:3'}),
    'count_here': ('term_book', {'en': 'How many times does it appear in this chapter?', 'es': '¿Cuántas veces aparece en este capítulo?',
                                 'fr': 'Combien de fois apparaît-il dans ce chapitre ?', 'id': 'Berapa kali muncul di pasal ini?',
                                 'hi': 'इस अध्याय में यह कितनी बार आता है?', 'ar': 'كم مرة يرد في هذا الأصحاح؟'}, {'route': 'count', 'ref': 'rut 3'}),
    'translate': ('what', {'en': 'How do I translate this?', 'es': '¿Cómo traduzco esto?', 'fr': 'Comment traduire ceci ?', 'id': 'Bagaimana menerjemahkan ini?',
                           'hi': 'इसका अनुवाद कैसे करूँ?', 'ar': 'كيف أترجم هذا؟'}, {'route': ['passage'], 'ref': 'rut 2:3'}),
    # new topics: another passage, a word with no "here", a count over the whole Bible
    'new_passage': ('what', {'en': 'Jonah 1:3 notes', 'es': 'Jonás 1:3 notas', 'fr': 'Jonas 1:3 notes', 'id': 'Yunus 1:3 catatan', 'hi': 'योना 1:3 नोट्स',
                             'ar': 'يونان 1:3 ملاحظات'}, {'route': ['passage'], 'ref': 'jon 1:3'}),
    'new_word': ('what', {'en': 'What does lamb mean?', 'es': '¿Qué significa cordero?', 'fr': 'Que veut dire agneau ?', 'id': 'Apa arti anak domba?',
                          'hi': 'मेम्ना का क्या अर्थ है?', 'ar': 'ما معنى الحمل؟'}, {'route': ['article', 'choose', 'search', 'translate-unknown'], 'notRef': 'rut 2:3', 'useful': False}),
    # "who is speaking here?" names no article: the passage with its notes, not a meaning nor its key terms alone (in English;
    # the other languages' "who is" words are not those of `meaning`, so the question stays a free search, as before)
    'who_here': ('what', {'en': 'Who is speaking here?', 'es': '¿Quién habla aquí?', 'fr': 'Qui parle ici ?', 'id': 'Siapa yang berbicara di sini?',
                          'hi': 'यहाँ कौन बोल रहा है?', 'ar': 'من يتكلم هنا؟'}, {'route': ['passage', 'search', 'nopack'], 'notConcept': '^tw:', 'useful': False}),
    # Numbers named as a book in Arabic ("سفر العدد"): a new passage, not verse 5 of Ruth
    'new_numbers': ('what', {'ar': 'سفر العدد 5'}, {'route': ['passage'], 'ref': 'num 5', 'useful': False}),
    'new_count': ('term_book', {'en': 'How many times does grace appear in the Bible?', 'es': '¿Cuántas veces aparece gracia en la Biblia?',
                                'fr': 'Combien de fois grâce apparaît-elle dans la Bible ?', 'id': 'Berapa kali kasih karunia muncul di Alkitab?',
                                'hi': 'बाइबल में अनुग्रह कितनी बार आता है?', 'ar': 'كم مرة ترد النعمة في الكتاب المقدس؟'}, {'notRef': 'rut 3', 'useful': False}),
}


def followup_more():
    first = {}
    for r in jl(DATA / 'eval-followup.jsonl'):
        first[(r['kind'], r['lang'])] = {'q': r['prev_q'], 'slots': dict(r['prev'])}
    out = []
    for kind, (before, qs, e) in FU_MORE.items():
        for lang, q in qs.items():
            b = first[(before, lang)] if isinstance(before, str) else {'q': before[lang], 'slots': None}
            out.append({'id': f'fu-{lang}-{kind}-code', 'set': 'followup-more', 'lang': lang, 'before': [b], 'q': q, 'slots': None, 'expect': e,
                        'from': 'follow-ups read by code (Nov 15): kinds the 48 lack, and new topics'})
    # the review of Nov 15: each question with what a correct reader gives (-read: code must not override it) and with none (-code)
    for i, lang, first_q, first_ref, q, read, e_read, e_code in FU_REVIEW:
        bk, ch, v = first_ref
        b = {'q': first_q, 'slots': {'intent': 'passage', 'book': bk, 'chapter': ch, 'verse_start': v, 'what': ['text'], 'lang': lang}}
        for mode, slots, e in [('read', read, e_read), ('code', None, e_code if e_code is not None else e_read)]:
            out.append({'id': f'fu-{lang}-{i}-{mode}', 'set': 'followup-more', 'lang': lang, 'before': [b], 'q': q, 'slots': slots, 'expect': e,
                        'from': 'review of ms/followups, round 1 (Nov 15): ' + ('a correct reader' if mode == 'read' else 'no reader')})
    return out


def P(lang, book, ch, v=None, v2=None, what=('text',)):
    return {'intent': 'passage', 'book': book, 'chapter': ch, 'verse_start': v, 'verse_end': v2, 'what': list(what), 'lang': lang}


RUT23 = ('rut', 2, 3)
def UNK(lang):
    return {'intent': 'unknown', 'lang': lang}
def EDGE(rx):
    return {'route': 'edge', 'ref': None, 'useful': False, 'has': [rx]}
def NOT_HERE(ref):
    return {'route': ['article', 'choose', 'search', 'translate-unknown', 'books', 'intro'], 'notRef': ref, 'useful': False}
# id, lang, first question, its passage, the follow-up, a correct reader's slots, what the answer must be (with them; without, if different)
FU_REVIEW = [
    ('range', 'en', 'Show me Ruth 2:3', RUT23, 'and verses 3-5?', P('en', 'rut', 2, 3, 5), {'route': ['passage'], 'ref': 'rut 2:3-5'}, None),
    ('chv_range', 'en', 'Show me Ruth 2:3', RUT23, 'and 1:3-5?', P('en', 'rut', 1, 3, 5), {'route': ['passage'], 'ref': 'rut 1:3-5'}, None),
    ('ch_verse', 'en', 'Show me Ruth 2:3', RUT23, 'and chapter 3 verse 5?', P('en', 'rut', 3, 5), {'route': ['passage'], 'ref': 'rut 3:5'}, None),
    ('next_n', 'en', 'Show me Ruth 2:3', RUT23, 'show me the next 3 verses', P('en', 'rut', 2, 4, 6), {'route': ['passage'], 'ref': 'rut 2:4-6'}, None),
    ('next_book', 'en', 'Show me Ruth 2:3', RUT23, 'and the next book?', P('en', '1sa', 1, what=('intro',)), {'route': ['intro'], 'ref': '1sa 1:intro'}, NOT_HERE('rut 2:4')),
    ('verses_n', 'en', 'Show me Ruth 2:3', RUT23, 'How many verses are in this chapter?', UNK('en'), {'route': 'count', 'ref': 'rut 2', 'has': ['\\b23 verses']}, None),
    ('chapters_n', 'en', 'Show me Ruth 2:3', RUT23, 'How many chapters are there?', UNK('en'), {'route': 'count', 'has': ['\\b4 chapters']}, None),
    ('books_n', 'en', 'Show me Ruth 2:3', RUT23, 'How many books are there in the Bible?', UNK('en'), NOT_HERE('rut 2'), None),
    ('famine', 'en', 'Show me Ruth 1:1', ('rut', 1, 1), 'What does it mean that there was a famine?', {'intent': 'article', 'term': 'famine', 'lang': 'en'},
     {'route': ['article'], 'concept': 'tw:other/famine'}, NOT_HERE('rut 1:1')),
    ('famine', 'es', 'Muéstrame Rut 1:1', ('rut', 1, 1), '¿Qué significa que allí había hambre?', {'intent': 'article', 'term': 'hambre', 'lang': 'es'},
     # "hambre" names no Spanish article: a free search, which finds Ruth 1:1 by its words (not by the state); never the meaning route
     {'route': ['article', 'search'], 'useful': False}, None),
    ('next_book', 'es', 'Muéstrame Rut 2:3', RUT23, '¿y el siguiente libro?', UNK('es'), NOT_HERE('rut 2:4'), None),
    ('range', 'es', 'Muéstrame Rut 2:3', RUT23, '¿y los versículos 3 al 5?', P('es', 'rut', 2, 3, 5), {'route': ['passage'], 'ref': 'rut 2:3-5'}, None),
    ('ch_verse', 'es', 'Muéstrame Rut 2:3', RUT23, '¿y el capítulo 3 versículo 5?', P('es', 'rut', 3, 5), {'route': ['passage'], 'ref': 'rut 3:5'}, None),
    ('new_ref', 'es', 'Muéstrame Rut 2:3', RUT23, '¿Y Juan 3:16?', P('es', 'jhn', 3, 16), {'route': ['passage'], 'ref': 'jhn 3:16'}, None),
    ('range', 'fr', 'Montre-moi Ruth 2:3', RUT23, 'et les versets 3 à 5 ?', P('fr', 'rut', 2, 3, 5), {'route': ['passage'], 'ref': 'rut 2:3-5'}, None),
    # Arabic: "العدد" is "the verse" and the book of Numbers: a reader that says Numbers wins; with no reader, a bare
    # "العدد 5" right after a passage is its verse 5
    ('numbers', 'ar', 'اعرض راعوث 2:3', RUT23, 'العدد 5', P('ar', 'num', 5), {'route': ['passage'], 'ref': 'num 5'}, {'route': ['passage'], 'ref': 'rut 2:5'}),
    ('notes_es', 'en', 'Show me Ruth 2:3', RUT23, 'and the notes in Spanish?', P('es', 'rut', 2, 3, what=('notes',)), {'route': ['passage'], 'ref': 'rut 2:3', 'has': ['[Nn]ota']}, None),
    # past the book's ends: it says so, in the question's language
    ('end_verse', 'en', 'Show me Ruth 4:22', ('rut', 4, 22), 'and the next verse?', UNK('en'), EDGE('last verse of Ruth'), None),
    ('end_chapter', 'en', 'Show me Ruth 4:22', ('rut', 4, 22), 'and the next chapter?', UNK('en'), EDGE('4 chapters'), None),
    ('first_verse', 'en', 'Show me Ruth 1:1', ('rut', 1, 1), 'and the previous verse?', UNK('en'), EDGE('first verse of Ruth'), None),
    ('prev_ch_end', 'en', 'Show me Ruth 2:1', ('rut', 2, 1), 'and the previous verse?', UNK('en'), {'route': ['passage'], 'ref': 'rut 1:22'}, None),
    ('verse_50', 'en', 'Show me Ruth 2:3', RUT23, 'what about verse 50?', UNK('en'), EDGE('23 verses'), None),
    ('chapter_9', 'es', 'Muéstrame Rut 2:3', RUT23, '¿y el capítulo 9?', UNK('es'), EDGE('4 capítulos'), None),
    ('end_verse', 'ar', 'اعرض راعوث 4:22', ('rut', 4, 22), 'والآية التالية؟', UNK('ar'), EDGE('الأخيرة'), None),
]


# The user reports (Nov 13-14) and what the answer should be. slots None: code alone reads the question.
def reports():
    S = lambda **k: {**k, 'lang': k.get('lang', 'en')}  # noqa: E731
    search_dan = {'q': 'Daniel lion', 'slots': None}
    rows = [
        ('report-first-not-a-pick', 'What book of the Bible should I translate first?', None, [search_dan], {'notRef': 'dan 6:24', 'useful': False}),
        ('report-first-ta', 'What book of the Bible should I translate first?', None, [search_dan], {'concept': '/^ta:/'}),
        ('report-starting', 'I am starting in translation, how should I start?', None, [], {'concept': '/^ta:/'}),
        ('report-metaphors', 'How to translate metaphors?', None, [], {'concept': 'ta:translate/figs-metaphor'}),
        ('report-modisms', 'How do I translate modisms?', None, [], {'concept': 'ta:translate/figs-idiom'}),
        ('report-team', 'How do I set up a translation team?', None, [], {'concept': '/^ta:/'}),
        ('report-this-passage', 'How should I translate this passage?', None, [{'q': 'Ruth 2:3', 'slots': None}], {'ref': 'rut 2:3'}),
        ('report-jonah-where', 'Where was Jonah swallowed by a fish?', None, [], {'ref': 'jon 1:17'}),
        ('report-books-grace', 'What books mention grace?', None, [], {'route': 'books', 'concept': 'tw:kt/grace'}),
        ('report-jonah-book', 'How do I translate the book of Jonah?', None, [], {'route': 'intro', 'ref': 'jon front:intro'}),
        ('report-jonah-fish', 'Jonah fish', None, [], {'route': 'search', 'ref': '/^jon /'}),
        ('report-daniel-lion', 'Daniel lion', None, [], {'route': 'search', 'ref': '/^dan /'}),
    ]
    out = [{'id': i, 'set': 'reports', 'lang': 'en', 'q': q, 'slots': s, 'before': b, 'expect': e, 'from': 'user reports Nov 13-14'}
           for i, q, s, b, e in rows]
    # Nov 15 (0.10.0): the book's introduction came with no next step; the name's answer had no button to "How to Translate
    # Names". Each with the buttons it must offer (code alone, and as the phone's model read the first one).
    start = {'route': 'intro', 'ref': 'jon front:intro', 'follow': ['^jon 1 ', '^jon 1:intro', '^jon 1:1 ', '^ta:translate/translate-process', '^browse jon']}
    names = {'route': 'translate-unknown', 'concept': 'tw:names/jonah', 'has': ['Jon[aá]s', 'nombres'], 'follow': ['^tw:names/jonah', '^ta:translate/translate-names']}
    nov15 = [
        ('report-start-jonah', 'es', 'Voy a empezar a traducir Jonás', None, start),
        ('report-start-jonah-read', 'es', 'Voy a empezar a traducir Jonás', S(intent='passage', book='Jonás', what=['intro'], lang='es'), start),
        ('report-start-ruth-en', 'en', 'I want to translate Ruth', None, {**start, 'ref': 'rut front:intro', 'follow': ['^rut 1 ', '^rut 1:intro', '^ta:translate/translate-process']}),
        ('report-name-jonah', 'es', '¿Cómo debo traducir el nombre de Jonás?', None, names),
        ('report-name-ruth-fr', 'fr', 'Comment traduire le nom de Ruth ?', None, {'route': 'translate-unknown', 'concept': 'tw:names/ruth', 'follow': ['^tw:names/ruth', '^ta:translate/translate-names']}),
        ('report-who-jonah', 'en', 'Who was Jonah?', None, {'concept': 'tw:names/jonah', 'follow': ['^jon ', '^ta:translate/translate-names']}),
        ('report-chapter-intro', 'en', 'Introduction to Ruth 2', None, {'route': 'intro', 'ref': 'rut 2:intro', 'follow': ['^rut 2 ', '^rut 2:1 ', '^rut 3:intro']}),
        # the review of Nov 15: starting a book only with nothing else in the question (no verse, chapter or other words)
        ('start-not-prayer', 'en', "I want to translate Jonah's prayer", None, {'notRoute': 'intro', 'ref': '/^jon 2:/'}),
        ('start-not-prayer-read', 'en', "I want to translate Jonah's prayer", S(intent='passage', book='Jonah', chapter=2, verse_start=1, verse_end=None, what=['text']), {'ref': 'jon 2:1'}),
        ('start-not-oracion', 'es', 'Voy a traducir la oración de Jonás', None, {'notRoute': 'intro', 'ref': '/^jon 2:/'}),
        ('start-not-oracion-read', 'es', 'Voy a traducir la oración de Jonás', S(intent='passage', book='Jonás', chapter=2, verse_start=1, verse_end=None, what=['text'], lang='es'), {'ref': 'jon 2:1'}),
        ('start-not-lamb', 'en', 'I want to translate Lamb of God in John', None, {'notRoute': 'intro', 'ref': 'jhn 1:29'}),
        ('start-not-lamb-read', 'en', 'I want to translate Lamb of God in John', S(intent='passage', book='John', chapter=1, verse_start=29, verse_end=None, what=['text']), {'ref': 'jhn 1:29'}),
        ('start-not-biblia', 'es', 'Vamos a traducir la Biblia', None, {'notRoute': 'intro', 'useful': False}),
        ('start-not-chapter', 'en', 'Jonah chapter two', None, {'ref': '/^jon 2/'}),
        ('start-not-chapter-read', 'en', 'Jonah chapter two', S(intent='passage', book='Jonah', chapter=2, verse_start=None, verse_end=None, what=['text']), {'ref': 'jon 2'}),
        ('start-not-story', 'en', 'the story of Jonah and the big fish', None, {'notRoute': 'intro'}),
        ('start-not-pez', 'es', 'pez grande en Jonás', None, {'notRoute': 'intro', 'ref': 'jon 1:17'}),
        ('start-not-grace', 'en', 'the word grace in Ruth', None, {'notRoute': 'intro'}),
        ('start-not-grace-read', 'en', 'the word grace in Ruth', S(intent='article', term='grace'), {'concept': 'tw:kt/grace'}),
    ]
    out += [{'id': i, 'set': 'reports', 'lang': lang, 'q': q, 'slots': s, 'before': [], 'expect': e, 'from': 'user reports Nov 15'}
            for i, lang, q, s, e in nov15]
    # Nov 15 on 0.10.0 (en + es-419): after an introduction, the first section of a chapter ("Rut 1:1-5"), under a section the
    # next one; "Introduction to Numbers 6" (the en pack has no Numbers notes, the ar pack has the English ones) after a passage
    num6 = {'route': 'intro', 'ref': 'num 6:intro', 'has': ['Nazirite'], 'not': ["didn't find anything", 'العدد'], 'follow': ['^num 6 text']}
    sections = [
        ('start-rut-section', 'es', 'Voy a empezar a traducir el libro de Rut', [], {'ref': 'rut front:intro', 'follow': ['^rut 1:1-5 text', '^rut 1:intro', '^ta:translate/translate-process$']}),
        ('chapter-intro-section', 'en', 'Introduction to Ruth 1', [], {'ref': 'rut 1:intro', 'follow': ['^rut 1:1-5 text,notes$', '^rut 1 text']}),
        ('section-next', 'es', 'Rut 1:1-5', [], {'ref': 'rut 1:1-5', 'follow': ['^rut 1:6-18 text,notes$']}),
        ('intro-num-6', 'en', 'Introduction to Numbers 6', [{'q': 'Ruth 1:16'}], {**num6, 'follow': ['^num 6 text', '^num front:intro']}),
        ('intro-num-6-es', 'es', 'Introducción a Números 6', [{'q': 'Rut 1:16'}], {**num6, 'has': ['Nazirite', 'Números 6', 'del paquete']}),
    ]
    out += [{'id': i, 'set': 'reports', 'lang': lang, 'q': q, 'slots': None, 'before': b, 'expect': e, 'from': 'user reports Nov 15 (0.10.0)'}
            for i, lang, q, b, e in sections]
    # The composer's review (Nov 15): a numbered book after a word ("Notas de 1 Juan 3:2") read as nothing with no reader, and
    # "Catatan 1 Yohanes 3:2" as Lamentations 1 ("Catatan" one letter from "Ratapan"). Without a reader and with its slots.
    numbered = [
        ('numbered-id-catatan', 'id', 'Catatan 1 Yohanes 3:2', '1 Yohanes', 3, 2, ['notes'], '1jn 3:2'),
        ('numbered-es-notas', 'es', 'Notas de 1 Juan 3:2', '1 Juan', 3, 2, ['notes'], '1jn 3:2'),
        ('numbered-en-notes', 'en', 'Notes on 1 John 3:2', '1 John', 3, 2, ['notes'], '1jn 3:2'),
        ('numbered-es-timoteo', 'es', '¿Qué dicen las notas de 2 Timoteo 1:5?', '2 Timoteo', 1, 5, ['notes'], '2ti 1:5'),
        ('numbered-fr-notes', 'fr', 'Notes sur 1 Jean 3:2', '1 Jean', 3, 2, ['notes'], '1jn 3:2'),
        ('numbered-hi-terms', 'hi', '1 यूहन्ना 3:2 के मुख्य शब्द', '1 यूहन्ना', 3, 2, ['terms'], '1jn 3:2'),  # (the Hindi pack has no notes for it)
        ('numbered-ar-notes', 'ar', 'ملاحظات 1 يوحنا 3:2', '1 يوحنا', 3, 2, ['notes'], '1jn 3:2'),
        ('numbered-es-intro', 'es', 'Introducción a 1 Juan 3', '1 Juan', 3, None, ['intro'], '1jn 3:intro'),
    ]
    for i, lang, q, book, ch, v, what, ref in numbered:
        e = {'ref': ref, 'notRef': 'lam 1'}
        out.append({'id': i, 'set': 'reports', 'lang': lang, 'q': q, 'slots': None, 'before': [], 'expect': e, 'from': 'composer review Nov 15'})
        slots = S(intent='passage', book=book, chapter=ch, verse_start=v, verse_end=None, what=what, lang=lang)
        out.append({'id': f'{i}-read', 'set': 'reports', 'lang': lang, 'q': q, 'slots': slots, 'before': [], 'expect': e, 'from': 'composer review Nov 15'})
    return out


# Training questions -> Translation Academy (pipeline.ts, route `academy`): the reports of Nov 13-14 in the six languages, and
# questions the route must leave to the other routes. Code alone reads them (no reader), as the reports were.
TA_DIFF, TA_START, TA_TEAM = 'ta:translate/translation-difficulty', 'ta:process/process-manual', 'ta:process/setup-team'
TA_IDIOM, TA_METAPHOR, TA_CHECK = 'ta:translate/figs-idiom', 'ta:translate/figs-metaphor', 'ta:checking/intro-checking'
ACADEMY = [
    ('en', 'What book of the Bible should I translate first?', TA_DIFF),
    ('en', 'I am starting in translation, how should I start?', TA_START),
    ('en', 'How do I set up a translation team?', TA_TEAM),
    ('en', 'How do I translate modisms?', TA_IDIOM),
    ('en', 'How do I translate idioms?', TA_IDIOM),
    ('en', 'How to translate metaphors?', TA_METAPHOR),
    ('en', 'How do I check a translation?', TA_CHECK),
    ('es', '¿Qué libro de la Biblia debo traducir primero?', TA_DIFF),
    ('es', 'Estoy empezando en la traducción, ¿cómo debo empezar?', TA_START),
    ('es', '¿Cómo formo un equipo de traducción?', TA_TEAM),
    ('es', '¿Cómo traduzco los modismos?', TA_IDIOM),
    ('es', '¿Cómo traducir metáforas?', TA_METAPHOR),
    ('es', '¿Cómo reviso una traducción?', TA_CHECK),
    ('fr', 'Comment traduire les métaphores ?', TA_METAPHOR),
    ('fr', 'Comment former une équipe de traduction ?', TA_TEAM),
    ('id', 'Bagaimana menerjemahkan ungkapan?', TA_IDIOM),
    ('id', 'Kitab apa yang harus kami terjemahkan dulu?', TA_DIFF),
    ('hi', 'मुहावरों का अनुवाद कैसे करें?', TA_IDIOM),
    ('hi', 'अनुवाद दल कैसे बनाएँ?', TA_TEAM),
    ('ar', 'كيف أترجم الاستعارة؟', TA_METAPHOR),
    ('ar', 'كيف نشكل فريق ترجمة؟', TA_TEAM),
]
# (lang, question, expectations): not training questions, or not about one Translation Academy article
ACADEMY_NOT = [
    ('en', 'What is the first book of the Bible?', {'notConcept': '^ta:', 'useful': False}),
    ('en', 'How do I translate the name Yahweh?', {'notConcept': '^ta:'}),
    ('es', '¿Cómo traduzco cordero si en mi idioma no hay ovejas?', {'notConcept': '^ta:translate/figs-idiom$', 'useful': False}),
    ('en', 'Who was on the team of Paul?', {'notConcept': '^ta:', 'useful': False}),
    # words of the list that mean something else here (review of Nov 15)
    ('en', 'How do I translate the team of horses?', {'notConcept': '^ta:', 'useful': False}),
    ('en', 'How do I translate draft animals?', {'notConcept': '^ta:', 'useful': False}),
    ('en', 'How do I translate first fruits?', {'notConcept': '^ta:', 'useful': False}),
    ('en', 'How do I translate Passover in the first month?', {'notConcept': '^ta:', 'useful': False}),
    ('es', '¿Cómo traduzco equipo de guerra?', {'notConcept': '^ta:', 'useful': False}),
    ('id', 'Bagaimana menerjemahkan perumpamaan tentang penabur?', {'notConcept': '^ta:translate/figs-simile$', 'useful': False}),
]


def academy():
    out = []
    for n, (lang, q, id_) in enumerate(ACADEMY):
        out.append({'id': f'academy-{lang}-{n + 1:02d}', 'set': 'academy', 'lang': lang, 'q': q, 'slots': None, 'expect': {'route': 'article', 'concept': id_},
                    'from': 'user reports Nov 13-14 (training questions)', 'fast': True})
    for n, (lang, q, e) in enumerate(ACADEMY_NOT):
        out.append({'id': f'academy-not-{lang}-{n + 1:02d}', 'set': 'academy', 'lang': lang, 'q': q, 'slots': None, 'expect': e,
                    'from': 'questions the academy route must leave to the other routes', 'fast': True})
    return out


# handoff/mini-servant/investigacion/experimento-traductor-quechua.md: Mateo, a Quechua translator (Spanish is his second
# language), 20 questions. Slots: what a right reader gives. Expectations: the "good" answer of the experiment's proposals.
def quechua():
    A = lambda t: {'intent': 'article', 'term': t, 'lang': 'es'}  # noqa: E731
    P = lambda b, c, v=None, **k: {'intent': 'passage', 'book': b, 'chapter': c, 'verse_start': v, 'lang': 'es', **k}  # noqa: E731
    rows = [
        ('que significa arrepentimiento?', A('arrepentimiento'), {'route': 'article', 'concept': 'tw:kt/repent'}),
        ('en mi idioma no hay palabra para bautizar, como lo traduzco?', A('bautizar'), {'route': 'translate-unknown', 'concept': 'tw:kt/baptize'}),
        ('que es el reino de Dios', A('reino de Dios'), {'route': 'article', 'concept': 'tw:kt/kingdomofgod'}),
        ('que significa redentor en Rut 4?', P('Rut', 4, what=['terms'], term='redentor'), {'route': 'meaning', 'ref': 'rut 4', 'concept': 'tw:kt/redeem'}),
        ('Rut 1:1 quienes eran los jueces', P('Rut', 1, 1, what=['terms'], term='jueces'), {'route': 'meaning', 'ref': 'rut 1:1', 'concept': '/judge/'}),
        ('Rut 3:9 que quiere decir extiende tu manto sobre tu sierva', {'intent': 'advice', 'book': 'Rut', 'chapter': 3, 'verse_start': 9, 'phrase': 'extiende tu manto sobre tu sierva', 'lang': 'es'},
         {'route': 'advice', 'ref': 'rut 3:9', 'has': ['manto']}),
        ('en mi pueblo no hay cebada, como traduzco cebada', A('cebada'), {'route': 'translate-unknown', 'concept': 'tw:other/barley'}),
        ('que es un efa', A('efa'), {'has': ['efa']}),
        ('Tito 1:1 que significa siervo de Dios y apostol', P('Tito', 1, 1, what=['terms'], term='siervo de Dios'), {'route': 'meaning', 'ref': 'tit 1:1', 'concept': 'tw:other/servant'}),
        ('que es la gracia', A('gracia'), {'route': 'article', 'concept': 'tw:kt/grace'}),
        ('Tito 2:11 la gracia de Dios se ha manifestado, que quiere decir eso', {'intent': 'advice', 'book': 'Tito', 'chapter': 2, 'verse_start': 11, 'phrase': 'la gracia de Dios se ha manifestado', 'lang': 'es'},
         {'route': 'advice', 'ref': 'tit 2:11', 'not': ['que quiere decir']}),
        ('que significa justificados, sale en Tito 3:7', P('Tito', 3, 7, what=['terms'], term='justificados'), {'route': 'meaning', 'ref': 'tit 3:7', 'concept': '/justi/'}),
        ('Tito 1:5 que es un anciano en la iglesia', P('Tito', 1, 5, what=['terms'], term='anciano'), {'route': 'meaning', 'ref': 'tit 1:5', 'concept': 'tw:other/elder'}),
        ('Tito 3:5 que es el lavamiento de la regeneracion', {'intent': 'advice', 'book': 'Tito', 'chapter': 3, 'verse_start': 5, 'phrase': 'lavamiento de la regeneracion', 'lang': 'es'},
         {'route': 'advice', 'ref': 'tit 3:5'}),
        ('Jonas 1:17 dice que un gran pez se trago a Jonas, en mi pueblo no conocen el mar, como traduzco pez grande', {'intent': 'advice', 'book': 'Jonás', 'chapter': 1, 'verse_start': 17, 'term': 'pez grande', 'lang': 'es'},
         {'route': 'translate-unknown', 'ref': 'jon 1:17'}),
        ('ñuqaykuq simiykupi gracia nisqa mana kanchu, imaynatam qillqasaq?', None, {'has': ['español|castellano']}),
        ('como traduzco cordero si en mi pueblo solo hay llamas', A('cordero'), {'route': 'translate-unknown', 'concept': 'tw:kt/lamb'}),
        ('que significa amen', A('amen'), {'route': 'article', 'concept': 'tw:kt/amen'}),
        ('Jonas 3:9 dice que Dios se arrepiente? como puede ser', P('Jonás', 3, 9, what=['notes']), {'route': 'passage', 'ref': 'jon 3:9'}),
        ('que figuras de lenguaje hay en Jonas 2', {'intent': 'rank', 'book': 'Jonás', 'chapter': 2, 'what': ['notes'], 'lang': 'es'}, {'route': 'rank', 'ref': 'jon 2'}),
    ]
    src = 'handoff/mini-servant/investigacion/experimento-traductor-quechua.md'
    return [{'id': f'quechua-{n + 1:02d}', 'set': 'quechua', 'lang': 'es', 'q': q, 'slots': s, 'expect': e, 'from': src} for n, (q, s, e) in enumerate(rows)] + \
        [{'id': f'quechua-{n + 1:02d}-code', 'set': 'quechua-code', 'lang': 'es', 'q': q, 'slots': None, 'expect': e, 'from': src + ' (no reader: code alone)'}
         for n, (q, s, e) in enumerate(rows)]


# Free searches that must find the event's verse, a book introduction, a Translation Academy article, or say plainly that
# nothing fits (pipeline.ts route `search`, search.ts rankVerses; Nov 15, phase "two months": one search that always returns
# something). Code alone reads them unless slots are given (the report of Nov 14 was read as "the book of Jonah").
G17 = '/^1sa 17:/'
# an answer that states one verse as THE place it happens
NOT_WHERE = '^(It is in|Está en|C.est dans|Ada di|إنه في|यह .{0,40} में है:)'
FINDALL = [
    # (id, lang, question, slots, expectations)
    ('en-abraham', 'en', 'In which verse does Abraham sacrifice Isaac?', None, {'route': 'search', 'ref': '/^gen 22:/'}),
    ('en-jonah-book', 'en', 'Where was Jonah swallowed by a fish?', {'intent': 'passage', 'book': 'Jonah', 'lang': 'en'},
     {'route': 'search', 'ref': 'jon 1:17', 'has': ['^It is in Jonah 1:17']}),
    ('en-walk', 'en', 'Where does Jesus walk on the water?', None, {'route': 'search', 'ref': '/^(mat 14:(25|26|29)|mrk 6:(48|49)|jhn 6:19)$/'}),
    ('en-goliath', 'en', 'Where does David kill Goliath?', None, {'route': 'search', 'ref': G17}),
    ('en-enemies', 'en', 'Where does it say love your enemies?', None, {'route': 'search', 'ref': '/^(mat 5:44|luk 6:(27|35))$/'}),
    ('en-quoted', 'en', 'Where does it say "great fish"?', None, {'route': 'search', 'ref': '/^(jon 1:17|mat 12:40)$/'}),
    ('en-gates', 'en', 'What function did city gates have?', None, {'route': 'intro', 'ref': 'rut front:intro'}),
    ('en-marriage', 'en', 'What important marriage custom is in Ruth?', None, {'route': 'intro', 'ref': 'rut front:intro'}),
    ('en-hyperbole', 'en', 'hyperbole', None, {'route': 'article', 'concept': 'ta:translate/figs-hyperbole'}),
    ('en-merism', 'en', 'merism', None, {'route': 'article', 'concept': 'ta:translate/figs-merism'}),
    ('en-none', 'en', 'rapture', None, {'route': 'search', 'useful': False, 'has': ['rapture', 'a reference'], 'not': ['one word']}),
    ('es-jonah-book', 'es', '¿Dónde fue tragado Jonás por un pez?', {'intent': 'passage', 'book': 'Jonás', 'lang': 'es'},
     {'route': 'search', 'ref': 'jon 1:17', 'has': ['^Está en Jonás 1:17']}),
    ('es-abraham', 'es', '¿En qué versículo Abraham sacrifica a Isaac?', None, {'route': 'search', 'ref': '/^gen 22:/'}),
    ('es-goliath', 'es', '¿Dónde mata David a Goliat?', None, {'route': 'search', 'ref': G17}),
    ('es-snow', 'es', '¿Dónde se habla de la nieve?', None, {'route': 'search', 'has': ['nieve|snow']}),
    ('es-marriage', 'es', '¿Qué costumbre matrimonial hay en Rut?', None, {'route': 'intro', 'ref': 'rut front:intro'}),
    ('es-hyperbole', 'es', 'hipérbole', None, {'route': 'article', 'concept': 'ta:translate/figs-hyperbole'}),
    ('es-none', 'es', 'arrebatamiento', None, {'route': 'search', 'useful': False, 'has': ['arrebatamiento', 'una referencia'], 'not': ['una sola palabra']}),
    ('fr-jonah', 'fr', 'Où Jonas a-t-il été avalé par un poisson ?', None, {'route': 'search', 'ref': 'jon 1:17'}),
    ('fr-goliath', 'fr', 'Où David a-t-il tué Goliath ?', None, {'route': 'search', 'ref': G17}),
    ('id-jonah', 'id', 'Di mana Yunus ditelan ikan besar?', None, {'route': 'search', 'ref': 'jon 1:17'}),
    ('id-walk', 'id', 'Di mana Yesus berjalan di atas air?', None, {'route': 'search', 'ref': '/^(mat 14:(25|26|29)|mrk 6:(48|49)|jhn 6:19)$/'}),
    ('id-goliath', 'id', 'Di mana Daud membunuh Goliat?', None, {'route': 'search', 'ref': G17}),
    ('id-snow', 'id', 'Di mana disebut salju?', None, {'route': 'search', 'has': ['snow|salju']}),
    ('hi-jonah', 'hi', 'योना को मछली ने कहाँ निगला?', None, {'route': 'search', 'ref': 'jon 1:17'}),
    ('hi-goliath', 'hi', 'दाऊद ने गोलियत को कहाँ मारा?', None, {'route': 'search', 'ref': G17}),
    ('ar-jonah', 'ar', 'أين ابتلع الحوت يونان؟', None, {'route': 'search', 'ref': 'jon 1:17'}),
    ('ar-goliath', 'ar', 'أين قتل داود جليات؟', None, {'route': 'search', 'ref': G17}),
    ('ar-snow', 'ar', 'أين يذكر الثلج؟', None, {'route': 'search', 'has': ['ثلج|الثلج|ٱلثَّلْجِ|الثَّلْجِ|ثَلْج']}),
    # review of Nov 15: one verse is THE answer only when it is clearly ahead ("Jesus" and "born" are in many verses alike)
    ('not-en-born', 'en', 'Where was Jesus born?', None, {'route': 'search', 'not': [NOT_WHERE]}),
    ('not-es-born', 'es', 'dónde nació Jesús', None, {'route': 'search', 'not': [NOT_WHERE]}),
    ('not-ar-born', 'ar', 'أين ولد يسوع', None, {'route': 'search', 'not': [NOT_WHERE]}),
    ('not-hi-born', 'hi', 'यीशु का जन्म कहाँ हुआ?', None, {'route': 'search', 'not': [NOT_WHERE]}),
    ('not-en-boat', 'en', 'Where is the boat?', None, {'route': 'search', 'not': [NOT_WHERE]}),
    ('not-en-car', 'en', 'Where did Jesus park his car?', None, {'not': [NOT_WHERE]}),
    # the Spanish pack's only "matrimonio" is in a verse it cannot show: English verses, not the introduction to Ruth
    ('es-marriage-verses', 'es', '¿Qué dice la Biblia sobre el matrimonio?', None, {'route': 'search', 'ref': '/^[1-3a-z]{3} \\d+:\\d+$/'}),
    # nothing to find: say so, suggest no word no pack has, no article by a close spelling ("internet" is not "intercede")
    ('none-en-asdf', 'en', 'asdf', None, {'route': 'search', 'useful': False, 'not': ['\\*\\*asdf\\*\\*']}),
    ('none-en-keys', 'en', 'qwerty zxcvb', None, {'route': 'search', 'useful': False}),
    ('none-en-phone', 'en', 'Where is the smartphone in the Bible?', None, {'route': 'search', 'useful': False}),
    ('none-es-internet', 'es', '¿Dónde aparece el internet?', None, {'route': 'search', 'useful': False, 'notConcept': 'intercede'}),
]


def findall():
    return [{'id': f'findall-{i}', 'set': 'findall', 'lang': lang, 'q': q, 'slots': slots, 'expect': e, 'from': 'one search that always returns something (Nov 15)'}
            for i, lang, q, slots, e in FINDALL]


# Guiding without blocking (Abel, Nov 15; handoff/mini-servant/diseno-grafo.md, Fase 2), code alone. Out of scope: a question
# about nothing Mini helps with gets one line of what it helps with and ways back (a passage, a key term, an Academy topic);
# one with an off-topic word and something about the Bible is answered as usual. Paths: a task announced on a book starts a
# path at its introduction, with its marker and the first section as the first next step; anything else starts none.
OOS_BACK = ['^jon 1 text,notes$', '^tw:', '^ta:']
RUT23 = {'q': 'Show me Ruth 2:3', 'slots': {'intent': 'passage', 'book': 'rut', 'chapter': 2, 'verse_start': 3, 'what': ['text'], 'lang': 'en'}}
GUIDE = [
    # (id, lang, question, expectations, turns before)
    ('oos-en-weather', 'en', 'What is the weather tomorrow?', {'oos': True, 'follow': OOS_BACK}, None),
    ('oos-en-football', 'en', 'Who won the football match yesterday?', {'oos': True, 'follow': OOS_BACK}, None),
    ('oos-en-price', 'en', 'How much is a dollar in pesos?', {'oos': True}, None),
    ('oos-en-hello', 'en', 'Hello, how are you?', {'oos': True, 'not': ['hell']}, None),
    ('oos-es-weather', 'es', '¿Qué tiempo hace mañana?', {'oos': True, 'has': ['traducción de la Biblia'], 'follow': OOS_BACK}, None),
    ('oos-es-football', 'es', '¿Quién ganó el partido de fútbol?', {'oos': True}, None),
    ('oos-es-price', 'es', '¿Cuánto cuesta el dólar hoy?', {'oos': True}, None),
    ('oos-es-hello', 'es', 'Hola, ¿cómo estás?', {'oos': True}, None),
    ('oos-fr-weather', 'fr', 'Quel temps fera-t-il demain ?', {'oos': True, 'has': ['traduire la Bible']}, None),
    ('oos-fr-football', 'fr', 'Qui a gagné le match de foot ?', {'oos': True}, None),
    ('oos-fr-hello', 'fr', 'Bonjour, comment ça va ?', {'oos': True}, None),
    ('oos-id-weather', 'id', 'Bagaimana cuaca besok?', {'oos': True, 'has': ['penerjemahan Alkitab'], 'follow': OOS_BACK}, None),
    ('oos-id-football', 'id', 'Siapa yang menang pertandingan sepak bola?', {'oos': True}, None),
    ('oos-id-hello', 'id', 'Halo, apa kabar?', {'oos': True}, None),
    ('oos-hi-weather', 'hi', 'कल मौसम कैसा रहेगा?', {'oos': True, 'has': ['बाइबल अनुवाद'], 'follow': OOS_BACK}, None),
    ('oos-hi-cricket', 'hi', 'क्रिकेट मैच कौन जीता?', {'oos': True}, None),
    ('oos-hi-hello', 'hi', 'नमस्ते, आप कैसे हैं?', {'oos': True}, None),
    ('oos-ar-weather', 'ar', 'كيف الطقس غدا؟', {'oos': True, 'has': ['ترجمة الكتاب المقدس'], 'follow': OOS_BACK}, None),
    ('oos-ar-football', 'ar', 'من فاز في مباراة كرة القدم؟', {'oos': True}, None),
    ('oos-ar-hello', 'ar', 'مرحبا، كيف حالك؟', {'oos': True}, None),
    # after an article read from a passage: back to that passage (its point), its key term and the Academy article its notes cite
    ('oos-en-after-article', 'en', 'What is the weather tomorrow?', {'oos': True, 'follow': ['^rut 2:3 ', '^tw:', '^ta:']}, [RUT23, {'q': 'What does love mean?'}]),
    # on a passage, the weather is out of scope too; its first button goes back to the passage (re-review of Nov 15)
    ('oos-en-tomorrow-ctx', 'en', 'What is the weather tomorrow?', {'oos': True, 'follow': ['^rut 2:3 ']}, [{'q': 'Show me Ruth 2:3'}]),
    ('oos-es-tomorrow-ctx', 'es', '¿Qué tiempo hace mañana?', {'oos': True, 'follow': ['^rut 2:3 ']}, [{'q': 'Muéstrame Rut 2:3'}]),
    ('oos-fr-tomorrow-ctx', 'fr', 'Quel temps fera-t-il demain ?', {'oos': True, 'follow': ['^rut 2:3 ']}, [{'q': 'Montre-moi Ruth 2:3'}]),
    ('oos-id-tomorrow-ctx', 'id', 'Bagaimana cuaca besok?', {'oos': True, 'follow': ['^rut 2:3 ']}, [{'q': 'Tunjukkan Rut 2:3'}]),
    ('oos-hi-tomorrow-ctx', 'hi', 'कल मौसम कैसा रहेगा?', {'oos': True, 'follow': ['^rut 2:3 ']}, [{'q': 'रूत 2:3 दिखाइए'}]),
    ('oos-ar-tomorrow-ctx', 'ar', 'كيف الطقس غدا؟', {'oos': True, 'follow': ['^rut 2:3 ']}, [{'q': 'أرني راعوث 2:3'}]),
    # never over a follow-up of the conversation, nor with something else than weak words ("gracias, ¿y el siguiente?")
    ('in-en-there', 'en', 'What is the weather there?', {'useful': False}, [RUT23]),
    ('in-es-gracias-next', 'es', 'gracias, ¿y el siguiente?', {'ref': 'rut 2:4'}, [RUT23]),
    ('in-en-ephah-ctx', 'en', 'how much is an ephah?', {'useful': False}, [RUT23]),
    ('in-es-efa-ctx', 'es', '¿cuánto vale un efa?', {'useful': False}, [RUT23]),
    # greetings, thanks, "how much", "what time" are weak: only with nothing else are they out of scope (review of Nov 15)
    ('in-en-hello-naomi', 'en', 'hello, who is Naomi?', {'useful': False}, None),
    ('in-en-denarius', 'en', 'How much is a denarius?', {'useful': False}, None),
    ('in-en-talent', 'en', 'How much is a talent worth?', {'useful': False}, None),
    ('in-es-denario', 'es', '¿Cuánto vale un denario?', {'useful': False}, None),
    ('in-es-hola-noemi', 'es', 'Hola, ¿quién es Noemí?', {'useful': False}, None),
    ('in-fr-bonjour-noemi', 'fr', 'Bonjour, qui est Noémi ?', {'useful': False}, None),
    ('in-id-sparrows', 'id', 'berapa harga dua burung pipit?', {'useful': False}, None),
    ('in-id-halo-naomi', 'id', 'Halo, siapa Naomi?', {'useful': False}, None),
    ('in-hi-namaste-naomi', 'hi', 'नमस्ते, नाओमी कौन है?', {'useful': False}, None),
    ('in-hi-price-wheat', 'hi', 'गेहूँ का दाम क्या था?', {'useful': False}, None),
    ('in-ar-grace', 'ar', 'مرحبا، ما معنى النعمة؟', {'useful': False}, None),
    ('in-ar-boaz', 'ar', 'شكرا، من هو بوعز؟', {'useful': False}, None),
    # never over a reading of the question: the reader read a term ("weather" as an article to look up)
    ('in-en-reader-term', 'en', 'What does the Bible say about the weather?', {'useful': False}, None, {'intent': 'article', 'term': 'weather', 'lang': 'en'}),
    ('in-en-reader-term2', 'en', 'Weather?', {'useful': False}, None, {'intent': 'article', 'term': 'weather', 'lang': 'en'}),
    # the app in English, the question in another language: the reply in the question's (a report of Nov 15)
    ('oos-es-ui-en', 'en', '¿Qué tiempo hará mañana?', {'oos': True, 'has': ['traducción de la Biblia'], 'not': ['I help with']}, None),
    ('oos-fr-ui-en', 'en', 'Quel temps fera-t-il demain ?', {'oos': True, 'has': ['traduire la Bible'], 'not': ['I help with']}, None),
    ('oos-id-ui-en', 'en', 'Bagaimana cuaca besok?', {'oos': True, 'has': ['penerjemahan Alkitab'], 'not': ['I help with']}, None),
    # an off-topic word with something about the Bible: answered as usual
    ('in-en-hello-ref', 'en', 'Hello, show me Ruth 2:3', {'route': 'passage', 'ref': 'rut 2:3'}, None),
    ('in-en-jerusalem', 'en', 'What is the weather like in Jerusalem?', {'useful': False}, None),
    ('in-en-bible-price', 'en', 'How much is a denarius in the Bible?', {'useful': False}, None),
    ('in-es-hola-ref', 'es', 'Hola, ¿qué dice Rut 1:16?', {'route': 'passage', 'ref': 'rut 1:16'}, None),
    ('in-es-gracias-notes', 'es', 'Gracias. ¿Y las notas de Rut 2:4?', {'route': 'passage', 'ref': 'rut 2:4'}, None),
    ('in-fr-bonjour-ref', 'fr', 'Bonjour, Ruth 1:1', {'ref': 'rut 1:1'}, None),
    ('in-id-halo-ref', 'id', 'Halo, tunjukkan Rut 2:4', {'route': 'passage', 'ref': 'rut 2:4'}, None),
    ('in-hi-namaste-ref', 'hi', 'नमस्ते, रूत 1:1 दिखाइए', {'route': 'passage', 'ref': 'rut 1:1'}, None),
    ('in-ar-marhaba-ref', 'ar', 'مرحبا، أرني راعوث 1:1', {'route': 'passage', 'ref': 'rut 1:1'}, None),
    # a task announced on a book: its introduction, and a path through it
    ('path-en-titus', 'en', "I'm translating Titus 1", {'route': 'intro', 'ref': 'tit 1:intro', 'mark': '^Titus 1 · step 1 of 5: introduction$', 'follow': ['^tit 1:1-\\d+ text$']}, None),
    ('path-en-review', 'en', 'I am reviewing Jonah 2', {'route': 'intro', 'ref': 'jon 2:intro', 'mark': '^Jonah 2 · step 1 of 5', 'follow': ['^jon 2:1-\\d+ text$']}, None),
    ('path-es-ruth', 'es', 'Voy a traducir Rut', {'route': 'intro', 'ref': 'rut front:intro', 'mark': '^Rut · paso 1 de 5: introducción$', 'follow': ['^rut 1:1-5 text$']}, None),
    ('path-es-review', 'es', 'Estoy revisando Jonás 2', {'route': 'intro', 'ref': 'jon 2:intro', 'mark': '^Jonás 2 · paso 1 de 5', 'follow': ['^jon 2:1-\\d+ text$']}, None),
    ('path-fr-ruth', 'fr', 'Je vais traduire Ruth', {'route': 'intro', 'ref': 'rut front:intro', 'mark': 'étape 1 sur 5', 'follow': ['^rut 1:1-5 text$']}, None),
    ('path-id-ruth', 'id', 'Saya sedang menerjemahkan Rut 1', {'route': 'intro', 'ref': 'rut 1:intro', 'mark': 'langkah 1 dari 5', 'follow': ['^rut 1:1-5 text$']}, None),
    ('path-hi-ruth', 'hi', 'मैं रूत का अनुवाद कर रहा हूँ', {'route': 'intro', 'ref': 'rut front:intro', 'mark': 'चरण 1/5', 'follow': ['^rut 1:1-5 text$']}, None),
    ('path-ar-ruth', 'ar', 'سأترجم راعوث', {'route': 'intro', 'ref': 'rut front:intro', 'mark': 'الخطوة 1 من 5', 'follow': ['^rut 1:1-5 text$']}, None),
    ('path-ar-review', 'ar', 'أراجع يونان 2', {'route': 'intro', 'ref': 'jon 2:intro', 'mark': 'الخطوة 1 من 5'}, None),
    # not a task on a book: no path
    ('nopath-en-prayer', 'en', "I want to translate Jonah's prayer", {'mark': None, 'useful': False}, None),
    ('nopath-es-question', 'es', 'Estoy revisando Jonás 2:3, ¿qué significa calamidad?', {'mark': None, 'useful': False}, None),
    ('nopath-en-ref', 'en', 'Show me Ruth 2:3', {'mark': None, 'ref': 'rut 2:3'}, None),
]


def guide():
    # (id, lang, question, expectations, turns before[, the reader's slots])
    return [{'id': g[0], 'set': 'guide', 'lang': g[1], 'q': g[2], 'slots': g[5] if len(g) > 5 else None, 'expect': g[3], **({'before': g[4]} if g[4] else {}),
             'from': 'guiding without blocking (Nov 15): out of scope, paths', 'fast': g[0].endswith(('-weather', '-ruth'))}
            for g in GUIDE]


def main():
    OUT.mkdir(exist_ok=True)
    sets = {'q36': q36(), 'langs': langs(), 'new18': new18(), 'followup': followup(False) + followup(True) + followup_more(),'reports': reports(), 'quechua': quechua(), 'academy': academy(), 'findall': findall(),
            'guide': guide()}
    for name, rows in sets.items():
        for r in rows:
            if r['id'] in KNOWN:
                r['known'] = KNOWN[r['id']]
            if r['id'] in FAST or r['set'] == 'reports':
                r['fast'] = True
        (OUT / f'{name}.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows), encoding='utf-8')
        print(name, len(rows))


if __name__ == '__main__':
    main()
