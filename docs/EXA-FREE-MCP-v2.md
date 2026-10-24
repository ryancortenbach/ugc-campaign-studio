# Exa free MCP and provenance correction

The live connection documented in EXA-FREE-MCP-v1.md remains implemented. The hosted UI previously returned real contact pages through the free endpoint. No paid fallback or outreach sending is connected.

The first normalized recorded sample remains unchanged at public/exa-prospect-sample-v1.json. A diagnostic script later overwrote the ignored raw response file that its historical hash referred to. The normalized sample is authentic to the original collection, but the exact original raw response is no longer available. An attempted timestamp-only reconstruction did not match the old hash and was not used or represented as recovery.

public/exa-prospect-sample-v2.json retains that normalized research and explicitly records the raw snapshot's unavailability and historical hash. The demo now reads v2. The later raw response is preserved separately at work/exa-free-probe-20261024T083025Z.json. Neither response was substituted as the missing original.

Node's default test discovery also picked up the ignored live probe. That run timed out. Package tests are now explicitly restricted to src/*.test.js, and the manual probe was renamed and changed to write timestamped outputs. The corrected unit suite passed 46 tests without running the live probe. No private API key, paid fallback, model generation or outreach was used by that diagnostic.

Original source videos, the canonical avatar dossier, prior previews and the normalized v1 sample were not modified by this correction. The first document is retained as a historical account; this correction supersedes its assertion that the exact initial raw response remains available.
