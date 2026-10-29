# QA loop ledger

## 2026-10-24: live task activity disclosures

Expected: opening a tool's Input or Result details keeps that content open and keyboard focus in place as new research events arrive.

Reproduced: the refresh replaced the complete activity HTML, collapsed the open tool and nested Input disclosure, and removed the focused summary. A new interaction regression failed before the fix.

Changed: keep each existing event's disclosure state and focused summary across changed activity. Skip replacing identical activity HTML. New calls and results still render; stale-response protection stays in place.

Verification: the focused DOM/report/tool-log suite passed 7 tests. Full agent suite: 323 passed. Root suite: 90 passed. Root syntax checks passed. Independent review: PASS, including unchanged-node identity, collapsed state, parent and payload focus, outside focus and client-project refresh. No provider requests, live database changes or app restarts were used.

Next area: draft editing and unsaved-state handling.

## 2026-10-24: client review, Tasks, Leads and notifications

User-directed pass: remove the separate Client demo navigation and move saved client work into Tasks. Client tasks now open one in-app research, creative-image and wardrobe gallery. The PDF is a secondary export. No replay, brand/people stage, horizontal tabs or self-linking Open task button is present in that task view.

Research, images and generated-video reviews persist locally with feedback. Snapshot versions invalidate prior approvals when visible creative copy, garment photos or video QA changes. A local simulated Terac review for the ICP or actual generated-video artifact is explicitly separated from a real local approval. A video with known visual defects remains marked Needs revision; the simulated reviewer requests changes for that known defect. No panel, provider submission, outreach send or production authorization occurs.

Tasks are grouped as Client work, Brand research and Missions, with active work first and status chips on the right. The duplicate Don item was an open/failed payment attempt preceding a distinct successful payment. Only successful purchases appear in the work list; payment records remain intact. Distinct successful purchases are preserved. Linked order/task rows are not duplicated.

The two user-selected demonstration brands, Disobedient and VYLIN, are pinned on All Leads with outreach/Whop checkout chips carrying an explicit Simulation label. Stored real lead statuses are not changed. Five concise filters replace the repeated Drafted/Drafts and standalone check/X counters. A shared table surface and common grid align headers and rows. Slow Leads responses cannot overwrite a task opened later. Completed-video alerts use a compact notification and an explicit review link, with no embedded player or yellow scene-review popup. Existing chat activity, render readiness and monitoring from main were integrated and preserved.

Independent review returned fixes for incomplete approval fingerprints, refresh/save ordering, omitted combined-concept captions and stale navigation. Each was corrected and independently rechecked. Final scoped review: PASS, 20 tests. No native visual acceptance is claimed: a background-only WebKit fixture snapshot timed out. DOM/HTTP interaction and CSS/source evidence are separate from a running native visual check.

Final full validation: 346 agent tests, 90 root tests, root syntax checks and direct syntax checks for all changed runtime modules passed. Full-suite results and push receipts are retained locally in ignored work/qa-loop. The 10-minute native heartbeat is ACTIVE for this chat and uses only this QA worktree. Scheduled future fixes remain on codex/mint-qa-loop. Ryan separately authorized integration of this initial reviewed pass into main.

Next area: draft editing and unsaved-state handling.

## 2026-10-24: compact Leads rows and provider notifications

User-directed pass: brand names and domains now use the full text column, with a compact social row and no empty platform slots. Fallback initials are centered inside consistently sized brand logos. Long names and domains wrap instead of competing with social icons for width.

Each lead displays one primary status, choosing the reached milestone or next blocking action. Simulated checkout supersedes simulated outreach and stays explicitly labeled. Contact discovery uses a single chip: Email found for a recorded personal address, Shared inbox for role mailboxes, No public email for researched leads without one, or Not checked while research is pending. Server and browser share role-mailbox classification to prevent shared inboxes being marked personal.

Video notifications show Higgsfield; confirmed sent and inbound email show Gmail with distinct labels. Failed and pending events cannot claim delivery. Send-response and sent-watcher aliases deduplicate the same message across event replay and dismissal. The sent watcher only adds the internal draft ID to its existing confirmed-sent event, with no new provider work or polling.

Validation: 29 focused tests passed. The full suite passed 352 agent tests and 90 root tests, plus root and changed-module syntax checks. The isolated execution environment could not import Pillow for an unchanged PDF fixture test; rerunning the full agent suite in the normal host environment passed all 352 tests. Independent harsh review: scoped PASS, including role-address regressions, failed-event exclusion, persistent notification alias deduplication and winning combined CSS rules. Native pixel/layout acceptance remains unverified. No paid requests, outreach sends, live database changes, app restart or desktop control.

Integration must retain main's newer Renders gallery, row-click details and product-image cache tags. Other sessions' uncommitted delivery tests and client media metadata remain outside this change.

Integrated with main through 8f992cb in an isolated worktree. The newer gallery, Campaign route, product-image cache tags and row-click detail interaction remain intact. Integration interaction/Renders suite: 42 passed. Final full integrated agent suite: 382 passed after retaining main's hermetic delivery test. Native desktop build with --no-install and root syntax checks passed. Independent integration source review: PASS. The existing app can load the updated static UI on reload; the backend process and its running work were not restarted.

## 2026-10-26: storyboard local storage failure and retry

Expected: Save version reports success only after local storage accepts a standalone storyboard. A failed local save retains the current edits and lets the user retry. A full local cache must not prevent a task-owned storyboard from saving to its server.

Reproduced: with localStorage.setItem throwing a quota error, Save version displayed Storyboard version saved locally. The new mocked DOM regression failed on this false success before the fix.

Changed: standalone persistence returns its actual cache result. Save version reports a storage failure instead of success, retains the edited text in memory and clears the failure after a successful retry. Task-owned boards still attempt server saving after a local cache failure. Existing controls, successful-save copy and layout are unchanged.

Verification: 14 focused planner, refresh, persistence and failure/retry tests passed, including the mocked server path with a full local cache. The neighboring Tasks/Leads DOM workflow and root/module syntax checks passed. Tests used in-memory stores and mocked fetch only. No paid requests, sends, live mutations, desktop control, restart, merge to main or deployment. Native visual acceptance is not asserted.

Independent review: scoped PASS, with the 14 tests rerun independently.

Next area: settings request failures and asynchronous navigation.

## 2026-10-27: delayed Settings navigation

Expected: leaving Settings while its data is loading keeps the newly opened task visible. A late response from the abandoned route must not replace that task.

Reproduced: the actual Settings function, executed with a held mocked loadState request, replaced a newly opened task with the Settings form after that request resolved. The new regression failed before the fix.

Changed: Settings accepts the router's existing isCurrent callback and checks it after its asynchronous load, before painting or attaching form handlers. Active Settings rendering, controls and copy are unchanged.

Verification: four tests passed across the new Settings navigation and mocked profile failure/retry cases, Analytics stale-response coverage and the neighboring Tasks/Leads DOM workflow. Root and changed-module syntax checks and diff checks passed. All requests were mocked or local temporary fixtures. Native visual acceptance is unverified. No paid requests, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS, including both new Settings tests and the router callback handoff.

Next area: reference uploads and interrupted file selection.

## 2026-10-27: overlapping storyboard still selections

Expected: when a user selects a replacement still while an earlier upload for the same shot is pending, the latest selection controls that shot. Uploads for different shots remain independent. Restoring a saved plan must not allow an abandoned upload to repaint it.

Reproduced: mocked reverse-order upload responses caused an older image to overwrite the newer selected still. A stale failed upload also replaced the newer success message with an unrelated error. Both regressions failed before the fix.

Changed: track the latest selection per shot and verify that its plan and shot still belong to the current state before attaching the upload or reporting its failure. Late superseded uploads cannot overwrite newer media or status messages. Existing upload controls, successful-import copy and layout are unchanged.

Verification: 19 focused and neighboring planner/persistence tests passed, including reverse completion, stale failure, independent shots, version restore during upload, and current failure/retry preserving the accepted still. The neighboring Tasks/Leads DOM workflow and root/module syntax checks passed. Tests use mocked file readers/uploads and local or in-memory fixtures. Native visual acceptance remains unverified. No provider requests, sends, live data mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS, with all 19 focused tests rerun independently.

Next area: render pause/stop and pending action controls.

## 2026-10-27: stale render polls after cancellation or live progress

Expected: a successful cancellation remains canceled when an earlier polling request finishes. Newer stream progress also takes precedence over an outstanding older read. Only a current polling failure should show Offline.

Reproduced: holding a mocked poll until after cancellation and its fresh read restored a canceled render to Queued. A pending old poll similarly replaced streamed Rendering progress with Queued, and a stale failed poll showed Offline after newer stream progress. Three regressions failed before the fix.

Changed: each render refresh carries a read version. New reads and valid stream patches invalidate older reads. Stale successes and errors, and results delivered after the view stops, cannot update the render state. Current failures still show Offline and recover on the next successful poll. Controls, copy, appearance and cancellation behavior are unchanged.

Verification: 22 render refresh, gallery and monitor tests passed, covering cancellation, streamed progress, stale errors, current failure/retry, stopped views and existing mocked gallery actions. Root/module syntax and diff checks passed. All requests used mock APIs and local DOM fixtures. Native visual acceptance remains unverified. No actual render approval, provider request, send, live mutation, desktop action, restart, main integration or deployment.

Independent review: scoped PASS, with all 22 render tests rerun independently.

Next area: lead filtering and keyboard interactions.

## 2026-10-27: keyboard access to lead details

