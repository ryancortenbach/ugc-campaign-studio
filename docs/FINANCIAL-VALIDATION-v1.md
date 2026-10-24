# Financial scenario validation

The monthly calculator now rejects nonnumeric or infinite inputs, negative values, rates above 100 percent, traffic allocation above 100 percent, zero generation yield, zero amortization duration, fewer than one unit per completed order, and production days outside a positive monthly range of up to 31.

Invalid drafts remain in local browser storage so they can be corrected. Headline totals clear, an explanation appears, and model export is disabled. A corrected or restored scenario re-enables the results and export. Numeric overflow is rejected rather than serialized as a misleading null or displayed as infinite profit.

A brand-service price floor is undefined when fees and refunds leave no positive retained revenue to cover positive delivery costs. The calculator now returns null and displays No finite price floor. Values within 1e-12 of zero retained revenue are treated as zero to avoid floating-point artifacts at 100 percent deductions. This floor concerns direct per-client delivery, support, fixed payment and replacement-acquisition costs; shared overhead remains separate in the model.

Positive generation yields below one percent are used directly. They are no longer silently raised to one percent. Positive fractional amortization periods and production days are also used directly rather than silently raised to one. The saved base, conservative and upside scenarios were compared against their prior values and remain exactly unchanged for profit, direct brand price floor, cost per post and first-month cash change.

Per-post cost, per-post review savings, per-brand contribution and the delivery price floor now display cents. Totals retain whole-dollar presentation. For the base assumptions, modeled post cost is $3.38 and the modeled delivery price floor displays $1,141.36. These are scenario outputs, not provider quotes or business guarantees.

Verified on the hosted preview: 101 percent conversion and 130 percent traffic allocation hide totals and block export; correcting inputs restores the four summary cards; 70 percent brand refunds plus 30 percent percentage fees displays No finite price floor; the base model exports successfully. The 2,870-byte JSON download retains full numeric precision. Mobile browser width was 390 pixels with no document overflow. Physical iPhone testing remains unperformed.

Current evaluated scenarios are saved in financial-scenarios-v3.json. Earlier scenario files and notes are preserved. No private sales, live fees, generation prices or guaranteed outcomes were inferred from these fixes.
