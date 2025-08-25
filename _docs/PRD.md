# Briefcase — Product Requirements Document (v1 SLC)

## 1) One-page summary

**What:** A pinned side-panel extension that extracts the main content of the current page and produces a tailored summary (length, style, comprehension level). Optional A/B compare runs two LLMs side-by-side with quick human scoring.
**Why:** Save time, build judgment about model quality, and quietly grow a searchable personal library.
**How:** Local-first. Raw extracted text is stored in a local **SQLite (WASM) + FTS** database; summaries save to disk as **`.md` or `.txt`** (user setting). **No telemetry.**
**v1.2:** Add JSON export and optional Google Drive push.

## 2) Goals & non-goals

**Goals**

- Frictionless one-click summarization in a **pinned side panel**.
- Adjustable **length / comprehension level / style**.
- **A/B compare** two models with micro-scores (coverage, readability, faithfulness).
- Local library: **FTS search over raw text**, summaries saved to disk.
- Clear privacy posture: **local-first**, explicit warnings before cloud calls.

**Non-goals (v1)**

- Multi-page crawling, web search enrichment, or RAG.
- Fine-grained analytics or telemetry.
- Accounts, sync, or cloud storage (beyond optional v1.2 Drive push).
- Vector embeddings/ANN search (planned later).

## 3) Success metrics (internal, manual review — no telemetry)

- E2E demo shows **<3s perceived** time-to-summary on medium articles (with cached model/provider).
- 10 seed users report **≥80% “useful”** summaries and **≥70% “faithful”** ratings in a structured dogfood doc.
- CI green on main; signed/tagged release **v1.0.0**; reproducible build script.

## 4) Personas & use cases

- **Power Skimmer**: TL;DR of news/docs with source anchors.
- **Dev Learner**: API docs/papers at “HS/College/PhD” comprehension levels.
- **Model Tinkerer**: A/B compare outputs to understand model strengths.

## 5) User experience (v1 flows)

### Summarize tab

1. Open side panel → **Summarize**.
2. Controls: **Length** (brief/medium/verbose), **Level** (Kinder/HS/College/PhD), **Style** (plain, bullets, exec).
3. Press **Summarize** → output shows:

   - **Key points**, **TL;DR**, **source anchors** (inline links back to DOM when available).
   - **Save**: writes summary to disk (`.md` or `.txt`); DB stores metadata + raw text.

4. Toggle **“View extracted text”** for transparency.

### Compare tab

1. Pick **Model A** and **Model B**.
2. Run compare → side-by-side outputs.
3. Quick scores (three toggles) + optional short note.
4. **Export**: stores both outputs + scores in DB; writes chosen summary to disk if user clicks Save.

## 6) Functional requirements

- **Content extraction**

  - Auto-detect main article body; strip nav/ads.
  - Preserve headings, paragraphs, lists, links; capture canonical URL + title.
  - Fallback: user can select text and “Summarize selection.”

- **Summarization**

  - Prompt template takes `{length, level, style}` and **page context** (cleaned text + source URL).
  - Provide **source anchors** when mapping back to DOM is feasible (by paragraph index/hash).

- **A/B compare**

  - Same prompt & inputs for both models; render results side-by-side.
  - Scoring: coverage/readability/faithfulness (boolean toggles) + 140-char note.

- **Storage**

  - **SQLite (WASM) + FTS** in OPFS; holds **raw text**, metadata, and A/B results.
  - Summaries saved to disk as `.md` or `.txt` in a user-chosen **Library folder** (see File System Access below).
  - v1.2: add `.json` export alongside file, and optional Google Drive upload.

- **Privacy & modes**

  - Default **Local-first**: no data leaves the device unless user selects a cloud model.
  - When cloud model selected, show a **banner**: provider name + “content will be sent.”

- **Settings**

  - Default summary format; file extension (`.md`/`.txt`); chosen Library folder; model defaults; per-site disable.

- **Accessibility**
  - Keyboard navigable; ARIA roles; high-contrast compatible; prefers-color-scheme aware.

## 7) Non-functional requirements

- **Performance**: perceived <3s for short/medium pages on a typical laptop; streaming render where supported.
- **Reliability**: graceful failure on blocked pages; meaningful error messages.
- **Local-only durability**: OPFS persistence for DB; recoverable if extension updates.
- **Security**: minimal permissions; content scripts sandboxed; CSP-tight extension pages.

## 8) Architecture & platform

### Browser targets

- **Primary:** Chrome MV3 (uses `chrome.sidePanel`, `scripting`, `activeTab`, `downloads`, **File System Access API** for user-selected folder).
- **Secondary (post-v1 optional):** Edge (Chrome compatible), Firefox (uses `sidebarAction`; feature-parity adjustments).

### High-level components

