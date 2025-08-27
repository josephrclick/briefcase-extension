/**
 * Offscreen document proxy for the background service worker.
 * Manages the lifecycle of the offscreen document and relays messages
 * between the service worker, offscreen document, and UI components.
 */

import { MessageType } from "../offscreen/offscreen";
import type { RequestMessage, ResponseMessage } from "../types/messages";

// Offscreen document configuration
const OFFSCREEN_DOCUMENT_PATH = "src/offscreen/offscreen.html";

// Global promise to prevent concurrent document creation
let creatingOffscreenDocument: Promise<void> | null = null;

// Request tracking for message correlation
const pendingRequests = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    timeout: number;
  }
>();

// Configuration
const REQUEST_TIMEOUT = 30000; // 30 seconds
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 5000; // 5 seconds
const MESSAGE_RETRY_ATTEMPTS = 3; // Number of retry attempts for failed messages
const MESSAGE_RETRY_DELAY = 1000; // 1 second delay between retries

/**
 * OffscreenProxy manages the offscreen document lifecycle and message passing
 */
export class OffscreenProxy {
  private static instance: OffscreenProxy | null = null;
  private isDocumentReady = false;
  private heartbeatInterval: number | null = null;
  private lastHeartbeat = 0;

  private constructor() {
    this.setupMessageListeners();
    this.startHeartbeatMonitoring();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): OffscreenProxy {
    if (!OffscreenProxy.instance) {
      OffscreenProxy.instance = new OffscreenProxy();
    }
    return OffscreenProxy.instance;
  }

  /**
   * Setup message listeners for responses from offscreen document
   */
  private setupMessageListeners(): void {
    chrome.runtime.onMessage.addListener((message, sender) => {
      // Only process messages from the offscreen document
      if (sender.url?.includes(OFFSCREEN_DOCUMENT_PATH)) {
        this.handleOffscreenMessage(message);
      }
    });
  }

