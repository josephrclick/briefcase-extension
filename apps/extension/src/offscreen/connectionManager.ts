/**
 * Connection manager for SQLite WASM database.
 * Uses a single connection with queued executor as per issue #50.
 */

import { SQLiteWrapper } from "@briefcase/db/sqlite";
import type { Database, Document, SearchResult } from "@briefcase/db/types";

interface DatabaseConfig {
  retryAttempts: number;
  retryDelay: number;
  queryTimeout: number;
  useOPFS: boolean;
}

export class ConnectionManager {
  private config: DatabaseConfig = {
    retryAttempts: 3,
    retryDelay: 1000, // 1 second
    queryTimeout: 30000, // 30 seconds
    useOPFS: true, // Use OPFS for persistent storage
  };

  private db: Database | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(config?: Partial<DatabaseConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Initialize the database and create tables if needed
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize()
      .then(() => {
        this.isInitialized = true;
        console.log("[ConnectionManager] Database initialized successfully");
      })
      .catch((error) => {
        this.initializationPromise = null;
        throw error;
      });

    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    console.log("[ConnectionManager] Initializing database...");

    // Create SQLite wrapper with OPFS support
    this.db = new SQLiteWrapper(this.config.useOPFS);

    // Initialize the database (loads WASM, opens OPFS DB, runs schema)
    await this.db!.initialize();

    console.log("[ConnectionManager] Database initialized with OPFS support");
  }

  /**
   * Get the database instance
   */
  private getDatabase(): Database {
    if (!this.db) {
      throw new Error("Database not initialized");
    }
    return this.db;
  }

  /**
   * Execute a query with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string = "operation",
  ): Promise<T> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < this.config.retryAttempts) {
      attempts++;

      try {
        // Set up operation timeout
        let timeoutId: number | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            reject(new Error(`${operationName} timeout exceeded (${this.config.queryTimeout}ms)`));
          }, this.config.queryTimeout);
        });

        // Race between operation and timeout
        const result = await Promise.race([operation(), timeoutPromise]);

        // Clear timeout if operation succeeded
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        // Clear timeout on error
        if (error && (error as Error & { timeoutId?: number }).timeoutId !== undefined) {
          window.clearTimeout((error as Error & { timeoutId: number }).timeoutId);
        }

        if (attempts >= this.config.retryAttempts) {
          throw lastError;
        }

        console.warn(
          `[ConnectionManager] ${operationName} failed (attempt ${attempts}/${this.config.retryAttempts}):`,
          error,
        );

        // Wait before retry with exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, attempts - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error(`Failed to execute ${operationName} after retries`);
  }

  /**
   * Execute a query and return results
   */
  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = this.getDatabase();
    return this.executeWithRetry(() => db.query<T>(sql, params), "query");
  }

  /**
   * Execute a statement (INSERT, UPDATE, DELETE)
   */
  async execute(
    sql: string,
    params?: unknown[],
  ): Promise<{ changes: number; lastInsertRowid: number }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = this.getDatabase();
    return this.executeWithRetry(() => db.execute(sql, params), "execute");
  }

  /**
   * Execute multiple operations in a transaction
   */
  async transaction<T>(callback: (db: Database) => Promise<T>): Promise<T> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = this.getDatabase();
    return this.executeWithRetry(() => db.transaction(callback), "transaction");
  }

  /**
   * Perform full-text search
   */
  async search(query: string, limit: number = 20, offset: number = 0): Promise<SearchResult[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = this.getDatabase();
    return this.executeWithRetry(() => db.search(query, limit, offset), "search");
  }

  /**
   * Save a document to the database
   */
  async saveDocument(doc: Document): Promise<number> {
    const sql = `
      INSERT INTO documents (url, title, site, word_count, hash, raw_text)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(hash) DO UPDATE SET
        title = excluded.title,
        site = excluded.site,
        word_count = excluded.word_count,
        raw_text = excluded.raw_text,
        saved_at = datetime('now')
    `;

    const result = await this.execute(sql, [
      doc.url,
      doc.title || null,
      doc.site || null,
      doc.word_count || null,
      doc.hash || null,
      doc.raw_text,
    ]);

    return result.lastInsertRowid;
  }

  /**
   * Get a document by ID
   */
  async getDocument(id: number): Promise<Document | null> {
    const [doc] = await this.query<Document>("SELECT * FROM documents WHERE id = ?", [id]);
    return doc || null;
  }

  /**
   * Get document history
   */
  async getHistory(limit: number = 50, offset: number = 0): Promise<Document[]> {
    return this.query<Document>(
      `SELECT * FROM documents 
       ORDER BY saved_at DESC 
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );
  }

  /**
   * Delete all data (for privacy)
   */
  async deleteAllData(): Promise<void> {
    await this.transaction(async (db) => {
      // Delete in correct order to respect foreign keys
      await db.execute("DELETE FROM ab_scores");
      await db.execute("DELETE FROM ab_runs");
      await db.execute("DELETE FROM summaries");
      await db.execute("DELETE FROM documents");

      // Vacuum to reclaim space
      await db.execute("VACUUM");
    });
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    documentCount: number;
    summaryCount: number;
    databaseSize: number;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const db = this.getDatabase();
    return db.getStats();
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    console.log("[ConnectionManager] Closing database connection...");

    if (this.db) {
      await this.db.close();
      this.db = null;
      this.isInitialized = false;
      this.initializationPromise = null;
    }

    console.log("[ConnectionManager] Database connection closed");
  }
}
