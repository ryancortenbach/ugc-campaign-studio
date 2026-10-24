# Storefront review and fixes

Scope: public/shop, public/course, public/brands and their shared cart/marketing behavior. No edits to the Air agent, no checkout purchases or provider calls.

The independent source reviewer found a reproducible cart defect: closing the cart removed its only control while retaining items. Added a persistent header cart button with current item count, expanded state and keyboard focus restoration. Closing and reopening preserves the selected size and items for removal within the same visit. Page reload still resets this preview cart by design. No inventory or orders are connected.

The brands page now distinguishes the paid one-time video packages from the planned autonomous daily posting service. It places a before-payment scope reminder above the existing authorized Whop links, makes Exa use conditional, states that Terac human review is planned with no assigned study, and identifies Lovable as unused. No extra payment gate was added. Package checkout, account ownership, fulfillment and posting remain outside this review.

The reviewer's initial objection to $97 course pricing was withdrawn: the user requested that original concept mock, and the current team handoff retires the active course checkout. The mock remains prominently not on sale, with no checkout. It does not claim an active offer.

After fixes, the reviewer found no remaining blocking defects in this source scope. A verified contact route for agreeing scope remains a minor UX opportunity; none was invented. Independent review covered source only, not whole-app signoff or pixel parity to reference websites.

Real local Chrome checks: add Elsewhere Tee in size L, close cart, reopen unchanged one-item cart, remove item, confirm zero count and empty totals, and390px document width390. Existing90studio unit tests and JavaScript syntax pass. Hosted browser and file verification are retained in work/storefront-final-verification-v1.json and work/storefront-browser-v1.json. Physical devices and payments untested.
