import { query } from '../config/db.js';

export async function countProductImages(productId, type) {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS count FROM product_images WHERE product_id = $1 AND type = $2',
    [productId, type],
  );
  return rows[0].count;
}

export async function insertProductImage({ productId, type, variant, format, url, isPrimary, sortOrder }) {
  const { rows } = await query(
    `INSERT INTO product_images (product_id, type, variant, format, url, is_primary, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [productId, type, variant, format, url, isPrimary ?? false, sortOrder ?? 0],
  );
  return rows[0];
}

export async function findProductImageById(id) {
  const { rows } = await query('SELECT * FROM product_images WHERE id = $1', [id]);
  return rows[0] ?? null;
}

// All rows sharing the same upload (same variant set) — used to promote/
// demote/reorder/delete an image as one logical unit rather than per-format row.
export async function findProductImageSiblings(productId, sortOrder) {
  const { rows } = await query(
    'SELECT * FROM product_images WHERE product_id = $1 AND sort_order = $2',
    [productId, sortOrder],
  );
  return rows;
}

export async function clearPrimaryForProduct(productId) {
  await query('UPDATE product_images SET is_primary = false WHERE product_id = $1', [productId]);
}

export async function setPrimaryBySortOrder(productId, sortOrder) {
  await query('UPDATE product_images SET is_primary = (sort_order = $2) WHERE product_id = $1', [
    productId,
    sortOrder,
  ]);
}

export async function updateSortOrder(productId, oldSortOrder, newSortOrder) {
  await query(
    'UPDATE product_images SET sort_order = $3 WHERE product_id = $1 AND sort_order = $2',
    [productId, oldSortOrder, newSortOrder],
  );
}

export async function deleteProductImagesBySortOrder(productId, sortOrder) {
  const { rows } = await query(
    'DELETE FROM product_images WHERE product_id = $1 AND sort_order = $2 RETURNING url',
    [productId, sortOrder],
  );
  return rows;
}

export async function findMaxSortOrder(productId) {
  const { rows } = await query(
    'SELECT COALESCE(MAX(sort_order), -1) AS max FROM product_images WHERE product_id = $1',
    [productId],
  );
  return rows[0].max;
}
