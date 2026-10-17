# Users API injection hardening

`UserInjectionGuardPipe` screens the bodies of user create, update and profile-update requests and the admin search query. It answers `400` for:

- keys starting with `$` or containing `.` at any depth (operator and path injection),
- NUL bytes in any string,
- SQL comment or stacked-statement markers (`--`, `/*`, `; drop ...`) in the free-text search fields `q`, `email` and `name`,
- payloads nested deeper than 8 levels.

Queries already go through Prisma's parameterised API; the pipe rejects hostile input before it reaches the service.
