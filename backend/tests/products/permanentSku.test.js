import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { query } from '../../src/config/db.js';
import { adminCreateProduct, adminUpdateProduct } from '../../src/services/productsService.js';
import { listProducts } from '../../src/repositories/products.repository.js';
import { formatSku, PERMANENT_SKU_PATTERN, SKU_TYPE_CODES, JEWELLERY_TYPES } from '../../src/services/productSkuService.js';
import { dryRun, applyMigration, restoreMigration, MigrationAbort } from '../../scripts/migrateDraftSkus.js';

// Integration tests against a dev/test DB with migration
// 20261026000000_permanent_product_sku applied.

const created = { products: [], users: [], orders: [], dirs: [] };
after(async () => {
  for (const id of created.orders) {
    await query('DELETE FROM order_items WHERE order_id = $1', [id]).catch(() => {});
    await query('DELETE FROM orders WHERE id = $1', [id]).catch(() => {});
  }
  for (const id of created.users) await query('DELETE FROM users WHERE id = $1', [id]).catch(() => {});
  for (const id of created.products) {
    await query('DELETE FROM ai_studio_jobs WHERE product_id = $1', [id]).catch(() => {});
    await query('DELETE FROM products WHERE id = $1', [id]).catch(() => {});
  }
  for (const d of created.dirs) fs.rmSync(d, { recursive: true, force: true });
});

async function create(extra = {}) {
  const product = await adminCreateProduct({ name: `SKU Test ${randomUUID().slice(0, 8)}`, metalType: 'GOLD', status: 'DRAFT', ...extra });
  created.products.push(product.id);
  return product;
}
const number = (sku) => Number(sku.split('-')[2]);

describe('SKU format', () => {
  test('BD-{TYPE}-{6+ digits}; every jewellery type has a 3-letter code', () => {
    assert.equal(formatSku('RING', 1024), 'BD-RNG-001024');
    assert.equal(formatSku('EARRINGS', 1025), 'BD-ERG-001025');
    assert.equal(formatSku('PENDANT', 1026), 'BD-PND-001026');
    assert.equal(formatSku('BANGLE', 1027), 'BD-BNG-001027');
    assert.equal(formatSku('NECKLACE', 1028), 'BD-NCK-001028');
    assert.equal(formatSku('RING', 1234567), 'BD-RNG-1234567');
    for (const t of JEWELLERY_TYPES) assert.match(SKU_TYPE_CODES[t], /^[A-Z]{3}$/, t);
    assert.ok(PERMANENT_SKU_PATTERN.test('BD-RNG-001024'));
    assert.ok(!PERMANENT_SKU_PATTERN.test('BD-RING-0001'));
    assert.throws(() => formatSku('UNKNOWN', 1));
  });
});

describe('server-side generation', () => {
  test('a new product gets a permanent BD-{TYPE} code from its jewellery type, not its category', async () => {
    const { rows: cat } = await query('SELECT id FROM categories LIMIT 1');
    const p = await create({ jewelleryType: 'PENDANT', categoryId: cat[0].id });
    assert.match(p.sku, /^BD-PND-\d{6}$/);
    assert.equal(p.jewellery_type, 'PENDANT');
    assert.equal(p.legacy_sku, null);
  });

  test('no jewellery type and no SKU → clear 400, nothing created, no DRAFT code, no number used', async () => {
    const name = `SKU Test notype ${randomUUID().slice(0, 8)}`;
    const seqBefore = (await query('SELECT last_value FROM product_sku_seq')).rows[0].last_value;
    await assert.rejects(adminCreateProduct({ name, metalType: 'GOLD' }), (e) => e.status === 400 && /jewellery type/.test(e.message));
    const seqAfter = (await query('SELECT last_value FROM product_sku_seq')).rows[0].last_value;
    assert.equal(seqAfter, seqBefore, 'the type check runs before a number is taken');
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM products WHERE name = $1', [name]);
    assert.equal(rows[0].n, 0);
  });

  test('a hand-entered SKU is preserved; the generated format is reserved', async () => {
    const manual = `MANUAL-${randomUUID().slice(0, 8)}`;
    const p = await create({ sku: manual });
    assert.equal(p.sku, manual);
    await assert.rejects(create({ sku: 'BD-RNG-999999', jewelleryType: 'RING' }), (e) => e.status === 400);
  });

  test('10 products created at the same moment get 10 different, consecutive-range codes', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => create({ jewelleryType: 'RING' })));
    const skus = results.map((p) => p.sku);
    assert.equal(new Set(skus).size, 10);
    assert.ok(skus.every((s) => /^BD-RNG-\d{6}$/.test(s)));
    assert.equal(new Set(skus.map(number)).size, 10);
  });

  test('a create that fails after the SKU number was taken leaves no product behind (gaps are fine)', async () => {
    const first = await create({ jewelleryType: 'RING' });
    // Same name → same slug → unique violation inside the create
    // transaction, after the sequence has already handed out a number.
    await assert.rejects(adminCreateProduct({ name: first.name, metalType: 'GOLD', jewelleryType: 'RING' }), (e) => e.code === '23505');
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM products WHERE name = $1', [first.name]);
    assert.equal(rows[0].n, 1);
    const next = await create({ jewelleryType: 'RING' });
    assert.ok(number(next.sku) > number(first.sku) + 1, 'the failed attempt consumed a number, so the next one skips it');
  });
});

