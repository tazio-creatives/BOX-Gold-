import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../../src/config/db.js';
import { storageProvider } from '../../src/providers/storage/index.js';
import { getCart } from '../../src/services/cartService.js';
import { createOrder } from '../../src/services/checkoutService.js';
import { findOrderItems, findOrderListExtras } from '../../src/repositories/orders.repository.js';
import { insertProductImageTx } from '../../src/repositories/aiStudio.repository.js';
import { imageLabelsForAssetType } from '../../src/services/aiStudioService.js';
import {
  insertProductImage,
  updateImageGroupLabels,
  findOfferedGoldColours,
} from '../../src/repositories/productImages.repository.js';
import { uploadOriginal, attachExisting, remove } from '../../src/controllers/productImages.controller.js';
import { addItem } from '../../src/services/cartService.js';

// Integration tests against a dev/test DB with migrations applied (incl.
// 20261024000000_product_image_gold_colour). Fixture mirrors the Isolanza
// case: sold in Yellow and Rose, featured photo is the ROSE front.

const VARIANTS = ['thumbnail', 'small', 'medium', 'large'];
const created = { products: [], users: [], carts: [] };

async function insertPhoto(productId, sortOrder, { goldColour, shotType, isPrimary = false, type = 'AI_GENERATED' } = {}) {
  const urls = [];
  for (const variant of VARIANTS) {
    for (const format of ['avif', 'webp']) {
      const url = `https://test.local/${productId}/${sortOrder}-${variant}.${format}`;
      await insertProductImage({ productId, type, variant, format, url, isPrimary, sortOrder, goldColour, shotType });
      urls.push(url);
    }
  }
  const url = `https://test.local/${productId}/${sortOrder}-original.jpeg`;
  await insertProductImage({ productId, type, variant: 'original', format: 'jpeg', url, isPrimary, sortOrder, goldColour, shotType });
  urls.push(url);
  return urls;
}

async function createProduct(label, colours) {
  const { rows: cat } = await query('SELECT id FROM categories LIMIT 1');
  const productId = randomUUID();
  await query(
    `INSERT INTO products (id, name, sku, category_id, metal_type, purity, gold_weight_grams, slug, status, gst_percent)
     VALUES ($1, $2, $3, $4, 'GOLD', '9K', 2, $5, 'PUBLISHED', 3)`,
    [productId, `Gold Colour Test ${label}`, `TEST-GC-${productId.slice(0, 8)}`, cat[0].id, `test-gold-colour-${label}-${productId.slice(0, 8)}`],
  );
  created.products.push(productId);
  const variants = {};
  for (const colour of colours) {
    const { rows: av } = await query(
      `INSERT INTO attribute_values (attribute_id, product_id, value, label)
       SELECT id, $1, $2, $3 FROM attributes WHERE code = 'gold_color' RETURNING id`,
      [productId, colour, `${colour} Gold`],
    );
    const { rows: pv } = await query(
      `INSERT INTO product_variants (product_id, sku, is_available, stock_quantity, combination_key, sort_order)
       VALUES ($1, $2, true, 5, $3, 0) RETURNING id`,
      [productId, `TEST-GC-${productId.slice(0, 8)}-${colour}`, colour.toLowerCase()],
    );
    await query('INSERT INTO variant_attribute_values (variant_id, attribute_value_id) VALUES ($1, $2)', [pv[0].id, av[0].id]);
    variants[colour] = pv[0].id;
  }
  return { productId, variants };
}

const res = () => ({ statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } });
async function callController(handler, req) {
  const r = res();
  let error = null;
  await handler(req, r, (err) => { error = err; });
  return { res: r, error };
}

let isolanza;

before(async () => {
  isolanza = await createProduct('isolanza', ['YELLOW', 'ROSE']);
  await insertPhoto(isolanza.productId, 0, { goldColour: 'YELLOW', shotType: 'FRONT' });
  await insertPhoto(isolanza.productId, 1, { goldColour: 'YELLOW', shotType: 'SIDE' });
  await insertPhoto(isolanza.productId, 2, { goldColour: 'ROSE', shotType: 'FRONT', isPrimary: true });
  await insertPhoto(isolanza.productId, 3, { goldColour: 'ROSE', shotType: 'MODEL' });
});

