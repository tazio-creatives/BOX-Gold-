import { findScopeProductRowsForPreview } from '../repositories/pricingRules.repository.js';
import { findPurityPricingRuleValuesByProductIds } from '../repositories/purityPricingRules.repository.js';
import { findAllAttributesWithGlobalValues } from '../repositories/attributes.repository.js';
import { getCategoryAndAncestorIds } from '../repositories/categories.repository.js';
import {
  loadActiveRuleSet,
  buildSyntheticRule,
  injectSyntheticRule,
  resolveMakingChargeDiscount,
  resolveDiamondDiscount,
  PREVIEW_RULE_ID,
} from './pricingRuleResolver.js';
import { computeSellingPrice, round2 } from './pricingService.js';

const SAMPLE_LIMIT = 10;

// products.purity is a TEXT code ('18K'); pricing_rule_purities stores a
// UUID (attribute_values.id, the global Purity attribute's values) — same
// mapping product_purity_pricing_rules already relies on. Built once per
// preview call, not per product.
async function buildPurityValueIdByCode() {
  const attrs = await findAllAttributesWithGlobalValues();
  const purityAttr = attrs.find((a) => a.code === 'purity');
  const map = new Map();
  for (const v of purityAttr?.values ?? []) map.set(v.value, v.id);
  return map;
}

