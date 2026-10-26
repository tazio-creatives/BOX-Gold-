import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { query } from '../../src/config/db.js';
import { search, parseSearchTerm, normaliseSearchText, stemSearchWord } from '../../src/services/searchService.js';
import { searchQuerySchema } from '../../src/validators/search.validators.js';

// Customer product search: normalisation, ranking, paging, exclusions.
// Fixture names use made-up words (zentrix, qwvx, …) so other data in the
// test DB can't interfere with counts.

const created = { products: [], categories: [] };
const ids = {};

async function category(name) {
  const { rows } = await query(
    `INSERT INTO categories (name, slug, is_active) VALUES ($1, $2, true) RETURNING id`,
    [name, `${name.toLowerCase()}-${randomUUID().slice(0, 6)}`],
  );
  created.categories.push(rows[0].id);
  return rows[0].id;
}

async function product(key, name, { sku, categoryId = null, jewelleryType = null, status = 'PUBLISHED', price = 1000, legacySku = null, ageDays = 0 } = {}) {
  const id = randomUUID();
  await query(
    `INSERT INTO products (id, name, sku, legacy_sku, category_id, jewellery_type, metal_type, slug, status, selling_price, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'GOLD', $7, $8, $9, now() - make_interval(days => $10))`,
    [id, name, sku ?? `ZS-${id.slice(0, 8)}`, legacySku, categoryId, jewelleryType, `zs-${key}-${id.slice(0, 8)}`, status, price, ageDays],
  );
  created.products.push(id);
  ids[key] = id;
  return id;
}

const slugsOf = (r) => r.products.map((p) => p.id);
const positionOf = (r, key) => slugsOf(r).indexOf(ids[key]);

before(async () => {
  const gents = await category('Zqgents');
  await product('axel', 'Axel  Gents Diamond Ring', { sku: 'BD-RNG-992139', legacySku: 'DRAFT-1999539772817', categoryId: gents, jewelleryType: 'RING', ageDays: 30 });
  // 12 newer "… Gents Diamond Ring" products — more than one dropdown page
  for (let i = 1; i <= 12; i += 1) {
    await product(`zentrix${i}`, `Zentrix${i} Gents Diamond Ring`, { categoryId: gents, jewelleryType: 'RING', ageDays: i });
  }
  await product('triple', 'Bellezzq   Necklace', { jewelleryType: 'NECKLACE' });
  await product('bloom', 'Qwvx Bloom', { jewelleryType: 'BANGLE' });
  await product('incat', 'Plain Name Qkzy', { categoryId: await category('Zqtestcat') });
  await product('draft', 'Zentrix Draft Gents Diamond Ring', { status: 'DRAFT' });
  await product('zero', 'Zentrix Zero Gents Diamond Ring', { price: 0 });
  // ranking fixtures for one term ("qrank")
  await product('rankExact', 'Qrank', { ageDays: 50 });
  await product('rankSku', 'Something Else', { sku: 'QRANK', ageDays: 49 });
  await product('rankStarts', 'Qrank Diamond Studs', { ageDays: 48 });
  await product('rankWords', 'Diamond Qrank Studs', { ageDays: 47 });
  await product('rankCat', 'Unrelated Piece', { categoryId: await category('Qrank'), ageDays: 46 });
  await product('rankPartial', 'Xqrankx Pendant', { ageDays: 1 });
});

after(async () => {
  for (const id of created.products) await query('DELETE FROM products WHERE id = $1', [id]).catch(() => {});
  for (const id of created.categories) await query('DELETE FROM categories WHERE id = $1', [id]).catch(() => {});
});

