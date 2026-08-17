import { query } from '../config/db.js';

export async function findProductVariantOptions(productId) {
  const [colorsResult, puritiesResult, diamondsResult] = await Promise.all([
    query('SELECT color FROM product_gold_colors WHERE product_id = $1 ORDER BY sort_order', [
      productId,
    ]),
    query('SELECT purity FROM product_purity_options WHERE product_id = $1 ORDER BY sort_order', [
      productId,
    ]),
    query(
      `SELECT pdo.diamond_config_id AS id, dc.name, dc.rate_per_carat
       FROM product_diamond_options pdo
       JOIN diamond_configs dc ON dc.id = pdo.diamond_config_id
       WHERE pdo.product_id = $1
       ORDER BY pdo.sort_order`,
      [productId],
    ),
  ]);

  return {
    goldColors: colorsResult.rows.map((r) => r.color),
    purities: puritiesResult.rows.map((r) => r.purity),
    diamondOptions: diamondsResult.rows,
  };
}

export async function replaceGoldColors(productId, colors) {
  await query('DELETE FROM product_gold_colors WHERE product_id = $1', [productId]);
  if (!colors?.length) return;
  const values = colors.map((_, i) => `($1, $${i + 2}, ${i})`).join(', ');
  await query(
    `INSERT INTO product_gold_colors (product_id, color, sort_order) VALUES ${values}`,
    [productId, ...colors],
  );
}

export async function replacePurityOptions(productId, purities) {
  await query('DELETE FROM product_purity_options WHERE product_id = $1', [productId]);
  if (!purities?.length) return;
  const values = purities.map((_, i) => `($1, $${i + 2}, ${i})`).join(', ');
  await query(
    `INSERT INTO product_purity_options (product_id, purity, sort_order) VALUES ${values}`,
    [productId, ...purities],
  );
}

export async function replaceDiamondOptions(productId, diamondConfigIds) {
  await query('DELETE FROM product_diamond_options WHERE product_id = $1', [productId]);
  if (!diamondConfigIds?.length) return;
  const values = diamondConfigIds.map((_, i) => `($1, $${i + 2}, ${i})`).join(', ');
  await query(
    `INSERT INTO product_diamond_options (product_id, diamond_config_id, sort_order) VALUES ${values}`,
    [productId, ...diamondConfigIds],
  );
}
