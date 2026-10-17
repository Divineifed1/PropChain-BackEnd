# Users API database query optimisation

- **`GET /users/me/statistics`** loaded the user together with every property and every buyer/seller transaction row just to report their lengths. It now selects two columns plus Prisma `_count` aggregates, so the database counts and no rows are transferred.
- **`GET /users/me/login-history`** returned the entire history, which grows without bound. It now returns the newest 100 entries (same ordering and fields).
