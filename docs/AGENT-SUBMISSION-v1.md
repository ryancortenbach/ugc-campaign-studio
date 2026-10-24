# Local agent submission claim

The committed Mint Labs agent uses a local SQLite store and separate loopback server. It is not the hosted V3 readiness dashboard. Imported source came from Air commit56251a1. Its real provider/account behavior has not been independently verified by this patch.

Render approval previously allowed concurrent requests to pass the same checks before either awaited provider call updated status. Each used a different key. Approval now atomically changes one unclaimed checks_passed row with the exact quote to submitting and saves its submission key before any external call. Duplicate requests reject409. Exceptions or responses without a request ID remain submission_unknown and do not automatically retry. Quotes must be finite, positive and unchanged. Existing rows are preserved by an additive schema column.

This claim applies to one render row in one database. It does not deduplicate separately created render rows or prove a provider-level idempotency contract. Uncertain submissions require manual provider reconciliation. No automatic reconciliation or live paid test is included.

Validation:16 agent tests and82 studio tests pass. Four new tests use a fake provider and temporary/in-memory SQLite only: concurrent HTTP approvals, ambiguous responses, two connections/reopen and invalid quotes. No user database, credential or real provider was used. The active Air server was preserved and has not received this patch. No agent server was launched on the Mini.

Read-only receipt: https://duolingo-library-phone-v1-6ejq55g17-ryancortenbachs-projects.vercel.app/agent-proof/submission-v1.json

The hosted review hub links this receipt; it does not expose the local generation routes.87assets and8APIchecks passed. Anonymous browser receipt navigation and390pxlayout verified. Authenticated hosted agent and physical iPhone remain untested.
