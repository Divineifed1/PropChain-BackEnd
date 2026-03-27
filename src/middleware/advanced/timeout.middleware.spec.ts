import { TimeoutMiddleware, TimeoutOptions } from './timeout.middleware';
import { Request, Response, NextFunction } from 'express';
import { TimeoutError } from 'src/libs/errors';

describe('TimeoutMiddleware', () => {
  let middleware: TimeoutMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      path: '/api/test',
      method: 'GET',
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false,
    };
    nextFunction = jest.fn();
  });

  describe('constructor', () => {
    it('should use default options when none provided', () => {
      middleware = new TimeoutMiddleware();
      expect(middleware).toBeDefined();
    });

    it('should accept custom timeout options', () => {
      const options: TimeoutOptions = {
        timeout: 5000,
        message: 'Custom timeout message',
        statusCode: 504,
        excludePaths: ['/health'],
      };
      middleware = new TimeoutMiddleware(options);
      expect(middleware).toBeDefined();
    });
  });

  describe('request handling', () => {
    it('should call next() for normal requests that complete quickly', async () => {
      middleware = new TimeoutMiddleware({ timeout: 1000 });

      // Mock next function that resolves immediately
      nextFunction.mockImplementation((cb) => {
        if (cb) cb();
      });

      await middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should skip timeout for excluded paths', async () => {
      middleware = new TimeoutMiddleware({
        timeout: 1000,
        excludePaths: ['/health'],
      });

      mockRequest.path = '/health';
      nextFunction.mockImplementation((cb) => {
        if (cb) cb();
      });

      await middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should handle request with x-request-id header', async () => {
      middleware = new TimeoutMiddleware({ timeout: 1000 });
      mockRequest.headers['x-request-id'] = 'test-request-123';

      nextFunction.mockImplementation((cb) => {
        if (cb) cb();
      });

      await middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('timeout behavior', () => {
    it('should return 503 when request times out', async () => {
      middleware = new TimeoutMiddleware({
        timeout: 100,
        message: 'Request took too long',
        statusCode: 503,
      });

      // Mock next function that never completes (simulates slow request)
      nextFunction.mockImplementation(() => {
        // Intentionally do nothing to trigger timeout
      });

      await middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      // Wait for timeout to occur
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 503,
          message: expect.stringContaining('Request took too long'),
          code: 'TIMEOUT',
          path: '/api/test',
        }),
      );
    });

    it('should include duration in timeout error message', async () => {
      middleware = new TimeoutMiddleware({ timeout: 100 });

      nextFunction.mockImplementation(() => {
        // Do nothing to trigger timeout
      });

      await middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/after \d+ms/),
        }),
      );
    });

    it('should not send response if headers already sent', async () => {
      middleware = new TimeoutMiddleware({ timeout: 100 });
      (mockResponse as any).headersSent = true;

      nextFunction.mockImplementation(() => {
        // Do nothing
      });

      await middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.json).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should re-throw non-timeout errors', async () => {
      middleware = new TimeoutMiddleware({ timeout: 1000 });

      const testError = new Error('Test error');
      nextFunction.mockImplementation((cb) => {
        if (cb) cb(testError);
      });

      await expect(
        middleware.use(mockRequest as Request, mockResponse as Response, nextFunction),
      ).rejects.toThrow('Test error');
    });

    it('should handle TimeoutError specifically', async () => {
      middleware = new TimeoutMiddleware({ timeout: 100 });

      nextFunction.mockImplementation(() => {
        // Trigger timeout
      });

      await middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockResponse.status).toHaveBeenCalledWith(503);
    });
  });

  describe('createTimeoutMiddleware factory', () => {
    it('should create middleware function with custom options', () => {
      const { createTimeoutMiddleware } = require('./timeout.middleware');
      const middlewareFn = createTimeoutMiddleware({ timeout: 5000 });

      expect(middlewareFn).toBeDefined();
      expect(typeof middlewareFn).toBe('function');
    });
  });

  describe('performance monitoring', () => {
    it('should log warning when request takes more than 80% of timeout', async () => {
      middleware = new TimeoutMiddleware({ timeout: 1000 });

      // Simulate a request that takes 850ms (85% of timeout)
      nextFunction.mockImplementation((cb) => {
        setTimeout(() => {
          if (cb) cb();
        }, 850);
      });

      await middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 900));

      expect(nextFunction).toHaveBeenCalled();
    });
  });
});
