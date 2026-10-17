# Auth API structured logging

`AuthService` now uses the project's `AppLogger`. Security-relevant events are logged as a short constant message plus a metadata object with a stable `event` name, instead of interpolated sentences, so they can be filtered and alerted on in the JSON logs produced in production:

| `event` | Level | Fields |
| --- | --- | --- |
| `auth.refresh_token_reuse` | error | `userId`, `jti`, `family`, `ipAddress` |
| `auth.token_rotated` | log | `userId`, `emailHash`, `family`, `ipAddress` |
| `auth.logout` | log | `userId`, `emailHash`, `loggedOutAt` |
| `auth.blacklist_access_token_failed` / `auth.blacklist_refresh_token_failed` | warn | `userId`, `error` |
| `auth.lockout_email_failed` | error | `userId`, `emailHash`, `error` |
| `auth.captcha_failed` / `auth.captcha_error` | warn / error | `errorCodes` / `error` |
| `auth.verification_resent` | log | `userId` |
| `auth.password_reset_email_failed` | error | `userId`, `emailHash`, `error` |

Emails appear only as a short hash, and `AppLogger` redacts fields such as `password`, `token` and `secret` before writing.
