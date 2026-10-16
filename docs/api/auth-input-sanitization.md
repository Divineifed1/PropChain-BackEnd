# Auth API input sanitization

`RegisterDto` and `LoginDto` normalise input through class-transformer (the global `ValidationPipe` already runs with `transform: true`):

- `email`: Unicode NFKC normalisation, control characters removed, surrounding whitespace trimmed. The case is **not** changed, so existing accounts keep matching.
- `firstName` / `lastName`: additionally strip HTML tags and collapse whitespace.
- Passwords and tokens are never altered.

Sanitising happens before validation, so `"  user@example.com "` is accepted as `user@example.com` and a name consisting only of tags becomes empty and fails `@IsNotEmpty`. Helpers live in `src/auth/sanitize.util.ts`.
