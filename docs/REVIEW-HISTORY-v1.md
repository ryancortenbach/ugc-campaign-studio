# Review evidence and stale-input checks

Agent operations now preserves each returned readiness or specialist report in browser-local history. Records contain the submitted inputs, final reviewed inputs when a revision changed the prompt, full returned rounds and findings, timestamp, and reported model-request count. The access token is excluded.

Readiness-only reports stay labeled Readiness only. They are not specialist grades. Request failures do not become passing results. Missing request counts remain unknown. Request counts do not establish billed cost, and no price estimate is inferred from them.

The history compares the report's reviewed prompt, brief, references, settings and dialogue locks with the current review form. Any difference marks the report stale. A report for a revised prompt is bound to that final draft, not the originally submitted prompt. Matches current inputs describes equality, not authorization to generate or reuse an old quote.

If the revision request fails, the backend returns the completed specialist findings, attempted revision and last usable prompt in a blocked result. It does not discard the earlier evidence or silently proceed. This failure path was tested with a fixture, not a real paid model run.

Export review history downloads the saved evidence as a separate JSON file. This history export is not the campaign production packet and has no import UI. Records remain local to the browser and preview origin unless exported. No review history grants spend, submits generation, sends outreach, or posts content.

Verified behavior: a hosted readiness request returned zero model calls, was saved, changed from matching to stale after a prompt edit, survived reload, and downloaded as one record in a 2,984-byte JSON export. All spend and generation flags remained false. The 390-pixel browser layout had no document overflow. Physical iPhone testing remains unperformed.
