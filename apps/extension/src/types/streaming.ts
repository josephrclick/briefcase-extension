/**
 * Streaming infrastructure for handling large data transfers
 * between UI, service worker, and offscreen document.
 *
 * Supports:
 * - Chunked data transmission
 * - Async iterators over message channels
 * - Progress tracking with callbacks
 * - Concurrent stream management
 * - Cancellation and error recovery
 */

import { MessageType } from "../offscreen/offscreen";
import {
  DbExportChunk,
  DbExportProgress,
  StreamState,
  DbExportCompleteResponse,
  DbExportCancelledResponse,
  generateExportId,
  calculateETA,
} from "./database";
import { ResponseMessage, generateMessageId } from "./messages";

/**
 * Configuration for stream operations
 */
export interface StreamConfig {
  chunkSize: number; // Bytes per chunk
  progressInterval: number; // Ms between progress updates
  timeout: number; // Ms before stream times out
  maxRetries: number; // Number of retries for failed chunks
  compressionLevel?: number; // 0-9 for compression
}

/**
 * Default stream configuration
 */
export const DEFAULT_STREAM_CONFIG: StreamConfig = {
  chunkSize: 64 * 1024, // 64KB chunks
  progressInterval: 100, // Progress every 100ms
  timeout: 5 * 60 * 1000, // 5 minute timeout
  maxRetries: 3,
  compressionLevel: 6,
};

/**
 * Options for creating a stream
 */
export interface StreamOptions {
  id?: string;
  type: "export" | "import" | "backup";
  config?: Partial<StreamConfig>;
  onProgress?: (progress: DbExportProgress) => void;
  onChunk?: (chunk: DbExportChunk) => void;
  onComplete?: (response: DbExportCompleteResponse) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal; // For cancellation
}

/**
 * StreamManager handles chunked data transmission and stream lifecycle
 */
export class StreamManager {
  private streams = new Map<string, StreamState>();
  private chunkBuffers = new Map<string, Array<DbExportChunk>>();
  private progressTimers = new Map<string, ReturnType<typeof setInterval>>();
  private messageHandlers = new Map<string, (message: ResponseMessage) => void>();
  private config: StreamConfig;

  constructor(config?: Partial<StreamConfig>) {
    this.config = { ...DEFAULT_STREAM_CONFIG, ...config };
  }

