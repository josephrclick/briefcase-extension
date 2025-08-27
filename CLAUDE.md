# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT: Before Starting Any Work

1. **Review the PRD**: The `_docs/PRD.md` file is the core foundational document and source of truth for all architecture decisions. Always reference it for project requirements, data models, and technical specifications.

## Project Overview

Briefcase is a Chrome Extension (Manifest V3) that extracts main content from web pages and produces tailored summaries using LLMs. It's a local-first, privacy-focused extension with a pinned side panel UI built with React and TypeScript.

**Key Features:**

- One-click summarization with adjustable length, style, and comprehension level
- A/B comparison of different LLM models
- Local SQLite database with full-text search (FTS5)
- Streaming responses from LLM providers
- Offscreen document for persistent database operations

## Architecture

The project uses a monorepo structure with npm workspaces:

### Packages Structure

- `/apps/extension/` - Main Chrome extension
  - `/src/background/` - Service worker and offscreen proxy
  - `/src/offscreen/` - Offscreen document for database operations
  - `/src/sidepanel/` - React/TypeScript side panel UI
  - `/src/types/` - Shared TypeScript types
  - `/src/__tests__/` - Comprehensive test suite
- `/packages/db/` - SQLite WASM wrapper with FTS5 (placeholder)
- `/packages/extractor/` - DOM content extraction using Mozilla Readability (placeholder)
- `/packages/providers/` - LLM provider adapters (Ollama implemented)

### Key Components

#### Offscreen Document

- Hosts SQLite WASM database to prevent service worker timeout issues
- Manages connection pooling (max 5 connections)
- Handles all database operations via message passing
- Implements retry logic and query timeouts

#### Message System

- Type-safe message passing between components
- Request/response correlation with unique IDs
- Retry logic (3 attempts) with exponential backoff
- Heartbeat monitoring for health checks

## Development Commands

```bash
# Install dependencies (from root)
npm install

# Build all packages
npm run build

# Run linting
npm run lint

# Run type checking
npm run typecheck

# Run tests
npm run test
npm run test:watch

# Format code
npm run format:fix
```

## Git Workflow Commands

**Automated Git workflow with trigger phrases:**

- **`git-start <description>`** - Start a new feature branch
  - Updates main branch
  - Creates feature branch with kebab-case naming
  - Pushes branch to origin
- **`git-save`** or **`git-checkpoint`** - Quick WIP commit
  - Stages all changes
  - Creates checkpoint commit with descriptive message
  - Pushes to current branch
- **`git-review [#issue]`** - Create pull request
  - Commits final changes
  - Creates PR targeting main branch
  - Links to issue if number provided (e.g., `git-review #35`)
  - Generates dynamic checklist based on changed files
- **`git-status`** - Check PR and CI status
  - Shows current PRs
  - Lists recent CI runs
  - Displays failed run details if any

## Project-Specific Commands

- `/build-extension` - Build the Chrome extension for production
- `/test-all` - Run complete test suite including unit and E2E tests
- `/check-sqlite` - Verify SQLite WASM setup with FTS5
- `/new-provider [name]` - Generate new LLM provider adapter
- `/new-component [name]` - Generate new React component for side panel
- `/fix-issue [#number]` - Research and implement GitHub issue fix
- `/gather-memories` - Update memory files with project context

## Technical Implementation Details

### Database Layer

- **Offscreen Document**: Persistent context for SQLite operations
- **Connection Manager**: Pooling, retry logic, query timeouts (30s)
- **Tables**: documents, summaries, ab_runs, ab_scores, doc_fts
- **Storage**: OPFS (Origin Private File System)
- **Features**: Full-text search with FTS5, transaction support

### Chrome Extension APIs

- `chrome.offscreen` - Persistent document for database (Chrome 109+)
- `chrome.sidePanel` - Main UI container
- `chrome.scripting` - Content script injection
- `chrome.storage` - Settings persistence
- `chrome.runtime` - Message passing between components
- File System Access API - Library folder selection

### LLM Provider Interface

Providers implement the `LLMProvider` interface:

- `id`: Provider identifier (e.g., "ollama:llama3.2")
- `supportsStreaming`: Boolean flag
- `summarize()`: Returns AsyncIterable<string> for streaming

### Content Flow

1. User clicks summarize in side panel
2. Side panel sends message to service worker
3. Service worker requests content from content script
4. Content script extracts DOM using Readability.js
5. Service worker calls LLM provider for summarization
6. Response streams back to side panel UI
7. Optional: Save summary to disk and database via offscreen document

## Testing

### Test Structure

- `/src/__tests__/unit/` - Unit tests for core functionality
- `/src/__tests__/utils/` - Test utilities and mocks
- Comprehensive mocks for Chrome APIs
- Database fixtures and message helpers

### Running Tests

```bash
npm run test          # Run all tests
npm run test:watch    # Watch mode
npm run test:ui       # Vitest UI
```

## CI/CD

### GitHub Actions Workflows

- **ci.yml** - Runs on all PRs (lint, typecheck, test, build)
- **release.yml** - Automated release process
- **claude-code-review.yml** - AI-powered code review on PRs

### Pre-commit Hooks (Husky + lint-staged)

- Prettier formatting
- ESLint fixing
- Commit message validation (conventional commits)

## Code Style

- **Language**: TypeScript for all new code
- **UI**: Functional React components with hooks
- **Styling**: CSS Variables for theming (`--accent`, `--accent-warm`)
- **Commits**: Conventional commits (feat:, fix:, docs:, refactor:, test:, chore:)
- **Formatting**: Prettier with project config
- **Linting**: ESLint with TypeScript rules

## Security & Privacy

- **No telemetry or analytics** - Privacy-first design
- **Local-first** - Data stays on device unless user chooses cloud LLM
- **Content Security Policy** - Strict CSP in offscreen document
- **API Keys** - Never stored in code, user-provided at runtime
- **Sandboxing** - Content scripts are isolated
- **Warning Banners** - Clear indicators when using cloud providers
- **Sensitive Page Detection** - Planned for banking/health sites

## Common Issues & Solutions

### TypeScript Errors

- Use `npm run typecheck` to verify types
- Avoid `any` types - use proper interfaces
- For browser APIs, use `window.setTimeout` instead of Node types

### Message Passing

- Always include message type validation
- Use correlation IDs for request/response matching
- Implement proper error boundaries

### Database Operations

- Offscreen document must be initialized before use
- Connection pooling prevents resource exhaustion
- All operations include retry logic

## Claude Code Environment

### Automated Hooks

The project uses a hierarchical Python-based hook system. See `.claude/HOOKS_DOCUMENTATION.md` for details.

**Active Hooks:**

1. **File Protection** - Prevents editing sensitive files
2. **Bash Validation** - Enforces safety and best practices
3. **Prettier Formatting** - Auto-formats modified files
4. **Prompt Modifiers** - Adds instructions based on prompt suffixes

### Permissions

- **Allowed**: Build, lint, test, typecheck commands, and reading project files
- **Denied**: Modifying sensitive files, dangerous commands (rm -rf, curl, wget)

To customize your local environment, copy `.claude/settings.local.json.template` to `.claude/settings.local.json`.

## Next Steps & TODOs

1. **Complete SQLite WASM Integration** - Replace mock implementation in connectionManager.ts
2. **Implement Extractor Package** - Mozilla Readability integration
3. **Add More LLM Providers** - OpenAI, Anthropic, Google adapters
4. **Implement A/B Comparison** - Side-by-side model comparison UI
5. **Add Settings Persistence** - User preferences and API keys
6. **File System Integration** - Save summaries to user-selected folder
