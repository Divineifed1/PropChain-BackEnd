# Users API error handling

`GET /users/:id` returned `200` with an empty body when the id was unknown or the account was deactivated, so clients could not tell "no such user" from success. It now responds `404 User not found`, matching the other lookups (`me/profile`, statistics). Authorization is unchanged: the route is still admin-only, so the response does not widen what a caller can learn.
