# Durable delivery draft intents, review version 2

This extends draft PR2 in the current Mac app source. No actual Gmail, storage, provider, buyer order, Air app or production database was changed. This is not a release or live-account validation.

Before first-time Gmail draft creation, SQLite now records a per-order intent with a random token, expected recipient and subject. The MIME draft carries a deterministic Message-ID derived from that token. A returned draft ID is saved in the intent before final delivery state is saved.

If the response is lost or either save fails, retry checks the durable intent before uploading again or attempting another create. A read-only Gmail draft search looks up that Message-ID and retrieves the matching draft. Recovery verifies the sender, complete single recipient, subject and Message-ID, rejecting unexpected Cc/Bcc, duplicate identity headers, multiple matches and pagination ambiguity. A verified ID is reused for an update. No match blocks another automatic create.

The claim compares the intent token observed before asynchronous storage work. The reviewer reproduced a delayed second-instance race in the initial version; the conditional claim now prevents a stale instance from overwriting a newer known intent and creating a second draft.

POST /api/whop/orders/:id/delivery-draft-reconcile provides backend recovery. Reset requires the current intent token, a strict boolean confirmation that no draft was created, an empty search and at least15minutesafter the intent began. An empty search or elapsed time alone is not proof of non-creation. The current UI has no manual recovery controls yet. Do not describe this as a complete operator flow or exactly-once delivery. Manual confirmation remains the operator's responsibility.

Tests use memory SQLite, temporary files and fake transports. They cover accepted-create response loss across service reconstruction, no-match blocking before more uploads, failure saving delivery metadata, failure saving the known intent ID, stale tokens, early/string confirmations, cross-instance delayed claims, extra recipients and duplicate headers. A real loopback HTTP test verifies recovery while the persisted no-spend guard is active, with no new create or send. Existing local synthetic ffmpeg tests remain separate.

Independent review found and corrected the conditional-claim and recipient-verification defects. Re-review passed24targeted tests; subsequent HTTP/policy coverage brings the focused combined set to27tests. Ninety root tests and syntax checks pass. Both source76694cd CI runs40138894848and40138892101passed:90root tests and404agent tests, with0failures and0skips. Evidence: work/mac-draft-recovery-ci-v1.log.

The Gmail adapter follows the documented drafts.list query and drafts.get endpoints:
https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/list
https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/get

No live test established Gmail's Message-ID preservation, search indexing delay or behavior after a manual reset. New post-create attempts after explicit reset can still duplicate an earlier draft if the operator's no-creation assertion is wrong. Known-draft updates retain earlier safeguards. The per-instance action lock remains a local guard, not a global lock for all Gmail updates or app processes.

The intent is a current recovery cursor rather than an immutable audit log of every superseded attempt. Earlier review files and source versions remain in Git. Frontend recovery controls, full pack fulfillment, native/device testing and actual account behavior remain incomplete. No sending or paid generation was performed.
