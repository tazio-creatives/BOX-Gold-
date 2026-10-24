# URGENT: customers can't add two variants of the same product to one cart

Found 24 Oct 2026 while testing `feature/gold-colour-images`. **Not fixed in that branch**, by decision; needs its own change and release.

## Symptom
A shopper who adds, for example, a ring in Yellow Gold and then the same ring in Rose Gold (or two sizes) gets a server error on the second "Add to Cart". The first line stays; the second is never added.

## Cause (confirmed in production schema)
`cart_items` has two unique indexes:

```
cart_items_variant_unique_idx  UNIQUE (cart_id, product_variant_id)                         ← current model
cart_items_line_unique_idx     UNIQUE (cart_id, product_id,
                                       COALESCE(product_size_id::text,''), COALESCE(gold_color,''),
                                       COALESCE(purity,''), COALESCE(diamond_config_id::text,''))  ← legacy
```

Since the move to variants, `cart_items.product_size_id / gold_color / purity / diamond_config_id` are never written (all 675 production rows have them NULL). The legacy index therefore reduces to `UNIQUE (cart_id, product_id)`, so a second variant of the same product violates it (`duplicate key value violates unique constraint "cart_items_line_unique_idx"`). `upsertCartItemIncrement`'s `ON CONFLICT (cart_id, product_variant_id)` doesn't cover this other index, so the INSERT fails with a 500.

Reproduced on a test database: `addItem(owner, {variantId: YELLOW})` then `addItem(owner, {variantId: ROSE})` for the same product → error above.

## Likely fix (for review — not implemented)
Drop the legacy index in a migration: `DROP INDEX cart_items_line_unique_idx;`. `cart_items_variant_unique_idx` already guarantees one line per variant. Check the guest→user cart merge (`mergeGuestCartIntoUserCart`, same `ON CONFLICT (cart_id, product_variant_id)`) and checkout's `clearOrderedItemsFromCartTx` in the same change.

## Impact
Any customer buying two colours/sizes/purities of one design in a single order. Not data-corrupting; the request fails cleanly.
