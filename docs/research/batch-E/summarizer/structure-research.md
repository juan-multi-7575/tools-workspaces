# Summarizer site research

Research date: 2026-10-06. Readwise Reader's public documentation and live page were inspected with the built-in computer-use browser. The source is [Highlights, Tags, and Notes](https://docs.readwise.io/reader/docs/faqs/highlights-tags-notes).

## Observed interaction patterns

- Reader moves focus through document paragraphs with the up/down arrows and shows a distinct focus indicator.
- On wide screens, highlights, tags, and notes appear in the right margin; sidebars can be hidden for reading.
- Mobile keeps annotation controls reachable without requiring the wide reading layout.

## Design direction

Treat summarizing as reading with a second, quieter layer of editorial notes. Keep the source in one comfortable reading measure and use a separate numbered takeaway rail with its own typography and clear heading. The rail is a list of the backend's returned takeaways; it must not imply sentence-level citations because the current response does not provide source locations. Controls stay in a compact settings strip. On narrow screens, place takeaways after the source and keep the same number order. Use the approved paper/ink system and Newsreader + Libre Franklin pairing; don't copy Readwise branding.

## Reference divergence

Reader is an annotation product with paragraph-linked, user-created highlights. This tool returns generated takeaway strings without source offsets, so the interface borrows reading focus and margin placement only; it does not draw links from takeaways to source paragraphs.
