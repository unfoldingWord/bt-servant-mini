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
- **noble-curves / noble-hashes** (Paul Miller), **pako**: MIT License (bundled through `language-pack-client`).

Online AI (optional, off until the person turns it on; not inside the APK):

- **Built with Llama.** Answers with online AI are written by Llama 3.3 70B Instruct (Meta) on Cloudflare Workers AI
  (`worker/`). Llama 3.3 is licensed under the Llama 3.3 Community License, Copyright © Meta Platforms, Inc. All Rights
  Reserved: https://www.llama.com/llama3_3/license/ (and its Acceptable Use Policy: https://www.llama.com/llama3_3/use-policy/).
