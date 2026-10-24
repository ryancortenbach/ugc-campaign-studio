# Mac delivery review, version 1

The team retired the Vercel fulfillment service in commit12330d6and moved delivery into agent/delivery.mjs. Closed draftPR1without merging or deleting its branch. Its ops source, migrations, tests and receipts remain preserved on review/fulfillment-spending-pause-v1; do not resurrect the retired service by merging that work.

This review uses current main1ce767aon a separate review/mac-delivery-audit-v1branch. The Air app, working tree, records and spending setting were not changed. The scheduled task still prohibits this worker from paid generation, sending, purchases and production release.

## Confirmed defects and corrections

- A changed source render made final.stale true but did not block backend delivery or mark an existing delivery stale. The backend now checks current final/render versions before and between storage operations, and delivery state includes final staleness.
- Finish and delivery had separate busy keys but shared a mutable final filename. A controlled overlap uploaded second-version bytes under a first-version name. Operations now serialize by order within one delivery instance; same-action requests coalesce and conflicting actions reject409. Final files have immutable unique names, preserving earlier bytes.
- Any Gmail update error triggered createDraft. An accepted update followed by a timeout could therefore duplicate the draft. Only confirmed404absence now permits a replacement; uncertain and other errors propagate.
- A Gmail disconnect cleared a previously known draft ID. The ID now survives for reuse after reconnecting. The current draft URL is cleared when Gmail was not updated, so the UI does not imply the old draft contains the new link.

Independent source and fake-transport review confirmed the original failures, reviewed the corrections and reran14delivery tests. No further concrete defect was found in those targeted fixes. Tests include controlled upload/render changes, conflicting actions, preservation of earlier final bytes, uncertain updates, confirmed missing drafts and disconnect/reconnect identity. The existing real ffmpeg check joined synthetic mismatched clips into720x1280video with audio. Ninety root tests and syntax checks also pass.

## Unresolved scope

First-time createDraft accepted by Gmail with a lost response, or a local database failure after draft acceptance, still lacks durable intent/reconciliation. Do not label delivery retry-safe as a whole. No actual Gmail/storage/provider call was made. The order pack still has one storyboard and requires the other5or12videos to be prepared by hand. Pending non-rejected clips are allowed by the current source contract; this review does not introduce or certify an approved-only gate.

The action lock is per delivery instance, not a cross-process database lock. Final-version checks cannot retract an external draft request if another process changes the source during that request. Gmail is never sent by this code; the operator still reviews and sends any draft.

No live service, user database, Supabase project, Gmail draft, native app or production release was changed. No Vercel deployment occurred. The current app handoff retires the Vercel service; the older studio preview is historical and does not host these fixes. Physical-device and live-account verification remain unperformed.
