import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { authRequestDurationSeconds, authRequestsTotal, outcomeForStatus } from '../auth-metrics';

/** Records `auth_requests_total` and `auth_request_duration_seconds` for each handler call. */
@Injectable()
export class AuthMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const operation = context.getHandler().name;
    const end = authRequestDurationSeconds.startTimer({ operation });

    const record = (status: number): void => {
      end();
      authRequestsTotal.inc({ operation, outcome: outcomeForStatus(status) });
    };

    return next.handle().pipe(
      tap({
        next: () => record(context.switchToHttp().getResponse().statusCode ?? 200),
        error: (err: { status?: number; getStatus?: () => number }) =>
          record(typeof err?.getStatus === 'function' ? err.getStatus() : (err?.status ?? 500)),
      }),
    );
  }
}
