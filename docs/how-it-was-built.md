# How BT Servant Mini was built

*A technical write-up of the approach, November 2026. Written with Claude from the project's notes, code and test reports; the
numbers are the measured ones, with their limits.*

BT Servant Mini is an Android app that answers Bible translators' questions from the unfoldingWord translation helps **without
internet**. It runs a very small language model on the phone, but that model never writes an answer. Its only job is to read the
question and fill in a structured "call sheet". The app then uses that sheet to look the answer up in the translation helps stored on
the phone. This document explains why it was built that way, how the small model was fine-tuned, how well it works, and what it would
take to support languages beyond the current six.

## 1. The shape of the system

```
question ──► short commands (no model) ──┐
         └─► small model on the phone ───┴─► call sheet (JSON) ──► recipes over tC Language Packs ──► answer + tappable helps
                                                                                       │
                                     optional, with internet and only if turned on ───► online AI explains what was found
```

Each part works like this:

1. **tC Language Packs (format 3)** hold the content: aligned literal and simplified texts (ULT/UST or the Gateway Language
   equivalents), Translation Notes, Translation Questions, Translation Words with their links, and Translation Academy. They live on
   the phone as signed, content-addressed packs, built from Door43 by the language-pack builder. The app reads them with
   `language-pack-client`.
2. **A call sheet** describes what the person wants:

   ```json
   {"intent": "passage", "book": "Jonah", "chapter": 1, "verse_start": 3, "verse_end": null,
    "what": ["notes"], "version": null, "term": null, "phrase": null, "lang": "en", "other_language": null}
   ```

   The sheet has 11 slots, and the model writes all of them. The intents are `passage`, `article`, `count`, `rank`, `resources`,
   `advice`, `search` and `unknown`. Code then resolves the sheet: book names become book codes, terms become Translation Words or
   Academy ids, and an ambiguous word becomes a "which one do you mean?" choice.
3. **Recipes** turn a resolved sheet into an answer from the packs: a passage with its notes, questions and key terms; an article with
   the verses that use the term; counts; a free-text search over verses, notes and questions; introductions.
4. **Templates** write the sentence that presents the answer ("Here are 35 translation notes for Jonah 2"). The sentence is built
   from real data in the app's six languages. No model writes it.
5. **The interactive view** shows the passage with its words tied to the notes and key terms through the alignment. Tapping a word
   opens its helps in a bottom panel.

**Why the model only fills a sheet.** We first measured what the packs and recipes can do when the sheet is right: they answered
31 of 36 test questions correctly. Then we let small models (Qwen3 0.6B, Llama 3.2 1B, Gemma 3 1B) write the answer sentence. All of
them invented things: counts, verse text, definitions, even Hebrew. On a 2–3 GB phone, a generative model should not be the part
that decides what the translator reads. So the model on the phone only interprets the question, and everything the person reads is
the published resource, with its name and version.

**Short commands work without the model.** A small vocabulary in all six app languages covers the common requests: `Jonah 1:3`,
`Jonah 1:3 notes`, `Jonah 2 intro`, `grace`, `Jonah fish`, "reply in Indonesian", "key terms". It is one data file
(`web/src/data/commands.json`) with a test table, and it works even before the model is downloaded or when it is turned off. The
model adds understanding of free phrasing on top of those commands.

## 2. tC Language Packs: what they are, and why everything depends on them

A **tC Language Pack** is one Gateway Language's translation helps, packaged so that an app can use them offline. The packs come
from the same work as tC Study (study.translationcore.com), and both apps read the same packs. A pack holds:

- **the Bible texts** of that language: the literal and simplified versions (the ULT and UST in English, the GLT in Spanish,
  and so on), **aligned word by word to the Hebrew and Greek**;
- **the original-language text** with its grammatical structure (from MACULA), and which words refer to which people and things;
- **Translation Notes**, each tied to the exact words of the verse it explains;
- **Translation Questions** per verse;
- **Translation Words** articles and **Translation Words Links**: which key term or name occurs at which words of which verse;
- **Translation Academy** articles, and the book and chapter introductions.

They are built from the published resources on Door43 by the language-pack builder (format 3). Each pack carries the name and
version of every resource in it, which is why each answer can say exactly where it comes from.

**How they are stored.** The content is split into small segments, each named by the hash of its bytes, and a signed catalog
lists them. That design gives four properties the app relies on:

- **Integrity offline.** The phone can check that nothing was altered, without asking a server.
- **Small updates.** A new version only downloads the segments that changed.
- **Phone-to-phone sharing.** A language can be exported as a single `.tcpack` file and loaded on another phone, without internet.
  This matters where data is expensive or unavailable.
- **Size.** The English pack with all 66 books is about 25 MB.

