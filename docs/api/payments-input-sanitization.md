# Payment API input sanitization

`src/payment/sanitize.util.ts` normalises every string that arrives in a payment
write body, before validation and before the value is stored or echoed back.

Two levels, matching what the field is used for:

| Helper           | Applied to        | Effect                                                                                          |
| ---------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| `CleanText`      | `reference`       | NFKC normalise, strip C0/C1 control characters, strip HTML tags, collapse whitespace runs, trim |
| `TrimIdentifier` | `currency`, `:id` | NFKC normalise, strip control characters, trim                                                  |

They are wired in as `class-transformer` `@Transform` callbacks on
`CreatePaymentDto`, which the global `ValidationPipe` already runs
(`transform: true`, `whitelist: true`, `forbidNonWhitelisted: true` in
`src/main.ts`), so nothing had to change in the pipe configuration. The `:id`
route param is normalised explicitly in `PaymentController.findOne`, since path
params do not pass through the DTO.

`PaymentService.create` also re-sanitizes `currency` and `reference`. The
service is documented as safe to call directly (from another module or a unit
test) and not only behind the `ValidationPipe`, so a direct caller that bypasses
the DTO transforms cannot persist padded or tag-wrapped values.

Why this matters for these fields specifically:

- **Control characters and NUL** break Postgres text columns and make equality
  comparisons fail in ways that look like data corruption.
- **NFKC normalisation** stops visually identical values (full-width digits,
  compatibility forms) from being stored as different references.
- **Whitespace collapsing** is what makes the duplicate-reference check in
  `create` meaningful: `"ref-1"`, `" ref-1 "` and `"ref-1\n"` must all collapse
  to the same value, otherwise a caller can create the same payment twice.
- **HTML tags** in a reference are not rendered anywhere in the API and are the
  usual vector for stored payloads that later get injected into an admin
  surface.
- **Trimming before validation** means a currency code like `" USD "` is
  matched by the `IsIn` allow-list instead of being rejected for a stray space.

Behaviour that deliberately did _not_ change: values are only normalised, never
silently coerced. A reference that sanitizes down to an empty string is rejected
with `400`, and an unknown currency still fails the `IsIn` check with `400`, so
no valid client starts receiving errors it did not get already.