describe('permanence', () => {
  test('resending the same SKU is fine; a different SKU is refused', async () => {
    const p = await create({ jewelleryType: 'RING' });
    await adminUpdateProduct(p.id, { sku: p.sku, name: `${p.name} renamed` });
    await assert.rejects(adminUpdateProduct(p.id, { sku: 'SOMETHING-ELSE' }), (e) => e.status === 400 && /permanent/.test(e.message));
    const { rows } = await query('SELECT sku FROM products WHERE id = $1', [p.id]);
    assert.equal(rows[0].sku, p.sku);
  });

  test('changing category or jewellery type keeps the SKU', async () => {
    const p = await create({ jewelleryType: 'RING' });
    const { rows: cats } = await query('SELECT id FROM categories ORDER BY id LIMIT 2');
    await adminUpdateProduct(p.id, { categoryId: cats[1]?.id ?? cats[0].id });
    await adminUpdateProduct(p.id, { jewelleryType: 'NECKLACE' });
    const { rows } = await query('SELECT sku, jewellery_type FROM products WHERE id = $1', [p.id]);
    assert.deepEqual(rows[0], { sku: p.sku, jewellery_type: 'NECKLACE' });
  });
});

// --- migration script ---------------------------------------------------------

async function draftProduct(label, { types = [], status = 'PUBLISHED', sku } = {}) {
  const id = randomUUID();
  const ts = Date.now() + Math.floor(Math.random() * 1e6);
  await query(
    `INSERT INTO products (id, name, sku, metal_type, slug, status) VALUES ($1, $2, $3, 'GOLD', $4, $5)`,
    [id, `Migr ${label}`, sku ?? `DRAFT-${ts}`, `migr-${label}-${id.slice(0, 8)}`, status],
  );
  created.products.push(id);
  for (const t of types) {
    await query(
      `INSERT INTO ai_studio_jobs (product_id, status, reference_image_urls, prompt_version, template_version, jewellery_type) VALUES ($1, 'completed', '[]', 'v1', 'v1', $2)`,
      [id, t],
    );
  }
  return id;
}

async function orderFor(productId) {
  const userId = randomUUID();
  await query('INSERT INTO users (id, mobile_number) VALUES ($1, $2)', [userId, `6${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`]);
  created.users.push(userId);
  const { rows: o } = await query(
    `INSERT INTO orders (user_id, contact_name, contact_mobile, contact_email, shipping_address, subtotal, total_amount) VALUES ($1,'T','9','t@e.com','{}',1,1) RETURNING id`,
    [userId],
  );
  created.orders.push(o[0].id);
  const { rows: p } = await query('SELECT sku FROM products WHERE id = $1', [productId]);
  await query(
    `INSERT INTO order_items (order_id, product_id, product_name, product_sku, quantity, gold_value, diamond_value, making_charge, gst_amount, unit_price, line_total) VALUES ($1,$2,'X',$3,1,0,0,0,0,1,1)`,
    [o[0].id, productId, p[0].sku],
  );
  return { orderId: o[0].id, frozenSku: p[0].sku };
}

async function fixture() {
  const ids = {
    ring: await draftProduct('ring', { types: ['RING'] }),
    pendantDraft: await draftProduct('pendant', { types: ['PENDANT', 'PENDANT'], status: 'DRAFT' }),
    conflicting: await draftProduct('conflict', { types: ['BANGLE', 'NECKLACE'] }),
    noType: await draftProduct('notype'),
    manual: await draftProduct('manual', { types: ['NECKLACE'], sku: `BD-NECK-${randomUUID().slice(0, 6)}` }),
  };
  const order = await orderFor(ids.ring);
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skumig-'));
  created.dirs.push(logDir);
  return { ids, productIds: Object.values(ids), order, logDir };
}

async function snapshot(productIds) {
  const { rows } = await query('SELECT id, sku, legacy_sku, jewellery_type FROM products WHERE id = ANY($1) ORDER BY id', [productIds]);
  const { rows: oi } = await query('SELECT id, product_sku FROM order_items ORDER BY id');
  return { products: rows, orderItems: oi };
}

