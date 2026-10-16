# Users API structured logging

`UsersService` now uses the project's `AppLogger`. Events are logged as a short constant message plus a metadata object with a stable `event` name, so the JSON logs produced in production can be filtered and alerted on:

| `event` | Level | Fields |
| --- | --- | --- |
| `users.created` | log | `userId`, `emailHash` |
| `users.blocked` | warn | `userId` |
| `users.unblocked` | log | `userId` |
| `users.deleted` | warn | `userId` |
| `users.deactivated` | log | `userId`, `emailHash`, `scheduledDeletionAt` |
| `users.reactivation_token_generated` | log | `userId`, `emailHash` |
| `users.reactivated` | log | `userId`, `emailHash` |
| `users.deactivated_purged` | log | `deletedCount` |
| `users.export_file_deleted` | log | `file` |

Emails appear only as a short hash. The reactivation-token log line previously contained the raw email address; that is fixed. `AppLogger` also redacts fields such as `password`, `token` and `secret` before writing.
