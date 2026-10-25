import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { query } from '../../src/config/db.js';
import { addItem, getCart, updateItemQuantity, removeItem, mergeCartsOnLogin } from '../../src/services/cartService.js';
import { createOrder } from '../../src/services/checkoutService.js';
import { insertProductImage } from '../../src/repositories/productImages.repository.js';
import { shippingProviders } from '../../src/providers/shipping/index.js';

// Integration tests (dev/test DB, migrations incl. 20261025000000 applied).
// One product sold as several real variants — Yellow/Rose, 9K/18K, size
// 6/8 — exactly the case the legacy cart_items_line_unique_idx rejected,
// plus a product that only has its default (no-options) variant.

const created = { products: [], users: [], carts: new Set() };
let ring; // { productId, v: { Y9K6, R9K6, Y18K6, Y9K8 } }
let plain; // { productId, defaultVariantId }

async function attrValue(productId, code, value, label = value) {
  const { rows } = await query(
    `INSERT INTO attribute_values (attribute_id, product_id, value, label) SELECT id, $1, $2, $3 FROM attributes WHERE code = $4 RETURNING id`,
    [productId, value, label, code],
  );
  return rows[0].id;
}

async function variant(productId, key, valueIds, { available = true } = {}) {
  const { rows } = await query(
    `INSERT INTO product_variants (product_id, sku, is_available, stock_quantity, combination_key, sort_order) VALUES ($1, $2, $3, 5, $4, 0) RETURNING id`,
    [productId, `CMV-${productId.slice(0, 6)}-${key}`, available, key],
  );
  for (const id of valueIds) await query('INSERT INTO variant_attribute_values (variant_id, attribute_value_id) VALUES ($1, $2)', [rows[0].id, id]);
  return rows[0].id;
}

async function photo(productId, sortOrder, goldColour, shotType, isPrimary) {
  for (const v of ['thumbnail', 'small', 'medium', 'large']) {
    for (const f of ['avif', 'webp']) {
      await insertProductImage({ productId, type: 'AI_GENERATED', variant: v, format: f, url: `https://test.local/${productId}/${sortOrder}-${v}.${f}`, isPrimary, sortOrder, goldColour, shotType });
    }
  }
}

async function product(label) {
  const { rows: cat } = await query('SELECT id FROM categories LIMIT 1');
  const id = randomUUID();
  await query(
    `INSERT INTO products (id, name, sku, category_id, metal_type, purity, gold_weight_grams, slug, status, gst_percent)
     VALUES ($1, $2, $3, $4, 'GOLD', '9K', 2, $5, 'PUBLISHED', 3)`,
    [id, `Cart Multi Variant ${label}`, `CMV-${id.slice(0, 8)}`, cat[0].id, `cart-mv-${label}-${id.slice(0, 8)}`],
  );
  created.products.push(id);
  return id;
}

const guest = () => ({ guestSessionId: randomUUID() });
async function track(owner) {
  const { rows } = await query(owner.userId ? 'SELECT id FROM carts WHERE user_id = $1' : 'SELECT id FROM carts WHERE guest_session_id = $1', [owner.userId ?? owner.guestSessionId]);
  for (const r of rows) created.carts.add(r.id);
}
async function newUser() {
  const id = randomUUID();
  await query('INSERT INTO users (id, mobile_number) VALUES ($1, $2)', [id, `7${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`]);
  created.users.push(id);
  return id;
}
const line = (cart, variantId) => cart.items.find((i) => i.variantId === variantId);
const small = (productId, sortOrder) => `https://test.local/${productId}/${sortOrder}-small.webp`;

// Checkout asks the courier whether the pincode is serviceable — stubbed so
// these tests don't depend on Delhivery's staging data.
let serviceabilityStub;

