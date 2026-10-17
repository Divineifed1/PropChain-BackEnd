# Auth API tracing

`AuthTraceInterceptor` is applied to every `AuthController` handler. Each call logs one line, `[traceId] auth.<handler> ok <ms>ms` or `failed status=<code> <ErrorName> <ms>ms`.

The trace id is the one set by `TraceInterceptor` when present, otherwise `x-request-id`, otherwise `untraced`. Request bodies, headers, tokens and passwords are never logged.
