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

// Builds a variant row shaped like productVariants.repository.js's
// findVariantById/findVariantsByProductId output (resolvedPurity etc. read
// from `.attributes`), for a variant that only overrides what's passed.
function makeVariant({ purity, goldColor, diamondConfigId, goldWeightGrams, diamondWeightCarats, priceOverride } = {}) {
  const attributes = {};
  if (purity) attributes.purity = { valueId: 'v-purity', value: purity, label: purity, refId: null };
  if (goldColor) attributes.gold_color = { valueId: 'v-color', value: goldColor, label: goldColor, refId: null };
  if (diamondConfigId) {
    attributes.diamond_quality = { valueId: 'v-diamond', value: diamondConfigId, label: 'Test', refId: diamondConfigId };
  }
  return {
    gold_weight_grams: goldWeightGrams ?? null,
    diamond_weight_carats: diamondWeightCarats ?? null,
    price_override: priceOverride ?? null,
    combination_key: Object.keys(attributes).length ? 'x' : '',
    attributes,
  };
}

describe('computeVariantPricing — size weight override (per-size ring pricing)', () => {
  test('no variant at all (synthetic default) -> byte-identical to today: reuses cached gold_value, no DB call', async () => {
    const result = await computeVariantPricing(baseProduct, null);
    assert.equal(result.goldValue, 100000);
    assert.equal(result.purity, '18K');
  });

  test('variant with no overrides at all -> unchanged behavior', async () => {
    const result = await computeVariantPricing(baseProduct, makeVariant({}));
    assert.equal(result.goldValue, 100000);
  });

  test('variant weight override, same purity as product -> recomputes goldValue off the variant weight', async () => {
    const rate = await getCurrentGoldRate('18K');
    assert.ok(rate, 'test requires a seeded 18K gold rate in the dev DB');
    const expected = Math.round(15 * Number(rate.rate_per_gram) * 100) / 100;

    const result = await computeVariantPricing(baseProduct, makeVariant({ goldWeightGrams: 15 }));
    assert.equal(result.goldValue, expected);
    assert.notEqual(result.goldValue, 100000);
  });

  test('variant weight override + a purity override together -> uses the overridden weight at the overridden purity', async () => {
    const rate = await getCurrentGoldRate('22K');
    assert.ok(rate, 'test requires a seeded 22K gold rate in the dev DB');
    const expected = Math.round(12 * Number(rate.rate_per_gram) * 100) / 100;

    const result = await computeVariantPricing(baseProduct, makeVariant({ purity: '22K', goldWeightGrams: 12 }));
    assert.equal(result.goldValue, expected);
    assert.equal(result.purity, '22K');
  });

  test('variant weight override equal to the product\'s own weight -> no spurious recompute (no rate lookup needed)', async () => {
    const result = await computeVariantPricing(baseProduct, makeVariant({ goldWeightGrams: 10 }));
    assert.equal(result.goldValue, 100000);
  });

  test('PLATINUM product ignores a gold weight override -> gold-only override, no crash', async () => {
    const platinumProduct = { ...baseProduct, metal_type: 'PLATINUM', purity: null, gold_value: 80000 };
    const result = await computeVariantPricing(platinumProduct, makeVariant({ goldWeightGrams: 15 }));
    assert.equal(result.goldValue, 80000);
  });

  test('a Gold Color-only variant can carry its own weight override too (new capability)', async () => {
    const rate = await getCurrentGoldRate('18K');
    assert.ok(rate, 'test requires a seeded 18K gold rate in the dev DB');
    const expected = Math.round(11 * Number(rate.rate_per_gram) * 100) / 100;

    // Same purity as the product, only Gold Color differs — weight override
    // alone must still trigger a recompute even with no purity change.
    const result = await computeVariantPricing(
      baseProduct,
      makeVariant({ goldColor: 'ROSE', goldWeightGrams: 11 }),
    );
    assert.equal(result.goldColor, 'ROSE');
    assert.equal(result.goldValue, expected);
  });
});

describe('computeVariantPricing — making_charge_percent (live making charge)', () => {
  test('no making_charge_percent set -> unchanged, uses the flat making_charge column', async () => {
    const result = await computeVariantPricing(baseProduct, null);
    assert.equal(result.makingCharge, 5000);
  });

  test('making_charge_percent set -> making charge is that % of goldValue, not the flat column', async () => {
    const product = { ...baseProduct, making_charge_percent: 10 };
    const result = await computeVariantPricing(product, null);
    assert.equal(result.goldValue, 100000);
    assert.equal(result.makingCharge, 10000); // 10% of 100000, not the flat 5000
  });

  test('making_charge_percent + a variant weight override -> making charge scales with the recomputed goldValue', async () => {
    const rate = await getCurrentGoldRate('18K');
    assert.ok(rate, 'test requires a seeded 18K gold rate in the dev DB');
    const expectedGoldValue = Math.round(15 * Number(rate.rate_per_gram) * 100) / 100;
    const expectedMakingCharge = Math.round(expectedGoldValue * 0.1 * 100) / 100;

    const product = { ...baseProduct, making_charge_percent: 10 };
    const result = await computeVariantPricing(product, makeVariant({ goldWeightGrams: 15 }));
    assert.equal(result.goldValue, expectedGoldValue);
    assert.equal(result.makingCharge, expectedMakingCharge);
    assert.notEqual(result.makingCharge, 5000);
  });

  test('making_charge_percent set but goldValue is 0 (e.g. no weight yet) -> falls back to flat making_charge', async () => {
    const product = { ...baseProduct, making_charge_percent: 10, gold_value: 0 };
    const result = await computeVariantPricing(product, null);
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
    const result = await computeVariantPricing(platinumProduct, null);
    assert.equal(result.makingCharge, 5000);
  });
});

