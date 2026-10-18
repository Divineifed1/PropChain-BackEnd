# Property API health check

`GET /properties/health` (no authentication) reports whether the Property API can do its job.

- `200` with `{ status: "up", checkedAt, checks: { database: { status, latencyMs } } }`
- `503` with the same shape and `status: "down"` when a read of the `properties` table fails or takes longer than 2 seconds.

The probe is a `findFirst({ select: { id: true } })`, so it is the cheapest read available and still proves the connection, the pool and the table are all usable. The timeout is raced with `Promise.race` and its timer is always cleared, so a slow database cannot leak a handle per probe.

`PropertiesHealthController` is registered **before** `PropertiesController` in `PropertiesModule`, so `GET /properties/health` is matched by the probe and not swallowed by `GET /properties/:id` — the same ordering issue the Users API had to solve.

Error details are never returned, so the probe cannot leak connection information.

This is separate from the platform-wide `/healthz` and `/readyz` probes: those report the process as a whole, this one reports specifically whether the database the Property API depends on is answering.
