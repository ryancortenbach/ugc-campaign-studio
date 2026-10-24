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
