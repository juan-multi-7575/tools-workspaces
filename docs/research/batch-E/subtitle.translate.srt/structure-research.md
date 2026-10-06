# Subtitle translator site research

Research date: 2026-10-06. The official [Subtitle Edit Main Window guide](https://subtitleedit.github.io/subtitleedit/features/main-window.html) was inspected live in the built-in computer-use browser. Its screenshots show a dense desktop editing application; its documented interaction model is more useful than its visual styling.

## Observed interaction patterns

- A subtitle grid gives each cue a numbered row with start/end time and text; selecting a row focuses the editor on that cue.
- Translation mode keeps original text visible beside translated text.
- Keyboard up/down navigation moves between cue rows. Line count and current status are surfaced in the footer.
- The desktop application can arrange panels many ways, but its density is inappropriate for this focused translation task.

## Design direction

Build a quiet cue ledger rather than a miniature editing suite: a clear language/provider setup band above a two-column source/translation reader; pair cues by their actual order in each file, while retaining each side's own cue identifier and timestamp. Add simple Previous/Next cue navigation and a selected-cue treatment. Mark a cue changed only when both actual strings exist and differ. On mobile, show one selected cue with a source/translation switch that retains cue IDs and timestamps. Use the approved white/near-black palette, IBM Plex Sans controls and headings, Source Serif 4 cue text; avoid copying Subtitle Edit's grid chrome or legacy desktop controls.

## Reference divergence

Subtitle Edit edits timing and video as well as text. This tool only translates existing artifacts and must not suggest that it can retime, rewrite, or reconstruct cues. VTT identifiers and backend failure indexes are different concepts; the view must preserve their provenance rather than merge them into a single invented number.

## Live review findings

The desktop and phone layouts were reviewed after a real two-cue English-to-Spanish translation. At 1440 × 900 and 768 × 1024 the cue pairs show the source and translation IDs and timestamps in two columns; at 390 × 844 the cue ledger switches between source and translation while keeping both timestamp labels visible. The phone has no horizontal overflow. The actual result artifact preserved the SRT cue timings and returned “Buenos días.” and “El tren sale al mediodía.” A final review caught that the pairing algorithm matched by cue IDs/timestamps; a regression test demonstrated this reordered cues when IDs or timestamps differ. Pairing now uses file order and shows each side's original IDs/timestamps without rewriting them.

The dependency endpoint initially reported a false `conda.media` requirement although the translator parses SRT/VTT in Python and calls providers directly. The stale mapping was removed; `/api/tools/subtitle.translate.srt/deps` then reported `ready: true`, no missing packages, and an empty dependency list. Backend contract tests: 50 passed.

The initial font detector flagged Inter as overused, so headings, controls, and body UI now use IBM Plex Sans; Source Serif 4 remains for subtitle copy.

Final captures: `hero-final-1440x900.png`, `hero-final-390x844.png`, `workspace-final-1440x900.png`, `workspace-final-768x1024.png`, `workspace-final-390x844.png`, `result-final-1440x900.png`, and `result-final-390x844.png`.