before(async () => {
  serviceabilityStub = mock.method(shippingProviders.delhivery, 'checkServiceability', async () => ({ serviceable: true }));
  const productId = await product('ring');
  const Y = await attrValue(productId, 'gold_color', 'YELLOW', 'Yellow Gold');
  const R = await attrValue(productId, 'gold_color', 'ROSE', 'Rose Gold');
  const k9 = await attrValue(productId, 'purity', '9K');
  const k18 = await attrValue(productId, 'purity', '18K');
  const s6 = await attrValue(productId, 'size', '6');
  const s8 = await attrValue(productId, 'size', '8');
  ring = {
    productId,
    v: {
      Y9K6: await variant(productId, 'y-9k-6', [Y, k9, s6]),
      R9K6: await variant(productId, 'r-9k-6', [R, k9, s6]),
      Y18K6: await variant(productId, 'y-18k-6', [Y, k18, s6]),
      Y9K8: await variant(productId, 'y-9k-8', [Y, k9, s8]),
      R18K8off: await variant(productId, 'r-18k-8', [R, k18, s8], { available: false }),
    },
  };
  await photo(productId, 0, 'YELLOW', 'FRONT', false);
  await photo(productId, 1, 'ROSE', 'FRONT', true); // featured = Rose (the Isolanza situation)
  await photo(productId, 2, 'ROSE', 'MODEL', false);

  const plainId = await product('plain');
  plain = { productId: plainId, defaultVariantId: await variant(plainId, '', []) };
});

after(async () => {
  serviceabilityStub.mock.restore();
  for (const userId of created.users) {
    for (const t of ['stock_reservations', 'order_status_history', 'order_items']) {
      await query(`DELETE FROM ${t} WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)`, [userId]).catch(() => {});
    }
    await query('DELETE FROM orders WHERE user_id = $1', [userId]).catch(() => {});
    await query('DELETE FROM addresses WHERE user_id = $1', [userId]).catch(() => {});
    await query('DELETE FROM carts WHERE user_id = $1', [userId]).catch(() => {});
  }
  for (const id of created.carts) await query('DELETE FROM carts WHERE id = $1', [id]).catch(() => {});
  for (const id of created.users) await query('DELETE FROM users WHERE id = $1', [id]).catch(() => {});
  for (const id of created.products) await query('DELETE FROM products WHERE id = $1', [id]).catch(() => {});
});

describe('schema', () => {
  test('legacy cart_items_line_unique_idx is gone; (cart_id, product_variant_id) uniqueness remains', async () => {
    const { rows } = await query("SELECT indexname FROM pg_indexes WHERE tablename = 'cart_items' ORDER BY 1");
    const names = rows.map((r) => r.indexname);
    assert.ok(!names.includes('cart_items_line_unique_idx'));
    assert.ok(names.includes('cart_items_variant_unique_idx'));
  });
});

