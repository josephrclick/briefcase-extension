/**
 * Offscreen document for handling SQLite database operations.
 * This runs in a persistent context separate from the service worker,
 * preventing database connections from being lost during service worker termination.
 */

import { ConnectionManager } from "./connectionManager";
import {
  DbSearchRequest,
  DbDeleteAllRequest,
  DbGetHistoryRequest,
  DbExportDocumentsRequest,
  DbCancelExportRequest,
  DbExportChunk,
  DbExportCompleteResponse,
  generateExportId,
} from "../types/database";
import { ProgressReporter } from "../types/streaming";
import { createExtendedError, DbErrorCode, errorLogger } from "../types/errors";

// Message types for communication with service worker and UI
export enum MessageType {
  // Database operations
  DB_INIT = "DB_INIT",
  DB_QUERY = "DB_QUERY",
  DB_EXECUTE = "DB_EXECUTE",
  DB_TRANSACTION = "DB_TRANSACTION",
  DB_CLOSE = "DB_CLOSE",
  DB_SEARCH = "DB_SEARCH",
  DB_DELETE_ALL_DATA = "DB_DELETE_ALL_DATA",
  DB_GET_HISTORY = "DB_GET_HISTORY",

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

  // Export operations
  DB_EXPORT_DOCUMENTS = "DB_EXPORT_DOCUMENTS",
  DB_EXPORT_PROGRESS = "DB_EXPORT_PROGRESS",
  DB_EXPORT_CHUNK = "DB_EXPORT_CHUNK",
  DB_CANCEL_EXPORT = "DB_CANCEL_EXPORT",
  DB_EXPORT_STARTED = "DB_EXPORT_STARTED",
  DB_EXPORT_COMPLETE = "DB_EXPORT_COMPLETE",
  DB_EXPORT_CANCELLED = "DB_EXPORT_CANCELLED",

  // Stream control
  STREAM_CONTROL = "STREAM_CONTROL",

  // Response types
  SUCCESS = "SUCCESS",
  ERROR = "ERROR",
  DB_ERROR = "DB_ERROR",
  DB_SEARCH_RESPONSE = "DB_SEARCH_RESPONSE",
  DB_GET_HISTORY_RESPONSE = "DB_GET_HISTORY_RESPONSE",
  DB_DELETE_ALL_RESPONSE = "DB_DELETE_ALL_RESPONSE",
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

        case MessageType.DB_SEARCH:
          return await this.handleDbSearch(message);

        case MessageType.DB_DELETE_ALL_DATA:
          return await this.handleDbDeleteAll(message);

        case MessageType.DB_GET_HISTORY:
          return await this.handleDbGetHistory(message);

        case MessageType.DB_EXPORT_DOCUMENTS:
          return await this.handleDbExport(message);

        case MessageType.DB_CANCEL_EXPORT:
          return await this.handleDbCancelExport(message);

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

  private async handleDbSearch(message: RequestMessage): Promise<ResponseMessage> {
    await this.ensureInitialized();

    const {
      query,
      limit = 20,
      offset = 0,
      sortBy = "relevance",
      sortOrder = "desc",
    } = message.payload as DbSearchRequest["payload"];

    // Build SQL query with FTS5
    let sql = `
      SELECT 
        d.id, d.url, d.title, d.site, d.saved_at, d.word_count,
        snippet(doc_fts, 0, '<mark>', '</mark>', '...', 30) as snippet,
        rank as score
      FROM doc_fts
      JOIN documents d ON d.id = doc_fts.rowid
      WHERE doc_fts MATCH ?
    `;

    // Add sorting
    switch (sortBy) {
      case "relevance":
        sql += " ORDER BY rank";
        break;
      case "date":
        sql += " ORDER BY d.saved_at";
        break;
      case "title":
        sql += " ORDER BY d.title";
        break;
    }

    sql += sortOrder === "asc" ? " ASC" : " DESC";
    sql += " LIMIT ? OFFSET ?";

    const result = await this.connectionManager.query(sql, [query, limit, offset]);

    // Get total count
    const countResult = await this.connectionManager.query(
      "SELECT COUNT(*) as total FROM doc_fts WHERE doc_fts MATCH ?",
      [query],
    );

    const total = (countResult.rows[0] as { total: number })?.total || 0;

    const response: ResponseMessage = {
      type: MessageType.DB_SEARCH_RESPONSE,
      id: message.id,
      timestamp: Date.now(),
      success: true,
      data: {
        results: result.rows as any[],
        meta: {
          total,
          returned: result.rows.length,
          offset,
          executionTime: Date.now() - message.timestamp,
          hasMore: offset + limit < total,
        },
      },
    };

    return response;
  }

