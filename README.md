# UGC Campaign Studio

A hackathon workspace for a character-led T-shirt brand, a $97 AI video course, and an autonomous AI UGC service for brands.

## Start

Requires Node 22 or newer. No package installation is required.

```sh
cp .env.example .env.local
npm run dev
```

Open the local address printed by the server. `npm test` validates intake and output behavior. `npm run check` checks JavaScript syntax.

To run the three durable experiments as well, install each one and give each its own ignored `.env.local` containing `DURABLE_DEMO_ACCESS_TOKEN=` and a random secret:

```sh
for d in durable-workflow-v1 durable-workflow-v2 durable-dashboard-v3; do (cd experiments/$d && npm ci --ignore-scripts); done
npm run dev:all
```

`npm run dev:all` starts the studio on 3000, the experiments on 3101, 3102 and 3103, and the agent app on 3200, all bound to 127.0.0.1. Ctrl-C stops all of them. Install the agent first with `npm ci --prefix agent`. Stop it before `npm run build:preview`, because both write `experiments/durable-dashboard-v3/.nitro-build`. Each command clears that generated folder before it starts.

The dark dashboard includes guided intake, saved campaigns, compact task queues with run/pause/stop controls, input-version history, real readiness requests and alerts, a prompt review lab, Exa prospect discovery, and an editable financial model. Three marketing mocks live at `/shop/`, `/course/`, and `/brands/`. The guided intake works without an API key. AI conversation uses a server-side OpenAI Responses API adapter with a structured brief schema. Set `OPENAI_API_KEY`, `OPENAI_MODEL`, and `CAMPAIGN_ACCESS_TOKEN` to enable it. Enter only the project access token in the browser. Never place API keys in public files.

The browser saves drafts and campaigns locally and exports a production packet as JSON. This is not shared account storage. The packet leaves unknown facts and unapproved generation settings explicit.

## Agent app (Mint Labs mission control)

`agent/` is the autonomous outreach and render console at http://127.0.0.1:3200. Type a mission ("find 8 independent streetwear brands in Brooklyn that sell online") and it runs as a task:

1. Claude Sonnet 5.5 turns the mission into Exa search queries.
2. Exa finds official brand sites (paid REST when `EXA_API_KEY` is set, otherwise the free MCP).
3. A Solari cloud browser opens each site and its contact page, collects published business emails with the exact page and excerpt, and screenshots the homepage (plain fetch when `SOLARI_API_KEY` is missing).
4. Claude Haiku 5.5 grades the fit with reasons and risks. Marketplaces, duplicates already in the CRM and sites without a public email are skipped with a logged reason.
5. Sonnet writes a short email from the sender profile in Settings, and it is saved as a Gmail draft in the configured account. Nothing is ever sent; the Gmail module has no send call and a test enforces it.

Every step is a live log line naming the tool or MCP it called. Pause, resume, stop, or type a steering message into a running task ("skip anyone outside NYC", "max 3"); steering applies before the next step. Leads, evidence, screenshots and drafts live in a local SQLite CRM at `agent/.data/` (ignored).

The Storyboards tab drafts a studio-compatible storyboard from a short brief with Sonnet 5.5 (character, wardrobe, environment and voice locks plus timed shots with exact dialogue), grades the whole storyboard with the seven checkers on Haiku 5.5, and revises it from their findings on request. Each revision is a new version. The pass bar is 85 on every checker with no blocking or major finding; only a passing storyboard can be approved, and approval sends its shots to Renders. Malformed model output is rejected and retried once.

The Renders tab queues Higgsfield Seedance 2.5 shots. Each shot runs the seven scene checkers on Haiku; only a passing shot gets a price from Higgsfield, and it is submitted only when you press Approve on that shot.

Keys in the root `.env.local`: `ANTHROPIC_API_KEY`, `EXA_API_KEY`, `SOLARI_API_KEY`, `HF_CREDENTIALS` (Higgsfield `id:secret`), optional `GMAIL_TOKEN_PATH` (Google OAuth token JSON with refresh token) and `GMAIL_DRAFT_ACCOUNT`. Run it alone with `npm start --prefix agent`; test with `npm test --prefix agent`.

## Sponsor connections

`.mcp.json` registers the hackathon MCP servers for Claude Code. None of them take a key in the file. Open Claude Code in this folder, approve the project servers, then run `/mcp` and sign in to each with your own account.

- Terac (required for submission): `https://terac.com/api/mcp`, OAuth. Launch studies for the General Population. Credits belong to a Terac organization, so redeem the event link only after Terac sets yours up.
- Exa: `https://mcp.exa.ai/mcp`, free and keyless. The app's paid search route reads `EXA_API_KEY` from your own `.env.local`.
- Whop API: `https://mcp.whop.com/mcp`, OAuth. The grant is your Whop user, so you need team access to the project's Whop business. Consequential operations return a confirmation token before anything executes.
- Whop docs: `https://docs.whop.com/mcp`.

Other MCP clients can use the same URLs. Never commit keys; each teammate keeps their own `.env.local`.

## Structure

- `public/`: responsive dashboard and browser intake.
- `src/brief.js`: campaign intake and production packet contract.
- `api/chat.js`: optional model-backed conversation endpoint.
- `server.mjs`: local static and API server.
- `docs/PRODUCT-SCOPE.txt`: Ryan's current decisions and build sequence.
- `docs/HIGGSFIELD-AVATAR-DOSSIER-v2.txt`: recovered avatar production context.
- `private-research/`: ignored local source excerpts, excluded from Git and hosting.

## Integration boundaries

The optional Exa adapter and model conversation/review adapters require credentials. Seven specialist model reviewers can run for up to three rounds, revising only the prompt between rounds and stopping on unresolved findings or connection errors. Reviews bind to a prompt/reference fingerprint. The UI never issues a fictional model pass. Browser execution, background posting, Terac, Lovable, Whop checkout, and analytics are not connected. The app never submits a paid video generation. The real course checkout URL is pending. Do not represent test data, views, revenue, or integration placeholders as live activity.

## API reference

The optional AI adapter follows [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Model selection is explicit through the environment. No paid model request is made by setup or the tests.

## Research

`/research/` contains the browsable research library, full packet, 42 source-frame cards, an 800-entry source index, and coverage evidence. Full reference videos and analysis audio are local at `/Volumes/Projects/UGC-Campaign-Research/2026-10-24-v1`. The private avatar dossier preserves the recovered Air history.

`docs/FINANCIAL-MODEL-NOTES.txt` documents sources, assumptions, formulas, exclusions, and guarantee limits. `docs/financial-scenarios-v2.json` contains the evaluated planning cases. `docs/prospect-seeds-v1.csv` contains eight unsent, source-labeled outreach candidates, with contact suitability distinguished from mere public availability.

The browser task runner uses Web Locks to avoid duplicate readiness requests across open tabs. It runs only while the page is open. It does not claim to execute external browser sessions or publish media. Late results cannot override paused, stopped, or newer runs.

## Mac app

`desktop/` builds **Mint Labs.app**, a native macOS app (Swift and WebKit, about 250 KB) that opens the agent in its own window with a Dock icon. Run `bash desktop/build.sh` to build it and install it in `/Applications`. Opening the app starts `agent/server.mjs` with the repo's `.env.local` if nothing is already listening on port 3200, and quitting stops the server it started. Links to Gmail and brand sites open in the default browser. The agent log is at `~/Library/Logs/Mint Labs/agent.log` (View > Open Agent Log). It needs Node 22.13 or newer from Homebrew, and the build records this checkout's path, so rebuild after moving the repo.
