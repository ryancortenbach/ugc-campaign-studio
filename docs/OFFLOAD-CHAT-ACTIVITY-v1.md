# Offload activity components in Mint

October 24, 2026. Local app: http://127.0.0.1:3200/#/home.

Ryan requested the tool calling UI already built in Offload. The inspected source is the saved Offload checkout at `Documents/Codex/2026-09-26/from-all-of-the-things-that/work/final`, specifically `src/components/AgentActivity.jsx`, `src/vendor/beautiful/ToolChips.jsx`, `shared/tool-events.js`, and `src/live-chat.css`.

`agent/public/chat-activity.js` ports the interaction into Mint's native DOM modules: provider icons, compact activity rows, explicit statuses, expandable input/result/error details, and attached artifacts. `chat-activity.css` uses Mint's existing tokens. No React runtime or unrelated Offload engine was imported. Offload's ToolChips provenance remains documented in that checkout's `THIRD_PARTY.md`.

Each assistant answer now has an activity block inside its chat bubble. Preparing a saved client demo loads the corresponding task's actual event history and links to its research document, two-page PDF, character concept, and generated sample when present. Saved history is labeled separately from work executing in the current conversation. An older action without a correlated execution receipt remains Recorded.

New assistant tool actions persist their call ID, status, sanitized input/output, and measured duration. Live tool events appear while the assistant is answering. Matching remains scoped by task and lead in the shared event pairing implementation. Model reasoning text is not fabricated or exposed as a tool trace.

Task history reads use GET requests only. Activity rows cannot submit a render, approve media, send email, or retry a provider request. Review links lead to the existing Renders controls. Sensitive fields and signed credential parameters are redacted before display. Stale task responses cannot replace a newer conversation.

The user explicitly authorized this chat integration and Renders monitoring. That instruction expands the older apparel-only ownership guidance in `MINT-LABS-UI-CONTRACT-v1.txt`. Shell edits are limited to the activity mount, its stylesheet, correct render readiness, and read-only status monitoring.

## Render monitoring

Renders checks local SQLite-backed `/api/renders` every five seconds while the page is mounted. It detects updates written by the separately running pilot process, which does not share the backend's in-process SSE emitter. Leaving the view cancels polling. Playback, active text entry, and an open new-shot form defer replacement. Deferred changes are applied after the view is idle. Connection failures retry the status read and never submit another provider request.

Only a completed job with an actual media URL or local file can expose scene-review controls. An in-progress or failed request with old pending-review metadata no longer appears as a finished scene. Genjutsu model details and the finished eight-second duration are shown accurately.

## Actual pilot result

Disobedient request `631fcb1b-3825-4aa8-9d8c-3965fb28ee29`, render 26, completed. The actual generated six-second video is preserved. Local finishing adds a two-second website CTA and restores the original source audio. Final output is `agent/public/streetwear-demo-assets/disobedient-sample-v1.mp4`.

Media checks passed: 720x1280, 30 fps, eight seconds, all 180 generated frames unchanged, audio lag zero samples, decoded audio correlation 0.999869. Visual review requires revision: around 4.5 to 6 seconds, the garment's back artwork appears on the chest despite the blank-front reference. The app displays that issue. This is a playable preview, with human approval and outreach readiness pending.

VYLIN request `f0b00cae-6ade-4a03-a54a-329424d63223`, render 27, failed for insufficient provider credit. It was not retried. No new paid requests are needed to monitor or view the existing result. Both requests retain estimates, with itemized charges unknown. The global spending pause remains enabled. No email was sent.

## Follow-up review changes

The review queue now lives under Tasks. Home has no scene-review section or review popups. Tasks shows compact scene rows with Open task and View clip links. A revision-required scene remains visible there after the user rejects it. Renders retains the player and details.

Following the user rejection, Disobedient now defaults to `disobedient-garment-review-v2.mp4`: the six-second actual generated footage with restored audio and no CTA. The proposed end card is a separate collapsed still preview. The original eight-second assembled file remains preserved. New ImageGen frames at `disobedient-consistent-front-storyboard-v2.png` show the same blank-front official hoodie in both poses. The front-only corrected request is prepared locally, with no video retry submitted. The prior authorization capped the run at $3 with zero retries, so a new paid request requires separate authorization.

## Verification

Final check: 330 agent tests and 90 root tests passed, required root checks passed, and new/changed browser and pilot modules passed Node syntax checks. Native Mint verification showed the Home review section absent, the compact review queue under Tasks, the Disobedient player entering playback, and the corrected request plus separated CTA preview under task 10. This does not establish a corrected motion result: that new video has not been rendered.
