# Auth API injection hardening

`CredentialInjectionPipe` runs on `POST /auth/register`, `/auth/login` and `/auth/refresh` and answers `400` for:

- object-valued fields (e.g. `{"email": {"$ne": null}}`) and nested objects in arrays,
- keys starting with `$` or containing `.`,
- NUL bytes,
- SQL comment or stacked-statement markers (`--`, `/*`, `; drop ...`) in free-text fields. Password, token and code fields are exempt because they may legitimately contain those characters.

Database access already goes through Prisma's parameterised queries; the pipe rejects hostile input before it reaches the service.