Resumed the pass interrupted by ENOSPC after scoped writes became available again. No files outside this QA worktree were changed or removed.

Expected: a keyboard user can reach and open the same lead details drawer available by clicking a row. Existing external links retain their destinations.

Reproduced: the actual lead-row markup had a nonfocusable row, no enabled in-app action button and only external links. The new DOM assertion for a focusable details control failed before the fix.

Changed: brand names are native buttons with descriptive accessible labels. They use the existing delegated row action. Button styling inherits the existing brand typography, wraps long names and shows a keyboard focus outline. Visible copy, row-click behavior and external links are preserved.

Verification: five focused and neighboring tests passed, including actual button focus and activation, drawer close with Escape, external link isolation, row-click opening, and existing lead/contact workflows. Root/module syntax and diff checks passed. Tests used temporary local HTTP/DOM fixtures and in-memory records. Native keyboard and pixel/layout acceptance remain unverified. No provider requests, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS for native control semantics, escaped labels, wrapping/focus styling and five independently rerun tests.

Next area: analytics range selection and empty data.

## 2026-10-27: analytics range failure preserves data labels

Expected: the selected range and saved range preference identify the figures actually displayed. A pending or failed request for another range must not relabel the previous totals and chart.

Reproduced: selecting This week immediately selected and persisted week while the displayed data still belonged to Today. A failed range request retained those old figures under the wrong selection. The new held-request DOM regression failed before the fix.

Changed: range selection passes a candidate to the loader. The visible range and saved preference commit only after a successful response from the active mount. Failed requests keep the existing period and figures, with the existing error toast. Refresh then requests that same displayed period. Copy and layout are unchanged.

Verification: 14 analytics view, model and route tests passed. Coverage includes pending/failed range changes, disabled repeated selection, refresh of the retained range, successful retry, verified zero totals and keyboard chart inspection, unavailable payment history, and stale mounts. Root/module syntax and diff checks passed. All data and APIs were mocked or temporary fixtures. Native visual acceptance remains unverified. No provider requests, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS, with all 14 analytics tests rerun independently.

Next area: task activity details and filtering.

## 2026-10-27: legacy tool results in task activity

Expected: a catalog-read result stays inspectable beside its tool request even when older records do not carry call IDs. Repeated calls and other leads must not share results.

Reproduced: researchLead still emits shopify.products requests and results without callId, but toolLogRow matched results only by callId. Task activity filters to request rows, so the catalog result was absent. Two new tool-log regressions failed before the fix.

Changed: reuse the existing context-aware sequential tool pairing for both metadata and details, restricted to request/result events so intermediate errors cannot consume the match. Known Claude model suffixes on legacy operation names normalize for matching. Legacy request data appears under Input and its paired result under Result. Exact call IDs remain authoritative when present, and task/lead context and call order isolate repeated operations. Existing disclosures, summary copy and layout are unchanged.

Verification: 15 tool-log, sidebar pairing and task-view/DOM tests passed. New integration coverage checks the actual mounted task activity after a legacy catalog result arrives; existing focus retention, stale updates and lead workflows remain covered. Independent review first returned the intervening-error and model-suffix cases; both failed in added regressions before correction. Root/module syntax and diff checks passed. All fixtures were mocked or temporary local data. Native visual acceptance remains unverified. No provider requests, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with 14 tool-log, task-activity and sidebar tests independently rerun plus explicit-ID/context checks.

Next area: sender profile editing during pending saves.

## 2026-10-27: sender profile edits during a pending save

Expected: a successful profile save marks only its submitted values as saved. Newer edits remain dirty and available to save, and repeated submits do not overlap within a form. A detached form cannot alter a newly mounted form's state.

Reproduced: a second submit while the first request waited sent a duplicate request, and an old response used global selectors to mark a newer form All changes saved. The pending-save and remounted-form regressions failed before the fix. Source inspection also showed completion clearing dirty state without checking the current values.

Changed: track each form's last successful payload and pending request. Compare current fields to that snapshot, keep Save disabled while its request waits, and retain newer edits as Unsaved changes afterward. All dirty-state updates use that form's controls. Failed saves retain the previous snapshot, and returning fields to the saved values disables unnecessary resubmission. Copy and layout are unchanged.

Verification: five Settings and neighboring Tasks/Leads DOM tests passed, including failure/retry, overlapping submit suppression, edits during save, remount isolation, unchanged snapshots and stale navigation. Root/module syntax and diff checks passed. Requests and records were mocked or temporary local fixtures. Native visual acceptance remains unverified. No provider requests, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS, with all five tests independently rerun.

Next area: voice form validation and retry.

## 2026-10-27: voice validation before credit confirmation

Expected: invalid voice descriptions and sample lines fail validation before asking the user to confirm credit use. Valid inputs retain the confirmation and can retry after a failed request without losing text.

Reproduced: a short description reached the credit confirmation and mocked design request. The existing backend rejects invalid lengths before provider work, but the client still presented an unnecessary paid-action confirmation. The new DOM regression failed before the fix.

Changed: validate trimmed description and sample lengths before confirmation, using the existing server limits and error copy. Focus the invalid field. Existing valid confirmation, design, failure/retry controls and layout are unchanged.

Verification: 11 voice UI and mocked backend/provider tests passed. Coverage includes short, long and whitespace-only inputs, trimmed valid values, canceled credit confirmation, retained text and retry after request failure, and existing voice/check routes. Root/module syntax and diff checks passed. No actual credits were spent, and no provider requests, live mutations, desktop actions, restart, main integration or deployment occurred. Native visual acceptance remains unverified.

Independent review: scoped PASS, with all 11 mocked tests rerun and server-limit parity checked.

Next area: render new-shot draft retention and retry.

## 2026-10-27: new-shot draft saves preserve newer edits

Expected: repeated submit while a shot draft is saving creates only one request. If the user changes the title or prompt while saving, completion retains that newer draft for the next explicit submission. Failed requests retain text and allow retry.

Reproduced: two submit events created two pending draft POSTs, and completion of the first draft request reset newer title/prompt edits to blank. Both new regressions failed before the fix.

Changed: keep one creation request active per mounted form, disable its submit button while pending and compare current fields to the submitted snapshot before resetting or hiding. Newer edits remain in the form. Success after leaving the view cannot repaint it. The button recovers after completion or failure. Existing copy and appearance are unchanged.

Verification: 21 render creation, gallery and refresh tests passed, covering repeated submission, newer draft retention, normal reset, failed-request retry and the prior cancellation/stream race fixes. Root/module syntax and diff checks passed. Requests were mocked and created no live records. Native visual acceptance remains unverified. No actual render approval, provider requests, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS, with all 21 render tests independently rerun.

Next area: client review note editing and refresh.

## 2026-10-27: unchanged client feedback submits its displayed note

Expected: opening Changes on saved feedback and saving without typing submits the note displayed in the editor. Explicit edits, including clearing text, take precedence over saved feedback.

Reproduced: the editor displayed the existing saved review note, but save read only the input-event cache and submitted an empty string when no typing occurred. The new regression failed before the fix.

Changed: the feedback editor and local changes-requested submission use the same note lookup. Nullish fallback retains existing saved feedback only when the user has not edited it, and respects an intentional empty draft. Approval and simulated-review note behavior, copy and layout are unchanged.

Verification: 16 client review view, regression and backend tests passed. Coverage includes unchanged feedback resave, intentional clearing and its existing validation error, typed feedback retained after failure and refresh, retry against the new artifact version, approval note behavior and prior simulation/version checks. Root/module syntax and diff checks passed. All data and APIs were mocked or local in-memory fixtures. Native visual acceptance remains unverified. No provider requests, actual approvals, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS, with all 16 client-review tests independently rerun.

Next area: provider notifications and replay handling.

## 2026-10-27: delayed Gmail checks preserve newer draft state

Expected: a pending sent-mail check reconciles only the local draft snapshot it inspected. Replacing, editing, withdrawing or sending that draft while Gmail reads wait must invalidate the old result.

Reproduced: a delayed sent check marked a replacement Gmail draft sent and its lead contacted. The same race also emitted another sent event after a concurrent confirmed send, or a false deletion notice after replacement. Three focused regressions failed before the fix.

Changed: compare the current stored draft to the inspected snapshot after the final awaited Gmail read, before either sent-state reconciliation or deletion notification. Changed or removed records skip the stale result; an unchanged draft still reconciles normally. Existing copy and UI are unchanged.

Verification: 21 sent-watcher, notification and contact regression tests passed. Coverage includes replacement, in-place body/recipient/subject/attachment edits, withdrawn/local-only/deleted records, concurrent sends, unchanged reconciliation, old-message rejection, failed reads and notification identity. Root/module syntax and diff checks passed. All records were in-memory and every Gmail response was mocked. Native visual acceptance and live Gmail attribution remain unverified. Existing recipient/time message matching is unchanged. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS, with all 21 tests independently rerun.

Next area: draft editing and keyboard focus.

## 2026-10-27: offer PDF viewer preserves keyboard focus

Expected: opening an offer PDF moves focus into its viewer. Closing with the button or Escape returns focus to the originating offer control without closing the underlying lead drawer.

Reproduced: opening left focus behind the viewer, while close and Escape left focus on the page body after removing the focused close button. All three focused DOM regressions failed before the fix. Drafts are edited through the existing external Gmail link; this pass exercises the offer viewer beside that link.

Changed: capture the originating focus target and focus the viewer close button on opening. Restore a connected, visible target on closing. Switching from another offer control updates the return target, while replacing a PDF from inside its viewer retains the original target. Removed and hidden controls are not refocused. Copy, layout and existing Escape propagation are unchanged.

