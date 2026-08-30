// One-time data migration: populates the new attribute + variant model
// (attributes/attribute_values/product_attribute_values/product_variants/
// variant_attribute_values, added by migration 20260830010000) from the old
// flat option tables (product_gold_colors/product_purity_options/
// product_diamond_options/product_sizes), then backfills product_variant_id
// on cart_items/order_items/stock_reservations.
//
// Safe to re-run: every insert is idempotent (checks for an existing row
// with the same combination_key / attribute value / etc. before inserting).
// Run against a COPY of production first — review the printed stock report
// before running for real, per the plan's Phase 1 (weight/stock seeding has
// no fully-correct automatic answer for products with configured
// purity/color/diamond options but no prior per-combination stock).
//
// Usage: node backend/scripts/migrateProductVariants.js

import { query, pool } from '../src/config/db.js';

const PURITIES = ['9K', '14K', '18K', '22K', '24K'];
const GOLD_COLORS = [
  { value: 'YELLOW', label: 'Yellow Gold' },
  { value: 'ROSE', label: 'Rose Gold' },
  { value: 'WHITE', label: 'White Gold' },
];

async function getAttributeIds() {
  const { rows } = await query('SELECT id, code FROM attributes');
  const byCode = Object.fromEntries(rows.map((r) => [r.code, r.id]));
  for (const code of ['purity', 'gold_color', 'diamond_quality', 'size']) {
    if (!byCode[code]) throw new Error(`Missing seeded attribute "${code}" — run migration 20260830010000 first.`);
  }
  return byCode;
}

async function seedGlobalAttributeValues(attrByCode) {
  for (const [i, value] of PURITIES.entries()) {
    await query(
      `INSERT INTO attribute_values (attribute_id, value, label, sort_order)
       VALUES ($1, $2, $2, $3)
       ON CONFLICT (attribute_id, value) WHERE product_id IS NULL DO NOTHING`,
      [attrByCode.purity, value, i],
    );
  }
  for (const [i, c] of GOLD_COLORS.entries()) {
    await query(
      `INSERT INTO attribute_values (attribute_id, value, label, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (attribute_id, value) WHERE product_id IS NULL DO NOTHING`,
      [attrByCode.gold_color, c.value, c.label, i],
    );
  }
  const { rows: diamondConfigs } = await query('SELECT id, name FROM diamond_configs ORDER BY name');
  for (const [i, dc] of diamondConfigs.entries()) {
    await query(
      `INSERT INTO attribute_values (attribute_id, value, label, ref_id, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (attribute_id, value) WHERE product_id IS NULL DO NOTHING`,
      [attrByCode.diamond_quality, dc.id, dc.name, dc.id, i],
    );
  }
}

async function globalValueId(attributeId, value) {
  const { rows } = await query(
    'SELECT id FROM attribute_values WHERE attribute_id = $1 AND product_id IS NULL AND value = $2',
    [attributeId, value],
  );
  if (!rows[0]) throw new Error(`No global attribute_value for attribute ${attributeId} value ${value}`);
  return rows[0].id;
}

