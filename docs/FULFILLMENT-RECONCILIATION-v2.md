# Atomic fulfillment reconciliation, review version 2

This extends the local mitigation in draft PR1. It is not deployed and no remote database migration, order, live tick, provider request, email or production setting was changed. Paid work remains disabled by default, with the no-spend guard active. Version1 review and original defect reproduction remain preserved.

## Corrected defect

The old reconciliation handler inserted a charge before conditionally changing shot state. Two concurrent requests could insert two charges for the same render. It now verifies provider status outside the transaction, then calls one database RPC. The RPC locks the shot row, inserts or reuses its uniquely keyed Higgsfield charge, validates amount/order/video ownership, and queues the shot with its provider request ID atomically. Repeated calls with the winning ID return the same queued result; a different ID cannot replace it.

The unique partial index allows one Higgsfield ledger entry per nonnull shot ID. It does not change other providers' records. Historical duplicate charges deliberately make migration002fail rather than deleting or rewriting ledger history. The migration is wrapped in a transaction. An operator must audit historical duplicates before applying it. No audit or migration against the live database occurred here.

The RPC uses security invoker, an empty search path and qualified table names. Execute is revoked from PUBLIC, anon and authenticated, then granted to service_role. Existing row-level protections remain in place.

## Validation

Twenty-seven offline policy, pipeline, webhook and reconciliation tests pass. New barrier-controlled fake tests reproduce overlapping reconciliation before asserting one charge. Conflicting provider IDs, matching and mismatched existing charges, wrong ownership and the Supabase RPC adapter are covered.

Six actual local PostgreSQL checks run with PGlite0.5.11. They apply the SQL, exercise repeat/conflicting IDs, inject an update failure to verify ledger rollback, reject wrong ownership, inspect function privileges and verify that historical duplicates stop migration without deleting rows. The test supplies a minimal local storage.buckets table because Supabase's storage schema is absent in embedded Postgres. This is not a Supabase deployment test or parallel-connection PostgreSQL test.

Independent re-review found no remaining blocking defect within this reconciliation change and independently reran all27fake and six SQL checks. Parallel PostgreSQL connections and live RLS roles remain unverified. The original fake-only test suite did not establish these production properties either.

The earlier PR CI failures came from missing pdftotext/pdftoppm and Python image dependencies. The CI runner now installs Poppler and Pillow; that prerequisite commit passed both GitHub runs. The workflow additionally installs ops dependencies with lifecycle scripts disabled and runs ops syntax, offline and SQL tests. It does not run stitch/media tests or download an ffmpeg binary through package install hooks.

Commands: npm run test:offline --prefix ops; npm run test:sql --prefix ops; npm run check --prefix ops.

## Still blocked before paid execution

Order/daily budget checks still lack atomic reservations. The two$7under$10cap overrun is not corrected by this migration. Provider acceptance followed by a ledger failure can still strand submitShot without a recoverable saved request ID; reconciliation changes do not remove that gap. Lost responses/process termination and stale-submitting recovery require further work. Keep paid work disabled with the no-spend policy active. Do not enable paid work based on these results.

DraftPR: https://github.com/ryancortenbach/ugc-campaign-studio/pull/1. Source and migration require review and explicit production-release authorization before deployment. The existing live service was not paused by this work.
