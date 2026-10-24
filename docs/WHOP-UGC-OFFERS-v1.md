# Mint Labs Whop offers

Read from the Whop dashboard on October 24, 2026 at 13:45 ET. Nothing on Whop was changed.

Decision from Tensae: there is no $97 Whop checkout. Sell the UGC packages. The Custom Software Build is listed on Whop but is not a focus today.

Business: Mint Labs, `biz_Fj9QjiVTYUDda8`. Store: https://whop.com/mint-labs/

| Offer | Plan | Price | Checkout |
|---|---|---|---|
| UGC Starter, 5 videos | `plan_lW3DqSYybecYj` | $500, one time | https://whop.com/checkout/plan_lW3DqSYybecYj/ |
| UGC Campaign, 12 videos | `plan_GohcF3fkgSBnb` | $1,000, one time | https://whop.com/checkout/plan_GohcF3fkgSBnb/ |
| Custom Software Build | `plan_AL0RpmiF6YraX` | $1,000, one time | https://whop.com/checkout/plan_AL0RpmiF6YraX/ |

Both UGC plans are pricing options on one product, AI UGC Videos (`prod_mCfHRZ6syNgqb`). All three plans are USD, buy now, unlimited stock, no trial, visible and live on Whop Discover.

Package copy on Whop: both packages include scripts, editing, captions, vertical videos of 15 to 30 seconds, and one consolidated revision round. The exact video count, creative direction and delivery timeline are agreed before payment.

## Site

- `/brands/` has a Packages section whose Buy buttons open the two UGC checkouts above.
- `/course/` no longer offers a checkout. It is labeled as a concept that is not on sale and points to the UGC packages.

## Not done

- The read-only offer checker (`src/course-offer.js`, `/api/course-offer/verify`) still expects a $97 course plan. It never takes payments. Retarget it to the UGC plans or remove it.
- The fulfillment service (ops/, https://mint-labs-ops.vercel.app) receives `payment.succeeded` at `/api/whop` once a Whop webhook is created and its `ws_` secret is stored as `WHOP_WEBHOOK_SECRET` on Vercel. Until then, create orders by hand in its console. The agent's Whop card only checks whether `WHOP_API_KEY` is set.
