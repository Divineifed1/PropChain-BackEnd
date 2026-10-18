# Property API injection hardening

`PropertyInjectionGuardPipe` screens the bodies of property create, update, status-transition, bulk, agent-assignment and amenity requests, plus the `GET /properties/search` query. It answers `400` for:

- keys starting with `$` or containing `.` at any depth (MongoDB operator injection and path traversal shapes),
- NUL bytes in any string,
- SQL comment or stacked-statement markers (`--`, `/*`, `; drop|delete|update|insert|alter|truncate …`) in the free-text fields `location`, `title`, `description`, `address`, `city`, `state`, `zipCode`, `country`, `propertyType`, `category`, `tag`, `filter`, `reason`, `hoaName` and `hoaContactInfo`,
- payloads nested deeper than 8 levels.

## Why this is not already covered

The global `ValidationPipe` runs with `whitelist: true, forbidNonWhitelisted: true`, which rejects unknown keys **at the top level of a body**. That check does not descend into values: a `$`-prefixed key inside a nested object, or a dotted key inside an array element, is not what `whitelist` inspects. The pipe walks the whole structure, including array elements (`propertyIds[0]`, `tags[2]`), so those shapes are caught before they reach the service.

Search is the highest-value target here because it is the one **unauthenticated** route whose values are used to build predicates, and because `location`, `category` and `tag` all end up in `contains`/`has` filters.

## Defence in depth

Prisma parameterises every query, so a payload that got through would be bound rather than concatenated. This pipe is the earlier layer: it rejects hostile input outright instead of relying on the ORM being careful. Neither layer replaces the other.