Verification: seven focused and neighboring DOM tests passed, including opening, close-button return, Escape preserving the drawer, switching/replacing PDFs, removed/hidden targets and the existing Tasks/Leads workflows. Root/module syntax and diff checks passed. Tests used temporary local fixtures and mocked providers. Native keyboard, embedded PDF behavior and visual acceptance remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS, with all seven tests independently rerun.

Next area: task steering and composer draft retention.

## 2026-10-27: steering submissions preserve newer directions across refreshes

Expected: a pending steering submission queues one direction for its session. Newer text remains unsent and visible after success, failure or a session repaint. A detached form's completion must not repaint its replacement.

Reproduced: repeated submit events queued two directions, success reset newer input, and completion repainted a replacement form. Three new regressions failed before the fix. A separate repaint regression exposed a remaining duplicate path in the initial per-form guard; the independent reviewer also returned that case before final acceptance.

Changed: track pending steering requests by session key and reflect that state in the rendered Send button. Clear only the displayed input that still matches the submitted raw text. Retain newer input through session refresh, skip repainting from a detached form, and re-enable the current session control after success or failure. API text remains trimmed. Copy and layout are unchanged.

Verification: eight focused and neighboring DOM tests passed. Coverage includes repeated submit, edits during the POST and refresh, failure/retry, detached forms, actual session repainting during a request, unchanged remounted snapshots and remounted failure/retry. Root/module syntax and diff checks passed. All requests were mocked or used temporary local fixtures. Native keyboard and visual acceptance remain unverified. No actual steering of live tasks, provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all eight tests independently rerun after the session repaint correction.

Next area: composer attachments and upload removal.

## 2026-10-27: selected uploads continue after leaving Home

Expected: navigating away during a selected multi-file upload does not crash the batch or leave a file permanently uploading. Returning to Home displays the remaining attachment state.

Reproduced: after the first awaited upload finished, the next iteration tried to render into the removed composer host and threw before uploading the second file. The same crash followed a failed first upload. Both new regressions failed before the fix.

Changed: guard the initial attachment-chip render with the same host-availability check already used after upload completion. Local attachment state and upload progression continue while the composer is absent. Existing copy and layout are unchanged.

Verification: six focused and neighboring DOM tests passed, covering navigation after success/failure, rendering into a newly mounted composer host, removal during upload, existing size/count limits and the Tasks/Leads workflows. Root/module syntax and diff checks passed. All uploads were mocked; other records were temporary local fixtures. Native file picking, keyboard and visual acceptance remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS, with all six tests independently rerun.

Next area: connection refresh failures and status accuracy.

## 2026-10-27: connection refresh failures retain results and retry

Expected: failed connection refreshes retain the last checked results with their original timestamps and allow retry. A delayed older check must not overwrite a newer completed check. The missing-endpoint fallback remains available for older backends.

Reproduced: a failed manual or background request replaced saved results with the unchecked config fallback and removed the manual retry button. A delayed older response also overwrote a newer check. Four focused regressions failed before the fix.

Changed: only the latest issued connection request can update state. Failed refreshes preserve existing API results and repaint the retry control. Manual failure shows a concise error notification; background failures remain quiet. The existing status labels, timestamps, layout and initial legacy fallback are unchanged.

Verification: 22 connection-refresh, sidebar, mocked provider-cost/health and neighboring Tasks/Leads DOM tests passed. Coverage includes HTTP/network failure, retained retry controls, successful retry, out-of-order responses, quiet background failure, legacy fallback and existing connection verification levels. Root/module syntax and diff checks passed. All provider responses were mocked and app records were temporary local fixtures. Native visual acceptance and actual provider health remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS, with all 22 tests independently rerun.

Next area: lead filters under rapid sorting and refresh.

## 2026-10-27: stale lead refreshes preserve current rows and draft links

Expected: overlapping Leads refreshes preserve the newest active list, selected sorting and associated draft links. A departed route must not mutate shared draft maps or remount its old page.

Reproduced: older same-route responses replaced newer rows and Gmail maps. Departed-route draft reads still mutated the maps despite the list route guard, and a delayed lead list repainted after its older draft read had finished. Three regressions failed before the fix. Independent review also returned a Tasks control callback that discarded its route guard; two additional regressions failed before correcting it.

Changed: sequence Leads loads and shared draft-map reads, and check caller currency before applying either result. Tasks passes its existing route guard into draft loading. Its asynchronous Always on callback refreshes Tasks only while current and forwards that guard. Existing filter/sort controls, labels, copy and layout are unchanged.

Verification: 10 lead-refresh, lead-badge and neighboring Tasks/Leads DOM tests passed. Coverage includes response ordering, departed routes, independent shared-map reads, sorting/filter counts, withdrawn drafts and late/current Tasks control callbacks. Root/module syntax and diff checks passed. Every request was mocked or used temporary local fixtures; control callbacks received simulated disabled responses. Native visual acceptance remains unverified. No actual autopilot changes, provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 10 tests independently rerun after the Tasks callback correction.

Next area: voice page navigation and load failures.

## 2026-10-29: delayed Voices loads preserve current navigation

Expected: leaving Voices during its initial or storyboard read preserves the new route. Older mounts and completed voice actions must not reopen an obsolete view.

Reproduced: five navigation regressions failed in the interrupted October 27 pass. The page painted after either delayed read, older same-view mounts replaced newer ones, a completed check reopened Voices after leaving, and the app wrapper omitted its route guard. This pass resumed that saved reproduction before starting another area.

Changed: pass the route guard through the app wrapper and Voices reload callbacks. Track ownership per view and check it after both initial reads. Action completion reloads only the still-current mount. Existing copy, layout, validation and credit confirmations are unchanged.

Verification: 18 navigation, voice-form, mocked voice-backend and neighboring Tasks/Leads DOM tests passed. Coverage includes both pending reads, overlapping mounts, late check completion, route guard forwarding, initial load failure propagation, input validation, cancellation and failed-request retry. Root/module syntax and diff checks passed. All provider responses were mocked and app records were temporary local fixtures. Native navigation, audio playback and visual acceptance remain unverified. No provider calls, credits spent, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS, with all 18 tests independently rerun.

Next area: render gallery keyboard controls and empty selections.

## 2026-10-29: render tabs retain focus during selection and live updates

Expected: selecting a gallery tab, including an empty one, retains keyboard focus on that tab. Live count updates preserve the focused tab without moving focus from other controls.

Reproduced: patchTabs replaced the focused button during both tab selection and a live render update, leaving focus on the page body. Both new focus regressions failed before the fix.

Changed: capture the focused tab key before updating tab markup and restore the equivalent replacement with scroll preservation. Restore only when focus was inside the tab bar. Copy, layout, counts and existing tile keyboard handlers are unchanged.

Verification: 22 render-tab, gallery and refresh-race tests passed. Coverage includes empty selections, live count changes, no outside focus stealing, tile Enter/Space activation, Escape closing, existing gallery actions and cancellation/stream ordering. Root/module syntax and diff checks passed. All APIs and provider actions were mocked. Native keyboard, media playback and visual acceptance remain unverified. No actual approvals, provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS, with all 22 tests independently rerun.

Next area: task activity filtering and disclosure retention.

## 2026-10-29: standalone research tool failures remain visible

Expected: task activity exposes failed tool work even when the producer records an error without a tool-result event. Open failure details and keyboard focus survive later activity updates.

Reproduced: the existing research profile catch records a tool-annotated error with no result, but activity filtered exclusively to requests and hid that failure. Three focused regressions failed before the fix.

Changed: include tool-annotated errors alongside requests in the existing latest-12 activity window. Use the existing compact log renderer and failure status. Results remain paired inside their requests, and errors remain separate so they cannot steal fallback catalog results. Existing copy and styling are unchanged.

Verification: 15 activity, log-rendering and neighboring Tasks/Leads DOM tests passed. Coverage includes standalone failure visibility, accurate failure metadata, retained disclosure/focus, paired results without duplicate rows, compact event order, legacy pairing, redaction and stale-response isolation. Root/module syntax and diff checks passed. All APIs were mocked or used temporary local fixtures. Native keyboard and visual acceptance remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS, with all 15 tests independently rerun.

Next area: client brand context save failure and retry.

## 2026-10-29: client brand save retries recover after report reload failure

Expected: saving brand context remains retryable if the subsequent report reload fails. The visible form keeps its input and can refresh the report on retry without reclaiming a newer task view.

Reproduced: a successful context POST followed by failed report GET replaced the active context before rendering. The old form re-enabled its button, but later retries skipped report reload because that form no longer owned the active context. The new recovery regression failed before the fix.

Changed: retain the previous context during a client report load and restore it on read failure only when the failed mount still owns the same connected view and both route guards remain current. Propagate the original error so the existing form handler preserves input and enables retry. Copy and layout are unchanged.

Verification: seven client-context and neighboring task-view/DOM tests passed. Coverage includes successful-save/failed-report retry, failed POST retry, a newer task taking ownership during failure, retained input and existing activity/disclosure behavior. Root/module syntax and diff checks passed. All client context POSTs were mocked and other app records were temporary local fixtures. Native visual acceptance remains unverified. No actual order changes, research starts, provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS, with all seven tests independently rerun.

Next area: Home composer draft state during delayed replies.

## 2026-10-29: failed assistant replies preserve newer composer drafts

Expected: a failed reply keeps newer unsent work intact. An untouched empty composer can recover the failed message for retry, including after its form is rebuilt.

