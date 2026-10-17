# Users API health check

`GET /users/health` (no authentication) reports whether the Users API can do its job.

- `200` with `{ status: "up", checkedAt, checks: { database: { status, latencyMs } } }`
- `503` with the same shape and `status: "down"` when a read of the `users` table fails or takes longer than 2 seconds.

The controller is registered before `UsersController` so the path is not captured by `GET /users/:id`. Error details are never returned. It is separate from the platform-wide `/healthz` and `/readyz` probes.