  /**
   * Create a new stream for data transmission
   */
  async createStream(options: StreamOptions): Promise<string> {
    const streamId = options.id || generateExportId(options.type);
    const config = { ...this.config, ...options.config };

    // Initialize stream state
    const state: StreamState = {
      id: streamId,
      type: options.type,
      status: "active",
      startTime: Date.now(),
      lastActivity: Date.now(),
      progress: {
        current: 0,
        total: 0,
        percentage: 0,
      },
      metadata: {},
    };

    this.streams.set(streamId, state);
    this.chunkBuffers.set(streamId, []);

    // Set up progress reporting
    if (options.onProgress) {
      const timer = setInterval(() => {
        const currentState = this.streams.get(streamId);
        if (currentState && currentState.status === "active") {
          this.reportProgress(streamId, options.onProgress!);
        }
      }, config.progressInterval);
      this.progressTimers.set(streamId, timer);
    }

    // Set up message handler for this stream
    const messageHandler = (message: ResponseMessage) => {
      this.handleStreamMessage(streamId, message, options);
    };
    this.messageHandlers.set(streamId, messageHandler);

    // Set up cancellation
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        this.cancelStream(streamId, "User cancelled");
      });
    }

    // Set up timeout
    setTimeout(() => {
      const state = this.streams.get(streamId);
      if (state && state.status === "active") {
        this.handleStreamError(streamId, new Error("Stream timeout"), options.onError);
      }
    }, config.timeout);

    return streamId;
  }

  /**
   * Send data through a stream in chunks
   */
  async *sendData(
    streamId: string,
    data: string | ArrayBuffer,
    encoding: "utf8" | "base64" = "utf8",
  ): AsyncGenerator<DbExportChunk, void, unknown> {
    const state = this.streams.get(streamId);
    if (!state) {
      throw new Error(`Stream ${streamId} not found`);
    }

    // Convert data to string if needed
    const dataStr = typeof data === "string" ? data : this.arrayBufferToBase64(data);
    const totalSize = dataStr.length;
    const chunkSize = this.config.chunkSize;
    const totalChunks = Math.ceil(totalSize / chunkSize);

    let sequenceNumber = 0;
    let position = 0;

    while (position < totalSize) {
      // Check if stream is still active
      const currentState = this.streams.get(streamId);
      if (!currentState || currentState.status !== "active") {
        break;
      }

      const chunk = dataStr.slice(position, position + chunkSize);
      const isFirst = sequenceNumber === 0;
      const isLast = position + chunkSize >= totalSize;

      const exportChunk: DbExportChunk = {
        type: MessageType.DB_EXPORT_CHUNK,
        id: generateMessageId("chunk"),
        timestamp: Date.now(),
        success: true,
        payload: {
          exportId: streamId,
          sequenceNumber,
          chunk,
          encoding,
          isFirst,
          isLast,
          checksum: this.calculateChecksum(chunk),
          metadata: isFirst
            ? {
                totalChunks,
                totalSize,
                mimeType: encoding === "base64" ? "application/octet-stream" : "text/plain",
              }
            : undefined,
        },
      };

      // Update progress
      currentState.progress.current = position + chunk.length;
      currentState.progress.total = totalSize;
      currentState.progress.percentage = Math.round(((position + chunk.length) / totalSize) * 100);
      currentState.lastActivity = Date.now();

      yield exportChunk;

      position += chunkSize;
      sequenceNumber++;
    }

    // Mark stream as complete
    const finalState = this.streams.get(streamId);
    if (finalState) {
      finalState.status = "complete";
    }
  }

  /**
   * Receive and reassemble chunks from a stream
   */
  async receiveStream(
    streamId: string,
    onComplete?: (data: string) => void,
  ): Promise<AsyncIterable<DbExportChunk>> {
    const chunks = this.chunkBuffers.get(streamId) || [];
    let receivedChunks = new Map<number, string>();
    let totalChunks = 0;

    const iterator = {
      [Symbol.asyncIterator](): AsyncIterator<DbExportChunk> {
        return {
          async next(): Promise<IteratorResult<DbExportChunk>> {
            // Check for buffered chunks
            if (chunks.length > 0) {
              const chunk = chunks.shift()!;
              return { value: chunk, done: false };
            }

            // Wait for new chunks or completion
            return new Promise((resolve) => {
              const checkInterval = setInterval(() => {
                const state = StreamManager.prototype.streams.get(streamId);

                if (chunks.length > 0) {
                  clearInterval(checkInterval);
                  const chunk = chunks.shift()!;

                  // Store chunk data
                  if (chunk.payload.metadata?.totalChunks) {
                    totalChunks = chunk.payload.metadata.totalChunks;
                  }
                  receivedChunks.set(chunk.payload.sequenceNumber, chunk.payload.chunk);

                  // Check if all chunks received
                  if (chunk.payload.isLast || receivedChunks.size === totalChunks) {
                    // Reassemble data
                    const sortedChunks = Array.from(receivedChunks.entries())
                      .sort(([a], [b]) => a - b)
                      .map(([, data]) => data);
                    const completeData = sortedChunks.join("");

                    if (onComplete) {
                      onComplete(completeData);
                    }

                    resolve({ value: chunk, done: true });
                  } else {
                    resolve({ value: chunk, done: false });
                  }
                } else if (state && state.status !== "active") {
                  clearInterval(checkInterval);
                  resolve({ value: undefined as any, done: true });
                }
              }, 10);
            });
          },
        };
      },
    };

    return iterator;
  }

  /**
   * Cancel an active stream
   */
  async cancelStream(streamId: string, _reason?: string): Promise<void> {
    const state = this.streams.get(streamId);
    if (!state) return;

    state.status = "cancelled";

    // Clear progress timer
    const timer = this.progressTimers.get(streamId);
    if (timer) {
      clearInterval(timer);
      this.progressTimers.delete(streamId);
    }

    // Send cancellation message
    const cancelResponse: DbExportCancelledResponse = {
      type: MessageType.DB_EXPORT_CANCELLED,
      id: generateMessageId("cancel"),
      timestamp: Date.now(),
      success: true,
      payload: {
        exportId: streamId,
        documentsProcessed: state.progress.current,
        partialDataAvailable: state.progress.current > 0,
      },
    };

    // Notify handler
    const handler = this.messageHandlers.get(streamId);
    if (handler) {
      handler(cancelResponse);
    }

    // Clean up
    this.cleanup(streamId);
  }

  /**
   * Pause an active stream
   */
  pauseStream(streamId: string): void {
    const state = this.streams.get(streamId);
    if (state && state.status === "active") {
      state.status = "paused";
    }
  }

  /**
   * Resume a paused stream
   */
  resumeStream(streamId: string): void {
    const state = this.streams.get(streamId);
    if (state && state.status === "paused") {
      state.status = "active";
      state.lastActivity = Date.now();
    }
  }

  /**
   * Get current state of a stream
   */
  getStreamState(streamId: string): StreamState | undefined {
    return this.streams.get(streamId);
  }

  /**
   * Get all active streams
   */
  getActiveStreams(): StreamState[] {
    return Array.from(this.streams.values()).filter((s) => s.status === "active");
  }

  /**
   * Handle incoming stream messages
   */
  private handleStreamMessage(
    streamId: string,
    message: ResponseMessage,
    options: StreamOptions,
  ): void {
    const state = this.streams.get(streamId);
    if (!state) return;

    switch (message.type) {
      case MessageType.DB_EXPORT_CHUNK:
        const chunk = message as DbExportChunk;
        const buffer = this.chunkBuffers.get(streamId);
        if (buffer) {
          buffer.push(chunk);
        }
        if (options.onChunk) {
          options.onChunk(chunk);
        }
        break;

      case MessageType.DB_EXPORT_PROGRESS:
        if (options.onProgress) {
          options.onProgress(message as DbExportProgress);
        }
        break;

      case MessageType.DB_EXPORT_COMPLETE:
        state.status = "complete";
        if (options.onComplete) {
          options.onComplete(message as DbExportCompleteResponse);
        }
        this.cleanup(streamId);
        break;

      case MessageType.DB_ERROR:
        this.handleStreamError(streamId, new Error(message.error?.message), options.onError);
        break;
    }

    state.lastActivity = Date.now();
  }

  /**
   * Handle stream errors
   */
  private handleStreamError(
    streamId: string,
    error: Error,
    onError?: (error: Error) => void,
  ): void {
    const state = this.streams.get(streamId);
    if (state) {
      state.status = "error";
    }

    if (onError) {
      onError(error);
    }

    this.cleanup(streamId);
  }

  /**
   * Report progress for a stream
   */
  private reportProgress(streamId: string, onProgress: (progress: DbExportProgress) => void): void {
    const state = this.streams.get(streamId);
    if (!state) return;

    const elapsedMs = Date.now() - state.startTime;
    const estimatedTimeRemaining = calculateETA(
      state.progress.current,
      state.progress.total,
      elapsedMs,
    );

    const progress: DbExportProgress = {
      type: MessageType.DB_EXPORT_PROGRESS,
      id: generateMessageId("progress"),
      timestamp: Date.now(),
      success: true,
      payload: {
        exportId: streamId,
        phase: state.status === "complete" ? "complete" : "exporting",
        total: state.progress.total,
        processed: state.progress.current,
        percentage: state.progress.percentage,
        estimatedTimeRemaining,
      },
    };

    onProgress(progress);
  }

  /**
   * Clean up stream resources
   */
  private cleanup(streamId: string): void {
    // Clear timer
    const timer = this.progressTimers.get(streamId);
    if (timer) {
      clearInterval(timer);
      this.progressTimers.delete(streamId);
    }

    // Clear buffers after delay to allow final processing
    setTimeout(() => {
      this.streams.delete(streamId);
      this.chunkBuffers.delete(streamId);
      this.messageHandlers.delete(streamId);
    }, 5000);
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Calculate simple checksum for verification
   */
  private calculateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }
}

