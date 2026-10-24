# Durable readiness experiment v1

Isolated Workflow SDK 5.2.3 + Nitro proof. This does not replace the main dashboard runner. Originals and earlier previews remain intact.

`npm ci --ignore-scripts` then `npm run dev` starts the local proof on port 3101. `NITRO_PRESET=vercel npm run build` compiles Vercel Build Output. Use Node 24 for parity with the deployed functions.

Set a private `DURABLE_DEMO_ACCESS_TOKEN` in the server environment. Do not commit it or place it in URLs. Local `.env.local` is ignored and is not automatically loaded by the dev command. The temporary development launcher in ignored work loads it into the process without displaying it.

Routes:

- `GET /health` reports the experiment name and whether Vercel deployment context is present. No secret values.
- `POST /api/jobs` requires a Bearer token and a JSON draft with prompt, references, settings and optional lockedDialogue. It returns a run ID. Maximum JSON body is 64 KB; prompt maximum is 30,000 characters.
- `GET /api/jobs/:id` requires the same token. It returns actual status and, after completion, the saved return value.

The workflow records a timestamp, suspends for three seconds, runs deterministic preflight, and records the result. It has no model, Higgsfield, outreach or publishing adapter. A missing positive cost quote yields needs_attention. A clean local check only yields ready_for_specialist_review, never generation approval. Both approval and submission flags are always false.

Verified October 24, 2026: local installation and compile, unauthorized HTTP 401, asynchronous local completion, exact result retention after a complete local server restart, preview READY with target null, anonymous hosted health HTTP 200, and one actual protected hosted run completed with a budget blocker and zero model calls. Public sanitized receipt: ../../public/durable-proof/receipt-v1.json. Detailed private operational evidence remains in ignored work.

The deployment uses the existing Hobby preview project. Build settings were checked against the preceding V16 deployment and remained unchanged. Vercel manages cloud state and queueing; local state is .workflow-data. Current Hobby workflow retention and usage limits apply. This experiment is not a production reliability claim.

Before connecting real campaigns: add campaign ownership, scoped authentication, request idempotency, cancellation, status reconciliation, durable alert delivery, and an explicit model and spend boundary. The main app currently retains browser-local state. Do not expose a shared admin token to browser JavaScript or count this isolated proof as tab control, real reviewer grading, rendering or posting.

Sources:
- https://workflow-sdk.dev/docs/getting-started/express
- https://workflow-sdk.dev/docs/deploying
- https://vercel.com/docs/workflows/pricing
- https://vercel.com/docs/workflows/retention
