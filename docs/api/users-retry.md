# Users API retry with backoff

`retryWithBackoff` (`src/users/retry.util.ts`) retries a failing call with exponential backoff (doubling from the base delay, capped, with up to 50% jitter) and rethrows the last error when attempts run out.

Used for the email-change verification emails (initial send and resend): up to 3 attempts, so a transient mail-provider error does not lose the email. If every attempt fails the existing behaviour applies: the error is logged and the request still succeeds, as before.
