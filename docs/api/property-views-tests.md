# Property Views API tests

## Integration tests

`test/e2e/property-views-controller.integration.spec.ts` boots the real
`PropertyViewsController` on Nest's HTTP stack and drives it with `supertest`, so
the full request path is covered:

- HTTP routing and status codes for every endpoint,
- the global `ValidationPipe` settings from `main.ts`
  (`whitelist`, `transform`, `forbidNonWhitelisted`),
- `ParseUUIDPipe` on the `:propertyId` param,
- the optional-auth guard (`authenticated` vs `anonymous`), and
- the controller's `x-forwarded-for` / `user-agent` extraction.

`PropertyViewsService` is replaced with a mock, so the tests never touch a
database and can assert exactly which arguments the controller forwards.

### What is covered

| Area                               | Cases                                                                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /property-views/:propertyId` | records an anonymous view using the first `x-forwarded-for` hop; attributes the view to the authenticated user when a token is present; rejects a non-UUID id and non-whitelisted body fields (`400`) |
| `GET /:propertyId/count`           | returns the lifetime count                                                                                                                                                                            |
| `GET /:propertyId/unique`          | returns the unique-visitor breakdown and parses `since` into a `Date`; rejects an invalid `since` (`400`)                                                                                             |
| `GET /:propertyId/history`         | forwards `skip` / `take` to the service                                                                                                                                                               |
| `GET /popular`                     | returns the most-viewed properties                                                                                                                                                                    |
| `GET /leaderboard`                 | shares the popular-properties implementation                                                                                                                                                          |

### Running them

```bash
# just the property-views integration suite
npx jest test/e2e/property-views-controller.integration.spec.ts

# whole module (unit + integration)
npx jest property-views
```

## Unit tests

`src/property-views/property-views.service.spec.ts` covers de-duplication,
counting, unique visitors, history and popular-property aggregation in
isolation.
