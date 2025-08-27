Parent: #38

### Problem Statement

Integrate official sqlite3.wasm into the Chrome MV3 offscreen document with OPFS and FTS5 support. Ensure the build packages WASM/worker assets and the offscreen page can load them without CSP or path issues.

### Proposed Solution

- Vendor the official sqlite3.wasm distribution into `packages/db/sqlite3/`.
- Configure Vite to:
  - include `src/offscreen/offscreen.html` as an input entry,
  - emit `.wasm`/worker assets (via `assetsInclude` or a WASM plugin).
- Add `web_accessible_resources` entries for emitted WASM/worker and offscreen assets in `apps/extension/manifest.json`.
- In the offscreen document, initialize the OPFS async proxy and open the database at `file:briefcase.db?vfs=opfs`.

### Alternatives Considered

- `wa-sqlite` / forks with FTS5 prebuilt; declined to avoid fork dependence and prefer first‑party distribution.

### Priority

Important

### Feature Area

Storage/Database

### Acceptance Criteria

- Offscreen loads sqlite3 without CSP/asset errors.
- OPFS‑backed DB opens and PRAGMAs run.
- Build emits WASM/worker and offscreen assets correctly.

### Implementation Guidance

- Place vendor files under `packages/db/sqlite3/`.
- Update `apps/extension/vite.config.ts` `rollupOptions.input` to include offscreen HTML.
- In offscreen initialization, open the OPFS database and run PRAGMAs (`WAL`, `foreign_keys=ON`).

```ts
// Example sketch (pseudo-code)
// await sqlite3InitModule();
// const db = new sqlite3.oo1.DB("file:briefcase.db?vfs=opfs", "c");
// db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
```

### UI/UX Mockups

N/A

### Checklist

- [x] I have searched for existing feature requests
- [x] This feature aligns with the project's privacy-first philosophy
