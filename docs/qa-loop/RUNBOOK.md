# Mint Labs continuous QA

Ryan authorized a 10-minute recurring adversarial app, UI and UX review on October 24, 2026. Each verified fix is committed and pushed to `codex/mint-qa-loop` in the private `ryancortenbach/ugc-campaign-studio` repository.

## Workspace and cadence

Use only `/Users/ryancortenbach/Development/ugc-campaign-studio-qa`. The main checkout contains other ongoing work. Do not switch its branch, stage its changes, restart its app, or change its persisted data. The native Codex heartbeat returns to the same chat every 10 minutes; keep one QA pass active at a time. A pass may finish after the next scheduled tick. Do not start a duplicate worker or timer.

The schedule is `mint-labs-adversarial-qa`, stored in `~/.codex/automations/mint-labs-adversarial-qa/automation.toml`. Its recurrence is `FREQ=MINUTELY;INTERVAL=10`. It needs the computer awake and the desktop app running. Pause this specific automation if Ryan asks to stop the loop.

## A pass

1. Read the current user instructions, project CLAUDE.md and this runbook. Check this worktree's branch, status and previous run. Finish an interrupted fix before choosing another area. Never discard unknown edits.
2. If the tree is clean, fetch current main and merge it into this branch when useful. Never merge this branch into main automatically. Avoid repeating a checked area until the other areas have had a turn.
3. Rotate through task activity and PDFs, draft editing, lead filters and links, analytics, references/uploads, render pause/stop, asynchronous navigation, settings failures, and keyboard or narrow-layout behavior. Choose a concrete intended action and test edge cases such as repeated clicks, stale responses, malformed/empty input or failed requests.
4. Reproduce an actual defect before changing it. Preserve the existing dark aesthetic, design tokens, concise copy and controls. Fix expected behavior, avoid speculative redesigns, and add a focused regression when needed.
5. Verify the regression, relevant neighboring workflows and applicable compilation or syntax checks. DOM assertions do not prove native visual quality. Record which evidence was actually checked. Tests use temporary fixtures and mocked providers.
6. Commit each verified fix separately and push it immediately to `codex/mint-qa-loop`, then verify the actual remote SHA. Never force push. Keep a concise entry in LEDGER.md with expected/observed behavior and verification; keep noisy logs and no-finding run notes in ignored `work/qa-loop/`.
7. Report meaningful verified fixes, push failures or required decisions. Do not invent changes or make empty commits to satisfy the cadence.

## Execution boundaries

No paid model, research, image, voice, video, human-panel or external browser API calls. Do not clear spendingPaused or enable autopilot/watchers. Do not submit orders, approve renders, send email/DMs, contact people, spend money or deploy. Never run stress mutations against the live database or production services. Do not retrieve or copy secrets into fixtures, reports, commits or logs. Do not steal desktop focus, control normal app windows or restart Chrome. Use local mocked DOM/HTTP workflows and existing safe screenshot facilities. No em dashes or emojis.

## Local setup and push

The ignored `agent/node_modules` link reuses the main checkout's installed dependencies without modifying them. Do not run npm install through that link. Recheck dependencies if main changes them.

Normal HTTPS Git auth is unavailable in this execution context. The ignored helper `work/qa-loop/git-ssh.py` uses the existing SSH key and known-host verification, restricted to this exact repository. It does not change keys, credentials, known hosts or global Git config. Use it through the normal-host process tool with these process-local settings:

```sh
cd /Users/ryancortenbach/Development/ugc-campaign-studio-qa
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_SSH_VARIANT=ssh
export GIT_SSH_COMMAND='/Users/ryancortenbach/Development/ugc-campaign-studio-qa/work/qa-loop/git-venv/bin/python /Users/ryancortenbach/Development/ugc-campaign-studio-qa/work/qa-loop/git-ssh.py'
git push git@github.com:ryancortenbach/ugc-campaign-studio.git HEAD:refs/heads/codex/mint-qa-loop
git ls-remote git@github.com:ryancortenbach/ugc-campaign-studio.git refs/heads/codex/mint-qa-loop
```

Use the same exact-repository transport for fetch. A tool error, local origin reference or commit alone does not prove the remote push succeeded. Preserve a failed-push commit and retry rather than rebuilding it.
