# Saved video plans and source-bound coverage

PR4 remains a draft against post-judging. Main and the running demo app are unchanged by this worker. The report now reads the saved local video plan when one exists. A revision-zero suggestion still uses the legacy one-storyboard report. No plan or ownership records are created or repaired by a report GET.

Saved operator count and scope note drive expectedVideos, while listedScope separately retains the dated Whop plan suggestion. Buyer scope and current payment remain unverified. Unique, valid assignments drive mappedVideos. Missing/cyclic ancestry, duplicate slots, duplicate storyboard families, missing or foreign root reservations, and references owned by another legacy order get no assignment credit. Malformed saved plans stay invalid rather than falling back to legacy credit. Legacy delivery state is separately named legacyVideo. Read-only reporting rechecks current references and ownership rather than assuming the saved assignments are still valid.

Only one current final exists in the current delivery pipeline. It can count for at most one exact assigned storyboard, never a sibling revision or another slot. Package readiness remains false and buyer delivery remains untracked. New per-slot render/final/storage/recovery and delivery behavior are still required.

## Render source evidence

The initial implementation copied the order's current storyboard ID into the final. Independent review reproduced a false binding: changing the order's storyboard and remaking from old clips credited those old bytes to the new board. This was corrected with saved render source evidence.

Render creation now accepts an internal storyboardId and stores both storyboard_id and a SHA-256 fingerprint of that board's plan. The Whop storyboard pipeline and storyboard approval route supply the source ID. Manual/imported/older renders without this evidence remain unverified. Genuine input, endpoint, shot-ID or storyboard-ID changes clear the render's saved plan hash. Existing records are not backfilled or inferred from names/groups.

Before binding a joined final, every selected render must match the exact board ID, plan hash, ordered shot IDs and shot count. A final records that source ID/hash only when the checks pass. Current-state checks detect board changes, in-place plan changes and edited render intent. Unverified or mismatched finals are stale for storyboard-backed orders and receive no saved-plan final credit. A remake using unrelated clips cannot clear that state. This proves correspondence to saved local source metadata, not semantic correctness of generated pixels or external provider provenance.

Two additive nullable columns are introduced on renders, and final_storyboard_id/final_storyboard_hash are introduced on deliveries. Existing values remain null. The migration test preserves old final bytes and does not invent a historical binding. No actual app database was opened or migrated by this worker; all tests use memory and temporary files.

The first clearing guard also invalidated unchanged checker writes. Independent review reproduced this normal Whop-path regression. The corrected guard compares prior values, and the watcher success test verifies that first-pass checked renders retain their source ID/hash. Independent re-review passed 63 focused coverage, plan, delivery and Whop tests with no further concrete defect in scope.

Valid revised shots created by the separate revision route currently lack an explicit reassociation path. Checker revisions that genuinely alter input clear the source hash. These finals remain conservatively unbound/stale until a validated reassociation workflow exists. Routine revised-shot fulfillment is not complete.

No frontend changed. No fresh hosted preview, native app or physical phone check. The existing fictional recovery preview does not run this API. No live account requests, sends, paid generation, app build, Air writes or deployment. Review and CI evidence are recorded in the continuation audit after completion.

Both exact-source e59e1d1 CI runs 40148672222 and 40148667160 passed 90 root and 434 agent tests, zero failures/skips. Logs: work/plan-coverage-v7-tests.log and work/plan-coverage-ci-v2.log.
