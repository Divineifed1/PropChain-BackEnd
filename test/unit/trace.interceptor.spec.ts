import { TraceInterceptor } from '../../src/tracing/trace.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { randomUUID } from 'crypto';

// Mock the randomUUID function
jest.mock('crypto', () => ({
  randomUUID: jest.fn(),
}));

describe('TraceInterceptor', () => {
  let interceptor: TraceInterceptor;
  let mockExecutionContext: Partial<ExecutionContext>;
  let mockCallHandler: Partial<CallHandler>;
  let mockRequest: any;
  let mockResponse: any;
  let mockSwitchToHttp: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create the interceptor
    interceptor = new TraceInterceptor();

    // Setup mocks for request and response
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      setHeader: jest.fn(),
    };
    mockSwitchToHttp = {
      getRequest: jest.fn().mockReturnValue(mockRequest),
      getResponse: jest.fn().mockReturnValue(mockResponse),
    };

    // Setup execution context mock
    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue(mockSwitchToHttp),
      getClass: jest.fn().mockReturnValue({ name: 'TestController' }),
      getHandler: jest.fn().mockReturnValue({ name: 'testHandler' }),
    };

    // Setup call handler mock
    mockCallHandler = {
      handle: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should generate a traceId per request and set it on the request', (done) => {
    // Arrange
    const testTraceId = 'test-trace-id-123';
    (randomUUID as jest.Mock).mockReturnValue(testTraceId);
    mockCallHandler.handle = jest.fn().mockReturnValue(of({ success: true }));

    // Act
    interceptor
      .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
      .subscribe({
        next: () => {
          // Assert
          expect(randomUUID).toHaveBeenCalledTimes(1);
          expect(mockRequest.headers['x-trace-id']).toBe(testTraceId);
          expect(mockRequest.traceId).toBe(testTraceId);
          done();
        },
        error: done,
      });
  });

  it('should set the X-Trace-Id response header on successful requests', (done) => {
    // Arrange
    const testTraceId = 'test-trace-id-456';
    (randomUUID as jest.Mock).mockReturnValue(testTraceId);
    mockCallHandler.handle = jest.fn().mockReturnValue(of({ success: true }));

    // Act
    interceptor
      .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
      .subscribe({
        next: () => {
          // Assert
          expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Trace-Id', testTraceId);
          done();
        },
        error: done,
      });
  });

  it('should propagate the success response and complete normally', (done) => {
    // Arrange
    const expectedResponse = { data: 'test data' };
    (randomUUID as jest.Mock).mockReturnValue('test-trace-id');
    mockCallHandler.handle = jest.fn().mockReturnValue(of(expectedResponse));

    // Act
    interceptor
      .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
      .subscribe({
        next: (actualResponse) => {
          // Assert
          expect(actualResponse).toEqual(expectedResponse);
          done();
        },
        error: done,
      });
  });

  it('should propagate errors on the error path', (done) => {
    // Arrange
    const testError = new Error('Test error message');
    (randomUUID as jest.Mock).mockReturnValue('test-trace-id-789');
    mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => testError));

    // Act
    interceptor
      .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
      .subscribe({
        next: () => {
          done.fail('Should have thrown an error');
        },
        error: (error) => {
          // Assert
          expect(error).toBe(testError);
          // Response header should NOT be set on error (matches current implementation)
          expect(mockResponse.setHeader).not.toHaveBeenCalled();
          done();
        },
      });
  });

  it('should generate a new traceId for each separate request', (done) => {
    // Arrange
    const firstTraceId = 'first-trace-id';
    const secondTraceId = 'second-trace-id';
    (randomUUID as jest.Mock).mockReturnValueOnce(firstTraceId).mockReturnValueOnce(secondTraceId);

    const firstCallHandler = {
      handle: jest.fn().mockReturnValue(of({ first: true })),
    };
    const secondCallHandler = {
      handle: jest.fn().mockReturnValue(of({ second: true })),
    };

    // Act - first request
    interceptor
      .intercept(mockExecutionContext as ExecutionContext, firstCallHandler as CallHandler)
      .subscribe({
        next: () => {
          // First request assertions
          expect(mockRequest.headers['x-trace-id']).toBe(firstTraceId);
          expect(mockRequest.traceId).toBe(firstTraceId);

          // Reset request mock for second request
          mockRequest.headers = {};
          delete mockRequest.traceId;

          // Second request
          interceptor
            .intercept(mockExecutionContext as ExecutionContext, secondCallHandler as CallHandler)
            .subscribe({
              next: () => {
                // Second request assertions
                expect(randomUUID).toHaveBeenCalledTimes(2);
                expect(mockRequest.headers['x-trace-id']).toBe(secondTraceId);
                expect(mockRequest.traceId).toBe(secondTraceId);
                done();
              },
              error: done,
            });
        },
        error: done,
      });
  });

  describe('Sampling boundaries and slow/error trace behavior (#1251)', () => {
    const originalEnv = process.env;
    let loggerLogSpy: jest.SpyInstance;
    let loggerErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      process.env = { ...originalEnv };
      loggerLogSpy = jest.spyOn((interceptor as any).logger, 'log').mockImplementation(() => {});
      loggerErrorSpy = jest
        .spyOn((interceptor as any).logger, 'error')
        .mockImplementation(() => {});
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('does not emit start or completed logs when sample rate is 0 and request is fast', (done) => {
      process.env.TRACE_SAMPLE_RATE = '0';
      (randomUUID as jest.Mock).mockReturnValue('unsampled-fast-trace');
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ ok: true }));

      interceptor
        .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
        .subscribe({
          next: () => {
            expect(loggerLogSpy).not.toHaveBeenCalled();
            expect(mockResponse.setHeader).toHaveBeenCalledWith(
              'X-Trace-Id',
              'unsampled-fast-trace',
            );
            done();
          },
          error: done,
        });
    });

    it('always logs slow requests even when sample rate is 0', (done) => {
      process.env.TRACE_SAMPLE_RATE = '0';
      process.env.TRACE_SLOW_THRESHOLD_MS = '50';
      (randomUUID as jest.Mock).mockReturnValue('slow-trace-id');

      // Mock Date.now to simulate a slow request (> 50ms)
      const realDateNow = Date.now;
      let callCount = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 1000 : 1100; // 100ms duration
      });

      mockCallHandler.handle = jest.fn().mockReturnValue(of({ slow: true }));

      interceptor
        .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
        .subscribe({
          next: () => {
            // start log was not sampled, but completed log was emitted because duration was 100ms > 50ms
            expect(loggerLogSpy).toHaveBeenCalledWith(
              expect.stringContaining(
                '[slow-trace-id] TestController.testHandler - completed (100ms)',
              ),
            );
            Date.now = realDateNow;
            done();
          },
          error: (err) => {
            Date.now = realDateNow;
            done(err);
          },
        });
    });

    it('always logs failed requests even when sample rate is 0', (done) => {
      process.env.TRACE_SAMPLE_RATE = '0';
      (randomUUID as jest.Mock).mockReturnValue('failed-trace-id');
      const testError = new Error('Database connection failed');
      mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => testError));

      interceptor
        .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
        .subscribe({
          next: () => done.fail('Should fail'),
          error: () => {
            expect(loggerErrorSpy).toHaveBeenCalledWith(
              expect.stringContaining('[failed-trace-id] TestController.testHandler - failed'),
            );
            done();
          },
        });
    });

    it('logs both start and completed when sample rate is 1', (done) => {
      process.env.TRACE_SAMPLE_RATE = '1';
      (randomUUID as jest.Mock).mockReturnValue('sampled-100-trace');
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ success: true }));

      interceptor
        .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
        .subscribe({
          next: () => {
            expect(loggerLogSpy).toHaveBeenCalledWith(
              expect.stringContaining('[sampled-100-trace] TestController.testHandler - started'),
            );
            expect(loggerLogSpy).toHaveBeenCalledWith(
              expect.stringContaining('[sampled-100-trace] TestController.testHandler - completed'),
            );
            done();
          },
          error: done,
        });
    });

    it('correctly samples based on Math.random boundary', (done) => {
      process.env.TRACE_SAMPLE_RATE = '0.5';
      const randomSpy = jest.spyOn(Math, 'random');

      // First request: random is 0.4 (< 0.5) -> sampled
      randomSpy.mockReturnValueOnce(0.4);
      (randomUUID as jest.Mock).mockReturnValueOnce('boundary-sampled');
      mockCallHandler.handle = jest.fn().mockReturnValue(of({}));

      interceptor
        .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
        .subscribe({
          next: () => {
            expect(loggerLogSpy).toHaveBeenCalledWith(
              expect.stringContaining('[boundary-sampled] TestController.testHandler - started'),
            );

            loggerLogSpy.mockClear();

            // Second request: random is 0.6 (>= 0.5) -> unsampled
            randomSpy.mockReturnValueOnce(0.6);
            (randomUUID as jest.Mock).mockReturnValueOnce('boundary-unsampled');

            interceptor
              .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
              .subscribe({
                next: () => {
                  expect(loggerLogSpy).not.toHaveBeenCalled();
                  randomSpy.mockRestore();
                  done();
                },
                error: (err) => {
                  randomSpy.mockRestore();
                  done(err);
                },
              });
          },
          error: (err) => {
            randomSpy.mockRestore();
            done(err);
          },
        });
    });
  });
});