async function linkProductAttributeValue(productId, attributeValueId) {
  await query(
    `INSERT INTO product_attribute_values (product_id, attribute_value_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [productId, attributeValueId],
  );
}

function cartesian(lists) {
  return lists.reduce((acc, list) => acc.flatMap((combo) => list.map((item) => [...combo, item])), [[]]);
}

async function migrateProduct(product, attrByCode, report) {
  const productId = product.id;

  const [{ rows: colors }, { rows: purities }, { rows: diamondOpts }, { rows: sizes }] = await Promise.all([
    query('SELECT color FROM product_gold_colors WHERE product_id = $1 ORDER BY sort_order', [productId]),
    query('SELECT purity FROM product_purity_options WHERE product_id = $1 ORDER BY sort_order', [productId]),
    query('SELECT diamond_config_id FROM product_diamond_options WHERE product_id = $1 ORDER BY sort_order', [productId]),
    query(
      'SELECT id, label, stock_quantity, weight_grams, diamond_weight_carats FROM product_sizes WHERE product_id = $1 ORDER BY sort_order',
      [productId],
    ),
  ]);

  // Each axis becomes one list of { attributeValueId, size? } entries feeding
  // the cross-product below. An axis with zero configured options is simply
  // omitted — it contributes no dimension, matching "no selector shown".
  const axisLists = [];

  if (colors.length) {
    const entries = [];
    for (const c of colors) {
      const id = await globalValueId(attrByCode.gold_color, c.color);
      await linkProductAttributeValue(productId, id);
      entries.push({ attributeValueId: id });
    }
    axisLists.push(entries);
  }

  if (purities.length) {
    const entries = [];
    for (const p of purities) {
      const id = await globalValueId(attrByCode.purity, p.purity);
      await linkProductAttributeValue(productId, id);
      entries.push({ attributeValueId: id });
    }
    axisLists.push(entries);
  }

  if (diamondOpts.length) {
    const entries = [];
    for (const d of diamondOpts) {
      const id = await globalValueId(attrByCode.diamond_quality, d.diamond_config_id);
      await linkProductAttributeValue(productId, id);
      entries.push({ attributeValueId: id });
    }
    axisLists.push(entries);
  }

  let sizeAxisPresent = false;
  if (sizes.length) {
    sizeAxisPresent = true;
    const entries = [];
    for (const [i, s] of sizes.entries()) {
      const { rows } = await query(
        `INSERT INTO attribute_values (attribute_id, product_id, value, label, sort_order)
         VALUES ($1, $2, $3, $3, $4)
         ON CONFLICT (attribute_id, product_id, value) WHERE product_id IS NOT NULL
           DO UPDATE SET label = EXCLUDED.label
         RETURNING id`,
        [attrByCode.size, productId, s.label, i],
      );
      const attributeValueId = rows[0].id;
      await linkProductAttributeValue(productId, attributeValueId);
      entries.push({ attributeValueId, size: s });
    }
    axisLists.push(entries);
  }

  if (axisLists.length === 0) {
    // Synthetic default variant — no configured axes at all.
    const { rows } = await query(
      `SELECT id FROM product_variants WHERE product_id = $1 AND combination_key = ''`,
      [productId],
    );
    if (!rows[0]) {
      await query(
        `INSERT INTO product_variants (product_id, stock_quantity, combination_key)
         VALUES ($1, $2, '')`,
        [productId, product.stock_quantity ?? 0],
      );
    }
    return;
  }

  const combos = cartesian(axisLists);
  const willOverCount = !sizeAxisPresent && combos.length > 1;

  for (const [i, combo] of combos.entries()) {
    const valueIds = combo.map((c) => c.attributeValueId).sort();
    const combinationKey = valueIds.join('|');
    const sizeEntry = combo.find((c) => c.size);

    const goldWeightGrams = sizeEntry ? sizeEntry.size.weight_grams : null;
    const diamondWeightCarats = sizeEntry ? sizeEntry.size.diamond_weight_carats : null;
    const stockQuantity = sizeEntry ? sizeEntry.size.stock_quantity : (product.stock_quantity ?? 0);

    const { rows: existing } = await query(
      'SELECT id FROM product_variants WHERE product_id = $1 AND combination_key = $2',
      [productId, combinationKey],
    );
    if (existing[0]) continue; // already migrated (idempotent re-run)

    const { rows: inserted } = await query(
      `INSERT INTO product_variants
         (product_id, gold_weight_grams, diamond_weight_carats, stock_quantity, combination_key, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [productId, goldWeightGrams, diamondWeightCarats, stockQuantity, combinationKey, i],
    );
    const variantId = inserted[0].id;
    for (const valueId of valueIds) {
      await query(
        'INSERT INTO variant_attribute_values (variant_id, attribute_value_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [variantId, valueId],
      );
    }
  }

  if (willOverCount) {
    report.push({
      productId,
      name: product.name,
      variantCount: combos.length,
      stockPerVariant: product.stock_quantity ?? 0,
    });
  }
}

// Resolves the combination_key a legacy selection (size id + loose gold
// color/purity/diamond config columns) would map to, so cart/order/
// reservation rows can be matched against the variants just generated.
async function resolveLegacyCombinationKey(productId, row, attrByCode) {
  const ids = [];
  if (row.gold_color) ids.push(await globalValueId(attrByCode.gold_color, row.gold_color));
  if (row.purity) ids.push(await globalValueId(attrByCode.purity, row.purity));
  if (row.diamond_config_id) ids.push(await globalValueId(attrByCode.diamond_quality, row.diamond_config_id));
  if (row.product_size_id) {
    const { rows } = await query(
      `SELECT av.id FROM attribute_values av
       JOIN product_sizes ps ON ps.label = av.value AND ps.product_id = av.product_id
       WHERE ps.id = $1 AND av.attribute_id = $2`,
      [row.product_size_id, attrByCode.size],
    );
    if (rows[0]) ids.push(rows[0].id);
  }
  return ids.sort().join('|');
}

