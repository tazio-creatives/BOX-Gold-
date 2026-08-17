import { query } from '../config/db.js';

// Available stock = stock_quantity minus whatever is actively reserved by
// pending checkouts (plan §11) — computed once here so every read path
// (listing, detail) reflects it consistently. Products with real configured
// sizes (product_sizes) roll up per-size availability instead — a sizeless
// reservation never applies to a sized product, so the two counts stay
// mutually exclusive (product_size_id IS NULL vs IS NOT NULL).
const AVAILABLE_STOCK_JOIN = `
  LEFT JOIN (
    SELECT product_id, SUM(quantity) AS reserved_qty
    FROM stock_reservations
    WHERE status = 'ACTIVE' AND product_size_id IS NULL
    GROUP BY product_id
  ) reservations ON reservations.product_id = p.id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) > 0 AS has_sizes,
      COALESCE(SUM(GREATEST(ps.stock_quantity - COALESCE(ps_res.reserved_qty, 0), 0)), 0) AS sized_available
    FROM product_sizes ps
    LEFT JOIN (
      SELECT product_size_id, SUM(quantity) AS reserved_qty
      FROM stock_reservations
      WHERE status = 'ACTIVE' AND product_size_id IS NOT NULL
      GROUP BY product_size_id
    ) ps_res ON ps_res.product_size_id = ps.id
    WHERE ps.product_id = p.id
  ) size_stock ON true
`;
// ::int cast: SUM() returns bigint, which node-pg parses as a string to
// avoid precision loss — cast keeps this a proper JSON number instead.
const AVAILABLE_STOCK_SELECT = `
  CASE
    WHEN size_stock.has_sizes THEN size_stock.sized_available::int
    ELSE (p.stock_quantity - COALESCE(reservations.reserved_qty, 0))::int
  END AS available_stock
`;

// "small" is the listing-card size (plan §35); no image upload flow exists
// yet (Phase 9/15), so this is null until then and the frontend falls back
// to a placeholder.
const PRIMARY_IMAGE_JOIN = `
  LEFT JOIN LATERAL (
    SELECT url FROM product_images
    WHERE product_id = p.id AND is_primary = true AND variant = 'small'
    LIMIT 1
  ) primary_image ON true
`;

// Needed so listings can build the canonical /:categorySlug/:productSlug URL
// (plan §40: never /product?id=123).
const CATEGORY_JOIN = `LEFT JOIN categories cat ON cat.id = p.category_id`;

const LIST_COLUMNS = `
  p.id, p.name, p.slug, p.sku, p.category_id, p.collection_id,
  p.metal_type, p.purity, p.gold_color, p.gold_value, p.diamond_value, p.making_charge,
  p.gst_percent, p.product_size, p.mrp, p.selling_price, p.status, p.stock_quantity,
  p.rating_avg, p.rating_count, p.created_at, p.is_featured,
  p.net_weight_grams, p.diamond_weight_carats, p.diamond_config_id,
  primary_image.url AS primary_image_url,
  cat.slug AS category_slug,
  ${AVAILABLE_STOCK_SELECT}
`;

const DETAIL_COLUMNS = `p.*, ${AVAILABLE_STOCK_SELECT}`;

