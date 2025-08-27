/**
 * Connection manager for SQLite WASM database.
 * Handles connection pooling, initialization, and query execution.
 */

// SQLite WASM types (will be provided by @briefcase/db package)
interface SQLiteConnection {
  exec(sql: string, params?: unknown[]): SQLiteResult;
  close(): void;
}

interface SQLiteResult {
  rows: unknown[];
  changes: number;
  lastInsertRowid?: number;
}

interface DatabaseConfig {
  maxConnections: number;
  connectionTimeout: number;
  idleTimeout: number;
  retryAttempts: number;
  retryDelay: number;
}

interface PooledConnection {
  connection: SQLiteConnection;
  inUse: boolean;
  lastUsed: number;
  id: string;
}

export class ConnectionManager {
  private config: DatabaseConfig = {
    maxConnections: 5,
    connectionTimeout: 10000, // 10 seconds
    idleTimeout: 300000, // 5 minutes
    retryAttempts: 3,
    retryDelay: 1000, // 1 second
  };

  private pool: PooledConnection[] = [];
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  // TODO: Use dbPath when implementing actual SQLite connection
  // private dbPath = "/briefcase.db";

  constructor(config?: Partial<DatabaseConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Start idle connection cleanup
    this.startIdleCleanup();
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

    // TODO: Import and initialize SQLite WASM from @briefcase/db
    // For now, we'll create a mock implementation
    // In the real implementation, this would:
    // 1. Load SQLite WASM
    // 2. Create database file in OPFS
    // 3. Run migrations to create tables

    await this.createTables();

    // Pre-create minimum connections
    await this.createConnection();
  }

  /**
   * Create database tables if they don't exist
   */
  private async createTables(): Promise<void> {
    const schemaSql = `
      -- Documents table
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        site TEXT,
        saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        word_count INTEGER,
        hash TEXT UNIQUE,
        raw_text TEXT,
        UNIQUE(url, hash)
      );
      
      -- Summaries table
      CREATE TABLE IF NOT EXISTS summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        model TEXT NOT NULL,
        params_json TEXT,
        saved_path TEXT,
        saved_format TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
      
      -- A/B test runs table
      CREATE TABLE IF NOT EXISTS ab_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        model_a TEXT NOT NULL,
        model_b TEXT NOT NULL,
        prompt_template TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
      
      -- A/B test scores table
      CREATE TABLE IF NOT EXISTS ab_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL,
        coverage INTEGER CHECK(coverage IN (0, 1)),
        readability INTEGER CHECK(readability IN (0, 1)),
        faithfulness INTEGER CHECK(faithfulness IN (0, 1)),
        note TEXT,
        rater TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (run_id) REFERENCES ab_runs(id) ON DELETE CASCADE
      );
      
      -- Full-text search virtual table
      CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
        content,
        title,
        url,
        content='documents',
        content_rowid='id'
      );
      
      -- Triggers to keep FTS index in sync
      CREATE TRIGGER IF NOT EXISTS documents_ai 
      AFTER INSERT ON documents 
      BEGIN
        INSERT INTO doc_fts (rowid, content, title, url)
        VALUES (new.id, new.raw_text, new.title, new.url);
      END;
      
      CREATE TRIGGER IF NOT EXISTS documents_ad 
      AFTER DELETE ON documents 
      BEGIN
        DELETE FROM doc_fts WHERE rowid = old.id;
      END;
      
      CREATE TRIGGER IF NOT EXISTS documents_au 
      AFTER UPDATE ON documents 
      BEGIN
        UPDATE doc_fts 
        SET content = new.raw_text, title = new.title, url = new.url
        WHERE rowid = new.id;
      END;
      
      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_documents_url ON documents(url);
      CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(hash);
      CREATE INDEX IF NOT EXISTS idx_summaries_document_id ON summaries(document_id);
      CREATE INDEX IF NOT EXISTS idx_ab_runs_document_id ON ab_runs(document_id);
      CREATE INDEX IF NOT EXISTS idx_ab_scores_run_id ON ab_scores(run_id);
    `;

    // Execute schema creation
    const conn = await this.getConnection();
    try {
      await this.executeWithConnection(conn, schemaSql);
    } finally {
      this.releaseConnection(conn);
    }
  }

  /**
   * Get a connection from the pool
   */
  private async getConnection(): Promise<PooledConnection> {
    // Try to find an available connection
    const available = this.pool.find((c) => !c.inUse);

    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      return available;
    }

    // Create new connection if pool not full
    if (this.pool.length < this.config.maxConnections) {
      return await this.createConnection();
    }

