# Property API refactor: search filter building

`PropertiesService` had grown to over 1200 lines, and `buildSearchWhereClause`
alone was a 155-line private method. It was hard to review because the filter
logic was mixed in with the rest of a 1200-line service, even though it is a pure
function: it reads a `SearchPropertiesDto`, does no I/O, and uses no `this`.

The method moved verbatim to `src/properties/search-where.builder.ts` as an
exported `buildSearchWhereClause(dto)`. `searchProperties` now calls the module
function.

The body was moved **unchanged** — no filter was added, removed or reordered. It
preserves the quirks it always had:

- `bedrooms` and `bathrooms` exact filters take precedence over the corresponding
  `min`/`max` range filters,
- the public search endpoint only ever exposes `ACTIVE` properties, regardless of
  any `status` the caller passes,
- `location` matches address, city, state and zipCode with `OR`,
- a radius search is approximated with a bounding box (1 degree of latitude is
  about 111 km) and is rejected unless `lat`/`lng` are supplied together,
- a bounding box and a radius may be combined; the two are merged into a single
  `latitude`/`longitude` range rather than overwriting each other.

The geo validation still throws `BadRequestException`, which is why the module
imports from `@nestjs/common` rather than being a totally framework-free module.
