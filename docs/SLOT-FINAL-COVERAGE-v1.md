# Coverage from attached video-slot finals

Draft PR4 still targets post-judging. The agent coverage route now counts current attached per-slot final records for saved video plans. Existing legacy finals remain separate context and are not counted in this mode. An older legacy final or prior slot version cannot replace stale, missing or unverifiable latest slot evidence.

Coverage exposes a base report for shared assignment/source validation. The final-preparation module uses that base path. The enriched coverage getter then calls the per-slot reader, avoiding the previous potential coverage-to-final-to-coverage recursion. The server wires the reader lazily after constructing the modules. Standalone coverage users without a slot reader retain the earlier base behavior.

Each mapped assignment requires a same-order/same-slot reader result. A credited final must be marked current by the file/source validator, have the latest declared version, positive bytes and output digest, and carry an exact slot, storyboard and saved-plan revision. The manifest digest must match the current source token. Missing readers, thrown errors, foreign scope, wrong version/plan, null manifests and stale evidence get no credit. Invalid assignments do not invoke the slot reader.

The integrated response reports finalCoverageMode: attached_slot_history_only and per-video finalEvidence. legacyFinalAvailable is informational only. currentFinals counts each valid assigned slot at most once. localFinalsComplete becomes true only when the recorded expected count, valid mapped count and current attached-final count all match. It describes local preparation evidence only. readyToPreparePackage remains false, buyer delivery stays unknown/unconfirmed, and saved payment/contract scope remain unverified. No visual grade or provider-output verification is implied.

GETs do not repair or create records. Existing originals, final versions, source reviews and ownership records remain unchanged. New integration tests verify read-only behavior, actual server GET routing while paused, independent slots, all-local-complete state, latest-output tampering, plan revisions, no legacy/older fallback, unavailable/foreign readers and invalid assignments. Independent review passed37focused slot-final/coverage/plan/source-review tests, zero failures/skips, with no concrete defect found in scope.

A broader process inventory found an existing node server.mjs at the project root, PID37755, and no listener on3200. It was left untouched. No app build, restart, source activation, live account/provider call, paid generation, send, Air write or deployment. No frontend, hosted fixture or native/physical-device test changed this batch. Exact-source CI is recorded in the continuation audit.

Remaining: indexed interrupted-candidate recovery, per-slot storage/email recovery, buyer delivery and UI. Reports are evidence summaries, not permission to spend, upload or send. Any future mutation still needs its own current source/version checks. Package readiness remains false.

Both exact-source bad73c5 CI runs 40152844838 and 40152849473 passed 90 root and 454 agent tests, zero failures/skips. Logs: work/slot-coverage-v2-tests.log and work/slot-coverage-ci-v1.log.