Reproduced: failure overwrote newer input with the old message, or restored into a detached form after composer replacement. Two initial regressions failed. Additional file-only, link-only and changed-mode cases reproduced retry text mixing into a different draft.

Changed: capture the submitted composer mode and restore failed text into the current input only while it remains empty, uses that mode, and has no new files or links. Existing thread cleanup, errors, successful replies and retry wording are unchanged. Copy and layout are unchanged.

Verification: 14 reply-draft, upload and neighboring Tasks/Leads DOM tests passed. Coverage includes newer input, replacement forms, untouched retry, successful replies, pending-submit suppression, navigation, reference-only drafts, mode changes and existing upload behavior. Root/module syntax and diff checks passed. Assistant requests and uploads were mocked; other records were temporary local fixtures. Native keyboard, dictation and visual acceptance remain unverified. No model/provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 14 tests independently rerun.

Next area: spend panel response ordering and partial data.

## 2026-10-29: stale spend refreshes preserve newer totals

Expected: overlapping Spend refreshes retain the newest provider snapshot and its associated collected revenue. A delayed legacy fallback must not replace a newer modern cost response.

Reproduced: older modern responses and an older pending legacy fallback each overwrote newer provider totals and collected revenue. Both focused regressions failed before the fix.

Changed: sequence Spend refreshes and ignore superseded results after the initial cost/revenue reads and after the optional legacy read. State commits synchronously after the relevant guard. Existing calculations, coverage labels, copy and layout are unchanged.

Verification: 21 Spend-view, mocked cost/usage and neighboring Tasks/Leads DOM tests passed. Coverage includes modern/fallback response ordering, partial and unknown provider amounts, failed endpoints retaining prior data, legacy ledger values, confirmed zero collected revenue and existing usage reconciliation. Root/module syntax and diff checks passed. All provider responses were mocked and app records were temporary local fixtures. Actual balances, billing and native visual acceptance remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS, with all 21 tests independently rerun.

Next area: client review section refresh and failures.

## 2026-10-29: unavailable review artifacts do not offer unsaveable feedback

Expected: a section without a reviewable artifact version does not offer a Changes editor whose save would silently do nothing. Refreshing to an unavailable artifact removes that dead-end editor while retaining its cached draft.

Reproduced: images with a null artifact version still enabled Changes and Save feedback, but the existing save guard returned without a request or message. Refresh could also leave an enabled editor after the image artifact disappeared. Two focused regressions failed before the fix.

Changed: apply the existing artifact-availability condition to Changes and the feedback editor, consistent with Approve and backend validation. Existing draft storage, error behavior, copy and styling are unchanged.

Verification: 19 availability, review-view, regression and in-memory backend tests passed. Coverage includes initially missing artifacts, failed save followed by refresh to a missing artifact, available-version feedback, prior note retention, retry, version invalidation and simulation boundaries. Root/module syntax and diff checks passed. All requests were mocked or used local in-memory records. Native keyboard and visual acceptance remain unverified. No real approvals, provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent review: scoped PASS, with all 19 tests independently rerun.

Next area: Settings keyboard editing and dirty-state recovery.

## 2026-10-29: restored Settings text retains its unsaved state

Expected: when routing restores unsaved text into a newly mounted Settings form, that text remains visibly unsaved and Save is enabled until the current value is saved.

Reproduced: a same-route remount restored writing rules into a previously empty field after Settings captured its saved fingerprint. The page displayed the unsaved text with All changes saved and a disabled Save button. The integrated route and Settings regression failed before the fix. Independent review identified this gap after initial input-only probes passed.

Changed: dispatch the normal bubbling input event only when routing actually restores a field value. Existing dirty-state, textarea sizing and composer handlers can reconcile restored values. Existing nonempty authoritative field handling, copy and layout are unchanged.

Verification: 23 Settings, composer upload/reply and neighboring Tasks/Leads DOM checks passed. Coverage includes restored text remaining saveable, unchanged fields staying saved, focus restoration, cleared values, multiline Unicode payloads, failed-save retries, pending-save edits and detached forms. Root/module syntax and diff checks passed. Payload and input retention checks used mocked responses, not backend persistence. Native keyboard and visual acceptance remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 23 tests independently rerun.

Next area: Leads filtering and selected-row recovery after refresh.

## 2026-10-29: newer lead drawer details survive overlapping reads

Expected: reopening a brand uses its newest requested details and draft link. An older response cannot replace those details, including after selecting another brand and returning.

Reproduced: openLead guarded only the selected id. Two overlapping reads for the same id, or an A to B to A selection sequence, allowed the older A response to replace the newer drawer content and draft-map entry. Both focused regressions failed before the fix.

Changed: sequence drawer reads and require both the current request and selected id before rendering or changing the draft map. Existing closed-drawer checks, actions, copy and layout are unchanged.

Verification: 20 lead drawer, list-refresh, badge, PDF-focus and neighboring Tasks/Leads DOM tests passed. Coverage includes same-id response ordering, returning to a brand, switching brands, closing during a refresh, list/filter ordering, withdrawn drafts and existing report interactions. Root/module syntax and diff checks passed. All lead reads were mocked; neighboring app records were temporary local fixtures. No send or approval handlers were invoked. Native visual acceptance remains unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 20 tests independently rerun.

Next area: Renders media fallback and missing thumbnail metadata.

## 2026-10-29: gallery tiles refresh when media sources change

Expected: a new still or changed product photo updates its render tile even when status and product index remain the same. Fresh media retries from the first candidate after old fallbacks fail. Unrelated metadata preserves the current media element.

Reproduced: the tile signature omitted remote still URLs and hero image URLs. Three focused regressions failed: the old product image remained, a ready remote still was ignored, and an exhausted fallback stayed on the logo after fresh media arrived. The detail panel already used the newer media.

Changed: fingerprint the actual ordered media candidates in the tile signature, including source URLs and poster metadata. Existing media selection, fallback order, copy and styling are unchanged.

Verification: 26 media-refresh, gallery, read-ordering and tab-focus tests passed. Coverage includes same-index product photo changes, newly available remote stills, fallback reset, element retention on unrelated metadata, existing video/still/hero/logo fallbacks, local mock action controls and stream behavior. Root/module syntax and diff checks passed. New tests used mocked reads only; all neighboring action calls were mocked. Native media playback, image loading and visual acceptance remain unverified. No actual approvals, provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 26 tests independently rerun.

Next area: Analytics empty-period and date-range recovery.

## 2026-10-29: storyboard selection updates untouched voice descriptions

Expected: selecting a different storyboard replaces its automatically supplied voice description when the user has not customized it. Custom descriptions and sample text remain intact.

Reproduced: choosing storyboard A filled its voice description, then choosing B changed the selected id but kept A's description. The same mismatch occurred after choosing None between A and B. Both focused regressions failed before the fix.

Changed: remember the last automatically filled description. A selection fills a blank description or replaces that exact previous automatic value. None retains the existing text. Existing validation, credit confirmation, copy and layout are unchanged.

Verification: 21 storyboard-selection, voice-form, navigation and mocked voice-service tests passed. Coverage includes direct switching, customized descriptions, cleared text, None, retained sample text, invalid-input rejection, confirmation cancellation and navigation guards. Root/module syntax and diff checks passed. New selection tests performed mocked reads only; neighboring generation/check/save requests used mocks and temporary local data. Native selection and visual acceptance remain unverified. No actual voice generation, provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 21 tests independently rerun.

Next area: Task reference upload error recovery.

## 2026-10-29: unreadable storyboard images show a useful error

Expected: if the browser cannot read a selected still or reference image, the error is visible, accepted assets remain intact and the user can retry without an upload request being sent.

Reproduced: FileReader rejected its raw ProgressEvent, which has no message. Both still import and reference upload displayed a blank error. Two focused regressions failed before the fix, including the case where the browser supplies no error object.

Changed: reject the reader error when present, otherwise provide a short image-read error. Existing upload validation, asset selection, persistence, copy and styling are otherwise unchanged.

Verification: 13 upload-race, storyboard-refresh, local-save, task-view and neighboring Tasks/Leads DOM tests passed. Coverage includes visible read errors, zero upload requests after read failure, successful mocked retry, retained references, released controls, current/stale upload failures and existing revision guards. Root/module syntax and diff checks passed. FileReader events and uploads were mocked; app records were temporary local fixtures. Actual disk faults, native file-picker behavior and visual acceptance remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 13 tests independently rerun.

Next area: Home link attachment validation and cancellation.

## 2026-10-29: composer rejects malformed reference links

Expected: Add link accepts a complete HTTP or HTTPS reference URL. Invalid text stays in the editor with the existing validation message so it can be corrected.

Reproduced: the partial regular-expression match accepted a URL followed by pasted notes and a URL containing an invalid port. Both focused regressions failed before the fix, with an invalid attachment added and the editor cleared.

Changed: parse the URL and require a complete whitespace-free HTTP(S) value with a dotted hostname before attaching it. Accepted URLs retain their exact trimmed text. Existing validation copy, attachment markup and removal behavior are unchanged.

Verification: 19 link, upload, reply-draft and neighboring Tasks/Leads DOM tests passed. Coverage includes pasted notes, invalid ports, unsupported schemes, missing hosts, valid path/query/fragment and HTTP port values, retained invalid input, Enter preventing submission and correctly reindexed removal. Root/module syntax and diff checks passed. New link tests invoked no APIs; neighboring requests were mocked or used temporary local fixtures. URL reachability, native keyboard and visual acceptance remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 19 tests independently rerun.

