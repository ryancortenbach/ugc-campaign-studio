# Earlier three-offer financial model input correction

A real browser check of the previously hosted model reproduced a blank-cost defect. Clearing tee cost still enabled export and displayed $1,340 in modeled monthly operating profit because Number('') became zero. The old production model is intentionally retained as earlier planning, not active course revenue.

The input handler now reads valueAsNumber, so an empty number input becomes NaN and is rejected by the existing finite-number validator. Removed persistence before validation. The existing save at the end of a successful calculation remains, so invalid partial edits cannot replace the last valid scenario. No formulas, defaults, accepted explicit zero values, percentage scale, earlier files or financial assumptions were changed.

Local normal Chrome checks: enter tee cost23, clear it, observe cleared totals and disabled export, reload and observe restored23, enter explicit0and observe valid results, restore18, clear payment percentage and observe rejection, restore2.7. Ninety existing studio tests and JS syntax pass. These tests and browser checks establish input behavior, not observed profit or provider prices.

Independent review and hosted verification are recorded in work/legacy-finance-review-v1.json, work/legacy-finance-browser-v1.json and work/legacy-finance-final-verification-v1.json. Physical devices, actual checkout and provider generation are not covered.
