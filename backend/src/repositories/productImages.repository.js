import { query } from '../config/db.js';

export async function countProductImages(productId, type) {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS count FROM product_images WHERE product_id = $1 AND type = $2',
    [productId, type],
  );
  return rows[0].count;
}

// goldColour/shotType label the whole photo — callers pass the same values
// for every one of a group's size/format rows (see the migration
// 20261024000000_product_image_gold_colour.js).
export async function insertProductImage({
  productId,
  type,
  variant,
  format,
  url,
  isPrimary,
  sortOrder,
  goldColour,
  shotType,
}) {
  const { rows } = await query(
    `INSERT INTO product_images (product_id, type, variant, format, url, is_primary, sort_order, gold_colour, shot_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [productId, type, variant, format, url, isPrimary ?? false, sortOrder ?? 0, goldColour ?? 'ANY', shotType ?? 'OTHER'],
  );
  return rows[0];
}

// Relabels one photo — all of its size/format rows at once.
export async function updateImageGroupLabels(productId, sortOrder, { goldColour, shotType }) {
  const { rowCount } = await query(
    'UPDATE product_images SET gold_colour = $3, shot_type = $4 WHERE product_id = $1 AND sort_order = $2',
    [productId, sortOrder, goldColour, shotType],
  );
  return rowCount;
}

// One query for every product in a cart/order — only the two sizes the
// image resolver can return, to keep the payload small.
export async function findResolvableImagesForProducts(productIds) {
  const { rows } = await query(
    `SELECT product_id, sort_order, type, variant, format, url, is_primary, gold_colour, shot_type
     FROM product_images
     WHERE product_id = ANY($1) AND variant IN ('small', 'large', 'original')`,
    [productIds],
  );
  const byProduct = new Map();
  for (const row of rows) {
    if (!byProduct.has(row.product_id)) byProduct.set(row.product_id, []);
    byProduct.get(row.product_id).push(row);
  }
  return byProduct;
}

// Gold colours a product is actually sold in — from its available variants'
// gold_color attribute, falling back to products.gold_color for products
// with no colour axis (same fallback pricing uses).
export async function findOfferedGoldColours(productId) {
  const { rows } = await query(
    `SELECT DISTINCT av.value
     FROM product_variants pv
     JOIN variant_attribute_values vav ON vav.variant_id = pv.id
     JOIN attribute_values av ON av.id = vav.attribute_value_id
     JOIN attributes a ON a.id = av.attribute_id AND a.code = 'gold_color'
     WHERE pv.product_id = $1 AND pv.is_available = true
     ORDER BY av.value`,
    [productId],
  );
  if (rows.length > 0) return rows.map((r) => r.value);
  const { rows: productRows } = await query('SELECT gold_color FROM products WHERE id = $1', [productId]);
  return productRows[0]?.gold_color ? [productRows[0].gold_color] : [];
}

// URLs an order item still shows (checkout snapshot) — their files must
// survive a gallery delete, or order history and sent emails break.
export async function findUrlsReferencedByOrders(urls) {
  if (urls.length === 0) return new Set();
  const { rows } = await query(
    `SELECT image_url AS url FROM order_items WHERE image_url = ANY($1)
     UNION
     SELECT image_large_url FROM order_items WHERE image_large_url = ANY($1)`,
    [urls],
  );
  return new Set(rows.map((r) => r.url));
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

// The one representative row for a specific group — same 'thumbnail'+'webp'
// convention as findAllImageGroups, used to preview a single photo (e.g. the
// Product Size Image) without pulling all 9 variant rows.
export async function findThumbnailBySortOrder(productId, sortOrder) {
  const { rows } = await query(
    `SELECT * FROM product_images WHERE product_id = $1 AND sort_order = $2 AND variant = 'thumbnail' AND format = 'webp'`,
    [productId, sortOrder],
  );
  return rows[0] ?? null;
}

export async function deleteProductImagesBySortOrder(productId, sortOrder) {
  const { rows } = await query(
    'DELETE FROM product_images WHERE product_id = $1 AND sort_order = $2 RETURNING url',
    [productId, sortOrder],
  );
  return rows;
}

// One representative row per (product, image) group — 'thumbnail'+'webp' is
// generated for every group by processAndStoreImage, so it's always present
// and cheap, unlike pulling every variant just to list a gallery grid.
export async function findAllImageGroups({ limit, offset, search, excludeProductId }) {
  const params = [];
  const conditions = [`pi.variant = 'thumbnail'`, `pi.format = 'webp'`];

  if (excludeProductId) {
    params.push(excludeProductId);
    conditions.push(`pi.product_id != $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`p.name ILIKE $${params.length}`);
  }

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const { rows } = await query(
    `SELECT pi.product_id, pi.sort_order, pi.url AS thumb_url, pi.is_primary, p.name AS product_name
     FROM product_images pi
     JOIN products p ON p.id = pi.product_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY pi.created_at DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params,
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
