import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../../src/config/db.js';
import { adminCreateProduct, adminUpdateProduct, adminDeleteProduct } from '../../src/services/productsService.js';
import { createProductSchema, updateProductSchema } from '../../src/validators/products.validators.js';

// Real integration test against the dev DB (no mocking library exists in
// this test suite) — proves the combined product create/edit save (Product
// Create/Edit Architecture Report, 2026-09-07): Weight Defaults and Purity
// Pricing Rules entered in the SAME create/update call as the main product
// fields, resolved server-side from purity codes/size labels (never a
// database UUID) and persisted atomically in the product's existing
// withTransaction — no separate save-and-reopen step.

async function testCategory() {
  const { rows } = await query('SELECT id, slug FROM categories LIMIT 1');
  if (!rows[0]) throw new Error('test requires at least one category in the dev DB');
  return rows[0];
}

function basePayload(overrides = {}) {
  return {
    name: `Combined Save Test ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sku: `TEST-COMBINED-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    metalType: 'GOLD',
    purity: '9K',
    goldWeightGrams: 1,
    makingChargePercent: 10,
    status: 'DRAFT',
    ...overrides,
  };
}

const createdProductIds = [];
after(async () => {
  for (const id of createdProductIds) {
    await adminDeleteProduct(id).catch(() => {});
  }
});

describe('Combined product save — create (Test H1)', () => {
  test('creates the product, its variants, weight rules and purity pricing rules atomically from purity/size codes', async () => {
    const category = await testCategory();
    const input = createProductSchema.parse(
      basePayload({
        categoryId: category.id,
        purities: ['9K', '18K'],
        sizes: [
          { label: '6', stockQuantity: 5 },
          { label: '12', stockQuantity: 7 },
        ],
        weightRules: {
          purityRules: [
            { purity: '9K', goldWeightGrams: 0.54 },
            { purity: '18K', goldWeightGrams: 0.64 },
          ],
          puritySizeRules: [{ purity: '9K', sizeLabel: '6', goldWeightGrams: 0.5 }],
        },
        purityPricingRules: [
          { purity: '9K', makingChargePercent: 20, makingChargeDiscountPercent: 10, diamondDiscountPercent: null },
          { purity: '18K', makingChargePercent: 25, makingChargeDiscountPercent: 0, diamondDiscountPercent: 10 },
        ],
      }),
    );

    const product = await adminCreateProduct(input);
    createdProductIds.push(product.id);

    const { rows: weightRows } = await query(
      `SELECT pav.value AS purity, sav.value AS size_label, r.gold_weight_grams
       FROM product_weight_rules r
       JOIN attribute_values pav ON pav.id = r.purity_value_id
       LEFT JOIN attribute_values sav ON sav.id = r.size_value_id
       WHERE r.product_id = $1 ORDER BY pav.value, sav.value NULLS FIRST`,
      [product.id],
    );
    assert.equal(weightRows.length, 3, 'expected 2 purity-only rules + 1 purity+size rule');
    const nineK = weightRows.find((r) => r.purity === '9K' && r.size_label === null);
    assert.equal(Number(nineK.gold_weight_grams), 0.54);
    const nineKSize6 = weightRows.find((r) => r.purity === '9K' && r.size_label === '6');
    assert.equal(Number(nineKSize6.gold_weight_grams), 0.5);
    const eighteenK = weightRows.find((r) => r.purity === '18K' && r.size_label === null);
    assert.equal(Number(eighteenK.gold_weight_grams), 0.64);

    const { rows: pricingRows } = await query(
      `SELECT pav.value AS purity, r.making_charge_percent, r.making_charge_discount_percent, r.diamond_discount_percent
       FROM product_purity_pricing_rules r
       JOIN attribute_values pav ON pav.id = r.purity_value_id
       WHERE r.product_id = $1 ORDER BY pav.value`,
      [product.id],
    );
    assert.equal(pricingRows.length, 2);
    const nineKPricing = pricingRows.find((r) => r.purity === '9K');
    assert.equal(Number(nineKPricing.making_charge_percent), 20);
    assert.equal(Number(nineKPricing.making_charge_discount_percent), 10);
    assert.equal(nineKPricing.diamond_discount_percent, null, 'explicit null must stay null, not fall back to 0');
    const eighteenKPricing = pricingRows.find((r) => r.purity === '18K');
    // Explicit 0 must survive as 0, never fall back to a product default.
    assert.equal(Number(eighteenKPricing.making_charge_discount_percent), 0);

    const { rows: variantRows } = await query('SELECT id FROM product_variants WHERE product_id = $1', [product.id]);
    assert.equal(variantRows.length, 4, '2 purities x 2 sizes = 4 variants');
  });

  test('an internal failure (unresolvable purity) rolls back the ENTIRE create — no orphaned product row', async () => {
    const category = await testCategory();
    const name = `Combined Save Rollback Test ${Date.now()}`;
    // `purities` is deliberately omitted from this request — the schema's
    // checkAxisMembership refine only cross-checks weightRules against
    // `purities` when `purities` is actually present in the same request,
    // so this reaches adminCreateProduct unrejected. syncProductVariants
    // then creates zero purity attribute values (nothing was selected), so
    // the service-layer resolver's own 409 (buildPurityAndSizeResolver,
    // inside the transaction) is what has to catch this — proving it rolls
    // back everything already written (the product row, its attribute
    // values, its variants), not just skip the weight rule.
    const input = createProductSchema.parse(
      basePayload({
        name,
        categoryId: category.id,
        weightRules: { purityRules: [{ purity: '18K', goldWeightGrams: 1 }], puritySizeRules: [] },
      }),
    );

    await assert.rejects(() => adminCreateProduct(input));

    const { rows } = await query('SELECT id FROM products WHERE name = $1', [name]);
    assert.equal(rows.length, 0, 'the product row itself must not exist after a rolled-back create');
  });
});

