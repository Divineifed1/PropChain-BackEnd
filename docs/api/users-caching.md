# Users API Redis caching

`UsersService.getUserStatistics` (`GET /users/me/statistics`) is cached per user for 60 seconds through `UsersCacheService`, which uses the shared `CacheService` (Redis when configured).

- Key: `users:statistics:<userId>`; TTL 60s, so counts can be up to a minute stale.
- Read-through only: cache errors, or no cache being available, fall back to the database, so caching can never fail a request.
- Profile, role and permission data is deliberately **not** cached, because changes to it have to be visible immediately.
