import { AppError } from '../utils/AppError.js';
import { getCurrentGoldRate, getCurrentGoldRates } from '../repositories/goldRates.repository.js';
import { findDiamondConfigById } from '../repositories/diamondConfigs.repository.js';
import {
  resolvedPurity,
  resolvedGoldColor,
  resolvedDiamondConfigId,
  resolvedSizeLabel,
} from '../repositories/productVariants.repository.js';
import { findWeightRuleValuesByProduct } from '../repositories/weightRules.repository.js';
import { findPurityPricingRuleValuesByProduct } from '../repositories/purityPricingRules.repository.js';
import { getCategoryAndAncestorIds } from '../repositories/categories.repository.js';
import { resolveMakingChargeDiscount, resolveDiamondDiscount } from './pricingRuleResolver.js';

// karat/24 — default purity multiplier (plan §9a: "overridable in settings
// if market convention differs"; no settings table exists in the approved
// schema, so this is the hardcoded default for now).
const PURITY_KARATS = { '9K': 9, '14K': 14, '18K': 18, '22K': 22, '24K': 24 };

export function deriveRatesFromBase24k(rate24k) {
  return Object.entries(PURITY_KARATS).map(([purity, karat]) => ({
    purity,
    ratePerGram: Math.round(((rate24k * karat) / 24) * 100) / 100,
  }));
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export async function computeGoldValue(netWeightGrams, purity) {
  const rate = await getCurrentGoldRate(purity);
  if (!rate) throw new AppError(409, `No gold rate available yet for purity ${purity}`);
  return {
    goldValue: round2(netWeightGrams * Number(rate.rate_per_gram)),
    goldRateId: rate.id,
    goldRatePerGram: Number(rate.rate_per_gram),
  };
}

export async function computeDiamondValue(diamondWeightCarats, diamondConfigId) {
  if (!diamondWeightCarats) return { diamondValue: 0 };
  if (!diamondConfigId) throw new AppError(409, 'No diamond quality tier selected');

  const config = await findDiamondConfigById(diamondConfigId);
  if (!config) throw new AppError(409, 'Selected diamond quality tier no longer exists');
  // Weight is stored in carats; diamond quality tiers are rated per cent
  // (1 carat = 100 cents), matching the admin's Diamond Weight (cents)
  // input — convert before applying the rate.
  const diamondWeightCents = diamondWeightCarats * 100;
  return { diamondValue: round2(diamondWeightCents * Number(config.rate_per_carat)) };
}

// selling_price = gold + diamond + making + GST-on-that-subtotal (plan §6
// price breakup example: "Gold + Diamond + Making Charges + GST = Total").
export function computeSellingPrice({ goldValue, diamondValue, makingCharge, gstPercent }) {
  const subtotal = goldValue + diamondValue + makingCharge;
  const gstAmount = subtotal * (gstPercent / 100);
  return round2(subtotal + gstAmount);
}

// A per-product promotional offer — a live % discount on Making Charge
// and/or Diamond Value, recomputed through the same formula as everything
// else (so it's never out of sync with the actual gold rate). Deliberately a
// no-op when no discount is configured (the overwhelming common case): a
// product's admin-set sellingPrice stays exactly as entered, "final,
// admin-overridable", untouched — only once an offer is actually set does
// the total recompute from the discounted components, becoming the real
// charged price everywhere this flows (PDP, listing cards, cart, checkout).
export function applyProductOffer({
  goldValue,
  diamondValue,
  makingCharge,
  gstPercent,
  sellingPrice,
  makingChargeDiscountPercent,
  diamondDiscountPercent,
}) {
  const hasOffer = (makingChargeDiscountPercent ?? 0) > 0 || (diamondDiscountPercent ?? 0) > 0;
  if (!hasOffer) {
    return {
      goldValue,
      diamondValue,
      diamondValueOriginal: diamondValue,
      makingCharge,
      makingChargeOriginal: makingCharge,
      makingChargeDiscountPercent: 0,
      diamondDiscountPercent: 0,
      sellingPrice,
      sellingPriceOriginal: sellingPrice,
    };
  }

  const discountedMakingCharge = round2(makingCharge * (1 - (makingChargeDiscountPercent ?? 0) / 100));
  const discountedDiamondValue = round2(diamondValue * (1 - (diamondDiscountPercent ?? 0) / 100));
  const discountedSellingPrice = computeSellingPrice({
    goldValue,
    diamondValue: discountedDiamondValue,
    makingCharge: discountedMakingCharge,
    gstPercent,
  });

  return {
    goldValue,
    diamondValue: discountedDiamondValue,
    diamondValueOriginal: diamondValue,
    makingCharge: discountedMakingCharge,
    makingChargeOriginal: makingCharge,
    makingChargeDiscountPercent: makingChargeDiscountPercent ?? 0,
    diamondDiscountPercent: diamondDiscountPercent ?? 0,
    sellingPrice: discountedSellingPrice,
    sellingPriceOriginal: sellingPrice,
  };
}

// Builds the diamond-component array a variant's pricing resolves discounts
// against. Today this is always exactly one entry (or zero, for a product
// with no diamond), built from the product's existing single diamond_type_id/
// diamond_colour/diamond_clarity fields — deliberately an array, not a
// single object, so a future multi-diamond-type product only needs this one
// function's body replaced with a read of a real components table, with zero
// rework of the resolver, jobs, or DTOs that consume the array shape.
function buildDiamondComponents(product, diamondConfigId, diamondWeightCarats, diamondValue) {
  if (!diamondConfigId || !diamondWeightCarats) return [];
  return [
    {
      diamondTypeId: product.diamond_type_id ?? null,
      diamondConfigId,
      carats: diamondWeightCarats,
      value: diamondValue,
      colour: product.diamond_colour ?? null,
      clarity: product.diamond_clarity ?? null,
    },
  ];
}

// Amount-first sibling of applyProductOffer, used only when an actual
// PRODUCT/CATEGORY/GLOBAL pricing_rules row won the resolution for making
// charge and/or at least one diamond component (see computeVariantPricing).
// Still calls the same single computeSellingPrice — GST is still computed
// once, after discounts, on the summed subtotal, never a second formula.
// `makingChargeDiscount` and each component's `.discount` are the {amount,
// percent, ruleId, ruleName, source, clamped} shape pricingRuleResolver.js
// returns.
// `fallbackDiamondValue` is the product's real diamond value for products
// with no resolvable diamond component at all (no diamond_config_id — a
// real, common case: legacy/manually-priced diamonds, confirmed against the
// dev DB) — diamondComponents is then always [], and summing an empty array
// would silently zero out that value the instant ANY pricing rule applies
// to the product, even a MAKING_CHARGE-only rule with nothing to do with
// diamonds. Bug found and fixed while wiring cart/checkout into Pricing
// Rule Management (Phase 6) — computeVariantPricing's fallback-vs-usesNewRule
// split meant this path was untested until a rule actually went live.
export function applyResolvedDiscounts({
  goldValue,
  makingCharge,
  gstPercent,
  sellingPrice,
  makingChargeDiscount,
  diamondComponents,
  fallbackDiamondValue = 0,
}) {
  const discountedMakingCharge = round2(makingCharge - makingChargeDiscount.amount);

  if (diamondComponents.length === 0) {
    const discountedSellingPrice = computeSellingPrice({
      goldValue,
      diamondValue: fallbackDiamondValue,
      makingCharge: discountedMakingCharge,
      gstPercent,
    });
    return {
      goldValue,
      diamondValue: fallbackDiamondValue,
      diamondValueOriginal: fallbackDiamondValue,
      makingCharge: discountedMakingCharge,
      makingChargeOriginal: makingCharge,
      makingChargeDiscountPercent: makingChargeDiscount.percent,
      diamondDiscountPercent: 0,
      sellingPrice: discountedSellingPrice,
      sellingPriceOriginal: sellingPrice,
      diamondComponents: [],
    };
  }

  const diamondValueOriginal = round2(diamondComponents.reduce((sum, c) => sum + c.value, 0));

  const resolvedComponents = diamondComponents.map((c) => {
    const finalValue = round2(c.value - c.discount.amount);
    return {
      diamondTypeId: c.diamondTypeId,
      diamondConfigId: c.diamondConfigId,
      carats: c.carats,
      value: c.value,
      colour: c.colour,
      clarity: c.clarity,
      finalValue,
      discountAmount: c.discount.amount,
      discountPercent: c.discount.percent,
      appliedRuleId: c.discount.ruleId,
      appliedRuleName: c.discount.ruleName,
      source: c.discount.source,
      clamped: c.discount.clamped,
    };
  });
  const discountedDiamondValue = round2(resolvedComponents.reduce((sum, c) => sum + c.finalValue, 0));

  const discountedSellingPrice = computeSellingPrice({
    goldValue,
    diamondValue: discountedDiamondValue,
    makingCharge: discountedMakingCharge,
    gstPercent,
  });

  return {
    goldValue,
    diamondValue: discountedDiamondValue,
    diamondValueOriginal,
    makingCharge: discountedMakingCharge,
    makingChargeOriginal: makingCharge,
    makingChargeDiscountPercent: makingChargeDiscount.percent,
    diamondDiscountPercent:
      diamondValueOriginal > 0 ? round2(((diamondValueOriginal - discountedDiamondValue) / diamondValueOriginal) * 100) : 0,
    sellingPrice: discountedSellingPrice,
    sellingPriceOriginal: sellingPrice,
    diamondComponents: resolvedComponents,
  };
}

export async function previewPricing({
  metalType,
  purity,
  goldWeightGrams,
  diamondWeightCarats,
  diamondConfigId,
  makingCharge = 0,
  gstPercent = 3,
}) {
  const goldValue =
    metalType === 'GOLD' && purity && goldWeightGrams
      ? (await computeGoldValue(goldWeightGrams, purity)).goldValue
      : 0;
  const diamondValue = diamondWeightCarats
    ? (await computeDiamondValue(diamondWeightCarats, diamondConfigId)).diamondValue
    : 0;
  const sellingPrice = computeSellingPrice({ goldValue, diamondValue, makingCharge, gstPercent });

  return { goldValue, diamondValue, makingCharge, gstPercent, sellingPrice };
}

export function getCurrentRatesSnapshot() {
  return getCurrentGoldRates();
}

// Resolves a variant's gold weight against Weight Defaults: an exact
// Product+Purity+Size rule (most specific) beats a Purity-only rule;
// returns null if neither matches, so the caller can fall through to its
// own legacy levels. A matched row's weight is still validated explicitly
// (finite, > 0) rather than trusted blindly — the DB's CHECK constraint
// already guarantees this for anything that made it into the table, but a
// row is data, not a type guarantee.
async function resolveWeightFromRules(product, variant, weightRules) {
  const purityValueId = variant?.attributes?.purity?.valueId ?? null;
  const sizeValueId = variant?.attributes?.size?.valueId ?? null;
  if (purityValueId == null) return null;

  const rules = weightRules ?? (await findWeightRuleValuesByProduct(product.id));
  const puritySizeRule = sizeValueId
    ? rules.find((r) => r.purity_value_id === purityValueId && r.size_value_id === sizeValueId)
    : null;
  const purityRule = rules.find((r) => r.purity_value_id === purityValueId && r.size_value_id === null);
  const matched = puritySizeRule ?? purityRule;
  if (matched == null) return null;

  const weight = Number(matched.gold_weight_grams);
  return Number.isFinite(weight) && weight > 0 ? weight : null;
}

function numOrNull(v) {
  return v == null ? null : Number(v);
}

// Resolves a variant's Product+Purity pricing rule row (or null — total
// inheritance) from a pre-fetched array, or fetches on demand when none was
// passed (same "optional, fetched only when actually needed" contract as
// resolveWeightFromRules above).
async function resolvePurityPricingRuleRow(product, variant, purityPricingRules) {
  const purityValueId = variant?.attributes?.purity?.valueId ?? null;
  if (purityValueId == null) return null;
  const rules = purityPricingRules ?? (await findPurityPricingRuleValuesByProduct(product.id));
  return rules.find((r) => r.purity_value_id === purityValueId) ?? null;
}

// Resolves each of the three charge/discount fields independently: a
// purity rule's own value wins if set, otherwise the product-level default,
// otherwise (discounts only) 0. Uses `??` throughout, never `||` — 0 is a
// valid, explicit override or default and must never be treated as "unset".
// makingChargePercent has no final `?? 0` fallback: null here means "no
// percent configured at all, anywhere" — computeVariantPricing's own
// fallback to the flat `making_charge` column is what handles that case,
// not a fabricated 0% rate.
export function resolvePurityPricingFields(product, purityRule) {
  const makingChargePercent = numOrNull(purityRule?.making_charge_percent) ?? numOrNull(product.making_charge_percent);
  const makingChargeDiscountPercent =
    numOrNull(purityRule?.making_charge_discount_percent) ?? numOrNull(product.making_charge_discount_percent) ?? 0;
  const diamondDiscountPercent =
    numOrNull(purityRule?.diamond_discount_percent) ?? numOrNull(product.diamond_discount_percent) ?? 0;
  return { makingChargePercent, makingChargeDiscountPercent, diamondDiscountPercent };
}

// Prices a product's line for a specific product_variants row (or the
// synthetic default variant with no attribute values / overrides, for a
// product with nothing configured). Replaces the old
// {purity, diamondConfigId, sizeWeightGrams, sizeDiamondWeightCarats} param
// shape — every axis (including Gold Color, which never affected price
// before) is now resolved generically from the variant's own attribute
// values and weight overrides, falling back to the product's base value on
// any axis the variant doesn't override. A variant with no overrides at all
// (or a null `variant`) is byte-identical to pre-variant-model pricing —
// zero regression for products with nothing configured.
//
// `weightRules` and `purityPricingRules` are both optional — pass a
// pre-fetched array (from findWeightRuleValuesByProduct /
// findPurityPricingRuleValuesByProduct) when pricing many variants for the
// same product in a loop (adminListVariants, adminBulkUpdateVariants) to
// avoid re-querying per variant; omitted, each
// is fetched on demand only when actually needed (the variant carries a
// purity at all).
//
// `ruleSet` (from pricingRuleResolver.loadActiveRuleSet) is optional and
// additive: omitted entirely (existing callers — cart, checkout, admin
// variant list — pass nothing), this function is byte-identical to before
// Pricing Rule Management existed. Passed, it's only actually used for a
// product/component once a real PRODUCT/CATEGORY/GLOBAL pricing_rules row
// resolves for it; otherwise this still falls back to the exact legacy
// applyProductOffer arithmetic, so a ruleSet with zero rules (Phase 1, since
// no admin UI to create one exists yet) also produces byte-identical output.
export async function computeVariantPricing(product, variant = null, weightRules = null, purityPricingRules = null, ruleSet = null) {
  const effectivePurity = resolvedPurity(variant) || product.purity;
  const effectiveDiamondConfigId = resolvedDiamondConfigId(variant) || product.diamond_config_id;
  const effectiveGoldColor = resolvedGoldColor(variant) || product.gold_color;

  // Priority: an exact Product+Purity+Size (or Purity-only) Weight Defaults
  // rule is the source of truth and is always checked first — it must be
  // able to override a variant's own historical weight, not just fill a gap
  // left by it. A variant's own gold_weight_grams is now only a *legacy*
  // fallback for products that predate Weight Defaults (or never adopted
  // it); the product's own base weight remains the final fallback. Uses ??
  // throughout, not ||, since a resolved weight is a validated number, not
  // something to be re-tested for truthiness.
  const baseWeightGrams = product.gold_weight_grams != null ? Number(product.gold_weight_grams) : null;
  const legacyVariantWeightGrams = variant?.gold_weight_grams != null ? Number(variant.gold_weight_grams) : null;
  const ruleWeightGrams = variant != null ? await resolveWeightFromRules(product, variant, weightRules) : null;
  const variantWeightGrams = ruleWeightGrams ?? legacyVariantWeightGrams;
  const effectiveWeightGrams = variantWeightGrams ?? baseWeightGrams;
  const weightOverridden =
    variantWeightGrams != null && baseWeightGrams != null && variantWeightGrams !== baseWeightGrams;

  // Recomputed live whenever a real variant is being priced — never trust
  // the cached product.gold_value here, since applyBaseProductPricing caches
  // the *base* configuration's price onto that same column, which is not
  // necessarily this variant even when its own weight/purity happen to equal
  // the product's base fields. Only the true no-variant case (variant ===
  // null) falls back to the cached column.
  let goldValue = Number(product.gold_value);
  let goldRatePerGram = null;
  if (
    product.metal_type === 'GOLD' &&
    effectiveWeightGrams != null &&
    (variant != null || weightOverridden || (effectivePurity && effectivePurity !== product.purity))
  ) {
    const goldResult = await computeGoldValue(effectiveWeightGrams, effectivePurity);
    goldValue = goldResult.goldValue;
    goldRatePerGram = goldResult.goldRatePerGram;
  }

  const baseDiamondWeightCarats =
    product.diamond_weight_carats != null ? Number(product.diamond_weight_carats) : null;
  const variantDiamondWeightCarats =
    variant?.diamond_weight_carats != null ? Number(variant.diamond_weight_carats) : null;
  const effectiveDiamondWeightCarats = variantDiamondWeightCarats ?? baseDiamondWeightCarats;
  const diamondWeightOverridden =
    variantDiamondWeightCarats != null &&
    baseDiamondWeightCarats != null &&
    variantDiamondWeightCarats !== baseDiamondWeightCarats;

  // Same reasoning as goldValue above — always recompute for a real variant.
  let diamondValue = Number(product.diamond_value);
  if (
    effectiveDiamondConfigId &&
    effectiveDiamondWeightCarats != null &&
    (variant != null || diamondWeightOverridden || effectiveDiamondConfigId !== product.diamond_config_id)
  ) {
    diamondValue = (await computeDiamondValue(effectiveDiamondWeightCarats, effectiveDiamondConfigId))
      .diamondValue;
  }

  const diamondComponentsRaw = buildDiamondComponents(product, effectiveDiamondConfigId, effectiveDiamondWeightCarats, diamondValue);

  // Making charge is a live % of gold value when a percent is configured —
  // scales automatically with goldValue above, so it's already correct for
  // whatever purity/size was just resolved. A Product+Purity pricing rule
  // (product_purity_pricing_rules) is checked first, per field, falling back
  // to the product-level default; falls back further to the flat
  // making_charge column for products with no % set anywhere, or with no
  // gold value at all (platinum — a % of $0 is meaningless, so those stay on
  // an admin-entered flat ₹ amount).
  const purityPricingRule =
    variant != null ? await resolvePurityPricingRuleRow(product, variant, purityPricingRules) : null;
  const { makingChargePercent, makingChargeDiscountPercent, diamondDiscountPercent } = resolvePurityPricingFields(
    product,
    purityPricingRule,
  );
  const makingCharge =
    makingChargePercent != null && goldValue > 0
      ? round2(goldValue * (makingChargePercent / 100))
      : Number(product.making_charge);
  const gstPercent = Number(product.gst_percent);
  const baseSellingPrice = computeSellingPrice({ goldValue, diamondValue, makingCharge, gstPercent });

  // A per-variant manual price override wins outright — set by an admin for
  // this one exact combination, it replaces the live-computed total. The
  // component breakdown (goldValue/diamondValue/makingCharge) above is kept
  // as computed for informational display; only the final total changes.
  // Product-level promotional offers don't layer on top of a manual
  // override — the override *is* the final admin-set price.
  if (variant?.price_override != null) {
    const overridePrice = round2(Number(variant.price_override));
    return {
      purity: effectivePurity,
      sizeLabel: resolvedSizeLabel(variant),
      diamondConfigId: effectiveDiamondConfigId,
      goldColor: effectiveGoldColor,
      goldWeightGrams: effectiveWeightGrams,
      goldRatePerGram,
      diamondWeightCarats: effectiveDiamondWeightCarats,
      goldValue,
      diamondValue,
      diamondValueOriginal: diamondValue,
      makingCharge,
      makingChargeOriginal: makingCharge,
      makingChargeDiscountPercent: 0,
      diamondDiscountPercent: 0,
      makingChargeDiscountAmount: 0,
      appliedMakingChargeRuleId: null,
      appliedMakingChargeRuleName: null,
      makingChargeDiscountSource: 'NONE',
      diamondDiscountAmount: 0,
      diamondComponents: diamondComponentsRaw.map((c) => ({
        ...c,
        finalValue: c.value,
        discountAmount: 0,
        discountPercent: 0,
        appliedRuleId: null,
        appliedRuleName: null,
        source: 'NONE',
        clamped: false,
      })),
      gstPercent,
      gstAmount: round2(overridePrice - goldValue - diamondValue - makingCharge),
      sellingPrice: overridePrice,
      sellingPriceOriginal: overridePrice,
      isPriceOverridden: true,
    };
  }

  let offer;
  let resolvedDiamondComponents;
  let makingChargeDiscountAmount;
  let appliedMakingChargeRuleId = null;
  let appliedMakingChargeRuleName = null;
  let makingChargeDiscountSource = 'NONE';

  if (ruleSet) {
    const purityValueId = variant?.attributes?.purity?.valueId ?? null;
    // Skip the ancestor-chain lookup entirely unless a CATEGORY-scope rule
    // of either type actually exists — true for 100% of Phase 1 (no admin UI
    // to create a rule ships until Phase 3), so this adds zero extra queries
    // today.
    const needsCategoryLookup =
      product.category_id != null && (ruleSet.makingByCategory.size > 0 || ruleSet.diamondByCategory.size > 0);
    const categoryAncestorIds = needsCategoryLookup ? await getCategoryAndAncestorIds(product.category_id) : [];

    const makingChargeDiscount = resolveMakingChargeDiscount({
      product,
      categoryAncestorIds,
      purityValueId,
      purityRuleRow: purityPricingRule,
      ruleSet,
      makingCharge,
    });
    const componentsWithDiscount = diamondComponentsRaw.map((c) => ({
      ...c,
      discount: resolveDiamondDiscount({ product, categoryAncestorIds, purityRuleRow: purityPricingRule, ruleSet, component: c }),
    }));

    const NEW_RULE_SOURCES = new Set(['PRODUCT_RULE', 'CATEGORY_RULE', 'GLOBAL_RULE']);
    const usesNewRule =
      NEW_RULE_SOURCES.has(makingChargeDiscount.source) ||
      componentsWithDiscount.some((c) => NEW_RULE_SOURCES.has(c.discount.source));

    if (usesNewRule) {
      const resolved = applyResolvedDiscounts({
        goldValue,
        makingCharge,
        gstPercent,
        sellingPrice: baseSellingPrice,
        makingChargeDiscount,
        diamondComponents: componentsWithDiscount,
        fallbackDiamondValue: diamondValue,
      });
      offer = resolved;
      resolvedDiamondComponents = resolved.diamondComponents;
      makingChargeDiscountAmount = makingChargeDiscount.amount;
      appliedMakingChargeRuleId = makingChargeDiscount.ruleId;
      appliedMakingChargeRuleName = makingChargeDiscount.ruleName;
      makingChargeDiscountSource = makingChargeDiscount.source;
    } else {
      // No PRODUCT/CATEGORY/GLOBAL rule actually applies to this product's
      // making charge OR any diamond component — fall back to the exact
      // legacy formula (tiers 2/3 only, same values resolveTier already
      // agreed on) so the numeric output is byte-identical to the
      // pre-Pricing-Rules code path, not just equivalent.
      offer = applyProductOffer({
        goldValue,
        diamondValue,
        makingCharge,
        gstPercent,
        sellingPrice: baseSellingPrice,
        makingChargeDiscountPercent,
        diamondDiscountPercent,
      });
      resolvedDiamondComponents = componentsWithDiscount.map((c) => ({
        diamondTypeId: c.diamondTypeId,
        diamondConfigId: c.diamondConfigId,
        carats: c.carats,
        value: c.value,
        colour: c.colour,
        clarity: c.clarity,
        finalValue: round2(c.value - c.discount.amount),
        discountAmount: c.discount.amount,
        discountPercent: c.discount.percent,
        appliedRuleId: null,
        appliedRuleName: null,
        source: c.discount.source,
        clamped: false,
      }));
      makingChargeDiscountAmount = round2(makingCharge - offer.makingCharge);
      makingChargeDiscountSource = makingChargeDiscount.source;
    }
  } else {
    // No ruleSet passed at all — existing callers (cart, checkout, admin
    // variant list) take this branch, completely unchanged from before this
    // feature existed.
    offer = applyProductOffer({
      goldValue,
      diamondValue,
      makingCharge,
      gstPercent,
      sellingPrice: baseSellingPrice,
      makingChargeDiscountPercent,
      diamondDiscountPercent,
    });
    resolvedDiamondComponents = diamondComponentsRaw.map((c) => ({
      ...c,
      finalValue: c.value,
      discountAmount: 0,
      discountPercent: 0,
      appliedRuleId: null,
      appliedRuleName: null,
      source: 'NONE',
      clamped: false,
    }));
    makingChargeDiscountAmount = round2(makingCharge - offer.makingCharge);
  }

  const gstAmount = round2(offer.sellingPrice - offer.goldValue - offer.diamondValue - offer.makingCharge);

  return {
    purity: effectivePurity,
    sizeLabel: resolvedSizeLabel(variant),
    diamondConfigId: effectiveDiamondConfigId,
    goldColor: effectiveGoldColor,
    goldWeightGrams: effectiveWeightGrams,
    goldRatePerGram,
    diamondWeightCarats: effectiveDiamondWeightCarats,
    goldValue: offer.goldValue,
    diamondValue: offer.diamondValue,
    diamondValueOriginal: offer.diamondValueOriginal,
    makingCharge: offer.makingCharge,
    makingChargeOriginal: offer.makingChargeOriginal,
    makingChargeDiscountPercent: offer.makingChargeDiscountPercent,
    diamondDiscountPercent: offer.diamondDiscountPercent,
    makingChargeDiscountAmount,
    appliedMakingChargeRuleId,
    appliedMakingChargeRuleName,
    makingChargeDiscountSource,
    diamondComponents: resolvedDiamondComponents,
    diamondDiscountAmount: round2(offer.diamondValueOriginal - offer.diamondValue),
    gstPercent,
    gstAmount,
    sellingPrice: offer.sellingPrice,
    sellingPriceOriginal: offer.sellingPriceOriginal,
    isPriceOverridden: false,
  };
}
