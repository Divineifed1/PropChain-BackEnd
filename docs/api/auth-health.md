# Auth API health check

`GET /auth/health` (no authentication) reports whether the Auth API can do its job.

- `200` with `{ status: "up", checkedAt, checks: { database: { status, latencyMs } } }`
- `503` with the same shape and `status: "down"` when the database check fails or takes longer than 2 seconds.

Only the database is checked because sessions and refresh tokens depend on it. Error details are never returned. This is separate from the platform-wide `/healthz` and `/readyz` probes.
