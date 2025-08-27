/**
 * Offscreen document for handling SQLite database operations.
 * This runs in a persistent context separate from the service worker,
 * preventing database connections from being lost during service worker termination.
 */

import { ConnectionManager } from "./connectionManager";

// Message types for communication with service worker and UI
export enum MessageType {
  // Database operations
  DB_INIT = "DB_INIT",
  DB_QUERY = "DB_QUERY",
  DB_EXECUTE = "DB_EXECUTE",
  DB_TRANSACTION = "DB_TRANSACTION",
  DB_CLOSE = "DB_CLOSE",

  // Document operations
  DOC_INSERT = "DOC_INSERT",
  DOC_UPDATE = "DOC_UPDATE",
  DOC_DELETE = "DOC_DELETE",
  DOC_SEARCH = "DOC_SEARCH",
  DOC_GET = "DOC_GET",

  // Summary operations
  SUMMARY_INSERT = "SUMMARY_INSERT",
  SUMMARY_GET = "SUMMARY_GET",
  SUMMARY_LIST = "SUMMARY_LIST",

  // A/B test operations
  AB_RUN_INSERT = "AB_RUN_INSERT",
  AB_SCORE_INSERT = "AB_SCORE_INSERT",
  AB_GET_RESULTS = "AB_GET_RESULTS",

  // Response types
  SUCCESS = "SUCCESS",
  ERROR = "ERROR",
  HEARTBEAT = "HEARTBEAT",
}

interface BaseMessage {
  type: MessageType;
  id: string; // Request ID for correlation
  timestamp: number;
}

interface RequestMessage extends BaseMessage {
  payload?: unknown;
}

interface ResponseMessage extends BaseMessage {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
}

class OffscreenDocument {
  private connectionManager: ConnectionManager;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.connectionManager = new ConnectionManager();
    this.setupMessageListeners();
    this.startHeartbeat();

