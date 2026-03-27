import { Injectable, NestMiddleware, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Circuit state enumeration
 */
export enum CircuitState {
  /**
   * Circuit is closed - requests flow through normally
   */
  CLOSED = 'CLOSED',

  /**
   * Circuit is open - requests are blocked immediately
   */
  OPEN = 'OPEN',

  /**
   * Circuit is half-open - allowing test requests to check if service recovered
   */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Configuration options for the circuit breaker middleware
 */
export interface CircuitBreakerOptions {
  /**
   * Number of consecutive failures before opening the circuit
   * @default 5
   */
  failureThreshold?: number;

  /**
   * Time window in milliseconds to count failures
   * @default 60000 (1 minute)
   */
  timeoutWindow?: number;

  /**
   * Time in milliseconds to wait before transitioning from OPEN to HALF_OPEN
   * @default 30000 (30 seconds)
   */
  retryInterval?: number;

  /**
   * Number of successful requests in HALF_OPEN state to close the circuit
   * @default 3
   */
  successThreshold?: number;

  /**
   * Custom message to return when circuit is open
   * @default 'Service temporarily unavailable'
   */
  message?: string;

  /**
   * Paths to apply circuit breaker to
   * @default ['/api/*']
   */
  paths?: string[];

  /**
   * Paths to exclude from circuit breaker
   * @default []
   */
  excludePaths?: string[];

  /**
   * HTTP status codes that count as failures
   * @default [500, 502, 503, 504]
   */
  failureStatusCodes?: number[];
}

/**
 * Circuit breaker state machine implementation
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private lastStateChangeTime: number = Date.now();

  constructor(private readonly options: CircuitBreakerOptions = {}) {
    this.options.failureThreshold ??= 5;
    this.options.timeoutWindow ??= 60000;
    this.options.retryInterval ??= 30000;
    this.options.successThreshold ??= 3;
    this.options.message ??= 'Service temporarily unavailable';
    this.options.paths ??= ['/api/*'];
    this.options.excludePaths ??= [];
    this.options.failureStatusCodes ??= [500, 502, 503, 504];
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN && this.shouldTransitionToHalfOpen()) {
      this.transitionTo(CircuitState.HALF_OPEN);
    }
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitStats {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChangeTime: this.lastStateChangeTime,
      failureThreshold: this.options.failureThreshold!,
      timeoutWindow: this.options.timeoutWindow!,
      retryInterval: this.options.retryInterval!,
    };
  }

  /**
   * Check if a request should be allowed through
   */
  canExecute(): boolean {
    const currentState = this.getState();

    switch (currentState) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        this.logger.warn('Circuit breaker is OPEN - blocking request');
        return false;

      case CircuitState.HALF_OPEN:
        // Allow limited requests in HALF_OPEN state
        return true;

      default:
        return false;
    }
  }

  /**
   * Record a successful request
   */
  onSuccess(): void {
    const currentState = this.getState();

    if (currentState === CircuitState.HALF_OPEN) {
      this.successCount++;
      this.logger.debug(`Success ${this.successCount}/${this.options.successThreshold} in HALF_OPEN state`);

      if (this.successCount >= this.options.successThreshold!) {
        this.transitionTo(CircuitState.CLOSED);
        this.logger.log('Circuit breaker CLOSED - service recovered');
      }
    } else if (currentState === CircuitState.CLOSED) {
      // Reset failure count on success in CLOSED state
      if (this.failureCount > 0) {
        this.failureCount = Math.max(0, this.failureCount - 1);
      }
    }
  }

  /**
   * Record a failed request
   */
  onFailure(error?: unknown): void {
    const currentState = this.getState();
    this.failureCount++;
    this.lastFailureTime = Date.now();

    this.logger.warn(`Circuit breaker failure recorded (${this.failureCount}/${this.options.failureThreshold})`, {
      error: error instanceof Error ? error.message : String(error),
      state: currentState,
    });

    if (currentState === CircuitState.HALF_OPEN) {
      // Any failure in HALF_OPEN state opens the circuit again
      this.transitionTo(CircuitState.OPEN);
      this.logger.warn('Circuit breaker re-OPENED - service still unhealthy');
    } else if (currentState === CircuitState.CLOSED) {
      if (this.failureCount >= this.options.failureThreshold!) {
        this.transitionTo(CircuitState.OPEN);
        this.logger.error('Circuit breaker OPENED - failure threshold reached');
      }
    }
  }

  /**
   * Check if response status code indicates a failure
   */
  isFailureStatusCode(statusCode: number): boolean {
    return this.options.failureStatusCodes!.includes(statusCode);
  }

  /**
   * Reset the circuit breaker to initial state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastStateChangeTime = Date.now();
    this.logger.log('Circuit breaker manually reset');
  }

  private shouldTransitionToHalfOpen(): boolean {
    if (!this.lastStateChangeTime) return false;
    const timeSinceLastChange = Date.now() - this.lastStateChangeTime;
    return timeSinceLastChange >= this.options.retryInterval!;
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChangeTime = Date.now();

    // Reset counters based on new state
    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0;
    }

    this.logger.log(`Circuit breaker state transition: ${oldState} → ${newState}`);
  }
}

export interface CircuitStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastStateChangeTime: number;
  failureThreshold: number;
  timeoutWindow: number;
  retryInterval: number;
}

/**
 * Circuit breaker middleware that implements the three-state machine
 * (CLOSED → OPEN → HALF_OPEN) to protect against cascading failures
 */
@Injectable()
export class CircuitBreakerMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CircuitBreakerMiddleware.name);

  constructor(private readonly circuitBreakerService: CircuitBreakerService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Skip circuit breaker for excluded paths
    if (this.isExcludedPath(req.path)) {
      this.logger.debug(`Skipping circuit breaker for path: ${req.path}`);
      return next();
    }

    // Check if circuit allows the request
    if (!this.circuitBreakerService.canExecute()) {
      this.logger.warn('Circuit breaker is OPEN', {
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString(),
      });

      return res.status(503).json({
        statusCode: 503,
        message: this.circuitBreakerService['options'].message!,
        code: 'CIRCUIT_OPEN',
        state: this.circuitBreakerService.getState(),
        timestamp: new Date().toISOString(),
        path: req.path,
      });
    }

    const startTime = Date.now();
    const originalEnd = res.end;

    // Wrap response to track completion status
    let responseEnded = false;
    res.end = (...args: any[]) => {
      if (!responseEnded) {
        responseEnded = true;
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;

        // Record success or failure based on response status
        if (this.circuitBreakerService.isFailureStatusCode(statusCode)) {
          this.circuitBreakerService.onFailure(new Error(`HTTP ${statusCode}`));
          this.logger.warn(`Request failed with status ${statusCode}`, {
            method: req.method,
            path: req.path,
            duration,
            statusCode,
          });
        } else {
          this.circuitBreakerService.onSuccess();
          this.logger.debug(`Request completed successfully`, {
            method: req.method,
            path: req.path,
            duration,
            statusCode,
          });
        }
      }
      return originalEnd.apply(res, args);
    };

    try {
      await next();
    } catch (error) {
      // Record failure for exceptions
      this.circuitBreakerService.onFailure(error);
      throw error;
    }
  }

  private isExcludedPath(path: string): boolean {
    const excludePaths = this.circuitBreakerService['options'].excludePaths!;
    return excludePaths.some(excludePath => path.startsWith(excludePath));
  }
}

/**
 * Factory function to create circuit breaker middleware with custom options
 */
export function createCircuitBreaker(options: CircuitBreakerOptions = {}): {
  service: CircuitBreakerService;
  middleware: CircuitBreakerMiddleware;
} {
  const service = new CircuitBreakerService(options);
  const middleware = new CircuitBreakerMiddleware(service);
  return { service, middleware };
}
