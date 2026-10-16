# Auth API error handling

`POST /auth/password-reset/request` no longer fails when the reset email cannot be sent. Previously a mail-provider error propagated as a `500`, which let a caller tell registered addresses (500) from unknown ones (silent success). The failure is now caught and logged (`auth.password_reset_email_failed`, with the user id and a hash of the email, never the address or token), and the response is the same as for an unknown address.

The reset token is still created, so a retry from the user produces a fresh token and email.
