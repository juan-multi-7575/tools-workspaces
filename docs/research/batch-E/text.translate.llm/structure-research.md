# Text translator site research

Research date: 2026-10-06. DeepL's public document-translation page was inspected live using the built-in computer-use browser: [Document Translation](https://www.deepl.com/en/features/document-translation).

Eye Magazine's live editorial feed was also reviewed in the browser during Batch E research. It uses restrained typographic navigation and modular article, issue, and archive groups. Its editorial grid informs the visual hierarchy here; publication navigation and feed sections do not fit this tool's workflow and were omitted.

## Observed interaction patterns

- File translation begins with a prominent drag/drop or upload action.
- Language selection and translation are separate decisions after the file is identified.
- The product shows a resulting translated document as a distinct reviewable output, while supporting many file types and bulk jobs.
- The inspected page emphasizes file identity and a clear output state, though it was a marketing page rather than the signed-in workflow.

## Design direction

Treat one source file as a proofing galley: a readable source buffer with an explicit upload receipt, a focused language/provider row, and a paired source/translation reading view after a real run. Keep the columns at a 65–75 character measure, retain the original source path used for that run, and distinguish sentence pairs using actual text differences only. On mobile, stack source and translation or switch the selected pair without losing context. Use the approved white/black editorial system and Source Serif 4 + Libre Franklin; the red/blue changed-text marks represent real diffs only. Do not reuse DeepL's brand or imply preservation of document formatting when the backend translates plain text artifacts.

## Reference divergence

DeepL translates formatted documents and exposes a broader file workflow; this tool translates one uploaded text file to a text artifact. The interface borrows the source → options → output sequence and visible file receipt but makes the returned text pair the review surface.

The implementation uses a print-like hierarchy—large serif titles, small sans-serif folios, black rules, compact metadata, and a multi-column galley—around the actual stages: edit source, choose language/provider/model, and review the returned pair. Red and blue are reserved for actual unequal source/translation sentences. At narrow widths, pairs remain aligned with both labels visible and the proof offers source-only and translation-only views.

## Live implementation review

Reviewed in the computer-use browser via the browser-harness (CDP) at 1440×900, 768×1024, and 390×844. Hero, workspace-source, and returned-proof states were each captured at all three sizes and inspected for horizontal overflow, the pinned dependency strip, reading measure, and paired layout. At desktop the source editor and upload receipt form a two-column stage; the paired proof uses matching sentence rows at a Source Serif 4 65–75ch measure (the galley source/translation text is capped at 72ch). At 768px the two-column proof remains legible. At 390px the sentence pairs stay aligned with both side labels visible, the pinned dependency strip remains on-screen, and no horizontal overflow appears. Mobile source and language content extends vertically with controls reachable by scrolling. Red and blue inset marks appear only on sentences whose actual source and translation strings differ.

Final captures committed in this folder: `hero-final-1440x900.png`, `hero-final-768x1024.png`, `hero-final-390x844.png`, `workspace-final-1440x900.png`, `workspace-final-768x1024.png`, `workspace-final-390x844.png`, `result-final-1440x900.png`, `result-final-768x1024.png`, and `result-final-390x844.png`.

A real browser run uploaded a 40-byte source from the hero file action, chose target language Spanish, provider Groq, and the detected `qwen/qwen3.8-27b` model. The backend returned `status: completed` with one `translator-review-source_es.txt` artifact; the UI then read the submitted source path and the returned artifact through `api.getArtifactContent`. The actual pair was “Good morning.” → “Buenos días.” and “The train leaves at noon.” → “El tren sale al mediodía.” Both pairs differ, so both are marked red/blue (2 sentence pairs, 2 changed). No translation was generated in the browser. Provider-key saving is wired to `api.saveKey`; this run resolved `GROQ_API_KEY` from the environment (provider source `environment`) and a new UI key was not saved, to avoid replacing the configured server credential.