after(async () => {
  // Orders/carts/users first (FKs), then products (cascades images/variants).
  for (const userId of created.users) {
    await query('DELETE FROM stock_reservations WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)', [userId]).catch(() => {});
    await query('DELETE FROM order_status_history WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)', [userId]).catch(() => {});
    await query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)', [userId]).catch(() => {});
    await query('DELETE FROM orders WHERE user_id = $1', [userId]).catch(() => {});
    await query('DELETE FROM addresses WHERE user_id = $1', [userId]).catch(() => {});
  }
  for (const cartId of created.carts) await query('DELETE FROM carts WHERE id = $1', [cartId]).catch(() => {});
  for (const userId of created.users) await query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
  for (const productId of created.products) await query('DELETE FROM products WHERE id = $1', [productId]).catch(() => {});
});

describe('labels are stored per photo (all 9 rows)', () => {
  test('defaults are ANY/OTHER when a writer passes nothing', async () => {
    const p = await createProduct('defaults', ['YELLOW']);
    await insertProductImage({ productId: p.productId, type: 'ORIGINAL', variant: 'small', format: 'webp', url: `https://test.local/${p.productId}/x.webp`, sortOrder: 0 });
    const { rows } = await query('SELECT gold_colour, shot_type FROM product_images WHERE product_id = $1', [p.productId]);
    assert.deepEqual(rows[0], { gold_colour: 'ANY', shot_type: 'OTHER' });
  });

  test('the database rejects unknown labels', async () => {
    await assert.rejects(
      insertProductImage({ productId: isolanza.productId, type: 'ORIGINAL', variant: 'small', format: 'webp', url: 'https://test.local/bad.webp', sortOrder: 99, goldColour: 'GREEN' }),
      /product_images_gold_colour_check/,
    );
  });

  test('AI Studio import path writes the asset-type labels on every row', async () => {
    const p = await createProduct('ai-import', ['YELLOW', 'ROSE']);
    const labels = imageLabelsForAssetType('RING_ROSE_SIDE', true);
    await withTransaction(async (client) => {
      for (const variant of VARIANTS) {
        for (const format of ['avif', 'webp']) {
          await insertProductImageTx(client, { productId: p.productId, type: 'AI_GENERATED', variant, format, url: `https://test.local/${p.productId}/0-${variant}.${format}`, sortOrder: 0, ...labels });
        }
      }
      await insertProductImageTx(client, { productId: p.productId, type: 'AI_GENERATED', variant: 'original', format: 'jpeg', url: `https://test.local/${p.productId}/0-original.jpeg`, sortOrder: 0, ...labels });
    });
    const { rows } = await query('SELECT DISTINCT gold_colour, shot_type, COUNT(*) OVER () AS n FROM product_images WHERE product_id = $1', [p.productId]);
    assert.equal(rows.length, 1);
    assert.deepEqual({ ...rows[0], n: Number(rows[0].n) }, { gold_colour: 'ROSE', shot_type: 'SIDE', n: 9 });
  });

  test('relabelling updates all 9 rows of one photo only', async () => {
    const p = await createProduct('relabel', ['YELLOW', 'ROSE']);
    await insertPhoto(p.productId, 0, {});
    await insertPhoto(p.productId, 1, {});
    assert.equal(await updateImageGroupLabels(p.productId, 0, { goldColour: 'ROSE', shotType: 'ANGLE' }), 9);
    const { rows } = await query('SELECT sort_order, gold_colour, shot_type, COUNT(*)::int n FROM product_images WHERE product_id = $1 GROUP BY 1,2,3 ORDER BY 1', [p.productId]);
    assert.deepEqual(rows, [
      { sort_order: 0, gold_colour: 'ROSE', shot_type: 'ANGLE', n: 9 },
      { sort_order: 1, gold_colour: 'ANY', shot_type: 'OTHER', n: 9 },
    ]);
  });

  test('offered colours come from available variants', async () => {
    assert.deepEqual(await findOfferedGoldColours(isolanza.productId), ['ROSE', 'YELLOW']);
  });
});

