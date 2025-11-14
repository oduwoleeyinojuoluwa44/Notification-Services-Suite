import CircuitBreaker from 'opossum';
import { Logger } from '@nestjs/common';

const logger = new Logger('SendGridCircuitBreaker');

export interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  rollingCountTimeout?: number;
  rollingCountBuckets?: number;
  name?: string;
}

/**
 * Circuit Breaker for SendGrid API calls
 * Prevents cascading failures when SendGrid is down
 */
export class SendGridCircuitBreaker {
  private breaker: CircuitBreaker;
  private logger: Logger;

  constructor(
    private sendEmailFn: (msg: any) => Promise<any>,
    options: CircuitBreakerOptions = {}
  ) {
    const defaultOptions = {
      timeout: 5000, // 5 second timeout
      errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
      resetTimeout: 30000, // Try again after 30 seconds
      rollingCountTimeout: 60000, // Count errors over 60 seconds
      rollingCountBuckets: 10, // 10 buckets for rolling window
      name: 'SendGridEmail',
      ...options
    };

    this.breaker = new CircuitBreaker(sendEmailFn, defaultOptions);
    this.logger = new Logger(`CircuitBreaker-${defaultOptions.name}`);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Circuit opened - SendGrid appears to be down
    this.breaker.on('open', () => {
      this.logger.warn('Circuit breaker OPENED - SendGrid appears to be down. Requests will be rejected.');
    });

    // Circuit half-open - testing if SendGrid is back
    this.breaker.on('halfOpen', () => {
      this.logger.log('Circuit breaker HALF-OPEN - Testing SendGrid connection...');
    });

    // Circuit closed - SendGrid is working
    this.breaker.on('close', () => {
      this.logger.log('Circuit breaker CLOSED - SendGrid is operational.');
    });

    // Request rejected due to open circuit
    this.breaker.on('reject', () => {
      this.logger.warn('Request REJECTED - Circuit breaker is open.');
    });

    // Request timeout
    this.breaker.on('timeout', () => {
      this.logger.warn('Request TIMEOUT - SendGrid took too long to respond.');
    });

    // Request failure
    this.breaker.on('failure', (error: Error) => {
      this.logger.error(`Request FAILED: ${error.message}`);
    });

    // Request success
    this.breaker.on('success', () => {
      this.logger.debug('Request SUCCEEDED');
    });
  }

  /**
   * Execute email send with circuit breaker protection
   */
  async execute(msg: any): Promise<any> {
    try {
      return await this.breaker.fire(msg);
    } catch (error) {
      // If circuit is open, throw a specific error
      if (error.message?.includes('Circuit breaker is open')) {
        throw new Error('SendGrid service unavailable - circuit breaker is open');
      }
      throw error;
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): string {
    return this.breaker.status?.state || 'unknown';
  }

  /**
   * Get circuit breaker stats
   */
  getStats(): any {
    return {
      state: this.getState(),
      fires: this.breaker.stats?.fires || 0,
      cacheHits: this.breaker.stats?.cacheHits || 0,
      cacheMisses: this.breaker.stats?.cacheMisses || 0,
      failures: this.breaker.stats?.failures || 0,
      successes: this.breaker.stats?.successes || 0,
      rejects: this.breaker.stats?.rejects || 0,
      timeouts: this.breaker.stats?.timeouts || 0,
    };
  }

  /**
   * Manually open the circuit breaker (for testing/maintenance)
   */
  open(): void {
    this.breaker.open();
  }

  /**
   * Manually close the circuit breaker (for testing/maintenance)
   */
  close(): void {
    this.breaker.close();
  }
}