  private async handleDbDeleteAll(message: RequestMessage): Promise<ResponseMessage> {
    await this.ensureInitialized();

    const { confirm } = (message.payload as DbDeleteAllRequest["payload"]) || {};

    if (!confirm) {
      throw createExtendedError(DbErrorCode.INVALID_REQUEST, "Deletion must be confirmed");
    }

    // Get counts before deletion
    const docCount = await this.connectionManager.query("SELECT COUNT(*) as count FROM documents");
    const sumCount = await this.connectionManager.query("SELECT COUNT(*) as count FROM summaries");
    const abRunCount = await this.connectionManager.query("SELECT COUNT(*) as count FROM ab_runs");
    const abScoreCount = await this.connectionManager.query(
      "SELECT COUNT(*) as count FROM ab_scores",
    );

    // Delete all data in transaction
    await this.connectionManager.transaction(async (conn) => {
      await conn.execute("DELETE FROM ab_scores");
      await conn.execute("DELETE FROM ab_runs");
      await conn.execute("DELETE FROM summaries");
      await conn.execute("DELETE FROM doc_fts");
      await conn.execute("DELETE FROM documents");
    });

    const counts = {
      documents: (docCount.rows[0] as { count: number }).count,
      summaries: (sumCount.rows[0] as { count: number }).count,
      abRuns: (abRunCount.rows[0] as { count: number }).count,
      abScores: (abScoreCount.rows[0] as { count: number }).count,
    };

    const response: ResponseMessage = {
      type: MessageType.DB_DELETE_ALL_RESPONSE,
      id: message.id,
      timestamp: Date.now(),
      success: true,
      data: {
        deletedCounts: {
          ...counts,
          total: counts.documents + counts.summaries + counts.abRuns + counts.abScores,
        },
        timestamp: new Date().toISOString(),
      },
    };

    return response;
  }

  private async handleDbGetHistory(message: RequestMessage): Promise<ResponseMessage> {
    await this.ensureInitialized();

    const payload = message.payload as DbGetHistoryRequest["payload"] | undefined;
    const limit = payload?.limit ?? 50;
    const offset = payload?.offset ?? 0;
    const dateRange = payload?.dateRange;
    const site = payload?.site;
    const hasComments = payload?.hasComments;

    let sql = `
      SELECT 
        d.id, d.url, d.title, d.site, d.saved_at, d.word_count,
        COUNT(DISTINCT s.id) as summary_count,
        MAX(s.created_at) as last_accessed
      FROM documents d
      LEFT JOIN summaries s ON s.document_id = d.id
      WHERE 1=1
    `;

    const params: unknown[] = [];

    // Add filters
    if (dateRange) {
      sql += " AND d.saved_at BETWEEN ? AND ?";
      params.push(dateRange.start, dateRange.end);
    }

    if (site) {
      sql += " AND d.site = ?";
      params.push(site);
    }

    if (hasComments !== undefined) {
      if (hasComments) {
        sql += " AND EXISTS (SELECT 1 FROM summaries WHERE document_id = d.id)";
      } else {
        sql += " AND NOT EXISTS (SELECT 1 FROM summaries WHERE document_id = d.id)";
      }
    }

    sql += " GROUP BY d.id ORDER BY d.saved_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const result = await this.connectionManager.query(sql, params);

    // Get total count
    let countSql = "SELECT COUNT(*) as total FROM documents WHERE 1=1";
    const countParams: unknown[] = [];

    if (dateRange) {
      countSql += " AND saved_at BETWEEN ? AND ?";
      countParams.push(dateRange.start, dateRange.end);
    }

    if (site) {
      countSql += " AND site = ?";
      countParams.push(site);
    }

    const countResult = await this.connectionManager.query(countSql, countParams);
    const total = (countResult.rows[0] as { total: number })?.total || 0;

    const response: ResponseMessage = {
      type: MessageType.DB_GET_HISTORY_RESPONSE,
      id: message.id,
      timestamp: Date.now(),
      success: true,
      data: {
        documents: result.rows.map((row: any) => ({
          ...row,
          hasSummary: row.summary_count > 0,
          summaryCount: row.summary_count,
        })),
        meta: {
          total,
          returned: result.rows.length,
          offset,
          hasMore: offset + limit < total,
        },
      },
    };

    return response;
  }

