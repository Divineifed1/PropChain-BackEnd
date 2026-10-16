# Auth API rate limiting

`AuthRouteRateLimitGuard` + `@AuthRouteLimit({ max, windowMs })` limit sensitive unauthenticated routes per client address (hashed before storage). Each client has its own counter per route, so one abusive client cannot lock out everyone else.

| Route | Limit |
| --- | --- |
| `POST /auth/register` | 5 per hour |
| `POST /auth/refresh` | 30 per 15 min |
| `POST /auth/password-reset/request` | 5 per hour |
| `POST /auth/password-reset/reset` | 10 per hour |
| `POST /auth/verify-email` | 10 per 15 min |
| `POST /auth/email/resend` | 3 per hour |

Over the limit the response is `429` with a `Retry-After` header. Login keeps its existing account/IP lockout (`LoginRateLimitService`). Note: the `ENDPOINT_RATE_LIMITS` table is a single bucket shared by all clients, so it was not used here.
