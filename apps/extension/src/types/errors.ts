/**
 * Comprehensive error handling system for database operations
 * with recovery strategies and user-friendly messages.
 */

import { DbError, DbErrorCode } from "./database";
import { MessageType } from "../offscreen/offscreen";

// Re-export DbErrorCode for external use
export { DbErrorCode };

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  INFO = "info", // Informational, no action needed
  WARNING = "warning", // Operation continued with issues
  ERROR = "error", // Operation failed but recoverable
  CRITICAL = "critical", // System failure, requires restart
}

/**
 * Categories of errors for better organization
 */
export enum ErrorCategory {
  STORAGE = "storage",
  NETWORK = "network",
  PERMISSION = "permission",
  VALIDATION = "validation",
  SYSTEM = "system",
  USER = "user",
}

/**
 * Extended error information with recovery strategies
 */
export interface ExtendedError extends Error {
  code: DbErrorCode;
  severity: ErrorSeverity;
  category: ErrorCategory;
  recoverable: boolean;
  retryable: boolean;
  retryAfter?: number; // Milliseconds
  suggestion?: string;
  userMessage: string;
  technicalDetails?: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Error recovery strategy
 */
export interface RecoveryStrategy {
  code: DbErrorCode;
  automatic: boolean; // Can be recovered automatically
  manual: boolean; // Requires user intervention
  steps: string[]; // Recovery steps
  retryConfig?: {
    maxAttempts: number;
    backoffMs: number;
    exponential: boolean;
  };
}

/**
 * Error recovery strategies map
 */
export const RECOVERY_STRATEGIES: Record<DbErrorCode, RecoveryStrategy> = {
  [DbErrorCode.OPFS_UNAVAILABLE]: {
    code: DbErrorCode.OPFS_UNAVAILABLE,
    automatic: false,
    manual: true,
    steps: [
      "Check if browser supports Origin Private File System (OPFS)",
      "Ensure extension has necessary permissions",
      "Try restarting the browser",
      "Clear browser cache if problem persists",
    ],
  },
  [DbErrorCode.QUOTA_EXCEEDED]: {
    code: DbErrorCode.QUOTA_EXCEEDED,
    automatic: false,
    manual: true,
    steps: [
      "Delete old or unnecessary documents from the database",
      "Export important data before cleaning",
      "Consider increasing browser storage quota",
      "Clear other browser data if needed",
    ],
  },
  [DbErrorCode.CONNECTION_LOST]: {
    code: DbErrorCode.CONNECTION_LOST,
    automatic: true,
    manual: false,
    steps: ["Attempting to reconnect automatically", "Please wait..."],
    retryConfig: {
      maxAttempts: 5,
      backoffMs: 1000,
      exponential: true,
    },
  },
  [DbErrorCode.EXPORT_INTERRUPTED]: {
    code: DbErrorCode.EXPORT_INTERRUPTED,
    automatic: false,
    manual: true,
    steps: [
      "Export was interrupted",
      "Partial data may be available",
      "Try exporting again with a smaller date range",
      "Check available disk space",
    ],
  },
  [DbErrorCode.INVALID_REQUEST]: {
    code: DbErrorCode.INVALID_REQUEST,
    automatic: false,
    manual: true,
    steps: [
      "Check the request parameters",
      "Ensure all required fields are provided",
      "Verify data types and formats",
    ],
  },
  [DbErrorCode.TRANSACTION_FAILED]: {
    code: DbErrorCode.TRANSACTION_FAILED,
    automatic: true,
    manual: false,
    steps: ["Transaction will be retried automatically"],
    retryConfig: {
      maxAttempts: 3,
      backoffMs: 500,
      exponential: false,
    },
  },
  [DbErrorCode.TIMEOUT]: {
    code: DbErrorCode.TIMEOUT,
    automatic: true,
    manual: false,
    steps: ["Operation timed out", "Retrying with extended timeout"],
    retryConfig: {
      maxAttempts: 2,
      backoffMs: 2000,
      exponential: false,
    },
  },
  [DbErrorCode.PERMISSION_DENIED]: {
    code: DbErrorCode.PERMISSION_DENIED,
    automatic: false,
    manual: true,
    steps: [
      "Extension lacks necessary permissions",
      "Check extension permissions in browser settings",
      "Grant required permissions and try again",
      "Reinstall extension if problem persists",
    ],
  },
};

/**
 * User-friendly error messages
 */
export const USER_ERROR_MESSAGES: Record<DbErrorCode, string> = {
  [DbErrorCode.OPFS_UNAVAILABLE]:
    "Unable to access local storage. Please check browser compatibility and permissions.",
  [DbErrorCode.QUOTA_EXCEEDED]:
    "Storage quota exceeded. Please free up space by deleting old documents.",
  [DbErrorCode.CONNECTION_LOST]: "Lost connection to database. Attempting to reconnect...",
  [DbErrorCode.EXPORT_INTERRUPTED]: "Export was interrupted. Partial data may be available.",
  [DbErrorCode.INVALID_REQUEST]: "Invalid request. Please check your input and try again.",
  [DbErrorCode.TRANSACTION_FAILED]: "Database operation failed. Retrying...",
  [DbErrorCode.TIMEOUT]: "Operation took too long. Please try again.",
  [DbErrorCode.PERMISSION_DENIED]:
    "Permission denied. Please check extension permissions in browser settings.",
};

/**
 * Create an extended error with full details
 */
export function createExtendedError(
  code: DbErrorCode,
  message?: string,
  context?: Record<string, unknown>,
): ExtendedError {
  const strategy = RECOVERY_STRATEGIES[code];
  const userMessage = USER_ERROR_MESSAGES[code] || message || "An error occurred";
  const category = getErrorCategory(code);
  const severity = getErrorSeverity(code);

  const error = new Error(message || userMessage) as ExtendedError;
  error.code = code;
  error.severity = severity;
  error.category = category;
  error.recoverable = strategy?.automatic || strategy?.manual || false;
  error.retryable = strategy?.automatic || false;
  error.retryAfter = strategy?.retryConfig?.backoffMs;
  error.suggestion = strategy?.steps[0];
  error.userMessage = userMessage;
  error.context = context;
  error.timestamp = Date.now();

  return error;
}

/**
 * Get error category from code
 */
function getErrorCategory(code: DbErrorCode): ErrorCategory {
  switch (code) {
    case DbErrorCode.OPFS_UNAVAILABLE:
    case DbErrorCode.QUOTA_EXCEEDED:
      return ErrorCategory.STORAGE;
    case DbErrorCode.CONNECTION_LOST:
    case DbErrorCode.TIMEOUT:
      return ErrorCategory.NETWORK;
    case DbErrorCode.PERMISSION_DENIED:
      return ErrorCategory.PERMISSION;
    case DbErrorCode.INVALID_REQUEST:
      return ErrorCategory.VALIDATION;
    case DbErrorCode.TRANSACTION_FAILED:
    case DbErrorCode.EXPORT_INTERRUPTED:
    default:
      return ErrorCategory.SYSTEM;
  }
}

/**
 * Get error severity from code
 */
function getErrorSeverity(code: DbErrorCode): ErrorSeverity {
  switch (code) {
    case DbErrorCode.OPFS_UNAVAILABLE:
    case DbErrorCode.PERMISSION_DENIED:
      return ErrorSeverity.CRITICAL;
    case DbErrorCode.QUOTA_EXCEEDED:
    case DbErrorCode.TRANSACTION_FAILED:
      return ErrorSeverity.ERROR;
    case DbErrorCode.CONNECTION_LOST:
    case DbErrorCode.TIMEOUT:
    case DbErrorCode.EXPORT_INTERRUPTED:
      return ErrorSeverity.WARNING;
    case DbErrorCode.INVALID_REQUEST:
    default:
      return ErrorSeverity.INFO;
  }
}

/**
 * Create a database error response
 */
export function createDbErrorResponse(
  requestId: string,
  error: ExtendedError | Error | unknown,
): DbError {
  let extError: ExtendedError;

  if (error instanceof Error && "code" in error) {
    extError = error as ExtendedError;
  } else if (error instanceof Error) {
    extError = createExtendedError(DbErrorCode.TRANSACTION_FAILED, error.message);
  } else {
    extError = createExtendedError(DbErrorCode.TRANSACTION_FAILED, String(error));
  }

  const strategy = RECOVERY_STRATEGIES[extError.code];

  return {
    type: MessageType.DB_ERROR,
    id: requestId,
    timestamp: Date.now(),
    success: false,
    error: {
      code: extError.code,
      message: extError.userMessage,
      details: extError.technicalDetails || extError.stack,
      recoverable: extError.recoverable,
      suggestion: strategy?.steps.join(" ") || extError.suggestion,
      retryAfter: extError.retryAfter,
      context: extError.context,
    },
  };
}

/**
 * Error retry handler with exponential backoff
 */
export class RetryHandler {
  private attempts = new Map<string, number>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Attempt operation with retry logic
   */
  async retry<T>(
    operationId: string,
    operation: () => Promise<T>,
    errorCode: DbErrorCode,
    onRetry?: (attempt: number, maxAttempts: number) => void,
  ): Promise<T> {
    const strategy = RECOVERY_STRATEGIES[errorCode];
    if (!strategy?.retryConfig) {
      throw createExtendedError(errorCode, "Operation cannot be retried");
    }

    const { maxAttempts, backoffMs, exponential } = strategy.retryConfig;
    let attempt = this.attempts.get(operationId) || 0;

    while (attempt < maxAttempts) {
      try {
        const result = await operation();
        this.attempts.delete(operationId);
        return result;
      } catch (error) {
        attempt++;
        this.attempts.set(operationId, attempt);

        if (attempt >= maxAttempts) {
          this.attempts.delete(operationId);
          throw error;
        }

        if (onRetry) {
          onRetry(attempt, maxAttempts);
        }

        // Calculate backoff delay
        const delay = exponential ? backoffMs * Math.pow(2, attempt - 1) : backoffMs;

        // Wait before retry
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, delay);
          this.timers.set(operationId, timer);
        });
      }
    }

    throw createExtendedError(errorCode, "Max retry attempts exceeded");
  }

  /**
   * Cancel retry operation
   */
  cancel(operationId: string): void {
    this.attempts.delete(operationId);
    const timer = this.timers.get(operationId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(operationId);
    }
  }

  /**
   * Get current attempt count
   */
  getAttempts(operationId: string): number {
    return this.attempts.get(operationId) || 0;
  }
}

