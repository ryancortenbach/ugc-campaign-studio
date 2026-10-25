# Source comparison interface

The Renders detail panel now links known storyboard lineage to a dedicated #/source-review/:renderId page. That page compares the current render intent with its saved target shot and character/scene locks. Target duration appears when recorded. Full storyboard and input parameters are expandable, with all source text escaped. It never renders referenced images or executes prompt content.

The backend GET returns displayed content and optimistic tokens from the same render/plan snapshots. The UI submits those exact tokens with a nonempty note and an explicitly checked confirmation. Hashes remain hidden from normal UI. Unknown, incomplete, foreign or ambiguous source context cannot record a match. This changes only the existing local association record, not quality checks, spending approval, render state or delivery.

Pending actions serialize. Reload and failed requests retain the draft note, including an explicitly cleared note, but always reset confirmation. An accepted request with a lost response reloads the saved state without automatically retrying or falsely claiming nothing was recorded. Stale mounts and departed routes cannot repaint another comparison. After refresh, focus moves to the heading or retry button. Drafts are not persisted across route departure or full browser reload; only explicitly recorded notes persist in the real backend.

Independent review returned cleared-note resurrection and lost retry focus, both corrected with regressions. Screenshot review returned small/dim labels, corrected locally to11px --muted. The final code reviewer independently passed30focused tests:9actual-module DOM,7backend snapshot/metadata and14Renders model/view checks. Full exact-source5e8c44cCI runs40155921901and40155918670passed90root and465agent tests with zero failures/skips. Logs: work/source-review-ui-v5-tests.log and work/source-review-ui-ci-v2.log.

## Fictional hosted review

https://duolingo-library-phone-v1-lbsb3dv3g-ryancortenbachs-projects.vercel.app/

This is the actual component/styles with explicit fictional responses and a connect-src none policy. No accounts, backend databases, models, renders or messages are connected. Tab state resets on page reload. No images/reference artwork were generated or used. Scene descriptions are fictional and not approved production assets.

The final preview is READY with target Preview, anonymous HTTP200, and exact served JS/CSS hashes matching source. The primary agent used normal connected Chrome for simulated recording, conflict, lost-response, already-recorded and unknown-lineage states on the earlier build with the same save logic. The final build was checked with full target/input parameters expanded on desktop and at390by844with document width390, followed by viewport reset. No horizontal overflow observed.

A separate code reviewer verified tests and anonymous hosted bytes without browser tools. Separate screenshot reviewers actually inspected the captured desktop/mobile images, including the final expanded desktop and collapsed mobile view. Their final scoped visual review found no further concrete defect. Interactive browser checks belong to the primary agent, not the screenshot reviewers. Expanded mobile parameters, the actual native app and a physical phone remain untested.

Receipt: docs/SOURCE-REVIEW-UI-PREVIEW-v2.json. Source: experiments/source-review-preview-v1. Staging: scripts/stage-source-review-preview.mjs. Intermediate preview receipts/deployments are preserved. No production release or actual app activation. Existing root Studio server PID37755 was observed and left untouched; no agent listener on3200. No Air write, actual app database mutation, paid generation, sending, app build or live campaign-provider or outreach-account action.

Indexed interrupted-candidate recovery, per-slot storage/email recovery, buyer delivery, native/device validation and remaining original sponsor/sample dependencies remain unfinished. Package readiness and whole-goal completion stay false.