// Shared by both preview entry points (POST /rules/preview for an unsaved
// payload, POST /rules/:ruleId/preview for a saved one — the controller
// reconstructs the same `input` shape for a saved rule from its DB row +
// link tables before calling this) — never a parallel formula: this runs
// the exact same pricingRuleResolver functions computeVariantPricing itself
// uses, just against cached product columns instead of a live gold-rate
// recompute (a preview is an estimate; the real reprice job is what
// actually commits new prices).
export async function previewPricingRule(input) {
  const categoryIds = input.categoryIds ?? [];
  const productIds = input.productIds ?? [];

  const rows = await findScopeProductRowsForPreview({ scope: input.scope, categoryIds, productIds });
  const totalProductsInScope = rows.length;
  const eligibleRows = rows.filter((r) => !r.is_price_locked);
  const priceLockedCount = totalProductsInScope - eligibleRows.length;

  const purityValueIdByCode = await buildPurityValueIdByCode();
  const purityRulesByProduct = await findPurityPricingRuleValuesByProductIds(eligibleRows.map((r) => r.id));

  const ancestorCache = new Map();
  async function ancestorsFor(categoryId) {
    if (!categoryId) return [];
    if (!ancestorCache.has(categoryId)) ancestorCache.set(categoryId, await getCategoryAndAncestorIds(categoryId));
    return ancestorCache.get(categoryId);
  }

  const baseRuleSet = await loadActiveRuleSet();
  const syntheticRule = buildSyntheticRule(input);
  const ruleSet = injectSyntheticRule(baseRuleSet, syntheticRule, { categoryIds, productIds });

  let matchingDiamondTypeCount = 0;
  let withExistingOverrides = 0;
  let willReceiveRule = 0;
  let clampedCount = 0;
  let suppressedCount = 0;
  let noMatchingDiamondType = 0;
  const missingPricingData = [];
  const sampleCandidates = [];

  function gstOf(row, makingCharge, diamondValue) {
    return round2(
      computeSellingPrice({
        goldValue: Number(row.gold_value),
        diamondValue,
        makingCharge,
        gstPercent: Number(row.gst_percent),
      }) -
        Number(row.gold_value) -
        diamondValue -
        makingCharge,
    );
  }

  for (const row of eligibleRows) {
    const purityValueId = row.purity ? (purityValueIdByCode.get(row.purity) ?? null) : null;
    const purityRuleRow =
      (purityRulesByProduct.get(row.id) ?? []).find((r) => r.purity_value_id === purityValueId) ?? null;
    const categoryAncestorIds = await ancestorsFor(row.category_id);

    if (input.ruleType === 'MAKING_CHARGE') {
      const makingCharge = Number(row.making_charge);
      const hadOverride =
        purityRuleRow?.making_charge_discount_percent != null || Number(row.making_charge_discount_percent ?? 0) > 0;

      const result = resolveMakingChargeDiscount({
        product: row,
        categoryAncestorIds,
        purityValueId,
        purityRuleRow,
        ruleSet,
        makingCharge,
      });
      if (hadOverride) withExistingOverrides++;
      if (result.ruleId === PREVIEW_RULE_ID) {
        willReceiveRule++;
        if (result.clamped) clampedCount++;
        if (syntheticRule.override_mode === 'SUPPRESS' && hadOverride) suppressedCount++;
        {
          const afterMakingCharge = round2(makingCharge - result.amount);
          const diamondValue = Number(row.diamond_value);
          sampleCandidates.push({
            productId: row.id,
            sku: row.sku,
            name: row.name,
            before: {
              makingCharge,
              diamondValue,
              gst: gstOf(row, makingCharge, diamondValue),
              sellingPrice: Number(row.selling_price),
            },
            after: {
              makingCharge: afterMakingCharge,
              diamondValue,
              gst: gstOf(row, afterMakingCharge, diamondValue),
              sellingPrice: computeSellingPrice({
                goldValue: Number(row.gold_value),
                diamondValue,
                makingCharge: afterMakingCharge,
                gstPercent: Number(row.gst_percent),
              }),
            },
          });
        }
      }
    } else {
      // DIAMOND rule — no diamond component at all on this product is not
      // "missing data", it's simply out of scope for a diamond rule. Diamond
      // type is no longer gated on (see pricingRuleResolver.js's
      // diamondMatches), so every product with a diamond counts.
      const hasDiamond = row.diamond_config_id != null && Number(row.diamond_weight_carats ?? 0) > 0;
      if (!hasDiamond) {
        noMatchingDiamondType++;
        continue;
      }
      matchingDiamondTypeCount++;

      const component = {
        diamondTypeId: row.diamond_type_id,
        diamondConfigId: row.diamond_config_id,
        carats: Number(row.diamond_weight_carats),
        value: Number(row.diamond_value),
        colour: row.diamond_colour,
        clarity: row.diamond_clarity,
      };
      const hadOverride =
        purityRuleRow?.diamond_discount_percent != null || Number(row.diamond_discount_percent ?? 0) > 0;
      const result = resolveDiamondDiscount({ product: row, categoryAncestorIds, purityRuleRow, ruleSet, component });
      if (hadOverride) withExistingOverrides++;
      if (result.ruleId === PREVIEW_RULE_ID) {
        willReceiveRule++;
        if (result.clamped) clampedCount++;
        if (syntheticRule.override_mode === 'SUPPRESS' && hadOverride) suppressedCount++;
        {
          const afterDiamondValue = round2(component.value - result.amount);
          const makingCharge = Number(row.making_charge);
          sampleCandidates.push({
            productId: row.id,
            sku: row.sku,
            name: row.name,
            before: {
              makingCharge,
              diamondValue: component.value,
              gst: gstOf(row, makingCharge, component.value),
              sellingPrice: Number(row.selling_price),
            },
            after: {
              makingCharge,
              diamondValue: afterDiamondValue,
              gst: gstOf(row, makingCharge, afterDiamondValue),
              sellingPrice: computeSellingPrice({
                goldValue: Number(row.gold_value),
                diamondValue: afterDiamondValue,
                makingCharge,
                gstPercent: Number(row.gst_percent),
              }),
            },
          });
        }
      }
    }
  }

  // Every matching product is collected into sampleCandidates above, then
  // ranked here — highest current selling price first — and only the top
  // SAMPLE_LIMIT are actually returned. Without this, an admin previewing a
  // category with many still-unpriced draft products (₹0 before AND after —
  // correct, but uninformative) would see a sample table mostly full of
  // zeros instead of the products the rule actually matters for.
  const samples = sampleCandidates
    .slice()
    .sort((a, b) => b.before.sellingPrice - a.before.sellingPrice)
    .slice(0, SAMPLE_LIMIT);

  return {
    totalProductsInScope,
    eligibleCount: eligibleRows.length,
    matchingDiamondTypeCount: input.ruleType === 'DIAMOND' ? matchingDiamondTypeCount : null,
    withExistingOverrides,
    willReceiveRule,
    clampedCount,
    suppressedCount: syntheticRule.override_mode === 'SUPPRESS' ? suppressedCount : 0,
    excluded: [
      { reason: 'PRICE_LOCKED', count: priceLockedCount },
      { reason: 'NO_MATCHING_DIAMOND_TYPE', count: noMatchingDiamondType },
      { reason: 'MISSING_PRICING_DATA', count: missingPricingData.length },
    ].filter((e) => e.count > 0),
    missingPricingData: missingPricingData.slice(0, 20),
    samples,
  };
}
