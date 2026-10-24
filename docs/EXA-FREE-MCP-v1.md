# Exa free MCP discovery

Exa's official documentation provides a hosted MCP endpoint at https://mcp.exa.ai/mcp with a limited free, keyless search route. Sources: https://exa.ai/mcp and https://exa.ai/docs/get-started/exa-mcp . These were checked October 24, 2026. The free quota is not a production capacity or availability guarantee.

The app exposes an explicit Free MCP transport. It initializes the connection, reads the tool list, and calls only web_search_exa, with a maximum of five returned source pages. It sends a public business research query, requests source evidence, and uses the returned contact text. It does not call Exa Agent, request private contacts, send outreach, or generate samples.

Free requests never include a private API key or project bearer token in the Exa request headers. Quota errors stop the request and return an explicit message. There are no automatic retries, key rotation, or paid API fallbacks. The separate configured REST API path remains access-token protected. Set EXA_FREE_MCP_DISABLED=true to disable the free route.

The recorded demo sample is public/exa-prospect-sample-v1.json. It came from a real keyless search and contains five source pages, including EPOMAKER, NuPhy and Orbitkey. It is labeled as a recorded result, not a fresh search. Source pages are not necessarily distinct brands. The raw provider response is retained locally under ignored work/exa-free-live-result.json, with its SHA-256 recorded in the public sample.

Emails are published candidates. Source excerpts and domain comparisons help manual verification but do not establish partnership suitability or official site ownership. The app prepares unsent outreach text and a five-second production brief, with no rendered video or sending capability.

The initial Python metadata probe returned HTTP403. The app's Node fetch transport successfully initialized the official endpoint and performed the live search. No account or browser permission was changed. No paid key was supplied.