/**
 * Global retry handler instance
 */
export const retryHandler = new RetryHandler();

/**
 * Error logging utility
 */
export class ErrorLogger {
  private errors: ExtendedError[] = [];
  private maxErrors = 100;

  /**
   * Log an error
   */
  log(error: ExtendedError | Error | unknown): void {
    let extError: ExtendedError;

    if (error instanceof Error && "code" in error) {
      extError = error as ExtendedError;
    } else if (error instanceof Error) {
      extError = createExtendedError(DbErrorCode.TRANSACTION_FAILED, error.message);
    } else {
      extError = createExtendedError(DbErrorCode.TRANSACTION_FAILED, String(error));
    }

    this.errors.unshift(extError);

    // Limit error history
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    // Log to console based on severity
    switch (extError.severity) {
      case ErrorSeverity.CRITICAL:
        console.error("[CRITICAL]", extError);
        break;
      case ErrorSeverity.ERROR:
        console.error("[ERROR]", extError);
        break;
      case ErrorSeverity.WARNING:
        console.warn("[WARNING]", extError);
        break;
      case ErrorSeverity.INFO:
        console.info("[INFO]", extError);
        break;
    }
  }

  /**
   * Get recent errors
   */
  getRecentErrors(count = 10): ExtendedError[] {
    return this.errors.slice(0, count);
  }

