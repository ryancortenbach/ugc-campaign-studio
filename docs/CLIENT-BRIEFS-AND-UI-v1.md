# Client briefs and simplified task views

Updated October 24, 2026. This supersedes the visible task-lab/revision controls described in `TASK-STORYBOARDS-AND-SIDEBAR-v1.md`. Stored boards and revision history are preserved.

## What the app shows

- Brand tasks open their ideas PDF directly. The PDF includes all saved research, ICP evidence and unknowns, original character appearance and wardrobe, design directions, cultural/game affinities, environment, product photographs and links, and script/shot ideas.
- Task activity starts collapsed. The normal task view has no Storyboard lab, saved revision, open revision, current revision, or storyboard chevron.
- Paid purchases open a client brief through `#/orders/:paymentId`. Linked paid tasks use the same report. A purchase with no brand has one website field and an explicit missing-research state. Saving that field does not start any work.
- Product photos use product names. Apparel category tags and prominent hero badges are removed from this view.
- Brand idea rows omit meaningless successful/failed zero counters and $0 labels. Task/lead rows are quieter and have no row outline. Status icons have fixed sizing/alignment.
- Renders have smaller sharp provider placeholders and explicit empty states for every filter. Real media previews retain their existing size.
- Always on displays its actual On/Off state and budget, handles pending/error states, and excludes brand/client tasks from its next-mission selection.
- Analytics retains the metrics and chart. Sales, Spend by provider, and Data details are removed.

## Saved research and provenance

`agent/creative-brief.mjs` owns the richer research schema and read-only purchase report lookup. `agent/task-ideas-pdf.mjs` exports the saved data without model or provider calls. It supports cached PNG/JPEG/WebP/GIF/AVIF references, validates local paths, deduplicates photos, and measures page content to avoid clipped captions.

The existing authorized future Sonnet profile/client workflow saves the complete brief and model, task-owned product photos, citations, ICP, character rationale, design choices, environment, and game affinities. Unsupported preferences stay hypotheses. The implementation does not turn existing local template ideas into claimed Sonnet research.

All three historical purchases currently lack a brand domain and attached research. Their reports say this. Buyer names are not evidence of a brand. Ryan still needs to identify those websites before meaningful client-specific briefs can exist. No paid backfill was run by this work.

## Persistent no-spend review

The actual app's SQLite settings now contain `spendingPaused=true`. `agent/spending-policy.mjs` and the server enforce this flag. Paid-capable mutations are rejected with HTTP 423 and `code: spending_paused` before their handlers run. Logo and offer GETs retain cached/public-free images while their paid Exa fallback is disabled. Reports, local context and board edits, uploads, zero-budget Production tools, and stopping/canceling activity remain available. `/api/state` exposes `config.spendingPaused`. There is no HTTP unlock route.

Startup skips automatic work, panel watches and render progression while paused. Activating the flag requires restarting the backend to terminate any pre-existing in-flight work, as done during this activation. Keep the flag true until Ryan explicitly authorizes spending. This protects the app API. It does not revoke provider credentials or prevent a separate process from calling providers directly.

During verification, concurrent actual-app ledger entries grew while this report/UI work made no paid provider calls. They describe repeated Claude video concepts/checkers/revisions. The invoking client is not attributable from the available logs. The first report-activation receipt covered only its immediate restart window and must not be used as proof of whole-session zero spending. See `work/task-storyboards/spending-pause-final-v2.json` for observed totals and limits. Before the guarded restart, the app reported no active browser sessions and every stored render had `request_id=null`. The restart stopped local in-flight loops. Provider accounting may include unrecorded in-flight requests.

## Verification

The full report/UI implementation passed 228 agent tests and 82 root tests before the additional no-spend guard. The final suite passed 277 agent tests and 82 root tests. Final suite and guard evidence are in `work/task-storyboards/full-report-tests-final-v3.txt`, `root-report-tests-final-v2.txt` and `syntax-report-final-v2.txt`.

An independent harsh reviewer sent back issues with unsupported image formats, path containment, caption pagination, missing client product references and misleading statuses. These were fixed. Their final report/PDF review passed. Their separate final no-spend review passed for blocking new paid app requests under the persisted pause after restart. Native WebKit PDF embedding and the final whole-window layout remain unverified. Reload the existing app with Cmd+R to load updated JavaScript and CSS; this work did not take control of the desktop.

## Files

- Report/PDF: `agent/task-ideas-pdf.mjs`, `agent/creative-brief.mjs`, `agent/public/task-storyboards.js`, `agent/public/task-storyboards.css`.
- Integration: `agent/server.mjs`, `agent/research.mjs`, `agent/whopwatch.mjs`, `agent/autopilot.mjs`.
- Shell/list simplification: `agent/public/app.js`, `style.css`, `index.html`, `brand-ideation.js`, `brand-ideation.css`, `analytics.js`.
- Guard: `agent/spending-policy.mjs` and `agent/spending-policy.test.mjs`.

The working checkout also contains another session's changes. Preserve those files. Do not commit or revert the entire shared tree as one change.
