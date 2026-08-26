import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeVariantPricing } from '../../src/services/pricingService.js';
import { getCurrentGoldRate } from '../../src/repositories/goldRates.repository.js';

// Base product with cached gold_value/diamond_value — mirrors a row as it
// comes back from lockProductForCheckoutTx/findProductById.
const baseProduct = {
  metal_type: 'GOLD',
  purity: '18K',
  net_weight_grams: '10.000',
  gold_weight_grams: '10.000',
  gold_value: 100000,
  diamond_value: 0,
  diamond_config_id: null,
  diamond_weight_carats: null,
  making_charge: 5000,
  gst_percent: 3,
};

describe('computeVariantPricing — size weight override (per-size ring pricing)', () => {
  test('no overrides at all -> byte-identical to today: reuses cached gold_value, no DB call', async () => {
    const result = await computeVariantPricing(baseProduct, {});
    assert.equal(result.goldValue, 100000);
    assert.equal(result.purity, '18K');
  });

  test('sizeWeightGrams undefined (every existing caller before this feature) -> unchanged behavior', async () => {
    const result = await computeVariantPricing(baseProduct, { purity: '18K', diamondConfigId: null });
    assert.equal(result.goldValue, 100000);
  });

  test('sizeWeightGrams set, same purity as product -> recomputes goldValue off the size weight', async () => {
    const rate = await getCurrentGoldRate('18K');
    assert.ok(rate, 'test requires a seeded 18K gold rate in the dev DB');
    const expected = Math.round(15 * Number(rate.rate_per_gram) * 100) / 100;

    const result = await computeVariantPricing(baseProduct, { sizeWeightGrams: 15 });
    assert.equal(result.goldValue, expected);
    assert.notEqual(result.goldValue, 100000);
  });

  test('sizeWeightGrams + a purity override together -> uses the overridden weight at the overridden purity', async () => {
    const rate = await getCurrentGoldRate('22K');
    assert.ok(rate, 'test requires a seeded 22K gold rate in the dev DB');
    const expected = Math.round(12 * Number(rate.rate_per_gram) * 100) / 100;

    const result = await computeVariantPricing(baseProduct, { purity: '22K', sizeWeightGrams: 12 });
    assert.equal(result.goldValue, expected);
    assert.equal(result.purity, '22K');
  });

  test('sizeWeightGrams equal to the product\'s own weight -> no spurious recompute (no rate lookup needed)', async () => {
    const result = await computeVariantPricing(baseProduct, { sizeWeightGrams: 10 });
    assert.equal(result.goldValue, 100000);
  });

  test('PLATINUM product ignores sizeWeightGrams -> gold-only override, no crash', async () => {
    const platinumProduct = { ...baseProduct, metal_type: 'PLATINUM', purity: null, gold_value: 80000 };
    const result = await computeVariantPricing(platinumProduct, { sizeWeightGrams: 15 });
    assert.equal(result.goldValue, 80000);
  });
});

describe('computeVariantPricing — making_charge_percent (live making charge)', () => {
  test('no making_charge_percent set -> unchanged, uses the flat making_charge column', async () => {
    const result = await computeVariantPricing(baseProduct, {});
    assert.equal(result.makingCharge, 5000);
  });

  test('making_charge_percent set -> making charge is that % of goldValue, not the flat column', async () => {
    const product = { ...baseProduct, making_charge_percent: 10 };
    const result = await computeVariantPricing(product, {});
    assert.equal(result.goldValue, 100000);
    assert.equal(result.makingCharge, 10000); // 10% of 100000, not the flat 5000
  });

  test('making_charge_percent + a size weight override -> making charge scales with the recomputed goldValue', async () => {
    const rate = await getCurrentGoldRate('18K');
    assert.ok(rate, 'test requires a seeded 18K gold rate in the dev DB');
    const expectedGoldValue = Math.round(15 * Number(rate.rate_per_gram) * 100) / 100;
    const expectedMakingCharge = Math.round(expectedGoldValue * 0.1 * 100) / 100;

    const product = { ...baseProduct, making_charge_percent: 10 };
    const result = await computeVariantPricing(product, { sizeWeightGrams: 15 });
    assert.equal(result.goldValue, expectedGoldValue);
    assert.equal(result.makingCharge, expectedMakingCharge);
    assert.notEqual(result.makingCharge, 5000);
  });

  test('making_charge_percent set but goldValue is 0 (e.g. no weight yet) -> falls back to flat making_charge', async () => {
    const product = { ...baseProduct, making_charge_percent: 10, gold_value: 0 };
    const result = await computeVariantPricing(product, {});
    assert.equal(result.goldValue, 0);
    assert.equal(result.makingCharge, 5000);
  });

  test('PLATINUM product with making_charge_percent set -> still flat (percent of gold value is meaningless with no gold)', async () => {
    const platinumProduct = {
      ...baseProduct,
      metal_type: 'PLATINUM',
      purity: null,
      gold_value: 0,
      making_charge_percent: 10,
    };
    const result = await computeVariantPricing(platinumProduct, {});
    assert.equal(result.makingCharge, 5000);
  });
});