describe('computeVariantPricing — weight resolution hierarchy (Purity / Purity+Size rules)', () => {
  const purityRule = { purity_value_id: 'v-purity', size_value_id: null, gold_weight_grams: '5.000' };
  const puritySizeRule = { purity_value_id: 'v-purity', size_value_id: 'v-size', gold_weight_grams: '7.500' };

  function makeVariantWithSize({ purity, sizeValueId, goldWeightGrams }) {
    const v = makeVariant({ purity, goldWeightGrams });
    if (sizeValueId) {
      v.attributes.size = { valueId: sizeValueId, value: '6', label: '6', refId: null };
    }
    return v;
  }

  test('no matching rule at all -> falls through to base product weight, unchanged from before this feature', async () => {
    const result = await computeVariantPricing(baseProduct, makeVariant({ purity: '18K' }), []);
    assert.equal(result.goldValue, 100000); // baseProduct's cached gold_value, untouched
  });

  test('a Purity-only rule applies when the variant has no exact weight of its own', async () => {
    const rate = await getCurrentGoldRate('18K');
    const expected = Math.round(5 * Number(rate.rate_per_gram) * 100) / 100;
    const result = await computeVariantPricing(baseProduct, makeVariant({ purity: '18K' }), [purityRule]);
    assert.equal(result.goldValue, expected);
  });

  test('a Purity+Size rule beats a Purity-only rule for the same purity when both match', async () => {
    const rate = await getCurrentGoldRate('18K');
    const expected = Math.round(7.5 * Number(rate.rate_per_gram) * 100) / 100;
    const variant = makeVariantWithSize({ purity: '18K', sizeValueId: 'v-size' });
    const result = await computeVariantPricing(baseProduct, variant, [purityRule, puritySizeRule]);
    assert.equal(result.goldValue, expected);
  });

  test('a Purity-only rule still applies for a different size not covered by any Purity+Size rule', async () => {
    const rate = await getCurrentGoldRate('18K');
    const expected = Math.round(5 * Number(rate.rate_per_gram) * 100) / 100;
    const variant = makeVariantWithSize({ purity: '18K', sizeValueId: 'v-other-size' });
    const result = await computeVariantPricing(baseProduct, variant, [purityRule, puritySizeRule]);
    assert.equal(result.goldValue, expected);
  });

  test('the variant\'s own exact weight override still wins outright over any matching rule', async () => {
    const variant = makeVariantWithSize({ purity: '18K', sizeValueId: 'v-size', goldWeightGrams: 3 });
    const rate = await getCurrentGoldRate('18K');
    const expected = Math.round(3 * Number(rate.rate_per_gram) * 100) / 100;
    const result = await computeVariantPricing(baseProduct, variant, [purityRule, puritySizeRule]);
    assert.equal(result.goldValue, expected);
  });

  test('a variant with no purity at all never consults weight rules', async () => {
    const result = await computeVariantPricing(baseProduct, makeVariant({ goldColor: 'ROSE' }), [purityRule]);
    assert.equal(result.goldValue, 100000);
  });
});

describe('computeVariantPricing — per-variant price override', () => {
  test('a variant with a price override short-circuits to it, not the live computation', async () => {
    const result = await computeVariantPricing(baseProduct, makeVariant({ purity: '22K', priceOverride: 55000 }));
    assert.equal(result.sellingPrice, 55000);
    assert.equal(result.sellingPriceOriginal, 55000);
    assert.equal(result.isPriceOverridden, true);
    // Component breakdown is still the normal live computation (informational only) —
    // it's just the final total that's replaced.
    assert.notEqual(result.goldValue, 55000);
  });

  test('a variant with no override -> isPriceOverridden is false, byte-identical to before this feature existed', async () => {
    const result = await computeVariantPricing(baseProduct, makeVariant({ purity: '22K' }));
    assert.equal(result.isPriceOverridden, false);
  });

  test('a product-level promotional offer does not layer on top of a manual override', async () => {
    const product = { ...baseProduct, making_charge_discount_percent: 50, diamond_discount_percent: 50 };
    const result = await computeVariantPricing(product, makeVariant({ priceOverride: 42000 }));
    assert.equal(result.sellingPrice, 42000);
    assert.equal(result.makingChargeDiscountPercent, 0);
    assert.equal(result.diamondDiscountPercent, 0);
  });

  test('a synthetic default variant (no variant row at all) never reads price_override -> unaffected', async () => {
    const result = await computeVariantPricing(baseProduct, null);
    assert.equal(result.isPriceOverridden, false);
    assert.equal(result.goldValue, 100000);
  });
});
