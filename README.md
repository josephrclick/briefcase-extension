# Briefcase

A pinned side-panel extension that extracts the main content of the current page and produces a tailored summary. Save time, build judgment about model quality, and quietly grow a searchable personal library.

- **Local-first & private.** Raw extracted text lives in a local SQLite (WASM) + FTS database. Summaries save to disk as `.md` or `.txt`. No telemetry.
- **Adjustable outputs.** Tailor summaries by length (brief/medium/verbose), comprehension level (Kinder/HS/College/PhD), and style (plain, bullets, executive).
- **Compare models.** Run two LLMs side-by-side and record quick human scores for coverage, readability, and faithfulness.
- **Searchable library.** Full-text search over the raw, original content of every page you summarize.

## How it works

Briefcase uses a simple, robust flow to get you from a cluttered web page to a clean summary.

`DOM → Content Extractor → Cleaned Text → LLM Provider → Formatted Summary`

1.  The **Content Script** extracts the core text from the current page, stripping away ads, navigation, and other boilerplate.
2.  The **Background Service Worker** sends the cleaned text to your chosen LLM provider (local or cloud) with your specified parameters.
3.  The **Side Panel UI** (built with React) displays the summary, allowing you to save it to your local library.
4.  The **Database Layer** (SQLite via WASM) stores the original raw text, making it searchable for later.

## Tech Stack

- **Platform**: Chrome Extension Manifest V3
- **UI**: React & TypeScript
- **Database**: SQLite (WASM) with FTS5 for full-text search, running in-browser.
- **Providers**: Pluggable adapters for different LLM providers (e.g., local Ollama, remote OpenAI).

## Development Quickstart

1.  Clone the repository.
2.  Install dependencies using npm workspaces:
    ```bash
    npm install
    ```
3.  Open Chrome → `chrome://extensions`.
4.  Enable **Developer mode**.
5.  Click **Load unpacked** and select the `apps/extension/dist` directory (or similar build output folder).
6.  Pin **Briefcase** to your toolbar to open the side panel.

## Roadmap

### v1.0 (SLC)

- End-to-end Summarize tab with adjustable parameters.
- `.md` & `.txt` file saving to a user-chosen local folder.
- SQLite + FTS persistence for raw content.
- A/B comparison view with scoring.

### v1.1

- History view for past summaries.
- Ability to re-run summaries with different settings.
- Per-site defaults.

### v1.2

- JSON export option.
- Optional Google Drive integration for saving summaries.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.
