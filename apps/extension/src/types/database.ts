/**
 * Database message protocol interfaces for communication between
 * UI, service worker, and offscreen document.
 *
 * This protocol supports:
 * - Core database operations (search, delete, history)
 * - Streaming exports with progress tracking
 * - Cancellation mechanisms
 * - Comprehensive error handling
 */

import { RequestMessage, ResponseMessage } from "./messages";

/**
 * Export format options for database exports
 */
export type ExportFormat = "json" | "csv" | "markdown";

/**
 * Database error codes with specific meanings
 */
export enum DbErrorCode {
  OPFS_UNAVAILABLE = "OPFS_UNAVAILABLE",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  CONNECTION_LOST = "CONNECTION_LOST",
  EXPORT_INTERRUPTED = "EXPORT_INTERRUPTED",
  INVALID_REQUEST = "INVALID_REQUEST",
  TRANSACTION_FAILED = "TRANSACTION_FAILED",
  TIMEOUT = "TIMEOUT",
  PERMISSION_DENIED = "PERMISSION_DENIED",
}

// ============================================
// Core Database Operations
// ============================================

/**
 * Search database for documents matching query
 */
export interface DbSearchRequest extends RequestMessage {
  type: "DB_SEARCH";
  payload: {
    query: string;
    limit?: number;
    offset?: number;
    sortBy?: "relevance" | "date" | "title";
    sortOrder?: "asc" | "desc";
  };
}

/**
 * Delete all data from the database
 */
export interface DbDeleteAllRequest extends RequestMessage {
  type: "DB_DELETE_ALL_DATA";
  payload?: {
    confirm: boolean; // Safety flag to prevent accidental deletion
  };
}

/**
 * Get document history with pagination
 */
export interface DbGetHistoryRequest extends RequestMessage {
  type: "DB_GET_HISTORY";
  payload?: {
    limit?: number;
    offset?: number;
    dateRange?: {
      start: Date | string;
      end: Date | string;
    };
    site?: string; // Filter by website
    hasComments?: boolean; // Only documents with comments
  };
}

// ============================================
// Export Operations
// ============================================

/**
 * Request to export documents from database
 */
export interface DbExportDocumentsRequest extends RequestMessage {
  type: "DB_EXPORT_DOCUMENTS";
  payload: {
    format: ExportFormat;
    filters?: {
      dateRange?: {
        start: Date | string;
        end: Date | string;
      };
      tags?: string[];
      sites?: string[];
      contentType?: string;
      searchQuery?: string; // Export results of a search
    };
    options?: {
      chunkSize?: number; // Number of documents per chunk (default: 100)
      compress?: boolean; // Compress output (for JSON)
      includeMetadata?: boolean; // Include export metadata
      includeRawText?: boolean; // Include raw text in export
      includeSummaries?: boolean; // Include associated summaries
    };
    exportId?: string; // Client-provided ID for tracking
  };
}

/**
 * Progress update for ongoing export operation
 */
export interface DbExportProgress extends ResponseMessage {
  type: "DB_EXPORT_PROGRESS";
  payload: {
    exportId: string;
    phase: "counting" | "exporting" | "formatting" | "compressing" | "complete";
    total: number; // Total number of documents
    processed: number; // Number processed so far
    percentage: number; // 0-100
    estimatedTimeRemaining: number; // Milliseconds
    currentDocument?: {
      title: string;
      url: string;
    };
    bytesWritten?: number; // Size of data exported so far
  };
}

/**
 * Chunk of export data for streaming large exports
 */
export interface DbExportChunk extends ResponseMessage {
  type: "DB_EXPORT_CHUNK";
  payload: {
    exportId: string;
    sequenceNumber: number; // Order of this chunk
    chunk: string; // Base64 encoded if binary, otherwise string
    encoding: "utf8" | "base64";
    isFirst: boolean; // First chunk includes headers
    isLast: boolean; // Last chunk completes export
    checksum?: string; // Optional checksum for verification
    metadata?: {
      totalChunks: number;
      totalSize: number;
      mimeType: string;
    };
  };
}

/**
 * Request to cancel an ongoing export
 */
export interface DbCancelExportRequest extends RequestMessage {
  type: "DB_CANCEL_EXPORT";
  payload: {
    exportId: string;
    reason?: string; // Optional reason for cancellation
  };
}

/**
 * Confirmation that export was cancelled
 */
export interface DbExportCancelledResponse extends ResponseMessage {
  type: "DB_EXPORT_CANCELLED";
  payload: {
    exportId: string;
    documentsProcessed: number;
    partialDataAvailable: boolean; // Whether partial export can be used
  };
}

