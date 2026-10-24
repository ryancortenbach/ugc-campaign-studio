# Task storyboards and sidebar handoff

October 24, 2026. Actual app: http://127.0.0.1:3200. No paid provider calls or outreach sends.

Each eligible outreach brand now owns a persistent storyboard task. Open its task card or the Storyboards index to see its lab, stage readiness, references, editable shots, saved revisions and task activity. Earlier standalone drafts remain at `#/storyboards/archive`. Five existing brands were migrated without duplicating their task or losing original records.

## Implementation

- `agent/task-storyboards.mjs`: child task ownership, typed lab storage, optimistic revision checks, complete version retention and latest brand activity.
- `agent/public/task-storyboards.js`: task lab and brand index. Route identity prevents delayed work from repainting another task.
- `agent/public/apparel-storyboards.js`: a controller for each mount, per-task dirty recovery, explicit conflict choices, serialized saves and upload-aware revision changes. Successful saves remove redundant clean browser caches.
- `agent/connections.mjs` and `agent/public/connection-status.js`: free read-only checks distinguish verified credentials, configured credentials, reachable health, setup failures and network failures.
- `agent/public/live-feed-model.js`, `live-feed.css` and the shared shell styles: traces stay with the same task and brand, real legacy Exa names pair, readable child rows expand beneath their own parent.
- The success glyph uses the shared Lucide check. Status wrappers center block SVGs and use a consistent stroke to avoid baseline offsets. Numeric score rings also center their value in a full-size grid with a fixed line height.

## Routes

`GET /api/storyboard-tasks` lists workspaces. `GET /api/tasks/:id/storyboard` returns the task, lead, lab, stages, revisions and recent activity. `POST` to the same URL accepts `{revision, lab}`. A stale revision returns 409. `GET /api/tasks/:id/storyboard/versions/:revision` retrieves any saved revision. `POST /api/leads/:id/storyboard` ensures the brand task exists.

Eligible brand states are drafting, awaiting_video, drafted, contacted, replied and won. New tasks start in planning and never invoke a model, researcher, renderer or message sender. Audience findings and product references remain pending until real evidence/assets are supplied. The existing Production workspace supplies the separate research preparation tools described in [the workflow handoff](PRODUCTION-RESEARCH-v2.md).

## Verification

The independent reviewer returned persistence, ownership, routing and CSS defects for correction, then issued a scoped code/state PASS. It independently reran 29 backend/model tests and 23 actual-module DOM assertions. The permanent DOM regression is `agent/task-storyboards-dom.test.mjs`; run `npm ci --include=dev --prefix agent` before tests on a fresh checkout. DOM checks establish handler/state behavior, not native visual parity.

Fresh full validation: 82 root tests passed, syntax checks passed, and 206 of 207 agent tests passed. The remaining pre-existing failure is SVG logo conversion in `outreach.test.mjs`: macOS sips cannot decode the supplied SVG, so the current converter safely omits that logo. Do not describe the full agent suite as passing.

The actual database has 7 tasks (2 original plus 5 brand tasks), 12 leads, 6 drafts, 1 render, 14 storyboards (9 original plus 5 brand boards) and 68 spend rows. Spend delta from the activation backup is $0. Autopilot and automatic Whop work remain off. Current connection reads show Claude, Gmail, Whop, ElevenLabs and Terac verified; Exa and Higgsfield configured; Solari reachable without a paid session.

Ignored evidence: `work/task-storyboards/actual-app-final-v1.json`, `targeted-tests-v3.txt`, `persistent-dom-tests-v2.txt`, `checkmark-regression-v2.txt`, `full-agent-tests-final-v1.txt`, `root-tests-final-v1.txt`, `syntax-final-v1.txt` and `dom-check-v2.txt`.

Native visual review is bounded. Another independent session passed the combined Live trace layout, archive stacking, references and carousel in the running app, recorded in `docs/MINT-LABS-HARSH-REVIEW-v1.txt`. Those snapshots predate the last checkmark and route-identity edits. Our self-snapshot requests have not yet yielded a fresh dedicated task image. Final native verification of those last changes remains open. No complete native visual pass is claimed.
