# Property API pagination

`GET /properties` accepts `page` (>= 1) and `limit` (1–100, default 20).

- **With neither parameter** the response is the plain array it has always been, so existing clients are unaffected.
- **With either**, the response is `{ data, meta: { page, limit, total, totalPages, hasNext } }`.

`total` comes from a `count()` over the same `where` clause as the page, issued in the same `$transaction` as the rows, so the count and the page cannot disagree. `findAll` is unchanged and still available for callers that just want the rows; `findAllPaginated` is the new path.

Out-of-range values return `400`. Note that because the handler now takes a validated query DTO, an **unknown** query parameter on `GET /properties` is now rejected too — consistent with `GET /properties/search` and with the global `forbidNonWhitelisted: true`.

## Search

`GET /properties/search` already paged via `page`/`limit` and already capped `limit` at 100, so it is unchanged. It returns its own shape (`items` + `total` + `totalPages`), which is left alone so existing search clients are not broken.

## Query efficiency

The owner and assigned-agent payload that both listing reads attach was identical and is now defined once (`listingRelations`), and the "active and not deleted" filter once (`buildListingWhere`), so the list and the paginated list cannot drift apart.
