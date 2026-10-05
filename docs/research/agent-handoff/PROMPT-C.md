# BATCH C — pandoc, pdf_tools, ocrmypdf, packager

Read `SHARED-PREAMBLE.md` in this directory first and follow it exactly. Then build **four**
sites. Work one tool at a time and commit each before starting the next.

Your reference images are in `tools-workspaces/docs/research/design-references/<name>/`.

---

## 1. `pandoc` — Universal Document Converter

Brief **#12**. Reference: **`pudding`** (The Pudding) — `design-references/pudding/`.

White ground, ink `#212529`. `Fraunces` display (the free sub for Signifier) plus `Public Sans`
(the free sub for Founders-grotesk). A two-pane editorial spread — source left, rendered output
right — with marginal notes.

**Signature:** marginalia carrying the real conversion parameters.

**Truth contract:** the target format is the manifest's `to` enum
(`html` / `markdown` / `plain`) as a segmented control. `execute()` writes the artifact and
returns `output_text`. Render the **real** returned HTML in a sandboxed container
(`<iframe sandbox>` or similar — never `dangerouslySetInnerHTML` on backend output), or the real
markdown/text in mono. Copy and download must use the real artifact.

---

## 2. `pdf_tools` — PDF Text & Page Utilities

Brief **#13**. Reference: **`pitchfork`** — `design-references/pitchfork/`.

White ground, black ink, one red accent `#C8102E`. `Source Serif 4` (free sub for PTSerif) +
`Inter`. Ruled sections and dense real output — hairline rules doing the structural work instead
of boxes.

**Signature:** rules and lists in the print-editorial idiom.

**Truth contract:** the manifest declares an `action` enum of `extract_text` / `inspect_info`.
- `extract_text` → a searchable full-text pane over the **real** extracted text, with the real
  `character_count` from `data`.
- `inspect_info` → a metadata table built from the **real** returned `pdfinfo` JSON. The backend
  lowercases and underscores the keys (`page_size` → `page_size`, `PDF version` → `pdf_version`).
  **Render only keys that came back.** Never fabricate a page count.

**Verify against a real run:** create a real PDF fixture (soffice/LibreOffice, or
`pandoc -o /tmp/t.pdf`), then `pdftotext`/`pdfinfo` it through the tool and confirm your table
shows exactly what came back.

---

## 3. `ocrmypdf` — OCR Document Scanner

Brief **#14**. Reference: **`moma`** — `design-references/moma/`.

White ground, black ink, cyan `#00A0E9` accent, heavy wordmark presence. Page thumbnails in a
left column, recognised text in a right reading column.

**Signature:** each page treated as an exhibit with its real text layer beside it.

**Truth contract — the important one:** `backend/tests/test_11_catalog.py::test_ocrmypdf_standalone`
asserts a missing input **must** fail with `input file not found`, and that is the real message
the backend returns. Surface it verbatim.

Note the schema declares only `input_pdf`, but `execute()` also accepts `input_path` as a
fallback. Surface `input_pdf`.

**Two actions, not one — get this right:** this site has **two** distinct actions:
1. **Run OCR** → needs `conda.ocrmypdf`.
2. **Read text layer** → an auto-chained `pdf_tools` extract triggered after OCR completes, and
   it needs **`conda.poppler`**.

**Both must be gated on their own dependency.** The template's predecessor shipped with only the
first gated, so the second stayed clickable when poppler was missing and failed cryptically.
Gate each action against its own dep and disable it with an honest reason.

---

## 4. `packager` — Archive Packager (ZIP)

Brief **#15**. Reference: **`nealfun`** — `design-references/nealfun/`.

Warm low-fi ground `#FFF8EE`, ink `#2B2118`. `Gabarito` or `Familjen Grotesk`, rounded and
informal. A file tree plus a manifest builder — honest and unglamorous.

**Signature:** a "ZIP READY" rubber stamp on success, drawn as a stamp rather than a badge.

**Truth contract:** `execute()` returns a **single** `bundle.zip`. Show it as a real download and
list the real files that went in. **Never fabricate archive entries.** The file picker should be
fed from `api.getRecentArtifacts()` and/or real uploads — show real sizes from the real index.

---

## Report

Follow the shared preamble's report format, per tool. Include measured numbers and real run
responses. If `pandoc`, `pdftotext`, `pdfinfo`, `ocrmypdf` or `soffice` is unavailable on this
machine, say so plainly and demonstrate that your page surfaces the real failure.
