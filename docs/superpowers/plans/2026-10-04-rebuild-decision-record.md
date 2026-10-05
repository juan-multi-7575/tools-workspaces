# Rebuild Brief — Decision Record

Date: 2026-10-04. Supersedes `2026-10-04-per-tool-pages.md` and
`2026-10-04-tool-page-ui-audit.md` for anything about structure and visual direction.

## Why this exists

The previous build failed on two counts, both confirmed by browser inspection of all
24 surfaces:

1. **Wrong structure.** Every one of the 21 tool pages sat inside the Tools Garage
   application shell — the left sidebar (Tools / Workspaces / Dependencies / Remote /
   Settings), the same topbar, the same page furniture. The requirement was that each
   tool is its own standalone site, modelled on `image-to-pdf-standalone`, which is a
   self-contained app with a full-viewport hero, a full-viewport workspace, its own
   typography and its own footer action bar, and which merely *offers* a bridge back
   via `onHome` / `onEnterWorkspace`. I copied its routing shape and ignored its
   structure.
2. **Converged design.** Agents were given "each page gets its own distinct visual
   identity" with no direction to work from. Roughly 20 independently converged on the
   same dark terminal / telemetry aesthetic. No design direction was ever specified, and
   the question of what that direction should be was never asked.

Root cause in both cases: proceeding without asking.

---

## The questionnaire

### Round 1 — structure

**Q1. Should the tool pages keep the Tools Garage shell (sidebar, topbar, Platform nav)?**
> **A: Remove it entirely.** Like image-to-pdf — the tool page is a full-viewport app
> with zero Tools Garage chrome. No sidebar, no topbar, no Platform nav. Reached by URL
> or from the catalog, which is its own separate thing.

**Q2. If tools are standalone, how does someone get from one to another?**
> **A: Standalone site, but has a home button that brings to home site.** There is a
> home site; each tool is standalone and offers a way back to it.

**Q3. What happens to the existing Workspaces / DAG pipeline feature?**
> **A: Drop it for now.** Focus purely on the tools; revisit Workspaces, Remote and the
> catalog later.

**Q4. What status do the Dependencies console and Settings page get?**
> **A: Standalone, tool-agnostic surface.** Not part of any tool and not in a shared
> sidebar. Tools link to them only when they actually need to.

### Round 2 — design

**Q5. Should each tool keep the two-state hero + workspace pattern from image-to-pdf?**
> **A: Yes, keep the two-state hero + workspace.** A full-viewport intro is its own
> state, then the working view is a second state.

**Q6. How should the design direction for each tool be decided?**
> **A: Research first.** Crawl / visit websites for all unique, natural themes and
> designs — no AI slop. Each tool site is to be unique. Use all the design styles there
> is. Select fonts, colour palettes, themes, animations. Do not ignore any requirement
> of a real web app. Use browser-harness for the research first, then subagents to build
> the sites.

**Q7. How should light vs dark be decided?**
> **A: No light/dark rule for now** — each site gets its own unique theme.

**Q8. How should the rebuild be sequenced?**
> **A: One tool as a template first.** Rebuild exactly one tool fully — hero, workspace,
> and a real install — get it reviewed, then apply the proven pattern to the rest.

### Round 3 — architecture

**Q9. What should each standalone tool site be, technically?**
> **A: One app, isolated per-tool route bundles.** One Vite app, one dev server, one
> build. Each tool is a route with its own lazily-loaded bundle and its own scoped
> CSS/theme, so designs cannot leak into each other, while sharing one origin, one
> backend and one dependency manager.

**Q10. How should JS packages be distributed?**
> **A: Shared by default, per-tool when it earns it.** Shared deps (React, router,
> common UI atoms) live once at app level. A tool that genuinely needs something extra
> (PDF renderer, waveform editor, diff engine) gets it scoped to that tool only.

**Q11. What happens to the 21 pages already built?**
> **A: Delete them.** They were the wrong shape, and keeping them invites accidental
> reuse of the dark-telemetry look.

**Q12. How much research before building?**
> **A: Design should not be picked with respect to the tool.** Any type of design can
> apply to any type of tool page, so do not focus on whether design supports the tool.
> Just pick good UI designs — unique ones, trending now, or from before, year by year,
> or decades old. Keep a checklist of all sites to research.

### Standing constraint raised by me, accepted

Design is selected for quality and uniqueness rather than matched to the tool's
function. The only thing keeping a beautiful page usable is discipline, so every
concept is additionally held to **"does this make the task clear and completable?"**
A concept that fights its function gets flagged, not shipped quietly.

---

## Decisions

