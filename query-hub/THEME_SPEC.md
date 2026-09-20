# Zine & Editorial Craft Theme Specification 📰✂️
*Design System, Visual Tokens, Component Schemas, and Agent Prompt for the Query & Response Hub*

---

## 1. Aesthetic Identity & Design Philosophy
This theme is inspired by **Editorial Zines, Risograph Art Prints, Brutalist Copywriting Portfolios, and Retro Typewriter Manuscripts**.

### Key Visual Tenets
1. **Warm Parchment & Newsprint Palette**:
   - Base background is a tactile, warm craft beige (`#DDD8CE`), mimicking unbleached paper or newsprint stock.
   - Content cards use crisp off-white (`#FBF9F4` or `#FFFFFF`) to stand out from the canvas.
2. **Sharp Ink Borders & Hard Offset Drop Shadows**:
   - Strict `border-2 border-black` (`#181818`) outlines across all interactive elements, cards, and inputs.
   - Neo-brutalist hard paper drop shadows: `box-shadow: 3px 3px 0px #181818` (or `4px 4px 0px #181818`), with no soft blur.
   - Interactive hover effect: cards or buttons depress into their shadow (`translate-x-0.5 translate-y-0.5 shadow-none` or `translate-x-[2px] translate-y-[2px] shadow-[1px_1px_0px_#181818]`).
3. **Playful Angled "Sticker" Badges**:
   - Header badges, section titles, and status chips are styled like tilted adhesive labels (`transform: rotate(-1.5deg)` or `rotate(1.5deg)`).
   - Cut-out tape or bordered box aesthetic with bold monospace headings and handwritten/retro symbols:
     - Smiley faces: `☺`
     - Asterisks / stars: `✱`
     - Arrows: `⤹` or `→`
     - Pencil / manuscript icons: `✎`
4. **Editorial & Monospace Typography**:
   - Display fonts: Bold Monospace / Typewriter (Space Mono, Courier Prime, JetBrains Mono) in uppercase with wide letter spacing (`tracking-wider`, `tracking-widest`).
   - Body & Textarea: Highly legible monospace font with typewriter line heights (`leading-relaxed`).

---

## 2. Design Tokens & Color Palette

| Token Name | Hex Code | Tailwind Equivalent / CSS | Usage |
|---|---|---|---|
| `--bg-canvas` | `#DDD8CE` | `bg-[#DDD8CE]` | Application background canvas (warm craft stock) |
| `--bg-surface` | `#E8E3D7` | `bg-[#E8E3D7]` | Sidebar and drawer background |
| `--bg-card` | `#FAF8F3` | `bg-[#FAF8F3]` | Main query, prompt, and response cards |
| `--bg-card-contrast` | `#FFFFFF` | `bg-[#FFFFFF]` | Textarea backgrounds, active focused cards |
| `--bg-sticker` | `#EDE8DC` | `bg-[#EDE8DC]` | Tilted stickers, badge pills, category tags |
| `--border-ink` | `#181818` | `border-2 border-[#181818]` | Universal black border on all structural elements |
| `--shadow-hard` | `3px 3px 0px #181818` | `shadow-[3px_3px_0px_#181818]` | Universal brutalist paper offset shadow |
| `--shadow-hard-lg` | `5px 5px 0px #181818` | `shadow-[5px_5px_0px_#181818]` | Modals, active selected query cards |
| `--text-primary` | `#181818` | `text-[#181818]` | Primary text, bold headers, code snippets |
| `--text-secondary` | `#524F49` | `text-[#524F49]` | Metadata, timestamps, parameter notes |
| `--text-muted` | `#7A766F` | `text-[#7A766F]` | Placeholders, character counters, subtle labels |
| `--accent-stamp-green` | `#2D5A27` | `text-[#2D5A27] bg-[#DDF0D8]` | Stamped badge for completed / answered queries |
| `--accent-stamp-amber` | `#8C4E0B` | `text-[#8C4E0B] bg-[#FAECD8]` | Stamped badge for partial / draft queries |
| `--accent-stamp-slate` | `#4A4A4A` | `text-[#4A4A4A] bg-[#E3DFD5]` | Stamped badge for pending / untouched queries |

