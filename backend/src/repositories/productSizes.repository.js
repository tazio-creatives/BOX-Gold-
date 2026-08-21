import { query } from '../config/db.js';

// Upserts by (product_id, label) so an existing size's id survives an admin
// edit that only changes its stock count — any cart items already pointing
// at that size stay valid. Sizes no longer present in the incoming list are
// deleted; cart lines on a removed size cascade-delete via the FK, which is
// the correct behavior (that size no longer exists to fulfil).
export async function replaceProductSizes(productId, sizes) {
  const labels = sizes.map((s) => s.label);

  for (let i = 0; i < sizes.length; i++) {
    await query(
      `INSERT INTO product_sizes (product_id, label, stock_quantity, sort_order, weight_grams, diamond_weight_carats)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (product_id, label)
       DO UPDATE SET stock_quantity = EXCLUDED.stock_quantity, sort_order = EXCLUDED.sort_order,
                     weight_grams = EXCLUDED.weight_grams,
                     diamond_weight_carats = EXCLUDED.diamond_weight_carats, updated_at = now()`,
      [
        productId,
        sizes[i].label,
        sizes[i].stockQuantity,
        i,
        sizes[i].weightGrams ?? null,
        sizes[i].diamondWeightCarats ?? null,
      ],
    );
  }

  if (labels.length > 0) {
    await query('DELETE FROM product_sizes WHERE product_id = $1 AND label != ALL($2)', [
      productId,
      labels,
    ]);
  } else {
    await query('DELETE FROM product_sizes WHERE product_id = $1', [productId]);
  }
}
