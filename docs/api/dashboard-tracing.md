# Dashboard API tracing

`DashboardTraceInterceptor` is applied to every `DashboardController` handler.
Each call logs exactly one line:

```
[1f0c…] dashboard.getDashboard ok 87ms
[1f0c…] dashboard.getDashboard failed status=403 ForbiddenException 4ms
```

The trace id is the one set by the platform `TraceInterceptor` when present,
otherwise the inbound `x-request-id`, otherwise the literal `untraced`. That lets
a dashboard render be followed across the log stream without any client-side
correlation plumbing.

Outcomes are split by log level — `log` for success, `warn` for failure with the
status and error class — so a dashboard can alert on failures without parsing
message text. A failure with no `status` property defaults to `500`.

## What is deliberately not logged

Request bodies, headers and any other personal data are never included. The
dashboard endpoint is per-user and its payload is a summary of that user's
properties, transactions and activity; only the handler name, trace id, outcome
and duration are emitted.

## Wiring

The interceptor is registered on the controller:

```ts
@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@UseInterceptors(DashboardTraceInterceptor)
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {}
```

and provided by `DashboardModule` so Nest can resolve it.

## Tests

`src/dashboard/interceptors/dashboard-trace.interceptor.spec.ts` covers the
trace-id resolution chain (trace id → request id → `untraced`), the success and
failure log shapes, the default `500` status, and that the payload is passed
through unchanged.
