# Hosted dashboard readiness v3

Combines the canonical dashboard assets with a deterministic Workflow SDK backend. V1 and V2 remain unchanged. The browser queue is still local; a separate Hosted readiness panel inside Agent operations uses same-origin hosted routes.

Use Node24. Run npm ci --ignore-scripts here, supply DURABLE_DEMO_ACCESS_TOKEN privately through the process environment, then npm run dev on3103. NITRO_PRESET=vercel npm run build creates prebuilt output. Nitro serves ../../public; canonical UI assets are not copied into a second source tree. The ignored local node_modules symlink is not portable; a fresh checkout must install dependencies.

The panel submits current review-lab inputs, starts one deterministic readiness job, polls, cancels and recovers existing runs. Operator tokens clear for each action. Tickets stay in memory. History saves IDs and status summaries, never credentials, prompts or results. Reopening requires operator access to recover. The workflow waits15seconds, then records deterministic preflight, zero modelCalls, spendApproved false and generationSubmitted false.

The access boundary remains a single private operator plus signed24hour per-job tickets. V3 tickets use a separate HMAC domain. Recovery checks the exact V3 workflow name. There is no multi-user account system or atomic server-side deduplication. Client double-clicks are disabled. Ambiguous outcomes block further starts until an operator records a manual Vercel reconciliation. That assertion is not proof of deduplication or cancellation. Different clients can submit separate jobs.

Guided chat, deterministic review, configuration status and free Exa MCP adapters are mounted with the dashboard. Model chat and specialist-review calls are explicitly disabled in this combined preview. Paid Exa REST transport is disabled. No media, sender or publishing adapter exists. Free Exa is not exercised again by the automated checks in this batch.

Verified locally in normal Chrome with a fictional local-only operator credential: submit, actual cancellation, a second run, page reload while active, saved-run selection, recovery of the completed run with its budget blocker and zero model calls. Token field cleared. Mobile390px document width390; the saved-run control fits the single-column mobile form after its sizing correction. This is not a physical iPhone check.

The actual hosted backend lifecycle was separately tested through authenticated HTTP. Hosted authenticated browser entry remains untested. Public sanitized receipt: ../../public/durable-proof/receipt-v3.json. Detailed private evidence: ignored work/dashboard-v3-*-verification.json. This distinction must be preserved in delivery claims.

Still incomplete: durable unified task table, server-side deduplication, multi-user ownership, cross-device job discovery, push alerts, browser-tab execution, actual model grading, human review, rendering and publishing. Hobby quota and payload retention apply. Whole project scope is not complete.

Final preview: https://duolingo-library-phone-v1-e6m7kfqje-ryancortenbachs-projects.vercel.app/#operations
Final deployment dpl_EKgNjkN4wZxtZz9G5upEzHMf3ids is READY targetnull.81publicfiles matched source, with only exact deployment-specific Vercel feedback suffixes allowed on HTML. Eight final API checks passed, including cross-deployment recovery of the completed prior run. Existing project build settings matched V18.