Next area: Connections partial status and retry controls.

## 2026-10-29: connection checks retain pending state through shell updates

Expected: Check again remains disabled and shows its loading indicator while its connection check is pending, including after unrelated shell updates. An older completion cannot clear a newer check's pending state.

Reproduced: a manual check disabled only its existing button. Repainting the shell created a fresh enabled button without the loading indicator while the same request remained pending. The focused regression failed before the fix.

Changed: store pending connection-check state outside the button and render that state on each repaint. Clear it only after the current response passes the existing request-order guard. Ignore manual check activation while a request is pending. Existing checked results, failure messages, copy and styling are unchanged.

Verification: 24 connection-refresh, sidebar, mocked cost/provider and neighboring Tasks/Leads DOM tests passed. Coverage includes repaint during a check, disabled duplicate activation, an older response during a newer check, successful completion, failure retention/retry and legacy fallback. Root/module syntax and diff checks passed. All requests were mocked or used temporary local fixtures. Native loading animation and visual acceptance remain unverified. No actual provider checks, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 24 tests independently rerun.

Next area: Task activity disclosure state after empty or failed updates.

## 2026-10-29: removed activity rows retain a keyboard return point

Expected: when a focused tool row falls outside the compact activity limit or an update empties the log, keyboard focus returns to Task activity. Failed reads preserve the current details, and activity updates never take focus from another control.

Reproduced: pruning the focused oldest row from the latest 12 entries, or replacing its activity with an empty list, removed its focused disclosure and left focus on the document body. Both focused regressions failed before the fix.

Changed: after existing row and payload focus restoration, focus the outer activity summary only when focus had been inside the replaced activity and no target inside it retained focus. Existing compact bounds, disclosure states, copy and styling are unchanged.

Verification: 19 pruning, error-activity, task-view, tool-log and neighboring Tasks/Leads DOM tests passed. Coverage includes a pruned focused row, empty activity, failed-read preservation and recovery, external focus retention, expanded details, result pairing and stale reads. Root/module syntax and diff checks passed. Requests were mocked or used temporary local fixtures. Native keyboard and visual acceptance remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 19 tests independently rerun.

Next area: Client review feedback cancellation and stale versions.

## 2026-10-29: side-panel tabs retain keyboard focus when redrawn

Expected: activating or redrawing a focused side-panel tab retains focus on its replacement control. Programmatic panel changes preserve focus outside the tab strip.

Reproduced: setRailTab replaced its entire tab strip, removing the focused button and leaving focus on the document body. Both activation and same-tab redraw regressions failed before the fix.

Changed: capture the focused tab key when focus is inside the strip, then focus its replacement with preventScroll after rebuilding the controls. Existing selection, panel visibility, preferences, copy and styling are unchanged.

Verification: 20 rail-tab, connection-refresh, sidebar, Spend-refresh and neighboring Tasks/Leads DOM tests passed. Coverage includes all four tabs, same-tab redraw, selected/panel/preference consistency, external focus retention and preserving mounted Browser controls. Root/module syntax and diff checks passed. New tests used mocked panel helpers; all neighboring requests were mocked or used temporary local fixtures. Native keyboard and visual acceptance remain unverified. No actual provider checks, Browser panel launches, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 20 tests independently rerun.

Next area: Leads sort-menu state and dismissal.

## 2026-10-29: dismissed sort menus report their closed state

Expected: dismissing the Leads sort menu updates both its visibility and the trigger's expanded state. Existing sort selection and unrelated disclosures remain intact.

Reproduced: outside click hid the menu through closeMenus but left sortbtn aria-expanded=true. The shared dismissal regression reproduced the same mismatch. Both focused checks failed before the fix.

Changed: include the sort trigger in the existing known-menu trigger reset list. Existing menu behavior, copy and styling are unchanged.

Verification: 17 sort-menu, lead-refresh, composer-link and neighboring Tasks/Leads DOM tests passed. Coverage includes outside/shared dismissal, open/close toggling, existing composer triggers, unrelated disclosure state and selected sort preference/label retention. Root/module syntax and diff checks passed. Requests were mocked or used temporary local fixtures. Native screen reader, keyboard and visual acceptance remain unverified. No actual requalification, provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 17 tests independently rerun.

Next area: Analytics keyboard metric switching.

## 2026-10-29: Analytics metric switches retain keyboard focus

Expected: activating Revenue or Spend retains focus on the selected metric after the chart is redrawn. Updates preserve focus on controls outside Analytics.

Reproduced: metric activation rebuilt the view and removed its focused button, leaving focus on the document body in either direction. Both focused regressions failed before the fix.

Changed: capture the currently focused metric at render time and focus its replacement with preventScroll after binding controls. Existing calculations, selected values, API requests, copy and styling are unchanged.

Verification: 17 metric-focus, range-failure, navigation and in-memory analytics tests passed. Coverage includes both metric directions, selected/value consistency, external focus retention, bounded chart key handling, no additional reads during metric changes and existing period/revenue-coverage behavior. Root/module syntax and diff checks passed. All API reads were mocked and backend records were local fixtures. Native keyboard and visual acceptance remain unverified. No live balances or payments retrieved, provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 17 tests independently rerun.

Next area: Settings profile field escaping and clear/revert behavior.

## 2026-10-29: composer redraws retain unsaved reference links

Expected: choosing another model or composer mode keeps the open reference editor and its unsaved text. A link is attached only after explicit Add link activation.

Reproduced: rerenderComposer retained only the message textarea. Model changes erased an open link draft or rejected link awaiting correction, and mode changes erased the same draft. Three focused regressions failed before the fix.

Changed: capture and restore the link editor's value and open state alongside existing message text before rebinding the composer. Existing model/mode selection, committed references, copy and styling are unchanged.

Verification: 24 model-draft, link-validation, upload, reply-draft and neighboring Tasks/Leads DOM tests passed. Coverage includes model and mode switching, rejected text retention, explicit attachment after redraw without duplication, retained file/link references and keeping an unused editor hidden. Root/module syntax and diff checks passed. New tests invoked no APIs; neighboring requests were mocked or used temporary local fixtures. Native keyboard and visual acceptance remain unverified. No actual generation, provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 24 tests independently rerun.

Next area: Voices pending design form recovery.

## 2026-10-29: successful voice designs retain newer unsent form edits

Expected: edits made while a voice design or its subsequent preview-list refresh is pending survive that successful refresh. The unchanged submitted form clears normally. A next design still requires an explicit submission and credit confirmation.

Reproduced: success remounted Voices with an empty hidden form, erasing newer description/sample edits and edits made during the preview read. Both focused regressions failed before the fix.

Changed: successful-design refresh supplies an internal draft reader sampled immediately before replacing the view. Restore raw description, sample, storyboard selection, form visibility and the prior autofill marker. Clear the form only when its raw values still match the submitted snapshot. Check/save remount behavior remains unchanged; draft recovery is scoped to successful design refreshes.

Verification: 27 design-draft, storyboard-selection, form-validation, navigation and mocked voice-service tests passed. Coverage includes newer input during both waits, explicit subsequent confirmation, unchanged-form clearing, failed POST retention, storyboard/autofill continuity and a preview-check completion not replaying a pending submitted design as another valid draft. Root/module syntax and diff checks passed. All generation/check/save calls were mocked or used temporary local fixtures. Native keyboard and visual acceptance remain unverified. This is not a general cross-action serialization guarantee. No real voice generation, credit use, provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 27 tests independently rerun, including the cross-action regression.

Next area: Client brief refresh and missing research states.

## 2026-10-29: failed draft reloads retain last-known drafts and links

Expected: a temporary draft-list loading failure preserves known Drafts filter rows, counts and Gmail or Instagram links. A successful empty list still removes drafts that no longer exist.

Reproduced: loadDraftMaps treated a failed read as an empty list and cleared all draft maps. Known brands vanished from the Drafts filter, Gmail links disappeared and DM readiness was lost. Three focused regressions failed before the fix.

Changed: return cached primary drafts on a failed read without changing the draft maps. Successful responses retain existing replacement, withdrawal filtering and stale-response guards. Current copy and styling are unchanged.

Verification: 25 draft-failure, lead-refresh, drawer-refresh, badge, sort-menu and neighboring Tasks/Leads DOM tests passed. Coverage includes successful empty responses, explicit retry replacement, initial failure with no cache, withdrawn draft exclusion and both stale success/failure orderings. Root/module/test syntax and diff checks passed. API requests were mocked or used temporary local fixtures. This retains last-known data and does not establish freshness. Native keyboard and visual acceptance remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 25 tests independently rerun.

Next area: Reference selector keyboard focus and dismissal.

## 2026-10-29: reference removal retains focus inside the picker

Expected: removing a focused reference keeps keyboard focus in the current reference panel and leaves Escape dismissal available. A removal that does not own focus preserves focus elsewhere.

Reproduced: rebuilding the lab after reference removal discarded the focused removal button and left focus on the document body. Escape then failed to reach the picker. Four focused regressions failed before the fix.

Changed: when the removal button owns focus, focus the next remaining removal control, the previous one at the end, or the current role's Upload image control when empty. Use preventScroll and retain existing copy, styling and role selection.

Verification: 21 reference-removal, upload-race, local-save, research-refresh and planner tests passed. Coverage includes first/last/only removal, external focus retention, Escape dismissal and apparel-role isolation. Root/module/test syntax and diff checks passed. Upload and research requests were mocked. Native keyboard and visual acceptance remain unverified. No provider calls, actual uploads, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 21 tests independently rerun.

Next area: Render group filtering after status changes.

