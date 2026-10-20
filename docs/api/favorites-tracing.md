# Favorites API tracing

`FavoritesTraceInterceptor` is applied to every `FavoritesController` handler.
Each call logs exactly one line:

```
[1f0c…] favorites.add ok 12ms
[1f0c…] favorites.add failed status=404 NotFoundException 3ms
```

The trace id is the one set by the platform `TraceInterceptor` when present,
otherwise the inbound `x-request-id`, otherwise the literal `untraced`. That lets
a single favorites call be followed across the log stream without any
client-side correlation plumbing.

Outcomes are split by log level — `log` for success, `warn` for failure with the
status and error class — so a dashboard can alert on failures without parsing
message text. A failure with no `status` property defaults to `500`.

## What is deliberately not logged

Request bodies, headers and any other personal data are never included. A
favorites call is tied to a user's identity and the properties they saved;
logging the body would put both into log aggregation. Only the handler name,
trace id, outcome and duration are emitted.

## Wiring

The interceptor is registered on the controller:

```ts
@ApiTags('Favorites')
@UseInterceptors(FavoritesTraceInterceptor)
@Controller('favorites')
export class FavoritesController {}
```

and provided by `FavoritesModule` so Nest can resolve it.

## Tests

`src/favorites/interceptors/favorites-trace.interceptor.spec.ts` covers the
trace-id resolution chain (trace id → request id → `untraced`), the success and
failure log shapes, the default `500` status, and that the payload is passed
through unchanged.
