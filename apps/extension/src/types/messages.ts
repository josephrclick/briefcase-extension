/**
 * Shared message types and interfaces for communication between
 * service worker, offscreen document, content scripts, and UI.
 */

// Re-export MessageType from offscreen module
export { MessageType } from "../offscreen/offscreen";

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
 * Message router for handling different message types
 */
export class MessageRouter {
  private handlers = new Map<string, MessageHandler>();

  /**
   * Register a handler for a message type
   */
  register<T = unknown, R = unknown>(type: string, handler: MessageHandler<T, R>): void {
    this.handlers.set(type, handler as MessageHandler);
  }

  /**
   * Route a message to the appropriate handler
   */
  async route<T = unknown, R = unknown>(
    message: RequestMessage<T>,
    sender?: chrome.runtime.MessageSender,
  ): Promise<ResponseMessage<R>> {
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