- **Content script**: extracts DOM, resolves anchors, passes cleaned payload.
- **Background service worker**: orchestrates model calls, file writes, DB access.
- **Side panel UI** (React/TS): controls, streaming output, compare view, settings.
- **DB layer**: SQLite WASM, FTS5 virtual tables, migrations.
- **Model providers**: pluggable adapters (cloud via HTTPS; local via `http://localhost` e.g., Ollama/LM Studio).

### Data flow (Summarize)

`DOM → extractor → cleaned text → provider(prompt) → summary → (a) write file to Library (.md/.txt), (b) upsert doc+raw into SQLite, (c) link anchors → render in UI`

### File System Access strategy

- On first Save, prompt **Choose Library Folder** (`showDirectoryPicker`). Store persistent handle in extension storage; fallback to `chrome.downloads` if denied.

## 9) Data model (initial)

**Tables (conceptual; FTS5 implied)**

- `documents(id PK, url, title, site, saved_at, word_count, hash, raw_text TEXT)`
- `summaries(id PK, document_id FK, model, params_json, saved_path, saved_format, created_at)`
- `ab_runs(id PK, document_id FK, model_a, model_b, prompt_template, created_at)`
- `ab_scores(run_id FK, coverage INTEGER, readability INTEGER, faithfulness INTEGER, note TEXT, rater TEXT, created_at)`
- `doc_fts(content, title, url)` — virtual FTS table mirrored from `documents` (raw_text → `content`).

**File naming**

```
/BriefcaseLibrary/
  2025/08/Briefcase_<slug-title>_<YYYYMMDD-HHMM>_<model>.md|txt
```

Front-matter (if `.md`):

```yaml
---
title: "<page title>"
url: "<canonical>"
date: "<iso>"
model: "<provider/model>"
params: { length: "brief", level: "HS", style: "bullets" }
source_hash: "<sha1>"
---
```

## 10) Model providers & prompting

**Adapters**

```ts
interface LLMProvider {
  id: string; // "openai:gpt-4o-mini" | "anthropic:claude-3-5" | "local:ollama:llama3"
  supportsStreaming: boolean;
  summarize(input: SummarizeInput, signal?: AbortSignal): AsyncIterable<Chunk> | Promise<Text>;
}
```

**Prompt template (sketch)**

```
You are summarizing the provided page content.

Constraints:
- Length: {length}  // brief|medium|verbose
- Audience level: {level} // kindergarten|high_school|college|phd
- Style: {style} // plain|bullets|executive

Output:
- Key points (3–7 bullets)
- TL;DR (1–3 sentences)
- If any uncertainty, state it explicitly.

Source URL: {url}
Content (cleaned):
{content}
```

## 11) Permissions (Chrome MV3)

```json
{
  "permissions": ["activeTab", "scripting", "storage", "downloads"],
  "host_permissions": ["<all_urls>"],
  "optional_host_permissions": ["https://*/*", "http://*/*"]
}
```

(Use File System Access API for chosen folder; no extra permission string required, but must be initiated by user gesture.)

## 12) Accessibility & i18n

- All actions reachable via keyboard; labels & roles on controls.
- Copy and UI strings centralized and ready for future locales.

## 13) Error handling

- Extraction failure: show **“Couldn’t find main content — try selecting text and summarizing selection.”**
- Provider failure: show provider error + retry; rate-limit friendly backoff.
- File write failure: prompt to re-select Library folder or fall back to download.

## 14) Security & privacy

- No telemetry, no third-party scripts, strict CSP.
- **Cloud call banner** when applicable; never send passwords/forms (basic heuristic to detect sensitive pages + per-site kill switch).
- One-click **“Delete all data”** (DB + Library prompts).

## 15) Testing & QA

- **Unit tests**: extractor heuristics, DB DAL, filename generator, prompt formatter.
- **Integration tests**: E2E with Playwright on sample pages (news, docs, paper PDF via built-in viewer).
- **Snapshot tests**: UI components for Summarize/Compare panels.
- **Manual test script**: verify Save to `.md` and `.txt`; re-open panel and re-run; A/B scoring write path; Library folder revoke/renew.
- **Performance**: measure TTI and summary latency; stream rendering.

## 16) CI/CD & repo

- **Repo name**: `briefcase-extension`
- **Structure**

```
/apps/extension/        # MV3 code (React/TS, Vite/Plasmo/CRXJS)
/packages/db/           # SQLite WASM wrapper, DAL, migrations
/packages/extractor/    # DOM cleaning + readability wrapper
/packages/providers/    # LLM adapters
/packages/ui/           # shared UI components
/docs/                  # PRD, architecture, how-to-test
/scripts/               # build, sign, package, e2e bootstrap
```

- Checks: typecheck, lint, unit, e2e headless; signed zip artifacts; GitHub Releases with changelog.

## 17) Release plan & milestones

**v1.0 (SLC)**

- Summarize tab end-to-end; `.md`/`.txt` save; SQLite+FTS; anchors; A/B compare + scores; settings; delete all data.
- **Release artifacts**: signed build, README, quickstart GIF, sample Library.