  /**
   * Get errors by severity
   */
  getErrorsBySeverity(severity: ErrorSeverity): ExtendedError[] {
    return this.errors.filter((e) => e.severity === severity);
  }

  /**
   * Get errors by category
   */
  getErrorsByCategory(category: ErrorCategory): ExtendedError[] {
    return this.errors.filter((e) => e.category === category);
  }

  /**
   * Clear error log
   */
  clear(): void {
    this.errors = [];
  }

  /**
   * Export errors for debugging
   */
  export(): string {
    return JSON.stringify(this.errors, null, 2);
  }
}

/**
 * Global error logger instance
 */
export const errorLogger = new ErrorLogger();

/**
 * Security event types for logging
 */
export enum SecurityEventType {
  SQL_INJECTION_ATTEMPT = "SQL_INJECTION_ATTEMPT",
  RESOURCE_LIMIT_EXCEEDED = "RESOURCE_LIMIT_EXCEEDED",
  EXPORT_TIMEOUT = "EXPORT_TIMEOUT",
  UNAUTHORIZED_ACCESS = "UNAUTHORIZED_ACCESS",
  INVALID_INPUT = "INVALID_INPUT",
  SUSPICIOUS_ACTIVITY = "SUSPICIOUS_ACTIVITY",
}

/**
 * Security event for logging
 */
