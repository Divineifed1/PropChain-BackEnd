# Property API input sanitization

`src/properties/sanitize.util.ts` normalises every string that arrives in a
property write body, before validation and before it reaches Prisma.

Two levels, matching what the field is used for:

| Helper                | Applied to                                                                   | Effect                                                                                          |
| --------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `CleanText`           | `title`, `description`, `hoaName`, `hoaContactInfo`                          | NFKC normalise, strip C0/C1 control characters, strip HTML tags, collapse whitespace runs, trim |
| `TrimIdentifier`      | `address`, `city`, `state`, `zipCode`, `country`, `propertyType`, `category` | NFKC normalise, strip control characters, trim                                                  |
| `CleanIdentifierList` | `features`, `tags`, `hoaAmenities`                                           | `TrimIdentifier` on each element                                                                |

They are wired in as `class-transformer` `@Transform` callbacks on
`CreatePropertyDto` and `UpdatePropertyDto`, which the global `ValidationPipe`
already runs (`transform: true`, `whitelist: true`, `forbidNonWhitelisted: true`
in `src/main.ts`), so nothing had to change in the pipe configuration.

Why this matters for these fields specifically:

- **Control characters and NUL** break Postgres text columns and make equality
  comparisons fail in ways that look like data corruption.
- **NFKC normalisation** stops visually identical values (`K` vs `K`, full-width
  digits) from being stored as different listings and defeating the duplicate
  address check in `create`.
- **HTML tags** in a listing description are not rendered anywhere in the API and
  are the usual vector for stored payloads that later get injected into an admin
  surface.
- **Whitespace collapsing** keeps a padded title from sorting or displaying
  differently from an unpadded one.

Behaviour that deliberately did _not_ change: values are only normalised, never
rejected. Invalid input still fails validation with `400`, exactly as before, so
no existing client starts receiving errors it did not get already.
