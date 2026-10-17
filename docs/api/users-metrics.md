# Users API Prometheus metrics

Exposed on the existing `/metrics` endpoint:

| Metric | Type | Labels |
| --- | --- | --- |
| `users_requests_total` | counter | `operation` (controller handler name), `outcome` (`success`, `client_error`, `server_error`) |
| `users_request_duration_seconds` | histogram | `operation` |

`UsersMetricsInterceptor` records both for every `UsersController` handler. Labels are bounded (a fixed set of handler names and three outcomes), so cardinality does not grow with user input.