| # | Decision |
|---|---|
| D1 | Tool pages carry **zero** Tools Garage chrome. Full-viewport standalone sites. |
| D2 | Every tool has two states: a full-viewport **hero**, then the **workspace**. |
| D3 | Every tool is a standalone site with a **home** affordance back to a home site. |
| D4 | A **home site** lists all tools and is the entry point. |
| D5 | **Workspaces / DAG pipeline is dropped** for now. |
| D6 | **Dependencies** and **Settings** are standalone, tool-agnostic surfaces. |
| D7 | One Vite app; per-tool lazily-loaded route bundles with **scoped, isolated** styles. |
| D8 | Packages shared by default; per-tool only when a tool genuinely needs it. |
| D9 | The 21 existing pages are **deleted**, not reused. |
| D10 | Research phase first via browser-harness, with a tracked research checklist. |
| D11 | No light/dark rule; each site gets its own theme. |
| D12 | Build **one tool as a template**, review it, then scale to the rest. |

### Added after the template build

| # | Decision |
|---|---|
| D13 | **Two design systems.** 21 tool sites, each unique and isolated. Separately, ONE shared **platform** style covering home, workspaces, dependencies and settings — i.e. everything on the home page that is not a tool. |
| D14 | The platform style is **researched after the tools are built**, not now, so it can be designed against the real set of 21 rather than a guess. It must be neutral enough to sit beside 21 different aesthetics without favouring any of them. |
| D15 | Home concept (interim): Swiss-precise index. This is a **placeholder** until the D14 research lands, and is expected to be replaced. |

## Template build status

Template = **`imagemagick`**, brief #10, reference `figma`. Built in `src/sites/`, routes `/`
(home), `/t/imagemagick` (hero), `/t/imagemagick/workspace`. 118/118 tests.

Verified working: zero Tools Garage chrome, 0 horizontal overflow across six
surface/viewport combinations, Install control pinned in viewport, real end-to-end conversion
(a 640×400 PNG came back as a real 240×150 JPEG and WebP).

### Open defects on the template — fixed 2026-10-05

Evidence, measurements and screenshots: `docs/research/template-review/v2/`.

1. ~~**Copy regressed into self-narration.**~~ Fixed. All five sentences are
   gone, plus one more of the same family on the home index. Two of the strings
   were also factually wrong — the geometry key claimed `800x600` could only
   shrink (it returns 800x500 from a 640x400 source), and the quality hint
   claimed PNG ignores quality (it does not; it inverts). Both are now written
   from real runs. The one useful correction is kept: `240x160` on a 640x400
   source comes back 240x150.
2. ~~**The floating tool rail clips its own content.**~~ Fixed. The geometry
   key is a collapsed disclosure, and the rail was resized so all seven entries
   fit on one line each: 616px of content in 616px of rail, the last row 21px
   clear of the bottom edge with the disclosure open.
3. ~~**Raw build strings surfaced to users.**~~ Fixed. The ready chip reads
   `Ready — conda.imagemagick 7.1.2-31`; the version is extracted from the real
   probe output and the full banner is the tooltip.
4. ~~**Raw manifest keys leak as label suffixes.**~~ Fixed. The label is the
   manifest's title; the key moved to `title` and `data-param-key` is unchanged.

Two consequences to be aware of before scaling:

- **The hero has no home affordance.** Reconciling it against the real
  `image-to-pdf-standalone` hero (which has exactly two actions and no header)
  left the way back to the index in the workspace only. That matches D3 and the
  shared brief rules, but a visitor who lands on `/t/<tool>` from a bookmark has
  to enter the workspace first.
- **The home index fails WCAG AA** at four rules, 2.67–2.87:1. Deliberately not
  patched: D15 marks the home concept as interim pending the D14 research.

The ImageMagick site's own two de-emphasised ink tokens were raised to
5.20:1 and 5.86:1 — they were at 2.85:1 and 4.27:1 and carried 10–12px body
copy everywhere.

## What still needs deciding

- Which tool is the template (first build). Recommend the downloader, since it is the
  most complex and exercises queueing, streaming, and a long parameter surface.
- The home site's own design — it is itself a surface needing a concept.
- Whether the removed Workspaces feature leaves dead routes, types and tests to prune.

## Carried over from the previous plan (still valid)

- No fabricated status, size or version. Every number comes from the API.
- No swallowed errors — backend text is shown verbatim.
- No invented progress percentages.
- The dependency manager (micromamba + conda-forge, root-free, isolated under an
  app-owned `deps/`) stays and remains tool-agnostic.
- `data-param-key` per parameter must be preserved — tests assert on it.