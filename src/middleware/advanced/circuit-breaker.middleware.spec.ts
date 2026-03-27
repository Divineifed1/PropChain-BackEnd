import { CircuitBreakerService, CircuitBreakerMiddleware, CircuitBreakerOptions, CircuitState } from './circuit-breaker.middleware';
import { Request, Response, NextFunction } from 'express';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(() => {
    service = new CircuitBreakerService({
      failureThreshold: 3,
      timeoutWindow: 1000,
      retryInterval: 500,
      successThreshold: 2,
    });
  });

  describe('initialization', () => {
    it('should start in CLOSED state', () => {
      expect(service.getState()).toBe(CircuitState.CLOSED);
    });

    it('should use default options when none provided', () => {
      const defaultService = new CircuitBreakerService();
      expect(defaultService).toBeDefined();
      expect(defaultService.getState()).toBe(CircuitState.CLOSED);
    });

    it('should accept custom configuration options', () => {
      const options: CircuitBreakerOptions = {
        failureThreshold: 5,
        timeoutWindow: 60000,
        retryInterval: 30000,
        successThreshold: 3,
        message: 'Custom message',
      };
      const customService = new CircuitBreakerService(options);
      expect(customService).toBeDefined();
    });
  });

  describe('state transitions', () => {
    it('should transition to OPEN after reaching failure threshold', () => {
      // Record failures up to threshold
      for (let i = 0; i < 3; i++) {
        service.onFailure(new Error(`Failure ${i}`));
      }

      expect(service.getState()).toBe(CircuitState.OPEN);
    });

    it('should transition from OPEN to HALF_OPEN after retry interval', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        service.onFailure(new Error(`Failure ${i}`));
      }

      expect(service.getState()).toBe(CircuitState.OPEN);

      // Wait for retry interval
      await new Promise(resolve => setTimeout(resolve, 550));

      const state = service.getState();
      expect(state).toBe(CircuitState.HALF_OPEN);
    });

    it('should transition from HALF_OPEN to CLOSED after success threshold', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        service.onFailure(new Error(`Failure ${i}`));
      }

      // Wait for retry interval
      await new Promise(resolve => setTimeout(resolve, 550));

      expect(service.getState()).toBe(CircuitState.HALF_OPEN);

      // Record successes
      for (let i = 0; i < 2; i++) {
        service.onSuccess();
      }

      expect(service.getState()).toBe(CircuitState.CLOSED);
    });

    it('should transition from HALF_OPEN back to OPEN on failure', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        service.onFailure(new Error(`Failure ${i}`));
      }

      // Wait for retry interval
      await new Promise(resolve => setTimeout(resolve, 550));

      expect(service.getState()).toBe(CircuitState.HALF_OPEN);

      // Record a failure
      service.onFailure(new Error('Failure in HALF_OPEN'));

      expect(service.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('canExecute', () => {
    it('should allow requests when CLOSED', () => {
      expect(service.canExecute()).toBe(true);
    });

    it('should block requests when OPEN', () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        service.onFailure(new Error(`Failure ${i}`));
      }

      expect(service.canExecute()).toBe(false);
    });

    it('should allow requests when HALF_OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        service.onFailure(new Error(`Failure ${i}`));
      }

      // Wait for retry interval
      await new Promise(resolve => setTimeout(resolve, 550));

      expect(service.canExecute()).toBe(true);
    });
  });

  describe('failure tracking', () => {
    it('should increment failure count on failure', () => {
      const statsBefore = service.getStats();
      service.onFailure(new Error('Test failure'));
      const statsAfter = service.getStats();

      expect(statsAfter.failureCount).toBe(statsBefore.failureCount + 1);
    });

    it('should reset failure count on success in CLOSED state', () => {
      // Record some failures
      service.onFailure(new Error('Failure 1'));
      service.onFailure(new Error('Failure 2'));

      const statsBefore = service.getStats();
      service.onSuccess();
      const statsAfter = service.getStats();

      expect(statsAfter.failureCount).toBeLessThan(statsBefore.failureCount);
    });

    it('should track last failure time', () => {
      const beforeTime = Date.now();
      service.onFailure(new Error('Test failure'));
      const afterTime = Date.now();

      const stats = service.getStats();
      expect(stats.lastFailureTime).toBeDefined();
      expect(stats.lastFailureTime!).toBeGreaterThanOrEqual(beforeTime);
      expect(stats.lastFailureTime!).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('getStats', () => {
    it('should return current circuit statistics', () => {
      const stats = service.getStats();

      expect(stats).toEqual({
        state: CircuitState.CLOSED,
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        lastStateChangeTime: expect.any(Number),
        failureThreshold: 3,
        timeoutWindow: 1000,
        retryInterval: 500,
      });
    });

    it('should update stats after failures', () => {
      service.onFailure(new Error('Failure 1'));
      service.onFailure(new Error('Failure 2'));

      const stats = service.getStats();
      expect(stats.failureCount).toBe(2);
      expect(stats.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker to initial state', () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        service.onFailure(new Error(`Failure ${i}`));
      }

      expect(service.getState()).toBe(CircuitState.OPEN);

      // Reset
      service.reset();

      expect(service.getState()).toBe(CircuitState.CLOSED);
      expect(service.getStats().failureCount).toBe(0);
      expect(service.getStats().successCount).toBe(0);
    });
  });

  describe('failure status codes', () => {
    it('should identify failure status codes', () => {
      expect(service.isFailureStatusCode(500)).toBe(true);
      expect(service.isFailureStatusCode(502)).toBe(true);
      expect(service.isFailureStatusCode(503)).toBe(true);
      expect(service.isFailureStatusCode(504)).toBe(true);
    });

    it('should not identify success codes as failures', () => {
      expect(service.isFailureStatusCode(200)).toBe(false);
      expect(service.isFailureStatusCode(201)).toBe(false);
      expect(service.isFailureStatusCode(204)).toBe(false);
    });

    it('should accept custom failure status codes', () => {
      const customService = new CircuitBreakerService({
        failureStatusCodes: [400, 401, 403],
      });

      expect(customService.isFailureStatusCode(400)).toBe(true);
      expect(customService.isFailureStatusCode(401)).toBe(true);
      expect(customService.isFailureStatusCode(500)).toBe(false);
    });
  });
});

describe('CircuitBreakerMiddleware', () => {
  let middleware: CircuitBreakerMiddleware;
  let service: CircuitBreakerService;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;

  beforeEach(() => {
    service = new CircuitBreakerService({
      failureThreshold: 2,
      excludePaths: ['/health'],
    });
    middleware = new CircuitBreakerMiddleware(service);

    mockRequest = {
      path: '/api/test',
      method: 'GET',
    };
    mockResponse = {
      statusCode: 200,
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      end: jest.fn(),
    };
    nextFunction = jest.fn();
  });

  describe('request handling', () => {
    it('should allow requests when circuit is CLOSED', async () => {
      nextFunction.mockImplementation((cb) => {
        if (cb) cb();
      });

      await middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should block requests when circuit is OPEN', async () => {
      // Open the circuit
      service.onFailure(new Error('Failure 1'));
      service.onFailure(new Error('Failure 2'));

      await middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 503,
          message: 'Service temporarily unavailable',
          code: 'CIRCUIT_OPEN',
        }),
      );
    });

    it('should skip circuit breaker for excluded paths', async () => {
      mockRequest.path = '/health';
      nextFunction.mockImplementation((cb) => {
        if (cb) cb();
      });

      await middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });
  });

  describe('response tracking', () => {
    it('should record success on 2xx response', async () => {
      mockResponse.statusCode = 200;
      nextFunction.mockImplementation((cb) => {
        if (cb) cb();
      });

      await middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      // Trigger response end
      const endCall = (mockResponse.end as jest.Mock).mock.calls[0];
      if (endCall) endCall[3](); // Call the original end function

      expect(service.getStats().successCount).toBeGreaterThan(0);
    });

    it('should record failure on 5xx response', async () => {
      mockResponse.statusCode = 500;
      nextFunction.mockImplementation((cb) => {
        if (cb) cb();
      });

      await middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      // Trigger response end
      const endCall = (mockResponse.end as jest.Mock).mock.calls[0];
      if (endCall) endCall[3]();

      expect(service.getStats().failureCount).toBeGreaterThan(0);
    });

    it('should handle exceptions in next()', async () => {
      const error = new Error('Test error');
      nextFunction.mockRejectedValue(error);

      await expect(
        middleware.use(mockRequest as Request, mockResponse as Response, nextFunction),
      ).rejects.toThrow('Test error');

      expect(service.getStats().failureCount).toBe(1);
    });
  });

  describe('createCircuitBreaker factory', () => {
    it('should create service and middleware with custom options', () => {
      const { createCircuitBreaker } = require('./circuit-breaker.middleware');
      const { service, middleware } = createCircuitBreaker({
        failureThreshold: 10,
        retryInterval: 60000,
      });

      expect(service).toBeDefined();
      expect(middleware).toBeDefined();
      expect(service.getStats().failureThreshold).toBe(10);
    });
  });
});

