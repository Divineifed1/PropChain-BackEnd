/**
 * Example: Integrating Advanced Middleware in PropChain
 * 
 * This file demonstrates how to integrate the timeout and circuit breaker
 * middleware into your NestJS application.
 */

import { Module, NestModule, MiddlewareConsumer, Injectable, Controller, Get } from '@nestjs/common';
import { 
  TimeoutMiddleware, 
  CircuitBreakerService, 
  CircuitBreakerMiddleware,
  createCircuitBreaker,
} from 'src/middleware/advanced';

// ============================================================================
// Example 1: Basic Integration in App Module
// ============================================================================

@Module({})
export class AppModule implements NestModule {
  private circuitBreakerService: CircuitBreakerService;

  configure(consumer: MiddlewareConsumer) {
    // Apply timeout to all routes except health checks
    consumer
      .apply(
        new TimeoutMiddleware({
          timeout: 10000, // 10 seconds
          excludePaths: ['/health', '/metrics', '/static'],
        }),
      )
      .exclude('/health', '/metrics')
      .forRoutes('*');

    // Apply circuit breaker to external API routes
    const { service, middleware } = createCircuitBreaker({
      failureThreshold: 5,
      retryInterval: 30000,
      successThreshold: 3,
      excludePaths: ['/internal'],
    });

    this.circuitBreakerService = service;

    consumer
      .apply(middleware)
      .exclude('/internal/*')
      .forRoutes('/api/external/*');
  }
}

// ============================================================================
// Example 2: Health Check Controller
// ============================================================================

@Controller('health')
export class HealthController {
  constructor(private circuitBreakerService: CircuitBreakerService) {}

  @Get('circuit')
  getCircuitHealth() {
    const stats = this.circuitBreakerService.getStats();
    return {
      state: stats.state,
      failureCount: stats.failureCount,
      successCount: stats.successCount,
      lastFailureTime: stats.lastFailureTime,
      isHealthy: stats.state !== 'OPEN',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('circuit/reset')
  resetCircuit() {
    this.circuitBreakerService.reset();
    return {
      message: 'Circuit breaker reset',
      state: this.circuitBreakerService.getState(),
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================================================
// Example 3: Service with Manual Circuit Breaker Control
// ============================================================================

@Injectable()
export class ExternalApiService {
  constructor(private circuitBreaker: CircuitBreakerService) {}

  async callExternalApi(endpoint: string) {
    // Check if circuit allows the request
    if (!this.circuitBreaker.canExecute()) {
      throw new Error('Circuit breaker is open - service unavailable');
    }

    try {
      // Your external API call here
      const response = await fetch(`https://api.example.com/${endpoint}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Record success
      this.circuitBreaker.onSuccess();
      return await response.json();
    } catch (error) {
      // Record failure
      this.circuitBreaker.onFailure(error);
      throw error;
    }
  }
}

// ============================================================================
// Example 4: Feature-Specific Module
// ============================================================================

@Module({
  controllers: [PaymentController],
  providers: [PaymentService],
})
export class PaymentModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Strict timeout and circuit breaker for payment APIs
    consumer
      .apply(
        new TimeoutMiddleware({
          timeout: 5000, // 5 seconds for payments
          message: 'Payment service timeout',
        }),
      )
      .forRoutes('api/payment/*');

    const { middleware } = createCircuitBreaker({
      failureThreshold: 3, // Very sensitive for payments
      retryInterval: 10000, // Quick retry
      successThreshold: 5, // Require more successes to close
      message: 'Payment service temporarily unavailable',
    });

    consumer.apply(middleware).forRoutes('api/payment/*');
  }
}

@Controller('api/payment')
export class PaymentController {
  @Get('status')
  getPaymentStatus() {
    return { status: 'operational' };
  }
}

@Injectable()
export class PaymentService {
  processPayment(amount: number) {
    // Payment processing logic
    return { success: true, amount };
  }
}

// ============================================================================
// Example 5: Monitoring Dashboard Data
// ============================================================================

@Controller('admin/middleware')
export class AdminMiddlewareController {
  constructor(
    private timeoutMiddleware: TimeoutMiddleware,
    private circuitBreakerService: CircuitBreakerService,
  ) {}

  @Get('stats')
  getMiddlewareStats() {
    const circuitStats = this.circuitBreakerService.getStats();

    return {
      circuitBreaker: {
        state: circuitStats.state,
        health: circuitStats.state === 'CLOSED' ? 'healthy' : 'degraded',
        failures: circuitStats.failureCount,
        uptime: circuitStats.state === 'OPEN' ? 'degraded' : 'normal',
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('alerts')
  getAlerts() {
    const stats = this.circuitBreakerService.getStats();
    const alerts = [];

    if (stats.state === 'OPEN') {
      alerts.push({
        severity: 'critical',
        type: 'CIRCUIT_OPEN',
        message: 'Circuit breaker is open - external service may be down',
        timestamp: new Date().toISOString(),
      });
    }

    if (stats.failureCount > stats.failureThreshold * 0.8) {
      alerts.push({
        severity: 'warning',
        type: 'HIGH_FAILURE_RATE',
        message: `Approaching circuit breaker threshold (${stats.failureCount}/${stats.failureThreshold})`,
        timestamp: new Date().toISOString(),
      });
    }

    return { alerts, timestamp: new Date().toISOString() };
  }
}

// ============================================================================
// Example 6: Conditional Middleware Based on Environment
// ============================================================================

@Module({})
export class DynamicMiddlewareModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    const isProduction = process.env.NODE_ENV === 'production';

    // Stricter timeouts in production
    const timeout = isProduction ? 5000 : 30000;

    consumer
      .apply(
        new TimeoutMiddleware({
          timeout,
          message: isProduction 
            ? 'Request timeout - please try again' 
            : 'Development timeout',
        }),
      )
      .forRoutes('*');

    // Only enable circuit breaker in production
    if (isProduction) {
      const { middleware } = createCircuitBreaker({
        failureThreshold: 5,
        retryInterval: 30000,
      });

      consumer.apply(middleware).forRoutes('/api/*');
    }
  }
}

// ============================================================================
// Example 7: Testing Setup
// ============================================================================

describe('Middleware Integration Test', () => {
  it('should handle timeout correctly', async () => {
    const timeoutMiddleware = new TimeoutMiddleware({ timeout: 100 });
    
    const mockRequest = { path: '/test', method: 'GET', headers: {} };
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false,
    };
    const nextFunction = jest.fn();

    await timeoutMiddleware.use(
      mockRequest as any,
      mockResponse as any,
      nextFunction,
    );

    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(mockResponse.status).toHaveBeenCalledWith(503);
    expect(mockResponse.json).toHaveBeenCalled();
  });

  it('should handle circuit breaker state transitions', () => {
    const service = new CircuitBreakerService({
      failureThreshold: 2,
      retryInterval: 100,
    });

    // Start CLOSED
    expect(service.getState()).toBe('CLOSED');

    // Trigger failures
    service.onFailure(new Error('Fail 1'));
    service.onFailure(new Error('Fail 2'));

    // Should be OPEN
    expect(service.getState()).toBe('OPEN');
    expect(service.canExecute()).toBe(false);
  });
});