// ============================================
// Error Handling
// ============================================

/**
 * Database error with recovery information
 */
export interface DbError extends ResponseMessage {
  type: "DB_ERROR";
  success: false;
  error: {
    code: DbErrorCode;
    message: string;
    details?: string;
    recoverable: boolean;
    suggestion?: string; // User-friendly recovery suggestion
    retryAfter?: number; // Milliseconds to wait before retry
    context?: {
      operation?: string; // Which operation failed
      documentId?: number;
      exportId?: string;
      query?: string;
    };
  };
}

// ============================================
// Response Types
// ============================================

/**
 * Search response with results and metadata
 */
export interface DbSearchResponse extends ResponseMessage {
  type: "DB_SEARCH_RESPONSE";
  success: true;
  data: {
    results: Array<{
      id: number;
      url: string;
      title: string;
      site: string;
      savedAt: string;
      wordCount: number;
      snippet: string; // Search result snippet with highlights
      score?: number; // Relevance score
    }>;
    meta: {
      total: number; // Total matching documents
      returned: number; // Number in this response
      offset: number;
      executionTime: number; // Query time in ms
      hasMore: boolean;
    };
  };
}

/**
 * History response with documents
 */
export interface DbGetHistoryResponse extends ResponseMessage {
  type: "DB_GET_HISTORY_RESPONSE";
  success: true;
  data: {
    documents: Array<{
      id: number;
      url: string;
      title: string;
      site: string;
      savedAt: string;
      wordCount: number;
      hasSummary: boolean;
      summaryCount?: number;
      lastAccessed?: string;
      tags?: string[];
    }>;
    meta: {
      total: number;
      returned: number;
      offset: number;
      hasMore: boolean;
    };
  };
}

/**
 * Delete all data response
 */
export interface DbDeleteAllResponse extends ResponseMessage {
  type: "DB_DELETE_ALL_RESPONSE";
  success: true;
  data: {
    deletedCounts: {
      documents: number;
      summaries: number;
      abRuns: number;
      abScores: number;
      total: number;
    };
    freedSpace?: number; // Bytes freed
    timestamp: string;
  };
}

/**
 * Export start confirmation
 */
export interface DbExportStartedResponse extends ResponseMessage {
  type: "DB_EXPORT_STARTED";
  success: true;
  data: {
    exportId: string;
    estimatedDocuments: number;
    estimatedSize?: number; // Estimated export size in bytes
    format: ExportFormat;
    startTime: string;
  };
}

/**
 * Export completion notification
 */
export interface DbExportCompleteResponse extends ResponseMessage {
  type: "DB_EXPORT_COMPLETE";
  success: true;
  data: {
    exportId: string;
    totalDocuments: number;
    totalSize: number; // Final size in bytes
    duration: number; // Total time in ms
    format: ExportFormat;
    checksum?: string; // For verification
    chunks?: number; // Number of chunks sent
  };
}

// ============================================
// Stream Management Types
// ============================================

/**
 * Stream state for tracking ongoing streams
 */
export interface StreamState {
  id: string;
  type: "export" | "import" | "backup";
  status: "active" | "paused" | "cancelled" | "complete" | "error";
  startTime: number;
  lastActivity: number;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Stream control message for pause/resume
 */
export interface StreamControlRequest extends RequestMessage {
  type: "STREAM_CONTROL";
  payload: {
    streamId: string;
    action: "pause" | "resume" | "cancel";
  };
}

// ============================================
// Type Guards
// ============================================

/**
 * Check if a message is a database error
 */
export function isDbError(message: ResponseMessage): message is DbError {
  return message.type === "DB_ERROR" && !message.success;
}

/**
 * Check if a message is an export progress update
 */
export function isExportProgress(message: ResponseMessage): message is DbExportProgress {
  return message.type === "DB_EXPORT_PROGRESS";
}

/**
 * Check if a message is an export chunk
 */
export function isExportChunk(message: ResponseMessage): message is DbExportChunk {
  return message.type === "DB_EXPORT_CHUNK";
}

// ============================================
// Helper Functions
// ============================================

/**
 * Create a standardized export ID
 */
export function generateExportId(prefix = "export"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Calculate estimated time remaining for an operation
 */
export function calculateETA(processed: number, total: number, elapsedMs: number): number {
  if (processed === 0) return 0;
  const rate = processed / elapsedMs;
  const remaining = total - processed;
  return Math.round(remaining / rate);
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}