describe('separate lines per variant', () => {
  test('1/14. Yellow and Rose of the same product coexist, each with its own FRONT photo', async () => {
    const o = guest();
    await addItem(o, { productId: ring.productId, variantId: ring.v.Y9K6, quantity: 1 });
    const cart = await addItem(o, { productId: ring.productId, variantId: ring.v.R9K6, quantity: 1 });
    await track(o);
    assert.equal(cart.items.length, 2);
    assert.equal(line(cart, ring.v.Y9K6).goldColor, 'YELLOW');
    assert.equal(line(cart, ring.v.Y9K6).primaryImageUrl, small(ring.productId, 0));
    assert.equal(line(cart, ring.v.R9K6).goldColor, 'ROSE');
    assert.equal(line(cart, ring.v.R9K6).primaryImageUrl, small(ring.productId, 1));
  });

  test('2. two sizes of the same product are separate lines', async () => {
    const o = guest();
    await addItem(o, { productId: ring.productId, variantId: ring.v.Y9K6, quantity: 1 });
    const cart = await addItem(o, { productId: ring.productId, variantId: ring.v.Y9K8, quantity: 1 });
    await track(o);
    assert.deepEqual(cart.items.map((i) => i.sizeLabel).sort(), ['6', '8']);
  });

  test('3. two purities of the same product are separate lines (each priced for its purity)', async () => {
    const o = guest();
    await addItem(o, { productId: ring.productId, variantId: ring.v.Y9K6, quantity: 1 });
    const cart = await addItem(o, { productId: ring.productId, variantId: ring.v.Y18K6, quantity: 1 });
    await track(o);
    assert.deepEqual(cart.items.map((i) => i.purity).sort(), ['18K', '9K']);
    assert.ok(line(cart, ring.v.Y18K6).sellingPrice > line(cart, ring.v.Y9K6).sellingPrice);
  });

  test('4. adding the identical variant again increases that line (no duplicate line)', async () => {
    const o = guest();
    await addItem(o, { productId: ring.productId, variantId: ring.v.R9K6, quantity: 1 });
    const cart = await addItem(o, { productId: ring.productId, variantId: ring.v.R9K6, quantity: 2 });
    await track(o);
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].quantity, 3);
  });

  test('5/6. updating or removing one variant leaves the other untouched', async () => {
    const o = guest();
    await addItem(o, { productId: ring.productId, variantId: ring.v.Y9K6, quantity: 1 });
    await addItem(o, { productId: ring.productId, variantId: ring.v.R9K6, quantity: 1 });
    await track(o);
    let cart = await updateItemQuantity(o, ring.v.Y9K6, 4);
    assert.equal(line(cart, ring.v.Y9K6).quantity, 4);
    assert.equal(line(cart, ring.v.R9K6).quantity, 1);
    cart = await removeItem(o, ring.v.Y9K6);
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].variantId, ring.v.R9K6);
    assert.equal(cart.items[0].primaryImageUrl, small(ring.productId, 1));
  });

  test('7. a guest cart holds several variants of one product', async () => {
    const o = guest();
    for (const v of [ring.v.Y9K6, ring.v.R9K6, ring.v.Y18K6, ring.v.Y9K8]) await addItem(o, { productId: ring.productId, variantId: v, quantity: 1 });
    await track(o);
    assert.equal((await getCart(o)).items.length, 4);
  });

  test('15. a product with only its default variant keeps the existing behaviour', async () => {
    const o = guest();
    await addItem(o, { productId: plain.productId, quantity: 1 });
    const cart = await addItem(o, { productId: plain.productId, quantity: 1 });
    await track(o);
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].variantId, plain.defaultVariantId);
    assert.equal(cart.items[0].quantity, 2);
  });
});

describe('merge on login', () => {
  test('8. identical variant merges, different variant stays separate, nothing lost', async () => {
    const userId = await newUser();
    await addItem({ userId }, { productId: ring.productId, variantId: ring.v.Y9K6, quantity: 1 });
    const g = guest();
    await addItem(g, { productId: ring.productId, variantId: ring.v.Y9K6, quantity: 2 });
    await addItem(g, { productId: ring.productId, variantId: ring.v.R9K6, quantity: 1 });
    await track(g);
    await mergeCartsOnLogin(g.guestSessionId, userId);
    const cart = await getCart({ userId });
    assert.equal(cart.items.length, 2);
    assert.equal(line(cart, ring.v.Y9K6).quantity, 3);
    assert.equal(line(cart, ring.v.R9K6).quantity, 1);
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM carts WHERE guest_session_id = $1', [g.guestSessionId]);
    assert.equal(rows[0].n, 0); // guest cart folded in and removed
  });
});

