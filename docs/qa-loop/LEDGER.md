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
