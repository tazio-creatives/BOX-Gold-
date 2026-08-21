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