const apply = (f, report, extra = {}) =>
  applyMigration({ expectSkus: report.totals.toMigrate, expectTypes: report.totals.typesToSet, logDir: f.logDir, stamp: randomUUID(), productIds: f.productIds, ...extra });

describe('DRAFT SKU migration', () => {
  test('dry run: migrates unambiguous DRAFT codes (published and unpublished), excludes ambiguous, keeps manual', async () => {
    const f = await fixture();
    const before = await snapshot(f.productIds);
    const r = await dryRun({ productIds: f.productIds });
    assert.equal(r.totals.toMigrate, 2);
    assert.deepEqual(r.mapping.map((m) => m.jewelleryType).sort(), ['PENDANT', 'RING']);
    assert.ok(r.mapping.every((m) => /^BD-(RNG|PND)-\d{6}$/.test(m.proposedSku) && /^DRAFT-/.test(m.oldSku)));
    assert.deepEqual(r.excluded.map((e) => e.reason).sort(), ['conflicting jewellery types (BANGLE / NECKLACE) — confirm first', 'no jewellery type — confirm first']);
    assert.equal(r.preserved.length, 1);
    assert.equal(r.totals.typesToSet, 3); // ring, pendant + manual (type only)
    assert.deepEqual(await snapshot(f.productIds), before); // read-only
  });

  test('apply: new codes, old codes kept as legacy_sku, order lines untouched, searchable by both', async () => {
    const f = await fixture();
    const r = await dryRun({ productIds: f.productIds });
    const res = await apply(f, r);
    assert.deepEqual([res.skusMigrated, res.typesSet], [2, 3]);
    const { rows } = await query('SELECT id, sku, legacy_sku, jewellery_type FROM products WHERE id = ANY($1)', [f.productIds]);
    const byId = Object.fromEntries(rows.map((x) => [x.id, x]));
    assert.match(byId[f.ids.ring].sku, /^BD-RNG-\d{6}$/);
    assert.match(byId[f.ids.ring].legacy_sku, /^DRAFT-/);
    assert.match(byId[f.ids.pendantDraft].sku, /^BD-PND-\d{6}$/);
    assert.match(byId[f.ids.conflicting].sku, /^DRAFT-/); // excluded
    assert.equal(byId[f.ids.conflicting].legacy_sku, null);
    assert.match(byId[f.ids.manual].sku, /^BD-NECK-/); // preserved
    assert.equal(byId[f.ids.manual].jewellery_type, 'NECKLACE');
    // order line keeps its frozen old code
    const { rows: oi } = await query('SELECT product_sku FROM order_items WHERE order_id = $1', [f.order.orderId]);
    assert.equal(oi[0].product_sku, f.order.frozenSku);
    // admin search finds by new and old code
    for (const term of [byId[f.ids.ring].sku, byId[f.ids.ring].legacy_sku]) {
      const { items } = await listProducts({ search: term });
      assert.ok(items.some((i) => i.id === f.ids.ring), `search ${term}`);
    }
    assert.ok(fs.existsSync(res.changeLog));
    assert.deepEqual(fs.readdirSync(f.logDir).filter((n) => n.endsWith('.pending.json')), []);
  });

  test('restore puts every SKU, legacy_sku and jewellery_type back exactly', async () => {
    const f = await fixture();
    const before = await snapshot(f.productIds);
    const res = await apply(f, await dryRun({ productIds: f.productIds }));
    assert.deepEqual(await restoreMigration(res.changeLog), { restored: 3 });
    assert.deepEqual(await snapshot(f.productIds), before);
  });

  test('restore after go-live: keeps an admin type correction and orders placed since; refuses a mismatched log', async () => {
    const f = await fixture();
    const res = await apply(f, await dryRun({ productIds: f.productIds }));
    // after deployment: the admin corrects the ring's type, a customer orders it
    await query("UPDATE products SET jewellery_type = 'BANGLE' WHERE id = $1", [f.ids.ring]);
    const later = await orderFor(f.ids.ring);
    const { rows: [beforeRestore] } = await query('SELECT legacy_sku FROM products WHERE id = $1', [f.ids.ring]);
    assert.deepEqual(await restoreMigration(res.changeLog), { restored: 3 });
    const { rows: [ring] } = await query('SELECT sku, legacy_sku, jewellery_type FROM products WHERE id = $1', [f.ids.ring]);
    assert.deepEqual([ring.sku, ring.legacy_sku, ring.jewellery_type], [beforeRestore.legacy_sku, null, 'BANGLE']);
    const { rows: oi } = await query('SELECT product_sku FROM order_items WHERE order_id = $1', [later.orderId]);
    assert.equal(oi[0].product_sku, later.frozenSku); // the post-go-live order keeps its BD code
    assert.match(later.frozenSku, /^BD-RNG-\d{6}$/);
    // a second restore (SKUs no longer match the log) changes nothing
    const snap = await snapshot(f.productIds);
    await assert.rejects(restoreMigration(res.changeLog), MigrationAbort);
    assert.deepEqual(await snapshot(f.productIds), snap);
  });

  test('wrong reviewed counts, a product changed after review, or a mid-apply failure → full rollback', async () => {
    const f = await fixture();
    const before = await snapshot(f.productIds);
    const r = await dryRun({ productIds: f.productIds });
    await assert.rejects(apply(f, r, { expectSkus: 3 }), MigrationAbort);
    await assert.rejects(apply(f, r, { expectTypes: 0 }), MigrationAbort);
    await assert.rejects(
      apply(f, r, { hooks: { beforeVerify: (client) => client.query('UPDATE order_items SET product_sku = product_sku || \'x\' WHERE order_id = $1', [f.order.orderId]) } }),
      /order_items changed/,
    );
    assert.deepEqual(await snapshot(f.productIds), before);
    assert.deepEqual(fs.readdirSync(f.logDir), []);
    // changed after review: an admin gives the no-type product a type → plan differs
    await query("UPDATE products SET jewellery_type = 'RING' WHERE id = $1", [f.ids.noType]);
    await assert.rejects(apply(f, r), MigrationAbort);
  });

  test('reviewed decisions: a decided type is used; held and excluded products stay exactly as they are', async () => {
    const f = await fixture();
    const before = await snapshot(f.productIds);
    const decisions = {
      decisions: { [f.ids.conflicting]: { type: 'BANGLE', note: 'test decision' } },
      hold: { [f.ids.ring]: { note: 'test hold' } },
      exclude: { [f.ids.pendantDraft]: { note: 'test exclude' } },
    };
    const r = await dryRun({ productIds: f.productIds, decisions });
    assert.deepEqual(r.mapping.map((m) => [m.id, m.jewelleryType]), [[f.ids.conflicting, 'BANGLE']]);
    assert.equal(r.totals.onHold, 1);
    assert.ok(r.excluded.some((e) => e.id === f.ids.pendantDraft && /^excluded: test exclude/.test(e.reason)));
    await applyMigration({ expectSkus: r.totals.toMigrate, expectTypes: r.totals.typesToSet, logDir: f.logDir, stamp: randomUUID(), productIds: f.productIds, decisions });
    const after = Object.fromEntries((await snapshot(f.productIds)).products.map((x) => [x.id, x]));
    const prev = Object.fromEntries(before.products.map((x) => [x.id, x]));
    assert.match(after[f.ids.conflicting].sku, /^BD-BNG-\d{6}$/);
    assert.deepEqual(after[f.ids.ring], prev[f.ids.ring]); // held: no SKU, no type
    assert.deepEqual(after[f.ids.pendantDraft], prev[f.ids.pendantDraft]); // excluded
  });

  test('the decisions file is validated (unsupported type, decided-and-held conflict)', async () => {
    const { loadDecisions } = await import('../../scripts/migrateDraftSkus.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skudec-'));
    created.dirs.push(dir);
    const write = (o) => { const p = path.join(dir, `${randomUUID()}.json`); fs.writeFileSync(p, JSON.stringify(o)); return p; };
    assert.throws(() => loadDecisions(write({ decisions: { a: { type: 'TIARA' } } })), /unsupported type/);
    assert.throws(() => loadDecisions(write({ decisions: { a: { type: 'RING' } }, hold: { a: {} } })), /both decided and held/);
    // the approved file: Serenevia → BRACELET, Dolores + 52 Free Size Bangles
    // → BANGLE, nothing on hold, only payment-test-live excluded
    const real = loadDecisions();
    const byType = Object.values(real.decisions).reduce((a, d) => ({ ...a, [d.type]: (a[d.type] ?? 0) + 1 }), {});
    assert.deepEqual(byType, { BANGLE: 53, BRACELET: 1 });
    assert.equal(real.decisions['a1364c6d-1bad-4352-ae5c-f7773de44c20'].type, 'BRACELET');
    assert.deepEqual(Object.keys(real.hold), []);
    assert.deepEqual(Object.keys(real.exclude), ['945ffeb6-1f5e-4b24-8329-0af40fbeb368']);
  });

  test('a second run finds nothing left to do and changes nothing', async () => {
    const f = await fixture();
    const r = await dryRun({ productIds: f.productIds });
    await apply(f, r);
    const afterFirst = await snapshot(f.productIds);
    const r2 = await dryRun({ productIds: f.productIds });
    assert.deepEqual([r2.totals.toMigrate, r2.totals.typesToSet], [0, 0]);
    await assert.rejects(apply(f, r), MigrationAbort); // old reviewed counts no longer match
    await apply(f, r2); // restartable: applying the new (empty) plan is a no-op
    assert.deepEqual(await snapshot(f.productIds), afterFirst);
  });
});