describe('Combined product save — update (Test H2)', () => {
  async function createBaseProduct(category) {
    const input = createProductSchema.parse(
      basePayload({
        categoryId: category.id,
        purities: ['9K', '18K'],
        weightRules: { purityRules: [{ purity: '9K', goldWeightGrams: 0.5 }], puritySizeRules: [] },
        purityPricingRules: [{ purity: '9K', makingChargePercent: 15, makingChargeDiscountPercent: 5, diamondDiscountPercent: null }],
      }),
    );
    const product = await adminCreateProduct(input);
    createdProductIds.push(product.id);
    return product;
  }

  test('omitting weightRules/purityPricingRules on an unrelated field update preserves existing saved rules', async () => {
    const category = await testCategory();
    const product = await createBaseProduct(category);

    const patch = updateProductSchema.parse({ shortDescription: 'unrelated edit, no rule fields sent' });
    assert.equal('weightRules' in patch, false);
    assert.equal('purityPricingRules' in patch, false);
    await adminUpdateProduct(product.id, patch);

    const { rows: weightRows } = await query('SELECT id FROM product_weight_rules WHERE product_id = $1', [product.id]);
    assert.equal(weightRows.length, 1, 'weight rule must survive an unrelated update that never mentioned weightRules');
    const { rows: pricingRows } = await query('SELECT id FROM product_purity_pricing_rules WHERE product_id = $1', [
      product.id,
    ]);
    assert.equal(pricingRows.length, 1, 'purity pricing rule must survive an unrelated update');
  });

  test('an explicitly empty weightRules/purityPricingRules clears the saved rules', async () => {
    const category = await testCategory();
    const product = await createBaseProduct(category);

    const patch = updateProductSchema.parse({
      weightRules: { purityRules: [], puritySizeRules: [] },
      purityPricingRules: [],
    });
    await adminUpdateProduct(product.id, patch);

    const { rows: weightRows } = await query('SELECT id FROM product_weight_rules WHERE product_id = $1', [product.id]);
    assert.equal(weightRows.length, 0, 'an explicit empty weightRules must clear the saved rules');
    const { rows: pricingRows } = await query('SELECT id FROM product_purity_pricing_rules WHERE product_id = $1', [
      product.id,
    ]);
    assert.equal(pricingRows.length, 0, 'an explicit empty purityPricingRules must clear the saved rules');
  });

  test('removing a purity prunes its now-orphaned weight and pricing rules', async () => {
    const category = await testCategory();
    const product = await createBaseProduct(category);

    // Drop 18K, keep only 9K — no weightRules/purityPricingRules field sent
    // at all, proving pruning happens purely from the axis change.
    const patch = updateProductSchema.parse({ purities: ['9K'] });
    await adminUpdateProduct(product.id, patch);

    const { rows: weightRows } = await query(
      `SELECT pav.value AS purity FROM product_weight_rules r
       JOIN attribute_values pav ON pav.id = r.purity_value_id WHERE r.product_id = $1`,
      [product.id],
    );
    assert.ok(
      weightRows.every((r) => r.purity === '9K'),
      'no weight rule should remain for the removed 18K purity',
    );

    const { rows: pricingRows } = await query('SELECT id FROM product_purity_pricing_rules WHERE product_id = $1', [
      product.id,
    ]);
    // The one saved rule was for 9K (still offered) — must survive pruning.
    assert.equal(pricingRows.length, 1);
  });
});

