# Agent Query & Response Hub 🧠

A lightweight, zero-dependency human-in-the-loop workbench and compilation system designed for AI agents to query external expert LLMs (e.g. Qwen 3.8-Max, Claude 3.7 Sonnet, DeepSeek V3, Grok 4.5, GPT-4o) and automatically collect, compile, and ingest their responses.

---

## 📖 Table of Contents
1. [Overview & Workflow](#overview--workflow)
2. [Instructions for New Agent Sessions](#instructions-for-new-agent-sessions)
3. [Instructions for Human Users](#instructions-for-human-users)
4. [CLI Automation Tools](#cli-automation-tools)
5. [REST API Reference](#rest-api-reference)
6. [Data Persistence & Exports](#data-persistence--exports)
7. [Directory Structure](#directory-structure)

---

## Overview & Workflow

```
   ┌────────────────────────────────────────────────────────┐
   │                    AI Agent Session                    │
   │  Needs external expert advice on complex architecture  │
   └───────────────┬────────────────────────▲───────────────┘
                   │ 1. Post Query          │ 4. Read / Fetch Compilation
                   │ (CLI or REST API)      │ (node scripts/fetch-export.js)
                   ▼                        │
   ┌────────────────────────────────────────┴───────────────┐
   │             Query Hub Server & Workspace               │
   │           (http://localhost:3456 | Node.js)            │
   └───────────────┬────────────────────────▲───────────────┘
                   │ 2. Displays in UI      │ 3. Pastes Responses
                   ▼                        │ (Auto-saved & compiled)
   ┌────────────────────────────────────────┴───────────────┐
   │                   Human User (Web UI)                  │
   │  Copies prompt, queries external models, pastes back   │
   └────────────────────────────────────────────────────────┘
```

1. **Agent Posts Queries:** When an agent needs architecture advice or benchmark comparisons, it posts structured queries to the Hub via CLI or REST.
2. **Human Queries External Models:** The human opens the Web UI (`http://localhost:3456`), clicks **Copy Prompt**, pastes it into external AI chats, and adds response slots for each model.
3. **Auto-Saving & Compilation:** Every keystroke auto-saves. The backend automatically compiles all responses into a single master document: `exports/FULL_COMPILATION.md`.
4. **Agent Ingestion (Zero Browser Needed):** The agent programmatically checks status (`npm run fetch -- --check`), reads `exports/FULL_COMPILATION.md` directly, or calls `GET /api/export?format=md`. No browser automation or manual export triggers required.

---

## Instructions for New Agent Sessions

If you are an AI coding assistant starting a new session in this workspace, follow these steps to use the Hub:

### Step 1: Check if Expert Responses Already Exist
Before asking the human redundant questions, check if answers have already been collected:
```bash
# Check status and response counts
node query-hub/scripts/fetch-export.js --check
```
If queries have responses, read the master compilation directly:
```bash
# View master markdown document:
cat query-hub/exports/FULL_COMPILATION.md
# Or in JavaScript / Agent tools:
view_file: query-hub/exports/FULL_COMPILATION.md
```

### Step 2: Ensure the Hub Server Is Running
If the server is not already active on port `3456`:
```bash
cd query-hub
npm start
# Server listens at http://localhost:3456
```

### Step 3: Post a New Query to the Human
When you need expert architectural advice or benchmark guidance:
```bash
node query-hub/scripts/post-query.js \
  --title "Cache Eviction Strategy" \
  --text "Should we use LFU or 2Q for in-memory tab state caching under 10k items?" \
  --tags "cache,memory,performance"
```
Or post from a markdown prompt file:
```bash
node query-hub/scripts/post-query.js --file ./prompts/architecture-review.md
```

### Step 4: Check for Completion & Ingest Outputs
When you need to know if the human has finished submitting answers:
```bash
# Check status:
node query-hub/scripts/fetch-export.js --check

# Fetch latest Markdown stream to a local workspace file:
node query-hub/scripts/fetch-export.js --format=md --out=./expert-guidance.md

# Or fetch as raw JSON:
node query-hub/scripts/fetch-export.js --format=json --out=./expert-guidance.json
```

---

## Instructions for Human Users

### 1. Launch the UI
```bash
cd query-hub
npm start
```
Open **http://localhost:3456** in your browser.

### 2. Interface Features
- **Editorial Zine / Typewriter Theme:** Craft paper `#DDD8CE`, off-white newsprint, bold borders, stamped badges, and hard drop shadows.
- **Draggable Sidebar Resizer:** Drag the vertical bar between the sidebar and the main body to adjust the width to your liking (stores your preferred width in `localStorage`).
- **Flexible View Modes:**
  - `▦ Grid`: 2-column comparison.
  - `☷ Split`: Side-by-side comparison.
  - `☰ Stacked`: Full-width readable view.
- **Copy Prompt:** Click the `[📋 Copy Prompt]` button on any query to copy the agent's exact prompt to your clipboard.
- **Dynamic Model Slots:** Click `[+ Add Response Slot]`, type the model name (e.g. `Qwen 3.8-Max`, `Claude 3.7`, `Grok 4.5`), paste the output, and it auto-saves immediately.
- **In-Browser Export:** Click **[Export ⬇]** in the header anytime to view or download a single clean compilation file in **Markdown**, **JSON**, or **Agent XML Prompt**.
- **Query Lifecycle Controls:**
  - **`[✓ Resolved]` / `[↺ Re-open]`**: Marks when architectural guidance has been put into code.
  - **`[📦 Archive]` / `[📂 Unarchive]`**: Hides completed queries from the active sidebar. Use **`[x] SHOW ARCHIVED`** at the bottom of the sidebar to view them.
  - **`[📝 Export ADR]`**: Auto-compiles the query and all model recommendations into a standardized numbered ADR file inside `docs/adr/` (e.g. `docs/adr/0011-*.md`).
  - **`[✕]`**: Hard delete reserved only for typos/throwaways.

---

## CLI Automation Tools

All scripts are located in `query-hub/scripts/` and can be run via npm or node:

| Command | Purpose |
| :--- | :--- |
| `npm run start` | Starts the Query Hub HTTP/REST server on port `3456` |
| `npm run fetch -- --check` | Quick status check: shows queries, response counts, and completion |
| `npm run fetch -- --adr=<queryId>` | Converts query into an Architecture Decision Record in `docs/adr/` |
| `npm run fetch -- --format=md --out=path.md` | Fetches compilation markdown via API and saves to `path.md` |
| `npm run fetch -- --format=json` | Streams compilation JSON to stdout |
| `npm run export` | Refreshes `exports/FULL_COMPILATION.md` and `exports/compilation.json` directly from database |
| `npm run post -- --title="..." --text="..."` | Posts a new query to the Hub database |
| `npm run read` | Formats and prints all queries & answers to the terminal |
| `npm run read -- --answered` | Displays only answered queries in terminal |

---

## REST API Reference

The server exposes a zero-dependency REST API for headless agent communication:

### 1. Readiness & Status
- **`GET /api/queries/readiness`** (or `/api/status`)
  - **Description:** Returns JSON summary of all queries, response counts, and `isComplete: true/false`.
  - **Example:**
    ```bash
    curl -s http://localhost:3456/api/queries/readiness
    ```

### 2. Export & Direct Download
- **`GET /api/export?format=md`**
  - **Description:** Returns the raw Markdown compilation stream.
- **`GET /api/export?format=md&download=true`**
  - **Description:** Sends `Content-Disposition: attachment; filename="..."` for direct 1-click file download.
- **`GET /api/export?format=json`**
  - **Description:** Returns structured compilation JSON.
- **`GET /api/export?id=<queryId>`**
  - **Description:** Returns export for a single specific query.

### 3. Server-Side Disk Export Trigger
- **`POST /api/export/save-to-disk`**
  - **Description:** Triggers the server to update `exports/FULL_COMPILATION.md` and `exports/compilation.json`.
  - **Optional Body:** `{ "targetPath": "custom/path.md", "format": "md" }`

### 4. Query CRUD Operations
- **`GET /api/queries`**: List all queries.
- **`POST /api/queries`**: Create a new query `{ title, text, tags }`.
- **`GET /api/queries/:id`**: Get single query with its responses.
- **`PUT /api/queries/:id`**: Update query title, prompt text, tags, or responses.
- **`DELETE /api/queries/:id`**: Delete a query.
- **`POST /api/queries/:id/responses`**: Add a response `{ model, content, notes }`.
- **`DELETE /api/queries/:id/responses/:respId`**: Delete an individual response slot.
- **`POST /api/queries/:id/export-adr`**: Compiles query into a numbered ADR in `docs/adr/` and marks query resolved.
- **`POST /api/queries/:id/status`**: Updates status `{ "status": "resolved" | "archived" | "open" }`.

---

## Data Persistence & Exports

- **Active Database:** [`data/queries.json`](data/queries.json) — Stores all queries, response slots, metadata, and timestamps.
- **Automatic Backups:** [`data/backups/`](data/backups/) — Timestamped JSON snapshots created automatically on every export.
- **Master Markdown Export:** [`exports/FULL_COMPILATION.md`](exports/FULL_COMPILATION.md) — Single unified master document containing all questions, prompt blocks, and full expert responses.
- **Master JSON Export:** [`exports/compilation.json`](exports/compilation.json) — Programmatic JSON compilation.
- **Zero Truncation:** Disk exports have no token limits or terminal buffer boundaries. Long expert responses (30,000+ characters) are stored completely intact.

---

## Directory Structure

```
query-hub/
├── data/
│   ├── queries.json              # Primary query & response database
│   └── backups/                  # Automated timestamped backup snapshots
├── exports/
│   ├── FULL_COMPILATION.md       # Single consolidated Markdown export
│   └── compilation.json          # Single consolidated JSON export
├── public/
│   └── index.html                # Editorial Zine Web UI (HTML/Tailwind/JS)
├── scripts/
│   ├── export-files.js           # CLI/Server exporter for single master files
│   ├── fetch-export.js           # CLI tool to check readiness and fetch compilation
│   ├── post-query.js             # CLI tool to post new queries
│   └── read-responses.js         # CLI tool to inspect responses in terminal
├── server.js                     # Native Node.js HTTP & REST server (port 3456)
├── package.json
└── README.md
```
