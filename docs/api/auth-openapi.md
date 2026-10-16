# Auth API OpenAPI documentation

The main `AuthController` operations now carry `@ApiOperation` summaries and `@ApiResponse` entries (success plus the documented 400/401/404/429 cases) so they appear described in Swagger: register, login, refresh, logout, logout-all, me, change-password, password-reset request/reset and verify-email.

Open the Swagger UI exposed by the app and look under the **Authentication** tag. Protected operations show the `access-token` bearer scheme through the existing `@ApiBearerAuth` decorators.