**Why they are the key.** Everything the translator reads in BT Servant Mini comes from a pack. More importantly, the structure of
the packs does the work that would otherwise need a large AI model:

- *"Notes on Jonah 1:3"*, *"key terms in Titus 1"* and *"questions for Ruth 1"* are direct lookups.
- *"Where is grace mentioned?"* uses the Words Links: the verses where the term is actually tagged, not just where a string
  matches.
- Tapping a word in the verse opens the notes and key terms for that word. This works because notes and links point at aligned
  words, and the alignment ties the Gateway Language words to the Hebrew or Greek and back.
- Counts ("how many notes on Jonah 2?") and searches over verses, notes and questions run on the pack's own indexes.

So the small model only has to say *what* the person wants; the pack already knows *where* it is. That is what makes a 270M model
enough on a phone, and the same holds in every language: **supporting a new language is mostly a matter of having its pack.**

## 3. Choosing the base model

We first tested untuned small models on 36 English and Spanish questions with hand-checked gold sheets: 24 used while developing and
12 held out. The score is the number of exactly correct sheets:

| Model (untuned) | Exact sheets / 36 |
|---|---|
| Qwen3 0.6B | 10 |
| Granite 4 350M | 9 |
| Llama 3.2 1B | 2 |
| Gemma 3 270M | 2 |
| FunctionGemma 270M | 1 |
| Rules only (regular expressions, no model) | 25 |
| Claude Haiku (upper reference, not on the phone) | 30 |

We chose **FunctionGemma 270M** (`google/functiongemma-270m-it`) even though it scored lowest untuned, for four reasons:

- it is built for function calling, which is exactly this task;
- Google reports large gains from fine-tuning it (58% → 85% on its Mobile Actions benchmark);
- the file is about 290 MB and peaks around 550–650 MB of RAM, which fits a mid-range phone;
- llama.cpp runs it well on Android.

## 4. Training data

Only some of the data was written by people; most was generated by script from templates.

- **English and Spanish:** a script (`gen_train.py`, fixed seed) fills question templates with book names and Translation Words
  aliases taken from the English and Spanish packs. References are written many ways ("Jonah 1:3", "chapter 1 verse 3 of Jonah",
  "Jon 1.3"…). 20% of the questions get typos and 12% are all lower case. About 10% are deliberately off-topic (greetings, noise),
  labelled `unknown`.
- **French, Indonesian, Hindi and Arabic:** a second script (`gen_langs.py`) uses book-name tables for all 66 books in each language,
  including common variants. The Arabic table uses the Van Dyke names.
- **Size:**

  | Language | Rows |
  |---|---|
  | English | 1016 |
  | Spanish | 1014 |
  | French, Indonesian, Hindi | 270 each |
  | Arabic | 270, added after the shipped model (see below) |

  The shipped model was trained on 2840 rows.
- **Evaluation:**
  - English and Spanish: the 36 questions with gold sheets.
  - French, Indonesian, Hindi and Arabic: 12 questions each, 6 for development and 6 held out.
  - A check found no exact or near-duplicate questions between the training and evaluation sets.
- **Honest limits of the data:**
  - Claude wrote the question templates and the French, Indonesian, Hindi and Arabic variants, and no native speaker has reviewed
    them yet. Review samples are ready for that.
  - Every question so far was written by us, not by translators. Real questions are the most valuable data we can get. This is why
    the app now has answer reports (section 8).

## 5. The fine-tuning recipe

| | |
|---|---|
| Method | LoRA: r = 16, alpha = 32, dropout 0.05, on q, k, v, o, gate, up and down projections |
| Training | 2 epochs, learning rate 2e-4 (cosine, 20 warm-up steps), batch 8, max 512 tokens, loss only on the answer |
| Prompt | one fixed instruction plus the question, no examples: exactly the prompt the app sends |
| Hardware | free Google Colab, one T4 GPU, about 20 minutes for training, merging and conversion |
| Merge | `merge_and_unload` into the base model (bf16, 431 MB); the LoRA adapter itself is 15 MB |
| Quantization | llama.cpp `convert_hf_to_gguf.py --outtype q8_0` → `ms-all-q8.gguf`, 291.6 MB |
| On the phone | `llama-server` from llama.cpp build b12318 for Android arm64, listening only on 127.0.0.1, started by the app |

A few practical lessons from getting this to run:

- Ollama could not load these fine-tuned files correctly, so the app uses llama.cpp directly.
- Colab needed `torchao` removed before the training libraries would work.
- Example questions in the prompt made untuned models copy them, so the prompt has none.

## 6. How well it works