describe('Combined product save — validator-level checks (Test H3)', () => {
  test('rejects duplicate purities within weightRules.purityRules', () => {
    assert.throws(() =>
      createProductSchema.parse(
        basePayload({
          purities: ['9K'],
          weightRules: {
            purityRules: [
              { purity: '9K', goldWeightGrams: 1 },
              { purity: '9K', goldWeightGrams: 2 },
            ],
            puritySizeRules: [],
          },
        }),
      ),
    );
  });

  test('rejects duplicate purities within purityPricingRules', () => {
    assert.throws(() =>
      createProductSchema.parse(
        basePayload({
          purities: ['9K'],
          purityPricingRules: [
            { purity: '9K', makingChargePercent: 10, makingChargeDiscountPercent: null, diamondDiscountPercent: null },
            { purity: '9K', makingChargePercent: 20, makingChargeDiscountPercent: null, diamondDiscountPercent: null },
          ],
        }),
      ),
    );
  });

  test('rejects a purity-pricing percent outside 0-100', () => {
    assert.throws(() =>
      createProductSchema.parse(
        basePayload({
          purities: ['9K'],
          purityPricingRules: [
            { purity: '9K', makingChargePercent: 150, makingChargeDiscountPercent: null, diamondDiscountPercent: null },
          ],
        }),
      ),
    );
  });

  test('rejects a weight rule whose purity is not in the same request\'s purities', () => {
    assert.throws(() =>
      createProductSchema.parse(
        basePayload({
          purities: ['9K'],
          weightRules: { purityRules: [{ purity: '18K', goldWeightGrams: 1 }], puritySizeRules: [] },
        }),
      ),
    );
  });

  test('rejects a gold weight of zero', () => {
    assert.throws(() =>
      createProductSchema.parse(
        basePayload({
          purities: ['9K'],
          weightRules: { purityRules: [{ purity: '9K', goldWeightGrams: 0 }], puritySizeRules: [] },
        }),
      ),
    );
  });

  test('accepts an explicit 0 for makingChargeDiscountPercent (distinct from omitted/null)', () => {
    const parsed = createProductSchema.parse(
      basePayload({
        purities: ['9K'],
        purityPricingRules: [
          { purity: '9K', makingChargePercent: 10, makingChargeDiscountPercent: 0, diamondDiscountPercent: null },
        ],
      }),
    );
    assert.equal(parsed.purityPricingRules[0].makingChargeDiscountPercent, 0);
    assert.equal(parsed.purityPricingRules[0].diamondDiscountPercent, null);
  });

  test('updateProductSchema.partial() still allows omitting weightRules/purityPricingRules entirely', () => {
    const parsed = updateProductSchema.parse({ shortDescription: 'no rule fields at all' });
    assert.equal('weightRules' in parsed, false);
    assert.equal('purityPricingRules' in parsed, false);
  });
});