**v1.1**

- History view; re-run with different settings; per-site defaults; small UX polish.

**v1.2**

- Output expansion: **`.json`** export; optional **Google Drive push** (user-initiated OAuth; no background sync).

**Future**

- Semantic search (embeddings) and enrichment toggle.

## 18) Risks & mitigations

- **Extraction brittleness** → Use a proven readability library + selection fallback; maintain site allow/deny list.
- **File write constraints** → Prefer File System Access; fallback to downloads.
- **Provider limits/costs** → Ship with local provider adapter option; warn on token sizes.
- **Small-icon legibility** → Provide simplified monochrome glyph variant of logo #5.

## 19) Open questions (for discovery)

- Which readability engine variant (e.g., upstream vs tuned) performs best on docs vs blogs?
- Minimum viable local model path for “offline” demo (Ollama/LM Studio adapter + prompt tuning).
- Source anchor strategy: paragraph hashing vs CSS selector maps—what’s most robust across navigations?
- How strict should we be on sensitive page detection (banking/health) before auto-disable?

---

## Technical discovery pack (actionable for devs)

### A) Spikes (time-boxed)

1. **SQLite WASM + FTS in MV3**

   - POC: create OPFS-backed DB, FTS5 table, insert 50k-char text, run queries.
   - Deliver: tiny demo + perf notes + migration pattern.

2. **File System Access flow**

   - POC: request folder handle from side panel, persist, write markdown; simulate permission revoke and recovery.
   - Deliver: API wrapper with error taxonomy.

3. **Extractor bake-off**

   - Compare Readability.js vs heuristic blend on 20 URLs (news/docs/blogs).
   - Deliver: scores for coverage/cleanliness; choose default.

4. **Model adapter shape**

   - Implement two adapters: one cloud (e.g., OpenAI/Anthropic/Gemini\*) and one local (Ollama).
   - Deliver: streaming to UI; unified error interface; token/latency stats (local UI only).

5. **Anchor mapping**
   - POC: paragraph index + `data-briefcase-id` with hash of text; validate after page resize/ads.
   - Deliver: success rate report; fallback to “open at top” if mapping fails.

\* Use any available API keys locally; keep provider toggles behind `.env.local` with documented setup. No keys in repo.

### B) Interface contracts (TS sketch)

```ts
// extractor
export interface ExtractedDoc {
  url: string;
  title: string;
  site?: string;
  rawText: string; // stored in DB
  sections?: { id: string; text: string }[]; // for anchors
  meta: { wordCount: number; extractedAt: string; hash: string };
}

// DAL
export interface SaveResult {
  documentId: string;
}
export interface DAL {
  upsertDocument(doc: ExtractedDoc): Promise<SaveResult>;
  saveSummary(input: {
    documentId: string;
    model: string;
    params: any;
    savedPath: string;
    savedFormat: "md" | "txt";
  }): Promise<void>;
  recordABRun(run: {
    documentId: string;
    modelA: string;
    modelB: string;
    template: string;
  }): Promise<{ runId: string }>;
  recordABScore(score: {
    runId: string;
    coverage: boolean;
    readability: boolean;
    faithfulness: boolean;
    note?: string;
  }): Promise<void>;
  search(
    query: string,
  ): Promise<{ documentId: string; title: string; url: string; snippet: string }[]>;
}

// provider input
export interface SummarizeInput {
  url: string;
  content: string;
  length: "brief" | "medium" | "verbose";
  level: "kinder" | "high_school" | "college" | "phd";
  style: "plain" | "bullets" | "executive";
}
```

### C) Acceptance criteria (v1)

- From a cold install, user can:
  1. Pin side panel, click Summarize, see output with TL;DR and key points.
  2. Choose `.md` or `.txt`, pick Library folder, **save**, and see file on disk.
  3. Run A/B compare on same page, toggle three scores, and persist to DB.
  4. Search previous pages via FTS from settings/history and open results.
  5. Toggle to summarizing a text selection if auto-extraction fails.
  6. Delete all data (DB cleared; files deletion prompts one by one or skip).

### D) Manual test checklist (condensed)

- News article, API docs page, long blog post, and a PDF preview tab.
- Change comprehension level from HS → PhD and confirm tone shift.
- Deny Library folder permission; verify download fallback.
- Switch to a cloud model; verify banner + successful run.
- Revoke folder permission mid-session; verify recovery UX.

### E) Visual deliverables for dev

- Include **logo #5** in `/apps/extension/public/icons/` with sizes: 16, 19, 24, 32, 48, 64, 128, 256, 512; maskable 192 & 512; monochrome glyph.
- Color tokens (suggested):
  - `--accent: #1EA7FD` (electric blue); `--accent-warm: #FF9F1C`;
  - neutrals via system tokens (slate/stone) with dark-mode bias.
