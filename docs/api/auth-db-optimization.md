# Auth API database query optimisation

Changes in `AuthService`:

- **Refresh-token reuse detection** counted tokens in a family by fetching every row just to log the number; it now uses `count()`.
- **Logout everywhere** fetched all of a user's blacklisted refresh tokens only for `.length`; it now uses `count()`.
- **Dashboard** ran a query for the user's ten latest properties whose result was never used (removed), and fetched up to three API key rows to report their number. It now uses `apiKey.count()`, so `apiKeysCount` is the real number of keys rather than being capped at 3.
