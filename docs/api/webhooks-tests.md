# Webhooks API tests

## Integration tests

`test/e2e/webhooks-controller.integration.spec.ts` boots the real
`WebhooksController` on Nest's HTTP stack and drives it with `supertest`, so the
full request path is covered:

- HTTP routing and status codes for every endpoint,
- the global `ValidationPipe` settings from `main.ts`
  (`whitelist`, `transform`, `forbidNonWhitelisted`),
- `JwtAuthGuard` wiring, and
- the `@CurrentUser()` decorator resolving to the authenticated user.

`WebhooksService` is replaced with a mock, so the tests never touch a database
and can assert exactly which arguments the controller forwards (for example
that the `id` path param and the current user id both reach the service).

### What is covered

| Area                                               | Cases                                                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Auth                                               | request with no valid bearer token is rejected (`403`), service untouched                                 |
| `POST /webhooks`                                   | creates for the current user; rejects a bad URL, an unknown event type and non-whitelisted fields (`400`) |
| `GET /webhooks`                                    | lists only the current user's webhooks                                                                    |
| `GET /webhooks/:id`                                | forwards `id` + user                                                                                      |
| `PATCH /webhooks/:id`                              | applies the validated body; rejects a non-boolean `isActive`                                              |
| `DELETE /webhooks/:id`                             | forwards `id` + user                                                                                      |
| `GET /webhooks/:id/deliveries`                     | returns the delivery log                                                                                  |
| `POST /webhooks/:id/deliveries/:deliveryId/replay` | replays a stored delivery                                                                                 |
| `POST /webhooks/:id/rotate-secret`                 | rotates and returns the new secret                                                                        |
| `POST /webhooks/:id/verify`                        | answers the challenge; rejects a non-string or missing challenge                                          |

### Running them

```bash
# just the webhooks integration suite
npx jest test/e2e/webhooks-controller.integration.spec.ts

# whole webhooks module (unit + integration)
npx jest webhooks
```

## Unit tests

`src/webhooks/webhooks.service.spec.ts` covers the service in isolation:
signature generation and verification, delivery retries, replay idempotency, the
URL validator and delivery-log pruning.
