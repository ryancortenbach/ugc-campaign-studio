# Optional hosted readiness inside the dashboard

Agent operations now contains a separate Hosted readiness panel. The existing automatic queue above it stays browser-local. The hosted panel starts the current review-lab prompt and reference manifest, displays actual status and findings, requests cancellation and recovers a saved run after re-entry of private operator access. It does not represent the browser queue as durable.

Canonical UI changes: public/hosted-jobs.js, hosted-jobs-model.js and index.html, with scoped style.css rules. Same-origin backend: experiments/durable-dashboard-v3. Nitro serves the canonical public assets. Existing experiments and previews are preserved. No project-wide environment or global dependency changed.

Normal Chrome local verification used a fictional local-only credential. Actual UI submission and cancellation succeeded. A second job continued across reload; the saved run was selected and recovered completed with a missing-positive-quote blocker. ModelCalls0, spendApproved false and generationSubmitted false. This is authenticated LOCAL browser evidence. Actual hosted API lifecycle was separately verified through HTTP. Hosted authenticated browser testing is unperformed. Physical iPhone untested.

Three new model tests verify that saved history excludes credentials and private input/result fields, stale polling cannot regress a terminal run, and an unrelated uncertain submission survives history replacement. Three V3 ticket tests are also included. Root npm test explicitly runs59offline tests, without ignored work probes.

Single-operator access and per-job tickets remain the boundary. There is no atomic server-side deduplication. Unknown submissions are blocked client-side and require manual reconciliation, which records only an operator assertion. Multi-user ownership, durable task discovery and push alerts remain absent. The UI reports an unavailable backend on previews without the V3 service and disables hosted controls.

The combined preview explicitly blocks model chat, model specialist review and paid Exa transport. Guided intake, deterministic preflight, configuration and free Exa MCP adapters remain available. No live Exa request was made during this batch. There is no browser executor, sender, renderer or publisher.

Evidence: work/dashboard-v3-local-browser-verification.json, dashboard-v3-hosted-verification.json and public/durable-proof/receipt-v3.json. Final preview verification and deployment details are added to the continuation record after checks. Model, Whop, Terac, Lovable and generation dependencies remain unresolved. NoDONE.
