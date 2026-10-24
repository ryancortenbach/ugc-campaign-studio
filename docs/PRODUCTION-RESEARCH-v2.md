# Mint Labs production and research port, actual-app activation

Mint Labs now has a zero-budget Production workspace, an API tool dispatcher and matching Mint assistant tools. It imports the October 19 Canary Wharf penthouse workflow, and prepares a research-to-character-to-scene handoff without invoking paid models or generation services.

## Open it

The actual Mint Labs backend now serves the Production workspace at <http://127.0.0.1:3200/#/production>, using the app's existing database. Its running backend was reloaded after confirming both missions were finished and backing up the database. Existing leads, drafts, renders, storyboards and spend history were preserved.

Automatic Whop order processing was paused to preserve Ryan's zero-spend instruction. Autopilot was already off. The new Production tools remain fixed at $0 provider budget. Other pre-existing manual app features keep their existing behavior. Normal Mint chat still uses its paid language model; direct Production tools and the Production page bypass that model.

Claude's project entry point is the repository-root `CLAUDE.md`, which links this handoff, the imported workflow and the actual API tool routes. No message or paid model call was sent to Claude to establish visibility. The files and tool registry are available for its next project read or app interaction.

The isolated port-3211 preview is historical review infrastructure. The actual app on port 3200 is the destination for this activation.

## Imported knowledge

`agent/knowledge/penthouse-v1/manifest.json` records source paths and SHA-256 hashes. The package includes the workflow Markdown, exact tutorial settings, three final prompts, clip 2 failure analysis, secondary-character prompt, caption scripts, editing scripts, caption timings and the original SOP PDF. Current zero-budget, version-preservation and no-desktop-control rules override historical instructions.

Six historical media assets, the recovered conversation, the full text tool log and all 11 child-agent exports are in ignored `private-research/penthouse-v1/`. These remain local. Fixed asset IDs allow local video/audio playback with HTTP byte ranges. No arbitrary file-reading route is exposed.

The original three clips used 10, 10 and 7 seconds before joining and trimming. Their exact prompts retain moving cameras, the character and hoodie locks, Wingstop entrance and bag crunch, two-finger chest tap, voice-reference links and continuity requirements. Original character/hoodie Element exports and the selected girl reference remain missing. The saved voice ID is historical and has not been checked against the current account.

## Tool calls

`GET /api/production` lists the tool schemas, capability report and local research dossiers. Call a tool with `POST /api/production/call` and JSON `{ "name": "workflow_rehearse", "input": {} }`.

| Tool | Behavior |
| --- | --- |
| `workflow_knowledge` | Imported workflow, manifest, rules and capability limits |
| `workflow_reference` | One allowlisted prompt, fix plan, script or caption-timing file |
| `workflow_rehearse` | Verify local reference hashes and show historical playback |
| `research_plan` | Create brand, audience, creator, format, creative and parity work queues |
| `research_search_free` | Run one section through free keyless Exa MCP, with no paid fallback |
| `research_add_evidence` | Store a cited observation or labeled hypothesis |
| `research_synthesize` | Assemble an ICP candidate and source-linked original character/scene brief |
| `workflow_prepare` | Compile all three historical clips and explain exact-parity blockers |
| `provider_prepare` | Prepare an ElevenLabs, Solari or Seedance request envelope without execution |

The existing Mint assistant advertises the same schemas and dispatches them through its normal tool loop. Using that assistant's language model still incurs its existing model cost. The Production page bypasses the language model entirely. No live model call was made during this port.

## Research behavior

Brand research collects product, positioning and owned-channel sources. Audience research looks for customer language, use cases and buying motivations. Creator research collects relevant public Instagram, X, TikTok and YouTube sources. Format research collects cited hooks, scene beats and camera ideas for original adaptations.

Search excerpts stay labeled as indexed, unverified evidence. They do not automatically become demographic findings, official account ownership, creator view counts or an approved ICP. Dated creator-post observations require a profile URL, individual post URL, view count, publication date and observation date. The shortlist uses a median across unique posts and flags samples smaller than five. Performance alone does not establish audience fit. Character and scene handoffs retain source IDs and explicit unknowns.

The zero-budget synthesis is deterministic evidence assembly. Specialist model reasoning, Solari browser verification, transcription and creation of new images, voices or videos have not run. The queues and tool interfaces support that later work without claiming it happened now. Creator analysis defaults to original scripts and original characters; owned or licensed identity and performance references can be recorded separately.

## API capability evidence, checked October 24, 2026

| Capability | Evidence and current limit |
| --- | --- |
| Exa | [Hosted MCP](https://exa.ai/docs/get-started/exa-mcp) documents keyless access. The new transport always uses `mcp.exa.ai/mcp`, discovers the search schema and never reads `EXA_API_KEY`. The live attempt from this environment failed DNS resolution (`ENOTFOUND`). Local MCP transport tests pass; live search is unverified here. |
| Solari | [API reference](https://docs.getsolari.com/api-reference) and the already-installed SDK establish the browser-session interface. A request sequence is prepared only. No browser was launched and no paid session was tested. |
| ElevenLabs isolation | [Audio isolation](https://elevenlabs.io/docs/api-reference/audio-isolation/convert) documents multipart `audio` at `/v1/audio-isolation`. Prepared, never called. |
| ElevenLabs remix | [Remix](https://elevenlabs.io/docs/api-reference/text-to-voice/remix) documents `/v1/text-to-voice/:voice_id/remix`. Prepared, never called. |
| ElevenLabs performance conversion | [Current voice changer reference](https://elevenlabs.io/docs/api-reference/speech-to-speech/convert) documents `/v1/voice-changer/:voice_id`, multipart audio and `eleven_multilingual_sts_v2`. The historical run used `/v1/speech-to-speech`; the new prepared contract follows the current documented path. No paid conversion was tested. |
| Higgsfield | [Seedance 2.5 text-to-video](https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference) documents prompt, duration, resolution, aspect ratio, output format and generated audio. The parameter table does not document the website's character Elements, voice/audio reference clips or Extend Video inputs. No invented reference fields or private website endpoints are submitted. |
| Exact visual match | Unverified. Historical playback preserves the actual final file. No new generation or visual parity test has run. The exact historical plan remains blocked pending documented reference/extension support and missing reference exports. |

The provider-preparation tool always returns `executable: false`, `budgetUsd: 0` and `networkCalls: 0`. Strict input schemas reject `execute`, `budgetUsd` and other unrecognized overrides. No provider credentials are returned to the browser. This budget lock applies to the new Production workspace. Other pre-existing app features retain their own spending behavior.

## Validation

The agent test suite passed with 151 tests, and the root suite passed with 82 tests. New coverage includes zero-network rehearsal, blocked spend overrides, exact historical prompts, allowlisted knowledge reads, strict request envelopes, cited ICP evidence, dated creator metrics, duplicate-post handling, concurrent research persistence, free-only MCP dispatch, assistant tool routing, local HTTP calls and media byte ranges. No live paid provider was used.

The isolated local review server verified all six private asset hashes and returned HTTP 403 for chat, mission-start and render-approval requests. Evidence is in ignored `work/production-rehearsal/`, including the live Exa failure receipt and test output. Native hidden-WebKit interface checks encountered a JavaScript-result bridge error; this is not a visual pass.

## Actual-app activation receipt

See `work/production-rehearsal/actual-app-activation-v1.json` for current local HTTP checks, preserved record counts, the $0 spend delta and native snapshot status. `work/production-rehearsal/before-app-activation-v1.sqlite` preserves the pre-reload database. The previous v1 handoff remains intact.
