/**
 * Advanced Middleware Module
 * 
 * Provides production-ready middleware for protecting against:
 * - Slow/hanging requests (TimeoutMiddleware)
 * - Cascading failures (CircuitBreakerMiddleware)
 */

export { TimeoutMiddleware, TimeoutOptions, createTimeoutMiddleware } from './timeout.middleware';
export {
  CircuitBreakerMiddleware,
  CircuitBreakerService,
  CircuitBreakerOptions,
  CircuitState,
  CircuitStats,
  createCircuitBreaker,
} from './circuit-breaker.middleware';
