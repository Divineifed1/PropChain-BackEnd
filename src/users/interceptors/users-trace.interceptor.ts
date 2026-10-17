import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Traces each Users API handler: one log line per call with the trace id set by
 * `TraceInterceptor` (or the request id), handler name, outcome and duration.
 * Bodies, headers and personal data are never logged.
 */
@Injectable()
export class UsersTraceInterceptor implements NestInterceptor {
  private readonly logger = new Logger('UsersTrace');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const span = `users.${context.getHandler().name}`;
    const traceId: string = request.traceId ?? request.headers?.['x-request-id'] ?? 'untraced';
    const started = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.logger.log(`[${traceId}] ${span} ok ${Date.now() - started}ms`),
        error: (err: { status?: number; name?: string }) =>
          this.logger.warn(
            `[${traceId}] ${span} failed status=${err?.status ?? 500} ${err?.name ?? 'Error'} ${Date.now() - started}ms`,
          ),
      }),
    );
  }
}
