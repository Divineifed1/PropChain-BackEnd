# Support Tickets API query optimisation

Two hot paths issued one query per row. Both are now bounded.

## `getTicketMetrics` — 4 counts → 2 queries

Previously ran four independent `count` calls: total, open
(`NEW`/`IN_PROGRESS`/`WAITING_ON_CUSTOMER`), resolved (`RESOLVED`/`CLOSED`) and
SLA-breached.

Because every ticket carries exactly one status, three of those counts are
derivable from a single `groupBy(['status'])`:

- `total` = sum of the group sizes,
- `open` / `resolved` = the sum of the groups whose status is in each bucket.

Only the SLA-breach count needs its own query (it is a boolean flag, not a
status). That is **4 → 2** queries, and the two remaining ones run concurrently.

The `@@index([status])` and `@@index([priority, status])` indexes on
`support_tickets` already cover the grouped query.

## `checkSlaBreaches` — N+1 update removed

The scheduled SLA sweep loaded every breached ticket and then issued **one
`update` per ticket** to set `slaBreached = true`. On a busy queue that is one
round-trip per breach every five minutes.

It now issues a single `updateMany` over the affected ids, then logs and
notifies per ticket (notifications are inherently per-agent and are left as-is).
When there are no breaches, no write is issued at all.

## Response shapes unchanged

`getTicketMetrics` still returns `{ total, open, resolved, breached }` and the
SLA sweep still flips `slaBreached` for exactly the same set of tickets and emits
the same notifications, so nothing downstream changes.