/**
 * Create a stream reader for handling incoming chunks
 */
export class StreamReader {
  private chunks = new Map<number, string>();
  private metadata?: {
    totalChunks: number;
    totalSize: number;
    mimeType: string;
  };
  private receivedCount = 0;
  private onProgress?: (percentage: number) => void;

  constructor(onProgress?: (percentage: number) => void) {
    this.onProgress = onProgress;
  }

  /**
   * Process an incoming chunk
   */
  processChunk(chunk: DbExportChunk): boolean {
    const { sequenceNumber, isFirst, isLast, metadata } = chunk.payload;

    // Store metadata from first chunk
    if (isFirst && metadata) {
      this.metadata = metadata;
    }

    // Store chunk data
    this.chunks.set(sequenceNumber, chunk.payload.chunk);
    this.receivedCount++;

    // Report progress
    if (this.onProgress && this.metadata) {
      const percentage = (this.receivedCount / this.metadata.totalChunks) * 100;
      this.onProgress(percentage);
    }

    // Check if complete
    return !!(isLast || (this.metadata && this.receivedCount === this.metadata.totalChunks));
  }

  /**
   * Get the complete reassembled data
   */
  getData(): string | null {
    if (!this.metadata || this.receivedCount < this.metadata.totalChunks) {
      return null;
    }

    // Sort chunks by sequence number and concatenate
    const sortedChunks = Array.from(this.chunks.entries())
      .sort(([a], [b]) => a - b)
      .map(([, data]) => data);

    return sortedChunks.join("");
  }

