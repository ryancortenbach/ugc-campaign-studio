# Local final preparation for a video slot

This extends draft PR4 against post-judging. It adds local file preparation for one saved video-plan slot without changing the legacy order storyboard, render IDs, final or Gmail draft. No actual app or account work was run by this worker.

GET /api/whop/orders/:id/videos/:slot/final returns the source token, plan revision, expectedFinalVersion, preparation availability and latest final state. POST requires expectedSourceToken and expectedFinalVersion from that current state. GET /final/history returns all attached versions for this order and slot. There is no UI yet.

The slot must have a valid, uniquely owned assignment in a saved plan. Its board needs one to twelve valid, uniquely identified shots. Only completed, non-rejected clips with the exact board and plan association are eligible. As in the legacy flow, an approved clip is preferred, then the newest other eligible clip. Pending review is not relabeled as a checker pass. The report does not perform a visual grade or provider verification.

The source token includes saved plan revision, exact board/hash, selected render IDs, input hashes, review states, local paths and clip-byte hashes. Preparation copies those clips into a private temporary staging directory and verifies the copied hashes before calling the existing local stitch helper. The source files are unchanged. Captions use the saved board's dialogue.

After stitching, an immediate SQLite transaction rechecks the plan, assignments, source metadata, clip bytes and prior final version. A change rejects attachment. Same-instance identical calls coalesce; another instance cannot attach a second version using an old expectedFinalVersion. Every candidate uses a unique filename under package-finals. Attached versions are immutable history rows in order_video_finals. No original file or prior final is overwritten.

Final GETs rehash both source and output bytes and mark changed/missing artifacts stale. Source paths must resolve to regular files inside the render directory; absolute paths, traversal and symlinks escaping the directory are unusable. The output directory must also remain inside the render directory. Only this operation's temporary staging copies are removed. Candidate bytes produced before a failed attachment or database save are preserved but not counted as a valid attached version. They are currently unindexed orphan candidates, not a durable interrupted-job registry.

The order_video_finals table initializes on future module construction. This worker used memory and temporary-file test artifacts only, not the actual app database. The no-spend guard allows this exact local preparation route. It calls local ffmpeg and never a model, media provider, storage service, Gmail or Whop mutation.

Tests use a fake stitch transport with explicit synthetic clip bytes. They verify independent slots/history, source snapshots, unchanged legacy records/files, stale source tokens, plan changes during stitching, output/source tampering, duplicate/coordinated cross-instance calls, path containment, failed history insertion and a loopback POST while spendingPaused. Existing stitch tests separately exercise real local ffmpeg; these new fixture results do not establish a native visual or actual-client video pass.

Remaining limits: coverage does not consume this new history yet; package readiness remains false. No per-slot storage links, draft/recovery integration, buyer delivery, native UI or live-account validation. Interrupted candidate recovery and failed-candidate indexing are unfinished. No deployment, sending, purchases, paid generation, app build or Air change. Independent review and exact-source CI are recorded in the continuation audit.

Intermediate product stills are excluded. Independent scoped review passed 32 focused tests with no concrete defect found. Both exact-source 6a7f8eb CI runs 40150653863 and 40150658265 passed 90 root and 449 agent tests, zero failures/skips. Logs: work/order-video-finals-v3-tests.log and work/order-video-finals-ci-v1.log.
