# Auth API Prometheus metrics

Exposed on the existing `/metrics` endpoint:

| Metric | Type | Labels |
| --- | --- | --- |
| `auth_requests_total` | counter | `operation` (controller handler name), `outcome` (`success`, `client_error`, `server_error`) |
| `auth_request_duration_seconds` | histogram | `operation` |

`AuthMetricsInterceptor` records both for every `AuthController` handler. Labels are bounded (a fixed set of handler names and three outcomes), so cardinality does not grow with user input. Example alert: rate of `auth_requests_total{outcome="server_error"}` above a threshold.
