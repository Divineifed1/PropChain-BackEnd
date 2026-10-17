# Users API input sanitization

`CreateUserDto`, `UpdateUserDto` and the admin `SearchUsersDto` normalise input through class-transformer (the global `ValidationPipe` already runs with `transform: true`):

- `email` (and the search `email` filter): Unicode NFKC normalisation, control characters removed, surrounding whitespace trimmed. The case is **not** changed, so existing accounts keep matching.
- `firstName`, `lastName`, search `q` and `name`: additionally strip HTML tags and collapse whitespace.
- Passwords are never altered.

Sanitising happens before validation, so a name made only of tags becomes empty. Helpers live in `src/users/sanitize.util.ts`.