## 2026-10-29: all counted client purchases retain a brief row

Expected: every successful purchase included in Client work has a reachable brief row, ordered by the existing payment sort. Duplicate or failed purchases remain filtered out.

Reproduced: the section count included all successful purchases, but ordersHTML silently truncated the list at twelve rows. Fixtures with thirteen and fifteen distinct purchases lost older brief links. Two focused regressions failed before the fix.

Changed: remove only the twelve-row cutoff from ordersHTML. Existing sorting, payment deduplication, status filtering, copy and styling remain intact.

Verification: 15 order-list, task-list-model, lead-refresh and neighboring Tasks/Leads DOM tests passed. The actual paintOrders function is covered in one document through empty/populated/empty states, and through twenty purchases alongside one retained task row. Counts match rendered rows, failed/refunded records stay excluded and displayed values remain escaped. Root/module/test syntax and diff checks passed. Requests were mocked or used temporary local fixtures. Native keyboard and visual acceptance remain unverified. No actual purchases, provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 15 tests independently rerun.

Next area: Connection status unavailable metadata and retries.

## 2026-10-29: stale Home history cannot erase newer chat turns

Expected: history reloads preserve newer messages and replies, including optimistic user turns. Older failed reads must not disable a healthy conversation. Fresh history remains available after a reply finishes.

Reproduced: an older history response replaced newer history or erased pending/completed chat turns. An old failure set thread.ok=false after newer success. If history replaced an optimistic user turn before the reply failed, the failure handler popped an older saved turn. Six focused regressions failed before the fix using isolated cloned response fixtures.

Changed: version history reads and invalidate them when an assistant message starts. Apply only the current read's success or failure, and avoid starting history reads while a reply is pending. Existing message copy, layout, retry text and composer behavior remain intact.

Verification: 27 history-race, composer-reply, model-draft, upload and neighboring Tasks/Leads DOM tests passed. Coverage includes both pending and completed replies, competing read success/failure, failed-reply cleanup, retry after a current history failure and fresh post-reply history. Root/module/test syntax and diff checks passed. All assistant/history/upload calls were mocked or used temporary local fixtures. Native keyboard, visual behavior and live assistant persistence remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 27 tests independently rerun.

Next area: Live tool trace duplicate results and collapse persistence.

## 2026-10-29: retained Live events ignore duplicate stream delivery

Expected: replaying the same retained event record does not add duplicate trace rows, inflate repeated-step counts or move a task's latest-step marker backward. Distinct event IDs and unkeyed events remain visible.

Reproduced: repeated stream delivery appended the same call/result IDs again, created an extra tool child, inflated a main event count and regressed lastStep to a replayed call. Four focused regressions failed before the fix.

Changed: ignore event IDs already present in the bounded Live buffer before ingesting them or running downstream trace and notification handling. Existing copy and styling remain intact. Deduplication covers only the current 300-event buffer. Selected-lead ideation refresh still runs before this guard.

Verification: 24 replay, sidebar, tool-log, task-activity and neighboring Tasks/Leads DOM tests passed. Coverage includes request/result pairing, distinct event ownership, legitimate repeated steps, unkeyed events and retained expanded-child state without scheduling a Live repaint. Root/module/test syntax and diff checks passed. Stream data and requests were mocked or used temporary local fixtures. Expanded-state assertions do not establish native disclosure rendering. Real reconnection, native keyboard and visual acceptance remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 24 tests independently rerun.

Next area: Voices preview selection during list refresh.

## 2026-10-29: delayed voice refresh rechecks playback before routing

Expected: a voice update scheduled while previews are paused must not rebuild the route if listening starts or the user leaves Voices during the refresh delay.

Reproduced: the voice-event guard checked audio only before scheduling softRefresh(route). Starting playback during its 400 ms delay still called route, as did leaving Voices. Three focused regressions failed before the fix.

Changed: recheck the current Voices route and paused audio when the deferred callback runs. Existing initial admission and shared timer replacement behavior remain intact. Copy and styling are unchanged.

Verification: 31 playback-refresh, preview-list, navigation, storyboard-selection, form and design-draft tests passed, including seven ignored preview probes. Coverage uses actual softRefresh with controlled timers and mocked paused flags, plus option order, distinct sample sources, escaped names, missing-audio controls, normal paused refresh and recovery on a later event. Root/module/test syntax and diff checks passed. Provider actions were mocked. This checks state when the timer fires, not throughout later asynchronous route reads, and does not automatically retry when playback ends. Native playback, keyboard and visual acceptance remain unverified. No actual audio playback, provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 31 tests independently rerun.

Next area: Lead website and social link routing.

## 2026-10-29: Leads Instagram links follow the saved profile handle

Expected: the Leads Instagram icon links to the same saved profile as the detail drawer, including brands with a saved handle but no separate social URL.

Reproduced: socialLinks ignored instagram_handle, omitting known profiles or linking to a different older social URL while the drawer preferred the current handle. Compact and large link regressions produced three failures before the fix.

Changed: use the existing instaUrl helper for Instagram within socialLinks. Other provider routing, order, wrappers, labels, copy and styling remain intact.

Verification: 20 social-link, drawer-refresh, lead-badge, lead-refresh and neighboring Tasks/Leads DOM tests passed. Coverage includes handle-only records, handle preference matching the drawer, existing HTTPS fallback, compact and large links, external-link attributes and excluding unsupported social schemes. Root/module/test syntax and diff checks passed. Requests were mocked or used temporary local fixtures; no external navigation occurred. Generated-link assertions do not verify Instagram account validity or native icon alignment. Native keyboard and visual acceptance remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 20 tests independently rerun.

Next area: Analytics displayed totals with missing provider values.

## 2026-10-29: positive sub-cent analytics values do not appear as zero

Expected: a positive recorded expense below one cent is distinguishable from zero in Analytics, consistent with the existing shared spend formatter. Unavailable values remain separate.

Reproduced: a known $0.004 recorded expense displayed as $0.00 in the money card and chart despite the correct raw total. Four focused regressions failed before the fix.

Changed: the Analytics currency formatter displays positive values below one cent as <$0.01. Zero, exact cents, unavailable values, accounting calculations, layout and other copy are unchanged.

Verification: 23 small-spend, metric-focus, range-failure, navigation and in-memory accounting tests passed. Coverage includes card/chart/bucket agreement, zero and exact-cent boundaries, unknown revenue alongside known spend, and excluding usage/balance metadata without a priced ledger amount. Root/module/test syntax and diff checks passed. No actual provider balances or payments were retrieved. Native keyboard and visual acceptance remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 23 tests independently rerun.

Next area: Settings save and retry controls.

## 2026-10-29: existing final videos respect missing local tooling

Expected: missing ffmpeg disables both first-time final creation and remaking an existing final, with the existing setup warning. Upload eligibility for an already valid final remains independent of video creation tooling.

Reproduced: independent review sent back an existing-final state missed by the first read probes. With ffmpeg absent, Remake final video and Make it again remained enabled even though the backend rejects the operation. Two permanent regressions failed before the fix for stale and fresh existing finals.

Changed: apply the existing warning copy and ffmpeg disabled condition to the existing-final remake path. Existing upload gating, media, copy and styling remain intact.

Verification: 19 tooling, delivery-read, client-context-retry and task-activity tests passed, including eight ignored read probes. Both fresh/stale remakes are disabled without tooling; a fresh valid final can still upload when storage is available, a stale one cannot, and a later tooling read restores remake availability. Root/module/test syntax and diff checks passed. Delivery reads were mocked and no delivery action buttons were invoked. Actual final creation, upload, Gmail, clipboard and native media behavior remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: sent back the missing-tool state, then returned scoped PASS with all 19 tests independently rerun after the fix.

Next area: Reference history restoration and staged request state.

## 2026-10-29: Lead status follows the current primary draft

Expected: a freshly opened DM-ready draft shows DM ready, even when the list cache previously saw a waiting draft. An older DM must not give a newer email draft the wrong milestone.

Reproduced: the drawer updated the primary draft cache but the status helper read DM readiness from a separate older map. Fresh ready DMs showed Drafted after waiting or absent cached DM data, and an older ready DM mislabeled a newer primary email. Three focused regressions failed before the fix.

Changed: derive the DM-ready milestone from the same primary draft used for blockers and other draft status. Existing copy, styling and action behavior remain intact.

Verification: 27 draft-availability, drawer-refresh, draft-map-failure, lead-badge and neighboring Leads/Tasks tests passed. Coverage includes withdrawn email cleanup links, newer withdrawn rows, missing Instagram connection, rejected shared inboxes, fresh drawer reads and stale list caches. Root/module/test syntax and diff checks passed. Requests and readiness states were mocked; no send or requalification action was invoked. This does not reconcile all action-link caches or establish native keyboard, visual or real account readiness. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: sent back unrealistic readiness data in one fixture. Corrected fixtures derive readiness from required dependencies, reproduce the same three baseline failures and pass all 27 tests independently rerun by the reviewer. Scoped PASS.

Next area: Home attachment removal and failed upload recovery.

## 2026-10-29: Home attachment removal preserves focus

Expected: removing the focused file or reference link keeps keyboard focus at the next attachment, the preceding attachment when removing the last, or the message when none remain. Removal must not steal focus from an active message.

Reproduced: replacing the attachment markup removed the focused button and left the document body focused. Six permanent DOM regressions failed for first/middle/final/sole removal and returning to an unsent message.

Changed: capture whether the removal button owns focus and its position. After removing and redrawing, restore focus at that position or the last remaining attachment, falling back to the message. Existing copy, layout and upload behavior remain intact.

