# Commissions API query optimisation

`CommissionsService` aggregated and wrote one row at a time. Both hot paths have
been collapsed to a bounded number of database round-trips.

## `createCommissionsForTransaction` — N+1 removed

Previously issued, for a transaction with `N` assigned agents:

1. `transaction.findUnique` (with `property.agents`)
2. `N` × `commission.findUnique` (one duplicate check per agent)
3. `N` × `commission.create` (one insert per agent)

That is `2N + 1` queries. It is now:

1. `transaction.findUnique`
2. `commission.findMany` — one query for the existing `(transactionId, agentId)`
   pairs, restricted to the assigned agents
3. `commission.createMany` — one insert for every agent that is actually missing

`3` queries regardless of how many agents are assigned. The duplicate check is
preserved: agents already holding a commission record are filtered out in memory
against the single `findMany` result, and when nothing is missing no insert is
issued at all.

## `getStats` — aggregates in the database, not in Node

### Admin

Previously:

- 3 × `commission.aggregate` (COMPLETED / PENDING / CANCELLED sums)
- 2 × `commission.count` (COMPLETED / PENDING)
- 1 × `commission.findMany` loading **every** commission together with its
  agent relation, then folding the per-agent totals in JavaScript

That is six round-trips, one of which scales with the total number of commission
rows in the table and pulls the whole table over the wire.

Now:

- 1 × `commission.groupBy(['status'])` with `_sum.amount` and `_count._all` —
  everything the five aggregate/count queries returned, in a single query
- 1 × `commission.groupBy(['agentId', 'status'])` — the per-agent breakdown,
  grouped in the database rather than in memory
- 1 × `user.findMany` for the (few) agents that appear in the breakdown, only
  when at least one commission exists

So six queries — one of them unbounded — become three, all bounded by the
number of statuses/agents rather than by the number of commission rows.

### Agent

Previously 2 × `aggregate` + 2 × `count` = 4 queries. Now a single
`commission.groupBy(['status'])` filtered by `agentId`.

## Why the response shape did not change

`getStats` returns the same fields as before (`totalEarned`, `totalPending`,
`totalCancelled`, `completedCount`, `pendingCount`, `agentStats` for admins;
`earned`, `pending`, `completedCount`, `pendingCount` for agents). Missing status
buckets default to zero, and `agentStats` still exposes `agentId`, `name`,
`email`, `earned` and `pending`, so no client changes are required.
