# Property API structured logging

`PropertiesService` now uses the project's `AppLogger`. Events are a short constant message plus a metadata object with a stable `event` name, so the JSON logs produced in production can be filtered and alerted on:

| `event` | Level | Fields |
| --- | --- | --- |
| `properties.created` | log | `propertyId`, `ownerId` |
| `properties.deleted` | warn | `propertyId`, `userId` |
| `properties.restored` | log | `propertyId`, `userId` |
| `properties.fraud_evaluation_failed` | error | `propertyId`, `error` |
| `properties.cache_invalidation_failed` | warn | `propertyId`, `error` |
| `properties.geocode_rate_limited` | warn | `propertyId` |

No addresses or personal data are logged; `AppLogger` also redacts fields such as `password`, `token` and `secret`.