  private activeExports = new Map<string, AbortController>();

  private async handleDbExport(message: RequestMessage): Promise<ResponseMessage> {
    await this.ensureInitialized();

    const request = message.payload as DbExportDocumentsRequest["payload"];
    const exportId = request.exportId || generateExportId("export");
    const abortController = new AbortController();
    this.activeExports.set(exportId, abortController);

    // Send export started response
    const startResponse: ResponseMessage = {
      type: MessageType.DB_EXPORT_STARTED,
      id: message.id,
      timestamp: Date.now(),
      success: true,
      data: {
        exportId,
        estimatedDocuments: 0, // Will be calculated
        format: request.format,
        startTime: new Date().toISOString(),
      },
    };

    // Start export in background
    this.performExport(exportId, request, abortController.signal).catch((error) => {
      errorLogger.log(error);
      this.sendExportError(exportId, error);
    });

    return startResponse;
  }

  private async performExport(
    exportId: string,
    request: DbExportDocumentsRequest["payload"],
    signal: AbortSignal,
  ): Promise<void> {
    const startTime = Date.now();

    // Build query based on filters
    let sql = "SELECT * FROM documents WHERE 1=1";
    const params: unknown[] = [];

    if (request.filters?.dateRange) {
      sql += " AND saved_at BETWEEN ? AND ?";
      params.push(request.filters.dateRange.start, request.filters.dateRange.end);
    }

    if (request.filters?.sites?.length) {
      sql += ` AND site IN (${request.filters.sites.map(() => "?").join(", ")})`;
      params.push(...request.filters.sites);
    }

    if (request.filters?.searchQuery) {
      sql += " AND id IN (SELECT rowid FROM doc_fts WHERE doc_fts MATCH ?)";
      params.push(request.filters.searchQuery);
    }

    // Get total count
    const countResult = await this.connectionManager.query(
      sql.replace("SELECT *", "SELECT COUNT(*) as total"),
      params,
    );
    const totalDocuments = (countResult.rows[0] as { total: number })?.total || 0;

    // Create progress reporter
    const progressReporter = new ProgressReporter(
      totalDocuments,
      (progress) => {
        chrome.runtime.sendMessage(progress).catch(() => {
          // Ignore if service worker is not available
        });
      },
      exportId,
    );

    // Fetch documents in chunks
    const chunkSize = request.options?.chunkSize || 100;
    let processedCount = 0;
    let exportData: string = "";

    for (let offset = 0; offset < totalDocuments; offset += chunkSize) {
      if (signal.aborted) {
        throw createExtendedError(DbErrorCode.EXPORT_INTERRUPTED, "Export cancelled");
      }

      const chunkResult = await this.connectionManager.query(`${sql} LIMIT ? OFFSET ?`, [
        ...params,
        chunkSize,
        offset,
      ]);

      // Format data based on export format
      let chunkData = "";
      switch (request.format) {
        case "json":
          chunkData = JSON.stringify(chunkResult.rows, null, 2);
          break;
        case "csv":
          chunkData = this.convertToCSV(chunkResult.rows);
          break;
        case "markdown":
          chunkData = this.convertToMarkdown(chunkResult.rows);
          break;
      }

      // Send chunk
      const chunk: DbExportChunk = {
        type: MessageType.DB_EXPORT_CHUNK,
        id: generateExportId("chunk"),
        timestamp: Date.now(),
        success: true,
        payload: {
          exportId,
          sequenceNumber: Math.floor(offset / chunkSize),
          chunk: chunkData,
          encoding: "utf8",
          isFirst: offset === 0,
          isLast: offset + chunkSize >= totalDocuments,
          metadata:
            offset === 0
              ? {
                  totalChunks: Math.ceil(totalDocuments / chunkSize),
                  totalSize: 0, // Will be calculated
                  mimeType: this.getMimeType(request.format),
                }
              : undefined,
        },
      };

      chrome.runtime.sendMessage(chunk).catch(() => {
        // Ignore if service worker is not available
      });

      processedCount += chunkResult.rows.length;
      progressReporter.update(processedCount, "exporting");
      exportData += chunkData;
    }

    // Send completion
    const completeResponse: DbExportCompleteResponse = {
      type: MessageType.DB_EXPORT_COMPLETE,
      id: generateExportId("complete"),
      timestamp: Date.now(),
      success: true,
      data: {
        exportId,
        totalDocuments,
        totalSize: exportData.length,
        duration: Date.now() - startTime,
        format: request.format,
        chunks: Math.ceil(totalDocuments / chunkSize),
      },
    };

    chrome.runtime.sendMessage(completeResponse).catch(() => {
      // Ignore if service worker is not available
    });

    progressReporter.complete();
    this.activeExports.delete(exportId);
  }

