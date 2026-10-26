# Product data corrections — proposal only (nothing changed)

Read-only review of production, 26 Oct 2026. Each fix is an admin edit + save of one product; none
needs code or a migration. Product team to confirm before anything is changed.

## 1. Aurora Diamond Tops — `aurora-diamond-tops`, BD-ERG-001744, `d2cc1997-85a8-4a8c-b43f-6f2025108a3e`

- **Problem:** stored default purity is **9K**, but the product only offers **18K**. The stored (listing /
  Google) price is computed for 9K, which has no gold weight, so it holds no gold value: **₹10,300**.
- **What customers see and pay:** listing card, product page HTML and JSON-LD show ₹10,300; the page
  then updates to the 18K default variant and cart/checkout charge **₹19,073.61** (18K, SI1 IJ, Yellow).
- **Only product in the catalogue** whose default purity isn't one of its offered purities.
- **Proposed fix:** set Purity (default) to **18K** in the admin and save. Expected stored price after
  save: **₹19,073.61** (today's gold rate). No variant, weight rule or diamond rule changes.

## 2. Axel Gents Diamond Ring — `axel-gents-diamond-ring`, BD-RNG-002139, `987704b9-e0fe-4351-ac45-7cc103e56f01`

- **Problem:** **no default diamond quality** is set (the only published product without one; 1,282 use
  SI1 IJ). The stored price is computed with no diamond: **₹11,212.83**. The product page falls back to
  the first listed tier, **FL. EF** (the most expensive), so it opens on **₹33,872.83**.
- **Proposed fix:** set Diamond Quality (default) to **SI1 IJ** and save. Expected stored price and
  product-page opening price: **₹21,512.83** (9K, SI1 IJ, size 14, Yellow). No other change.
- Note: the product also carries the inactive tier "VVS–VS EF" (hidden from customers; its variants
  price fine). Leave as is unless the team wants it removed.

## 3 & 4. Onyx Crown and Vanguard pendants

| Product | SKU | ID |
|---|---|---|
| `onyx-crown-diamond-pendant` | BD-PND-001624 | `fe4158fd-d4d3-43a6-8703-a52f176ec4f3` |
| `vanguard-diamond-pendant` | BD-PND-001623 | `91baeb76-c920-4a46-b6ee-5857f213c8b2` |

- **Problem:** both offer a diamond tier **"Vvs GH"** whose diamond configuration
  (`d366a5eb-16e7-438b-bf38-cecb75d74f79`) no longer exists. Its 6 variants per product (9K/18K ×
  colours) fail to price with "Selected diamond quality tier no longer exists".
- **Customer impact today:** low — the tier is inactive, so it isn't offered on the product page; the
  stored prices (₹23,190.43 and ₹22,794.69, 9K SI1 IJ) and all other variants are correct. A direct API
  request for one of those variants gets an error, not a wrong price.
- **Proposed fix (choose one):**
  1. In the admin Variants page, exclude the 6 "Vvs GH" variants of each product (no price changes), or
  2. Remove "Vvs GH" from each product's diamond qualities and save.
  Recreating the deleted tier is not recommended unless GH diamonds are actually sold.

## Checks done

- None of the four products is in an order; no active carts hold them.
- No other published product references a missing diamond tier (2 of 2 found are these pendants).

## Suggested follow-up (code, separate approval)

An admin save check that the default purity and default diamond quality are among the offered options
would prevent cases 1 and 2 from recurring.
