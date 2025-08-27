/**
 * Shared message types and interfaces for communication between
 * service worker, offscreen document, content scripts, and UI.
 */

// Re-export MessageType from offscreen module
export { MessageType } from "../offscreen/offscreen";
import { StreamManager, StreamReader, ProgressReporter } from "./streaming";
import { DbExportChunk, DbExportProgress, DbExportCompleteResponse, StreamState } from "./database";

/**
 * Message sources to identify where messages originate
 */
export enum MessageSource {
  SERVICE_WORKER = "SERVICE_WORKER",
  OFFSCREEN_DOCUMENT = "OFFSCREEN_DOCUMENT",
  CONTENT_SCRIPT = "CONTENT_SCRIPT",
  SIDE_PANEL = "SIDE_PANEL",
  POPUP = "POPUP",
}

/**
 * Base message interface
 */
export interface BaseMessage {
  type: string;
  id?: string;
  source?: MessageSource;
  timestamp?: number;
}

/**
 * Request message with payload
 */
export interface RequestMessage<T = unknown> extends BaseMessage {
  payload?: T;
}

/**
 * Response message with success/error status
 */
export interface ResponseMessage<T = unknown> extends BaseMessage {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
}

/**
 * Document data structure
 */
export interface DocumentData {
  url: string;
  title: string;
  site: string;
  wordCount: number;
  hash: string;
  rawText: string;
  sections?: Array<{
    type: string;
    content: string;
    level?: number;
  }>;
  extractionMetrics?: {
    timeMs: number;
    truncated: boolean;
    charCount: number;
  };
}

/**
 * Summary parameters
 */
export interface SummaryParams {
  length: "brief" | "medium" | "verbose";
  level: "kinder" | "high_school" | "college" | "phd";
  style: "plain" | "bullets" | "executive";
  focus?: string;
}

/**
 * Summary data structure
 */
export interface SummaryData {
  documentId: number;
  model: string;
  params: SummaryParams;
  content: string;
  savedPath?: string;
  savedFormat?: "md" | "txt" | "json";
}

/**
 * A/B test run data
 */
export interface AbRunData {
  documentId: number;
  modelA: string;
  modelB: string;
  promptTemplate: string;
  resultA?: string;
  resultB?: string;
}

/**
 * A/B test score data
 */
export interface AbScoreData {
  runId: number;
  coverage: boolean;
  readability: boolean;
  faithfulness: boolean;
  note?: string;
  rater?: string;
}

/**
 * Database query result
 */
export interface QueryResult<T = unknown> {
  rows: T[];
  changes?: number;
  lastInsertRowid?: number;
}

/**
 * Search result with snippet
 */
export interface SearchResult {
  id: number;
  url: string;
  title: string;
  site: string;
  savedAt: string;
  wordCount: number;
  snippet: string;
}

/**
 * Message handler function type
 */
export type MessageHandler<T = unknown, R = unknown> = (
  message: RequestMessage<T>,
  sender?: chrome.runtime.MessageSender,
) => Promise<ResponseMessage<R>> | ResponseMessage<R>;

/**
 * Stream handler for processing streaming messages
 */
export type StreamHandler = (
  chunk: DbExportChunk | DbExportProgress,
  streamId: string,
) => void | Promise<void>;

/**
 * Message router for handling different message types
 */
export class MessageRouter {
  private handlers = new Map<string, MessageHandler>();
  private streamHandlers = new Map<string, StreamHandler>();
  private streamManager = new StreamManager();
  private streamReaders = new Map<string, StreamReader>();
  private progressReporters = new Map<string, ProgressReporter>();

  /**
   * Register a handler for a message type
   */
  register<T = unknown, R = unknown>(type: string, handler: MessageHandler<T, R>): void {
    this.handlers.set(type, handler as MessageHandler);
  }

  /**
   * Register a stream handler for a specific export
   */
  registerStreamHandler(streamId: string, handler: StreamHandler): void {
    this.streamHandlers.set(streamId, handler);
  }

  /**
   * Unregister a stream handler
   */
  unregisterStreamHandler(streamId: string): void {
    this.streamHandlers.delete(streamId);
    this.streamReaders.delete(streamId);
    this.progressReporters.delete(streamId);
  }

  /**
   * Check if this is a streaming message
   */
  private isStreamingMessage(type: string): boolean {
    return [
      "DB_EXPORT_CHUNK",
      "DB_EXPORT_PROGRESS",
      "DB_EXPORT_COMPLETE",
      "DB_EXPORT_CANCELLED",
    ].includes(type);
  }

