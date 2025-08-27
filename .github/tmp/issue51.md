Parent: #38

### Problem Statement
The DB message protocol types advertise endpoints that are not fully implemented in offscreen handlers, and error responses are not mapped to typed `DbErrorCode`. Minimal tests are needed to prevent regressions.

### Proposed Solution
- Align `apps/extension/src/types/database.ts` with implemented handlers.
- Implement `DB_SEARCH`, `DB_GET_HISTORY`, `DB_DELETE_ALL_DATA` with typed `DbErrorCode` mapping.
- Unit tests for the DB wrapper against an in-memory VFS; one Playwright E2E to validate OPFS persistence across service-worker restarts and FTS `snippet()`.

### Alternatives Considered
- Broader test matrix (load/perf); out of scope for v1 SLC.

### Priority
Important

### Feature Area
Storage/Database

### Acceptance Criteria
- Typed responses/errors for DB endpoints.
- CI green on unit tests; E2E smoke passes locally validating OPFS durability and FTS search.

### Implementation Guidance
- Keep unit tests hermetic (no OPFS).
- Use Playwright for one OPFS E2E in a Chromium profile to exercise offscreen DB open, insert, restart, search.

### UI/UX Mockups
N/A

### Checklist
- [x] I have searched for existing feature requests
- [x] This feature aligns with the project's privacy-first philosophy
