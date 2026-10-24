# Hosted readiness console v2

Preserves v1 and adds a separate static console with a real Workflow SDK backend. It is not connected to the main dashboard runner.

Use Node 24. Run npm ci --ignore-scripts in this directory, then provide DURABLE_DEMO_ACCESS_TOKEN through the private process environment and run npm run dev on port3102. npm run build with NITRO_PRESET=vercel compiles the preview. The local dependency symlink is ignored; a fresh checkout needs npm ci. No global dependency or project-wide environment was added.

POST /api/jobs requires the operator Bearer token, a prompt and a request UUID. It starts a deterministic workflow that waits15seconds and performs preflight only. The server records the request UUID as a plaintext workflow attribute for reconciliation. The response includes a signed ticket for one run, valid24hours. This is not a generation or model approval.

GET /api/jobs/:id and POST /api/jobs/:id/cancel require X-Job-Ticket. A forged, expired or different-run ticket is rejected. POST /api/recover requires the operator token and a saved run ID. Recovery checks the exact v2 workflow name before issuing a new ticket. V1 runs cannot be recovered through this console. Cancellation returns actual SDK status. A previously terminal job returns409 and is not described as cancelled.

The UI clears the operator token after reading it, keeps run tickets in memory, and saves only IDs, status and timestamps locally. Reloading requires operator access to recover. No secret is embedded in public files. No job ticket or token is included in public receipts or logged by the application.

One submission request is sent per click. There is NO server-side submission deduplication. Network or ambiguous server failure stores an uncertain outcome and blocks further submissions. Reconcile the request UUID in Vercel. The manual reconciliation control records an operator assertion only. It does not cancel a job or prove deduplication. Concurrent clients can still create separate jobs.

Verified:3 ticket tests;12 local and12 actual hosted lifecycle checks; unauthorized and forged access, cross-job ticket rejection, actual cancellation, completed and cancelled recovery, and terminal cancellation conflict. Hosted V1 recovery rejection was verified separately. The browser showed anonymous UI access, missing/invalid token rejection and cleared token input at390px without horizontal overflow. An authenticated browser lifecycle was NOT tested. The real authenticated lifecycle was tested through HTTP. Physical iPhone testing unperformed.

Preview: https://duolingo-library-phone-v1-6le7imc81-ryancortenbachs-projects.vercel.app/
Detailed evidence lives in ignored work/workflow-v2-*-verification.json. Sanitized public receipt is ../../public/durable-proof/receipt-v2.json. Build has no private token. Vercel appends its163byte feedback script to the served index; verification accepted only that exact deployment-specific suffix. CSS and JS matched source byte-for-byte.

Still pending: main dashboard integration, multi-user ownership/authentication, atomic submission deduplication, cross-device job discovery, push alerts, tab execution, actual model grading, rendering and publishing. There are no model, media, sender or posting adapters in this experiment. Hobby usage and payload-retention limits apply.