Verification: 32 removal-focus, upload, model-draft, link and reply-draft tests passed. Nine new permanent checks include read/upload failure retries, retained references, and unsent text/selection preservation. Existing checks retain in-flight removal, batch limits and navigation coverage. Root/module/test syntax and diff checks passed. Requests were mocked. Focus assertions are DOM evidence, not native keyboard or visual acceptance. Later unrelated upload redraws are outside this removal-specific fix. No provider calls, actual uploads, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS, with all 32 tests independently rerun.

Next area: Analytics tooltip and metric selection after range changes.

## 2026-10-29: Voice save controls respect unavailable setup and previews

Expected: saving a designed voice requires configured ElevenLabs access and a generated preview ID. A missing local sample alone must not block saving an otherwise valid remote preview.

Reproduced: both passed-check Save and failed-check Save anyway stayed enabled without provider configuration. A passed-check record without a generated preview ID also offered Save although the server explicitly rejects it. Three focused regressions failed before the fix.

Changed: apply the configured-provider and generated-preview condition to both save-button branches. Existing copy, styling, confirmation handlers, check controls and saved voice history remain intact.

Verification: 27 availability, design-form, navigation, draft-retention and storyboard-selection tests passed. Eight new read-only DOM checks include configuration recovery, missing local audio, saved history, checks in progress and retaining valid Save anyway controls. Root/module/test syntax and diff checks passed. Read responses and neighboring provider actions were mocked. New availability checks invoke no action handlers. Real provider credentials, preview persistence, native audio, keyboard and visual behavior remain unverified. No actual provider calls, designs, checks, saves, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS against UI and local backend requirements, with all 27 tests independently rerun.

Next area: Client task review notification state and dismissed media.

## 2026-10-29: Task review queue reports the actual revision reason

Expected: a flagged clip shows its saved visual-review finding. When no finding is available, the queue must not invent a specific problem.

Reproduced: independent review sent back a truthfulness defect missed by the first notification probes. Every needs-revision item said inconsistent garment artwork, including a saved finding about a missing final CTA. Three permanent regressions failed before the fix for a different issue, missing findings and escaped actual finding text.

Changed: show the first saved finding as escaped text, with a neutral Needs revision fallback. The normal ready message, task/clip links, queue membership, layout and styling remain intact.

Verification: 25 reason, notification, queue-read, availability and client-review view tests passed, including eight ignored notification probes and four new permanent reason checks. Dismissed duplicate notices stay dismissed, distinct render IDs retain links, ineligible renders do not notify, detached queue reads cannot repaint the current host, and task views expose video links without inline players. Root/module/test syntax and diff checks passed. All responses and neighboring review writes were mocked; new probes invoke no approval handlers. Native layout, media playback, keyboard input and real-time notification expiry remain unverified. No provider calls, actual render approvals, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: initial send-back for the invented artwork reason, then scoped PASS after the fix with all 25 tests independently rerun.

Next area: Settings profile field normalization and empty values.

## 2026-10-29: Status sorting includes qualified research leads

Expected: the existing status priority places Research in progress between drafting and grading, consistent with the production sequence grading, qualified, drafting. Ready drafts retain their earlier position.

Reproduced: the runner emits qualified and the UI labels it Research in progress, but statusRank omitted it. Its index was -1, so it sorted before drafted and awaiting-video leads. One focused regression failed before the fix. A separate simulated-priority fixture initially omitted URL from its VM; that fixture was corrected before the valid baseline run and did not require a product change.

Changed: include qualified between drafting and grading in the existing rank list. Other sorting rules, filters, copy and styling remain intact.

Verification: 27 sorting, refresh-race, drawer, lead-badge and draft-availability tests passed. Seven new permanent checks cover the qualified position, newest-first ties, missing company-name fallback, empty-filter recovery, count/withdrawn exclusions, invalid saved preferences and simulated purchase priority. Root/module/test syntax and diff checks passed. Requests were mocked and list row output was simplified for ordering assertions. Native keyboard, visual alignment and live filtering remain unverified. No provider calls, requalification, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS against the runner workflow, with all 27 tests independently rerun. Unknown future statuses are outside this fix.

Next area: Render form validation and retained values after failure.

## 2026-10-29: Composer releases discarded image preview URLs

Expected: image preview object URLs remain available for retained drafts and release when an attachment is removed, rejected by file reading/upload, or cleared after a successful submission.

Reproduced: none of those discard paths revoked its object URL. Seven of eight permanent lifecycle regressions failed before the fix. Twelve add/remove cycles left twelve URLs in the instrumented allocation set.

Changed: revoke discarded previews on the existing remove, failure and successful-clear paths. Clear the preview property after release so a late upload failure cannot release an already removed item twice. Existing clearing behavior, copy and styling remain intact. Two older browser API stubs now expose revokeObjectURL; the new lifecycle checks record actual calls.

Verification: 40 lifecycle, upload, removal-focus, reply-draft, model-draft and link tests passed. Eight new permanent checks cover retained previews, read/upload failure, pending removal plus late failure, successful task clearing, failed task retry, redraw retention and repeated add/remove cycles. Root/module/test syntax and diff checks passed. Upload and task creation APIs were mocked. This establishes object-URL ownership calls, not measured native memory reclamation, image playback, keyboard or visual acceptance. No actual provider calls, uploads, tasks, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS for cleanup ownership, with all 40 tests independently rerun. Existing submission clearing semantics are unchanged.

Next area: Home composer submission snapshot ownership during newer edits.

## 2026-10-29: Invalid connection rows cannot poison shared UI state

Expected: malformed provider rows follow the existing failed-read path, preserving the last checked results and retry controls. Valid empty lists and unfamiliar provider objects remain supported.

Reproduced: loadConns accepted any JSON array. A null row then threw while reading row.on in connectionStatus after the invalid list had replaced shared state, breaking later shell paints. Primitive or nested-array rows also replaced valid provider records. Six focused regressions failed before the fix.

Changed: require non-null, non-array row objects before accepting the complete response list. Invalid rows reuse the existing manual alert or quiet background failure, cached-result retention and initial unchecked fallback. Existing provider fields, copy and styling remain intact.

Verification: 24 invalid-row, refresh-race, metadata and sidebar tests passed, including seven ignored metadata probes. Seven new permanent checks cover null/primitive/array/mixed data, initial fallback, valid retry, quiet background failure and unfamiliar valid providers. Root/module/test syntax and diff checks passed. All connection reads were mocked. This is row-shape validation, not a complete provider-field schema audit or live credential check. Native layout and keyboard behavior remain unverified. No actual provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS for JSON row-shape handling, with all 24 tests independently rerun.

Next area: Composer request completion and newer draft ownership.

## 2026-10-29: Completed composer requests preserve newer drafts

Expected: successful task, storyboard or shot creation clears and navigates only when its submitted composer is still unchanged and current. Newer drafts remain intact, including their reference editor and image previews. Leaving the page must not cause a late completion to navigate back.

Reproduced: late success erased newer message text, file/link edits and reference-editor work, cleared references owned by a replacement composer and forced navigation after departure. Seven of nine initial permanent regressions failed before the fix. Missing modelInfo in the first fixture was corrected before recording the valid baseline failures.

Changed: compare raw text, file identities/order, links, composer ownership, mode and unsaved reference-editor state before clearing. Preserve a changed draft as a whole. Navigation requires the unchanged original form to remain connected on the original hash. Unchanged submitted attachments still release their previews after departure. API payloads, copy and styling are unchanged.

Verification: 52 submission-ownership, preview-lifecycle, reply-draft, model-draft, link, upload and removal-focus tests passed. Twelve new ownership checks include all three creation modes, replacements, departure, new attachments/links, reference-editor work before or during the request, raw spacing, unchanged success and failure retention. The older preview fixture now supplies modelInfo and explicitly rejects hidden error notices on success. Root/module/test syntax and diff checks passed. Requests and object URLs were mocked. Assistant rehearsal-result navigation is a separate existing path outside this fix. Native UX, memory reclamation and real task/provider persistence remain unverified. No actual provider calls, task creation, rendering, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS for task/storyboard/shot completion ownership, with all 52 tests independently rerun.

Next area: Voice saved-state display after refresh.

## 2026-10-29: Storyboard autosave failures show the existing warning immediately

Expected: automatic standalone storyboard saves that fail local storage must warn while retaining the current edits. A later successful save clears its own obsolete warning, preserving any unrelated newer notice.

Reproduced: textarea edits and staged image drafts called save but silently left the message blank when local storage threw. Three of four new regressions failed before the fix. The existing manual Save version test covered only the explicit save button.

Changed: show the existing storage failure copy immediately from the standalone save branch. After a successful automatic retry, clear the message only when it still exactly matches the previous storage error. Task-backed server persistence, copy and styling remain intact.

Verification: 17 autosave-warning, explicit local-save, reference-removal-focus and version-history tests passed. Four new permanent checks cover retained multiline text, uncached staged requests, successful retry and unrelated notice ownership. Root/module/test syntax and diff checks passed. Storage failures were mocked before writes, and all research reads used local fixtures. No actual provider calls, uploads, image generation, sends, live mutations, desktop actions, restart, main integration or deployment. Native quota behavior, layout and real persistence durability remain unverified.

Independent final review: scoped PASS for standalone autosave warnings, with all 17 tests independently rerun.

Next area: Analytics provider breakdown with incomplete usage metadata.

## 2026-10-29: Analytics badges recognize only supported provider names

