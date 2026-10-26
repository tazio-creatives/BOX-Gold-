import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { query } from '../../src/config/db.js';
import { addItem, getCart } from '../../src/services/cartService.js';
import { createOrder } from '../../src/services/checkoutService.js';
import { computeVariantPricing } from '../../src/services/pricingService.js';
import { checkoutSchema } from '../../src/validators/checkout.validators.js';
import { findVariantsByProductId } from '../../src/repositories/productVariants.repository.js';
import { shippingProviders } from '../../src/providers/shipping/index.js';
import { UNPURCHASABLE_MESSAGE } from '../../src/services/purchasePriceGuard.js';

// A product line whose final selling price isn't above ₹0 can't be carted
// or ordered — alone, next to paid lines, via Buy Now or a direct request.

const created = { products: [], users: [] };
let paid; // { productId, variantId } — a normal, positively priced product
let discounted; // positive price after a product offer
let zero; // no pricing inputs at all -> ₹0

// A purity-variant product, priced live by the engine like a real catalogue
// item (gold weight x the 9K rate, plus making charge).
async function pricedProduct(label, columns) {
  const p = await productWithDefaultVariant(label, columns, { withVariant: false });
  const { rows: av } = await query(
    `INSERT INTO attribute_values (attribute_id, product_id, value, label) SELECT id, $1, '9K', '9K' FROM attributes WHERE code = 'purity' RETURNING id`,
    [p.productId],
  );
  const { rows } = await query(
    `INSERT INTO product_variants (product_id, sku, is_available, stock_quantity, combination_key, sort_order) VALUES ($1, $2, true, 5, $3, 0) RETURNING id`,
    [p.productId, `ZG-${p.productId.slice(0, 6)}-9k`, av[0].id],
  );
  await query('INSERT INTO variant_attribute_values (variant_id, attribute_value_id) VALUES ($1, $2)', [rows[0].id, av[0].id]);
  return { productId: p.productId, variantId: rows[0].id };
}

async function productWithDefaultVariant(label, columns, { withVariant = true } = {}) {
  const { rows: cat } = await query('SELECT id FROM categories LIMIT 1');
  const id = randomUUID();
  const names = ['id', 'name', 'sku', 'category_id', 'metal_type', 'slug', 'status', 'gst_percent', ...Object.keys(columns)];
  const values = [id, `Zero Guard ${label}`, `ZG-${id.slice(0, 8)}`, cat[0].id, 'GOLD', `zero-guard-${label}-${id.slice(0, 8)}`, 'PUBLISHED', 3, ...Object.values(columns)];
  await query(`INSERT INTO products (${names.join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})`, values);
  created.products.push(id);
  if (!withVariant) return { productId: id, variantId: null };
  const { rows } = await query(
    `INSERT INTO product_variants (product_id, sku, is_available, stock_quantity, combination_key, sort_order) VALUES ($1, $2, true, 5, '', 0) RETURNING id`,
    [id, `ZG-${id.slice(0, 6)}`],
  );
  return { productId: id, variantId: rows[0].id };
}

async function newUser() {
  const id = randomUUID();
  await query('INSERT INTO users (id, mobile_number) VALUES ($1, $2)', [id, `4${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`]);
  created.users.push(id);
  const { rows } = await query(
    `INSERT INTO addresses (user_id, name, mobile_number, address_line, city, state, pincode) VALUES ($1, 'T', '9999999999', '1 St', 'Kochi', 'Kerala', '682001') RETURNING id`,
    [id],
  );
  return { userId: id, addressId: rows[0].id };
}

const contact = { name: 'T', mobile: '9999999999', email: 't@example.com' };
const line = (p) => ({ productId: p.productId, variantId: p.variantId, quantity: 1 });
const ordersOf = async (userId) => (await query('SELECT count(*)::int AS n FROM orders WHERE user_id = $1', [userId])).rows[0].n;
const reservationsOf = async (variantId) =>
  (await query('SELECT count(*)::int AS n FROM stock_reservations WHERE product_variant_id = $1', [variantId])).rows[0].n;
const isUnpurchasable = (err) => err.status === 409 && /temporarily unavailable for purchase/.test(err.message);

let serviceabilityStub;
before(async () => {
  serviceabilityStub = mock.method(shippingProviders.delhivery, 'checkServiceability', async () => ({ serviceable: true }));
  paid = await pricedProduct('paid', { purity: '9K', gold_weight_grams: 2, making_charge_percent: 10 });
  discounted = await pricedProduct('discounted', {
    purity: '9K',
    gold_weight_grams: 2,
    making_charge_percent: 10,
    making_charge_discount_percent: 100,
  });
  zero = await productWithDefaultVariant('zero', {});
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
    await query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
  }
  for (const id of created.products) await query('DELETE FROM products WHERE id = $1', [id]).catch(() => {});
});

