# Sessions API input sanitization

`src/sessions/sanitize.util.ts` normalises string input that arrives at the
Sessions API, before validation and before it reaches Prisma.

Two levels, matching what the field is used for:

| Helper               | Applied to               | Effect                                                                                          |
| -------------------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| `CleanText`          | `displayName`            | NFKC normalise, strip C0/C1 control characters, strip HTML tags, collapse whitespace runs, trim |
| `sanitizeIdentifier` | `:sessionId` route param | NFKC normalise, strip control characters, trim                                                  |

`CleanText` is wired in as a `class-transformer` `@Transform` callback on
`UpdateSessionDto`, which the global `ValidationPipe` already runs
(`transform: true`, `whitelist: true`, `forbidNonWhitelisted: true` in
`src/main.ts`), so nothing had to change in the pipe configuration. The
`:sessionId` path param is normalised explicitly in `SessionsController`, since
path params do not pass through a DTO.

`SessionsService.getSession`, `updateSession` and `revokeSession` also normalise
their `sessionId`, and `updateSession` re-sanitizes `displayName`, so a caller
that bypasses the DTO transforms cannot persist padded or tag-wrapped values.

Why this matters for these fields specifically:

- **Control characters and NUL** break Postgres text columns and make equality
  comparisons fail in ways that look like data corruption.
- **NFKC normalisation** stops visually identical session ids from being stored
  or looked up as different values.
- **Whitespace collapsing** keeps a display name from being padded out to look
  like a different device.
- **HTML tags** in a display name are not rendered anywhere in the API and are
  the usual vector for stored payloads that later get injected into a settings
  surface.

Behaviour that deliberately did _not_ change: values are only normalised, never
coerced. `displayName` remains optional and is left `undefined` when omitted, and
an over-long name is still rejected by `MaxLength` with `400`.