function buildFilters({
  categoryIds,
  collectionId,
  metalType,
  purity,
  goldColor,
  priceMin,
  priceMax,
  status,
  excludeId,
}) {
  const clauses = [];
  const params = [];

  if (status) {
    params.push(status);
    clauses.push(`p.status = $${params.length}`);
  }
  if (excludeId) {
    params.push(excludeId);
    clauses.push(`p.id != $${params.length}`);
  }
  if (categoryIds?.length) {
    params.push(categoryIds);
    clauses.push(`p.category_id = ANY($${params.length})`);
  }
  if (collectionId) {
    params.push(collectionId);
    clauses.push(`p.collection_id = $${params.length}`);
  }
  if (metalType) {
    params.push(metalType);
    clauses.push(`p.metal_type = $${params.length}`);
  }
  if (purity) {
    params.push(purity);
    clauses.push(`p.purity = $${params.length}`);
  }
  if (goldColor) {
    params.push(goldColor);
    clauses.push(`p.gold_color = $${params.length}`);
  }
  if (priceMin != null) {
    params.push(priceMin);
    clauses.push(`p.selling_price >= $${params.length}`);
  }
  if (priceMax != null) {
    params.push(priceMax);
    clauses.push(`p.selling_price <= $${params.length}`);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

// No dedicated "featured" ranking column exists in the approved schema —
// "featured" sort falls back to newest-first, same as "newest". Flagged in
// the phase summary rather than silently inventing a new column.
const SORT_COLUMNS = {
  featured: 'p.created_at DESC',
  newest: 'p.created_at DESC',
  price_asc: 'p.selling_price ASC',
  price_desc: 'p.selling_price DESC',
};

export async function listProducts(filters, { sort = 'featured', page = 1, limit = 24 } = {}) {
  const { where, params } = buildFilters(filters);
  const orderBy = SORT_COLUMNS[sort] ?? SORT_COLUMNS.featured;
  const offset = (page - 1) * limit;

  const listParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT ${LIST_COLUMNS} FROM products p
     ${AVAILABLE_STOCK_JOIN}
     ${PRIMARY_IMAGE_JOIN}
     ${CATEGORY_JOIN}
     ${where}
     ORDER BY ${orderBy}
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  const {
    rows: [{ count }],
  } = await query(`SELECT COUNT(*)::int AS count FROM products p ${where}`, params);

  return { items: rows, total: count };
}

// Descendant-inclusive published-product count for one category node — used
// by the PLP sidebar's "Category" filter counts (plan: category-counts
// endpoint). categoryIds should already include the category itself plus
// every descendant (see getCategoryAndDescendantIds).
export async function countPublishedProducts(categoryIds) {
  if (categoryIds.length === 0) return 0;
  const {
    rows: [{ count }],
  } = await query(
    `SELECT COUNT(*)::int AS count FROM products WHERE status = 'PUBLISHED' AND category_id = ANY($1)`,
    [categoryIds],
  );
  return count;
}

// Trigram-indexed substring match on name/sku, plus an exact metal_type
// match so "gold" surfaces gold products too (plan §28).
export async function searchProducts(term, limit = 8) {
  const { rows } = await query(
    `SELECT ${LIST_COLUMNS} FROM products p
     ${AVAILABLE_STOCK_JOIN}
     ${PRIMARY_IMAGE_JOIN}
     ${CATEGORY_JOIN}
     WHERE p.status = 'PUBLISHED'
       AND (p.name ILIKE '%' || $1 || '%' OR p.sku ILIKE '%' || $1 || '%' OR p.metal_type ILIKE $1)
     ORDER BY p.created_at DESC
     LIMIT $2`,
    [term, limit],
  );
  return rows;
}

export async function findProductBySlug(slug) {
  const { rows } = await query(
    `SELECT ${DETAIL_COLUMNS} FROM products p ${AVAILABLE_STOCK_JOIN} WHERE p.slug = $1`,
    [slug],
  );
  return rows[0] ?? null;
}

// Used by cart/wishlist (plan §11/§27) to hydrate item rows (which only
// store product_id) with current name/price/stock in one round trip.
export async function findProductsByIds(ids) {
  if (ids.length === 0) return [];
  const { rows } = await query(
    `SELECT ${LIST_COLUMNS} FROM products p
     ${AVAILABLE_STOCK_JOIN}
     ${PRIMARY_IMAGE_JOIN}
     ${CATEGORY_JOIN}
     WHERE p.id = ANY($1)`,
    [ids],
  );
  return rows;
}

export async function findProductById(id) {
  const { rows } = await query(
    `SELECT ${DETAIL_COLUMNS} FROM products p ${AVAILABLE_STOCK_JOIN} WHERE p.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findProductImages(productId) {
  const { rows } = await query(
    `SELECT id, type, variant, format, url, is_primary, sort_order
     FROM product_images WHERE product_id = $1 ORDER BY sort_order`,
    [productId],
  );
  return rows;
}

export async function findProductSizes(productId) {
  const { rows } = await query(
    `SELECT ps.id, ps.label, ps.stock_quantity,
            GREATEST(ps.stock_quantity - COALESCE(res.reserved_qty, 0), 0)::int AS available_stock
     FROM product_sizes ps
     LEFT JOIN (
       SELECT product_size_id, SUM(quantity) AS reserved_qty
       FROM stock_reservations
       WHERE status = 'ACTIVE' AND product_size_id IS NOT NULL
       GROUP BY product_size_id
     ) res ON res.product_size_id = ps.id
     WHERE ps.product_id = $1
     ORDER BY ps.sort_order`,
    [productId],
  );
  return rows;
}

// Batch lookup by size id (cart/checkout hydration — mirrors
// findProductsByIds) rather than per-product, since a cart's lines can span
// many different products' size rows.
export async function findProductSizesByIds(ids) {
  if (ids.length === 0) return [];
  const { rows } = await query(
    `SELECT ps.id, ps.product_id, ps.label, ps.stock_quantity,
            GREATEST(ps.stock_quantity - COALESCE(res.reserved_qty, 0), 0)::int AS available_stock
     FROM product_sizes ps
     LEFT JOIN (
       SELECT product_size_id, SUM(quantity) AS reserved_qty
       FROM stock_reservations
       WHERE status = 'ACTIVE' AND product_size_id IS NOT NULL
       GROUP BY product_size_id
     ) res ON res.product_size_id = ps.id
     WHERE ps.id = ANY($1)`,
    [ids],
  );
  return rows;
}

const INSERT_COLUMNS = [
  'name',
  'sku',
  'category_id',
  'collection_id',
  'short_description',
  'full_description',
  'metal_type',
  'purity',
  'gold_color',
  'gross_weight_grams',
  'net_weight_grams',
  'diamond_weight_carats',
  'diamond_config_id',
  'diamond_count',
  'diamond_type',
  'diamond_colour',
  'diamond_clarity',
  'gemstone',
  'certification',
  'product_size',
  'care_instructions',
  'gold_value',
  'diamond_value',
  'diamond_value_is_manual',
  'making_charge',
  'gst_percent',
  'mrp',
  'selling_price',
  'is_price_locked',
  'is_featured',
  'show_delivery_checker',
  'stock_quantity',
  'status',
  'slug',
  'meta_title',
  'meta_description',
  'meta_keywords',
];

// camelCase input keys -> snake_case columns, for both insert and update.
const PRODUCT_FIELD_MAP = Object.fromEntries(
  INSERT_COLUMNS.map((column) => [column.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), column]),
);

export async function createProduct(fields) {
  const columns = [];
  const placeholders = [];
  const values = [];
  for (const [key, column] of Object.entries(PRODUCT_FIELD_MAP)) {
    if (Object.hasOwn(fields, key)) {
      values.push(fields[key]);
      columns.push(column);
      placeholders.push(`$${values.length}`);
    }
  }

  const {
    rows: [{ id }],
  } = await query(
    `INSERT INTO products (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    values,
  );
  return findProductById(id);
}

export async function updateProduct(id, fields) {
  const values = [id];
  const setClauses = [];
  for (const [key, column] of Object.entries(PRODUCT_FIELD_MAP)) {
    if (Object.hasOwn(fields, key)) {
      values.push(fields[key]);
      setClauses.push(`${column} = $${values.length}`);
    }
  }
  if (setClauses.length === 0) return findProductById(id);

  setClauses.push('updated_at = now()');
  await query(`UPDATE products SET ${setClauses.join(', ')} WHERE id = $1`, values);
  return findProductById(id);
}

export async function deleteProduct(id) {
  await query('DELETE FROM products WHERE id = $1', [id]);
}

// Recalculation targets for the Live Pricing Engine (plan §9a) — locked
// products are deliberately excluded from both automatic passes.
// category_id/slug are pulled through here (not just pricing fields) so the
// recalculation jobs can invalidate the right page_cache rows per product
// without an extra query per row (plan §1a invalidation hooks).
export async function findGoldProductsForRecalculation() {
  const { rows } = await query(
    `SELECT id, slug, category_id, net_weight_grams, purity, diamond_value, making_charge,
            gst_percent, selling_price
     FROM products
     WHERE metal_type = 'GOLD' AND purity IS NOT NULL AND net_weight_grams IS NOT NULL
       AND is_price_locked = false`,
  );
  return rows;
}

export async function findDiamondProductsForRecalculation(diamondConfigId) {
  const { rows } = await query(
    `SELECT id, slug, category_id, gold_value, diamond_weight_carats, making_charge,
            gst_percent, selling_price
     FROM products
     WHERE diamond_config_id = $1 AND diamond_weight_carats IS NOT NULL AND diamond_weight_carats > 0
       AND diamond_value_is_manual = false AND is_price_locked = false`,
    [diamondConfigId],
  );
  return rows;
}

// Transaction-scoped — always called from within withTransaction alongside
// a product_price_history insert (plan §9a rate-sync flow).
export async function updateProductPricingTx(
  client,
  id,
  { goldValue, diamondValue, sellingPrice },
) {
  await client.query(
    `UPDATE products
     SET gold_value = $2, diamond_value = $3, selling_price = $4, updated_at = now()
     WHERE id = $1`,
    [id, goldValue, diamondValue, sellingPrice],
  );
}
