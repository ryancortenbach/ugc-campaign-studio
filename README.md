# UGC Campaign Studio

A hackathon workspace for a character-led T-shirt brand, a $97 AI video course, and an autonomous AI UGC service for brands.

## Start

Requires Node 22 or newer. No package installation is required.

```sh
cp .env.example .env.local
npm run dev
```

Open the local address printed by the server. `npm test` validates intake and output behavior. `npm run check` checks JavaScript syntax.

The dark dashboard includes guided intake, saved campaigns, task tabs with actual readiness blockers, a prompt review lab, Exa prospect discovery, and an editable financial model. Three marketing mocks live at `/shop/`, `/course/`, and `/brands/`. The guided intake works without an API key. AI conversation uses a server-side OpenAI Responses API adapter with a structured brief schema. Set `OPENAI_API_KEY`, `OPENAI_MODEL`, and `CAMPAIGN_ACCESS_TOKEN` to enable it. Enter only the project access token in the browser. Never place API keys in public files.

The browser saves drafts and campaigns locally and exports a production packet as JSON. This is not shared account storage. The packet leaves unknown facts and unapproved generation settings explicit.

## Structure

- `public/`: responsive dashboard and browser intake.
- `src/brief.js`: campaign intake and production packet contract.
- `api/chat.js`: optional model-backed conversation endpoint.
- `server.mjs`: local static and API server.
- `docs/PRODUCT-SCOPE.txt`: Ryan's current decisions and build sequence.
- `docs/HIGGSFIELD-AVATAR-DOSSIER.txt`: recovered avatar production context.
- `private-research/`: ignored local source excerpts, excluded from Git and hosting.

## Integration boundaries

The optional Exa adapter and model conversation/review adapters require credentials. Seven specialist model reviewers can run for up to three rounds, revising only the prompt between rounds and stopping on unresolved findings or connection errors. Reviews bind to a prompt/reference fingerprint. The UI never issues a fictional model pass. Browser execution, background posting, Terac, Lovable, Whop checkout, and analytics are not connected. The app never submits a paid video generation. The real course checkout URL is pending. Do not represent test data, views, revenue, or integration placeholders as live activity.

## API reference

The optional AI adapter follows [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Model selection is explicit through the environment. No paid model request is made by setup or the tests.
