# Hosted readiness proof v1

A separate protected Vercel workflow completed one fictional deterministic readiness job on October 24, 2026. It suspended, resumed and saved an actual needs_attention result for the missing positive cost quote. There were zero model calls and generation remained unapproved and unsubmitted. The main dashboard task table is still browser-local.

Local evidence confirms unauthorized HTTP 401, async completion and an identical result after stopping and restarting the local server. Hosted evidence confirms anonymous health HTTP 200, unauthorized job submission HTTP 401, protected submission HTTP 202, running status and completed return value. Deployment dpl_ErZCbAoK4VaMX2GRwQRncJBtHEnR is READY with target null, not production.

Source: experiments/durable-workflow-v1. The standalone lib contains only deterministic preflight and fingerprint functions. The private access token was supplied through process environment, absent from build output, public assets and Git. No project-wide environment variable was added. Existing build settings were checked against V16 and matched.

Private evidence: work/workflow-v1-local-verification.json, work/workflow-v1-hosted-verification.json, work/workflow-v1-deployment-verified.json. The public fictional receipt is public/durable-proof/receipt-v1.json. Public health: https://duolingo-library-phone-v1-jjmdr6dco-ryancortenbachs-projects.vercel.app/health

Not complete: real dashboard integration, user ownership and authentication, idempotency, cancellation, durable alerts, tab execution, actual model grading, rendering and posting. Token access is currently a single private experiment boundary. Vercel Hobby event/write quotas and completed payload retention apply. No unlimited capacity or production reliability is inferred.

Official references: https://workflow-sdk.dev/docs/deploying and https://vercel.com/docs/workflows/pricing and https://vercel.com/docs/workflows/retention
