# Users API OpenAPI documentation

The main `UsersController` operations now carry `@ApiOperation` summaries and `@ApiResponse` entries (success plus the documented 400/401/403/404 cases): create, list, search, get by id, update, `me/statistics`, `me/profile` (get and update) and `me/login-history`.

Open the Swagger UI exposed by the app and look under the **Users** tag. Protected operations show the `access-token` bearer scheme through the existing `@ApiBearerAuth` decorator.
