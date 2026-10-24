# Readiness alert inbox

The Agent operations inbox retains observed browser task blockers, hosted readiness findings, failed hosted runs and uncertain submissions. It stores up to 200 metadata records in this browser. No prompt, model report, credential or job ticket is copied into alert history.

Each local attempt gets a separate alert. Hosted polling deduplicates by run and issue type. Acknowledging means the alert was seen. It does not resolve a blocker, approve a campaign or reconcile a submission. All retained alerts remain inspectable. Inspect source selects the original local task or hosted run; hosted recovery still needs operator access. Missing local sources are explicitly identified as historical. JSON export preserves the metadata history. No background push or cross-device inbox synchronization exists.

76 offline tests and syntax checks pass. Real local browser verification covered readiness, acknowledgement, reload, source inspection, retry and an actual 883-byte JSON download. Actual local hosted recovery used an existing completed workflow with a budget blocker, then checked acknowledgement and refresh deduplication. No new workflow was submitted. Failed and uncertain modes were checked with fixtures only. Anonymous hosted browser verified a real browser-local readiness alert, acknowledgement/reload and 390px layout. Authenticated hosted browser and physical iPhone remain untested.

Preview: https://duolingo-library-phone-v1-c0un33xa9-ryancortenbachs-projects.vercel.app/#operations

Evidence: work/alerts-local-browser-v1.json, work/alerts-hosted-local-browser-v1.json, work/alerts-hosted-browser-v1.json and work/alerts-final-verification-v1.json. Earlier artifacts and previews are preserved. No model, media, paid generation, messaging or publishing operation was performed.
