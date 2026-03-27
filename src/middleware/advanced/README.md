# Advanced Middleware: Timeout & Circuit Breaker

Production-ready middleware for protecting the request pipeline from slow or repeatedly failing external services.

## Overview

This module provides two critical middleware components:

1. **TimeoutMiddleware** - Prevents requests from hanging indefinitely
2. **CircuitBreakerMiddleware** - Implements the circuit breaker pattern to prevent cascading failures

## Features

### Timeout Middleware

- ⏱️ Configurable timeout duration (default: 30 seconds)
- 🎯 Path-based exclusions
- 📊 Performance monitoring (warns at 80% threshold)
- 🔍 Request tracking with correlation IDs
- ✅ Returns 503 Service Unavailable on timeout

### Circuit Breaker Middleware

- 🔄 Three-state machine: CLOSED → OPEN → HALF_OPEN
- 📈 Configurable failure thresholds
- ⏲️ Automatic recovery with retry intervals
- 📊 State statistics and monitoring
- 🎛️ Customizable failure status codes
- ✅ Returns 503 Service Unavailable when circuit is open

## Installation

No additional dependencies required. The middleware uses built-in NestJS and Express functionality.

## Usage

### Basic Setup

#### Timeout Middleware

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { TimeoutMiddleware } from 'src/middleware/advanced';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(new TimeoutMiddleware({ timeout: 5000 })) // 5 second timeout
      .forRoutes('*');
  }
}
```

#### Circuit Breaker Middleware

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { createCircuitBreaker } from 'src/middleware/advanced';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    const { service, middleware } = createCircuitBreaker({
      failureThreshold: 5,        // Open after 5 failures
      retryInterval: 30000,       // Try again after 30 seconds
      successThreshold: 3,        // Close after 3 successes
    });

    consumer.apply(middleware).forRoutes('/api/*');
    
    // Expose service for health checks
    this.circuitBreakerService = service;
  }
}
```

### Advanced Configuration

#### Timeout Options

```typescript
interface TimeoutOptions {
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
```

#### Circuit Breaker Options

```typescript
interface CircuitBreakerOptions {
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
```

## Circuit Breaker States

### CLOSED (Normal Operation)
- All requests flow through normally
- Failures are tracked
- Opens when failure threshold is reached

### OPEN (Protecting System)
- All requests are immediately rejected with 503
- No calls to the protected service
- Transitions to HALF_OPEN after retry interval

### HALF_OPEN (Testing Recovery)
- Limited requests are allowed through
- Successes move toward closing
- Any failure re-opens the circuit

## Monitoring & Health Checks

### Accessing Circuit State

```typescript
// Get current state
const state = circuitBreakerService.getState();
// Returns: 'CLOSED' | 'OPEN' | 'HALF_OPEN'

// Get detailed statistics
const stats = circuitBreakerService.getStats();
// Returns: CircuitStats object with:
// - state: Current circuit state
// - failureCount: Number of recent failures
// - successCount: Number of recent successes
// - lastFailureTime: Timestamp of last failure
// - lastStateChangeTime: Timestamp of last state change
// - failureThreshold: Configured failure threshold
// - timeoutWindow: Configured timeout window
// - retryInterval: Configured retry interval
```

### Health Check Endpoint Example

```typescript
@Controller('health')
export class HealthController {
  constructor(private circuitBreakerService: CircuitBreakerService) {}

  @Get('circuit')
  getCircuitHealth() {
    return {
      state: this.circuitBreakerService.getState(),
      stats: this.circuitBreakerService.getStats(),
      timestamp: new Date().toISOString(),
    };
  }
}
```

## Response Examples

### Timeout Response (503)

```json
{
  "statusCode": 503,
  "message": "Request timeout after 5023ms",
  "code": "TIMEOUT",
  "timestamp": "2026-03-27T14:30:00.000Z",
  "path": "/api/external-service"
}
```

### Circuit Open Response (503)