async function backfillCartItems(attrByCode) {
  const { rows } = await query(
    'SELECT id, product_id, product_size_id, gold_color, purity, diamond_config_id FROM cart_items WHERE product_variant_id IS NULL',
  );
  let matched = 0;
  let dropped = 0;
  for (const item of rows) {
    const key = await resolveLegacyCombinationKey(item.product_id, item, attrByCode);
    const { rows: variant } = await query(
      'SELECT id FROM product_variants WHERE product_id = $1 AND combination_key = $2',
      [item.product_id, key],
    );
    if (variant[0]) {
      await query('UPDATE cart_items SET product_variant_id = $1 WHERE id = $2', [variant[0].id, item.id]);
      matched += 1;
    } else {
      console.warn(`[cart_items] dropping unmatched line ${item.id} (product ${item.product_id})`);
      await query('DELETE FROM cart_items WHERE id = $1', [item.id]);
      dropped += 1;
    }
  }
  console.log(`cart_items: ${matched} matched, ${dropped} dropped (unmatched, no live traffic to protect pre-launch)`);
}

async function backfillOrderItems(attrByCode) {
  const { rows } = await query(
    `SELECT id, product_id, product_size_id, product_size_label, gold_color, purity, diamond_config_id, diamond_config_name
     FROM order_items WHERE product_variant_id IS NULL`,
  );
  let matched = 0;
  let snapshotOnly = 0;
  for (const item of rows) {
    const key = await resolveLegacyCombinationKey(item.product_id, item, attrByCode);
    const { rows: variant } = await query(
      'SELECT id FROM product_variants WHERE product_id = $1 AND combination_key = $2',
      [item.product_id, key],
    );

    const snapshot = [];
    if (item.purity) snapshot.push({ attributeCode: 'purity', label: item.purity });
    if (item.gold_color) snapshot.push({ attributeCode: 'gold_color', label: item.gold_color });
    if (item.diamond_config_name) snapshot.push({ attributeCode: 'diamond_quality', label: item.diamond_config_name });
    if (item.product_size_label) snapshot.push({ attributeCode: 'size', label: item.product_size_label });

    if (variant[0]) {
      await query(
        'UPDATE order_items SET product_variant_id = $1, variant_attributes_snapshot = $2 WHERE id = $3',
        [variant[0].id, JSON.stringify(snapshot), item.id],
      );
      matched += 1;
    } else {
      // Historical order, no matching variant (e.g. option since removed) —
      // the FK stays null permanently by design; the snapshot alone
      // preserves what the order actually showed.
      await query('UPDATE order_items SET variant_attributes_snapshot = $1 WHERE id = $2', [
        JSON.stringify(snapshot),
        item.id,
      ]);
      snapshotOnly += 1;
    }
  }
  console.log(`order_items: ${matched} matched to a variant, ${snapshotOnly} snapshot-only (no FK, historical)`);
}

async function backfillStockReservations(attrByCode) {
  const { rows } = await query(
    `SELECT sr.id, sr.product_id, sr.product_size_id
     FROM stock_reservations sr WHERE sr.product_variant_id IS NULL`,
  );
  let matched = 0;
  let unmatched = 0;
  for (const r of rows) {
    const key = await resolveLegacyCombinationKey(r.product_id, { product_size_id: r.product_size_id }, attrByCode);
    const { rows: variant } = await query(
      'SELECT id FROM product_variants WHERE product_id = $1 AND combination_key = $2',
      [r.product_id, key],
    );
    if (variant[0]) {
      await query('UPDATE stock_reservations SET product_variant_id = $1 WHERE id = $2', [variant[0].id, r.id]);
      matched += 1;
    } else {
      console.warn(`[stock_reservations] no variant match for reservation ${r.id} (product ${r.product_id}) — left unmatched`);
      unmatched += 1;
    }
  }
  console.log(`stock_reservations: ${matched} matched, ${unmatched} unmatched`);
}

async function main() {
  const attrByCode = await getAttributeIds();
  await seedGlobalAttributeValues(attrByCode);

  const { rows: products } = await query('SELECT id, name, stock_quantity FROM products');
  const overCountReport = [];
  for (const product of products) {
    await migrateProduct(product, attrByCode, overCountReport);
  }
  console.log(`Migrated variants for ${products.length} products.`);

  await backfillCartItems(attrByCode);
  await backfillOrderItems(attrByCode);
  await backfillStockReservations(attrByCode);

  if (overCountReport.length > 0) {
    console.log('\n=== STOCK REVIEW REQUIRED ===');
    console.log(
      'These products had configured Purity/Gold Color/Diamond Quality options but no prior per-combination stock data.',
    );
    console.log('Their full stock_quantity was repeated on every generated variant (over-counted, not divided) —');
    console.log('an admin should manually correct real per-variant stock via the admin UI before go-live.\n');
    for (const r of overCountReport) {
      console.log(`  ${r.name} (${r.productId}): ${r.variantCount} variants × ${r.stockPerVariant} stock each`);
    }
  } else {
    console.log('\nNo products required stock-count review.');
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    return pool.end().then(() => process.exit(1));
  });
