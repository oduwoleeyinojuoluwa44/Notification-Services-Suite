/**
 * Error classification utility
 * Distinguishes between transient errors (should retry) and permanent errors (should go to DLQ)
 */

export enum ErrorType {
  TRANSIENT = 'TRANSIENT',    // Temporary issues that might resolve (network, rate limits, timeouts)
  PERMANENT = 'PERMANENT',    // Errors that won't fix themselves (invalid data, auth failures)
  UNKNOWN = 'UNKNOWN'         // Unknown errors, treat as transient for safety
}

export interface ClassifiedError {
  type: ErrorType;
  shouldRetry: boolean;
  maxRetries: number;
  message: string;
}

export class ErrorClassifier {
  /**
   * Classify an error to determine retry strategy
   */
  static classify(error: any): ClassifiedError {
    const errorMessage = error?.message?.toLowerCase() || '';
    const errorCode = error?.code || error?.statusCode || error?.response?.statusCode;
    const errorName = error?.name || '';

    // Permanent errors - don't retry, send to DLQ immediately
    if (this.isPermanentError(error, errorMessage, errorCode, errorName)) {
      return {
        type: ErrorType.PERMANENT,
        shouldRetry: false,
        maxRetries: 0,
        message: this.getErrorMessage(error)
      };
    }

    // Transient errors - retry with backoff
    if (this.isTransientError(error, errorMessage, errorCode, errorName)) {
      return {
        type: ErrorType.TRANSIENT,
        shouldRetry: true,
        maxRetries: 5, // Retry up to 5 times for transient errors
        message: this.getErrorMessage(error)
      };
    }

    // Unknown errors - treat as transient for safety (better to retry than lose message)
    return {
      type: ErrorType.UNKNOWN,
      shouldRetry: true,
      maxRetries: 3, // Conservative retry count for unknown errors
      message: this.getErrorMessage(error)
    };
  }

  /**
   * Check if error is permanent (won't fix itself)
   */
  private static isPermanentError(
    error: any,
    errorMessage: string,
    errorCode: number | string | undefined,
    errorName: string
  ): boolean {
    // Authentication/Authorization errors
    if (errorCode === 401 || errorCode === 403) {
      return true; // Invalid API key won't fix itself
    }

    // Invalid request errors (400) - usually data issues
    if (errorCode === 400) {
      // But rate limit 429 is transient, so check message
      if (errorMessage.includes('rate limit') || errorMessage.includes('throttle')) {
        return false;
      }
      // Invalid email address, malformed data - permanent
      if (errorMessage.includes('invalid email') || 
          errorMessage.includes('malformed') ||
          errorMessage.includes('bad request')) {
        return true;
      }
    }

    // Data validation errors
    if (errorMessage.includes('user email not found') ||
        errorMessage.includes('template content not provided') ||
        errorMessage.includes('missing required') ||
        errorMessage.includes('validation error')) {
      return true;
    }

    // Invalid email format
    if (errorMessage.includes('invalid email') || 
        errorMessage.includes('email format')) {
      return true;
    }

    return false;
  }

  /**
   * Check if error is transient (might resolve)
   */
  private static isTransientError(
    error: any,
    errorMessage: string,
    errorCode: number | string | undefined,
    errorName: string
  ): boolean {
    // Rate limiting - definitely transient
    if (errorCode === 429 || 
        errorMessage.includes('rate limit') ||
        errorMessage.includes('throttle') ||
        errorMessage.includes('too many requests')) {
      return true;
    }

    // Server errors - likely transient
    if (errorCode >= 500 && errorCode < 600) {
      return true;
    }

    // Network errors
    if (errorName === 'ECONNREFUSED' ||
        errorName === 'ETIMEDOUT' ||
        errorName === 'ENOTFOUND' ||
        errorName === 'ECONNRESET' ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('network') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('dns')) {
      return true;
    }

    // Timeout errors
    if (errorName === 'TimeoutError' || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('timed out')) {
      return true;
    }

    // Service unavailable
    if (errorCode === 503 || errorCode === 502 || errorCode === 504) {
      return true;
    }

    return false;
  }

  /**
   * Extract error message from various error formats
   */
  private static getErrorMessage(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (error?.response?.body?.errors) {
      const errors = error.response.body.errors;
      if (Array.isArray(errors) && errors.length > 0) {
        return errors.map((e: any) => e.message || e).join(', ');
      }
    }
    if (error?.message) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error occurred';
  }

  /**
   * Calculate exponential backoff delay in milliseconds
   * @param retryCount Current retry attempt (0-indexed)
   * @param baseDelay Base delay in milliseconds (default 1000ms = 1 second)
   * @param maxDelay Maximum delay in milliseconds (default 30000ms = 30 seconds)
   */
  static calculateBackoff(
    retryCount: number,
    baseDelay: number = 1000,
    maxDelay: number = 30000
  ): number {
    const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay; // Up to 30% jitter
    return Math.floor(delay + jitter);
  }
}

