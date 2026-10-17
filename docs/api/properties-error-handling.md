# Property API error handling

- `GET /properties/:id` returned `200` with an empty body for an unknown id. It now answers `404 Property with ID <id> not found`, consistent with update, delete and restore.
- `POST /properties`: after the property row is written, a failure in the fraud evaluation or in cache invalidation used to turn the whole request into a `500`. The client would retry and then hit "A property with this address already exists" for its own record. Both steps are now caught and logged (`properties.fraud_evaluation_failed`, `properties.cache_invalidation_failed`), and the created property is returned.
