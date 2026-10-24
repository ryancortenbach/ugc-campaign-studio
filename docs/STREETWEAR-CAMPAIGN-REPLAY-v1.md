# Streetwear campaign replay

The chat message `Find me streetwear brands we can run AI UGC content campaigns for` opens `#/walkthrough/disobedient?autoplay=1`. `Run the streetwear demo` is an alias. Other research prompts keep their normal behavior.

The replay uses the saved Disobedient and VYLIN research and tool records. Disobedient has the actual repaired six-second sample with subtitles matching the spoken words. VYLIN remains unavailable after its provider failure and is not presented as a generated success. No PDF is included in the outreach rehearsal.

The presentation has no demo or simulation badges. Execution metadata keeps the actual saved-versus-staged distinction internally. The flow shows the task, Exa evidence, official product reference, ImageGen character concept, sample playback, review wait, approval notification, sample email, positive reply, Whop checkout link, $500 checkout notification, generation replay and final character ad.

The Terac step is visual only, following the user's correction. It waits 4.5 seconds and shows a simulated approval notification. It makes no API request and saves no approval, panel or review record. All outreach, replies, checkout links and payment notifications are simulated. No real email, DM, Whop transaction or CRM update occurs. Actual delivery approvals remain separate.

The exact chat trigger records the local conversation and reuses existing tasks. All subsequent replay steps use one read-only manifest request, local timers and local saved media. The global spending pause remains enabled. Replay cannot submit new provider work.

## Media

- Corrected opening: `/streetwear-demo-assets/disobedient-garment-review-v3.mp4`, six seconds, render 28.
- Outreach sample: `/streetwear-demo-assets/disobedient-outreach-sample-v5.mp4`, six seconds. Captions use the original spoken-word transcript and caption timings. Audio packets are unchanged.
- Complete ad: `/streetwear-demo-assets/disobedient-full-ad-30s-v2.mp4`, published only after actual generation, assembly and review.

The complete ad retains the original character dialogue, uses the printed hoodie variation requested by the user, and closes with official front/back product photographs and disobedientnyc.com. The printed-front character styling is a creative variation. The official product photograph places that artwork on the back. The replay does not represent exact front-placement fidelity to the ecommerce garment.

Missing samples stop the replay before outreach. A missing final stops at generation and never substitutes the six-second sample for the full ad. Autoplay follows the actual sample's ended event. Reset, pause, route changes and removed mounts cancel pending replay timers.

## Implementation and checks

`agent/campaign-demo.mjs` prepares the saved manifest and chat response. `agent/public/campaign-demo.js` owns playback, notifications and expandable normalized tool summaries. Raw saved Exa records remain separately inspectable. The actual paid rendering scripts have bounded authorization, persisted request IDs and no automatic retry. They are separate from this replay.

Run `npm test --prefix agent`, `npm test`, and `npm run check`. The demo tests cover trigger isolation, sample ordering, unavailable media, cleanup, no provider work, no checkout creation and a fully read-only simulated review sequence. Native Mint playback must be checked separately from these tests.

## Activated result

The corrected complete ad is render 33. The first caption is “you ever heard the saying,” followed by the words he speaks. All 900 decoded pictures passed the assembly check. The revised sample and full ad preserve their audio packets exactly. The untouched historical versions remain available locally. The original dialogue still uses the word jacket; the product ending says SHOP THE HOODIE and shows the brand website.

Home history uses a persisted visible-message cutoff. Existing messages and task records remain saved, and new messages appear normally. The prior conversation was hidden at message 6. The Simulation chip was removed from Leads and native Mint was refreshed to verify its absence. Home was verified empty in native Mint.