describe('fixtures', () => {
  test('the zero product really prices at ₹0 and the others above it', async () => {
    const priceOf = async (p) => {
      const { rows } = await query('SELECT * FROM products WHERE id = $1', [p.productId]);
      const variant = (await findVariantsByProductId(p.productId)).find((v) => v.id === p.variantId);
      return (await computeVariantPricing(rows[0], variant.combination_key === '' ? null : variant)).sellingPrice;
    };
    assert.equal(await priceOf(zero), 0);
    assert.ok((await priceOf(paid)) > 0);
    assert.ok((await priceOf(discounted)) > 0);
  });
});

describe('add to cart', () => {
  test('a ₹0 product is refused with the customer message, and no cart is created', async () => {
    const { userId } = await newUser();
    await assert.rejects(addItem({ userId }, line(zero)), (err) => isUnpurchasable(err) && err.message === UNPURCHASABLE_MESSAGE);
    const { rows } = await query('SELECT count(*)::int AS n FROM carts WHERE user_id = $1', [userId]);
    assert.equal(rows[0].n, 0);
  });

  test('paid and discounted (positive) products are still accepted and marked purchasable', async () => {
    const { userId } = await newUser();
    await addItem({ userId }, line(paid));
    const cart = await addItem({ userId }, line(discounted));
    assert.equal(cart.items.length, 2);
    assert.ok(cart.items.every((i) => i.sellingPrice > 0 && i.isPurchasable === true));
  });
});

describe('checkout', () => {
  test('₹0 product alone (cart or Buy Now): refused, no order, no reservation', async () => {
    const { userId, addressId } = await newUser();
    await assert.rejects(createOrder({ userId, contact, addressId, items: [line(zero)] }), isUnpurchasable);
    assert.equal(await ordersOf(userId), 0);
    assert.equal(await reservationsOf(zero.variantId), 0);
  });

  test('₹0 product next to a paid one: the whole order is refused, nothing reserved', async () => {
    const { userId, addressId } = await newUser();
    const before = await reservationsOf(paid.variantId);
    await assert.rejects(createOrder({ userId, contact, addressId, items: [line(paid), line(zero)] }), (err) =>
      /Zero Guard zero is temporarily unavailable for purchase/.test(err.message),
    );
    assert.equal(await ordersOf(userId), 0);
    assert.equal(await reservationsOf(paid.variantId), before);
  });

  test('an existing cart holding a ₹0 line shows it as not purchasable, and checkout refuses it', async () => {
    const { userId, addressId } = await newUser();
    await addItem({ userId }, line(paid));
    // a line that got in before the guard existed
    const { rows: [cart] } = await query('SELECT id FROM carts WHERE user_id = $1', [userId]);
    await query('INSERT INTO cart_items (cart_id, product_id, product_variant_id, quantity) VALUES ($1, $2, $3, 1)', [
      cart.id,
      zero.productId,
      zero.variantId,
    ]);
    const shown = await getCart({ userId });
    assert.deepEqual(
      shown.items.map((i) => [i.productId === zero.productId, i.isPurchasable]).sort(),
      [[false, true], [true, false]],
    );
    const items = shown.items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity }));
    await assert.rejects(createOrder({ userId, contact, addressId, items }), isUnpurchasable);
    assert.equal(await ordersOf(userId), 0);
  });

  test('a payload claiming a price is ignored: prices are always computed server-side', async () => {
    const { userId, addressId } = await newUser();
    const parsed = checkoutSchema.parse({
      addressId,
      contact,
      items: [{ ...line(zero), unitPrice: 999, sellingPrice: 999 }],
    });
    assert.equal('unitPrice' in parsed.items[0], false);
    await assert.rejects(createOrder({ userId, ...parsed }), isUnpurchasable);
    // and a paid product can't be made free by claiming ₹0
    const paidParsed = checkoutSchema.parse({ addressId, contact, items: [{ ...line(paid), unitPrice: 0, lineTotal: 0 }] });
    const order = await createOrder({ userId, ...paidParsed });
    assert.ok(Number(order.total_amount) > 0);
  });

  test('normal and discounted (positive) orders still go through at their engine price', async () => {
    const { userId, addressId } = await newUser();
    const order = await createOrder({ userId, contact, addressId, items: [line(paid), line(discounted)] });
    const { rows } = await query('SELECT unit_price FROM order_items WHERE order_id = $1', [order.id]);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => Number(r.unit_price) > 0));
  });
});