describe('cart shows the photo for the chosen colour', () => {
  // One cart per colour: the pre-existing cart_items_line_unique_idx (legacy
  // columns, always NULL) rejects two variants of one product in one cart —
  // unrelated to this feature, left unchanged.
  async function cartWith(variantId) {
    const owner = { guestSessionId: randomUUID() };
    const cart = await addItem(owner, { productId: isolanza.productId, variantId, quantity: 1 });
    const { rows } = await query('SELECT id FROM carts WHERE guest_session_id = $1', [owner.guestSessionId]);
    created.carts.push(rows[0].id);
    return cart;
  }

  test('Yellow line → Yellow front; Rose line → Rose front (featured)', async () => {
    const yellow = await cartWith(isolanza.variants.YELLOW);
    const rose = await cartWith(isolanza.variants.ROSE);
    assert.equal(yellow.items[0].goldColor, 'YELLOW');
    assert.equal(yellow.items[0].primaryImageUrl, `https://test.local/${isolanza.productId}/0-small.webp`);
    assert.equal(rose.items[0].goldColor, 'ROSE');
    assert.equal(rose.items[0].primaryImageUrl, `https://test.local/${isolanza.productId}/2-small.webp`);
    // Prices are untouched by this feature.
    assert.ok(yellow.items[0].sellingPrice > 0 && rose.items[0].sellingPrice > 0);
  });

  test('unlabelled product keeps showing its featured photo (today’s behaviour)', async () => {
    const p = await createProduct('unlabelled', ['YELLOW', 'ROSE']);
    await insertPhoto(p.productId, 0, {});
    await insertPhoto(p.productId, 1, { isPrimary: true });
    const owner = { guestSessionId: randomUUID() };
    const cart = await addItem(owner, { productId: p.productId, variantId: p.variants.YELLOW, quantity: 1 });
    const { rows } = await query('SELECT id FROM carts WHERE guest_session_id = $1', [owner.guestSessionId]);
    created.carts.push(rows[0].id);
    assert.equal(cart.items[0].primaryImageUrl, `https://test.local/${p.productId}/1-small.webp`);
    assert.deepEqual(await getCart(owner), cart);
  });
});

describe('checkout snapshot, order pages and delete protection', () => {
  let orderId;

  test('checkout stores small + large WebP of the ordered colour', async () => {
    const userId = randomUUID();
    await query('INSERT INTO users (id, mobile_number, full_name) VALUES ($1, $2, $3)', [userId, `9${Date.now().toString().slice(-9)}`, 'Gold Colour Test']);
    created.users.push(userId);
    const { rows: addr } = await query(
      `INSERT INTO addresses (user_id, name, mobile_number, address_line, city, state, pincode)
       VALUES ($1, 'Test', '9999999999', '1 Test St', 'Kochi', 'Kerala', '682001') RETURNING id`,
      [userId],
    );
    const order = await createOrder({
      userId,
      contact: { name: 'Test', mobile: '9999999999', email: 'test@example.com' },
      addressId: addr[0].id,
      items: [{ productId: isolanza.productId, variantId: isolanza.variants.YELLOW, quantity: 1 }],
    });
    orderId = order.id;
    const { rows } = await query('SELECT image_url, image_large_url FROM order_items WHERE order_id = $1', [orderId]);
    assert.deepEqual(rows[0], {
      image_url: `https://test.local/${isolanza.productId}/0-small.webp`,
      image_large_url: `https://test.local/${isolanza.productId}/0-large.webp`,
    });
  });

  test('order detail and order list use the snapshot, even after the gallery changes', async () => {
    await updateImageGroupLabels(isolanza.productId, 0, { goldColour: 'ROSE', shotType: 'FRONT' });
    const [item] = await findOrderItems(orderId);
    assert.equal(item.product_image_url, `https://test.local/${isolanza.productId}/0-small.webp`);
    assert.equal(item.product_image_large_url, `https://test.local/${isolanza.productId}/0-large.webp`);
    const { previews } = await findOrderListExtras([orderId]);
    assert.equal(previews.get(orderId).imageUrl, `https://test.local/${isolanza.productId}/0-small.webp`);
    await updateImageGroupLabels(isolanza.productId, 0, { goldColour: 'YELLOW', shotType: 'FRONT' });
  });

  test('orders without a snapshot still fall back to the live featured photo', async () => {
    await query('UPDATE order_items SET image_url = NULL, image_large_url = NULL WHERE order_id = $1', [orderId]);
    const [item] = await findOrderItems(orderId);
    assert.match(item.product_image_url, new RegExp(`/${isolanza.productId}/2-small\\.(webp|avif)$`));
    await query('UPDATE order_items SET image_url = $2, image_large_url = $3 WHERE order_id = $1', [
      orderId,
      `https://test.local/${isolanza.productId}/0-small.webp`,
      `https://test.local/${isolanza.productId}/0-large.webp`,
    ]);
  });

  test('deleting a photo keeps the files an order still shows', async () => {
    const deletedKeys = [];
    const originalDelete = storageProvider.delete;
    storageProvider.delete = async (key) => { deletedKeys.push(key); };
    try {
      const { res: r, error } = await callController(remove, { params: { id: isolanza.productId, sortOrder: '0' } });
      assert.equal(error, null);
      assert.equal(r.statusCode, 204);
    } finally {
      storageProvider.delete = originalDelete;
    }
    assert.equal(deletedKeys.length, 7);
    assert.ok(!deletedKeys.some((k) => k.endsWith('0-small.webp') || k.endsWith('0-large.webp')));
    const { rows } = await query('SELECT COUNT(*)::int n FROM product_images WHERE product_id = $1 AND sort_order = 0', [isolanza.productId]);
    assert.equal(rows[0].n, 0); // gallery rows are still removed as before
  });
});

