# Auth API pagination

`GET /auth/api-keys` accepts `page` (>= 1) and `limit` (1-100, default 20).

- With neither parameter the response is the plain array it has always been, so existing clients are unaffected.
- With either, the response is `{ data, meta: { page, limit, total, totalPages, hasNext } }`, newest first, with `id` as a tie-breaker so pages are stable.
- Invalid values (page 0, limit above 100, non-numbers) return `400`.
