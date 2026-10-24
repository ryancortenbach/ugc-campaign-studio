# Mint Labs project context

The actual desktop app is `/Applications/Mint Labs.app`. Its local backend runs `agent/server.mjs` at `http://127.0.0.1:3200` using the existing `agent/.data/agent.db`. Preserve the current uncommitted work, existing records and unsaved app work. Follow `/Users/ryancortenbach/CLAUDE.md` and applicable user instructions. Never print credentials.

## Production workflow and research tools

Ryan requested the October 19 Higgsfield and ElevenLabs Canary Wharf penthouse workflow inside the actual app, with zero spending. Read [the app integration handoff](docs/PRODUCTION-RESEARCH-v2.md), then [the imported manifest](agent/knowledge/penthouse-v1/manifest.json) and [workflow](agent/knowledge/penthouse-v1/WORKFLOW.md).

- Production page: `http://127.0.0.1:3200/#/production`.
- `GET /api/production` lists the nine tool schemas, capability report and dossiers.
- `POST /api/production/call` dispatches `{ "name": "workflow_rehearse", "input": {} }` or another listed tool.
- Implementation: `agent/production-research.mjs`, `agent/tools/research-exa.mjs` and `agent/public/production-research.js`.
- Mint's existing assistant in `agent/assistant.mjs` exposes the same tool schemas.
- Source prompts, scripts, timings and SOP: `agent/knowledge/penthouse-v1/`.
- Historical video, voice references and recovered conversation/tool/child-agent logs: ignored `private-research/penthouse-v1/`.

The new Production tools have a fixed $0 provider budget. Paid provider requests are preparation-only and return `executable: false`. No images, voices or videos were newly generated. Free Exa uses the keyless MCP with no paid REST fallback. Its live attempt from this execution environment failed DNS resolution; mocked transport and local API routing passed. Solari sessions and paid model reasoning were not run. Normal Mint chat still uses its existing paid model, so use the Production page or direct local tools for a zero-cost rehearsal.

The original used image/voice references and Extend Video. The checked Higgsfield public text-to-video parameter table does not document those inputs. Preserve that gap and missing reference exports explicitly. Historical playback and prepared requests are not proof of a newly generated exact match.

Specialist queues cover brand facts, audience and ICP evidence, public social creators, video formats, original character/scene planning and production parity. Keep search snippets unverified and hypotheses labeled. Creator view samples need dated individual post URLs. Preserve citations and unknowns. Default to original scripts and characters, with owned or licensed identity references recorded separately.

Automatic Whop processing was paused during actual-app activation to honor the no-spend instruction. Autopilot was already off. Do not re-enable paid automatic work without Ryan's authorization.

Validation: `npm test --prefix agent`, `npm test`, and `npm run check`. The initial port passed 151 agent tests and 82 root tests without live paid calls. Do not infer a current pass from this historical count; use the activation receipt linked in the handoff.

## Brand tasks and sidebar fixes

Read [the current client brief and simplified UI handoff](docs/CLIENT-BRIEFS-AND-UI-v1.md) first. Brand tasks now open PDFs, client purchases open full saved briefs, and normal task views no longer show the lab or revision controls. The actual app has a persisted `spendingPaused=true` guard. Do not clear it or run paid work without Ryan's explicit authorization. Historical client purchases still need their brand websites.

Read [the task storyboard and sidebar handoff](docs/TASK-STORYBOARDS-AND-SIDEBAR-v1.md) before changing these areas. Each outreach brand has a dedicated persistent lab task, optimistic revisions, conflict recovery and isolated uploads. Connection checks and Live traces distinguish real health/ownership. The handoff records the independent review, actual zero-spend receipt and remaining SVG/native visual limits.
