# Read-only Whop offer checker v1

The private operator panel can inspect server-configured course offer metadata. It cannot create a product, checkout, charge or entitlement. The customer course CTA remains disconnected. Matching metadata is not payment or delivery verification.

Implementation: src/course-offer.js and public/course-offer.js, mounted at POST /api/course-offer/verify in experiments/durable-dashboard-v3. Operator auth uses the existing private token. Whop credentials never enter browser code. Empty configuration fields are documented in .env.example; none were supplied in this batch.

The [current Variant endpoint](https://docs.whop.com/api-reference/beta/variants/retrieve-variant) uses plan_ IDs. The adapter sends one GET, rejects redirects and pins Api-Version-Date2026-10-24 according to [Whop versioning](https://docs.whop.com/developer/api/versioning). It compares configured account/product/variant, canonical checkout URL, base97USDone-time price, billing/trial/installment settings and availability. Taxes, fees, actual checkout quotes, payment state, course materials, entitlement and refunds remain unverified.

Seven fixtures test mismatch rejection, safe URLs, whitespace/missing keys, read-only pinned transport and failure handling. All69tests pass. Fixture matches are not live Whop evidence. Actual local and hosted endpoints returned401without operator access, and503not_configured with operator access. ProviderRequested false. There was no live Whop API request, purchase or product creation.

Normal Chrome local check used a fictional local-only operator credential and displayed missing configuration. Hosted anonymous missing-token gate and390pxlayout verified. Authenticated hosted browser flow and physical iPhone untested.82publicfiles and eight existing API checks passed on the new preview.

Preview: https://duolingo-library-phone-v1-8ur92q8ps-ryancortenbachs-projects.vercel.app/#operations
Evidence: work/course-offer-local-verification-v1.json, course-offer-hosted-verification-v1.json, course-offer-browser-verification-v1.json and course-offer-final-verification-v1.json.

A combined information question requests the authorized private config path and public course checkout URL. No secret values should be pasted in chat. Account-bound grading and sponsor work remain pending. NoDONE. The earlier Air copy remains at its verified59test snapshot; current source was not synchronized while SSH was unreachable.
