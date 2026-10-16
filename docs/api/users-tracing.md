# Users API tracing

`UsersTraceInterceptor` is applied to every `UsersController` handler. Each call logs one line, `[traceId] users.<handler> ok <ms>ms` or `failed status=<code> <ErrorName> <ms>ms`.

The trace id is the one set by `TraceInterceptor` when present, otherwise `x-request-id`, otherwise `untraced`. Request bodies, headers and personal data are never logged.