```json
{
  "statusCode": 503,
  "message": "Service temporarily unavailable",
  "code": "CIRCUIT_OPEN",
  "state": "OPEN",
  "timestamp": "2026-03-27T14:30:00.000Z",
  "path": "/api/external-service"
}
```

## Real-World Examples

### Protecting External API Calls

```typescript
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { CircuitBreakerService } from 'src/middleware/advanced';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ExternalApiService {
  constructor(
    private httpService: HttpService,
    private circuitBreaker: CircuitBreakerService,
  ) {}

  async callExternalApi(endpoint: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`https://api.example.com/${endpoint}`)
      );
      
      // Record success
      this.circuitBreaker.onSuccess();
      return response.data;
    } catch (error) {
      // Record failure
      this.circuitBreaker.onFailure(error);
      throw error;
    }
  }
}
```

### Selective Protection

```typescript
// Only protect routes that call external services
consumer
  .apply(timeoutMiddleware)
  .exclude('/health', '/metrics', '/static/*')
  .forRoutes('*');

consumer
  .apply(circuitBreakerMiddleware)
  .exclude('/health', '/internal/*')
  .forRoutes('/api/external/*');
```

## Testing

Run the included tests:

```bash
npm test -- src/middleware/advanced/*.spec.ts
```

The test suite covers:
- ✅ Timeout behavior and edge cases
- ✅ Circuit state transitions (all 3 states)
- ✅ Failure tracking and thresholds
- ✅ Recovery mechanisms
- ✅ Path exclusions
- ✅ Error handling
- ✅ Full state machine cycles

## Best Practices

### 1. Set Appropriate Timeouts
- Use shorter timeouts for user-facing requests (5-10s)
- Longer timeouts for background jobs (30-60s)
- Consider your SLA requirements

### 2. Tune Circuit Breaker Thresholds
- Start conservative: 5 failures, 30s retry
- Monitor and adjust based on actual failure patterns
- Consider time-of-day variations

### 3. Exclude Critical Paths
- Health check endpoints
- Internal service communication
- Static assets

### 4. Monitor Circuit State
- Expose metrics via health endpoints
- Alert on circuit open events
- Track state transition frequency

### 5. Combine with Retry Logic
- Use retry within the timeout window
- Implement exponential backoff
- Don't retry when circuit is open

## Troubleshooting

### Circuit Opens Too Frequently
- Increase failure threshold
- Reduce timeout window
- Review what counts as a failure
- Check external service health

### Requests Timing Out Unexpectedly
- Increase timeout duration
- Check for slow downstream services
- Review database query performance
- Monitor network latency

### Circuit Never Closes
- Verify retry interval is appropriate
- Check if requests are actually succeeding
- Review success threshold
- Manually reset if needed: `circuitBreakerService.reset()`

## Architecture Notes

### Implementation Details

**TimeoutMiddleware**:
- Wraps `next()` in `Promise.race()` against a `setTimeout`
- Uses wrapped callback to track completion
- Clears timeout on successful completion
- Logs warnings at 80% threshold

**CircuitBreakerService**:
- In-memory state machine
- Thread-safe counter operations
- Automatic state transitions
- Configurable thresholds and intervals

**CircuitBreakerMiddleware**:
- Wraps response to track status codes
- Records success/failure based on HTTP status
- Blocks requests when circuit is open
- Integrates with CircuitBreakerService

## Performance Considerations

- Minimal overhead (<1ms per request)
- In-memory state tracking (no DB calls)
- Non-blocking timeout implementation
- Safe for high-traffic applications

## Security Considerations

- Fails open by default (allows traffic on errors)
- Does not expose internal error details
- Rate limiting should be used separately
- Correlation IDs help with audit trails

## Related Documentation

- [Rate Limiting](../../docs/rate-limiting.md)
- [Error Handling](../../common/errors/error.filter.ts)
- [Health Checks](../../health/health.controller.ts)
- [Logging](../../common/logger/)

## Contributing

When modifying this module:
1. Maintain backward compatibility
2. Add tests for new features
3. Update documentation
4. Consider performance impact
5. Test under load

## License

Part of PropChain backend infrastructure.
