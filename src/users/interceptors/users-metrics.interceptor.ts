import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { usersOutcomeForStatus, usersRequestDurationSeconds, usersRequestsTotal } from '../users-metrics';

/** Records `users_requests_total` and `users_request_duration_seconds` for each handler call. */
@Injectable()
export class UsersMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const operation = context.getHandler().name;
    const end = usersRequestDurationSeconds.startTimer({ operation });

    const record = (status: number): void => {
      end();
      usersRequestsTotal.inc({ operation, outcome: usersOutcomeForStatus(status) });
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