  /**
   * Check if all chunks have been received
   */
  isComplete(): boolean {
    return this.metadata !== undefined && this.receivedCount === this.metadata.totalChunks;
  }

  /**
   * Get current progress percentage
   */
  getProgress(): number {
    if (!this.metadata) return 0;
    return (this.receivedCount / this.metadata.totalChunks) * 100;
  }

  /**
   * Reset the reader for reuse
   */
  reset(): void {
    this.chunks.clear();
    this.metadata = undefined;
    this.receivedCount = 0;
  }
}

/**
 * Utility to create a stream from a large dataset
 */
export async function* createDataStream<T>(
  data: T[],
  chunkSize: number = 100,
  transformer?: (items: T[]) => string,
): AsyncGenerator<string, void, unknown> {
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, Math.min(i + chunkSize, data.length));

    if (transformer) {
      yield transformer(chunk);
    } else {
      yield JSON.stringify(chunk);
    }

    // Allow other operations to process
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * Create a progress reporter for long-running operations
 */
export class ProgressReporter {
  private startTime = Date.now();
  private lastReport = 0;
  private reportInterval: number;

  constructor(
    private total: number,
    private onProgress: (progress: DbExportProgress) => void,
    private exportId: string,
    reportInterval = 100,
  ) {
    this.reportInterval = reportInterval;
  }

  /**
   * Update progress
   */
  update(current: number, phase?: DbExportProgress["payload"]["phase"]): void {
    const now = Date.now();

    // Throttle reports
    if (now - this.lastReport < this.reportInterval && current < this.total) {
      return;
    }

    const elapsedMs = now - this.startTime;
    const percentage = Math.round((current / this.total) * 100);
    const estimatedTimeRemaining = calculateETA(current, this.total, elapsedMs);

    const progress: DbExportProgress = {
      type: MessageType.DB_EXPORT_PROGRESS,
      id: generateMessageId("progress"),
      timestamp: now,
      success: true,
      payload: {
        exportId: this.exportId,
        phase: phase || "exporting",
        total: this.total,
        processed: current,
        percentage,
        estimatedTimeRemaining,
      },
    };

    this.onProgress(progress);
    this.lastReport = now;
  }

  /**
   * Mark as complete
   */
  complete(): void {
    this.update(this.total, "complete");
  }
}
