# QA loop ledger

## 2026-10-24: live task activity disclosures

Expected: opening a tool's Input or Result details keeps that content open and keyboard focus in place as new research events arrive.

Reproduced: the refresh replaced the complete activity HTML, collapsed the open tool and nested Input disclosure, and removed the focused summary. A new interaction regression failed before the fix.

Changed: keep each existing event's disclosure state and focused summary across changed activity. Skip replacing identical activity HTML. New calls and results still render; stale-response protection stays in place.

Verification: the focused DOM/report/tool-log suite passed 7 tests. Full agent suite: 323 passed. Root suite: 90 passed. Root syntax checks passed. Independent review: PASS, including unchanged-node identity, collapsed state, parent and payload focus, outside focus and client-project refresh. No provider requests, live database changes or app restarts were used.

Next area: draft editing and unsaved-state handling.
