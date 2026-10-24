# Whop offer migration

The team handoff in WHOP-UGC-OFFERS-v1.md retires the $97 course checkout and sells UGC packages instead. The course mock remains a non-purchasable learning concept. This decision supersedes the old checkout dependency in the automated continuation prompt.

Normal Chrome read-only inspection confirmed Mint Labs AI UGC Videos and a one-time $500 payment at https://whop.com/checkout/plan_lW3DqSYybecYj/ and a one-time $1,000 payment at https://whop.com/checkout/plan_GohcF3fkgSBnb/. No fields, wallet/payment controls or purchase/terms actions were used. Session identifiers were not saved. Five and twelve video counts come from the team dashboard handoff, not independent observation in the public checkout. Payment completion, delivery, refunds, entitlements and account ownership were not tested.

The current V3 UI no longer loads the course checker or offers its button. Its authenticated legacy endpoint returns410 retired with providerRequested false; unauthenticated requests return401. Health reports courseOfferCheck false. The old pure verifier remains explicitly marked historical for preserved tests, not mounted in the current runtime. Earlier immutable previews remain historical.

For Brands package links and the course's no-checkout state were verified on the preview. Existing finance calculations preserve original scenarios and are now labeled as legacy planning assumptions. They do not model the current one-time packages. Next finance work: editable per-package count/duration, retry/yield, consolidated revisions, generation/voice/edit/labor/fee costs and break-even. Do not apply monthly client-price floors to one-time package revenue or treat a public price as a profit guarantee.

Evidence: work/whop-package-browser-verification-v1.json and work/course-retirement-hosted-v1.json. No Whop product, payment, subscription, purchase or account setting was changed.
