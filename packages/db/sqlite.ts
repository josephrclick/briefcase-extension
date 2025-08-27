/**
 * SQLite WASM Wrapper with Single Connection and Queued Executor
 * Provides a managed interface to sqlite3.wasm with OPFS support
 */

import type { Database } from "./types";

// SQLite3 module types
interface SQLite3Module {
  version: { libVersion: string };
  oo1: {
    DB: new (filename: string, mode?: string) => SQLiteDB;
    OpfsDb?: new (filename: string) => SQLiteDB;
  };
  capi: {
    sqlite3_exec: (db: unknown, sql: string) => number;
  };
}

interface SQLiteDB {
  exec: (sql: string, options?: ExecOptions) => unknown;
  prepare: (sql: string) => SQLiteStatement;
  close: () => void;
  filename: string;
  changes: () => number;
  lastInsertRowid: () => number;
}

interface SQLiteStatement {
  bind: (params: unknown[]) => SQLiteStatement;
  step: () => boolean;
  get: (asArray?: boolean) => unknown;
  getAsObject: () => Record<string, unknown>;
  finalize: () => void;
}

interface ExecOptions {
  returnValue?: "resultRows" | "saveSql";
  rowMode?: "array" | "object";
  callback?: (row: unknown) => void;
}

interface QueuedTask<T = unknown> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export class SQLiteWrapper implements Database {
  private db: SQLiteDB | null = null;
  private queue: QueuedTask[] = [];
  private isProcessing = false;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly useOPFS: boolean = true) {}

  /**
   * Initialize the SQLite database
   */
  async initialize(): Promise<void> {
    // Return existing promise if initialization is in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    if (this.isInitialized) {
      return;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      // Dynamic import to work with bundlers
      // @ts-expect-error - SQLite WASM module doesn't have TypeScript declarations
      const sqlite3Module = await import("../../packages/db/sqlite3/sqlite3-bundler-friendly.mjs");

      // Initialize SQLite3 module
      const sqlite3: SQLite3Module = await sqlite3Module.default({
        print: console.log,
        printErr: console.error,
      });

      console.log("SQLite3 initialized, version:", sqlite3.version.libVersion);

      // Open database with OPFS if available
      if (this.useOPFS && sqlite3.oo1.OpfsDb) {
        console.log("Using OPFS for persistent storage");
        this.db = new sqlite3.oo1.OpfsDb("file:briefcase.db?vfs=opfs");
      } else {
        console.log("Using in-memory database");
        this.db = new sqlite3.oo1.DB(":memory:", "c");
      }

      // Configure database with PRAGMAs
      await this.executeDirect("PRAGMA journal_mode=WAL");
      await this.executeDirect("PRAGMA foreign_keys=ON");
      await this.executeDirect("PRAGMA synchronous=NORMAL");
      await this.executeDirect("PRAGMA temp_store=MEMORY");
      await this.executeDirect("PRAGMA mmap_size=30000000000");

      // Load schema
      const schema = await this.loadSchema();
      await this.executeDirect(schema);

      this.isInitialized = true;
      console.log("Database initialized successfully at:", this.db!.filename);
    } catch (error) {
      console.error("Failed to initialize SQLite:", error);
      throw new Error(`Database initialization failed: ${error}`);
    }
  }

  /**
   * Load schema from schema.sql file
   */
  private async loadSchema(): Promise<string> {
    // In production, this would use Vite's raw import
    // For now, return the schema inline
    return `
-- SQLite Database Schema with INTEGER PRIMARY KEY and FTS5 External Content
-- Version: 2.0.0

-- Main documents table with INTEGER PRIMARY KEY for better performance
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  title TEXT,
  site TEXT,
  saved_at TEXT NOT NULL DEFAULT (datetime('now')),
  word_count INTEGER,
  hash TEXT UNIQUE,
  raw_text TEXT NOT NULL
);

-- Create indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_documents_url ON documents(url);
CREATE INDEX IF NOT EXISTS idx_documents_saved_at ON documents(saved_at);
CREATE INDEX IF NOT EXISTS idx_documents_site ON documents(site);

-- FTS5 table with external content to avoid duplication
CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
  title,
  content,
  url,
  content=documents,
  content_rowid=id
);

-- Triggers to keep FTS index in sync with documents table
-- Insert trigger
CREATE TRIGGER IF NOT EXISTS documents_after_insert 
AFTER INSERT ON documents 
BEGIN
  INSERT INTO doc_fts(rowid, title, content, url) 
  VALUES (new.id, new.title, new.raw_text, new.url);
END;

-- Update trigger
CREATE TRIGGER IF NOT EXISTS documents_after_update 
AFTER UPDATE ON documents 
BEGIN
  UPDATE doc_fts 
  SET title = new.title, content = new.raw_text, url = new.url 
  WHERE rowid = new.id;
END;

-- Delete trigger
CREATE TRIGGER IF NOT EXISTS documents_before_delete 
BEFORE DELETE ON documents 
BEGIN
  DELETE FROM doc_fts WHERE rowid = old.id;
END;

-- Summaries table with INTEGER foreign key
CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  params_json TEXT NOT NULL,
  saved_path TEXT,
  saved_format TEXT CHECK(saved_format IN ('md','txt')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_summaries_document_id ON summaries(document_id);
CREATE INDEX IF NOT EXISTS idx_summaries_model ON summaries(model);

-- A/B comparison runs table
CREATE TABLE IF NOT EXISTS ab_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  model_a TEXT NOT NULL,
  model_b TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ab_runs_document_id ON ab_runs(document_id);

-- A/B comparison scores table
CREATE TABLE IF NOT EXISTS ab_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  coverage INTEGER NOT NULL CHECK(coverage >= 0 AND coverage <= 100),
  readability INTEGER NOT NULL CHECK(readability >= 0 AND readability <= 100),
  faithfulness INTEGER NOT NULL CHECK(faithfulness >= 0 AND faithfulness <= 100),
  note TEXT,
  rater TEXT DEFAULT 'me',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES ab_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ab_scores_run_id ON ab_scores(run_id);
    `;
  }

  /**
   * Execute SQL directly without queueing (for internal use)
   */
  private async executeDirect(sql: string, params?: unknown[]): Promise<unknown> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    if (params && params.length > 0) {
      const stmt = this.db.prepare(sql);
      const results: unknown[] = [];

      try {
        stmt.bind(params);
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        return results;
      } finally {
        stmt.finalize();
      }
    } else {
      return this.db.exec(sql, { rowMode: "object", returnValue: "resultRows" });
    }
  }

  /**
   * Queue a task for execution
   */
  private async queueTask<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute: task,
        resolve,
        reject,
      });
      this.processQueue();
    });
  }

  /**
   * Process the task queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      try {
        const result = await task.execute();
        task.resolve(result);
      } catch (error) {
        task.reject(error as Error);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Execute a SQL query with parameters
   */
  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    await this.initialize();

    return this.queueTask(async () => {
      const startTime = performance.now();
      try {
        const results = await this.executeDirect(sql, params);
        const duration = performance.now() - startTime;

        if (duration > 1000) {
          console.warn(`Slow query (${duration.toFixed(2)}ms):`, sql);
        }

        return results;
      } catch (error) {
        console.error("Query error:", error, "SQL:", sql);
        throw error;
      }
    });
  }

  /**
   * Execute a SQL command (INSERT, UPDATE, DELETE)
   */
  async execute(
    sql: string,
    params?: unknown[],
  ): Promise<{ changes: number; lastInsertRowid: number }> {
    await this.initialize();

    return this.queueTask(async () => {
      await this.executeDirect(sql, params);
      return {
        changes: this.db!.changes(),
        lastInsertRowid: this.db!.lastInsertRowid(),
      };
    });
  }

  /**
   * Run multiple statements in a transaction
   */
  async transaction<T>(callback: (db: Database) => Promise<T>): Promise<T> {
    await this.initialize();

    return this.queueTask(async () => {
      await this.executeDirect("BEGIN TRANSACTION");
      try {
        const result = await callback(this);
        await this.executeDirect("COMMIT");
        return result;
      } catch (error) {
        await this.executeDirect("ROLLBACK");
        throw error;
      }
    });
  }

  /**
   * Perform full-text search using FTS5
   */
  async search(query: string, limit: number = 20, offset: number = 0): Promise<unknown[]> {
    const sql = `
      SELECT 
        d.id,
        d.url,
        d.title,
        d.site,
        d.saved_at,
        d.word_count,
        snippet(doc_fts, 0, '<mark>', '</mark>', '...', 30) AS title_snippet,
        snippet(doc_fts, 1, '<mark>', '</mark>', '...', 30) AS content_snippet,
        bm25(doc_fts) AS relevance_score
      FROM doc_fts
      JOIN documents d ON d.id = doc_fts.rowid
      WHERE doc_fts MATCH ?
      ORDER BY bm25(doc_fts)
      LIMIT ? OFFSET ?
    `;

    return this.query(sql, [query, limit, offset]);
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      // Wait for queue to empty
      while (this.queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      this.db.close();
      this.db = null;
      this.isInitialized = false;
      this.initPromise = null;
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    documentCount: number;
    summaryCount: number;
    databaseSize: number;
  }> {
    const [docs] = await this.query<{ count: number }>("SELECT COUNT(*) as count FROM documents");
    const [summaries] = await this.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM summaries",
    );
    const [pageCount] = await this.query<{ count: number }>("PRAGMA page_count");
    const [pageSize] = await this.query<{ size: number }>("PRAGMA page_size");

    return {
      documentCount: docs?.count || 0,
      summaryCount: summaries?.count || 0,
      databaseSize: (pageCount?.count || 0) * (pageSize?.size || 0),
    };
  }
}