export interface SecurityEvent {
  type: SecurityEventType;
  severity: ErrorSeverity;
  timestamp: number;
  message: string;
  context?: Record<string, unknown>;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Security logger for tracking security-relevant events
 */
export class SecurityLogger {
  private events: SecurityEvent[] = [];
  private maxEvents = 1000;
  private listeners: ((event: SecurityEvent) => void)[] = [];

  /**
   * Log a security event
   */
  log(event: Partial<SecurityEvent> & Pick<SecurityEvent, "type" | "message">): void {
    const fullEvent: SecurityEvent = {
      severity: this.getSeverityForType(event.type),
      timestamp: Date.now(),
      ...event,
    };

    this.events.unshift(fullEvent);

    // Limit event history
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }

    // Log to console with appropriate level
    const prefix = `[SECURITY:${event.type}]`;
    switch (fullEvent.severity) {
      case ErrorSeverity.CRITICAL:
        console.error(prefix, fullEvent);
        break;
      case ErrorSeverity.ERROR:
        console.error(prefix, fullEvent);
        break;
      case ErrorSeverity.WARNING:
        console.warn(prefix, fullEvent);
        break;
      case ErrorSeverity.INFO:
        console.info(prefix, fullEvent);
        break;
    }

    // Notify listeners
    this.listeners.forEach((listener) => listener(fullEvent));
  }

  /**
   * Log a SQL injection attempt
   */
  logSqlInjectionAttempt(input: string, context?: Record<string, unknown>): void {
    this.log({
      type: SecurityEventType.SQL_INJECTION_ATTEMPT,
      message: `Potential SQL injection attempt detected: ${input}`,
      context: { ...context, input },
    });
  }

  /**
   * Log resource limit exceeded
   */
  logResourceLimitExceeded(resource: string, limit: number, requested: number): void {
    this.log({
      type: SecurityEventType.RESOURCE_LIMIT_EXCEEDED,
      message: `Resource limit exceeded for ${resource}`,
      context: { resource, limit, requested },
    });
  }

  /**
   * Log export timeout
   */
  logExportTimeout(exportId: string, duration: number): void {
    this.log({
      type: SecurityEventType.EXPORT_TIMEOUT,
      message: `Export ${exportId} timed out after ${duration}ms`,
      context: { exportId, duration },
    });
  }

  /**
   * Get severity for security event type
   */
  private getSeverityForType(type: SecurityEventType): ErrorSeverity {
    switch (type) {
      case SecurityEventType.SQL_INJECTION_ATTEMPT:
      case SecurityEventType.UNAUTHORIZED_ACCESS:
        return ErrorSeverity.CRITICAL;
      case SecurityEventType.SUSPICIOUS_ACTIVITY:
        return ErrorSeverity.ERROR;
      case SecurityEventType.RESOURCE_LIMIT_EXCEEDED:
      case SecurityEventType.EXPORT_TIMEOUT:
        return ErrorSeverity.WARNING;
      case SecurityEventType.INVALID_INPUT:
      default:
        return ErrorSeverity.INFO;
    }
  }

  /**
   * Get recent security events
   */
  getRecentEvents(count = 10): SecurityEvent[] {
    return this.events.slice(0, count);
  }

  /**
   * Get events by type
   */
  getEventsByType(type: SecurityEventType): SecurityEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  /**
   * Add listener for security events
   */
  addListener(listener: (event: SecurityEvent) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove listener
   */
  removeListener(listener: (event: SecurityEvent) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Clear security log
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Export security events for analysis
   */
  export(): string {
    return JSON.stringify(this.events, null, 2);
  }
}

/**
 * Global security logger instance
 */
export const securityLogger = new SecurityLogger();

/**
 * Wrap async function with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  errorCode: DbErrorCode = DbErrorCode.TRANSACTION_FAILED,
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      const extError = createExtendedError(
        errorCode,
        error instanceof Error ? error.message : String(error),
      );
      errorLogger.log(extError);
      throw extError;
    }
  }) as T;
}

/**
 * Check if error is recoverable
 */
export function isRecoverableError(error: unknown): boolean {
  if (error instanceof Error && "recoverable" in error) {
    return (error as ExtendedError).recoverable;
  }
  return false;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error && "retryable" in error) {
    return (error as ExtendedError).retryable;
  }
  return false;
}
