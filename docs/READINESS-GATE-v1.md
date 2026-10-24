# Readiness gate and compiled workflow fix

The gate now rejects numeric strings, nonfinite or nonpositive duration and credit quotes, fractional or string reference versions, unsafe versions and whitespace-only required reference fields. Manifests and dialogue arrays are bounded. Malformed direct inputs return blockers. Valid data retains its fingerprint shape. src/readiness.js supplies both the root review API and the V3 workflow validator.

A real hosted test exposed an additional build problem. The default generated directory traversed the local node_modules symlink into the preserved V1 experiment. Generated dynamic imports then loaded its old validator, overriding the updated registered step. Unit and endpoint tests alone did not detect this. The intermediate test receipt is retained as a failure. It made zero model calls and never approved spending or generation.

V3 now generates workflow files in its own absolute .nitro-build directory. The compiled-output guard rejects V1 validator resolution and verifies the current gate in the built artifact. Use npm run build:preview before preview deployment. V1 and V2 sources remain unchanged.

Validation: 80 offline tests, syntax checks, compiled guard, six local API cases, six final hosted API cases and eight compatibility checks passed. A fresh actual hosted workflow with a fractional version and string quote completed with both blockers and zero model calls. The earlier completed run recovered unchanged. Anonymous browser blockers and 390px layout were checked. Authenticated hosted browser and physical iPhone remain untested.

Preview: https://duolingo-library-phone-v1-lep3b7hml-ryancortenbachs-projects.vercel.app/#operations

Evidence: work/readiness-gate-hosted-workflow-v1.json (failed intermediate check), work/readiness-gate-hosted-workflow-v2.json (actual final workflow), work/readiness-gate-hosted-api-v2.json and work/readiness-gate-final-verification-v2.json. Both new test workflows are terminal. No specialist model, paid generation, purchase, outreach or publishing request occurred.
