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

The project uses a hierarchical Python-based hook system for enhanced reliability and maintainability. See [.claude/HOOKS_DOCUMENTATION.md](.claude/HOOKS_DOCUMENTATION.md) for complete documentation.

**Active Hooks:**

1. **File Protection** (`PreToolUse/file_protection.py`) - Prevents editing sensitive files
2. **Bash Validation** (`PreToolUse/bash_validator.py`) - Enforces safety and best practices
3. **Prettier Formatting** (`PostToolUse/prettier_format.py`) - Auto-formats modified files
4. **Prompt Modifiers** (`UserPromptSubmit/*.py`) - Adds instructions based on prompt suffixes

### Permissions

- **Allowed**: Build, lint, test, typecheck commands, and reading project files
- **Denied**: Modifying sensitive files, dangerous commands (rm -rf, curl, wget)

To customize your local environment, copy `.claude/settings.local.json.template` to `.claude/settings.local.json`.

## Work Log

📁 **Archives**: This log shows recent work only. For historical entries, see [.claude/archives/INDEX.md](.claude/archives/INDEX.md)

---

## Work Log

### 2025-08-24 (Part 2) - Git Workflow Automation & Prettier Hook

- **Enhanced Git Workflow Automation**:

  - Integrated Git workflow commands from previous project (git-start, git-save, git-review, git-status)
  - Created main workflow script (`.claude/commands/git-workflow.sh`) with safety rules
  - Updated to use `main` branch only (removed references to `dev` branch)
  - **Enhanced git-review with dynamic PR checklists**:
    - Analyzes changed files to generate context-specific checklists
    - Adds relevant checks for database, UI, manifest, TypeScript, dependencies
    - Shows file count and affected project areas
    - Automatic issue linking with `git-review #issue`
  - Converted Git commands from .sh to .md format for Claude Code slash commands
  - Added 'wip' as valid commit type in commitlint configuration
  - Created comprehensive documentation in `.claude/GIT_WORKFLOW.md`

- **Fixed Prettier Formatting Hook** (Issue #2):

  - Created POSIX-compliant prettier formatting script (`.claude/hooks/prettier-format.sh`)
  - Configured PostToolUse hook in `.claude/settings.json` for Edit/Write/MultiEdit operations
  - Successfully tested with JavaScript and JSON files
  - Created PR #3 demonstrating complete GitHub Actions workflow
  - Resolves previous shell syntax errors with proper POSIX compliance

- **Current Branch**: `feat/prettier-hook` - Ready for review with PR #3

### 2025-08-25 - Work Log Pruning & Lint Fix (Issue #4)

- **Implemented Work Log Pruning**:

  - Created `.claude/scripts/prune-worklog.js` to automatically archive old work logs
  - Established retention policy: keep 30 days in main log, archive older entries
  - Created `.claude/WORKLOG_PRUNING.md` with detailed usage and CI integration notes
  - Added npm scripts: `prune:worklog` and `prune:worklog:dry` for manual pruning
  - Successfully archived initial work log entries to `.claude/archives/2025/`
  - Created index file at `.claude/archives/INDEX.md` for navigation

- **Fixed Prettier Lint Issues**:

  - Resolved CI failures by formatting 4 files with Prettier
  - Created `.prettierignore` to preserve archive immutability
  - Added `format` and `format:check` npm scripts for consistency
  - Excluded `.claude/archives/**` from Prettier checks to prevent formatting drift

- **Current Branch**: `work-log-pruning` - PR #5 addressing issue #4

- **Next steps**:
  - Merge prettier hook PR once CI passes
  - Begin implementing core extension structure per PRD specifications
  - Start with basic manifest.json setup
  - Create initial React side panel UI
