import { Injectable, NestMiddleware, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TimeoutError } from 'src/libs/errors';

/**
 * Configuration options for the timeout middleware
 */
export interface TimeoutOptions {
  /**
   * Timeout duration in milliseconds
   * @default 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Custom message to return when timeout occurs
   * @default 'Request timeout'
   */
  message?: string;

  /**
   * HTTP status code to return on timeout
   * @default 503
   */
  statusCode?: number;

  /**
   * Paths to exclude from timeout
   * @default []
   */
  excludePaths?: string[];
}

/**
 * Timeout middleware that protects against slow requests
 * Wraps the next() call in a Promise.race() against a setTimeout
 */
@Injectable()
export class TimeoutMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TimeoutMiddleware.name);
  private readonly timeout: number;
  private readonly message: string;
  private readonly statusCode: number;
  private readonly excludePaths: string[];

  constructor(private readonly options: TimeoutOptions = {}) {
    this.timeout = options.timeout ?? 30000; // Default 30 seconds
    this.message = options.message ?? 'Request timeout';
    this.statusCode = options.statusCode ?? 503;
    this.excludePaths = options.excludePaths ?? [];
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Skip timeout for excluded paths
    if (this.excludePaths.some(path => req.path.startsWith(path))) {
      this.logger.debug(`Skipping timeout for path: ${req.path}`);
      return next();
    }

    const startTime = Date.now();
    const requestId = this.getRequestId(req);

    try {
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          // Create a wrapper for next() that tracks completion
          const wrappedNext: NextFunction = (err?: unknown) => {
            clearTimeout(timeoutId);
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          };

          // Set up the timeout
          const timeoutId = setTimeout(() => {
            const duration = Date.now() - startTime;
            this.logger.warn(`Request timeout after ${duration}ms`, {
              requestId,
              method: req.method,
              path: req.path,
              duration,
            });

            reject(new TimeoutError(`${this.message} after ${duration}ms`));
          }, this.timeout);

          // Call the actual next middleware
          next(wrappedNext);
        }),
      ]);

      // If we get here, the request completed successfully
      const duration = Date.now() - startTime;
      if (duration > this.timeout * 0.8) {
        // Warn if we're at 80% of timeout threshold
        this.logger.warn(`Request took ${duration}ms (close to timeout of ${this.timeout}ms)`, {
          requestId,
          method: req.method,
          path: req.path,
          duration,
        });
      }
    } catch (error) {
      if (error instanceof TimeoutError) {
        // Handle timeout errors with appropriate response
        if (!res.headersSent) {
          res.status(this.statusCode).json({
            statusCode: this.statusCode,
            message: error.message,
            code: 'TIMEOUT',
            timestamp: new Date().toISOString(),
            path: req.path,
          });
        }
        return;
      }

      // Re-throw other errors to be handled by error middleware
      throw error;
    }
  }

  /**
   * Extract or generate a request ID for tracking
   */
  private getRequestId(req: Request): string {
    return (
      req.headers['x-request-id'] as string ||
      req.headers['x-correlation-id'] as string ||
      `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    );
  }
}

/**
 * Factory function to create timeout middleware with custom options
 */
export function createTimeoutMiddleware(options: TimeoutOptions = {}) {
  const middleware = new TimeoutMiddleware(options);
  return (req: Request, res: Response, next: NextFunction) => middleware.use(req, res, next);
}