describe('concurrency', () => {
  test('9. concurrent identical adds (new guest, no cart yet) → one cart, one line, all quantity counted', async () => {
    const o = guest();
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => addItem(o, { productId: ring.productId, variantId: ring.v.Y9K6, quantity: 1 })));
    await track(o);
    assert.deepEqual(results.filter((r) => r.status === 'rejected').map((r) => r.reason.message), []);
    const cart = await getCart(o);
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].quantity, 6);
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM carts WHERE guest_session_id = $1', [o.guestSessionId]);
    assert.equal(rows[0].n, 1);
  });

  test('10. concurrent different-variant adds → one line per variant', async () => {
    const o = guest();
    const vs = [ring.v.Y9K6, ring.v.R9K6, ring.v.Y18K6, ring.v.Y9K8];
    const results = await Promise.allSettled(vs.map((v) => addItem(o, { productId: ring.productId, variantId: v, quantity: 1 })));
    await track(o);
    assert.deepEqual(results.filter((r) => r.status === 'rejected').map((r) => r.reason.message), []);
    const cart = await getCart(o);
    assert.deepEqual(cart.items.map((i) => i.variantId).sort(), [...vs].sort());
  });
});

describe('validation unchanged', () => {
  test('11. unavailable variant rejected; per-line quantity cap applies to each variant separately', async () => {
    const o = guest();
    await assert.rejects(addItem(o, { productId: ring.productId, variantId: ring.v.R18K8off, quantity: 1 }), (e) => e.status === 409);
    await assert.rejects(addItem(o, { productId: ring.productId, variantId: plain.defaultVariantId, quantity: 1 }), (e) => e.status === 400);
    await addItem(o, { productId: ring.productId, variantId: ring.v.Y9K6, quantity: 15 });
    const cart = await addItem(o, { productId: ring.productId, variantId: ring.v.Y9K6, quantity: 15 });
    await addItem(o, { productId: ring.productId, variantId: ring.v.R9K6, quantity: 2 });
    await track(o);
    assert.equal(line(cart, ring.v.Y9K6).quantity, 20); // existing MAX_LINE_QUANTITY cap
    assert.equal(line(await getCart(o), ring.v.R9K6).quantity, 2);
  });
});

describe('checkout keeps every line', () => {
  test('12/13/14. Yellow + Rose lines → two order items with their own attributes, images and reservations', async () => {
    const userId = await newUser();
    const { rows: addr } = await query(
      `INSERT INTO addresses (user_id, name, mobile_number, address_line, city, state, pincode) VALUES ($1, 'T', '9999999999', '1 St', 'Kochi', 'Kerala', '682001') RETURNING id`,
      [userId],
    );
    const order = await createOrder({
      userId,
      contact: { name: 'T', mobile: '9999999999', email: 't@example.com' },
      addressId: addr[0].id,
      items: [
        { productId: ring.productId, variantId: ring.v.Y9K6, quantity: 1 },
        { productId: ring.productId, variantId: ring.v.R9K6, quantity: 2 },
      ],
    });
    const { rows: items } = await query('SELECT product_variant_id, quantity, variant_attributes_snapshot, image_url FROM order_items WHERE order_id = $1', [order.id]);
    assert.equal(items.length, 2);
    const byVariant = Object.fromEntries(items.map((i) => [i.product_variant_id, i]));
    const colourOf = (i) => i.variant_attributes_snapshot.find((a) => a.attributeCode === 'gold_color').label;
    assert.equal(colourOf(byVariant[ring.v.Y9K6]), 'YELLOW');
    assert.equal(colourOf(byVariant[ring.v.R9K6]), 'ROSE');
    assert.equal(byVariant[ring.v.R9K6].quantity, 2);
    assert.equal(byVariant[ring.v.Y9K6].image_url, small(ring.productId, 0));
    assert.equal(byVariant[ring.v.R9K6].image_url, small(ring.productId, 1));
    const { rows: res } = await query('SELECT product_variant_id, quantity FROM stock_reservations WHERE order_id = $1 ORDER BY quantity', [order.id]);
    assert.deepEqual(res.map((r) => [r.product_variant_id, r.quantity]), [[ring.v.Y9K6, 1], [ring.v.R9K6, 2]]);
  });
});
