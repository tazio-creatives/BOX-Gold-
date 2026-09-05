import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeVariantPricing, computeSellingPrice } from '../../src/services/pricingService.js';
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
function makeVariant({ purity, goldColor, diamondConfigId, goldWeightGrams, diamondWeightCarats, priceOverride, sizeValueId, sizeLabel } = {}) {
  const attributes = {};
  if (purity) attributes.purity = { valueId: 'v-purity', value: purity, label: purity, refId: null };
  if (goldColor) attributes.gold_color = { valueId: 'v-color', value: goldColor, label: goldColor, refId: null };
  if (diamondConfigId) {
    attributes.diamond_quality = { valueId: 'v-diamond', value: diamondConfigId, label: 'Test', refId: diamondConfigId };
  }
  if (sizeValueId) {
    attributes.size = { valueId: sizeValueId, value: sizeLabel ?? sizeValueId, label: sizeLabel ?? sizeValueId, refId: null };
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

  test('variant with no overrides at all -> still recomputed live off the base weight/purity, not the cached column', async () => {
    const rate = await getCurrentGoldRate('18K');
    const expected = Math.round(10 * Number(rate.rate_per_gram) * 100) / 100;
    const result = await computeVariantPricing(baseProduct, makeVariant({}));
    assert.equal(result.goldValue, expected);
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

  test('variant weight override numerically equal to the product\'s own weight -> still recomputed live, matches (not a stale-cache reuse)', async () => {
    const rate = await getCurrentGoldRate('18K');
    const expected = Math.round(10 * Number(rate.rate_per_gram) * 100) / 100;
    const result = await computeVariantPricing(baseProduct, makeVariant({ goldWeightGrams: 10 }));
    assert.equal(result.goldValue, expected);
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

  test('no matching rule at all -> falls through to base product weight, recomputed live at that weight/purity', async () => {
    const rate = await getCurrentGoldRate('18K');
    const expected = Math.round(10 * Number(rate.rate_per_gram) * 100) / 100;
    const result = await computeVariantPricing(baseProduct, makeVariant({ purity: '18K' }), []);
    assert.equal(result.goldValue, expected);
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

  test('a matching Purity+Size rule now wins over the variant\'s own legacy weight override (precedence fix)', async () => {
    const variant = makeVariantWithSize({ purity: '18K', sizeValueId: 'v-size', goldWeightGrams: 3 });
    const rate = await getCurrentGoldRate('18K');
    // 7.5g (the Purity+Size rule) wins over the variant's own 3g — Weight
    // Defaults is now authoritative, and a variant's own column is only a
    // fallback for when no rule matches at all (see the next test).
    const expected = Math.round(7.5 * Number(rate.rate_per_gram) * 100) / 100;
    const result = await computeVariantPricing(baseProduct, variant, [purityRule, puritySizeRule]);
    assert.equal(result.goldValue, expected);
  });

  test('the variant\'s own weight override is still used when no rule matches its purity+size at all', async () => {
    const variant = makeVariantWithSize({ purity: '18K', sizeValueId: 'v-unruled-size', goldWeightGrams: 3 });
    const rate = await getCurrentGoldRate('18K');
    const expected = Math.round(3 * Number(rate.rate_per_gram) * 100) / 100;
    // purityRule has size_value_id: null (a Purity-only default) — it would
    // normally apply here, so this variant's own weight only wins because
    // there's no rule at all for this purity in scope for this assertion.
    const result = await computeVariantPricing(baseProduct, variant, []);
    assert.equal(result.goldValue, expected);
  });

  test('a variant with no purity at all never consults weight rules', async () => {
    const rate = await getCurrentGoldRate('18K');
    const expected = Math.round(10 * Number(rate.rate_per_gram) * 100) / 100;
    const result = await computeVariantPricing(baseProduct, makeVariant({ goldColor: 'ROSE' }), [purityRule]);
    assert.equal(result.goldValue, expected);
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

// Tests A-D: the exact required weight-precedence scenarios from the
// implementation spec, phrased with the spec's own example numbers so the
// mapping to the requirement is direct and unambiguous (the earlier
// "weight resolution hierarchy" suite above already covers the same logic
// with arbitrary numbers — this suite is the literal acceptance test).
describe('Required weight-precedence scenarios (Tests A-D)', () => {
  const product = {
    metal_type: 'GOLD',
    purity: '9K',
    gold_weight_grams: '0.500',
    gold_value: 0,
    diamond_value: 0,
    diamond_config_id: null,
    diamond_weight_carats: null,
    making_charge: 100,
    gst_percent: 3,
  };

  test('Test A - exact rule wins: 9K+Size6 rule 0.256g overrides variant legacy weight 0.586g', async () => {
    const variant = makeVariant({ purity: '9K', goldWeightGrams: 0.586 });
    variant.attributes.size = { valueId: 'v-size', value: '6', label: '6', refId: null };
    const rules = [{ purity_value_id: 'v-purity', size_value_id: 'v-size', gold_weight_grams: '0.256' }];
    const result = await computeVariantPricing(product, variant, rules);
    assert.equal(result.goldWeightGrams, 0.256);
  });

  test('Test B - purity default fallback: no exact rule, 9K default 0.300g overrides variant legacy weight 0.586g', async () => {
    const variant = makeVariant({ purity: '9K', goldWeightGrams: 0.586 });
    variant.attributes.size = { valueId: 'v-size', value: '6', label: '6', refId: null };
    const rules = [{ purity_value_id: 'v-purity', size_value_id: null, gold_weight_grams: '0.300' }];
    const result = await computeVariantPricing(product, variant, rules);
    assert.equal(result.goldWeightGrams, 0.3);
  });

  test('Test C - variant legacy fallback: no exact or purity-default rule -> variant weight 0.586g used', async () => {
    const variant = makeVariant({ purity: '9K', goldWeightGrams: 0.586 });
    variant.attributes.size = { valueId: 'v-size', value: '6', label: '6', refId: null };
    const result = await computeVariantPricing(product, variant, []);
    assert.equal(result.goldWeightGrams, 0.586);
  });

  test('Test D - product fallback: no rule and no variant weight -> product base weight 0.500g used', async () => {
    const variant = makeVariant({ purity: '9K' });
    variant.attributes.size = { valueId: 'v-size', value: '6', label: '6', refId: null };
    const result = await computeVariantPricing(product, variant, []);
    assert.equal(result.goldWeightGrams, 0.5);
  });
});

describe('Required purity-switching scenario (Test G)', () => {
  test('9K -> 18K -> 9K each resolve to their own rule weight, with no leftover from the previous selection', async () => {
    const product = {
      metal_type: 'GOLD',
      purity: '9K',
      gold_weight_grams: '0.500',
      gold_value: 0,
      diamond_value: 0,
      diamond_config_id: null,
      diamond_weight_carats: null,
      making_charge: 100,
      gst_percent: 3,
    };
    const rules = [
      { purity_value_id: 'purity-9k', size_value_id: 'size-6', gold_weight_grams: '0.256' },
      { purity_value_id: 'purity-18k', size_value_id: 'size-6', gold_weight_grams: '0.456' },
    ];
    const sizeAttr = { valueId: 'size-6', value: '6', label: '6', refId: null };
    const variant9k = {
      gold_weight_grams: null,
      diamond_weight_carats: null,
      price_override: null,
      combination_key: 'x',
      attributes: { purity: { valueId: 'purity-9k', value: '9K', label: '9K', refId: null }, size: sizeAttr },
    };
    const variant18k = {
      ...variant9k,
      attributes: { purity: { valueId: 'purity-18k', value: '18K', label: '18K', refId: null }, size: sizeAttr },
    };

    const first = await computeVariantPricing(product, variant9k, rules);
    assert.equal(first.goldWeightGrams, 0.256);

    const second = await computeVariantPricing(product, variant18k, rules);
    assert.equal(second.goldWeightGrams, 0.456);

    const third = await computeVariantPricing(product, variant9k, rules);
    assert.equal(third.goldWeightGrams, 0.256);
  });
});

describe('Required calculation scenario (Test H)', () => {
  test('9K @ Rs.5056.97/g, 0.256g, 2-cent diamond @ Rs.1500/cent, 60% making charge, 3% GST -> Rs.5223.47', () => {
    // Reuses the real exported computeSellingPrice (the exact function
    // computeVariantPricing calls) for the actual formula composition;
    // goldValue/diamondValue are derived by hand here with the same
    // rounding computeGoldValue/computeDiamondValue apply internally, so
    // this is deterministic and doesn't need a seeded gold-rate row — the
    // live rate-lookup path itself is already covered by the "variant
    // weight override" tests above, which do hit the real DB rate.
    const rate = 5056.97;
    const weightGrams = 0.256;
    const goldValue = Math.round(rate * weightGrams * 100) / 100;

    const diamondWeightCarats = 0.02; // 2 cents
    const ratePerCent = 1500;
    const diamondValue = Math.round(diamondWeightCarats * 100 * ratePerCent * 100) / 100;

    const makingChargePercent = 60;
    const makingCharge = Math.round(goldValue * (makingChargePercent / 100) * 100) / 100;

    assert.equal(goldValue, 1294.58);
    assert.equal(diamondValue, 3000);
    assert.equal(makingCharge, 776.75);

    const finalPrice = computeSellingPrice({ goldValue, diamondValue, makingCharge, gstPercent: 3 });
    assert.equal(finalPrice, 5223.47);
  });
});
