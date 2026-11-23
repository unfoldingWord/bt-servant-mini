# Third-party notices

BT Servant Mini (alpha) ships these inside the APK:

- **Model**: FunctionGemma 270M (Google), fine-tuned with LoRA by unfoldingWord for this app and quantized to GGUF q8_0.
  Gemma is provided under and subject to the Gemma Terms of Use: https://ai.google.dev/gemma/terms
  (and its Prohibited Use Policy: https://ai.google.dev/gemma/prohibited_use_policy). The fine-tuned model is a Model Derivative.
- **llama.cpp** (build b12318, Android arm64 binaries, `llama-server`): MIT License, Copyright (c) 2023-2026 The ggml authors.
  https://github.com/ggml-org/llama.cpp
- **Language packs (format 3)**: unfoldingWord translation helps (ULT, UST, Translation Notes, Questions, Words, Words Links,
  Academy) and their Gateway Language versions, CC BY-SA 4.0. Berean Standard Bible (BSB): public domain. Built from Door43
  resources by the unfoldingWord language-pack builder.
- **People, places, events and families in the language packs** (the `xtopics` and `topics` units; Mini reads them for family
  questions, a person's card and who is named in a verse or a story, and builds every link in memory):
  - **TIPNR** (Translators Individualised Proper Names with all References), STEPBible / Tyndale House, Cambridge
    (https://github.com/STEPBible/STEPBible-Data), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/): the people and places,
    the verses that name them, and the family relations (parent, sibling, spouse).
  - **ACAI Biblical Entity Data** © 2024 by BiblioNexus (https://github.com/BibleAquifer/ACAI), CC BY-SA 4.0
    (https://creativecommons.org/licenses/by-sa/4.0/). Changed: only the gender, the names and other names of each person in the
    app's languages, and the links to Translation Words articles are used, joined to TIPNR by ACAI's own TIPNR keys; ACAI's
    relations, descriptions and versification are not used.
  - **Theographic Bible Metadata** (Robert Rouse, https://github.com/robertrouse/theographic-bible-metadata), CC BY-SA 4.0: the
    events and the people and places that take part in them (which Open Bible Stories tell an event a person is in).
  - **OpenBible.info Bible Geocoding Data** (https://github.com/openbibleinfo/Bible-Geocoding-Data), CC BY 4.0
    (https://creativecommons.org/licenses/by/4.0/): the point of each place and how sure its location is. Changed: only the best
    point, a certainty level and the place type are used. Mini reads them for «where is X», distances, days of travel and the map.
  - **Natural Earth** (https://www.naturalearthdata.com), public domain: the coast, lakes and rivers of the base map (land 5.1.1,
    lakes 5.0.0, rivers_lake_centerlines 5.0.0), a small `basemap` file the app downloads once from the packs server; without it the
    places are drawn on a plain background. Made with Natural Earth.
  The packs are built from these by the unfoldingWord language-pack builder and shared under CC BY-SA 4.0; each family and place
  answer names its sources under it.
- **Open Bible Stories pictures** (the optional format-3 catalog `zxx-obsimg`, not inside the APK; downloaded from the packs
  server on a tap in the menu, or passed as a `.tcpack` file): illustrations © Sweet Publishing (https://sweetpublishing.com),
  CC BY-SA 3.0 Unported (https://creativecommons.org/licenses/by-sa/3.0/). Converted to WebP (quality 75) from Door43's
  obs-images-360px.zip by the unfoldingWord language-pack builder; the catalog carries this credit itself, and is shared under
  the same license. Without it, online, the app shows Door43's own pictures.
- **noble-curves / noble-hashes** (Paul Miller), **pako**: MIT License (bundled through `language-pack-client`).

Online AI (optional, off until the person turns it on; not inside the APK):

- **Built with Llama.** Answers with online AI are written by Llama 3.3 70B Instruct (Meta) on Cloudflare Workers AI
  (`worker/`). Llama 3.3 is licensed under the Llama 3.3 Community License, Copyright © Meta Platforms, Inc. All Rights
  Reserved: https://www.llama.com/llama3_3/license/ (and its Acceptable Use Policy: https://www.llama.com/llama3_3/use-policy/).
