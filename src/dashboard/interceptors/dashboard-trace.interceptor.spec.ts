import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { DashboardTraceInterceptor } from './dashboard-trace.interceptor';

describe('DashboardTraceInterceptor', () => {
  let interceptor: DashboardTraceInterceptor;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  const buildContext = (request: any, handlerName = 'getDashboard'): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({ name: handlerName }),
    }) as unknown as ExecutionContext;

  const handler = (value: any): CallHandler => ({ handle: () => value }) as CallHandler;

  beforeEach(() => {
    interceptor = new DashboardTraceInterceptor();
    logSpy = jest.spyOn((interceptor as any).logger, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn((interceptor as any).logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('logs one line with the trace id and handler name on success', (done) => {
    const request = { traceId: 'trace-1', headers: {} };

    interceptor.intercept(buildContext(request), handler(of({ total: 1 }))).subscribe({
      next: () => {
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('[trace-1] dashboard.getDashboard ok'),
        );
        expect(warnSpy).not.toHaveBeenCalled();
        done();
      },
      error: done,
    });
  });

  it('falls back to the inbound request id when no trace id is set', (done) => {
    const request = { headers: { 'x-request-id': 'req-7' } };

    interceptor.intercept(buildContext(request), handler(of({}))).subscribe({
      next: () => {
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('[req-7] dashboard.getDashboard ok'),
        );
        done();
      },
      error: done,
    });
  });

  it('uses "untraced" when neither a trace id nor a request id is present', (done) => {
    interceptor.intercept(buildContext({ headers: {} }), handler(of({}))).subscribe({
      next: () => {
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('[untraced] dashboard.getDashboard ok'),
        );
        done();
      },
      error: done,
    });
  });

  it('logs a warn line with the status and error name on failure', (done) => {
    const error = Object.assign(new Error('nope'), { status: 403, name: 'ForbiddenException' });

    interceptor
      .intercept(
        buildContext({ traceId: 'trace-2', headers: {} }),
        handler(throwError(() => error)),
      )
      .subscribe({
        next: () => done.fail('should have errored'),
        error: (err) => {
          expect(err).toBe(error);
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining(
              '[trace-2] dashboard.getDashboard failed status=403 ForbiddenException',
            ),
          );
          expect(logSpy).not.toHaveBeenCalled();
          done();
        },
      });
  });

  it('defaults the failure status to 500 when the error carries none', (done) => {
    interceptor
      .intercept(
        buildContext({ traceId: 'trace-3', headers: {} }),
        handler(throwError(() => new Error('boom'))),
      )
      .subscribe({
        next: () => done.fail('should have errored'),
        error: () => {
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[trace-3] dashboard.getDashboard failed status=500'),
          );
          done();
        },
      });
  });

  it('propagates the success payload unchanged', (done) => {
    const payload = { stats: { views: 10 } };

    interceptor
      .intercept(buildContext({ traceId: 't', headers: {} }), handler(of(payload)))
      .subscribe({
        next: (value) => {
          expect(value).toEqual(payload);
          done();
        },
        error: done,
      });
  });
});
