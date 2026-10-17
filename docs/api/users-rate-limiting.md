# Users API rate limiting

`UsersRouteRateLimitGuard` + `@UsersRouteLimit({ max, windowMs })` limit costly or abusable routes per caller (the authenticated user id, falling back to the client address). Each route has its own counter.

| Route | Limit |
| --- | --- |
| `POST /users` (admin) | 10 per hour |
| `GET /users/search` (admin) | 60 per minute |
| `GET /users/me/statistics` | 30 per minute |
| `GET /users/me/login-history` | 30 per minute |

Over the limit the response is `429` with a `Retry-After` header. The guard runs after the JWT guard so the caller is known. Existing in-controller limits (data export download, reactivation) are unchanged.
