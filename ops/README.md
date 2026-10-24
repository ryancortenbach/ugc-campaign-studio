# Mint Labs fulfillment (ops)

Turns a paid Whop order into delivered UGC videos. Separate from the agent app: it reuses the agent's storyboard, checker and Higgsfield modules without changing them.

Live: https://mint-labs-ops.vercel.app (Vercel project `mint-labs-ops` on the Tensae's Dungeon team, root directory `ops`).

## How an order flows

1. Whop sends `payment.succeeded` to `/api/whop`. The signature is checked (Standard Webhooks, `WHOP_WEBHOOK_SECRET`), duplicates are ignored by webhook id and payment id, and the plan picks the package: Starter (5 videos) or Campaign (12 videos). Other plans raise an alert for a person.
2. An order is created with a private brief link, and a brief request email lands in the outbox.
3. The buyer fills in `/brief/?t=...`. Production starts.
4. Supabase pg_cron calls `/api/tick` every minute. Each tick moves work forward in bounded steps: creative angles, storyboard draft, the seven checkers with up to two automatic revisions, shots, shot checkers and price, Higgsfield submission within the order budget and the daily cap, polling, stitching with burned-in captions, then the review queue.
5. A person approves each video in the console (or sends it back with a note, which revises and re-renders it). When every video is approved, the delivery email lands in the outbox and `/d/?t=...` shows signed download links.
6. Clips are deleted once stitched. Finished videos are deleted after the retention window (30 days by default).

Nothing is ever sent by email from this app. Emails wait in the console's outbox with an "Open in email" button.

Spending rules: renders are submitted automatically only while auto-approval is on and the order budget and 24-hour cap allow it. Anything else stops in "Needs you" with the price. A submission whose outcome is unknown is never retried automatically; reconcile it from the console with the request ID Higgsfield shows, or confirm it never started (the same Idempotency-Key is reused).

## Environment (Vercel project settings)

| Name | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Database and storage. Set by the Vercel Supabase integration. |
| `POSTGRES_URL_NON_POOLING` | Used by `npm run migrate`. Also set by the integration. |
| `ANTHROPIC_API_KEY` | Storyboards, angles and checkers. |
| `HF_CREDENTIALS` | Higgsfield `id:secret`. Without it, shots wait instead of rendering. |
| `WHOP_WEBHOOK_SECRET` | The `ws_...` secret of the Whop webhook pointed at `/api/whop`. |
| `CRON_SECRET` | Bearer secret pg_cron sends to `/api/tick`. |
| `OPS_PASSWORD`, `OPS_SESSION_SECRET` | Operator console login. |
| `ALERT_WEBHOOK_URL` | Optional. Slack or Discord webhook, or an ntfy topic URL, for phone alerts. |
| `PUBLIC_BASE_URL` | Optional. Base for links in emails; defaults to the request origin. |

## Commands

```sh
npm ci && npm ci --prefix ../agent   # dependencies (the agent's are needed for its modules)
npm test                              # 18 tests, fake providers, no network
npm run dev                           # local demo on http://localhost:3400 (password: demo) without Supabase settings
node scripts/fetch-ffmpeg.mjs         # Linux arm64 ffmpeg into bin/ before building for Vercel
npm run migrate                       # schema, storage bucket, and the pg_cron heartbeat when TICK_URL and CRON_SECRET are set
```

Deploy from the repository root (the project is linked there): `vercel build --prod`, then `vercel deploy --prebuilt --prod`.

## Local review: paid work disabled by default

The reviewed source now defaults real provider tools to paused. OPS_PAID_WORK_ENABLED must equal the exact string true in server configuration to opt in. This is not an authorization: keep it absent or false under Ryan's current no-spend instruction. There is no HTTP settings switch to enable it. Paused ticks return without running pipeline steps; direct and manual render submissions reject423before claiming rows. The existing auto-approve UI does not bypass this policy.

This patch has not been deployed to the existing fulfillment service. It does not establish that a live service or separately running process is paused. Do not call a live tick or approve-spend endpoint as a test. Known unresolved issues include non-atomic order/daily budget reservations, post-acceptance request persistence failure, and duplicate reconciliation ledger inserts. See docs/FULFILLMENT-REVIEW-v1.md in the repository root. No production release or remote database changes are authorized by this review.

## Reconciliation migration in draft review

Migration002adds the atomic reconciliation RPC required by the updated adapter. Do not deploy the adapter without planning that migration, and do not apply it to production under the current schedule. Existing duplicate Higgsfield shot charges make its unique index fail without deleting history. Audit them separately. The transaction fixes duplicate reconciliation ledger entries, not atomic spending caps or the provider-acceptance persistence gap. Details: docs/FULFILLMENT-RECONCILIATION-v2.md at repository root.
