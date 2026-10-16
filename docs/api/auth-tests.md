# Auth API tests

- **Unit** - `src/auth/security.utils.spec.ts` covers the crypto helpers behind login and 2FA: `sanitizeUser`, hashing/redaction, base32, backup codes, TOTP (RFC 6238 test vectors, window and trimming behaviour), otpauth/QR URLs and `parseDuration`.
- **Integration** - `test/e2e/auth-controller.integration.spec.ts` boots `AuthController` over HTTP with the same `ValidationPipe` settings as `main.ts`, mocked `AuthService` and guards: valid and invalid login/register/refresh/password-reset requests (400 for invalid, unknown fields rejected, service untouched), and guarded routes (`/auth/me`, `/auth/change-password`).

Run with `npx jest src/auth/security.utils.spec.ts test/e2e/auth-controller.integration.spec.ts`.
