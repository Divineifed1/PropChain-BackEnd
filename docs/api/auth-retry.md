# Auth API retry with backoff

`retryWithBackoff` (`src/auth/retry.util.ts`) retries a failing call with exponential backoff (doubling from the base delay, capped, with up to 50% jitter) and rethrows the last error when attempts run out or `isRetryable` says stop.

Used for:

- the reCAPTCHA verification request: up to 3 attempts, retried on network errors, `429` and `5xx` (other responses are final). If it still fails the existing behaviour applies (verification fails closed).
- sending the password reset email: up to 3 attempts, so a transient mail-provider error does not silently lose the email. Persistent failure still propagates as before.

Login and token operations are not retried: they are not idempotent from the caller's side and failures there are authoritative.
