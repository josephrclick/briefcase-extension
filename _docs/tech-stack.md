# Tech Stack & Developer Guide

This document outlines the core technologies, libraries, and conventions used in the Briefcase extension. It serves as a guide for both human developers and AI coding assistants to ensure consistency and maintainability.

## 1. High-Level Architecture

The project is a **monorepo** managed with `npm` workspaces. This structure separates concerns into distinct packages while allowing for shared configurations and efficient dependency management.

- `/apps/extension/`: The main Chrome Extension application (Manifest V3).
- `/packages/*`: Isolated modules for specific functionalities (DB, UI, etc.).
- `/scripts/`: Build, release, and utility scripts.
- `/_docs/`: Project documentation, including the PRD and this guide.

## 2. Core Frameworks & Libraries

### Platform

- **Target**: Google Chrome (Manifest V3)
- **Core API**: `chrome.sidePanel`, `chrome.scripting`, `chrome.storage`, File System Access API.

### Frontend & UI

- **Framework**: **React** with **TypeScript**.
  - _Rationale_: Provides a robust, component-based architecture suitable for a dynamic side panel UI. TypeScript ensures type safety, which is critical for both developer experience and long-term maintenance.
- **Build Tool**: **Vite** (or a similar modern bundler like CRXJS).
  - _Rationale_: Fast development server, optimized builds, and strong ecosystem support for web extension development.
- **Styling**: Plain CSS with CSS Variables. A lightweight component library may be considered later if UI complexity grows.

### Backend & Data Persistence

- **Database**: **SQLite (WASM)**
  - _Rationale_: Enables a powerful, local-first, relational database that runs entirely in the browser, satisfying the core privacy requirement. We will use a library like `wa-sqlite` or `sql.js` for the implementation.
- **Full-Text Search**: **FTS5 Extension** for SQLite.
  - _Rationale_: Provides efficient and advanced text search capabilities directly on the stored raw content, enabling the core "searchable library" feature.

### Content & Logic Packages

- **Content Extraction**: **Mozilla Readability.js**
  - _Rationale_: A proven, robust library for extracting the primary, readable content from a web page. This will be the primary engine for the `extractor` package.
- **LLM Integration**: Pluggable **Provider Adapters**
  - _Rationale_: A structured `LLMProvider` interface allows for easily adding, removing, or swapping different language models (e.g., local Ollama, remote OpenAI/Anthropic) without changing the core application logic.

## 3. Tooling & Conventions

### Development Environment

- **Package Manager**: **npm**
  - _Convention_: Use `npm` for all dependency management (`npm install`, `npm install <package>`, etc.) from the root of the repository. This is crucial for managing the monorepo workspaces correctly via the `package.json` `workspaces` attribute.
- **Code Formatting**: **Prettier**
  - _Convention_: Code will be automatically formatted on commit using pre-commit hooks.
- **Linting**: **ESLint**
  - _Convention_: Adhere to the established linting rules.

### Testing Strategy

- **Unit Tests**: **Vitest** or **Jest**
  - _Scope_: Test individual functions and components in isolation, especially for logic in `packages/`.
- **Integration/E2E Tests**: **Playwright**
  - _Scope_: Simulate user interactions with the extension in a real browser environment to test full data flows.

### Version Control

- **Branching Strategy**: TBD (e.g., GitFlow, Trunk-Based). For now, feature branches off `main`.
- **Commit Messages**: **Conventional Commits** (`feat:`, `fix:`, `docs:`, etc.).
  - _Rationale_: Clear, machine-readable commit history is essential for automated changelog generation and versioning.

This document is living and should be updated as architectural decisions are made or new dependencies are introduced.