| Measurement | Result |
|---|---|
| Valid JSON, in Colab (transformers) | 35 of 36 after fine-tuning; 0 of 36 before |
| Correct intent, in Colab | 34 of 36 |
| Exact sheets, quantized model on a desktop CPU | 18 of 36 (13 of 24 development + 5 of 12 held out); rules alone got 25 |
| Free questions in other languages, on the phone | Indonesian 9 of 12, French 8 of 12, Hindi 5 of 12 (untuned: 0) |
| Exact sheets, on a Galaxy A56 | 15 of 24 development + 5 of 12 held out |
| Speed, on a Galaxy A56 | median 4.6 s per model call; 1–3 s per answer in normal use |
| Memory, on a Galaxy A56 | about 640 MB |

The time between pressing send and seeing the answer is usually a few seconds. A few calls stalled for much longer (up to about a
minute), so the worst case is not bounded yet. We have not measured a 2–3 GB phone.

What this means in practice: the fine-tuned model is not better than hand-written rules at exact sheets. It adds value where rules
cannot follow free phrasing and other languages. So the app combines them: commands and references are read by code first, the model
fills the rest, and code checks what it wrote (for example, a book only counts if its name really appears in the question). Counting
questions are the weakest. **The model shipped today was not trained on Arabic.** Arabic works through script detection, references,
commands and search, and the Arabic training rows will go into the next model.

## 7. Supporting other languages

There are three layers, and a language can be added one layer at a time.

**a. Content: a tC Language Pack.** This is the essential part, and it depends on what exists on Door43. A Gateway Language needs
its literal and simplified texts aligned to the Hebrew and Greek, plus its Notes, Questions, Words and Words links. The
language-pack builder makes a format-3 pack from them; the app downloads it from the menu, or loads it from a `.tcpack` file. Door43
has complete helps for several more Gateway Languages (for example Bengali, Gujarati, Kannada, Marathi, Nepali, Odia and Telugu).
When a book or pack is missing, the app answers from the English pack.

**b. The app's words.** These are about a day of work per language, plus review by a native speaker:

- the interface strings and About;
- the book-name table with common variants;
- the answer templates (about 50 short sentences);
- the command words (notes, questions, intro, key terms, "reply in…");
- a short list of story words for search (sea, fish, lion…, mapped to English);
- right-to-left layout or script detection where needed.

**c. The model.** A new language needs about 270 generated training rows from its book table and templates, plus 12 evaluation
questions. Then the model is retrained (about 20 minutes on a free T4) and the new 290 MB file is published. This layer is
optional: without it, a language still works through references, commands, word lookups and search. That is how Arabic works today.
Free phrasing in that language is what is missing.

For any of these, the most important step is the same: questions written by real translators in that language, and a native
speaker who checks the templates and the training questions.

## 8. Continuous improvement: learning from users

We are continuing to fine-tune the model, and the app now collects what we need to do it from real use:

- **Answer reports.** Under each answer there is a thumbs up and a thumbs down. With a thumbs down, the person can send a report:
  what went wrong, a comment, and, if they leave it checked, the conversation up to that answer. The report includes what the model
  understood (its call sheet), so we can see exactly where it went wrong. Reports are opt-in for each report, show exactly what will
  be sent, and contain nothing that identifies the person or the phone. They say plainly that they may be used to train the model.
- **From reports to training data.** A script exports the reports as candidates. For each one, a reviewer:
  - writes the correct sheet;
  - removes anything personal from the question;
  - adds it to the training set.

  The model is then retrained and checked against the evaluation table before it is published. One report is a single example, but
  the pattern behind it often matters more. For example, a tester asked for "Titus chapter 1, reply in Indonesian" and "the key terms
  for Titus 1". From that we added "reply in…", "key terms" and "chapter N of…" in all six languages, and we can generate many more
  training questions of each kind.
- **Usage counts** (opt-in, off by default) send daily totals only, never question text. They show which kinds of questions fail
  most often, so we know where to focus.

## 9. Beyond the phone

The app is built in levels, and uses the highest one the phone and the person allow:

- **Level 0:** no model. References, commands and search.
- **Level 1 (now):** the small model on the phone.
- **Level 2:** a larger model on phones with more memory. Being measured.
- **Level 3:** optional online AI. With internet, and only if the person turns it on, a larger model (Llama 3.3 70B on Cloudflare
  Workers AI) writes an explanation from the helps the phone found. It also gets the surrounding verses and the chapter and book
  introductions. Its explanation is marked as such, and the helps stay below it as the sources.

Because some translators work where this is risky, the app has a safety question at first launch, a discreet mode and a PIN. It also
says clearly what leaves the phone and what a network observer can see.

## Links

- Code and releases: https://github.com/unfoldingWord/bt-servant-mini
- Page: https://bt-servant-mini.unfoldingword.workers.dev
- tC Language Packs: https://tc-language-packs.unfoldingword.workers.dev
- tC Study, the study tool built on the same packs: https://study.translationcore.com