  private async handleDbCancelExport(message: RequestMessage): Promise<ResponseMessage> {
    const { exportId } = message.payload as DbCancelExportRequest["payload"];

    const controller = this.activeExports.get(exportId);
    if (controller) {
      controller.abort();
      this.activeExports.delete(exportId);
    }

    const response: ResponseMessage = {
      type: MessageType.DB_EXPORT_CANCELLED,
      id: message.id,
      timestamp: Date.now(),
      success: true,
      data: {
        exportId,
        documentsProcessed: 0, // Would need to track this
        partialDataAvailable: false,
      },
    };

    return response;
  }

  private convertToCSV(rows: unknown[]): string {
    if (!rows.length) return "";

    const headers = Object.keys(rows[0] as Record<string, unknown>);
    const csvRows = [headers.join(",")];

    for (const row of rows) {
      const values = headers.map((h) => {
        const value = (row as Record<string, unknown>)[h];
        return typeof value === "string" ? `"${value.replace(/"/g, '""')}"` : String(value);
      });
      csvRows.push(values.join(","));
    }

    return csvRows.join("\n");
  }

  private convertToMarkdown(rows: unknown[]): string {
    if (!rows.length) return "";

    const headers = Object.keys(rows[0] as Record<string, unknown>);
    let md = "| " + headers.join(" | ") + " |\n";
    md += "| " + headers.map(() => "---").join(" | ") + " |\n";

    for (const row of rows) {
      const values = headers.map((h) => String((row as Record<string, unknown>)[h] || ""));
      md += "| " + values.join(" | ") + " |\n";
    }

    return md;
  }

  private getMimeType(format: string): string {
    switch (format) {
      case "json":
        return "application/json";
      case "csv":
        return "text/csv";
      case "markdown":
        return "text/markdown";
      default:
        return "text/plain";
    }
  }

  private sendExportError(exportId: string, error: unknown): void {
    const errorResponse = {
      type: MessageType.DB_ERROR,
      id: generateExportId("error"),
      timestamp: Date.now(),
      success: false,
      error: {
        code: DbErrorCode.EXPORT_INTERRUPTED,
        message: error instanceof Error ? error.message : String(error),
        context: { exportId },
      },
    };

    chrome.runtime.sendMessage(errorResponse).catch(() => {
      // Ignore if service worker is not available
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
// Only initialize when running in actual Chrome extension context
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  new OffscreenDocument();
}
