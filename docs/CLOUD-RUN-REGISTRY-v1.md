# Private cloud readiness registry v1

The optional Hosted readiness panel can now list existing V3 workflow runs from the provider, without relying on browser history. A request requires the private operator token. The token is cleared after the action. Results expose only run ID, execution status, request UUID, dates and an explicit expiration marker. Inputs, results, errors and job tickets are excluded. The response never resolves workflow payload data.

POST /api/jobs/list uses the exact V3 workflow name, a fixed20run page, one status and a provider cursor. Invalid status arrays are rejected before querying. Namespace mismatch or malformed provider pages fail closed. This uses existing Workflow storage, without a new database account.

The local normal-browser test began on127.0.0.1with no saved local run IDs. It discovered two existing runs and recovered the completed one, retaining its missing-quote blocker. A failed filter returned zero. No job was created. A fictional local credential was used. Hosted authenticated HTTP separately verified unauthorized401, all/completed/failed lists and invalid-status400. Authenticated hosted browser flow, a multi-page dataset and physical iPhone remain untested.

Three offline tests cover metadata minimization, namespace/page failure and bounded query options. Root suite62passes. Eight existing API checks and81publicfile checks passed on the new preview, with exact Vercel HTML feedback appends accounted for. Model/media/publishing are disabled. A completed execution is not specialist approval. Provider retention and lookback apply. This list is not permanent task storage, deduplication, multi-user authorization or push alerts.

Preview: https://duolingo-library-phone-v1-5xisypq3u-ryancortenbachs-projects.vercel.app/#operations
Evidence: work/cloud-registry-local-api-v1.json, cloud-registry-hosted-api-v1.json, cloud-registry-local-browser-v1.json and cloud-registry-final-verification-v1.json.

The earlier Air copy is verified at commit5ff144c with2674researchfiles and59tests. This registry update has not synced there because both bounded SSH routes timed out. Preserve its existing files and any user edits. Research has not changed and should not be recopied. New hosted preview remains accessible through its HTTPS link.