  /**
   * Handle streaming messages
   */
  private async handleStreamingMessage(message: ResponseMessage): Promise<ResponseMessage | null> {
    // Extract stream ID from message
    let streamId: string | undefined;

    if (
      message.type === "DB_EXPORT_CHUNK" ||
      message.type === "DB_EXPORT_PROGRESS" ||
      message.type === "DB_EXPORT_COMPLETE" ||
      message.type === "DB_EXPORT_CANCELLED"
    ) {
      streamId = (message as any).payload?.exportId;
    }

    if (!streamId) {
      return {
        type: message.type,
        id: message.id,
        timestamp: Date.now(),
        success: false,
        error: {
          code: "INVALID_STREAM_MESSAGE",
          message: "Stream message missing exportId",
        },
      };
    }

    // Handle chunk reassembly
    if (message.type === "DB_EXPORT_CHUNK") {
      const chunk = message as DbExportChunk;
      let reader = this.streamReaders.get(streamId);

      if (!reader) {
        reader = new StreamReader((percentage) => {
          console.log(`[MessageRouter] Stream ${streamId} progress: ${percentage.toFixed(1)}%`);
        });
        this.streamReaders.set(streamId, reader);
      }

      const isComplete = reader.processChunk(chunk);

      if (isComplete) {
        const data = reader.getData();
        if (data) {
          // Notify completion
          const completeResponse: DbExportCompleteResponse = {
            type: "DB_EXPORT_COMPLETE",
            id: generateMessageId("export-complete"),
            timestamp: Date.now(),
            success: true,
            data: {
              exportId: streamId,
              totalDocuments: 0, // Will be filled by actual handler
              totalSize: data.length,
              duration: Date.now() - (chunk.timestamp || Date.now()),
              format: "json", // Will be determined by actual export
              chunks: reader.getProgress(),
            },
          };

          // Clean up reader
          this.streamReaders.delete(streamId);

          return completeResponse;
        }
      }
    }

    // Route to stream handler if registered
    const handler = this.streamHandlers.get(streamId);
    if (handler) {
      await handler(message as any, streamId);
    }

    return null;
  }

  /**
   * Route a message to the appropriate handler
   */
  async route<T = unknown, R = unknown>(
    message: RequestMessage<T>,
    sender?: chrome.runtime.MessageSender,
  ): Promise<ResponseMessage<R>> {
    // Check if this is a streaming message
    if (this.isStreamingMessage(message.type)) {
      const streamResponse = await this.handleStreamingMessage(message as any);
      if (streamResponse) {
        return streamResponse as ResponseMessage<R>;
      }
    }
    const handler = this.handlers.get(message.type);

    if (!handler) {
      return {
        type: message.type,
        id: message.id,
        timestamp: Date.now(),
        success: false,
        error: {
          code: "UNKNOWN_MESSAGE_TYPE",
          message: `No handler registered for message type: ${message.type}`,
        },
      };
    }

    try {
      const response = await handler(message, sender);
      return response as ResponseMessage<R>;
    } catch (error) {
      return {
        type: message.type,
        id: message.id,
        timestamp: Date.now(),
        success: false,
        error: {
          code: "HANDLER_ERROR",
          message: error instanceof Error ? error.message : String(error),
          details: error instanceof Error ? error.stack : undefined,
        },
      };
    }
  }

  /**
   * Setup Chrome runtime message listener
   */
  listen(): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.route(message, sender)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            type: message.type,
            id: message.id,
            timestamp: Date.now(),
            success: false,
            error: {
              code: "ROUTING_ERROR",
              message: String(error),
            },
          });
        });

      // Return true to indicate async response
      return true;
    });
  }

  /**
   * Create a stream for sending data
   */
  async createExportStream(
    exportId: string,
    onProgress?: (progress: DbExportProgress) => void,
    onComplete?: (response: DbExportCompleteResponse) => void,
  ): Promise<string> {
    return this.streamManager.createStream({
      id: exportId,
      type: "export",
      onProgress,
      onComplete,
    });
  }

  /**
   * Send data through a stream
   */
  async *streamData(
    streamId: string,
    data: string | ArrayBuffer,
    encoding: "utf8" | "base64" = "utf8",
  ): AsyncGenerator<DbExportChunk, void, unknown> {
    yield* this.streamManager.sendData(streamId, data, encoding);
  }

  /**
   * Cancel an active stream
   */
  async cancelStream(streamId: string, reason?: string): Promise<void> {
    await this.streamManager.cancelStream(streamId, reason);
    this.unregisterStreamHandler(streamId);
  }

  /**
   * Get stream state
   */
  getStreamState(streamId: string): StreamState | undefined {
    return this.streamManager.getStreamState(streamId);
  }

  /**
   * Get all active streams
   */
  getActiveStreams(): StreamState[] {
    return this.streamManager.getActiveStreams();
  }
}

/**
 * Helper function to create a success response
 */
export function createSuccessResponse<T = unknown>(
  request: BaseMessage,
  data?: T,
): ResponseMessage<T> {
  return {
    type: request.type,
    id: request.id,
    timestamp: Date.now(),
    success: true,
    data,
  };
}

/**
 * Helper function to create an error response
 */
export function createErrorResponse(request: BaseMessage, error: unknown): ResponseMessage {
  const errorDetails =
    error instanceof Error
      ? {
          code: "ERROR",
          message: error.message,
          details: error.stack,
        }
      : {
          code: "UNKNOWN_ERROR",
          message: String(error),
        };

  return {
    type: request.type,
    id: request.id,
    timestamp: Date.now(),
    success: false,
    error: errorDetails,
  };
}

/**
 * Helper function to generate unique message IDs
 */
export function generateMessageId(prefix?: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
}
