# Property API tests

- **Unit** - `src/properties/properties.service.spec.ts` covers `PropertiesService` with a mocked Prisma client: creation (duplicate-address rejection, pending status, Decimal money fields, owner connection, fraud check and cache invalidation, tolerance of fraud/cache failures), lookups, and the soft-delete and restore rules (not found, owner/admin authorisation, archived/draft transitions).
- **Integration** - `test/e2e/properties-controller.integration.spec.ts` boots `PropertiesController` over HTTP with the same `ValidationPipe` settings as `main.ts`, mocked services and role-aware guards: public reads and the 404 contract, search routing and query coercion/validation, create validation and ownership, and role enforcement on update and delete.

Run with `npx jest src/properties/properties.service.spec.ts test/e2e/properties-controller.integration.spec.ts`.