---

## 3. Component Architecture & UI Elements

### 3.1 Header Bar
- **Canvas**: Sticky `h-16`, `bg-[#DDD8CE]`, `border-b-2 border-black`.
- **Title Badge**:
  ```html
  <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-[#FAF8F3] border-2 border-black shadow-[2px_2px_0px_#181818] -rotate-1">
    <span class="text-sm font-black font-mono tracking-tight uppercase">Agent Response Hub ☺</span>
  </div>
  ```
- **Project Name Input**:
  - Typewriter style: `bg-transparent border-b-2 border-black font-mono font-bold text-sm text-[#181818] outline-none`.
- **Action Buttons** ("Save", "Import", "Export"):
  - Physical paper sticker style: `bg-[#FAF8F3] hover:bg-white text-[#181818] font-mono font-bold text-xs uppercase px-3.5 py-1.5 border-2 border-black shadow-[2px_2px_0px_#181818] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all`.

### 3.2 Sidebar (Query Index)
- **Background**: `#E8E3D7` with `border-r-2 border-black`.
- **Header Label**: Boxed banner `"AGENT QUERIES ✱"` with `+ New Query` button.
- **Search Bar**: `bg-[#FAF8F3] border-2 border-black shadow-[2px_2px_0px_#181818] rounded-none px-3 py-1.5 font-mono text-xs`.
- **Query Cards**:
  - Unselected: `bg-[#FAF8F3] border-2 border-black shadow-[2px_2px_0px_#181818] p-3 text-left`.
  - Selected / Active: `bg-white border-2 border-black shadow-[4px_4px_0px_#181818] -translate-y-0.5 -translate-x-0.5`.
  - Tilted badge for Query index: `<span class="bg-[#EDE8DC] border border-black px-1.5 py-0.5 text-[10px] font-mono font-bold -rotate-2">Q1</span>`.
  - Status stamps: `[PENDING]`, `[COMPLETE ☺]`, `[DRAFT]`.

### 3.3 Main Workspace
1. **Query Meta & Title**:
   - Framed card: `bg-[#FAF8F3] border-2 border-black shadow-[3px_3px_0px_#181818] p-5`.
   - Title input: `text-xl font-black font-mono tracking-tight uppercase bg-transparent border-b-2 border-black/20 focus:border-black`.
   - Tags: Pill badges styled as retro sticker tags.
2. **Agent Query Prompt Box**:
   - Mimics a published clipping or typewriter document:
   - Header: `"AGENT QUERY PROMPT ☺"` + Sticker button `"📋 COPY PROMPT"`.
   - Textarea: `bg-[#FFFFFF] border-2 border-black p-4 font-mono text-sm leading-relaxed text-[#181818] shadow-[2px_2px_0px_#181818]`.
3. **Model Response Cards Grid**:
   - Responsive 2-column or stacked layout.
   - Each card is a dossier sheet:
     - Header: `bg-[#EDE8DC] border-b-2 border-black px-4 py-2 flex items-center justify-between`.
     - Model Name: Editable typewriter title (`<input placeholder="MODEL / SOURCE NAME (e.g. Claude 3.7 Sonnet)...">`).
     - Notes: `bg-[#FAF8F3] border border-black/40 px-2 py-1 text-xs font-mono text-[#524F49]`.
     - Monospace Textarea: `bg-[#FFFFFF] border-2 border-black p-3.5 font-mono text-xs leading-relaxed text-[#181818] min-h-[220px]`.
     - Footer: Tally display `[ 2,450 CHARACTERS | AUTO-SAVED ]` + `[ 📋 COPY ]` and `[ ✕ DELETE ]`.
