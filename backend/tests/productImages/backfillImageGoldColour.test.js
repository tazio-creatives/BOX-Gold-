import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { query } from '../../src/config/db.js';
import { dryRun, applyBackfill, restoreBackfill, BackfillAbort } from '../../scripts/backfillImageGoldColour.js';

// Integration tests for the one-off backfill against a dev/test DB with the
// 20261024000000 migration applied. Every call is scoped to the fixture's
// own product (productIds), so other data in the DB never affects counts.
//
// Fixture: a product sold in YELLOW + ROSE with three AI Studio photos whose
// timestamps have microseconds NOT ending in 000 (the production bug: a JS
// Date keeps milliseconds only), a size guide, one unmatched manual photo,
// and one Yellow order line without an image snapshot.

const VARIANTS = ['thumbnail', 'small', 'medium', 'large'];
const AI_PHOTOS = [
  { sortOrder: 0, assetType: 'RING_GOLD_FRONT', displayOrder: 2, ts: '2026-09-02 04:42:00.123457+00', labels: ['YELLOW', 'FRONT'] },
  { sortOrder: 1, assetType: 'RING_ROSE_FRONT', displayOrder: 4, ts: '2026-09-02 04:42:16.987651+00', labels: ['ROSE', 'FRONT'] },
  { sortOrder: 2, assetType: 'RING_HAND_1', displayOrder: 0, ts: '2026-09-02 04:43:15.500001+00', labels: ['YELLOW', 'MODEL'] },
];
const SIZE_TS = '2026-09-03 10:00:00.000999+00';
const MANUAL_TS = '2026-08-01 09:00:00.250777+00';
const cleanup = [];

async function insertGroup(productId, sortOrder, { type, ts, isPrimary = false }) {
  const rows = [];
  for (const variant of VARIANTS) for (const format of ['avif', 'webp']) rows.push([variant, format]);
  rows.push(['original', 'jpeg']);
  for (const [variant, format] of rows) {
    await query(
      `INSERT INTO product_images (product_id, type, variant, format, url, is_primary, sort_order, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)`,
      [productId, type, variant, format, `https://test.local/${productId}/${sortOrder}-${variant}.${format}`, isPrimary, sortOrder, ts],
    );
  }
}

