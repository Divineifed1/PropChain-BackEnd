# Property API OpenAPI documentation

Every `PropertiesController` route now carries `@ApiOperation` (with a stable
`operationId`), `@ApiParam`, `@ApiBody`, `@ApiProduces` and the `@ApiResponse`
status codes the route actually returns, including the 401/403 role gates that
were previously undocumented.

The project does **not** enable the `@nestjs/swagger` CLI plugin
(`nest-cli.json` has no `plugins` entry), so `@ApiBody({ type: SomeDto })` alone
would emit an empty schema. `@ApiProperty` / `@ApiPropertyOptional` were
therefore added to the DTOs referenced by a body:

| DTO | Used by |
| --- | --- |
| `CreatePropertyDto` | `POST /properties` |
| `UpdatePropertyDto` | `PUT /properties/:id` |
| `TransitionPropertyStatusDto` | `PATCH /properties/:id/status` |
| `BulkPropertyStatusUpdateDto` / `BulkPropertyDeleteDto` / `BulkPropertyExportDto` | `POST /properties/bulk/*` |
| `CreateAmenityDto` / `UpdateAmenityDto` | `POST`/`PATCH /properties/:id/amenities` |

`AssignAgentDto` / `UpdateAgentAssignmentDto` already carried `@ApiProperty`.

Examples are given for the fields where the accepted format is not obvious
(price, currency, enum values, date-time, URI and UUID formats), and `status` on
`UpdatePropertyDto` points at `PATCH /properties/:id/status`, which is the route
that enforces the lifecycle workflow.

## Coverage left for the listing routes

`GET /properties` and `GET /properties/search` are documented separately in
`listings-openapi.md`, together with the full filter list of
`SearchPropertiesDto`.
