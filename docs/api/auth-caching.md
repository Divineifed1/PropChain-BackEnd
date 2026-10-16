# Auth API Redis caching

`GET /auth/me/dashboard`-style dashboard data (`AuthService.getDashboard`) is cached per user for 30 seconds through `AuthCacheService`, which uses the shared `CacheService` (Redis when configured).

- Key: `auth:dashboard:<userId>`; TTL 30s, so data can be up to 30 seconds stale.
- Read-through only: cache errors, or no cache being available, fall back to computing the response, so caching can never fail a request.
- Token, session and API-key checks are deliberately **not** cached, because revocation has to take effect immediately.
