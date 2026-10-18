# Property API tracing

`PropertiesTraceInterceptor` is applied to every `PropertiesController` handler. Each call logs exactly one line:

```
[1f0c…] properties.create ok 143ms
[1f0c…] properties.transitionStatus failed status=400 BadRequestException 8ms
```

The trace id is the one set by the platform `TraceInterceptor` when present, otherwise the inbound `x-request-id`, otherwise the literal `untraced`. That makes a single listing call followable across the log stream without any client-side correlation plumbing.

Outcomes are split by log level — `log` for success, `warn` for failure with the status and error class — so a dashboard can alert on failures without parsing messages.

## What is deliberately not logged

Request bodies, headers, addresses and any other personal data are never included. A listing create carries an owner's identity and a full address; logging it would put both into log aggregation, which is exactly where they should not end up. The `AppLogger` used elsewhere in the module additionally redacts fields such as `password`, `token` and `secret`.
