Parent: #38

### Problem Statement

Replace the mock DB with a real sqlite3.wasm connection and align the schema to INTEGER PRIMARY KEY ids with FTS5 external-content + triggers. Ensure a simple single-connection wrapper with a queued executor.

### Proposed Solution

- Create `packages/db/sqlite.ts` wrapper (single connection + queued executor).
- Open OPFS DB, run PRAGMAs (`WAL`, `foreign_keys=ON`), and execute `packages/db/schema.sql`.
- Update schema to INTEGER PRIMARY KEY ids, foreign keys, FTS5 external-content with triggers; remove content duplication.
- Replace mock in `apps/extension/src/offscreen/connectionManager.ts` to use the wrapper.
- Remove manual FTS inserts; order search by `bm25(doc_fts)`.

### Alternatives Considered

- Maintain pool-of-5 connections; rejected due to OPFS contention and added complexity.

### Priority

Important

### Feature Area

Storage/Database

### Acceptance Criteria

- Concurrent callers serialize via the queue; transactions are short.
- CRUD + FTS search work via offscreen messages.
- No duplicate indexing; search ordered by `bm25`.

### Implementation Guidance

- Import schema via Vite raw loader and execute once on init.
- Update `ConnectionManager` to delegate to the wrapper and drop manual FTS mirror writes.

```sql
-- Search SQL ordering example
SELECT d.id, d.url, d.title, d.site, d.saved_at, d.word_count,
       snippet(doc_fts, 0, '<mark>', '</mark>', '...', 30) AS snippet
FROM doc_fts
JOIN documents d ON d.id = doc_fts.rowid
WHERE doc_fts MATCH ?
ORDER BY bm25(doc_fts) ASC
LIMIT ? OFFSET ?;
```

### UI/UX Mockups

N/A

### Checklist

- [x] I have searched for existing feature requests
- [x] This feature aligns with the project's privacy-first philosophy
