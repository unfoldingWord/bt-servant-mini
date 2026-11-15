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
R_CODE = 'follow-up read by code alone: withContext does not cover this kind (needs a reader with the state)'
# Expected to fail today, by case id: why. Reported apart, never fail the build; flagged when they start passing.
KNOWN = {
    'obs-3-5-text': R_OBS, 'obs-notes-3-4': R_OBS, 'ta-rhetorical-question': R_OPEN,
    **{i: R_TU for i in ['advice-rut-1-13-hand-of-yahweh', 'advice-jon-2-10-vomited-nonote', 'advice-tit-3-5-lavamiento',
                         'advice-rut-1-14-alzaron-voces', 'advice-tit-1-12-malas-bestias', 'evl-id-04', 'evl-hi-04', 'evl-hi-27',
                         'evl-hi-28', 'evl-fr-04', 'evl-fr-10', 'evl-fr-27', 'evl-fr-28', 'evl-ar-04']},
    **{i: R_HI for i in ['evl-hi-05', 'evl-hi-07', 'evl-hi-14', 'evl-hi-15', 'evl-hi-17', 'evl-hi-22', 'fu-hi-what', 'fu-hi-count_ch']},
    **{i: R_OPEN for i in ['evl-hi-26', 'evl-ar-26']},
    **{i: R_TERM for i in ['evl-hi-21', 'evl-ar-19', 'evl-ar-20', 'evl-ar-21', 'new-id-unknown', 'new-ar-unknown', 'fu-hi-new_topic',
                           'fu-ar-new_topic', 'fu-hi-new_topic-code', 'fu-ar-new_topic-code']},
    'new-en-unknown': 'the howTranslate vocabulary has no "render"',
    'new-fr-unknown': '"olivier" names no article, and there is no fr pack: "no pack" answer',
    **{i: R_BOOKS for i in ['new-es-books', 'new-id-books']},
    **{i: R_MEANING for i in ['new-hi-meaning', 'new-ar-meaning', 'quechua-05']},
    **{i: R_ISA for i in ['fu-en-term_book', 'fu-es-term_book', 'fu-fr-term_book', 'fu-id-term_book', 'fu-hi-term_book']},
    **{f'fu-{l}-{k}-code': R_CODE for l in ['en', 'es', 'fr', 'id', 'hi', 'ar'] for k in ['next', 'term_here', 'count_ch']},
    **{f'fu-{l}-what-code': R_CODE for l in ['id', 'hi', 'ar']},
    'fu-ar-verse-code': 'refInText reads العدد ("the verse") as the book of Numbers',
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
    return [{'id': i, 'set': 'reports', 'lang': 'en', 'q': q, 'slots': s, 'before': b, 'expect': e, 'from': 'user reports Nov 13-14'}
            for i, q, s, b, e in rows]


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
    ('en-none', 'en', 'rapture', None, {'route': 'search', 'useful': False, 'has': ['rapture', 'one word']}),
    ('es-jonah-book', 'es', '¿Dónde fue tragado Jonás por un pez?', {'intent': 'passage', 'book': 'Jonás', 'lang': 'es'},
     {'route': 'search', 'ref': 'jon 1:17', 'has': ['^Está en Jonás 1:17']}),
    ('es-abraham', 'es', '¿En qué versículo Abraham sacrifica a Isaac?', None, {'route': 'search', 'ref': '/^gen 22:/'}),
    ('es-goliath', 'es', '¿Dónde mata David a Goliat?', None, {'route': 'search', 'ref': G17}),
    ('es-snow', 'es', '¿Dónde se habla de la nieve?', None, {'route': 'search', 'has': ['nieve|snow']}),
    ('es-marriage', 'es', '¿Qué costumbre matrimonial hay en Rut?', None, {'route': 'intro', 'ref': 'rut front:intro'}),
    ('es-hyperbole', 'es', 'hipérbole', None, {'route': 'article', 'concept': 'ta:translate/figs-hyperbole'}),
    ('es-none', 'es', 'arrebatamiento', None, {'route': 'search', 'useful': False, 'has': ['arrebatamiento', 'una sola palabra']}),
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
]


def findall():
    return [{'id': f'findall-{i}', 'set': 'findall', 'lang': lang, 'q': q, 'slots': slots, 'expect': e, 'from': 'one search that always returns something (Nov 15)'}
            for i, lang, q, slots, e in FINDALL]


def main():
    OUT.mkdir(exist_ok=True)
    sets = {'q36': q36(), 'langs': langs(), 'new18': new18(), 'followup': followup(False) + followup(True), 'reports': reports(), 'quechua': quechua(), 'academy': academy(), 'findall': findall()}
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
