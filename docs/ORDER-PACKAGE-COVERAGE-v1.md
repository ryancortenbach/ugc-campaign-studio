# Read-only package coverage diagnostic

The current order watcher prepares one storyboard per order. A storyboard can contain many shots, but joining those shots still creates one video. The dated offer snapshot lists five videos for Starter and twelve for Campaign. This diagnostic makes that gap explicit without starting more work or claiming the order fulfilled.

Draft PR4 targets post-judging, based on 38ae05a. Main was force-reset to 69640b8 while the prior review fixes remained on post-judging. This worker did not roll back, merge or activate either branch. Functional source: 7728bca.

GET /api/whop/orders/:paymentId/coverage reads the saved normalized payment, existing storyboard and delivery state. No new table or persistent record is created by the report. Known plan IDs map to the October 24 offer snapshot. The shared product ID, title or amount alone cannot distinguish the packages. Mismatched product IDs, unknown plans and malformed payment data leave scope unknown.

The response labels package scope as listed_package_snapshot with agreedScopeVerified:false. Payment eligibility is paymentSnapshotEligible with paymentCurrentVerified:false. The watcher stores purchase snapshots without refreshing known payments, so this report does not establish current payment, refund or dispute status. Exact buyer scope was agreed outside this diagnostic and is not verified here.

An existing stored storyboard counts as one mapped video. Its current final counts as one final, regardless of the number of shots. Stale or missing finals get no current-final credit. Current-link credit also requires a valid future expiry. An uncertain recovery attempt gets no linked-draft credit. readyToPreparePackage remains false because this flow has no assignments for the remaining package videos. packageDelivered is null and deliveryConfirmed:false because buyer delivery is not tracked. A link or Gmail draft is preparation evidence only.

Independent review reproduced expired-link credit and ambiguous payment eligibility. Both were fixed, along with explicit agreed-scope labeling. Re-review independently passed 27 coverage/delivery tests and found no further concrete defect in scope. Six new coverage tests include known/unknown plans, twelve shots counting as one video, stale/orphaned state, uncertain drafts, expired/malformed/boundary expiry, malformed stored payment and a loopback GET while spendingPaused. The GET caused no SQLite changes or spend. The broader focused coverage/delivery/Gmail suite initially passed 30 tests before the new expiry regression; source CI is the full validation record.

No live Whop/Gmail/storage/provider request, buyer record mutation, generation, send, Air write, app build or deployment was performed. This has no UI yet and does not implement multiple storyboards, per-video storage or package delivery. The existing isolated recovery UI preview remains separate from this diagnostic and does not run its API.

Evidence: agent/order-coverage.test.mjs, work/order-coverage-v4-tests.log and the source CI runs recorded in the current continuation audit.

Both exact-source CI runs 40142567480 and 40142571419 passed 90 root tests and 416 agent tests, with zero failures or skips.
