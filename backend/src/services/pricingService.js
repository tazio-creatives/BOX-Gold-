import { AppError } from '../utils/AppError.js';
import { getCurrentGoldRate, getCurrentGoldRates } from '../repositories/goldRates.repository.js';
import { findDiamondConfigById } from '../repositories/diamondConfigs.repository.js';
import { resolvedPurity, resolvedGoldColor, resolvedDiamondConfigId } from '../repositories/productVariants.repository.js';
import { findWeightRuleValuesByProduct } from '../repositories/weightRules.repository.js';

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

function round2(n) {
  return Math.round(n * 100) / 100;
}

export async function computeGoldValue(netWeightGrams, purity) {
  const rate = await getCurrentGoldRate(purity);
  if (!rate) throw new AppError(409, `No gold rate available yet for purity ${purity}`);
  return { goldValue: round2(netWeightGrams * Number(rate.rate_per_gram)), goldRateId: rate.id };
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

// Resolves a variant's gold weight through the priority chain: its own
// exact override wins outright; otherwise a Purity+Size weight default
// (most specific) beats a Purity-only default; otherwise there's nothing to
// resolve and the caller falls back to the product's base weight. There is
// no separate "Size-only" live level — a size's weight is still seeded
// directly onto matching variants at creation time (via the product's
// Sizes list), which already makes it an exact-variant-level value, i.e.
// the top of this chain, not a level of its own.
async function resolveWeightFromRules(product, variant, weightRules) {
  const purityValueId = variant?.attributes?.purity?.valueId ?? null;
  const sizeValueId = variant?.attributes?.size?.valueId ?? null;
  if (!purityValueId) return null;

  const rules = weightRules ?? (await findWeightRuleValuesByProduct(product.id));
  const puritySizeRule = sizeValueId
    ? rules.find((r) => r.purity_value_id === purityValueId && r.size_value_id === sizeValueId)
    : null;
  const purityRule = rules.find((r) => r.purity_value_id === purityValueId && r.size_value_id === null);
  const matched = puritySizeRule ?? purityRule;
  return matched ? Number(matched.gold_weight_grams) : null;
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
// `weightRules` is optional — pass a pre-fetched array (from
// findWeightRuleValuesByProduct) when pricing many variants for the same
// product in a loop (applyCheapestVariantPricing, adminListVariants) to
// avoid re-querying per variant; omitted, it's fetched on demand only when
// actually needed (the variant has no exact weight override of its own).
export async function computeVariantPricing(product, variant = null, weightRules = null) {
  const effectivePurity = resolvedPurity(variant) || product.purity;
  const effectiveDiamondConfigId = resolvedDiamondConfigId(variant) || product.diamond_config_id;
  const effectiveGoldColor = resolvedGoldColor(variant) || product.gold_color;

  const baseWeightGrams = product.gold_weight_grams != null ? Number(product.gold_weight_grams) : null;
  let variantWeightGrams = variant?.gold_weight_grams != null ? Number(variant.gold_weight_grams) : null;
  if (variantWeightGrams == null && variant) {
    variantWeightGrams = await resolveWeightFromRules(product, variant, weightRules);
  }
  const effectiveWeightGrams = variantWeightGrams ?? baseWeightGrams;
  const weightOverridden =
    variantWeightGrams != null && baseWeightGrams != null && variantWeightGrams !== baseWeightGrams;

  let goldValue = Number(product.gold_value);
  if (
    product.metal_type === 'GOLD' &&
    effectiveWeightGrams != null &&
    (weightOverridden || (effectivePurity && effectivePurity !== product.purity))
  ) {
    goldValue = (await computeGoldValue(effectiveWeightGrams, effectivePurity)).goldValue;
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

  let diamondValue = Number(product.diamond_value);
  if (
    effectiveDiamondConfigId &&
    effectiveDiamondWeightCarats != null &&
    (diamondWeightOverridden || effectiveDiamondConfigId !== product.diamond_config_id)
  ) {
    diamondValue = (await computeDiamondValue(effectiveDiamondWeightCarats, effectiveDiamondConfigId))
      .diamondValue;
  }

  // Making charge is a live % of gold value when the admin has set one
  // (making_charge_percent) — scales automatically with goldValue above, so
  // it's already correct for whatever purity/size was just resolved. Falls
  // back to the flat making_charge column for products with no % set (not
  // yet migrated) or with no gold value at all (platinum — a % of $0 is
  // meaningless, so those stay on an admin-entered flat ₹ amount).
  const makingChargePercent =
    product.making_charge_percent == null ? null : Number(product.making_charge_percent);
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
      diamondConfigId: effectiveDiamondConfigId,
      goldColor: effectiveGoldColor,
      goldWeightGrams: effectiveWeightGrams,
      diamondWeightCarats: effectiveDiamondWeightCarats,
      goldValue,
      diamondValue,
      diamondValueOriginal: diamondValue,
      makingCharge,
      makingChargeOriginal: makingCharge,
      makingChargeDiscountPercent: 0,
      diamondDiscountPercent: 0,
      gstAmount: round2(overridePrice - goldValue - diamondValue - makingCharge),
      sellingPrice: overridePrice,
      sellingPriceOriginal: overridePrice,
      isPriceOverridden: true,
    };
  }

  const offer = applyProductOffer({
    goldValue,
    diamondValue,
    makingCharge,
    gstPercent,
    sellingPrice: baseSellingPrice,
    makingChargeDiscountPercent: Number(product.making_charge_discount_percent ?? 0),
    diamondDiscountPercent: Number(product.diamond_discount_percent ?? 0),
  });
  const gstAmount = round2(offer.sellingPrice - offer.goldValue - offer.diamondValue - offer.makingCharge);

  return {
    purity: effectivePurity,
    diamondConfigId: effectiveDiamondConfigId,
    goldColor: effectiveGoldColor,
    goldWeightGrams: effectiveWeightGrams,
    diamondWeightCarats: effectiveDiamondWeightCarats,
    goldValue: offer.goldValue,
    diamondValue: offer.diamondValue,
    diamondValueOriginal: offer.diamondValueOriginal,
    makingCharge: offer.makingCharge,
    makingChargeOriginal: offer.makingChargeOriginal,
    makingChargeDiscountPercent: offer.makingChargeDiscountPercent,
    diamondDiscountPercent: offer.diamondDiscountPercent,
    gstAmount,
    sellingPrice: offer.sellingPrice,
    sellingPriceOriginal: offer.sellingPriceOriginal,
    isPriceOverridden: false,
  };
}
