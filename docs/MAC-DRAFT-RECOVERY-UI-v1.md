# Delivery draft recovery controls

The order page now exposes the uncertain-draft recovery backend introduced in PR2. PR2 was merged by another session into main2f866f0 while this work was in progress. These UI changes are isolated in draft PR3 on review/mac-delivery-recovery-ui-v1, source6aa1ce1. This worker did not merge either PR or modify the running Air app.

A pending attempt shows its saved recipient, subject and start time. A check searches for an existing draft. Upload and previous delivery instructions are unavailable while the attempt is uncertain. A manual reset needs an explicit checked assertion, connected Gmail and at least15minuteselapsed; the backend separately validates the current token, waiting period and strict boolean. Empty search alone never unlocks the attempt. An incorrect manual assertion can still cause a duplicate later. Gmail indexing and Message-ID preservation remain unverified with a real account.

Actions serialize per mounted panel, reload state after errors and ignore responses after route departure. Focus returns to the section heading. The independent reviewer found inaccurate reset success copy, missing saved identity, exposed earlier delivery instructions and lost keyboard focus. These were corrected. Success copy is neutral because a reset request can find and recover an existing draft.

The combined focused suite passed33tests, including6actual-module DOM tests. The reviewer independently passed the earlier32test combined suite and then all6revised DOM tests. Both source6aa1ce1CI runs40140558044and40140561298passed90root tests and410agent tests with0failures and0skips. Evidence: work/mac-recovery-ui-ci-v1.log.

## Isolated hosted review

https://duolingo-library-phone-v1-2vlt6x5ki-ryancortenbachs-projects.vercel.app/

The fixture uses the actual changed module/styles and fictional state only. No backend/account calls, sends, uploads or paid generation run. The empty video element is hidden for review; this is not whole-window native parity. Source: experiments/delivery-recovery-preview-v1. Staging helper: scripts/stage-delivery-recovery-preview.mjs. No images were generated or referenced.

Anonymous HTTP returned200and the served delivery module matched source bytes. Chrome verified recovery and no-match blocking plus explicit reset. The independent reviewer verified all five scenarios, inspected a390by844viewport with document width390and no horizontal overflow, then restored the viewport. Focus returned to the heading. The reviewer found no further concrete defect in this scope. Real Gmail, native app and physical phones remain untested. Receipt: docs/MAC-RECOVERY-UI-PREVIEW-v1.json.

The first attempt used an unused UGC Vercel project and was unexpectedly classified Production despite --target preview. Its deployment dpl_FhHmS4h1vCatQi6JxBKqPtL617Wq was immediately removed, including its generated aliases. The replacement uses the existing preview project; Vercel inspect reports target preview and READY. No retired backend or live app was deployed. This incident must not be described as no deployment or an authorized production release.

No live order, Gmail, storage or provider mutation, Air write/restart/spending-setting change, purchase, outreach send or release was performed. The whole UGC goal remains incomplete.
