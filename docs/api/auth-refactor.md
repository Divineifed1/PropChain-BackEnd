# Auth API refactor: password handling

`changePassword` and `resetPassword` duplicated three blocks. They now share private helpers in `AuthService`:

- `assertPasswordMeetsPolicy` - complexity check, 400 listing the broken rules,
- `assertPasswordNotReused` - compares against recent hashes, 400 if reused,
- `recordPasswordHistory` - stores the new hash and trims history beyond the retention limit.

Behaviour, error messages and the transaction boundaries are unchanged; each method is roughly 25 lines shorter and the reuse and retention rules now live in one place.
