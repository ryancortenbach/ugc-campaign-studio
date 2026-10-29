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
