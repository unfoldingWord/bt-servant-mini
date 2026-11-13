// The short commands, the same in the six app languages, checked without a model (data/commands.json).
// Run it in the desktop page (python web/build.py, serve web/desktop): paste this file in the console, or send it with a
// browser tool, then `await commandTests()`. It turns the model off while it runs and puts it back; it prints one line
// per case and returns the failures.
const BOOK = { en: 'Jonah', es: 'Jonás', fr: 'Jonas', id: 'Yunus', hi: 'योना', ar: 'يونان' }
const W = {
  en: { notes: 'notes', questions: 'questions', word: 'grace', fish: 'fish', about: 'What is Jonah about?', translate: 'How do I translate the book of Jonah?' },
  es: { notes: 'notas', questions: 'preguntas', word: 'gracia', fish: 'pez', about: '¿De qué trata Jonás?', translate: '¿Cómo puedo traducir el libro de Jonás?' },
  fr: { notes: 'notes', questions: 'questions', word: 'grâce', fish: 'poisson', about: 'De quoi parle Jonas ?', translate: 'Comment traduire le livre de Jonas ?' },
  id: { notes: 'catatan', questions: 'pertanyaan', word: 'kasih karunia', fish: 'ikan', about: 'Tentang apa kitab Yunus?', translate: 'Bagaimana menerjemahkan kitab Yunus?' },
  hi: { notes: 'नोट्स', questions: 'प्रश्न', word: 'अनुग्रह', fish: 'मछली', about: 'योना किस बारे में है?', translate: 'योना पुस्तक का अनुवाद कैसे करें?' },
  ar: { notes: 'ملاحظات', questions: 'أسئلة', word: 'نعمة', fish: 'حوت', about: 'عن ماذا يتحدث سفر يونان؟', translate: 'كيف أترجم سفر يونان؟' },
}
// what each command must give: fields of the call sheet, or the first verse found by a search
const CASES = (l) => {
  const b = BOOK[l], w = W[l]
  return [
    [`${b} 1:3`, { ref: 'jon 1:3' }],
    [`${b} 1:3 ${w.notes}`, { ref: 'jon 1:3', what: 'notes' }],
    [`${b} 1:3 ${w.questions}`, { ref: 'jon 1:3', what: 'questions' }],
    [`${b} intro`, { ref: 'jon front:intro' }],
    [`${b} 2 intro`, { ref: 'jon 2:intro' }],
    [w.about, { ref: 'jon front:intro' }],
    [w.translate, { ref: 'jon front:intro' }], // "how do I translate the book of Jonah": its introduction
    [w.word, { concept: 'tw:kt/grace' }],
    [`${b} ${w.fish}`, { first: '1:17' }],
  ]
}

async function commandTests(langs = Object.keys(BOOK)) {
  const wait = async () => {
    await new Promise((r) => setTimeout(r, 600))
    // up to a minute: the first search of a fresh page loads every pack's names and notes (up to ~40 s on a desktop)
    for (let k = 0; k < 200; k++) {
      await new Promise((r) => setTimeout(r, 300))
      if (!document.querySelector('.pending')) return
    }
  }
  const before = localStorage.getItem('btsm.model.off')
  const online = localStorage.getItem('btsm.online')
  localStorage.setItem('btsm.model.off', '1')
  localStorage.setItem('btsm.online', '0')
  const lines = [], failures = []
  try {
    for (const l of langs)
      for (const [q, want] of CASES(l)) {
        const i = document.querySelector('#q')
        i.value = q
        document.querySelector('#ask').requestSubmit()
        await wait()
        const b = [...document.querySelectorAll('.msg.bot')].pop()
        const meta = [...b.querySelectorAll('pre')].map((p) => p.textContent).join('\n')
        const json = meta.slice(meta.lastIndexOf('\n{'))
        let sheet = {}
        try { sheet = JSON.parse(json) } catch {}
        const first = [...b.querySelectorAll('.follow button')][0]?.innerText ?? ''
        const ok = (!want.ref || sheet.ref === want.ref) && (!want.what || (sheet.what ?? []).join() === want.what)
          // a word shared by two articles (hi अनुग्रह, ar نعمة: grace and favor) asks which one: fine when grace is among them
          && (!want.concept || sheet.concept === want.concept || (sheet.candidates ?? []).includes(want.concept)) && (!want.first || first.includes(want.first))
        const got = want.first ? first : `ref=${sheet.ref} what=${(sheet.what ?? []).join()} concept=${sheet.concept}${sheet.candidates ? ' choose=' + sheet.candidates.join(',') : ''}`
        lines.push(`${ok ? 'ok  ' : 'FAIL'} ${l} ${q} -> ${got}`)
        if (!ok) failures.push({ l, q, want, got })
      }
  } finally {
    if (before === null) localStorage.removeItem('btsm.model.off'); else localStorage.setItem('btsm.model.off', before)
    if (online !== null) localStorage.setItem('btsm.online', online)
  }
  console.log(lines.join('\n'))
  return { passed: lines.length - failures.length, total: lines.length, lines, failures }
}
