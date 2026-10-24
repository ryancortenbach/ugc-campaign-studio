# Hosted run selection and stale responses

Selecting a saved or cloud run, opening an alert source, or editing the run ID now detaches the current ticket and polling state. The previous result is cleared. Explicit recovery is required before refresh or cancellation becomes available. Recovery, cancellation and new submission invalidate older status requests. An epoch plus run/ticket check discards late status successes and failures. This does not provide server-side submission deduplication or multi-user ownership.

A real local browser test used an ignored response-delay proxy in front of the actual SDK backend. It held one unmodified status response for completed run A, selected and recovered cancelled run B, then released A. B remained selected and cancelled. A subsequent explicit refresh confirmed B. Cloud selection detached old controls too. No new jobs were started and no response content was fabricated. The test used a fictional local credential. The private hosted token was not entered into a browser.

The local test also exposed root workflow scanning of generated files. The V3 scanner now only reads src, while generated output remains isolated in .nitro-build. Two consecutive preview builds and compiled guards passed. Workflow identity stays stable for recovery.

82 offline tests pass, including asynchronous stale-response regressions. Final preview: https://duolingo-library-phone-v1-roahotf73-ryancortenbachs-projects.vercel.app/#operations

86 public assets and eight API compatibility checks passed. Anonymous hosted browser selection and 390px layout were verified. Authenticated hosted browser and physical iPhone remain untested. The project-owned local server was restarted to clear old module caches; six actual gate cases passed on port3000. Browser-saved campaigns were not modified by the restart.

Evidence: work/hosted-selection-local-browser-v1.json, work/hosted-selection-delay-v1.json, work/hosted-selection-hosted-browser-v1.json, work/hosted-selection-main-dev-gate-v1.json and work/hosted-selection-final-verification-v1.json. Temporary test servers were stopped. Sponsor, model and rendering dependencies remain incomplete.
