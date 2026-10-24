# Fulfillment source review and local no-spend mitigation

Reviewed imported source through e1bb54f on October 24, 2026. No orders, live ticks, provider requests, emails, database writes or production deployments were made by this review. The existing fulfillment deployment is owned by the team and was not changed.

The independent reviewer reproduced three defects using memoryDb and fake providers only:

- Two concurrent ticks submitted two $7 shots under $10 order and daily caps, resulting in $14 ledger spend. The budget check does not reserve funds atomically. Unknown submission outcomes also retain no budget reservation.
- Two simultaneous reconciliations of one unknown $7 request each inserted a spend record, although only one conditional shot update succeeded. Total recorded spend became $14.
- A successful provider submission followed by a failed ledger insert left the shot in submitting with no saved request ID. Current polling, retry and reconciliation routes cannot recover this state.

A fourth review finding concerns test coverage: the existing concurrency test starts after settle, so it has no pending shots to submit. It cannot establish safe concurrent spending. A separate initial baseline run passed16of17tests because its settling fingerprint missed revision progress occurring in the same millisecond. The local test helper now includes revisions, attempts, error and resume status in that fingerprint. No production logic relies on this test helper.

The default service previously allowed unauthenticated tick requests to progress billed model work, and autoApproveRenders defaults true. Turning that setting off gates only render submission, not model calls. A frequency lease is not spending authorization.

## Prepared local mitigation

ops/lib/spending-policy.mjs now wraps all six billed tool methods and rejects them by default. realTools enables paid delegation only when the server environment OPS_PAID_WORK_ENABLED equals the exact string true. Keep it absent or false under the current user instruction. An environment flag is not permission to spend. No HTTP settings route can enable this guard.

A paused tick returns before pipeline steps. approveSpend and direct submitShot reject with423and spending_paused before claiming a shot. Fake tools in tests can explicitly exercise unpaused behavior without spending. No remote environment variable was changed.

Independent re-review found no bypass through the current production router with its default wrapped tools. Five new policy tests plus17existing pipeline/webhook tests pass22of22;90studio tests and syntax checks pass. No stitch/media tests were run because the new ops dependencies are not installed on the Mini. No new installation, live provider replay or whole-service pass is claimed. Direct construction of realTools with each environment case was inspected in source, not exercised by these tests.

## Unresolved before enabling paid execution

1. Reserve order and daily funds transactionally before submission, including pending and unknown outcomes.
2. Preserve durable submission intent, request ID and ledger state across database failures and process termination. Recover stale submitting rows through explicit reconciliation.
3. Claim reconciliation before external lookup and persist one uniquely keyed ledger entry atomically.
4. Add barrier-controlled fake tests for concurrent budget reservations, reconciliation and post-acceptance failures.
5. Authenticate the heartbeat as defense in depth. The local no-spend policy currently blocks billed work through it, but it does not make the public trigger an authenticated action.

These issues remain open. The mitigation must not be described as a safe-to-enable fulfillment service or a live pause. No production release is authorized by this review.

## Read-only live observation

Normal Chrome opened https://mint-labs-ops.vercel.app/ and showed the operator password form. No login was attempted. A read-only /api/health request returned200with database/storage/LLM configured, Higgsfield and Whop webhook not configured, and no spendingPaused field. Health is not a provider billing or fulfillment test. No live tick was called. Physical devices remain untested.

Receipts: work/ops-readonly-health-v1.json and work/ops-spending-policy-v1-tests.log. Ignored offline reproduction file: work/fulfillment-spend-repros.mjs. Original imported source is preserved in Git. Earlier unrelated agent and browser reviews remain separate.
