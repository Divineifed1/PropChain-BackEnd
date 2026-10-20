# Fraud API input sanitization

`src/fraud/sanitize.util.ts` normalises the free-text and identifier fields that
arrive in fraud write bodies, before validation and before they are persisted.

Two levels, matching what the field is used for:

| Helper           | Applied to       | Effect                                                                                          |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| `CleanText`      | `note`, `reason` | NFKC normalise, strip C0/C1 control characters, strip HTML tags, collapse whitespace runs, trim |
| `TrimIdentifier` | `action`         | NFKC normalise, strip control characters, trim                                                  |

They are wired in as `class-transformer` `@Transform` callbacks on
`ReviewFraudAlertDto`, `AddFraudInvestigationNoteDto` and `BlockFraudUserDto`,
which the global `ValidationPipe` already runs (`transform: true`,
`whitelist: true`, `forbidNonWhitelisted: true` in `src/main.ts`), so nothing had
to change in the pipe configuration.

`FraudService.addInvestigationNote` and `blockUserFromAlert` also re-sanitize
their inputs. The service is documented as safe to call directly (from another
module or a unit test) and not only behind the `ValidationPipe`, so a direct
caller that bypasses the DTO transforms cannot persist padded or tag-wrapped
values into the investigation trail.

Why this matters for these fields specifically:

- **Control characters and NUL** break Postgres text columns and make equality
  comparisons fail in ways that look like data corruption.
- **NFKC normalisation** stops visually identical values from being stored as
  different actions.
- **Whitespace collapsing** keeps a note from being padded out or broken across
  lines in the review UI.
- **HTML tags** in an investigation note are not rendered anywhere in the API and
  are the usual vector for stored payloads that later get injected into an admin
  surface.
- **Trimming the action first** means `" REVIEWED "` is matched by the workflow
  logic instead of being treated as a different action.

Behaviour that deliberately did _not_ change: values are only normalised, never
silently coerced. An omitted optional field stays `undefined`, and a block with
no reason still falls back to the default message.