describe('manual photos on multi-colour products need a colour', () => {
  test('upload without a colour is refused before anything is stored', async () => {
    const p = await createProduct('upload', ['YELLOW', 'ROSE']);
    const { error } = await callController(uploadOriginal, { params: { id: p.productId }, file: { buffer: Buffer.from('not used') }, body: {} });
    assert.equal(error?.status, 400);
    assert.match(error.message, /gold colour/);
    const { rows } = await query('SELECT COUNT(*)::int n FROM product_images WHERE product_id = $1', [p.productId]);
    assert.equal(rows[0].n, 0);
  });

  test('single-colour products still upload in one step (no colour asked)', async () => {
    const p = await createProduct('single', ['YELLOW']);
    // Stops at image processing (invalid buffer) — i.e. it got past the colour check.
    const { error } = await callController(uploadOriginal, { params: { id: p.productId }, file: { buffer: Buffer.from('not an image') }, body: {} });
    assert.notEqual(error?.status, 400);
  });

  test('attach: unlabelled source needs a colour; chosen labels go on all 9 rows', async () => {
    const source = await createProduct('attach-source', ['YELLOW']);
    await insertPhoto(source.productId, 0, {});
    const target = await createProduct('attach-target', ['YELLOW', 'ROSE']);
    const body = { sourceProductId: source.productId, sourceSortOrder: 0 };

    const refused = await callController(attachExisting, { params: { id: target.productId }, body });
    assert.equal(refused.error?.status, 400);

    const ok = await callController(attachExisting, { params: { id: target.productId }, body: { ...body, goldColour: 'ROSE', shotType: 'FRONT' } });
    assert.equal(ok.error, null);
    const { rows } = await query('SELECT gold_colour, shot_type, COUNT(*)::int n FROM product_images WHERE product_id = $1 GROUP BY 1,2', [target.productId]);
    assert.deepEqual(rows, [{ gold_colour: 'ROSE', shot_type: 'FRONT', n: 9 }]);
  });

  test('attach: a labelled source carries its labels over', async () => {
    const source = await createProduct('attach-labelled', ['YELLOW', 'ROSE']);
    await insertPhoto(source.productId, 0, { goldColour: 'YELLOW', shotType: 'ANGLE' });
    const target = await createProduct('attach-labelled-target', ['YELLOW', 'ROSE']);
    const { error } = await callController(attachExisting, { params: { id: target.productId }, body: { sourceProductId: source.productId, sourceSortOrder: 0 } });
    assert.equal(error, null);
    const { rows } = await query('SELECT DISTINCT gold_colour, shot_type FROM product_images WHERE product_id = $1', [target.productId]);
    assert.deepEqual(rows, [{ gold_colour: 'YELLOW', shot_type: 'ANGLE' }]);
  });
});
