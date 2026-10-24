# Disobedient opening repair v3

October 24, 2026. Task 10. Provider render 28.

The user clarified that the opening's generic blank hoodie is the defect. The opening must match the printed hoodie already visible in the later shot. The earlier blank-front interpretation and its ImageGen sheet are superseded and preserved.

The current target uses the blue HIGH HEELS / 'N LOW LIVES lettering and red musical staff from the selected later scene. This is a user-directed printed-front creative variation, not a claim that the official ecommerce garment has this artwork on its front.

One Genjutsu Light correction was authorized by “Go fix those first few frames with the new corrected prompt.” The preceding displayed additional limit was $1.30. A fresh estimate confirmed the same 720p list rate, with a conservative $1.20 estimate. Itemized actual charges remain unknown. No automatic retries, VYLIN rerun, CTA append, outreach or global spending unlock are authorized by this repair.

Request: `3e0feb08-78c6-4feb-abc9-4600f039ae77`.

## Repair boundaries

- Source: existing generated Disobedient video, not a newly invented character or scene.
- Target reference: a frame from 5.7 seconds showing the printed hoodie clearly.
- Provider input: the opening section, with two additional encoded context frames retained by lossless trimming.
- Final join: exactly 165 repaired frames (first 5.5 seconds) plus the original last 15 frames (0.5 seconds).
- Audio: restore the original local six-second source audio. The provider input is silent.
- CTA: keep the website end card as a separate still preview until garment review is complete.

The finishing script refuses to replace an existing output. It compares all decoded frame hashes against the repaired opening plus the unchanged ending, checks six-second duration and 720x1280 at 30fps, confirms source inputs were not modified, and checks audio alignment. Those media checks do not establish visual garment consistency. The actual opening and transition need separate visual review.

## Files

- `scripts/run-disobedient-opening-v3.mjs`: upload the bound reference/input, quote, submit once, and monitor the actual provider request. Lock and persisted request state prevent automatic duplicate submissions. Credentials are never sent to the presigned storage host.
- `scripts/finish-disobedient-opening-v3.py`: preserve generated opening frames and original ending frames while restoring audio.
- `scripts/publish-disobedient-opening-v3.mjs`: attach the provider receipt and final verified result to the existing brand task.
- `research_notes/streetwear-demo-v1/disobedient-opening-prompt-v3.txt`: exact corrected prompt.
- `research_notes/streetwear-demo-v1/disobedient-opening-authorization-v3.json`: bounded user instruction and immutable input hashes.
- `agent/public/streetwear-demo-assets/disobedient-printed-anchor-v3.png`: target garment reference.
- `work/streetwear-demo-v1/disobedient-opening-state-v3.json`: ignored private provider URLs and current request state.

Official upload procedure: https://docs.higgsfield.ai/docs/concepts/file-uploads . Genjutsu Light API: https://open.higgsfield.ai/models/higgsfield/genjutsu-light/object-swap/v1.0/api-reference .

## Result

The corrected six-second video is attached as `disobedient-garment-review-v3.mp4`. Visual inspection of 12 samples found the print in the opening and following seated shots. All 180 final frames decoded successfully. The last 15 frames match the original ending exactly. The repaired opening was encoded once at CRF 6 to avoid B-frame damage at the cut; its SSIM to the provider frames passed the 0.995 threshold. Audio has zero measured sample lag. Human review remains pending. The CTA is still separate.