Expected: unfamiliar ledger providers contribute their priced amounts but do not fabricate supported-provider badges or consume the five-logo display limit.

Reproduced: independent review found inherited object names such as constructor passing the logo-name lookup. This rendered broken image paths and function strings as labels. Four new permanent regressions failed before the fix for constructor, toString, __proto__ and valid badges displaced by these unknown names.

Changed: check the provider-name map's own properties before selecting the existing five badges. Totals, range behavior, copy and styling remain intact.

Verification: 30 provider-logo, provider-coverage, accounting, small-spend and range-failure tests passed. Eight ignored probes also exercise zero-dollar usage notes, aggregate provider ordering, unknown priced providers, refresh replacement, date boundaries, markup identifiers and unavailable revenue beside recorded expenses. The first chart fixture inspected an empty latest hour; it was corrected to inspect the prior expense hour, without a product change. Root/module/test syntax and diff checks passed. Provider calls were mocked, and new ledger probes used only in-memory SQLite. Native layout/SVG, real balances, invoices and account-spending completeness remain unverified. No actual provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: initial send-back for inherited provider names, then scoped PASS with all 30 tests independently rerun.

Next area: Render stop/pause controls during failed requests and route changes.

## 2026-10-29: Confirmed render cancellation survives a failed list refresh

Expected: a confirmed canceled render must not return to queued or offer Cancel again merely because the follow-up list read failed. Newer stream records and departed views retain ownership.

Reproduced: independent review found that cancel success followed by a failed list read left the queued tile and enabled Cancel. The action ignored its confirmed render DTO. One of four new permanent regressions failed before the fix. The earlier ignored cancellation fixture now includes a request ID to match the server contract.

Changed: after the existing cancellation workflow, merge its matching canceled render response only if the view is active and the target row is still the original record. Invalidate older reads before applying this fallback. Successful newer list or stream replacements remain authoritative, and other rows stay intact. Copy and styling remain unchanged.

Verification: 24 cancellation-confirmation, recovery, refresh-race, tab-focus and media-refresh tests passed. Four new permanent checks cover successful cancel with failed read, newer stream ownership, unconfirmed failure and departure. Seven ignored recovery probes cover duplicate suppression, retry, spending-paused cancellation availability, closed panels and replacement mounts. Root/module/test syntax and diff checks passed. Requests were mocked; no actual provider cancellation, paid actions, approvals, panel launches, sends, live mutations, spending-pause changes, desktop actions, restart, main integration or deployment. Native media/layout and provider persistence remain unverified.

Independent final review: initial send-back for successful cancel with failed refresh, then scoped PASS with all 24 tests independently rerun.

Next area: Lead drawer close and keyboard focus after asynchronous reads.

## 2026-10-29: Closing a lead drawer restores its captured focus target

Expected: when keyboard focus is inside the lead drawer, Close or Escape returns it to the connected visible trigger. Closing while focus is elsewhere must not steal that focus. Stale reads must not replace the return target.

Reproduced: Close and Escape hid the drawer without moving focus away from its controls. Four of six new permanent regressions failed before the fix, including a refreshed drawer and an older response arriving after another brand opened.

Changed: capture the external focus target when starting a drawer read and commit it only after the existing response ownership guard. Keep it through internal drawer refreshes. Both close paths share a helper that restores the target only if the drawer owned focus and the target remains connected outside a hidden subtree. Copy and styling remain unchanged.

Verification: 21 drawer-focus, drawer-refresh, lead-refresh-race and sort-menu tests passed. Six new focus checks cover Close, Escape, internal refresh, outside focus, a removed trigger and stale reads. Root/module/test syntax and diff checks passed. Tests run extracted actual handlers with mocked reads and explicitly focused DOM controls. Native pointer/Tab behavior, layout and complete computed visibility/focusability remain unverified. No provider calls, sends, ideation, PDF actions, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS with all 21 tests independently rerun.

Next area: Home activity chart inspection and event marker selection.

## 2026-10-29: Home chart refreshes stay with the current request and host

Expected: older metrics reads cannot replace a newer selected range or its brand markers. Replacing an inspected chart must release its observer and inspection state so the new chart can render.

Reproduced: four initial regressions showed older responses replacing current data, disconnecting a newer observer, painting a detached host and marking a newer focused chart stale. Initial SQLite fixture fields were corrected before recording these valid failures. Independent review then found focused-host replacement leaving the shared inspection flag set; two additional regressions failed against the first fix.

Changed: require the latest request and connected current stats host before response side effects. Reset inspection/stale state and disconnect the prior observer when the host changes. Ignore inspection callbacks from detached or superseded hosts. Current chart inspection still defers refresh until focus leaves. Copy, styling and metric semantics remain unchanged.

Verification: 23 Home stats, metrics and conversation-history tests passed. Eight new permanent checks include range/marker ownership, observer ownership, detached responses, stale inspection updates, current inspection deferral, marker navigation, focused-host replacement and detached blur callbacks. Root/module/test syntax and diff checks passed. Actual metrics DTOs came from in-memory SQLite; API reads, observer behavior and chart width were mocked. Native SVG, pointer/keyboard layout and actual brand navigation remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: focused-host send-back resolved, then scoped PASS with all 23 tests independently rerun.

Next area: Task report links and empty activity after failed reads.

## 2026-10-29: Settings refresh preserves dirty fields and confirmed saves

Expected: refreshing Settings preserves unsaved edits, including deliberate blanks and edits made during the read. Unchanged fields use fresh saved values. A state read captured before a successful save must not restore old values as saved.

Reproduced: four initial regressions showed existing nonempty edits and cleared fields being replaced by server values. Generic route restoration carried only nonempty text and restored it only into empty fields. Independent review found a same-form read/save race in the first fix. A further regression showed that saving away from and back to the original value needs a version counter rather than comparing snapshot strings.

Changed: recover only fields differing from the previous connected form's saved snapshot after the Settings read. Let Settings own profile restoration rather than the generic route text snapshot. If that form completes a save during the read, reread state using a monotonic successful-save version and check route ownership again. Initialize the new saved baseline before applying dirty fields and updating their status. Copy and styling remain unchanged.

Verification: 23 profile refresh, navigation, retry and value tests passed, including eight new permanent checks. Coverage includes newer edits during reads, explicit blanks, fresh unchanged fields, clean refresh, pending save completion, captured old state and save-away/back ordering. Root/module/test syntax and diff checks passed. State reads and profile writes were mocked. Real profile persistence, native input/layout and cross-client write ordering remain unverified. No provider calls, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: read/save freshness send-back resolved, then scoped PASS with all 23 tests independently rerun.

Next area: Voice storyboard selection with removed or missing source boards.

## 2026-10-29: Render details preserve keyboard focus when switching and closing

Expected: switching versions retains focus on the selected version. Closing details while its controls own focus returns to the gallery card, or the selected tab if that card was filtered out. Escape from elsewhere preserves the external focus.

Reproduced: five of six new permanent regressions failed. Rebuilding version controls removed the focused button. Close and Escape hid the panel while focus remained inside it, including after version changes and filtering.

Changed: restore the selected version button only when the replaced version button owned focus. Before closing, capture panel focus ownership and the selected group key, then return to its current gallery card or selected tab. Copy and styling remain unchanged.

Verification: 23 panel-focus, tab-focus, media-refresh, refresh-race and cancellation-confirmation tests passed. Six new checks cover Close, Escape, version selection, closing after version selection, filtered cards and outside focus. Root/module/test syntax and diff checks passed. Tests use explicitly focused JSDOM controls and mocked reads with polling disabled. Native pointer/Tab behavior, layout and actual media remain unverified. No provider calls, paid actions, approvals, panel launches, sends, live mutations, desktop actions, restart, main integration or deployment.

Independent final review: scoped PASS with all 23 tests independently rerun. Unrelated streamed panel removal remains outside this explicit-close and version-selection scope.

Next area: Draft editor recovery after failed saves and stale refreshes.

## 2026-10-29: Task history refreshes retain the newest per-task reply

Expected: overlapping task history reads keep the newest response for each run, including its steering replies and Gmail draft links. A failed newest read retains last known data. Reads for other tasks remain independent.

Reproduced: three initial regressions failed. Older successful reads replaced newer steering replies, mission events and Gmail links, including an older response arriving after a newer failed read. Overlapping session groups also let an older shared task overwrite its newer snapshot. Task history loads can overlap between opening a session, steering completion and live steering events. Independent review then found newer live events and lead updates could still be overwritten; three further regressions failed against the first fix.

Changed: assign each task history read a monotonic per-task version and check it before updating draft links or saved session data. Accepted live events and lead updates advance a separate per-task update version. If a live update occurs during the owning read, reread before committing so initial mounts still receive a complete snapshot. Superseding reads end older retries. Preserve existing failed-read recovery, session repaint behavior, copy and styling.

Verification: 33 session-refresh, steering-draft, draft-map-failure and lead-refresh tests passed. Twelve new checks cover response ordering, newer failures, overlapping groups, independent tasks, explicit retry, live-event and lead ordering, initial reads, duplicate events, failed rereads and superseding loads. Root/module/test syntax and diff checks passed. Tests use actual extracted history, thread and stream handlers with mocked task GETs and supplied events; neighboring steering writes are mocked. Native layout/input, real stream transport and provider persistence remain unverified. No provider calls, actual sends, paid work, live mutations, desktop control, restart, main integration or deployment.

Independent final review: live-update send-back resolved, then scoped PASS with all 33 tests independently rerun.

Next area: Connection status menus and keyboard dismissal after failed refreshes.