    // Wait for a connection to become available
    return await this.waitForConnection();
  }

  /**
   * Create a new database connection
   */
  private async createConnection(): Promise<PooledConnection> {
    console.log(`[ConnectionManager] Creating new connection (pool size: ${this.pool.length})`);

    // TODO: Actually create SQLite connection
    // For now, mock implementation
    const mockConnection: SQLiteConnection = {
      exec: (sql: string, _params?: unknown[]) => {
        // Mock implementation
        console.log("[MockConnection] Executing:", sql.substring(0, 50) + "...");
        return {
          rows: [],
          changes: 0,
          lastInsertRowid: Date.now(),
        };
      },
      close: () => {
        console.log("[MockConnection] Closing connection");
      },
    };

    const pooledConnection: PooledConnection = {
      connection: mockConnection,
      inUse: true,
      lastUsed: Date.now(),
      id: `conn-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    };

    this.pool.push(pooledConnection);
    return pooledConnection;
  }

  /**
   * Wait for a connection to become available
   */
  private async waitForConnection(): Promise<PooledConnection> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const available = this.pool.find((c) => !c.inUse);

        if (available) {
          clearInterval(checkInterval);
          available.inUse = true;
          available.lastUsed = Date.now();
          resolve(available);
        } else if (Date.now() - startTime > this.config.connectionTimeout) {
          clearInterval(checkInterval);
          reject(new Error("Connection timeout - no connections available"));
        }
      }, 100);
    });
  }

  /**
   * Release a connection back to the pool
   */
  private releaseConnection(pooledConnection: PooledConnection): void {
    const conn = this.pool.find((c) => c.id === pooledConnection.id);
    if (conn) {
      conn.inUse = false;
      conn.lastUsed = Date.now();
    }
  }

  /**
   * Execute a query with a connection
   */
  private async executeWithConnection(
    pooledConnection: PooledConnection,
    sql: string,
    params?: unknown[],
  ): Promise<SQLiteResult> {
    let attempts = 0;

    while (attempts < this.config.retryAttempts) {
      try {
        return pooledConnection.connection.exec(sql, params);
      } catch (error) {
        attempts++;

        if (attempts >= this.config.retryAttempts) {
          throw error;
        }

        console.warn(
          `[ConnectionManager] Query failed (attempt ${attempts}/${this.config.retryAttempts}):`,
          error,
        );

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay));
      }
    }

    throw new Error("Failed to execute query after retries");
  }

  /**
   * Execute a query and return results
   */
  async query(sql: string, params?: unknown[]): Promise<SQLiteResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const conn = await this.getConnection();

    try {
      return await this.executeWithConnection(conn, sql, params);
    } finally {
      this.releaseConnection(conn);
    }
  }

  /**
   * Execute a statement (INSERT, UPDATE, DELETE)
   */
  async execute(sql: string, params?: unknown[]): Promise<SQLiteResult> {
    return this.query(sql, params);
  }

  /**
   * Execute multiple operations in a transaction
   */
  async transaction<T>(
    callback: (conn: {
      execute: (sql: string, params?: unknown[]) => Promise<SQLiteResult>;
    }) => Promise<T>,
  ): Promise<T> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const conn = await this.getConnection();

    try {
      // Begin transaction
      await this.executeWithConnection(conn, "BEGIN TRANSACTION");

      // Create transaction wrapper
      const transactionConn = {
        execute: (sql: string, params?: unknown[]) => this.executeWithConnection(conn, sql, params),
      };

      // Execute callback
      const result = await callback(transactionConn);

      // Commit transaction
      await this.executeWithConnection(conn, "COMMIT");

      return result;
    } catch (error) {
      // Rollback on error
      try {
        await this.executeWithConnection(conn, "ROLLBACK");
      } catch (rollbackError) {
        console.error("[ConnectionManager] Rollback failed:", rollbackError);
      }
      throw error;
    } finally {
      this.releaseConnection(conn);
    }
  }

  /**
   * Clean up idle connections
   */
  private startIdleCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const idleConnections = this.pool.filter(
        (c) => !c.inUse && now - c.lastUsed > this.config.idleTimeout,
      );

      for (const conn of idleConnections) {
        console.log(`[ConnectionManager] Closing idle connection: ${conn.id}`);

        try {
          conn.connection.close();
        } catch (error) {
          console.error("[ConnectionManager] Error closing connection:", error);
        }

        const index = this.pool.indexOf(conn);
        if (index > -1) {
          this.pool.splice(index, 1);
        }
      }

      if (idleConnections.length > 0) {
        console.log(
          `[ConnectionManager] Cleaned up ${idleConnections.length} idle connections. Pool size: ${this.pool.length}`,
        );
      }
    }, 60000); // Check every minute
  }

  /**
   * Close all connections and clean up
   */
  async close(): Promise<void> {
    console.log("[ConnectionManager] Closing all connections...");

    // Wait for all connections to be released
    const maxWait = 5000; // 5 seconds
    const startTime = Date.now();

    while (this.pool.some((c) => c.inUse) && Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Close all connections
    for (const conn of this.pool) {
      try {
        conn.connection.close();
      } catch (error) {
        console.error(`[ConnectionManager] Error closing connection ${conn.id}:`, error);
      }
    }

    this.pool = [];
    this.isInitialized = false;

    console.log("[ConnectionManager] All connections closed");
  }
}