4. **"+ Add Response Slot"**:
   - Full-width dashed paper card: `border-2 border-dashed border-black bg-[#E8E3D7]/60 hover:bg-[#FAF8F3] p-4 text-center font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer`.
5. **Consolidated Answer Section**:
   - Styled as an official **"EDITORIAL SYNTHESIS / FINAL DECISION ✱"**:
   - Card: `bg-[#EDE8DC] border-2 border-black shadow-[4px_4px_0px_#181818] p-5`.
   - Textarea: `bg-white border-2 border-black p-4 font-mono text-sm leading-relaxed`.

### 3.4 Modals (Export & Import)
- Backdrop: `bg-[#181818]/60 backdrop-blur-xs`.
- Modal Window: `bg-[#FAF8F3] border-3 border-black shadow-[8px_8px_0px_#181818] max-w-4xl p-0 overflow-hidden`.
- Tab bar: Folder tabs styled as physical file folder tabs (`bg-[#EDE8DC] border-b-2 border-black active:bg-[#FAF8F3]`).
- Preformatted output: Monospace typewriter sheet with line numbers or green/charcoal ink.

---

## 4. Complete Prompt for Another Agent to Build or Replicate This

Copy and paste the following prompt to any coding agent to recreate or adapt this design:

```markdown
You are tasked with redesigning or implementing the "Agent Query & Response Hub" using a high-craft **Zine / Retro Editorial / Neo-Brutalist Typewriter** design theme.

### Design Principles:
1. Color Palette:
   - Primary Canvas Background: `#DDD8CE` (warm craft paper/parchment stock).
   - Card Backgrounds: `#FAF8F3` (crisp off-white newsprint paper).
   - Focused / Textarea Backgrounds: `#FFFFFF`.
   - Sticker / Badge Backgrounds: `#EDE8DC`.
   - Universal Borders: `border-2 border-black` (`#181818`).
   - Hard Drop Shadows: `box-shadow: 3px 3px 0px #181818` (zero soft blur, strict neo-brutalist offset).
   - Text Inks: Primary typewriter black `#181818`, muted charcoal `#524F49`, subtle label `#7A766F`.

2. Typography & Stylistic Elements:
   - Use Google Fonts 'Space Mono' and 'JetBrains Mono' for all headings, labels, buttons, and inputs.
   - Headings, section tags, and buttons must be in BOLD UPPERCASE with letter spacing (`tracking-wider` / `tracking-widest`).
   - Sticker Badges: Cut-out adhesive labels with slight rotation (`-rotate-1`, `rotate-1`, `-rotate-2`), bordered with thick black lines.
   - Decorative Motifs: Include retro manuscript and zine characters: `☺` (smiley), `✱` (asterisk/star), `⤹` (arrow), `✎` (pencil).
   - Interactive Feel: Buttons and cards must have hard drop shadows that depress on click (`active:translate-x-0.5 active:translate-y-0.5 active:shadow-none`).

3. Functional Requirements:
   - NO HARDCODED MODELS: Allow users to dynamically add multiple response slots per query.
   - Each response card must have an editable Model/Source title input (e.g. Claude 3.7 Sonnet, Qwen 3.8-Max, GPT-4o), optional notes input, a single large monospace textarea for pasting the model's output, character counter, saved timestamp, copy button, and delete slot button.
   - Agent Query Section: Clean headline, tags input, prompt textarea, and a prominent 1-click "📋 COPY PROMPT" button.
   - Consolidated Answer Box: At the bottom for final synthesized decisions back to the agent.
   - Sidebar: List of queries with Q1, Q2 badges, search filter, query status stamps ([PENDING], [COMPLETE ☺], [DRAFT]), and "+ NEW QUERY" button.
   - Auto-Sync & Resilience: Automatically saves edits to the local Node backend API (`/api/queries/:id`) and syncs with `localStorage`.
   - Exports: Support instant 1-click compilation export to Markdown, JSON, and XML (agent prompt ready).
```
