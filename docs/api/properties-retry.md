# Property API retry with backoff

`retryWithBackoff` (`src/properties/retry.util.ts`) retries a failing call with
exponential backoff — doubling from the base delay, capped at `maxDelayMs`, with
up to 50% jitter so concurrent callers do not retry in lockstep — and rethrows the
last error once the attempts run out.

## Where it is used

Geocoding is the only outbound call the Property API makes, and it runs inside
`attemptGeocode` on property create and on an address change. It now runs under
`retryWithBackoff` with **3 attempts**, 200 ms base delay, 2 s cap.

`isTransientGeocodeError` decides what is worth retrying:

| Retried | Not retried |
| --- | --- |
| `429 Too Many Requests` | any other `4xx` — the request itself is wrong |
| `5xx` | |
| `TimeoutError` / `AbortError` | |
| socket errors: `ECONNRESET`, `ECONNREFUSED`, `EAI_AGAIN`, `ENOTFOUND`, `socket hang up`, `fetch failed` | |

A `4xx` other than `429` means the provider rejected the address, and repeating
the same call cannot change the answer — retrying it would only waste the
per-minute geocoding budget that `attemptGeocode` already tracks.

## Behaviour that deliberately did not change

- **Exhausting the retries does not fail the request.** A property without
  coordinates is still created, and `markGeocodingFailed` is still called, so the
  previous behaviour of degrading rather than erroring is preserved. A transient
  provider outage costs a little latency instead of the whole create.
- **A provider that legitimately finds nothing** returns `null`, not an error, so
  it is never retried.
- The geocoding rate limit (`checkGeocodeRateLimit`) is checked once, before the
  retries, so a retry storm cannot exceed the configured per-minute quota.

`sleep` and `random` are injectable, so the delay schedule can be asserted in a
unit test without waiting in real time.
