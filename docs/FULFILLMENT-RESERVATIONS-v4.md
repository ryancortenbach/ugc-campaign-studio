# Estimated render-cost reservations, review version 4

This adds estimated render admission controls to draft PR1. It does not enable paid work, merge the PR, deploy the service or apply a production migration. The live service remains unchanged.

Before a render provider call, migration003 takes a shared transaction-scoped advisory lock, locks the shot and checks its latest stored quote, order budget, automatic-approval setting, known ledger spend and held render reservations. Quotes round upward to cents. Admission and the submitting intent/key commit together before the provider is called. The provider receives the claimed database row's endpoint/input instead of a stale caller copy.

Held unknown outcomes remain counted beyond24hoursuntil explicitly reconciled. Acceptance transfers the hold into the ledger atomically under the same lock. Explicit confirmation that no job started releases the hold and returns the shot to priced atomically. Expiry alone never releases funds or resubmits a job. Legacy unknown/submitting rows without a hold or recorded Higgsfield charge block new admission, including manual admission.

Existing operator approval above a cap remains a separately recorded manual override. This is not a hard limit on manual decisions. The default no-spend policy has no HTTP unlock.

Independent review reproduced a reservation foreign-key problem that prevented customer revisions from deleting completed shots. Recorded/released reservations now cascade with their old shot; a delete trigger protects held exposure. Spend history remains. The reviewer also found legacy unknowns were omitted from initial reservations. Both issues were corrected and re-reviewed.

Forty-one fake-provider tests pass. A controlled overlapping-tick test admits one of two $7 quotes under $10. Tests cover cross-order daily caps, unknown holds, release, old holds, cent rounding, manual overrides and revision deletion. Nine reconciliation and ten reservation SQL checks pass locally using PGlite, including rollback after an injected hold-transfer failure. Ninety studio tests and syntax checks pass.

The separate CI PostgreSQL17service uses a fresh loopback-only mint_ops_ci database and fictional test credentials. It refuses app/external database targets, checks distinct backend connections, observes actual admission/record RPC lock waits through pg_stat_activity, then runs ten simultaneous-admission races and ten hold-to-ledger races. First CI execution failed because migrations used an unreserved pool connection. The harness now reserves the migration connection. Corrected CI40135061888passed, including the actual RPC lock waits and all twenty multi-connection race iterations. These were isolated test-database operations, not live Supabase/provider requests.

This is estimated render admission, not an actual-billing or all-provider guarantee. In-flight model calls remain unreserved and can change totals after admission. Provider prices/idempotency are unverified; manual overrides can exceed caps. Keep paid work disabled. Any future release requires migration review, paused writers and an audit of historical duplicate charges and unknown outcomes. None of those production actions occurred here.

Versions1through3remain preserved. Whole-app behavior, accounts, fulfillment, posting, physical devices and commercial results are not certified by these checks.