async function createFixture() {
  const { rows: cat } = await query('SELECT id FROM categories LIMIT 1');
  const productId = randomUUID();
  await query(
    `INSERT INTO products (id, name, sku, category_id, metal_type, purity, gold_weight_grams, slug, status, gst_percent)
     VALUES ($1, 'Backfill Test', $2, $3, 'GOLD', '9K', 2, $4, 'PUBLISHED', 3)`,
    [productId, `TEST-BF-${productId.slice(0, 8)}`, cat[0].id, `test-backfill-${productId.slice(0, 8)}`],
  );
  for (const colour of ['YELLOW', 'ROSE']) {
    const { rows: av } = await query(
      `INSERT INTO attribute_values (attribute_id, product_id, value, label) SELECT id, $1, $2, $2 FROM attributes WHERE code = 'gold_color' RETURNING id`,
      [productId, colour],
    );
    const { rows: pv } = await query(
      `INSERT INTO product_variants (product_id, sku, is_available, stock_quantity, combination_key, sort_order) VALUES ($1, $2, true, 5, $3, 0) RETURNING id`,
      [productId, `TEST-BF-${productId.slice(0, 8)}-${colour}`, colour.toLowerCase()],
    );
    await query('INSERT INTO variant_attribute_values (variant_id, attribute_value_id) VALUES ($1, $2)', [pv[0].id, av[0].id]);
  }
  const { rows: job } = await query(
    `INSERT INTO ai_studio_jobs (product_id, status, reference_image_urls, prompt_version, template_version, jewellery_type, generate_rose_gold)
     VALUES ($1, 'completed', '[]', 'v1', 'v1', 'RING', true) RETURNING id`,
    [productId],
  );
  for (const p of AI_PHOTOS) {
    await insertGroup(productId, p.sortOrder, { type: 'AI_GENERATED', ts: p.ts, isPrimary: p.sortOrder === 1 });
    await query(
      `INSERT INTO ai_studio_assets (job_id, asset_type, display_order, status, imported, updated_at) VALUES ($1, $2, $3, 'READY', true, $4::timestamptz)`,
      [job[0].id, p.assetType, p.displayOrder, p.ts],
    );
  }
  await insertGroup(productId, 3, { type: 'PRODUCT_SIZE', ts: SIZE_TS });
  await insertGroup(productId, 4, { type: 'ORIGINAL', ts: MANUAL_TS });

  const userId = randomUUID();
  await query('INSERT INTO users (id, mobile_number) VALUES ($1, $2)', [userId, `8${String(Date.now()).slice(-9)}`]);
  const { rows: order } = await query(
    `INSERT INTO orders (user_id, contact_name, contact_mobile, contact_email, shipping_address, subtotal, total_amount)
     VALUES ($1, 'T', '9999999999', 't@example.com', '{}', 1, 1) RETURNING id`,
    [userId],
  );
  const { rows: item } = await query(
    `INSERT INTO order_items (order_id, product_id, product_name, product_sku, quantity, gold_value, diamond_value, making_charge,
                              gst_amount, unit_price, line_total, variant_attributes_snapshot)
     VALUES ($1, $2, 'Backfill Test', 'SKU', 1, 0, 0, 0, 0, 1, 1, '[{"attributeCode":"gold_color","label":"YELLOW"}]') RETURNING id`,
    [order[0].id, productId],
  );
  const fixture = { productId, jobId: job[0].id, userId, orderId: order[0].id, orderItemId: item[0].id, logDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bf-')) };
  cleanup.push(fixture);
  return fixture;
}

// Full comparable state: every image row's labels + the order item's snapshot.
async function state(f) {
  const { rows } = await query('SELECT id, sort_order, gold_colour, shot_type FROM product_images WHERE product_id = $1 ORDER BY id', [f.productId]);
  const { rows: oi } = await query('SELECT image_url, image_large_url FROM order_items WHERE id = $1', [f.orderItemId]);
  return { images: rows, orderItem: oi[0] };
}

const apply = (f, report, extra = {}) =>
  applyBackfill({
    expectGroups: report.totals.willBeLabelled,
    expectOrderItems: report.totals.orderItemsToSnapshot,
    logDir: f.logDir,
    stamp: randomUUID(),
    productIds: [f.productId],
    ...extra,
  });

after(async () => {
  for (const f of cleanup) {
    await query('DELETE FROM order_items WHERE order_id = $1', [f.orderId]).catch(() => {});
    await query('DELETE FROM orders WHERE id = $1', [f.orderId]).catch(() => {});
    await query('DELETE FROM users WHERE id = $1', [f.userId]).catch(() => {});
    await query('DELETE FROM ai_studio_assets WHERE job_id = $1', [f.jobId]).catch(() => {});
    await query('DELETE FROM ai_studio_jobs WHERE id = $1', [f.jobId]).catch(() => {});
    await query('DELETE FROM products WHERE id = $1', [f.productId]).catch(() => {});
    fs.rmSync(f.logDir, { recursive: true, force: true });
  }
});

describe('microsecond timestamps', () => {
  test('stored timestamps keep microseconds that do not end in 000, and all are matched', async () => {
    const f = await createFixture();
    const { rows } = await query(
      `SELECT sort_order, MIN(created_at)::text AS ts FROM product_images WHERE product_id = $1 GROUP BY 1 ORDER BY 1`,
      [f.productId],
    );
    assert.deepEqual(rows.map((r) => r.ts.match(/\.(\d+)/)[1]), ['123457', '987651', '500001', '000999', '250777']);
    const report = await dryRun({ productIds: [f.productId] });
    assert.equal(report.totals.willBeLabelled, 4); // 3 AI photos + size guide
    assert.equal(report.totals.leftUnlabelled, 1); // the manual photo
    assert.equal(report.totals.groupsWithout9Rows, 0);
    assert.equal(report.totals.orderItemsToSnapshot, 1);
  });
});

describe('successful apply', () => {
  test('labels every planned group on all 9 rows; apply counts equal dry-run counts', async () => {
    const f = await createFixture();
    const report = await dryRun({ productIds: [f.productId] });
    const result = await apply(f, report);
    assert.equal(result.groupsUpdated, report.totals.willBeLabelled);
    assert.equal(result.rowsUpdated, report.totals.willBeLabelled * 9);
    assert.equal(result.orderItemsUpdated, report.totals.orderItemsToSnapshot);

    const { rows } = await query(
      `SELECT sort_order, gold_colour, shot_type, COUNT(*)::int AS n FROM product_images WHERE product_id = $1 GROUP BY 1,2,3 ORDER BY 1`,
      [f.productId],
    );
    assert.deepEqual(rows, [
      { sort_order: 0, gold_colour: 'YELLOW', shot_type: 'FRONT', n: 9 },
      { sort_order: 1, gold_colour: 'ROSE', shot_type: 'FRONT', n: 9 },
      { sort_order: 2, gold_colour: 'YELLOW', shot_type: 'MODEL', n: 9 },
      { sort_order: 3, gold_colour: 'ANY', shot_type: 'SIZE_GUIDE', n: 9 },
      { sort_order: 4, gold_colour: 'ANY', shot_type: 'OTHER', n: 9 }, // unmatched manual photo untouched
    ]);
    // Yellow order line snapshots the Yellow FRONT photo (not the Rose featured one, not the hand).
    assert.deepEqual((await state(f)).orderItem, {
      image_url: `https://test.local/${f.productId}/0-small.webp`,
      image_large_url: `https://test.local/${f.productId}/0-large.webp`,
    });
    // Change log finalised (no .pending left) and readable.
    const files = fs.readdirSync(f.logDir);
    assert.equal(files.filter((n) => n.endsWith('.pending.json')).length, 0);
    const log = JSON.parse(fs.readFileSync(result.changeLog, 'utf8'));
    assert.equal(log.groups.length, 4);
    // Timestamps kept as full-precision PostgreSQL text (session time zone may vary).
    const logged = Object.fromEntries(log.groups.map((g) => [g.sortOrder, g.createdAt]));
    for (const p of AI_PHOTOS) {
      const { rows: same } = await query('SELECT $1::timestamptz = $2::timestamptz AS eq', [logged[p.sortOrder], p.ts]);
      assert.ok(same[0].eq, `sort ${p.sortOrder}: logged ${logged[p.sortOrder]} equals ${p.ts} to the microsecond`);
      assert.match(logged[p.sortOrder], /\.\d{6}[+-]\d{2}(:\d{2})?$/);
    }
  });
});

describe('restore', () => {
  test('returns every image row and the order item to their exact previous values', async () => {
    const f = await createFixture();
    const before = await state(f);
    const result = await apply(f, await dryRun({ productIds: [f.productId] }));
    assert.notDeepEqual(await state(f), before);
    const r = await restoreBackfill(result.changeLog);
    assert.deepEqual(r, { groups: 4, rows: 36, orderItems: 1 });
    assert.deepEqual(await state(f), before);
  });
});

describe('atomic rollback', () => {
  test('an unexpected count rolls everything back', async () => {
    const f = await createFixture();
    const before = await state(f);
    const report = await dryRun({ productIds: [f.productId] });
    await assert.rejects(apply(f, report, { expectGroups: report.totals.willBeLabelled + 1 }), BackfillAbort);
    await assert.rejects(apply(f, report, { expectOrderItems: 0 }), BackfillAbort);
    assert.deepEqual(await state(f), before);
    assert.deepEqual(fs.readdirSync(f.logDir), []);
  });

  test('a missing row in one photo group aborts the whole apply', async () => {
    const f = await createFixture();
    await query(`DELETE FROM product_images WHERE product_id = $1 AND sort_order = 1 AND variant = 'thumbnail' AND format = 'avif'`, [f.productId]);
    const before = await state(f);
    const report = await dryRun({ productIds: [f.productId] });
    assert.equal(report.totals.groupsWithout9Rows, 1);
    await assert.rejects(apply(f, report), /8 rows, expected 9/);
    assert.deepEqual(await state(f), before);
  });

  test('a row already labelled (mismatched) aborts the whole apply', async () => {
    const f = await createFixture();
    await query(`UPDATE product_images SET gold_colour = 'ROSE', shot_type = 'FRONT' WHERE product_id = $1 AND sort_order = 0 AND variant = 'small' AND format = 'webp'`, [f.productId]);
    const before = await state(f);
    const report = await dryRun({ productIds: [f.productId] });
    await assert.rejects(apply(f, report), /already carry labels/);
    assert.deepEqual(await state(f), before);
  });

  test('a photo group changed after the dry run stops the apply', async () => {
    const f = await createFixture();
    const report = await dryRun({ productIds: [f.productId] });
    // After review: one photo is re-imported (new timestamp, no longer matches its asset).
    await query(`UPDATE product_images SET created_at = '2026-10-01 00:00:00.111111+00' WHERE product_id = $1 AND sort_order = 2`, [f.productId]);
    const before = await state(f);
    await assert.rejects(apply(f, report), /plan has 3 photo groups, reviewed dry run had 4/);
    assert.deepEqual(await state(f), before);
  });

  test('order-item snapshots are rolled back when photo application fails mid-apply', async () => {
    const f = await createFixture();
    const before = await state(f);
    const report = await dryRun({ productIds: [f.productId] });
    // Simulate a photo row reverting after the UPDATE but before verification.
    const hooks = {
      beforeVerify: async (client) => {
        const { rows } = await client.query('SELECT image_url FROM order_items WHERE id = $1', [f.orderItemId]);
        assert.ok(rows[0].image_url, 'snapshot was written inside the transaction');
        await client.query(`UPDATE product_images SET gold_colour = 'ANY', shot_type = 'OTHER' WHERE product_id = $1 AND sort_order = 0 AND variant = 'large' AND format = 'avif'`, [f.productId]);
      },
    };
    await assert.rejects(apply(f, report, { hooks }), BackfillAbort);
    assert.deepEqual(await state(f), before); // photos AND order snapshot back to before
    assert.deepEqual(fs.readdirSync(f.logDir), []); // no change log for a rolled-back apply
  });

  test('a second apply refuses to run and changes nothing', async () => {
    const f = await createFixture();
    const report = await dryRun({ productIds: [f.productId] });
    await apply(f, report);
    const afterFirst = await state(f);
    await assert.rejects(apply(f, report), /already carry labels — run a new dry run/);
    assert.deepEqual(await state(f), afterFirst);
  });

  test('--apply without the reviewed counts is refused', async () => {
    const f = await createFixture();
    await assert.rejects(applyBackfill({ logDir: f.logDir, stamp: 'x', productIds: [f.productId] }), /expect-groups/);
  });
});
