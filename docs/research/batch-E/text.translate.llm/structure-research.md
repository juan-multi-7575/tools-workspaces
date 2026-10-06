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

Reviewed the Codex In-app Browser at 1440×900, 768×1024, and 390×844. Hero and workspace states were inspected at desktop and phone widths; the proof was inspected at all three sizes, and source and route stages were inspected on mobile. At desktop the source editor and upload receipt form a two-column stage; the paired proof uses matching sentence rows. At 768px the two-column proof remains legible. At 390px the sentence pairs stay aligned with both side labels visible, and the pinned dependency strip remains on-screen. Mobile source and route content extends vertically with controls reachable by scrolling. Screenshots were captured and inspected in-app, but are not copied into this folder because the required CUA-only browser review does not provide a filesystem screenshot export.

A real browser run used a 39-byte source uploaded from the editor, target language Spanish, provider Groq, and the detected `qwen/qwen3.8-27b` model. The backend returned a completed result with one `translation-source_es.txt` artifact; the UI then read the submitted source path and returned artifact through `api.getArtifactContent`. The actual pair was “Good morning.” → “Buenos días.” and “The train leaves at noon.” → “El tren sale al mediodía.” Both pairs differ, so both are marked red/blue. No translation was generated in the browser. Provider-key saving is wired to `api.saveKey`, but a new key was not saved during review to avoid replacing the configured server credential.
