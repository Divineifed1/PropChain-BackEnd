import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { FavoritesTraceInterceptor } from './favorites-trace.interceptor';

describe('FavoritesTraceInterceptor', () => {
  let interceptor: FavoritesTraceInterceptor;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  const buildContext = (request: any, handlerName = 'list'): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({ name: handlerName }),
    }) as unknown as ExecutionContext;

  const handler = (value: any): CallHandler => ({ handle: () => value }) as CallHandler;

  beforeEach(() => {
    interceptor = new FavoritesTraceInterceptor();
    logSpy = jest.spyOn((interceptor as any).logger, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn((interceptor as any).logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('logs one line with the trace id and handler name on success', (done) => {
    const request = { traceId: 'trace-1', headers: {} };

    interceptor.intercept(buildContext(request, 'add'), handler(of({ ok: true }))).subscribe({
      next: () => {
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[trace-1] favorites.add ok'));
        expect(warnSpy).not.toHaveBeenCalled();
        done();
      },
      error: done,
    });
  });

  it('falls back to the inbound request id when no trace id is set', (done) => {
    const request = { headers: { 'x-request-id': 'req-9' } };

    interceptor.intercept(buildContext(request, 'list'), handler(of([]))).subscribe({
      next: () => {
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[req-9] favorites.list ok'));
        done();
      },
      error: done,
    });
  });

  it('uses "untraced" when neither a trace id nor a request id is present', (done) => {
    const request = { headers: {} };

    interceptor.intercept(buildContext(request, 'remove'), handler(of({}))).subscribe({
      next: () => {
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('[untraced] favorites.remove ok'),
        );
        done();
      },
      error: done,
    });
  });

  it('logs a warn line with the status and error name on failure', (done) => {
    const request = { traceId: 'trace-2', headers: {} };
    const error = Object.assign(new Error('nope'), { status: 404, name: 'NotFoundException' });

    interceptor
      .intercept(buildContext(request, 'add'), handler(throwError(() => error)))
      .subscribe({
        next: () => done.fail('should have errored'),
        error: (err) => {
          expect(err).toBe(error);
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[trace-2] favorites.add failed status=404 NotFoundException'),
          );
          expect(logSpy).not.toHaveBeenCalled();
          done();
        },
      });
  });

  it('defaults the failure status to 500 when the error carries none', (done) => {
    const request = { traceId: 'trace-3', headers: {} };

    interceptor
      .intercept(buildContext(request, 'list'), handler(throwError(() => new Error('boom'))))
      .subscribe({
        next: () => done.fail('should have errored'),
        error: () => {
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[trace-3] favorites.list failed status=500'),
          );
          done();
        },
      });
  });

  it('propagates the success payload unchanged', (done) => {
    const payload = { items: [1, 2, 3] };

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
