# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT: Before Starting Any Work

1. **Review the PRD**: The `_docs/PRD.md` file is the core foundational document and source of truth for all architecture decisions. Always reference it for project requirements, data models, and technical specifications.

2. **Check Work Log**: Review the Work Log section at the bottom of this document for the latest updates on project state, recent changes, and any open issues that need attention.

## Project Overview

Briefcase is a Chrome Extension (Manifest V3) that extracts main content from web pages and produces tailored summaries using LLMs. It's a local-first, privacy-focused extension with a pinned side panel UI.

**Note**: For detailed requirements and specifications, refer to `_docs/PRD.md`.

## Architecture

The project uses a monorepo structure with npm workspaces:

- `/apps/extension/` - Main Chrome extension (React/TypeScript, side panel UI)
- `/packages/db/` - SQLite WASM wrapper with FTS5 for local storage
- `/packages/extractor/` - DOM content extraction using Mozilla Readability
- `/packages/providers/` - LLM provider adapters (OpenAI, Ollama, etc.)

## Key Development Commands

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

# Format code
npm run format:fix
```

## Custom Claude Code Commands

### Git Workflow Commands

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
- **`git-status`** - Check PR and CI status
  - Shows current PRs
  - Lists recent CI runs
  - Displays failed run details if any

### Project-Specific Commands

- `/build-extension` - Build the Chrome extension for production
- `/test-all` - Run complete test suite including unit and E2E tests
- `/check-sqlite` - Verify SQLite WASM setup with FTS5
- `/new-provider [name]` - Generate new LLM provider adapter
- `/new-component [name]` - Generate new React component for side panel

## Important Technical Context

### Database Layer

- Uses SQLite WASM with FTS5 for full-text search
- Stores in OPFS (Origin Private File System)
- Tables: documents, summaries, ab_runs, ab_scores, doc_fts

### LLM Provider Interface

All providers implement the `LLMProvider` interface in `packages/providers/index.ts`:

- `id`: Provider identifier (e.g., "openai:gpt-4o-mini")
- `supportsStreaming`: Boolean flag
- `summarize()`: Returns AsyncIterable<string> or Promise<string>

### Chrome Extension APIs

- `chrome.sidePanel` - Main UI container
- `chrome.scripting` - Content script injection
- `chrome.storage` - Settings persistence
- File System Access API - Library folder selection

### Content Extraction Flow

1. Content script extracts DOM using Readability.js
2. Background service worker orchestrates LLM calls
3. Side panel displays results with React
4. User can save as .md/.txt to chosen Library folder

## Code Style Guidelines

- TypeScript for all new code
- Functional components with React hooks
- CSS Variables for theming (`--accent`, `--accent-warm`)
- Conventional Commits (feat:, fix:, docs:, wip:, refactor:, test:, chore:)
- No telemetry or analytics code

## Security Considerations

- Never store API keys in code
- Content scripts are sandboxed
- Show warning banner when using cloud LLM providers
- Implement sensitive page detection (banking/health)

## Claude Code Environment

### Automated Hooks

The following hooks are configured in `.claude/settings.json`:

1. **File Protection** - Prevents editing sensitive files (`.env`, `package-lock.json`, PRD, etc.)
2. **Bash Validation** - Enforces best practices (use `rg` instead of `grep`, etc.)

### Permissions

- **Allowed**: Build, lint, test, typecheck commands, and reading project files
- **Denied**: Modifying sensitive files, dangerous commands (rm -rf, curl, wget)

To customize your local environment, copy `.claude/settings.local.json.template` to `.claude/settings.local.json`.

## Work Log Instructions

**IMPORTANT**: After completing any task or sprint, you MUST update the Work Log section below by:

1. Adding a dated entry summarizing work completed
2. Noting any open issues or blockers needing attention
3. Including any pertinent information the next coder should know
4. Keeping entries brief but informative

**Before starting work**, always review recent Work Log entries to understand the current project state.

---

## Work Log

### 2025-08-24 - Initial Setup & GitHub Actions Configuration

- Created CLAUDE.md with project overview and development guidelines
- Established PRD as source of truth for architecture decisions
- Set up work log process for continuity between coding sessions
- Created comprehensive Claude Code setup script (`.claude/setup.sh`) with:
  - File protection to prevent editing sensitive files
  - Bash command validation to enforce best practices
  - Project-specific commands for common tasks
  - Proper permissions configuration
- **Resolved ESLint configuration issues**:
  - Installed TypeScript ESLint parser and plugin
  - Created root `tsconfig.json` with proper TypeScript configuration
  - Created ESLint flat config (`eslint.config.js`) with Chrome API globals
  - Added package-specific tsconfig files for each workspace
  - All major lint errors resolved (Chrome API recognition, TypeScript parsing)
- **Implemented complete GitHub Actions setup**:
  - Created issue templates (bug report, feature request) and PR template
  - Configured Claude workflow with concurrency controls, max_turns, and Chrome extension-specific settings
  - Set up Claude code review workflow with sticky comments and security hardening for fork PRs
  - Created comprehensive CI/CD pipeline with build, test, lint, and security checks
  - Configured conventional commits with commitlint and husky
  - Created release workflow for Chrome Web Store deployment
  - Added CONTRIBUTING.md with detailed contribution guidelines
  - Created CODEOWNERS file for automated review assignments
- **Removed prettier hooks** due to shell compatibility issues (to be addressed separately)
- **Next steps**: Begin implementing core extension structure per PRD specifications
  - Start with basic manifest.json setup
  - Create initial React side panel UI
  - Set up SQLite WASM package
  - Implement Readability.js extraction