    console.log("[Offscreen] Document initialized");
  }

  private setupMessageListeners(): void {
    chrome.runtime.onMessage.addListener((message: RequestMessage, _sender, sendResponse) => {
      // Handle messages asynchronously
      this.handleMessage(message)
        .then((response) => sendResponse(response))
        .catch((error) => {
          console.error("[Offscreen] Error handling message:", error);
          sendResponse(this.createErrorResponse(message, error));
        });

      // Return true to indicate async response
      return true;
    });
  }

  private async handleMessage(message: RequestMessage): Promise<ResponseMessage> {
    console.log(`[Offscreen] Received message: ${message.type}`, message);

    try {
      switch (message.type) {
        case MessageType.DB_INIT:
          await this.initializeDatabase();
          return this.createSuccessResponse(message, { initialized: true });

        case MessageType.DB_QUERY:
          return await this.handleQuery(message);

        case MessageType.DB_EXECUTE:
          return await this.handleExecute(message);

        case MessageType.DB_TRANSACTION:
          return await this.handleTransaction(message);

        case MessageType.DOC_INSERT:
          return await this.handleDocumentInsert(message);

        case MessageType.DOC_GET:
          return await this.handleDocumentGet(message);

        case MessageType.DOC_SEARCH:
          return await this.handleDocumentSearch(message);

        case MessageType.SUMMARY_INSERT:
          return await this.handleSummaryInsert(message);

        case MessageType.SUMMARY_GET:
          return await this.handleSummaryGet(message);

        case MessageType.AB_RUN_INSERT:
          return await this.handleAbRunInsert(message);

        case MessageType.AB_SCORE_INSERT:
          return await this.handleAbScoreInsert(message);

        case MessageType.HEARTBEAT:
          return this.createSuccessResponse(message, {
            alive: true,
            initialized: this.isInitialized,
          });

        default:
          throw new Error(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error(`[Offscreen] Error handling ${message.type}:`, error);
      return this.createErrorResponse(message, error);
    }
  }

  private async initializeDatabase(): Promise<void> {
    if (this.isInitialized) {
      console.log("[Offscreen] Database already initialized");
      return;
    }

    if (this.initPromise) {
      console.log("[Offscreen] Database initialization in progress, waiting...");
      return this.initPromise;
    }

    console.log("[Offscreen] Initializing database...");

    this.initPromise = this.connectionManager
      .initialize()
      .then(() => {
        this.isInitialized = true;
        console.log("[Offscreen] Database initialized successfully");
      })
      .catch((error) => {
        console.error("[Offscreen] Database initialization failed:", error);
        this.initPromise = null;
        throw error;
      });

    return this.initPromise;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initializeDatabase();
    }
  }

  private async handleQuery(message: RequestMessage): Promise<ResponseMessage> {
    await this.ensureInitialized();

    const { sql, params } = message.payload as { sql: string; params?: unknown[] };
    const result = await this.connectionManager.query(sql, params);

    return this.createSuccessResponse(message, result);
  }

  private async handleExecute(message: RequestMessage): Promise<ResponseMessage> {
    await this.ensureInitialized();

    const { sql, params } = message.payload as { sql: string; params?: unknown[] };
    const result = await this.connectionManager.execute(sql, params);

    return this.createSuccessResponse(message, result);
  }

  private async handleTransaction(message: RequestMessage): Promise<ResponseMessage> {
    await this.ensureInitialized();

    const { operations } = message.payload as {
      operations: Array<{ sql: string; params?: unknown[] }>;
    };

    const result = await this.connectionManager.transaction(async (conn) => {
      const results = [];
      for (const op of operations) {
        const res = await conn.execute(op.sql, op.params);
        results.push(res);
      }
      return results;
    });

    return this.createSuccessResponse(message, result);
  }

  private async handleDocumentInsert(message: RequestMessage): Promise<ResponseMessage> {
    await this.ensureInitialized();

    const document = message.payload as {
      url: string;
      title: string;
      site: string;
      wordCount: number;
      hash: string;
      rawText: string;
    };

    const sql = `
      INSERT INTO documents (url, title, site, saved_at, word_count, hash, raw_text)
      VALUES (?, ?, ?, datetime('now'), ?, ?, ?)
    `;

    const result = await this.connectionManager.execute(sql, [
      document.url,
      document.title,
      document.site,
      document.wordCount,
      document.hash,
      document.rawText,
    ]);

    // Also insert into FTS table
    if (result.lastInsertRowid) {
      await this.connectionManager.execute(
        `INSERT INTO doc_fts (rowid, content, title, url) VALUES (?, ?, ?, ?)`,
        [result.lastInsertRowid, document.rawText, document.title, document.url],
      );
    }

    return this.createSuccessResponse(message, {
      id: result.lastInsertRowid,
      changes: result.changes,
    });
  }

  private async handleDocumentGet(message: RequestMessage): Promise<ResponseMessage> {
    await this.ensureInitialized();

    const { id, url, hash } = message.payload as {
      id?: number;
      url?: string;
      hash?: string;
    };

    let sql = "SELECT * FROM documents WHERE ";
    let params: unknown[] = [];

    if (id) {
      sql += "id = ?";
      params = [id];
    } else if (url) {
      sql += "url = ?";
      params = [url];
    } else if (hash) {
      sql += "hash = ?";
      params = [hash];
    } else {
      throw new Error("Must provide id, url, or hash to get document");
    }

    const result = await this.connectionManager.query(sql, params);

    return this.createSuccessResponse(message, result.rows[0] || null);
  }

  private async handleDocumentSearch(message: RequestMessage): Promise<ResponseMessage> {
    await this.ensureInitialized();

    const {
      query,
      limit = 20,
      offset = 0,
    } = message.payload as {
      query: string;
      limit?: number;
      offset?: number;
    };

    const sql = `
      SELECT 
        d.id, d.url, d.title, d.site, d.saved_at, d.word_count,
        snippet(doc_fts, 0, '<mark>', '</mark>', '...', 30) as snippet
      FROM doc_fts
      JOIN documents d ON d.id = doc_fts.rowid
      WHERE doc_fts MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `;

    const result = await this.connectionManager.query(sql, [query, limit, offset]);

    return this.createSuccessResponse(message, {
      results: result.rows,
      count: result.rows.length,
    });
  }

  private async handleSummaryInsert(message: RequestMessage): Promise<ResponseMessage> {
    await this.ensureInitialized();

    const summary = message.payload as {
      documentId: number;
      model: string;
      paramsJson: string;
      savedPath: string;
      savedFormat: string;
    };

    const sql = `
      INSERT INTO summaries (document_id, model, params_json, saved_path, saved_format, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `;

    const result = await this.connectionManager.execute(sql, [
      summary.documentId,
      summary.model,
      summary.paramsJson,
      summary.savedPath,
      summary.savedFormat,
    ]);

    return this.createSuccessResponse(message, {
      id: result.lastInsertRowid,
      changes: result.changes,
    });
  }

  private async handleSummaryGet(message: RequestMessage): Promise<ResponseMessage> {
    await this.ensureInitialized();

    const { documentId, id } = message.payload as {
      documentId?: number;
      id?: number;
    };

    let sql = "SELECT * FROM summaries WHERE ";
    let params: unknown[] = [];

    if (id) {
      sql += "id = ?";
      params = [id];
    } else if (documentId) {
      sql += "document_id = ? ORDER BY created_at DESC";
      params = [documentId];
    } else {
      throw new Error("Must provide id or documentId to get summary");
    }

    const result = await this.connectionManager.query(sql, params);

    return this.createSuccessResponse(message, id ? result.rows[0] || null : result.rows);
  }

  private async handleAbRunInsert(message: RequestMessage): Promise<ResponseMessage> {
    await this.ensureInitialized();

    const abRun = message.payload as {
      documentId: number;
      modelA: string;
      modelB: string;
      promptTemplate: string;
    };

    const sql = `
      INSERT INTO ab_runs (document_id, model_a, model_b, prompt_template, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `;

    const result = await this.connectionManager.execute(sql, [
      abRun.documentId,
      abRun.modelA,
      abRun.modelB,
      abRun.promptTemplate,
    ]);

    return this.createSuccessResponse(message, {
      id: result.lastInsertRowid,
      changes: result.changes,
    });
  }

  private async handleAbScoreInsert(message: RequestMessage): Promise<ResponseMessage> {
    await this.ensureInitialized();

    const score = message.payload as {
      runId: number;
      coverage: number;
      readability: number;
      faithfulness: number;
      note: string;
      rater: string;
    };

    const sql = `
      INSERT INTO ab_scores (run_id, coverage, readability, faithfulness, note, rater, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `;

    const result = await this.connectionManager.execute(sql, [
      score.runId,
      score.coverage,
      score.readability,
      score.faithfulness,
      score.note,
      score.rater,
    ]);

    return this.createSuccessResponse(message, {
      id: result.lastInsertRowid,
      changes: result.changes,
    });
  }

  private createSuccessResponse(request: RequestMessage, data?: unknown): ResponseMessage {
    return {
      type: MessageType.SUCCESS,
      id: request.id,
      timestamp: Date.now(),
      success: true,
      data,
    };
  }

  private createErrorResponse(request: RequestMessage, error: unknown): ResponseMessage {
    const errorDetails =
      error instanceof Error
        ? { code: "ERROR", message: error.message, details: error.stack }
        : { code: "UNKNOWN_ERROR", message: String(error) };

    return {
      type: MessageType.ERROR,
      id: request.id,
      timestamp: Date.now(),
      success: false,
      error: errorDetails,
    };
  }

  private startHeartbeat(): void {
    // Send periodic heartbeat to service worker to maintain connection
    setInterval(() => {
      chrome.runtime
        .sendMessage({
          type: MessageType.HEARTBEAT,
          id: `heartbeat-${Date.now()}`,
          timestamp: Date.now(),
          data: {
            alive: true,
            initialized: this.isInitialized,
          },
        })
        .catch((error) => {
          // Service worker might be inactive, this is expected
          console.debug("[Offscreen] Heartbeat failed (service worker inactive):", error.message);
        });
    }, 30000); // Every 30 seconds
  }
}

// Initialize the offscreen document
new OffscreenDocument();