describe('CircuitBreaker - Full State Machine Flow', () => {
  let service: CircuitBreakerService;

  beforeEach(() => {
    service = new CircuitBreakerService({
      failureThreshold: 2,
      retryInterval: 300,
      successThreshold: 2,
    });
  });

  it('should complete full cycle: CLOSED → OPEN → HALF_OPEN → CLOSED', async () => {
    // Start CLOSED
    expect(service.getState()).toBe(CircuitState.CLOSED);
    expect(service.canExecute()).toBe(true);

    // Transition to OPEN (2 failures)
    service.onFailure(new Error('Failure 1'));
    service.onFailure(new Error('Failure 2'));

    expect(service.getState()).toBe(CircuitState.OPEN);
    expect(service.canExecute()).toBe(false);

    // Wait for retry interval to transition to HALF_OPEN
    await new Promise(resolve => setTimeout(resolve, 350));

    expect(service.getState()).toBe(CircuitState.HALF_OPEN);
    expect(service.canExecute()).toBe(true);

    // Transition back to CLOSED (2 successes)
    service.onSuccess();
    service.onSuccess();

    expect(service.getState()).toBe(CircuitState.CLOSED);
    expect(service.canExecute()).toBe(true);
  });

  it('should handle multiple cycles', async () => {
    // First cycle
    service.onFailure(new Error('Fail 1'));
    service.onFailure(new Error('Fail 2'));
    expect(service.getState()).toBe(CircuitState.OPEN);

    await new Promise(resolve => setTimeout(resolve, 350));
    expect(service.getState()).toBe(CircuitState.HALF_OPEN);

    service.onSuccess();
    service.onSuccess();
    expect(service.getState()).toBe(CircuitState.CLOSED);

    // Second cycle
    service.onFailure(new Error('Fail 3'));
    service.onFailure(new Error('Fail 4'));
    expect(service.getState()).toBe(CircuitState.OPEN);
  });

  it('should re-open circuit on failure in HALF_OPEN', async () => {
    // Open circuit
    service.onFailure(new Error('Fail 1'));
    service.onFailure(new Error('Fail 2'));
    expect(service.getState()).toBe(CircuitState.OPEN);

    // Transition to HALF_OPEN
    await new Promise(resolve => setTimeout(resolve, 350));
    expect(service.getState()).toBe(CircuitState.HALF_OPEN);

    // Fail immediately
    service.onFailure(new Error('Fail in half-open'));
    expect(service.getState()).toBe(CircuitState.OPEN);
  });
});