  /**
   * Handle messages from the offscreen document
   */
  private handleOffscreenMessage(message: ResponseMessage): void {
    // Handle heartbeat messages
    if (message.type === MessageType.HEARTBEAT) {
      this.lastHeartbeat = Date.now();
      this.isDocumentReady = (message.data as { initialized?: boolean })?.initialized || false;
      console.log("[OffscreenProxy] Heartbeat received, initialized:", this.isDocumentReady);
      return;
    }

    // Handle response messages
    if (message.id && pendingRequests.has(message.id)) {
      const pending = pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingRequests.delete(message.id);

        if (message.success) {
          pending.resolve(message.data);
        } else {
          pending.reject(message.error);
        }
      }
    }
  }

  /**
   * Ensure the offscreen document exists
   */
  async ensureOffscreenDocument(): Promise<void> {
    // Check if document already exists
    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);

    try {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
        documentUrls: [offscreenUrl],
      });

      if (existingContexts.length > 0) {
        console.log("[OffscreenProxy] Offscreen document already exists");
        return;
      }
    } catch (error) {
      console.warn("[OffscreenProxy] Could not check contexts (Chrome < 116):", error);
      // Fall back to creating the document
    }

    // Create offscreen document if it doesn't exist
    if (creatingOffscreenDocument) {
      console.log("[OffscreenProxy] Document creation already in progress");
      await creatingOffscreenDocument;
    } else {
      creatingOffscreenDocument = this.createOffscreenDocument().finally(() => {
        creatingOffscreenDocument = null;
      });
      await creatingOffscreenDocument;
    }
  }

  /**
   * Create the offscreen document
   */
  private async createOffscreenDocument(): Promise<void> {
    console.log("[OffscreenProxy] Creating offscreen document...");

    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [
          chrome.offscreen.Reason.LOCAL_STORAGE,
          chrome.offscreen.Reason.DOM_PARSER,
        ] as chrome.offscreen.Reason[],
        justification: "Persistent SQLite database storage for document and summary management",
      });

      console.log("[OffscreenProxy] Offscreen document created successfully");

      // Wait for the document to initialize
      await this.waitForDocumentReady();
    } catch (error) {
      console.error("[OffscreenProxy] Failed to create offscreen document:", error);
      throw error;
    }
  }

  /**
   * Wait for the offscreen document to be ready
   */
  private async waitForDocumentReady(): Promise<void> {
    const maxWaitTime = 10000; // 10 seconds
    const startTime = Date.now();

    // Send initialization message
    await this.sendMessage({
      type: MessageType.DB_INIT,
      id: `init-${Date.now()}`,
      timestamp: Date.now(),
    });

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (this.isDocumentReady) {
          clearInterval(checkInterval);
          console.log("[OffscreenProxy] Offscreen document is ready");
          resolve();
        } else if (Date.now() - startTime > maxWaitTime) {
          clearInterval(checkInterval);
          reject(new Error("Offscreen document initialization timeout"));
        }
      }, 100);
    });
  }

  /**
   * Send a message to the offscreen document with retry logic
   */
  private async sendMessage(message: RequestMessage): Promise<unknown> {
    // Validate message type
    if (!message.type) {
      throw new Error("Message type is required");
    }

    // Check if message type is valid (exists in MessageType enum)
    const validTypes = Object.values(MessageType);
    if (!validTypes.includes(message.type as MessageType)) {
      throw new Error(
        `Invalid message type: ${message.type}. Valid types are: ${validTypes.join(", ")}`,
      );
    }

    // Ensure document exists
    await this.ensureOffscreenDocument();

    // Implement retry logic
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MESSAGE_RETRY_ATTEMPTS; attempt++) {
      try {
        return await this.sendMessageAttempt(message, attempt);
      } catch (error) {
        lastError = error as Error;
        console.warn(
          `[OffscreenProxy] Message send attempt ${attempt}/${MESSAGE_RETRY_ATTEMPTS} failed:`,
          error,
        );

        // Don't retry if it's a validation error or the last attempt
        if (
          attempt === MESSAGE_RETRY_ATTEMPTS ||
          lastError.message.includes("Invalid message type") ||
          lastError.message.includes("Message type is required")
        ) {
          break;
        }

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, MESSAGE_RETRY_DELAY * attempt));

        // Ensure document still exists before retry
        await this.ensureOffscreenDocument();
      }
    }

    throw lastError || new Error(`Failed to send message after ${MESSAGE_RETRY_ATTEMPTS} attempts`);
  }

  /**
   * Single attempt to send a message
   */
  private async sendMessageAttempt(
    message: RequestMessage,
    attemptNumber: number,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const messageId =
        message.id ||
        `msg-${Date.now()}-${Math.random().toString(36).substring(7)}-attempt${attemptNumber}`;
      const fullMessage = { ...message, id: messageId };

      // Set up timeout
      const timeout = setTimeout(() => {
        pendingRequests.delete(messageId);
        reject(new Error(`Request timeout: ${message.type} (attempt ${attemptNumber})`));
      }, REQUEST_TIMEOUT);

      // Track pending request
      pendingRequests.set(messageId, { resolve, reject, timeout });

      // Send message
      chrome.runtime.sendMessage(fullMessage).catch((error) => {
        pendingRequests.delete(messageId);
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Start monitoring heartbeat from offscreen document
   */
  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;

      if (timeSinceLastHeartbeat > HEARTBEAT_INTERVAL + HEARTBEAT_TIMEOUT) {
        console.warn("[OffscreenProxy] Heartbeat timeout, document may be dead");
        this.isDocumentReady = false;

        // Try to recreate the document
        this.ensureOffscreenDocument().catch((error) => {
          console.error("[OffscreenProxy] Failed to recreate offscreen document:", error);
        });
      }
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Initialize the database in the offscreen document
   */
  async initializeDatabase(): Promise<void> {
    console.log("[OffscreenProxy] Initializing database...");

    const response = await this.sendMessage({
      type: MessageType.DB_INIT,
      timestamp: Date.now(),
    });

    console.log("[OffscreenProxy] Database initialized:", response);
  }

  /**
   * Execute a database query
   */
  async query(sql: string, params?: unknown[]): Promise<unknown> {
    return this.sendMessage({
      type: MessageType.DB_QUERY,
      timestamp: Date.now(),
      payload: { sql, params },
    });
  }

  /**
   * Execute a database statement
   */
  async execute(sql: string, params?: unknown[]): Promise<unknown> {
    return this.sendMessage({
      type: MessageType.DB_EXECUTE,
      timestamp: Date.now(),
      payload: { sql, params },
    });
  }

  /**
   * Execute a database transaction
   */
  async transaction(operations: Array<{ sql: string; params?: unknown[] }>): Promise<unknown> {
    return this.sendMessage({
      type: MessageType.DB_TRANSACTION,
      timestamp: Date.now(),
      payload: { operations },
    });
  }

  /**
   * Insert a document
   */
  async insertDocument(document: {
    url: string;
    title: string;
    site: string;
    wordCount: number;
    hash: string;
    rawText: string;
  }): Promise<{ id: number; changes: number }> {
    return this.sendMessage({
      type: MessageType.DOC_INSERT,
      timestamp: Date.now(),
      payload: document,
    }) as Promise<{ id: number; changes: number }>;
  }

  /**
   * Get a document
   */
  async getDocument(criteria: { id?: number; url?: string; hash?: string }): Promise<unknown> {
    return this.sendMessage({
      type: MessageType.DOC_GET,
      timestamp: Date.now(),
      payload: criteria,
    });
  }

  /**
   * Search documents
   */
  async searchDocuments(
    query: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ results: unknown[]; count: number }> {
    return this.sendMessage({
      type: MessageType.DOC_SEARCH,
      timestamp: Date.now(),
      payload: { query, ...options },
    }) as Promise<{ results: unknown[]; count: number }>;
  }

  /**
   * Insert a summary
   */
  async insertSummary(summary: {
    documentId: number;
    model: string;
    paramsJson: string;
    savedPath: string;
    savedFormat: string;
  }): Promise<{ id: number; changes: number }> {
    return this.sendMessage({
      type: MessageType.SUMMARY_INSERT,
      timestamp: Date.now(),
      payload: summary,
    }) as Promise<{ id: number; changes: number }>;
  }

  /**
   * Get summaries
   */
  async getSummaries(criteria: { id?: number; documentId?: number }): Promise<unknown> {
    return this.sendMessage({
      type: MessageType.SUMMARY_GET,
      timestamp: Date.now(),
      payload: criteria,
    });
  }

  /**
   * Insert an A/B test run
   */
  async insertAbRun(abRun: {
    documentId: number;
    modelA: string;
    modelB: string;
    promptTemplate: string;
  }): Promise<{ id: number; changes: number }> {
    return this.sendMessage({
      type: MessageType.AB_RUN_INSERT,
      timestamp: Date.now(),
      payload: abRun,
    }) as Promise<{ id: number; changes: number }>;
  }

  /**
   * Insert an A/B test score
   */
  async insertAbScore(score: {
    runId: number;
    coverage: number;
    readability: number;
    faithfulness: number;
    note: string;
    rater: string;
  }): Promise<{ id: number; changes: number }> {
    return this.sendMessage({
      type: MessageType.AB_SCORE_INSERT,
      timestamp: Date.now(),
      payload: score,
    }) as Promise<{ id: number; changes: number }>;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    console.log("[OffscreenProxy] Cleaning up...");

    // Clear heartbeat monitoring
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Clear pending requests
    for (const [_id, pending] of pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Cleanup in progress"));
    }
    pendingRequests.clear();

    // Close offscreen document
    try {
      await chrome.offscreen.closeDocument();
      console.log("[OffscreenProxy] Offscreen document closed");
    } catch (error) {
      console.error("[OffscreenProxy] Failed to close offscreen document:", error);
    }

    this.isDocumentReady = false;
    OffscreenProxy.instance = null;
  }
}

// Export singleton instance getter for convenience
export const getOffscreenProxy = () => OffscreenProxy.getInstance();
