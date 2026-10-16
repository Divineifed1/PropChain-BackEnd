# Users API tests

- **Unit** - `src/users/users.service.spec.ts` covers `UsersService` with a mocked Prisma client: account creation (hashed password, secrets stripped, history/preferences seeded, referral-code collision retry, referrer linking), active-only lookups, block/unblock, verify/unverify, removal, referral stats and login history.
- **Integration** - `test/e2e/users-controller.integration.spec.ts` boots `UsersController` over HTTP with the same `ValidationPipe` settings as `main.ts`, mocked services and role-aware guards: authentication and admin-role enforcement, `GET /users/:id` including the 404 case, body validation for create and update (invalid values, unknown fields), search query coercion and rejection, and the self-service `me/*` routes.

Run with `npx jest src/users/users.service.spec.ts test/e2e/users-controller.integration.spec.ts`.