describe('normalisation', () => {
  test('case, repeated spaces and punctuation are ignored; plurals stem', () => {
    assert.equal(normaliseSearchText('  AXEL   Gents—Diamond  Ring '), 'axel gents diamond ring');
    assert.equal(normaliseSearchText('BD-RNG-002139'), 'bd rng 002139');
    assert.deepEqual(['rings', 'earrings', 'bangles', 'necklaces', 'ring', 'glass'].map(stemSearchWord), ['ring', 'earring', 'bangl', 'necklac', 'ring', 'glass']);
    assert.deepEqual(parseSearchTerm('a b c d e f g h i j').words.length, 8);
  });

  test('query validation bounds length and paging', () => {
    assert.throws(() => searchQuerySchema.parse({ q: 'x'.repeat(101) }));
    assert.throws(() => searchQuerySchema.parse({ q: 'ring', limit: 500 }));
    assert.throws(() => searchQuerySchema.parse({ q: 'ring', page: 0 }));
    assert.deepEqual(searchQuerySchema.parse({ q: ' ring ' }), { q: 'ring', page: 1, limit: 8 });
  });
});

describe('Axel Gents Diamond Ring (name stored with a double space)', () => {
  for (const term of ['Axel', 'axel gents', 'Axel Gents Diamond Ring', 'AXEL   GENTS', 'BD-RNG-992139', 'bd rng 992139']) {
    test(`"${term}" finds it first`, async () => {
      const r = await search(term, { limit: 8 });
      assert.equal(positionOf(r, 'axel'), 0, JSON.stringify(slugsOf(r)));
    });
  }

  test('"Gents Diamond Ring": all 13 counted; the oldest one is on page 2 of 8-per-page results', async () => {
    const term = 'Zqgents Gents Diamond Ring';
    const first = await search(term, { limit: 8 });
    assert.equal(first.total, 13);
    assert.equal(first.products.length, 8);
    const second = await search(term, { page: 2, limit: 8 });
    assert.equal(second.products.length, 5);
    assert.ok(slugsOf(second).includes(ids.axel));
  });

  test('the legacy DRAFT code is not searchable on the storefront', async () => {
    const r = await search('DRAFT-1999539772817');
    assert.equal(positionOf(r, 'axel'), -1);
  });
});

describe('matching', () => {
  test('triple-spaced names match single-spaced queries', async () => {
    assert.equal(positionOf(await search('Bellezzq Necklace'), 'triple'), 0);
  });

  test('category name finds products in that category', async () => {
    const r = await search('zqtestcat');
    assert.ok(positionOf(r, 'incat') >= 0);
  });

  test('jewellery type with plural/singular: "qwvx bangles" and "qwvx bangle"', async () => {
    assert.ok(positionOf(await search('qwvx bangles'), 'bloom') >= 0);
    assert.ok(positionOf(await search('qwvx bangle'), 'bloom') >= 0);
    assert.equal(positionOf(await search('qwvx necklace'), 'bloom'), -1);
  });

  test('words in any order', async () => {
    assert.equal(positionOf(await search('ring diamond axel'), 'axel'), 0);
  });

  test('draft and ₹0 products are never returned', async () => {
    const r = await search('zentrix', { limit: 48 });
    assert.equal(positionOf(r, 'draft'), -1);
    assert.equal(positionOf(r, 'zero'), -1);
    assert.equal(r.total, 12);
  });

  test('a query with nothing searchable returns nothing', async () => {
    assert.deepEqual(await search('!!! ---'), { products: [], total: 0, categories: [], collections: [] });
  });

  test('SQL/LIKE metacharacters are treated as text', async () => {
    const r = await search(`%' OR 1=1 --`);
    assert.equal(r.total, 0);
    const u = await search('_');
    assert.equal(u.total, 0);
  });
});

describe('ranking', () => {
  test('exact name > exact SKU > starts with > all words > category > other partial; newest breaks ties', async () => {
    const r = await search('qrank', { limit: 48 });
    const order = ['rankExact', 'rankSku', 'rankStarts', 'rankWords', 'rankCat', 'rankPartial'].map((k) => positionOf(r, k));
    assert.deepEqual(order, [0, 1, 2, 3, 4, 5]);
  });
});
